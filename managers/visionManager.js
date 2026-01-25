// managers/visionManager.js
import html2canvas from 'html2canvas'
export class VisionManager {
  constructor() {
    this.videoElement = null
    this.canvasElement = null
    this.stream = null
    this.isInitialized = false
  }

  async initialize() {
    if (this.isInitialized) return true

    // Create hidden video element
    this.videoElement = document.createElement('video')
    this.videoElement.style.display = 'none'
    this.videoElement.autoplay = true
    this.videoElement.muted = true
    document.body.appendChild(this.videoElement)

    // Create hidden canvas for capturing frames
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.display = 'none'

    this.isInitialized = true
    return true
  }

  async startCamera() {
    if (!this.isInitialized) await this.initialize()

    try {
      console.log('📷 VisionManager: Requesting camera access...')
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      })
      this.videoElement.srcObject = this.stream

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play()
          resolve()
        }
      })

      console.log('✅ VisionManager: Camera started')
      return true
    } catch (error) {
      console.error('❌ VisionManager: Camera failed', error)
      return false
    }
  }

  async captureFrame() {
    if (!this.stream) {
      const success = await this.startCamera()
      if (!success) return null
    }

    const video = this.videoElement
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    // Downscale to max 640px width
    const scale = Math.min(1, 640 / video.videoWidth)
    const width = Math.floor(video.videoWidth * scale)
    const height = Math.floor(video.videoHeight * scale)

    this.canvasElement.width = width
    this.canvasElement.height = height
    const ctx = this.canvasElement.getContext('2d')
    ctx.drawImage(video, 0, 0, width, height)

    // Get Base64 JPEG
    const dataURL = this.canvasElement.toDataURL('image/jpeg', 0.7) // Lower quality slightly

    // Show preview for 3 seconds
    this.showPreview()

    return dataURL.split(',')[1]
  }

  // --- Screen Capture Methods ---

  async captureScreenFrame() {
    try {
      console.log('🖥️ VisionManager: Capturing screen via html2canvas...')
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true, // Try to capture everything
        backgroundColor: null, // transparent background if possible
      })

      // Downscale to max 640px width
      const scale = Math.min(1, 640 / canvas.width)
      const width = Math.floor(canvas.width * scale)
      const height = Math.floor(canvas.height * scale)

      this.canvasElement.width = width
      this.canvasElement.height = height
      const ctx = this.canvasElement.getContext('2d')
      ctx.drawImage(canvas, 0, 0, width, height)

      this.showPreview()

      const dataURL = this.canvasElement.toDataURL('image/jpeg', 0.7)
      return dataURL.split(',')[1]
    } catch (error) {
      console.error('❌ Screen Capture failed:', error)
      return null
    }
  }

  stopScreenCapture() {
    // No-op for html2canvas
  }

  showPreview() {
    // Clone logic or display existing canvas
    const previewCanvas = document.createElement('canvas')
    previewCanvas.width = this.canvasElement.width
    previewCanvas.height = this.canvasElement.height
    previewCanvas.getContext('2d').drawImage(this.canvasElement, 0, 0)

    // Style it to float on top right
    previewCanvas.style.position = 'fixed'
    previewCanvas.style.bottom = '20px'
    previewCanvas.style.right = '20px'
    previewCanvas.style.width = '300px' // thumb size
    previewCanvas.style.height = 'auto'
    previewCanvas.style.zIndex = '9999'
    previewCanvas.style.border = '2px solid #00ffa3'
    previewCanvas.style.borderRadius = '8px'
    previewCanvas.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)'
    previewCanvas.style.transition = 'opacity 0.5s'

    document.body.appendChild(previewCanvas)

    // Remove after 3 seconds
    setTimeout(() => {
      previewCanvas.style.opacity = '0'
      setTimeout(() => {
        if (previewCanvas.parentNode) {
          document.body.removeChild(previewCanvas)
        }
      }, 500)
    }, 3000)
  }

  cleanup() {
    this.stopCamera()
    this.stopScreenCapture()
    if (this.videoElement) document.body.removeChild(this.videoElement)
    if (this.screenVideoElement) document.body.removeChild(this.screenVideoElement)
    this.videoElement = null
    this.screenVideoElement = null
    this.canvasElement = null
    this.isInitialized = false
  }
}
