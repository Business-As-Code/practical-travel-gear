import type { APIRoute } from "astro";
import { textResponse } from "../lib/seo-feeds";

// Valid empty file (200). Add seller lines when Chris has publisher IDs.
const BODY = `# ads.txt for practicaltravelgear.com
# No authorized digital sellers listed yet.
`;

export const GET: APIRoute = () => textResponse(BODY, 86400);
