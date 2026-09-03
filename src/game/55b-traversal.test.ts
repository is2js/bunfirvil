import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apartmentUnitWorldPoint } from './apartment-transform';
import { applyPlanVariant } from './plan-variants';
import type { ApartmentPointObject, StaticMapEntry, WorldChunk, WorldData, WorldObject } from './types';
import { canTraverse, isWalkable } from './world';

function load55BWorld(): WorldData {
  const publicRoot = resolve(process.cwd(), 'public');
  const catalog = JSON.parse(readFileSync(join(publicRoot, 'generated', 'catalog.v1.json'), 'utf8')) as { maps: StaticMapEntry[] };
  const entry = catalog.maps.find((map) => map.unitType === '55B');
  if (!entry) throw new Error('55B map is missing');
  const manifestPath = join(publicRoot, ...entry.manifestUrl.split('/'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const blocked = new Set<string>();
  const objects: WorldObject[] = [];
  for (const name of readdirSync(join(dirname(manifestPath), 'chunks')).filter((value) => value.endsWith('.json'))) {
    const chunk = JSON.parse(readFileSync(join(dirname(manifestPath), 'chunks', name), 'utf8')) as WorldChunk;
    const width = Number(chunk.size?.width || 16);
    const originX = Number(chunk.origin?.x || 0);
    const originY = Number(chunk.origin?.y || 0);
    for (const index of chunk.blockedCellIndices || []) {
      blocked.add(`${originX + index % width},${originY + Math.floor(index / width)}`);
    }
    objects.push(...(chunk.objects || []));
  }
  return {
    entry,
    manifest,
    width: entry.width,
    height: entry.height,
    chunkWidth: 16,
    chunkHeight: 16,
    palette: new Map(),
    tiles: new Map(),
    blocked,
    objects,
    loadedChunkCount: 16,
    requestedChunkCount: 16,
    minimap: null,
    sourceMode: 'chunks',
  };
}

function roomCells(apartment: WorldObject, roomId: string): string[] {
  const room = (apartment.geometry?.roomZones || []).find((value) => String((value as ApartmentPointObject).id || '') === roomId) as ApartmentPointObject;
  const bounds = Array.isArray(room?.boundsMeters) ? room.boundsMeters.map(Number) : [];
  if (bounds.length !== 4) return [];
  const cells = new Set<string>();
  for (let y = bounds[1] + .25; y <= bounds[3] - .25; y += .5) {
    for (let x = bounds[0] + .25; x <= bounds[2] - .25; x += .5) {
      const point = apartmentUnitWorldPoint(apartment, [x, y]);
      cells.add(`${Math.round(point.x)},${Math.round(point.y)}`);
    }
  }
  return [...cells];
}

function reaches(world: WorldData, starts: string[], goals: string[]): boolean {
  const goalSet = new Set(goals.filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return isWalkable(world, x, y);
  }));
  const queue = starts.filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return isWalkable(world, x, y);
  });
  const visited = new Set(queue);
  const directions = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy] as const))
    .filter(([dx, dy]) => dx !== 0 || dy !== 0);
  while (queue.length) {
    const key = queue.shift() as string;
    if (goalSet.has(key)) return true;
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of directions) {
      const next = `${x + dx},${y + dy}`;
      if (visited.has(next) || !canTraverse(world, x, y, x + dx, y + dy)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

describe('55B runtime traversal openings', () => {
  it.each(['A', 'B'] as const)('connects the %s entrance to bathroom 2 and bedroom 2', (variant) => {
    const world = load55BWorld();
    applyPlanVariant(world, variant);
    const apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1') as WorldObject;
    const starts = roomCells(apartment, 'entry');
    expect(reaches(world, starts, roomCells(apartment, 'bathroom-2'))).toBe(true);
    expect(reaches(world, starts, roomCells(apartment, 'bedroom-2'))).toBe(true);
    expect(apartment.geometry?.wallSegments?.length).toBeGreaterThan(0);
  });
});
