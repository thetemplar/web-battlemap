# Battlegrid Feature

## Overview

The battlegrid feature allows the DM to overlay a grid or hexagon pattern on the battlemap. This grid is visible to both the DM and all connected players, and is anchored to the map (similar to fog of war).

## Features

### Grid Types
- **None**: No grid overlay
- **Grid**: Standard square grid
- **Hex**: Hexagonal grid pattern

### Controls
- **Line Width**: Controls the thickness of grid lines (1-10 pixels)
- **Line Opacity**: Controls the transparency of grid lines (0.1-1.0)
- **Grid Size**: Controls the size of grid cells (10-200 pixels)
- **Offset X/Y**: Controls the position offset of the grid (0-200 pixels)

## UI Location

The battlegrid controls are located in the DM interface under a new "Battlegrid" submenu in the sidebar. The submenu can be collapsed/expanded like other sections.

## Data Structure

Battlegrid settings are stored per map in the adventure JSON file:

```json
{
  "id": "map-123",
  "name": "Map Name",
  "backgroundImage": "...",
  "layers": [...],
  "playerViewState": {...},
  "battlegridState": {
    "type": "grid",
    "lineWidth": 2,
    "opacity": 0.5,
    "size": 50,
    "offsetX": 0,
    "offsetY": 0
  }
}
```

## Technical Implementation

### DM Client (`public/dm.js`)
- **State Variables**: Added battlegrid properties to the constructor
- **Event Handlers**: Added `setupBattlegridEvents()` method to handle UI interactions
- **Drawing**: Added `drawBattlegrid()`, `drawGrid()`, `drawHexGrid()`, and `drawHexagon()` methods
- **Persistence**: Added `loadBattlegridState()` and `saveBattlegridState()` methods
- **Real-time Updates**: Emits `battlegrid-updated` events to players

### Player Client (`public/player.js`)
- **State Variables**: Added battlegrid properties to the constructor
- **Socket Listeners**: Added handler for `battlegrid-updated` events
- **Drawing**: Added same drawing methods as DM client
- **Loading**: Added battlegrid state loading to `loadPlayerViewStateForMap()`

### Server (`server.js`)
- **Socket Events**: Added `battlegrid-updated` event forwarding

## Usage

1. **Access Controls**: Open the DM interface and expand the "Battlegrid" section in the sidebar
2. **Select Grid Type**: Choose between "none", "grid", or "hex" using the radio buttons
3. **Adjust Settings**: Use the sliders to fine-tune the appearance:
   - Line Width: Adjust thickness of grid lines
   - Line Opacity: Control transparency
   - Grid Size: Change cell size
   - Offset X/Y: Position the grid precisely
4. **Real-time Updates**: Changes are immediately visible to all connected players
5. **Persistence**: Settings are automatically saved per map and persist between sessions

## Grid Calculations

### Square Grid
- Vertical lines drawn at regular intervals based on grid size
- Horizontal lines drawn at regular intervals based on grid size
- Offset applied to both X and Y coordinates

### Hexagonal Grid
- Hexagons arranged in a honeycomb pattern
- Each hexagon has a radius equal to the grid size
- Offset applied to the entire grid pattern
- Grid covers the entire map area with some overflow for seamless appearance

## Rendering

The battlegrid is drawn:
- After the background image and layers
- Before temporary shapes (like the selection box)
- With the same coordinate system as the map (anchored to map, not screen)
- Using canvas transformations for proper zoom/pan behavior

## Default Values

When no battlegrid state exists for a map, the following defaults are used:
- Type: "none"
- Line Width: 2
- Opacity: 0.5
- Size: 50
- Offset X: 0
- Offset Y: 0
