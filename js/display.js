// LCARS Display Mode — for a spare monitor or wall screen.
// Full screen, hides the cursor when idle, keeps the display awake (app), and
// rotates through the main tabs. Toggle with D, or View → Display Mode in the app.
// Clicking a tab pauses the rotation for 5 minutes.

const DISPLAY_ROTATION = ['dashboard', 'nav', 'met', 'ops', 'ast', 'sci'];
const DISPLAY_ROTATE_MS = 60 * 1000;
const DISPLAY_PAUSE_MS  = 5 * 60 * 1000;

let displayOn = false;
let displayRotateTimer = null;
let displayPausedUntil = 0;
let displayCursorTimer = null;

function setDisplayMode(on) {
  if (on === displayOn) return;
  displayOn = on;
  document.body.classList.toggle('display-mode', on);
  LcarsNative.displayMode(on);

  if (!LcarsNative.isApp()) {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  clearInterval(displayRotateTimer);
  if (on) displayRotateTimer = setInterval(rotateDisplay, DISPLAY_ROTATE_MS);

  const status = document.getElementById('bottom-system-status');
  if (status) status.textContent = on ? 'DISPLAY MODE ACTIVE — PRESS D TO EXIT' : 'ALL SYSTEMS NOMINAL';
  showCursor();
}

function rotateDisplay() {
  if (Date.now() < displayPausedUntil) return;
  const current = document.querySelector('.sidebar-block.sb-active')?.dataset.view;
  const next = DISPLAY_ROTATION[(DISPLAY_ROTATION.indexOf(current) + 1) % DISPLAY_ROTATION.length];
  document.querySelector(`.sidebar-block[data-view="${next}"]`)?.dispatchEvent(new CustomEvent('click', { detail: { auto: true } }));
}

function showCursor() {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(displayCursorTimer);
  if (displayOn) displayCursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 3000);
}

window.lcarsToggleDisplayMode = () => setDisplayMode(!displayOn);

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', e => {
    if (e.key !== 'd' && e.key !== 'D') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    setDisplayMode(!displayOn);
  });
  document.addEventListener('mousemove', showCursor);
  // Leaving browser full screen (Esc) ends display mode
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && displayOn && !LcarsNative.isApp()) setDisplayMode(false);
  });
  // A manual tab click pauses the rotation (automatic clicks carry detail.auto)
  document.querySelectorAll('.sidebar-block').forEach(b => b.addEventListener('click', e => {
    if (displayOn && !e.detail?.auto) displayPausedUntil = Date.now() + DISPLAY_PAUSE_MS;
  }));
});
