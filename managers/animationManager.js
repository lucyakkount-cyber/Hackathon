import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'

export class AnimationManager {
  constructor(vrm) {
    this.vrm = vrm
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.actions = {}
    this.activeAction = null
    this.loader = new GLTFLoader()
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

    this.currentState = 'idle'
    this.mainIdle = 'HappyIdle'

    // Face State
    this.currentExpression = 'neutral'
    this.targetExpression = 'neutral'
    this.expressionTimer = null

    // Blink State
    this.blinkTimer = 0
    this.nextBlinkTime = 3 // seconds
    this.isBlinking = false
    this.blinkDuration = 0.15 // seconds
    this.blinkProgress = 0

    // Micro-Expression State
    this.microTimer = 0
    this.microIntensity = 0

    // Emotion Map (Supports Strings or Weighted Objects)
    this.expressionMap = {
      happy: 'happy',
      joy: 'happy',
      excited: 'happy',
      smile: 'happy',
      sad: 'sad',
      crying: 'sad',
      sorrow: 'sad',

      // Composite Emotions
      embarrassed: { sad: 0.3, happy: 0.2 }, // Shy smile
      angry: 'angry',
      serious: { angry: 0.5 },
      disgust: { angry: 0.6, sad: 0.2 },
      frustrated: { angry: 0.7, sad: 0.3 },

      surprised: 'surprised',
      shock: { surprised: 1.0, angry: 0.2 },
      fear: { surprised: 0.5, sad: 0.5 },
      confused: { angry: 0.4, surprised: 0.2 }, // Furrowed brow + slight wide eye

      relaxed: 'relaxed',
      tired: { relaxed: 0.5, sad: 0.2 },
      fun: 'relaxed',
      smug: { happy: 0.3, relaxed: 0.3 },
      thinking: { angry: 0.3, relaxed: 0.2 },

      deadpan: 'neutral',
      neutral: 'neutral',
      bored: { neutral: 1.0, relaxed: 0.3 },
    }
  }

  getAvailableAnimations() {
    return Object.keys(this.actions)
  }

