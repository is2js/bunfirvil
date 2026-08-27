import * as THREE from 'three';
import type { ActorState, ProjectedPoint, WorldData } from './types';

function parseColor(value: string | undefined, fallback: number): THREE.Color {
  try {
    return new THREE.Color(value || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function optionHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

export class ThreeWorldRenderer {
  readonly label = 'THREE·PBR';
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 180);
  private readonly worldRoot = new THREE.Group();
  private readonly optionRoot = new THREE.Group();
  private world: WorldData | null = null;
  private focus = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(18, 23, 18);
  private cssWidth = 1;
  private cssHeight = 1;
  private selectedOptionIds: string[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(0x07141a);
    this.scene.fog = new THREE.FogExp2(0x07141a, 0.018);
    this.scene.add(this.worldRoot, this.optionRoot);

    const hemisphere = new THREE.HemisphereLight(0xbff8ee, 0x243128, 1.65);
    const keyLight = new THREE.DirectionalLight(0xffefd0, 2.1);
    keyLight.position.set(-16, 28, 12);
    const fillLight = new THREE.DirectionalLight(0x5ad5c4, 0.8);
    fillLight.position.set(18, 10, -20);
    this.scene.add(hemisphere, keyLight, fillLight);
  }

  setWorld(world: WorldData): void {
    this.disposeGroup(this.worldRoot);
    this.disposeGroup(this.optionRoot);
    this.world = world;
    this.focus.copy(this.worldPoint(world.entry.spawn.x, world.entry.spawn.y, 0));
    this.buildGround(world);
    this.buildTiles(world);
    this.buildBlockers(world);
    this.buildObjectVolumes(world);
    this.buildOptionProps();
    this.resize();
    this.updateCamera();
  }

  setSelectedOptions(optionIds: string[]): void {
    this.selectedOptionIds = optionIds;
    this.disposeGroup(this.optionRoot);
    this.buildOptionProps();
  }

  follow(target: ActorState, smoothing = 0.095): void {
    if (!this.world) return;
    const destination = this.worldPoint(target.x, target.y, 0);
    this.focus.lerp(destination, smoothing);
    this.updateCamera();
  }

  project(x: number, y: number): ProjectedPoint {
    if (!this.world) return { x: 0, y: 0 };
    this.resize();
    this.camera.updateMatrixWorld();
    const vector = this.worldPoint(x, y, 0.78).project(this.camera);
    return {
      x: (vector.x * 0.5 + 0.5) * this.cssWidth,
      y: (-vector.y * 0.5 + 0.5) * this.cssHeight,
    };
  }

  render(time: number): void {
    this.resize();
    this.optionRoot.children.forEach((child, index) => {
      child.position.y = 0.32 + Math.sin(time / 650 + index) * 0.035;
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposeGroup(this.worldRoot);
    this.disposeGroup(this.optionRoot);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === this.cssWidth && height === this.cssHeight) return;
    this.cssWidth = width;
    this.cssHeight = height;
    this.renderer.setSize(width, height, false);
    const viewHeight = 27;
    const viewWidth = viewHeight * width / height;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(): void {
    this.camera.position.copy(this.focus).add(this.cameraOffset);
    this.camera.lookAt(this.focus.x, this.focus.y - 0.3, this.focus.z);
    this.camera.updateMatrixWorld();
  }

  private worldPoint(x: number, y: number, elevation: number): THREE.Vector3 {
    const width = this.world?.width || 64;
    const height = this.world?.height || 64;
    return new THREE.Vector3(x - width / 2 + 0.5, elevation, y - height / 2 + 0.5);
  }

  private buildGround(world: WorldData): void {
    const geometry = new THREE.PlaneGeometry(world.width + 32, world.height + 32);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x33483e,
      roughness: 0.98,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.position.y = -0.085;
    this.worldRoot.add(ground);

    const grid = new THREE.GridHelper(Math.max(world.width, world.height), Math.max(world.width, world.height), 0x3a756b, 0x23473f);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((item) => {
      item.transparent = true;
      item.opacity = 0.2;
    });
    grid.position.y = -0.035;
    this.worldRoot.add(grid);
  }

  private buildTiles(world: WorldData): void {
    const tileEntries = world.tiles.size > 0
      ? [...world.tiles.entries()]
      : Array.from({ length: world.width * world.height }, (_, index) => [`${index % world.width},${Math.floor(index / world.width)}`, 'light-soil'] as const);
    const geometry = new THREE.BoxGeometry(0.98, 0.08, 0.98);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.01,
    });
    const tiles = new THREE.InstancedMesh(geometry, material, tileEntries.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    tileEntries.forEach(([key, tileId], index) => {
      const [x, y] = key.split(',').map(Number);
      position.copy(this.worldPoint(x, y, 0));
      matrix.makeTranslation(position.x, position.y, position.z);
      tiles.setMatrixAt(index, matrix);
      const color = parseColor(world.palette.get(tileId), 0x637160);
      const variation = ((x * 13 + y * 7) % 5 - 2) * 0.018;
      color.offsetHSL(0, 0, variation);
      tiles.setColorAt(index, color);
    });
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    this.worldRoot.add(tiles);
  }

  private buildBlockers(world: WorldData): void {
    if (world.blocked.size === 0) return;
    const geometry = new THREE.BoxGeometry(0.9, 0.48, 0.9);
    const material = new THREE.MeshStandardMaterial({
      color: 0x36574f,
      roughness: 0.72,
      metalness: 0.04,
      emissive: 0x071713,
    });
    const blockers = new THREE.InstancedMesh(geometry, material, world.blocked.size);
    const matrix = new THREE.Matrix4();
    [...world.blocked].forEach((key, index) => {
      const [x, y] = key.split(',').map(Number);
      const position = this.worldPoint(x, y, 0.26);
      matrix.makeTranslation(position.x, position.y, position.z);
      blockers.setMatrixAt(index, matrix);
    });
    blockers.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(blockers);
  }

  private buildObjectVolumes(world: WorldData): void {
    for (const object of world.objects) {
      if (!object.bounds) continue;
      const x1 = Number(object.bounds.x1) || 0;
      const y1 = Number(object.bounds.y1) || 0;
      const x2 = Number(object.bounds.x2) || x1 + 1;
      const y2 = Number(object.bounds.y2) || y1 + 1;
      const width = Math.max(1, x2 - x1 + 1);
      const depth = Math.max(1, y2 - y1 + 1);
      const geometry = new THREE.BoxGeometry(width, 0.12, depth);
      const material = new THREE.MeshStandardMaterial({
        color: 0x6fcab9,
        transparent: true,
        opacity: 0.1,
        roughness: 0.45,
        metalness: 0.08,
        wireframe: true,
      });
      const volume = new THREE.Mesh(geometry, material);
      volume.position.copy(this.worldPoint(x1 + (width - 1) / 2, y1 + (depth - 1) / 2, 0.15));
      this.worldRoot.add(volume);
    }
  }

  private buildOptionProps(): void {
    if (!this.world || this.selectedOptionIds.length === 0) return;
    const bounds = this.world.objects[0]?.bounds;
    const originX = Number(bounds?.x1) || this.world.entry.spawn.x - 4;
    const originY = Number(bounds?.y1) || this.world.entry.spawn.y - 4;
    this.selectedOptionIds.forEach((id, index) => {
      const hash = optionHash(id);
      const width = 0.42 + (hash % 4) * 0.12;
      const height = 0.35 + (Math.floor(hash / 5) % 4) * 0.14;
      const depth = 0.4 + (Math.floor(hash / 17) % 4) * 0.1;
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 ? 0xe2b963 : 0x88d9c8,
        roughness: 0.38,
        metalness: 0.16,
        emissive: index % 2 ? 0x2d1b05 : 0x08221d,
        emissiveIntensity: 0.32,
      });
      const prop = new THREE.Mesh(geometry, material);
      const x = originX + 2 + ((hash + index * 3) % 10);
      const y = originY + 2 + ((Math.floor(hash / 11) + index * 2) % 8);
      prop.position.copy(this.worldPoint(x, y, 0.32));
      this.optionRoot.add(prop);
    });
  }

  private disposeGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      child.traverse((object) => {
        const renderable = object as THREE.Mesh;
        renderable.geometry?.dispose();
        const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
        materials.forEach((material) => material.dispose());
      });
      group.remove(child);
    }
  }
}
