import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { cacheManager } from './cacheManager'

export class AnimationManager {
  vrm
  mixer
  actions = {}
  activeAction = null
  loader
  camera = null
  currentState = 'idle'
  mainIdle = 'HappyIdle'
  currentExpression = 'neutral'
  targetExpression = 'neutral'
  targetExpressionWeights = { neutral: 1 }
  expressionTimer = null
  coreMoodKeys = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']
  mouthKeys = ['aa', 'ee', 'ih', 'oh', 'ou']
  activeExpressionKeys = new Set(this.coreMoodKeys)
  supportedExpressionTrackCache = new Map()
  backgroundLoadPromise = null

  // Blink State
  blinkTimer = 0
  nextBlinkTime = 3
  isBlinking = false
  blinkDuration = 0.15
  blinkProgress = 0

  // Micro-Expression State
  microTimer = 0
  microIntensity = 0

  // Speaking State
  isSpeaking = false
  expressionStyle = {
    transitionSpeed: 5.0,
    microAmplitude: 0.02,
    microFrequency: 2.0,
    squint: 0.0,
    blinkMinInterval: 2.0,
    blinkMaxInterval: 5.0,
    blinkDuration: 0.15,
    mouthBias: { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 },
    mouthInfluenceWhileSpeaking: 0.28,
  }

  expressionMap