  async initialize() {
    console.log('🔄 AnimationManager: Loading clips...')
    this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e))

    // ⚡ FIX: Using '/animations/' (Root) and '.fbx' (Actual file type)
    const files = [
      { name: 'HappyIdle', path: 'dist/animations/HappyIdle.vrma', loop: true },
      // ✅ FIX 1: Map Talking to Idle so body breathes while mouth moves

      { name: 'wave', path: 'dist/animations/Waving.vrma', loop: false },
      // ✅ FIX 2: Macarena must LOOP
      { name: 'Macarena_dance', path: 'dist/animations/MacarenaDance.vrma', loop: false },
      { name: 'dance', path: 'dist/animations/HipHopDance.vrma', loop: false },

      { name: 'clap', path: 'dist/animations/Clapping.vrma', loop: false },
      { name: 'thumbs_up', path: 'dist/animations/ThumbsUp.vrma', loop: false },
      { name: 'shrug', path: 'dist/animations/Shrugging.vrma', loop: false },
      { name: 'pointing', path: 'dist/animations/Pointing.vrma', loop: false },
      { name: 'laugh', path: 'dist/animations/Laughing.vrma', loop: false },
      { name: 'salute', path: 'dist/animations/Salute.vrma', loop: false },
      { name: 'angry', path: 'dist/animations/Angry.vrma', loop: false },

      // Proxies
      { name: 'backflip', path: 'dist/animations/BackFlip.vrma', loop: false },
      { name: 'acknowledging', path: 'dist/animations/Acknowledging.vrma', loop: false },
      { name: 'blow_kiss', path: 'dist/animations/BlowKiss.vrma', loop: false },
      { name: 'bored', path: 'dist/animations/Bored.vrma', loop: false },
      { name: 'looking_around', path: 'dist/animations/LookingAround.vrma', loop: false },
    ]

    for (const file of files) {
      await this.loadClip(file.name, file.path, file.loop)
    }

    console.log('✅ AnimationManager Ready')
    this.play(this.mainIdle)
  }

  setExpression(name, duration = 0) {
    const rawName = name.toLowerCase()
    let resolved = 'neutral' // Can be string or object

    if (this.vrm.expressionManager.getExpressionTrackName(rawName)) {
      resolved = rawName // Direct match
    } else if (this.expressionMap[rawName]) {
      resolved = this.expressionMap[rawName] // Map match
    }

    console.log(`😊 Face: ${name} =>`, resolved, `(${duration}s)`)
    this.targetExpression = resolved

    if (this.expressionTimer) clearTimeout(this.expressionTimer)
    if (duration > 0) {
      this.expressionTimer = setTimeout(() => {
        this.targetExpression = 'neutral'
      }, duration * 1000)
    }
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta)
    if (this.vrm && this.vrm.expressionManager) {
      this.updateBlink(delta)
      this.updateExpressions(delta)
    }
  }

  updateBlink(delta) {
    this.blinkTimer += delta
    if (this.blinkTimer >= this.nextBlinkTime) {
      this.isBlinking = true
      this.blinkTimer = 0
      this.nextBlinkTime = 2 + Math.random() * 3 // Random blink interval 2-5s
    }

    if (this.isBlinking) {
      this.blinkProgress += delta
      if (this.blinkProgress >= this.blinkDuration) {
        this.isBlinking = false
        this.blinkProgress = 0
      }
    }
  }

  updateExpressions(delta) {
    const manager = this.vrm.expressionManager
    const speed = 5.0 * delta

    // 1. Calculate Blink Value (Sine wave for smoothness)
    let blinkValue = 0
    if (this.isBlinking) {
      const t = Math.PI * (this.blinkProgress / this.blinkDuration)
      blinkValue = Math.sin(t)
    }

    // 2. Micro-Expressions (Breathing/Subtle movement on mood)
    this.microTimer += delta
    this.microIntensity = Math.sin(this.microTimer * 2) * 0.05 // +/- 0.05 variation

    // 3. Define Key Groups
    const moodKeys = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']
    const mouthKeys = ['aa', 'ee', 'ih', 'oh', 'ou']

    // 4. Update Moods
    moodKeys.forEach((key) => {
      const currentVal = manager.getValue(key) || 0

      // Calculate Target for this specific blendshape key
      let baseTarget = 0.0

      if (typeof this.targetExpression === 'string') {
        // Simple Mode: Single Winner
        baseTarget = key === this.targetExpression ? 1.0 : 0.0
      } else if (typeof this.targetExpression === 'object') {
        // Composite Mode: Weighted Blend
        baseTarget = this.targetExpression[key] || 0.0
      }

      // Add Micro-Expressions only if this key is active (prevents phantom twitching on 0 values)
      if (baseTarget > 0.1) {
        baseTarget += this.microIntensity
      }

      // Clamp
      baseTarget = Math.max(0, Math.min(1, baseTarget))

      const newVal = THREE.MathUtils.lerp(currentVal, baseTarget, speed)
      manager.setValue(key, newVal < 0.01 ? 0 : newVal)
    })

    // 5. Update Eyes (Blink overrides mood-based eye shapes if needed, but usually additive is fine)
    // For standard VRM, 'blink' controls both.
    manager.setValue('blink', blinkValue)

    // 6. Update Mouth
    // If talking, we let external lip-sync control it (so we do NOTHING or blend to 0 if we want to enforce silence)
    // Current logic: If NOT talking, force mouth closed. If Talking, ignore (let SpeechManager/Audio handle it).
    if (this.currentState !== 'talking') {
      mouthKeys.forEach((key) => {
        const currentVal = manager.getValue(key) || 0
        const newVal = THREE.MathUtils.lerp(currentVal, 0, speed)
        manager.setValue(key, newVal < 0.01 ? 0 : newVal)
      })
    }

    manager.update()
  }

  triggerNamedAnimation(name) {
    if (this.actions[name]) this.play(name)
    else console.warn(`⚠️ Animation ${name} not found.`)
  }

  onAnimationFinished(e) {
    const clipName = e.action.getClip().name
    if (clipName !== 'HappyIdle' && clipName !== 'dance' && clipName !== 'Talking') {
      this.play(this.mainIdle)
    }
  }

  async loadClip(name, url, isLoop) {
    return new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          let clip = null
          // Handle VRMA vs FBX structure
          if (gltf.userData.vrmAnimations && gltf.userData.vrmAnimations.length > 0) {
            clip = createVRMAnimationClip(gltf.userData.vrmAnimations[0], this.vrm)
          } else if (gltf.animations && gltf.animations.length > 0) {
            clip = createVRMAnimationClip(gltf.animations[0], this.vrm)
          }

          if (clip) {
            clip.name = name
            const action = this.mixer.clipAction(clip)
            action.loop = isLoop ? THREE.LoopRepeat : THREE.LoopOnce
            action.clampWhenFinished = !isLoop
            this.actions[name] = action
            resolve(action)
          } else {
            console.warn(`⚠️ Empty animation: ${url}`)
            resolve(null)
          }
        },
        undefined,
        (err) => {
          console.warn(`❌ Load failed: ${url}`, err)
          resolve(null)
        },
      )
    })
  }

  play(name) {
    const action = this.actions[name]
    if (!action) return
    if (this.activeAction === action) return
    if (this.activeAction) this.activeAction.fadeOut(0.5)
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.5).play()
    this.activeAction = action
    if (name === 'Talking') this.currentState = 'talking'
    else if (name === this.mainIdle) this.currentState = 'idle'
  }

  setSpeakingState(isSpeaking) {
    if (this.activeAction && !this.activeAction.loop && this.activeAction.isRunning()) return
    if (isSpeaking && this.currentState !== 'talking') this.play('Talking')
    else if (!isSpeaking && this.currentState === 'talking') this.play(this.mainIdle)
  }

  cleanup() {
    if (this.mixer) this.mixer.stopAllAction()
    if (this.expressionTimer) clearTimeout(this.expressionTimer)
  }
}
