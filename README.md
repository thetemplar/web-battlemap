# D&D Battlemap with Fog of War

A real-time web application for D&D battlemaps with fog of war, drawing tools, and layer management. Features separate DM and player interfaces with real-time synchronization, adventure management, and password protection.

Login:
![login](https://github.com/thetemplar/web-battlemap/blob/main/images-for-gitlab/login.PNG)

DM Screen:
![overview](https://raw.githubusercontent.com/thetemplar/web-battlemap/refs/heads/main/images-for-gitlab/Overview.PNG)

Player:
![player](https://raw.githubusercontent.com/thetemplar/web-battlemap/refs/heads/main/images-for-gitlab/Player.PNG)

## Features

### Adventure Management
- **Multiple Adventures**: Create and manage multiple D&D adventures
- **Password Protection**: Secure adventures with optional passwords
- **Adventure-Scoped Maps**: Each adventure contains its own set of battlemaps
- **Adventure Switching**: Easily switch between different adventures

### DM Interface
- **Multiple Battlemaps**: Create and manage multiple battlemaps within each adventure
- **Background Images**: Upload and display background images with multiple scaling options
- **Drawing Tools**: 
  - Rectangles and circles
  - Lines with customizable thickness
  - Image tokens
  - Color and opacity controls
- **Layer Management**: 
  - Photoshop-like layer system
  - Show/hide layers
  - Move and delete layers
  - Layer selection and manipulation
- **Fog of War**: 
  - Add circular fog areas
  - Remove fog areas
  - Clear all fog
- **Real-time Updates**: All changes sync instantly to player views
- **Zoom and Pan**: Navigate the battlemap with mouse wheel and drag

### Player Interface
- **Display Only**: View-only interface for players
- **Real-time Updates**: See DM changes instantly
- **Zoom and Pan**: Navigate the battlemap independently
- **Connection Status**: Visual indicator of connection status

### Technical Features
- **WebSocket Real-time Communication**: Instant updates between DM and players
- **Responsive Design**: Works on desktop and mobile devices
- **Docker Support**: Easy deployment with Docker and Docker Compose
- **File Upload**: Support for image uploads (JPG, PNG, GIF, WebP)
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Startup Scripts**: Platform-specific startup scripts for easy deployment

## Installation

### Prerequisites
- Docker Desktop or Node.js 18+
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Option 1: Docker Deployment (Recommended)

#### Windows Users
1. **PowerShell (Recommended)**:
   - Right-click on `start.ps1` and select "Run with PowerShell"
   - Follow the prompts
   - The application will automatically open in your browser

2. **Command Prompt**:
   - Double-click `start.bat`
   - Follow the prompts
   - Open your browser to http://localhost:4000

3. **Manual Docker Commands**:
```cmd
docker-compose up -d
```

#### macOS/Linux Users
1. **Terminal Script**:
```bash
# Make the script executable
chmod +x start.sh

# Run the startup script
./start.sh
```

2. **Manual Docker Commands**:
```bash
docker-compose up -d
```

3. **Access the application**:
   - DM Interface: http://localhost:4000
   - Player Interface: http://localhost:4000/player

### Option 2: Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd dnd-battlemap
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser:
   - DM Interface: http://localhost:3000
   - Player Interface: http://localhost:3000/player

## Usage

### Getting Started

1. **Create an Adventure**:
   - Open the DM interface at http://localhost:4000 (Docker) or http://localhost:3000 (local)
   - Click "New Adventure" to create your first adventure
   - Optionally set a password for the adventure
   - Select your adventure to begin

2. **Create Your First Map**:
   - Click "New Map" to create your first battlemap
   - Upload a background image (optional)
   - Choose display mode: Fill Screen, Fit Screen, or Original Size

3. **Player Access**:
   - Share the player URL: http://localhost:4000/player (Docker) or http://localhost:3000/player (local)
   - Players will see the current active map
   - Changes made by the DM appear instantly

### Adventure Management

#### Creating Adventures
- **New Adventure**: Create a new adventure with custom name
- **Password Protection**: Optionally set a password for adventure access
- **Adventure Selection**: Switch between different adventures
- **Adventure Deletion**: Remove unused adventures (requires password if set)

#### Adventure-Scoped Features
- Each adventure contains its own set of maps
- Maps are isolated between adventures
- Players see only the active map from the current adventure

### DM Controls

#### Map Management
- **New Map**: Create a new battlemap with custom name and background
- **Map Tabs**: Switch between different battlemaps within the adventure
- **Set Active**: Make a map visible to players
- **Delete Map**: Remove unused maps

#### Drawing Tools
- **Select Tool**: Click and drag to move layers
- **Rectangle Tool**: Draw rectangles by clicking and dragging
- **Circle Tool**: Draw circles by clicking and dragging
- **Line Tool**: Draw lines by clicking start and end points
- **Image Tool**: Add image tokens (requires image upload)

#### Layer Management
- **Layer List**: View all layers in the current map
- **Visibility Toggle**: Show/hide individual layers
- **Layer Selection**: Click layers to select and move them
- **Layer Deletion**: Remove unwanted layers

#### Fog of War
- **Add Fog Area**: Create circular fog areas
- **Clear All Fog**: Remove all fog from the current map
- **Fog Removal**: Individual fog areas can be removed via API

#### Display Options
- **Fill Screen**: Stretch image to fill entire screen
- **Fit Screen**: Scale image to fit while maintaining aspect ratio
- **Original Size**: Display image at its original resolution

### Player Controls

- **Mouse Drag**: Pan around the battlemap
- **Mouse Wheel**: Zoom in/out
- **Zoom Buttons**: Quick zoom controls
- **Reset Zoom**: Return to default view

## API Endpoints

### Adventures
- `GET /api/adventures` - Get all adventures
- `POST /api/adventures` - Create new adventure
- `POST /api/adventures/:id/verify` - Verify adventure password
- `DELETE /api/adventures/:id` - Delete adventure (requires password if set)

### Maps (Adventure-Scoped)
- `GET /api/adventures/:adventureId/maps` - Get all maps in adventure
- `POST /api/adventures/:adventureId/maps` - Create new map in adventure
- `PUT /api/adventures/:adventureId/maps/:mapId` - Update map
- `DELETE /api/adventures/:adventureId/maps/:mapId` - Delete map

### Layers (Adventure-Scoped)
- `POST /api/adventures/:adventureId/maps/:mapId/layers` - Add layer to map
- `PUT /api/adventures/:adventureId/maps/:mapId/layers/:layerId` - Update layer
- `DELETE /api/adventures/:adventureId/maps/:mapId/layers/:layerId` - Delete layer

### Fog of War (Adventure-Scoped)
- `POST /api/adventures/:adventureId/maps/:mapId/fog` - Add fog area
- `DELETE /api/adventures/:adventureId/maps/:mapId/fog/:fogId` - Remove fog area

### File Upload
- `POST /api/upload-image` - Upload image file

## WebSocket Events

### Client to Server
- Connection events (automatic)

### Server to Client
- `initial-state` - Initial application state
- `adventure-created` - New adventure created
- `adventure-deleted` - Adventure deleted
- `map-created` - New map created
- `map-updated` - Map has been updated
- `map-deleted` - Map has been deleted
- `layer-added` - New layer added
- `layer-updated` - Layer has been updated
- `layer-deleted` - Layer has been deleted
- `fog-added` - New fog area added
- `fog-deleted` - Fog area removed
- `active-map-changed` - Active map changed

## Configuration

### Environment Variables
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)

### File Upload Limits
- Maximum file size: 10MB
- Supported formats: JPG, PNG, GIF, WebP

### Docker Configuration
- Container port: 3000
- Host port: 4000 (mapped in docker-compose.yml)
- Persistent data directories:
  - `./data/adventures` - Adventure files
  - `./data/uploads` - Uploaded images
  - `./data/tokens` - Token images
  - `./data/maps` - Map data

## Development

### Project Structure
```
dnd-battlemap/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
├── start.bat            # Windows batch startup script
├── start.ps1            # Windows PowerShell startup script
├── start.sh             # Unix/Linux startup script
├── QUICKSTART.md        # Quick start guide
├── public/              # Static files
│   ├── dm.html          # DM interface
│   ├── player.html      # Player interface
│   ├── index.html       # Landing page
│   ├── styles.css       # Shared styles
│   ├── dm.js           # DM JavaScript
│   ├── player.js       # Player JavaScript
│   └── index.js        # Landing page JavaScript
├── data/               # Persistent data (Docker)
│   ├── adventures/     # Adventure files
│   ├── uploads/        # Uploaded images
│   ├── tokens/         # Token images
│   └── maps/          # Map data
├── adventures/         # Adventure files (local development)
├── uploads/           # Uploaded images (local development)
├── tokens/            # Token images (local development)
├── maps/              # Map data (local development)
└── README.md          # This file
```

### Development Commands
```bash
npm run dev      # Start development server with nodemon
npm start        # Start production server
npm run build    # Build for production (if needed)
npm run docker-build  # Build Docker image
npm run docker-run    # Run Docker container
```

## Troubleshooting

### Common Issues

1. **Images not loading**:
   - Check file format (JPG, PNG, GIF, WebP only)
   - Verify file size (max 10MB)
   - Check uploads directory permissions

2. **WebSocket connection issues**:
   - Ensure firewall allows port 4000 (Docker) or 3000 (local)
   - Check browser console for errors
   - Verify server is running

3. **Docker issues**:
   - Check Docker logs: `docker logs dnd-battlemap`
   - Verify port 4000 is not in use
   - Ensure Docker has sufficient resources
   - Try rebuilding: `docker-compose build --no-cache`

4. **Adventure access issues**:
   - Verify adventure password if set
   - Check adventure file permissions
   - Ensure adventure exists in data directory

### Port Conflicts
- **Port 4000 in use**: Change port in `docker-compose.yml` or stop conflicting service
- **Port 3000 in use**: Change PORT environment variable or stop conflicting service

### Data Persistence
- Docker data is stored in `./data/` directory
- Local development data is stored in project root directories
- Ensure proper permissions for data directories

## Quick Start

For the fastest setup, see [QUICKSTART.md](QUICKSTART.md) for platform-specific instructions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
