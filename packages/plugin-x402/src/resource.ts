/**
 * Frozen crawl resource for the PTG x402 proof.
 * Source of truth on disk: ../resources/carry-on-weekend-v1.json
 * Hash: packages/plugin-x402/resources/HASHES.md
 */

export const RESOURCE_ID = "carry-on-weekend-v1" as const;

/** SHA-256 of packages/plugin-x402/resources/carry-on-weekend-v1.json (exact file bytes). */
export const RESOURCE_SHA256 =
	"732b93363e8bc6003c2332df6b6cc4ee9a5e93c900d24f3bb4c33cf2974d50a2";

export const CARRY_ON_WEEKEND_V1 = {
	id: "carry-on-weekend-v1",
	title: "Carry-on weekend packing starter",
	version: "1.0.0",
	updated_at: "2026-07-14",
	trip_type: "weekend_carry_on",
	currency_note:
		"PTG synthetic crawl resource — not a live product catalog",
	categories: [
		{
			name: "documents",
			items: [
				{
					name: "passport_or_id",
					required: true,
					notes: "Match destination entry rules",
				},
				{
					name: "boarding_pass",
					required: false,
					notes: "Digital or printed",
				},
			],
		},
		{
			name: "clothing",
			items: [
				{ name: "tops", qty_hint: 2, required: true },
				{ name: "bottoms", qty_hint: 1, required: true },
				{ name: "sleepwear", qty_hint: 1, required: false },
				{
					name: "light_layer",
					qty_hint: 1,
					required: true,
					notes: "Cabin cold + weather swing",
				},
			],
		},
		{
			name: "toiletries",
			items: [
				{
					name: "tsa_liquids_bag",
					required: true,
					notes: "3-1-1 compliant when flying US security",
				},
				{ name: "toothbrush_kit", required: true },
			],
		},
		{
			name: "tech",
			items: [
				{ name: "phone_charger", required: true },
				{ name: "headphones", required: false },
				{
					name: "power_bank",
					required: false,
					notes: "Check airline capacity rules",
				},
			],
		},
		{
			name: "carry_essentials",
			items: [
				{ name: "refillable_water_bottle_empty", required: false },
				{
					name: "medications",
					required: true,
					notes: "In original packaging when possible",
				},
			],
		},
	],
	decision_notes: [
		"Prefer multi-wear pieces over single-use outfits for a weekend.",
		"Weigh bag before leaving home; leave 1-2 kg slack for souvenirs.",
		"Keep liquids and meds in a top-access pocket for security.",
	],
	license:
		"PTG-owned synthetic data for agent payment crawl; no third-party copyrighted text",
	disclaimer:
		"Illustrative packing guidance only. Not travel, legal, or medical advice.",
} as const;
