import { fetchJson, resolveProjectUrl, resolveReferencedUrl } from './base';
import type {
  ActorState,
  CharacterManifest,
  ProjectedPoint,
  StaticCharacterEntry,
} from './types';

export class ActorView {
  readonly element: HTMLButtonElement;
  private readonly sprite: HTMLSpanElement;
  private readonly motionLabel: HTMLSpanElement;
  private manifest: CharacterManifest | null = null;
  private manifestUrl = '';
  private lastSheet = '';

  constructor(
    readonly entry: StaticCharacterEntry,
    private readonly onSelect: (key: '100' | '200') => void,
  ) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `rpg-actor rpg-actor--${entry.key}`;
    element.dataset.actor = entry.key;
    element.setAttribute('aria-label', `${entry.label} 조작`);
    element.innerHTML = `
      <span class="actor-shadow" aria-hidden="true"></span>
      <span class="actor-select-ring" aria-hidden="true"></span>
      <span class="actor-sprite" aria-hidden="true"><span class="actor-fallback">${entry.key}</span></span>
      <span class="actor-meta">
        <span class="actor-name">${entry.label}</span>
        <span class="actor-health"><i></i></span>
        <span class="actor-motion">IDLE</span>
      </span>
    `;
    this.element = element;
    this.sprite = element.querySelector<HTMLElement>('.actor-sprite') as HTMLSpanElement;
    this.motionLabel = element.querySelector<HTMLElement>('.actor-motion') as HTMLSpanElement;
    element.addEventListener('click', () => this.onSelect(entry.key));
  }

  async load(onAssetLoaded: () => void): Promise<void> {
    this.manifestUrl = resolveProjectUrl(this.entry.manifestUrl);
    try {
      this.manifest = await fetchJson<CharacterManifest>(this.manifestUrl);
      onAssetLoaded();
      this.element.classList.add('has-sprite');
    } catch (error) {
      console.warn(`[bunfirvil] Character ${this.entry.key} uses CSS fallback.`, error);
    }
  }

  setSelected(selected: boolean): void {
    this.element.classList.toggle('is-selected', selected);
    this.element.setAttribute('aria-pressed', String(selected));
  }

  update(actor: ActorState, point: ProjectedPoint, time: number): void {
    this.element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    this.element.style.zIndex = String(1_000 + Math.round(point.y));
    this.element.dataset.direction = actor.direction;
    this.element.dataset.motion = actor.motion;
    this.element.dataset.worldX = String(actor.x);
    this.element.dataset.worldY = String(actor.y);
    this.motionLabel.textContent = actor.motion.toUpperCase();

    if (!this.manifest) return;
    const motion = this.manifest.motions?.[actor.motion] || this.manifest.motions?.idle;
    if (!motion?.actions) return;
    const defaultAction = this.manifest.defaultActions?.[actor.motion];
    const action = (defaultAction && motion.actions[defaultAction]) || Object.values(motion.actions)[0];
    if (!action?.sheet) return;

    const columns = Math.max(1, action.sheetColumns || action.frameCount || 1);
    const rows = Math.max(1, action.sheetRows || this.manifest.directions?.length || 8);
    const duration = Math.max(120, motion.durationMs || (actor.motion === 'walk' ? 640 : 1_000));
    const frameCount = Math.max(1, Math.min(columns, action.frameCount || columns));
    const frame = Math.floor((time % duration) / duration * frameCount) % frameCount;
    const directionOrder = this.manifest.directions || ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const row = Math.max(0, directionOrder.indexOf(actor.direction));
    const sheetUrl = resolveReferencedUrl(action.sheet, this.manifestUrl);

    if (sheetUrl !== this.lastSheet) {
      this.lastSheet = sheetUrl;
      this.sprite.style.backgroundImage = `url("${sheetUrl}")`;
    }
    this.sprite.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    this.sprite.style.backgroundPosition = `${columns === 1 ? 0 : (frame / (columns - 1)) * 100}% ${rows === 1 ? 0 : (row / (rows - 1)) * 100}%`;
  }
}
