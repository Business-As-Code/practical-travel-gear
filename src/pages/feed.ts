import type { APIRoute } from "astro";

/** WordPress leftover. Real feed is /rss.xml. */
export const GET: APIRoute = ({ redirect }) => redirect("/rss.xml", 301);
