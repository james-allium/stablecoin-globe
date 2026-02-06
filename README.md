# Stablecoin Globe

A 3D globe visualization of real-time stablecoin transfer flows between countries, with wallet transaction exploration. Powered by [Allium](https://allium.so) blockchain data.

## Prerequisites

- Node.js 18+
- An [Allium API key](https://app.allium.so/settings/api-keys)
- A [Cloudflare account](https://dash.cloudflare.com) (for deployment)

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.local` file in the project root:

```
ALLIUM_API_KEY=your_allium_api_key_here
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Cloudflare Workers

The app deploys as a Cloudflare Worker using [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) to adapt the Next.js build output.

### 1. Install dev dependencies

These should already be present, but if starting fresh:

```bash
npm install --save-dev @opennextjs/cloudflare wrangler
```

### 2. Create config files

**`open-next.config.ts`** (project root):

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
```

**`wrangler.jsonc`** (project root):

```jsonc
{
  "name": "stablecoin-globe",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-12-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

### 3. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Authenticate and return to the terminal.

### 4. Build and deploy

```bash
npm run deploy
```

This runs `opennextjs-cloudflare build` (which runs `next build` internally, then transforms the output) followed by `opennextjs-cloudflare deploy`.

On first deploy, the Worker is created automatically. The output will show your URL:

```
Deployed stablecoin-globe triggers
  https://stablecoin-globe.<subdomain>.workers.dev
```

If you have multiple Cloudflare accounts, set the account ID:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id npm run deploy
```

### 5. Set the API key secret

```bash
echo 'your_allium_api_key' | npx wrangler secret put ALLIUM_API_KEY
```

This only needs to be done once (or when rotating the key). The secret persists across deployments.

### 6. Verify

Visit your `*.workers.dev` URL. The globe should load and stablecoin flows should appear after the initial Allium query completes.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Local dev server (Turbopack, port 3000) |
| `npm run build` | Production Next.js build |
| `npm run build:cf` | Build for Cloudflare (without deploying) |
| `npm run preview:cf` | Build and preview locally with Wrangler |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Architecture: Caching & Performance

### The Problem

Each page load triggers Allium API queries (stablecoin flows, bridge corridors, default wallet). These are async SQL queries that take 10-35 seconds to complete. Without caching, every visitor would wait for a full round-trip, and concurrent visitors would each trigger their own duplicate queries — hammering the API.

### Solution: Three-Layer Caching

The caching system uses three complementary layers to ensure fast loads across all users and devices.

#### Layer 1: Cloudflare Cache API (cross-device, cross-user)

The most important layer. Each API route explicitly uses the [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) (`caches.default`) to store and retrieve query results at Cloudflare's edge.

```
User A (laptop) → /api/flows → Cache MISS → Allium query (35s) → Store in CF Cache → Response
User B (phone)  → /api/flows → Cache HIT  → Response (70ms)
```

This is NOT the same as `Cache-Control` headers (which only instruct the browser/CDN). The Cache API is an explicit key-value store that persists across all Worker invocations within the same Cloudflare data center. Any subsequent request to the same endpoint gets the cached result instantly, regardless of which device or browser makes the request.

**Cache keys** are canonical URLs built from snapped query parameters:
```
https://cache.internal/api/flows?start_date=2025-01-06 00:00:00&end_date=2025-01-07 00:00:00
```

All timestamps are snapped to hour boundaries (`snapToHour()`) so that requests within the same hour produce identical cache keys regardless of the exact second they're made.

**TTLs** scale with the date range:
- `<24h` range → 1 hour cache
- `24h-7d` range → 2 hour cache
- `7d+` range → 6 hour cache

**Why not just `Cache-Control` headers?** Cloudflare Workers don't automatically cache their own responses at the edge. `Cache-Control` headers pass through to the browser but don't create a shared server-side cache. The Cache API is the only way to get cross-user caching on Workers.

#### Layer 2: In-Flight Request Deduplication (same-isolate)

A module-level `Map<string, Promise>` prevents concurrent requests from triggering duplicate Allium queries within the same Worker isolate.

```
Request A → /api/flows → Cache MISS → starts Allium query → stores Promise in Map
Request B → /api/flows → Cache MISS → finds Promise in Map → awaits same Promise
                                       (no duplicate API call)
```

This handles the case where multiple users load the site at the exact same time, before the first query has completed and been cached. All concurrent requests share a single Allium query.

The dedup map is per-isolate (not shared across Cloudflare edge locations), but combined with the CF Cache API it covers all scenarios:
- **Same isolate, same time**: dedup map prevents duplicate queries
- **Different isolate/time**: CF Cache serves the stored result

#### Layer 3: Background Prefetch (`/api/prefetch`)

On page load, the client fires a fire-and-forget request to `/api/prefetch`, which kicks off all three default queries (flows, bridges, default wallet) in parallel. This ensures the CF Cache is warmed as early as possible.

```
Page loads → fetch("/api/prefetch")     → warms CF Cache in background
          → fetch("/api/flows")         → if prefetch finished first, instant cache hit
          → fetch("/api/wallet?...")     → if prefetch finished first, instant cache hit
```

The prefetch route uses the same `dedup()` function, so it never duplicates work already in progress from the direct API calls. It also checks the CF Cache first and skips any query that's already cached.

### Timestamp Snapping

Cache effectiveness depends on stable cache keys. All date parameters are snapped to boundaries:

| Context | Snapping |
|---|---|
| Client-side presets (`<24h`) | Snap to nearest hour |
| Client-side presets (`≥7d`) | Snap to nearest day |
| Server-side API routes | `snapToHour()` — truncates to `HH:00:00` |
| Prefetch route | Same `snapToHour()` logic, same cache keys |

This ensures that two users loading "Last 24h" within the same hour get identical query parameters and hit the same cache entry.

### Race Condition: Cached Data vs Three.js Init

When data is cached, the API response arrives in ~70ms — often **before** the Three.js 3D scene finishes initializing (which takes 200-500ms for WebGL context, globe geometry, and land dots). This created a race condition where arcs wouldn't appear until the user interacted with the page.

**The problem chain:**
1. Component mounts with `arcs = []`
2. React effects capture `arcs` in their closures
3. Cached data arrives → `arcs` prop updates to `[...flows]`
4. The `[arcs]` effect fires, but Three.js isn't ready → bails out
5. Three.js init completes, but the `[arcs]` effect won't re-run (arcs hasn't changed again)
6. Init checks `arcs.length > 0`, but `arcs` in its closure is still `[]` from mount time

**The fix:** An `arcsRef` that always holds the latest arcs array:
```typescript
const arcsRef = useRef(arcs);
arcsRef.current = arcs;  // Updated every render
```

Both the init effect and `spawnOneArc()` now read from `arcsRef.current` instead of the closure `arcs`. This means:
- Init can detect that arcs are already loaded and start the peel animation immediately
- The spawn interval (created during init) can read the current arcs array on every tick, even though it was created when `arcs` was empty

## Custom Domain

To use a custom domain instead of the `*.workers.dev` URL, go to your Worker in the [Cloudflare dashboard](https://dash.cloudflare.com) > Settings > Domains & Routes.
