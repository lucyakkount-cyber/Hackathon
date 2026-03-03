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
      class="absolute inset-0 z-50 pointer-events-none transition-opacity duration-[1000ms] ease-in-out"
      :class="loadingState.progress >= 100 ? 'opacity-0 delay-200' : 'opacity-100'"
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
        class="absolute inset-0 z-40 m-3 sm:m-6 flex items-center justify-center rounded-3xl border border-cyan-500/40 bg-black/80 backdrop-blur-xl"
      >
        <div class="rounded-2xl border border-cyan-500/30 px-8 py-6 text-center">
          <p class="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-200/70">
            Drag and Drop
          </p>
          <p class="mt-2 text-xl sm:text-2xl font-semibold tracking-wide text-white">
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
                  ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]'
                  : 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
              "
            ></span>
            <p class="text-[11px] font-mono uppercase tracking-[0.18em] text-white/50">
              {{ isConnected ? 'Live Session Active' : 'System Standby' }}
            </p>
          </div>
          <p class="mt-2 text-sm text-white/40">
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
          <p
            class="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
          >
            Render FPS
          </p>
          <p class="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">{{ fps }}</p>
          <p class="mt-1 text-[11px] text-[color:var(--text-muted)]">
            {{ systemReady ? 'Scene ready' : 'Initializing scene' }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="showChat" class="absolute inset-0 z-40" @click.self="showChat = false">
      <ChatSidebar
        :chatHistory="chatHistory"
        @clear-history="clearHistory"
        @close="showChat = false"
      />
    </div>

    <div v-if="showSettings" class="absolute inset-0 z-50" @click.self="showSettings = false">
      <SettingsPanel
        v-model:avatarScale="avatarScale"
        v-model:lookAtUserEnabled="lookAtUserEnabled"
        v-model:lookAtScreenEnabled="lookAtScreenEnabled"
        :availableModels="availableModels"
        :activePersonaTitle="selectedPersona?.title || 'Default Riko'"
        :activePersonaDescription="
          selectedPersona?.description || 'Original Riko personality used by the app.'
        "
        @switch-model="handleModelSwitch"
        @delete-model="handleModelDelete"
        @open-persona-manager="openPersonaManager"
        @close="showSettings = false"
      />
    </div>

    <div
      v-if="showPersonaManager"
      class="absolute inset-0 z-[60]"
      @click.self="showPersonaManager = false"
    >
      <PersonaManagerDialog
        :personas="personas"
        :selectedPersonaId="selectedPersonaId"
        @select-persona="handlePersonaSelect"
        @create-persona="handlePersonaCreate"
        @update-persona="handlePersonaUpdate"
        @delete-persona="handlePersonaDelete"
        @close="showPersonaManager = false"
      />
    </div>

    <ControlDock
      :isReady="systemReady"
      :isConnected="isConnected"
      :isSharingScreen="isSharingScreen"
      :showChat="showChat"
      :showSettings="showSettings"
      @toggle-connection="toggleConnection"
      @toggle-screen-share="toggleScreenShare"
      @toggle-chat="toggleChatPanel"
      @toggle-settings="toggleSettingsPanel"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CheckCircleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid'

import ChatSidebar from './components/ChatSidebar.vue'
import ControlDock from './components/ControlDock.vue'
import PersonaManagerDialog from './components/PersonaManagerDialog.vue'
import SciFiLoader from './components/SciFiLoader.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const canvasRef = ref(null)
const system = ref(null)
const systemReady = ref(false)
const isConnected = ref(false)
const isSharingScreen = ref(false)
const dragActive = ref(false)
const showChat = ref(false)
const showSettings = ref(false)
const showPersonaManager = ref(false)
const fps = ref(0)
const toasts = ref([])
const availableModels = ref([])
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
const RECONNECT_WINDOW_MS = 180000
const RECONNECT_HINT_THRESHOLD = 3

import { generateDeviceFingerprint } from './utils/deviceFingerprint.js'

const createDebugId = (prefix = 'id') => {
  const uuid = globalThis?.crypto?.randomUUID?.()
  const randomPart = uuid
    ? uuid.replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${randomPart}`
}

const PERSONAS_STORAGE_KEY = 'vrm_personas'
const SELECTED_PERSONA_STORAGE_KEY = 'vrm_selected_persona_id'
const DEFAULT_PERSONA_ID = 'persona-default-riko'

const DEFAULT_PERSONA = Object.freeze({
  id: DEFAULT_PERSONA_ID,
  title: 'Default Riko',
  description: 'Original Riko personality used by the app.',
  prompt: '',
  isDefault: true,
})

const SAMPLE_PERSONAS = Object.freeze([
  {
    id: 'persona-sample-mentor',
    title: 'Calm Mentor',
    description: 'Patient teacher that explains clearly and keeps a supportive tone.',
    prompt:
      'You are a calm and practical mentor. Explain clearly, avoid drama, and guide the user step-by-step. Be friendly, direct, and solution-focused. Keep answers concise but complete.',
    isDefault: false,
  },
  {
    id: 'persona-sample-reviewer',
    title: 'Strict Reviewer',
    description: 'Direct technical reviewer focused on correctness, risks, and tradeoffs.',
    prompt:
      'You are a strict technical reviewer. Focus on correctness, edge cases, and practical tradeoffs. Point out flaws quickly, propose concrete fixes, and avoid vague advice.',
    isDefault: false,
  },
  {
    id: 'persona-sample-friend',
    title: 'Friendly Companion',
    description: 'Warm, casual, and upbeat conversational style with short responses.',
    prompt:
      'You are a warm and friendly AI companion. Keep a casual tone, use simple language, and give short helpful replies. Be kind and positive while staying useful.',
    isDefault: false,
  },
])

const sanitizePersonaText = (value, maxLength) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength).trim()
}

const normalizeStoredPersona = (raw) => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const title = sanitizePersonaText(raw?.title, 60)
  const description = sanitizePersonaText(raw?.description, 180)
  const prompt = sanitizePersonaText(raw?.prompt, 5000)
  if (!id || !title || !description || !prompt) return null
  if (id === DEFAULT_PERSONA_ID) return null
  return {
    id,
    title,
    description,
    prompt,
    isDefault: false,
  }
}

const getSeedPersonas = () => [DEFAULT_PERSONA, ...SAMPLE_PERSONAS.map((persona) => ({ ...persona }))]

const loadPersonasFromStorage = () => {
  try {
    const raw = localStorage.getItem(PERSONAS_STORAGE_KEY)
    if (!raw) return getSeedPersonas()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return getSeedPersonas()
    const normalized = parsed
      .map((item) => normalizeStoredPersona(item))
      .filter((item) => item && item.id !== DEFAULT_PERSONA_ID)
    if (normalized.length === 0) return getSeedPersonas()
    return [DEFAULT_PERSONA, ...normalized]
  } catch {
    return getSeedPersonas()
  }
}

const personas = ref(loadPersonasFromStorage())
const selectedPersonaId = ref(localStorage.getItem(SELECTED_PERSONA_STORAGE_KEY) || DEFAULT_PERSONA_ID)
if (!personas.value.some((persona) => persona.id === selectedPersonaId.value)) {
  selectedPersonaId.value = DEFAULT_PERSONA_ID
}

const selectedPersona = computed(
  () =>
    personas.value.find((persona) => persona.id === selectedPersonaId.value) ||
    personas.value[0] ||
    DEFAULT_PERSONA,
)

const selectedPersonaPrompt = computed(() => {
  if (!selectedPersona.value || selectedPersona.value.isDefault) return ''
  return sanitizePersonaText(selectedPersona.value.prompt, 5000)
})

const userDebugId = ref(localStorage.getItem(DEBUG_USER_ID_STORAGE_KEY) || '')
const sessionDebugId = ref(createDebugId('sess'))

// Initialize persistent ID
generateDeviceFingerprint().then((fp) => {
  userDebugId.value = fp
  localStorage.setItem(DEBUG_USER_ID_STORAGE_KEY, fp)
  if (system.value?.telegramManager) {
    system.value.telegramManager.setDebugIdentity({
      userId: fp,
    })
  }
})

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
      // recursive entry will trigger the update below
      return
    }
    localStorage.setItem('vrm_chat_history', JSON.stringify(trimmed))

    // Update Telegram debug info with message count
    if (system.value?.telegramManager) {
      system.value.telegramManager.setDebugIdentity({
        messageCount: trimmed.length,
      })
    }
  },
  { deep: true },
)

watch(
  personas,
  (list) => {
    const sanitized = list
      .filter((persona) => !persona.isDefault && persona.id !== DEFAULT_PERSONA_ID)
      .map((persona) => ({
        id: persona.id,
        title: sanitizePersonaText(persona.title, 60),
        description: sanitizePersonaText(persona.description, 180),
        prompt: sanitizePersonaText(persona.prompt, 5000),
      }))

    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(sanitized))

    if (!list.some((persona) => persona.id === selectedPersonaId.value)) {
      selectedPersonaId.value = DEFAULT_PERSONA_ID
    }
  },
  { deep: true },
)

watch(selectedPersonaId, (nextId) => {
  const exists = personas.value.some((persona) => persona.id === nextId)
  const resolvedId = exists ? nextId : DEFAULT_PERSONA_ID
  if (resolvedId !== nextId) {
    selectedPersonaId.value = resolvedId
    return
  }
  localStorage.setItem(SELECTED_PERSONA_STORAGE_KEY, resolvedId)
})

let cleanupSystem = null
let fpsInterval = null
let dragDepth = 0
let toastCounter = 0
let reconnectEventTimestamps = []
let lastReconnectHintAt = 0

const updateLoadingState = (next = {}) => {
  const progress = Number.isFinite(next.progress) ? next.progress : loadingState.value.progress
  loadingState.value = {
    progress: Math.max(loadingState.value.progress, Math.min(100, Math.round(progress))),
    stage: next.stage || loadingState.value.stage,
    detail: next.detail ?? loadingState.value.detail,
  }
}

const selectedModelKey = ref(localStorage.getItem('vrm_selected_model_key') || null)

onMounted(async () => {
  if (!canvasRef.value) return

  updateLoadingState({ progress: 8, stage: 'Booting Engine', detail: 'Initializing client' })

  try {
    // Dynamic import to reduce initial bundle size
    const { createVRMChatSystem } = await import('../managers/index.js')

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

    // Refresh models first to populate availableModels
    await refreshModels()

    if (sys.vrm) {
      // If vrm is already loaded by default logic in createVRMChatSystem, strictly speaking we might want to override it
      // if the user has a different preferred model.
      // However, createVRMChatSystem likely loads the default model hardcoded.
      // We should check our preference.

      if (selectedModelKey.value) {
        // Verify if this key still exists in available models
        const exists = availableModels.value.find((m) => m.key === selectedModelKey.value)
        if (exists) {
          console.log('Loading saved model preference:', selectedModelKey.value)
          await system.value.loadNewVRM(selectedModelKey.value)
        } else {
          // Key expired or deleted? Revert to null
          selectedModelKey.value = null
          localStorage.removeItem('vrm_selected_model_key')
        }
      }

      systemReady.value = true
      sys.setAvatarScale(avatarScale.value)
      updateLoadingState({ progress: 100, stage: 'System Ready', detail: 'Avatar online' })
    } else {
      // Fallback if no default model loaded (rare if code hasn't changed structure)
      // But if we have a saved key, try loading it
      if (selectedModelKey.value) {
        try {
          await system.value.loadNewVRM(selectedModelKey.value)
          systemReady.value = true
          sys.setAvatarScale(avatarScale.value)
          updateLoadingState({
            progress: 100,
            stage: 'System Ready',
            detail: 'Restored User Avatar',
          })
        } catch (e) {
          console.warn('Failed to restore saved model', e)
          // Fallback
          systemReady.value = true
          updateLoadingState({
            progress: 100,
            stage: 'System Ready',
            detail: 'Upload a VRM model to continue',
          })
          showToast('Avatar Missing', 'Saved model not found. Upload a .vrm file.', 'info')
        }
      } else {
        systemReady.value = true
        updateLoadingState({
          progress: 100,
          stage: 'System Ready',
          detail: 'Upload a VRM model to continue',
        })
        showToast('Avatar Missing', 'Default model not found. Upload a .vrm file.', 'info')
      }
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

const trackReconnectIssue = () => {
  const now = Date.now()
  reconnectEventTimestamps = reconnectEventTimestamps.filter(
    (timestamp) => now - timestamp <= RECONNECT_WINDOW_MS,
  )
  reconnectEventTimestamps.push(now)

  const shouldShowHint =
    reconnectEventTimestamps.length >= RECONNECT_HINT_THRESHOLD &&
    now - lastReconnectHintAt > RECONNECT_WINDOW_MS / 2

  if (shouldShowHint) {
    lastReconnectHintAt = now
    showToast(
      'Performance Tip',
      'Frequent reconnects detected. Open chat and clear history to lighten the session.',
      'info',
    )
  }
}

const openPersonaManager = () => {
  showSettings.value = false
  showPersonaManager.value = true
}

const toggleChatPanel = () => {
  const next = !showChat.value
  showChat.value = next
  if (next) {
    showSettings.value = false
    showPersonaManager.value = false
  }
}

const toggleSettingsPanel = () => {
  const next = !showSettings.value
  showSettings.value = next
  if (next) {
    showChat.value = false
    showPersonaManager.value = false
  }
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
        onLookAtOptionsChange: (nextOptions = {}) => {
          if (typeof nextOptions.user === 'boolean') {
            lookAtUserEnabled.value = nextOptions.user
          }
          if (typeof nextOptions.screen === 'boolean') {
            lookAtScreenEnabled.value = nextOptions.screen
          }
        },
        onDisconnect: (reason) => {
          isConnected.value = false
          trackReconnectIssue()
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
              lastMsg.actorId = normalizedRole === 'user' ? userDebugId.value : ASSISTANT_ACTOR_ID
            }
            if (!lastMsg.userId) lastMsg.userId = userDebugId.value
            if (!lastMsg.sessionId) lastMsg.sessionId = sessionDebugId.value
            chatHistory.value = newHistory
            return
          }

          if (isFinal) {
            // For USER messages: always append to last user message to accumulate speech
            // For MODEL messages: check if it's a continuation
            if (normalizedRole === 'user' && lastMsg && lastMsg.role === 'user') {
              // Append to existing user message (accumulate across pauses)
              lastMsg.text = normalizedText
              lastMsg.timestamp = Date.now()
              if (!lastMsg.id) lastMsg.id = createDebugId('msg')
              if (!lastMsg.actorId) lastMsg.actorId = userDebugId.value
              if (!lastMsg.userId) lastMsg.userId = userDebugId.value
              if (!lastMsg.sessionId) lastMsg.sessionId = sessionDebugId.value
              chatHistory.value = newHistory
              return
            }

            if (
              normalizedRole === 'model' &&
              lastMsg &&
              lastMsg.role === normalizedRole &&
              normalizedText.startsWith(lastMsg.text.substring(0, 10))
            ) {
              lastMsg.text = normalizedText
              lastMsg.timestamp = Date.now()
              if (!lastMsg.id) lastMsg.id = createDebugId('msg')
              if (!lastMsg.actorId) lastMsg.actorId = ASSISTANT_ACTOR_ID
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
        getHistory: () => chatHistory.value,
      },
      '',
      true,
      localStorage.getItem('vrm_user_name'),
      {
        userId: userDebugId.value,
        sessionId: sessionDebugId.value,
        userName: (localStorage.getItem('vrm_user_name') || '').trim(),
      },
      selectedPersonaPrompt.value,
    )

    isConnected.value = true
  } catch (error) {
    console.error(error)
    trackReconnectIssue()
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

const normalizePersonaPayload = (payload = {}) => {
  return {
    title: sanitizePersonaText(payload?.title, 60),
    description: sanitizePersonaText(payload?.description, 180),
    prompt: sanitizePersonaText(payload?.prompt, 5000),
  }
}

const handlePersonaSelect = (personaId) => {
  if (typeof personaId !== 'string' || !personaId.trim()) return
  const exists = personas.value.some((persona) => persona.id === personaId)
  if (!exists) return
  selectedPersonaId.value = personaId
  if (isConnected.value) {
    showToast('Persona Queued', 'Disconnect and reconnect to apply the new persona.', 'info')
  }
}

const handlePersonaCreate = (payload) => {
  const next = normalizePersonaPayload(payload)
  if (!next.title || !next.description || !next.prompt) {
    showToast('Persona Error', 'Title, description, and prompt are required.', 'error')
    return
  }

  const createdPersona = {
    id: createDebugId('persona'),
    title: next.title,
    description: next.description,
    prompt: next.prompt,
    isDefault: false,
  }

  personas.value = [...personas.value, createdPersona]
  selectedPersonaId.value = createdPersona.id
  showToast('Persona Added', `"${createdPersona.title}" is ready to use.`, 'success')
}

const handlePersonaUpdate = (payload) => {
  const personaId = typeof payload?.id === 'string' ? payload.id.trim() : ''
  if (!personaId || personaId === DEFAULT_PERSONA_ID) return

  const index = personas.value.findIndex((persona) => persona.id === personaId)
  if (index < 0) return

  const next = normalizePersonaPayload(payload)
  if (!next.title || !next.description || !next.prompt) {
    showToast('Persona Error', 'Title, description, and prompt are required.', 'error')
    return
  }

  const updated = [...personas.value]
  updated[index] = {
    ...updated[index],
    title: next.title,
    description: next.description,
    prompt: next.prompt,
    isDefault: false,
  }
  personas.value = updated
  showToast('Persona Updated', `"${next.title}" saved.`, 'success')
}

const handlePersonaDelete = (personaId) => {
  if (typeof personaId !== 'string' || !personaId.trim() || personaId === DEFAULT_PERSONA_ID) {
    return
  }

  const target = personas.value.find((persona) => persona.id === personaId)
  if (!target) return

  if (!confirm(`Delete persona "${target.title}"?`)) return

  personas.value = personas.value.filter((persona) => persona.id !== personaId)

  if (selectedPersonaId.value === personaId) {
    selectedPersonaId.value = DEFAULT_PERSONA_ID
  }

  showToast('Persona Deleted', `"${target.title}" removed.`, 'success')
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

const refreshModels = async () => {
  if (system.value?.cacheManager) {
    try {
      const models = await system.value.cacheManager.getMetadataAll('models')
      // Filter ONLY user models (hides default/internal paths)
      const userModels = models.filter((m) => m.meta?.type === 'user')

      // Sort by date descending
      availableModels.value = userModels.sort((a, b) => {
        const dateA = a.meta?.date || 0
        const dateB = b.meta?.date || 0
        return dateB - dateA
      })
    } catch (e) {
      console.warn('Failed to refresh models', e)
    }
  }
}

const handleModelSwitch = async (modelKey) => {
  if (!system.value) return

  // If undefined/null, it means "Default"
  if (!modelKey) {
    await loadVRMFile({ name: 'Default', url: '/models/riko.vrm' }, true)
    selectedModelKey.value = null
    localStorage.removeItem('vrm_selected_model_key')
    return
  }

  showToast('Switching Avatar', 'Loading cached model...', 'info')
  try {
    // Pass the key. vrmLoader will try cache first.
    // If it's a "user" model, the key was used as the cache key.
    await system.value.loadNewVRM(modelKey)
    selectedModelKey.value = modelKey
    localStorage.setItem('vrm_selected_model_key', modelKey)
    showToast('Avatar Updated', 'Model loaded from cache.', 'success')
  } catch (error) {
    console.error(error)
    showToast('Load Failed', 'Could not load cached model.', 'error')
  }
}

const handleModelDelete = async (modelKey) => {
  if (!system.value || !modelKey) return
  if (confirm('Are you sure you want to delete this model?')) {
    try {
      await system.value.deleteModel(modelKey)
      showToast('Deleted', 'Model removed from cache.', 'success')
      // If deleted model was selected, revert preference?
      if (selectedModelKey.value === modelKey) {
        selectedModelKey.value = null
        localStorage.removeItem('vrm_selected_model_key')
      }
      await refreshModels()
    } catch {
      showToast('Error', 'Failed to delete model.', 'error')
    }
  }
}

const loadVRMFile = async (file, isUrl = false) => {
  if (!isUrl && !file.name.toLowerCase().endsWith('.vrm')) {
    showToast('Invalid File', 'Please upload a .vrm file.', 'error')
    return
  }

  showToast('Loading Avatar', `Processing ${file.name || 'default model'}...`, 'info')
  try {
    // If uploading a new user file, DELETE ALL OLD USER MODELS FIRST
    if (!isUrl && system.value?.cacheManager) {
      try {
        const allModels = await system.value.cacheManager.getMetadataAll('models')
        const userModels = allModels.filter((m) => m.meta?.type === 'user')

        for (const m of userModels) {
          console.log('Removing old user model:', m.key)
          await system.value.deleteModel(m.key)
        }

        // Clear available models locally to reflect immediate removal in UI
        availableModels.value = []
      } catch (e) {
        console.warn('Failed to cleanup old models', e)
      }
    }

    if (isUrl) {
      await system.value?.loadNewVRM(file.url)
    } else {
      // system.loadNewVRM might return the key if we updated it?
      // Actually loadNewVRM calls loader.loadVRMFromFile which caches it.
      // We need to know what the key is to allow setting it as "selected".
      // But vrmLoader currently doesn't return the key easily up the chain.
      // However, since we are sorting by date, the newest one is likely the one we just added.
      await system.value?.loadNewVRM(file)
    }
    showToast('Avatar Updated', 'New model loaded successfully.', 'success')
    await refreshModels()

    // Auto-select the newest if it was a file upload (implies user wants it)
    if (!isUrl && availableModels.value.length > 0) {
      // The first one is the newest
      const newest = availableModels.value[0]
      // Is it the one we just uploaded? (meta.date is roughly now)
      if (Date.now() - (newest.meta?.date || 0) < 5000) {
        selectedModelKey.value = newest.key
        localStorage.setItem('vrm_selected_model_key', newest.key)
      }
    }
  } catch {
    showToast('Load Failed', 'Could not load this VRM file.', 'error')
  }
}
</script>
