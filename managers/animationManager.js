// managers/animationManager.js - COMPLETE FIXED VERSION

import * as THREE from 'three'

export class AnimationManager {
  constructor(vrm) {
    this.vrm = vrm
    this.currentMixer = null
    this.idleAnimation = null
    this.idleAction = null

    // Intervals
    this.blinkInterval = null
    this.breatheInterval = null
    this.subtleMovementInterval = null
    this.eyeMovementInterval = null
    this.speakingMotionInterval = null

    // States
    this.isPlayingSequence = false
    this.isSpeaking = false
    this.currentTransition = null

    // Expression mappings - auto-detect based on VRM
    this.detectedExpressions = {}

    this.EXPRESSIONS = {
      neutral: ['neutral'],
      happy: ['happy', 'joy'],
      sad: ['sad', 'sorrow'],
      angry: ['angry', 'fury'],
      surprised: ['surprised', 'shocked'],
      excited: ['excited', 'happy', 'joy'],
      confused: ['confused', 'sad'],
      smirk: ['smirk', 'happy'],
      laugh: ['happy', 'joy'],
      embarrassed: ['blink', 'happy'],
      determined: ['angry'],
      worried: ['sad', 'blink'],
      curious: ['surprised'],
      sleepy: ['relaxed', 'blink'],
      mischievous: ['smirk', 'wink'],
      thinking: ['neutral'],
      shy: ['blink', 'happy']
    }

    // Auto-detect available expressions on init
    this.detectAvailableExpressions()
  }

  // Detect which expressions actually exist on this VRM
  detectAvailableExpressions() {
    if (!this.vrm?.expressionManager) return

    const allExpressions = this.vrm.expressionManager.expressions.map(exp => exp.name)
    console.log('Available VRM expressions:', allExpressions.join(', '))

    // Build a map of what expressions we can use
    this.detectedExpressions = {}

    Object.entries(this.EXPRESSIONS).forEach(([key, fallbacks]) => {
      for (const fallback of fallbacks) {
        const found = allExpressions.find(exp =>
          exp.toLowerCase() === fallback.toLowerCase()
        )
        if (found) {
          this.detectedExpressions[key] = found
          break
        }
      }
    })

    console.log('Detected usable expressions:', this.detectedExpressions)
  }

  // Get the actual expression name to use for this VRM
  getExpressionName(expressionKey) {
    return this.detectedExpressions[expressionKey] || expressionKey
  }

  updateVRM(newVrm) {
    this.cleanup()
    this.vrm = newVrm
    this.detectAvailableExpressions()
    this.startNaturalIdle()

    if (this.idleAnimation) {
      this.startIdleAnimation()
    }
  }

  setIdleAnimation(animation) {
    this.idleAnimation = animation
    console.log('✅ Idle animation set')
  }

  // ==================== IDLE ANIMATION CONTROL ====================

  startIdleAnimation() {
    if (!this.idleAnimation || !this.vrm) {
      console.log('⚠️ No idle animation, using natural idle only')
      this.startNaturalIdle()
      return
    }

    this.stopIdleAnimation()

    if (!this.currentMixer) {
      this.currentMixer = new THREE.AnimationMixer(this.vrm.scene)
    }

    this.idleAction = this.currentMixer.clipAction(this.idleAnimation)
    this.idleAction.setLoop(THREE.LoopRepeat)
    this.idleAction.setEffectiveWeight(0.15)
    this.idleAction.timeScale = 0.7
    this.idleAction.play()

    console.log('✅ Idle animation started')

    // Only blinking and breathing during idle
    this.startEnhancedBlinking()
    this.startSubtleBreathing()
  }

  stopIdleAnimation() {
    if (this.idleAction) {
      this.idleAction.fadeOut(0.3)
      setTimeout(() => {
        if (this.idleAction) {
          this.idleAction.stop()
        }
      }, 300)
      this.idleAction = null
      console.log('⏸️ Idle animation stopped')
    }
  }

  pauseIdleForSpeaking() {
    if (this.idleAction) {
      this.idleAction.stop()
      console.log('🗣️ Idle paused for speaking')
    }
    this.stopAllNaturalAnimations()
  }

  resumeIdleAfterSpeaking() {
    if (this.idleAction && this.idleAnimation) {
      this.idleAction.reset()
      this.idleAction.play()
      console.log('▶️ Idle resumed after speaking')
    }
    this.startNaturalIdle()
  }

  // ==================== NATURAL ANIMATIONS ====================

