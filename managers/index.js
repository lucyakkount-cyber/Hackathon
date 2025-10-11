/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// index.js - Main entry point that exports all modules
export { AudioManager } from './audioManager.js'
export { SpeechManager } from './speechManager.js'
export { AIClient } from './aiClient.js'
export { AnimationManager } from './animationManager.js'
export { VRMLoader } from './vrmLoader.js'
export { SceneManager } from './sceneManager.js'
export { ConfigManager } from './configManager.js'
export { Utils } from './utils.js'

// Version information
export const VERSION = '1.0.0'
export const BUILD_DATE = new Date().toISOString()

// Default configuration for easy setup
export const DEFAULT_CONFIG = {
  vrm: {
    modelPath: '/models/riko.vrm',
    scale: 2,
    position: { x: 0, y: -2, z: -0.5 },
  },
  audio: {
    ttsUrl: '  https://mall-bless-not-disturbed.trycloudflare.com/',
    speechLang: 'en-US',
  },
  ai: {
    apiKey: 'AIzaSyCYkivW_PQEE3ayBSYTXw1mtnQiDMau7GM',
    model: 'gemini-2.5-flash',
  },
  animations: {
    path: '/animations/',
    idle: 'HappyIdle.fbx',
    gestures: ['Wave.fbx', 'Shrug.fbx', 'Pointing.fbx', 'Clapping.fbx', 'ThumbsUp.fbx'],
  },
}

// Helper function to create a complete VRM chat system
export async function createVRMChatSystem(canvas, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  try {
    // Initialize all managers
    const configManager = new configManager()
    const sceneManager = new sceneManager(canvas)
    const vrmLoader = new vrmLoader()
    const audioManager = new audioManager()
    const speechManager = new speechManager()
    const aiClient = new aiClient(finalConfig.ai.apiKey)

    // Initialize scene
    if (!sceneManager.initialize()) {
      throw new Error('Failed to initialize scene')
    }

    // Initialize audio
    await audioManager.initialize()

    // Initialize speech recognition
    speechManager.initialize({
      lang: finalConfig.audio.speechLang,
    })

    // Load VRM model
    const vrm = await vrmLoader.loadVRMFromPath(finalConfig.vrm.modelPath)
    sceneManager.addToScene(vrm.scene)

    // Initialize animation manager
    const animationManager = new animationManager(vrm)
    const animations = await vrmLoader.loadDefaultAnimations(vrm)

    if (animations.idle) {
      animationManager.setIdleAnimation(animations.idle)
      animationManager.startIdleAnimation()
    }

    // Set up render loop
    sceneManager.addUpdateCallback((delta) => {
      vrm?.update(delta)
      animationManager?.update(delta)
    })

    sceneManager.startRenderLoop()
    animationManager.startBlinking()

    console.log('✅ VRM Chat System created successfully')

    // Return system object
    return {
      configManager,
      sceneManager,
      vrmLoader,
      audioManager,
      speechManager,
      aiClient,
      animationManager,
      vrm,

      // Helper methods
      async sendMessage(text) {
        const response = await aiClient.chatWithAI(text)
        const animationPlan = await aiClient.generateAnimationPlan(response)

        // Generate TTS
        const audioBlob = await audioManager.generateTTS(response, finalConfig)
        if (audioBlob) {
          const audio = new Audio()
          const duration = await audioManager.playAudioBlob(audioBlob, audio)
          audioManager.setupMouthSync(audio, vrm)
        }

        // Play animations
        await animationManager.playAnimationSequence(animationPlan)

        return response
      },

      startListening() {
        return speechManager.startRecording()
      },

      stopListening() {
        return speechManager.stopRecording()
      },

      async loadNewVRM(path) {
        sceneManager.removeFromScene(vrm.scene)
        const newVrm = await vrmLoader.loadVRMFromPath(path)
        sceneManager.addToScene(newVrm.scene)
        animationManager.updateVRM(newVrm)
        return newVrm
      },

      cleanup() {
        animationManager?.cleanup()
        audioManager?.cleanup()
        speechManager?.cleanup()
        sceneManager?.cleanup()
        vrmLoader?.cleanupVRM(vrm)
      },
    }
  } catch (error) {
    console.error('❌ Failed to create VRM Chat System:', error)
    throw error
  }
}

// Export feature detection utility
export function checkBrowserSupport() {
  return Utils.getFeatureSupport()
}

console.log(`VRM Chat System v${VERSION} loaded (Built: ${BUILD_DATE})`)
