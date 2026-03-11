# Hallownest Archive

TanStack Start + Clerk + Convex browser shell for Hollow Knight.

## Monorepo structure

```
hk/
  apps/
    web/          ← TanStack Start app (Vite + Tailwind + Clerk + Convex)
  turbo.json
  package.json
```

## Quick start

```sh
npm install                 # install all workspaces
node apps/web/scripts/fetch-runtime.mjs   # one-time ~970 MB runtime download
npm run dev                 # start dev server at http://localhost:3000
```

Or use the shorthand:

```sh
npm run fetch-runtime       # alias for the fetch script
```

## Environment

Fill in `apps/web/.env` (copy from `apps/web/.env.example`):

```sh
VITE_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
VITE_CONVEX_URL=...
CLERK_JWT_ISSUER_DOMAIN=...
```

## Convex

The `apps/web/convex/` directory has stub `_generated` files so the app compiles
without a real deployment. To connect to a real project:

```sh
cd apps/web
npx convex dev          # creates deployment, sets CONVEX_DEPLOYMENT
npx convex codegen      # replaces stub _generated files
```

## Build

```sh
npm run build
```

Output lands in `apps/web/dist/`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (all apps) |
| `npm run build` | Production build (all apps) |
| `npm run fetch-runtime` | Download ~970 MB game runtime |
