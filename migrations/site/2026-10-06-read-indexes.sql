-- Site indexes only; no content writes or changes to EmDash migration history.
CREATE INDEX IF NOT EXISTS ptg_taxonomy_chrome ON taxonomies (name, sort_order, label, slug);
CREATE INDEX IF NOT EXISTS ptg_404_recent ON _emdash_404_log (last_seen_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ptg_posts_public_listing ON ec_posts (published_at DESC, id DESC)
  WHERE status = 'published' AND (deleted_at IS NULL OR deleted_at = '');
CREATE INDEX IF NOT EXISTS ptg_guides_public_listing ON ec_guides (published_at DESC, id DESC)
  WHERE status = 'published' AND (deleted_at IS NULL OR deleted_at = '');
