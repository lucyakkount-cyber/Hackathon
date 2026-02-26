export class AudioManager {
  audioCtx = null
  analyser = null
  nextStartTime = 0
  mouthRaf = null
  activeSources = []
  onSpeechStart = null
  onSpeechEnd = null
  isPlaying = false
  isUserSpeaking = false
  currentVrm = null

  async initialize() {
    if (this.audioCtx) return
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.connect(this.audioCtx.destination)
    console.log(`🔊 Audio System Ready`)
  }

  async queueAudio(int16Data) {
    // This method replaces "playChunk" to match the AIClient implementation which sends int16
    // We assume the system calls queueAudio when data arrives
    // We need a reference to the VRM instance to drive lip sync.
    // In this simplified architecture, we'll try to find it on the window or pass it differently.
    // For now, let's assume `window.currentVrm` exists or we just play audio.
    const vrm = window.currentVrm
    if (vrm) this.currentVrm = vrm
    if (this.isUserSpeaking) return
    await this.playChunk(int16Data, vrm || this.currentVrm)
  }

  async playChunk(int16Data, vrm = null) {
    if (this.isUserSpeaking) return
    if (!this.audioCtx) await this.initialize()
    if (!this.audioCtx) return
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    if (vrm) this.currentVrm = vrm

    this.setPlaybackState(true)

    const float32Data = new Float32Array(int16Data.length)
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Data.length, 24000)
    audioBuffer.getChannelData(0).set(float32Data)

    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.analyser)

    const now = this.audioCtx.currentTime
    if (this.nextStartTime < now) this.nextStartTime = now + 0.05

    source.start(this.nextStartTime)
    this.nextStartTime += audioBuffer.duration

    this.activeSources.push(source)
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source)
    }

    if (this.currentVrm && !this.mouthRaf) this.startMouthSync(this.currentVrm)
  }

  startMouthSync(vrm) {
    const tick = () => {
      if (!this.audioCtx || !this.analyser) return

      if (this.isUserSpeaking) {
        this.stopMouthSync(vrm)
        this.setPlaybackState(false)
        return
      }

      if (this.audioCtx.currentTime > this.nextStartTime + 0.1) {
        this.stopMouthSync(vrm)
        this.setPlaybackState(false)
        return
      }

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.analyser.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128
        sum += val * val
      }
      const volume = Math.sqrt(sum / dataArray.length)
      const openAmount = Math.min(volume * 5.0, 1.0)

      vrm.expressionManager?.setValue('aa', openAmount)
      vrm.expressionManager?.update()

      this.mouthRaf = requestAnimationFrame(tick)
    }
    this.mouthRaf = requestAnimationFrame(tick)
  }

  setUserSpeakingState(isSpeaking) {
    const next = Boolean(isSpeaking)
    if (this.isUserSpeaking === next) return
    this.isUserSpeaking = next

    if (this.isUserSpeaking) {
      this.interruptPlayback()
    }
  }

  interruptPlayback() {
    for (const source of this.activeSources) {
      try {
        source.onended = null
        source.stop(0)
      } catch {}
    }
    this.activeSources = []

    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime
    } else {
      this.nextStartTime = 0
    }

    this.stopMouthSync(this.currentVrm || window.currentVrm || null)
    this.setPlaybackState(false)
  }

  stopMouthSync(vrm = null) {
    if (this.mouthRaf) {
      cancelAnimationFrame(this.mouthRaf)
      this.mouthRaf = null
    }

    const targetVrm = vrm || this.currentVrm || window.currentVrm || null
    targetVrm?.expressionManager?.setValue('aa', 0)
    targetVrm?.expressionManager?.update()
  }

  setPlaybackState(nextIsPlaying) {
    if (this.isPlaying === nextIsPlaying) return
    this.isPlaying = nextIsPlaying
    if (nextIsPlaying) {
      this.onSpeechStart?.()
    } else {
      this.onSpeechEnd?.()
    }
  }

  cleanup() {
    this.interruptPlayback()
    if (this.audioCtx) this.audioCtx.close()
    this.audioCtx = null
  }
}
