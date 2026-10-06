/** Database/query failure is distinct from a successfully resolved missing entry. */
export function contentUnavailable(error: unknown): Response {
  console.error('Public content query failed:', error);
  return new Response('Service temporarily unavailable', { status: 503, headers: {
    'Cache-Control': 'private, no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
    'Retry-After': '5', 'X-PTG-Runtime-Unavailable': '1',
  } });
}