  constructor(vrm, camera = null) {
    this.vrm = vrm
    this.camera = camera
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.loader = new GLTFLoader()
    this.loader.setCrossOrigin('anonymous')
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

    this.expressionMap = {
      // ========== CORE BASE EMOTIONS (Pure) ==========
      neutral: 'neutral',
      happy: 'happy',
      sad: 'sad',
      angry: 'angry',
      surprised: 'surprised',
      relaxed: 'relaxed',

      // ========== HAPPINESS SPECTRUM (20 variations) ==========
      joy: { happy: 1.0 },
      ecstatic: { happy: 1.0, surprised: 0.3 },
      euphoric: { happy: 1.0, relaxed: 0.4 },
      delighted: { happy: 0.9, surprised: 0.2 },
      cheerful: { happy: 0.7, relaxed: 0.2 },
      content: { happy: 0.5, relaxed: 0.5 },
      satisfied: { happy: 0.4, relaxed: 0.6 },
      amused: { happy: 0.6, surprised: 0.2 },
      giggly: { happy: 0.8, surprised: 0.3 },
      grinning: { happy: 0.9 },
      beaming: { happy: 1.0, surprised: 0.1 },
      radiant: { happy: 0.95, relaxed: 0.3 },
      blissful: { happy: 0.8, relaxed: 0.7 },
      gleeful: { happy: 0.95, surprised: 0.2 },
      jubilant: { happy: 1.0, surprised: 0.4 },
      thrilled: { happy: 0.9, surprised: 0.5 },
      elated: { happy: 0.95, surprised: 0.3 },
      overjoyed: { happy: 1.0, surprised: 0.5 },
      excited: { happy: 0.8, surprised: 0.6 },
      hyper: { happy: 0.7, surprised: 0.8 },

      // ========== SADNESS SPECTRUM (20 variations) ==========
      sorrow: { sad: 1.0 },
      grief: { sad: 1.0, angry: 0.2 },
      heartbroken: { sad: 1.0, surprised: 0.3 },
      devastated: { sad: 1.0, angry: 0.3 },
      crushed: { sad: 0.95, surprised: 0.2 },
      despairing: { sad: 1.0, relaxed: 0.4 },
      hopeless: { sad: 0.9, relaxed: 0.5 },
      melancholy: { sad: 0.7, relaxed: 0.4 },
      gloomy: { sad: 0.6, neutral: 0.3 },
      downcast: { sad: 0.5, neutral: 0.4 },
      dejected: { sad: 0.7, neutral: 0.2 },
      crestfallen: { sad: 0.8, surprised: 0.1 },
      disappointed: { sad: 0.6, angry: 0.2 },
      let_down: { sad: 0.5, angry: 0.3 },
      blue: { sad: 0.6, relaxed: 0.3 },
      down: { sad: 0.5, neutral: 0.3 },
      crying: { sad: 1.0 },
      weeping: { sad: 1.0, surprised: 0.2 },
      sobbing: { sad: 1.0, angry: 0.1 },
      teary: { sad: 0.7, surprised: 0.1 },

      // ========== ANGER SPECTRUM (20 variations - VERY DISTINCT) ==========
      furious: { angry: 1.0, surprised: 0.3 },
      enraged: { angry: 1.0, sad: 0.1 },
      livid: { angry: 1.0 },
      seething: { angry: 0.95, neutral: 0.2 },
      fuming: { angry: 0.9, surprised: 0.2 },
      irate: { angry: 0.85 },
      wrathful: { angry: 1.0, sad: 0.2 },
      hostile: { angry: 0.8, neutral: 0.3 },
      aggressive: { angry: 0.9, surprised: 0.4 },
      irritated: { angry: 0.6, neutral: 0.2 },
      agitated: { angry: 0.7, surprised: 0.3 },
      annoyed: { angry: 0.5, neutral: 0.3 },
      peeved: { angry: 0.4, neutral: 0.4 },
      vexed: { angry: 0.6, surprised: 0.1 },
      miffed: { angry: 0.45, neutral: 0.3 },
      cross: { angry: 0.5, sad: 0.1 },
      grumpy: { angry: 0.4, sad: 0.2 },
      cranky: { angry: 0.5, relaxed: 0.1 },
      bitter: { angry: 0.6, sad: 0.4 },
      resentful: { angry: 0.7, sad: 0.3 },

      // ========== DISGUST SPECTRUM (15 variations - UNIQUE FROM ANGER) ==========
      disgusted: { angry: 0.3, sad: 0.6, surprised: 0.2 }, // Very different from pure angry
      revolted: { angry: 0.2, sad: 0.7, surprised: 0.4 },
      repulsed: { angry: 0.25, sad: 0.65, surprised: 0.3 },
      nauseated: { sad: 0.7, surprised: 0.2, relaxed: 0.3 },
      sickened: { sad: 0.8, angry: 0.1, surprised: 0.2 },
      appalled: { surprised: 0.6, angry: 0.3, sad: 0.3 },
      horrified: { surprised: 0.8, sad: 0.5, angry: 0.1 },
      repelled: { angry: 0.2, sad: 0.5, surprised: 0.5 },
      aversion: { angry: 0.3, sad: 0.5, neutral: 0.3 },
      distaste: { angry: 0.2, sad: 0.4, neutral: 0.5 },
      contempt: { angry: 0.5, sad: 0.2, neutral: 0.4 }, // More angry than disgust
      disdain: { angry: 0.4, neutral: 0.6, sad: 0.1 },
      scorn: { angry: 0.6, neutral: 0.4, happy: 0.1 },
      loathing: { angry: 0.4, sad: 0.7 },
      abhorrence: { angry: 0.3, sad: 0.8, surprised: 0.2 },

      // ========== FEAR/ANXIETY SPECTRUM (18 variations) ==========
      terrified: { surprised: 1.0, sad: 0.6 },
      petrified: { surprised: 1.0, sad: 0.5, neutral: 0.3 },
      frightened: { surprised: 0.9, sad: 0.4 },
      scared: { surprised: 0.8, sad: 0.3 },
      afraid: { surprised: 0.7, sad: 0.4 },
      fearful: { surprised: 0.7, sad: 0.5 },
      panicked: { surprised: 1.0, angry: 0.3 },
      alarmed: { surprised: 0.9, angry: 0.2 },
      startled: { surprised: 1.0 },
      shocked: { surprised: 1.0, neutral: 0.2 },
      stunned: { surprised: 0.9, neutral: 0.5 },
      anxious: { surprised: 0.4, sad: 0.5, angry: 0.2 },
      nervous: { surprised: 0.3, sad: 0.3, neutral: 0.2 },
      worried: { sad: 0.5, surprised: 0.3, angry: 0.2 },
      uneasy: { surprised: 0.3, neutral: 0.4, sad: 0.2 },
      apprehensive: { surprised: 0.4, sad: 0.4, neutral: 0.2 },
      tense: { angry: 0.3, surprised: 0.4, neutral: 0.3 },
      jittery: { surprised: 0.5, happy: 0.2, neutral: 0.2 },

      // ========== SURPRISE SPECTRUM (12 variations) ==========
      astonished: { surprised: 1.0, happy: 0.2 },
      astounded: { surprised: 1.0, happy: 0.3 },
      amazed: { surprised: 0.9, happy: 0.4 },
      awestruck: { surprised: 0.8, happy: 0.5, neutral: 0.2 },
      flabbergasted: { surprised: 1.0, angry: 0.2 },
      dumbfounded: { surprised: 0.9, neutral: 0.4 },
      bewildered: { surprised: 0.7, sad: 0.3, neutral: 0.2 },
      baffled: { surprised: 0.6, angry: 0.3, neutral: 0.3 },
      perplexed: { surprised: 0.5, angry: 0.4, neutral: 0.3 },
      puzzled: { surprised: 0.4, angry: 0.3, neutral: 0.4 },
      curious: { surprised: 0.5, happy: 0.3, neutral: 0.2 },
      intrigued: { surprised: 0.4, happy: 0.4, relaxed: 0.2 },

      // ========== CONFIDENCE/PRIDE SPECTRUM (15 variations) ==========
      confident: { happy: 0.4, relaxed: 0.6, neutral: 0.3 },
      self_assured: { happy: 0.3, relaxed: 0.7, neutral: 0.2 },
      proud: { happy: 0.6, relaxed: 0.4, neutral: 0.3 },
      triumphant: { happy: 0.8, surprised: 0.3, relaxed: 0.2 },
      victorious: { happy: 0.9, surprised: 0.4 },
      accomplished: { happy: 0.7, relaxed: 0.5 },
      smug: { happy: 0.3, relaxed: 0.4, neutral: 0.4 },
      smirk: { happy: 0.25, relaxed: 0.35, neutral: 0.5 },
      cocky: { happy: 0.4, relaxed: 0.3, neutral: 0.5 },
      arrogant: { neutral: 0.6, happy: 0.2, angry: 0.3 },
      haughty: { neutral: 0.7, angry: 0.4, happy: 0.1 },
      superior: { neutral: 0.6, relaxed: 0.4, angry: 0.2 },
      boastful: { happy: 0.5, relaxed: 0.3, surprised: 0.2 },
      cheeky: { happy: 0.6, relaxed: 0.2, surprised: 0.2 },
      sassy: { happy: 0.4, angry: 0.3, relaxed: 0.3 },

      // ========== EMBARRASSMENT/SHAME SPECTRUM (12 variations) ==========
      embarrassed: { sad: 0.4, happy: 0.3, surprised: 0.2 },
      ashamed: { sad: 0.7, angry: 0.3, neutral: 0.2 },
      humiliated: { sad: 0.9, angry: 0.4 },
      mortified: { sad: 0.85, surprised: 0.5 },
      sheepish: { sad: 0.3, happy: 0.2, neutral: 0.5 },
      bashful: { sad: 0.2, happy: 0.4, neutral: 0.4 },
      shy: { sad: 0.3, neutral: 0.6, surprised: 0.1 },
      timid: { sad: 0.4, neutral: 0.5, surprised: 0.2 },
      flustered: { surprised: 0.5, sad: 0.3, angry: 0.2 },
      self_conscious: { sad: 0.4, neutral: 0.5, surprised: 0.1 },
      guilt: { sad: 0.6, angry: 0.4 },
      remorseful: { sad: 0.8, angry: 0.2 },

      // ========== LOVE/AFFECTION SPECTRUM (12 variations) ==========
      loving: { happy: 0.7, relaxed: 0.6 },
      adoring: { happy: 0.8, relaxed: 0.5, surprised: 0.2 },
      affectionate: { happy: 0.6, relaxed: 0.5 },
      tender: { happy: 0.5, relaxed: 0.7, sad: 0.1 },
      caring: { happy: 0.5, relaxed: 0.6 },
      warm: { happy: 0.6, relaxed: 0.7 },
      fond: { happy: 0.5, relaxed: 0.5 },
      devoted: { happy: 0.6, relaxed: 0.6, sad: 0.2 },
      infatuated: { happy: 0.8, surprised: 0.4, relaxed: 0.3 },
      romantic: { happy: 0.7, relaxed: 0.5, surprised: 0.2 },
      passionate: { happy: 0.6, surprised: 0.5, angry: 0.3 },
      lustful: { happy: 0.5, surprised: 0.4, relaxed: 0.4 },

      // ========== PLAYFULNESS/MISCHIEF SPECTRUM (15 variations) ==========
      playful: { happy: 0.7, relaxed: 0.3, surprised: 0.2 },
      mischievous: { happy: 0.6, surprised: 0.3, neutral: 0.2 },
      impish: { happy: 0.65, surprised: 0.4, relaxed: 0.1 },
      teasing: { happy: 0.5, relaxed: 0.3, neutral: 0.3 },
      joking: { happy: 0.7, relaxed: 0.4 },
      silly: { happy: 0.8, surprised: 0.3 },
      goofy: { happy: 0.85, surprised: 0.4 },
      whimsical: { happy: 0.6, surprised: 0.3, relaxed: 0.4 },
      wink: { happy: 0.5, relaxed: 0.3, neutral: 0.3 },
      flirty: { happy: 0.6, relaxed: 0.4, surprised: 0.2 },
      coy: { happy: 0.4, sad: 0.2, neutral: 0.5 },
      sly: { neutral: 0.5, happy: 0.3, relaxed: 0.3 },
      cunning: { neutral: 0.6, angry: 0.2, happy: 0.2 },
      devious: { neutral: 0.5, angry: 0.3, happy: 0.3 },
      scheming: { neutral: 0.7, angry: 0.3, surprised: 0.2 },

      // ========== TIREDNESS/RELAXATION SPECTRUM (12 variations) ==========
      exhausted: { relaxed: 0.9, sad: 0.5 },
      drained: { relaxed: 0.8, sad: 0.6 },
      fatigued: { relaxed: 0.7, sad: 0.4, neutral: 0.3 },
      weary: { relaxed: 0.6, sad: 0.5, neutral: 0.2 },
      tired: { relaxed: 0.6, sad: 0.3 },
      sleepy: { relaxed: 0.9, neutral: 0.4 },
      drowsy: { relaxed: 0.85, neutral: 0.5 },
      lethargic: { relaxed: 0.7, neutral: 0.6 },
      sluggish: { relaxed: 0.6, neutral: 0.5, sad: 0.2 },
      lazy: { relaxed: 0.8, neutral: 0.4, happy: 0.2 },
      chill: { relaxed: 0.9, happy: 0.3 },
      calm: { relaxed: 1.0, neutral: 0.3 },

      // ========== BOREDOM/DISINTEREST SPECTRUM (10 variations) ==========
      bored: { neutral: 0.8, relaxed: 0.4, sad: 0.2 },
      uninterested: { neutral: 0.9, relaxed: 0.3 },
      indifferent: { neutral: 1.0, relaxed: 0.2 },
      apathetic: { neutral: 0.95, sad: 0.3 },
      listless: { neutral: 0.7, sad: 0.4, relaxed: 0.3 },
      unamused: { neutral: 0.6, angry: 0.4 },
      unimpressed: { neutral: 0.7, angry: 0.3 },
      underwhelmed: { neutral: 0.6, sad: 0.2, relaxed: 0.3 },
      dismissive: { neutral: 0.5, angry: 0.4, relaxed: 0.2 },
      eye_roll: { neutral: 0.4, angry: 0.5, surprised: 0.2 },

      // ========== CONFUSION/CONTEMPLATION SPECTRUM (12 variations) ==========
      confused: { surprised: 0.5, angry: 0.3, neutral: 0.3 },
      thinking: { neutral: 0.6, angry: 0.2, relaxed: 0.3 },
      pondering: { neutral: 0.7, relaxed: 0.4, surprised: 0.1 },
      contemplating: { neutral: 0.8, relaxed: 0.5 },
      pensive: { sad: 0.3, neutral: 0.6, relaxed: 0.3 },
      reflective: { neutral: 0.7, sad: 0.2, relaxed: 0.4 },
      deep_in_thought: { neutral: 0.9, relaxed: 0.5 },
      concentrating: { angry: 0.4, neutral: 0.6 },
      focused: { angry: 0.3, neutral: 0.7 },
      absorbed: { neutral: 0.8, relaxed: 0.3 },
      engrossed: { neutral: 0.7, surprised: 0.2, relaxed: 0.2 },
      lost_in_thought: { neutral: 0.8, sad: 0.3, relaxed: 0.4 },

      // ========== PHYSICAL DISCOMFORT SPECTRUM (10 variations) ==========
      sick: { sad: 0.7, relaxed: 0.5, neutral: 0.2 },
      ill: { sad: 0.65, relaxed: 0.6 },
      unwell: { sad: 0.6, relaxed: 0.5, neutral: 0.3 },
      nauseous: { sad: 0.7, surprised: 0.3, angry: 0.2 },
      queasy: { sad: 0.6, surprised: 0.4, relaxed: 0.3 },
      pain: { angry: 0.5, sad: 0.6, surprised: 0.3 },
      aching: { sad: 0.5, angry: 0.3, relaxed: 0.4 },
      suffering: { sad: 0.8, angry: 0.4 },
      agonized: { sad: 0.9, angry: 0.6, surprised: 0.3 },
      grimace: { angry: 0.6, sad: 0.3, surprised: 0.4 },

      // ========== AWKWARDNESS/DISCOMFORT SPECTRUM (9 variations) ==========
      awkward: { sad: 0.4, surprised: 0.3, neutral: 0.4 },
      uncomfortable: { sad: 0.3, angry: 0.4, neutral: 0.3 },
      restless: { surprised: 0.4, angry: 0.3, neutral: 0.3 },
      fidgety: { surprised: 0.5, neutral: 0.3, happy: 0.2 },
      antsy: { surprised: 0.5, angry: 0.3, happy: 0.2 },
      edgy: { angry: 0.5, surprised: 0.4, neutral: 0.2 },
      on_edge: { angry: 0.4, surprised: 0.5, sad: 0.2 },
      stressed: { angry: 0.6, sad: 0.4, surprised: 0.3 },
      overwhelmed: { surprised: 0.6, sad: 0.5, angry: 0.3 },

      // ========== MIXED/COMPLEX EMOTIONS (15 variations) ==========
      bittersweet: { happy: 0.5, sad: 0.5 },
      conflicted: { surprised: 0.4, sad: 0.4, angry: 0.3 },
      ambivalent: { neutral: 0.7, surprised: 0.3 },
      nostalgic: { sad: 0.4, happy: 0.4, relaxed: 0.3 },
      wistful: { sad: 0.5, happy: 0.3, relaxed: 0.4 },
      yearning: { sad: 0.6, surprised: 0.3, happy: 0.2 },
      longing: { sad: 0.7, surprised: 0.2, relaxed: 0.3 },
      homesick: { sad: 0.7, relaxed: 0.4 },
      touched: { sad: 0.4, happy: 0.5, surprised: 0.2 },
      moved: { sad: 0.3, happy: 0.6, surprised: 0.3 },
      emotional: { sad: 0.5, happy: 0.4, surprised: 0.3 },
      sentimental: { sad: 0.4, happy: 0.4, relaxed: 0.4 },
      melancholic: { sad: 0.7, relaxed: 0.6 },
      melting: { relaxed: 0.9, sad: 0.4, happy: 0.2 },
      swooning: { happy: 0.6, relaxed: 0.7, surprised: 0.3 },

      // ========== NEUTRAL/EXPRESSIONLESS SPECTRUM (8 variations) ==========
      blank: { neutral: 1.0 },
      empty: { neutral: 0.95, sad: 0.2 },
      numb: { neutral: 0.9, sad: 0.3 },
      detached: { neutral: 0.85, relaxed: 0.4 },
      distant: { neutral: 0.8, sad: 0.3, relaxed: 0.2 },
      spaced_out: { neutral: 0.9, relaxed: 0.5 },
      zoned_out: { neutral: 0.85, relaxed: 0.6 },
      expressionless: { neutral: 1.0 },

      // ========== INTENSITY MODIFIERS (can combine with others) ==========
      slight: { neutral: 0.8 }, // Use for slight variations
      moderate: { neutral: 0.5 },
      intense: { angry: 0.3, surprised: 0.3 },
      extreme: { angry: 0.5, surprised: 0.5 },

      // ========== ALIASES & SHORTCUTS ==========
      deadpan: { neutral: 1.0 },
      serious: { angry: 0.4, neutral: 0.6 },
      determined: { angry: 0.5, neutral: 0.5, surprised: 0.2 },
      resolved: { angry: 0.3, neutral: 0.7 },
      stubborn: { angry: 0.6, neutral: 0.5 },
      defiant: { angry: 0.7, surprised: 0.3 },
      rebellious: { angry: 0.6, happy: 0.3, surprised: 0.2 },
    }

    this._applyExpressionTarget('neutral')
    this.nextBlinkTime = this._getNextBlinkTime()
  }

