<!-- App.vue -->
<template>
  <div class="relative w-full h-screen bg-gradient-to-br from-[#0a0e17] via-[#0f1419] to-[#0a0e17] overflow-hidden">
    <!-- Animated background -->
    <div class="absolute inset-0 opacity-20">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl animate-pulse"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl animate-pulse" style="animation-delay: 1s"></div>
    </div>

    <!-- VRM Canvas -->
    <canvas ref="canvasRef" class="absolute inset-0 w-full h-full"></canvas>

    <!-- Status Indicator -->
    <div class="absolute top-4 left-4 flex items-center space-x-2">
      <div
        class="w-3 h-3 rounded-full transition-all duration-300"
        :class="systemReady ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'"
      ></div>
      <span class="text-white text-sm font-medium backdrop-blur-md bg-black/30 px-3 py-1 rounded-full">
        {{ systemStatus }}
      </span>
    </div>

    <!-- Performance Monitor (if enabled) -->
    <div v-if="showPerformance" class="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-white p-3 rounded-lg text-xs font-mono">
      <div class="font-bold mb-2">⚡ Performance</div>
      <div>FPS: {{ fps }}</div>
      <div>Processing: {{ isProcessing ? 'Active' : 'Idle' }}</div>
      <div>Speaking: {{ isSpeaking ? 'Yes' : 'No' }}</div>
      <div>Animation Steps: {{ currentAnimationSteps }}</div>
    </div>

    <!-- Chat Composer -->
    <div class="absolute bottom-[30px] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[1000px]">
      <form
        class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl rounded-3xl p-4 grid grid-cols-[auto_1fr_auto] gap-3 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-3xl"
        @submit.prevent="sendMessage"
      >
        <button
          type="button"
          class="flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 group"
          @click="showSettings = true"
        >
          <PlusIcon class="w-6 h-6 text-gray-600 dark:text-gray-300 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        <textarea
          ref="textareaRef"
          v-model="userInput"
          rows="1"
          placeholder="Ask anything... (or use voice)"
          class="flex-1 resize-none overflow-hidden bg-transparent focus:outline-none px-2 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          @input="autoResize"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="isProcessing || !systemReady"
        ></textarea>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="toggleRecording"
            :disabled="!systemReady"
            class="flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 disabled:opacity-50"
            :class="isRecording
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'"
          >
            <MicrophoneIcon class="w-6 h-6" />
          </button>

          <button
            type="submit"
            :disabled="isProcessing || !systemReady || !userInput.trim()"
            class="flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <PaperAirplaneIcon v-if="!isProcessing" class="w-5 h-5" />
            <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </button>
        </div>
      </form>

      <!-- Quick Tips -->
      <div v-if="!hasInteracted && systemReady" class="mt-3 text-center">
        <p class="text-gray-400 text-sm animate-pulse">
          💡 Try: "Tell me a joke" or "Wave hello"
        </p>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="!systemReady" class="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50">
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
        <div class="flex flex-col items-center space-y-4">
          <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div class="text-center">
            <div class="font-bold text-xl mb-2">{{ loadingTitle }}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">{{ systemStatus }}</div>
            <div class="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                class="bg-gradient-to-r from-blue-600 to-purple-600 h-full transition-all duration-500"
                :style="{ width: loadingProgress + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Debug Panel -->
    <div v-if="showDebug" class="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md text-white p-4 rounded-xl text-xs font-mono max-w-xs shadow-2xl">
      <div class="mb-2 font-bold text-green-400">🔧 Debug Info</div>
      <div class="space-y-1">
        <div>Status: <span :class="getStatusClass()">{{ systemStatus }}</span></div>
        <div>Ready: <span class="text-green-400">{{ systemReady ? '✓' : '✗' }}</span></div>
        <div>VRM: <span class="text-green-400">{{ vrm ? '✓' : '✗' }}</span></div>
        <div>Expression: <span class="text-blue-400">{{ currentExpression }}</span></div>
        <div>Speaking: <span :class="isSpeaking ? 'text-red-400' : 'text-gray-400'">{{ isSpeaking ? '🗣️' : '🔇' }}</span></div>
        <div>Processing: <span :class="isProcessing ? 'text-yellow-400' : 'text-gray-400'">{{ isProcessing ? '⚙️' : '✓' }}</span></div>
        <div>Recording: <span :class="isRecording ? 'text-red-400' : 'text-gray-400'">{{ isRecording ? '🎤' : '✗' }}</span></div>
        <div>Idle Anim: <span :class="idleAnimationActive ? 'text-green-400' : 'text-gray-400'">{{ idleAnimationActive ? '▶️' : '⏸️' }}</span></div>
        <div class="pt-2 mt-2 border-t border-gray-700">
          <button @click="togglePerformance" class="text-blue-400 hover:text-blue-300">
            {{ showPerformance ? 'Hide' : 'Show' }} Performance
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notifications -->
    <div class="absolute top-20 right-4 space-y-2 z-50">
      <transition-group name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm backdrop-blur-md border border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              <component :is="getToastIcon(toast.type)" class="w-6 h-6" :class="getToastColor(toast.type)" />
            </div>
            <div class="flex-1">
              <p class="font-medium">{{ toast.title }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ toast.message }}</p>
            </div>
          </div>
        </div>
      </transition-group>
    </div>

    <audio ref="audioRef" class="hidden"></audio>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { PlusIcon, PaperAirplaneIcon, MicrophoneIcon, CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/vue/24/solid'

// Import managers
import { SceneManager } from '../managers/sceneManager.js'
import { VRMLoader } from '../managers/vrmLoader.js'
import { AnimationManager } from '../managers/animationManager.js'
import { AudioManager } from '../managers/audioManager.js'
import { SpeechManager } from '../managers/speechManager.js'
import { AIClient } from '../managers/aiClient.js'
import { ConfigManager } from '../managers/configManager.js'

// Reactive state
const canvasRef = ref(null)
const audioRef = ref(null)
const textareaRef = ref(null)
const userInput = ref('')
const showDebug = ref(true)
const showPerformance = ref(false)
const showSettings = ref(false)
const currentExpression = ref('neutral')
const currentGesture = ref('none')
const isRecording = ref(false)
const isProcessing = ref(false)
const isSpeaking = ref(false)
const idleAnimationActive = ref(false)
const systemStatus = ref('Initializing...')
const systemReady = ref(false)
const hasInteracted = ref(false)
const loadingProgress = ref(0)
const loadingTitle = ref('Loading VRM Chat System')
const fps = ref(0)
const currentAnimationSteps = ref(0)
const toasts = ref([])

// Manager instances
let sceneManager = null
let vrmLoader = null
let animationManager = null
let audioManager = null
let speechManager = null
let aiClient = null
let configManager = null
let vrm = null
let fpsInterval = null

// Computed
const getStatusClass = () => {
  if (systemStatus.value === 'Ready') return 'text-green-400'
  if (systemStatus.value.includes('Error')) return 'text-red-400'
  return 'text-yellow-400'
}

const getToastIcon = (type) => {
  switch (type) {
    case 'success': return CheckCircleIcon
    case 'error': return XCircleIcon
    default: return InformationCircleIcon
  }
}

const getToastColor = (type) => {
  switch (type) {
    case 'success': return 'text-green-500'
    case 'error': return 'text-red-500'
    default: return 'text-blue-500'
  }
}

// Toast notification system
function showToast(title, message, type = 'info', duration = 3000) {
  const id = Date.now()
  toasts.value.push({ id, title, message, type })

  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, duration)
}

