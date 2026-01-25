// managers/aiClient.js
import { GoogleGenAI } from '@google/genai'

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`

export class AIClient {
  constructor(apiKey, model) {
    this.client = new GoogleGenAI({ apiKey: apiKey })
    this.liveModel = model
    this.activeSession = null
    this.audioContext = null
    this.workletNode = null
    this.mediaStream = null
    this.isRecording = false
    this.inputBuffer = new Int16Array(4096)
    this.inputBufferIndex = 0
  }

  async connectLive(
    systemPrompt = '',
    onAudioData,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onDisconnect,
    availableAnimations = [],
  ) {
    if (this.activeSession) return

    console.log('🔌 Connecting to Gemini Live...')

    // Store the disconnect callback
    this.onDisconnectCallback = onDisconnect

    const animString =
      availableAnimations.length > 0
        ? availableAnimations.join(', ')
        : 'wave, clap, dance, backflip'

    const tools = [
      {
        functionDeclarations: [
          {
            name: 'trigger_animation',
            description: 'Triggers a body movement.',
            parameters: {
              type: 'OBJECT',
              properties: {
                animation_name: { type: 'STRING', description: `Available: ${animString}` },
              },
              required: ['animation_name'],
            },
          },
          // ⚡ UPDATED: Full List of Emotions
          {
            name: 'set_expression',
            description: 'Sets the facial expression.',
            parameters: {
              type: 'OBJECT',
              properties: {
                expression: {
                  type: 'STRING',
                  description:
                    'Values: happy, sad, angry, surprised, confused, embarrassed, excited, tired, serious, smug, thinking, crying, deadpan, shock, fear, disgust',
                },
                duration: { type: 'NUMBER', description: 'Duration in seconds.' },
              },
              required: ['expression'],
            },
          },
          // 📷 NEW: Vision Capability
          {
            name: 'look_at_user',
            description: 'See the user and their surroundings via camera.',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
          },
          // 📱 NEW: Screen Capture Capability
          {
            name: 'look_at_screen',
            description: 'See the user and their surroundings via screen.',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
          },
        ],
      },
    ]

    const config = {
      responseModalities: ['AUDIO'],
      tools: tools,
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }

    try {
      this.activeSession = await this.client.live.connect({
        model: this.liveModel,
        config,
        callbacks: {
          onopen: () => {
            console.log('✅ Live Session Started')
            this.startMicrophone()
          },
          onmessage: (msg) => {
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const binaryString = atob(part.inlineData.data)
                  const bytes = new Uint8Array(binaryString.length)
                  for (let i = 0; i < binaryString.length; i++)
                    bytes[i] = binaryString.charCodeAt(i)
                  onAudioData?.(new Int16Array(bytes.buffer))
                }
                if (part.functionCall)
                  this._executeFunction(
                    part.functionCall,
                    onAnimationTrigger,
                    onExpressionTrigger,
                    onVisionTrigger,
                    onScreenTrigger,
                  )
              }
            }
            if (msg.toolCall)
              this._handleToolCall(
                msg.toolCall,
                onAnimationTrigger,
                onExpressionTrigger,
                onVisionTrigger,
                onScreenTrigger,
              )
          },
          onclose: (e) => {
            console.log('❌ Connection Closed', e)
            const reason = e.reason || 'Connection closed unexpectedly'
            this.disconnect(reason)
          },
          onerror: (e) => console.error('🔥 Live Error:', e),
        },
      })
    } catch (e) {
      console.error('🔥 Connection Failed:', e)
      this.disconnect()
    }
  }

  _handleToolCall(
    toolCall,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
  ) {
    if (!toolCall.functionCalls) return
    for (const fc of toolCall.functionCalls)
      this._executeFunction(
        fc,
        onAnimationTrigger,
        onExpressionTrigger,
        onVisionTrigger,
        onScreenTrigger,
      )
  }

  _executeFunction(fc, onAnimationTrigger, onExpressionTrigger, onVisionTrigger, onScreenTrigger) {
    const { id, name, args } = fc
    console.log(`🎯 Function (Queued): ${name}`, args)

    // Vision is special: It needs IMMEDIATE return of data to be useful,
    // but we also want the AI to wait.
    // However, usually "look" happens, then AI speaks.
    // So queueing might still be okay, BUT usually we want the image sent back ASAP.

    if (name === 'look_at_user') {
      console.log('📷 Triggering Vision Tool...')
      // Immediate execution for vision to get data back to AI
      onVisionTrigger?.().then((base64Image) => {
        if (base64Image) {
          console.log('📤 Sending Image to Gemini...')
          this._sendRealtimeImage(base64Image)
          this._sendToolResponse(id, name, { result: 'Image captured and sent.' })
        } else {
          this._sendToolResponse(id, name, { error: 'Failed to capture image.' })
        }
      })
      return
    }

    if (name === 'look_at_screen') {
      console.log('🖥️ Triggering Screen Capture...')
      onScreenTrigger?.().then((base64Image) => {
        if (base64Image) {
          console.log('📤 Sending Screen to Gemini...')
          this._sendRealtimeImage(base64Image)
          this._sendToolResponse(id, name, { result: 'Screen captured and sent.' })
        } else {
          this._sendToolResponse(id, name, { error: 'Failed to capture screen.' })
        }
      })
      return
    }

    // Normal Delayed Animations
    const EXECUTION_DELAY = 2400

    setTimeout(() => {
      console.log(`▶️ Executing Delayed: ${name}`)
      if (name === 'trigger_animation' && args.animation_name) {
        onAnimationTrigger?.(args.animation_name)
      } else if (name === 'set_expression' && args.expression) {
        const duration = args.duration || 2.0
        onExpressionTrigger?.(args.expression, duration)
      }
    }, EXECUTION_DELAY)

    // We send "ok" immediately to acknowledge command, but action is delayed visually.
    this._sendToolResponse(id, name, { status: 'queued', triggered: `${name} (delayed)` })
  }

  async _sendToolResponse(id, name, response) {
    if (!this.activeSession) return
    try {
      await this.activeSession.sendToolResponse({
        functionResponses: [{ id: id, name: name, response: { result: response } }],
      })
    } catch (e) {
      console.error(e)
    }
  }

  async _sendRealtimeImage(base64Image) {
    if (!this.activeSession) return
    try {
      await this.activeSession.sendRealtimeInput({
        media: { mimeType: 'image/jpeg', data: base64Image },
      })
    } catch (e) {
      console.error('Failed to send image:', e)
    }
  }

  async startMicrophone() {
    if (this.isRecording) return
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      await this.audioContext.resume()
      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
      await this.audioContext.audioWorklet.addModule(URL.createObjectURL(blob))
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      })
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor')
      this.workletNode.port.onmessage = (e) => {
        if (this.isRecording) this._processAudioChunk(e.data)
      }
      source.connect(this.workletNode)
      this.isRecording = true
    } catch (e) {
      console.error(e)
    }
  }

  stopMicrophone() {
    this.isRecording = false
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.workletNode?.disconnect()
    this.audioContext?.close()
    this.inputBufferIndex = 0
  }

  _processAudioChunk(float32Data) {
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]))
      this.inputBuffer[this.inputBufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.inputBufferIndex === this.inputBuffer.length) this._flushInputBuffer()
    }
  }

  _flushInputBuffer() {
    if (!this.activeSession) return
    const base64 = btoa(String.fromCharCode(...new Uint8Array(this.inputBuffer.buffer)))
    this._sendToGemini(base64)
    this.inputBufferIndex = 0
  }

  async _sendToGemini(base64Audio) {
    if (!this.activeSession) return
    try {
      await this.activeSession.sendRealtimeInput({
        media: { mimeType: 'audio/pcm;rate=16000', data: base64Audio },
      })
    } catch (e) {
      if (e.message.includes('closed')) this.disconnect()
    }
  }

  disconnect(reason = 'User disconnected') {
    if (!this.activeSession && !this.isRecording) return // Already cleaned up

    this.activeSession?.close()
    this.activeSession = null
    this.stopMicrophone()

    // Notify parent component
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback(reason)
      this.onDisconnectCallback = null
    }
  }
}
