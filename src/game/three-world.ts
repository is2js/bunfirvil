import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fetchJson, resolveProjectUrl, resolveReferencedUrl } from './base';
import {
  apartmentPropPlacement,
  apartmentSolidBlockVisualFootprint,
  apartmentUnitWorldPoint,
  auditApartmentPropPlacements,
  type NumericPoint,
} from './apartment-transform';
import type {
  ActorState,
  ApartmentGeometry,
  ApartmentInteriorProp,
  ProjectedPoint,
  ShowcaseRenderAssets,
  WorldData,
  WorldObject,
} from './types';

interface RuntimePart {
  shape?: 'box' | 'cylinder' | 'vertical-cylinder' | 'ellipsoid' | 'rounded-l-shelf' | string;
  scale?: number[];
  offset?: number[];
  materialRole?: string;
}

interface RuntimeAsset {
  assetId: string;
  rendererKind?: 'glb' | 'procedural';
  defaultDimensionsMeters?: { width?: number; depth?: number; height?: number } | number[];
  mountingKind?: 'floor' | 'ceiling' | 'wall' | 'anchored' | 'room-finish' | string;
  defaultMountHeightMeters?: number;
  parts?: RuntimePart[];
  rendererRef?: { lods?: Record<string, { url?: string }> };
}

interface RuntimeInteriorCatalog {
  assets?: RuntimeAsset[];
  materialVariants?: Array<{ id?: string; primary?: string; secondary?: string; accent?: string }>;
}

interface RuntimeRecipeCatalog {
  assets?: Array<Pick<RuntimeAsset, 'assetId' | 'mountingKind' | 'defaultMountHeightMeters' | 'parts'>>;
}

interface RuntimeMaterialManifest {
  materials?: Array<{
    id?: string;
    roughness?: number;
    maps?: { diffuse?: { webp?: string; png?: string } };
  }>;
}

interface OptionRuntimeModule {
  bundangPrototypeOptionProps(
    geometry: ApartmentGeometry,
    unitTypeId: string,
    selectedIds: string[],
  ): ApartmentInteriorProp[];
}

const DEFAULT_VARIANTS: Record<string, Record<string, string>> = {
  'warm-oak-ivory': { primary: '#b58f62', secondary: '#efe9dc', accent: '#72563c' },
  'greige-fabric': { primary: '#a9a096', secondary: '#d8d0c7', accent: '#655f59' },
  'charcoal-accent': { primary: '#393b3e', secondary: '#77736e', accent: '#17191b' },
  'ivory-appliance': { primary: '#e8e5dd', secondary: '#c9c7c0', accent: '#4b5054' },
  'white-ceramic': { primary: '#f4f5f2', secondary: '#d8dcda', accent: '#9ba4a2' },
  'ceramic-white': { primary: '#f7f7f2', secondary: '#dfe3e0', accent: '#98a3a1' },
  'integrated-bidet-white': { primary: '#f8f8f4', secondary: '#e3e7e4', accent: '#aeb8b5' },
  'brushed-chrome': { primary: '#c9cece', secondary: '#eef1ef', accent: '#6f797a' },
  'new-apartment-warm-white-glass': { primary: '#ecebe4', secondary: '#b8d0cf', accent: '#d8d5ca' },
  'e-pyeonhansesang-wide-greige-oak': { primary: '#b7aa99', secondary: '#c9beae', accent: '#8f8273' },
  'golden-shore-engineered-stone': { primary: '#e3dfd4', secondary: '#f2efe7', accent: '#b8b1a2' },
  'pet-warm-ivory': { primary: '#e8e5dc', secondary: '#f5f3ec', accent: '#aaa79f' },
  'mma-sanded-goose-panel': { primary: '#8f918d', secondary: '#d4d4ce', accent: '#767974' },
  'system-ac-light-gray': { primary: '#d8dadd', secondary: '#eef0f2', accent: '#aeb3b9' },
  'system-ac-premium-light-gray': { primary: '#e4e6e8', secondary: '#f5f6f7', accent: '#b8bdc3' },
  'clear-glass-chrome': { primary: '#c9cece', secondary: '#d9f0ef', accent: '#6f797a' },
};

