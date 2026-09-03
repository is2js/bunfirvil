import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guideDocuments } from './catalog';

describe('guide access contract', () => {
  it('keeps every authoring control hidden until an operator session reveals it', () => {
    const html = readFileSync(resolve(process.cwd(), 'guides/index.html'), 'utf8');
    const operatorElements = html.match(/<[^>]+data-operator-only[^>]*>/g) || [];
    expect(operatorElements.length).toBeGreaterThanOrEqual(7);
    expect(operatorElements.every((element) => /\shidden(?:\s|>|=)/.test(element))).toBe(true);
  });

  it('registers the committed-site preview as an operator-only document', () => {
    const guide = guideDocuments().find((candidate) => candidate.id === 'local-committed-preview-admin');
    expect(guide).toMatchObject({ operatorOnly: true, category: '운영자' });
    expect(guide?.body).toContain('git archive HEAD');
  });
});
