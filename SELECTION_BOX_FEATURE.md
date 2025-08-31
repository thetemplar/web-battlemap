# Selection Box Feature for Player View Control

## Overview
The selection box feature allows the DM to draw a rectangle on the map that will automatically set the player's view to match that area, maintaining proper aspect ratio.

## How to Use

### 1. Select the Selection Box Tool
- In the DM interface, go to the "Drawing Tools" section
- Click on the crop icon (✂️) button labeled "Player View Selection Box"
- The cursor will change to a crosshair
- The status bar will show "Selection Box Tool: Draw a rectangle to set player view"

### 2. Draw the Selection Box
- Click and drag on the map to draw a rectangle
- The selection box will appear with a green dashed border and semi-transparent green fill
- While drawing, the status will show "Drawing selection box..."

### 3. Finalize the Selection
- Release the mouse button to finalize the selection
- The system will automatically:
  - Calculate the optimal zoom level to fit the selection in the player viewport
  - Maintain aspect ratio by using the smaller of width/height ratios
  - Center the selection in the player view
  - Update the player view immediately
  - Save the new view state for the current map

### 4. Visual Feedback
- The selection box is drawn with:
  - Green dashed border (3px width)
  - Semi-transparent green fill (20% opacity)
  - Clear visual distinction from regular drawing shapes

### 5. Status Updates
- "Selection Box Tool: Draw a rectangle to set player view" - when tool is selected
- "Drawing selection box..." - while drawing
- "Player view updated from selection box" - when finalized
- "Ready" - when switching to other tools

## Technical Details

### Coordinate System
- The selection box coordinates are in image space (not screen space)
- The system converts the selection box to player view coordinates
- Aspect ratio is maintained by using the minimum of width/height ratios

### Player View Calculation
1. Calculate selection box bounds in image coordinates
2. Determine zoom level to fit selection in player viewport
3. Calculate selection center in image coordinates
4. Convert to screen coordinates for pan positioning
5. Update player view with new zoom and pan values

### Persistence
- The new player view state is automatically saved per map
- Switching between maps preserves the view state for each map
- The view state is synchronized to all connected player clients

## Integration with Existing Features
- Works alongside existing player view controls (sliders)
- Integrates with per-map view state persistence
- Compatible with all existing drawing tools
- Maintains fog of war and layer visibility

## Troubleshooting
- If the selection box is too small (< 5px), it will be ignored
- Ensure the map has a background image loaded
- Check that the player viewport dimensions are properly set
- Verify that the adventure and map are properly loaded