  getAvailableAnimations() {
    return Object.keys(this.actions)
  }

  getAnimationCatalog() {
    return [
      { name: 'HappyIdle', path: '/animations/HappyIdle.vrma', loop: true },
      { name: 'wave', path: '/animations/Waving.vrma', loop: false },
      { name: 'Macarena_dance', path: '/animations/MacarenaDance.vrma', loop: false },
      { name: 'dance', path: '/animations/HipHopDance.vrma', loop: false },
      { name: 'clap', path: '/animations/Clapping.vrma', loop: false },
      { name: 'thumbs_up', path: '/animations/ThumbsUp.vrma', loop: false },
      { name: 'shrug', path: '/animations/Shrugging.vrma', loop: false },
      { name: 'pointing', path: '/animations/Pointing.vrma', loop: false },
      { name: 'laugh', path: '/animations/Laughing.vrma', loop: false },
      { name: 'salute', path: '/animations/Salute.vrma', loop: false },
      { name: 'angry', path: '/animations/Angry.vrma', loop: false },
      { name: 'backflip', path: '/animations/BackFlip.vrma', loop: false },
      { name: 'acknowledging', path: '/animations/Acknowledging.vrma', loop: false },
      { name: 'blow_kiss', path: '/animations/BlowKiss.vrma', loop: false },
      { name: 'bored', path: '/animations/Bored.vrma', loop: false },
      { name: 'looking_around', path: '/animations/LookingAround.vrma', loop: false },
      { name: 'cutthroat', path: '/animations/CutthroatGesture.vrma', loop: false },
    ]
  }

