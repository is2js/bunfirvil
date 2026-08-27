import { fetchJson, resolveProjectUrl } from './base';
import type { CharacterKey, Direction, ProjectedPoint } from './types';

export interface EffectVariant {
  index?: number;
  direction?: { key?: string; label?: string };
  frameCount?: number;
  frameWidth?: number;
  frameHeight?: number;
  sheetUrl?: string;
  transparentSheetUrl?: string;
  frontSheetUrl?: string;
  transparentFrameUrls?: string[];
}

export interface EffectManifest {
  schemaVersion?: string;
  effectId?: string;
  displayName?: string;
  frameDurationMs?: number;
  backgroundStatus?: string;
  suggestedPlacementType?: string;
  transparentFrames?: Array<{ index?: number; width?: number; height?: number; pngUrl?: string }>;
  variants?: EffectVariant[];
  weaponOverlay?: { repeatCount?: number };
}

export interface ResolvedEffectSource {
  variant: EffectVariant | null;
  frameUrls: string[];
  sheetUrl: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
}

export interface EffectPlaybackContext {
  direction: Direction;
  characterKey: CharacterKey;
  origin: ProjectedPoint;
  target: ProjectedPoint;
}

interface PlaybackHandle {
  element: HTMLElement;
  interval: number;
  timeout: number;
  animation: Animation | null;
}

export function selectEffectVariant(manifest: EffectManifest, direction: Direction): EffectVariant | null {
  const variants = manifest.variants || [];
  return variants.find((variant) => variant.direction?.key === direction) || variants[0] || null;
}

export function resolveManifestAssetUrl(path: string, manifestUrl: string): string {
  if (!path) return '';
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  return new URL(path, manifestUrl).toString();
}

export function resolveEffectSource(
  manifest: EffectManifest,
  manifestUrl: string,
  direction: Direction,
): ResolvedEffectSource {
  const variant = selectEffectVariant(manifest, direction);
  const variantFrames = variant?.transparentFrameUrls || [];
  const manifestFrames = [...(manifest.transparentFrames || [])]
    .sort((left, right) => (left.index || 0) - (right.index || 0))
    .map((frame) => frame.pngUrl || '')
    .filter(Boolean);
  const frameUrls = (variantFrames.length > 0 ? variantFrames : manifestFrames)
    .map((path) => resolveManifestAssetUrl(path, manifestUrl));
  const sheetPath = variant?.transparentSheetUrl || variant?.sheetUrl || variant?.frontSheetUrl || '';
  return {
    variant,
    frameUrls,
    sheetUrl: resolveManifestAssetUrl(sheetPath, manifestUrl),
    frameCount: Math.max(1, variant?.frameCount || frameUrls.length || 1),
    frameWidth: Math.max(1, variant?.frameWidth || manifest.transparentFrames?.[0]?.width || 64),
    frameHeight: Math.max(1, variant?.frameHeight || manifest.transparentFrames?.[0]?.height || 64),
  };
}

export class ManifestEffectPlayer {
  private readonly manifestCache = new Map<string, Promise<EffectManifest | null>>();
  private readonly loadedAssets = new Set<string>();
  private readonly active = new Set<PlaybackHandle>();

  constructor(
    private readonly layer: HTMLElement,
    private readonly onAssetLoaded: () => void,
  ) {}

  playMany(manifestUrls: string[], context: EffectPlaybackContext): void {
    for (const manifestUrl of manifestUrls) {
      void this.playOne(manifestUrl, context).catch((error) => {
        console.warn('[bunfirvil] Exported effect fallback stays active.', error);
      });
    }
  }

  destroy(): void {
    for (const handle of this.active) this.cleanup(handle);
    this.active.clear();
  }

  private loadManifest(projectRelativeUrl: string): Promise<EffectManifest | null> {
    const manifestUrl = resolveProjectUrl(projectRelativeUrl);
    const cached = this.manifestCache.get(manifestUrl);
    if (cached) return cached;
    const request = fetchJson<EffectManifest>(manifestUrl)
      .then((manifest) => {
        this.markLoaded(manifestUrl);
        return manifest;
      })
      .catch((error) => {
        console.warn(`[bunfirvil] Effect manifest unavailable: ${manifestUrl}`, error);
        return null;
      });
    this.manifestCache.set(manifestUrl, request);
    return request;
  }

