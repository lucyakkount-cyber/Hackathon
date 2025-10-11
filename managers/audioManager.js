// managers/audioManager.js - COMPLETE with Natural Cute Mouth Sync
import axios from 'axios'

export class AudioManager {
  constructor() {
    this.audioCtx = null
    this.analyser = null
    this.sourceNode = null
    this.mouthRaf = null
    this.isInitialized = false
    this.currentAudio = null
    this.onSpeechStart = null
    this.onSpeechEnd = null
    this.availableMouthExpressions = []
    this.audioSourceCreated = false
  }

  async initialize() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      this.isInitialized = true
      console.log('✅ AudioManager initialized')
    } catch (error) {
      console.error('❌ AudioManager init failed:', error)
    }
  }

  async resumeContext() {
    if (this.audioCtx && this.audioCtx.state !== 'running') {
      try {
        await this.audioCtx.resume()
        console.log('🔊 Audio context resumed')
      } catch (error) {
        console.error('Audio context resume failed:', error)
      }
    }
  }

  async generateTTS(text, config) {
    try {
      const ttsUrl = 'https://mall-bless-not-disturbed.trycloudflare.com/tts'
      const payload = {
        text,
        ref_audio_path: config.sovits_ping_config?.ref_audio_path,
        text_lang: config.sovits_ping_config?.text_lang || 'en',
        prompt_text: config.sovits_ping_config?.prompt_text || '',
        prompt_lang: config.sovits_ping_config?.prompt_lang || 'en',
        media_type: 'wav',
        streaming_mode: false,
      }

      console.log('🎙️ Generating TTS for:', text.substring(0, 50) + '...')

      const response = await axios.post(ttsUrl, payload, {
        responseType: 'arraybuffer',
        headers: { 'Content-Type': 'application/json' },
        timeout: 150000,
      })

      const blob = new Blob([response.data], { type: 'audio/wav' })
      console.log('✅ TTS generated:', blob.size, 'bytes')
      return blob
    } catch (error) {
      console.error('❌ TTS generation error:', error)
      return null
    }
  }

  async playAudioBlob(blob, audioElement, vrm = null) {
    if (!blob || !audioElement) return 0

    try {
      // Stop any current audio and mouth sync
      if (this.mouthRaf) {
        cancelAnimationFrame(this.mouthRaf)
        this.mouthRaf = null
      }

      if (this.currentAudio) {
        this.currentAudio.pause()
        this.currentAudio.src = ''
      }

      audioElement.pause()
      audioElement.src = ''
      audioElement.load()

      await this.resumeContext()

      const url = URL.createObjectURL(blob)
      audioElement.src = url
      this.currentAudio = audioElement

      // Wait for metadata
      await new Promise((resolve, reject) => {
        audioElement.onloadedmetadata = resolve
        audioElement.onerror = reject
        setTimeout(() => reject(new Error('Audio load timeout')), 15000)
      })

      // Setup audio graph AFTER audio is loaded
      if (vrm && this.availableMouthExpressions.length > 0) {
        console.log('🎵 Setting up audio graph for mouth sync...')
        this.setupUniversalMouthSync(audioElement, vrm)
      }

      // Notify speech start
      if (this.onSpeechStart) {
        this.onSpeechStart()
      }

      // Play audio
      await audioElement.play()
      console.log('▶️ Playing audio, duration:', audioElement.duration.toFixed(2), 's')
      console.log('🔍 DEBUG: vrm =', vrm ? '✓ exists' : '✗ missing')
      console.log('🔍 DEBUG: availableMouthExpressions =', this.availableMouthExpressions.length)

      // Start mouth sync AFTER audio is playing
      if (vrm && this.availableMouthExpressions.length > 0 && this.analyser) {
        console.log('👄 🚀 Starting mouth sync now that audio is playing...')
        this.startMouthSyncTick(audioElement, vrm)
      } else {
        console.warn('⚠️ NOT starting mouth sync:')
        console.warn('   - vrm:', vrm ? 'exists' : 'MISSING')
        console.warn('   - expressions:', this.availableMouthExpressions.length)
        console.warn('   - analyser:', this.analyser ? 'exists' : 'MISSING')
      }

      // Wait for audio to end
      await new Promise((resolve) => {
        audioElement.onended = resolve
      })

      // Notify speech end
      if (this.onSpeechEnd) {
        this.onSpeechEnd()
      }

      // Cleanup
      URL.revokeObjectURL(url)

      return audioElement.duration
    } catch (error) {
      console.error('❌ Audio play failed:', error)
      if (this.onSpeechEnd) {
        this.onSpeechEnd()
      }
      return 0
    }
  }

  // Detect available mouth expressions in VRM
  detectMouthExpressions(vrm) {
    if (!vrm?.expressionManager) {
      console.warn('⚠️ No expression manager found')
      return []
    }

    const possibleExpressions = ['aa', 'ee', 'ih', 'oh', 'ou', 'a', 'i', 'u', 'e', 'o']
    this.availableMouthExpressions = []

    possibleExpressions.forEach(expr => {
      try {
        const value = vrm.expressionManager.getValue(expr)
        if (value !== undefined && value !== null) {
          this.availableMouthExpressions.push(expr)
        }
      } catch (e) {
        // Expression not available
      }
    })

    console.log('👄 Detected mouth expressions:', this.availableMouthExpressions)

    if (this.availableMouthExpressions.length === 0) {
      console.warn('⚠️ No mouth expressions detected. Mouth sync may not work.')
    }

    return this.availableMouthExpressions
  }

  // Universal mouth sync that adapts to available expressions
  setupUniversalMouthSync(audioElement, vrm) {
    if (!vrm?.expressionManager || !this.audioCtx || !audioElement) {
      console.warn('⚠️ Cannot setup mouth sync: missing dependencies')
      return
    }

    if (this.availableMouthExpressions.length === 0) {
      console.warn('⚠️ No mouth expressions available for sync')
      return
    }

    if (this.mouthRaf) {
      cancelAnimationFrame(this.mouthRaf)
      this.mouthRaf = null
    }

    // Properly disconnect old connections
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect()
        this.sourceNode = null
      }
      if (this.analyser) {
        this.analyser.disconnect()
        this.analyser = null
      }
    } catch (e) {
      console.log('Old audio nodes cleaned up')
    }

    // Create NEW audio source from element (only once per element!)
    if (!this.audioSourceCreated) {
      try {
        this.sourceNode = this.audioCtx.createMediaElementSource(audioElement)
        this.audioSourceCreated = true
        console.log('✅ Audio source created from element')
      } catch (error) {
        console.error('❌ Failed to create audio source:', error.message)
        return
      }
    } else {
      console.log('ℹ️ Using existing audio source')
    }

    // Create new analyser
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.25

    // Connect audio graph (only if we have both nodes)
    try {
      if (this.sourceNode && this.analyser) {
        this.sourceNode.connect(this.analyser)
        this.analyser.connect(this.audioCtx.destination)
        console.log('✅ Audio graph connected for mouth sync')
      } else {
        console.error('❌ Missing audio nodes, cannot connect graph')
        return
      }
    } catch (error) {
      console.error('❌ Failed to connect audio graph:', error)
      return
    }

    console.log('✅ Mouth sync prepared (will start when audio plays)')
  }

  // Start the mouth sync tick loop (called AFTER audio starts playing)
  startMouthSyncTick(audioElement, vrm) {
    if (!this.analyser || !vrm?.expressionManager) {
      console.warn('⚠️ Cannot start mouth sync tick')
      return
    }

    const bufferLength = this.analyser.fftSize
    const dataArray = new Uint8Array(bufferLength)
    const frequencyData = new Uint8Array(this.analyser.frequencyBinCount)

    let prevEnergy = 0
    let frameCount = 0
    let isFirstFrame = true

    const tick = () => {
      // Skip the paused check on first frame
      if (!isFirstFrame && (audioElement.paused || audioElement.ended)) {
        this.resetMouth(vrm)
        this.mouthRaf = null
        console.log('👄 Mouth sync stopped (audio ended)')
        return
      }

      isFirstFrame = false
      frameCount++

      // Get audio data
      this.analyser.getByteTimeDomainData(dataArray)
      this.analyser.getByteFrequencyData(frequencyData)

      // Calculate RMS (volume/energy)
      let sumSquares = 0
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128
        sumSquares += val * val
      }
      const rms = Math.sqrt(sumSquares / bufferLength)

      // Analyze frequency bands
      const lowEnd = Math.floor(frequencyData.length * 0.3)
      const midEnd = Math.floor(frequencyData.length * 0.7)

      let lowFreqSum = 0
      for (let i = 0; i < lowEnd; i++) {
        lowFreqSum += frequencyData[i]
      }
      const lowFreq = lowFreqSum / lowEnd / 255

      let midFreqSum = 0
      for (let i = lowEnd; i < midEnd; i++) {
        midFreqSum += frequencyData[i]
      }
      const midFreq = midFreqSum / (midEnd - lowEnd) / 255

      let highFreqSum = 0
      for (let i = midEnd; i < frequencyData.length; i++) {
        highFreqSum += frequencyData[i]
      }
      const highFreq = highFreqSum / (frequencyData.length - midEnd) / 255

      // Smooth transitions with HIGHER smoothing for natural movement
      const smoothed = prevEnergy * 0.75 + rms * 0.25
      prevEnergy = smoothed

      // Calculate mouth openness - CUTE & NATURAL VALUES
      const mouthOpen = Math.min(Math.max(smoothed * 5.0 * (1 + lowFreq * 0.8), 0), 0.6) // Max 60% open
      const mouthWide = Math.min((midFreq + highFreq) * 1.5, 0.4) // Max 40% wide
      const mouthRound = Math.min(lowFreq * smoothed * 6.0, 0.5) // Max 50% round

      // Apply to available expressions with GENTLE blending
      if (this.availableMouthExpressions.includes('aa')) {
        const curAA = vrm.expressionManager.getValue('aa') || 0
        vrm.expressionManager.setValue('aa', curAA + (mouthOpen - curAA) * 0.4) // Gentler blend
      }

      if (this.availableMouthExpressions.includes('ee')) {
        const curEE = vrm.expressionManager.getValue('ee') || 0
        vrm.expressionManager.setValue('ee', curEE + (mouthWide - curEE) * 0.3) // Subtle
      } else if (this.availableMouthExpressions.includes('i')) {
        const curI = vrm.expressionManager.getValue('i') || 0
        vrm.expressionManager.setValue('i', curI + (mouthWide - curI) * 0.3)
      }

      if (this.availableMouthExpressions.includes('oh')) {
        const curOH = vrm.expressionManager.getValue('oh') || 0
        vrm.expressionManager.setValue('oh', curOH + (mouthRound - curOH) * 0.35) // Gentle round
      } else if (this.availableMouthExpressions.includes('o')) {
        const curO = vrm.expressionManager.getValue('o') || 0
        vrm.expressionManager.setValue('o', curO + (mouthRound - curO) * 0.35)
      }

      vrm.expressionManager.update()

      // Debug logging every 30 frames (~0.5 second) with VISUAL indicator
      if (frameCount % 30 === 0) {
        const visualOpen = '█'.repeat(Math.floor(mouthOpen * 20))
        const visualWide = '▓'.repeat(Math.floor(mouthWide * 20))
        console.log('👄 MOUTH MOVING:')
        console.log(`   Open [${visualOpen}] ${(mouthOpen * 100).toFixed(0)}%`)
        console.log(`   Wide [${visualWide}] ${(mouthWide * 100).toFixed(0)}%`)
        console.log(`   Energy: ${(smoothed * 100).toFixed(1)}% | RMS: ${(rms * 100).toFixed(1)}%`)
      }

      this.mouthRaf = requestAnimationFrame(tick)
    }

    console.log('👄 Mouth sync TICK STARTED')
    tick()
  }

  resetMouth(vrm) {
    if (!vrm?.expressionManager) return

    console.log('👄 Resetting mouth')

    const resetAnim = () => {
      let hasValues = false
      const expressions = ['aa', 'ee', 'oh', 'ih', 'ou', 'a', 'i', 'u', 'e', 'o']

      expressions.forEach(expr => {
        try {
          const val = vrm.expressionManager.getValue(expr)
          if (val > 0.01) {
            hasValues = true
            vrm.expressionManager.setValue(expr, Math.max(val * 0.8, 0))
          }
        } catch (e) {
          // Expression not available
        }
      })

      vrm.expressionManager.update()

      if (hasValues) {
        requestAnimationFrame(resetAnim)
      } else {
        // Ensure complete reset
        expressions.forEach(expr => {
          try {
            vrm.expressionManager.setValue(expr, 0)
          } catch (e) {
            // Ignore
          }
        })
        vrm.expressionManager.update()
      }
    }
    resetAnim()
  }

  // Set callbacks for speech events
  setSpeechCallbacks(onStart, onEnd) {
    this.onSpeechStart = onStart
    this.onSpeechEnd = onEnd
  }

  cleanup() {
    console.log('🧹 Cleaning up AudioManager...')

    if (this.mouthRaf) {
      cancelAnimationFrame(this.mouthRaf)
      this.mouthRaf = null
    }

    try {
      this.sourceNode?.disconnect()
      this.analyser?.disconnect()
    } catch {
      // Ignore
    }

    this.sourceNode = null
    this.analyser = null
    this.audioSourceCreated = false

    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio = null
    }

    if (this.audioCtx) {
      this.audioCtx.close()
      this.audioCtx = null
    }

    this.onSpeechStart = null
    this.onSpeechEnd = null
    this.availableMouthExpressions = []

    console.log('✅ AudioManager cleanup complete')
  }
}
