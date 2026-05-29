/**
 * GroceryApp Relay Server
 *
 * A lightweight, zero-knowledge WebSocket relay for encrypted Yjs sync updates.
 *
 * Design:
 *  - Relays encrypted update blobs between family members
 *  - No message persistence (ephemeral — Yjs documents live on clients)
 *  - Family-based routing: clients join a room by familyId
 *  - Each message is an encrypted blob — server cannot read contents
 *  - Optional REST endpoint for device enrollment (exchange device key)
 *
 * Usage:
 *   npm install
 *   node server.js [--port PORT]
 *
 * Environment variables:
 *   PORT (default: 8080)
 *   MAX_CLIENTS_PER_ROOM (default: 50)
 */

const http = require('http');
const { WebSocketServer } = require('ws');

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_CLIENTS_PER_FAMILY = parseInt(process.env.MAX_CLIENTS_PER_ROOM || '50', 10);

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * Map<familyId, Set<WebSocket>>
 * Each family has a room of connected WebSocket clients.
 */
const familyRooms = new Map();

/**
 * Map<WebSocket, { familyId: string, deviceId: string }>
 * Tracks which client belongs to which family.
 */
const clientInfo = new Map();

/**
 * Map<deviceId, WebSocket>
 * Fast lookup to find and close old sockets on re-identity.
 */
const deviceSockets = new Map();

// ─── Shared Cleanup ──────────────────────────────────────────────────────────

/**
 * Remove a client from all internal state.
 * Called on close, error, or when replacing an old socket on re-identity.
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
        console.log(`[room] Family "${info.familyId}" room emptied, removed`);
      } else {
        console.log(`[room] Family "${info.familyId}" has ${room.size} remaining clients`);
      }
    }

    // Clean up device socket mapping
    const currentSocket = deviceSockets.get(info.deviceId);
    if (currentSocket === ws) {
      deviceSockets.delete(info.deviceId);
    }

    clientInfo.delete(ws);
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    }));
    return;
  }

  // Simple REST enrollment endpoint (future: device key exchange)
  if (req.url === '/enroll' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Enforce 1KB body size limit
      if (body.length > 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large (max 1024 bytes)' }));
        return;
      }

      try {
        const data = JSON.parse(body);
        const { deviceId, familyId } = data;

        if (!deviceId || !familyId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'deviceId and familyId are required' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'enrolled',
          deviceId,
          familyId,
          relayUrl: `ws://localhost:${PORT}`,
        }));
      } catch (err) {
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
          return info ? info.deviceId : 'unknown';
        }),
      };
    });

    res.end(JSON.stringify({
      uptime: process.uptime(),
      totalFamilies: familyRooms.size,
      totalClients: clientInfo.size,
      families: stats,
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

wss.on('connection', (ws) => {
  console.log(`[connect] New WebSocket connection`);

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
    case 'identity': {
      const { familyId, deviceId } = message;

      if (!familyId || !deviceId) {
        sendTo(sender, {
          type: 'error',
          message: 'identity message requires familyId and deviceId',
        });
        return;
      }

      // ── Zombie socket cleanup ──────────────────────────────────────
      // If this deviceId is already connected on an OLD socket, close it.
      const oldSocket = deviceSockets.get(deviceId);
      if (oldSocket && oldSocket !== sender) {
        console.log(`[identity] Device "${deviceId}" re-identifying — closing old socket`);
        removeClient(oldSocket);
        try {
          oldSocket.close();
        } catch (_) {
          // already closed
        }
      }

      // Remove from old room if re-identifying (same socket, different family)
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
      clientInfo.set(sender, { familyId, deviceId });
      deviceSockets.set(deviceId, sender);

      console.log(`[identity] Device "${deviceId}" joined family "${familyId}" (${room.size} clients in room)`);

      sendTo(sender, {
        type: 'ack',
        message: 'Connected to relay',
        familyId,
        deviceId,
      });
      break;
    }

    case 'update': {
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
              deviceId, // origin device
              listId,
              payload,
            });
            relayed++;
          }
        });
        console.log(`[relay] Device "${deviceId}" → family "${familyId}" list "${listId}" → ${relayed} peers`);
      }

      // Acknowledge to sender
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

/**
 * Send a JSON message to a specific WebSocket client.
 * Safely handles errors (e.g. if the socket closed between checks).
 */
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

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      GroceryApp Relay Server                                ║
║      Listening on port ${String(PORT).padEnd(5)}                               ║
║      Zero-knowledge WebSocket relay for Yjs sync            ║
╚══════════════════════════════════════════════════════════════╝

WebSocket: ws://localhost:${PORT}
Health:    http://localhost:${PORT}/health
Stats:     http://localhost:${PORT}/stats
Enroll:    POST http://localhost:${PORT}/enroll  { deviceId, familyId }
`);
});