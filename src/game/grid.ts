import type { Direction } from './types';

export interface GridVector {
  dx: number;
  dy: number;
}

export interface CellTravel {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number;
  endsAt: number;
  direction?: Direction;
}

/** 원본 RPG처럼 cell travel 중에는 다음 입력이 와도 출발 방향을 유지한다. */
export function travelLockedDirection(direction: Direction, travel: CellTravel | null): Direction {
  return travel?.direction || direction;
}

export function interpolateCellTravel(travel: CellTravel, time: number): { x: number; y: number; progress: number } {
  const duration = Math.max(1, travel.endsAt - travel.startedAt);
  const progress = Math.max(0, Math.min(1, (time - travel.startedAt) / duration));
  return {
    x: travel.fromX + (travel.toX - travel.fromX) * progress,
    y: travel.fromY + (travel.toY - travel.fromY) * progress,
    progress,
  };
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
