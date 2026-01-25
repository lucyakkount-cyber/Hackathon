<template>
  <div
    class="relative w-full h-screen bg-gradient-to-br from-[#0a0e17] via-[#0f1419] to-[#0a0e17] overflow-hidden"
  >
    <div class="absolute inset-0 opacity-20 pointer-events-none">
      <div
        class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl animate-pulse"
      ></div>
      <div
        class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl animate-pulse"
        style="animation-delay: 1s"
      ></div>
    </div>

    <canvas ref="canvasRef" class="absolute inset-0 w-full h-full"></canvas>

    <div class="absolute top-4 left-4 flex items-center space-x-2 z-10">
      <div
        class="w-3 h-3 rounded-full transition-all duration-300"
        :class="
          isLiveMode ? 'bg-red-500 animate-pulse' : systemReady ? 'bg-green-500' : 'bg-yellow-500'
        "
      ></div>
      <span
        class="text-white text-sm font-medium backdrop-blur-md bg-black/30 px-3 py-1 rounded-full border border-white/10"
      >
        {{ isLiveMode ? '🔴 LIVE (Streaming)' : systemStatus }}
      </span>
    </div>

    <div
      v-if="showPerformance"
      class="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-white p-3 rounded-lg text-xs font-mono border border-white/10 z-10"
    >
      <div class="font-bold mb-2 text-green-400">⚡ Performance</div>
      <div>FPS: {{ fps }}</div>
      <div>Processing: {{ isProcessing ? 'Active' : 'Idle' }}</div>
      <div>Speaking: {{ isSpeaking ? 'Yes' : 'No' }}</div>
    </div>

    <div
      class="absolute bottom-[30px] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[1000px] z-20"
    >
      <form
        class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl rounded-3xl p-4 grid grid-cols-[auto_1fr_auto] gap-3 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-3xl"
        @submit.prevent="sendMessage"
      >
        <button
          type="button"
          class="flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 group"
          @click="setupDragAndDrop"
          title="Upload VRM"
        >
          <PlusIcon
            class="w-6 h-6 text-gray-600 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300"
          />
        </button>

        <textarea
          ref="textareaRef"
          v-model="userInput"
          rows="1"
          placeholder="Type to chat or click Mic for Live Mode..."
          class="flex-1 resize-none overflow-hidden bg-transparent focus:outline-none px-2 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 font-medium"
          @input="autoResize"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="isProcessing || !systemReady || isLiveMode"
        ></textarea>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="toggleLiveMode"
            :disabled="!systemReady"
            class="flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 disabled:opacity-50"
            :class="
              isLiveMode
                ? 'bg-red-600 text-white shadow-lg shadow-red-500/50 animate-pulse ring-2 ring-red-400 ring-offset-2 ring-offset-gray-900'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
            "
            title="Toggle Live Conversation"
          >
            <MicrophoneIcon class="w-6 h-6" />
          </button>

          <button
            type="submit"
            :disabled="isProcessing || !systemReady || !userInput.trim() || isLiveMode"
            class="flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <PaperAirplaneIcon v-if="!isProcessing" class="w-5 h-5" />
            <div
              v-else
              class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
            ></div>
          </button>
        </div>
      </form>

      <div v-if="!hasInteracted && systemReady" class="mt-3 text-center">
        <p class="text-gray-400 text-sm animate-pulse">
          💡 Click the Mic to start a real-time conversation!
        </p>
      </div>
    </div>

    <div
      v-if="!systemReady"
      class="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-50 transition-opacity duration-500"
    >
      <div
        class="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-gray-700"
      >
        <div class="flex flex-col items-center space-y-6">
          <div
            class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
          ></div>
          <div class="text-center space-y-2">
            <div class="font-bold text-xl text-white">{{ loadingTitle }}</div>
            <div class="text-sm text-blue-400">{{ systemStatus }}</div>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden w-64">
            <div
              class="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-500 ease-out"
              :style="{ width: loadingProgress + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showDebug"
      class="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md text-white p-4 rounded-xl text-xs font-mono max-w-xs shadow-2xl border border-white/10 z-10"
    >
      <div class="mb-2 font-bold text-green-400 flex justify-between">
        <span>🔧 Debug Info</span>
        <span class="text-gray-500 cursor-pointer" @click="showDebug = false">×</span>
      </div>
      <div class="space-y-1">
        <div>
          Status: <span :class="getStatusClass()">{{ systemStatus }}</span>
        </div>
        <div>
          Mode:
          <span :class="isLiveMode ? 'text-red-400' : 'text-blue-400'">{{
            isLiveMode ? 'LIVE' : 'Text'
          }}</span>
        </div>
        <div>
          VRM: <span class="text-green-400">{{ vrm ? '✓' : '✗' }}</span>
        </div>
        <div>
          Speaking:
          <span :class="isSpeaking ? 'text-red-400' : 'text-gray-400'">{{
            isSpeaking ? '🗣️' : '🔇'
          }}</span>
        </div>
        <div class="pt-2 mt-2 border-t border-gray-700">
          <button @click="togglePerformance" class="text-blue-400 hover:text-blue-300 underline">
            {{ showPerformance ? 'Hide' : 'Show' }} Performance
          </button>
        </div>
      </div>
    </div>

    <div class="absolute top-20 right-4 space-y-2 z-50">
      <transition-group name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm backdrop-blur-md border border-gray-200 dark:border-gray-700 flex items-start space-x-3"
        >
          <component
            :is="getToastIcon(toast.type)"
            class="w-6 h-6 flex-shrink-0"
            :class="getToastColor(toast.type)"
          />
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ toast.title }}</p>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ toast.message }}</p>
          </div>
        </div>
      </transition-group>
    </div>

    <audio ref="audioRef" class="hidden"></audio>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  PlusIcon,
  PaperAirplaneIcon,
  MicrophoneIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/solid'
