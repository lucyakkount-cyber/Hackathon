// managers/audioManager.js
export class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.nextStartTime = 0;
    this.mouthRaf = null;
    this.activeSources = [];

    // Callbacks for Animation Sync
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.isPlaying = false;
  }

  async initialize() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.audioCtx.destination);
    console.log(`🔊 Audio System Ready`);
  }

  setSpeechCallbacks(onStart, onEnd) {
    this.onSpeechStart = onStart;
    this.onSpeechEnd = onEnd;
  }

  async playChunk(int16Data, vrm = null) {
    if (!this.audioCtx) await this.initialize();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

    // ⚡ SIGNAL START: If we weren't playing, trigger the "Start" callback
    if (!this.isPlaying) {
        this.isPlaying = true;
        if (this.onSpeechStart) this.onSpeechStart();
    }

    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);

    const now = this.audioCtx.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now + 0.05;

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
       this.activeSources = this.activeSources.filter(s => s !== source);
    };

    if (vrm && !this.mouthRaf) this.startMouthSync(vrm);
  }

  startMouthSync(vrm) {
    const tick = () => {
      // ⚡ CHECK FOR SILENCE/END
      if (this.audioCtx.currentTime > this.nextStartTime + 0.1) { // 0.1s buffer

        // Stop Lip Sync
        vrm.expressionManager?.setValue('aa', 0);
        vrm.expressionManager?.update();
        this.mouthRaf = null;

        // ⚡ SIGNAL END: Trigger the "Stop" callback
        if (this.isPlaying) {
            this.isPlaying = false;
            if (this.onSpeechEnd) this.onSpeechEnd();
        }
        return;
      }

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const volume = Math.sqrt(sum / dataArray.length);
      const openAmount = Math.min(volume * 5.0, 1.0);

      vrm.expressionManager?.setValue('aa', openAmount);
      vrm.expressionManager?.update();

      this.mouthRaf = requestAnimationFrame(tick);
    };
    this.mouthRaf = requestAnimationFrame(tick);
  }

  cleanup() {
    if (this.audioCtx) this.audioCtx.close();
  }
}
