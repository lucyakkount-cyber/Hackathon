// managers/utils.js - COMPLETE FINAL FIXED Audio Sync & Mouth Movement

export class Utils {
  static easeOut(t) {
    return t * (2 - t)
  }

  static easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  static lerp(start, end, t) {
    return start + (end - start) * t
  }

  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  static debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  static calculateRMS(audioData) {
    let sum = 0
    for (let i = 0; i < audioData.length; i++) {
      const sample = (audioData[i] - 128) / 128
      sum += sample * sample
    }
    return Math.sqrt(sum / audioData.length)
  }

  static analyzeFrequencyData(frequencyData, startRatio = 0, endRatio = 1) {
    const startIndex = Math.floor(frequencyData.length * startRatio)
    const endIndex = Math.floor(frequencyData.length * endRatio)
    let sum = 0
    for (let i = startIndex; i < endIndex; i++) {
      sum += frequencyData[i]
    }
    return sum / (endIndex - startIndex) / 255
  }

  static async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  static randomFloat(min, max) {
    return Math.random() * (max - min) + min
  }

  static randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)]
  }

  static getFeatureSupport() {
    return {
      webAudio: !!(window.AudioContext || window.webkitAudioContext),
      speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      webGL: !!window.WebGLRenderingContext,
      fileAPI: !!(window.File && window.FileReader && window.FileList && window.Blob),
      dragAndDrop: 'draggable' in document.createElement('div')
    }
  }

  static createErrorHandler(context) {
    return (error) => {
      console.error(`Error in ${context}:`, error)
      return {
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
      }
    }
  }

  static async safeExecute(fn, fallback = null, context = 'unknown') {
    try {
      return await fn()
    } catch (error) {
      const errorInfo = this.createErrorHandler(context)(error)
      console.warn('Safe execute fallback triggered:', errorInfo)
      return fallback
    }
  }

  static createAnimationState() {
    return {
      isPlaying: false,
      startTime: 0,
      duration: 0,
      progress: 0,
      onComplete: null
    }
  }
}

// ==================== PERFECT AUDIO-ANIMATION SYNC ====================
export async function processMessageOptimized(
  message,
  aiClient,
  audioManager,
  animationManager,
  vrm,
  config,
  audioElement
) {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 Processing message:', message)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // STEP 1: Get AI Response
    console.log('🤖 Step 1: Getting AI response...')
    const aiResponse = await aiClient.chatWithAI(message, config.getSystemPrompt())
    console.log('✅ AI response received:', aiResponse.substring(0, 60) + '...')

    // STEP 2: Parallel TTS + Animation Plan
    console.log('\n🔄 Step 2: Generating TTS and Animation Plan (PARALLEL)...')
    const parallelStart = performance.now()
    const [audioBlob, animationPlan] = await Promise.all([
      audioManager.generateTTS(aiResponse, config.config).catch(err => {
        console.error('❌ TTS failed:', err.message)
        return null
      }),
      aiClient.generateAnimationPlan(aiResponse).catch(err => {
        console.error('❌ Animation plan failed:', err.message)
        return []
      })
    ])
    const parallelDuration = ((performance.now() - parallelStart) / 1000).toFixed(2)
    console.log(`✅ Parallel processing complete in ${parallelDuration}s`)

    if (!audioBlob) {
      console.warn('⚠️ No audio generated')
      return aiResponse
    }

    // STEP 3: Get audio duration and prepare playback
    console.log('\n⏱️ Step 3: Preparing audio for playback...')
    await audioManager.resumeContext()

    const audioDuration = await new Promise((resolve) => {
      const tempAudio = new Audio()
      tempAudio.src = URL.createObjectURL(audioBlob)
      tempAudio.onloadedmetadata = () => {
        resolve(tempAudio.duration)
        URL.revokeObjectURL(tempAudio.src)
      }
      tempAudio.onerror = () => resolve(0)
      setTimeout(() => resolve(0), 3000)
    })
    console.log(`✅ Audio duration: ${audioDuration.toFixed(2)}s`)

    // STEP 4: Synchronize animation with audio
    if (animationPlan.length > 0 && audioDuration > 0) {
      console.log('\n🎬 Step 4: Synchronizing animations to audio...')
      const totalPlanDuration = animationPlan.reduce((sum, step) => sum + step.duration, 0)
      const audioMs = audioDuration * 1000

      if (totalPlanDuration > 0) {
        const scale = audioMs / totalPlanDuration
        animationPlan.forEach((step) => {
          step.duration = Math.round(step.duration * scale)
        })
        console.log('✅ Animations synchronized!')
      }
    }

    // STEP 5: Setup callbacks and prepare mouth sync
    console.log('\n🎤 Step 5: Setting up speech and mouth sync...')

    audioManager.setSpeechCallbacks(
      () => {
        console.log('▶️ Speech started - animations active')
        if (animationManager) {
          animationManager.startSpeakingAnimation()
        }
      },
      () => {
        console.log('⏹️ Speech ended')
        if (animationManager) {
          animationManager.stopSpeakingAnimation()
        }
      }
    )

    // STEP 6: Play audio with synchronized mouth movement
    console.log('\n🎭 Step 6: Starting synchronized playback...')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // 🔥 CRITICAL FIX: Detect mouth expressions BEFORE playback
    audioManager.detectMouthExpressions(vrm)
    console.log('✅ Mouth expressions detected:', audioManager.availableMouthExpressions.length)

    // 🔥 CRITICAL FIX: Pass VRM to playAudioBlob (setup happens inside!)
    const audioPromise = audioManager.playAudioBlob(audioBlob, audioElement, vrm)
    const animationPromise = animationManager && animationPlan.length > 0
      ? animationManager.playAnimationSequence(animationPlan)
      : Promise.resolve()

    // Wait for both to complete
    await Promise.all([audioPromise, animationPromise])

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Playback complete')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    return aiResponse

  } catch (error) {
    console.error('❌ Error processing message:', error)
    if (animationManager) {
      animationManager.stopSpeakingAnimation()
      animationManager.isPlayingSequence = false
    }
    throw error
  }
}