  startNaturalIdle() {
    if (!this.vrm) return

    this.startEnhancedBlinking()
    this.startSubtleBreathing()

    if (!this.isSpeaking && !this.idleAnimation) {
      this.startMinimalHeadMovements()
    }

    console.log('✨ Natural idle started')
  }

  stopAllNaturalAnimations() {
    if (this.subtleMovementInterval) {
      clearInterval(this.subtleMovementInterval)
      this.subtleMovementInterval = null
    }

    if (this.eyeMovementInterval) {
      clearInterval(this.eyeMovementInterval)
      this.eyeMovementInterval = null
    }

    console.log('🛑 Natural animations stopped')
  }

  startEnhancedBlinking() {
    if (!this.vrm?.expressionManager) return
    if (this.blinkInterval) clearTimeout(this.blinkInterval)

    const blinkExpression = this.getExpressionName('neutral')

    const doBlink = () => {
      if (!this.vrm?.expressionManager) {
        this.blinkInterval = setTimeout(doBlink, 3000)
        return
      }

      const intensity = 0.9 + Math.random() * 0.1
      const blinkDuration = 60 + Math.random() * 40
      const isDoubleBlink = Math.random() < 0.15

      // Try blink expression first, fallback to neutral
      let blinkExpr = 'blink'
      if (!this.detectedExpressions[blinkExpr] && this.vrm.expressionManager.expressions.find(e => e.name === 'blink') === undefined) {
        blinkExpr = blinkExpression
      }

      if (this.vrm.expressionManager.expressions.find(e => e.name === blinkExpr)) {
        this.vrm.expressionManager.setValue(blinkExpr, intensity)
        this.vrm.expressionManager.update()

        setTimeout(() => {
          if (this.vrm?.expressionManager) {
            this.vrm.expressionManager.setValue(blinkExpr, 0)
            this.vrm.expressionManager.update()

            if (isDoubleBlink) {
              setTimeout(() => {
                if (this.vrm?.expressionManager) {
                  this.vrm.expressionManager.setValue(blinkExpr, intensity * 0.85)
                  this.vrm.expressionManager.update()
                  setTimeout(() => {
                    if (this.vrm?.expressionManager) {
                      this.vrm.expressionManager.setValue(blinkExpr, 0)
                      this.vrm.expressionManager.update()
                    }
                  }, blinkDuration * 0.6)
                }
              }, 120)
            }
          }

          const nextBlink = 2000 + Math.random() * 3000
          this.blinkInterval = setTimeout(doBlink, nextBlink)
        }, blinkDuration)
      }
    }

    doBlink()
  }

  startSubtleBreathing() {
    if (!this.vrm) return
    if (this.breatheInterval) clearInterval(this.breatheInterval)

    const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest')
    const upperChest = this.vrm.humanoid?.getNormalizedBoneNode('upperChest')

    if (!chest) return

    let breathPhase = 0

    this.breatheInterval = setInterval(() => {
      breathPhase += 0.008
      const breathIntensity = Math.sin(breathPhase) * 0.008

      if (chest) {
        chest.rotation.x = breathIntensity
      }
      if (upperChest) {
        upperChest.rotation.x = breathIntensity * 0.5
      }
    }, 50)
  }

  startMinimalHeadMovements() {
    if (!this.vrm) return
    if (this.subtleMovementInterval) clearInterval(this.subtleMovementInterval)

    const head = this.vrm.humanoid?.getNormalizedBoneNode('head')
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck')

    if (!head) return

    const baseHead = head.rotation.clone()
    const baseNeck = neck?.rotation.clone()

    let phase = 0

    this.subtleMovementInterval = setInterval(() => {
      if (this.isPlayingSequence || this.isSpeaking) return

      phase += 0.004

      const headSway = Math.sin(phase * 0.4) * 0.012
      const headTilt = Math.cos(phase * 0.3) * 0.01
      const headNod = Math.sin(phase * 0.2) * 0.008

      if (head) {
        head.rotation.y = baseHead.y + headSway
        head.rotation.z = baseHead.z + headTilt
        head.rotation.x = baseHead.x + headNod
      }

      if (neck && baseNeck) {
        neck.rotation.x = baseNeck.x + Math.sin(phase * 0.15) * 0.006
      }
    }, 50)
  }

  // ==================== SPEAKING ANIMATIONS ====================

