// managers/sceneManager.js
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = null
    this.scene = null
    this.camera = null
    this.controls = null
    this.clock = new THREE.Clock()

    // Mouse Tracking
    this.mouse = { x: 0, y: 0 }

    this.updateCallbacks = []
  }

  initialize() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: this.canvas,
        alpha: true,
        preserveDrawingBuffer: true, // Required for html2canvas to capture the 3D model
      })
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.renderer.setPixelRatio(window.devicePixelRatio)
      // High-quality shadows for Rayen style look
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

      this.scene = new THREE.Scene()

      this.camera = new THREE.PerspectiveCamera(
        35,
        window.innerWidth / window.innerHeight,
        0.1,
        100,
      )
      this.camera.position.set(0, 1.4, 3.5) // Slightly further back for "Streamer" view

      this.setupLighting()

      // Orbit Controls (Restricted for V-Tuber style)
      this.controls = new OrbitControls(this.camera, this.renderer.domElement)
      this.controls.target.set(0, 1.2, 0)
      this.controls.enablePan = false
      this.controls.minDistance = 1.0
      this.controls.maxDistance = 5.0
      this.controls.update()

      this.setupResizeHandler()
      this.setupMouseHandler() // NEW

      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  setupMouseHandler() {
    // Track mouse for head movement
    window.addEventListener('mousemove', (event) => {
      // Normalize to -1...1
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    })
  }

  getMousePosition() {
    return this.mouse
  }

  setupLighting() {
    // "Streamer" Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
    mainLight.position.set(2, 2, 5)
    mainLight.castShadow = true
    this.scene.add(mainLight)

    const rimLight = new THREE.SpotLight(0x88ccff, 2.0)
    rimLight.position.set(-2, 4, -2)
    rimLight.lookAt(0, 1, 0)
    this.scene.add(rimLight)
  }

  setupResizeHandler() {
    const handleResize = () => {
      if (!this.camera || !this.renderer) return
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
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

  addUpdateCallback(callback) {
    this.updateCallbacks.push(callback)
  }

  startRenderLoop() {
    const animate = () => {
      const delta = this.clock.getDelta()
      if (this.controls) this.controls.update()

      this.updateCallbacks.forEach((cb) => cb(delta))

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera)
      }
      requestAnimationFrame(animate)
    }
    animate()
  }

  setupDragAndDrop(callback) {
    /* ... keep existing logic ... */
  }

  cleanup() {
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler)
    // ... dispose logic ...
  }
}
