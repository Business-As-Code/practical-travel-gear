/**
 * DCASH-7: server-side x402 verify + settle for the PTG "carry-on-weekend-v1"
 * crawl resource. TESTNET ONLY (Base Sepolia, eip155:84532).
 *
 * The WOS-88 spike proved we can emit an HTTP 402 challenge but had no
 * verify/settle path. This module builds that half:
 *
 *   request (no X-PAYMENT)      -> 402 challenge (accepts[] + PAYMENT-REQUIRED)
 *   request (invalid X-PAYMENT) -> 402 (never leaks the resource body)
 *   request (valid X-PAYMENT)   -> facilitator verify -> settle -> 200 + full JSON
 *
 * Settlement is delegated to an open x402 facilitator (default the public
 * testnet facilitator at https://x402.org/facilitator). The facilitator relays
 * the EIP-3009 `transferWithAuthorization` on Base Sepolia and pays gas, so the
 * buyer only needs testnet USDC — no testnet ETH.
 *
 * HARD BOUNDARY: this module must only ever be pointed at Base Sepolia. A guard
 * below throws if anything other than base-sepolia / 84532 is configured, so a
 * mainnet misconfiguration fails closed instead of moving real money.
 */
import { decodePayment } from "x402/schemes";
import { useFacilitator } from "x402/verify";
import { getUsdcAddressForChain } from "x402/shared/evm";
import type { PaymentRequirements, PaymentPayload } from "x402/types";
import { CARRY_ON_WEEKEND_V1, RESOURCE_ID, RESOURCE_SHA256 } from "./resource.ts";

/** TESTNET ONLY. x402 v1 network alias for Base Sepolia. */
export const X402_NETWORK = "base-sepolia" as const;
export const X402_CHAIN_ID = 84532 as const;
/** Price: $0.01 USDC (6 decimals) => 10000 atomic units. */
export const PRICE_ATOMIC = "10000" as const;
export const X402_VERSION = 1 as const;

export type X402Env = {
	/** Seller receiving address (payTo). Required. */
	X402_PAY_TO_ADDRESS?: string;
	/** Override facilitator base URL. Defaults to the public testnet facilitator. */
	X402_FACILITATOR_URL?: string;
};

export type ResolvedConfig = {
	payTo: string;
	facilitatorUrl: string;
};

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Fail-closed testnet guard. Throws if pointed anywhere but Base Sepolia. */
export function assertTestnet(): void {
	if (String(X402_NETWORK) !== "base-sepolia" || Number(X402_CHAIN_ID) !== 84532) {
		throw new Error(
			`x402 testnet guard: refusing to run on network=${X402_NETWORK} chainId=${X402_CHAIN_ID}. Base Sepolia only.`,
		);
	}
}

export function resolveConfig(env: X402Env): ResolvedConfig {
	assertTestnet();
	const payTo = env.X402_PAY_TO_ADDRESS?.trim();
	if (!payTo || !ADDRESS_RE.test(payTo)) {
		throw new Error(
			"x402 config error: X402_PAY_TO_ADDRESS is missing or not a 0x address. Set it in .env.",
		);
	}
	const facilitatorUrl = (env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL).replace(
		/\/$/,
		"",
	);
	return { payTo, facilitatorUrl };
}

/** Build the x402 PaymentRequirements ("accepts" entry) for the resource. */
export function buildPaymentRequirements(
	resourceUrl: string,
	cfg: ResolvedConfig,
): PaymentRequirements {
	assertTestnet();
	return {
		scheme: "exact",
		network: X402_NETWORK,
		maxAmountRequired: PRICE_ATOMIC,
		resource: resourceUrl,
		description: `PTG agent-native crawl resource: ${RESOURCE_ID}`,
		mimeType: "application/json",
		payTo: cfg.payTo,
		maxTimeoutSeconds: 60,
		asset: getUsdcAddressForChain(X402_CHAIN_ID),
		// EIP-712 domain for Base Sepolia USDC (transferWithAuthorization).
		extra: { name: "USDC", version: "2" },
		outputSchema: {
			id: RESOURCE_ID,
			sha256: RESOURCE_SHA256,
			type: "application/json",
		},
	};
}

function base64Json(value: unknown): string {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function challengeResponse(
	requirements: PaymentRequirements,
	extra: Record<string, unknown> = {},
	status = 402,
): Response {
	const body = {
		x402Version: X402_VERSION,
		error: "Payment Required",
		accepts: [requirements],
		...extra,
	};
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			// Back-compat with the WOS-88 spike marker + a machine-readable challenge.
			"PAYMENT-REQUIRED": base64Json(body),
			"X-PTG-X402": "testnet",
			"Cache-Control": "private, no-store",
		},
	});
}

/**
 * Core handler. Transport-agnostic: pass a standard Request + env.
 * Returns a standard Response. Used by the Astro route and the loop runner.
 */
export async function handleX402Request(request: Request, env: X402Env): Promise<Response> {
	assertTestnet();
	const cfg = resolveConfig(env);
	const resourceUrl = new URL(request.url).toString();
	const requirements = buildPaymentRequirements(resourceUrl, cfg);
	const { verify, settle } = useFacilitator({ url: cfg.facilitatorUrl as `${string}://${string}` });

	const header = request.headers.get("X-PAYMENT");
	if (!header) {
		// No payment presented — emit the 402 challenge, never the body.
		return challengeResponse(requirements);
	}

	// Decode the presented payment payload.
	let payload: PaymentPayload;
	try {
		payload = decodePayment(header);
	} catch (err) {
		return challengeResponse(requirements, {
			error: "Invalid X-PAYMENT payload (could not decode)",
			detail: err instanceof Error ? err.message : String(err),
		});
	}

	// Verify against the facilitator (checks signature, value, timing, balance).
	const verification = await verify(payload, requirements);
	if (!verification.isValid) {
		return challengeResponse(requirements, {
			error: "Payment verification failed",
			reason: verification.invalidReason ?? "unknown",
			payer: verification.payer,
		});
	}

	// Settle on Base Sepolia (facilitator broadcasts the transfer + pays gas).
	const settlement = await settle(payload, requirements);
	if (!settlement.success) {
		return challengeResponse(
			requirements,
			{
				error: "Payment settlement failed",
				reason: settlement.errorReason ?? "unknown",
				network: settlement.network,
			},
			502,
		);
	}

	// Paid + settled — return the full gated resource body.
	return new Response(JSON.stringify(CARRY_ON_WEEKEND_V1), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"X-PAYMENT-RESPONSE": base64Json(settlement),
			"X-PTG-X402-Settled": "1",
			"X-PTG-X402-Tx": settlement.transaction ?? "",
			"X-PTG-X402-Network": settlement.network ?? X402_NETWORK,
			"Cache-Control": "private, no-store",
		},
	});
}
