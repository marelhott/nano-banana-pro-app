import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const HOST_PORT = Number(process.env.PORT || 3000)
const WORKFLOW_PORT = Number(process.env.WORKFLOW_PORT || 3001)
const NODE_ENV = process.env.NODE_ENV || 'development'

function resolveWorkflowDir() {
  const candidates = [
    process.env.WORKFLOW_DIR,
    path.resolve(process.cwd(), 'workflow'),
    '/Users/mulenmara/Documents/node-banana-master',
  ].filter(Boolean)

  for (const dir of candidates) {
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) return dir
  }
  return null
}

function startWorkflowApp(workflowDir) {
  if (process.env.START_WORKFLOW === '0') return null

  const child = spawn('npm', ['run', 'dev'], {
    cwd: workflowDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(WORKFLOW_PORT),
      NODE_ENV,
    },
  })

  return child
}

async function start() {
  const workflowDir = resolveWorkflowDir()
  if (!workflowDir) {
    throw new Error(
      'Workflow app not found. Set WORKFLOW_DIR or copy Node Banana to ./workflow'
    )
  }

  const workflowChild = startWorkflowApp(workflowDir)

  const app = express()

  app.use(express.json({ limit: '2mb' }))

  app.post('/api/replicate/predictions', async (req, res) => {
    try {
      const { token, version, input } = req.body || {}
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing Replicate token' })
      }
      if (!version || typeof version !== 'string') {
        return res.status(400).json({ error: 'Missing Replicate model/version' })
      }
      const upstream = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        },
        body: JSON.stringify({ version, input: input || {} }),
      })

      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      return res.send(text)
    } catch (err) {
      return res.status(500).json({ error: 'Replicate proxy failed' })
    }
  })

  app.get('/api/replicate/predictions/:id', async (req, res) => {
    try {
      const token = req.header('x-replicate-token')
      if (!token) return res.status(400).json({ error: 'Missing Replicate token' })
      const id = req.params.id
      const upstream = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const text = await upstream.text()
      res.status(upstream.status)
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      return res.send(text)
    } catch {
      return res.status(500).json({ error: 'Replicate proxy failed' })
    }
  })

  const workflowTarget = `http://localhost:${WORKFLOW_PORT}`

  app.use(
    '/sample-images',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: false,
      pathRewrite: (p) => `/sample-images${p}`,
      logLevel: 'warn',
    })
  )

  app.use(
    '/template-thumbnails',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: false,
      pathRewrite: (p) => `/template-thumbnails${p}`,
      logLevel: 'warn',
    })
  )

  app.use(
    '/banana_icon.png',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: false,
      pathRewrite: () => '/banana_icon.png',
      logLevel: 'warn',
    })
  )

  app.use(
    '/node-banana.png',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: false,
      pathRewrite: () => '/node-banana.png',
      logLevel: 'warn',
    })
  )

  app.use(
    '/icon.png',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: false,
      pathRewrite: () => '/icon.png',
      logLevel: 'warn',
    })
  )

  app.use(
    '/_next',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: (p) => `/_next${p}`,
      logLevel: 'warn',
    })
  )

  app.use(
    '/api',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: (p) => `/api${p}`,
      logLevel: 'warn',
    })
  )

  app.use(
    '/workflow',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: {
        '^/workflow': '',
      },
      logLevel: 'warn',
    })
  )

  app.use(
    '/nodes',
    createProxyMiddleware({
      target: workflowTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: {
        '^/nodes': '',
      },
      logLevel: 'warn',
    })
  )

  if (NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite')

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: HOST_PORT,
      },
      appType: 'custom',
    })

    app.use(vite.middlewares)

    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html')
        const raw = fs.readFileSync(indexHtmlPath, 'utf-8')
        const html = await vite.transformIndexHtml(url, raw)
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
      } catch (err) {
        vite.ssrFixStacktrace(err)
        next(err)
      }
    })
  } else {
    const distPath = path.resolve(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.use('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  const server = app.listen(HOST_PORT, () => {
    console.log(`> Host ready on http://localhost:${HOST_PORT}`)
    console.log(`> Nodes mounted at http://localhost:${HOST_PORT}/nodes`)
  })

  const shutdown = () => {
    server.close(() => {
      if (workflowChild) workflowChild.kill('SIGTERM')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
