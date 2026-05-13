# BFS1 Project Guidelines

## Tool Preference
- Always use CodeTree MCP tools (`codetree_read`, `codetree_edit`, `codetree_write`, `codetree_structure`, `codetree_probe`, `codetree_search`) instead of native Read, Edit, Write, Glob, and Grep tools.
- CodeTree provides caching, diffs, and session-based hashing — faster and avoids the pre-tool-use hook double-hop.

## Deployments
- **Production only** — never deploy to preview branches.
- Production branch is `main`.
- Deploy command: `npx wrangler pages deploy dist --project-name=blackflagstream --branch=main`

## Project Structure
- Frontend: React 19 + Zustand + Vite 8, files under `src/`
- Backend: Cloudflare Pages Functions under `functions/api/`
- Storage: Cloudflare KV via `SYNC_KV` namespace
- CORS Proxy: openprox Cloudflare Worker at `openprox.michaelrobgrove.workers.dev`
