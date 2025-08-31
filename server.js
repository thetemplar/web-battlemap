const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Ensure directories exist
const adventuresDir = path.join(__dirname, 'adventures');
const uploadsDir = path.join(__dirname, 'uploads');
const tokensDir = path.join(__dirname, 'tokens');
const mapsDir = path.join(__dirname, 'maps'); // NEW

if (!fs.existsSync(adventuresDir)) {
    fs.mkdirSync(adventuresDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(tokensDir)) {
    fs.mkdirSync(tokensDir, { recursive: true });
}
if (!fs.existsSync(mapsDir)) { // NEW
    fs.mkdirSync(mapsDir, { recursive: true });
}

// Adventure management functions
function getAdventurePath(adventureId) {
    return path.join(adventuresDir, `${adventureId}.json`);
}

function loadAdventure(adventureId) {
    try {
        const filePath = getAdventurePath(adventureId);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const adventure = JSON.parse(data);
            
            // Migrate layers to ensure they all have IDs
            if (adventure.maps) {
                Object.values(adventure.maps).forEach(map => {
                    if (map.layers) {
                        map.layers.forEach(layer => {
                            if (!layer.id) {
                                layer.id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            }
                        });
                    }
                });
            }
            
            return adventure;
        }
    } catch (error) {
        console.error(`Error loading adventure ${adventureId}:`, error);
    }
    return null;
}

function saveAdventure(adventure) {
    try {
        const filePath = getAdventurePath(adventure.id);
        fs.writeFileSync(filePath, JSON.stringify(adventure, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving adventure ${adventure.id}:`, error);
        return false;
    }
}

function getAllAdventures() {
    const adventures = [];
    try {
        const files = fs.readdirSync(adventuresDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const adventureId = file.replace('.json', '');
                const adventure = loadAdventure(adventureId);
                if (adventure) {
                    // Don't include maps in the list to keep it lightweight
                    const { maps, ...adventureInfo } = adventure;
                    adventures.push(adventureInfo);
                }
            }
        }
    } catch (error) {
        console.error('Error loading adventures:', error);
    }
    return adventures;
}

// Token Vault management functions
function getTokenPath(tokenId) {
    return path.join(tokensDir, `${tokenId}.json`);
}

function loadToken(tokenId) {
    try {
        const filePath = getTokenPath(tokenId);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error loading token ${tokenId}:`, error);
    }
    return null;
}

function saveToken(token) {
    try {
        const filePath = getTokenPath(token.id);
        fs.writeFileSync(filePath, JSON.stringify(token, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving token ${token.id}:`, error);
        return false;
    }
}

function getAllTokens() {
    const tokens = [];
    try {
        const files = fs.readdirSync(tokensDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const tokenId = file.replace('.json', '');
                const token = loadToken(tokenId);
                if (token) {
                    tokens.push(token);
                }
            }
        }
    } catch (error) {
        console.error('Error loading tokens:', error);
    }
    return tokens;
}

function searchTokens(query) {
    const allTokens = getAllTokens();
    const searchTerm = query.toLowerCase();
    return allTokens.filter(token => 
        token.name.toLowerCase().includes(searchTerm)
    );
}

// Map Vault management functions
function getMapPath(mapId) {
    return path.join(mapsDir, `${mapId}.json`);
}

function loadMap(mapId) {
    try {
        const filePath = getMapPath(mapId);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error loading map ${mapId}:`, error);
    }
    return null;
}

function saveMap(map) {
    try {
        const filePath = getMapPath(map.id);
        fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving map ${map.id}:`, error);
        return false;
    }
}

function getAllMaps() {
    const maps = [];
    try {
        const files = fs.readdirSync(mapsDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const mapId = file.replace('.json', '');
                const map = loadMap(mapId);
                if (map) {
                    maps.push(map);
                }
            }
        }
    } catch (error) {
        console.error('Error loading maps:', error);
    }
    return maps;
}

function searchMaps(query) {
    const allMaps = getAllMaps();
    const searchTerm = query.toLowerCase();
    return allMaps.filter(map => 
        map.name.toLowerCase().includes(searchTerm)
    );
}

// Adventure API endpoints
app.get('/api/adventures', (req, res) => {
    const adventures = getAllAdventures();
    res.json(adventures);
});

app.post('/api/adventures', async (req, res) => {
    const { name, description, password } = req.body;
    
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Adventure name is required' });
    }
    
    const adventureId = `adventure-${Date.now()}`;
    const adventure = {
        id: adventureId,
        name: name.trim(),
        description: description ? description.trim() : '',
        password: password ? await bcrypt.hash(password, 10) : null,
        created: new Date().toISOString(),
        maps: {}
    };
    
    if (saveAdventure(adventure)) {
        const { maps, password, ...adventureInfo } = adventure;
        res.json(adventureInfo);
    } else {
        res.status(500).json({ error: 'Failed to create adventure' });
    }
});

app.post('/api/adventures/:id/verify', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    const adventure = loadAdventure(id);
    if (!adventure) {
        return res.status(404).json({ error: 'Adventure not found' });
    }
    
    if (adventure.password) {
        if (!password) {
            return res.status(401).json({ error: 'Password required' });
        }
        
        const isValid = await bcrypt.compare(password, adventure.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
    }
    
    res.json({ success: true, adventure: { id: adventure.id, name: adventure.name } });
});

app.put('/api/adventures/:id', (req, res) => {
    const { id } = req.params;
    const adventureData = req.body;
    
    // Ensure the adventure ID matches
    adventureData.id = id;
    
    if (saveAdventure(adventureData)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to update adventure' });
    }
});

app.delete('/api/adventures/:id', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    const adventure = loadAdventure(id);
    if (!adventure) {
        return res.status(404).json({ error: 'Adventure not found' });
    }
    
    if (adventure.password) {
        if (!password) {
            return res.status(401).json({ error: 'Password required' });
        }
        
        const isValid = await bcrypt.compare(password, adventure.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
    }
    
    try {
        const filePath = getAdventurePath(id);
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error(`Error deleting adventure ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete adventure' });
    }
});

// Modified map endpoints to be adventure-scoped
app.get('/api/adventures/:adventureId/maps', (req, res) => {
    const { adventureId } = req.params;
    const adventure = loadAdventure(adventureId);
    
    if (!adventure) {
        return res.status(404).json({ error: 'Adventure not found' });
    }
    
    res.json(adventure.maps);
});

app.post('/api/adventures/:adventureId/maps', (req, res) => {
    const { adventureId } = req.params;
    const { name, width, height, backgroundImage } = req.body;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure) {
        return res.status(404).json({ error: 'Adventure not found' });
    }
    
    const mapId = `map-${Date.now()}`;
    const newMap = {
        id: mapId,
        name: name || 'New Map',
        width: width || 800,
        height: height || 600,
        backgroundImage: backgroundImage || null,
        layers: [],
        fogOfWar: []
    };
    
    adventure.maps[mapId] = newMap;
    
    if (saveAdventure(adventure)) {
        res.json(newMap);
        io.emit('map-created', { adventureId, map: newMap });
    } else {
        res.status(500).json({ error: 'Failed to create map' });
    }
});

