FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Create data directory for SQLite databases
RUN mkdir -p /app/data

# Expose port (Sprites listen on 8080)
EXPOSE 8080

# Default command (can be overridden)
CMD ["node", "dist/index.js"]
