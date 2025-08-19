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
        
        // Players state
        this.players = new Map(); // Map of playerId -> playerData
        this.currentActivePlayerId = null;
        this.playerNameFontSize = 14; // Default font size for player names
        
        // Spell overlay state
        this.spellOverlayRotation = 0; // Current rotation in degrees
        
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
        this.updatePlayerNamesOverlay();
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
                this.updatePlayerView(data.zoom, data.pan, data.fontSize);
            }
        });
        
        this.socket.on('active-map-changed', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received active-map-changed:', data);
                this.activeMapId = data.activeMapId;
                this.render();
            }
        });
        
        this.socket.on('players-updated', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received players-updated:', data);
                this.players.clear();
                data.players.forEach(player => {
                    this.players.set(player.id, player);
                });
                this.currentActivePlayerId = data.currentActivePlayerId || null;
                this.updatePlayerNamesOverlay();
            }
        });
        
        // Handle spell display from DM
        this.socket.on('show-spell-to-player', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Player received spell:', data.spell.name);
                this.showSpellOverlay(data.spell);
            }
        });
        
        // Handle spell hide from DM
        this.socket.on('hide-spell-from-player', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Hiding spell overlay');
                this.hideSpellOverlay();
            }
        });
        
        // Handle spell overlay rotation from DM
        this.socket.on('rotate-spell-overlay', (data) => {
            if (data.adventureId === this.adventureId) {
                console.log('Rotating spell overlay');
                this.rotateSpellOverlay();
            }
        });
    }
    
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
     
         updatePlayerView(zoom, pan, fontSize) {
        console.log('Updating player view - zoom:', zoom, 'pan:', pan, 'fontSize:', fontSize);
        
        // Update zoom and pan
        this.zoom = zoom;
        this.pan.x = pan.x;
        this.pan.y = pan.y;
        
        // Update font size if provided
        if (fontSize !== undefined) {
            this.playerNameFontSize = fontSize;
        }
        
        // Re-render with new view
        this.render();
    }
    
    updatePlayerNamesOverlay() {
        const overlay = document.getElementById('playerNamesOverlay');
        if (!overlay) {
            console.error('Player names overlay not found');
            return;
        }
        
        console.log('Updating player names overlay. Players count:', this.players.size);
        
        // Clear existing player name tags
        overlay.innerHTML = '';
        
        // Calculate screen dimensions
        const screenWidth = this.canvas.width;
        const screenHeight = this.canvas.height;
        
        console.log('Screen dimensions:', screenWidth, 'x', screenHeight);
        
        // Get sorted players by initiative (descending)
        const sortedPlayers = Array.from(this.players.entries()).sort((a, b) => b[1].initiative - a[1].initiative);
        
        // Find the next player (the one after the current active player)
        let nextPlayerId = null;
        if (this.currentActivePlayerId && sortedPlayers.length > 1) {
            const currentIndex = sortedPlayers.findIndex(([id]) => id === this.currentActivePlayerId);
            if (currentIndex !== -1) {
                const nextIndex = (currentIndex + 1) % sortedPlayers.length;
                nextPlayerId = sortedPlayers[nextIndex][0];
            }
        }
        
        sortedPlayers.forEach(([playerId, player]) => {
            console.log('Creating name tag for player:', player.name, 'at orientation:', player.orientation);
            
            // Determine which border the player should be on based on orientation
            let x, y;
            let borderClass = '';
            let rotation = 0;
            
            // Convert orientation to border position (like a poker table)
            // 0-90 degrees: top border (facing down/out - away from screen)
            // 90-180 degrees: right border (facing left/out - away from screen)
            // 180-270 degrees: bottom border (facing up/out - away from screen)
            // 270-360 degrees: left border (facing right/out - away from screen)
            
            if (player.orientation >= 0 && player.orientation < 90) {
                // Top border (0-90 degrees) - facing down/out (away from screen)
                const progress = player.orientation / 90; // 0 to 1
                x = progress * screenWidth;
                y = 30; // 30px from top (center of 60px border)
                borderClass = 'border-top';
                rotation = 180; // Face down/out (away from screen)
            } else if (player.orientation >= 90 && player.orientation < 180) {
                // Right border (90-180 degrees) - facing left/out (away from screen)
                const progress = (player.orientation - 90) / 90; // 0 to 1
                x = screenWidth - 30; // 30px from right (center of 60px border)
                y = progress * screenHeight;
                borderClass = 'border-right';
                rotation = 270; // Face left/out (away from screen)
            } else if (player.orientation >= 180 && player.orientation < 270) {
                // Bottom border (180-270 degrees) - facing up/out (away from screen)
                const progress = (player.orientation - 180) / 90; // 0 to 1
                x = screenWidth - (progress * screenWidth); // Reverse direction
                y = screenHeight - 30; // 30px from bottom (center of 60px border)
                borderClass = 'border-bottom';
                rotation = 0; // Face up/out (away from screen)
            } else {
                // Left border (270-360 degrees) - facing right/out (away from screen)
                const progress = (player.orientation - 270) / 90; // 0 to 1
                x = 30; // 30px from left (center of 60px border)
                y = screenHeight - (progress * screenHeight); // Reverse direction
                borderClass = 'border-left';
                rotation = 90; // Face right/out (away from screen)
            }
            
            console.log('Calculated position:', x, y, 'border:', borderClass, 'rotation:', rotation);
            
            // Create player name tag
            const nameTag = document.createElement('div');
            nameTag.className = `player-name-tag ${borderClass}`;
            
            // Add active class if this is the current active player
            if (playerId === this.currentActivePlayerId) {
                nameTag.classList.add('active');
            }
            // Add next class if this is the next player
            else if (playerId === nextPlayerId) {
                nameTag.classList.add('next');
            }
            
            nameTag.textContent = player.name;
            nameTag.style.left = `${x}px`;
            nameTag.style.top = `${y}px`;
            nameTag.style.fontSize = `${this.playerNameFontSize}px`;
            nameTag.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
            
            overlay.appendChild(nameTag);
            console.log('Added name tag for:', player.name, 
                playerId === this.currentActivePlayerId ? '(ACTIVE)' : 
                playerId === nextPlayerId ? '(NEXT)' : '');
        });
    }
    
    showSpellOverlay(spell) {
        const overlay = document.getElementById('spellOverlay');
        const title = document.getElementById('spellOverlayTitle');
        const meta = document.getElementById('spellOverlayMeta');
        const body = document.getElementById('spellOverlayBody');
        
        // Set title
        title.innerHTML = `<i class="fas fa-magic"></i> ${spell.name}`;
        
        // Set meta information
        const metaInfo = [];
        if (spell.level) metaInfo.push(`<span>Level ${spell.level}</span>`);
        if (spell.school) metaInfo.push(`<span>${spell.school}</span>`);
        if (spell.casting_time) metaInfo.push(`<span>${spell.casting_time}</span>`);
        if (spell.range) metaInfo.push(`<span>Range: ${spell.range}</span>`);
        if (spell.duration) metaInfo.push(`<span>Duration: ${spell.duration}</span>`);
        if (spell.components) metaInfo.push(`<span>Components: ${spell.components}</span>`);
        
        meta.innerHTML = metaInfo.join('');
        
        // Set body content
        let bodyContent = '';
        
        if (spell.description) {
            bodyContent += `<p>${spell.description}</p>`;
        }
        
        if (spell.higher_level) {
            bodyContent += `<h4>At Higher Levels</h4><p>${spell.higher_level}</p>`;
        }
        
        if (spell.classes && spell.classes.length > 0) {
            bodyContent += `<h4>Classes</h4><p>${spell.classes.join(', ')}</p>`;
        }
        
        if (spell.subclasses && spell.subclasses.length > 0) {
            bodyContent += `<h4>Subclasses</h4><p>${spell.subclasses.join(', ')}</p>`;
        }
        
        body.innerHTML = bodyContent;
        
        // Apply current rotation and show the overlay
        overlay.style.transform = `rotate(${this.spellOverlayRotation}deg)`;
        overlay.style.display = 'flex';
    }
    
    hideSpellOverlay() {
        const overlay = document.getElementById('spellOverlay');
        overlay.style.display = 'none';
        // Reset rotation when hiding
        this.spellOverlayRotation = 0;
    }
    
    rotateSpellOverlay() {
        // Rotate by 90 degrees
        this.spellOverlayRotation = (this.spellOverlayRotation + 90) % 360;
        
        const overlay = document.getElementById('spellOverlay');
        if (overlay && overlay.style.display !== 'none') {
            overlay.style.transform = `rotate(${this.spellOverlayRotation}deg)`;
        }
    }
    
}

// Initialize the player interface
const battlemapPlayer = new BattlemapPlayer(); 