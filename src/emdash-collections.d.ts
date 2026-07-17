import type { ContentBylineCredit, PortableTextBlock } from "emdash";

interface BaseCollectionEntry {
	id: string;
	slug: string | null;
	status: string;
	title: string;
	content?: PortableTextBlock[];
	createdAt: Date;
	updatedAt: Date;
	publishedAt: Date | null;
	bylines?: ContentBylineCredit[];
}

interface FeaturedCollectionEntry extends BaseCollectionEntry {
	featured_image?: {
		id: string;
		src?: string;
		alt?: string;
		width?: number;
		height?: number;
		provider?: string;
		previewUrl?: string;
		meta?: Record<string, unknown>;
	};
	excerpt?: string;
}

export interface Guide extends FeaturedCollectionEntry {}

export interface Page extends BaseCollectionEntry {}

export interface Post extends FeaturedCollectionEntry {}

declare module "emdash" {
	interface EmDashCollections {
		guides: Guide;
		pages: Page;
		posts: Post;
	}
}
