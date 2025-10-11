// tts.js
import axios from 'axios'

export function useTTS(charConfig) {
  async function sovitsGen(text, config) {
    try {
      const ttsUrl = '  https://mall-bless-not-disturbed.trycloudflare.com/'
      const payload = {
        text,
        ref_audio_path: config.sovits_ping_config?.ref_audio_path,
        text_lang: config.sovits_ping_config?.text_lang || 'en',
        prompt_text: config.sovits_ping_config?.prompt_text || '',
        prompt_lang: config.sovits_ping_config?.prompt_lang || 'en',
        media_type: 'wav',
        streaming_mode: false,
      }
      const resp = await axios.post(ttsUrl, payload, {
        responseType: 'arraybuffer',
        headers: { 'Content-Type': 'application/json' },
      })
      const blob = new Blob([resp.data], { type: 'audio/wav' })
      const duration = await playBlob(blob) // Assuming playBlob is available from audio.js, but since it's modular, you may need to import or pass it
      syncMouthToVoice(audioRef.value) // Similarly, assume shared or passed
      return duration
    } catch (err) {
      console.error('SoVITS TTS error:', err)
      return 0
    }
  }

  return { sovitsGen }
}