import * as THREE from 'three'

// Import Managers
import { SceneManager } from '../managers/sceneManager.js'
import { VRMLoader } from '../managers/vrmLoader.js'
import { AnimationManager } from '../managers/animationManager.js'
import { AudioManager } from '../managers/audioManager.js'
import { AIClient } from '../managers/aiClient.js'
import { ConfigManager } from '../managers/configManager.js'
import { VisionManager } from '../managers/visionManager.js'

// --- State ---
const canvasRef = ref(null)
const audioRef = ref(null)
const textareaRef = ref(null)
const userInput = ref('')
const showDebug = ref(true)
const showPerformance = ref(false)
const isLiveMode = ref(false)
const isProcessing = ref(false)
const isSpeaking = ref(false)
const systemStatus = ref('Initializing...')
const systemReady = ref(false)
const hasInteracted = ref(false)
const loadingProgress = ref(0)
const loadingTitle = ref('Loading VRM Chat System')
const fps = ref(0)
const toasts = ref([])

// --- Manager Instances ---
let sceneManager = null
let vrmLoader = null
let animationManager = null
let audioManager = null
let aiClient = null
let configManager = null
let visionManager = null
let vrm = null
let fpsInterval = null

// --- Initialization ---
onMounted(async () => {
  await initializeManagers()
  startFPSCounter()

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' && e.ctrlKey) {
      e.preventDefault()
      showDebug.value = !showDebug.value
    }
  })
})

