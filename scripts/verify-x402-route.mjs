/**
 * DCASH-7 deterministic proof (no wallet / no funding required):
 * exercises the real verify/settle route's guard behavior.
 *
 *   1. unpaid GET            -> HTTP 402 with accepts[] for Base Sepolia USDC
 *   2. body must NOT leak    -> 402 body has no `categories` (the gated content)
 *   3. garbage X-PAYMENT     -> still HTTP 402, still no body leak
 *   4. testnet guard         -> requirements pin network base-sepolia + testnet USDC
 */
import { handleX402Request, buildPaymentRequirements, resolveConfig } from "../packages/plugin-x402/src/settle.ts";

const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const env = {
	X402_PAY_TO_ADDRESS:
		process.env.X402_PAY_TO_ADDRESS || "0x000000000000000000000000000000000000dEaD",
	X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
};
const URL_ = "https://practicaltravelgear.com/api/x402/carry-on-weekend";

function assert(cond, msg) {
	if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

// 1 + 2: unpaid -> 402, no leak.
const unpaid = await handleX402Request(new Request(URL_), env);
assert(unpaid.status === 402, `unpaid should be 402, got ${unpaid.status}`);
assert(unpaid.headers.get("PAYMENT-REQUIRED"), "missing PAYMENT-REQUIRED header");
const unpaidBody = await unpaid.json();
assert(unpaidBody.x402Version === 1, "x402Version must be 1");
const offer = unpaidBody.accepts?.[0];
assert(offer?.network === "base-sepolia", `network must be base-sepolia, got ${offer?.network}`);
assert(offer?.asset?.toLowerCase() === TESTNET_USDC.toLowerCase(), "asset must be Base Sepolia testnet USDC");
assert(offer?.maxAmountRequired === "10000", "price must be 10000 (=$0.01)");
assert(unpaidBody.categories === undefined, "402 must NOT leak the gated resource body");

// 3: garbage X-PAYMENT -> still 402, no leak.
const garbage = await handleX402Request(
	new Request(URL_, { headers: { "X-PAYMENT": "not-a-valid-payment" } }),
	env,
);
assert(garbage.status === 402, `garbage payment should be 402, got ${garbage.status}`);
const garbageBody = await garbage.json();
assert(garbageBody.categories === undefined, "invalid payment must NOT leak resource body");

// 4: testnet guard on requirements.
const cfg = resolveConfig(env);
const req = buildPaymentRequirements(URL_, cfg);
assert(req.network === "base-sepolia", "requirements pinned to base-sepolia");
assert(req.asset.toLowerCase() === TESTNET_USDC.toLowerCase(), "requirements pinned to testnet USDC");

console.log("PASS: real x402 route returns 402 + Base Sepolia testnet USDC challenge,");
console.log("      rejects invalid payment, and never leaks the gated resource body.");
