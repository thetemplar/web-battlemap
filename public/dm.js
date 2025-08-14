// Simple UUID generator
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// DM Interface JavaScript
class BattlemapDM {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('battlemapCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // State
        this.maps = new Map();
        this.activeMapId = null; // The map that's active for players
        this.viewingMapId = null; // The map the DM is currently viewing/editing
        this.currentTool = 'select';
        this.isDrawing = false;
        this.isDragging = false;
        this.selectedLayer = null;
        this.dragStart = { x: 0, y: 0 };
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        
        // Drawing state
        this.drawingColor = '#ff0000';
        this.drawingOpacity = 1;
        this.drawingSize = 5;
        this.tempShape = null;
        
        // Fog of War state
        this.fogTool = 'none'; // 'none', 'show-all', 'fog-all', 'fog-brush', 'reveal-brush'
        this.fogOpacity = 0.8; // DM view opacity (0-1) - fixed value
        this.fogBrushSize = 50; // Brush size in pixels - fixed value
        this.isFogDrawing = false;
        this.fogDrawPath = [];
        
        // Fog bitmap canvas
        this.fogCanvas = document.createElement('canvas');
        this.fogCtx = this.fogCanvas.getContext('2d');
        
        // Fog caching to prevent flickering
        this.fogImage = null;
        this.fogImageMapId = null;
        this.fogImageDataUrl = null;
        
        // Background image cache
        this.backgroundImages = new Map();
        
        // Layer image cache
        this.layerImages = new Map();
        
        // Player view state (for controlling player view)
        this.currentPlayerZoom = 1;
        this.currentPlayerPanX = 0;
        this.currentPlayerPanY = 0;
        
        // Image placement state
        this.pendingImageUrl = null;
        this.pendingImageName = null;
        
        // Resize state
        this.isResizing = false;
        this.resizeHandle = null; // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
        this.originalLayerData = null; // Store original data when starting resize
        
        // Layer reordering state
        this.isReorderingLayers = false;
        this.draggedLayerItem = null;
        this.dragPlaceholder = null;
        
        // Initialize after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    
    initialize() {
        this.initializeCanvas();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadMaps();
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
        // Debug: Check if fog controls exist
        console.log('=== FOG CONTROLS DEBUG ===');
        console.log('Show everything btn:', document.getElementById('showEverythingBtn'));
        console.log('Fog everything btn:', document.getElementById('fogEverythingBtn'));
        console.log('Fog brush btn:', document.getElementById('fogBrushBtn'));
        console.log('Reveal brush btn:', document.getElementById('revealBrushBtn'));
        
        // Test immediate click handlers
        const showBtn = document.getElementById('showEverythingBtn');
        if (showBtn) {
            showBtn.onclick = () => {
                console.log('Show everything clicked!');
                this.setFogTool('show-all');
            };
        }
        
        const fogBtn = document.getElementById('fogEverythingBtn');
        if (fogBtn) {
            fogBtn.onclick = () => {
                console.log('Fog everything clicked!');
                this.setFogTool('fog-all');
            };
        }
        
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.target.closest('.tool-btn').dataset.tool;
                if (tool === 'image') {
                    this.showImageUploadModal();
                } else {
                    this.setTool(tool);
                }
            });
        });
        
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent context menu
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Color and size controls
        const drawingColor = document.getElementById('drawingColor');
        if (drawingColor) {
            drawingColor.addEventListener('change', (e) => {
                this.drawingColor = e.target.value;
            });
        }
        
        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                this.drawingOpacity = e.target.value / 100;
                const opacityValue = document.getElementById('opacityValue');
                if (opacityValue) {
                    opacityValue.textContent = `${e.target.value}%`;
                }
            });
        }
        
        const sizeSlider = document.getElementById('sizeSlider');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                this.drawingSize = parseInt(e.target.value);
                const sizeValue = document.getElementById('sizeValue');
                if (sizeValue) {
                    sizeValue.textContent = `${e.target.value}px`;
                }
            });
        }
        
        // Map management
        const newMapBtn = document.getElementById('newMapBtn');
        if (newMapBtn) {
            newMapBtn.addEventListener('click', () => {
                this.showNewMapModal();
            });
        }
        
        const createMapBtn = document.getElementById('createMapBtn');
        if (createMapBtn) {
            createMapBtn.addEventListener('click', () => {
                this.createNewMap();
            });
        }
        
        // Image upload modal handlers
        const uploadTokenBtn = document.getElementById('uploadTokenBtn');
        if (uploadTokenBtn) {
            uploadTokenBtn.addEventListener('click', () => {
                this.uploadTokenImage();
            });
        }
        
        // New fog of war controls
        const showEverythingBtn = document.getElementById('showEverythingBtn');
        if (showEverythingBtn) {
            showEverythingBtn.addEventListener('click', () => {
                this.setFogTool('show-all');
            });
        }
        
        const fogEverythingBtn = document.getElementById('fogEverythingBtn');
        if (fogEverythingBtn) {
            fogEverythingBtn.addEventListener('click', () => {
                this.setFogTool('fog-all');
            });
        }
        
        const fogBrushBtn = document.getElementById('fogBrushBtn');
        if (fogBrushBtn) {
            fogBrushBtn.addEventListener('click', () => {
                this.setFogTool('fog-brush');
            });
        }
        
        const revealBrushBtn = document.getElementById('revealBrushBtn');
        if (revealBrushBtn) {
            revealBrushBtn.addEventListener('click', () => {
                this.setFogTool('reveal-brush');
            });
        }
        
        // Fog brush size slider
        const fogBrushSizeSlider = document.getElementById('fogBrushSizeSlider');
        if (fogBrushSizeSlider) {
            fogBrushSizeSlider.addEventListener('input', (e) => {
                this.fogBrushSize = parseInt(e.target.value);
                const fogBrushSizeValue = document.getElementById('fogBrushSizeValue');
                if (fogBrushSizeValue) {
                    fogBrushSizeValue.textContent = `${e.target.value}px`;
                }
            });
        }
        
        // Zoom controls
        const zoomIn = document.getElementById('zoomIn');
        if (zoomIn) {
            zoomIn.addEventListener('click', () => this.zoomIn());
        }
        
        const zoomOut = document.getElementById('zoomOut');
        if (zoomOut) {
            zoomOut.addEventListener('click', () => this.zoomOut());
        }
        
        const resetZoom = document.getElementById('resetZoom');
        if (resetZoom) {
            resetZoom.addEventListener('click', () => this.resetZoom());
        }
        
        // Player view controls
        const playerZoomSlider = document.getElementById('playerZoomSlider');
        if (playerZoomSlider) {
            playerZoomSlider.addEventListener('input', (e) => {
                const zoom = parseFloat(e.target.value);
                const playerZoomValue = document.getElementById('playerZoomValue');
                if (playerZoomValue) {
                    playerZoomValue.textContent = `${Math.round(zoom * 100)}%`;
                }
                this.updatePlayerView({ zoom });
            });
        }
        
        const playerPanXSlider = document.getElementById('playerPanXSlider');
        if (playerPanXSlider) {
            playerPanXSlider.addEventListener('input', (e) => {
                const panX = parseInt(e.target.value);
                const playerPanXValue = document.getElementById('playerPanXValue');
                if (playerPanXValue) {
                    playerPanXValue.textContent = `${panX}px`;
                }
                this.updatePlayerView({ pan: { x: panX, y: this.currentPlayerPanY } });
            });
        }
        
        const playerPanYSlider = document.getElementById('playerPanYSlider');
        if (playerPanYSlider) {
            playerPanYSlider.addEventListener('input', (e) => {
                const panY = parseInt(e.target.value);
                const playerPanYValue = document.getElementById('playerPanYValue');
                if (playerPanYValue) {
                    playerPanYValue.textContent = `${panY}px`;
                }
                this.updatePlayerView({ pan: { x: this.currentPlayerPanX, y: panY } });
            });
        }
        
        const resetPlayerViewBtn = document.getElementById('resetPlayerViewBtn');
        if (resetPlayerViewBtn) {
            resetPlayerViewBtn.addEventListener('click', () => this.resetPlayerView());
        }
        
        const syncPlayerViewBtn = document.getElementById('syncPlayerViewBtn');
        if (syncPlayerViewBtn) {
            syncPlayerViewBtn.addEventListener('click', () => this.syncPlayerViewToDM());
        }
        
        // Modal events
        document.querySelectorAll('.close, .close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModals();
            }
        });
    }
    
    setupSocketListeners() {
        this.socket.on('initial-state', (data) => {
            this.maps.clear();
            data.maps.forEach(map => this.maps.set(map.id, map));
            this.activeMapId = data.activeMapId;
            this.viewingMapId = data.activeMapId; // Initially view the active map
            this.updateMapTabs();
            this.render();
        });
        
        this.socket.on('map-updated', (data) => {
            console.log('DM received map-updated:', data);
            
            // Check if this is a fog update
            const oldMap = this.maps.get(data.mapId);
            const isFogUpdate = oldMap && oldMap.fogDataUrl !== data.map.fogDataUrl;
            
            // Update the map data
            this.maps.set(data.mapId, data.map);
            this.updateMapTabs();
            
            if (data.mapId === this.viewingMapId) {
                console.log('Updating display for viewing map');
                
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
            this.maps.delete(data.mapId);
            this.activeMapId = data.activeMapId;
            // If we were viewing the deleted map, switch to active map
            if (this.viewingMapId === data.mapId) {
                this.viewingMapId = data.activeMapId;
            }
            this.updateMapTabs();
            this.render();
        });
        
        this.socket.on('layer-added', (data) => {
            console.log('Layer added event received:', data);
            const map = this.maps.get(data.mapId);
            if (map) {
                console.log('Adding layer to map:', data.mapId, 'Current viewing map:', this.viewingMapId);
                map.layers.push(data.layer);
                console.log('Map layers after adding:', map.layers.length);
                this.updateLayerList();
                this.render();
            } else {
                console.log('Map not found for layer:', data.mapId);
            }
        });
        
        this.socket.on('layer-updated', (data) => {
            const map = this.maps.get(data.mapId);
            if (map) {
                const layerIndex = map.layers.findIndex(l => l.id === data.layerId);
                if (layerIndex !== -1) {
                    map.layers[layerIndex] = data.layer;
                    this.updateLayerList();
                    this.render();
                }
            }
        });
        
        this.socket.on('layer-deleted', (data) => {
            const map = this.maps.get(data.mapId);
            if (map) {
                map.layers = map.layers.filter(l => l.id !== data.layerId);
                this.updateLayerList();
                this.render();
            }
        });
        
        this.socket.on('active-map-changed', (data) => {
            this.activeMapId = data.activeMapId;
            this.updateMapTabs();
            this.render();
        });
    }
    
    setTool(tool) {
        this.currentTool = tool;
        
        // Deactivate fog tools when switching to shape tools
        if (tool !== 'fog-brush' && tool !== 'reveal-brush' && tool !== 'show-all' && tool !== 'fog-all') {
            this.fogTool = 'none';
            // Clear fog tool UI
            document.querySelectorAll('.fog-tool-group .tool-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        
        // Update cursor
        this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.pan.x) / this.zoom;
        const y = (e.clientY - rect.top - this.pan.y) / this.zoom;
        
        this.dragStart = { x, y };
        
        console.log('Mouse down - fog tool:', this.fogTool, 'at position:', x, y);
        
        if (e.button === 2) { // Right click - pan the map
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault(); // Prevent context menu
        } else if (this.fogTool === 'fog-brush' || this.fogTool === 'reveal-brush') {
            console.log('Starting fog drawing with tool:', this.fogTool);
            
            // Ensure fog canvas is properly sized before drawing
            this.ensureFogCanvasSize();
            
            this.isFogDrawing = true;
            this.fogDrawPath = [{ x, y }];
            this.render();
        } else if (this.currentTool === 'select') {
            this.handleSelectMouseDown(x, y);
        } else if (this.currentTool === 'image' && this.pendingImageUrl) {
            // Handle image placement
            this.placeImageToken(x, y);
        } else if (this.currentTool === 'image' && !this.pendingImageUrl) {
            // If image tool is selected but no image is pending, show the modal
            this.showImageUploadModal();
        } else {
            this.isDrawing = true;
            this.tempShape = this.createShape(this.currentTool, x, y);
        }
    }
    
    ensureFogCanvasSize() {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (bgImage && bgImage.complete) {
            const mapWidth = bgImage.width;
            const mapHeight = bgImage.height;
            
            if (this.fogCanvas.width !== mapWidth || this.fogCanvas.height !== mapHeight) {
                console.log('Resizing fog canvas to match background:', mapWidth, 'x', mapHeight);
                this.fogCanvas.width = mapWidth;
                this.fogCanvas.height = mapHeight;
            }
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.pan.x) / this.zoom;
        const y = (e.clientY - rect.top - this.pan.y) / this.zoom;
        
        // Update coordinates display
        document.getElementById('coordinates').textContent = `${Math.round(x)}, ${Math.round(y)}`;
        
        // Calculate and display screen center coordinates
        // this.pan.x and this.pan.y are in screen coordinates
        // We need to convert to image coordinates and add half the viewport
        const viewportWidth = this.canvas.width / this.zoom;
        const viewportHeight = this.canvas.height / this.zoom;
        const screenCenterX = (-this.pan.x / this.zoom) + (viewportWidth / 2);
        const screenCenterY = (-this.pan.y / this.zoom) + (viewportHeight / 2);
        document.getElementById('screenCenter').textContent = `Center: ${Math.round(screenCenterX)}, ${Math.round(screenCenterY)}`;
        
        if (this.isPanning) {
            // Right-click panning
            this.pan.x = e.clientX - this.panStart.x;
            this.pan.y = e.clientY - this.panStart.y;
            this.render();
        } else if (this.isFogDrawing) {
            console.log('Fog drawing - adding point:', x, y);
            this.fogDrawPath.push({ x, y });
            this.render();
        } else if (this.isDrawing && this.tempShape) {
            this.updateTempShape(x, y);
            this.render();
        } else if (this.isDragging && this.selectedLayer) {
            this.moveSelectedLayer(x - this.dragStart.x, y - this.dragStart.y);
            this.dragStart = { x, y };
            this.render();
        }
    }
    
    handleMouseUp(e) {
        if (this.isPanning) {
            // End right-click panning
            this.isPanning = false;
            this.canvas.style.cursor = 'default';
        } else if (this.isFogDrawing) {
            console.log('Finalizing fog drawing with', this.fogDrawPath.length, 'points');
            this.finalizeFogDrawing();
            // Clear the brush preview by re-rendering
            this.render();
            // Don't reset fog tool - keep it selected for continued use
        } else if (this.isDrawing && this.tempShape) {
            this.finalizeShape();
        } else if (this.isResizing && this.selectedLayer) {
            // Finalize resize by saving to server
            this.saveLayerChanges(this.selectedLayer);
        }
        
        this.isDrawing = false;
        this.isDragging = false;
        this.isFogDrawing = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.originalLayerData = null;
        this.tempShape = null;
        this.fogDrawPath = [];
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));
        
        // Zoom towards mouse position
        this.pan.x = mouseX - (mouseX - this.pan.x) * (newZoom / this.zoom);
        this.pan.y = mouseY - (mouseY - this.pan.y) * (newZoom / this.zoom);
        
        this.zoom = newZoom;
        this.render();
    }
    
    handleSelectMouseDown(x, y) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        // Check layers in reverse order (top to bottom)
        for (let i = map.layers.length - 1; i >= 0; i--) {
            const layer = map.layers[i];
            if (this.isPointInShape(x, y, layer)) {
                this.selectedLayer = layer;
                this.isDragging = true;
                this.updateLayerList();
                break;
            }
        }
    }
    
    createShape(type, x, y) {
        return {
            type,
            x,
            y,
            width: 0,
            height: 0,
            color: this.drawingColor,
            opacity: this.drawingOpacity,
            size: this.drawingSize
        };
    }
    
    updateTempShape(x, y) {
        if (!this.tempShape) return;
        
        if (this.tempShape.type === 'line') {
            this.tempShape.endX = x;
            this.tempShape.endY = y;
        } else {
            this.tempShape.width = x - this.tempShape.x;
            this.tempShape.height = y - this.tempShape.y;
        }
    }
    
    finalizeShape() {
        if (!this.tempShape || !this.viewingMapId) return;
        
        // Don't create shapes that are too small
        if (this.tempShape.type === 'line') {
            const dx = this.tempShape.endX - this.tempShape.x;
            const dy = this.tempShape.endY - this.tempShape.y;
            if (Math.sqrt(dx * dx + dy * dy) < 5) return;
        } else {
            if (Math.abs(this.tempShape.width) < 5 || Math.abs(this.tempShape.height) < 5) return;
        }
        
        this.addLayer(this.tempShape);
        this.tempShape = null;
    }
    
    addLayer(layerData) {
        fetch(`/api/maps/${this.viewingMapId}/layers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layerData)
        });
    }
    
    moveSelectedLayer(dx, dy) {
        if (!this.selectedLayer || !this.viewingMapId) return;
        
        this.selectedLayer.x += dx;
        this.selectedLayer.y += dy;
        
        if (this.selectedLayer.type === 'line') {
            this.selectedLayer.endX += dx;
            this.selectedLayer.endY += dy;
        }
        
        fetch(`/api/maps/${this.viewingMapId}/layers/${this.selectedLayer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.selectedLayer)
        });
    }
    
    isPointInShape(x, y, shape) {
        switch (shape.type) {
            case 'rectangle':
                return x >= shape.x && x <= shape.x + shape.width &&
                       y >= shape.y && y <= shape.y + shape.height;
            case 'circle':
                const dx = x - shape.x;
                const dy = y - shape.y;
                return dx * dx + dy * dy <= shape.width * shape.width / 4;
            case 'line':
                const tolerance = 5;
                const A = x - shape.x;
                const B = y - shape.y;
                const C = shape.endX - shape.x;
                const D = shape.endY - shape.y;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                if (lenSq === 0) return false;
                const param = dot / lenSq;
                if (param < 0 || param > 1) return false;
                const projX = shape.x + param * C;
                const projY = shape.y + param * D;
                const distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);
                return distSq <= tolerance * tolerance;
            case 'image':
                return x >= shape.x && x <= shape.x + shape.width &&
                       y >= shape.y && y <= shape.y + shape.height;
            default:
                return false;
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const map = this.maps.get(this.viewingMapId);
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
            
            // Draw fog of war (within the same transformation context)
            this.drawFogOfWar(map);
            
            // Draw temporary shape
            if (this.tempShape) {
                this.drawLayer(this.tempShape);
            }
            
            this.ctx.restore();
        }
    }
    
    drawBackground(map) {
        // Check if image is already cached
        if (this.backgroundImages.has(map.backgroundImage)) {
            const img = this.backgroundImages.get(map.backgroundImage);
            if (img.complete) {
                this.drawBackgroundImage(img, map);
                // Update pan slider ranges when background is ready
                this.updatePanSliderRanges();
                return;
            }
        }
        
        // Load and cache the image
        const img = new Image();
        img.onload = () => {
            this.backgroundImages.set(map.backgroundImage, img);
            this.drawBackgroundImage(img, map);
            // Update pan slider ranges when background loads
            this.updatePanSliderRanges();
            this.render(); // Re-render after image loads
        };
        img.onerror = () => {
            console.error('Failed to load background image:', map.backgroundImage);
        };
        img.src = map.backgroundImage;
    }
    
    drawBackgroundImage(img, map) {
        // Always use original size and position for background
        // Let the canvas transformation (zoom/pan) handle the scaling
        this.ctx.drawImage(img, 0, 0, img.width, img.height);
    }
    
    drawLayer(layer) {
        this.ctx.save();
        this.ctx.globalAlpha = layer.opacity || 1;
        
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
        
        // Draw selection indicator
        if (layer === this.selectedLayer) {
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            
            switch (layer.type) {
                case 'rectangle':
                    this.ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                    break;
                case 'circle':
                    this.ctx.beginPath();
                    this.ctx.arc(layer.x, layer.y, layer.width / 2, 0, 2 * Math.PI);
                    this.ctx.stroke();
                    break;
                case 'line':
                    this.ctx.beginPath();
                    this.ctx.moveTo(layer.x, layer.y);
                    this.ctx.lineTo(layer.endX, layer.endY);
                    this.ctx.stroke();
                    break;
                case 'image':
                    this.ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                    break;
            }
        }
        
        this.ctx.restore();
    }
    
    drawFogOfWar(map) {
        console.log('drawFogOfWar called for map:', map.id);
        console.log('Map fogDataUrl:', map.fogDataUrl);
        
        if (!map.fogDataUrl) {
            console.log('No fog data URL, skipping fog drawing');
            return;
        }
        
        // If we have a fog canvas and it's for the current map, draw directly from it
        if (this.fogCanvas && this.fogCanvas.width > 0 && this.fogCanvas.height > 0) {
            console.log('Drawing fog directly from fog canvas');
            this.drawFogFromCanvas();
            return;
        }
        
        // Check if we need to load/update the fog image
        const needsImageUpdate = !this.fogImage || 
                                this.fogImageMapId !== map.id || 
                                this.fogImageDataUrl !== map.fogDataUrl;
        
        if (needsImageUpdate) {
            console.log('Loading/updating fog image for map:', map.id);
            
            // Load fog image if not already loaded
            if (!this.fogImage) {
                console.log('Creating new fog image');
                this.fogImage = new Image();
                this.fogImage.onload = () => {
                    console.log('Fog image loaded, triggering re-render...');
                    // Trigger a re-render to draw the fog with proper transformations
                    this.render();
                };
                this.fogImage.onerror = (error) => {
                    console.error('Failed to load fog image:', error);
                };
                this.fogImage.src = map.fogDataUrl;
                return; // Don't draw yet, wait for onload
            } else if (this.fogImage.src !== map.fogDataUrl) {
                console.log('Updating fog image source');
                this.fogImage.src = map.fogDataUrl;
                return; // Don't draw yet, wait for onload
            }
            
            // Update cache metadata
            this.fogImageMapId = map.id;
            this.fogImageDataUrl = map.fogDataUrl;
        }
        
        // Draw the fog image now (within the transformation context)
        console.log('Drawing fog image with proper transformations');
        this.drawFogImage();
    }
    
    drawFogFromCanvas() {
        console.log('Drawing fog directly from canvas with opacity:', this.fogOpacity);
        
        // Save the current canvas state
        this.ctx.save();
        
        // Use different opacity for DM vs player view
        this.ctx.globalAlpha = this.fogOpacity; // DM view opacity
        
        // Draw the fog canvas at exactly the same position and size as the background
        const bgImage = this.backgroundImages.get(this.maps.get(this.viewingMapId)?.backgroundImage);
        if (bgImage && bgImage.complete) {
            // Draw fog at exactly the same position and size as background
            this.ctx.drawImage(this.fogCanvas, 0, 0, bgImage.width, bgImage.height);
        } else {
            // Fallback to original size
            this.ctx.drawImage(this.fogCanvas, 0, 0);
        }
        
        // Restore the canvas state
        this.ctx.restore();
        
        // Draw brush preview if currently drawing (after restoring state)
        if (this.isFogDrawing && this.fogDrawPath.length > 1) {
            this.drawBrushPreview();
        }
    }
    
    drawFogImage() {
        if (!this.fogImage || !this.fogImage.complete) {
            console.log('No fog image to draw');
            return;
        }
        
        console.log('Drawing fog image with opacity:', this.fogOpacity);
        
        // Save the current canvas state
        this.ctx.save();
        
        // Use different opacity for DM vs player view
        this.ctx.globalAlpha = this.fogOpacity; // DM view opacity
        
        // Draw the fog image at exactly the same position and size as the background
        const bgImage = this.backgroundImages.get(this.maps.get(this.viewingMapId)?.backgroundImage);
        if (bgImage && bgImage.complete) {
            // Draw fog at exactly the same position and size as background
            this.ctx.drawImage(this.fogImage, 0, 0, bgImage.width, bgImage.height);
        } else {
            // Fallback to original size
            this.ctx.drawImage(this.fogImage, 0, 0);
        }
        
        // Restore the canvas state
        this.ctx.restore();
        
        // Draw brush preview if currently drawing (after restoring state)
        if (this.isFogDrawing && this.fogDrawPath.length > 1) {
            this.drawBrushPreview();
        }
    }
    
    drawBrushPreview() {
        this.ctx.save();
        
        // Set brush preview style
        this.ctx.strokeStyle = this.fogTool === 'fog-brush' ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 255, 0, 0.7)';
        this.ctx.lineWidth = this.fogBrushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Draw the brush path using world coordinates
        this.ctx.beginPath();
        this.fogDrawPath.forEach((point, index) => {
            // Point coordinates are already in world coordinates
            if (index === 0) {
                this.ctx.moveTo(point.x, point.y);
            } else {
                this.ctx.lineTo(point.x, point.y);
            }
        });
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    // Map Management
    showNewMapModal() {
        document.getElementById('newMapModal').style.display = 'block';
    }
    
    createNewMap() {
        const name = document.getElementById('mapName').value || 'New Battlemap';
        const backgroundFile = document.getElementById('mapBackground').files[0];
        
        if (backgroundFile) {
            this.uploadBackgroundImage(backgroundFile).then(imageUrl => {
                this.createMapWithBackground(name, imageUrl);
            });
        } else {
            this.createMapWithBackground(name, '');
        }
    }
    
    createMapWithBackground(name, backgroundImage) {
        console.log('Creating map with background:', { name, backgroundImage });
        
        fetch('/api/maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, backgroundImage })
        }).then(response => {
            console.log('Map creation response status:', response.status);
            console.log('Map creation response headers:', response.headers);
            
            if (!response.ok) {
                return response.text().then(text => {
                    console.error('Map creation error response:', text);
                    throw new Error(`Map creation failed: ${response.status} ${response.statusText}`);
                });
            }
            
            return response.json();
        }).then(data => {
            console.log('Map creation success data:', data);
            if (data.success) {
                this.closeModals();
                this.loadMaps();
            } else {
                console.error('Map creation failed:', data);
            }
        }).catch(error => {
            console.error('Map creation error:', error);
        });
    }
    
    uploadBackgroundImage(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);
            
            fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            }).then(response => {
                console.log('Upload response status:', response.status);
                console.log('Upload response headers:', response.headers);
                
                if (!response.ok) {
                    return response.text().then(text => {
                        console.error('Upload error response:', text);
                        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
                    });
                }
                
                return response.json();
            }).then(data => {
                console.log('Upload success data:', data);
                if (data.success) {
                    resolve(data.imageUrl);
                } else {
                    reject(data.error);
                }
            }).catch(error => {
                console.error('Upload error:', error);
                reject(error);
            });
        });
    }
    
    // Zoom controls
    zoomIn() {
        this.zoom = Math.min(5, this.zoom * 1.2);
        this.render();
    }
    
    zoomOut() {
        this.zoom = Math.max(0.1, this.zoom / 1.2);
        this.render();
    }
    
    resetZoom() {
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.render();
    }
    
    // UI Updates
    loadMaps() {
        fetch('/api/maps')
        .then(response => response.json())
        .then(data => {
            this.maps.clear();
            data.maps.forEach(map => this.maps.set(map.id, map));
            this.activeMapId = data.activeMapId;
            this.viewingMapId = data.activeMapId; // Set viewing map to active map
            this.updateMapTabs();
            this.render();
            
            // Load player view state
            this.loadPlayerViewState();
            
            // Update pan slider ranges after maps are loaded
            setTimeout(() => this.updatePanSliderRanges(), 100);
        });
    }
    
    updateMapTabs() {
        const container = document.getElementById('mapTabs');
        container.innerHTML = '';
        
        console.log('Updating map tabs, maps:', Array.from(this.maps.keys()));
        console.log('Active map ID:', this.activeMapId);
        console.log('Viewing map ID:', this.viewingMapId);
        
        this.maps.forEach(map => {
            const tab = document.createElement('div');
            const isActive = map.id === this.activeMapId;
            const isViewing = map.id === this.viewingMapId;
            
            let className = 'map-tab';
            if (isActive) className += ' active';
            if (isViewing) className += ' viewing';
            
            tab.className = className;
            tab.innerHTML = `
                <span class="map-tab-name">${map.name}</span>
                <div class="map-tab-actions">
                    <button onclick="battlemapDM.setActiveMap('${map.id}')" title="Set Active for Players" class="${isActive ? 'active-btn' : ''}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="battlemapDM.deleteMap('${map.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Add click handler to the entire tab
            tab.addEventListener('click', (e) => {
                console.log('Map tab clicked:', map.id, map.name);
                // Don't trigger if clicking on buttons
                if (!e.target.closest('.map-tab-actions')) {
                    console.log('Setting viewing map to:', map.id);
                    this.setViewingMap(map.id);
                }
            });
            
            container.appendChild(tab);
        });
    }
    
    setViewingMap(mapId) {
        console.log('setViewingMap called with:', mapId);
        
        // Update local state immediately
        this.viewingMapId = mapId;
        console.log('Updated viewingMapId to:', this.viewingMapId);
        
        this.initializeFogCanvas();
        this.updateMapTabs();
        this.updateLayerList();
        this.updatePanSliderRanges(); // Update pan ranges for new map
        this.render();
    }
    
    initializeFogCanvas() {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        // Get the background image to determine the map size
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        let mapWidth = this.canvas.width;
        let mapHeight = this.canvas.height;
        
        if (bgImage && bgImage.complete) {
            mapWidth = bgImage.width;
            mapHeight = bgImage.height;
        }
        
        console.log('Initializing fog canvas with dimensions:', mapWidth, 'x', mapHeight);
        
        // Initialize fog canvas
        this.fogCanvas.width = mapWidth;
        this.fogCanvas.height = mapHeight;
        
        // Clear fog cache when switching maps
        this.fogImage = null;
        this.fogImageMapId = null;
        this.fogImageDataUrl = null;
        
        // If there's existing fog data, load it
        if (map.fogDataUrl) {
            const fogImg = new Image();
            fogImg.onload = () => {
                this.fogCtx.drawImage(fogImg, 0, 0);
                // Update fog cache after loading
                this.fogImage = fogImg;
                this.fogImageMapId = map.id;
                this.fogImageDataUrl = map.fogDataUrl;
                console.log('Fog image loaded for map:', map.id);
                // Trigger a re-render to show the fog
                this.render();
            };
            fogImg.src = map.fogDataUrl;
        } else {
            // Start with full fog for new maps
            console.log('New map detected, applying full fog');
            this.fogCtx.fillStyle = 'black';
            this.fogCtx.fillRect(0, 0, mapWidth, mapHeight);
            
            // Update local map data
            map.fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Applied full fog to new map');
            
            // Update fog cache
            this.fogImageMapId = map.id;
            this.fogImageDataUrl = map.fogDataUrl;
            
            // Save to server
            this.saveFogState();
        }
    }
    
    setActiveMap(mapId) {
        console.log('setActiveMap called with:', mapId);
        
        // Update local state immediately
        this.activeMapId = mapId;
        console.log('Updated activeMapId to:', this.activeMapId);
        
        this.updateMapTabs();
        
        // Send to server
        fetch('/api/active-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapId })
        }).then(response => response.json())
        .then(data => {
            console.log('Server response for setActiveMap:', data);
        })
        .catch(error => {
            console.error('Error setting active map:', error);
        });
    }
    
    deleteMap(mapId) {
        if (confirm('Are you sure you want to delete this map?')) {
            fetch(`/api/maps/${mapId}`, {
                method: 'DELETE'
            });
        }
    }
    
    updateLayerList() {
        const container = document.getElementById('layerList');
        container.innerHTML = '';
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        map.layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = `layer-item ${layer === this.selectedLayer ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="layer-info">
                    <button class="layer-visibility" onclick="battlemapDM.toggleLayerVisibility('${layer.id}')">
                        <i class="fas fa-${layer.visible !== false ? 'eye' : 'eye-slash'}"></i>
                    </button>
                    <span>${layer.type} - ${layer.id.slice(0, 8)}</span>
                </div>
                <div class="layer-actions">
                    <button onclick="battlemapDM.selectLayer('${layer.id}')" title="Select">
                        <i class="fas fa-mouse-pointer"></i>
                    </button>
                    <button onclick="battlemapDM.deleteLayer('${layer.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }
    
    toggleLayerVisibility(layerId) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const layer = map.layers.find(l => l.id === layerId);
        if (layer) {
            layer.visible = layer.visible === false ? true : false;
            fetch(`/api/maps/${this.viewingMapId}/layers/${layerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(layer)
            });
        }
    }
    
    selectLayer(layerId) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        this.selectedLayer = map.layers.find(l => l.id === layerId);
        this.updateLayerList();
        this.render();
    }
    
    deleteLayer(layerId) {
        if (confirm('Are you sure you want to delete this layer?')) {
            fetch(`/api/maps/${this.viewingMapId}/layers/${layerId}`, {
                method: 'DELETE'
            });
        }
    }
    
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    // Image Upload Modal
    showImageUploadModal() {
        document.getElementById('imageUploadModal').style.display = 'block';
        // Reset the form
        document.getElementById('tokenImage').value = '';
        document.getElementById('tokenName').value = '';
    }
    
    uploadTokenImage() {
        const imageFile = document.getElementById('tokenImage').files[0];
        const tokenName = document.getElementById('tokenName').value || 'Token';
        
        if (!imageFile) {
            alert('Please select an image file');
            return;
        }
        
        this.uploadImageFile(imageFile).then(imageUrl => {
            this.closeModals();
            // Set the image tool as active and store the image URL for placement
            this.setTool('image');
            this.pendingImageUrl = imageUrl;
            this.pendingImageName = tokenName;
            // Change cursor to indicate image placement mode
            this.canvas.style.cursor = 'crosshair';
            // Update status
            document.getElementById('statusText').textContent = `Click to place ${tokenName} (Press Esc to cancel)`;
        }).catch(error => {
            console.error('Image upload error:', error);
            alert('Failed to upload image: ' + error.message);
        });
    }
    
    uploadImageFile(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);
            
            fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            }).then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
                    });
                }
                return response.json();
            }).then(data => {
                if (data.success) {
                    resolve(data.imageUrl);
                } else {
                    reject(new Error(data.error));
                }
            }).catch(error => {
                reject(error);
            });
        });
    }
    
    placeImageToken(x, y) {
        if (!this.pendingImageUrl || !this.viewingMapId) return;
        
        // Load the image to get its natural dimensions
        const img = new Image();
        img.onload = () => {
            // Get the natural dimensions of the image
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            
            // Optional: Scale down very large images to prevent extremely large tokens
            const maxSize = 300; // Maximum dimension in pixels
            if (width > maxSize || height > maxSize) {
                const scale = Math.min(maxSize / width, maxSize / height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            
            const imageLayer = {
                type: 'image',
                x: x - width / 2, // Center the image on the click point
                y: y - height / 2,
                width: width,
                height: height,
                imageUrl: this.pendingImageUrl,
                name: this.pendingImageName || 'Token',
                opacity: this.drawingOpacity,
                visible: true
            };
            
            // Add the layer to the map
            this.addLayer(imageLayer);
            
            // Update status
            document.getElementById('statusText').textContent = `Placed ${this.pendingImageName || 'Token'} (${width}x${height})`;
            
            // Clear the pending image data and reset to select tool
            this.pendingImageUrl = null;
            this.pendingImageName = null;
            this.setTool('select');
            this.canvas.style.cursor = 'default';
        };
        
        img.onerror = () => {
            console.error('Failed to load image for token placement:', this.pendingImageUrl);
            // Fallback to default size if image loading fails
            const defaultSize = 100;
            const imageLayer = {
                type: 'image',
                x: x - defaultSize / 2,
                y: y - defaultSize / 2,
                width: defaultSize,
                height: defaultSize,
                imageUrl: this.pendingImageUrl,
                name: this.pendingImageName || 'Token',
                opacity: this.drawingOpacity,
                visible: true
            };
            
            this.addLayer(imageLayer);
            document.getElementById('statusText').textContent = `Placed ${this.pendingImageName || 'Token'} (fallback size)`;
            
            this.pendingImageUrl = null;
            this.pendingImageName = null;
            this.setTool('select');
            this.canvas.style.cursor = 'default';
        };
        
        img.src = this.pendingImageUrl;
    }
    
    setFogTool(tool) {
        console.log('setFogTool called with:', tool);
        this.fogTool = tool;
        
        // Update UI
        document.querySelectorAll('.fog-tool-group .tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (tool !== 'none') {
            const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
            if (activeBtn) {
                activeBtn.classList.add('active');
                console.log('Set active button for tool:', tool);
            } else {
                console.error('Could not find button for tool:', tool);
            }
        }
        
        // Update cursor
        if (tool === 'fog-brush' || tool === 'reveal-brush') {
            this.canvas.style.cursor = 'crosshair';
            console.log('Set cursor to crosshair for brush tool');
        } else {
            this.canvas.style.cursor = 'default';
            console.log('Set cursor to default');
        }
        
        // Execute immediate actions
        if (tool === 'show-all') {
            this.showEverything();
        } else if (tool === 'fog-all') {
            this.fogEverything();
        }
    }
    
    showEverything() {
        console.log('showEverything called');
        if (!this.viewingMapId) {
            console.log('No viewing map ID');
            return;
        }
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) {
            console.log('No map found');
            return;
        }
        
        // Clear the fog bitmap
        this.fogCtx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        
        // Update local map data immediately
        const currentMap = this.maps.get(this.viewingMapId);
        if (currentMap) {
            currentMap.fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Updated local map fogDataUrl');
            
            // Update fog cache directly from fog canvas to prevent flickering
            this.updateFogCacheFromCanvas();
        }
        
        // Re-render immediately
        this.render();
        
        this.saveFogState();
    }
    
    fogEverything() {
        console.log('fogEverything called');
        if (!this.viewingMapId) {
            console.log('No viewing map ID');
            return;
        }
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) {
            console.log('No map found');
            return;
        }
        
        // Get the background image to determine the map size
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        let mapWidth = this.canvas.width;
        let mapHeight = this.canvas.height;
        
        if (bgImage && bgImage.complete) {
            mapWidth = bgImage.width;
            mapHeight = bgImage.height;
        }
        
        console.log('Creating fog with dimensions:', mapWidth, 'x', mapHeight);
        
        // Resize fog canvas to match map size
        this.fogCanvas.width = mapWidth;
        this.fogCanvas.height = mapHeight;
        
        // Fill the entire fog canvas with black
        this.fogCtx.fillStyle = 'black';
        this.fogCtx.fillRect(0, 0, mapWidth, mapHeight);
        
        // Update local map data immediately
        const currentMap = this.maps.get(this.viewingMapId);
        if (currentMap) {
            currentMap.fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Updated local map fogDataUrl');
            
            // Update fog cache directly from fog canvas to prevent flickering
            this.updateFogCacheFromCanvas();
        }
        
        // Re-render immediately
        this.render();
        
        console.log('Fog canvas created, saving state...');
        this.saveFogState();
    }
    
    saveFogState() {
        if (!this.viewingMapId) return;
        
        const map = this.maps.get(this.viewingMapId);
        if (map) {
            // Convert fog canvas to compressed data URL
            const fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            
            console.log('Saving fog state, data URL length:', fogDataUrl.length);
            
            // Check if data is still too large (limit to 10MB)
            if (fogDataUrl.length > 10 * 1024 * 1024) {
                console.warn('Fog data is very large, trying higher compression...');
                const compressedDataUrl = this.fogCanvas.toDataURL('image/jpeg', 0.5);
                console.log('Compressed data URL length:', compressedDataUrl.length);
                
                if (compressedDataUrl.length > 10 * 1024 * 1024) {
                    console.error('Fog data still too large, cannot save');
                    return;
                }
                
                // Use the more compressed version
                this.sendFogData(compressedDataUrl);
            } else {
                this.sendFogData(fogDataUrl);
            }
        }
    }
    
    sendFogData(fogDataUrl) {
        console.log('Sending fog data to server, length:', fogDataUrl.length);
        
        fetch(`/api/maps/${this.viewingMapId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fogDataUrl: fogDataUrl })
        }).then(response => {
            if (response.ok) {
                console.log('Fog state saved successfully');
                // Update the local map data
                const map = this.maps.get(this.viewingMapId);
                if (map) {
                    map.fogDataUrl = fogDataUrl;
                    console.log('Updated local map fogDataUrl');
                }
            } else {
                console.error('Failed to save fog state:', response.status, response.statusText);
            }
        }).catch(error => {
            console.error('Error saving fog state:', error);
        });
    }
    
    finalizeFogDrawing() {
        if (!this.viewingMapId || this.fogDrawPath.length < 2) return;
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        // Ensure fog canvas is properly sized
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        let mapWidth = this.canvas.width;
        let mapHeight = this.canvas.height;
        
        if (bgImage && bgImage.complete) {
            mapWidth = bgImage.width;
            mapHeight = bgImage.height;
        }
        
        console.log('Fog canvas dimensions:', this.fogCanvas.width, 'x', this.fogCanvas.height);
        console.log('Background image dimensions:', mapWidth, 'x', mapHeight);
        console.log('Brush path points:', this.fogDrawPath.length);
        
        if (this.fogCanvas.width !== mapWidth || this.fogCanvas.height !== mapHeight) {
            console.log('Resizing fog canvas to match background');
            this.fogCanvas.width = mapWidth;
            this.fogCanvas.height = mapHeight;
        }
        
        // Draw on the fog bitmap using world coordinates
        this.fogCtx.globalCompositeOperation = this.fogTool === 'fog-brush' ? 'source-over' : 'destination-out';
        this.fogCtx.strokeStyle = this.fogTool === 'fog-brush' ? 'black' : 'white';
        this.fogCtx.lineWidth = this.fogBrushSize;
        this.fogCtx.lineCap = 'round';
        this.fogCtx.lineJoin = 'round';
        this.fogCtx.beginPath();
        
        // Convert screen coordinates to world coordinates for fog canvas
        this.fogDrawPath.forEach((point, index) => {
            // The point coordinates are already in world coordinates from handleMouseDown/Move
            console.log(`Point ${index}:`, point.x, point.y);
            if (index === 0) {
                this.fogCtx.moveTo(point.x, point.y);
            } else {
                this.fogCtx.lineTo(point.x, point.y);
            }
        });
        
        this.fogCtx.stroke();
        this.fogCtx.globalCompositeOperation = 'source-over';
        
        // Update local map data immediately
        const currentMap = this.maps.get(this.viewingMapId);
        if (currentMap) {
            currentMap.fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Updated local map fogDataUrl after brush drawing');
            
            // Update fog cache directly from fog canvas to prevent flickering
            this.updateFogCacheFromCanvas();
        }
        
        // Re-render immediately
        this.render();
        
        this.saveFogState();
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

    updateFogCacheFromCanvas() {
        // Since we're drawing directly from the fog canvas, we don't need to update the image cache
        // Just update the metadata to indicate we have fog data
        this.fogImageMapId = this.viewingMapId;
        this.fogImageDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
        console.log('Updated fog cache metadata from canvas');
    }
    
    // Player View Control Methods
    updatePlayerView(updates) {
        const { zoom, pan } = updates;
        
        if (zoom !== undefined) {
            this.currentPlayerZoom = zoom;
        }
        
        if (pan !== undefined) {
            this.currentPlayerPanX = pan.x;
            this.currentPlayerPanY = pan.y;
        }
        
        // Send update to server
        fetch('/api/player-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zoom: this.currentPlayerZoom,
                pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
            })
        }).then(response => response.json())
        .then(data => {
            console.log('Player view updated:', data);
        })
        .catch(error => {
            console.error('Error updating player view:', error);
        });
    }
    
    resetPlayerView() {
        // Get current map and background image for coordinate calculation
        const map = this.maps.get(this.viewingMapId);
        if (!map || !map.backgroundImage) {
            console.log('No map or background image for reset');
            return;
        }
        
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (!bgImage || !bgImage.complete) {
            console.log('Background image not ready for reset');
            return;
        }
        
        // Calculate zoom level to fit the entire image in the window
        const imageWidth = bgImage.width;
        const imageHeight = bgImage.height;
        const windowWidth = this.canvas.width;
        const windowHeight = this.canvas.height;
        
        // Calculate zoom to fit image completely in window (with some padding)
        const zoomX = (windowWidth * 0.9) / imageWidth;  // 90% of window width
        const zoomY = (windowHeight * 0.9) / imageHeight; // 90% of window height
        const fitZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 100%
        
        // Center the image (image center coordinates)
        const centerX = imageWidth / 2;
        const centerY = imageHeight / 2;
        
        console.log('=== RESET PLAYER VIEW ===');
        console.log('Image dimensions:', imageWidth, 'x', imageHeight);
        console.log('Window dimensions:', windowWidth, 'x', windowHeight);
        console.log('Calculated fit zoom:', fitZoom);
        console.log('Image center coordinates:', centerX, centerY);
        
        // Set player view to centered and fitted
        this.currentPlayerZoom = fitZoom;
        this.currentPlayerPanX = centerX;
        this.currentPlayerPanY = centerY;
        
        console.log('Player view reset to - zoom:', this.currentPlayerZoom, 'centerX:', this.currentPlayerPanX, 'centerY:', this.currentPlayerPanY);
        
        // Update UI
        this.updatePlayerViewUI();
        
        // Send reset to server
        fetch('/api/player-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zoom: this.currentPlayerZoom,
                pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
            })
        }).then(response => response.json())
        .then(data => {
            console.log('Player view reset:', data);
        })
        .catch(error => {
            console.error('Error resetting player view:', error);
        });
    }
    
    syncPlayerViewToDM() {
        // Get current map and background image for coordinate conversion
        const map = this.maps.get(this.viewingMapId);
        if (!map || !map.backgroundImage) {
            console.log('No map or background image for sync');
            return;
        }
        
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (!bgImage || !bgImage.complete) {
            console.log('Background image not ready for sync');
            return;
        }
        
        // Calculate the center of the screen in image coordinates (same as footer display)
        const viewportWidth = this.canvas.width / this.zoom;
        const viewportHeight = this.canvas.height / this.zoom;
        const screenCenterX = (-this.pan.x / this.zoom) + (viewportWidth / 2);
        const screenCenterY = (-this.pan.y / this.zoom) + (viewportHeight / 2);
        
        console.log('=== SYNC TO DM SCREEN ===');
        console.log('DM view - zoom:', this.zoom, 'pan:', this.pan);
        console.log('Canvas dimensions:', this.canvas.width / this.zoom, 'x', this.canvas.height / this.zoom);
        console.log('Image dimensions:', bgImage.width, 'x', bgImage.height);
        console.log('Screen center in image coordinates:', screenCenterX, screenCenterY);
        
        // Clamp the center coordinates to image bounds
        const clampedCenterX = Math.max(0, Math.min(bgImage.width, screenCenterX));
        const clampedCenterY = Math.max(0, Math.min(bgImage.height, screenCenterY));
        
        console.log('Clamped center coordinates:', clampedCenterX, clampedCenterY);
        
        // Sync player view to the center coordinates
        this.currentPlayerZoom = this.zoom;
        this.currentPlayerPanX = clampedCenterX;
        this.currentPlayerPanY = clampedCenterY;
        
        console.log('Player view set to - zoom:', this.currentPlayerZoom, 'centerX:', this.currentPlayerPanX, 'centerY:', this.currentPlayerPanY);
        
        // Update UI
        this.updatePlayerViewUI();
        
        // Send update to server
        this.updatePlayerView({
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
        });
    }
    
    updatePlayerViewUI() {
        // Update slider values and labels
        const playerZoomSlider = document.getElementById('playerZoomSlider');
        const playerZoomValue = document.getElementById('playerZoomValue');
        const playerPanXSlider = document.getElementById('playerPanXSlider');
        const playerPanXValue = document.getElementById('playerPanXValue');
        const playerPanYSlider = document.getElementById('playerPanYSlider');
        const playerPanYValue = document.getElementById('playerPanYValue');
        
        if (playerZoomSlider) {
            playerZoomSlider.value = this.currentPlayerZoom;
        }
        if (playerZoomValue) {
            playerZoomValue.textContent = `${Math.round(this.currentPlayerZoom * 100)}%`;
        }
        
        // Update pan slider ranges based on actual dimensions
        this.updatePanSliderRanges();
        
        if (playerPanXSlider) {
            playerPanXSlider.value = this.currentPlayerPanX;
        }
        if (playerPanXValue) {
            playerPanXValue.textContent = `${this.currentPlayerPanX}px`;
        }
        
        if (playerPanYSlider) {
            playerPanYSlider.value = this.currentPlayerPanY;
        }
        if (playerPanYValue) {
            playerPanYValue.textContent = `${this.currentPlayerPanY}px`;
        }
    }
    
    updatePanSliderRanges() {
        const playerPanXSlider = document.getElementById('playerPanXSlider');
        const playerPanYSlider = document.getElementById('playerPanYSlider');
        
        if (!playerPanXSlider || !playerPanYSlider) return;
        
        // Get current map and background image
        const map = this.maps.get(this.viewingMapId);
        if (!map || !map.backgroundImage) return;
        
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (!bgImage || !bgImage.complete) return;
        
        // Calculate pan ranges based on image dimensions
        // Player pan X and Y represent the center of screen on the image
        // So ranges should be 0 to image width/height
        const imageWidth = bgImage.width;
        const imageHeight = bgImage.height;
        
        // Update slider ranges
        playerPanXSlider.min = 0;
        playerPanXSlider.max = imageWidth;
        
        playerPanYSlider.min = 0;
        playerPanYSlider.max = imageHeight;
        
        console.log('Updated pan slider ranges for player view - X: 0 to', imageWidth, 'Y: 0 to', imageHeight);
        console.log('Image dimensions:', imageWidth, 'x', imageHeight);
    }
    
    loadPlayerViewState() {
        // Load current player view state from server
        fetch('/api/player-view')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.playerView) {
                this.currentPlayerZoom = data.playerView.zoom;
                this.currentPlayerPanX = data.playerView.pan.x;
                this.currentPlayerPanY = data.playerView.pan.y;
                this.updatePlayerViewUI();
            }
        })
        .catch(error => {
            console.error('Error loading player view state:', error);
        });
    }
}

// Initialize the DM interface
const battlemapDM = new BattlemapDM();