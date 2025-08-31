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
        
        // Extract adventure ID from URL
        this.adventureId = this.extractAdventureIdFromUrl();
        if (!this.adventureId) {
            console.error('No adventure ID found in URL');
            alert('Invalid adventure URL. Please return to the adventure selection page.');
            return;
        }
        
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
        this.currentFogTool = 'select'; // For overlay buttons: 'select', 'fog-brush', 'reveal-brush'
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
        this.currentPlayerNameFontSize = 14;
        
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
        
        // Players management state
        this.players = new Map(); // Map of playerId -> playerData
        this.currentActivePlayerId = null;
        
        // Battlegrid state
        this.battlegridType = 'none'; // 'none', 'grid', 'hex'
        this.battlegridLineWidth = 2;
        this.battlegridOpacity = 0.5;
        this.battlegridSize = 50;
        this.battlegridOffsetX = 0;
        this.battlegridOffsetY = 0;
        this.battlegridColor = '#ffffff';
        this.battlegridScaleFactor = 1.5; // meters per grid unit
        
        // Initialize after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    
    extractAdventureIdFromUrl() {
        const pathSegments = window.location.pathname.split('/');
        const adventureIndex = pathSegments.indexOf('adventure');
        if (adventureIndex !== -1 && adventureIndex + 1 < pathSegments.length) {
            return pathSegments[adventureIndex + 1];
        }
        return null;
    }
    
    initialize() {
        this.initializeCanvas();
        this.bindEvents();
        this.setupSocketListeners();
        this.loadMaps();
        this.loadPlayers();
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
        // Collapsible section functionality
        this.setupCollapsibleSections();
        
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
        
        const importMapBtn = document.getElementById('importMapBtn');
        if (importMapBtn) {
            importMapBtn.addEventListener('click', () => {
                this.importMap();
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
        
        // Token search functionality
        const tokenSearch = document.getElementById('tokenSearch');
        if (tokenSearch) {
            tokenSearch.addEventListener('input', (e) => {
                this.searchTokens(e.target.value);
            });
        }
        
        // Map search functionality
        const mapSearch = document.getElementById('mapSearch');
        if (mapSearch) {
            mapSearch.addEventListener('input', (e) => {
                this.searchMaps(e.target.value);
            });
        }
        
        // Spell search functionality
        const spellSearch = document.getElementById('spellSearch');
        if (spellSearch) {
            spellSearch.addEventListener('input', (e) => {
                this.searchSpells(e.target.value);
            });
        }
        
        // Monster search functionality
        const monsterSearch = document.getElementById('monsterSearch');
        if (monsterSearch) {
            monsterSearch.addEventListener('input', (e) => {
                this.searchMonsters(e.target.value);
            });
        }
        
        // Show spell to player button
        const showSpellToPlayerBtn = document.getElementById('showSpellToPlayerBtn');
        if (showSpellToPlayerBtn) {
            showSpellToPlayerBtn.addEventListener('click', () => {
                this.showSpellToPlayer();
            });
        }
        
        // Sticky spell button
        const stickySpellBtn = document.getElementById('stickySpellBtn');
        if (stickySpellBtn) {
            stickySpellBtn.addEventListener('click', () => {
                this.createStickySpellWindow();
            });
        }
        
        // Sticky monster button
        const stickyMonsterBtn = document.getElementById('stickyMonsterBtn');
        if (stickyMonsterBtn) {
            stickyMonsterBtn.addEventListener('click', () => {
                this.createStickyMonsterWindow();
            });
        }
        

        
        // Fog controls overlay buttons
        const arrowToolBtnOverlay = document.getElementById('arrowToolBtnOverlay');
        const fogBrushBtnOverlay = document.getElementById('fogBrushBtnOverlay');
        const revealBrushBtnOverlay = document.getElementById('revealBrushBtnOverlay');
        const showEverythingBtnOverlay = document.getElementById('showEverythingBtnOverlay');
        const fogEverythingBtnOverlay = document.getElementById('fogEverythingBtnOverlay');
        
        if (arrowToolBtnOverlay) {
            arrowToolBtnOverlay.addEventListener('click', () => {
                this.setTool('select');
                this.currentFogTool = 'select';
                this.updateFogButtonStates();
            });
        }
        
        if (fogBrushBtnOverlay) {
            fogBrushBtnOverlay.addEventListener('click', () => {
                this.currentFogTool = 'fog-brush';
                this.updateFogButtonStates();
            });
        }
        
        if (revealBrushBtnOverlay) {
            revealBrushBtnOverlay.addEventListener('click', () => {
                this.currentFogTool = 'reveal-brush';
                this.updateFogButtonStates();
            });
        }
        
        if (showEverythingBtnOverlay) {
            showEverythingBtnOverlay.addEventListener('click', () => {
                this.showEverything();
            });
        }
        
        if (fogEverythingBtnOverlay) {
            fogEverythingBtnOverlay.addEventListener('click', () => {
                this.fogEverything();
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
                this.currentFogTool = 'fog-brush';
                this.updateFogButtonStates();
            });
        }
        
        const revealBrushBtn = document.getElementById('revealBrushBtn');
        if (revealBrushBtn) {
            revealBrushBtn.addEventListener('click', () => {
                this.currentFogTool = 'reveal-brush';
                this.updateFogButtonStates();
            });
        }
        
        const fogSelectionBoxBtn = document.getElementById('fogSelectionBoxBtn');
        if (fogSelectionBoxBtn) {
            fogSelectionBoxBtn.addEventListener('click', () => {
                this.currentFogTool = 'fog-selection-box';
                this.updateFogButtonStates();
            });
        }
        
        const revealSelectionBoxBtn = document.getElementById('revealSelectionBoxBtn');
        if (revealSelectionBoxBtn) {
            revealSelectionBoxBtn.addEventListener('click', () => {
                this.currentFogTool = 'reveal-selection-box';
                this.updateFogButtonStates();
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
                // Fix: Convert image coordinates to screen coordinates
                const map = this.maps.get(this.viewingMapId);
                if (map && map.backgroundImage) {
                    const bgImage = this.backgroundImages.get(map.backgroundImage);
                    if (bgImage && bgImage.complete) {
                        const windowWidth = this.canvas.width;
                        const screenCenterX = windowWidth / 2;
                        const scaledImageCenterX = panX * this.currentPlayerZoom;
                        const correctedPanX = screenCenterX - scaledImageCenterX;
                        this.updatePlayerView({ pan: { x: correctedPanX, y: this.currentPlayerPanY } });
                    } else {
                        this.updatePlayerView({ pan: { x: panX, y: this.currentPlayerPanY } });
                    }
                } else {
                    this.updatePlayerView({ pan: { x: panX, y: this.currentPlayerPanY } });
                }
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
                // Fix: Convert image coordinates to screen coordinates
                const map = this.maps.get(this.viewingMapId);
                if (map && map.backgroundImage) {
                    const bgImage = this.backgroundImages.get(map.backgroundImage);
                    if (bgImage && bgImage.complete) {
                        const windowHeight = this.canvas.height;
                        const screenCenterY = windowHeight / 2;
                        const scaledImageCenterY = panY * this.currentPlayerZoom;
                        const correctedPanY = screenCenterY - scaledImageCenterY;
                        this.updatePlayerView({ pan: { x: this.currentPlayerPanX, y: correctedPanY } });
                    } else {
                        this.updatePlayerView({ pan: { x: this.currentPlayerPanX, y: panY } });
                    }
                } else {
                    this.updatePlayerView({ pan: { x: this.currentPlayerPanX, y: panY } });
                }
            });
        }
        
        const playerNameFontSizeSlider = document.getElementById('playerNameFontSizeSlider');
        if (playerNameFontSizeSlider) {
            playerNameFontSizeSlider.addEventListener('input', (e) => {
                const fontSize = parseInt(e.target.value);
                const playerNameFontSizeValue = document.getElementById('playerNameFontSizeValue');
                if (playerNameFontSizeValue) {
                    playerNameFontSizeValue.textContent = `${fontSize}px`;
                }
                this.updatePlayerNameFontSize(fontSize);
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
        
        // Players management event handlers
        const addPlayerBtn = document.getElementById('addPlayerBtn');
        if (addPlayerBtn) {
            addPlayerBtn.addEventListener('click', () => this.addPlayer());
        }
        
        const playerOrientationSlider = document.getElementById('playerOrientation');
        if (playerOrientationSlider) {
            playerOrientationSlider.addEventListener('input', (e) => {
                const orientationValue = document.getElementById('playerOrientationValue');
                if (orientationValue) {
                    orientationValue.textContent = `${e.target.value}°`;
                }
            });
        }

        const playerInitiativeInput = document.getElementById('playerInitiative');
        if (playerInitiativeInput) {
            playerInitiativeInput.addEventListener('input', (e) => {
                // Limit to 2 digits
                if (e.target.value.length > 2) {
                    e.target.value = e.target.value.slice(0, 2);
                }
            });
        }

        const nextInitBtn = document.getElementById('nextInitBtn');
        if (nextInitBtn) {
            nextInitBtn.addEventListener('click', () => this.nextInitiative());
        }
        
        const endCombatBtn = document.getElementById('endCombatBtn');
        if (endCombatBtn) {
            endCombatBtn.addEventListener('click', () => this.endCombat());
        }
        
        // SRD 5e search buttons
        const searchSpellBtn = document.getElementById('searchSpellBtn');
        if (searchSpellBtn) {
            searchSpellBtn.addEventListener('click', () => this.showSpellSearchModal());
        }
        
        const searchMonsterBtn = document.getElementById('searchMonsterBtn');
        if (searchMonsterBtn) {
            searchMonsterBtn.addEventListener('click', () => this.showMonsterSearchModal());
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
        
        // Battlegrid event handlers
        this.setupBattlegridEvents();
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
        
        // Request initial state when connecting
        this.socket.on('connect', () => {
            this.socket.emit('request-initial-state', {
                adventureId: this.adventureId
            });
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
                const layerIndex = map.layers.findIndex(l => l.id === data.layer.id);
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
            this.currentFogTool = 'none'; // Also reset currentFogTool
            // Clear fog tool UI
            document.querySelectorAll('.fog-tool-group .tool-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            // Clear overlay fog buttons
            document.querySelectorAll('.fog-controls-overlay .fog-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        
        // Reset status text for non-selection box tools
        if (tool !== 'selection-box') {
            document.getElementById('statusText').textContent = 'Ready';
        }
        
        // Update cursor
        this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
        
        // Special handling for selection box tool
        if (tool === 'selection-box') {
            this.canvas.style.cursor = 'crosshair';
            document.getElementById('statusText').textContent = 'Selection Box Tool: Draw a rectangle to set player view';
        }
        
        // Sync fog tool state when select tool is chosen
        if (tool === 'select') {
            this.currentFogTool = 'select';
            this.updateFogButtonStates();
        }
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
        } else if (this.currentFogTool === 'fog-brush' || this.currentFogTool === 'reveal-brush') {
            console.log('Starting fog drawing with tool:', this.fogTool);
            
            // Ensure fog canvas is properly sized before drawing
            this.ensureFogCanvasSize();
            
            this.isFogDrawing = true;
            this.fogDrawPath = [{ x, y }];
            this.render();
        } else if (this.currentFogTool === 'fog-selection-box' || this.currentFogTool === 'reveal-selection-box') {
            console.log('Starting fog selection box drawing with tool:', this.currentFogTool);
            
            // Ensure fog canvas is properly sized before drawing
            this.ensureFogCanvasSize();
            
            this.isDrawing = true;
            this.tempShape = this.createFogSelectionBox(x, y);
            document.getElementById('statusText').textContent = 'Drawing fog selection box...';
        } else if (this.currentTool === 'select') {
            this.handleSelectMouseDown(x, y);
        } else if (this.currentTool === 'selection-box') {
            // Handle selection box drawing
            this.isDrawing = true;
            this.tempShape = this.createShape(this.currentTool, x, y);
            document.getElementById('statusText').textContent = 'Drawing selection box...';
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
        
        // Update cursor for resize handles
        if (this.currentTool === 'select' && this.selectedLayer) {
            const resizeHandle = this.getResizeHandle(x, y, this.selectedLayer);
            if (resizeHandle) {
                this.canvas.style.cursor = this.getResizeCursor(resizeHandle);
            } else if (this.isPointInShape(x, y, this.selectedLayer)) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'default';
            }
        }
        
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
        } else if (this.isResizing && this.selectedLayer && this.originalLayerData) {
            this.resizeSelectedLayer(x, y);
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
    
    handleKeyDown(e) {
        if (e.key === 'Escape') {
            // Cancel image placement mode
            if (this.currentTool === 'image' && this.pendingImageUrl) {
                this.pendingImageUrl = null;
                this.pendingImageName = null;
                this.setTool('select');
                this.canvas.style.cursor = 'default';
                document.getElementById('statusText').textContent = 'Ready';
            }
        }
        

    }
    
    handleSelectMouseDown(x, y) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        // First check if we're clicking on a resize handle of the selected layer
        if (this.selectedLayer) {
            const resizeHandle = this.getResizeHandle(x, y, this.selectedLayer);
            if (resizeHandle) {
                this.isResizing = true;
                this.resizeHandle = resizeHandle;
                this.originalLayerData = {
                    x: this.selectedLayer.x,
                    y: this.selectedLayer.y,
                    width: this.selectedLayer.width,
                    height: this.selectedLayer.height,
                    endX: this.selectedLayer.endX,
                    endY: this.selectedLayer.endY
                };
                return;
            }
        }
        
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
        const shapeNames = {
            'rectangle': 'Rectangle',
            'circle': 'Circle',
            'line': 'Line',
            'selection-box': 'Selection Box'
        };
        
        return {
            type,
            x,
            y,
            width: 0,
            height: 0,
            color: this.drawingColor,
            opacity: this.drawingOpacity,
            size: this.drawingSize,
            name: shapeNames[type] || type.charAt(0).toUpperCase() + type.slice(1)
        };
    }
    
    createFogSelectionBox(x, y) {
        return {
            type: this.currentFogTool,
            x,
            y,
            width: 0,
            height: 0,
            fogTool: this.currentFogTool
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
        
        // Handle selection box differently - update player view instead of creating layer
        if (this.tempShape.type === 'selection-box') {
            this.handleSelectionBoxFinalized();
            this.tempShape = null;
            this.render(); // Re-render to remove the selection box from the canvas
            return;
        }
        
        // Handle fog selection box - apply fog to the selected area
        if (this.tempShape.type === 'fog-selection-box' || this.tempShape.type === 'reveal-selection-box') {
            this.handleFogSelectionBoxFinalized();
            this.tempShape = null;
            this.render(); // Re-render to remove the selection box from the canvas
            return;
        }
        
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
        fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layerData)
        });
    }
    
    handleSelectionBoxFinalized() {
        if (!this.tempShape || !this.viewingMapId) return;
        
        // Get current map and background image for coordinate calculation
        const map = this.maps.get(this.viewingMapId);
        if (!map || !map.backgroundImage) {
            console.log('No map or background image for selection box');
            return;
        }
        
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (!bgImage || !bgImage.complete) {
            console.log('Background image not ready for selection box');
            return;
        }
        
        // Calculate the selection box bounds in image coordinates
        const selectionX = Math.min(this.tempShape.x, this.tempShape.x + this.tempShape.width);
        const selectionY = Math.min(this.tempShape.y, this.tempShape.y + this.tempShape.height);
        const selectionWidth = Math.abs(this.tempShape.width);
        const selectionHeight = Math.abs(this.tempShape.height);
        
        // Get the player viewport dimensions
        const playerViewportWidth = this.canvas.width;
        const playerViewportHeight = this.canvas.height;
        
        // Calculate zoom level to fit the selection box in the player viewport
        // while maintaining aspect ratio
        const zoomX = playerViewportWidth / selectionWidth;
        const zoomY = playerViewportHeight / selectionHeight;
        const fitZoom = Math.min(zoomX, zoomY);
        
        // Calculate the center of the selection box in image coordinates
        const selectionCenterX = selectionX + (selectionWidth / 2);
        const selectionCenterY = selectionY + (selectionHeight / 2);
        
        // Convert selection center to screen coordinates
        // The selection center should be positioned at the center of the player viewport
        const screenCenterX = playerViewportWidth / 2;
        const screenCenterY = playerViewportHeight / 2;
        const scaledSelectionCenterX = selectionCenterX * fitZoom;
        const scaledSelectionCenterY = selectionCenterY * fitZoom;
        
        const panX = screenCenterX - scaledSelectionCenterX;
        const panY = screenCenterY - scaledSelectionCenterY;
        
        console.log('=== SELECTION BOX FINALIZED ===');
        console.log('Selection box:', selectionX, selectionY, selectionWidth, 'x', selectionHeight);
        console.log('Player viewport:', playerViewportWidth, 'x', playerViewportHeight);
        console.log('Calculated fit zoom:', fitZoom);
        console.log('Selection center coordinates:', selectionCenterX, selectionCenterY);
        console.log('Screen center coordinates:', screenCenterX, screenCenterY);
        console.log('Scaled selection center coordinates:', scaledSelectionCenterX, scaledSelectionCenterY);
        console.log('Calculated pan coordinates:', panX, panY);
        
        // Update player view to match the selection box
        this.currentPlayerZoom = fitZoom;
        this.currentPlayerPanX = panX;
        this.currentPlayerPanY = panY;
        
        // Update status
        document.getElementById('statusText').textContent = 'Player view updated from selection box';
        
        // Update UI
        this.updatePlayerViewUI();
        
        // Save the player view state for the current map
        this.savePlayerViewState();
        
        // Emit player view update
        this.socket.emit('player-view-updated', {
            adventureId: this.adventureId,
            mapId: this.activeMapId,
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY },
            fontSize: this.currentPlayerNameFontSize
        });
        
        console.log('Player view updated from selection box:', {
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
        });
    }
    
    handleFogSelectionBoxFinalized() {
        if (!this.tempShape || !this.viewingMapId) return;
        
        console.log('=== FOG SELECTION BOX FINALIZED ===');
        console.log('Fog tool:', this.tempShape.fogTool);
        console.log('Selection box:', this.tempShape.x, this.tempShape.y, this.tempShape.width, 'x', this.tempShape.height);
        
        // Get current map
        const map = this.maps.get(this.viewingMapId);
        if (!map) {
            console.log('No map found for fog selection box');
            return;
        }
        
        // Ensure fog canvas is properly sized
        this.ensureFogCanvasSize();
        
        // Calculate the selection box bounds in image coordinates
        const selectionX = Math.min(this.tempShape.x, this.tempShape.x + this.tempShape.width);
        const selectionY = Math.min(this.tempShape.y, this.tempShape.y + this.tempShape.height);
        const selectionWidth = Math.abs(this.tempShape.width);
        const selectionHeight = Math.abs(this.tempShape.height);
        
        // Don't apply fog to areas that are too small
        if (selectionWidth < 5 || selectionHeight < 5) {
            console.log('Selection box too small, ignoring');
            return;
        }
        
        // Apply fog to the selected area
        if (this.tempShape.fogTool === 'fog-selection-box') {
            // Add fog (black) to the selected area
            this.fogCtx.fillStyle = 'black';
            this.fogCtx.fillRect(selectionX, selectionY, selectionWidth, selectionHeight);
            console.log('Added fog to selection box area');
        } else if (this.tempShape.fogTool === 'reveal-selection-box') {
            // Remove fog (clear) from the selected area
            this.fogCtx.globalCompositeOperation = 'destination-out';
            this.fogCtx.fillStyle = 'white';
            this.fogCtx.fillRect(selectionX, selectionY, selectionWidth, selectionHeight);
            this.fogCtx.globalCompositeOperation = 'source-over';
            console.log('Removed fog from selection box area');
        }
        
        // Update local map data immediately
        const currentMap = this.maps.get(this.viewingMapId);
        if (currentMap) {
            currentMap.fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Updated local map fogDataUrl after selection box fog');
            
            // Update fog cache directly from fog canvas to prevent flickering
            this.updateFogCacheFromCanvas();
        }
        
        // Re-render immediately
        this.render();
        
        // Save fog state
        this.saveFogState();
        
        // Update status
        const action = this.tempShape.fogTool === 'fog-selection-box' ? 'added' : 'removed';
        document.getElementById('statusText').textContent = `Fog ${action} from selection box area`;
        
        console.log('Fog selection box finalized:', {
            tool: this.tempShape.fogTool,
            area: { x: selectionX, y: selectionY, width: selectionWidth, height: selectionHeight }
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
        
        this.saveLayerChanges(this.selectedLayer);
    }
    
    resizeSelectedLayer(x, y) {
        if (!this.selectedLayer || !this.originalLayerData || !this.resizeHandle) return;
        
        const original = this.originalLayerData;
        
        switch (this.resizeHandle) {
            case 'bottom-right':
                this.selectedLayer.width = Math.max(10, x - original.x);
                this.selectedLayer.height = Math.max(10, y - original.y);
                break;
            case 'bottom-left':
                this.selectedLayer.x = x;
                this.selectedLayer.width = Math.max(10, original.x + original.width - x);
                this.selectedLayer.height = Math.max(10, y - original.y);
                break;
            case 'top-right':
                this.selectedLayer.y = y;
                this.selectedLayer.width = Math.max(10, x - original.x);
                this.selectedLayer.height = Math.max(10, original.y + original.height - y);
                break;
            case 'top-left':
                this.selectedLayer.x = x;
                this.selectedLayer.y = y;
                this.selectedLayer.width = Math.max(10, original.x + original.width - x);
                this.selectedLayer.height = Math.max(10, original.y + original.height - y);
                break;
        }
    }
    
    saveLayerChanges(layer) {
        if (!this.viewingMapId) return;
        
        fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/${layer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layer)
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
    
    getResizeHandle(x, y, shape) {
        if (!shape || (shape.type === 'line')) return null;
        
        const handleSize = 8;
        const tolerance = handleSize / 2;
        
        // Calculate corner positions
        const corners = {
            'bottom-right': { x: shape.x + shape.width, y: shape.y + shape.height },
            'bottom-left': { x: shape.x, y: shape.y + shape.height },
            'top-right': { x: shape.x + shape.width, y: shape.y },
            'top-left': { x: shape.x, y: shape.y }
        };
        
        // Check if point is near any corner
        for (const [handle, pos] of Object.entries(corners)) {
            const dx = x - pos.x;
            const dy = y - pos.y;
            if (dx * dx + dy * dy <= tolerance * tolerance) {
                return handle;
            }
        }
        
        return null;
    }
    
    getResizeCursor(handle) {
        switch (handle) {
            case 'bottom-right':
            case 'top-left':
                return 'nw-resize';
            case 'bottom-left':
            case 'top-right':
                return 'ne-resize';
            default:
                return 'default';
        }
    }
    
    drawResizeHandles(layer) {
        const handleSize = 6;
        const halfHandle = handleSize / 2;
        
        // Save context state
        this.ctx.save();
        
        // Set handle style
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]); // Solid line for handles
        
        // Draw corner handles
        const corners = [
            { x: layer.x, y: layer.y }, // top-left
            { x: layer.x + layer.width, y: layer.y }, // top-right
            { x: layer.x, y: layer.y + layer.height }, // bottom-left
            { x: layer.x + layer.width, y: layer.y + layer.height } // bottom-right
        ];
        
        corners.forEach(corner => {
            this.ctx.beginPath();
            this.ctx.rect(corner.x - halfHandle, corner.y - halfHandle, handleSize, handleSize);
            this.ctx.fill();
            this.ctx.stroke();
        });
        
        // Restore context state
        this.ctx.restore();
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

            // Draw measurements for layers that have showMeasurements enabled
            map.layers.forEach(layer => {
                if (layer.visible !== false && layer.showMeasurements) {
                    this.drawLayerMeasurements(layer);
                }
            });
            
            // Draw fog of war (within the same transformation context)
            this.drawFogOfWar(map);
            
            // Draw battlegrid (within the same transformation context)
            this.drawBattlegrid(map);
            
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
        // Draw the image normally
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
            case 'selection-box':
                // Draw selection box with dashed border and semi-transparent fill
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([10, 5]);
                this.ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.setLineDash([]); // Reset line dash
                break;
            case 'fog-selection-box':
                // Draw fog selection box with red dashed border and semi-transparent red fill
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([10, 5]);
                this.ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.setLineDash([]); // Reset line dash
                break;
            case 'reveal-selection-box':
                // Draw reveal selection box with green dashed border and semi-transparent green fill
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([10, 5]);
                this.ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                this.ctx.setLineDash([]); // Reset line dash
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
            
            // Draw resize handles for non-line shapes
            if (layer.type !== 'line') {
                this.drawResizeHandles(layer);
            }
        }
        
        this.ctx.restore();
    }

    drawLayerMeasurements(layer) {
        this.ctx.save();
        
        // Set text properties for measurements
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        let measurementText = '';
        let textX = 0;
        let textY = 0;
        
        switch (layer.type) {
            case 'line':
                // Calculate line length
                const dx = layer.endX - layer.x;
                const dy = layer.endY - layer.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const lengthInMeters = this.convertPixelsToMeters(length);
                const lengthInFields = lengthInMeters / 1.5;
                measurementText = `l: ${lengthInMeters.toFixed(1)}m / f: ${lengthInFields.toFixed(1)}`;
                
                // Position text at the middle of the line
                textX = (layer.x + layer.endX) / 2;
                textY = (layer.y + layer.endY) / 2;
                break;
                
            case 'circle':
                // Calculate radius
                const radius = layer.width / 2;
                const radiusInMeters = this.convertPixelsToMeters(radius);
                const diameterInMeters = radiusInMeters * 2;
                measurementText = `r: ${radiusInMeters.toFixed(1)}m / d: ${diameterInMeters.toFixed(1)}m`;
                
                // Position text at the center of the circle
                textX = layer.x;
                textY = layer.y;
                break;
                
            case 'rectangle':
            case 'image':
                // Calculate width and height
                const widthInMeters = this.convertPixelsToMeters(layer.width);
                const heightInMeters = this.convertPixelsToMeters(layer.height);
                measurementText = `${widthInMeters.toFixed(1)}m × ${heightInMeters.toFixed(1)}m`;
                
                // Position text at the center of the rectangle/image
                textX = layer.x + layer.width / 2;
                textY = layer.y + layer.height / 2;
                break;
        }
        
        if (measurementText) {
            // Draw text with outline for better visibility
            this.ctx.strokeText(measurementText, textX, textY);
            this.ctx.fillText(measurementText, textX, textY);
        }
        
        this.ctx.restore();
    }

    convertPixelsToMeters(pixels) {
        // If no grid is active, return pixels
        if (this.battlegridType === 'none') {
            return pixels;
        }
        
        // Convert pixels to grid units, then to meters
        const gridUnits = pixels / this.battlegridSize;
        return gridUnits * this.battlegridScaleFactor;
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
    
    drawBattlegrid(map) {
        if (this.battlegridType === 'none') {
            return;
        }
        
        // Get background image dimensions for grid coverage
        const bgImage = this.backgroundImages.get(map.backgroundImage);
        if (!bgImage || !bgImage.complete) {
            return;
        }
        
        const imageWidth = bgImage.width;
        const imageHeight = bgImage.height;
        
        // Save canvas state
        this.ctx.save();
        
        // Set grid properties
        this.ctx.strokeStyle = this.battlegridColor;
        this.ctx.lineWidth = this.battlegridLineWidth;
        this.ctx.globalAlpha = this.battlegridOpacity;
        
        if (this.battlegridType === 'grid') {
            this.drawGrid(imageWidth, imageHeight);
        } else if (this.battlegridType === 'hex') {
            this.drawHexGrid(imageWidth, imageHeight);
        }
        
        // Restore canvas state
        this.ctx.restore();
    }
    
    drawGrid(imageWidth, imageHeight) {
        const gridSize = this.battlegridSize;
        const offsetX = this.battlegridOffsetX;
        const offsetY = this.battlegridOffsetY;
        
        // Draw vertical lines
        for (let x = offsetX; x <= imageWidth + offsetX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, imageHeight);
            this.ctx.stroke();
        }
        
        // Draw horizontal lines
        for (let y = offsetY; y <= imageHeight + offsetY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(imageWidth, y);
            this.ctx.stroke();
        }
    }
    
    drawHexGrid(imageWidth, imageHeight) {
        const hexSize = this.battlegridSize;
        const offsetX = this.battlegridOffsetX;
        const offsetY = this.battlegridOffsetY;
        
        // Calculate hex dimensions
        const hexWidth = hexSize * 2;
        const hexHeight = hexSize * Math.sqrt(3);
        const hexRadius = hexSize;
        
        // Calculate grid dimensions
        const cols = Math.ceil(imageWidth / (hexWidth * 0.75)) + 2;
        const rows = Math.ceil(imageHeight / hexHeight) + 2;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = offsetX + col * hexWidth * 0.75;
                const y = offsetY + row * hexHeight + (col % 2) * hexHeight * 0.5;
                
                this.drawHexagon(x, y, hexRadius);
            }
        }
    }
    
    drawHexagon(centerX, centerY, radius) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.stroke();
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
        this.ctx.strokeStyle = this.currentFogTool === 'fog-brush' ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 255, 0, 0.7)';
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
        const modal = document.getElementById('newMapModal');
        modal.style.display = 'block';
        
        // Reset map vault specific fields
        document.getElementById('mapSearch').value = '';
        document.getElementById('mapName').value = '';
        document.getElementById('mapDescription').value = '';
        document.getElementById('mapBackground').value = '';
        document.getElementById('saveMapPermanent').checked = false;
        // Reset radio button selections to defaults
        document.querySelector('input[name="imageScaling"][value="none"]').checked = true;
        document.querySelector('input[name="imageRotation"][value="0"]').checked = true;
        document.getElementById('mapSearchResults').innerHTML = '';
        this.selectedMapFromSearch = null;
    }
    
    createNewMap() {
        const name = document.getElementById('mapName').value || 'New Battlemap';
        const description = document.getElementById('mapDescription').value || '';
        const backgroundFile = document.getElementById('mapBackground').files[0];
        const savePermanent = document.getElementById('saveMapPermanent').checked;
        const scalingOption = document.querySelector('input[name="imageScaling"]:checked').value;
        const rotationOption = parseInt(document.querySelector('input[name="imageRotation"]:checked').value);
        
        // If a map is selected from search, use it
        if (this.selectedMapFromSearch) {
            this.createMapWithBackground(this.selectedMapFromSearch.name, this.selectedMapFromSearch.imageUrl);
            return;
        }
        
        // Otherwise, handle file upload
        if (backgroundFile) {
            let processedFile = backgroundFile;
            
            // First apply rotation if needed
            if (rotationOption !== 0) {
                this.rotateImage(processedFile, rotationOption).then(rotatedFile => {
                    processedFile = rotatedFile;
                    
                    // Then apply scaling if needed
                    if (scalingOption === 'none') {
                        // Upload without scaling
                        this.uploadMapImage(processedFile, name, description, savePermanent).then(data => {
                            this.createMapWithBackground(name, data.imageUrl);
                        });
                    } else {
                        // Scale the image before uploading
                        this.scaleImage(processedFile, scalingOption).then(scaledFile => {
                            this.uploadMapImage(scaledFile, name, description, savePermanent).then(data => {
                                this.createMapWithBackground(name, data.imageUrl);
                            });
                        }).catch(error => {
                            console.error('Image scaling error:', error);
                            alert('Failed to scale image: ' + error.message);
                        });
                    }
                }).catch(error => {
                    console.error('Image rotation error:', error);
                    alert('Failed to rotate image: ' + error.message);
                });
            } else {
                // No rotation needed, just handle scaling
                if (scalingOption === 'none') {
                    // Upload without scaling
                    this.uploadMapImage(processedFile, name, description, savePermanent).then(data => {
                        this.createMapWithBackground(name, data.imageUrl);
                    });
                } else {
                    // Scale the image before uploading
                    this.scaleImage(processedFile, scalingOption).then(scaledFile => {
                        this.uploadMapImage(scaledFile, name, description, savePermanent).then(data => {
                            this.createMapWithBackground(name, data.imageUrl);
                        });
                    }).catch(error => {
                        console.error('Image scaling error:', error);
                        alert('Failed to scale image: ' + error.message);
                    });
                }
            }
        } else {
            this.createMapWithBackground(name, '');
        }
    }
    
    createMapWithBackground(name, backgroundImage) {
        console.log('Creating map with background:', { name, backgroundImage });
        
        fetch(`/api/adventures/${this.adventureId}/maps`, {
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
            this.closeModals();
            this.loadMaps();
        }).catch(error => {
            console.error('Map creation error:', error);
        });
    }
    
    uploadBackgroundImage(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);
            
            fetch('/upload', {
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
    
    uploadMapImage(file, mapName, description, savePermanent) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);
            
            if (mapName && savePermanent) {
                formData.append('name', mapName);
                formData.append('description', description);
                formData.append('savePermanent', 'true');
                
                // Use the map vault endpoint
                fetch('/api/maps', {
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
                        resolve(data);
                    } else {
                        reject(new Error(data.error));
                    }
                }).catch(error => {
                    reject(error);
                });
            } else {
                // Use the regular upload endpoint
                fetch('/upload', {
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
                        resolve(data);
                    } else {
                        reject(new Error(data.error));
                    }
                }).catch(error => {
                    reject(error);
                });
            }
        });
    }
    
    scaleImage(file, scalingOption) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                
                console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);
                
                // Define target dimensions based on scaling option
                let targetWidth, targetHeight;
                if (scalingOption === 'fullhd') {
                    targetWidth = 1920;
                    targetHeight = 1080;
                } else if (scalingOption === '4k') {
                    targetWidth = 4096;
                    targetHeight = 2160;
                } else {
                    reject(new Error('Invalid scaling option'));
                    return;
                }
                
                // Calculate scaling to fit within target dimensions while maintaining aspect ratio
                const scaleX = targetWidth / originalWidth;
                const scaleY = targetHeight / originalHeight;
                const scale = Math.min(scaleX, scaleY); // Use the smaller scale to fit within bounds
                
                // Calculate new dimensions
                const newWidth = Math.round(originalWidth * scale);
                const newHeight = Math.round(originalHeight * scale);
                
                console.log(`Scaling image to: ${newWidth}x${newHeight} (scale: ${scale.toFixed(3)}) for ${scalingOption.toUpperCase()}`);
                
                // Set canvas size to the scaled dimensions
                canvas.width = newWidth;
                canvas.height = newHeight;
                
                // Draw the scaled image
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                
                // Convert canvas to blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // Create a new File object with the scaled image
                        const scaledFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        console.log(`Successfully created scaled image: ${scaledFile.name} (${blob.size} bytes)`);
                        resolve(scaledFile);
                    } else {
                        reject(new Error('Failed to create scaled image'));
                    }
                }, file.type, 0.9); // Use 0.9 quality for good balance
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image for scaling'));
            };
            
            // Load the image from the file
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.onerror = () => {
                reject(new Error('Failed to read image file'));
            };
            reader.readAsDataURL(file);
        });
    }
    
    rotateImage(file, rotationDegrees) {
        return new Promise((resolve, reject) => {
            if (rotationDegrees === 0) {
                // No rotation needed, return original file
                resolve(file);
                return;
            }
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                
                console.log(`Original image dimensions: ${originalWidth}x${originalHeight}, rotating by ${rotationDegrees}°`);
                
                // Calculate new dimensions after rotation
                let newWidth, newHeight;
                if (rotationDegrees === 90 || rotationDegrees === 270) {
                    newWidth = originalHeight;
                    newHeight = originalWidth;
                } else {
                    newWidth = originalWidth;
                    newHeight = originalHeight;
                }
                
                // Set canvas size to accommodate the rotated image
                canvas.width = newWidth;
                canvas.height = newHeight;
                
                // Move to center of canvas
                ctx.translate(newWidth / 2, newHeight / 2);
                
                // Rotate by the specified degrees
                ctx.rotate((rotationDegrees * Math.PI) / 180);
                
                // Draw the image centered
                ctx.drawImage(img, -originalWidth / 2, -originalHeight / 2, originalWidth, originalHeight);
                
                // Convert canvas to blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // Create a new File object with the rotated image
                        const rotatedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        console.log(`Successfully created rotated image: ${rotatedFile.name} (${blob.size} bytes)`);
                        resolve(rotatedFile);
                    } else {
                        reject(new Error('Failed to create rotated image'));
                    }
                }, file.type, 0.9); // Use 0.9 quality for good balance
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image for rotation'));
            };
            
            // Load the image from the file
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.onerror = () => {
                reject(new Error('Failed to read image file'));
            };
            reader.readAsDataURL(file);
        });
    }
    
    selectMapFromSearch(map) {
        this.selectedMapFromSearch = map;
        
        // Update UI to show selection
        const results = document.querySelectorAll('.map-result-item');
        results.forEach(item => item.classList.remove('selected'));
        
        // Find and select the clicked item
        const selectedItem = Array.from(results).find(item => 
            item.dataset.mapId === map.id
        );
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        // Update form fields
        document.getElementById('mapName').value = map.name;
        document.getElementById('mapDescription').value = map.description || '';
    }
    
    searchMaps(query) {
        if (!query || query.trim() === '') {
            document.getElementById('mapSearchResults').innerHTML = '';
            return;
        }
        
        fetch(`/api/maps/search?q=${encodeURIComponent(query.trim())}`)
            .then(response => response.json())
            .then(maps => {
                this.displayMapSearchResults(maps);
            })
            .catch(error => {
                console.error('Error searching maps:', error);
            });
    }
    
    displayMapSearchResults(maps) {
        const resultsContainer = document.getElementById('mapSearchResults');
        resultsContainer.innerHTML = '';
        
        if (maps.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No maps found</div>';
            return;
        }
        
        maps.forEach(map => {
            const resultItem = document.createElement('div');
            resultItem.className = 'map-result-item';
            resultItem.dataset.mapId = map.id;
            
            resultItem.innerHTML = `
                <img src="${map.imageUrl}" alt="${map.name}" class="map-result-preview">
                <div class="map-result-info">
                    <div class="map-result-name">${map.name}</div>
                    <div class="map-result-meta">
                        ${map.description ? map.description : 'No description'}
                    </div>
                </div>
            `;
            
            resultItem.addEventListener('click', () => {
                this.selectMapFromSearch(map);
            });
            
            resultsContainer.appendChild(resultItem);
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
        fetch(`/api/adventures/${this.adventureId}/maps`)
        .then(response => response.json())
        .then(maps => {
            this.maps.clear();
            Object.values(maps).forEach(map => this.maps.set(map.id, map));
            
            // Set the first map as active and viewing if no maps are currently set
            if (this.maps.size > 0) {
                const firstMapId = Array.from(this.maps.keys())[0];
                if (!this.activeMapId || !this.maps.has(this.activeMapId)) {
                    this.activeMapId = firstMapId;
                }
                if (!this.viewingMapId || !this.maps.has(this.viewingMapId)) {
                    this.viewingMapId = firstMapId;
                }
            } else {
                this.activeMapId = null;
                this.viewingMapId = null;
            }
            
            this.updateMapTabs();
            this.render();
            
            // Load player view state
            this.loadPlayerViewState();
            
            // Load battlegrid state
            this.loadBattlegridState();
            
            // Update pan slider ranges after maps are loaded
            setTimeout(() => this.updatePanSliderRanges(), 100);
        })
        .catch(error => {
            console.error('Error loading maps:', error);
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
                    <button onclick="battlemapDM.exportMap('${map.id}')" title="Export">
                        <i class="fas fa-upload"></i>
                    </button>

                    <button onclick="battlemapDM.renameMap('${map.id}')" title="Rename">
                        <i class="fas fa-edit"></i>
                    </button>
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
        
        // Load player view state for the active map (not the viewing map)
        this.loadPlayerViewState();
        
        // Load battlegrid state for the new map
        this.loadBattlegridState();
        
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
            // Start with no fog for new maps
            console.log('New map detected, starting with no fog');
            // Don't apply any fog - let the DM decide when to add fog
        }
    }
    
    setActiveMap(mapId) {
        console.log('setActiveMap called with:', mapId);
        
        // Save current player view state for the new active map
        const newActiveMap = this.maps.get(mapId);
        if (newActiveMap) {
            // Initialize playerViewState if it doesn't exist
            if (!newActiveMap.playerViewState) {
                newActiveMap.playerViewState = {};
            }
            
            // Save current player view state to the new active map
            newActiveMap.playerViewState.zoom = this.currentPlayerZoom;
            newActiveMap.playerViewState.panX = this.currentPlayerPanX;
            newActiveMap.playerViewState.panY = this.currentPlayerPanY;
            newActiveMap.playerViewState.fontSize = this.currentPlayerNameFontSize;
            
            console.log('Saved player view state for new active map:', mapId, {
                zoom: this.currentPlayerZoom,
                panX: this.currentPlayerPanX,
                panY: this.currentPlayerPanY,
                fontSize: this.currentPlayerNameFontSize
            });
            
            // Save the adventure data
            this.saveAdventure();
        }
        
        // Update local state immediately
        this.activeMapId = mapId;
        console.log('Updated activeMapId to:', this.activeMapId);
        
        this.updateMapTabs();
        
        // Notify all clients about the active map change
        this.socket.emit('active-map-changed', {
            adventureId: this.adventureId,
            activeMapId: mapId
        });
        
        console.log('Active map set to:', mapId);
    }
    
    deleteMap(mapId) {
        if (confirm('Are you sure you want to delete this map?')) {
            fetch(`/api/adventures/${this.adventureId}/maps/${mapId}`, {
                method: 'DELETE'
            }).then(() => {
                this.loadMaps();
            }).catch(error => {
                console.error('Error deleting map:', error);
            });
        }
    }
    
    renameMap(mapId) {
        const map = this.maps.get(mapId);
        if (!map) return;
        
        const newName = prompt('Enter new name for this map:', map.name);
        
        if (newName !== null && newName.trim() !== '') {
            map.name = newName.trim();
            
            // Update the map on the server
            fetch(`/api/adventures/${this.adventureId}/maps/${mapId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(map)
            }).then(response => {
                if (response.ok) {
                    this.updateMapTabs();
                } else {
                    console.error('Failed to rename map');
                }
            }).catch(error => {
                console.error('Error renaming map:', error);
            });
        }
    }
    
    exportMap(mapId) {
        const map = this.maps.get(mapId);
        if (!map) return;
        
        // Create export data
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            map: {
                name: map.name,
                backgroundImage: map.backgroundImage,
                fogDataUrl: map.fogDataUrl,
                layers: map.layers
            }
        };
        
        // Convert to JSON and create download
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Create download link
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${map.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('Map exported:', map.name);
    }
    

    
    importMap() {
        // Create file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importData = JSON.parse(event.target.result);
                    
                    // Validate import data
                    if (!importData.map || !importData.map.name) {
                        alert('Invalid map export file');
                        return;
                    }
                    
                    // Check if map name already exists
                    const existingMap = Array.from(this.maps.values()).find(m => m.name === importData.map.name);
                    if (existingMap) {
                        const newName = prompt('A map with this name already exists. Enter a new name:', importData.map.name + '_imported');
                        if (!newName || newName.trim() === '') return;
                        importData.map.name = newName.trim();
                    }
                    
                    // Create new map with imported data
                    const newMapId = uuidv4();
                    const newMap = {
                        id: newMapId,
                        name: importData.map.name,
                        backgroundImage: importData.map.backgroundImage,
                        fogDataUrl: importData.map.fogDataUrl,
                        layers: importData.map.layers || []
                    };
                    
                    // Add map to local state
                    this.maps.set(newMapId, newMap);
                    
                    // Save to server
                    fetch(`/api/adventures/${this.adventureId}/maps`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(newMap)
                    }).then(response => {
                        if (response.ok) {
                            this.updateMapTabs();
                            this.setViewingMap(newMapId);
                            console.log('Map imported successfully:', newMap.name);
                        } else {
                            console.error('Failed to import map');
                            alert('Failed to import map');
                        }
                    }).catch(error => {
                        console.error('Error importing map:', error);
                        alert('Error importing map');
                    });
                    
                } catch (error) {
                    console.error('Error parsing import file:', error);
                    alert('Invalid import file format');
                }
            };
            
            reader.readAsText(file);
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }
    
    updateLayerList() {
        const container = document.getElementById('layerList');
        if (!container) {
            console.error('layerList container not found');
            return;
        }
        container.innerHTML = '';
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) {
            return;
        }
        
        map.layers.forEach((layer, index) => {
            if (!layer || !layer.id) {
                console.error('Invalid layer at index', index, ':', layer);
                return; // Skip this layer
            }
            const item = document.createElement('div');
            item.className = `layer-item ${layer === this.selectedLayer ? 'selected' : ''}`;
            item.draggable = true;
            item.dataset.layerId = layer.id;
            item.dataset.layerIndex = index;
            
            item.innerHTML = `
                <div class="layer-drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="layer-info">
                    <button class="layer-visibility" onclick="battlemapDM.toggleLayerVisibility('${layer.id}')">
                        <i class="fas fa-${layer.visible !== false ? 'eye' : 'eye-slash'}"></i>
                    </button>
                    <button class="layer-measurements" onclick="battlemapDM.toggleLayerMeasurements('${layer.id}')" title="Toggle Measurements">
                        <i class="fas fa-${layer.showMeasurements ? 'ruler' : 'ruler-combined'}"></i>
                    </button>
                    <span>${layer.name || layer.type}</span>
                </div>
                <div class="layer-actions">
                    <button onclick="battlemapDM.renameLayer('${layer.id}')" title="Rename">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="battlemapDM.selectLayer('${layer.id}')" title="Select">
                        <i class="fas fa-mouse-pointer"></i>
                    </button>
                    <button onclick="battlemapDM.deleteLayer('${layer.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Add drag event listeners
            item.addEventListener('dragstart', (e) => this.handleLayerDragStart(e, layer, index));
            item.addEventListener('dragover', (e) => this.handleLayerDragOver(e));
            item.addEventListener('drop', (e) => this.handleLayerDrop(e, index));
            item.addEventListener('dragenter', (e) => this.handleLayerDragEnter(e));
            item.addEventListener('dragleave', (e) => this.handleLayerDragLeave(e));
            
            container.appendChild(item);
        });
    }
    
    handleLayerDragStart(e, layer, index) {
        this.isReorderingLayers = true;
        this.draggedLayerItem = { layer, index };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.outerHTML);
        
        // Add dragging class to the dragged item
        e.target.classList.add('dragging');
        
        // Create placeholder
        this.createDragPlaceholder();
    }
    
    handleLayerDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
    
    handleLayerDragEnter(e) {
        e.preventDefault();
        const targetItem = e.target.closest('.layer-item');
        if (targetItem && targetItem !== this.draggedLayerItem?.layer) {
            targetItem.classList.add('drag-over');
        }
    }
    
    handleLayerDragLeave(e) {
        const targetItem = e.target.closest('.layer-item');
        if (targetItem) {
            targetItem.classList.remove('drag-over');
        }
    }
    
    handleLayerDrop(e, dropIndex) {
        e.preventDefault();
        
        if (!this.isReorderingLayers || !this.draggedLayerItem) return;
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const draggedIndex = this.draggedLayerItem.index;
        const draggedLayer = this.draggedLayerItem.layer;
        
        // Remove the dragged layer from its current position
        map.layers.splice(draggedIndex, 1);
        
        // Insert it at the new position
        if (draggedIndex < dropIndex) {
            // If moving down, adjust the drop index
            map.layers.splice(dropIndex - 1, 0, draggedLayer);
        } else {
            // If moving up, use the original drop index
            map.layers.splice(dropIndex, 0, draggedLayer);
        }
        
        // Clean up
        this.cleanupLayerDrag();
        
        // Update the UI
        this.updateLayerList();
        this.render();
        
        // Save the new order to the server
        this.saveLayerOrder();
    }
    
    createDragPlaceholder() {
        const container = document.getElementById('layerList');
        this.dragPlaceholder = document.createElement('div');
        this.dragPlaceholder.className = 'layer-item drag-placeholder';
        this.dragPlaceholder.innerHTML = '<div class="placeholder-content">Drop here</div>';
        container.appendChild(this.dragPlaceholder);
    }
    
    cleanupLayerDrag() {
        // Remove dragging classes
        document.querySelectorAll('.layer-item.dragging').forEach(item => {
            item.classList.remove('dragging');
        });
        document.querySelectorAll('.layer-item.drag-over').forEach(item => {
            item.classList.remove('drag-over');
        });
        
        // Remove placeholder
        if (this.dragPlaceholder) {
            this.dragPlaceholder.remove();
            this.dragPlaceholder = null;
        }
        
        // Reset state
        this.isReorderingLayers = false;
        this.draggedLayerItem = null;
    }
    
    saveLayerOrder() {
        const map = this.maps.get(this.viewingMapId);
        if (!map) {
            console.error('No map found for viewingMapId:', this.viewingMapId);
            return;
        }
        
        console.log('Saving layer order for adventure:', this.adventureId, 'map:', this.viewingMapId);
        console.log('Layer IDs to save:', map.layers.map(l => l.id));
        
        // Send the new layer order to the server
        fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layerIds: map.layers.map(l => l.id) })
        }).then(response => {
            if (response.ok) {
                console.log('Layer order saved successfully');
            } else {
                console.error('Failed to save layer order, status:', response.status);
                return response.text().then(text => {
                    console.error('Response text:', text);
                });
            }
        }).catch(error => {
            console.error('Error saving layer order:', error);
        });
    }
    
    toggleLayerVisibility(layerId) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const layer = map.layers.find(l => l.id === layerId);
        if (layer) {
            layer.visible = layer.visible === false ? true : false;
            // Update the UI immediately
            this.updateLayerList();
            this.render();
            
            fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/${layerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(layer)
            });
        }
    }

    toggleLayerMeasurements(layerId) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const layer = map.layers.find(l => l.id === layerId);
        if (layer) {
            layer.showMeasurements = !layer.showMeasurements;
            // Update the UI immediately
            this.updateLayerList();
            this.render();
            
            fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/${layerId}`, {
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
            fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/${layerId}`, {
                method: 'DELETE'
            });
        }
    }
    
    renameLayer(layerId) {
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        const layer = map.layers.find(l => l.id === layerId);
        if (!layer) return;
        
        const currentName = layer.name || layer.type;
        const newName = prompt('Enter new name for this layer:', currentName);
        
        if (newName !== null && newName.trim() !== '') {
            layer.name = newName.trim();
            
            // Update the layer on the server
            fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}/layers/${layerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(layer)
            }).then(response => {
                if (response.ok) {
                    this.updateLayerList();
                    this.render();
                } else {
                    console.error('Failed to rename layer');
                }
            });
        }
    }
    
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
            
            // If closing spell search modal, hide spell from player and sticky buttons
            if (modal.id === 'spellSearchModal') {
                this.hideSpellFromPlayer();
                document.getElementById('stickySpellBtn').style.display = 'none';
            }
            
            // If closing monster search modal, hide sticky button
            if (modal.id === 'monsterSearchModal') {
                document.getElementById('stickyMonsterBtn').style.display = 'none';
            }
        });
    }
    
    // Players Management Methods
    addPlayer() {
        const playerNameInput = document.getElementById('playerName');
        const playerOrientationInput = document.getElementById('playerOrientation');
        const playerInitiativeInput = document.getElementById('playerInitiative');
        
        const name = playerNameInput.value.trim();
        const orientation = parseInt(playerOrientationInput.value);
        const initiative = parseInt(playerInitiativeInput.value) || 0;
        
        if (!name) {
            alert('Please enter a player name');
            return;
        }
        
        // Check if player name already exists
        for (const player of this.players.values()) {
            if (player.name.toLowerCase() === name.toLowerCase()) {
                alert('A player with this name already exists');
                return;
            }
        }
        
        const playerId = uuidv4();
        const playerData = {
            id: playerId,
            name: name,
            orientation: orientation,
            initiative: initiative
        };
        
        this.players.set(playerId, playerData);
        this.updatePlayersList();
        
        // Clear the form
        playerNameInput.value = '';
        playerOrientationInput.value = 0;
        playerInitiativeInput.value = '';
        document.getElementById('playerOrientationValue').textContent = '0°';
        
        // Save players to server
        this.savePlayers();
    }
    
    deletePlayer(playerId) {
        if (confirm('Are you sure you want to delete this player?')) {
            this.players.delete(playerId);
            this.updatePlayersList();
            this.savePlayers();
        }
    }
    
    updatePlayersList() {
        const container = document.getElementById('playersList');
        container.innerHTML = '';
        
        // Sort players by initiative (descending)
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.initiative - a.initiative);
        
        // Find the next player (the one after the current active player)
        let nextPlayerId = null;
        if (this.currentActivePlayerId && sortedPlayers.length > 1) {
            const currentIndex = sortedPlayers.findIndex(p => p.id === this.currentActivePlayerId);
            if (currentIndex !== -1) {
                const nextIndex = (currentIndex + 1) % sortedPlayers.length;
                nextPlayerId = sortedPlayers[nextIndex].id;
            }
        }
        
        sortedPlayers.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-item';
            
            // Add active class if this is the current active player
            if (player.id === this.currentActivePlayerId) {
                item.classList.add('active');
            }
            // Add next class if this is the next player
            else if (player.id === nextPlayerId) {
                item.classList.add('next');
            }
            
            item.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-orientation">${player.orientation}°</span>
                    <input type="number" 
                           class="player-initiative" 
                           value="${player.initiative}" 
                           min="0" 
                           max="99" 
                           onchange="battlemapDM.updatePlayerInitiative('${player.id}', this.value)"
                           title="Initiative">
                </div>
                <div class="player-actions">
                    <button onclick="battlemapDM.editPlayer('${player.id}')" title="Edit Player" class="edit-btn">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="battlemapDM.deletePlayer('${player.id}')" title="Delete Player" class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    editPlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;
        
        // Create a simple prompt for editing orientation
        const newOrientation = prompt(`Edit orientation for ${player.name} (0-360 degrees):`, player.orientation);
        
        if (newOrientation !== null) {
            const orientation = parseInt(newOrientation);
            if (isNaN(orientation) || orientation < 0 || orientation > 360) {
                alert('Please enter a valid orientation between 0 and 360 degrees');
                return;
            }
            
            // Update the player's orientation
            player.orientation = orientation;
            this.players.set(playerId, player);
            this.updatePlayersList();
            this.savePlayers();
        }
    }

    updatePlayerInitiative(playerId, newInitiative) {
        const player = this.players.get(playerId);
        if (!player) return;
        
        const initiative = parseInt(newInitiative) || 0;
        if (initiative < 0 || initiative > 99) {
            alert('Please enter a valid initiative between 0 and 99');
            return;
        }
        
        player.initiative = initiative;
        this.players.set(playerId, player);
        this.updatePlayersList();
        this.savePlayers();
    }

    nextInitiative() {
        if (this.players.size === 0) {
            alert('No players to cycle through');
            return;
        }
        
        // Get all players sorted by initiative (descending)
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.initiative - a.initiative);
        
        if (this.currentActivePlayerId === null) {
            // Start with the first player (highest initiative)
            this.currentActivePlayerId = sortedPlayers[0].id;
        } else {
            // Find current player index
            const currentIndex = sortedPlayers.findIndex(p => p.id === this.currentActivePlayerId);
            if (currentIndex === -1) {
                // Current player not found, start with first
                this.currentActivePlayerId = sortedPlayers[0].id;
            } else {
                // Move to next player (or back to first if at end)
                const nextIndex = (currentIndex + 1) % sortedPlayers.length;
                this.currentActivePlayerId = sortedPlayers[nextIndex].id;
            }
        }
        
        this.updatePlayersList();
        this.savePlayers();
    }
    
    endCombat() {
        // Zero all initiative values
        this.players.forEach(player => {
            player.initiative = 0;
        });
        
        // Remove active and next player states
        this.currentActivePlayerId = null;
        
        // Update the display
        this.updatePlayersList();
        this.savePlayers();
        
        console.log('Combat ended - all initiative reset to 0');
    }
    
    savePlayers() {
        // For now, save to localStorage. In a future iteration, this could be saved to the server
        const playersData = Array.from(this.players.values());
        const playersState = {
            players: playersData,
            currentActivePlayerId: this.currentActivePlayerId
        };
        localStorage.setItem(`adventure_${this.adventureId}_players`, JSON.stringify(playersState));
        
        // Emit players update to all connected clients
        this.socket.emit('players-updated', {
            adventureId: this.adventureId,
            players: playersData,
            currentActivePlayerId: this.currentActivePlayerId
        });
    }
    
    loadPlayers() {
        // Load players from localStorage
        const playersData = localStorage.getItem(`adventure_${this.adventureId}_players`);
        if (playersData) {
            try {
                const playersState = JSON.parse(playersData);
                
                // Handle both old format (array) and new format (object with players and currentActivePlayerId)
                let players, currentActivePlayerId;
                if (Array.isArray(playersState)) {
                    // Old format - just an array of players
                    players = playersState;
                    currentActivePlayerId = null;
                } else {
                    // New format - object with players and currentActivePlayerId
                    players = playersState.players || [];
                    currentActivePlayerId = playersState.currentActivePlayerId || null;
                }
                
                this.players.clear();
                players.forEach(player => {
                    // Ensure initiative exists (for backward compatibility)
                    if (player.initiative === undefined) {
                        player.initiative = 0;
                    }
                    this.players.set(player.id, player);
                });
                this.currentActivePlayerId = currentActivePlayerId;
                this.updatePlayersList();
            } catch (error) {
                console.error('Error loading players:', error);
            }
        }
    }
    
    // Image Upload Modal
    showImageUploadModal() {
        document.getElementById('imageUploadModal').style.display = 'block';
        // Reset the form
        document.getElementById('tokenImage').value = '';
        document.getElementById('tokenName').value = '';
        document.getElementById('savePermanent').checked = false;
        document.getElementById('tokenSearch').value = '';
        document.getElementById('tokenSearchResults').innerHTML = '';
        this.selectedTokenFromSearch = null;
    }
    
    uploadTokenImage() {
        const imageFile = document.getElementById('tokenImage').files[0];
        const tokenName = document.getElementById('tokenName').value || 'Token';
        const savePermanent = document.getElementById('savePermanent').checked;
        
        if (!imageFile) {
            alert('Please select an image file');
            return;
        }
        
        this.uploadImageFile(imageFile, tokenName, savePermanent).then(data => {
            this.closeModals();
            // Set the image tool as active and store the image URL for placement
            this.setTool('image');
            this.pendingImageUrl = data.imageUrl;
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
    
    selectTokenFromSearch(token) {
        this.selectedTokenFromSearch = token;
        this.closeModals();
        // Set the image tool as active and store the image URL for placement
        this.setTool('image');
        this.pendingImageUrl = token.imageUrl;
        this.pendingImageName = token.name;
        // Change cursor to indicate image placement mode
        this.canvas.style.cursor = 'crosshair';
        // Update status
        document.getElementById('statusText').textContent = `Click to place ${token.name} (Press Esc to cancel)`;
    }
    
    searchTokens(query) {
        if (!query || query.trim() === '') {
            document.getElementById('tokenSearchResults').innerHTML = '';
            return;
        }
        
        fetch(`/api/tokens/search?q=${encodeURIComponent(query.trim())}`)
            .then(response => response.json())
            .then(tokens => {
                this.displayTokenSearchResults(tokens);
            })
            .catch(error => {
                console.error('Token search error:', error);
            });
    }
    
    displayTokenSearchResults(tokens) {
        const resultsContainer = document.getElementById('tokenSearchResults');
        resultsContainer.innerHTML = '';
        
        if (tokens.length === 0) {
            resultsContainer.innerHTML = '<div class="token-result-item">No tokens found</div>';
            return;
        }
        
        tokens.forEach(token => {
            const resultItem = document.createElement('div');
            resultItem.className = 'token-result-item';
            resultItem.innerHTML = `
                <img src="${token.imageUrl}" alt="${token.name}" class="token-result-preview">
                <div class="token-result-info">
                    <div class="token-result-name">${token.name}</div>
                    <div class="token-result-meta">Added: ${new Date(token.created).toLocaleDateString()}</div>
                </div>
            `;
            resultItem.addEventListener('click', () => this.selectTokenFromSearch(token));
            resultsContainer.appendChild(resultItem);
        });
    }
    
    uploadImageFile(file, tokenName = null, savePermanent = false) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);
            
            if (tokenName && savePermanent) {
                formData.append('name', tokenName);
                formData.append('savePermanent', 'true');
                
                // Use the token vault endpoint
                fetch('/api/tokens', {
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
                        resolve(data);
                    } else {
                        reject(new Error(data.error));
                    }
                }).catch(error => {
                    reject(error);
                });
            } else {
                // Use the regular upload endpoint
                fetch('/upload', {
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
                        resolve(data);
                    } else {
                        reject(new Error(data.error));
                    }
                }).catch(error => {
                    reject(error);
                });
            }
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
            
            // Force a re-render to show the new token immediately
            setTimeout(() => this.render(), 100);
            
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
            
            // Force a re-render to show the new token immediately
            setTimeout(() => this.render(), 100);
            
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
        if (tool === 'fog-brush' || tool === 'reveal-brush' || tool === 'fog-selection-box' || tool === 'reveal-selection-box') {
            this.canvas.style.cursor = 'crosshair';
            console.log('Set cursor to crosshair for brush/selection box tool');
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
            // Try multiple compression strategies
            let fogDataUrl = null;
            let compressionUsed = 'PNG 0.8';
            
            // First try: PNG with 0.8 quality
            fogDataUrl = this.fogCanvas.toDataURL('image/png', 0.8);
            console.log('Saving fog state, data URL length:', fogDataUrl.length, 'using:', compressionUsed);
            
            // If too large, try JPEG with 0.7 quality
            if (fogDataUrl.length > 5 * 1024 * 1024) { // 5MB limit
                console.warn('Fog data too large, trying JPEG compression...');
                fogDataUrl = this.fogCanvas.toDataURL('image/jpeg', 0.7);
                compressionUsed = 'JPEG 0.7';
                console.log('JPEG compressed data URL length:', fogDataUrl.length);
            }
            
            // If still too large, try JPEG with 0.5 quality
            if (fogDataUrl.length > 5 * 1024 * 1024) {
                console.warn('Fog data still too large, trying higher JPEG compression...');
                fogDataUrl = this.fogCanvas.toDataURL('image/jpeg', 0.5);
                compressionUsed = 'JPEG 0.5';
                console.log('Higher JPEG compressed data URL length:', fogDataUrl.length);
            }
            
            // If still too large, try downsampling the canvas
            if (fogDataUrl.length > 5 * 1024 * 1024) {
                console.warn('Fog data still too large, trying downsampling...');
                fogDataUrl = this.createDownsampledFogData();
                compressionUsed = 'Downsampled JPEG 0.5';
                console.log('Downsampled data URL length:', fogDataUrl.length);
            }
            
            // Final check - if still too large, we can't save
            if (fogDataUrl.length > 10 * 1024 * 1024) {
                console.error('Fog data still too large after all compression attempts, cannot save');
                return;
            }
            
            console.log('Using compression:', compressionUsed, 'final size:', fogDataUrl.length);
            this.sendFogData(fogDataUrl);
        }
    }
    
    createDownsampledFogData() {
        // Create a temporary canvas with reduced resolution
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Calculate downsampling factor (reduce by 2x)
        const scaleFactor = 0.5;
        tempCanvas.width = this.fogCanvas.width * scaleFactor;
        tempCanvas.height = this.fogCanvas.height * scaleFactor;
        
        // Draw the fog canvas onto the temp canvas with scaling
        tempCtx.drawImage(this.fogCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Return compressed data URL
        return tempCanvas.toDataURL('image/jpeg', 0.5);
    }
    
    sendFogData(fogDataUrl) {
        console.log('Sending fog data to server, length:', fogDataUrl.length);
        
        fetch(`/api/adventures/${this.adventureId}/maps/${this.viewingMapId}`, {
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
        this.fogCtx.globalCompositeOperation = this.currentFogTool === 'fog-brush' ? 'source-over' : 'destination-out';
        this.fogCtx.strokeStyle = this.currentFogTool === 'fog-brush' ? 'black' : 'white';
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
        
        // Save the player view state for the current map
        this.savePlayerViewState();
        
        // Emit player view update to all connected clients
        this.socket.emit('player-view-updated', {
            adventureId: this.adventureId,
            mapId: this.activeMapId,
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY },
            fontSize: this.currentPlayerNameFontSize
        });
        
        console.log('Player view updated:', {
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
        });
    }
    
    updatePlayerNameFontSize(fontSize) {
        this.currentPlayerNameFontSize = fontSize;
        
        // Save the player view state for the current map
        this.savePlayerViewState();
        
        // Emit font size update to all connected clients
        this.socket.emit('player-view-updated', {
            adventureId: this.adventureId,
            mapId: this.activeMapId,
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY },
            fontSize: this.currentPlayerNameFontSize
        });
        
        console.log('Player name font size updated:', fontSize);
    }
    
    resetPlayerView() {
        // Get current map and background image for coordinate calculation
        const map = this.maps.get(this.activeMapId);
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
        
        // Center the image in screen coordinates
        // Calculate where the image center should be positioned on screen
        const imageCenterX = imageWidth / 2;
        const imageCenterY = imageHeight / 2;
        
        // Convert image center to screen coordinates
        // Screen center minus the scaled image center position
        const screenCenterX = windowWidth / 2;
        const screenCenterY = windowHeight / 2;
        const scaledImageCenterX = imageCenterX * fitZoom;
        const scaledImageCenterY = imageCenterY * fitZoom;
        
        const panX = screenCenterX - scaledImageCenterX;
        const panY = screenCenterY - scaledImageCenterY;
        
        console.log('=== RESET PLAYER VIEW ===');
        console.log('Image dimensions:', imageWidth, 'x', imageHeight);
        console.log('Window dimensions:', windowWidth, 'x', windowHeight);
        console.log('Calculated fit zoom:', fitZoom);
        console.log('Image center coordinates:', imageCenterX, imageCenterY);
        console.log('Screen center coordinates:', screenCenterX, screenCenterY);
        console.log('Scaled image center coordinates:', scaledImageCenterX, scaledImageCenterY);
        console.log('Calculated pan coordinates:', panX, panY);
        
        // Set player view to centered and fitted
        this.currentPlayerZoom = fitZoom;
        this.currentPlayerPanX = panX;
        this.currentPlayerPanY = panY;
        
        console.log('Player view reset to - zoom:', this.currentPlayerZoom, 'centerX:', this.currentPlayerPanX, 'centerY:', this.currentPlayerPanY);
        
        // Update UI
        this.updatePlayerViewUI();
        
        // Save the player view state for the current map
        this.savePlayerViewState();
        
        // Emit player view update
        this.socket.emit('player-view-updated', {
            adventureId: this.adventureId,
            mapId: this.activeMapId,
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY },
            fontSize: this.currentPlayerNameFontSize
        });
        
        console.log('Player view reset:', {
            zoom: this.currentPlayerZoom,
            pan: { x: this.currentPlayerPanX, y: this.currentPlayerPanY }
        });
    }
    
    syncPlayerViewToDM() {
        // Get current map and background image for coordinate conversion
        const map = this.maps.get(this.activeMapId);
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
        
        // Convert image center coordinates to screen coordinates (same logic as resetPlayerView)
        const windowWidth = this.canvas.width;
        const windowHeight = this.canvas.height;
        const screenCenterXWindow = windowWidth / 2;
        const screenCenterYWindow = windowHeight / 2;
        const scaledImageCenterX = clampedCenterX * this.zoom;
        const scaledImageCenterY = clampedCenterY * this.zoom;
        
        const panX = screenCenterXWindow - scaledImageCenterX;
        const panY = screenCenterYWindow - scaledImageCenterY;
        
        console.log('Window dimensions:', windowWidth, 'x', windowHeight);
        console.log('Screen center coordinates:', screenCenterXWindow, screenCenterYWindow);
        console.log('Scaled image center coordinates:', scaledImageCenterX, scaledImageCenterY);
        console.log('Calculated pan coordinates:', panX, panY);
        
        // Sync player view to the center coordinates (in screen coordinates)
        this.currentPlayerZoom = this.zoom;
        this.currentPlayerPanX = panX;
        this.currentPlayerPanY = panY;
        
        console.log('Player view set to - zoom:', this.currentPlayerZoom, 'panX:', this.currentPlayerPanX, 'panY:', this.currentPlayerPanY);
        
        // Update UI
        this.updatePlayerViewUI();
        
        // Save the player view state for the current map
        this.savePlayerViewState();
        
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
        
        // Convert screen coordinates back to image coordinates for display
        const map = this.maps.get(this.viewingMapId);
        let displayPanX = this.currentPlayerPanX;
        let displayPanY = this.currentPlayerPanY;
        
        if (map && map.backgroundImage) {
            const bgImage = this.backgroundImages.get(map.backgroundImage);
            if (bgImage && bgImage.complete) {
                const windowWidth = this.canvas.width;
                const windowHeight = this.canvas.height;
                const screenCenterX = windowWidth / 2;
                const screenCenterY = windowHeight / 2;
                
                // Convert screen pan coordinates back to image coordinates
                displayPanX = Math.round((screenCenterX - this.currentPlayerPanX) / this.currentPlayerZoom);
                displayPanY = Math.round((screenCenterY - this.currentPlayerPanY) / this.currentPlayerZoom);
                
                // Clamp to image bounds
                displayPanX = Math.max(0, Math.min(bgImage.width, displayPanX));
                displayPanY = Math.max(0, Math.min(bgImage.height, displayPanY));
            }
        }
        
        if (playerPanXSlider) {
            playerPanXSlider.value = displayPanX;
        }
        if (playerPanXValue) {
            playerPanXValue.textContent = `${displayPanX}px`;
        }
        
        if (playerPanYSlider) {
            playerPanYSlider.value = displayPanY;
        }
        if (playerPanYValue) {
            playerPanYValue.textContent = `${displayPanY}px`;
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
        // Load player view state for the current active map (not viewing map)
        if (!this.activeMapId) {
            this.currentPlayerZoom = 1;
            this.currentPlayerPanX = 0;
            this.currentPlayerPanY = 0;
            this.updatePlayerViewUI();
            return;
        }
        
        const map = this.maps.get(this.activeMapId);
        if (!map) {
            this.currentPlayerZoom = 1;
            this.currentPlayerPanX = 0;
            this.currentPlayerPanY = 0;
            this.updatePlayerViewUI();
            return;
        }
        
        // Load player view state from map data
        this.currentPlayerZoom = map.playerViewState?.zoom || 1;
        this.currentPlayerPanX = map.playerViewState?.panX || 0;
        this.currentPlayerPanY = map.playerViewState?.panY || 0;
        this.currentPlayerNameFontSize = map.playerViewState?.fontSize || 14;
        
        console.log('Loaded player view state for active map:', this.activeMapId, {
            zoom: this.currentPlayerZoom,
            panX: this.currentPlayerPanX,
            panY: this.currentPlayerPanY,
            fontSize: this.currentPlayerNameFontSize
        });
        
        this.updatePlayerViewUI();
    }
    
    savePlayerViewState() {
        // Save player view state for the current active map (not viewing map)
        if (!this.activeMapId) return;
        
        const map = this.maps.get(this.activeMapId);
        if (!map) return;
        
        // Initialize playerViewState if it doesn't exist
        if (!map.playerViewState) {
            map.playerViewState = {};
        }
        
        // Save current player view state
        map.playerViewState.zoom = this.currentPlayerZoom;
        map.playerViewState.panX = this.currentPlayerPanX;
        map.playerViewState.panY = this.currentPlayerPanY;
        map.playerViewState.fontSize = this.currentPlayerNameFontSize;
        
        console.log('Saved player view state for active map:', this.activeMapId, {
            zoom: this.currentPlayerZoom,
            panX: this.currentPlayerPanX,
            panY: this.currentPlayerPanY,
            fontSize: this.currentPlayerNameFontSize
        });
        
        // Save the adventure data
        this.saveAdventure();
    }
    
    saveAdventure() {
        // Get the current adventure data
        const adventure = {
            id: this.adventureId,
            maps: {}
        };
        
        // Convert maps Map to object
        this.maps.forEach((map, mapId) => {
            adventure.maps[mapId] = map;
        });
        
        // Save to server
        fetch(`/api/adventures/${this.adventureId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(adventure)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save adventure');
            }
            console.log('Adventure saved successfully');
        })
        .catch(error => {
            console.error('Error saving adventure:', error);
        });
    }
    
    saveBattlegridState() {
        // Save battlegrid state for the current viewing map
        if (!this.viewingMapId) return;
        
        const map = this.maps.get(this.viewingMapId);
        if (!map) return;
        
        // Initialize battlegridState if it doesn't exist
        if (!map.battlegridState) {
            map.battlegridState = {};
        }
        
        // Save current battlegrid state
        map.battlegridState.type = this.battlegridType;
        map.battlegridState.lineWidth = this.battlegridLineWidth;
        map.battlegridState.opacity = this.battlegridOpacity;
        map.battlegridState.size = this.battlegridSize;
        map.battlegridState.offsetX = this.battlegridOffsetX;
        map.battlegridState.offsetY = this.battlegridOffsetY;
        map.battlegridState.color = this.battlegridColor;
        map.battlegridState.scaleFactor = this.battlegridScaleFactor;
        
        console.log('Saved battlegrid state for map:', this.viewingMapId, map.battlegridState);
        
        // Save the adventure data
        this.saveAdventure();
    }
    
    loadBattlegridState() {
        // Load battlegrid state for the current viewing map
        if (!this.viewingMapId) return;
        
        const map = this.maps.get(this.viewingMapId);
        if (!map || !map.battlegridState) {
            // Set default values if no state exists
            this.battlegridType = 'none';
            this.battlegridLineWidth = 2;
            this.battlegridOpacity = 0.5;
            this.battlegridSize = 50;
            this.battlegridOffsetX = 0;
            this.battlegridOffsetY = 0;
            this.battlegridColor = '#ffffff';
            this.battlegridScaleFactor = 1.5;
        } else {
            // Load saved state
            this.battlegridType = map.battlegridState.type || 'none';
            this.battlegridLineWidth = map.battlegridState.lineWidth || 2;
            this.battlegridOpacity = map.battlegridState.opacity || 0.5;
            this.battlegridSize = map.battlegridState.size || 50;
            this.battlegridOffsetX = map.battlegridState.offsetX || 0;
            this.battlegridOffsetY = map.battlegridState.offsetY || 0;
            this.battlegridColor = map.battlegridState.color || '#ffffff';
            this.battlegridScaleFactor = map.battlegridState.scaleFactor || 1.5;
        }
        
        // Update UI to reflect loaded state
        this.updateBattlegridUI();
    }
    
    updateBattlegridUI() {
        // Update radio buttons
        const radioButton = document.querySelector(`input[name="battlegridType"][value="${this.battlegridType}"]`);
        if (radioButton) {
            radioButton.checked = true;
        }
        
        // Update sliders and their values
        const gridLineWidthSlider = document.getElementById('battlegridLineWidth');
        const gridLineWidthValue = document.getElementById('battlegridLineWidthValue');
        if (gridLineWidthSlider && gridLineWidthValue) {
            gridLineWidthSlider.value = this.battlegridLineWidth;
            gridLineWidthValue.textContent = this.battlegridLineWidth;
        }
        
        const gridOpacitySlider = document.getElementById('battlegridOpacity');
        const gridOpacityValue = document.getElementById('battlegridOpacityValue');
        if (gridOpacitySlider && gridOpacityValue) {
            gridOpacitySlider.value = this.battlegridOpacity;
            gridOpacityValue.textContent = this.battlegridOpacity;
        }
        
        const gridSizeSlider = document.getElementById('battlegridSize');
        const gridSizeValue = document.getElementById('battlegridSizeValue');
        if (gridSizeSlider && gridSizeValue) {
            gridSizeSlider.value = this.battlegridSize;
            gridSizeValue.textContent = this.battlegridSize;
        }
        
        const gridOffsetXSlider = document.getElementById('battlegridOffsetX');
        const gridOffsetXValue = document.getElementById('battlegridOffsetXValue');
        if (gridOffsetXSlider && gridOffsetXValue) {
            gridOffsetXSlider.value = this.battlegridOffsetX;
            gridOffsetXValue.textContent = this.battlegridOffsetX;
        }
        
        const gridOffsetYSlider = document.getElementById('battlegridOffsetY');
        const gridOffsetYValue = document.getElementById('battlegridOffsetYValue');
        if (gridOffsetYSlider && gridOffsetYValue) {
            gridOffsetYSlider.value = this.battlegridOffsetY;
            gridOffsetYValue.textContent = this.battlegridOffsetY;
        }
        
        // Update color picker
        const gridColorPicker = document.getElementById('battlegridColor');
        if (gridColorPicker) {
            gridColorPicker.value = this.battlegridColor;
        }

        const gridScaleFactorSlider = document.getElementById('battlegridScaleFactor');
        const gridScaleFactorValue = document.getElementById('battlegridScaleFactorValue');
        if (gridScaleFactorSlider && gridScaleFactorValue) {
            gridScaleFactorSlider.value = this.battlegridScaleFactor;
            gridScaleFactorValue.textContent = this.battlegridScaleFactor;
        }
    }
    
    emitBattlegridUpdate() {
        // Emit battlegrid update to players
        this.socket.emit('battlegrid-updated', {
            adventureId: this.adventureId,
            mapId: this.viewingMapId,
            battlegridState: {
                type: this.battlegridType,
                lineWidth: this.battlegridLineWidth,
                opacity: this.battlegridOpacity,
                size: this.battlegridSize,
                offsetX: this.battlegridOffsetX,
                offsetY: this.battlegridOffsetY,
                color: this.battlegridColor,
                scaleFactor: this.battlegridScaleFactor
            }
        });
    }
    
    setupCollapsibleSections() {
        // Add click handlers for section headers
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons inside the header
                if (e.target.closest('button')) return;
                
                const sectionId = header.dataset.section;
                const content = document.getElementById(`${sectionId}-content`);
                
                if (content) {
                    const isCollapsed = content.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        // Expand
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    } else {
                        // Collapse
                        content.classList.add('collapsed');
                        header.classList.add('collapsed');
                    }
                }
            });
        });
        
        // Add click handlers for subsection headers
        document.querySelectorAll('.subsection-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons inside the header
                if (e.target.closest('button')) return;
                
                const subsectionId = header.dataset.subsection;
                const content = document.getElementById(`${subsectionId}-content`);
                
                if (content) {
                    const isCollapsed = content.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        // Expand
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                    } else {
                        // Collapse
                        content.classList.add('collapsed');
                        header.classList.add('collapsed');
                    }
                }
            });
        });
        
        // Initialize all sections as collapsed by default
        document.querySelectorAll('.section-content').forEach(content => {
            content.classList.add('collapsed');
        });
        document.querySelectorAll('.section-header').forEach(header => {
            header.classList.add('collapsed');
        });
        
        // Initialize all subsections as expanded by default (so Add Player is visible)
        document.querySelectorAll('.subsection-content').forEach(content => {
            content.classList.remove('collapsed');
        });
        document.querySelectorAll('.subsection-header').forEach(header => {
            header.classList.remove('collapsed');
        });
    }
    
    setupBattlegridEvents() {
        // Grid type radio buttons
        document.querySelectorAll('input[name="battlegridType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.battlegridType = e.target.value;
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        });
        
        // Line width slider
        const gridLineWidthSlider = document.getElementById('battlegridLineWidth');
        if (gridLineWidthSlider) {
            gridLineWidthSlider.addEventListener('input', (e) => {
                this.battlegridLineWidth = parseInt(e.target.value);
                const gridLineWidthValue = document.getElementById('battlegridLineWidthValue');
                if (gridLineWidthValue) {
                    gridLineWidthValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
        
        // Line opacity slider
        const gridOpacitySlider = document.getElementById('battlegridOpacity');
        if (gridOpacitySlider) {
            gridOpacitySlider.addEventListener('input', (e) => {
                this.battlegridOpacity = parseFloat(e.target.value);
                const gridOpacityValue = document.getElementById('battlegridOpacityValue');
                if (gridOpacityValue) {
                    gridOpacityValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
        
        // Grid size slider
        const gridSizeSlider = document.getElementById('battlegridSize');
        if (gridSizeSlider) {
            gridSizeSlider.addEventListener('input', (e) => {
                this.battlegridSize = parseInt(e.target.value);
                const gridSizeValue = document.getElementById('battlegridSizeValue');
                if (gridSizeValue) {
                    gridSizeValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
        
        // Offset X slider
        const gridOffsetXSlider = document.getElementById('battlegridOffsetX');
        if (gridOffsetXSlider) {
            gridOffsetXSlider.addEventListener('input', (e) => {
                this.battlegridOffsetX = parseInt(e.target.value);
                const gridOffsetXValue = document.getElementById('battlegridOffsetXValue');
                if (gridOffsetXValue) {
                    gridOffsetXValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
        
        // Offset Y slider
        const gridOffsetYSlider = document.getElementById('battlegridOffsetY');
        if (gridOffsetYSlider) {
            gridOffsetYSlider.addEventListener('input', (e) => {
                this.battlegridOffsetY = parseInt(e.target.value);
                const gridOffsetYValue = document.getElementById('battlegridOffsetYValue');
                if (gridOffsetYValue) {
                    gridOffsetYValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
        
        // Color picker
        const gridColorPicker = document.getElementById('battlegridColor');
        if (gridColorPicker) {
            gridColorPicker.addEventListener('input', (e) => {
                this.battlegridColor = e.target.value;
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }

        // Scale factor slider
        const gridScaleFactorSlider = document.getElementById('battlegridScaleFactor');
        if (gridScaleFactorSlider) {
            gridScaleFactorSlider.addEventListener('input', (e) => {
                this.battlegridScaleFactor = parseFloat(e.target.value);
                const gridScaleFactorValue = document.getElementById('battlegridScaleFactorValue');
                if (gridScaleFactorValue) {
                    gridScaleFactorValue.textContent = e.target.value;
                }
                this.saveBattlegridState();
                this.render();
                this.emitBattlegridUpdate();
            });
        }
    }
    
    // SRD 5e Spell and Monster Search Methods
    showSpellSearchModal() {
        const spellsData = localStorage.getItem('spellsData');
        if (!spellsData) {
            alert('Please download spells data first from the start screen.');
            return;
        }
        
        document.getElementById('spellSearchModal').style.display = 'block';
        document.getElementById('spellSearch').value = '';
        document.getElementById('spellSearchResults').innerHTML = '';
        document.getElementById('spellDetailsSection').style.display = 'none';
        document.getElementById('showSpellToPlayerBtn').style.display = 'none';
        this.currentSpell = null;
        document.getElementById('spellSearch').focus();
    }
    
    showMonsterSearchModal() {
        const monstersData = localStorage.getItem('monstersData');
        if (!monstersData) {
            alert('Please download monsters data first from the start screen.');
            return;
        }
        
        document.getElementById('monsterSearchModal').style.display = 'block';
        document.getElementById('monsterSearch').value = '';
        document.getElementById('monsterSearchResults').innerHTML = '';
        document.getElementById('monsterDetailsSection').style.display = 'none';
        document.getElementById('monsterSearch').focus();
    }
    
    searchSpells(query) {
        const spellsData = localStorage.getItem('spellsData');
        if (!spellsData) return;
        
        try {
            const spells = JSON.parse(spellsData);
            const results = spells.filter(spell => 
                spell.name && spell.name.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 20); // Limit to 20 results
            
            this.displaySpellSearchResults(results);
        } catch (error) {
            console.error('Error searching spells:', error);
        }
    }
    
    searchMonsters(query) {
        const monstersData = localStorage.getItem('monstersData');
        if (!monstersData) return;
        
        try {
            const monsters = JSON.parse(monstersData);
            const results = monsters.filter(monster => 
                monster.name && monster.name.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 20); // Limit to 20 results
            
            this.displayMonsterSearchResults(results);
        } catch (error) {
            console.error('Error searching monsters:', error);
        }
    }
    
    displaySpellSearchResults(spells) {
        const resultsContainer = document.getElementById('spellSearchResults');
        
        if (spells.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No spells found</div>';
            return;
        }
        
        resultsContainer.innerHTML = spells.map(spell => `
            <div class="spell-result-item" onclick="battlemapDM.showSpellDetails('${spell.name}')">
                <div class="spell-result-info">
                    <div class="spell-result-name">${spell.name}</div>
                    <div class="spell-result-meta">
                        ${spell.level ? `Level ${spell.level}` : ''} 
                        ${spell.school ? `• ${spell.school}` : ''}
                        ${spell.casting_time ? `• ${spell.casting_time}` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    displayMonsterSearchResults(monsters) {
        const resultsContainer = document.getElementById('monsterSearchResults');
        
        if (monsters.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No monsters found</div>';
            return;
        }
        
        resultsContainer.innerHTML = monsters.map(monster => `
            <div class="monster-result-item" onclick="battlemapDM.showMonsterDetails('${monster.name}')">
                <div class="monster-result-info">
                    <div class="monster-result-name">${monster.name}</div>
                    <div class="monster-result-meta">
                        ${monster.type ? `• ${monster.type}` : ''} 
                        ${monster.size ? `• ${monster.size}` : ''}
                        ${monster.challenge_rating ? `• CR ${monster.challenge_rating}` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    showSpellDetails(spellName) {
        const spellsData = localStorage.getItem('spellsData');
        if (!spellsData) return;
        
        try {
            const spells = JSON.parse(spellsData);
            const spell = spells.find(s => s.name === spellName);
            
            if (!spell) return;
            
            // Store the current spell for "Show to Player" functionality
            this.currentSpell = spell;
            
            const detailsTable = document.getElementById('spellDetailsTable');
            detailsTable.innerHTML = this.createSpellDetailsTable(spell);
            
            document.getElementById('spellDetailsSection').style.display = 'block';
            
            // Show the "Show to Player" and "Sticky" buttons
            document.getElementById('showSpellToPlayerBtn').style.display = 'inline-flex';
            document.getElementById('stickySpellBtn').style.display = 'inline-flex';
        } catch (error) {
            console.error('Error showing spell details:', error);
        }
    }
    
    showSpellToPlayer() {
        if (!this.currentSpell) return;
        
        // Send spell data to players via Socket.IO
        this.socket.emit('show-spell-to-player', {
            adventureId: this.adventureId,
            spell: this.currentSpell
        });
        
        console.log('Showing spell to player:', this.currentSpell.name);
        

    }
    

    
    hideSpellFromPlayer() {
        // Send hide spell signal to players via Socket.IO
        this.socket.emit('hide-spell-from-player', {
            adventureId: this.adventureId
        });
        
        console.log('Hiding spell from player');
        
        // Reset button back to "Show to Player"
        const showSpellBtn = document.getElementById('showSpellToPlayerBtn');
        if (showSpellBtn) {
            showSpellBtn.innerHTML = '<i class="fas fa-eye"></i> Show to Player';
            showSpellBtn.onclick = () => this.showSpellToPlayer();
        }
    }
    
    showMonsterDetails(monsterName) {
        const monstersData = localStorage.getItem('monstersData');
        if (!monstersData) return;
        
        try {
            const monsters = JSON.parse(monstersData);
            const monster = monsters.find(m => m.name === monsterName);
            
            if (!monster) return;
            
            // Store the current monster for sticky window
            this.currentMonster = monster;
            
            const detailsTable = document.getElementById('monsterDetailsTable');
            detailsTable.innerHTML = this.createMonsterDetailsTable(monster);
            
            document.getElementById('monsterDetailsSection').style.display = 'block';
            document.getElementById('stickyMonsterBtn').style.display = 'inline-flex';
        } catch (error) {
            console.error('Error showing monster details:', error);
        }
    }
    
    createSpellDetailsTable(spell) {
        const rows = [];
        
        // Add all spell properties as table rows
        for (const [key, value] of Object.entries(spell)) {
            if (value !== null && value !== undefined) {
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                let formattedValue = value;
                
                // Handle arrays and objects
                if (Array.isArray(value)) {
                    formattedValue = value.join(', ');
                } else if (typeof value === 'object') {
                    formattedValue = JSON.stringify(value, null, 2);
                }
                
                rows.push(`
                    <tr>
                        <th>${formattedKey}</th>
                        <td>${formattedValue}</td>
                    </tr>
                `);
            }
        }
        
        return `<table>${rows.join('')}</table>`;
    }
    
    createMonsterDetailsTable(monster) {
        const rows = [];
        
        // Add all monster properties as table rows
        for (const [key, value] of Object.entries(monster)) {
            if (value !== null && value !== undefined) {
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                let formattedValue = value;
                
                // Handle arrays and objects
                if (Array.isArray(value)) {
                    formattedValue = value.join(', ');
                } else if (typeof value === 'object') {
                    formattedValue = JSON.stringify(value, null, 2);
                }
                
                rows.push(`
                    <tr>
                        <th>${formattedKey}</th>
                        <td>${formattedValue}</td>
                    </tr>
                `);
            }
        }
        
        return `<table>${rows.join('')}</table>`;
    }
    
    createStickySpellWindow() {
        console.log('createStickySpellWindow called, currentSpell:', this.currentSpell);
        if (!this.currentSpell) {
            console.log('No currentSpell found, returning');
            return;
        }
        
        const container = document.getElementById('stickyWindowsContainer');
        const windowId = `sticky-spell-${Date.now()}`;
        
        const stickyWindow = document.createElement('div');
        stickyWindow.className = 'sticky-window';
        stickyWindow.id = windowId;
        stickyWindow.style.left = '50px';
        stickyWindow.style.top = '50px';
        
        const metaInfo = [];
        if (this.currentSpell.level) metaInfo.push(`<span>Level ${this.currentSpell.level}</span>`);
        if (this.currentSpell.school) metaInfo.push(`<span>${this.currentSpell.school}</span>`);
        if (this.currentSpell.casting_time) metaInfo.push(`<span>${this.currentSpell.casting_time}</span>`);
        if (this.currentSpell.range) metaInfo.push(`<span>Range: ${this.currentSpell.range}</span>`);
        if (this.currentSpell.duration) metaInfo.push(`<span>${this.currentSpell.duration}</span>`);
        if (this.currentSpell.components) {
            // Handle components object structure
            let componentsText = '';
            if (typeof this.currentSpell.components === 'object' && this.currentSpell.components.raw) {
                componentsText = this.currentSpell.components.raw;
            } else if (typeof this.currentSpell.components === 'string') {
                componentsText = this.currentSpell.components;
            }
            if (componentsText) metaInfo.push(`<span>${componentsText}</span>`);
        }
        
        stickyWindow.innerHTML = `
            <div class="sticky-window-header">
                <h3 class="sticky-window-title">
                    <i class="fas fa-magic"></i> ${this.currentSpell.name}
                </h3>
                <div class="sticky-window-controls">
                    <button class="sticky-window-btn close-btn" onclick="battlemapDM.closeStickyWindow('${windowId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="sticky-window-content">
                <div class="meta-info">
                    ${metaInfo.join('')}
                </div>
                <h4>Description</h4>
                <p>${this.currentSpell.description || 'No description available.'}</p>
                ${this.currentSpell.higher_levels ? `<h4>At Higher Levels</h4><p>${this.currentSpell.higher_levels}</p>` : ''}
                ${this.currentSpell.ritual ? `<p><strong>Ritual:</strong> Yes</p>` : ''}
                ${this.currentSpell.concentration ? `<p><strong>Concentration:</strong> Yes</p>` : ''}
            </div>
        `;
        
        container.appendChild(stickyWindow);
        this.makeWindowDraggable(stickyWindow);
        
        // Hide the spell from player when creating sticky window
        this.hideSpellFromPlayer();
        
        // Close the modal
        document.getElementById('spellSearchModal').style.display = 'none';
    }
    
    createStickyMonsterWindow() {
        if (!this.currentMonster) return;
        
        const container = document.getElementById('stickyWindowsContainer');
        const windowId = `sticky-monster-${Date.now()}`;
        
        const stickyWindow = document.createElement('div');
        stickyWindow.className = 'sticky-window';
        stickyWindow.id = windowId;
        stickyWindow.style.left = '100px';
        stickyWindow.style.top = '100px';
        
        const metaInfo = [];
        if (this.currentMonster.meta) metaInfo.push(`<span>${this.currentMonster.meta}</span>`);
        if (this.currentMonster['Armor Class']) metaInfo.push(`<span>AC: ${this.currentMonster['Armor Class']}</span>`);
        if (this.currentMonster['Hit Points']) metaInfo.push(`<span>HP: ${this.currentMonster['Hit Points']}</span>`);
        if (this.currentMonster.Challenge) metaInfo.push(`<span>CR: ${this.currentMonster.Challenge}</span>`);
        
        stickyWindow.innerHTML = `
            <div class="sticky-window-header">
                <h3 class="sticky-window-title">
                    <i class="fas fa-dragon"></i> ${this.currentMonster.name}
                </h3>
                <div class="sticky-window-controls">
                    <button class="sticky-window-btn close-btn" onclick="battlemapDM.closeStickyWindow('${windowId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="sticky-window-content">
                <div class="meta-info">
                    ${metaInfo.join('')}
                </div>
                <h4>Description</h4>
                ${this.currentMonster.Speed ? `<h4>Speed</h4><p>${this.currentMonster.Speed}</p>` : ''}
                
                <div class="ability-scores">
                    <h4>Ability Scores</h4>
                    <div class="abilities-grid">
                        ${this.currentMonster.STR ? `<div><strong>STR:</strong> ${this.currentMonster.STR} (${this.currentMonster.STR_mod || ''})</div>` : ''}
                        ${this.currentMonster.DEX ? `<div><strong>DEX:</strong> ${this.currentMonster.DEX} (${this.currentMonster.DEX_mod || ''})</div>` : ''}
                        ${this.currentMonster.CON ? `<div><strong>CON:</strong> ${this.currentMonster.CON} (${this.currentMonster.CON_mod || ''})</div>` : ''}
                        ${this.currentMonster.INT ? `<div><strong>INT:</strong> ${this.currentMonster.INT} (${this.currentMonster.INT_mod || ''})</div>` : ''}
                        ${this.currentMonster.WIS ? `<div><strong>WIS:</strong> ${this.currentMonster.WIS} (${this.currentMonster.WIS_mod || ''})</div>` : ''}
                        ${this.currentMonster.CHA ? `<div><strong>CHA:</strong> ${this.currentMonster.CHA} (${this.currentMonster.CHA_mod || ''})</div>` : ''}
                    </div>
                </div>
                
                ${this.currentMonster['Saving Throws'] ? `<h4>Saving Throws</h4><p>${this.currentMonster['Saving Throws']}</p>` : ''}
                ${this.currentMonster.Skills ? `<h4>Skills</h4><p>${this.currentMonster.Skills}</p>` : ''}
                ${this.currentMonster['Damage Resistances'] ? `<h4>Damage Resistances</h4><p>${this.currentMonster['Damage Resistances']}</p>` : ''}
                ${this.currentMonster['Damage Immunities'] ? `<h4>Damage Immunities</h4><p>${this.currentMonster['Damage Immunities']}</p>` : ''}
                ${this.currentMonster['Condition Immunities'] ? `<h4>Condition Immunities</h4><p>${this.currentMonster['Condition Immunities']}</p>` : ''}
                ${this.currentMonster.Senses ? `<h4>Senses</h4><p>${this.currentMonster.Senses}</p>` : ''}
                ${this.currentMonster.Languages ? `<h4>Languages</h4><p>${this.currentMonster.Languages}</p>` : ''}
                ${this.currentMonster.Traits ? `<h4>Traits</h4><div>${this.currentMonster.Traits}</div>` : ''}
                ${this.currentMonster.Actions ? `<h4>Actions</h4><div>${this.currentMonster.Actions}</div>` : ''}
                ${this.currentMonster.Reactions ? `<h4>Reactions</h4><div>${this.currentMonster.Reactions}</div>` : ''}
                ${this.currentMonster['Legendary Actions'] ? `<h4>Legendary Actions</h4><div>${this.currentMonster['Legendary Actions']}</div>` : ''}
            </div>
        `;
        
        container.appendChild(stickyWindow);
        this.makeWindowDraggable(stickyWindow);
        
        // Close the modal
        document.getElementById('monsterSearchModal').style.display = 'none';
    }
    
    closeStickyWindow(windowId) {
        const window = document.getElementById(windowId);
        if (window) {
            window.remove();
        }
    }
    
    makeWindowDraggable(window) {
        const header = window.querySelector('.sticky-window-header');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                
                window.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    

    

    
    updateFogButtonStates() {
        // Update overlay fog buttons
        document.querySelectorAll('.fog-controls-overlay .fog-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Update main sidebar fog buttons
        document.querySelectorAll('.fog-tool-group .tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (this.currentFogTool === 'select') {
            document.getElementById('arrowToolBtnOverlay')?.classList.add('active');
            // Also update the drawing tool select button to be active
            document.getElementById('selectTool')?.classList.add('active');
        } else if (this.currentFogTool === 'fog-brush') {
            document.getElementById('fogBrushBtnOverlay')?.classList.add('active');
            document.getElementById('fogBrushBtn')?.classList.add('active');
        } else if (this.currentFogTool === 'reveal-brush') {
            document.getElementById('revealBrushBtnOverlay')?.classList.add('active');
            document.getElementById('revealBrushBtn')?.classList.add('active');
        } else if (this.currentFogTool === 'fog-selection-box') {
            document.getElementById('fogSelectionBoxBtn')?.classList.add('active');
        } else if (this.currentFogTool === 'reveal-selection-box') {
            document.getElementById('revealSelectionBoxBtn')?.classList.add('active');
        }
    }
}

// Initialize the DM interface
const battlemapDM = new BattlemapDM();