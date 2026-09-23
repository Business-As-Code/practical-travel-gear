import assert from 'node:assert/strict';
import test from 'node:test';
import { wpRedirects } from '../src/data/wp-redirects.ts';

test('entire WordPress redirect graph has no self redirects or cycles', () => {
  const normalize = path => new URL(path, 'https://practicaltravelgear.com').pathname.replace(/\/$/, '') || '/';
  const graph = new Map(Object.entries(wpRedirects).map(([from, to]) => [normalize(from), normalize(to)]));
  for (const start of graph.keys()) {
    const visited = new Set();
    let current = start;
    while (graph.has(current)) {
      assert.ok(!visited.has(current), `redirect cycle from ${start}: ${[...visited, current].join(' -> ')}`);
      visited.add(current);
      current = graph.get(current);
    }
  }
});
