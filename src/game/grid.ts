import type { Direction } from './types';

export interface GridVector {
  dx: number;
  dy: number;
}

/** Root /rpg의 화면 방향을 canonical world diagonal grid로 바꾼다. */
export function screenVectorToWorldDelta(screenDx: number, screenDy: number): GridVector {
  const dx = Math.sign(screenDx);
  const dy = Math.sign(screenDy);
  return {
    dx: Math.sign(dx + dy),
    dy: Math.sign(dy - dx),
  };
}

export function screenDirection(screenDx: number, screenDy: number): Direction {
  const dx = Math.sign(screenDx);
  const dy = Math.sign(screenDy);
  if (dx === 0 && dy < 0) return 'n';
  if (dx > 0 && dy < 0) return 'ne';
  if (dx > 0 && dy === 0) return 'e';
  if (dx > 0 && dy > 0) return 'se';
  if (dx === 0 && dy > 0) return 's';
  if (dx < 0 && dy > 0) return 'sw';
  if (dx < 0 && dy === 0) return 'w';
  return 'nw';
}
