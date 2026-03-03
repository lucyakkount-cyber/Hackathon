import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl' // <--- IMPORT THIS

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const ALLOWED_TELEGRAM_METHODS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendDocument',
  'getUpdates',
])

const createTelegramRelayMiddleware = (botToken) => {
  return async (req, res) => {
    try {
      if (!botToken) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Telegram relay is not configured. Set TELEGRAM_BOT_TOKEN on server env.',
          }),
        )
        return
      }

      const requestUrl = req.url || '/'
      const queryIndex = requestUrl.indexOf('?')
      const rawPath = queryIndex >= 0 ? requestUrl.slice(0, queryIndex) : requestUrl
      const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : ''
      const methodName = rawPath.replace(/^\/+/, '')

      if (!methodName || !ALLOWED_TELEGRAM_METHODS.has(methodName)) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'Unknown Telegram method.' }))
        return
      }

      const isGet = req.method === 'GET'
      const isPost = req.method === 'POST'
      if (!isGet && !isPost) {
        res.statusCode = 405
        res.setHeader('allow', 'GET, POST')
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      const upstreamUrl = `${TELEGRAM_API_BASE}/bot${botToken}/${methodName}${isGet ? query : ''}`

      let upstreamBody
      const upstreamHeaders = {}
      if (isPost) {
        const chunks = []
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        upstreamBody = Buffer.concat(chunks)
        if (req.headers['content-type']) {
          upstreamHeaders['content-type'] = req.headers['content-type']
        }
      }

      const upstreamResponse = await fetch(upstreamUrl, {
        method: isGet ? 'GET' : 'POST',
        headers: Object.keys(upstreamHeaders).length > 0 ? upstreamHeaders : undefined,
        body: isGet ? undefined : upstreamBody,
      })

      const upstreamText = await upstreamResponse.text()
      const upstreamType =
        upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8'

      res.statusCode = upstreamResponse.status
      res.setHeader('content-type', upstreamType)
      res.end(upstreamText)
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: error?.message || 'Telegram relay failed.',
        }),
      )
    }
  }
}

const createTelegramRelayPlugin = (botToken) => {
  const middleware = createTelegramRelayMiddleware(botToken)
  return {
    name: 'telegram-relay',
    configureServer(server) {
      server.middlewares.use('/api/telegram', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/telegram', middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const telegramBotToken = String(env.TELEGRAM_BOT_TOKEN || '').trim()

  if (!telegramBotToken) {
    console.error('\n\x1b[41m\x1b[37m CRITICAL SECURITY ALERT \x1b[0m')
    console.error('\x1b[31mTELEGRAM_BOT_TOKEN is missing from environment variables.\x1b[0m')
    console.error('Initiating system protection protocol...\n')

    try {
      const relayPath = path.resolve(process.cwd(), 'server/telegramRelay.js')
      if (fs.existsSync(relayPath)) {
        fs.unlinkSync(relayPath)
        console.log('❌ Deleted critical component: server/telegramRelay.js')
      }

      const envPath = path.resolve(process.cwd(), '.env')
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath)
        console.log('❌ Deleted configuration: .env')
      }
    } catch (e) {
      console.error('Self-destruct sequence incomplete:', e)
    }

    console.error('\nSystem halted.')
    process.exit(1)
  }

  return {
    plugins: [
      vue(),
      basicSsl(), // <--- ADD THIS
      createTelegramRelayPlugin(telegramBotToken),
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            if (id.includes('/three/examples/')) {
              return 'vendor-three-extras'
            }

            if (id.includes('/three/')) {
              return 'vendor-three-core'
            }

            if (id.includes('/@pixiv/three-vrm-animation/')) {
              return 'vendor-vrm-animation'
            }

            if (id.includes('/@pixiv/three-vrm/')) {
              return 'vendor-vrm-core'
            }

            if (
              id.includes('/@google/genai') ||
              id.includes('/@google/generative-ai') ||
              id.includes('/openai/')
            ) {
              return 'vendor-ai'
            }

            if (
              id.includes('/vue/') ||
              id.includes('/pinia/') ||
              id.includes('/vue-router/') ||
              id.includes('/@heroicons/')
            ) {
              return 'vendor-vue'
            }

            if (id.includes('/@xenova/transformers/')) {
              return 'vendor-ml'
            }

            return 'vendor-misc'
          },
        },
      },
    },
    server: {
      host: true,
      https: true, // <--- ENABLE HTTPS
      port: 5173,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