  startSpeakingAnimation() {
    this.isSpeaking = true
    this.pauseIdleForSpeaking()
    console.log('🗣️ Speaking started')

    // Get relevant bones
    const leftUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('leftUpperArm')
    const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode('rightUpperArm')
    const leftLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('leftLowerArm')
    const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode('rightLowerArm')
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('upperChest') || this.vrm.humanoid?.getNormalizedBoneNode('chest')

    if (!leftUpperArm || !rightUpperArm) {
      console.warn('⚠️ Arm bones not found in VRM!')
      return
    }

    let t = 0
    const armAmp = 0.25    // amplitude
    const armSpeed = 3.0   // speed
    const chestAmp = 0.1

    const animateLimbMovement = () => {
      if (!this.isSpeaking) return // stop when speech ends

      t += 0.05

      // Gentle waving
      const wave = Math.sin(t * armSpeed) * armAmp
      const counter = Math.sin(t * armSpeed + Math.PI) * armAmp * 0.8

      leftUpperArm.rotation.z = wave
      rightUpperArm.rotation.z = -wave

      if (leftLowerArm) leftLowerArm.rotation.z = wave * 0.5
      if (rightLowerArm) rightLowerArm.rotation.z = -wave * 0.5

      if (chest) chest.rotation.y = Math.sin(t * armSpeed * 0.5) * chestAmp

      requestAnimationFrame(animateLimbMovement)
    }

    animateLimbMovement()
  }

  stopSpeakingAnimation() {
    this.isSpeaking = false

    if (this.speakingMotionInterval) {
      clearInterval(this.speakingMotionInterval)
      this.speakingMotionInterval = null
    }

    this.resumeIdleAfterSpeaking()
    console.log('🔇 Speaking stopped')
  }

  // ==================== EXPRESSION SYSTEM ====================

  async setExpression(expression, intensity = 0.7, duration = 400) {
    if (!this.vrm?.expressionManager) return

    // Get the actual expression name for this VRM
    const mappedExpression = this.getExpressionName(expression)
    const expressions = this.EXPRESSIONS[expression] || [expression]

    if (this.currentTransition) {
      cancelAnimationFrame(this.currentTransition)
    }

    const startValues = {}
    const targetValues = {}

    expressions.forEach(expr => {
      const mappedExpr = this.getExpressionName(expr)
      if (this.vrm.expressionManager.expressions.find(e => e.name === mappedExpr)) {
        startValues[mappedExpr] = this.vrm.expressionManager.getValue(mappedExpr) || 0
        targetValues[mappedExpr] = Math.min(intensity, 1.0)
      }
    })

    if (Object.keys(startValues).length === 0) {
      return // No valid expressions found
    }

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (now) => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / duration, 1)
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        Object.keys(startValues).forEach(expr => {
          const value = startValues[expr] + (targetValues[expr] - startValues[expr]) * eased
          this.vrm.expressionManager.setValue(expr, value)
        })

        this.vrm.expressionManager.update()

