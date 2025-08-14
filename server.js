const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Global state for battlemaps
const battlemaps = new Map();
let activeMapId = null;

// Player view state (controlled by DM)
let playerView = {
  zoom: 1,
  pan: { x: 0, y: 0 }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dm.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// API Routes
app.post('/api/upload-image', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const imageUrl = `/uploads/${req.file.filename}`;
      console.log('File uploaded successfully:', req.file.filename);
      res.json({ 
        success: true, 
        imageUrl: imageUrl,
        filename: req.file.filename 
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

app.post('/api/maps', (req, res) => {
  const { name, backgroundImage } = req.body;
  const mapId = uuidv4();
  
  const newMap = {
    id: mapId,
    name: name || 'New Battlemap',
    backgroundImage: backgroundImage || '',
    layers: [],
    fogDataUrl: null, // No initial fog - DM will set it up
    createdAt: new Date().toISOString()
  };
  
  battlemaps.set(mapId, newMap);
  
  if (!activeMapId) {
    activeMapId = mapId;
  }
  
  res.json({ success: true, map: newMap });
});

app.get('/api/maps', (req, res) => {
  const maps = Array.from(battlemaps.values());
  res.json({ maps, activeMapId });
});

app.put('/api/maps/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  if (!battlemaps.has(id)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  const map = battlemaps.get(id);
  Object.assign(map, updates);
  battlemaps.set(id, map);
  
  // Broadcast updates to all connected clients
  io.emit('map-updated', { mapId: id, map });
  
  res.json({ success: true, map });
});

app.delete('/api/maps/:id', (req, res) => {
  const { id } = req.params;
  
  if (!battlemaps.has(id)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  battlemaps.delete(id);
  
  // If this was the active map, set a new active map
  if (activeMapId === id) {
    const remainingMaps = Array.from(battlemaps.keys());
    activeMapId = remainingMaps.length > 0 ? remainingMaps[0] : null;
  }
  
  io.emit('map-deleted', { mapId: id, activeMapId });
  res.json({ success: true });
});

app.post('/api/maps/:id/layers', (req, res) => {
  const { id } = req.params;
  const layer = req.body;
  
  if (!battlemaps.has(id)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  const map = battlemaps.get(id);
  const newLayer = {
    id: uuidv4(),
    ...layer,
    createdAt: new Date().toISOString()
  };
  
  map.layers.push(newLayer);
  battlemaps.set(id, map);
  
  io.emit('layer-added', { mapId: id, layer: newLayer });
  res.json({ success: true, layer: newLayer });
});

app.put('/api/maps/:id/layers/:layerId', (req, res) => {
  const { id, layerId } = req.params;
  const updates = req.body;
  
  if (!battlemaps.has(id)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  const map = battlemaps.get(id);
  const layerIndex = map.layers.findIndex(l => l.id === layerId);
  
  if (layerIndex === -1) {
    return res.status(404).json({ error: 'Layer not found' });
  }
  
  Object.assign(map.layers[layerIndex], updates);
  battlemaps.set(id, map);
  
  io.emit('layer-updated', { mapId: id, layerId, layer: map.layers[layerIndex] });
  res.json({ success: true, layer: map.layers[layerIndex] });
});

app.delete('/api/maps/:id/layers/:layerId', (req, res) => {
  const { id, layerId } = req.params;
  
  if (!battlemaps.has(id)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  const map = battlemaps.get(id);
  const layerIndex = map.layers.findIndex(l => l.id === layerId);
  
  if (layerIndex === -1) {
    return res.status(404).json({ error: 'Layer not found' });
  }
  
  map.layers.splice(layerIndex, 1);
  battlemaps.set(id, map);
  
  io.emit('layer-deleted', { mapId: id, layerId });
  res.json({ success: true });
});

app.post('/api/active-map', (req, res) => {
  const { mapId } = req.body;
  
  if (mapId && !battlemaps.has(mapId)) {
    return res.status(404).json({ error: 'Map not found' });
  }
  
  activeMapId = mapId;
  io.emit('active-map-changed', { activeMapId });
  res.json({ success: true, activeMapId });
});

// Player view control endpoints
app.get('/api/player-view', (req, res) => {
  res.json({ success: true, playerView });
});

app.post('/api/player-view', (req, res) => {
  const { zoom, pan } = req.body;
  
  if (zoom !== undefined) {
    playerView.zoom = Math.max(0.1, Math.min(5, zoom)); // Clamp zoom between 0.1 and 5
  }
  
  if (pan !== undefined) {
    playerView.pan = { x: pan.x || 0, y: pan.y || 0 };
  }
  
  // Broadcast the new player view to all clients
  io.emit('player-view-changed', { playerView });
  
  res.json({ success: true, playerView });
});

app.post('/api/player-view/reset', (req, res) => {
  playerView = {
    zoom: 1,
    pan: { x: 0, y: 0 }
  };
  
  // Broadcast the reset player view to all clients
  io.emit('player-view-changed', { playerView });
  
  res.json({ success: true, playerView });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current state to new connections
  socket.emit('initial-state', {
    maps: Array.from(battlemaps.values()),
    activeMapId,
    playerView
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`D&D Battlemap server running on port ${PORT}`);
  console.log(`DM Interface: http://localhost:${PORT}`);
  console.log(`Player Interface: http://localhost:${PORT}/player`);
}); 