// FPS Counter
function startFPSCounter() {
  let lastTime = performance.now()
  let frameCount = 0

  fpsInterval = setInterval(() => {
    const currentTime = performance.now()
    const delta = currentTime - lastTime
    fps.value = Math.round((frameCount * 1000) / delta)
    frameCount = 0
    lastTime = currentTime
  }, 1000)

  const countFrame = () => {
    frameCount++
    requestAnimationFrame(countFrame)
  }
  countFrame()
}

onMounted(async () => {
  await initializeManagers()
  startFPSCounter()

  // Debug toggle with keyboard
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

    // Step 1: Configuration
    loadingProgress.value = 10
    systemStatus.value = 'Loading configuration...'
    configManager = new ConfigManager()
    await configManager.loadConfig()
    await new Promise(r => setTimeout(r, 300))

    // Step 2: Scene
    loadingProgress.value = 25
    systemStatus.value = 'Initializing 3D scene...'
    sceneManager = new SceneManager(canvasRef.value)
    if (!sceneManager.initialize()) {
      throw new Error('Failed to initialize scene')
    }
    await new Promise(r => setTimeout(r, 300))

    // Step 3: VRM Loader
    loadingProgress.value = 40
    systemStatus.value = 'Setting up VRM loader...'
    vrmLoader = new VRMLoader()
    await new Promise(r => setTimeout(r, 200))

    // Step 4: Audio
    loadingProgress.value = 55
    systemStatus.value = 'Initializing audio system...'
    audioManager = new AudioManager()
    await audioManager.initialize()
    await new Promise(r => setTimeout(r, 300))

    // Step 5: Speech
    loadingProgress.value = 65
    systemStatus.value = 'Setting up speech recognition...'
    speechManager = new SpeechManager()
    const speechInit = speechManager.initialize({
      lang: configManager.getSpeechRecognitionLang()
    })

    if (speechInit) {
      speechManager.setOnResult(async (transcript) => {
        userInput.value = transcript
        hasInteracted.value = true
        await sendMessage()
      })

      speechManager.setOnError((error) => {
        console.error('Speech error:', error)
        isRecording.value = false
        showToast('Speech Error', 'Could not recognize speech', 'error')
      })

      speechManager.setOnEnd(() => {
        isRecording.value = false
      })
    }
    await new Promise(r => setTimeout(r, 200))

    // Step 6: AI
    loadingProgress.value = 75
    systemStatus.value = 'Connecting to AI...'
    aiClient = new AIClient(configManager.getApiKey())
    await new Promise(r => setTimeout(r, 300))

    // Step 7: VRM Model
    loadingProgress.value = 85
    systemStatus.value = 'Loading VRM model...'
    await loadVRMModel()

    // Step 8: Finalize
    loadingProgress.value = 95
    systemStatus.value = 'Starting animations...'

    // Setup drag and drop
    setupDragAndDrop()

    // Start render loop
    sceneManager.startRenderLoop()

    loadingProgress.value = 100
    systemStatus.value = 'Ready'
    systemReady.value = true

    showToast('System Ready', 'VRM Chat System initialized successfully!', 'success')
    console.log('✅ VRM Chat System initialized!')

  } catch (error) {
    console.error('❌ Initialization failed:', error)
    systemStatus.value = `Error: ${error.message}`
    systemReady.value = false
    showToast('Initialization Failed', error.message, 'error', 5000)
  }
}

