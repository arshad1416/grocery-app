/**
 * GroceryApp Relay Server — v2 with Identity + Rate Limiting
 *
 * Enhanced relay server with:
 *  - Device enrollment endpoint (POST /enroll)
 *  - Family invite signature verification
 *  - Rate limiting per device token (max 100 messages/min)
 *  - WebSocket authentication via relayToken
 *  - Configurable ports via environment variables
 *
 * Design:
 *  - REST endpoints: /health, /enroll, /stats
 *  - WebSocket endpoint: /ws with relayToken auth
 *  - Rate limiting uses in-memory counters with 1-minute windows
 *  - Invite verification validates Ed25519 signatures
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

// ─── Configuration ───────────────────────────────────────────────────────────

const RELAY_PORT = parseInt(process.env.RELAY_PORT || process.env.PORT || '8080', 10);
const API_PORT = parseInt(process.env.API_PORT || process.env.PORT || '8080', 10);
const WS_PORT = parseInt(process.env.WS_PORT || process.env.PORT || '8080', 10);
const MAX_CLIENTS_PER_FAMILY = parseInt(process.env.MAX_CLIENTS_PER_FAMILY || '50', 10);
const MAX_FAMILIES = parseInt(process.env.MAX_FAMILIES || '100', 10);
const MAX_DEVICES_PER_FAMILY = parseInt(process.env.MAX_DEVICES_PER_FAMILY || '20', 10);
const RATE_LIMIT_MESSAGES = parseInt(process.env.RATE_LIMIT_MESSAGES || '100', 10);
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * Map<familyId, Set<WebSocket>>
 */
const familyRooms = new Map();

/**
 * Map<WebSocket, { familyId: string, deviceId: string, relayToken: string }>
 */
const clientInfo = new Map();

/**
 * Map<deviceId, WebSocket>
 */
const deviceSockets = new Map();

/**
 * Map<relayToken, { deviceId: string, familyId: string, enrolledAt: number }>
 * Enrolled devices that have completed POST /enroll.
 */
const enrolledDevices = new Map();

/**
 * Map<relayToken, { count: number, windowStart: number }>
 * Rate limiting counters keyed by relay token.
 */
const rateLimiters = new Map();

/**
 * Map<familyId, Set<string>> — relay tokens per family for enforcement.
 */
const familyDeviceTokens = new Map();

// ─── Ed25519 Signature Verification ──────────────────────────────────────────

/**
 * Verify an Ed25519 signature using tweetnacl (pure JS, zero native deps).
 *
 * tweetnacl takes raw 32-byte Ed25519 public keys (no DER/SPKI wrapping),
 * matching libsodium's crypto_sign_verify_detached format used by the client.
 *
 * @param {string} message - The original message that was signed.
 * @param {string} signature - Base64-encoded signature.
 * @param {string} publicKey - Base64-encoded Ed25519 public key (raw 32 bytes).
 * @returns {boolean} Whether the signature is valid.
 */
function verifyEd25519Signature(message, signature, publicKey) {
  try {
    const nacl = require('tweetnacl');
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(signature, 'base64');
    const keyBytes = Buffer.from(publicKey, 'base64');
    return nacl.sign.detached.verify(msgBytes, sigBytes, keyBytes);
  } catch (err) {
    console.warn(`[crypto] Signature verification error: ${err.message}`);
    return false;
  }
}

// ─── Shared Cleanup ──────────────────────────────────────────────────────────

/**
 * Remove a client from all internal state.
 */
function removeClient(ws) {
  if (ws._pingInterval) {
    clearInterval(ws._pingInterval);
    ws._pingInterval = null;
  }

  const info = clientInfo.get(ws);
  if (info) {
    const room = familyRooms.get(info.familyId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        familyRooms.delete(info.familyId);
      }
    }

    const currentSocket = deviceSockets.get(info.deviceId);
    if (currentSocket === ws) {
      deviceSockets.delete(info.deviceId);
    }

    clientInfo.delete(ws);
  }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/**
 * Check if a relay token has exceeded the rate limit.
 * Returns true if the message should be allowed, false if rate limited.
 */
