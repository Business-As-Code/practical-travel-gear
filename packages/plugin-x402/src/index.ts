import type { PluginDescriptor } from "emdash";

/**
 * x402 payment plugin for agent-native digital resources.
 *
 * Must run trusted (plugins: []), not sandboxed — facilitator verify/settle
 * exceeds sandbox CPU/subrequest limits.
 */
export function x402Plugin(): PluginDescriptor {
	return {
		id: "x402",
		version: "0.1.0",
		format: "standard",
		entrypoint: "plugin-x402/sandbox",
		options: {},
		// network:fetch for facilitator hosts; no content/customer capabilities
		capabilities: ["network:fetch"],
		allowedHosts: [
			"x402.org",
			"*.x402.org",
			"api.cdp.coinbase.com",
			"*.coinbase.com",
		],
		adminPages: [
			{ path: "/settings", label: "x402 Settings", icon: "credit-card" },
		],
	};
}
