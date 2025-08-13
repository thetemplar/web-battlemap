#!/bin/bash

# D&D Battlemap - Shell Startup Script

echo "D&D Battlemap - Starting Application"
echo "===================================="
echo ""

# Check if Docker is installed
echo "Checking if Docker is installed..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed or not in PATH"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

echo "Docker found: $(docker --version)"
echo "Docker Compose found: $(docker-compose --version)"
echo ""

# Build the Docker image
echo "Building Docker image..."
if ! docker-compose build; then
    echo "ERROR: Failed to build Docker image"
    exit 1
fi

echo ""
echo "Starting the application..."
if ! docker-compose up -d; then
    echo "ERROR: Failed to start the application"
    exit 1
fi

echo ""
echo "===================================="
echo "Application started successfully!"
echo ""
echo "DM Interface: http://localhost:4000"
echo "Player Interface: http://localhost:4000/player"
echo ""
echo "To stop the application, run: docker-compose down"
echo "To view logs, run: docker-compose logs -f"
echo "===================================="
echo ""

# Wait a moment for the application to fully start
echo "Waiting for application to start..."
sleep 5

# Check if the application is running
if curl -s http://localhost:4000 > /dev/null; then
    echo "Application is running successfully!"
    echo "Opening DM interface in your default browser..."
    
    # Try to open the browser
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:4000
    elif command -v open &> /dev/null; then
        open http://localhost:4000
    elif command -v sensible-browser &> /dev/null; then
        sensible-browser http://localhost:4000
    else
        echo "Please open your browser and navigate to: http://localhost:4000"
    fi
else
    echo "Application may still be starting up. Please wait a moment and try accessing:"
    echo "http://localhost:4000"
fi

echo ""
read -p "Press Enter to exit" 