<template>
  <div
    class="app-shell relative h-screen w-full overflow-hidden select-none"
    @dragenter.prevent="handleDrag"
    @dragover.prevent="handleDrag"
    @dragleave.prevent="handleDrag"
    @drop.prevent="handleDrop"
  >
    <div class="app-backdrop absolute inset-0 z-0"></div>
    <div class="app-vignette absolute inset-0 z-0"></div>

    <div
      class="absolute inset-0 z-50 pointer-events-none transition-opacity duration-500"
      :class="loadingState.progress >= 100 ? 'opacity-0' : 'opacity-100'"
    >
      <SciFiLoader
        :progress="loadingState.progress"
        :stage="loadingState.stage"
        :detail="loadingState.detail"
      />
    </div>

    <canvas ref="canvasRef" class="absolute inset-0 z-0 block h-full w-full outline-none"></canvas>

    <Transition name="fade">
      <div
        v-if="dragActive"
        class="absolute inset-0 z-40 m-3 sm:m-6 flex items-center justify-center rounded-3xl border border-[color:var(--accent-cyan)]/40 bg-[color:var(--surface-strong)]/45 backdrop-blur-xl"
      >
        <div class="rounded-2xl border border-[color:var(--accent-cyan)]/35 px-8 py-6 text-center">
          <p class="text-[11px] font-mono uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            Drag and Drop
          </p>
          <p class="mt-2 text-xl sm:text-2xl font-semibold tracking-wide text-[color:var(--text-primary)]">
            Upload VRM Avatar
          </p>
        </div>
      </div>
    </Transition>

    <div class="absolute left-0 top-0 z-20 w-full p-4 sm:p-6 pointer-events-none">
      <div class="flex items-start justify-between gap-3 sm:gap-4">
        <div class="hud-panel pointer-events-auto">
          <div class="flex items-center gap-2">
            <span
              class="h-2.5 w-2.5 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.06)]"
              :class="
                isConnected
                  ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                  : 'bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
              "
            ></span>
            <p class="text-[11px] font-mono uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
              {{ isConnected ? 'Live Session Active' : 'System Standby' }}
            </p>
          </div>
          <p class="mt-2 text-sm text-[color:var(--text-muted)]">
            {{ isConnected ? 'Voice link stable' : 'Connect to start voice + vision tools' }}
          </p>
          <p
            v-if="isSharingScreen"
            class="mt-2 inline-flex items-center rounded-full border border-sky-300/30 bg-sky-500/12 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-sky-200"
          >
            Screen share enabled
          </p>
        </div>

        <div class="hud-panel min-w-[140px] text-right pointer-events-auto">
          <p class="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Render FPS
          </p>
          <p class="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">{{ fps }}</p>
          <p class="mt-1 text-[11px] text-[color:var(--text-muted)]">
            {{ systemReady ? 'Scene ready' : 'Initializing scene' }}
          </p>
        </div>
      </div>
    </div>

    <ChatSidebar
      v-if="showChat"
      :chatHistory="chatHistory"
      @clear-history="clearHistory"
      @close="showChat = false"
    />

    <SettingsPanel
      v-if="showSettings"
      v-model:avatarScale="avatarScale"
      v-model:lookAtUserEnabled="lookAtUserEnabled"
      v-model:lookAtScreenEnabled="lookAtScreenEnabled"
      @close="showSettings = false"
    />

    <ControlDock
      :isReady="systemReady"
      :isConnected="isConnected"
      :isSharingScreen="isSharingScreen"
      :showChat="showChat"
      :showSettings="showSettings"
      @toggle-connection="toggleConnection"
      @toggle-screen-share="toggleScreenShare"
      @toggle-chat="showChat = !showChat"
      @toggle-settings="showSettings = !showSettings"
      @file-upload="loadVRMFile"
    />

    <TransitionGroup
      name="toast"
      tag="div"
      class="pointer-events-none absolute right-4 top-24 z-50 flex w-[calc(100%-2rem)] flex-col items-end gap-3 sm:right-6 sm:w-auto"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-2xl border px-4 py-3"
      >
        <div class="mt-0.5 shrink-0">
          <CheckCircleIcon v-if="toast.type === 'success'" class="h-5 w-5 text-emerald-400" />
          <XCircleIcon v-else-if="toast.type === 'error'" class="h-5 w-5 text-rose-400" />
          <InformationCircleIcon v-else class="h-5 w-5 text-cyan-300" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-[color:var(--text-primary)]">{{ toast.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
            {{ toast.message }}
          </p>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CheckCircleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid'

