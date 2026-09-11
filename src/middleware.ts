import { defineMiddleware } from "astro:middleware";
import { wpRedirects } from "./data/wp-redirects";

// Cache hits return before Astro in the Worker entry point. Scheduled
// publishing runs on the existing five-minute Cron, never on visitor reads.
export const onRequest = defineMiddleware(async (context, next) => {
	const destination = wpRedirects[context.url.pathname];
	return destination ? context.redirect(destination, 301) : next();
});
