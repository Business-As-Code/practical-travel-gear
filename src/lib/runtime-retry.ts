/** Retry one safe read after a marked CMS/backend failure; never replay mutations. */
export async function fetchWithRuntimeRetry(request: Request, fetch: () => Promise<Response>): Promise<Response> {
  const response = await fetch();
  if (!['GET', 'HEAD'].includes(request.method) || request.signal.aborted ||
    response.status !== 503 || response.headers.get('X-PTG-Runtime-Unavailable') !== '1') return response;
  await response.body?.cancel();
  return fetch();
}