// ==================== ADVANCED SYNCHRONIZATION ====================
export function optimizeAnimationTiming(animationPlan, audioDuration, options = {}) {
  const {
    minStepDuration = 200,
    maxStepDuration = 3000,
    bufferTime = 100,
    distributeEvenly = true
  } = options

  if (!animationPlan || animationPlan.length === 0 || audioDuration <= 0) {
    return animationPlan
  }

  const audioMs = audioDuration * 1000 - bufferTime
  const totalOriginalDuration = animationPlan.reduce((sum, step) => sum + step.duration, 0)

  if (totalOriginalDuration === 0) {
    const evenDuration = Math.max(
      minStepDuration,
      Math.min(maxStepDuration, audioMs / animationPlan.length)
    )
    animationPlan.forEach(step => {
      step.duration = evenDuration
    })
    return animationPlan
  }

  if (distributeEvenly) {
    const scale = audioMs / totalOriginalDuration
    animationPlan.forEach(step => {
      step.duration = Math.max(
        minStepDuration,
        Math.min(maxStepDuration, Math.round(step.duration * scale))
      )
    })
  }

  return animationPlan
}

export function enhanceAnimationPlan(plan, options = {}) {
  const { addTransitions = true, intensityBoost = 1.0 } = options

  if (!plan || plan.length === 0) return plan

  const enhanced = plan.map((step, index) => {
    const enhancedStep = { ...step }

    if (enhancedStep.intensity) {
      enhancedStep.intensity = Math.min(enhancedStep.intensity * intensityBoost, 1.0)
    }

    if (enhancedStep.duration < 300) {
      enhancedStep.duration = 300
    }

    return enhancedStep
  })

  return enhanced
}

// ==================== PERFORMANCE MONITORING ====================
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      aiResponseTime: [],
      ttsGenerationTime: [],
      animationPlanTime: [],
      totalProcessingTime: [],
      audioPlaybackTime: [],
      animationPlaybackTime: []
    }
  }

  recordMetric(metricName, value) {
    if (this.metrics[metricName]) {
      this.metrics[metricName].push(value)
      if (this.metrics[metricName].length > 20) {
        this.metrics[metricName].shift()
      }
    }
  }

  getAverage(metricName) {
    const values = this.metrics[metricName]
    if (!values || values.length === 0) return 0
    const sum = values.reduce((a, b) => a + b, 0)
    return sum / values.length
  }

  getStats(metricName) {
    const values = this.metrics[metricName]
    if (!values || values.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 }
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: this.getAverage(metricName),
      count: values.length
    }
  }

  printReport() {
    console.log('\n📊 PERFORMANCE REPORT')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    Object.keys(this.metrics).forEach(metric => {
      const stats = this.getStats(metric)
      if (stats.count > 0) {
        console.log(`${metric}: Avg ${stats.avg.toFixed(2)}ms (${stats.count} samples)`)
      }
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  }

  reset() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = []
    })
  }
}

// ==================== TEXT PROCESSING ====================
export function splitTextIntoSegments(text, maxLength = 100) {
  if (!text || text.length <= maxLength) {
    return [text]
  }

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  const segments = []
  let currentSegment = ''

  sentences.forEach(sentence => {
    if ((currentSegment + sentence).length <= maxLength) {
      currentSegment += sentence
    } else {
      if (currentSegment) segments.push(currentSegment.trim())
      currentSegment = sentence
    }
  })

  if (currentSegment) segments.push(currentSegment.trim())
  return segments
}

export function estimateSpeechDuration(text, wordsPerMinute = 150) {
  const words = text.split(/\s+/).length
  return (words / wordsPerMinute) * 60
}

// ==================== DEBUG HELPERS ====================
export function logAnimationPlan(plan, title = 'Animation Plan') {
  console.log(`\n📋 ${title}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  plan.forEach((step, index) => {
    console.log(`Step ${index + 1}: "${step.text?.substring(0, 40)}..." | ${step.expression} | ${step.duration}ms`)
  })
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}