function checkRateLimit(relayToken) {
  const now = Date.now();
  let limiter = rateLimiters.get(relayToken);

  if (!limiter || now - limiter.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Start a new window
    limiter = { count: 1, windowStart: now };
    rateLimiters.set(relayToken, limiter);
    return true;
  }

  limiter.count++;
  if (limiter.count > RATE_LIMIT_MESSAGES) {
    return false; // Rate limited
  }

  return true;
}

/**
 * Reset rate limiters periodically to prevent memory leaks.
 */
function cleanRateLimiters() {
  const now = Date.now();
  for (const [token, limiter] of rateLimiters) {
    if (now - limiter.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimiters.delete(token);
    }
  }
}

// Clean rate limiters every 5 minutes
setInterval(cleanRateLimiters, 5 * 60_000);

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      families: familyRooms.size,
      clients: clientInfo.size,
      enrolledDevices: enrolledDevices.size,
      version: '2.0',
    }));
    return;
  }

  // Device enrollment
  if (req.url === '/enroll' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Enforce body size limit
      if (body.length > 4096) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large (max 4096 bytes)' }));
        return;
      }

      try {
        const data = JSON.parse(body);
        const { deviceToken, familyInviteToken } = data;

        if (!deviceToken || !familyInviteToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'deviceToken and familyInviteToken are required',
          }));
          return;
        }

        // Parse the family invite token
        let invite;
        try {
          invite = JSON.parse(familyInviteToken);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid familyInviteToken format' }));
          return;
        }

        const { familyId, deviceId: inviterDeviceId, expiresAt, signature } = invite;

        if (!familyId || !inviterDeviceId || !expiresAt || !signature) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid invite token structure' }));
          return;
        }

        // Check expiry
        if (Date.now() > expiresAt) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invite token has expired' }));
          return;
        }

        // Verify invite signature using Ed25519
        const invitePayload = JSON.stringify({
          familyId,
          deviceId: inviterDeviceId,
          expiresAt,
        });

        const signatureValid = verifyEd25519Signature(
          invitePayload,
          signature,
          inviterDeviceId,
        );

        if (!signatureValid) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid invite signature' }));
          return;
        }

        // Check family limits
        const totalFamilies = familyRooms.size;
        if (totalFamilies >= MAX_FAMILIES) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server at maximum family capacity' }));
          return;
        }

        // Check devices per family limit
        const familyTokens = familyDeviceTokens.get(familyId);
        if (familyTokens && familyTokens.size >= MAX_DEVICES_PER_FAMILY) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Family at maximum device capacity' }));
          return;
        }

        // Generate a relay token (opaque routing token)
        const relayToken = crypto.randomBytes(32).toString('hex');

        // Store enrollment
        enrolledDevices.set(relayToken, {
          deviceId: deviceToken,
          familyId,
          enrolledAt: Date.now(),
        });

        // Track family device count
        if (!familyDeviceTokens.has(familyId)) {
          familyDeviceTokens.set(familyId, new Set());
        }
        familyDeviceTokens.get(familyId).add(relayToken);

        console.log(`[enroll] Device "${deviceToken.slice(0, 12)}..." enrolled in family "${familyId}"`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          relayToken,
          familyId,
        }));
      } catch (err) {
        console.warn(`[enroll] Error: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Stats page
  if (req.url === '/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const stats = {};
    familyRooms.forEach((clients, familyId) => {
      stats[familyId] = {
        connectedClients: clients.size,
        deviceIds: Array.from(clients).map((ws) => {
          const info = clientInfo.get(ws);
          return info ? info.deviceId.slice(0, 12) + '...' : 'unknown';
        }),
      };
    });

    res.end(JSON.stringify({
      uptime: process.uptime(),
      totalFamilies: familyRooms.size,
      totalClients: clientInfo.size,
      totalEnrolled: enrolledDevices.size,
      families: stats,
      rateLimiters: rateLimiters.size,
      config: {
        maxFamilies: MAX_FAMILIES,
        maxDevicesPerFamily: MAX_DEVICES_PER_FAMILY,
        maxClientsPerFamily: MAX_CLIENTS_PER_FAMILY,
        rateLimitMessagesPerMin: RATE_LIMIT_MESSAGES,
      },
    }));
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end('Not Found');
});

// ─── WebSocket Server ────────────────────────────────────────────────────────

const wss = new WebSocketServer({
  server,
  maxPayload: 10 * 1024 * 1024, // 10MB max payload
});

wss.on('connection', (ws, req) => {
  console.log(`[connect] New WebSocket connection`);

  // Parse relayToken from URL query parameter or initial message
  // Expected: ws://host:port/?token=RELAY_TOKEN
  const url = new URL(req.url, 'http://localhost');
  const initialToken = url.searchParams.get('token');

  let authenticated = false;

  // If token provided in URL, validate immediately
  if (initialToken) {
    const enrollment = enrolledDevices.get(initialToken);
    if (enrollment) {
      authenticated = true;
      ws._relayToken = initialToken;
      ws._enrollment = enrollment;
      console.log(`[auth] WebSocket authenticated via URL token`);
    } else {
      console.warn(`[auth] WebSocket rejected: invalid URL token`);
      sendTo(ws, {
        type: 'error',
        message: 'Invalid relay token',
      });
      ws.close(4001, 'Invalid relay token');
      return;
    }
  }

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      handleMessage(ws, message);
    } catch (err) {
      console.warn(`[error] Failed to parse message: ${err.message}`);
      sendTo(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  });

  ws.on('close', () => {
    console.log(`[disconnect] Client disconnected`);
    removeClient(ws);
  });

  ws.on('error', (err) => {
    console.warn(`[error] WebSocket error: ${err.message}`);
    removeClient(ws);
  });

  // Ping/pong for keepalive
  ws._pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30_000);
});

// ─── Message Handling ────────────────────────────────────────────────────────

/**
 * Handle an incoming relay message from a client.
 */
function handleMessage(sender, message) {
  switch (message.type) {
    case 'auth': {
      // Authenticate via relayToken in message body
      const { relayToken } = message;

      if (!relayToken) {
        sendTo(sender, {
          type: 'error',
          message: 'auth message requires relayToken',
        });
        return;
      }

      const enrollment = enrolledDevices.get(relayToken);
      if (!enrollment) {
        sendTo(sender, {
          type: 'error',
          message: 'Invalid relay token',
        });
        return;
      }

      sender._relayToken = relayToken;
      sender._enrollment = enrollment;

      sendTo(sender, {
        type: 'auth_ack',
        message: 'Authenticated',
        familyId: enrollment.familyId,
      });
      console.log(`[auth] WebSocket authenticated via message`);
      break;
    }

    case 'identity': {
      // Check authentication
      if (!sender._relayToken) {
        sendTo(sender, {
          type: 'error',
          message: 'Not authenticated. Send auth message first.',
        });
        return;
      }

      // Check rate limit
      if (!checkRateLimit(sender._relayToken)) {
        sendTo(sender, {
          type: 'error',
          message: 'Rate limit exceeded (max 100 messages/min)',
        });
        return;
      }

      const enrollment = sender._enrollment;
      const { deviceId, familyId } = message;

      if (!familyId || !deviceId) {
        sendTo(sender, {
          type: 'error',
          message: 'identity message requires familyId and deviceId',
        });
        return;
      }

      // Verify the claimed familyId matches enrollment
      if (familyId !== enrollment.familyId) {
        sendTo(sender, {
          type: 'error',
          message: 'familyId does not match enrollment',
        });
        return;
      }

      // ── Zombie socket cleanup ──────────────────────────────────────
      const oldSocket = deviceSockets.get(deviceId);
      if (oldSocket && oldSocket !== sender) {
        console.log(`[identity] Device "${deviceId.slice(0, 12)}..." re-identifying — closing old socket`);
        removeClient(oldSocket);
        try {
          oldSocket.close();
        } catch (_) {
          // already closed
        }
      }

      // Remove from old room if re-identifying
      const oldInfo = clientInfo.get(sender);
      if (oldInfo) {
        const oldRoom = familyRooms.get(oldInfo.familyId);
        if (oldRoom) oldRoom.delete(sender);
        const currentSocket = deviceSockets.get(oldInfo.deviceId);
        if (currentSocket === sender) {
          deviceSockets.delete(oldInfo.deviceId);
        }
      }

      // Join family room
      if (!familyRooms.has(familyId)) {
        familyRooms.set(familyId, new Set());
      }

      const room = familyRooms.get(familyId);

      // Enforce max clients per room
      if (room.size >= MAX_CLIENTS_PER_FAMILY) {
        sendTo(sender, {
          type: 'error',
          message: `Family room "${familyId}" is full (max ${MAX_CLIENTS_PER_FAMILY})`,
        });
        return;
      }

      room.add(sender);
      clientInfo.set(sender, { familyId, deviceId, relayToken: sender._relayToken });
      deviceSockets.set(deviceId, sender);

      console.log(`[identity] Device "${deviceId.slice(0, 12)}..." joined family "${familyId}" (${room.size} clients)`);

      sendTo(sender, {
        type: 'ack',
        message: 'Connected to relay',
        familyId,
        deviceId,
      });
      break;
    }

    case 'update': {
      // Check authentication
      if (!sender._relayToken) {
        sendTo(sender, {
          type: 'error',
          message: 'Not authenticated. Send auth message first.',
        });
        return;
      }

      // Check rate limit
      if (!checkRateLimit(sender._relayToken)) {
        sendTo(sender, {
          type: 'error',
          message: 'Rate limit exceeded (max 100 messages/min)',
        });
        return;
      }

      const { familyId, deviceId, listId, payload } = message;

      if (!familyId || !listId || !payload) {
        sendTo(sender, {
          type: 'error',
          message: 'update message requires familyId, listId, and payload',
        });
        return;
      }

      // Verify sender is in the claimed family room
      const senderInfo = clientInfo.get(sender);
      if (!senderInfo || senderInfo.familyId !== familyId) {
        sendTo(sender, {
          type: 'error',
          message: 'Not authenticated for this family room',
        });
        return;
      }

      // Relay to all OTHER clients in the same family room
      const room = familyRooms.get(familyId);
      if (room) {
        let relayed = 0;
        room.forEach((client) => {
          if (client !== sender && client.readyState === client.OPEN) {
            sendTo(client, {
              type: 'update',
              familyId,
              deviceId,
              listId,
              payload,
            });
            relayed++;
          }
        });
        console.log(`[relay] Device "${deviceId.slice(0, 12)}..." → family "${familyId}" list "${listId}" → ${relayed} peers`);
      }

      sendTo(sender, {
        type: 'ack',
        message: 'Update relayed',
      });
      break;
    }

    default:
      sendTo(sender, {
        type: 'error',
        message: `Unknown message type: ${message.type}`,
      });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendTo(ws, data) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.warn(`[error] Failed to send message: ${err.message}`);
    }
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

server.listen(RELAY_PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      GroceryApp Relay Server v2                             ║
║      Listening on port ${String(RELAY_PORT).padEnd(5)}                               ║
║      Identity-aware WebSocket relay for Yjs sync            ║
╚══════════════════════════════════════════════════════════════╝

WebSocket:   ws://localhost:${RELAY_PORT}?token=RELAY_TOKEN
Health:      http://localhost:${RELAY_PORT}/health
Stats:       http://localhost:${RELAY_PORT}/stats
Enroll:      POST http://localhost:${RELAY_PORT}/enroll  { deviceToken, familyInviteToken }

Rate limit:  ${RATE_LIMIT_MESSAGES} messages/min per device
Max families: ${MAX_FAMILIES}
Max devices/family: ${MAX_DEVICES_PER_FAMILY}
Max clients/family: ${MAX_CLIENTS_PER_FAMILY}
`);
});