async function initializeManagers() {
  try {
    console.log('🚀 Initializing VRM Chat System...')

    // 1. Config
    loadingProgress.value = 10
    configManager = new ConfigManager()
    await configManager.loadConfig()
    await new Promise((r) => setTimeout(r, 200))

    // 2. Scene
    loadingProgress.value = 25
    sceneManager = new SceneManager(canvasRef.value)
    if (!sceneManager.initialize()) throw new Error('Scene init failed')
    await new Promise((r) => setTimeout(r, 200))

    // 3. VRM Loader
    loadingProgress.value = 40
    vrmLoader = new VRMLoader()

    // 4. Audio Playback
    loadingProgress.value = 55
    audioManager = new AudioManager()
    await audioManager.initialize()

    // 5. AI Client
    loadingProgress.value = 75
    aiClient = new AIClient(configManager.getApiKey(), configManager.getModel())

    // 5b. Vision Manager
    visionManager = new VisionManager()
    await visionManager.initialize()

    // 6. Load VRM & Animations
    loadingProgress.value = 85
    await loadVRMModel()

    // 7. Final Setup
    loadingProgress.value = 95
    setupDragAndDrop()
    sceneManager.startRenderLoop()

    loadingProgress.value = 100
    systemStatus.value = 'Ready'
    systemReady.value = true
    showToast('System Ready', 'Welcome to VRM Chat!', 'success')
    console.log('✅ System Fully Initialized')
  } catch (error) {
    console.error('❌ Init Failed:', error)
    systemStatus.value = `Error: ${error.message}`
    showToast('Initialization Failed', error.message, 'error', 5000)
  }
}

async function loadVRMModel() {
  try {
    const vrmConfig = configManager.getVRMConfig()

    // A. Load VRM
    vrm = await vrmLoader.loadVRMFromPath(vrmConfig.model_path)
    sceneManager.addToScene(vrm.scene)
    console.log('✅ VRM Model placed in scene')

    // B. Initialize Animation Manager
    animationManager = new AnimationManager(vrm)
    await animationManager.initialize()

    // C. Lip Sync Callbacks
    if (audioManager && audioManager.setSpeechCallbacks) {
      audioManager.setSpeechCallbacks(
        () => {
          isSpeaking.value = true
          if (animationManager) animationManager.setSpeakingState(true)
        },
        () => {
          isSpeaking.value = false
          if (animationManager) animationManager.setSpeakingState(false)
        },
      )
    }

    // D. Update Loop
    sceneManager.updateCallbacks = []
    sceneManager.addUpdateCallback((delta) => {
      if (!vrm || !animationManager) return
      animationManager.update(delta)
      vrm.update(delta)

      const mousePos = sceneManager.getMousePosition()
      if (vrm.lookAt) {
        vrm.lookAt.target = new THREE.Object3D()
        vrm.lookAt.target.position.set(mousePos.x, mousePos.y + 1.5, 2.0)
        vrm.lookAt.update(delta)
      }
    })
  } catch (error) {
    console.error('❌ VRM Load Error:', error)
    throw error
  }
}

// --- LIVE MODE HANDLER (Microphone + AI Animations) ---
// ...
async function toggleLiveMode() {
  if (isLiveMode.value) {
    if (aiClient) aiClient.disconnect()
    isLiveMode.value = false
    systemStatus.value = 'Ready'
  } else {
    isLiveMode.value = true
    systemStatus.value = 'Connecting Live...'

    // ⚡ 1. GET LIST
    const availableAnims = animationManager ? animationManager.getAvailableAnimations() : []

    // ⚡ 2. DYNAMIC PROMPT
    const prompt =
      configManager.getSystemPrompt() +
      `\n\nIMPORTANT: Use 'trigger_animation' to act. Available animations: ${availableAnims.join(', ')}.` +
      "\nUse 'set_expression(expr, duration)' for emotions (happy, sad, angry, surprised, excited)."

    try {
      await aiClient.connectLive(
        prompt,
        // Audio
        (pcmData) => audioManager.playChunk(pcmData, vrm),
        // Body
        (animName) => {
          console.log('🤖 Body:', animName)
          if (animationManager) animationManager.triggerNamedAnimation(animName)
        },
        // Face
        (faceName, duration) => {
          console.log(`🤖 Face: ${faceName}`)
          if (animationManager) animationManager.setExpression(faceName, duration)
        },
        // Vision
        async () => {
          console.log('🤖 Vision Requested')
          return await visionManager.captureFrame()
        },
        // Screen
        async () => {
          console.log('🖥️ Screen Capture Requested')
          return await visionManager.captureScreenFrame()
        },
        // Disconnect Handler
        (reason) => {
          console.log('🔌 Disconnected:', reason)
          isLiveMode.value = false
          systemStatus.value = 'Ready'
          showToast('Connection Closed', reason, 'error', 5000)
        },
        // ⚡ PASS LIST TO CLIENT
        availableAnims,
      )
      systemStatus.value = '🔴 LIVE'
    } catch (e) {
      console.error(e)
      isLiveMode.value = false
    }
  }
}
// ...

