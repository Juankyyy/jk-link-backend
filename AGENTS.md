# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

---

## Contexto del proyecto — jk-link

Acortador de links propio, dividido en dos proyectos:
- `jk-link-backend` — API backend (este proyecto)
- `jk-link` — Frontend Vue 3 (separado)

### Stack
- Backend: Cloudflare Workers + Hono + Cloudflare KV
- Frontend: Vue 3 + Vite
- Package manager: Bun

### Preferencias
- Explicar qué hace cada parte del código proporcionado
- JavaScript, no TypeScript

### Endpoints planeados
- GET /:code → redirige al link
- GET /api/links → lista todos los links
- POST /api/links → crea un link { code, url }
- DELETE /api/links/:code → elimina un link

### KV
- Binding: LINKS
- Estructura: { "nombre-personalizado" → "https://url-larga.com" }
- Los nombres los define el usuario al crear el link (no se autogeneran)