import type { APIRoute } from "astro";
import { textResponse } from "../lib/seo-feeds";

const BODY = `# robots.txt for practicaltravelgear.com
# Search, AI input, and AI training are all allowed.

User-agent: *
Allow: /
Disallow: /_emdash/

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Bytespider
Allow: /

User-agent: meta-externalagent
Allow: /

Sitemap: https://practicaltravelgear.com/sitemap.xml
`;

export const GET: APIRoute = async () => textResponse(BODY, 86400);
