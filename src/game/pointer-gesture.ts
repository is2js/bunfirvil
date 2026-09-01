export const MAP_PAN_DRAG_THRESHOLD_PX = 6;

export function isMapPanDrag(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = MAP_PAN_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}
