/**
 * DCASH-7: real (testnet) x402 paywall for the PTG crawl resource.
 *
 * GET /api/x402/carry-on-weekend
 *   - no X-PAYMENT header  -> HTTP 402 challenge (accepts[] for Base Sepolia USDC)
 *   - invalid X-PAYMENT    -> HTTP 402 (body never leaked)
 *   - valid X-PAYMENT      -> facilitator verify + settle -> HTTP 200 + full JSON
 *
 * This is the verify/settle half the WOS-88 spike (spike-402.ts) was missing.
 * All settlement runs against Base Sepolia (eip155:84532) testnet USDC via an
 * open x402 facilitator. See packages/plugin-x402/src/settle.ts for the guard
 * that fails closed if anything but Base Sepolia is configured.
 *
 * Config (untracked .env): X402_PAY_TO_ADDRESS (required),
 * X402_FACILITATOR_URL (optional, defaults to the public testnet facilitator).
 */
import type { APIContext } from "astro";
import { handleX402Request, type X402Env } from "plugin-x402/settle";

export const prerender = false;

function resolveEnv(context: APIContext): X402Env {
	// Cloudflare Workers runtime env first, then Node process.env (dev / scripts).
	const runtimeEnv =
		(context.locals as { runtime?: { env?: Record<string, string> } })?.runtime?.env ?? {};
	const proc: Record<string, string | undefined> =
		typeof process !== "undefined" && process.env ? process.env : {};
	return {
		X402_PAY_TO_ADDRESS: runtimeEnv.X402_PAY_TO_ADDRESS ?? proc.X402_PAY_TO_ADDRESS,
		X402_FACILITATOR_URL: runtimeEnv.X402_FACILITATOR_URL ?? proc.X402_FACILITATOR_URL,
	};
}

export async function GET(context: APIContext): Promise<Response> {
	return handleX402Request(context.request, resolveEnv(context));
}

// Some x402 buyers re-send the paid request as POST; support both verbs.
export async function POST(context: APIContext): Promise<Response> {
	return handleX402Request(context.request, resolveEnv(context));
}