// 원본 three-pbr-renderer의 구조 결합형 procedural recipes. 독립 카탈로그 행이
// 아닌 샤워부스/기본 주방 마감도 일반 박스 fallback으로 뭉개지지 않게 한다.
export const STRUCTURAL_PROP_ASSETS: RuntimeAsset[] = [
  {
    assetId: 'shower-booth-glass-corner',
    rendererKind: 'procedural',
    mountingKind: 'floor',
    defaultDimensionsMeters: [0.78, 0.74, 2.05],
    parts: [
      { shape: 'box', scale: [1, 1, 0.035], offset: [0, 0, 0.0175], materialRole: 'secondary' },
      { shape: 'box', scale: [0.025, 0.94, 0.90], offset: [0.4875, -0.01, 0.48], materialRole: 'glass' },
      { shape: 'box', scale: [0.045, 0.96, 0.025], offset: [0.475, -0.01, 0.93], materialRole: 'accent' },
      { shape: 'box', scale: [0.08, 0.08, 0.72], offset: [0, -0.45, 0.42], materialRole: 'accent' },
      { shape: 'box', scale: [0.06, 0.42, 0.035], offset: [0, -0.27, 0.80], materialRole: 'accent' },
      { shape: 'cylinder', scale: [0.24, 0.12, 0.24], offset: [0, -0.10, 0.82], materialRole: 'primary' },
    ],
  },
  {
    assetId: 'kitchen-countertop-default-run',
    rendererKind: 'procedural',
    mountingKind: 'anchored',
    defaultDimensionsMeters: [1, 0.6, 0.06],
    parts: [{ shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'primary' }],
  },
  {
    assetId: 'kitchen-backsplash-default-run',
    rendererKind: 'procedural',
    mountingKind: 'anchored',
    defaultDimensionsMeters: [1, 0.035, 0.55],
    parts: [{ shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'secondary' }],
  },
  {
    assetId: 'kitchen-countertop-radianz-run', rendererKind: 'procedural', mountingKind: 'anchored',
    defaultDimensionsMeters: [1, 0.6, 0.06],
    parts: [{ shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'primary' }],
  },
  {
    assetId: 'kitchen-backsplash-radianz-run', rendererKind: 'procedural', mountingKind: 'anchored',
    defaultDimensionsMeters: [1, 0.035, 0.55],
    parts: [{ shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'secondary' }],
  },
  {
    assetId: 'interior-infinity-door-panel', rendererKind: 'procedural', mountingKind: 'wall',
    defaultDimensionsMeters: [0.9, 0.08, 2.2],
    parts: [
      { shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'primary' },
      { shape: 'box', scale: [0.018, 1.08, 0.96], offset: [-0.491, 0.04, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [0.018, 1.08, 0.96], offset: [0.491, 0.04, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [1, 1.08, 0.018], offset: [0, 0.04, 0.982], materialRole: 'secondary' },
      { shape: 'cylinder', scale: [0.035, 0.09, 0.035], offset: [0.36, 0.53, 0.52], materialRole: 'accent' },
    ],
  },
  {
    assetId: 'ceiling-smart-downlight', rendererKind: 'procedural', mountingKind: 'ceiling',
    defaultDimensionsMeters: [0.16, 0.16, 0.06],
    parts: [
      { shape: 'cylinder', scale: [1, 1, 0.36], offset: [0, 0, 0.18], materialRole: 'primary' },
      { shape: 'cylinder', scale: [0.72, 0.72, 0.16], offset: [0, 0, 0.72], materialRole: 'accent' },
      { shape: 'cylinder', scale: [0.46, 0.46, 0.08], offset: [0, 0, 0.91], materialRole: 'secondary' },
    ],
  },
  ...['built-in-oven-navien', 'built-in-oven-samsung', 'built-in-oven-lg'].map((assetId): RuntimeAsset => ({
    assetId, rendererKind: 'procedural', mountingKind: 'anchored', defaultDimensionsMeters: [0.6, 0.55, 0.6],
    parts: [
      { shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5], materialRole: 'primary' },
      { shape: 'box', scale: [0.90, 0.035, 0.68], offset: [0, 0.51, 0.45], materialRole: 'accent' },
      { shape: 'box', scale: [0.90, 0.045, 0.18], offset: [0, 0.52, 0.84], materialRole: 'secondary' },
      { shape: 'cylinder', scale: [0.055, 0.05, 0.055], offset: [0.32, 0.55, 0.84], materialRole: 'primary' },
      { shape: 'box', scale: [0.68, 0.055, 0.035], offset: [0, 0.55, 0.16], materialRole: 'secondary' },
    ],
  })),
  {
    assetId: 'refrigerator-cabinet-pet-basic', rendererKind: 'procedural', mountingKind: 'floor',
    defaultDimensionsMeters: [1.35, 0.72, 2.2],
    parts: [
      { shape: 'box', scale: [0.055, 1, 1], offset: [-0.4725, 0, 0.5], materialRole: 'primary' },
      { shape: 'box', scale: [0.055, 1, 1], offset: [0.4725, 0, 0.5], materialRole: 'primary' },
      { shape: 'box', scale: [0.89, 1, 0.16], offset: [0, 0, 0.92], materialRole: 'secondary' },
      { shape: 'box', scale: [0.89, 0.08, 0.12], offset: [0, -0.46, 0.06], materialRole: 'accent' },
    ],
  },
  {
    assetId: 'refrigerator-cabinet-bespoke-alt2', rendererKind: 'procedural', mountingKind: 'floor',
    defaultDimensionsMeters: [2.45, 0.72, 2.2],
    parts: [
      { shape: 'box', scale: [0.035, 1, 1], offset: [-0.4825, 0, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [0.035, 1, 1], offset: [0.4825, 0, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [0.93, 1, 0.12], offset: [0, 0, 0.94], materialRole: 'secondary' },
      { shape: 'box', scale: [0.30, 0.91, 0.78], offset: [-0.315, 0.035, 0.43], materialRole: 'primary' },
      { shape: 'box', scale: [0.30, 0.91, 0.78], offset: [0, 0.035, 0.43], materialRole: 'primary' },
      { shape: 'box', scale: [0.18, 0.91, 0.86], offset: [0.255, 0.035, 0.47], materialRole: 'secondary' },
      { shape: 'box', scale: [0.13, 0.91, 0.38], offset: [0.42, 0.035, 0.22], materialRole: 'primary' },
      { shape: 'box', scale: [0.13, 0.91, 0.34], offset: [0.42, 0.035, 0.70], materialRole: 'accent' },
      { shape: 'box', scale: [0.012, 0.94, 0.72], offset: [-0.16, 0.51, 0.43], materialRole: 'accent' },
      { shape: 'box', scale: [0.012, 0.94, 0.72], offset: [0.155, 0.51, 0.43], materialRole: 'accent' },
    ],
  },
  {
    assetId: 'refrigerator-cabinet-lg-built-in', rendererKind: 'procedural', mountingKind: 'floor',
    defaultDimensionsMeters: [2.45, 0.72, 2.2],
    parts: [
      { shape: 'box', scale: [0.035, 1, 1], offset: [-0.4825, 0, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [0.035, 1, 1], offset: [0.4825, 0, 0.5], materialRole: 'secondary' },
      { shape: 'box', scale: [0.93, 1, 0.12], offset: [0, 0, 0.94], materialRole: 'secondary' },
      { shape: 'box', scale: [0.50, 0.91, 0.78], offset: [-0.22, 0.035, 0.43], materialRole: 'primary' },
      { shape: 'box', scale: [0.29, 0.91, 0.78], offset: [0.20, 0.035, 0.43], materialRole: 'primary' },
      { shape: 'box', scale: [0.15, 0.91, 0.86], offset: [0.41, 0.035, 0.47], materialRole: 'secondary' },
      { shape: 'box', scale: [0.018, 0.94, 0.72], offset: [-0.22, 0.51, 0.43], materialRole: 'accent' },
      { shape: 'box', scale: [0.018, 0.94, 0.72], offset: [0.05, 0.51, 0.43], materialRole: 'accent' },
      { shape: 'box', scale: [0.018, 0.94, 0.72], offset: [0.34, 0.51, 0.43], materialRole: 'accent' },
    ],
  },
];

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function points(value: unknown): NumericPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): NumericPoint[] => (
    Array.isArray(point) && point.length >= 2
      ? [[finite(point[0]), finite(point[1])]]
      : []
  ));
}

function rowPolygon(row: Record<string, unknown>): NumericPoint[] {
  const explicit = points(row.footprintPolygonMeters || row.polygon);
  if (explicit.length >= 3) return explicit;
  const bounds = Array.isArray(row.boundsMeters) ? row.boundsMeters.map((value) => finite(value)) : [];
  if (bounds.length !== 4) return [];
  return [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]];
}

