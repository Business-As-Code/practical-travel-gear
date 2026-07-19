/**
 * DCASH-7: standalone x402 BUYER agent (TESTNET ONLY).
 *
 * Simulates an AI buyer paying for the PTG crawl resource:
 *   1. request the resource (no payment)          -> receives HTTP 402 + accepts[]
 *   2. sign an EIP-3009 transferWithAuthorization  (Base Sepolia testnet USDC)
 *   3. re-request with X-PAYMENT header            -> receives the resource JSON
 *
 * Uses Coinbase's x402 TS client helpers (createSigner + createPaymentHeader),
 * which build and sign the exact EIP-3009 authorization with viem under the hood.
 *
 * Two transport modes:
 *   - default: drive the server handler in-process (no HTTP server needed) — the
 *     same handleX402Request the Astro route calls. Proves the full server path.
 *   - --http <baseUrl>: hit a running server over HTTP instead.
 *
 * Env (from .env): X402_BUYER_PRIVATE_KEY, X402_PAY_TO_ADDRESS, X402_FACILITATOR_URL.
 */
import { createSigner } from "x402/types";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";
import { handleX402Request } from "../packages/plugin-x402/src/settle.ts";
import { X402_NETWORK } from "../packages/plugin-x402/src/settle.ts";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");
const RESOURCE_URL = "https://practicaltravelgear.com/api/x402/carry-on-weekend";

// Minimal .env loader (avoids adding a dotenv dependency).
function loadEnv() {
	if (!existsSync(ENV_PATH)) throw new Error(".env not found — run: node scripts/x402-gen-wallet.mjs");
	for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
	}
}

const httpFlagIdx = process.argv.indexOf("--http");
const httpBase = httpFlagIdx !== -1 ? process.argv[httpFlagIdx + 1] : null;

function log(step, msg, obj) {
	console.log(`\n[buyer] ${step}: ${msg}`);
	if (obj !== undefined) console.log(JSON.stringify(obj, null, 2));
}

async function doRequest(headers) {
	if (httpBase) {
		const url = httpBase.replace(/\/$/, "") + "/api/x402/carry-on-weekend";
		return fetch(url, { headers });
	}
	// In-process: build a Request and call the real server handler.
	const req = new Request(RESOURCE_URL, { headers });
	return handleX402Request(req, {
		X402_PAY_TO_ADDRESS: process.env.X402_PAY_TO_ADDRESS,
		X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
	});
}

async function main() {
	loadEnv();
	const pk = process.env.X402_BUYER_PRIVATE_KEY;
	if (!pk) throw new Error("X402_BUYER_PRIVATE_KEY missing in .env");

	// Step 1: unpaid request -> expect 402.
	const first = await doRequest({ Accept: "application/json" });
	const firstBody = await first.json();
	log("step 1", `unpaid request -> HTTP ${first.status}`, firstBody);
	if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}`);

	const accepts = firstBody.accepts ?? [];
	if (!accepts.length) throw new Error("402 challenge had no accepts[]");
	const requirements = selectPaymentRequirements(accepts, X402_NETWORK, "exact");
	log("step 1", "selected payment requirements", requirements);

	// Step 2: sign the EIP-3009 authorization + build the X-PAYMENT header.
	const signer = await createSigner(X402_NETWORK, pk);
	log("step 2", `signing EIP-3009 transferWithAuthorization as ${signer.account?.address ?? signer.address}`);
	const paymentHeader = await createPaymentHeader(signer, firstBody.x402Version ?? 1, requirements);
	log("step 2", "built X-PAYMENT header (base64)", { length: paymentHeader.length, preview: paymentHeader.slice(0, 48) + "…" });

	// Step 3: re-request with payment -> expect 200 + resource.
	const paid = await doRequest({ Accept: "application/json", "X-PAYMENT": paymentHeader });
	const settleHeader = paid.headers.get("X-PAYMENT-RESPONSE");
	const txHeader = paid.headers.get("X-PTG-X402-Tx");
	const paidBody = await paid.json();
	log("step 3", `paid request -> HTTP ${paid.status}`, paidBody);

	if (paid.status === 200) {
		const settle = settleHeader ? JSON.parse(Buffer.from(settleHeader, "base64").toString("utf8")) : null;
		console.log("\n==================== LOOP RESULT: SUCCESS ====================");
		console.log("Resource returned  :", paidBody.id, "-", paidBody.title);
		console.log("Settlement tx hash :", txHeader || settle?.transaction);
		console.log("Network            :", settle?.network);
		console.log("Explorer           : https://sepolia.basescan.org/tx/" + (txHeader || settle?.transaction));
		console.log("=============================================================");
		process.exit(0);
	} else {
		console.log("\n==================== LOOP RESULT: NOT SETTLED ====================");
		console.log("HTTP status :", paid.status);
		console.log("reason      :", paidBody.reason ?? paidBody.error);
		console.log("payer       :", paidBody.payer);
		console.log("(If reason is insufficient_funds the wiring is correct — the buyer");
		console.log(" wallet just needs Base Sepolia testnet USDC. Fund and re-run.)");
		console.log("=================================================================");
		process.exit(2);
	}
}

main().catch((err) => {
	console.error("\n[buyer] FAILED:", err?.stack || err?.message || err);
	process.exit(1);
});
