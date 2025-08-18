# FPL-Live Worker

Cloudflare Worker that:
- Proxies FPL API (/proxy/*) to bypass cloud IP blocks
- Serves scoring API (/api/*) with provisional bonus and auto-subs
- Adds permissive CORS and uses edge caching

## Dev
    npm install -g wrangler
    wrangler dev worker/src/index.js

## Deploy
    wrangler publish

Set ALLOWED_ORIGINS to your frontend origin (or * during development).
