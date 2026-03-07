/**
 * vite-plugin-key-obfuscate.js
 *
 * Reads VITE_API_KEY from the environment, splits it into 4 chunks,
 * base64-encodes each chunk (then reverses the string to make grep harder),
 * and injects them as VITE_AK_A / VITE_AK_B / VITE_AK_C / VITE_AK_D.
 *
 * The original VITE_API_KEY is then removed from the env so it never
 * appears as a plain string in the built bundle.
 *
 * Reversal: atob(chunk.split('').reverse().join('')) reassembles in the client.
 */
export function keyObfuscatePlugin() {
  return {
    name: 'vite-plugin-key-obfuscate',
    // Called before Vite processes env vars — lets us replace VITE_API_KEY
    config(config, { mode }) {
      // We handle injection via `define` after split — nothing to do here yet
    },
    // Called after env is fully loaded — inject our split vars into define
    configResolved(resolvedConfig) {
      const raw = resolvedConfig.env?.VITE_API_KEY ?? ''
      if (!raw) return
      const key = raw
      const len = key.length
      // Split into 4 roughly equal chunks
      const q = Math.ceil(len / 4)
      const parts = [
        key.slice(0, q),
        key.slice(q, q * 2),
        key.slice(q * 2, q * 3),
        key.slice(q * 3),
      ]
      // Encode each chunk: btoa(chunk) then reverse the string
      const encode = (s) =>
        Buffer.from(s)
          .toString('base64')
          .split('')
          .reverse()
          .join('')
      const [a, b, c, d] = parts.map(encode)
      // Inject the 4 env vars that the client will use
      resolvedConfig.env.VITE_AK_A = a
      resolvedConfig.env.VITE_AK_B = b
      resolvedConfig.env.VITE_AK_C = c
      resolvedConfig.env.VITE_AK_D = d
      // Remove the plain-text key so it isn't inlined into the bundle
      delete resolvedConfig.env.VITE_API_KEY
    },
  }
}
