# Multi-stage build for Infinite Tic-Tac-Toe (app code under /app)
# Stage 1: Build static assets with Vite
FROM node:25-alpine AS build

WORKDIR /app

# Copy only app package manifests for caching
COPY ./app/package.json ./app/package-lock.json ./
RUN npm ci

# Copy app sources
COPY ./app .

# Build with Vite (root=src configured in vite.config.js)
RUN npm run build

# Stage 2: Serve built assets with Nginx
FROM nginx:1-alpine-slim

# Copy built static files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the entrypoint script and config template
COPY ./docker/entrypoint.sh /entrypoint.sh
COPY ./docker/config.template.js /usr/share/nginx/html/config.template.js

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Install wget for healthcheck
RUN apk add --no-cache wget

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "wget -qO- http://localhost/index.html > /dev/null || exit 1"]

# Set the entrypoint to our custom script
ENTRYPOINT ["/entrypoint.sh"]

