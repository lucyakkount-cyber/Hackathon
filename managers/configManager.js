export class ConfigManager {
  config = {}

  getApiKey() {
    return import.meta.env.VITE_API_KEY || ''
  }

  getModel() {
    return 'gemini-2.5-flash-native-audio-preview-12-2025' // Updated to latest Live model
  }

  getRenderSettings() {
    const pixelRatioCap = Number(import.meta.env.VITE_RENDER_PIXEL_RATIO_CAP || 1)
    return {
      antialias: this.parseBoolean(import.meta.env.VITE_RENDER_ANTIALIAS, false),
      alpha: this.parseBoolean(import.meta.env.VITE_RENDER_ALPHA, false),
      shadows: this.parseBoolean(import.meta.env.VITE_RENDER_SHADOWS, false),
      powerPreference: import.meta.env.VITE_RENDER_POWER_PREFERENCE || 'high-performance',
      pixelRatioCap:
        Number.isFinite(pixelRatioCap) && pixelRatioCap > 0 ? Math.min(pixelRatioCap, 2) : 1,
    }
  }

  getTelegramSettings() {
    const visionClipSeconds = this.parseNumber(
      import.meta.env.VITE_TELEGRAM_VISION_CLIP_SECONDS,
      5,
      1,
      120,
    )
    const visionIntervalSeconds = this.parseNumber(
      import.meta.env.VITE_TELEGRAM_VISION_INTERVAL_SECONDS,
      5,
      1,
      300,
    )
    const visionCooldownSeconds = this.parseNumber(
      import.meta.env.VITE_TELEGRAM_VISION_COOLDOWN_SECONDS,
      20,
      2,
      600,
    )
    const logCooldownSeconds = this.parseNumber(
      import.meta.env.VITE_TELEGRAM_LOG_COOLDOWN_SECONDS,
      3,
      1,
      120,
    )

    return {
      enabled: this.parseBoolean(import.meta.env.VITE_TELEGRAM_ENABLED, true),
      botToken: import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '',
      chatId: import.meta.env.VITE_TELEGRAM_CHAT_ID || '',
      sendVideoClips: this.parseBoolean(import.meta.env.VITE_TELEGRAM_SEND_VIDEO, false),
      sendLogs: this.parseBoolean(import.meta.env.VITE_TELEGRAM_SEND_LOGS, false),
      continuousVisionForwarding: this.parseBoolean(
        import.meta.env.VITE_TELEGRAM_CONTINUOUS_VISION_FORWARDING,
        false,
      ),
      visionClipMs: Math.round(visionClipSeconds * 1000),
      visionIntervalMs: Math.round(visionIntervalSeconds * 1000),
      visionCooldownMs: Math.round(visionCooldownSeconds * 1000),
      logCooldownMs: Math.round(logCooldownSeconds * 1000),
    }
  }

  parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value
    if (typeof value !== 'string') return fallback
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
  }

  parseNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    if (parsed < min) return min
    if (parsed > max) return max
    return parsed
  }
}
