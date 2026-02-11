<template>
  <div
    class="panel-shell absolute bottom-24 right-3 top-20 z-30 flex w-[min(420px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border sm:bottom-28 sm:right-4"
  >
    <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-[color:var(--accent-cyan)]"></span>
        <p
          class="text-[11px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
        >
          Conversation Log ({{ chatHistory.length }})
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-muted)] transition-colors hover:text-rose-300"
          @click="$emit('clear-history')"
        >
          Clear
        </button>
        <button
          class="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
          @click="$emit('close')"
        >
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div
      ref="chatContainerRef"
      class="scroll-area flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4"
    >
      <div
        v-if="chatHistory.length === 0"
        class="flex h-full flex-col items-center justify-center gap-2 text-[color:var(--text-muted)]"
      >
        <ChatBubbleLeftRightIcon class="h-6 w-6 opacity-70" />
        <p class="text-xs font-mono uppercase tracking-[0.16em]">No messages yet</p>
      </div>

      <div
        v-for="(msg, idx) in chatHistory"
        :key="msg.id || idx"
        class="flex flex-col"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <div
          class="max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed"
          :class="
            msg.role === 'user'
              ? 'border-cyan-300/35 bg-cyan-500/14 text-[color:var(--text-primary)]'
              : 'border-white/10 bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]'
          "
        >
          {{ msg.text }}
        </div>
        <div class="mt-1.5 flex items-center gap-2 px-1">
          <span
            class="text-[10px] font-mono uppercase tracking-[0.14em]"
            :class="msg.role === 'user' ? 'text-cyan-300' : 'text-emerald-300'"
          >
            {{ msg.role === 'user' ? 'You' : 'Riko' }}
          </span>
          <span class="text-[10px] text-[color:var(--text-muted)]">·</span>
          <span class="text-[10px] font-mono text-[color:var(--text-muted)]">
            {{ formatTime(msg.timestamp) }}
          </span>
          <span
            v-if="msg.actorId"
            class="rounded border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-mono tracking-[0.08em] text-[color:var(--text-muted)]"
          >
            {{ formatActorId(msg.actorId) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/vue/24/solid'

const props = defineProps({
  chatHistory: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['clear-history', 'close'])

const chatContainerRef = ref(null)

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatActorId = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '')
  return compact.length > 8 ? compact.slice(-8) : compact
}

watch(
  () => props.chatHistory,
  () => {
    nextTick(() => {
      const container = chatContainerRef.value
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        })
      }
    })
  },
  { deep: true },
)
</script>