  getAnimationRepoBase() {
    return 'https://raw.githubusercontent.com/lucyakkount-cyber/VRM_1/main/public/animations'
  }

  async loadAnimationFile(file) {
    if (!file?.name || this.actions[file.name]) {
      return this.actions[file?.name] || null
    }

    const remoteUrl = `${this.getAnimationRepoBase()}/${file.path.split('/').pop()}`
    await this.loadClipWithFallback(file.name, file.path, remoteUrl, file.loop)
    return this.actions[file.name] || null
  }

  async loadAnimationBatch(files, options = {}) {
    const { onProgress, continueOnError = false } = options
    const total = files.length

    for (const [index, file] of files.entries()) {
      try {
        await this.loadAnimationFile(file)
      } catch (error) {
        if (!continueOnError) {
          throw error
        }
        console.warn(`AnimationManager: Skipped animation '${file.name}'`, error)
      }

      onProgress?.({
        current: index + 1,
        total,
        name: file.name,
      })
    }
  }

  startBackgroundAnimationLoad(options = {}) {
    if (this.backgroundLoadPromise) {
      return this.backgroundLoadPromise
    }

    const { onProgress } = options
    const remainingFiles = this.getAnimationCatalog().filter((file) => !this.actions[file.name])
    if (remainingFiles.length === 0) {
      return Promise.resolve()
    }

    this.backgroundLoadPromise = this.loadAnimationBatch(remainingFiles, {
      onProgress,
      continueOnError: true,
    }).finally(() => {
      this.backgroundLoadPromise = null
    })

    return this.backgroundLoadPromise
  }