// In App.vue - Update the loadVRMModel function

async function loadVRMModel() {
  try {
    const vrmConfig = configManager.getVRMConfig()
    vrm = await vrmLoader.loadVRMFromPath(vrmConfig.model_path)

    // Add VRM to scene
    sceneManager.addToScene(vrm.scene)

    // Initialize animation manager
    animationManager = new AnimationManager(vrm)

    // Load and set HappyIdle.fbx
    try {
      const idleData = await vrmLoader.loadAnimationFromFBX('/animations/HappyIdle.fbx')
      const convertedIdle = await vrmLoader.convertMixamoClip(idleData.clip, idleData.asset, vrm)
      animationManager.setIdleAnimation(convertedIdle)
      console.log('✅ HappyIdle.fbx loaded successfully')
    } catch (error) {
      console.warn('⚠️ HappyIdle.fbx not available, using natural idle only')
    }

    // START natural idle animations (breathing, blinking, etc.)
    animationManager.startNaturalIdle()

    // START HappyIdle.fbx if available
    animationManager.startIdleAnimation()
    idleAnimationActive.value = true

    // Setup speech callbacks for idle control
    audioManager.setSpeechCallbacks(
      () => {
        // On speech start
        isSpeaking.value = true
        animationManager.pauseIdleForSpeaking()
      },
      () => {
        // On speech end
        isSpeaking.value = false
        animationManager.resumeIdleAfterSpeaking()
      }
    )

    // Add animation update to render loop
    sceneManager.addUpdateCallback((delta) => {
      vrm?.update(delta)
      animationManager?.update(delta)
    })

    console.log('✅ VRM model loaded with animations')

  } catch (error) {
    console.error('❌ Failed to load VRM model:', error)
    throw error
  }
}

// Also update handleVRMFileDrop function

