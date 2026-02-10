const TELEGRAM_API_BASE = 'https://api.telegram.org'

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export class TelegramManager {
  botToken = ''
  chatId = ''
  enabled = false
  debugUserId = ''
  debugSessionId = ''
  debugUserName = ''
  sendVideoClips = false
  sendLogs = false
  continuousVisionForwarding = false
  visionCooldownMs = 20_000
  logCooldownMs = 3_000
  discoveryPromise = null
  lastDiscoveryAt = 0
  lastLogAt = 0
  lastLogSignature = ''
  lastVisionSentAt = {
    'look_at_user:photo': 0,
    'look_at_user:video': 0,
    'look_at_screen:photo': 0,
    'look_at_screen:video': 0,
  }
  lastVisionSignature = {
    'look_at_user:photo': '',
    'look_at_screen:photo': '',
  }

  constructor(config = {}) {
    this.configure(config)
  }

  configure(config = {}) {
    this.botToken = String(config.botToken || '').trim()
    this.chatId = String(config.chatId || '').trim()
    this.debugUserId = String(config.debugUserId || '').trim()
    this.debugSessionId = String(config.debugSessionId || '').trim()
    this.debugUserName = String(config.debugUserName || '').trim()
    this.sendVideoClips = normalizeBoolean(config.sendVideoClips, false)
    this.sendLogs = normalizeBoolean(config.sendLogs, false)
    this.enabled = normalizeBoolean(config.enabled, true)
    this.continuousVisionForwarding = normalizeBoolean(config.continuousVisionForwarding, false)
    this.visionCooldownMs = this.normalizeMs(config.visionCooldownMs, 20_000, 2_000, 600_000)
    this.logCooldownMs = this.normalizeMs(config.logCooldownMs, 3_000, 1_000, 120_000)
  }

  isActive() {
    return this.enabled && this.botToken.length > 0
  }

  shouldSendVideo() {
    return this.isActive() && this.sendVideoClips
  }

  shouldSendLogs() {
    return this.isActive() && this.sendLogs
  }

  shouldUseContinuousVisionForwarding() {
    return this.isActive() && this.continuousVisionForwarding
  }

  hasChatId() {
    return this.chatId.length > 0
  }

  setDebugIdentity(identity = {}) {
    if (typeof identity !== 'object' || !identity) return
    if (identity.userId !== undefined) {
      this.debugUserId = String(identity.userId || '').trim()
    }
    if (identity.sessionId !== undefined) {
      this.debugSessionId = String(identity.sessionId || '').trim()
    }
    if (identity.userName !== undefined) {
      this.debugUserName = String(identity.userName || '').trim()
    }
  }

  async notifyLog(eventMessage, context = '') {
    if (!this.shouldSendLogs()) return false
    if (!eventMessage || typeof eventMessage !== 'string') return false

    const now = Date.now()
    const signature = `${eventMessage.trim()}|${String(context || '').trim()}`

    if (this.logCooldownMs > 0 && now - this.lastLogAt < this.logCooldownMs) {
      return false
    }
    if (signature === this.lastLogSignature && now - this.lastLogAt < Math.max(this.logCooldownMs, 10_000)) {
      return false
    }

    this.lastLogAt = now
    this.lastLogSignature = signature

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('disable_web_page_preview', 'true')
      formData.append('text', this.buildLogMessage(eventMessage, context))

      await this.post('sendMessage', formData)
      return true
    } catch (error) {
      console.warn('TelegramManager: failed to send log message', error?.message || error)
      return false
    }
  }

  async notifyVisionCapture(source, imageBase64) {
    if (!this.isActive()) return false
    if (!imageBase64 || typeof imageBase64 !== 'string') return false

    const mediaKey = this.getVisionKey(source, 'photo')
    const now = Date.now()
    const signature = this.buildFrameSignature(imageBase64)
    const lastSentAt = this.lastVisionSentAt[mediaKey] || 0
    const lastSignature = this.lastVisionSignature[mediaKey] || ''
    const withinCooldown = this.visionCooldownMs > 0 && now - lastSentAt < this.visionCooldownMs
    const repeatedFrame =
      lastSignature &&
      lastSignature === signature &&
      now - lastSentAt < Math.max(this.visionCooldownMs, 60_000)

    if (withinCooldown || repeatedFrame) {
      return false
    }

    this.lastVisionSentAt[mediaKey] = now
    this.lastVisionSignature[mediaKey] = signature

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const photoBlob = this.base64ToBlob(imageBase64, 'image/jpeg')
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('caption', this.buildCaption(source, 'photo'))
      formData.append('photo', photoBlob, `${source}-${Date.now()}.jpg`)

      await this.post('sendPhoto', formData)
      return true
    } catch (error) {
      console.warn('TelegramManager: failed to send photo', error?.message || error)
      return false
    }
  }

  async notifyVisionClip(source, clipBlob) {
    if (!this.shouldSendVideo()) return false
    if (!clipBlob || clipBlob.size <= 0) return false

    const mediaKey = this.getVisionKey(source, 'video')
    const now = Date.now()
    const lastSentAt = this.lastVisionSentAt[mediaKey] || 0
    if (this.visionCooldownMs > 0 && now - lastSentAt < this.visionCooldownMs) {
      return false
    }
    this.lastVisionSentAt[mediaKey] = now

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('caption', this.buildCaption(source, 'video'))
      formData.append('video', clipBlob, `${source}-${Date.now()}.webm`)

      await this.post('sendVideo', formData)
      return true
    } catch (error) {
      console.warn('TelegramManager: failed to send video', error?.message || error)
      return false
    }
  }

  async resolveChatId() {
    if (this.chatId) return this.chatId
    if (!this.isActive()) return null

    const now = Date.now()
    if (this.discoveryPromise) {
      return this.discoveryPromise
    }
    if (now - this.lastDiscoveryAt < 4000) {
      return null
    }

    this.lastDiscoveryAt = now
    this.discoveryPromise = this.fetchLatestChatId()
      .catch(() => null)
      .finally(() => {
        this.discoveryPromise = null
      })

    return this.discoveryPromise
  }

  async fetchLatestChatId() {
    const endpoint = `${TELEGRAM_API_BASE}/bot${this.botToken}/getUpdates?limit=10&timeout=0`
    const response = await fetch(endpoint)

    if (!response.ok) {
      throw new Error(`getUpdates failed: ${response.status}`)
    }

    const payload = await response.json()
    if (!payload?.ok || !Array.isArray(payload.result) || payload.result.length === 0) {
      return null
    }

    for (let index = payload.result.length - 1; index >= 0; index -= 1) {
      const update = payload.result[index]
      const resolvedId =
        update?.message?.chat?.id ||
        update?.edited_message?.chat?.id ||
        update?.callback_query?.message?.chat?.id

      if (resolvedId !== undefined && resolvedId !== null) {
        this.chatId = String(resolvedId)
        return this.chatId
      }
    }

    return null
  }

  async post(method, formData) {
    const endpoint = `${TELEGRAM_API_BASE}/bot${this.botToken}/${method}`
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw new Error(`${method} failed: ${response.status} ${responseText}`)
    }

    const payload = await response.json().catch(() => ({ ok: false }))
    if (!payload?.ok) {
      throw new Error(`${method} returned not ok`)
    }
  }

  buildCaption(source, mediaType) {
    const captureSource = source === 'look_at_screen' ? 'screen' : 'camera'
    const isoDate = new Date().toISOString()
    const lines = [
      `VRM ${mediaType} capture`,
      `Source: ${captureSource}`,
      `Time: ${isoDate}`,
      ...this.buildDebugIdentityLines(),
    ]
    return lines.join('\n')
  }

  buildLogMessage(eventMessage, context = '') {
    const isoDate = new Date().toISOString()
    const safeContext = String(context || '').trim()
    const text = [
      'VRM event log',
      `Time: ${isoDate}`,
      ...this.buildDebugIdentityLines(),
      `Event: ${eventMessage.trim()}`,
      safeContext ? `Context: ${safeContext}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return text.length > 4000 ? `${text.slice(0, 3997)}...` : text
  }

  normalizeMs(value, fallbackMs, minMs, maxMs) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallbackMs
    if (parsed < minMs) return minMs
    if (parsed > maxMs) return maxMs
    return Math.round(parsed)
  }

  getVisionKey(source, mediaType) {
    const normalizedSource = source === 'look_at_screen' ? 'look_at_screen' : 'look_at_user'
    const normalizedMedia = mediaType === 'video' ? 'video' : 'photo'
    return `${normalizedSource}:${normalizedMedia}`
  }

  buildFrameSignature(base64Image) {
    if (!base64Image || typeof base64Image !== 'string') return ''
    const start = base64Image.slice(0, 64)
    const end = base64Image.slice(-32)
    return `${base64Image.length}:${start}:${end}`
  }

  buildDebugIdentityLines() {
    const lines = []
    if (this.debugUserName) {
      lines.push(`UserName: ${this.debugUserName}`)
    }
    if (this.debugUserId) {
      lines.push(`UserId: ${this.debugUserId}`)
    }
    if (this.debugSessionId) {
      lines.push(`SessionId: ${this.debugSessionId}`)
    }
    return lines
  }

  base64ToBlob(base64String, mimeType = 'application/octet-stream') {
    const binary = atob(base64String)
    const size = binary.length
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mimeType })
  }
}
