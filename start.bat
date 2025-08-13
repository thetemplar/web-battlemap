@echo off
echo D&D Battlemap - Starting Application
echo ====================================

echo.
echo Checking if Docker is installed...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo Docker found! Building and starting the application...
echo.

echo Building Docker image...
docker-compose build

if %errorlevel% neq 0 (
    echo ERROR: Failed to build Docker image
    pause
    exit /b 1
)

echo.
echo Starting the application...
docker-compose up -d

if %errorlevel% neq 0 (
    echo ERROR: Failed to start the application
    pause
    exit /b 1
)

echo.
echo ====================================
echo Application started successfully!
echo.
echo DM Interface: http://localhost:4000
echo Player Interface: http://localhost:4000/player
echo.
echo To stop the application, run: docker-compose down
echo To view logs, run: docker-compose logs -f
echo ====================================
echo.
pause 
 