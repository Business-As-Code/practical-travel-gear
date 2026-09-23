/** Called only after the local publication/migration assertions succeed.
 * Fresh reads and DB state do not demonstrate native cache invalidation.
 * Keep this gate closed until a warm-cache native invalidation test is added.
 */
export function scheduledValidationReport({rows, migrations}) {
  return {
    publication: {status: 'passed', rows},
    migrations,
    nativeInvalidation: {
      status: 'unverified',
      reason: 'Native purge/invalidation must be verified against warmed caches; publication and fresh reads alone are insufficient. The local runtime probe found imported and context purge unavailable at both tested compatibility dates.',
    },
    deploymentReady: false,
    exitCode: 1,
  };
}
