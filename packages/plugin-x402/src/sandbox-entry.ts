import { PluginRouteError } from "emdash";
import type { PluginContext, SandboxedPlugin } from "emdash/plugin";
import {
	CARRY_ON_WEEKEND_V1,
	RESOURCE_ID,
	RESOURCE_SHA256,
} from "./resource";

/**
 * Runtime entry for plugin-x402.
 * Payment settlement lands in later issues (WOS-94+). This scaffold exposes:
 * - public status (health)
 * - public spike-402 (WOS-88 header probe)
 * - public resource metadata (hash only until paid path ships)
 * - admin settings shell
 */

type KvLike = {
	get: <T>(key: string) => Promise<T | null | undefined>;
	set: (key: string, value: unknown) => Promise<void>;
};

async function isEnabled(ctx: PluginContext): Promise<boolean> {
	const kv = ctx.kv as KvLike | undefined;
	if (!kv?.get) return true;
	const flag = await kv.get<boolean>("settings:enabled");
	return flag !== false;
}

function buildSettingsPage(ctx: PluginContext) {
	return {
		blocks: [
			{ type: "header", text: "x402 Settings" },
			{
				type: "section",
				text: "Trusted plugin for agent-native paid resources. Settlement wiring ships after the 402 header spike (WOS-88 / WOS-94).",
			},
			{
				type: "section",
				text: `Crawl resource: \`${RESOURCE_ID}\` · SHA-256 \`${RESOURCE_SHA256.slice(0, 16)}…\``,
			},
			{
				type: "section",
				text: `Plugin: ${ctx.plugin?.id ?? "x402"} · receive-only address and network configured in later issues. No private keys stored here.`,
			},
		],
	};
}

export default {
	routes: {
		/** Health / discovery stub — no payment yet. */
		status: {
			public: true,
			handler: async (_routeCtx: any, ctx: PluginContext) => {
				const enabled = await isEnabled(ctx);
				return {
					ok: true,
					plugin: "x402",
					version: "0.1.0",
					enabled,
					resource: {
						id: RESOURCE_ID,
						sha256: RESOURCE_SHA256,
						paid: false,
						note: "Paid fulfillment not wired yet (WOS-94).",
					},
				};
			},
		},

		/**
		 * WOS-88 spike: EmDash plugin routes support custom *status* via
		 * PluginRouteError, but responses are wrapped by apiError/apiSuccess
		 * and do NOT allow arbitrary headers (PAYMENT-REQUIRED cannot be set here).
		 * Real x402 settlement must use an Astro/API route (see src/pages/api/x402/).
		 */
		"spike-402": {
			public: true,
			handler: async () => {
				throw new PluginRouteError(
					"PAYMENT_REQUIRED",
					"Payment Required (plugin spike: status only, no custom headers)",
					402,
					{
						spike: true,
						note: "Plugin routes cannot set PAYMENT-REQUIRED header; use Astro /api/x402 fallback for real x402.",
						resource: RESOURCE_ID,
						accepts: [
							{
								scheme: "exact",
								network: "eip155:84532",
								price: "$0.01",
							},
						],
					},
				);
			},
		},

		/**
		 * Unpaid metadata only. Body of the crawl resource is withheld until
		 * settlement is implemented (never serve full JSON free long-term).
		 */
		resource: {
			public: true,
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const enabled = await isEnabled(ctx);
				if (!enabled) {
					throw new Response(JSON.stringify({ error: "x402 plugin disabled" }), {
						status: 503,
						headers: { "Content-Type": "application/json" },
					});
				}

				const reqUrl = routeCtx?.request?.url as string | undefined;
				const url = reqUrl ? new URL(reqUrl) : null;
				const id = url?.searchParams.get("id") ?? RESOURCE_ID;

				if (id !== RESOURCE_ID) {
					throw new Response(JSON.stringify({ error: "unknown resource" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}

				// Preview shape only — full body gated after WOS-94.
				return {
					id: CARRY_ON_WEEKEND_V1.id,
					title: CARRY_ON_WEEKEND_V1.title,
					version: CARRY_ON_WEEKEND_V1.version,
					updated_at: CARRY_ON_WEEKEND_V1.updated_at,
					sha256: RESOURCE_SHA256,
					paid_required: true,
					price: "$0.01",
					note: "Full JSON after successful x402 settlement (not implemented yet).",
				};
			},
		},

		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input ?? {};
				if (
					interaction.type === "page_load" &&
					interaction.page === "/settings"
				) {
					return buildSettingsPage(ctx);
				}
				return { blocks: [] };
			},
		},
	},
} satisfies SandboxedPlugin;
