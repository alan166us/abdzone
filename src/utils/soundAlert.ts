// Web Audio API Synthesizer for Institutional Alert Notifications
// Generates clean, crisp audio chimes without external mp3 files

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays an institutional double-chime alert when an option or future enters an actionable zone.
 */
export function playOpportunityAlertSound(volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    gainNode.connect(ctx.destination);

    // Note 1: High crisp chime (880 Hz - A5)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.connect(gainNode);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Note 2: Harmonic resolution (1318.5 Hz - E6)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.5, now + 0.12);
    osc2.connect(gainNode);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Audio alert not supported or user has not interacted with page yet:', e);
  }
}
