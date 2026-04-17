FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build the application
RUN npm run build

# Install a lightweight static server to serve the app
RUN npm install -g serve

# Expose port (default for serve is 3000)
EXPOSE 3000

# Start the application with single-page-application routing support
CMD ["serve", "-s", "dist", "-l", "3000"]
