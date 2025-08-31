# Fog Selection Box Feature

## Overview
The fog selection box feature allows the DM to draw rectangular areas on the map to add or remove fog of war in those specific regions, providing a more precise and efficient way to manage fog compared to the brush tool.

## New Tools Added

### 1. Fog Selection Box (Red Square Icon)
- **Purpose**: Add fog to a rectangular area
- **Visual**: Red dashed border with semi-transparent red fill while drawing
- **Behavior**: Fills the selected rectangular area with black fog

### 2. Reveal Selection Box (Green Crop Icon)
- **Purpose**: Remove fog from a rectangular area
- **Visual**: Green dashed border with semi-transparent green fill while drawing
- **Behavior**: Clears fog from the selected rectangular area

## How to Use

### 1. Select a Fog Selection Box Tool
- In the DM interface, go to the "Fog of War" section
- Click on either:
  - Red square icon (Fog Selection Box) to add fog
  - Green crop icon (Reveal Selection Box) to remove fog
- The cursor will change to a crosshair
- The status bar will show "Drawing fog selection box..."

### 2. Draw the Selection Box
- Click and drag on the map to draw a rectangle
- The selection box will appear with:
  - **Fog Selection Box**: Red dashed border and semi-transparent red fill
  - **Reveal Selection Box**: Green dashed border and semi-transparent green fill
- While drawing, the status will show "Drawing fog selection box..."

### 3. Finalize the Selection
- Release the mouse button to finalize the selection
- The system will automatically:
  - Apply fog to the selected area (for fog selection box)
  - Remove fog from the selected area (for reveal selection box)
  - Update the fog state immediately
  - Save the fog state to the server
  - Update all connected player clients

### 4. Visual Feedback
- **Fog Selection Box**: Red dashed border (3px width) with semi-transparent red fill (20% opacity)
- **Reveal Selection Box**: Green dashed border (3px width) with semi-transparent green fill (20% opacity)
- Clear visual distinction from regular drawing shapes and player view selection box

### 5. Status Updates
- "Drawing fog selection box..." - while drawing
- "Fog added from selection box area" - when fog selection box is finalized
- "Fog removed from selection box area" - when reveal selection box is finalized
- "Ready" - when switching to other tools

## Technical Details

### Coordinate System
- The selection box coordinates are in image space (not screen space)
- The system applies fog directly to the fog bitmap canvas
- Fog is applied using the same coordinate system as the background image

### Fog Application
1. **Fog Selection Box**: Uses `fillRect` with black color to add fog
2. **Reveal Selection Box**: Uses `destination-out` composite operation with white color to remove fog
3. The fog bitmap is updated immediately and synchronized to all clients

### Minimum Size
- Selection boxes smaller than 5x5 pixels are ignored
- This prevents accidental fog changes from tiny selections

## Integration with Existing Features
- Works alongside existing fog tools (brush, show all, fog all)
- Integrates with existing fog state persistence
- Compatible with all existing drawing tools
- Maintains fog opacity and brush size settings (though not used for selection boxes)
- Synchronizes with all connected player clients

## Advantages Over Brush Tool
- **Precision**: Exact rectangular areas instead of freehand drawing
- **Speed**: Quick selection of large areas
- **Consistency**: Perfect rectangles for structured environments
- **Efficiency**: Single operation for large areas vs. multiple brush strokes

## Troubleshooting
- If the selection box is too small (< 5px), it will be ignored
- Ensure the map has a background image loaded
- Check that the fog canvas is properly sized
- Verify that the adventure and map are properly loaded
- If fog doesn't appear, check the fog opacity settings in player view

## Future Enhancements
- Elliptical selection boxes
- Freeform selection areas
- Selection box with rounded corners
- Undo/redo for fog operations
- Fog selection box with different opacity levels
