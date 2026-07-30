# Dependency audit disposition — 2026-07-16

## Scope and result

`npm audit --json` against the locked PR branch reported 23 vulnerable package
paths: 3 low, 7 moderate, 13 high, and 0 critical. No dependency versions were
changed in this remediation because the EmDash fixes require a major upgrade
from `0.14.0` to `0.29.0`, while the remaining fixes update the shared
Astro/Cloudflare runtime and build chain. Those changes need full site and admin
regression testing, not only the x402 spike verifier.

`npm audit --omit=dev --json` still reported 19 package paths: 3 low, 3
moderate, 13 high, and 0 critical. The production-only result still includes
build/emulation packages pulled through production framework dependencies, so
the reachability notes below distinguish deployed paths from local tooling.

This audit blocks a new production deployment or repository-transfer acceptance
until the follow-up gate below passes. It does not prevent the local, non-paying
HTTP 402 proof from being reviewed.

## Findings

| Package | Severity | Reachable impact in this repository | Disposition and follow-up gate |
| --- | --- | --- | --- |
| `@astrojs/cloudflare` | Low | Production adapter; image-binding redirect handling may be reachable through authenticated image operations. | Upgrade to at least `13.1.10` with the coordinated Astro/Cloudflare pass. |
| `@astrojs/language-server` | Moderate | Typecheck/editor tooling only. | Refresh through the coordinated Astro toolchain update. |
| `@babel/core` | Low | Build-time transformation; malicious source maps would require untrusted build input. | Refresh transitively and rerun the clean build. |
| `@cloudflare/vite-plugin` | High | Local preview/build tooling; not the deployed Worker bundle, but it handles local requests and dependencies. | Upgrade with Wrangler and verify local preview behavior. |
| `@emdash-cms/cloudflare` | High | Production EmDash Cloudflare integration. Audit inherits the EmDash/Kysely findings. | Major upgrade to `0.29.0` requires a separate runtime migration and D1/admin regression test. |
| `astro` | High | Production SSR framework. Advisories include reflected XSS, spread-prop XSS, and host-header SSRF. | Upgrade to a release containing all listed fixes, then test public routes, error handling, content rendering, and x402. |
| `devalue` | High | May deserialize framework data; sparse-array denial of service is potentially runtime-reachable. | Refresh through Astro and add a malformed-payload regression check. |
| `dompurify` | Moderate | EmDash admin/content sanitization path may be runtime-reachable for privileged content editing. | Upgrade transitively and verify saved/rendered rich content. |
| `emdash` | High | Production CMS and D1 query layer. Kysely SQL-injection advisories are relevant if unsafe JSON paths or SQL literals are used. | Major upgrade to `0.29.0`; verify migrations, D1 reads/writes, admin, plugins, and content routes. |
| `esbuild` | Low | Local build/dev tooling; the listed file-read advisory is Windows-specific. | Refresh through Astro/Wrangler and rerun builds on the supported development platform. |
| `fast-uri` | High | URI validation dependency; impact depends on whether untrusted encoded authorities or paths reach it. | Refresh transitively and test encoded-path handling. |
| `hono` | High | Cloud/runtime routing dependency; several advisories are adapter-specific, but CORS behavior may be runtime-reachable. | Refresh transitively and verify CORS, cookies, static paths, and request limits. |
| `js-yaml` | Moderate | Build/config parsing; denial of service requires malicious YAML input. | Refresh transitively and validate configuration loading. |
| `kysely` | High | EmDash D1 query layer. Unsafe JSON-path keys or literal construction could affect production data access. | Resolve through the EmDash major upgrade and run D1 query/migration tests. |
| `miniflare` | High | Local Worker emulator, not production runtime; processes local test requests. | Upgrade with Wrangler and rerun preview/local endpoint checks. |
| `postcss` | Moderate | Build-time CSS generation; impact requires attacker-controlled CSS entering stringify output. | Refresh transitively and compare built CSS output. |
| `undici` | High | Used by local tooling and nested dependencies; proxy, WebSocket, header, and cache advisories may affect development or any Node-side fetch path. | Refresh all locked copies and exercise local fetch/preview flows. |
| `vite` | High | Local development server; listed path issues are Windows-specific but affect developers on that platform. | Upgrade through Astro and repeat clean development-server verification. |
| `volar-service-yaml` | Moderate | Typecheck/editor tooling only. | Refresh with the Astro language server. |
| `wrangler` | High | Direct deploy and local Cloudflare tool; not part of the Worker runtime, but deployment integrity depends on it. | Upgrade with the Cloudflare toolchain and verify build/preview without deploying. |
| `ws` | High | Local development WebSocket dependency; memory disclosure and denial-of-service require a reachable WebSocket service. | Refresh transitively and rerun local development checks. |
| `yaml` | Moderate | Nested language-server YAML parser; denial of service requires malicious deeply nested YAML. | Refresh with the language-server chain. |
| `yaml-language-server` | Moderate | Typecheck/editor tooling only. | Refresh with the Astro language server. |

## Required follow-up gate

Use a separate dependency-upgrade work order before any new production deploy
or repository-transfer acceptance. It must:

1. Upgrade Astro and the Cloudflare adapter/tooling without crossing a major
   version unless separately approved.
2. Treat EmDash `0.14.0` to `0.29.0` as a major runtime migration.
3. Run a clean install, typecheck, build, local preview, public-route smoke test,
   EmDash admin/content/D1 regression test, plugin checks, and the non-paying
   x402 verifier.
4. Rerun `npm audit` and either remove all high findings or record a narrower
   owner-approved exception tied to an unreachable code path.

The gate does not authorize deployment, wallet funding, payment settlement,
mainnet use, storefront changes, or repository transfer.