app.put('/api/adventures/:adventureId/maps/:mapId', (req, res) => {
    const { adventureId, mapId } = req.params;
    const updates = req.body;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    adventure.maps[mapId] = { ...adventure.maps[mapId], ...updates };
    
    if (saveAdventure(adventure)) {
        res.json(adventure.maps[mapId]);
        io.emit('map-updated', { adventureId, mapId, map: adventure.maps[mapId] });
    } else {
        res.status(500).json({ error: 'Failed to update map' });
    }
});

app.delete('/api/adventures/:adventureId/maps/:mapId', (req, res) => {
    const { adventureId, mapId } = req.params;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    delete adventure.maps[mapId];
    
    if (saveAdventure(adventure)) {
        res.json({ success: true });
        io.emit('map-deleted', { adventureId, mapId });
    } else {
        res.status(500).json({ error: 'Failed to delete map' });
    }
});

// Layer endpoints (adventure-scoped)
app.post('/api/adventures/:adventureId/maps/:mapId/layers', (req, res) => {
    const { adventureId, mapId } = req.params;
    const layer = req.body;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    if (!adventure.maps[mapId].layers) {
        adventure.maps[mapId].layers = [];
    }
    
    // Add a unique ID to the layer if it doesn't have one
    if (!layer.id) {
        layer.id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    adventure.maps[mapId].layers.push(layer);
    
    if (saveAdventure(adventure)) {
        res.json(layer);
        io.emit('layer-added', { adventureId, mapId, layer });
    } else {
        res.status(500).json({ error: 'Failed to add layer' });
    }
});

app.put('/api/adventures/:adventureId/maps/:mapId/layers/reorder', (req, res) => {
    const { adventureId, mapId } = req.params;
    const { layerIds } = req.body;
    
    console.log('Layer reorder request:', { adventureId, mapId, layerIds });
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        console.error('Map not found:', { adventureId, mapId });
        return res.status(404).json({ error: 'Map not found' });
    }
    
    // Validate that all layer IDs exist in the map
    const existingLayerIds = adventure.maps[mapId].layers.map(l => l.id);
    console.log('Existing layer IDs:', existingLayerIds);
    console.log('Requested layer IDs:', layerIds);
    
    const validLayerIds = layerIds.filter(id => existingLayerIds.includes(id));
    console.log('Valid layer IDs:', validLayerIds);
    
    if (validLayerIds.length !== existingLayerIds.length) {
        console.error('Layer ID validation failed:', {
            validCount: validLayerIds.length,
            existingCount: existingLayerIds.length,
            missing: existingLayerIds.filter(id => !layerIds.includes(id))
        });
        return res.status(400).json({ error: 'Invalid layer IDs provided' });
    }
    
    // Reorder layers based on the provided order
    const reorderedLayers = [];
    for (const layerId of layerIds) {
        const layer = adventure.maps[mapId].layers.find(l => l.id === layerId);
        if (layer) {
            reorderedLayers.push(layer);
        }
    }
    
    adventure.maps[mapId].layers = reorderedLayers;
    
    if (saveAdventure(adventure)) {
        console.log('Layer reorder successful');
        res.json({ success: true, map: adventure.maps[mapId] });
        io.emit('map-updated', { adventureId, mapId, map: adventure.maps[mapId] });
    } else {
        console.error('Failed to save adventure after layer reorder');
        res.status(500).json({ error: 'Failed to reorder layers' });
    }
});

