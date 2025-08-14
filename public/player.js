// Player Interface JavaScript
class BattlemapPlayer {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('playerCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // State
        this.maps = new Map();
        this.activeMapId = null;
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.isConnected = false;
        
        // Background image cache
        this.backgroundImages = new Map();
        
        // Fog caching to prevent flickering
        this.fogImage = null;
        this.fogImageMapId = null;
        this.fogImageDataUrl = null;
        
        // Initialize
        this.initializeCanvas();
        this.bindEvents();
        this.setupSocketListeners();
        this.updateConnectionStatus();
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
        
        this.socket.on('initial-state', (data) => {
            console.log('Player received initial-state:', data);
            this.maps.clear();
            data.maps.forEach(map => this.maps.set(map.id, map));
            this.activeMapId = data.activeMapId;
            console.log('Player initial activeMapId:', this.activeMapId);
            
            // Set initial player view if provided
            if (data.playerView) {
                this.zoom = data.playerView.zoom;
                this.pan = { x: data.playerView.pan.x, y: data.playerView.pan.y };
                console.log('Initial player view - zoom:', this.zoom, 'pan:', this.pan);
            }
            
            this.render();
        });
        
        this.socket.on('map-updated', (data) => {
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
                    // For non-fog updates, render immediately
                    this.render();
                }
            }
        });
        
        this.socket.on('map-deleted', (data) => {
            console.log('Player received map-deleted:', data);
            this.maps.delete(data.mapId);
            this.activeMapId = data.activeMapId;
            console.log('Player activeMapId after deletion:', this.activeMapId);
            this.render();
        });
        
        this.socket.on('layer-added', (data) => {
            const map = this.maps.get(data.mapId);
            if (map) {
                map.layers.push(data.layer);
                // Re-render if this is the active map
                if (data.mapId === this.activeMapId) {
                    this.render();
                }
            }
        });
        
        this.socket.on('layer-updated', (data) => {
            const map = this.maps.get(data.mapId);
            if (map) {
                const layerIndex = map.layers.findIndex(l => l.id === data.layerId);
                if (layerIndex !== -1) {
                    map.layers[layerIndex] = data.layer;
                    // Re-render if this is the active map
                    if (data.mapId === this.activeMapId) {
                        this.render();
                    }
                }
            }
        });
        
        this.socket.on('layer-deleted', (data) => {
            const map = this.maps.get(data.mapId);
            if (map) {
                map.layers = map.layers.filter(l => l.id !== data.layerId);
                // Re-render if this is the active map
                if (data.mapId === this.activeMapId) {
                    this.render();
                }
            }
        });
        
        this.socket.on('active-map-changed', (data) => {
            console.log('Player received active-map-changed:', data);
            this.activeMapId = data.activeMapId;
            console.log('Player activeMapId updated to:', this.activeMapId);
            
            // Force a complete refresh when active map changes
            this.render();
            
            // Also clear any cached background images for the new map
            const newMap = this.maps.get(this.activeMapId);
            if (newMap && newMap.backgroundImage) {
                this.backgroundImages.delete(newMap.backgroundImage);
            }
        });
        
        this.socket.on('player-view-changed', (data) => {
            console.log('Player received player-view-changed:', data);
            if (data.playerView) {
                this.zoom = data.playerView.zoom;
                
                // Convert from DM's image center coordinates to player's screen pan coordinates
                const imageCenterX = data.playerView.pan.x;
                const imageCenterY = data.playerView.pan.y;
                
                // Convert to screen pan coordinates (reverse of DM's calculation)
                const viewportWidth = this.canvas.width / this.zoom;
                const viewportHeight = this.canvas.height / this.zoom;
                this.pan.x = -(imageCenterX - viewportWidth / 2) * this.zoom;
                this.pan.y = -(imageCenterY - viewportHeight / 2) * this.zoom;
                
                console.log('Updated player view - zoom:', this.zoom, 'pan:', this.pan);
                console.log('Converted from image center:', imageCenterX, imageCenterY, 'to screen pan:', this.pan.x, this.pan.y);
                
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
                    const img = new Image();
                    img.onload = () => {
                        this.ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
                    };
                    img.src = layer.imageUrl;
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
}

// Initialize the player interface
const battlemapPlayer = new BattlemapPlayer(); 