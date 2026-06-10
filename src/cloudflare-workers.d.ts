declare module "cloudflare:workers" {
	export const env: {
		DB: {
			prepare(query: string): {
				bind(...values: string[]): {
					run(): Promise<unknown>;
				};
			};
		};
	};
}
