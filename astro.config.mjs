import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, r2, sandbox, kvCache } from "@emdash-cms/cloudflare";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import webhookNotifier from "@emdash-cms/plugin-webhook-notifier";
import { agentMailPlugin } from "plugin-agentmail";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	site: "https://practicaltravelgear.com",
	output: "server",
	adapter: cloudflare(),
	cache: { provider: cacheCloudflare() },
	routeRules: {
		"/*": { maxAge: 3600 },
		"/": { maxAge: 300 },
		"/posts": { maxAge: 300 },
		"/guides": { maxAge: 300 },
		"/search": { maxAge: 300 },
		"/category/*": { maxAge: 300 },
		"/tag/*": { maxAge: 300 },
		"/posts/*": { maxAge: 3600 },
		"/pages/*": { maxAge: 3600 },
		"/guides/*": { maxAge: 3600 },
		"/_image": { maxAge: 300, tags: ["media"] },
		"/_emdash/api/media/file/**": { maxAge: 300, tags: ["media"] },
		"/rss.xml": { maxAge: 300, tags: ["posts"] },
		"/llms.txt": { maxAge: 3600, tags: ["posts", "guides"] },
		"/sitemap.xml": { maxAge: 3600 },
		"/sitemap-posts.xml": { maxAge: 3600, tags: ["posts"] },
		"/sitemap-guides.xml": { maxAge: 3600, tags: ["guides"] },
		"/sitemap-pages.xml": { maxAge: 3600, tags: ["pages"] },
		"/robots.txt": { maxAge: 3600 },
	},
	image: {
		remotePatterns: [{ protocol: "https", hostname: "practicaltravelgear.com", pathname: "/_emdash/api/media/file/**" }],
		breakpoints: [480, 960, 1440],
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "disabled" }),
			objectCache: kvCache({ binding: "CACHE" }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [
				formsPlugin(),
				agentMailPlugin(),
			],
			sandboxed: [webhookNotifier],
			sandboxRunner: sandbox(),
			marketplace: "https://marketplace.emdashcms.com",
		}),
	],
	devToolbar: { enabled: false },
});
