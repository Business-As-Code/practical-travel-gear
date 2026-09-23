/** Serve the 404 page at the original URL (no 302 to /404). */

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Page not found | Practical Travel Gear</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<h1>404</h1>
<p>The page you're looking for doesn't exist.</p>
<p><a href="/">Go back home</a></p>
</body>
</html>
`;

export function rewriteNotFound(_astro?: unknown): Response {
	return new Response(NOT_FOUND_HTML, {
		status: 404,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "private, no-store",
		},
	});
}
