/**
 * Resolve a media field into a same-origin path we can transform.
 */

const MEDIA_PREFIX = "/_emdash/api/media/file/";
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** No decoding/normalization: keys are exact, public storage names. */
function isSafeKey(key: string): boolean {
	// Native EmDash's public media endpoint reserves this bucket prefix.
	return !key.startsWith("backups/") && key.split("/").every(segment =>
		segment !== "." && segment !== ".." && SAFE_SEGMENT.test(segment));
}

export type ResolvedMedia = {
	src: string;
	alt: string;
	width?: number;
	height?: number;
	/** R2 object key when the file lives in MEDIA. */
	storageKey?: string;
};

export const CARD_WIDTHS = [640, 960, 1280] as const;
export const HERO_WIDTHS = [640, 960, 1280] as const;

export function resolveMedia(image: unknown): ResolvedMedia | null {
	if (!image) return null;
	if (typeof image === "string") {
		const src = normalizeSrc(image);
		if (!src) return null;
		return { src, alt: "", storageKey: keyFromSrc(src) };
	}
	if (typeof image !== "object") return null;
	const obj = image as Record<string, unknown>;
	const meta = obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : {};
	const alt =
		(typeof obj.alt === "string" && obj.alt) ||
		(typeof meta.alt === "string" && meta.alt) ||
		"";
	const width = asPositiveInt(obj.width) ?? asPositiveInt(meta.width);
	const height = asPositiveInt(obj.height) ?? asPositiveInt(meta.height);

	const storageKey =
		(typeof meta.storageKey === "string" && isSafeKey(meta.storageKey) && meta.storageKey) ||
		(typeof obj.storageKey === "string" && isSafeKey(obj.storageKey) && obj.storageKey) ||
		undefined;

	if (storageKey) {
		return { src: `${MEDIA_PREFIX}${storageKey}`, alt, width, height, storageKey };
	}

	const rawSrc = typeof obj.src === "string" ? obj.src : "";
	const src = normalizeSrc(rawSrc);
	if (!src) return null;
	return { src, alt, width, height, storageKey: keyFromSrc(src) };
}

export function transformSrc(src: string, width: number, format = "webp"): string {
	const params = new URLSearchParams();
	const key = keyFromSrc(src);
	if (key) params.set("k", key);
	else params.set("u", src);
	params.set("w", String(width));
	params.set("f", format);
	return `/img?${params.toString()}`;
}

export function srcsetFor(src: string, widths: readonly number[], format = "webp"): string {
	return widths.map((w) => `${transformSrc(src, w, format)} ${w}w`).join(", ");
}

export function isSafeImagePath(path: string): boolean {
	if (path.startsWith(MEDIA_PREFIX)) {
		return isSafeKey(path.slice(MEDIA_PREFIX.length));
	}
	if (path.startsWith("/images/")) {
		const rest = path.slice("/images/".length);
		return isSafeKey(rest);
	}
	return false;
}

export function keyFromSrc(src: string): string | undefined {
	const path = stripOrigin(src);
	if (!path.startsWith(MEDIA_PREFIX)) return undefined;
	const key = path.slice(MEDIA_PREFIX.length);
	return isSafeKey(key) ? key : undefined;
}

function normalizeSrc(src: string): string | null {
	const path = stripOrigin(src);
	if (!path.startsWith("/")) return null;
	if (!isSafeImagePath(path)) return null;
	return path;
}

function stripOrigin(src: string): string {
	if (src.startsWith("/") && !src.startsWith("//")) return src;
	try {
		// Reject ambiguous paths before URL can collapse dot segments/backslashes.
		const rawPath = src.match(/^https?:\/\/[^/]+(\/.*)$/)?.[1];
		if (!rawPath || !isSafeImagePath(rawPath)) return "";
		const url = new URL(src);
		if (["https:", "http:"].includes(url.protocol) && url.host === "practicaltravelgear.com" &&
			!url.username && !url.password && !url.search && !url.hash) return url.pathname;
	} catch { /* Invalid or foreign media is not a local R2 key. */ }
	return "";
}

function asPositiveInt(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return Math.round(value);
	}
	if (typeof value === "string" && /^\d+$/.test(value)) {
		const n = Number(value);
		if (n > 0) return n;
	}
	return undefined;
}