import ChatSidebar from './components/ChatSidebar.vue'
import ControlDock from './components/ControlDock.vue'
import SciFiLoader from './components/SciFiLoader.vue'
import SettingsPanel from './components/SettingsPanel.vue'

import { createVRMChatSystem } from '../managers/index.js'

const canvasRef = ref(null)
const system = ref(null)
const systemReady = ref(false)
const isConnected = ref(false)
const isSharingScreen = ref(false)
const dragActive = ref(false)
const showChat = ref(false)
const showSettings = ref(false)
const fps = ref(0)
const toasts = ref([])
const loadingState = ref({
  progress: 0,
  stage: 'Booting Engine',
  detail: 'Preparing workspace',
})

const avatarScale = ref(parseFloat(localStorage.getItem('vrm_avatar_scale') || '2.0'))
const lookAtUserEnabled = ref(localStorage.getItem('vrm_look_at_user') !== 'false')
const lookAtScreenEnabled = ref(localStorage.getItem('vrm_look_at_screen') !== 'false')
const chatHistory = ref([])
const MAX_CHAT_HISTORY_ITEMS = 120
const DEBUG_USER_ID_STORAGE_KEY = 'vrm_debug_user_id'
const ASSISTANT_ACTOR_ID = 'assistant-riko'

const createDebugId = (prefix = 'id') => {
  const uuid = globalThis?.crypto?.randomUUID?.()
  const randomPart = uuid
    ? uuid.replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${randomPart}`
}

const getOrCreatePersistentId = (storageKey, prefix) => {
  const existing = localStorage.getItem(storageKey)
  if (existing && existing.trim().length > 0) {
    return existing.trim()
  }
  const created = createDebugId(prefix)
  localStorage.setItem(storageKey, created)
  return created
}

const userDebugId = ref(getOrCreatePersistentId(DEBUG_USER_ID_STORAGE_KEY, 'usr'))
const sessionDebugId = ref(createDebugId('sess'))

const stripControlCharacters = (value) => {
  let output = ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      output += value[i]
    }
  }
  return output
}

const sanitizeTranscriptText = (value) => {
  if (typeof value !== 'string') return ''
  return stripControlCharacters(value)
    .replace(/<ctrl\d+>/gi, '')
    .replace(/<[^>]*ctrl[^>]*>/gi, '')
    .replace(/<noise>/gi, '')
    .replace(/<silence>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const trimHistory = (items) => {
  if (!Array.isArray(items)) return []
  return items.slice(-MAX_CHAT_HISTORY_ITEMS)
}

const createHistoryEntry = (role, text, overrides = {}) => {
  const normalizedRole = role === 'user' ? 'user' : 'model'
  return {
    id: typeof overrides.id === 'string' && overrides.id ? overrides.id : createDebugId('msg'),
    role: normalizedRole,
    text,
    timestamp: Number.isFinite(Number(overrides.timestamp))
      ? Number(overrides.timestamp)
      : Date.now(),
    actorId:
      typeof overrides.actorId === 'string' && overrides.actorId
        ? overrides.actorId
        : normalizedRole === 'user'
          ? userDebugId.value
          : ASSISTANT_ACTOR_ID,
    userId:
      typeof overrides.userId === 'string' && overrides.userId
        ? overrides.userId
        : userDebugId.value,
    sessionId:
      typeof overrides.sessionId === 'string' && overrides.sessionId
        ? overrides.sessionId
        : sessionDebugId.value,
  }
}

const normalizeStoredHistory = (items) => {
  if (!Array.isArray(items)) return []
  const normalized = []
  for (const rawItem of items) {
    const role = rawItem?.role === 'user' ? 'user' : 'model'
    const text = sanitizeTranscriptText(rawItem?.text || '')
    if (!text) continue
    normalized.push(createHistoryEntry(role, text, rawItem || {}))
  }
  return trimHistory(normalized)
}

try {
  const saved = localStorage.getItem('vrm_chat_history')
  if (saved) {
    chatHistory.value = normalizeStoredHistory(JSON.parse(saved))
  }
} catch {
  chatHistory.value = []
}

watch(avatarScale, (val) => {
  localStorage.setItem('vrm_avatar_scale', val.toString())
  if (system.value) system.value.setAvatarScale(val)
})

watch(lookAtUserEnabled, (value) => {
  localStorage.setItem('vrm_look_at_user', value ? 'true' : 'false')
  if (system.value) {
    system.value.setLookAtOptions({
      user: value,
      screen: lookAtScreenEnabled.value,
    })
  }
  showToast(
    'Look At User',
    value ? 'AI can now look at you through camera.' : 'AI look-at-user is disabled.',
    'info',
  )
})

watch(lookAtScreenEnabled, (value) => {
  localStorage.setItem('vrm_look_at_screen', value ? 'true' : 'false')
  if (system.value) {
    system.value.setLookAtOptions({
      user: lookAtUserEnabled.value,
      screen: value,
    })
  }
  showToast(
    'Look At Screen',
    value ? 'AI can now analyze your shared screen.' : 'AI look-at-screen is disabled.',
    'info',
  )
})

watch(
  chatHistory,
  (val) => {
    const trimmed = trimHistory(val)
    if (trimmed.length !== val.length) {
      chatHistory.value = trimmed
      return
    }
    localStorage.setItem('vrm_chat_history', JSON.stringify(trimmed))
  },
  { deep: true },
)

let cleanupSystem = null
let fpsInterval = null
let dragDepth = 0
let toastCounter = 0

const updateLoadingState = (next = {}) => {
  const progress = Number.isFinite(next.progress) ? next.progress : loadingState.value.progress
  loadingState.value = {
    progress: Math.max(loadingState.value.progress, Math.min(100, Math.round(progress))),
    stage: next.stage || loadingState.value.stage,
    detail: next.detail ?? loadingState.value.detail,
  }
}

onMounted(async () => {
  if (!canvasRef.value) return

  updateLoadingState({ progress: 8, stage: 'Booting Engine', detail: 'Initializing client' })

  try {
    const initialUserName = (localStorage.getItem('vrm_user_name') || '').trim()
    const sys = await createVRMChatSystem(canvasRef.value, {
      onLoadProgress: updateLoadingState,
      debugIdentity: {
        userId: userDebugId.value,
        sessionId: sessionDebugId.value,
        userName: initialUserName,
      },
    })

    system.value = sys
    cleanupSystem = sys.cleanup
    sys.setLookAtOptions({
      user: lookAtUserEnabled.value,
      screen: lookAtScreenEnabled.value,
    })

    sys.visionManager.onStateChange = (isActive) => {
      isSharingScreen.value = isActive
      showToast(
        'Screen Share',
        isActive ? 'Screen sharing active' : 'Screen sharing stopped',
        isActive ? 'success' : 'info',
      )
    }

    if (sys.vrm) {
      systemReady.value = true
      sys.setAvatarScale(avatarScale.value)
      updateLoadingState({ progress: 100, stage: 'System Ready', detail: 'Avatar online' })
    } else {
      systemReady.value = true
      updateLoadingState({
        progress: 100,
        stage: 'System Ready',
        detail: 'Upload a VRM model to continue',
      })
      showToast('Avatar Missing', 'Default model not found. Upload a .vrm file.', 'info')
    }
  } catch (error) {
    console.error(error)
    updateLoadingState({ progress: 100, stage: 'Initialization Failed', detail: error.message })
    showToast('Initialization Failed', error.message, 'error')
  }

  fpsInterval = setInterval(() => {
    fps.value = system.value?.sceneManager?.getCurrentFps?.() || 0
  }, 1000)
})

onBeforeUnmount(() => {
  if (fpsInterval) clearInterval(fpsInterval)
  if (cleanupSystem) cleanupSystem()
})

function showToast(title, message, type = 'info') {
  toastCounter += 1
  const id = toastCounter
  const normalizedType = ['success', 'error', 'info'].includes(type) ? type : 'info'

  toasts.value.push({
    id,
    title,
    message,
    type: normalizedType,
  })

  setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 4200)
}

const toggleConnection = async () => {
  if (!system.value || !systemReady.value) return

  if (!system.value.vrm) {
    showToast('No Avatar', 'Load a VRM model before connecting.', 'error')
    return
  }

  if (isConnected.value) {
    system.value.aiClient.disconnect('User ended call')
    isConnected.value = false
    return
  }

  showToast('Connecting', 'Establishing live voice session...', 'info')

  try {
    await system.value.connect(
      chatHistory.value,
      {
        onUserNameSet: (name) => {
          localStorage.setItem('vrm_user_name', name)
          system.value?.telegramManager?.setDebugIdentity({
            userName: name,
            userId: userDebugId.value,
            sessionId: sessionDebugId.value,
          })
        },
        onMemorySaved: (key, value) => {
          const memories = JSON.parse(localStorage.getItem('vrm_user_memories') || '{}')
          memories[key] = value
          localStorage.setItem('vrm_user_memories', JSON.stringify(memories))
        },
        onMemoryDeleted: (key) => {
          const memories = JSON.parse(localStorage.getItem('vrm_user_memories') || '{}')
          delete memories[key]
          localStorage.setItem('vrm_user_memories', JSON.stringify(memories))
        },
        onSystemMessage: (title, msg, type) => showToast(title, msg, type),
        onDisconnect: (reason) => {
          isConnected.value = false
          showToast('Call Ended', reason, 'info')
        },
        onTranscription: (role, text, isFinal) => {
          const normalizedRole = role === 'user' ? 'user' : 'model'
          const normalizedText = sanitizeTranscriptText(text)
          if (!normalizedText) return

          const newHistory = [...chatHistory.value]
          const lastMsg = newHistory[newHistory.length - 1]

          if (!isFinal && lastMsg && lastMsg.role === normalizedRole) {
            lastMsg.text = normalizedText
            lastMsg.timestamp = Date.now()
            if (!lastMsg.id) lastMsg.id = createDebugId('msg')
            if (!lastMsg.actorId) {
              lastMsg.actorId =
                normalizedRole === 'user' ? userDebugId.value : ASSISTANT_ACTOR_ID
            }
            if (!lastMsg.userId) lastMsg.userId = userDebugId.value
            if (!lastMsg.sessionId) lastMsg.sessionId = sessionDebugId.value
            chatHistory.value = newHistory
            return
          }

          if (isFinal) {
            if (
              lastMsg &&
              lastMsg.role === normalizedRole &&
              normalizedText.startsWith(lastMsg.text.substring(0, 10))
            ) {
              lastMsg.text = normalizedText
              lastMsg.timestamp = Date.now()
              if (!lastMsg.id) lastMsg.id = createDebugId('msg')
              if (!lastMsg.actorId) {
                lastMsg.actorId =
                  normalizedRole === 'user' ? userDebugId.value : ASSISTANT_ACTOR_ID
              }
              if (!lastMsg.userId) lastMsg.userId = userDebugId.value
              if (!lastMsg.sessionId) lastMsg.sessionId = sessionDebugId.value
              chatHistory.value = newHistory
              return
            }

            chatHistory.value = trimHistory([
              ...newHistory,
              createHistoryEntry(normalizedRole, normalizedText),
            ])
            return
          }

          chatHistory.value = trimHistory([
            ...newHistory,
            createHistoryEntry(normalizedRole, normalizedText),
          ])
        },
      },
      '',
      true,
      localStorage.getItem('vrm_user_name'),
      {
        userId: userDebugId.value,
        sessionId: sessionDebugId.value,
        userName: (localStorage.getItem('vrm_user_name') || '').trim(),
      },
    )

    isConnected.value = true
  } catch (error) {
    console.error(error)
    showToast('Connection Failed', error.message, 'error')
    isConnected.value = false
  }
}

const toggleScreenShare = async () => {
  if (!system.value || !systemReady.value) return

  if (isSharingScreen.value) {
    await system.value.stopScreenShare()
    return
  }

  try {
    const started = await system.value.startScreenShare()
    if (!started) {
      showToast('Screen Share', 'Could not start screen sharing.', 'error')
    }
  } catch {
    showToast('Screen Share', 'Screen share permission was blocked.', 'error')
  }
}

const clearHistory = () => {
  chatHistory.value = []
  localStorage.removeItem('vrm_chat_history')
}

const handleDrag = (event) => {
  if (event.type === 'dragenter') {
    dragDepth += 1
    dragActive.value = true
    return
  }

  if (event.type === 'dragleave') {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) {
      dragActive.value = false
    }
    return
  }

  if (event.type === 'dragover') {
    dragActive.value = true
  }
}

const handleDrop = async (event) => {
  dragDepth = 0
  dragActive.value = false

  if (event.dataTransfer.files && event.dataTransfer.files[0]) {
    await loadVRMFile(event.dataTransfer.files[0])
  }
}

const loadVRMFile = async (file) => {
  if (!file.name.toLowerCase().endsWith('.vrm')) {
    showToast('Invalid File', 'Please upload a .vrm file.', 'error')
    return
  }

  showToast('Loading Avatar', `Processing ${file.name}...`, 'info')
  try {
    await system.value?.loadNewVRM(file)
    showToast('Avatar Updated', 'New model loaded successfully.', 'success')
  } catch {
    showToast('Load Failed', 'Could not load this VRM file.', 'error')
  }
}
</script>

