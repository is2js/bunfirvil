import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHILD_AGE_LABELS, CHILD_DIRECTIONS, MAX_CHILD_COMPANIONS, childCompanionOffset } from './child-companion';

describe('showcase child companions', () => {
  it('supports four age groups, both PVP doll directions, and a bounded group', () => {
    expect(Object.values(CHILD_AGE_LABELS)).toEqual(['영유아', '초등학생', '중학생', '고등학생']);
    expect(CHILD_DIRECTIONS).toHaveLength(8);
    expect(MAX_CHILD_COMPANIONS).toBe(6);
  });

  it('fans multiple companions behind the actor instead of overlapping them', () => {
    const offsets = Array.from({ length: MAX_CHILD_COMPANIONS }, (_, index) => childCompanionOffset(index));
    expect(new Set(offsets.map((offset) => `${offset.x}:${offset.y}`)).size).toBe(MAX_CHILD_COMPANIONS);
    expect(offsets.every((offset) => offset.y > 0)).toBe(true);
  });

  it('ships the selected PVP actor motions and both eight-direction doll sheets', () => {
    const publicRoot = resolve(process.cwd(), 'public/assets/showcase-characters');
    for (const actor of ['100', '200']) {
      const actorRoot = resolve(publicRoot, actor);
      const manifest = JSON.parse(readFileSync(resolve(actorRoot, 'animation.json'), 'utf8'));
      for (const [motion, action] of [['idle', 'normal'], ['walk', 'normal'], ['attack', 'fist1'], ['cast', 'normal']]) {
        expect(existsSync(resolve(actorRoot, manifest.motions[motion].actions[action].sheet)), `${actor}:${motion}`).toBe(true);
      }
    }
    for (const doll of ['n021', 'n022']) {
      for (const motion of ['idle', 'walk']) {
        for (const direction of CHILD_DIRECTIONS) {
          expect(existsSync(resolve(publicRoot, 'dolls', doll, `${motion}-${direction}.png`)), `${doll}:${motion}:${direction}`).toBe(true);
        }
      }
    }
  });
});
