import { env } from "cloudflare:workers";
import { queryCards, type ListingCollection, type ListCardsOpts } from "./listing-query";
export type { ListingCard } from "./listing-query";

/** Public, metadata-only queries. Errors are surfaced rather than hiding schema drift. */
export function listCards(collection: ListingCollection, opts: ListCardsOpts = {}) {
	return queryCards(env.DB, collection, opts);
}
