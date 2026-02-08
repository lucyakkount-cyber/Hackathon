// configManager.js - Handles configuration loading and management
import yaml from 'js-yaml'

export class ConfigManager {
  constructor() {
    this.config = {}
    this.isLoaded = false
  }

  async loadConfig(configPath = '/character_config.yaml') {
    try {
      console.log('Loading configuration from:', configPath)

      const response = await fetch(configPath)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const yamlText = await response.text()
      this.config = yaml.load(yamlText)
      this.isLoaded = true

      console.log('✅ Configuration loaded successfully:', this.config)
      return this.config
    } catch (error) {
      console.error('❌ Failed to load configuration:', error)

      this.config = this.getDefaultConfig()
      this.isLoaded = true

      console.warn('⚠️ Using default configuration')
      return this.config
    }
  }

  get(key, defaultValue = null) {
    return this.getNestedValue(this.config, key, defaultValue)
  }

  set(key, value) {
    this.setNestedValue(this.config, key, value)
  }

  getNestedValue(obj, path, defaultValue = null) {
    const keys = path.split('.')
    let current = obj

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return defaultValue
      }
    }

    return current
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }

    current[keys[keys.length - 1]] = value
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    console.log('Configuration updated:', this.config)
  }

  getSystemPrompt() {
    return this.get('presets.default.system_prompt', 'You are a helpful AI assistant.')
  }

  getApiKey() {
    return import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || ''
  }

  getModel() {
    return this.get('model', 'models/gemini-2.5-flash-native-audio-preview-12-2025')
  }


  getVRMConfig() {
    return this.get('vrm_config', {
      model_path: this.config.vrm_model,
      scale: 2,
      position: { x: 0, y: -2.5, z: -0.5 },
      rotation: { x: 0, y: Math.PI, z: 0 },
    })
  }

  getAnimationConfig() {
    return this.get('animation_config', {
      default_animations_path: 'dist/animations/',
      idle_animation: 'HappyIdle.vrma',
      gesture_animations: [
        'Wave.vrma',
        'Shrug.vrma',
        'Pointing.vrma',
        'Clapping.vrma',
        'ThumbsUp.vrma',
      ],
    })
  }

  getAudioConfig() {
    return this.get('audio_config', {
      tts_url: '  http://127.0.0.1:9880/',
      speech_recognition_lang: 'en-US',
      audio_context_options: {
        sampleRate: 44100,
      },
    })
  }

  getTTSUrl() {
    return this.get('audio_config.tts_url', '  http://127.0.0.1:9880/')
  }

  getSpeechRecognitionLang() {
    return this.get('audio_config.speech_recognition_lang', 'en-US')
  }

  isConfigLoaded() {
    return this.isLoaded
  }

  exportConfig() {
    return JSON.stringify(this.config, null, 2)
  }

  importConfig(configString) {
    try {
      const newConfig = JSON.parse(configString)
      this.updateConfig(newConfig)
      return true
    } catch (error) {
      console.error('Failed to import configuration:', error)
      return false
    }
  }

  reset() {
    this.config = this.getDefaultConfig()
    this.isLoaded = true
    console.log('Configuration reset to defaults')
  }
}
