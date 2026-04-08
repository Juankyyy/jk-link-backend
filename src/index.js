import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

app.get('/:name', async (c) => {
  const name = c.req.param('name')
  const url = await c.env.LINKS.get(name)

  if (!url) return c.json({ error: 'Link no encontrado' }, 404)

  return c.redirect(url, 302)
})

app.post('/api/links', async (c) => {
  const { name, url } = await c.req.json()

  if (!name || !url) return c.json({ error: 'name y url son requeridos' }, 400)

  await c.env.LINKS.put(name, url)
  return c.json({ success: true, name, url })
})

app.delete('/api/links/:name', async (c) => {
  const name = c.req.param('name')
  await c.env.LINKS.delete(name)
  return c.json({ success: true })
})

app.get('/api/links', async (c) => {
  const list = await c.env.LINKS.list()
  return c.json(list.keys)
})

export default app