        if (t < 1) {
          this.currentTransition = requestAnimationFrame(animate)
        } else {
          this.currentTransition = null
          resolve()
        }
      }

      this.currentTransition = requestAnimationFrame(animate)
    })
  }

  async resetExpression(expression, duration = 350) {
    await this.setExpression(expression, 0, duration)
  }

  // ==================== HEAD MOTION SYSTEM ====================

  async animateHeadMotion(type, duration = 700) {
    if (!this.vrm) return

    const head = this.vrm.humanoid?.getNormalizedBoneNode('head')
    const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck')
    if (!head) return

    const startRotHead = head.rotation.clone()
    const startRotNeck = neck?.rotation.clone()
    const targetRot = new THREE.Euler()
    const neckTarget = new THREE.Euler()

    let curve = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    switch (type) {
      case 'nod':
        targetRot.set(0.4, 0, 0)
        neckTarget.set(0.18, 0, 0)
        break
      case 'shake':
        targetRot.set(0, 0.45, 0)
        curve = (t) => Math.sin(t * Math.PI * 2.5) * (1 - t)
        break
      case 'tiltLeft':
        targetRot.set(0, 0.12, 0.35)
        break
      case 'tiltRight':
        targetRot.set(0, -0.12, -0.35)
        break
      case 'lookUp':
        targetRot.set(-0.3, 0, 0)
        neckTarget.set(-0.12, 0, 0)
        break
      case 'lookDown':
        targetRot.set(0.3, 0, 0)
        neckTarget.set(0.12, 0, 0)
        break
      case 'doubleNod':
        targetRot.set(0.4, 0, 0)
        neckTarget.set(0.18, 0, 0)
        curve = (t) => Math.sin(t * Math.PI * 4) * (1 - t * 0.3)
        duration *= 1.3
        break
      case 'confused':
        targetRot.set(0.12, 0.25, 0.25)
        curve = (t) => Math.sin(t * Math.PI * 3)
        break
      default:
        return
    }

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (now) => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / duration, 1)
        const eased = curve(t)

        head.rotation.x = startRotHead.x + targetRot.x * eased
        head.rotation.y = startRotHead.y + targetRot.y * eased
        head.rotation.z = startRotHead.z + targetRot.z * eased

        if (neck && neckTarget.x !== 0) {
          neck.rotation.x = startRotNeck.x + neckTarget.x * eased
        }

        if (t < 1) {
          requestAnimationFrame(animate)
        } else {
          const returnDuration = 400
          const returnStart = performance.now()

          const returnAnimate = (now) => {
            const elapsed = now - returnStart
            const rt = Math.min(elapsed / returnDuration, 1)
            const eased = rt < 0.5 ? 2 * rt * rt : 1 - Math.pow(-2 * rt + 2, 2) / 2

            head.rotation.x += (startRotHead.x - head.rotation.x) * eased
            head.rotation.y += (startRotHead.y - head.rotation.y) * eased
            head.rotation.z += (startRotHead.z - head.rotation.z) * eased

            if (neck && startRotNeck) {
              neck.rotation.x += (startRotNeck.x - neck.rotation.x) * eased
            }

            if (rt < 1) {
              requestAnimationFrame(returnAnimate)
            } else {
              resolve()
            }
          }
          requestAnimationFrame(returnAnimate)
        }
      }
      requestAnimationFrame(animate)
    })
  }

  // ==================== ANIMATION SEQUENCE PLAYER ====================

  async playAnimationSequence(plan) {
    if (!this.vrm?.expressionManager || !plan || plan.length === 0) return

    this.isPlayingSequence = true
    console.log('🎬 Playing animation sequence:', plan.length, 'steps')

    this.startSpeakingAnimation()

    try {
      for (let i = 0; i < plan.length; i++) {
        const step = plan[i]
        const intensity = Math.min((step.intensity || 0.7) * 1.5, 1.0)

        const animations = []

        // Set expression with detected names
        if (step.expression && step.expression !== 'neutral') {
          animations.push(this.setExpression(step.expression, intensity, 400))
        }

        // Head motion
        if (step.headMotion && step.headMotion !== 'none') {
          animations.push(
            this.animateHeadMotion(
              step.headMotion,
              Math.min(step.duration * 0.7, 1000)
            )
          )
        }

        await Promise.all(animations)
        await new Promise(r => setTimeout(r, Math.max(step.duration * 0.5, 300)))

        // Reset expression
        if (step.expression && step.expression !== 'neutral') {
          await this.resetExpression(step.expression, 300)
        }

        if (i < plan.length - 1) {
          await new Promise(r => setTimeout(r, 100))
        }
      }

      console.log('✅ Animation sequence complete')
    } catch (error) {
      console.error('❌ Animation sequence error:', error)
    } finally {
      this.stopSpeakingAnimation()
      this.isPlayingSequence = false
    }
  }

  // ==================== UPDATE & CLEANUP ====================

  update(delta) {
    if (this.currentMixer) {
      this.currentMixer.update(delta)
    }
  }

  cleanup() {
    console.log('🧹 Cleaning up AnimationManager...')

    if (this.blinkInterval) {
      clearTimeout(this.blinkInterval)
      this.blinkInterval = null
    }

    if (this.breatheInterval) {
      clearInterval(this.breatheInterval)
      this.breatheInterval = null
    }

    if (this.subtleMovementInterval) {
      clearInterval(this.subtleMovementInterval)
      this.subtleMovementInterval = null
    }

    if (this.eyeMovementInterval) {
      clearInterval(this.eyeMovementInterval)
      this.eyeMovementInterval = null
    }

    if (this.speakingMotionInterval) {
      clearInterval(this.speakingMotionInterval)
      this.speakingMotionInterval = null
    }

    if (this.currentTransition) {
      cancelAnimationFrame(this.currentTransition)
      this.currentTransition = null
    }

    if (this.currentMixer) {
      this.currentMixer.stopAllAction()
      this.currentMixer = null
    }

    this.idleAction = null
    this.isPlayingSequence = false
    this.isSpeaking = false
    this.detectedExpressions = {}

    console.log('✅ AnimationManager cleanup complete')
  }
}
