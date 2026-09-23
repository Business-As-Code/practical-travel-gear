import { originalMediaHeaders } from "emdash/media/image-endpoint";
import { isSafeImagePath, keyFromSrc } from "./responsive-image.ts";

const WIDTHS = new Set([320, 480, 640, 750, 828, 960, 1080, 1200, 1280, 1600]);
const FORMATS: Record<string, string> = { webp: "image/webp", avif: "image/avif", jpeg: "image/jpeg", jpg: "image/jpeg" };
export type ImgEnv = {
	MEDIA?: { get(key: string): Promise<{ body: ReadableStream | null; httpMetadata?: { contentType?: string } } | null> };
	IMAGES?: { input(stream: ReadableStream): { transform(options: { width: number; fit: "scale-down" }): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } };
	ASSETS?: { fetch(input: Request | URL | string): Promise<Response> };
};

/** Public R2/assets only; no remote fetch, CMS initialization or private cache. */
export async function handleImg(request: Request, env: ImgEnv): Promise<Response> {
	if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
	const params = new URL(request.url).searchParams;
	const rawWidth = params.get("w") ?? "";
	const width = Number(rawWidth);
	const format = (params.get("f") ?? "webp").toLowerCase();
	const mime = Object.hasOwn(FORMATS, format) ? FORMATS[format] : undefined;
	if (!/^\d+$/.test(rawWidth) || !WIDTHS.has(width)) return new Response("Bad width", { status: 400 });
	if (!mime) return new Response("Bad format", { status: 400 });
	const key = params.get("k");
	const path = key ? `/_emdash/api/media/file/${key}` : params.get("u") ?? "";
	if (!isSafeImagePath(path)) return new Response("Bad source", { status: 400 });
	const storageKey = keyFromSrc(path);
	const load = async (): Promise<Response | null> => {
		if (storageKey && env.MEDIA) {
			const object = await env.MEDIA.get(storageKey);
			return object?.body ? new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream" } }) : null;
		}
		if (path.startsWith("/images/") && env.ASSETS) {
			const response = await env.ASSETS.fetch(new URL(path, request.url));
			return response.ok ? response : null;
		}
		return null;
	};
	let original = await load();
	if (!original?.body) return new Response("Not found", { status: 404 });
	let result = original;
	let transformed = false;
	if (env.IMAGES) {
		try {
			const output = await env.IMAGES.input(original.body).transform({ width, fit: "scale-down" }).output({ format: mime, quality: 75 });
			result = output.response();
			transformed = true;
		} catch {
			// Transform may have consumed the stream: reload, never return a used body.
			original = await load();
			if (!original?.body) return new Response("Not found", { status: 404 });
			result = original;
		}
	}
	const headers = new Headers(result.headers);
	if (transformed) headers.set("Content-Type", mime);
	else {
		// Reuse EmDash's original-file policy, including on consumed-stream
		// retries and assets. CSP protects even incorrectly labelled uploads.
		for (const [name, value] of Object.entries(originalMediaHeaders(headers.get("Content-Type") ?? "application/octet-stream"))) {
			headers.set(name, value);
		}
	}
	headers.set("Cache-Control", "public, max-age=0, must-revalidate");
	headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=300");
	headers.set("Cache-Tag", "media");
	headers.set("X-Img-Transform", transformed ? "1" : "0");
	return new Response(result.body, { status: 200, headers });
}