function verticalWallSpan(segment: Record<string, unknown>): { base: number; height: number } {
  const id = String(segment.id || '');
  const role = String(segment.verticalRole || '');
  const fragment = ['sill', 'lintel', 'header', 'partial'].includes(role) || /-(?:sill|lintel|header)$/.test(id);
  if (!fragment) return { base: 0, height: 2.3 };
  const base = Math.max(0, Math.min(2.3, finite(segment.baseMeters)));
  return { base, height: Math.max(0.02, Math.min(2.3 - base, finite(segment.heightMeters, 2.3 - base))) };
}

function dimensions(source: ApartmentInteriorProp, asset?: RuntimeAsset): [number, number, number] {
  const candidate = source.renderDimensionsMeters || source.dimensionsMeters || asset?.defaultDimensionsMeters;
  if (Array.isArray(candidate)) {
    return [Math.max(0.02, finite(candidate[0], 0.8)), Math.max(0.02, finite(candidate[1], 0.8)), Math.max(0.002, finite(candidate[2], 0.8))];
  }
  const value = candidate && typeof candidate === 'object' ? candidate : {};
  return [
    Math.max(0.02, finite((value as { width?: number }).width, 0.8)),
    Math.max(0.02, finite((value as { depth?: number }).depth, 0.8)),
    Math.max(0.002, finite((value as { height?: number }).height, 0.8)),
  ];
}

function disposeTree(group: THREE.Group): void {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.userData.sharedGeometry) mesh.geometry?.dispose?.();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((material) => material.dispose());
    });
    group.remove(child);
  }
}