app.put('/api/adventures/:adventureId/maps/:mapId/layers/:layerId', (req, res) => {
    const { adventureId, mapId, layerId } = req.params;
    const updates = req.body;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    const layerIndex = adventure.maps[mapId].layers.findIndex(l => l.id === layerId);
    if (layerIndex === -1) {
        return res.status(404).json({ error: 'Layer not found' });
    }
    
    adventure.maps[mapId].layers[layerIndex] = { ...adventure.maps[mapId].layers[layerIndex], ...updates };
    
    if (saveAdventure(adventure)) {
        res.json(adventure.maps[mapId].layers[layerIndex]);
        io.emit('layer-updated', { adventureId, mapId, layer: adventure.maps[mapId].layers[layerIndex] });
    } else {
        res.status(500).json({ error: 'Failed to update layer' });
    }
});

app.delete('/api/adventures/:adventureId/maps/:mapId/layers/:layerId', (req, res) => {
    const { adventureId, mapId, layerId } = req.params;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    const layerIndex = adventure.maps[mapId].layers.findIndex(l => l.id === layerId);
    if (layerIndex === -1) {
        return res.status(404).json({ error: 'Layer not found' });
    }
    
    adventure.maps[mapId].layers.splice(layerIndex, 1);
    
    if (saveAdventure(adventure)) {
        res.json({ success: true });
        io.emit('layer-deleted', { adventureId, mapId, layerId });
    } else {
        res.status(500).json({ error: 'Failed to delete layer' });
    }
});

// Fog of war endpoints (adventure-scoped)
app.put('/api/adventures/:adventureId/maps/:mapId/fog', (req, res) => {
    const { adventureId, mapId } = req.params;
    const { fogOfWar } = req.body;
    
    const adventure = loadAdventure(adventureId);
    if (!adventure || !adventure.maps[mapId]) {
        return res.status(404).json({ error: 'Map not found' });
    }
    
    adventure.maps[mapId].fogOfWar = fogOfWar;
    
    if (saveAdventure(adventure)) {
        res.json({ success: true });
        io.emit('fog-updated', { adventureId, mapId, fogOfWar });
    } else {
        res.status(500).json({ error: 'Failed to update fog of war' });
    }
});

// File upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ 
        success: true, 
        imageUrl: imageUrl,
        filename: req.file.filename 
    });
});

// Token Vault API endpoints
app.get('/api/tokens', (req, res) => {
    const tokens = getAllTokens();
    res.json(tokens);
});

app.get('/api/tokens/search', (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === '') {
        return res.json([]);
    }
    
    const results = searchTokens(q.trim());
    res.json(results);
});

