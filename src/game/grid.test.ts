import { describe, expect, it } from 'vitest';
import { screenDirection, screenVectorToWorldDelta } from './grid';

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
});