export class ThreeWorldRenderer {
  readonly label = 'THREE·PBR·원본구조';
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 220);
  private readonly structureRoot = new THREE.Group();
  private readonly propRoot = new THREE.Group();
  private readonly modelLoader = new GLTFLoader();
  private readonly modelCache = new Map<string, Promise<THREE.Group>>();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly assets = new Map<string, RuntimeAsset>();
  private readonly variants = new Map<string, Record<string, string>>(Object.entries(DEFAULT_VARIANTS));
  private optionRuntime: OptionRuntimeModule | null = null;
  private interiorCatalogUrl = '';
  private world: WorldData | null = null;
  private apartment: WorldObject | null = null;
  private focus = new THREE.Vector3();
  // 32×24px 셀 비율이 나오는 root-y1000 등각 카메라 각도(약 48.6°).
  private readonly cameraOffset = new THREE.Vector3(18, 28.64, 18);
  private cssWidth = 1;
  private cssHeight = 1;
  private selectedOptionIds: string[] = [];
  private editorProps: ApartmentInteriorProp[] | null = null;
  private loadToken = 0;
  private propLoadToken = 0;
  private contractsReady: Promise<void>;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderAssets?: ShowcaseRenderAssets,
    private readonly onAssetLoaded: () => void = () => undefined,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color('#11100e');
    this.scene.fog = new THREE.FogExp2('#11100e', 0.009);
    this.scene.add(this.structureRoot, this.propRoot);

    const hemisphere = new THREE.HemisphereLight('#f8fafc', '#554a3f', 1.55);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(-7, 13, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    const fill = new THREE.DirectionalLight('#a5d8ff', 0.6);
    fill.position.set(12, 8, 12);
    this.scene.add(hemisphere, sun, fill);
    this.contractsReady = this.loadContracts();
  }

  setWorld(world: WorldData): void {
    this.world = world;
    this.apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
    this.focus.copy(this.worldPoint(world.entry.spawn.x, world.entry.spawn.y, 0));
    const token = ++this.loadToken;
    this.rebuildStructure();
    this.rebuildProps();
    void this.contractsReady.then(() => {
      if (token !== this.loadToken || this.world !== world) return;
      this.rebuildStructure();
      this.rebuildProps();
    });
    this.resize();
    this.updateCamera();
  }

  setSelectedOptions(optionIds: string[]): void {
    this.selectedOptionIds = [...optionIds];
    this.rebuildProps();
    void this.contractsReady.then(() => this.rebuildProps());
  }

  setEditorProps(props: ApartmentInteriorProp[] | null): void {
    this.editorProps = props ? props.map((prop) => ({ ...prop, positionMeters: [...(prop.positionMeters || [])] })) : null;
    this.rebuildProps();
    void this.contractsReady.then(() => this.rebuildProps());
  }

  focusAt(x: number, y: number): void {
    if (!this.world) return;
    this.focus.copy(this.worldPoint(x, y, 0));
    this.updateCamera();
  }

  follow(target: ActorState, smoothing = 0.095): void {
    if (!this.world) return;
    this.focus.lerp(this.worldPoint(target.displayX, target.displayY, 0), smoothing);
    this.updateCamera();
  }

  project(x: number, y: number): ProjectedPoint {
    if (!this.world) return { x: 0, y: 0 };
    this.resize();
    this.camera.updateMatrixWorld();
    const vector = this.worldPoint(x, y, 0.78).project(this.camera);
    return { x: (vector.x * 0.5 + 0.5) * this.cssWidth, y: (-vector.y * 0.5 + 0.5) * this.cssHeight };
  }

  unproject(x: number, y: number): ProjectedPoint | null {
    if (!this.world) return null;
    this.resize();
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2((x / this.cssWidth) * 2 - 1, 1 - (y / this.cssHeight) * 2), this.camera);
    const intersection = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), intersection)) return null;
    return {
      x: intersection.x + this.world.width / 2 - 0.5,
      y: intersection.z + this.world.height / 2 - 0.5,
    };
  }

  render(): void {
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    disposeTree(this.structureRoot);
    disposeTree(this.propRoot);
    this.textureCache.forEach((texture) => texture.dispose());
    this.textureCache.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private async loadContracts(): Promise<void> {
    if (!this.renderAssets) return;
    this.interiorCatalogUrl = resolveProjectUrl(this.renderAssets.interiorCatalogUrl);
    const [catalog, recipes, materialManifest, optionRuntime] = await Promise.all([
      fetchJson<RuntimeInteriorCatalog>(this.interiorCatalogUrl),
      fetchJson<RuntimeRecipeCatalog>(resolveProjectUrl(this.renderAssets.recipeCatalogUrl)),
      fetchJson<RuntimeMaterialManifest>(resolveProjectUrl(this.renderAssets.materialManifestUrl)),
      import(/* @vite-ignore */ resolveProjectUrl(this.renderAssets.optionModuleUrl)) as Promise<OptionRuntimeModule>,
    ]);
    const recipesById = new Map((recipes.assets || []).map((asset) => [asset.assetId, asset]));
    for (const asset of catalog.assets || []) {
      if (!asset.assetId) continue;
      this.assets.set(asset.assetId, { ...asset, ...recipesById.get(asset.assetId) });
    }
    for (const asset of STRUCTURAL_PROP_ASSETS) {
      if (!this.assets.has(asset.assetId)) this.assets.set(asset.assetId, asset);
    }
    this.canvas.dataset.interiorAssetCount = String(this.assets.size);
    this.canvas.dataset.recipePartCount = String(
      [...this.assets.values()].reduce((sum, asset) => sum + (asset.parts?.length || 0), 0),
    );
    for (const variant of catalog.materialVariants || []) {
      if (!variant.id) continue;
      this.variants.set(variant.id, {
        primary: variant.primary || '#b58f62',
        secondary: variant.secondary || '#efe9dc',
        accent: variant.accent || '#72563c',
      });
    }
    this.optionRuntime = optionRuntime;
    const materialUrl = resolveProjectUrl(this.renderAssets.materialManifestUrl);
    await Promise.all((materialManifest.materials || []).map(async (material) => {
      const source = material.maps?.diffuse?.webp || material.maps?.diffuse?.png;
      if (!material.id || !source) return;
      const url = resolveReferencedUrl(source, materialUrl);
      const texture = await new THREE.TextureLoader().loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      this.textureCache.set(material.id, texture);
      this.onAssetLoaded();
    }));
    this.onAssetLoaded();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === this.cssWidth && height === this.cssHeight) return;
    this.cssWidth = width;
    this.cssHeight = height;
    this.renderer.setSize(width, height, false);
    // 화면 크기가 달라도 원본 RPG의 한 셀은 항상 약 32×24 CSS px로 보인다.
    const viewHeight = height * Math.SQRT2 / 32;
    this.canvas.dataset.cellProjection = '32x24';
    const viewWidth = viewHeight * width / height;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(): void {
    this.camera.position.copy(this.focus).add(this.cameraOffset);
    this.camera.lookAt(this.focus.x, this.focus.y + 0.25, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  private worldPoint(x: number, y: number, elevation: number): THREE.Vector3 {
    const width = this.world?.width || 64;
    const height = this.world?.height || 64;
    return new THREE.Vector3(x - width / 2 + 0.5, elevation, y - height / 2 + 0.5);
  }

  private localPoint(object: WorldObject, point: NumericPoint, elevation = 0): THREE.Vector3 {
    const world = apartmentUnitWorldPoint(object, point);
    return this.worldPoint(world.x, world.y, elevation);
  }

  private shapeGeometry(object: WorldObject, polygon: NumericPoint[]): THREE.ShapeGeometry | null {
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    polygon.forEach((point, index) => {
      const world = this.localPoint(object, point);
      if (index === 0) shape.moveTo(world.x, world.z);
      else shape.lineTo(world.x, world.z);
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  private material(
    color: string,
    options: { roughness?: number; metalness?: number; opacity?: number; mapId?: string; glass?: boolean } = {},
  ): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
    if (options.glass) {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        opacity: options.opacity ?? 0.32,
        transmission: 0.35,
        thickness: 0.02,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    const opacity = options.opacity ?? 1;
    return new THREE.MeshStandardMaterial({
      color,
      map: options.mapId ? this.textureCache.get(options.mapId) || null : null,
      roughness: options.roughness ?? 0.88,
      metalness: options.metalness ?? 0.01,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 0.7,
      side: THREE.DoubleSide,
    });
  }

  private rebuildStructure(): void {
    disposeTree(this.structureRoot);
    if (!this.world) return;
    const foundation = new THREE.Mesh(
      new THREE.PlaneGeometry(this.world.width + 24, this.world.height + 24),
      this.material('#393a36', { roughness: 0.98 }),
    );
    foundation.geometry.rotateX(-Math.PI / 2);
    foundation.position.y = -0.08;
    foundation.receiveShadow = true;
    this.structureRoot.add(foundation);
    if (!this.apartment?.geometry) return;
    this.buildApartment(this.apartment);
    this.canvas.dataset.apartmentStructure = 'ready';
    this.canvas.dataset.structureMeshCount = String(this.structureRoot.children.length);
  }

  private buildApartment(object: WorldObject): void {
    const geometry = object.geometry as ApartmentGeometry;
    const floorPolygon = points(geometry.floorPolygon);
    const floorGeometry = this.shapeGeometry(object, floorPolygon);
    if (!floorGeometry) return;
    const cellSize = Math.max(0.01, finite(geometry.cellSizeMeters, 0.5));
    const floor = new THREE.Mesh(
      floorGeometry,
      this.material('#b9aa9b', { roughness: 0.86, mapId: String(geometry.materials?.wood || 'bundang-55b-greige-oak-v1') }),
    );
    floor.position.y = 0.035;
    floor.receiveShadow = false;
    floor.userData.structureKind = 'apartment-floor';
    this.structureRoot.add(floor);

    for (const roomValue of geometry.roomZones || []) {
      const room = roomValue as Record<string, unknown>;
      const polygon = rowPolygon(room);
      if (polygon.length < 3 || String(room.material || 'wood') === 'wood') continue;
      const roomGeometry = this.shapeGeometry(object, polygon);
      if (!roomGeometry) continue;
      const wet = ['tile-wet', 'tile-gray-grout'].includes(String(room.material || ''));
      const overlay = new THREE.Mesh(
        roomGeometry,
        this.material(wet ? '#aaa9a6' : '#a9a59d', {
          roughness: 0.94,
          mapId: wet ? 'bundang-55b-gray-grout-tile-v1' : undefined,
        }),
      );
      overlay.position.y = 0.052;
      overlay.receiveShadow = false;
      this.structureRoot.add(overlay);
    }

    for (const fixtureValue of geometry.kitchenFixtures || []) {
      const fixture = fixtureValue as Record<string, unknown>;
      const polygon = rowPolygon(fixture);
      if (polygon.length < 3) continue;
      const xs = polygon.map(([x]) => x);
      const ys = polygon.map(([, y]) => y);
      const x1 = Math.min(...xs); const x2 = Math.max(...xs);
      const y1 = Math.min(...ys); const y2 = Math.max(...ys);
      const center = this.localPoint(object, [(x1 + x2) / 2, (y1 + y2) / 2]);
      const totalHeight = Math.max(0.2, finite(fixture.heightMeters, 0.9)) / cellSize;
      const topHeight = Math.max(0.03, finite(fixture.countertopThicknessMeters, 0.06)) / cellSize;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(Math.abs(x2 - x1) / cellSize, totalHeight - topHeight, Math.abs(y2 - y1) / cellSize),
        this.material('#c8c5bf', { roughness: 0.78 }),
      );
      body.position.set(center.x, (totalHeight - topHeight) / 2 + 0.045, center.z);
      body.castShadow = true;
      body.receiveShadow = false;
      this.structureRoot.add(body);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(Math.abs(x2 - x1) / cellSize + 0.06, topHeight, Math.abs(y2 - y1) / cellSize + 0.06),
        this.material('#aaa8a4', { roughness: 0.58 }),
      );
      top.position.set(center.x, totalHeight - topHeight / 2 + 0.045, center.z);
      top.castShadow = true;
      top.receiveShadow = false;
      this.structureRoot.add(top);
    }

    for (const blockValue of geometry.solidBlocks || []) {
      const block = blockValue as Record<string, unknown>;
      const polygon = apartmentSolidBlockVisualFootprint(object, block);
      if (polygon.length < 3) continue;
      const shape = new THREE.Shape();
      polygon.forEach((point, index) => {
        const world = this.localPoint(object, point);
        if (index === 0) shape.moveTo(world.x, world.z); else shape.lineTo(world.x, world.z);
      });
      shape.closePath();
      const height = Math.max(0.2, finite(block.heightMeters, 2.3)) / cellSize;
      const blockGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, steps: 1, bevelEnabled: false });
      blockGeometry.rotateX(Math.PI / 2);
      blockGeometry.translate(0, height, 0);
      const mesh = new THREE.Mesh(blockGeometry, this.material('#c9c3bb', { roughness: 0.92 }));
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.structureRoot.add(mesh);
    }

    const localCenter = floorPolygon.reduce((sum, [x, y]) => ({ x: sum.x + x, y: sum.y + y }), { x: 0, y: 0 });
    localCenter.x /= Math.max(1, floorPolygon.length);
    localCenter.y /= Math.max(1, floorPolygon.length);
    for (const segmentValue of geometry.wallSegments || []) {
      const segment = segmentValue as Record<string, unknown>;
      const ends = points([segment.a, segment.b]);
      if (ends.length !== 2) continue;
      const start = this.localPoint(object, ends[0]);
      const end = this.localPoint(object, ends[1]);
      const length = Math.max(0.02, Math.hypot(end.x - start.x, end.z - start.z));
      const span = verticalWallSpan(segment);
      const height = span.height / cellSize;
      const thickness = Math.max(0.04, finite(segment.thicknessMeters, 0.12) / cellSize);
      const midpointLocal = { x: (ends[0][0] + ends[1][0]) / 2, y: (ends[0][1] + ends[1][1]) / 2 };
      const frontCutaway = String(segment.kind || '').includes('exterior')
        && (midpointLocal.x > localCenter.x + 2 || midpointLocal.y > localCenter.y + 2);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, height, thickness),
        this.material('#b8b0a7', {
          roughness: 0.94,
          mapId: String(geometry.materials?.plaster || 'bundang-55b-warm-gray-wall-v1'),
          opacity: frontCutaway ? 0.38 : 1,
        }),
      );
      mesh.position.set((start.x + end.x) / 2, span.base / cellSize + height / 2, (start.z + end.z) / 2);
      mesh.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
      mesh.castShadow = !frontCutaway;
      // 실내 벽이 전역 shadow map을 다시 받으면 카메라 이동 시 shadow-acne가 번쩍인다.
      mesh.receiveShadow = false;
      this.structureRoot.add(mesh);
    }

    for (const openingValue of geometry.openings || []) {
      const opening = openingValue as Record<string, unknown>;
      const ends = points([opening.a, opening.b]);
      if (ends.length !== 2) continue;
      const start = this.localPoint(object, ends[0]);
      const end = this.localPoint(object, ends[1]);
      const length = Math.max(0.1, Math.hypot(end.x - start.x, end.z - start.z));
      const isWindow = String(opening.type || '').includes('window');
      if (isWindow) {
        const height = Math.max(0.15, finite(opening.heightMeters, 1.2) / cellSize);
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(length, height, Math.max(0.035, finite(opening.frameThicknessMeters, 0.06) / cellSize)),
          this.material('#a9c9d4', { glass: true }),
        );
        pane.position.set((start.x + end.x) / 2, finite(opening.baseMeters, 0.9) / cellSize + height / 2, (start.z + end.z) / 2);
        pane.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
        this.structureRoot.add(pane);
        continue;
      }
      this.addDoor(object, opening, start, end, cellSize);
    }
  }

  private addDoor(object: WorldObject, opening: Record<string, unknown>, start: THREE.Vector3, end: THREE.Vector3, cellSize: number): void {
    if (opening.leafState === 'none' || opening.leafVisible === false) return;
    const width = Math.max(0.2, Math.hypot(end.x - start.x, end.z - start.z));
    const leafCount = Math.max(1, Math.min(2, Math.round(finite(opening.leafCount, 1))));
    const widthScale = Math.max(0.4, Math.min(1, finite(opening.leafWidthScale, 0.82)));
    const leafWidth = width / leafCount * widthScale;
    const height = Math.max(0.2, finite(opening.leafHeightMeters, finite(opening.heightMeters, 2.1) * 0.92) / cellSize);
    const thickness = Math.max(0.04, finite(opening.leafThicknessMeters, 0.045) / cellSize);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    for (let index = 0; index < leafCount; index += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, height, thickness), this.material('#b8afa3', { roughness: 0.68 }));
      const hinge = leafCount > 1 ? (index === 0 ? start : end) : String(opening.hingeEndpoint || 'b') === 'a' ? start : end;
      const handle = leafCount > 1 ? center : hinge === start ? end : start;
      const closed = new THREE.Vector2((handle.x - hinge.x) * widthScale, (handle.z - hinge.z) * widthScale);
      let opened = closed.clone();
      if (!['closed', 'closed-passable'].includes(String(opening.leafState || 'open'))) {
        const angle = Math.abs(finite(opening.leafOpenAngleDeg, 82)) * Math.PI / 180;
        opened.rotateAround(new THREE.Vector2(0, 0), index === 0 ? angle : -angle);
      }
      panel.position.set(hinge.x + opened.x / 2, height / 2, hinge.z + opened.y / 2);
      panel.rotation.y = -Math.atan2(opened.y, opened.x);
      panel.castShadow = true;
      panel.receiveShadow = false;
      this.structureRoot.add(panel);
    }
    void object;
  }

  private rebuildProps(): void {
    disposeTree(this.propRoot);
    const propLoadToken = ++this.propLoadToken;
    const object = this.apartment;
    const geometry = object?.geometry;
    if (!object || !geometry) return;
    const baseProps = this.optionRuntime
      ? this.optionRuntime.bundangPrototypeOptionProps(geometry, object.unitTypeId || this.world?.entry.unitType || '', this.selectedOptionIds)
      : geometry.interiorProps || [];
    const props = this.editorProps ? [...baseProps, ...this.editorProps] : baseProps;
    this.canvas.dataset.apartmentPropCount = String(props.length);
    const audit = auditApartmentPropPlacements(object, props);
    const missingAssetIds = props
      .map((prop) => String(prop.assetId || ''))
      .filter((assetId) => assetId && !this.assets.has(assetId));
    const placementIssues = [...audit.issues, ...missingAssetIds.map((assetId) => `${assetId}:missing-asset`)];
    this.canvas.dataset.interiorPlacementChecked = String(audit.checked);
    this.canvas.dataset.interiorPlacementIssueCount = String(placementIssues.length);
    this.canvas.dataset.interiorPlacementStatus = placementIssues.length ? 'warning' : 'verified';
    this.canvas.dataset.interiorPlacementIssues = placementIssues.join('|');
    for (const prop of props) void this.addProp(object, prop, propLoadToken);
  }

  private async modelTemplate(asset: RuntimeAsset): Promise<THREE.Group | null> {
    const url = asset.rendererRef?.lods?.medium?.url || asset.rendererRef?.lods?.high?.url || asset.rendererRef?.lods?.low?.url;
    if (!url || !this.interiorCatalogUrl) return null;
    const resolved = resolveReferencedUrl(url, this.interiorCatalogUrl);
    if (!this.modelCache.has(resolved)) {
      this.modelCache.set(resolved, this.modelLoader.loadAsync(resolved).then((gltf) => {
        this.onAssetLoaded();
        this.canvas.dataset.loadedGlbCount = String(this.modelCache.size);
        return gltf.scene;
      }));
    }
    return this.modelCache.get(resolved) || null;
  }

  private async addProp(object: WorldObject, prop: ApartmentInteriorProp, propLoadToken: number): Promise<void> {
    const assetId = String(prop.assetId || '');
    const asset = this.assets.get(assetId);
    const token = this.loadToken;
    let group: THREE.Group;
    try {
      const template = asset?.rendererKind === 'glb' ? await this.modelTemplate(asset) : null;
      group = template && asset ? this.modelProp(template, prop, asset) : this.proceduralProp(prop, asset);
    } catch {
      group = this.proceduralProp(prop, asset);
    }
    if (token !== this.loadToken || propLoadToken !== this.propLoadToken || object !== this.apartment) {
      disposeTree(group);
      return;
    }
    const placement = apartmentPropPlacement(object, prop);
    const center = this.worldPoint(placement.center.x, placement.center.y, 0);
    const size = dimensions(prop, asset);
    const cellSize = placement.cellSize;
    const mountingKind = asset?.mountingKind || 'floor';
    const clearHeight = finite(object.geometry?.clearHeightMeters, 2.3);
    const mountHeight = Number.isFinite(Number(prop.mountHeightMeters))
      ? Math.max(0, finite(prop.mountHeightMeters))
      : mountingKind === 'ceiling'
        ? Math.max(0, clearHeight - size[2])
        : mountingKind === 'room-finish'
          ? 0.002
          : ['wall', 'anchored'].includes(mountingKind)
            ? Math.max(0, finite(asset?.defaultMountHeightMeters))
            : 0.018;
    const baseY = mountingKind === 'room-finish' ? 0.038 : mountHeight / cellSize;
    group.position.set(center.x, baseY, center.z);
    group.rotation.y = placement.worldYaw;
    group.renderOrder = mountingKind === 'room-finish' ? 3.04 : 3.1;
    this.propRoot.add(group);
  }

  private modelProp(template: THREE.Group, prop: ApartmentInteriorProp, asset: RuntimeAsset): THREE.Group {
    const group = template.clone(true);
    const palette = this.palette(prop.materialVariantId);
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = prop.mirrored ? this.reflectedGeometry(mesh.geometry) : mesh.geometry.clone();
      mesh.material = this.material(palette.primary, { roughness: 0.82 });
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    });
    const target = dimensions(prop, asset);
    const cellSize = Math.max(0.01, finite(this.apartment?.geometry?.cellSizeMeters, 0.5));
    const box = new THREE.Box3().setFromObject(group);
    const source = box.getSize(new THREE.Vector3());
    group.scale.set(
      target[0] / cellSize / Math.max(0.001, source.x),
      target[2] / cellSize / Math.max(0.001, source.y),
      target[1] / cellSize / Math.max(0.001, source.z),
    );
    const scaled = new THREE.Box3().setFromObject(group);
    group.position.y -= scaled.min.y;
    return group;
  }

  private proceduralProp(prop: ApartmentInteriorProp, asset?: RuntimeAsset): THREE.Group {
    const group = new THREE.Group();
    const size = dimensions(prop, asset);
    const cellSize = Math.max(0.01, finite(this.apartment?.geometry?.cellSizeMeters, 0.5));
    const palette = this.palette(prop.materialVariantId);
    const roomFinish = asset?.mountingKind === 'room-finish';
    for (const part of asset?.parts?.length ? asset.parts : [{ shape: 'box', scale: [1, 1, 1], offset: [0, 0, 0.5] }]) {
      const width = size[0] * finite(part.scale?.[0], 1) / cellSize;
      const depth = size[1] * finite(part.scale?.[1], 1) / cellSize;
      const height = size[2] * finite(part.scale?.[2], 1) / cellSize;
      const shape = String(part.shape || 'box');
      let geometry: THREE.BufferGeometry;
      if (shape === 'vertical-cylinder') {
        const radius = Math.max(0.02, Math.min(width, depth) / 2);
        geometry = new THREE.CylinderGeometry(radius, radius, Math.max(0.02, height), 18);
      } else if (shape === 'cylinder') {
        const radius = Math.max(0.02, Math.min(width, height) / 2);
        geometry = new THREE.CylinderGeometry(radius, radius, Math.max(0.02, depth), 18);
        geometry.rotateX(Math.PI / 2);
      } else if (shape === 'ellipsoid') {
        geometry = new THREE.SphereGeometry(0.5, 20, 12);
        geometry.scale(width, height, depth);
      } else if (shape === 'rounded-l-shelf') {
        geometry = this.roundedShelf(width, depth, height);
      } else {
        geometry = new THREE.BoxGeometry(Math.max(0.02, width), Math.max(roomFinish ? 0.002 : 0.02, height), Math.max(0.02, depth));
      }
      const finalGeometry = prop.mirrored ? this.reflectedGeometry(geometry) : geometry;
      if (prop.mirrored) geometry.dispose();
      const role = String(part.materialRole || 'primary');
      const material = role === 'glass'
        ? this.material('#d9f0ef', { glass: true })
        : this.material(palette[role] || palette.primary, { roughness: prop.materialVariantId === 'charcoal-accent' ? 0.62 : 0.88 });
      if (roomFinish) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
      }
      const mesh = new THREE.Mesh(finalGeometry, material);
      mesh.position.set(
        size[0] * finite(part.offset?.[0]) * (prop.mirrored ? -1 : 1) / cellSize,
        size[2] * finite(part.offset?.[2], 0.5) / cellSize,
        size[1] * finite(part.offset?.[1]) / cellSize,
      );
      mesh.castShadow = !roomFinish && role !== 'glass';
      mesh.receiveShadow = false;
      group.add(mesh);
    }
    return group;
  }

  /** 원본 interior preview와 같은 winding-safe X축 반사. */
  private reflectedGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
    const geometry = source.clone();
    const position = geometry.attributes.position;
    for (let index = 0; position && index < position.count; index += 1) {
      position.setX(index, -position.getX(index));
    }
    const normal = geometry.attributes.normal;
    for (let index = 0; normal && index < normal.count; index += 1) {
      normal.setX(index, -normal.getX(index));
    }
    if (geometry.index) {
      const indices = geometry.index.array;
      for (let index = 0; index + 2 < indices.length; index += 3) {
        const second = indices[index + 1];
        indices[index + 1] = indices[index + 2];
        indices[index + 2] = second;
      }
      geometry.index.needsUpdate = true;
    }
    if (position) position.needsUpdate = true;
    if (normal) normal.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private roundedShelf(width: number, depth: number, height: number): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-width * 0.5, -depth * 0.5);
    shape.lineTo(width * 0.5, -depth * 0.5);
    shape.lineTo(width * 0.5, -depth * 0.1);
    shape.lineTo(-width * 0.08, -depth * 0.1);
    shape.quadraticCurveTo(-width * 0.26, -depth * 0.1, -width * 0.26, depth * 0.08);
    shape.lineTo(-width * 0.26, depth * 0.5);
    shape.lineTo(-width * 0.5, depth * 0.5);
    shape.closePath();
    const bevel = Math.max(0.002, Math.min(width, depth, height) * 0.08);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, height), steps: 1, curveSegments: 8, bevelEnabled: true, bevelSegments: 2, bevelSize: bevel, bevelThickness: bevel });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -height / 2, 0);
    return geometry;
  }

  private palette(variantId: unknown): Record<string, string> {
    return this.variants.get(String(variantId || '')) || this.variants.get('warm-oak-ivory') || DEFAULT_VARIANTS['warm-oak-ivory'];
  }
}
