<template>
  <div
    class="panel-shell no-scrollbar absolute bottom-4 left-1/2 z-30 max-h-[calc(100vh-7.5rem)] w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-3xl border border-cyan-500/20 bg-black/80 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out sm:bottom-24 sm:max-h-[calc(100vh-10rem)]"
  >
    <div class="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
      <div class="flex items-center gap-2">
        <div
          class="h-1.5 w-1.5 rounded-full bg-cyan-400 font-bold shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse"
        ></div>
        <p class="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-100/90 text-shadow-sm">
          System Control
        </p>
      </div>
      <button
        class="group rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        @click="$emit('close')"
      >
        <XMarkIcon class="h-5 w-5 transition-transform group-hover:rotate-90" />
      </button>
    </div>

    <div class="space-y-6">
      <div class="space-y-3">
        <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
          Identity Matrix
        </p>

        <div class="space-y-2 max-h-[160px] overflow-y-auto pr-1 no-scrollbar">
          <div
            class="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-cyan-900/20 hover:border-cyan-500/30 cursor-pointer"
            @click="$emit('switch-model', null)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 border border-white/10 text-indigo-400 shadow-inner group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-colors"
              >
                <CubeIcon class="h-5 w-5" />
              </div>
              <div>
                <p
                  class="text-xs font-semibold text-white/90 group-hover:text-cyan-100 transition-colors"
                >
                  Default Riko
                </p>
                <p class="text-[10px] text-white/40 group-hover:text-cyan-200/50 transition-colors">
                  System Model
                </p>
              </div>
            </div>
          </div>

          <div
            v-for="model in availableModels"
            :key="model.key"
            class="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-cyan-900/20 hover:border-cyan-500/30 cursor-pointer"
            @click="$emit('switch-model', model.key)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 border border-white/10 text-emerald-400 shadow-inner group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-colors"
              >
                <UserCircleIcon class="h-5 w-5" />
              </div>
              <div class="min-w-0 truncate">
                <p
                  class="truncate text-xs font-semibold text-white/90 group-hover:text-cyan-100 transition-colors"
                >
                  {{ model.meta?.name || 'Unknown Model' }}
                </p>
                <p class="text-[10px] text-white/40 group-hover:text-cyan-200/50 transition-colors">
                  {{ formatTimeAgo(model.meta?.date) }}
                </p>
              </div>
            </div>

            <button
              class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/40 hover:bg-rose-500/20 hover:text-rose-300 transition-all"
              @click.stop="$emit('delete-model', model.key)"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            AI Persona
          </p>
          <button
            class="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-200 transition hover:bg-cyan-500/20"
            @click="$emit('open-persona-manager')"
          >
            <PencilSquareIcon class="h-3.5 w-3.5" />
            Edit Personas
          </button>
        </div>

        <div class="rounded-xl border border-white/10 bg-black/35 p-3">
          <div class="flex items-center gap-2">
            <SparklesIcon class="h-4 w-4 text-cyan-300/80" />
            <p class="text-xs font-semibold text-white/90 truncate">{{ activePersonaTitle }}</p>
          </div>
          <p class="mt-1 text-[10px] leading-relaxed text-white/50">
            {{ activePersonaDescription || 'Original Riko personality used by the app.' }}
          </p>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            Projection Scale
          </p>
          <div
            class="rounded bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
          >
            {{ props.avatarScale.toFixed(1) }}x
          </div>
        </div>

        <div class="relative h-6 flex items-center group">
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            :value="props.avatarScale"
            class="range-slider w-full h-[2px] bg-white/10 rounded-full appearance-none cursor-pointer outline-none transition-colors group-hover:bg-white/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            @input="handleScaleChange"
          />
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
          Vision Sensors
        </p>

        <div class="flex gap-2">
          <button
            class="flex-1 rounded-xl border p-3 transition-all duration-300 text-left relative overflow-hidden group shadow-lg"
            :class="
              props.lookAtUserEnabled
                ? 'bg-cyan-950/30 border-cyan-500/40 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
            "
            @click="toggleLookAtUser"
          >
            <div class="relative z-10">
              <div class="flex items-center justify-between mb-2">
                <div class="relative">
                  <EyeIcon
                    v-if="props.lookAtUserEnabled"
                    class="h-5 w-5 transition-colors duration-300 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  />
                  <EyeSlashIcon
                    v-else
                    class="h-5 w-5 transition-colors duration-300 text-white/20"
                  />
                </div>
                <div
                  class="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  :class="
                    props.lookAtUserEnabled
                      ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]'
                      : 'bg-white/10'
                  "
                ></div>
              </div>
              <p
                class="text-xs font-medium tracking-wide"
                :class="props.lookAtUserEnabled ? 'text-cyan-100' : 'text-white/30'"
              >
                Face Track
              </p>
            </div>
          </button>

          <button
            class="flex-1 rounded-xl border p-3 transition-all duration-300 text-left relative overflow-hidden group shadow-lg"
            :class="
              props.lookAtScreenEnabled
                ? 'bg-purple-900/20 border-purple-500/40 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
            "
            @click="toggleLookAtScreen"
          >
            <div class="relative z-10">
              <div class="flex items-center justify-between mb-2">
                <div class="relative">
                  <ComputerDesktopIcon
                    class="h-5 w-5 transition-colors duration-300"
                    :class="
                      props.lookAtScreenEnabled
                        ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]'
                        : 'text-white/20'
                    "
                  />
                  <NoSymbolIcon
                    v-if="!props.lookAtScreenEnabled"
                    class="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 text-white/30 drop-shadow-md"
                  />
                </div>
                <div
                  class="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  :class="
                    props.lookAtScreenEnabled
                      ? 'bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,1)]'
                      : 'bg-white/10'
                  "
                ></div>
              </div>
              <p
                class="text-xs font-medium tracking-wide"
                :class="props.lookAtScreenEnabled ? 'text-purple-100' : 'text-white/30'"
              >
                Screen Sense
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ComputerDesktopIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  SparklesIcon,
  TrashIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/solid'

const props = defineProps({
  avatarScale: {
    type: Number,
    required: true,
  },
  lookAtUserEnabled: {
    type: Boolean,
    default: true,
  },
  lookAtScreenEnabled: {
    type: Boolean,
    default: true,
  },
  availableModels: {
    type: Array,
    default: () => [],
  },
  activePersonaTitle: {
    type: String,
    default: 'Default Riko',
  },
  activePersonaDescription: {
    type: String,
    default: '',
  },
})

const emit = defineEmits([
  'close',
  'update:avatarScale',
  'update:lookAtUserEnabled',
  'update:lookAtScreenEnabled',
  'switch-model',
  'delete-model',
  'open-persona-manager',
])

const handleScaleChange = (event) => {
  emit('update:avatarScale', parseFloat(event.target.value))
}

const toggleLookAtUser = () => {
  emit('update:lookAtUserEnabled', !props.lookAtUserEnabled)
}

const toggleLookAtScreen = () => {
  emit('update:lookAtScreenEnabled', !props.lookAtScreenEnabled)
}

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown date'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  const intervals = {
    year: 31536000,
    month: 2592000,
    day: 86400,
    hour: 3600,
    minute: 60,
  }

  if (seconds < 60) return 'Just now'

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit)
    if (interval >= 1) {
      return `Cached ${interval} ${unit}${interval === 1 ? '' : 's'} ago`
    }
  }
  return 'Just now'
}
</script>

<style scoped>
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.text-shadow-sm {
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}
</style>
