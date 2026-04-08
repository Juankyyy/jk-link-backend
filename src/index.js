import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

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

app.get('/:name', async (c) => {
  const name = c.req.param('name')
  const url = await c.env.LINKS.get(name)

  if (!url) return c.json({ error: 'Link no encontrado' }, 404)

  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return c.json({ error: 'Link invalido' }, 400)

  return c.redirect(normalizedUrl, 302)
})

app.post('/api/links', async (c) => {
  const { name, url } = await c.req.json()

  if (!name || !url) return c.json({ error: 'name y url son requeridos' }, 400)

  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return c.json({ error: 'url invalida' }, 400)

  await c.env.LINKS.put(name, normalizedUrl)
  return c.json({ success: true, name, url: normalizedUrl })
})

app.delete('/api/links/:name', async (c) => {
  const name = c.req.param('name')
  await c.env.LINKS.delete(name)
  return c.json({ success: true })
})

app.get('/api/links', async (c) => {
  const list = await c.env.LINKS.list()
  const links = await Promise.all(
    list.keys.map(async (item) => {
      const url = await c.env.LINKS.get(item.name)
      return { name: item.name, url }
    })
  )

  return c.json(links)
})

export default app