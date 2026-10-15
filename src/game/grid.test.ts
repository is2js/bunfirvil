import { describe, expect, it } from 'vitest';
import { interpolateCellTravel, MovementInputIntent, screenDirection, screenVectorToWorldDelta } from './grid';

describe('root /rpg canonical diagonal grid', () => {
  it.each([
    ['D/오른쪽', 1, 0, { dx: 1, dy: -1 }, 'e'],
    ['A/왼쪽', -1, 0, { dx: -1, dy: 1 }, 'w'],
    ['W/위', 0, -1, { dx: -1, dy: -1 }, 'n'],
    ['S/아래', 0, 1, { dx: 1, dy: 1 }, 's'],
    ['W+D', 1, -1, { dx: 0, dy: -1 }, 'ne'],
    ['W+A', -1, -1, { dx: -1, dy: 0 }, 'nw'],
    ['S+D', 1, 1, { dx: 1, dy: 0 }, 'se'],
    ['S+A', -1, 1, { dx: 0, dy: 1 }, 'sw'],
  ] as const)('%s 입력을 screen cardinal로 유지한다', (_label, x, y, world, direction) => {
    expect(screenVectorToWorldDelta(x, y)).toEqual(world);
    expect(screenDirection(x, y)).toBe(direction);
  });

  it('한 셀을 420ms 보행 주기 전체에 걸쳐 선형 이동한다', () => {
    const travel = { fromX: 4, fromY: 8, toX: 5, toY: 7, startedAt: 1_000, endsAt: 1_420 };
    expect(interpolateCellTravel(travel, 1_000)).toEqual({ x: 4, y: 8, progress: 0 });
    expect(interpolateCellTravel(travel, 1_210)).toEqual({ x: 4.5, y: 7.5, progress: 0.5 });
    expect(interpolateCellTravel(travel, 1_420)).toEqual({ x: 5, y: 7, progress: 1 });
  });

  it.each([[1, -1], [-1, -1], [1, 1], [-1, 1]])('대각선 %s,%s의 순차 키 해제를 새 방향으로 처리하지 않는다', (x, y) => {
    for (const remaining of [{ x, y: 0 }, { x: 0, y }]) {
      const input = new MovementInputIntent();
      expect(input.resolve(x, y, 0)).toEqual({ x, y });
      expect(input.resolve(remaining.x, remaining.y, 20)).toEqual({ x: 0, y: 0 });
      expect(input.resolve(0, 0, 45)).toEqual({ x: 0, y: 0 });
      expect(input.resolve(remaining.x, remaining.y, 100)).toEqual(remaining);
    }
  });

  it('한 키를 계속 누르면 정상 방향 전환을 허용하고 새 대각선 입력은 지연하지 않는다', () => {
    const input = new MovementInputIntent();
    input.resolve(1, -1, 0);
    expect(input.resolve(1, 0, 10)).toEqual({ x: 0, y: 0 });
    expect(input.resolve(1, 0, 89)).toEqual({ x: 0, y: 0 });
    expect(input.resolve(1, 0, 90)).toEqual({ x: 1, y: 0 });
    expect(input.resolve(1, 1, 91)).toEqual({ x: 1, y: 1 });
    expect(input.resolve(-1, 0, 92)).toEqual({ x: -1, y: 0 });
  });
});
