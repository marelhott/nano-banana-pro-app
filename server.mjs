import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

function stripEnvQuotes(value) {
  const trimmed = String(value || '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadLocalEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return

  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key || process.env[key] != null) continue

    const value = trimmed.slice(separatorIndex + 1)
    process.env[key] = stripEnvQuotes(value)
  }
}

loadLocalEnvFile('.env.local')
loadLocalEnvFile('.env.development.local')

const HOST_PORT = Number(process.env.PORT || 3000)
const WORKFLOW_PORT = Number(process.env.WORKFLOW_PORT || 3001)
const NODE_ENV = process.env.NODE_ENV || 'development'

function resolveWorkflowDir() {
  const candidates = [
    process.env.WORKFLOW_DIR,
    path.resolve(process.cwd(), 'workflow'),
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

function extractReplicateToken(req, bodyToken) {
  const headerToken =
    req.header('x-replicate-token') ||
    req.header('authorization')?.replace(/^Bearer\s+/i, '')

  return headerToken || bodyToken || null
}

function listSafetensors(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => !name.startsWith('._'))
      .filter((name) => name.toLowerCase().endsWith('.safetensors'))
      .map((name) => {
        const p = path.join(dir, name)
        let bytes = undefined
        try {
          bytes = fs.statSync(p).size
        } catch {
          // ignore
        }
        return { name, path: p, bytes }
      })
  } catch {
    return []
  }
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

  const { default: publicConfigHandler } = await import('./api/public-config.js')
  const { default: libraryListHandler } = await import('./api/library-list.js')
  const { default: r2PresignHandler } = await import('./api/r2-presign.js')
  const { default: falLoraImg2ImgHandler } = await import('./api/fal/lora-img2img.js')
  const { default: providerGenerateHandler } = await import('./api/provider-generate.js')
  const { default: providerKeyTestHandler } = await import('./api/provider-key-test.js')

  // Large payloads (e.g. image data-URLs) can exceed default limit.
  app.use(express.json({ limit: '10mb' }))

  // Local model library (dev only): list checkpoints/loras from disk so the UI can pick them.
  // This does not perform inference; it only exposes filenames/paths for local workflows.
  app.get('/api/local-models', (req, res) => {
    const checkpointDir = String(process.env.LOCAL_CHECKPOINT_DIR || '/Volumes/Bez názvu/modely/modely').trim()
    const loraDir = String(process.env.LOCAL_LORA_DIR || '/Volumes/Bez názvu/modely/lora').trim()

    const checkpoints = listSafetensors(checkpointDir)
    const loras = listSafetensors(loraDir)

    return res.json({ checkpoints, loras, checkpointDir, loraDir })
  })

  app.post('/api/replicate/predictions', async (req, res) => {
    try {
      const { token: bodyToken, version, input } = req.body || {}
      const token = extractReplicateToken(req, bodyToken)
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

  app.post('/api/provider-key-test', providerKeyTestHandler)
  app.post('/api/provider-generate', providerGenerateHandler)

  app.get('/api/public-config', publicConfigHandler)
  app.get('/api/library-list', libraryListHandler)
  app.post('/api/r2-presign', r2PresignHandler)
  app.post('/api/fal/lora-img2img', falLoraImg2ImgHandler)

  app.get('/api/replicate/predictions/:id', async (req, res) => {
    try {
      const token = extractReplicateToken(req)
      if (!token) return res.status(400).json({ error: 'Missing Replicate token' })
      const id = req.params.id?.trim()
      if (!id) return res.status(400).json({ error: 'Missing prediction id' })
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
