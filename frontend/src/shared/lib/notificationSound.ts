/**
 * The notification chime.
 *
 * Synthesised with the Web Audio API rather than shipping an audio file: no
 * asset to license, nothing extra to download, and the pitch/volume are part
 * of the code. Browsers block audio until the user has interacted with the
 * page, so `unlock()` is called from the first click/keypress and the chime
 * simply stays silent if it is never unlocked.
 */

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/**
 * Browsers create the context in `suspended` state. Resuming needs a user
 * gesture, so this is wired to the first pointer/key event in the provider.
 */
export function unlockNotificationSound(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

/**
 * Two short notes, the second a fourth above the first. A rising interval
 * reads as "something arrived" rather than the flat beep of an error.
 */
export function playNotificationChime(volume = 0.18): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const notes: Array<{ freq: number; start: number; duration: number }> = [
    { freq: 880, start: 0, duration: 0.11 }, // A5
    { freq: 1174.66, start: 0.12, duration: 0.16 }, // D6
  ];

  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = note.freq;

    // Short attack, exponential decay — a sine with a hard on/off clicks.
    const attack = now + note.start;
    const release = attack + note.duration;
    gain.gain.setValueAtTime(0.0001, attack);
    gain.gain.exponentialRampToValueAtTime(1, attack + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, release);

    osc.connect(gain);
    gain.connect(master);
    osc.start(attack);
    osc.stop(release + 0.02);
  }

  // Release the graph so repeated chimes do not accumulate nodes.
  window.setTimeout(() => master.disconnect(), 800);
}
