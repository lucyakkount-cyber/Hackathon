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
  reconnectFirstDelayMs = 120
  reconnectBaseDelayMs = 300
  reconnectMaxDelayMs = 2200
  reconnectTimer = null
  reconnectHistorySuggestionSent = false
  connectionArgs = null
  recognition = null
  onDisconnectCallback = null
  onUserSpeechStateChange = null
  isUserSpeaking = false
  userSpeechReleaseTimer = null
  userSpeechReleaseMs = 700

  // Transcription state
  currentInputTranscription = ''
  currentOutputTranscription = ''

  // Internal history to preserve context on reconnects
  internalHistory = []
  maxInternalHistoryItems = 180

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
    onUserSpeechStateChange,
  ) {
    if (this.activeSession) return

    console.log(`🔌 Connecting to Gemini Live... (Mic: ${enableMic})`)
    this.isDisconnecting = false
    this.isReconnecting = false
    this.reconnectAttempts = 0
    this.reconnectHistorySuggestionSent = false
    this._clearReconnectTimer()
    this.internalHistory = []
    this.currentInputTranscription = ''
    this.currentOutputTranscription = ''
    this.onDisconnectCallback = onDisconnect || null
    this.onUserSpeechStateChange =
      typeof onUserSpeechStateChange === 'function' ? onUserSpeechStateChange : null
    this._resetVoiceActivityState()
    this._setUserSpeakingState(false, true)

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
        onUserSpeechStateChange,
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
    const isReconnectSession = this.isReconnecting

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
      onUserSpeechStateChange,
    } = this.connectionArgs

    this.onUserSpeechStateChange =
      typeof onUserSpeechStateChange === 'function' ? onUserSpeechStateChange : null

    // REFACTOR: Decoupled history from System Prompt for AI Studio alignment.
    // We no longer append history to fullSystemPrompt here.
    // Instead, we will inject it as a "User Context" message immediately after connection.

    // Combine passed history with any internal history accumulated during this session wrapper
    const safePastHistory = Array.isArray(pastHistory) ? pastHistory : []
    const combinedHistory = [...safePastHistory, ...this.internalHistory]

    const fullSystemPrompt = baseSystemPrompt

    // If user explicitly sent text, always deliver it.
    // Otherwise recover a pending user query only during reconnect
    // and only when the latest meaningful message is from the user.
    const explicitPendingQuestion =
      typeof initialMessage === 'string' ? String(initialMessage).trim() : ''
    let pendingUserQuestion = explicitPendingQuestion
    let shouldAnswerPendingQuestion = explicitPendingQuestion.length > 0

    if (isReconnectSession && !pendingUserQuestion) {
      const lastMsg = this._getLastMeaningfulHistoryMessage(combinedHistory)
      if (lastMsg?.role === 'user') {
        pendingUserQuestion = lastMsg.text
        shouldAnswerPendingQuestion = pendingUserQuestion.length > 0
        if (shouldAnswerPendingQuestion) {
          console.log(
            'Reconnect recovery: answering last pending user message:',
            pendingUserQuestion,
          )
        }
      }
    }

    const animString =
      this.connectionArgs.availableAnimations.length > 0
        ? this.connectionArgs.availableAnimations.join(', ')
        : 'wave, clap, dance, backflip'

    const tools = this._getTools(animString)

    const config = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      // Restored transcription settings (empty object uses default model)
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: tools,
      systemInstruction: fullSystemPrompt,
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

            // 2️⃣ Restore Context Immediately
            this._restoreContext(combinedHistory, pendingUserQuestion, {
              shouldAnswerPendingQuestion,
            })

            if (enableMic) {
              this.startMicrophone()
            } else {
              this.stopMicrophone()
            }
          },
          onmessage: (msg) => {
            // 1. Handle Transcriptions
            if (msg.serverContent?.outputTranscription) {
              this._setUserSpeakingState(false)
              this._clearUserSpeechReleaseTimer()

              // AI is speaking - finalize and clear user input
              if (this.currentInputTranscription.trim().length > 0) {
                this._flushTranscriptions(true, onTranscription, 'user', {
                  clearUserBuffer: true,
                })
              }

              const text = msg.serverContent.outputTranscription.text
              this.currentOutputTranscription += text
              onTranscription?.('model', this.currentOutputTranscription, false)
            } else if (msg.serverContent?.inputTranscription) {
              // User is speaking - accumulate
              const text = msg.serverContent.inputTranscription.text
              if (this._isMeaningfulSpeechText(text)) {
                this._setUserSpeakingState(true)
                this._armUserSpeechReleaseTimer()
              }
              this.currentInputTranscription += text
              onTranscription?.('user', this.currentInputTranscription, false)
            }

            if (msg.serverContent?.turnComplete) {
              this._setUserSpeakingState(false)
              this._clearUserSpeechReleaseTimer()

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
            this._setUserSpeakingState(false, true)
            this._resetVoiceActivityState()

            // IMPORTANT: Flush any partial transcriptions to history BEFORE attempting reconnect.
            // This ensures if the user was speaking, their words are captured in history
            // so the next session knows to answer them.
            this._flushTranscriptions(true, onTranscription, 'both', {
              clearUserBuffer: true,
            })

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
  }

  async _restoreContext(history, pendingQuestion, options = {}) {
    if (!this.activeSession) return
    const { shouldAnswerPendingQuestion = false } = options

    // 1. Format history into a compact "Context Message"
    // We send this as a user message but tell the AI it's just context
    const validHistory = history.filter((m) => m?.text && m.text.trim().length > 0)
    const normalizedPendingQuestion =
      typeof pendingQuestion === 'string' ? pendingQuestion.trim() : ''
    const shouldRecoverQuestion = shouldAnswerPendingQuestion && normalizedPendingQuestion.length > 0

    if (validHistory.length === 0 && !shouldRecoverQuestion) return

    let contextHistory = validHistory
    if (shouldRecoverQuestion && validHistory.length > 0) {
      const lastMsg = validHistory[validHistory.length - 1]
      if (
        lastMsg?.role === 'user' &&
        String(lastMsg.text || '').trim().toLowerCase() === normalizedPendingQuestion.toLowerCase()
      ) {
        contextHistory = validHistory.slice(0, -1)
      }
    }

    const historyText = contextHistory.length
      ? contextHistory
          .slice(-16)
          .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
          .join('\n')
      : ''

    let contextPayload = `[SYSTEM] Context Restoration:`
    if (historyText) {
      contextPayload += `\n\n${historyText}`
    }

    if (shouldRecoverQuestion) {
      contextPayload +=
        `\n\n[SYSTEM] RECONNECT RULE: The user already asked this before disconnect.` +
        `\nUNANSWERED USER QUERY: "${normalizedPendingQuestion}"` +
        `\nRespond immediately. Do not greet. Do not ask them to repeat.`
      console.log('Restoring context with PENDING QUESTION:', normalizedPendingQuestion)
    } else {
      contextPayload += `\n\n[SYSTEM] End of context. Acknowledge with a silent "OK" or short confirmation.`
      console.log('🔄 Restoring context (Background)')
    }

    // Send as text. The model will process this as the first user turn.
    // If there is a pending question, the model will answer it naturally.
    this.sendText(contextPayload, true)
  }

  // Updated sendText to handle context restoration flag
  // forceSend: if true, sends directly to active session without restarting
  async sendText(text, forceSend = false) {
    if (forceSend && this.activeSession) {
      try {
        console.log('📤 Sending direct text to active session:', text.substring(0, 50) + '...')
        await this.activeSession.send(text)
        return
      } catch (e) {
        console.error('Failed to send direct text, falling back to restart:', e)
      }
    }
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
        this.connectionArgs.onBehaviorReport,
        this.connectionArgs.onUserSpeechStateChange,
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

  _getLastMeaningfulHistoryMessage(history = []) {
    if (!Array.isArray(history)) return null
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i]
      const text = typeof item?.text === 'string' ? item.text.trim() : ''
      if (!text) continue
      const role = item?.role === 'user' ? 'user' : 'model'
      return { role, text }
    }
    return null
  }

  _pushInternalHistory(role, text) {
    const normalizedRole = role === 'user' ? 'user' : 'model'
    const normalizedText = typeof text === 'string' ? text.trim() : ''
    if (!normalizedText) return

    const hasRecentDuplicate = this.internalHistory
      .slice(-6)
      .some((item) => item?.role === normalizedRole && item?.text === normalizedText)
    if (hasRecentDuplicate) return

    this.internalHistory.push({
      role: normalizedRole,
      text: normalizedText,
      timestamp: Date.now(),
    })

    if (this.internalHistory.length > this.maxInternalHistoryItems) {
      this.internalHistory = this.internalHistory.slice(-this.maxInternalHistoryItems)
    }
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
    const exponentialDelay = this.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 2)
    const baseDelay = attempt === 1 ? this.reconnectFirstDelayMs : exponentialDelay
    const jitterMs = Math.floor(Math.random() * 120)
    const delayMs = Math.min(this.reconnectMaxDelayMs, baseDelay + jitterMs)
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

  _flushTranscriptions(isFinal, onTranscription, target = 'both', options = {}) {
    const { clearUserBuffer = false } = options

    if ((target === 'user' || target === 'both') && this.currentInputTranscription.trim()) {
      const text = this.currentInputTranscription
      onTranscription?.('user', text, isFinal)
      if (isFinal) {
        this._pushInternalHistory('user', text)
        if (clearUserBuffer) {
          this.currentInputTranscription = ''
        }
      }
    }

    if ((target === 'model' || target === 'both') && this.currentOutputTranscription.trim()) {
      const text = this.currentOutputTranscription
      onTranscription?.('model', text, isFinal)
      if (isFinal) {
        this._pushInternalHistory('model', text)
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
      if (name === 'set_expression') onExpressionTrigger?.(args.expression, args.duration || 5.0)
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
      this._resetVoiceActivityState()
      this._setUserSpeakingState(false, true)

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
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
    this._setUserSpeakingState(false, true)
    this._resetVoiceActivityState()
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

  _isMeaningfulSpeechText(text) {
    if (typeof text !== 'string') return false
    const cleaned = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[[^\]]*]/g, ' ')
      .replace(/\b(noise|silence|music|laughter|laugh|breath|breathing|applause)\b/gi, ' ')
      .trim()

    if (!cleaned) return false
    return /[A-Za-z]{2,}|[0-9]{2,}/.test(cleaned)
  }

  _armUserSpeechReleaseTimer() {
    this._clearUserSpeechReleaseTimer()
    this.userSpeechReleaseTimer = setTimeout(() => {
      this.userSpeechReleaseTimer = null
      this._setUserSpeakingState(false)
    }, this.userSpeechReleaseMs)
  }

  _clearUserSpeechReleaseTimer() {
    if (!this.userSpeechReleaseTimer) return
    clearTimeout(this.userSpeechReleaseTimer)
    this.userSpeechReleaseTimer = null
  }

  _setUserSpeakingState(isSpeaking, force = false) {
    const next = Boolean(isSpeaking)
    if (!force && this.isUserSpeaking === next) return
    this.isUserSpeaking = next
    if (!next) this._clearUserSpeechReleaseTimer()

    if (typeof this.onUserSpeechStateChange === 'function') {
      try {
        this.onUserSpeechStateChange(next)
      } catch (error) {
        console.error('User speech state callback failed:', error)
      }
    }
  }

  _resetVoiceActivityState() {
    this._clearUserSpeechReleaseTimer()
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

    this._flushTranscriptions(true, this.connectionArgs?.onTranscription, 'both', {
      clearUserBuffer: true,
    })

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
                  description: 'Duration in seconds (default 5.0). Use 5s-10s for lingering moods.',
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
            description: 'Persist a fact about the user.',
            parameters: {
              type: 'OBJECT',
              properties: {
                key: { type: 'STRING' },
                value: { type: 'STRING' },
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