  private async playOne(projectRelativeUrl: string, context: EffectPlaybackContext): Promise<void> {
    const manifestUrl = resolveProjectUrl(projectRelativeUrl);
    const manifest = await this.loadManifest(projectRelativeUrl);
    if (!manifest) return;
    const source = resolveEffectSource(manifest, manifestUrl, context.direction);
    const firstAsset = source.frameUrls[0] || source.sheetUrl;
    if (!firstAsset || !(await this.preload(firstAsset))) return;

    const placement = manifest.suggestedPlacementType || '';
    const isProjectile = placement.includes('projectile');
    const isOverhead = placement.includes('overhead');
    const isOverlay = placement.includes('weapon_overlay');
    const anchor = isOverhead ? context.target : context.origin;
    const element = document.createElement('span');
    element.className = 'manifest-effect';
    element.dataset.effectId = manifest.effectId || 'exported-effect';
    element.dataset.placement = placement;
    element.setAttribute('aria-hidden', 'true');
    element.style.left = `${anchor.x}px`;
    element.style.top = `${anchor.y - (isOverhead ? 42 : isOverlay ? 44 : 34)}px`;
    if (manifest.backgroundStatus?.includes('additive')) element.classList.add('is-additive');
    if (isProjectile) element.classList.add('is-projectile');

    const maxSize = isOverlay ? 150 : placement.includes('aura') ? 145 : isOverhead ? 76 : 68;
    const scale = Math.min(1, maxSize / Math.max(source.frameWidth, source.frameHeight));
    element.style.width = `${Math.max(32, Math.round(source.frameWidth * scale))}px`;
    element.style.height = `${Math.max(32, Math.round(source.frameHeight * scale))}px`;

    let image: HTMLImageElement | null = null;
    if (source.frameUrls.length > 0) {
      image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = source.frameUrls[0];
      element.append(image);
    } else {
      element.style.backgroundImage = `url("${source.sheetUrl}")`;
      element.style.backgroundSize = `${source.frameCount * 100}% 100%`;
      element.style.backgroundPosition = '0 0';
    }
    this.layer.append(element);

    const repeatCount = Math.max(1, manifest.weaponOverlay?.repeatCount || 1);
    const frameCount = Math.max(1, source.frameUrls.length || source.frameCount);
    const frameDuration = Math.max(34, manifest.frameDurationMs || 100);
    const duration = frameCount * frameDuration * repeatCount;
    let frameIndex = 0;
    const interval = window.setInterval(() => {
      frameIndex = (frameIndex + 1) % frameCount;
      if (image && source.frameUrls.length > 0) {
        const nextUrl = source.frameUrls[frameIndex % source.frameUrls.length];
        image.src = nextUrl;
        void this.preload(nextUrl);
      } else if (source.sheetUrl) {
        const progress = frameCount === 1 ? 0 : frameIndex / (frameCount - 1) * 100;
        element.style.backgroundPosition = `${progress}% 0`;
      }
    }, frameDuration);

    const animation = isProjectile
      ? element.animate(
          [
            { transform: 'translate(-50%, -50%) scale(.72)', opacity: 0 },
            { offset: 0.12, opacity: 1 },
            { offset: 0.82, opacity: 1 },
            {
              transform: `translate(calc(-50% + ${context.target.x - context.origin.x}px), calc(-50% + ${context.target.y - context.origin.y}px)) scale(1.08)`,
              opacity: 0,
            },
          ],
          { duration: Math.max(420, duration), easing: 'cubic-bezier(.16,.72,.2,1)' },
        )
      : element.animate(
          [
            { transform: 'translate(-50%, -50%) scale(.78)', opacity: 0 },
            { offset: 0.14, opacity: 1 },
            { offset: 0.82, opacity: 1 },
            { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 },
          ],
          { duration, easing: 'ease-out' },
        );

    const handle: PlaybackHandle = { element, interval, timeout: 0, animation };
    handle.timeout = window.setTimeout(() => this.cleanup(handle), Math.max(450, duration) + 40);
    this.active.add(handle);
  }

  private preload(url: string): Promise<boolean> {
    if (this.loadedAssets.has(url)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        this.markLoaded(url);
        resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }

  private markLoaded(url: string): void {
    if (this.loadedAssets.has(url)) return;
    this.loadedAssets.add(url);
    this.onAssetLoaded();
  }

  private cleanup(handle: PlaybackHandle): void {
    window.clearInterval(handle.interval);
    window.clearTimeout(handle.timeout);
    handle.animation?.cancel();
    handle.element.remove();
    this.active.delete(handle);
  }
}
