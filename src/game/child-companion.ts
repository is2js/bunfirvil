import { resolveProjectUrl } from './base';
import { travelLockedDirection } from './grid';
import type { ActorState, Direction, ProjectedPoint } from './types';

export type ChildAgeGroup = 'infant' | 'elementary' | 'middle' | 'high';
export type ChildGender = 'boy' | 'girl';
export interface ChildCompanionChoice { age: ChildAgeGroup; gender: ChildGender }

export const CHILD_AGE_LABELS: Record<ChildAgeGroup, string> = {
  infant: '영유아', elementary: '초등학생', middle: '중학생', high: '고등학생',
};
export const MAX_CHILD_COMPANIONS = 6;
export const CHILD_DIRECTIONS: Direction[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export function childCompanionOffset(index: number): { x: number; y: number } {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return { x: side * (.42 + row * .11), y: .62 + row * .34 };
}

export class ChildCompanionView {
  readonly element = document.createElement('span');
  private readonly sprite = document.createElement('span');
  private lastImage = '';

  constructor(readonly choice: ChildCompanionChoice, readonly index: number) {
    this.element.className = 'child-companion';
    this.element.dataset.gender = choice.gender;
    this.element.dataset.age = choice.age;
    this.element.setAttribute('aria-label', `${index + 1}번째 자녀 · ${CHILD_AGE_LABELS[choice.age]} · ${choice.gender === 'boy' ? '남' : '녀'}`);
    this.sprite.className = 'child-companion-sprite';
    this.element.append(this.sprite);
  }

  update(actor: ActorState, point: ProjectedPoint, time: number, worldScale: number): void {
    const motion = actor.travel || actor.motion === 'walk' ? 'walk' : 'idle';
    const direction = travelLockedDirection(actor.direction, actor.travel);
    const dollId = this.choice.gender === 'boy' ? 'n021' : 'n022';
    const image = resolveProjectUrl(`assets/showcase-characters/dolls/${dollId}/${motion}-${direction}.png`);
    if (image !== this.lastImage) {
      this.lastImage = image;
      this.sprite.style.backgroundImage = `url("${image}")`;
    }
    const frames = motion === 'walk' ? 4 : 2;
    const duration = motion === 'walk' ? 250 : 360;
    const frame = Math.floor(time / duration) % frames;
    this.sprite.style.backgroundSize = `${frames * 44}px 44px`;
    this.sprite.style.backgroundPosition = `${-frame * 44}px 0`;
    const ageScale = { infant: .8, elementary: 1, middle: 1.17, high: 1.32 }[this.choice.age];
    const scale = Math.max(.55, Math.min(2.2, worldScale * ageScale));
    this.element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) scale(${scale})`;
    this.element.style.zIndex = String(1_000 + Math.round(point.y));
    this.element.dataset.motion = motion;
    this.element.dataset.direction = direction;
  }
}
