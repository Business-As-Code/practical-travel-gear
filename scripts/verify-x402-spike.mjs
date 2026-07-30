import { GET } from "../src/pages/api/x402/spike-402.ts";

const response = await GET();
const paymentHeader = response.headers.get("PAYMENT-REQUIRED");
const spikeHeader = response.headers.get("X-PTG-X402-Spike");

if (response.status !== 402) {
	throw new Error(`Expected HTTP 402, received ${response.status}`);
}

if (!paymentHeader) {
	throw new Error("Missing PAYMENT-REQUIRED header");
}

if (spikeHeader !== "1") {
	throw new Error("Missing X-PTG-X402-Spike marker");
}

const paymentRequired = JSON.parse(
	Buffer.from(paymentHeader, "base64").toString("utf8"),
);
const offer = paymentRequired.accepts?.[0];
const zeroAddress = "0x0000000000000000000000000000000000000000";

if (
	paymentRequired.x402Version !== 1 ||
	offer?.network !== "eip155:84532" ||
	offer?.maxAmountRequired !== "10000" ||
	offer?.payTo !== zeroAddress ||
	offer?.asset !== zeroAddress ||
	offer?.extra?.version !== "spike"
) {
	throw new Error("The x402 response is not the expected non-paying testnet spike");
}

const body = await response.json();
if (body?.spike !== true || body?.path !== "astro") {
	throw new Error("Unexpected x402 spike response body");
}

console.log(
	"PASS: non-paying x402 spike returned HTTP 402 with Base Sepolia placeholder metadata",
);
