import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class SceneManager {
  canvas
  options = null
  renderer = null
  scene = null
  camera = null
  controls = null
  clock = new THREE.Clock()
  mouse = { x: 0, y: 0 }
  updateCallbacks = []
  resizeHandler = null
  currentFps = 0
  fpsFrameCounter = 0
  fpsLastTimestamp = performance.now()
  animationFrameId = null
  isRendering = false
  renderPixelRatio = 1
  backgroundColor = '#111827'

  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.options = {
      antialias: options.antialias ?? false,
      alpha: options.alpha ?? false,
      shadows: options.shadows ?? false,
      powerPreference: options.powerPreference || 'high-performance',
      pixelRatioCap:
        Number.isFinite(options.pixelRatioCap) && options.pixelRatioCap > 0
          ? options.pixelRatioCap
          : 1,
    }
    this.backgroundColor = this.normalizeBackgroundColor(options.backgroundColor)
  }

  initialize() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: this.options.antialias,
        canvas: this.canvas,
        alpha: this.options.alpha,
        powerPreference: this.options.powerPreference,
        preserveDrawingBuffer: false,
        stencil: false,
      })
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.renderPixelRatio = Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap)
      this.renderer.setPixelRatio(this.renderPixelRatio)
      this.renderer.shadowMap.enabled = this.options.shadows
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(this.backgroundColor)

      this.camera = new THREE.PerspectiveCamera(
        35,
        window.innerWidth / window.innerHeight,
        0.1,
        100,
      )
      this.camera.position.set(0, 1.4, 3.5)

      this.setupLighting()

      this.controls = new OrbitControls(this.camera, this.renderer.domElement)
      this.controls.target.set(0, 1.2, 0)
      this.controls.enablePan = false
      this.controls.minDistance = 1.0
      this.controls.maxDistance = 5.0

      // Lock vertical rotation (Polar angle) to horizontal only
      this.controls.maxPolarAngle = Math.PI / 2

      this.controls.update()

      this.setupResizeHandler()
      this.setupMouseHandler()

      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  setupMouseHandler() {
    window.addEventListener('mousemove', (event) => {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    })
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene?.add(ambientLight)

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2)
    mainLight.position.set(2, 2, 5)
    mainLight.castShadow = this.options.shadows
    this.scene?.add(mainLight)

    const rimLight = new THREE.SpotLight(0x6366f1, 3.0) // Indigo rim
    rimLight.position.set(-2, 4, -2)
    rimLight.lookAt(0, 1, 0)
    this.scene?.add(rimLight)
  }

  setupResizeHandler() {
    const handleResize = () => {
      if (!this.camera || !this.renderer) return
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.renderer.setPixelRatio(this.renderPixelRatio)
    }
    window.addEventListener('resize', handleResize)
    this.resizeHandler = handleResize
  }

  addToScene(object) {
    if (this.scene) this.scene.add(object)
  }
  removeFromScene(object) {
    if (this.scene) this.scene.remove(object)
  }

  normalizeBackgroundColor(value) {
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
        return normalized.toLowerCase()
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`
    }
    return '#111827'
  }

  setBackgroundColor(value) {
    const nextColor = this.normalizeBackgroundColor(value)
    this.backgroundColor = nextColor
    if (this.scene) {
      this.scene.background = new THREE.Color(nextColor)
    }
    return nextColor
  }

  addUpdateCallback(callback) {
    this.updateCallbacks.push(callback)
  }

  startRenderLoop() {
    if (this.isRendering) return
    this.isRendering = true

    const animate = () => {
      if (!this.isRendering) return

      const delta = this.clock.getDelta()
      if (this.controls) this.controls.update()

      this.updateCallbacks.forEach((cb) => cb(delta))

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera)
      }

      this.fpsFrameCounter += 1
      const now = performance.now()
      const elapsed = now - this.fpsLastTimestamp
      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.fpsFrameCounter * 1000) / elapsed)
        this.fpsFrameCounter = 0
        this.fpsLastTimestamp = now
      }

      this.animationFrameId = requestAnimationFrame(animate)
    }
    this.animationFrameId = requestAnimationFrame(animate)
  }

  getCurrentFps() {
    return this.currentFps
  }

  cleanup() {
    this.isRendering = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler)
    this.renderer?.dispose()
  }
}
