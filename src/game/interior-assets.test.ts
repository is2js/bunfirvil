import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditApartmentPropPlacements } from './apartment-transform';
import { STRUCTURAL_PROP_ASSETS } from './three-world';
import type { ApartmentInteriorProp, ShowcaseCatalog, WorldChunk, WorldManifest, WorldObject } from './types';

interface OptionRuntime {
  bundangPrototypeOptionProps(geometry: NonNullable<WorldObject['geometry']>, unitType: string, selected: string[]): ApartmentInteriorProp[];
}

describe('exported interior placement contract', () => {
  it('resolves and locates every prop produced by every compatible B option', async () => {
    const publicRoot = path.join(process.cwd(), 'public');
    const catalog = JSON.parse(await readFile(path.join(publicRoot, 'generated', 'catalog.v1.json'), 'utf8')) as ShowcaseCatalog;
    expect(catalog.renderAssets).toBeTruthy();
    if (!catalog.renderAssets) throw new Error('renderAssets contract missing');
    const runtimePath = path.join(publicRoot, ...catalog.renderAssets.optionModuleUrl.split('/'));
    const runtime = await import(pathToFileURL(runtimePath).href) as OptionRuntime;
    const interiorPath = path.join(publicRoot, ...catalog.renderAssets.interiorCatalogUrl.split('/'));
    const interior = JSON.parse(await readFile(interiorPath, 'utf8')) as { assets: Array<{ assetId: string }> };
    const assetIds = new Set([
      ...interior.assets.map((asset) => asset.assetId),
      ...STRUCTURAL_PROP_ASSETS.map((asset) => asset.assetId),
    ]);
    const issues: string[] = [];

    for (const map of catalog.maps) {
      const manifestPath = path.join(publicRoot, ...map.manifestUrl.split('/'));
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as WorldManifest;
      const mapRoot = path.dirname(manifestPath);
      const objects: WorldObject[] = [];
      const chunkWidth = manifest.chunk?.width || 16;
      const chunkHeight = manifest.chunk?.height || 16;
      for (let chunkY = 0; chunkY < Math.ceil(map.height / chunkHeight); chunkY += 1) {
        for (let chunkX = 0; chunkX < Math.ceil(map.width / chunkWidth); chunkX += 1) {
          const chunk = JSON.parse(await readFile(path.join(mapRoot, 'chunks', `${chunkX}-${chunkY}.json`), 'utf8')) as WorldChunk;
          objects.push(...(chunk.objects || []));
        }
      }
      const apartment = objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry);
      expect(apartment, `${map.unitType} apartment object`).toBeTruthy();
      if (!apartment?.geometry) continue;

      const options = catalog.bOptions.filter((option) => option.compatibleUnitTypes.includes(map.unitType));
      for (const option of options) {
        const selected = [...option.requires, ...(option.requiresAny || []).slice(0, 1), option.id];
        const props = runtime.bundangPrototypeOptionProps(apartment.geometry, map.unitType, selected);
        for (const prop of props) {
          const assetId = String(prop.assetId || '');
          if (!assetIds.has(assetId)) issues.push(`${map.unitType}:${option.id}:${assetId}:missing-asset`);
        }
        for (const issue of auditApartmentPropPlacements(apartment, props).issues) {
          issues.push(`${map.unitType}:${option.id}:${issue}`);
        }
      }
    }

    expect(issues).toEqual([]);
  });
});
