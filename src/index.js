import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { compare } from 'bcryptjs'

const app = new Hono()

const AUTH_PREFIX = '__auth:'
const USER_PREFIX = `${AUTH_PREFIX}user:`
const SESSION_PREFIX = `${AUTH_PREFIX}session:`

function parseBoolean(value, fallback = false) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function normalizeSameSite(value, isProduction) {
  const selected = typeof value === 'string'
    ? value.trim().toLowerCase()
    : isProduction
      ? 'none'
      : 'lax'

  if (selected === 'strict') return 'Strict'
  if (selected === 'none') return 'None'
  return 'Lax'
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user'
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase();
}

function getRuntimeConfig(env) {
  const appEnv = (env.APP_ENV || 'development').toLowerCase()
  const isProduction = appEnv === 'production'
  const sessionTtlSeconds = Math.max(parseInteger(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7), 60)
  const secureByConfig = parseBoolean(env.COOKIE_SECURE, isProduction)

  return {
    appEnv,
    isProduction,
    frontendOrigin: env.FRONTEND_ORIGIN || 'http://localhost:5173',
    sessionCookieName: env.SESSION_COOKIE_NAME || 'jk_admin_session',
    sessionTtlSeconds,
    cookiePath: env.COOKIE_PATH || '/',
    cookieSecure: secureByConfig,
    cookieSameSite: normalizeSameSite(env.COOKIE_SAME_SITE, isProduction),
    seedAdminEnabled: parseBoolean(env.SEED_ADMIN_ENABLED, false),
    seedAdminUsername: normalizeUsername(env.SEED_ADMIN_USERNAME),
    seedAdminPasswordHash: typeof env.SEED_ADMIN_PASSWORD_HASH === 'string'
      ? env.SEED_ADMIN_PASSWORD_HASH.trim()
      : '',
  }
}

function userKey(username) {
  return `${USER_PREFIX}${username}`
}

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`
}

function isReservedKey(name) {
  return name.startsWith(AUTH_PREFIX)
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  }
}

function jsonError(c, status, message) {
  return c.json({ error: message }, status)
}

function buildCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: config.cookiePath,
    maxAge: config.sessionTtlSeconds,
  }
}

async function readJson(kv, key) {
  const raw = await kv.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeJson(kv, key, value, options) {
  await kv.put(key, JSON.stringify(value), options)
}

async function getUserByUsername(env, username) {
  return readJson(env.LINKS, userKey(username))
}

async function saveUser(env, user) {
  await writeJson(env.LINKS, userKey(user.username), user)
}

async function ensureSeedAdmin(env) {
  const config = getRuntimeConfig(env)
  if (!config.seedAdminEnabled) return
  if (!config.seedAdminUsername || !config.seedAdminPasswordHash) return

  const existingAdmin = await getUserByUsername(env, config.seedAdminUsername)
  if (existingAdmin) return

  const now = new Date().toISOString()
  const adminUser = {
    id: crypto.randomUUID(),
    username: config.seedAdminUsername,
    password: config.seedAdminPasswordHash,
    role: 'admin',
    created_at: now,
    updated_at: now,
  }

  await saveUser(env, adminUser)
}

async function getSession(c) {
  const config = getRuntimeConfig(c.env)
  const sessionId = getCookie(c, config.sessionCookieName)
  if (!sessionId) return null

  const payload = await readJson(c.env.LINKS, sessionKey(sessionId))
  if (!payload || typeof payload !== 'object' || !payload.user) return null

  return {
    id: sessionId,
    user: payload.user,
  }
}

async function createSession(c, user) {
  const config = getRuntimeConfig(c.env)
  const id = crypto.randomUUID()
  const payload = {
    id,
    user: toPublicUser(user),
    created_at: new Date().toISOString(),
  }

  await writeJson(c.env.LINKS, sessionKey(id), payload, {
    expirationTtl: config.sessionTtlSeconds,
  })

  setCookie(c, config.sessionCookieName, id, buildCookieOptions(config))
}

async function clearSession(c) {
  const config = getRuntimeConfig(c.env)
  const sessionId = getCookie(c, config.sessionCookieName)

  if (sessionId) {
    await c.env.LINKS.delete(sessionKey(sessionId))
  }

  deleteCookie(c, config.sessionCookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: config.cookiePath,
  })
}

async function parseJsonBody(c) {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

async function requireAuth(c, next) {
  await ensureSeedAdmin(c.env)
  const session = await getSession(c)

  if (!session) {
    return jsonError(c, 401, 'No autenticado')
  }

  c.set('user', session.user)
  c.set('sessionId', session.id)
  return next()
}

async function requireAdmin(c, next) {
  await ensureSeedAdmin(c.env)
  const session = await getSession(c)

  if (!session) {
    return jsonError(c, 401, 'No autenticado')
  }

  if (session.user.role !== 'admin') {
    return jsonError(c, 403, 'No autorizado')
  }

  c.set('user', session.user)
  c.set('sessionId', session.id)
  return next()
}

app.use('*', async (c, next) => {
  const config = getRuntimeConfig(c.env)
  const middleware = cors({
    origin: config.frontendOrigin,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })

  return middleware(c, next)
})

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null

  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) return null

  const withProtocol = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`

  try {
    return new URL(withProtocol).toString()
  } catch {
    return null
  }
}

