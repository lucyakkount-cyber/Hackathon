<template>
  <div
    class="panel-shell absolute bottom-24 left-1/2 z-30 w-[min(360px,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border p-4 sm:bottom-28"
  >
    <div class="mb-4 flex items-center justify-between">
      <p
        class="text-[11px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
      >
        Scene Settings
      </p>
      <button
        class="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
        @click="$emit('close')"
      >
        <XMarkIcon class="h-4 w-4" />
      </button>
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          Avatar Scale
        </p>
        <p class="text-xs font-mono text-[color:var(--text-primary)]">
          {{ props.avatarScale.toFixed(1) }}x
        </p>
      </div>

      <input
        type="range"
        min="0.5"
        max="3.0"
        step="0.1"
        :value="props.avatarScale"
        class="range-track"
        @input="handleScaleChange"
      />

      <div
        class="flex items-center justify-between text-[10px] font-mono text-[color:var(--text-muted)]"
      >
        <span>0.5x</span>
        <span>3.0x</span>
      </div>
    </div>

    <div class="mt-4 border-t border-white/10 pt-4">
      <p
        class="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
      >
        AI Vision Controls
      </p>

      <div class="mt-3 space-y-2.5">
        <button
          class="toggle-row"
          :class="props.lookAtUserEnabled ? 'is-on' : ''"
          @click="toggleLookAtUser"
        >
          <div>
            <p class="text-sm font-medium text-[color:var(--text-primary)]">Look at Me</p>
            <p class="text-[11px] text-[color:var(--text-muted)]">Enable camera-based AI vision.</p>
          </div>
          <span class="switch-track">
            <span class="switch-thumb"></span>
          </span>
        </button>

        <button
          class="toggle-row"
          :class="props.lookAtScreenEnabled ? 'is-on' : ''"
          @click="toggleLookAtScreen"
        >
          <div>
            <p class="text-sm font-medium text-[color:var(--text-primary)]">Look at Screen</p>
            <p class="text-[11px] text-[color:var(--text-muted)]">
              Enable shared-screen AI vision.
            </p>
          </div>
          <span class="switch-track">
            <span class="switch-thumb"></span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { XMarkIcon } from '@heroicons/vue/24/solid'

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
})

const emit = defineEmits([
  'close',
  'update:avatarScale',
  'update:lookAtUserEnabled',
  'update:lookAtScreenEnabled',
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
</script>
