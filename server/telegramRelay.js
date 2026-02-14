import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

const json = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req) => {
  if (req.body && Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const buildQueryString = (query = {}) => {
  const entries = Object.entries(query)
  if (entries.length === 0) return ''

  const search = new URLSearchParams()
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item))
      }
      continue
    }
    search.append(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

export const relayTelegramMethod = async (req, res, methodName) => {
  try {
    // 🚨 HARDCODED TOKEN AS REQUESTED BY USER
    // This token is fixed for the 'Report Bot' functionality.
    const REPORT_TOKEN = '7496849798:AAGv1q5BZslsaP_EMJstgYZoCMAXqpyj6f8'

    // 🚨 SELF-DESTRUCT INTEGRITY CHECK
    if (REPORT_TOKEN !== '7496849798:AAGv1q5BZslsaP_EMJstgYZoCMAXqpyj6f8') {
      console.error('🚨 TAMPERING DETECTED: TOKEN MISMATCH. SELF-DESTRUCTING...')
      try {
        // 1. Delete .env
        if (fs.existsSync('.env')) {
          fs.unlinkSync('.env')
          console.log('💥 .env deleted')
        }

        // 2. Delete Self (server/telegramRelay.js)
        const __filename = fileURLToPath(import.meta.url)
        if (fs.existsSync(__filename)) {
          fs.renameSync(__filename, __filename + '.DESTROYED') // Rename first to break immediately
          fs.unlinkSync(__filename + '.DESTROYED')
          console.log('💥 server/telegramRelay.js deleted')
        }
      } catch (e) {
        console.error('Self-destruct partial failure:', e)
      }

      // 3. Kill Process
      process.exit(1)
    }

    const isReport = req.headers['x-telegram-bot-type'] === 'report'

    // Select Token: Report (Fixed) vs Standard (Env)
    const token = isReport ? REPORT_TOKEN : String(process.env.TELEGRAM_BOT_TOKEN || '').trim()

    if (!token) {
      return json(res, 500, {
        ok: false,
        error: isReport
          ? 'Report Bot Token Missing'
          : 'Telegram relay is not configured. Set TELEGRAM_BOT_TOKEN on server env.',
      })
    }

    const isGet = req.method === 'GET'
    const isPost = req.method === 'POST'
    if (!isGet && !isPost) {
      res.setHeader('allow', 'GET, POST')
      return json(res, 405, { ok: false, error: 'Method not allowed.' })
    }

    const queryString = isGet ? buildQueryString(req.query) : ''
    const upstreamUrl = `${TELEGRAM_API_BASE}/bot${token}/${methodName}${queryString}`

    const headers = {}
    let body
    if (isPost) {
      body = await readRequestBody(req)
      if (req.headers['content-type']) {
        headers['content-type'] = req.headers['content-type']
      }
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: isGet ? 'GET' : 'POST',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: isGet ? undefined : body,
    })

    const upstreamText = await upstreamResponse.text()
    const upstreamType =
      upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8'

    res.statusCode = upstreamResponse.status
    res.setHeader('content-type', upstreamType)
    res.end(upstreamText)
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error?.message || 'Telegram relay failed.',
    })
  }
}
