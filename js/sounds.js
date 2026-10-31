// LCARS Sounds — panel chirps and alert tones, synthesized with Web Audio
// (no audio files). Toggle with the AUDIO pill in the bottom bar.

const LCARS_SOUND_KEY = 'lcars_sound_on';

const LcarsSound = (() => {
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem(LCARS_SOUND_KEY) !== 'off'; } catch {}

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One enveloped tone; freqEnd sweeps the pitch.
  function tone(freq, start, dur, { type = 'sine', gain = 0.08, freqEnd = freq } = {}) {
    const a = audio();
    const osc = a.createOscillator();
    const amp = a.createGain();
    const t = a.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const sounds = {
    // Short two-note panel chirp
    click()  { tone(1320, 0, 0.05, { gain: 0.05 }); tone(1760, 0.045, 0.06, { gain: 0.04 }); },
    // Navigation between tabs
    nav()    { tone(880, 0, 0.06, { gain: 0.05 }); tone(1175, 0.06, 0.07, { gain: 0.05 }); tone(1568, 0.12, 0.09, { gain: 0.04 }); },
    // Gentle three-note chime (timer done, notifications)
    chime()  { [784, 988, 1319].forEach((f, i) => tone(f, i * 0.16, 0.5, { gain: 0.06, type: 'triangle' })); },
    // Yellow alert: two falling tones
    yellow() { tone(988, 0, 0.35, { gain: 0.07, type: 'triangle' }); tone(740, 0.4, 0.45, { gain: 0.07, type: 'triangle' }); },
    // Red alert klaxon: three rising whoops
    red()    { for (let i = 0; i < 3; i++) tone(420, i * 0.75, 0.6, { gain: 0.07, type: 'sawtooth', freqEnd: 920 }); },
  };

  function updateToggle() {
    const el = document.getElementById('sound-toggle');
    if (!el) return;
    el.textContent = enabled ? 'AUDIO ON' : 'AUDIO OFF';
    el.classList.toggle('off', !enabled);
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateToggle();
    document.getElementById('sound-toggle')?.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem(LCARS_SOUND_KEY, enabled ? 'on' : 'off'); } catch {}
      updateToggle();
      if (enabled) sounds.click();
    });

    // Chirp on buttons and sidebar blocks (sidebar plays the nav sound)
    document.addEventListener('click', e => {
      if (!enabled || e.detail?.auto || e.target.closest('#sound-toggle')) return;
      if (e.target.closest('.sidebar-block')) sounds.nav();
      else if (e.target.closest('.lcars-button, button')) sounds.click();
    }, true);
  });

  return {
    play(name) {
      if (!enabled || !sounds[name]) return;
      try { sounds[name](); } catch {}
    },
    get enabled() { return enabled; },
  };
})();
