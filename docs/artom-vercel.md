# Artom monitoring deployment

The `codex/vercel-monitoring-fix` branch contains Artom-specific deployment fixes;
`master` remains the upstream baseline (Umami 3.4.1).

## What this branch changes

- Vercel builds run the complete pinned pnpm build with `BUILD_GEO=1`.
- Next.js includes `geo/GeoLite2-City.mmdb` in the send, record, batch, pixel and link
  collector function bundles. Monitoring relays the real visitor IP in the payload, so Umami
  must look it up locally instead of using the relay server's location headers.
- The Vercel build fails if the downloaded database cannot be opened or is missing
  from any collector's file trace, instead of publishing a broken collector.
- PostgreSQL pools default to two connections per Vercel instance (ten elsewhere).
  `DATABASE_POOL_MAX` overrides this with an integer from 1 to 100. Primary and
  replica pools use the same limit and a ten-second idle timeout. Vercel also has a
  five-second acquisition timeout; other environments retain pg's unlimited wait.

## Vercel settings

Apply these settings to the **umami** project, not the **monitoring** project:

1. After publishing the branch to GitHub, set Production Branch to
   `codex/vercel-monitoring-fix`. Keep `master` for upstream updates.
2. Use the Install Command and Build Command from `vercel.json`; remove dashboard
   overrides that bypass them. The build command already sets `BUILD_GEO=1`.
   Remove `SKIP_BUILD_GEO` if configured, including the string `false` (upstream
   treats any nonempty value as enabled). Leave `GEOLITE_DB_PATH` unset for the
   bundled database location.
3. Optionally set `DATABASE_POOL_MAX=2` explicitly, or `1` for a very small database
   connection allowance. This is a **per-instance, per-database** ceiling, not a
   global limit: multiple Vercel instances still multiply connections. If that
   exceeds the hosting role's allowance, use the provider's transaction pooler for
   `DATABASE_URL` or increase the allowance. Keep a direct migration connection in
   `DIRECT_DATABASE_URL` when the provider requires one.
4. Preserve the existing database URL, app secrets and Deployment Protection.
   Start a new Production deployment from this branch without the build cache.

## Verify after deployment

1. Build logs must show `Saved geo database: .../geo/GeoLite2-City.mmdb` and must
   not show `Skipping geo setup`. Confirm that the deployed function contains the
   database file; a successful download alone does not prove packaging.
2. Open a public Recipes page with analytics enabled, then open its monitoring
   overview and visitor list. Confirm that new traffic reaches both stores.
3. Check Umami runtime logs for `/api/send` and report routes: there should be no
   missing-GeoLite-file, `P2037` / `TooManyConnections` or connection acquisition
   timeout errors. A busy pool may still need the hosting adjustments above.

Existing private monitoring journal events are preserved. Previously failed Umami
deliveries are not replayed automatically, so aggregate history may remain empty
until new visits arrive. A historical backfill needs a separate reviewed procedure
to avoid duplicates and preserve timestamps.

## Local verification without a production database

Use the pinned pnpm version (`npx --yes pnpm@12.3.4`). Never use production database
credentials for these checks. Run the focused Vitest suites for `prisma-pool`,
`prisma` and `detect`; build with a disposable/local database URL and
`SKIP_DB_CHECK=1`, `SKIP_DB_MIGRATION=1`, `DISABLE_TELEMETRY=1`, `VERCEL=1` and
`BUILD_GEO=1`. Inspect `.next/server/app/api/send/route.js.nft.json` for the geo
database entry.
