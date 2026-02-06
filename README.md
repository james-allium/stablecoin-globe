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

## Custom Domain

To use a custom domain instead of the `*.workers.dev` URL, go to your Worker in the [Cloudflare dashboard](https://dash.cloudflare.com) > Settings > Domains & Routes.
