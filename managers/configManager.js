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

      // Fallback to default config
      this.config = this.getDefaultConfig()
      this.isLoaded = true

      console.warn('⚠️ Using default configuration')
      return this.config
    }
  }

  getDefaultConfig() {
    return {
      OPENAI_API_KEY: 'AIzaSyCYkivW_PQEE3ayBSYTXw1mtnQiDMau7GM',
      presets: {
        default: {
          system_prompt: `You are a helpful AI assistant. You are friendly, enthusiastic, and enjoy helping users with their questions and tasks. Keep your responses conversational and engaging.`,
        },
      },
      sovits_ping_config: {
        ref_audio_path: '/audio/reference.wav',
        text_lang: 'en',
        prompt_text: 'Hello, how are you today?',
        prompt_lang: 'en',
      },
      vrm_config: {
        model_path: '/models/riko.vrm',
        scale: 2,
        position: { x: 0, y: -2, z: -0.5 },
        rotation: { x: 0, y: Math.PI, z: 0 },
      },
      animation_config: {
        default_animations_path: '/animations/',
        idle_animation: 'HappyIdle.fbx',
        gesture_animations: [
          'Wave.fbx',
          'Shrug.fbx',
          'Pointing.fbx',
          'Clapping.fbx',
          'ThumbsUp.fbx',
        ],
      },
      audio_config: {
        tts_url: this.config.sovits_ping_config?.tts,
        speech_recognition_lang: 'en-US',
        audio_context_options: {
          sampleRate: 44100,
        },
      },
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
    return this.get('OPENAI_API_KEY', 'AIzaSyCYkivW_PQEE3ayBSYTXw1mtnQiDMau7GM')
  }

  getSovitsConfig() {
    return this.get('sovits_ping_config', {
      ref_audio_path: '/audio/reference.wav',
      text_lang: 'en',
      prompt_text: 'Hello, how are you today?',
      prompt_lang: 'en',
    })
  }

  getVRMConfig() {
    return this.get('vrm_config', {
      model_path: '/models/riko.vrm',
      scale: 2,
      position: { x: 0, y: -2, z: -0.5 },
      rotation: { x: 0, y: Math.PI, z: 0 },
    })
  }

  getAnimationConfig() {
    return this.get('animation_config', {
      default_animations_path: '/animations/',
      idle_animation: 'HappyIdle.fbx',
      gesture_animations: ['Wave.fbx', 'Shrug.fbx', 'Pointing.fbx', 'Clapping.fbx', 'ThumbsUp.fbx'],
    })
  }

  getAudioConfig() {
    return this.get('audio_config', {
      tts_url: '  https://mall-bless-not-disturbed.trycloudflare.com/',
      speech_recognition_lang: 'en-US',
      audio_context_options: {
        sampleRate: 44100,
      },
    })
  }

  getTTSUrl() {
    return this.get('audio_config.tts_url', '  https://mall-bless-not-disturbed.trycloudflare.com/')
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