// --- TEXT MESSAGE HANDLER (Typing) ---
async function sendMessage() {
  if (!userInput.value.trim() || isProcessing.value) return

  try {
    if (animationManager) animationManager.notifyInteraction()

    isProcessing.value = true
    hasInteracted.value = true
    const message = userInput.value.trim()
    userInput.value = ''
    autoResize()

    console.log('📤 Sending Text:', message)

    // Use utility to handle Text -> Audio (REST API)
    const { processMessageOptimized } = await import('../managers/utils.js')
    await processMessageOptimized(
      message,
      aiClient,
      audioManager,
      animationManager,
      vrm,
      configManager,
      audioRef.value,
    )
  } catch (error) {
    console.error('❌ Message Error:', error)
    showToast('Error', error.message, 'error')
  } finally {
    isProcessing.value = false
  }
}

// --- Drag & Drop Handler ---
function setupDragAndDrop() {
  sceneManager.setupDragAndDrop(async (file) => {
    try {
      console.log('🔄 Loading dropped VRM...')
      systemReady.value = false
      loadingProgress.value = 50

      if (vrm) {
        sceneManager.removeFromScene(vrm.scene)
        vrmLoader.cleanupVRM(vrm)
      }

      vrm = await vrmLoader.loadVRMFromFile(file)
      sceneManager.addToScene(vrm.scene)

      animationManager = new AnimationManager(vrm)
      await animationManager.initialize()

      systemReady.value = true
      loadingProgress.value = 100
      showToast('Success', 'New model loaded!', 'success')
    } catch (e) {
      console.error(e)
      showToast('Error', 'Failed to load VRM', 'error')
      systemReady.value = true
    }
  })
}

// --- UI Helpers ---
function togglePerformance() {
  showPerformance.value = !showPerformance.value
}

function autoResize() {
  const ta = textareaRef.value
  if (ta) {
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }
}

const getStatusClass = () => {
  if (isLiveMode.value) return 'text-red-400'
  if (systemStatus.value === 'Ready') return 'text-green-400'
  return 'text-yellow-400'
}

const getToastIcon = (type) =>
  type === 'success' ? CheckCircleIcon : type === 'error' ? XCircleIcon : InformationCircleIcon
const getToastColor = (type) =>
  type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : 'text-blue-500'

function showToast(title, message, type = 'info', duration = 3000) {
  const id = Date.now()
  toasts.value.push({ id, title, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, duration)
}

function startFPSCounter() {
  let lastTime = performance.now()
  let frameCount = 0
  fpsInterval = setInterval(() => {
    const time = performance.now()
    fps.value = Math.round((frameCount * 1000) / (time - lastTime))
    frameCount = 0
    lastTime = time
  }, 1000)
  const count = () => {
    frameCount++
    requestAnimationFrame(count)
  }
  count()
}

onBeforeUnmount(() => {
  if (fpsInterval) clearInterval(fpsInterval)
  if (isLiveMode.value) toggleLiveMode() // Cleanup live mode
  if (animationManager?.cleanup) animationManager.cleanup()
  if (audioManager) audioManager.cleanup()
  if (sceneManager) sceneManager.cleanup()
  if (vrm && vrmLoader) vrmLoader.cleanupVRM(vrm)
  if (visionManager) visionManager.cleanup()
})
</script>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}
.backdrop-blur-md {
  backdrop-filter: blur(12px);
}
</style>
