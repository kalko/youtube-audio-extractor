# Ultra-optimized Dockerfile for YouTube Audio Extractor
# Focus on minimal size and faster startup

FROM node:20-alpine

# Install only essential runtime dependencies in single layer
RUN apk add --no-cache python3 py3-pip ffmpeg \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/cache/apk/* /root/.cache /tmp/*

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /tmp/*

# Copy only essential source files
COPY main.js ApifyYouTubeProxy.js YtDlpExtractor.js ./
COPY .actor/ ./.actor/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S apify -u 1001 -G nodejs
USER apify

# Run the app
CMD ["node", "main.js"]
