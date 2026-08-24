/**
 * DCASH-7: generate a FRESH Base Sepolia TESTNET wallet for the x402 buyer,
 * plus a seller receiving (payTo) address. Keys are written ONLY to the
 * untracked .env file (repo .gitignore excludes .env / .env.*).
 *
 * TESTNET ONLY. This key must never hold real funds. Never commit .env.
 *
 * Usage:
 *   node scripts/x402-gen-wallet.mjs          # create .env if absent
 *   node scripts/x402-gen-wallet.mjs --force  # overwrite existing wallet vars
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");
const force = process.argv.includes("--force");

function parseEnv(text) {
	const out = {};
	for (const line of text.split("\n")) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m) out[m[1]] = m[2];
	}
	return out;
}

let existing = {};
if (existsSync(ENV_PATH)) existing = parseEnv(readFileSync(ENV_PATH, "utf8"));

if (existing.X402_BUYER_PRIVATE_KEY && !force) {
	const acct = privateKeyToAccount(existing.X402_BUYER_PRIVATE_KEY);
	console.log("Wallet already present in .env (use --force to regenerate).");
	console.log("Buyer address :", acct.address);
	console.log("PayTo address :", existing.X402_PAY_TO_ADDRESS ?? "(unset)");
	process.exit(0);
}

const buyerKey = generatePrivateKey();
const buyer = privateKeyToAccount(buyerKey);
const sellerKey = generatePrivateKey();
const seller = privateKeyToAccount(sellerKey); // only the address is used as payTo

const vars = {
	// TESTNET ONLY buyer wallet (Base Sepolia, eip155:84532).
	X402_BUYER_PRIVATE_KEY: buyerKey,
	X402_BUYER_ADDRESS: buyer.address,
	// Seller receiving address (payTo). No key needed server-side.
	X402_PAY_TO_ADDRESS: seller.address,
	// Optional: override facilitator (defaults to public testnet facilitator).
	X402_FACILITATOR_URL: existing.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
};

// Merge, preserving any other existing vars.
const merged = { ...existing, ...vars };
const header =
	"# DCASH-7 x402 TESTNET secrets — DO NOT COMMIT (gitignored).\n" +
	"# Base Sepolia (eip155:84532) only. Never put real funds on this key.\n";
const body = Object.entries(merged)
	.map(([k, v]) => `${k}=${v}`)
	.join("\n");
writeFileSync(ENV_PATH, `${header}${body}\n`, { mode: 0o600 });

console.log("Wrote fresh TESTNET wallet to .env (gitignored).");
console.log("Buyer address :", buyer.address);
console.log("PayTo address :", seller.address);
console.log("\nFund the BUYER address with Base Sepolia testnet USDC to run the paid loop.");
