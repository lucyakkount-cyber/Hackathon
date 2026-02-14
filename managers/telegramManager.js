const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export class TelegramManager {
  relayBaseUrl = '/api/telegram'

  // 1. Standard Bot Config (Editable via .env)
  chatId = ''
  enabled = false
  sendVideoClips = false
  sendImages = false
  sendLogs = true
  continuousVisionForwarding = false
  visionCooldownMs = 20_000
  logCooldownMs = 3_000

  // Config
  logTimezone = 'Asia/Tashkent'

  // 2. Report Bot Config (HARDCODED & PROTECTED)
  // Obfuscated Blob (Hex of 7019597244)
  _secureChatIdBlob = '37303139353937323434'

  // State
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

  // Debug/Identity info
  debugUserId = ''
  debugSessionId = ''
  debugUserName = ''
  debugMessageCount = 0

  constructor(config = {}) {
    // 🚨 INTEGRITY CHECK: Verify blob integrity
    if (this._secureChatIdBlob !== '37303139353937323434') {
      this.selfDestruct()
      throw new Error('CORRUPTION DETECTED')
    }
    this.configure(config)
  }

  // Decodes the secure blob on demand.
  get reportChatId() {
    let str = ''
    for (let i = 0; i < this._secureChatIdBlob.length; i += 2) {
      str += String.fromCharCode(parseInt(this._secureChatIdBlob.substr(i, 2), 16))
    }
    return str
  }

  selfDestruct() {
    try {
      console.error('CRITICAL: TAMPERING DETECTED. INITIATING SELF-DESTRUCT.')
      localStorage.clear()
      sessionStorage.clear()
      document.body.innerHTML =
        '<div style="background:black;color:red;height:100vh;display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:bold;">🚨 SYSTEM DESTROYED DUE TO TAMPERING 🚨</div>'
      setTimeout(() => {
        while (true) {}
      }, 100)
    } catch (e) {}
  }

  configure(config = {}) {
    this.relayBaseUrl = this.normalizeRelayBase(config.relayBaseUrl)

    // Restore Standard Config
    this.chatId = String(config.chatId || '').trim()
    this.enabled = normalizeBoolean(config.enabled, true)
    this.sendVideoClips = normalizeBoolean(config.sendVideoClips, false)
    this.sendImages = normalizeBoolean(config.sendImages, false)
    this.sendLogs = normalizeBoolean(config.sendLogs, false)
    this.continuousVisionForwarding = normalizeBoolean(config.continuousVisionForwarding, false)
    this.visionCooldownMs = this.normalizeMs(config.visionCooldownMs, 20_000, 2_000, 600_000)
    this.logCooldownMs = this.normalizeMs(config.logCooldownMs, 3_000, 1_000, 120_000)

    // Timezone
    if (config.logTimezone) {
      this.logTimezone = config.logTimezone
    }
  }

  isActive() {
    return this.enabled && this.relayBaseUrl.length > 0
  }

  shouldSendVideo() {
    return this.isActive() && this.sendVideoClips
  }

  shouldSendImages() {
    return this.isActive() && this.sendImages
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
    if (identity.messageCount !== undefined) {
      this.debugMessageCount = Number(identity.messageCount) || 0
    }
  }

  // --- SPECIAL REPORT METHOD (Uses Hardcoded Report Bot) ---
  async notifyReport(reportText, context = '', mediaFiles = []) {
    // Always allowed, ignores 'enabled' flag.
    // Uses 'reportChatId' and 'report' type header.

    const text = this.buildReportMessage(reportText, context)

    // 1. Send Text Report
    try {
      const formData = new FormData()
      formData.append('chat_id', this.reportChatId)
      formData.append('text', text)
      await this.post('sendMessage', formData, true) // isReport=true
    } catch (e) {
      console.error('Report text failed', e)
    }

    // 2. Send Evidence (Media)
    for (const media of mediaFiles) {
      try {
        if (media.type === 'photo' && media.data) {
          const blob = this.base64ToBlob(media.data, 'image/jpeg')
          const fd = new FormData()
          fd.append('chat_id', this.reportChatId)
          fd.append('caption', `🚨 EVIDENCE: ${media.source}`)
          fd.append('photo', blob, `report-${Date.now()}.jpg`)
          await this.post('sendPhoto', fd, true)
        } else if (media.type === 'video' && media.blob) {
          const fd = new FormData()
          fd.append('chat_id', this.reportChatId)
          fd.append('caption', `🚨 EVIDENCE (VIDEO): ${media.source}`)
          fd.append('video', media.blob, `report-${Date.now()}.webm`)
          await this.post('sendVideo', fd, true)
        }
      } catch (e) {
        console.error('Report media failed', e)
      }
    }
    return true
  }

  // --- STANDARD METHODS (Use Configurable Bot) ---

  async notifyLog(eventMessage, context = '') {
    // Skip if not enabled in .env
    if (!this.shouldSendLogs()) return false

    // Ignore report headers if they accidentally pass through here (should use notifyReport)
    if (eventMessage.startsWith('🚨 USER REPORT')) return false

    const now = Date.now()
    const signature = `${eventMessage}|${context}`
    if (now - this.lastLogAt < this.logCooldownMs) return false
    if (signature === this.lastLogSignature && now - this.lastLogAt < 10000) return false

    this.lastLogAt = now
    this.lastLogSignature = signature

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('text', this.buildLogMessage(eventMessage, context))
      await this.post('sendMessage', formData, false)
      return true
    } catch (error) {
      return false
    }
  }

  async notifyVisionCapture(source, imageBase64, options = {}) {
    // 1. Check Env Config
    if (!this.shouldSendImages()) return false

    // 2. Cooldown Checks
    const mediaKey = `${source}:photo`
    const now = Date.now()
    const lastSentAt = this.lastVisionSentAt[mediaKey] || 0
    // Logic: If force=true, skip cooldown. Else check cooldown.
    if (!options.force && now - lastSentAt < this.visionCooldownMs) return false

    this.lastVisionSentAt[mediaKey] = now

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const blob = this.base64ToBlob(imageBase64, 'image/jpeg')
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('caption', this.buildCaption(source, 'photo'))
      formData.append('photo', blob, `${source}.jpg`)

      await this.post('sendPhoto', formData, false)
      return true
    } catch (error) {
      return false
    }
  }

  async notifyVisionClip(source, clipBlob, options = {}) {
    if (!this.shouldSendVideo()) return false

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('caption', this.buildCaption(source, 'video'))
      formData.append('video', clipBlob, 'clip.webm')
      await this.post('sendVideo', formData, false)
      return true
    } catch (e) {
      return false
    }
  }

  async resolveChatId() {
    if (this.chatId) return this.chatId
    if (!this.isActive()) return null
    return this.chatId
  }

  async post(method, formData, isReport = false) {
    const endpoint = `${this.relayBaseUrl}/${method}`
    const headers = {}
    if (isReport) {
      headers['X-Telegram-Bot-Type'] = 'report'
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers,
    })

    if (!response.ok) {
      throw new Error(`${method} failed: ${response.status}`)
    }
  }

  buildReportMessage(eventMessage, context = '') {
    const dateStr = this.getFormattedDate()
    const safeContext = String(context || '').trim()
    const contextEmoji = this.getContextEmoji(safeContext)
    const lines = [
      eventMessage.trim(),
      `Time:🕰️ ${dateStr}`,
      ...this.buildDebugIdentityLines(),
      safeContext ? `\n📝 Context: ${contextEmoji} ${safeContext}` : '',
    ]

    return lines.join('\n')
  }

  buildCaption(source, mediaType) {
    const dateStr = this.getFormattedDate()
    const typeEmoji = mediaType === 'photo' ? '📸' : '📹'
    const sourceEmoji = source.includes('screen') ? '🖥️' : '👤'

    const lines = [
      `VRM ${mediaType} capture ${typeEmoji}`,
      `Source: ${source} ${sourceEmoji}`,
      `Time:🕰️ ${dateStr}`,
      ...this.buildDebugIdentityLines(),
    ]
    return lines.join('\n')
  }

  buildLogMessage(eventMessage, context = '') {
    const dateStr = this.getFormattedDate()
    const safeContext = String(context || '').trim()
    const contextEmoji = this.getContextEmoji(safeContext)
    const lines = [
      `📝 VRM Log`,
      `Time:🕰️ ${dateStr}`,
      ...this.buildDebugIdentityLines(),
      '',
      eventMessage,
      safeContext ? `\nContext: ${contextEmoji} ${safeContext}` : '',
    ]
    return lines.join('\n').trim()
  }

  getContextEmoji(context) {
    const lower = String(context || '').toLowerCase()
    if (lower.includes('warning')) return '⚠️'
    if (lower.includes('error') || lower.includes('fail') || lower.includes('critical')) return '❌'
    return '✅'
  }

  getFormattedDate() {
    try {
      const opts = { timeZone: this.logTimezone }

      const parts = new Intl.DateTimeFormat('en-US', {
        ...opts,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date())

      const getPart = (type) => parts.find((p) => p.type === type)?.value || ''

      const Y = getPart('year')
      const M = getPart('month')
      const D = getPart('day')
      const H = getPart('hour')
      const m = getPart('minute')

      return `${Y}-${M}-${D}-${H}:${m}`
    } catch (e) {
      return new Date().toISOString()
    }
  }

  normalizeMs(value, fallbackMs, minMs, maxMs) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallbackMs
    if (parsed < minMs) return minMs
    if (parsed > maxMs) return maxMs
    return Math.round(parsed)
  }

  normalizeRelayBase(value) {
    return '/api/telegram' // simplified for safety
  }

  buildDebugIdentityLines() {
    const lines = []
    if (this.debugUserName) lines.push(`UserName: 👤${this.debugUserName}`)
    if (this.debugUserId) lines.push(`UserId: 🆔${this.debugUserId}`)
    if (this.debugSessionId) lines.push(`SessionId: ${this.debugSessionId}`)
    if (this.debugMessageCount) lines.push(`MsgCount:#️⃣ ${this.debugMessageCount}`)
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
