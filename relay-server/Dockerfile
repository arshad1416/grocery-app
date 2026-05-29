# GroceryApp Relay Server — Dockerfile
#
# Builds the zero-knowledge WebSocket relay server for Yjs sync.

# Use official Node.js LTS image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy server source
COPY server.js ./

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Run the server
CMD ["node", "server.js"]