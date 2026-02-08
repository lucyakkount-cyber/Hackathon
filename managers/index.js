// index.js - Main entry point that exports all modules
// index.js - Main entry point that exports all modules
import { AudioManager } from './audioManager.js'
import { SpeechManager } from './speechManager.js'
import { AIClient } from './aiClient.js'
import { AnimationManager } from './animationManager.js'
import { VRMLoader } from './vrmLoader.js'
import { SceneManager } from './sceneManager.js'
import { ConfigManager } from './configManager.js'
import { VisionManager } from './visionManager.js'
import { Utils } from './utils.js'

export {
  AudioManager,
  SpeechManager,
  AIClient,
  AnimationManager,
  VRMLoader,
  SceneManager,
  ConfigManager,
  VisionManager,
  Utils,
}

// Version information
export const VERSION = '1.0.0'
export const BUILD_DATE = new Date().toISOString()

// Default configuration for easy setup
export const DEFAULT_CONFIG = {
  vrm: {
    modelPath: '/models/rika.vrm',
    scale: 2,
    position: { x: 0, y: -2, z: -0.5 },
  },
  audio: {
    ttsUrl: '  http://127.0.0.1:9880/',
    speechLang: 'en-US',
  },
  ai: {
    apiKey: import.meta.env?.VITE_OPENAI_API_KEY || '',
    model: 'gemini-3-flash-preview',
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
    const configManager = new ConfigManager() // Fix: PascalCase
    const sceneManager = new SceneManager(canvas) // Fix: PascalCase
    const vrmLoader = new VRMLoader() // Fix: PascalCase
    const audioManager = new AudioManager() // Fix: PascalCase
    const speechManager = new SpeechManager() // Fix: PascalCase
    const aiClient = new AIClient(finalConfig.ai.apiKey, finalConfig.ai.model) // Fix: PascalCase
    const visionManager = new VisionManager() // New Manager

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

    // Initialize Vision (non-blocking, just setup elements)
    await visionManager.initialize()

    // Load VRM model
    const vrm = await vrmLoader.loadVRMFromPath(finalConfig.vrm.modelPath)
    sceneManager.addToScene(vrm.scene)

    // Initialize animation manager
    const animationManager = new AnimationManager(vrm) // Fix: PascalCase
    const animations = await vrmLoader.loadDefaultAnimations(vrm)

    if (animations.idle) {
      animationManager.setIdleAnimation(animations.idle)
      animationManager.startIdleAnimation()
    }
    animationManager.addGestureClips(animations)

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
      visionManager,
      vrm,

      // Connect Live Helper (Wires everything up)
      async connect() {
        const availableAnims = animationManager.getAvailableAnimations()

        await aiClient.connectLive(
          'You are V-Tuber riko.vrm. You are lively, expressive, and helpful.',
          (audioData) => audioManager.queueAudio(audioData),
          (animName) => animationManager.triggerNamedAnimation(animName),
          (exprName, dur) => animationManager.setExpression(exprName, dur),
          // Vision Trigger: Called when AI wants to "see"
          async () => {
            return await visionManager.captureFrame()
          },
          availableAnims,
        )
      },

      // Helper methods
      async sendMessage(text) {
        // ... (Existing text chat logic if needed, but Live API supersedes this mostly)
        // Leaving as legacy/text-mode fallback
        const response = await aiClient.chatWithAI(text)
        // ... rest of legacy logic
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
        visionManager?.cleanup()
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
