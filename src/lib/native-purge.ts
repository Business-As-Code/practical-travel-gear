export function assertNativePurgeSuccess(result: { success: boolean; errors?: unknown[] }): void {
 if (!result.success) throw new Error(`Native cache purge failed: ${JSON.stringify(result.errors ?? [])}`);
}