async function handleVRMFileDrop(file) {
  try {
    console.log('🔄 Loading new VRM model from file...')
    systemStatus.value = 'Loading new VRM...'
    systemReady.value = false
    loadingProgress.value = 0

    showToast('Loading VRM', 'Processing new model...', 'info')

    await new Promise(r => setTimeout(r, 100))

    // Clean up old VRM
    if (vrm) {
      sceneManager.removeFromScene(vrm.scene)
      vrmLoader.cleanupVRM(vrm)
    }

    loadingProgress.value = 30

    // Load new VRM
    vrm = await vrmLoader.loadVRMFromFile(file)
    sceneManager.addToScene(vrm.scene)

    loadingProgress.value = 60

    // Update animation manager
    if (animationManager) {
      animationManager.updateVRM(vrm)
    } else {
      animationManager = new AnimationManager(vrm)
    }

    loadingProgress.value = 80

    // Try to load HappyIdle
    try {
      const idleData = await vrmLoader.loadAnimationFromFBX('/animations/HappyIdle.fbx')
      const convertedIdle = await vrmLoader.convertMixamoClip(idleData.clip, idleData.asset, vrm)
      animationManager.setIdleAnimation(convertedIdle)
    } catch (error) {
      console.warn('HappyIdle.fbx not available for new model')
    }

    // Start animations
    animationManager.startNaturalIdle()
    animationManager.startIdleAnimation()

    loadingProgress.value = 100
    systemStatus.value = 'Ready'
    systemReady.value = true

    showToast('Success', 'New VRM model loaded!', 'success')
    console.log('✅ New VRM model loaded successfully')

  } catch (error) {
    console.error('❌ Failed to load VRM from file:', error)
    systemStatus.value = `Error: ${error.message}`
    systemReady.value = false
    showToast('Load Failed', error.message, 'error', 5000)
  }
}

function setupDragAndDrop() {
  sceneManager.setupDragAndDrop(async (file) => {
    await handleVRMFileDrop(file)
  })
}



async function sendMessage() {
  if (!userInput.value.trim() || isProcessing.value || !systemReady.value) return

  try {
    isProcessing.value = true
    hasInteracted.value = true
    const message = userInput.value.trim()
    userInput.value = ''
    autoResize()

    console.log('📤 Sending message:', message)

    // Import optimized processor
    const { processMessageOptimized } = await import('../managers/utils.js')

    // Process with perfect sync
    const response = await processMessageOptimized(
      message,
      aiClient,
      audioManager,
      animationManager,
      vrm,
      configManager,
      audioRef.value
    )

    console.log('✅ Message processed successfully')

  } catch (error) {
    console.error('❌ Error processing message:', error)
    showToast('Processing Error', error.message, 'error')

    systemStatus.value = `Error: ${error.message}`
    setTimeout(() => {
      if (systemReady.value) {
        systemStatus.value = 'Ready'
      }
    }, 3000)
  } finally {
    isProcessing.value = false
  }
}

function toggleRecording() {
  if (!speechManager || !systemReady.value) {
    showToast('Not Available', 'Speech recognition not ready', 'error')
    return
  }

  if (isRecording.value) {
    speechManager.stopRecording()
    isRecording.value = false
    showToast('Recording Stopped', 'Processing your speech...', 'info')
  } else {
    const started = speechManager.startRecording()
    if (started) {
      isRecording.value = true
      showToast('Recording Started', 'Speak now...', 'info')
    } else {
      showToast('Recording Failed', 'Could not start recording', 'error')
    }
  }
}

function togglePerformance() {
  showPerformance.value = !showPerformance.value
}

function autoResize() {
  const textarea = textareaRef.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }
}

onBeforeUnmount(() => {
  console.log('🧹 Cleaning up VRM Chat System...')

  if (fpsInterval) {
    clearInterval(fpsInterval)
  }

  animationManager?.cleanup()
  audioManager?.cleanup()
  speechManager?.cleanup()
  sceneManager?.cleanup()

  if (vrm) {
    vrmLoader?.cleanupVRM(vrm)
  }

  systemReady.value = false
  console.log('✅ Cleanup complete')
})


</script>

<style scoped>
/* Smooth transitions */
* {
  transition: all 0.2s ease;
}

/* Chat input animations */
textarea {
  transition: height 0.2s ease;
}

/* Button hover effects */
button {
  transition: all 0.2s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:active:not(:disabled) {
  transform: translateY(0);
}

/* Disabled states */
button:disabled,
textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Loading spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* Pulse animation */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Toast animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* Backdrop blur support */
@supports (backdrop-filter: blur(10px)) {
  .backdrop-blur-sm {
    backdrop-filter: blur(4px);
  }

  .backdrop-blur-md {
    backdrop-filter: blur(10px);
  }

  .backdrop-blur-xl {
    backdrop-filter: blur(20px);
  }
}

/* Focus styles */
textarea:focus {
  outline: none;
}

/* Placeholder animation */
textarea::placeholder {
  transition: opacity 0.3s ease;
}

textarea:focus::placeholder {
  opacity: 0.5;
}

/* Enhanced shadow */
.shadow-3xl {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Debug panel custom scrollbar */
.absolute.bottom-4.left-4 {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
</style>
