import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = {
  id: 'localized-byline-id', translationGroup: 'shared-credit-group', slug: 'dana-rebmann',
  displayName: 'Dana Rebmann', bio: 'Travel writer', websiteUrl: 'https://example.test',
  avatarMediaId: 'media-ulid-123', avatarStorageKey: 'authors/dana-portrait.png',
};
function authorModule(byline) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source('src/utils/authors.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    if (name === 'emdash') return { getBylineBySlug: async () => byline };
    if (name === './gravatar') return { getBylineAvatar: () => '/fallback-avatar' };
    throw new Error(`Unexpected import ${name}`);
  }});
  return exports;
}

test('populated author uses hydrated storage key, never media ID', async () => {
  const author = await authorModule(fixture).loadAuthor(fixture.slug);
  assert.equal(author.avatar, '/_emdash/api/media/file/authors/dana-portrait.png');
  assert.equal(author.name, fixture.displayName);
  assert.equal(author.bio, fixture.bio);
  assert.equal(author.websiteUrl, fixture.websiteUrl);
  assert.equal(author.featured, true);
  assert.equal(author.translationGroup, fixture.translationGroup);
  assert.equal((await authorModule({...fixture, translationGroup: null}).loadAuthor(fixture.slug)).translationGroup, fixture.id);
});

test('author archive lists published stories and guides for the shared translation group', async () => {
  // Execute the actual Astro frontmatter with only CMS/layout boundaries substituted.
  const frontmatter = source('src/pages/authors/[slug].astro').split('---')[1].replace(/^import .*;$/gm, '');
  const js = ts.transpileModule(frontmatter, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  assert.doesNotMatch(frontmatter, /getEntriesByByline|getEmDashCollection/);
  for (const byline of [fixture, {...fixture, translationGroup: null}]) {
    const expected = byline.translationGroup ?? byline.id;
    const calls = [];
    const run = new Function('Astro', 'loadAuthor', 'listCards', `return (async () => { ${js}; return {posts, guides}; })()`);
    const result = await run({params: {slug: fixture.slug}, cache: {set() {}}}, async () => ({name: fixture.displayName, translationGroup: expected}),
      async (collection, options) => {
        calls.push({collection, options});
        return {cards: [{id: `${collection}-id`, slug: `${collection}-fixture`, href: `/${collection}-fixture`, title: `Published ${collection}`}], hasMore: false};
      });
    assert.equal(result.posts.length, 1, 'populated author must list stories');
    assert.equal(result.posts[0].title, 'Published posts');
    assert.equal(result.guides.length, 1, 'populated author must list guides');
    assert.equal(result.guides[0].title, 'Published guides');
    assert.deepEqual(calls.map(c => [c.collection, c.options.bylineId, c.options.limit]), [['posts', expected, 12], ['guides', expected, 8]]);
  }
});

test('missing joined avatar falls back even if orphaned media ID exists', async () => {
  assert.equal((await authorModule({...fixture, avatarStorageKey: null}).loadAuthor(fixture.slug)).avatar, '/fallback-avatar');
  assert.equal(await authorModule(null).loadAuthor('missing'), null);
});