app.post('/api/auth/login', async (c) => {
  await ensureSeedAdmin(c.env)

  const body = await parseJsonBody(c)
  const username = normalizeUsername(body?.username)
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!username || !password) {
    return jsonError(c, 400, 'username y password son requeridos')
  }

  const user = await getUserByUsername(c.env, username)
  const validPassword = user && typeof user.password === 'string'
    ? await compare(password, user.password)
    : false

  if (!user || !validPassword) {
    return jsonError(c, 401, 'Credenciales invalidas')
  }

  await createSession(c, user)
  return c.json({ user: toPublicUser(user) }, 200)
})

app.get('/api/auth/me', requireAuth, async (c) => {
  const user = c.get('user')
  return c.json({ user }, 200)
})

app.post('/api/auth/logout', async (c) => {
  await clearSession(c)
  return c.body(null, 204)
})

app.post('/api/links', requireAdmin, async (c) => {
  const body = await parseJsonBody(c)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const url = body?.url

  if (!name || !url) return jsonError(c, 400, 'name y url son requeridos')
  if (isReservedKey(name)) return jsonError(c, 400, 'name invalido')

  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return jsonError(c, 400, 'url invalida')

  await c.env.LINKS.put(name, normalizedUrl)
  return c.json({ success: true, name, url: normalizedUrl })
})

app.put('/api/links/:name', requireAdmin, async (c) => {
  const originalName = c.req.param('name')
  const body = await parseJsonBody(c)
  const requestedName = typeof body?.name === 'string' ? body.name.trim() : ''
  const targetName = requestedName || originalName
  const normalizedUrl = normalizeUrl(body?.url)

  if (!targetName || !normalizedUrl) {
    return jsonError(c, 400, 'name y url son requeridos')
  }

  if (isReservedKey(targetName)) {
    return jsonError(c, 400, 'name invalido')
  }

  const currentValue = await c.env.LINKS.get(originalName)
  if (!currentValue) {
    return jsonError(c, 404, 'Link no encontrado')
  }

  if (targetName !== originalName) {
    const existingTarget = await c.env.LINKS.get(targetName)
    if (existingTarget) {
      return jsonError(c, 409, 'El name ya existe')
    }
  }

  await c.env.LINKS.put(targetName, normalizedUrl)
  if (targetName !== originalName) {
    await c.env.LINKS.delete(originalName)
  }

  return c.json({ success: true, name: targetName, url: normalizedUrl })
})

app.delete('/api/links/:name', requireAdmin, async (c) => {
  const name = c.req.param('name')
  await c.env.LINKS.delete(name)
  return c.json({ success: true })
})

app.get('/api/links', requireAdmin, async (c) => {
  const links = []
  let cursor = undefined

  do {
    const list = await c.env.LINKS.list({ cursor })
    const pageLinks = await Promise.all(
      list.keys
        .filter((item) => !isReservedKey(item.name))
        .map(async (item) => {
          const url = await c.env.LINKS.get(item.name)
          return { name: item.name, url }
        })
    )

    links.push(...pageLinks)
    cursor = list.list_complete ? undefined : list.cursor
  } while (cursor)

  return c.json(links)
})

app.get('/:name', async (c) => {
  const name = c.req.param('name')

  if (isReservedKey(name)) {
    return jsonError(c, 404, 'Link no encontrado')
  }

  const url = await c.env.LINKS.get(name)

  if (!url) return jsonError(c, 404, 'Link no encontrado')

  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return jsonError(c, 400, 'Link invalido')

  return c.redirect(normalizedUrl, 302)
})

export default app