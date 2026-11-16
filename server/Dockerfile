FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    HOST_IP=192.168.0.14 \
    PORT=8080 \
    TORRENT_STREAM_PORT=8889

# Install Python 3 and process utilities (psmisc for fuser, procps for pkill/ps, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    psmisc \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node.js dependencies first
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY server.py torrent_engine.mjs ./
COPY public/ ./public/

# Create persistent storage directories
RUN mkdir -p uploads downloads \
    && chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 8080 8889

CMD ["python3", "-u", "server.py"]
