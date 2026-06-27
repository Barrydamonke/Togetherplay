# Stage 1: Build the React client
FROM node:20-alpine AS client-build
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Compile the server TypeScript
FROM node:20-alpine AS server-build
WORKDIR /build
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production server dependencies only (no devDependencies)
FROM node:20-alpine AS server-deps
WORKDIR /build
COPY server/package*.json ./
RUN npm ci --omit=dev

# Stage 4: Lean runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

# Upgrade openssl to pick up security patches, then install ffmpeg and yt-dlp.
# yt-dlp is installed via pip rather than apk to get the latest version and avoid
# the Alpine apk package pulling in Deno as a transitive dependency.
RUN apk upgrade --no-cache openssl && \
    apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --break-system-packages yt-dlp && \
    ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp

COPY --from=server-build /build/dist    ./server/dist
COPY --from=server-deps  /build/node_modules ./server/node_modules
COPY --from=client-build /build/dist    ./client/dist

ENV NODE_ENV=production
VOLUME ["/data", "/downloads"]
EXPOSE 3000

WORKDIR /app/server
CMD ["node", "dist/index.js"]
