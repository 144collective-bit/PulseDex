import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global Audio Mute & Sound Suppression Lock
try {
  // Disable HTML Audio element
  if (typeof window !== 'undefined') {
    window.Audio = class SilentAudio {
      constructor() {
        this.muted = true
        this.volume = 0
      }
      play() {
        return Promise.resolve()
      }
      pause() {}
      addEventListener() {}
      removeEventListener() {}
    }

    // Disable Web Audio Context (beeps / alerts)
    if (window.AudioContext || window.webkitAudioContext) {
      const SilentContext = class {
        constructor() {
          this.state = 'suspended'
          this.destination = {}
        }
        createOscillator() {
          return {
            connect() {},
            start() {},
            stop() {},
            frequency: { setValueAtTime() {} },
          }
        }
        createGain() {
          return {
            connect() {},
            gain: { setValueAtTime() {}, value: 0 },
          }
        }
        createBufferSource() {
          return {
            connect() {},
            start() {},
            stop() {},
          }
        }
        resume() {
          return Promise.resolve()
        }
        suspend() {
          return Promise.resolve()
        }
        close() {
          return Promise.resolve()
        }
      }
      window.AudioContext = SilentContext
      window.webkitAudioContext = SilentContext
    }

    // Mute any Media Element playback
    if (window.HTMLMediaElement && window.HTMLMediaElement.prototype) {
      window.HTMLMediaElement.prototype.play = function () {
        this.muted = true
        return Promise.resolve()
      }
    }
  }
} catch (e) {
  console.warn('Audio mute lock initialized:', e)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
