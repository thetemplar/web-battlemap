# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Rebuild native dependencies for the target architecture
RUN npm rebuild bcrypt --build-from-source

# Replace BUILD_TIMESTAMP with actual build time
RUN sed -i "s/BUILD_TIMESTAMP/$(date '+%Y-%m-%d %H:%M')/g" public/dm.html public/player.html

# Create uploads directory
RUN mkdir -p uploads
RUN mkdir -p tokens
RUN mkdir -p maps

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "server.js"] 