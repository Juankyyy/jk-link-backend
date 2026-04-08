# Migracion equivalente de users en KV

Este proyecto no usa SQL actualmente. En lugar de tabla relacional, la capa de auth usa Cloudflare KV con contrato logico equivalente.

## Contrato de datos

Clave de usuario:
- __auth:user:<username-normalizado>

Valor JSON:
- id: string (uuid)
- username: string (unico, normalizado en minusculas)
- password: string (hash bcrypt)
- role: string (user o admin)
- created_at: string (ISO)
- updated_at: string (ISO)

Clave de sesion:
- __auth:session:<session-id>

Valor JSON:
- id: string
- user: { id, username, role }
- created_at: string (ISO)

## Indexado equivalente

En KV no hay indices SQL. El indice unico de username se implementa usando username como parte de la clave:
- __auth:user:<username-normalizado>

## Aplicar migracion

No se requiere DDL. El esquema es schema-less y se activa con el codigo del worker.

Opcionalmente, puedes marcar version de migracion:

npx wrangler kv key put --binding=LINKS "__auth:migration:users:v1" "applied"

## Rollback

Eliminar registros de auth y sesion (mantiene links):

1) Listar claves auth:

npx wrangler kv key list --binding=LINKS --prefix="__auth:"

2) Borrar manualmente las claves listadas:

npx wrangler kv key delete --binding=LINKS "__auth:user:admin"
npx wrangler kv key delete --binding=LINKS "__auth:session:..."

Si usaste marker de migracion:

npx wrangler kv key delete --binding=LINKS "__auth:migration:users:v1"