  async initialize(options = {}) {
    const {
      onProgress,
      initialAnimations = null,
      loadRemainingInBackground = false,
      onBackgroundProgress,
    } = options
    console.log('AnimationManager: Loading clips...')
    this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e))

    const files = this.getAnimationCatalog()
    const initialSet =
      Array.isArray(initialAnimations) && initialAnimations.length > 0
        ? new Set([this.mainIdle, ...initialAnimations])
        : null
    const initialFiles = initialSet ? files.filter((file) => initialSet.has(file.name)) : files

    await this.loadAnimationBatch(initialFiles, { onProgress })

    console.log('AnimationManager Ready')
    if (this.actions[this.mainIdle]) {
      this.play(this.mainIdle)
    }

    if (loadRemainingInBackground) {
      void this.startBackgroundAnimationLoad({
        onProgress: onBackgroundProgress,
      })
    }
  }

  async loadClipWithFallback(name, localPath, remoteUrl, isLoop) {
    try {
      await this.loadClip(name, localPath, isLoop)
    } catch {
      await this.loadClip(name, remoteUrl, isLoop)
    }
  }

  _hasExpressionTrack(name) {
    if (!name || !this.vrm?.expressionManager) return false
    if (this.supportedExpressionTrackCache.has(name)) {
      return this.supportedExpressionTrackCache.get(name)
    }
    const exists = Boolean(this.vrm.expressionManager.getExpressionTrackName(name))
    this.supportedExpressionTrackCache.set(name, exists)
    return exists
  }

  _normalizeExpressionWeights(weights = {}) {
    const normalized = {}

    for (const [key, value] of Object.entries(weights || {})) {
      const numericValue = Number(value)
      if (!Number.isFinite(numericValue) || numericValue <= 0) continue
      if (!this.coreMoodKeys.includes(key) && !this._hasExpressionTrack(key)) continue
      normalized[key] = THREE.MathUtils.clamp(numericValue, 0, 1)
    }

    if (Object.keys(normalized).length === 0) {
      normalized.neutral = 1
      return normalized
    }

    const coreSum = this.coreMoodKeys.reduce((sum, key) => sum + (normalized[key] || 0), 0)
    if (coreSum > 1.25) {
      const scale = 1.25 / coreSum
      for (const key of this.coreMoodKeys) {
        if (!normalized[key]) continue
        normalized[key] = THREE.MathUtils.clamp(normalized[key] * scale, 0, 1)
      }
    }

    const hasCoreMood = this.coreMoodKeys.some((key) => normalized[key] > 0)
    if (!hasCoreMood) {
      normalized.neutral = Math.max(normalized.neutral || 0, 0.15)
    }

    return normalized
  }

  _resolveExpressionTarget(name) {
    const rawName =
      typeof name === 'string' && name.trim().length > 0 ? name.trim().toLowerCase() : 'neutral'

    let resolvedName = rawName
    let resolvedWeights = null

    if (this._hasExpressionTrack(rawName)) {
      resolvedWeights = { [rawName]: 1 }
    } else {
      const mapped = this.expressionMap[rawName]
      if (typeof mapped === 'string') {
        resolvedName = mapped
        if (this._hasExpressionTrack(mapped) || this.coreMoodKeys.includes(mapped)) {
          resolvedWeights = { [mapped]: 1 }
        }
      } else if (mapped && typeof mapped === 'object') {
        resolvedWeights = { ...mapped }
      }
    }

    if (!resolvedWeights) {
      resolvedName = 'neutral'
      resolvedWeights = { neutral: 1 }
    }

    return {
      resolvedName,
      weights: this._normalizeExpressionWeights(resolvedWeights),
    }
  }

  _buildExpressionStyle(weights = {}) {
    const mood = {}
    for (const key of this.coreMoodKeys) {
      mood[key] = THREE.MathUtils.clamp(Number(weights[key] || 0), 0, 1)
    }

    const smile = THREE.MathUtils.clamp(
      mood.happy * 0.65 + mood.relaxed * 0.35 - mood.sad * 0.3 - mood.angry * 0.35,
      0,
      1,
    )
    const frown = THREE.MathUtils.clamp(
      mood.sad * 0.75 + mood.angry * 0.55 - mood.happy * 0.25,
      0,
      1,
    )
    const awe = THREE.MathUtils.clamp(
      mood.surprised * 0.9 + mood.happy * 0.15 + mood.sad * 0.2,
      0,
      1,
    )
    const tension = THREE.MathUtils.clamp(mood.angry * 0.75 + mood.surprised * 0.35, 0, 1)

    const mouthBias = {
      aa: THREE.MathUtils.clamp(awe * 0.3 + tension * 0.12, 0, 0.6),
      ee: THREE.MathUtils.clamp(smile * 0.55, 0, 0.6),
      ih: THREE.MathUtils.clamp(smile * 0.25 + frown * 0.28 + tension * 0.15, 0, 0.6),
      oh: THREE.MathUtils.clamp(awe * 0.5 + mood.sad * 0.18, 0, 0.7),
      ou: THREE.MathUtils.clamp(mood.sad * 0.35 + mood.relaxed * 0.18 + awe * 0.2, 0, 0.65),
    }

    const blinkMinInterval = THREE.MathUtils.clamp(
      2.8 - mood.angry * 0.9 - mood.surprised * 0.8 + mood.relaxed * 1.1 + mood.sad * 0.5,
      1.2,
      5.4,
    )
    const blinkRange = THREE.MathUtils.clamp(
      1.6 + mood.relaxed * 1.4 + mood.sad * 0.6 - mood.angry * 0.3,
      1.2,
      3.8,
    )

    return {
      transitionSpeed: THREE.MathUtils.clamp(
        4.6 + mood.angry * 2.2 + mood.surprised * 1.8 + mood.happy * 0.8 - mood.sad * 0.2,
        4.2,
        8.5,
      ),
      microAmplitude: THREE.MathUtils.clamp(
        0.014 + mood.angry * 0.03 + mood.surprised * 0.026 + mood.happy * 0.015 + mood.sad * 0.02,
        0.01,
        0.08,
      ),
      microFrequency: THREE.MathUtils.clamp(
        1.6 + mood.angry * 1.2 + mood.surprised * 1.0 + mood.relaxed * 0.35,
        1.2,
        3.8,
      ),
      squint: THREE.MathUtils.clamp(
        mood.angry * 0.18 + mood.happy * 0.08 + mood.sad * 0.09 - mood.surprised * 0.15,
        0,
        0.3,
      ),
      blinkMinInterval,
      blinkMaxInterval: blinkMinInterval + blinkRange,
      blinkDuration: THREE.MathUtils.clamp(
        0.11 + mood.sad * 0.03 + mood.relaxed * 0.02 - mood.surprised * 0.02,
        0.08,
        0.18,
      ),
      mouthBias,
      mouthInfluenceWhileSpeaking: 0.28,
    }
  }

  _getNextBlinkTime() {
    const min = this.expressionStyle?.blinkMinInterval ?? 2
    const max = this.expressionStyle?.blinkMaxInterval ?? 5
    const safeMax = Math.max(min + 0.05, max)
    return min + Math.random() * (safeMax - min)
  }

  _applyExpressionTarget(name) {
    const resolved = this._resolveExpressionTarget(name)
    this.currentExpression = resolved.resolvedName
    this.targetExpression = resolved.resolvedName
    this.targetExpressionWeights = resolved.weights
    this.expressionStyle = this._buildExpressionStyle(this.targetExpressionWeights)
    this.blinkDuration = this.expressionStyle.blinkDuration
    this.nextBlinkTime = this._getNextBlinkTime()
    return resolved
  }

  setExpression(name, duration = 3.0) {
    const resolved = this._applyExpressionTarget(name)

    console.log(`Face: ${name} => ${resolved.resolvedName}`, resolved.weights, `(${duration}s)`)

    this.targetExpression = resolved.resolvedName

    if (this.expressionTimer) clearTimeout(this.expressionTimer)
    if (duration > 0) {
      this.expressionTimer = setTimeout(() => {
        this._applyExpressionTarget('neutral')
      }, duration * 1000)
    }
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = isSpeaking
    // We do NOT assume 'Talking' animation exists.
    // We rely on isSpeaking flag to unlock mouth blendshapes for AudioAnalyzer.
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta)
    if (this.vrm) {
      if (this.vrm.expressionManager) {
        this.updateBlink(delta)
        this.updateExpressions(delta)
      }

      // LookAt implementation - eyes track camera
      if (this.vrm.lookAt && this.camera) {
        this.vrm.lookAt.target = this.camera
        this.vrm.lookAt.update(delta)
      }
    }
  }

  updateBlink(delta) {
    this.blinkTimer += delta
    if (this.blinkTimer >= this.nextBlinkTime) {
      this.isBlinking = true
      this.blinkTimer = 0
      this.nextBlinkTime = this._getNextBlinkTime()
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
    const speed = this.expressionStyle.transitionSpeed * delta

    // 1. Blink
    let blinkValue = 0
    if (this.isBlinking) {
      const t = Math.PI * (this.blinkProgress / this.blinkDuration)
      blinkValue = Math.sin(t)
    }

    // 2. Micro-Expressions
    this.microTimer += delta
    this.microIntensity =
      Math.sin(this.microTimer * this.expressionStyle.microFrequency) *
      this.expressionStyle.microAmplitude

    // 3. Moods
    const targetWeights = this.targetExpressionWeights || { neutral: 1 }
    const keysToUpdate = new Set([
      ...this.coreMoodKeys,
      ...this.activeExpressionKeys,
      ...Object.keys(targetWeights),
    ])
    const nextActiveKeys = new Set(this.coreMoodKeys)

    keysToUpdate.forEach((key) => {
      if (!this.coreMoodKeys.includes(key) && !this._hasExpressionTrack(key)) return
      const currentVal = manager.getValue(key) || 0
      let baseTarget = targetWeights[key] || 0.0

      if (baseTarget > 0.05) {
        baseTarget += this.microIntensity * Math.min(1, baseTarget + 0.2)
      }
      baseTarget = THREE.MathUtils.clamp(baseTarget, 0, 1)

      const newVal = THREE.MathUtils.lerp(currentVal, baseTarget, speed)
      manager.setValue(key, newVal < 0.01 ? 0 : newVal)
      if (newVal >= 0.01 || baseTarget >= 0.01) {
        nextActiveKeys.add(key)
      }
    })
    this.activeExpressionKeys = nextActiveKeys

    const squintTarget = THREE.MathUtils.clamp(
      this.expressionStyle.squint + Math.max(0, this.microIntensity * 0.2),
      0,
      0.35,
    )
    manager.setValue('blink', Math.max(blinkValue, squintTarget))

    // 4. Mouth Movement Control
    const speakingInfluence = this.isSpeaking ? this.expressionStyle.mouthInfluenceWhileSpeaking : 1
    for (const key of this.mouthKeys) {
      if (!this._hasExpressionTrack(key)) continue
      const currentVal = manager.getValue(key) || 0
      const emotionTarget =
        THREE.MathUtils.clamp(
          (this.expressionStyle.mouthBias[key] || 0) * speakingInfluence,
          0,
          1,
        ) + Math.max(0, this.microIntensity * 0.35)
      const targetVal = this.isSpeaking ? Math.max(currentVal, emotionTarget) : emotionTarget
      const newVal = THREE.MathUtils.lerp(currentVal, targetVal, speed * 0.9)
      manager.setValue(key, newVal < 0.01 ? 0 : newVal)
    }

    manager.update()
  }

  triggerNamedAnimation(name) {
    if (typeof name !== 'string' || !name.trim()) return
    const requestedName = name.trim()

    // 1. Exact Match
    if (this.actions[requestedName]) {
      this.play(requestedName)
      return
    }

    // 2. Case-Insensitive Match
    const lowerName = requestedName.toLowerCase()
    const foundKey = Object.keys(this.actions).find((k) => k.toLowerCase() === lowerName)
    if (foundKey) {
      this.play(foundKey)
      return
    }

    // 3. Lazy-load from catalog for cold-start cases (e.g. cutthroat before preload ends)
    const catalogMatch = this.getAnimationCatalog().find((file) => file.name.toLowerCase() === lowerName)
    if (catalogMatch) {
      void this.loadAnimationFile(catalogMatch)
        .then(() => {
          const loadedKey = Object.keys(this.actions).find((k) => k.toLowerCase() === lowerName)
          if (loadedKey) this.play(loadedKey)
        })
        .catch((error) => {
          console.warn(`Animation '${requestedName}' failed to load on demand.`, error)
        })
      return
    }

    console.warn(`Animation '${requestedName}' not found.`)
  }

  onAnimationFinished(e) {
    const clipName = e.action.getClip().name
    const isLoopOnce = e.action.loop === THREE.LoopOnce

    if (clipName !== 'HappyIdle' && clipName !== 'Macarena_dance' && isLoopOnce) {
      this.play(this.mainIdle)
    }
  }

  async loadClip(name, url, isLoop) {
    try {
      let arrayBuffer

      // 1. Try Cache
      const cached = await cacheManager.getCached('animations', url)
      if (cached) {
        // console.log(`⚡ Anim Cache Hit: ${name}`)
        arrayBuffer = cached
      } else {
        // 2. Fetch
        // console.log(`🌐 Anim Fetching: ${name}`)
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch ${url}`)
        arrayBuffer = await response.arrayBuffer()

        // 3. Cache
        cacheManager
          .setCached('animations', url, arrayBuffer)
          .catch((e) => console.warn('Anim cache failed', e))
      }

      // 4. Parse
      return new Promise((resolve, reject) => {
        this.loader.parse(
          arrayBuffer,
          url,
          (gltf) => {
            let clip = null
            if (gltf.userData.vrmAnimations && gltf.userData.vrmAnimations.length > 0) {
              clip = createVRMAnimationClip(gltf.userData.vrmAnimations[0], this.vrm)
            } else if (gltf.animations && gltf.animations.length > 0) {
              clip = createVRMAnimationClip(gltf.animations[0], this.vrm)
            }

            if (clip) {
              clip.name = name
              const action = this.mixer.clipAction(clip)
              action.loop = isLoop ? THREE.LoopRepeat : THREE.LoopOnce
              action.clampWhenFinished = true
              this.actions[name] = action
              resolve(action)
            } else {
              console.warn(`⚠️ Empty animation: ${url}`)
              resolve(null)
            }
          },
          (err) => {
            console.warn(`❌ Parse failed: ${url}`, err)
            reject(err)
          },
        )
      })
    } catch (err) {
      console.warn(`❌ Load failed: ${url}`, err)
      throw err
    }
  }

  play(name) {
    const action = this.actions[name]
    if (!action) return
    if (this.activeAction === action) return

    if (this.activeAction) {
      this.activeAction.fadeOut(0.5)
    }

    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.5).play()

    this.activeAction = action

    if (name === this.mainIdle) {
      this.currentState = 'idle'
    } else {
      this.currentState = name
    }
  }

  cleanup() {
    if (this.mixer) this.mixer.stopAllAction()
    if (this.expressionTimer) clearTimeout(this.expressionTimer)
  }
}
