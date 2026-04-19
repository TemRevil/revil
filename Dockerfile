FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy application source code
COPY . .

# Build the application (static export to /app/dist)
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Install a lightweight static server
RUN npm install -g serve

# Copy only the built output from the builder stage
COPY --from=builder /app/dist ./dist

# Expose port (default for serve is 3000)
EXPOSE 3000

# Run as non-root user for container security
USER node

# Start the application with single-page-application routing support
CMD ["serve", "-s", "dist", "-l", "3000"]
