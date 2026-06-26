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

# Install yt-dlp (from Alpine community repo) and ffmpeg (required to merge video+audio streams)
RUN apk add --no-cache ffmpeg yt-dlp

COPY --from=server-build /build/dist    ./server/dist
COPY --from=server-deps  /build/node_modules ./server/node_modules
COPY --from=client-build /build/dist    ./client/dist

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/server
CMD ["node", "dist/index.js"]
