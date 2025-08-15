// Player Interface JavaScript
class BattlemapPlayer {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('playerCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Extract adventure ID from URL
        this.adventureId = this.extractAdventureIdFromUrl();
        if (!this.adventureId) {
            console.error('No adventure ID found in URL');
            alert('Invalid adventure URL. Please return to the adventure selection page.');
            return;
        }
        
        // State
        this.maps = new Map();
        this.activeMapId = null;
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.isConnected = false;
        
        // Background image cache
        this.backgroundImages = new Map();
        
        // Layer image cache
        this.layerImages = new Map();
        
        // Fog caching to prevent flickering
        this.fogImage = null;
        this.fogImageMapId = null;
        this.fogImageDataUrl = null;
        
        // Initialize
        this.initializeCanvas();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadMaps();
        this.updateConnectionStatus();
    }
    
    extractAdventureIdFromUrl() {
        const pathSegments = window.location.pathname.split('/');
        const adventureIndex = pathSegments.indexOf('adventure');
        if (adventureIndex !== -1 && adventureIndex + 1 < pathSegments.length) {
            return pathSegments[adventureIndex + 1];
        }
        return null;
    }
    
    async loadMaps() {
        try {
            const response = await fetch(`/api/adventures/${this.adventureId}/maps`);
            if (response.ok) {
                const maps = await response.json();
                this.maps.clear();
                Object.values(maps).forEach(map => this.maps.set(map.id, map));
                
                // Set the first map as active if available
                if (this.maps.size > 0) {
                    this.activeMapId = Array.from(this.maps.keys())[0];
                }
                
                this.render();
            } else {
                console.error('Failed to load maps');
            }
        } catch (error) {
            console.error('Error loading maps:', error);
        }
    }
    
    initializeCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.render();
    }
    
    bindEvents() {
        // Canvas events for panning
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.hideLoadingScreen();
        });
        
        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.showLoadingScreen();
        });
        
        // Adventure-scoped map events
        this.socket.on('map-created', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received map-created:', data);
                this.maps.set(data.map.id, data.map);
                if (!this.activeMapId) {
                    this.activeMapId = data.map.id;
                }
                this.render();
            }
        });
        
        this.socket.on('map-updated', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received map-updated:', data);
                
                // Check if this is a fog update
                const oldMap = this.maps.get(data.mapId);
                const isFogUpdate = oldMap && oldMap.fogDataUrl !== data.map.fogDataUrl;
                
                // Update the map data
                this.maps.set(data.mapId, data.map);
                
                if (data.mapId === this.activeMapId) {
                    console.log('Updating display for active map');
                    
                    if (isFogUpdate) {
                        console.log('Fog update detected, updating fog smoothly');
                        // For fog updates, update the fog data but keep the old fog until new one loads
                        this.updateFogSmoothly(data.map);
                    } else {
                        console.log('Regular map update, re-rendering');
                        this.render();
                    }
                }
            }
        });
        
        this.socket.on('map-deleted', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received map-deleted:', data);
                this.maps.delete(data.mapId);
                
                if (data.mapId === this.activeMapId) {
                    // Set a new active map if available
                    const remainingMaps = Array.from(this.maps.keys());
                    this.activeMapId = remainingMaps.length > 0 ? remainingMaps[0] : null;
                }
                
                this.render();
            }
        });
        
        this.socket.on('layer-added', (data) => {
            if (data.adventureId === this.adventureId && data.mapId === this.activeMapId) {
                console.log('Player received layer-added:', data);
                const map = this.maps.get(data.mapId);
                if (map) {
                    map.layers.push(data.layer);
                    this.render();
                }
            }
        });
        
        this.socket.on('layer-updated', (data) => {
            if (data.adventureId === this.adventureId && data.mapId === this.activeMapId) {
                console.log('Player received layer-updated:', data);
                const map = this.maps.get(data.mapId);
                if (map) {
                    const layerIndex = map.layers.findIndex(l => l.id === data.layer.id);
                    if (layerIndex !== -1) {
                        map.layers[layerIndex] = data.layer;
                        this.render();
                    }
                }
            }
        });
        
        this.socket.on('layer-deleted', (data) => {
            if (data.adventureId === this.adventureId && data.mapId === this.activeMapId) {
                console.log('Player received layer-deleted:', data);
                const map = this.maps.get(data.mapId);
                if (map) {
                    map.layers = map.layers.filter(l => l.id !== data.layerId);
                    this.render();
                }
            }
        });
        
        this.socket.on('fog-updated', (data) => {
            if (data.adventureId === this.adventureId && data.mapId === this.activeMapId) {
                console.log('Player received fog-updated:', data);
                const map = this.maps.get(data.mapId);
                if (map) {
                    // Update fog data and re-render
                    this.updateFogSmoothly(map);
                }
            }
        });
        
        this.socket.on('player-view-updated', (data) => {
            if (data.adventureId === this.adventureId && data.mapId === this.activeMapId) {
                console.log('Player received player-view-updated:', data);
                this.updatePlayerView(data.zoom, data.pan);
            }
        });
        
        this.socket.on('active-map-changed', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received active-map-changed:', data);
                this.activeMapId = data.activeMapId;
                this.render();
            }
        });
    }
    
    handleMouseDown(e) {
        if (e.button === 0) { // Left click only
            this.isDragging = true;
            const rect = this.canvas.getBoundingClientRect();
            
            // Store the offset from mouse to current pan position (screen coordinates)
            this.dragStart = { 
                x: e.clientX - rect.left - this.pan.x, 
                y: e.clientY - rect.top - this.pan.y 
            };
            
            this.canvas.style.cursor = 'grabbing';
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseScreenX = e.clientX - rect.left;
        const mouseScreenY = e.clientY - rect.top;
        
        if (this.isDragging) {
            // Update pan in screen coordinates (same as DM)
            this.pan.x = mouseScreenX - this.dragStart.x;
            this.pan.y = mouseScreenY - this.dragStart.y;
            
            this.render();
        }
    }
    
    handleMouseUp(e) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));
        
        // Zoom towards mouse position (same as DM)
        this.pan.x = mouseX - (mouseX - this.pan.x) * (newZoom / this.zoom);
        this.pan.y = mouseY - (mouseY - this.pan.y) * (newZoom / this.zoom);
        
        this.zoom = newZoom;
        this.render();
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const map = this.maps.get(this.activeMapId);
        if (map) {
            // Apply zoom and pan
            this.ctx.save();
            this.ctx.translate(this.pan.x, this.pan.y);
            this.ctx.scale(this.zoom, this.zoom);
            
            // Draw background
            if (map.backgroundImage) {
                this.drawBackground(map);
            }
            
            // Draw layers
            map.layers.forEach(layer => {
                if (layer.visible !== false) {
                    this.drawLayer(layer);
                }
            });
            
            // Draw fog of war (after transformations so it moves with the map)
            this.drawFogOfWar(map);
            
            this.ctx.restore();
        }
    }
    
    drawBackground(map) {
        // Check if image is already cached
        if (this.backgroundImages.has(map.backgroundImage)) {
            const img = this.backgroundImages.get(map.backgroundImage);
            if (img.complete) {
                this.drawBackgroundImage(img, map);
                return;
            }
        }
        
        // Load and cache the image
        const img = new Image();
        img.onload = () => {
            this.backgroundImages.set(map.backgroundImage, img);
            this.drawBackgroundImage(img, map);
            this.render(); // Re-render after image loads
        };
        img.onerror = () => {
            console.error('Failed to load background image:', map.backgroundImage);
        };
        img.src = map.backgroundImage;
    }
    
    drawBackgroundImage(img, map) {
        // Player now uses same coordinate system as DM
        // Pan values are in screen coordinates, background drawn at (0,0)
        // Let the canvas transformation (zoom/pan) handle the positioning
        this.ctx.drawImage(img, 0, 0, img.width, img.height);
    }
    
    // Remove transformations since we're using canvas transformations
    transformCoordinates(x, y) {
        return { x, y };
    }
    
    transformDimensions(width, height) {
        return { width, height };
    }
    
    drawLayer(layer) {
        this.ctx.save();
        this.ctx.globalAlpha = layer.opacity || 1;
        
        // Player now uses same coordinate system as DM
        // Layers are drawn in image coordinates, no offset needed
        switch (layer.type) {
            case 'rectangle':
                this.ctx.fillStyle = layer.color;
                this.ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
                break;
            case 'circle':
                this.ctx.fillStyle = layer.color;
                this.ctx.beginPath();
                this.ctx.arc(layer.x, layer.y, layer.width / 2, 0, 2 * Math.PI);
                this.ctx.fill();
                break;
            case 'line':
                this.ctx.strokeStyle = layer.color;
                this.ctx.lineWidth = layer.size;
                this.ctx.beginPath();
                this.ctx.moveTo(layer.x, layer.y);
                this.ctx.lineTo(layer.endX, layer.endY);
                this.ctx.stroke();
                break;
            case 'image':
                if (layer.imageUrl) {
                    // Check if image is already cached
                    if (this.layerImages.has(layer.imageUrl)) {
                        const img = this.layerImages.get(layer.imageUrl);
                        if (img.complete) {
                            this.ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
                        }
                    } else {
                        // Load and cache the image
                        const img = new Image();
                        img.onload = () => {
                            this.layerImages.set(layer.imageUrl, img);
                            // Re-render to draw the image with proper transformations
                            this.render();
                        };
                        img.onerror = () => {
                            console.error('Failed to load layer image:', layer.imageUrl);
                        };
                        img.src = layer.imageUrl;
                    }
                }
                break;
        }
        
        this.ctx.restore();
    }
    
    drawFogOfWar(map) {
        if (!map.fogDataUrl) return;
        
        // Check if we need to load/update the fog image
        const needsImageUpdate = !this.fogImage || 
                                this.fogImageMapId !== map.id || 
                                this.fogImageDataUrl !== map.fogDataUrl;
        
        if (needsImageUpdate) {
            // Load fog image if not already loaded
            if (!this.fogImage) {
                this.fogImage = new Image();
                this.fogImage.onload = () => {
                    this.drawFogFromImage(map);
                };
                this.fogImage.src = map.fogDataUrl;
                return; // Don't draw yet, wait for onload
            } else if (this.fogImage.src !== map.fogDataUrl) {
                this.fogImage.src = map.fogDataUrl;
                return; // Don't draw yet, wait for onload
            }
            
            // Update cache metadata
            this.fogImageMapId = map.id;
            this.fogImageDataUrl = map.fogDataUrl;
        }
        
        // Draw the fog from the stable image
        this.drawFogFromImage(map);
    }
    
    drawFogFromImage(map) {
        if (!this.fogImage || !this.fogImage.complete) return;
        
        // Save the current canvas state
        this.ctx.save();
        
        // Players always see 100% black fog
        this.ctx.globalAlpha = 1.0;
        
        // Player now uses same coordinate system as DM
        // Fog is drawn at (0,0) and transformed by canvas
        this.ctx.drawImage(this.fogImage, 0, 0);
        
        // Restore the canvas state
        this.ctx.restore();
    }

    updateFogSmoothly(newMap) {
        // Store the old fog image temporarily
        const oldFogImage = this.fogImage;
        const oldFogImageMapId = this.fogImageMapId;
        const oldFogImageDataUrl = this.fogImageDataUrl;
        
        // Load the new fog image
        if (!newMap.fogDataUrl) {
            // No fog data, clear fog
            this.fogImage = null;
            this.fogImageMapId = null;
            this.fogImageDataUrl = null;
            this.render();
            return;
        }
        
        // Create new fog image
        const newFogImage = new Image();
        newFogImage.onload = () => {
            console.log('New fog image loaded, updating smoothly');
            // Update cache
            this.fogImage = newFogImage;
            this.fogImageMapId = newMap.id;
            this.fogImageDataUrl = newMap.fogDataUrl;
            
            // Re-render with new fog
            this.render();
        };
        newFogImage.onerror = (error) => {
            console.error('Failed to load new fog image:', error);
            // Keep old fog if new one fails to load
            this.fogImage = oldFogImage;
            this.fogImageMapId = oldFogImageMapId;
            this.fogImageDataUrl = oldFogImageDataUrl;
        };
        newFogImage.src = newMap.fogDataUrl;
    }
    
    // UI Updates
    showLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'flex';
        document.getElementById('noMapScreen').style.display = 'none';
    }
    
    hideLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'none';
    }
    
    showNoMapScreen() {
        document.getElementById('noMapScreen').style.display = 'flex';
        document.getElementById('loadingScreen').style.display = 'none';
    }
    
         hideNoMapScreen() {
         document.getElementById('noMapScreen').style.display = 'none';
     }
     
     updateConnectionStatus() {
         // This method is called from constructor but not needed for current implementation
         // Connection status is handled by socket events
     }
     
     updatePlayerView(zoom, pan) {
         console.log('Updating player view - zoom:', zoom, 'pan:', pan);
         
         // Update zoom and pan
         this.zoom = zoom;
         this.pan.x = pan.x;
         this.pan.y = pan.y;
         
         // Re-render with new view
         this.render();
     }
    
    // Override mouse handlers to disable player control
    handleMouseDown(e) {
        // Disable player mouse control - view is controlled by DM
        e.preventDefault();
    }
    
    handleMouseMove(e) {
        // Disable player mouse control - view is controlled by DM
        e.preventDefault();
    }
    
    handleMouseUp(e) {
        // Disable player mouse control - view is controlled by DM
        e.preventDefault();
    }
    
    handleWheel(e) {
        // Disable player wheel control - view is controlled by DM
        e.preventDefault();
    }
}

// Initialize the player interface
const battlemapPlayer = new BattlemapPlayer(); 