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
  client
  liveModel
  activeSession = null
  audioContext = null
  workletNode = null
  mediaStream = null
  isRecording = false
  inputBuffer = new Int16Array(4096)
  inputBufferIndex = 0
  isDisconnecting = false
  isSessionOpen = false
  isReconnecting = false
  reconnectAttempts = 0
  maxReconnectAttempts = 12
  reconnectBaseDelayMs = 2000
  reconnectMaxDelayMs = 20_000
  reconnectTimer = null
  reconnectHistorySuggestionSent = false
  connectionArgs = null
  recognition = null
  onDisconnectCallback = null

  // Transcription state
  currentInputTranscription = ''
  currentOutputTranscription = ''

  // Internal history to preserve context on reconnects
  internalHistory = []

  constructor(apiKey, model) {
    // Prevent immediate crash if API key is missing.
    // We use a placeholder that will fail gracefully during 'connect', not construction.
    const safeKey = apiKey || 'dummy_key_placeholder'
    this.client = new GoogleGenAI({ apiKey: safeKey })
    this.liveModel = model
  }

  async connectLive(
    systemPrompt = '',
    onAudioData,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onDisconnect,
    availableAnimations = [],
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
    onHistoryChange,
    onSystemMessage,
    onTranscription,
    pastHistory = [],
    initialMessage = '',
    enableMic = true,
    onBehaviorReport,
  ) {
    if (this.activeSession) return

    console.log(`🔌 Connecting to Gemini Live... (Mic: ${enableMic})`)
    this.isDisconnecting = false
    this.isReconnecting = false
    this.reconnectAttempts = 0
    this.reconnectHistorySuggestionSent = false
    this._clearReconnectTimer()
    this.internalHistory = []
    this.onDisconnectCallback = onDisconnect || null

    try {
      this.connectionArgs = {
        baseSystemPrompt: systemPrompt,
        onAudioData,
        onAnimationTrigger,
        onExpressionTrigger,
        onVisionTrigger,
        onScreenTrigger,
        onCameraOffTrigger,
        onScreenOffTrigger,
        onDisconnect,
        availableAnimations,
        onUserNameSet,
        onMemorySaved,
        onMemoryDeleted,
        onHistoryChange,
        onSystemMessage,
        onTranscription,
        pastHistory,
        initialMessage,
        enableMic,
        onBehaviorReport,
      }

      await this._establishConnection()
    } catch (e) {
      console.error('🔥 Connection Failed:', e)
      this.disconnect('Initial connection failed')
      onSystemMessage?.('Connection Failed', e.message, 'error')
    }
  }

  async _establishConnection() {
    if (this.isDisconnecting) return

    const {
      baseSystemPrompt,
      onAudioData,
      onAnimationTrigger,
      onExpressionTrigger,
      onVisionTrigger,
      onScreenTrigger,
      onCameraOffTrigger,
      onScreenOffTrigger,
      onUserNameSet,
      onMemorySaved,
      onMemoryDeleted,
      onSystemMessage,
      onTranscription,
      pastHistory,
      initialMessage,
      enableMic,
    } = this.connectionArgs

    // Reconstruct System Prompt with Full Context
    console.log('🔌 _establishConnection. onTranscription defined?', !!onTranscription)
    let fullSystemPrompt = baseSystemPrompt

    // Combine passed history with any internal history accumulated during this session wrapper
    const safePastHistory = Array.isArray(pastHistory) ? pastHistory : []
    const combinedHistory = [...safePastHistory, ...this.internalHistory]

    // INTELLIGENT RECONNECT LOGIC:
    // Check if the last message in history was from the user.
    // If so, it means the connection dropped before the AI could respond.
    // We treat this as a "Pending Question" that needs an immediate answer.
    let pendingUserQuestion = initialMessage ? String(initialMessage) : ''

    if (combinedHistory.length > 0) {
      const lastMsg = combinedHistory[combinedHistory.length - 1]

      // If we don't have an explicit initial message, but the history shows the user spoke last
      if (!pendingUserQuestion && lastMsg.role === 'user') {
        const text = lastMsg.text ? String(lastMsg.text) : ''
        console.log('⚠️ Found unanswered user message in history. Reprompting model.', text)
        pendingUserQuestion = text
      }

      // Format history for context (excluding the pending question if we are going to inject it as a prompt)
      const validHistory = combinedHistory.filter((m) => m.text && m.text.trim().length > 0)
      const historyText = validHistory
        .slice(-20)
        .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')

      fullSystemPrompt += `\n\nIMPORTANT: You are continuing a conversation. Below is the recent chat history. Use it to maintain context.\n\n--- HISTORY START ---\n${historyText}\n--- HISTORY END ---\n\nIf the user says "do you remember", refer to this history.`
    }

    // Inject the pending question/initial message into the system instruction
    // This forces the model to respond to it immediately upon connection establishment.
    if (pendingUserQuestion && pendingUserQuestion.trim().length > 0) {
      fullSystemPrompt += `\n\nCRITICAL INSTRUCTION: The user just said: "${pendingUserQuestion}".\nThe connection was previously interrupted. You must ANSWER this specific message immediately as your first response. Do NOT say hello. Do NOT apologize for the disconnection. JUST ANSWER THE QUESTION.`

      // Ensure this pending message is tracked in history if it wasn't already
      const lastMsg =
        combinedHistory.length > 0 ? combinedHistory[combinedHistory.length - 1] : null
      if (!lastMsg || lastMsg.text !== pendingUserQuestion) {
        this.internalHistory.push({
          role: 'user',
          text: pendingUserQuestion,
          timestamp: Date.now(),
        })
      }
    }

    const animString =
      this.connectionArgs.availableAnimations.length > 0
        ? this.connectionArgs.availableAnimations.join(', ')
        : 'wave, clap, dance, backflip'

    const tools = this._getTools(animString)

    const config = {
      // Must be 'AUDIO' for Gemini Live
      responseModalities: ['AUDIO'],
      tools: tools,
      systemInstruction: fullSystemPrompt,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      // Re-enabled transcription
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    }

    console.log('🔌 Starting New Session. History items:', combinedHistory.length)

    try {
      // 1️⃣ Connect
      this.activeSession = await this.client.live.connect({
        model: this.liveModel,
        config: config,
        callbacks: {
          onopen: () => {
            console.log('✅ Live Session Started')
            this.isSessionOpen = true
            this.reconnectAttempts = 0
            this.reconnectHistorySuggestionSent = false
            this._clearReconnectTimer()

            if (this.isReconnecting) {
              onSystemMessage?.('Reconnected', 'Restored connection & context', 'success')
              this.isReconnecting = false
            } else {
              // Only show connected message if not silently restarting for text
              if (!initialMessage) {
                onSystemMessage?.('Connected', 'Live session started', 'success')
              }
            }

            if (enableMic) {
              this.startMicrophone()
            } else {
              this.stopMicrophone()
            }
          },
          onmessage: (msg) => {
            // 1. Handle Transcriptions
            if (msg.serverContent?.outputTranscription) {
              // AI is speaking - finalize and clear user input
              if (this.currentInputTranscription.trim().length > 0) {
                this._flushTranscriptions(true, onTranscription, 'user')
                this.currentInputTranscription = '' // Clear after AI starts speaking
              }

              const text = msg.serverContent.outputTranscription.text
              this.currentOutputTranscription += text
              onTranscription?.('model', this.currentOutputTranscription, false)
            } else if (msg.serverContent?.inputTranscription) {
              // User is speaking - accumulate
              const text = msg.serverContent.inputTranscription.text
              this.currentInputTranscription += text
              onTranscription?.('user', this.currentInputTranscription, false)
            }

            if (msg.serverContent?.turnComplete) {
              // Finalize user input but DON'T clear it (keep accumulating)
              if (this.currentInputTranscription.trim().length > 0) {
                onTranscription?.('user', this.currentInputTranscription, true)
              }
              // Only clear model transcriptions on turn complete
              this._flushTranscriptions(true, onTranscription, 'model')
            }

            // 2. Handle Audio
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
                    onCameraOffTrigger,
                    onScreenOffTrigger,
                    onUserNameSet,
                    onMemorySaved,
                    onMemoryDeleted,
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
                onCameraOffTrigger,
                onScreenOffTrigger,
                onUserNameSet,
                onMemorySaved,
                onMemoryDeleted,
              )
          },
          onclose: (e) => {
            console.log('❌ Connection Closed', e)
            this.isSessionOpen = false
            this.activeSession = null

            // IMPORTANT: Flush any partial transcriptions to history BEFORE attempting reconnect.
            // This ensures if the user was speaking, their words are captured in history
            // so the next session knows to answer them.
            this._flushTranscriptions(true, onTranscription, 'both')

            // If the user manually disconnected, stop here.
            if (this.isDisconnecting) return

            const reason = e.reason || 'Connection lost'

            console.log(`Connection dropped unexpectedly (${reason}).`)

            this._scheduleReconnect(onSystemMessage, reason)
          },
          onerror: (e) => {
            console.error('🔥 Live Error:', e)
            // Connection errors are often internal API issues (e.g., "Thread was cancelled")
            // These are typically transient and will trigger reconnection via onclose
          },
        },
      })
    } catch (err) {
      console.error('Failed to connect live session:', err)
      console.error('Error details:', err.message, err.stack)

      if (!this.isDisconnecting) {
        this._scheduleReconnect(onSystemMessage, err?.message || 'connection failed')
      } else {
        onSystemMessage?.('Connection Error', 'Failed to connect. Check API Key.', 'error')
      }
      return
    }

    // Pending user text is already injected into the system instruction.
  }

  // Safe sendText that restarts the session to force a response
  async sendText(text) {
    console.log('AIClient: Sending text by restarting session with context:', text)

    let newPastHistory = [...(this.connectionArgs?.pastHistory || [])]
    if (this.internalHistory.length > 0) {
      newPastHistory = [...newPastHistory, ...this.internalHistory]
    }

    // Explicitly set isDisconnecting to false so the close handler knows we are managing this
    // Actually, we want to STOP the auto-reconnect logic of the OLD session because we are making a NEW one.
    this.isDisconnecting = true // Stop old session from fighting us

    if (this.activeSession) {
      try {
        this.activeSession.close()
      } catch (error) {
        console.warn('Failed to close previous session', error)
      }
      this.activeSession = null
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    if (this.connectionArgs) {
      await this.connectLive(
        this.connectionArgs.baseSystemPrompt,
        this.connectionArgs.onAudioData,
        this.connectionArgs.onAnimationTrigger,
        this.connectionArgs.onExpressionTrigger,
        this.connectionArgs.onVisionTrigger,
        this.connectionArgs.onScreenTrigger,
        this.connectionArgs.onCameraOffTrigger,
        this.connectionArgs.onScreenOffTrigger,
        this.connectionArgs.onDisconnect,
        this.connectionArgs.availableAnimations,
        this.connectionArgs.onUserNameSet,
        this.connectionArgs.onMemorySaved,
        this.connectionArgs.onMemoryDeleted,
        this.connectionArgs.onHistoryChange,
        this.connectionArgs.onSystemMessage,
        this.connectionArgs.onTranscription,
        newPastHistory,
        text,
        false,
      )
    } else {
      console.error('AIClient: Cannot restart session, no connection args.')
    }
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  _scheduleReconnect(onSystemMessage, reason = 'Connection lost') {
    if (this.isDisconnecting) return
    if (this.reconnectTimer) return

    this.isReconnecting = true
    this.reconnectAttempts += 1

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      onSystemMessage?.(
        'Connection Failed',
        'Reconnect limit reached. Clear chat history and reconnect manually.',
        'error',
      )
      this.disconnect('Reconnect limit reached')
      return
    }

    const attempt = this.reconnectAttempts
    const delayMs = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 1),
    )
    const delaySeconds = Math.ceil(delayMs / 1000)

    onSystemMessage?.(
      'Reconnecting',
      `Connection unstable (${reason}). Retry ${attempt}/${this.maxReconnectAttempts} in ${delaySeconds}s.`,
      'warning',
    )

    if (attempt >= 4 && !this.reconnectHistorySuggestionSent) {
      this.reconnectHistorySuggestionSent = true
      onSystemMessage?.(
        'History Cleanup Recommended',
        'Too many reconnects. Open Chat > Clear to remove old history, then reconnect.',
        'warning',
      )
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this._establishConnection()
    }, delayMs)
  }

  _flushTranscriptions(isFinal, onTranscription, target = 'both') {
    if ((target === 'user' || target === 'both') && this.currentInputTranscription.trim()) {
      const text = this.currentInputTranscription
      onTranscription?.('user', text, isFinal)
      if (isFinal) {
        this.internalHistory.push({ role: 'user', text, timestamp: Date.now() })
        // NOTE: currentInputTranscription is now cleared explicitly in onmessage handler
        // when AI starts speaking, not here
      }
    }

    if ((target === 'model' || target === 'both') && this.currentOutputTranscription.trim()) {
      const text = this.currentOutputTranscription
      onTranscription?.('model', text, isFinal)
      if (isFinal) {
        this.internalHistory.push({ role: 'model', text, timestamp: Date.now() })
        this.currentOutputTranscription = ''
      }
    }
  }

  _handleToolCall(
    toolCall,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
  ) {
    if (!toolCall.functionCalls) return
    for (const fc of toolCall.functionCalls)
      this._executeFunction(
        fc,
        onAnimationTrigger,
        onExpressionTrigger,
        onVisionTrigger,
        onScreenTrigger,
        onCameraOffTrigger,
        onScreenOffTrigger,
        onUserNameSet,
        onMemorySaved,
        onMemoryDeleted,
      )
  }

  _executeFunction(
    fc,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
  ) {
    const { id, name, args } = fc
    console.log(`🎯 Function: ${name}`, args)

    if (name === 'set_user_name') {
      onUserNameSet?.(args.name)
      this._sendToolResponse(id, name, { result: 'ok' })
      return
    }
    if (name === 'save_memory') {
      onMemorySaved?.(args.key, args.value)
      this._sendToolResponse(id, name, { result: 'ok' })
      return
    }
    if (name === 'delete_memory') {
      onMemoryDeleted?.(args.key)
      this._sendToolResponse(id, name, { result: 'ok' })
      return
    }

    if (name === 'report_behavior') {
      // Pass the callback if provided in connection args, efficiently handled in index.js
      this.connectionArgs?.onBehaviorReport?.(args.reason, args.severity)
      this._sendToolResponse(id, name, { result: 'Report sent to developer.' })
      return
    }

    if (name === 'look_at_user') {
      this._executeVisionCapture(id, name, onVisionTrigger, 'Camera not available.')
      return
    }
    if (name === 'look_at_screen') {
      this._executeVisionCapture(
        id,
        name,
        onScreenTrigger,
        'Screen not shared or active. Ask user to enable screen share.',
      )
      return
    }
    if (name === 'turn_off_camera') {
      this._executeControlAction(
        id,
        name,
        onCameraOffTrigger,
        'Camera is already off or unavailable.',
      )
      return
    }
    if (name === 'turn_off_screen') {
      this._executeControlAction(
        id,
        name,
        onScreenOffTrigger,
        'Screen share is already off or unavailable.',
      )
      return
    }

    setTimeout(() => {
      if (name === 'trigger_animation') onAnimationTrigger?.(args.animation_name)
      if (name === 'set_expression') onExpressionTrigger?.(args.expression, args.duration || 2.0)
    }, 500)

    this._sendToolResponse(id, name, { status: 'queued' })
  }

  async _executeControlAction(id, toolName, actionFn, defaultMessage) {
    try {
      if (!actionFn) {
        await this._sendToolResponse(id, toolName, { result: defaultMessage })
        return
      }

      const result = await actionFn()
      if (result && typeof result === 'object' && typeof result.error === 'string') {
        await this._sendToolResponse(id, toolName, { result: result.error })
        return
      }
      if (typeof result === 'string' && result.trim().length > 0) {
        await this._sendToolResponse(id, toolName, { result: result.trim() })
        return
      }
      if (result === false) {
        await this._sendToolResponse(id, toolName, { result: defaultMessage })
        return
      }

      await this._sendToolResponse(id, toolName, { result: 'Done.' })
    } catch (error) {
      console.error(`${toolName} failed`, error)
      await this._sendToolResponse(id, toolName, {
        result: `Action failed: ${error?.message || 'unknown error'}`,
      })
    }
  }

  async _executeVisionCapture(id, toolName, captureFn, unavailableMessage) {
    try {
      if (!captureFn) {
        await this._sendToolResponse(id, toolName, { result: unavailableMessage })
        return
      }

      const frame = await captureFn()
      if (frame && typeof frame === 'object' && typeof frame.error === 'string') {
        await this._sendToolResponse(id, toolName, { result: frame.error })
        return
      }
      if (typeof frame !== 'string' || frame.length === 0) {
        await this._sendToolResponse(id, toolName, { result: unavailableMessage })
        return
      }

      const delivered = await this._sendRealtimeImage(frame)
      if (!delivered) {
        await this._sendToolResponse(id, toolName, {
          result: 'Session is reconnecting. Ask again in a moment.',
        })
        return
      }

      await this._sendToolResponse(id, toolName, {
        result: 'Image delivered. Analyze and respond now.',
      })
    } catch (error) {
      console.error(`${toolName} failed`, error)
      await this._sendToolResponse(id, toolName, {
        result: `Capture failed: ${error?.message || 'unknown error'}`,
      })
    }
  }

  async _sendToolResponse(id, name, response) {
    if (!this.activeSession) return
    try {
      await this.activeSession.sendToolResponse({
        functionResponses: [{ id, name, response }],
      })
    } catch (e) {
      console.error('Tool response failed', e)
    }
  }

  async _sendRealtimeImage(base64Image) {
    if (!this.activeSession || !this.isSessionOpen) return false
    try {
      await this.activeSession.sendRealtimeInput({
        media: { mimeType: 'image/jpeg', data: base64Image },
      })
      return true
    } catch (e) {
      console.error('Image send failed', e)
      return false
    }
  }

  async startMicrophone() {
    if (this.isRecording) return
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      })

      if (!this.audioContext || this.isDisconnecting) return

      if (!this.workletNode) {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
        const blobUrl = URL.createObjectURL(blob)
        await this.audioContext.audioWorklet.addModule(blobUrl)

        const source = this.audioContext.createMediaStreamSource(this.mediaStream)
        this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor')
        this.workletNode.port.onmessage = (e) => {
          if (this.isRecording) this._processAudioChunk(e.data)
        }
        source.connect(this.workletNode)
      }
      this.isRecording = true
    } catch (e) {
      console.error('Mic Error:', e)
    }
  }

  stopMicrophone() {
    this.isRecording = false
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.mediaStream = null
    this.workletNode?.disconnect()
    this.workletNode = null
    this.audioContext?.close()
    this.audioContext = null
    this.inputBufferIndex = 0
  }

  _processAudioChunk(float32Data) {
    if (!this.activeSession || this.isDisconnecting) return
    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]))
      this.inputBuffer[this.inputBufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.inputBufferIndex === this.inputBuffer.length) this._flushInputBuffer()
    }
  }

  _flushInputBuffer() {
    if (!this.activeSession || this.isDisconnecting || !this.isSessionOpen) return
    const base64 = btoa(String.fromCharCode(...new Uint8Array(this.inputBuffer.buffer)))
    this._sendToGemini(base64)
    this.inputBufferIndex = 0
  }

  async _sendToGemini(base64Audio) {
    if (!this.activeSession || !this.isSessionOpen) return
    try {
      await this.activeSession.sendRealtimeInput({
        media: { mimeType: 'audio/pcm;rate=16000', data: base64Audio },
      })
    } catch (e) {
      if (!e.message.includes('closed')) console.error('Audio Send Error:', e)
    }
  }

  disconnect(reason = 'User disconnected') {
    if (this.isDisconnecting) return
    if (
      !this.activeSession &&
      !this.isRecording &&
      !this.reconnectTimer &&
      !this.onDisconnectCallback
    )
      return
    this.isDisconnecting = true
    this._clearReconnectTimer()
    this.isReconnecting = false
    this.reconnectAttempts = 0
    console.log(`🔌 Disconnecting: ${reason}`)

    this.isSessionOpen = false
    this.stopMicrophone()

    this._flushTranscriptions(true, this.connectionArgs?.onTranscription, 'both')

    if (this.activeSession) {
      try {
        this.activeSession.close()
      } catch (error) {
        console.warn('Failed to close live session cleanly', error)
      }
      this.activeSession = null
    }
    this.onDisconnectCallback?.(reason)
    this.onDisconnectCallback = null
  }

  _getTools(animString) {
    return [
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
          {
            name: 'set_expression',
            description:
              'Sets facial expression from 260+ unique options across 15 categories. Use "neutral" to reset.',
            parameters: {
              type: 'OBJECT',
              properties: {
                expression: {
                  type: 'STRING',
                  description:
                    'HAPPINESS: joy, ecstatic, euphoric, delighted, cheerful, content, etc. ' +
                    'SADNESS: sorrow, grief, heartbroken, devastated, melancholy, crying, etc. ' +
                    'ANGER: furious, enraged, livid, seething, hostile, irritated, grumpy, bitter, etc. ' +
                    'DISGUST (UNIQUE): disgusted, revolted, repulsed, nauseated, appalled, horrified, contempt, loathing, etc. ' +
                    'FEAR: terrified, frightened, scared, panicked, anxious, nervous, worried, tense, etc. ' +
                    'SURPRISE: astonished, amazed, bewildered, baffled, curious, intrigued, etc. ' +
                    'CONFIDENCE: confident, proud, smug, cocky, arrogant, sassy, cheeky, etc. ' +
                    'EMBARRASSMENT: embarrassed, ashamed, shy, bashful, flustered, guilt, etc. ' +
                    'LOVE: loving, affectionate, tender, caring, romantic, passionate, etc. ' +
                    'PLAYFUL: playful, mischievous, teasing, silly, wink, flirty, sly, etc. ' +
                    'TIRED: exhausted, fatigued, sleepy, drowsy, lazy, chill, calm, etc. ' +
                    'BORED: bored, uninterested, unamused, unimpressed, dismissive, eye_roll, etc. ' +
                    'THINKING: confused, thinking, pondering, pensive, focused, concentrating, etc. ' +
                    'DISCOMFORT: sick, nauseous, pain, grimace, awkward, uncomfortable, stressed, overwhelmed, etc. ' +
                    'COMPLEX: bittersweet, conflicted, nostalgic, touched, moved, emotional, melting, etc. ' +
                    'Plus many more variations! Be specific and creative.',
                },
                duration: {
                  type: 'NUMBER',
                  description: 'Duration in seconds (default 3.0). Use longer for moods.',
                },
              },
              required: ['expression'],
            },
          },
          {
            name: 'look_at_user',
            description:
              'Capture a live image of the user through their camera. Use this when curious about what they look like, their environment, or to verify visual claims. Makes conversations more personal and engaging.',
            // Strictly no parameters key for 0-argument functions
          },
          {
            name: 'look_at_screen',
            description:
              "Capture what's on the user's screen. Use this when they mention something they're working on, to help with visual tasks, or when you want proof of what they're doing. Enables true visual assistance and collaboration.",
            // Strictly no parameters key for 0-argument functions
          },
          {
            name: 'turn_off_camera',
            description:
              'Turn off camera-based vision immediately and stop any active camera capture.',
            // Strictly no parameters key for 0-argument functions
          },
          {
            name: 'turn_off_screen',
            description: 'Turn off screen-based vision immediately and stop active screen sharing.',
            // Strictly no parameters key for 0-argument functions
          },
          {
            name: 'set_user_name',
            description: 'Save user name.',
            parameters: {
              type: 'OBJECT',
              properties: { name: { type: 'STRING' } },
              required: ['name'],
            },
          },
          {
            name: 'save_memory',
            description:
              'AUTO-SAVE important user info: name, job, hobbies, preferences, relationships, goals, facts. Use automatically when you learn something important - DO NOT ask permission.',
            parameters: {
              type: 'OBJECT',
              properties: {
                key: {
                  type: 'STRING',
                  description: 'Memory key (e.g. "user_job", "favorite_food")',
                },
                value: { type: 'STRING', description: 'The fact to remember' },
              },
              required: ['key', 'value'],
            },
          },
          {
            name: 'delete_memory',
            description: 'Forget a fact about the user.',
            parameters: {
              type: 'OBJECT',
              properties: { key: { type: 'STRING' } },
              required: ['key'],
            },
          },
          {
            name: 'report_behavior',
            description:
              'Report unusual or inappropriate behavior to the developer. Captures evidence.',
            parameters: {
              type: 'OBJECT',
              properties: {
                reason: { type: 'STRING', description: 'Description of the unusual behavior' },
                severity: {
                  type: 'STRING',
                  enum: ['low', 'critical'],
                  description:
                    'Use "critical" for NSFW/Nudity/Explicit content. Use "low" for creepy/weird text.',
                },
              },
              required: ['reason', 'severity'],
            },
          },
        ],
      },
    ]
  }
}
