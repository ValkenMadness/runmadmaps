# CLAUDE.md — Run Mad Maps Architecture Rules

This file is the in-repo technical reference for any AI or developer working on this codebase.
It must stay in sync with the RMM Master Document.

## Tech Stack

- Frontend: Vanilla JavaScript, HTML, CSS. NOT React.
- Map Engine: Mapbox GL JS (loaded via CDN, custom Mapbox Studio style)
- Backend: Vercel serverless functions (api/ directory)
- Database: Supabase (PostgreSQL)
- Static Data: GeoJSON files in /public/data/
- Hosting: Vercel (auto-deploys on push to main)
- Dev Environment: Windows, PowerShell, VS Code

## Architecture Rules [LOCKED]

1. No React. The live website is vanilla JS. The Formula Lab (separate, local-only) uses React.
2. 3D terrain enabled from Stage 1. Never retrofitted.
3. No hardcoded styling in JavaScript. Styling in CSS, Mapbox expressions, or style_config.
4. GeoJSON = geographic truth. Supabase = operational truth.
5. All state that changes without a code deploy lives in Supabase.
6. Map is embeddable — full-page and panel are config states, one codebase.
7. Map never imports code from another module (Modular Isolation Principle).
8. All cross-module communication through Supabase or defined event callbacks.

## Security Rules [LOCKED]

- NO tokens, keys, or secrets EVER enter the codebase.
- Mapbox token: .env locally, Vercel env vars in production.
- Supabase keys: .env locally, Vercel env vars in production.
- Formula weights and benchmark ceilings: environment variables only.
- .gitignore excludes .env and node_modules at all times.
- Pre-integration security checklist before any new API or payment.

## Icon Naming Convention

[category]-[slug]-s[state].[ext]

Examples: peak-table-mountain-s1.png, peak-lions-head-s3.svg

## Directory Structure

- /api/ — Vercel serverless functions
- /public/icons/ — Marker icons by category
- /public/data/ — GeoJSON files (canonical geographic data)
- /public/images/ — Site images, logo, OG
- /styles/ — CSS files
- /scripts/ — JavaScript files
- /pages/ — HTML pages (about, map, etc.)
- /modules/ — Future platform modules (fitness, routes, readiness, admin)

## Deployment

VS Code → git commit → push to main → Vercel auto-deploys.
Feature branches for risky changes → Vercel preview URL → test → merge.

## Map Build Stages

Stage 1: Foundation (GL JS, 3D terrain, hillshade, fog, camera, style_config)
Stage 2: Static Data Layers (GeoJSON, route lines, T1 markers, zones)
Stage 3: Expression-Driven Styling (T1–T3, tier icons, grade colours, fire zones)
Stage 4: Interaction, Popups, Intro Animation
Stage 5: Animation System
Stage 6: Overlay Illustrations
Stage 7: Admin Interface (separate deployment)

## Engine Build Sequence [Non-Negotiable]

Phase 1: GPS Stream Processor → Phase 2: Route Grading → Phase 3: RPS → Phase 4: Race Readiness
Each system feeds the next. Do not skip phases.
