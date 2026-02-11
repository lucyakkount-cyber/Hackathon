<template>
  <div
    class="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[min(680px,calc(100%-1.5rem))] -translate-x-1/2 sm:bottom-7"
  >
    <div
      class="dock-shell pointer-events-auto mx-auto flex items-center justify-between gap-2 rounded-[1.4rem] px-2 py-2 sm:gap-3 sm:px-3"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".vrm"
        class="hidden"
        @change="handleFileUpload"
      />

      <button
        class="dock-btn"
        :class="!isReady ? 'is-disabled' : ''"
        :disabled="!isReady"
        title="Upload avatar"
        @click="openFilePicker"
      >
        <ArrowUpTrayIcon class="dock-icon h-5 w-5" />
        <span class="dock-tooltip">Upload</span>
      </button>

      <button
        class="dock-btn"
        :class="isSharingScreen ? 'is-active' : ''"
        title="Toggle screen share"
        @click="$emit('toggle-screen-share')"
      >
        <ComputerDesktopIcon class="dock-icon h-5 w-5" />
        <span class="dock-tooltip">Screen</span>
      </button>

      <button
        class="dock-call"
        :class="isConnected ? 'is-live' : 'is-idle'"
        :disabled="!isReady"
        :title="isConnected ? 'Disconnect' : 'Connect'"
        @click="$emit('toggle-connection')"
      >
        <PhoneXMarkIcon v-if="isConnected" class="dock-icon h-6 w-6" />
        <MicrophoneIcon v-else class="dock-icon h-6 w-6" />
      </button>

      <button
        class="dock-btn"
        :class="showChat ? 'is-active' : ''"
        title="Toggle chat"
        @click="$emit('toggle-chat')"
      >
        <ChatBubbleLeftRightIcon class="dock-icon h-5 w-5" />
        <span class="dock-tooltip">Chat</span>
      </button>

      <button
        class="dock-btn"
        :class="showSettings ? 'is-active' : ''"
        title="Settings"
        @click="$emit('toggle-settings')"
      >
        <Cog6ToothIcon class="dock-icon h-5 w-5" />
        <span class="dock-tooltip">Settings</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  ArrowUpTrayIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
} from '@heroicons/vue/24/solid'

defineProps({
  isReady: {
    type: Boolean,
    default: false,
  },
  isConnected: Boolean,
  isSharingScreen: Boolean,
  showChat: Boolean,
  showSettings: Boolean,
})

const emit = defineEmits([
  'toggle-connection',
  'toggle-screen-share',
  'toggle-chat',
  'toggle-settings',
  'file-upload',
])

const fileInputRef = ref(null)

const openFilePicker = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileUpload = (event) => {
  if (event.target.files && event.target.files[0]) {
    emit('file-upload', event.target.files[0])
  }
  event.target.value = ''
}
</script>
