import cloudflareProvider from '@astrojs/cloudflare/cache/provider';
import { collectInvalidationTags } from 'astro/cache/provider-utils';
import { cache } from 'cloudflare:workers';
import { assertNativePurgeSuccess } from './native-purge';
export default function factory() {
 return {...cloudflareProvider({}), async invalidate(options: Parameters<ReturnType<typeof cloudflareProvider>['invalidate']>[0]) {
  const tags=collectInvalidationTags(options);
  if (!tags.length) return;
  const result=await cache.purge({tags});
  // Vite removes this branch entirely from production artifacts.
  if (import.meta.env.PTG_STAGING) {
   const observer=(globalThis as any)[Symbol.for('ptg:staging-purge-observer')];
   if(observer) observer({tags,result});
  }
  assertNativePurgeSuccess(result);
 }};
}
