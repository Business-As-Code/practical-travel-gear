/**
 * WOS-88 spike (Astro fallback): prove we can return HTTP 402 with a custom
 * PAYMENT-REQUIRED header outside the EmDash plugin route envelope.
 *
 * Real settlement (WOS-94+) will live under /api/x402/* and can share helpers
 * with packages/plugin-x402 for resource metadata / admin settings.
 */
export const prerender = false;

export async function GET() {
	const paymentRequired = {
		x402Version: 1,
		error: "spike-only",
		accepts: [
			{
				scheme: "exact",
				network: "eip155:84532",
				maxAmountRequired: "10000",
				resource: "spike:carry-on-weekend-v1",
				description: "PTG x402 header spike - not payable",
				mimeType: "application/json",
				payTo: "0x0000000000000000000000000000000000000000",
				maxTimeoutSeconds: 60,
				asset: "0x0000000000000000000000000000000000000000",
				extra: { name: "USDC", version: "spike" },
			},
		],
	};

	// ASCII-only for base64 (Workers/btoa Latin1 constraint)
	const encoded = btoa(JSON.stringify(paymentRequired));

	return new Response(
		JSON.stringify({
			error: "Payment Required",
			spike: true,
			path: "astro",
			message:
				"WOS-88: Astro route can set 402 + PAYMENT-REQUIRED (plugin routes cannot set custom headers).",
		}),
		{
			status: 402,
			headers: {
				"Content-Type": "application/json",
				"PAYMENT-REQUIRED": encoded,
				"X-PTG-X402-Spike": "1",
				"Cache-Control": "private, no-store",
			},
		},
	);
}
