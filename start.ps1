# D&D Battlemap - PowerShell Startup Script

Write-Host "D&D Battlemap - Starting Application" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# Check if Docker is installed
Write-Host "Checking if Docker is installed..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Yellow
try {
    docker-compose build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
} catch {
    Write-Host "ERROR: Failed to build Docker image" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting the application..." -ForegroundColor Yellow
try {
    docker-compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Start failed"
    }
} catch {
    Write-Host "ERROR: Failed to start the application" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "Application started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "DM Interface: http://localhost:4000" -ForegroundColor Cyan
Write-Host "Player Interface: http://localhost:4000/player" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop the application, run: docker-compose down" -ForegroundColor Yellow
Write-Host "To view logs, run: docker-compose logs -f" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# Wait a moment for the application to fully start
Write-Host "Waiting for application to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check if the application is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "Application is running successfully!" -ForegroundColor Green
        Write-Host "Opening DM interface in your default browser..." -ForegroundColor Yellow
        Start-Process "http://localhost:4000"
    }
} catch {
    Write-Host "Application may still be starting up. Please wait a moment and try accessing:" -ForegroundColor Yellow
    Write-Host "http://localhost:4000" -ForegroundColor Cyan
}

Read-Host "Press Enter to exit" 