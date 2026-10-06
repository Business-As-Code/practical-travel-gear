import { env } from "cloudflare:workers";
import { queryChromeTags } from "./chrome-tags-query";

/** Only the ten visible links; page cache invalidates on taxonomy writes. */
export function getChromeTags() {
	return queryChromeTags(env.DB);
}
