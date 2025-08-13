# Quick Start Guide

## Prerequisites

1. **Docker Desktop** - Download and install from [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2. **Modern Web Browser** - Chrome, Firefox, Safari, or Edge

## Windows Users

### Option 1: PowerShell (Recommended)
1. Right-click on `start.ps1` and select "Run with PowerShell"
2. Follow the prompts
3. The application will automatically open in your browser

### Option 2: Command Prompt
1. Double-click `start.bat`
2. Follow the prompts
3. Open your browser to http://localhost:4000

### Option 3: Manual Docker Commands
```cmd
docker-compose up -d
```

## macOS/Linux Users

### Option 1: Terminal
```bash
# Make the script executable
chmod +x start.sh

# Run the startup script
./start.sh
```

### Option 2: Manual Docker Commands
```bash
docker-compose up -d
```

## Accessing the Application

Once started, you can access:

- **DM Interface**: http://localhost:4000
- **Player Interface**: http://localhost:4000/player

## First Steps

1. **As the DM**:
   - Open http://localhost:4000
   - Click "New Map" to create your first battlemap
   - Upload a background image (optional)
   - Start drawing and adding layers

2. **For Players**:
   - Share http://localhost:4000/player with your players
   - They will see the current active map
   - All changes you make appear instantly

## Stopping the Application

```bash
docker-compose down
```

## Troubleshooting

### Port 4000 Already in Use
If you get an error about port 4000 being in use:
1. Stop the application: `docker-compose down`
2. Find what's using port 4000: `netstat -ano | findstr :4000`
3. Kill the process or change the port in `docker-compose.yml`

### Docker Not Found
1. Install Docker Desktop
2. Make sure Docker is running
3. Restart your terminal/command prompt

### Application Won't Start
1. Check Docker logs: `docker-compose logs`
2. Make sure Docker has enough resources (at least 2GB RAM)
3. Try rebuilding: `docker-compose build --no-cache`

## Need Help?

- Check the full README.md for detailed documentation
- Review the troubleshooting section
- Check browser console for errors (F12)
- View Docker logs: `docker-compose logs -f` 