app.post('/api/tokens', upload.single('image'), (req, res) => {
    const { name, savePermanent } = req.body;
    
    if (!req.file || !name || name.trim() === '') {
        return res.status(400).json({ error: 'Image and name are required' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    if (savePermanent === 'true') {
        // Save to token vault
        const tokenId = `token-${Date.now()}`;
        const token = {
            id: tokenId,
            name: name.trim(),
            imageUrl: imageUrl,
            filename: req.file.filename,
            created: new Date().toISOString()
        };
        
        if (saveToken(token)) {
            res.json({ 
                success: true, 
                imageUrl: imageUrl,
                filename: req.file.filename,
                tokenId: tokenId,
                savedToVault: true
            });
        } else {
            res.status(500).json({ error: 'Failed to save token to vault' });
        }
    } else {
        // Just return the uploaded image info
        res.json({ 
            success: true, 
            imageUrl: imageUrl,
            filename: req.file.filename,
            savedToVault: false
        });
    }
});

// Map Vault API endpoints
app.get('/api/maps', (req, res) => {
    const maps = getAllMaps();
    res.json(maps);
});

app.get('/api/maps/search', (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === '') {
        return res.json([]);
    }
    
    const results = searchMaps(q.trim());
    res.json(results);
});

app.post('/api/maps', upload.single('image'), (req, res) => {
    const { name, description, savePermanent } = req.body;
    
    if (!req.file || !name || name.trim() === '') {
        return res.status(400).json({ error: 'Image and name are required' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    if (savePermanent === 'true') {
        // Save to map vault
        const mapId = `map-vault-${Date.now()}`;
        const map = {
            id: mapId,
            name: name.trim(),
            description: description ? description.trim() : '',
            imageUrl: imageUrl,
            filename: req.file.filename,
            created: new Date().toISOString()
        };
        
        if (saveMap(map)) {
            res.json({ 
                success: true, 
                imageUrl: imageUrl,
                filename: req.file.filename,
                mapId: mapId,
                savedToVault: true
            });
        } else {
            res.status(500).json({ error: 'Failed to save map to vault' });
        }
    } else {
        // Just return the uploaded image info
        res.json({ 
            success: true, 
            imageUrl: imageUrl,
            filename: req.file.filename,
            savedToVault: false
        });
    }
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Route handlers for different pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/adventure/:adventureId/dm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dm.html'));
});

app.get('/adventure/:adventureId/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send initial state to new connections
    socket.on('request-initial-state', (data) => {
        console.log('Client requesting initial state for adventure:', data.adventureId);
        const adventure = loadAdventure(data.adventureId);
        if (adventure) {
            // Use stored activeMapId or first map if none specified
            let activeMapId = adventure.activeMapId;
            if (!activeMapId && adventure.maps && Object.keys(adventure.maps).length > 0) {
                activeMapId = Object.keys(adventure.maps)[0];
            }
            
            socket.emit('initial-state', {
                maps: Object.values(adventure.maps || {}),
                activeMapId: activeMapId
            });
        }
    });
    
    // Forward player view updates from DM to all clients
    socket.on('player-view-updated', (data) => {
        console.log('Forwarding player view update:', data);
        // Broadcast to all clients except the sender
        socket.broadcast.emit('player-view-updated', data);
    });
    
    // Forward active map changes from DM to all clients
    socket.on('active-map-changed', (data) => {
        console.log('Forwarding active map change:', data);
        
        // Save the active map ID to the adventure data
        const adventure = loadAdventure(data.adventureId);
        if (adventure) {
            adventure.activeMapId = data.activeMapId;
            saveAdventure(adventure);
        }
        
        // Broadcast to all clients except the sender
        socket.broadcast.emit('active-map-changed', data);
    });
    
    // Forward players updates from DM to all clients
    socket.on('players-updated', (data) => {
        console.log('Forwarding players update:', data);
        // Broadcast to all clients except the sender
        socket.broadcast.emit('players-updated', data);
    });
    
    // Forward spell display to players
    socket.on('show-spell-to-player', (data) => {
        console.log('Forwarding spell to player:', data.spell.name);
        // Broadcast to all clients except the sender
        socket.broadcast.emit('show-spell-to-player', data);
    });
    
    // Forward spell hide from players
    socket.on('hide-spell-from-player', (data) => {
        console.log('Hiding spell from player');
        // Broadcast to all clients except the sender
        socket.broadcast.emit('hide-spell-from-player', data);
    });
    

    
    // Forward battlegrid updates from DM to all clients
    socket.on('battlegrid-updated', (data) => {
        console.log('Forwarding battlegrid update:', data);
        // Broadcast to all clients except the sender
        socket.broadcast.emit('battlegrid-updated', data);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 