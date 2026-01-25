// managers/utils.js
export class Utils {
  static delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
  static createErrorHandler(context) {
    return (error) => { console.error(`Error in ${context}:`, error); return { message: error.message }; }
  }
}

export async function processMessageOptimized(
  message,
  aiClient,
  audioManager,
  animationManager,
  vrm,
  config,
  audioElement
) {
  try {
    if (!message) return;

    // 1. SEND TO LIVE API (Persistent)
    // The first time, this takes ~1s to connect.
    // Every time after, it is INSTANT (ms).
    const audioBlob = await aiClient.chatWithNativeAudio(
        message,
        config.getSystemPrompt()
    );

    if (!audioBlob) throw new Error("No audio returned");

    // 2. SETUP ANIMATION
    if (audioManager.setSpeechCallbacks) {
        audioManager.setSpeechCallbacks(
            () => { if (animationManager?.setSpeakingState) animationManager.setSpeakingState(true); },
            () => { if (animationManager?.setSpeakingState) animationManager.setSpeakingState(false); }
        );
    }

    // 3. PLAY
    console.log("🔊 Playing Audio Response...");
    audioManager.detectMouthExpressions(vrm);
    await audioManager.playAudioBlob(audioBlob, audioElement, vrm);

    return "Played";

  } catch (error) {
    console.error("❌ Process Error:", error);
    if (animationManager?.setSpeakingState) animationManager.setSpeakingState(false);
    throw error;
  }
}
