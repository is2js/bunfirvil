import { apartmentUnitWorldPoint, type NumericPoint } from './apartment-transform';
import type { ActorState, ApartmentInteriorProp, WorldData, WorldObject } from './types';

type CanvasPoint = [number, number];

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function points(value: unknown): NumericPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): NumericPoint[] => Array.isArray(point) && point.length >= 2
    ? [[finite(point[0]), finite(point[1])]] : []);
}

function rowPolygon(value: unknown): NumericPoint[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const direct = points(row.footprintPolygonMeters || row.polygon);
  if (direct.length >= 3) return direct;
  const bounds = Array.isArray(row.boundsMeters) ? row.boundsMeters.map((item) => finite(item)) : [];
  return bounds.length === 4
    ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]]
    : [];
}

function propDimensions(prop: ApartmentInteriorProp): [number, number] {
  const value = prop.dimensionsMeters;
  if (Array.isArray(value)) return [finite(value[0], .7), finite(value[1], .7)];
  if (value && typeof value === 'object') return [finite(value.width, .7), finite(value.depth, .7)];
  return [.7, .7];
}

export class FloorPlanMinimap {
  private world: WorldData | null = null;
  private apartment: WorldObject | null = null;
  private background: HTMLCanvasElement | null = null;
  private lastPaint = 0;
  private bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly label: HTMLElement) {}

  setWorld(world: WorldData, variant: string): void {
    this.world = world;
    this.apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
    const apartment = this.apartment;
    const floor = apartment ? points(apartment.geometry?.floorPolygon).map((point) => apartmentUnitWorldPoint(apartment, point)) : [];
    this.bounds = floor.length >= 3 ? {
      minX: Math.min(...floor.map((point) => point.x)) - 1,
      minY: Math.min(...floor.map((point) => point.y)) - 1,
      maxX: Math.max(...floor.map((point) => point.x)) + 1,
      maxY: Math.max(...floor.map((point) => point.y)) + 1,
    } : { minX: 0, minY: 0, maxX: world.width, maxY: world.height };
    this.label.textContent = `${world.entry.unitType} · ${variant}형`;
    this.canvas.dataset.mapId = world.entry.id;
    this.canvas.dataset.planVariant = variant;
    this.canvas.dataset.floorplanReady = 'true';
    this.background = null;
    this.lastPaint = 0;
  }

  render(actors: Iterable<ActorState>, activeKey: string, time: number): void {
    if (!this.world || !this.apartment || time - this.lastPaint < 80) return;
    this.lastPaint = time;
    const context = this.resize();
    if (!context) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (!this.background || this.background.width !== this.canvas.width || this.background.height !== this.canvas.height) {
      this.background = this.paintBackground(width, height);
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(this.background, 0, 0, width, height);

    let actorCount = 0;
    for (const actor of actors) {
      actorCount += 1;
      const point = this.toCanvas({ x: actor.displayX, y: actor.displayY }, width, height);
      const active = actor.key === activeKey;
      context.beginPath(); context.arc(point[0], point[1], active ? 4.2 : 3.1, 0, Math.PI * 2);
      context.fillStyle = active ? '#ffe08a' : actor.key === '100' ? '#66d6c0' : '#e99ab0';
      context.fill(); context.lineWidth = 1.2; context.strokeStyle = '#071012'; context.stroke();
      if (active) {
        const angle = ({ n: -Math.PI / 2, ne: -Math.PI / 4, e: 0, se: Math.PI / 4, s: Math.PI / 2, sw: Math.PI * .75, w: Math.PI, nw: -Math.PI * .75 } as const)[actor.direction];
        context.beginPath(); context.moveTo(point[0], point[1]);
        context.lineTo(point[0] + Math.cos(angle) * 9, point[1] + Math.sin(angle) * 9);
        context.strokeStyle = '#ffe08a'; context.lineWidth = 1.5; context.stroke();
      }
    }
    this.canvas.dataset.actorCount = String(actorCount);
  }

  private paintBackground(width: number, height: number): HTMLCanvasElement {
    const background = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    background.width = Math.max(1, Math.round(width * dpr));
    background.height = Math.max(1, Math.round(height * dpr));
    const context = background.getContext('2d');
    const apartment = this.apartment;
    if (!context || !apartment) return background;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#081216'; context.fillRect(0, 0, width, height);
    const floor = points(apartment.geometry?.floorPolygon).map((point) => apartmentUnitWorldPoint(apartment, point));
    this.fillWorldPolygon(context, floor, 'rgba(199, 183, 164, .18)', 'rgba(231, 220, 202, .74)', 1.4, width, height);
    for (const raw of apartment.geometry?.roomZones || []) {
      const area = rowPolygon(raw).map((point) => apartmentUnitWorldPoint(apartment, point));
      this.fillWorldPolygon(context, area, 'rgba(80, 132, 119, .08)', 'rgba(105, 154, 141, .2)', .65, width, height);
    }
    for (const raw of apartment.geometry?.wallSegments || []) {
      const wall = raw as Record<string, unknown>;
      const ends = points([wall.a, wall.b]);
      if (ends.length !== 2) continue;
      const a = this.toCanvas(apartmentUnitWorldPoint(apartment, ends[0]), width, height);
      const b = this.toCanvas(apartmentUnitWorldPoint(apartment, ends[1]), width, height);
      const exterior = String(wall.kind || '').includes('exterior');
      context.strokeStyle = exterior ? '#e7ddd0' : '#8d918c'; context.lineWidth = exterior ? 2.3 : 1.25;
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    for (const prop of apartment.geometry?.interiorProps || []) this.drawProp(context, apartment, prop, width, height);
    context.fillStyle = 'rgba(190, 213, 207, .72)'; context.font = '700 7px ui-monospace, monospace'; context.textAlign = 'right'; context.fillText('N', width - 7, 10);
    context.beginPath(); context.moveTo(width - 9, 14); context.lineTo(width - 9, 23); context.strokeStyle = '#79ddc7'; context.lineWidth = 1; context.stroke();
    context.beginPath(); context.moveTo(width - 12, 17); context.lineTo(width - 9, 13); context.lineTo(width - 6, 17); context.stroke();
    return background;
  }

  private drawProp(context: CanvasRenderingContext2D, apartment: WorldObject, prop: ApartmentInteriorProp, width: number, height: number): void {
    if (!Array.isArray(prop.positionMeters)) return;
    const [sizeX, sizeY] = propDimensions(prop);
    const [x, y] = [finite(prop.positionMeters[0]), finite(prop.positionMeters[1])];
    const yaw = finite(prop.yawDeg) * Math.PI / 180;
    const corners: NumericPoint[] = [[-sizeX / 2, -sizeY / 2], [sizeX / 2, -sizeY / 2], [sizeX / 2, sizeY / 2], [-sizeX / 2, sizeY / 2]];
    const area = corners.map(([cx, cy]) => apartmentUnitWorldPoint(apartment, [x + cx * Math.cos(yaw) - cy * Math.sin(yaw), y + cx * Math.sin(yaw) + cy * Math.cos(yaw)]));
    this.fillWorldPolygon(context, area, 'rgba(229, 191, 111, .2)', 'rgba(229, 191, 111, .45)', .55, width, height);
  }

  private fillWorldPolygon(context: CanvasRenderingContext2D, area: Array<{ x: number; y: number }>, fill: string, stroke: string, lineWidth: number, width: number, height: number): void {
    if (area.length < 3) return;
    context.beginPath();
    area.forEach((point, index) => {
      const canvas = this.toCanvas(point, width, height);
      if (index === 0) context.moveTo(canvas[0], canvas[1]); else context.lineTo(canvas[0], canvas[1]);
    });
    context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke();
  }

  private toCanvas(point: { x: number; y: number }, width: number, height: number): CanvasPoint {
    const padding = 9;
    const spanX = Math.max(.1, this.bounds.maxX - this.bounds.minX);
    const spanY = Math.max(.1, this.bounds.maxY - this.bounds.minY);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    return [offsetX + (point.x - this.bounds.minX) * scale, offsetY + (point.y - this.bounds.minY) * scale];
  }

  private resize(): CanvasRenderingContext2D | null {
    const context = this.canvas.getContext('2d');
    if (!context) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
  }
}
