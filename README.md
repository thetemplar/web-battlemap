# D&D Battlemap with Fog of War

A real-time web application for D&D battlemaps with fog of war, drawing tools, and layer management. Features separate DM and player interfaces with real-time synchronization.

## Features

### DM Interface
- **Multiple Battlemaps**: Create and manage multiple battlemaps with tab system
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

## Installation

### Prerequisites
- Node.js 18+ or Docker
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Option 1: Local Development

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

### Option 2: Docker Deployment

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

2. Or build and run manually:
```bash
# Build the image
docker build -t dnd-battlemap .

# Run the container
docker run -p 4000:3000 -v $(pwd)/uploads:/app/uploads dnd-battlemap
```

3. Access the application:
   - DM Interface: http://localhost:4000
   - Player Interface: http://localhost:4000/player

## Usage

### Getting Started

1. **DM Setup**:
   - Open the DM interface at http://localhost:4000
   - Click "New Map" to create your first battlemap
   - Upload a background image (optional)
   - Choose display mode: Fill Screen, Fit Screen, or Original Size

2. **Player Access**:
   - Share the player URL: http://localhost:4000/player
   - Players will see the current active map
   - Changes made by the DM appear instantly

### DM Controls

#### Map Management
- **New Map**: Create a new battlemap with custom name and background
- **Map Tabs**: Switch between different battlemaps
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

### Maps
- `GET /api/maps` - Get all maps and active map
- `POST /api/maps` - Create new map
- `PUT /api/maps/:id` - Update map
- `DELETE /api/maps/:id` - Delete map
- `POST /api/active-map` - Set active map

### Layers
- `POST /api/maps/:id/layers` - Add layer to map
- `PUT /api/maps/:id/layers/:layerId` - Update layer
- `DELETE /api/maps/:id/layers/:layerId` - Delete layer

### Fog of War
- `POST /api/maps/:id/fog` - Add fog area
- `DELETE /api/maps/:id/fog/:fogId` - Remove fog area

### File Upload
- `POST /api/upload-image` - Upload image file

## WebSocket Events

### Client to Server
- Connection events (automatic)

### Server to Client
- `initial-state` - Initial application state
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

## Development

### Project Structure
```
dnd-battlemap/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
├── public/               # Static files
│   ├── dm.html          # DM interface
│   ├── player.html      # Player interface
│   ├── styles.css       # Shared styles
│   ├── dm.js           # DM JavaScript
│   └── player.js       # Player JavaScript
├── uploads/             # Uploaded images
└── README.md           # This file
```

### Development Commands
```bash
npm run dev      # Start development server with nodemon
npm start        # Start production server
npm run build    # Build for production (if needed)
```

### Adding New Features

1. **New Drawing Tools**: Add to `dm.js` in the `createShape` and `drawLayer` methods
2. **New Layer Types**: Extend the layer system in both DM and player interfaces
3. **Additional Fog Shapes**: Modify the fog of war system in the drawing methods
4. **Custom Styling**: Update `styles.css` for UI changes

## Troubleshooting

### Common Issues

1. **Images not loading**:
   - Check file format (JPG, PNG, GIF, WebP only)
   - Verify file size (max 10MB)
   - Check uploads directory permissions

2. **WebSocket connection issues**:
   - Ensure firewall allows port 4000
   - Check browser console for errors
   - Verify server is running

3. **Docker issues**:
   - Check Docker logs: `docker logs dnd-battlemap`
   - Verify port 4000 is not in use
   - Ensure Docker has sufficient resources

### Performance Tips

- Use optimized images for better performance
- Limit the number of layers for complex maps
- Consider using smaller fog areas for better rendering
- Close unused browser tabs to reduce memory usage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the browser console for errors
3. Check server logs for backend issues
4. Create an issue in the repository

## Roadmap

- [ ] Persistent storage for maps
- [ ] User authentication
- [ ] Multiple DM support
- [ ] Advanced fog of war shapes
- [ ] Map templates
- [ ] Export/import functionality
- [ ] Mobile app
- [ ] Voice chat integration 