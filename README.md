# jk-link-backend

API de acortador de links con autenticacion real de admin para panel Vue.

## Stack

- Cloudflare Workers
- Hono
- Cloudflare KV

## Variables de entorno

Usa `.env.example` como base para local.

Variables principales:

- `APP_ENV`: `development` o `production`
- `FRONTEND_ORIGIN`: origen del frontend para CORS
- `SESSION_COOKIE_NAME`: nombre de cookie de sesion
- `SESSION_TTL_SECONDS`: TTL de sesion en segundos
- `COOKIE_SAME_SITE`: `Lax`, `Strict` o `None`
- `COOKIE_SECURE`: `true` o `false`
- `SEED_ADMIN_ENABLED`: habilita seed inicial por env
- `SEED_ADMIN_USERNAME`: username del seed
- `SEED_ADMIN_PASSWORD_HASH`: hash bcrypt del seed

## Contrato de auth

### POST /api/auth/login

Body JSON:

{
	"username": "admin",
	"password": "admin123"
}

Respuesta 200:

{
	"user": {
		"id": "...",
		"username": "admin",
		"role": "admin"
	}
}

Setea cookie de sesion httpOnly compatible con `credentials: include`.

### GET /api/auth/me

Respuesta 200:

{
	"user": {
		"id": "...",
		"username": "admin",
		"role": "admin"
	}
}

Si no hay sesion valida: 401.

### POST /api/auth/logout

Invalida sesion y limpia cookie.

Respuesta: 204.

## Autorizacion por rol

Middlewares:

- `requireAuth`: valida sesion desde cookie
- `requireAdmin`: valida sesion y rol admin

Respuestas:

- 401 si no autenticado
- 403 si no autorizado

## Rutas de links

Publica:

- `GET /:name` redirige al link

Protegidas por admin:

- `GET /api/links`
- `POST /api/links`
- `PUT /api/links/:name`
- `DELETE /api/links/:name`

## Modelo de datos (equivalente KV)

Se implementa equivalente de tabla `users` usando KV:

- key: `__auth:user:<username>`
- value:
	- `id`
	- `username` unico
	- `password` hash bcrypt
	- `role` user/admin
	- `created_at`
	- `updated_at`

Sesiones:

- key: `__auth:session:<session-id>`
- value: `{ id, user, created_at }`
- expiracion por TTL

Detalle de migracion y rollback en:

- `migrations/001_users_kv_equivalent.md`

## Seed opcional de admin

1. Genera hash bcrypt:

bun run auth:hash "tu-password-segura"

2. Configura:

- `SEED_ADMIN_ENABLED=true`
- `SEED_ADMIN_USERNAME=admin`
- `SEED_ADMIN_PASSWORD_HASH=<hash generado>`

3. Inicia el worker y realiza login.

El admin se crea automaticamente si no existe.

## Probar local con curl

1. Login:

curl -i -X POST http://127.0.0.1:8787/api/auth/login \
	-H "Origin: http://localhost:5173" \
	-H "Content-Type: application/json" \
	-d '{"username":"admin","password":"admin123"}' \
	-c cookie.txt

2. Me:

curl -i http://127.0.0.1:8787/api/auth/me \
	-H "Origin: http://localhost:5173" \
	-b cookie.txt

3. Crear link (admin):

curl -i -X POST http://127.0.0.1:8787/api/links \
	-H "Origin: http://localhost:5173" \
	-H "Content-Type: application/json" \
	-b cookie.txt \
	-d '{"name":"promo","url":"https://example.com"}'

4. Logout:

curl -i -X POST http://127.0.0.1:8787/api/auth/logout \
	-H "Origin: http://localhost:5173" \
	-b cookie.txt

## Tests

bun run test
