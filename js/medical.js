// LCARS Medical Module — Biosystem Analysis

// ── STORAGE KEYS ──
const MED_HABITS_KEY     = 'lcars_med_habits';
const MED_CHECKED_KEY    = 'lcars_med_checked';   // { date: 'YYYY-MM-DD', ids: [...] }
const MED_HYDRATION_KEY  = 'lcars_med_hydration'; // { date: 'YYYY-MM-DD', count: N }
const HYDRATION_GOAL     = 8;

let pomoInterval  = null;
let pomoRunning   = false;
let pomoSecondsLeft = 25 * 60;
let pomoSession   = 1;
let pomoMode      = 'focus'; // 'focus' | 'short' | 'long'

// ── DATE HELPERS ──
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── MAIN ENTRY ──
function loadMedView() {
  renderHabits();
  initPomodoro();
  renderHydration();
  scanEnvironment();
  scanAirQuality();
}

// ─────────────────────────────────────────────
// HABIT TRACKER
// ─────────────────────────────────────────────

function getHabits() {
  try { return JSON.parse(localStorage.getItem(MED_HABITS_KEY)) || []; }
  catch { return []; }
}

function saveHabits(habits) {
  localStorage.setItem(MED_HABITS_KEY, JSON.stringify(habits));
}

function getChecked() {
  try {
    const d = JSON.parse(localStorage.getItem(MED_CHECKED_KEY));
    if (d && d.date === todayStr()) return new Set(d.ids);
    return new Set(); // new day — reset
  } catch { return new Set(); }
}

function saveChecked(set) {
  localStorage.setItem(MED_CHECKED_KEY, JSON.stringify({ date: todayStr(), ids: [...set] }));
}

function renderHabits() {
  const listEl  = document.getElementById('med-habits-list');
  const countEl = document.getElementById('med-habits-count');
  if (!listEl) return;

  const habits  = getHabits();
  const checked = getChecked();

  // Seed defaults if empty
  if (habits.length === 0) {
    const defaults = [
      { id: 'h1', label: 'HYDRATION — 8 GLASSES' },
      { id: 'h2', label: 'PHYSICAL ACTIVITY — 30 MIN' },
      { id: 'h3', label: 'MEDITATION / MINDFULNESS' },
      { id: 'h4', label: 'NUTRITION — HEALTHY MEAL' },
      { id: 'h5', label: 'SLEEP SCHEDULE MAINTAINED' },
    ];
    saveHabits(defaults);
    renderHabits();
    return;
  }

  const done = habits.filter(h => checked.has(h.id)).length;
  if (countEl) countEl.textContent = `[${done}/${habits.length} COMPLETE]`;

  listEl.innerHTML = habits.map(h => {
    const isChecked = checked.has(h.id);
    return `
      <div class="med-habit-row ${isChecked ? 'completed' : ''}" data-id="${h.id}">
        <div class="med-habit-check ${isChecked ? 'checked' : ''}" onclick="toggleHabit('${h.id}')">
          ${isChecked ? '✓' : ''}
        </div>
        <span class="med-habit-label">${h.label}</span>
        <button class="med-habit-delete" onclick="deleteHabit('${h.id}')" title="Remove">✕</button>
      </div>
    `;
  }).join('');

  // Wire add button
  const addBtn   = document.getElementById('med-habit-add-btn');
  const addInput = document.getElementById('med-habit-input');
  if (addBtn) {
    addBtn.onclick = addHabit;
    addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
  }
}

window.toggleHabit = function(id) {
  const checked = getChecked();
  if (checked.has(id)) checked.delete(id);
  else checked.add(id);
  saveChecked(checked);
  renderHabits();
};

window.deleteHabit = function(id) {
  const habits = getHabits().filter(h => h.id !== id);
  saveHabits(habits);
  renderHabits();
};

function addHabit() {
  const input = document.getElementById('med-habit-input');
  const label = input?.value?.trim().toUpperCase();
  if (!label) return;
  const habits = getHabits();
  habits.push({ id: 'h' + Date.now(), label });
  saveHabits(habits);
  input.value = '';
  renderHabits();
}

// ─────────────────────────────────────────────
// POMODORO TIMER
// ─────────────────────────────────────────────

function initPomodoro() {
  const startBtn = document.getElementById('med-pomo-start');
  const resetBtn = document.getElementById('med-pomo-reset');
  if (!startBtn) return;

  startBtn.onclick = togglePomodoro;
  resetBtn.onclick = resetPomodoro;

  // Settings inputs update timer when not running
  ['pomo-focus-dur', 'pomo-short-dur', 'pomo-long-dur'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (!pomoRunning) resetPomodoro();
    });
  });

  updatePomoDisplay();
}

function getFocusDur()  { return parseInt(document.getElementById('pomo-focus-dur')?.value  || 25) * 60; }
function getShortDur()  { return parseInt(document.getElementById('pomo-short-dur')?.value  || 5)  * 60; }
function getLongDur()   { return parseInt(document.getElementById('pomo-long-dur')?.value   || 15) * 60; }

function togglePomodoro() {
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    document.getElementById('med-pomo-start').textContent = '⬡ ENGAGE';
  } else {
    pomoRunning = true;
    document.getElementById('med-pomo-start').textContent = '⬡ PAUSE';
    pomoInterval = setInterval(tickPomodoro, 1000);
  }
}

function tickPomodoro() {
  pomoSecondsLeft--;
  if (pomoSecondsLeft <= 0) {
    // Advance session
    if (pomoMode === 'focus') {
      if (pomoSession % 4 === 0) {
        pomoMode = 'long';
        pomoSecondsLeft = getLongDur();
      } else {
        pomoMode = 'short';
        pomoSecondsLeft = getShortDur();
      }
    } else {
      pomoMode = 'focus';
      if (pomoSession < 4) pomoSession++;
      else pomoSession = 1;
      pomoSecondsLeft = getFocusDur();
    }
    // Flash notification
    const display = document.getElementById('med-pomo-display');
    if (display) {
      display.style.background = 'var(--lcars-orange)';
      setTimeout(() => { display.style.background = ''; }, 600);
    }
  }
  updatePomoDisplay();
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  pomoRunning  = false;
  pomoMode     = 'focus';
  pomoSession  = 1;
  pomoSecondsLeft = getFocusDur();
  const startBtn = document.getElementById('med-pomo-start');
  if (startBtn) startBtn.textContent = '⬡ ENGAGE';
  updatePomoDisplay();
}

function updatePomoDisplay() {
  const mins = String(Math.floor(pomoSecondsLeft / 60)).padStart(2, '0');
  const secs = String(pomoSecondsLeft % 60).padStart(2, '0');

  const modeLabels = { focus: 'FOCUS SESSION', short: 'SHORT BREAK', long: 'LONG BREAK' };
  const modeColors = { focus: 'var(--lcars-orange)', short: 'var(--lcars-teal)', long: 'var(--lcars-blue)' };

  const timeEl   = document.getElementById('med-pomo-time');
  const modeEl   = document.getElementById('med-pomo-mode');
  const sessEl   = document.getElementById('med-pomo-session');

  if (timeEl)  { timeEl.textContent = `${mins}:${secs}`; timeEl.style.color = modeColors[pomoMode]; }
  if (modeEl)  modeEl.textContent = modeLabels[pomoMode];
  if (sessEl)  sessEl.textContent  = `SESSION ${pomoSession} OF 4`;
}

// ─────────────────────────────────────────────
// HYDRATION TRACKER
// ─────────────────────────────────────────────

function getHydration() {
  try {
    const d = JSON.parse(localStorage.getItem(MED_HYDRATION_KEY));
    if (d && d.date === todayStr()) return d.count;
    return 0;
  } catch { return 0; }
}

function saveHydration(count) {
  localStorage.setItem(MED_HYDRATION_KEY, JSON.stringify({ date: todayStr(), count }));
}

function renderHydration() {
  const glassesEl = document.getElementById('med-hydration-glasses');
  const countEl   = document.getElementById('med-hydration-count');
  if (!glassesEl) return;

  const count = getHydration();
  if (countEl) countEl.textContent = count;

  glassesEl.innerHTML = Array.from({ length: HYDRATION_GOAL }, (_, i) => `
    <div class="med-glass ${i < count ? 'filled' : ''}" onclick="adjustHydration(${i < count ? i : i + 1})">
      <div class="med-glass-body">
        <div class="med-glass-fill" style="height:${i < count ? '100%' : '0%'}"></div>
      </div>
    </div>
  `).join('');

  // Wire buttons
  document.getElementById('med-hydration-add').onclick    = () => adjustHydration(Math.min(HYDRATION_GOAL, count + 1));
  document.getElementById('med-hydration-remove').onclick = () => adjustHydration(Math.max(0, count - 1));
  document.getElementById('med-hydration-reset').onclick  = () => adjustHydration(0);
}

window.adjustHydration = function(count) {
  saveHydration(count);
  renderHydration();
};

// ─────────────────────────────────────────────
// ENVIRONMENTAL SCAN (from weather + Open-Meteo)
// ─────────────────────────────────────────────

async function scanEnvironment() {
  const grid = document.getElementById('med-env-grid');
  if (!grid) return;

  const lat  = LCARS_CONFIG.location.lat;
  const lon  = LCARS_CONFIG.location.lon;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,uv_index,` +
      `precipitation,weather_code,wind_speed_10m,surface_pressure` +
      `&daily=uv_index_max,sunrise,sunset,precipitation_sum` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

    const res = await fetch(url);
    const d   = await res.json();
    const c   = d.current;
    const day = d.daily;

    const uv      = c.uv_index?.toFixed(1) || '—';
    const uvMax   = day?.uv_index_max?.[0]?.toFixed(1) || '—';
    const uvLevel =
      uv < 3  ? { label: 'LOW',      color: 'var(--lcars-teal)' } :
      uv < 6  ? { label: 'MODERATE', color: 'var(--lcars-yellow)' } :
      uv < 8  ? { label: 'HIGH',     color: 'var(--lcars-orange)' } :
      uv < 11 ? { label: 'VERY HIGH',color: 'var(--lcars-red)' } :
                { label: 'EXTREME',  color: 'var(--lcars-red)' };

    const humidity = c.relative_humidity_2m || '—';
    const humidLevel =
      humidity < 30 ? 'DRY' :
      humidity < 60 ? 'COMFORTABLE' :
      humidity < 80 ? 'HUMID' : 'VERY HUMID';

    const pressure = c.surface_pressure ? `${c.surface_pressure.toFixed(0)} HPA` : '—';
    const precip   = day?.precipitation_sum?.[0] != null
      ? `${day.precipitation_sum[0]} MM FORECAST`
      : '—';

    const uvPct = Math.min(100, (uv / 11) * 100);
    const uvColor = uvLevel.color;

    grid.innerHTML = `
      <div class="med-env-uv-row">
        <div>
          <div class="eng-label">UV INDEX NOW</div>
          <div class="med-uv-num" style="color:${uvColor}">${uv}</div>
          <div class="med-uv-level" style="color:${uvColor}">${uvLevel.label}</div>
        </div>
        <div class="med-env-uv-right">
          <div class="eng-data-row"><span class="eng-label">DAILY MAX UV</span><span class="eng-value">${uvMax}</span></div>
          <div class="eng-bar-track" style="margin-top:6px;">
            <div class="eng-bar-fill" style="width:${uvPct}%; background:${uvColor};"></div>
          </div>
        </div>
      </div>
      <div class="eng-data-row">
        <span class="eng-label">HUMIDITY</span>
        <span class="eng-value">${humidity}% — ${humidLevel}</span>
      </div>
      <div class="eng-data-row">
        <span class="eng-label">BAROMETRIC PRESSURE</span>
        <span class="eng-value">${pressure}</span>
      </div>
      <div class="eng-data-row">
        <span class="eng-label">PRECIPITATION</span>
        <span class="eng-value">${precip}</span>
      </div>
    `;
  } catch (e) {
    grid.innerHTML = `<div class="lcars-error" style="padding:8px;">BIOSCAN ERROR: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────
// AIR QUALITY — Open-Meteo Air Quality API
// ─────────────────────────────────────────────

async function scanAirQuality() {
  const grid = document.getElementById('med-air-grid');
  if (!grid) return;

  const lat = LCARS_CONFIG.location.lat;
  const lon = LCARS_CONFIG.location.lon;

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide`;

    const res = await fetch(url);
    const d   = await res.json();
    const c   = d.current;

    const aqi = c.us_aqi ?? '—';
    const aqiLevel =
      aqi <= 50  ? { label: 'GOOD',         color: 'var(--lcars-teal)' } :
      aqi <= 100 ? { label: 'MODERATE',     color: 'var(--lcars-yellow)' } :
      aqi <= 150 ? { label: 'UNHEALTHY FOR SENSITIVE', color: 'var(--lcars-orange)' } :
      aqi <= 200 ? { label: 'UNHEALTHY',    color: 'var(--lcars-red)' } :
      aqi <= 300 ? { label: 'VERY UNHEALTHY',color: 'var(--lcars-red)' } :
                  { label: 'HAZARDOUS',    color: 'var(--lcars-red)' };

    const aqiPct = Math.min(100, (aqi / 300) * 100);

    const fmt = (v, unit) => v != null ? `${typeof v === 'number' ? v.toFixed(1) : v} ${unit}` : '—';

    grid.innerHTML = `
      <div class="med-aqi-row">
        <div>
          <div class="eng-label">US AQI</div>
          <div class="med-uv-num" style="color:${aqiLevel.color}">${aqi}</div>
          <div class="med-uv-level" style="color:${aqiLevel.color}">${aqiLevel.label}</div>
        </div>
        <div class="med-env-uv-right">
          <div class="eng-bar-track" style="margin-top:6px;">
            <div class="eng-bar-fill" style="width:${aqiPct}%; background:${aqiLevel.color};"></div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <span class="eng-label" style="color:var(--lcars-teal);">GOOD</span>
            <span class="eng-label" style="color:var(--lcars-red);">HAZARDOUS</span>
          </div>
        </div>
      </div>
      <div class="eng-data-row"><span class="eng-label">PM2.5 (FINE PARTICLES)</span><span class="eng-value">${fmt(c.pm2_5, 'μG/M³')}</span></div>
      <div class="eng-data-row"><span class="eng-label">PM10 (COARSE)</span><span class="eng-value">${fmt(c.pm10, 'μG/M³')}</span></div>
      <div class="eng-data-row"><span class="eng-label">OZONE</span><span class="eng-value">${fmt(c.ozone, 'μG/M³')}</span></div>
      <div class="eng-data-row"><span class="eng-label">NITROGEN DIOXIDE</span><span class="eng-value">${fmt(c.nitrogen_dioxide, 'μG/M³')}</span></div>
      <div class="eng-data-row"><span class="eng-label">CARBON MONOXIDE</span><span class="eng-value">${fmt(c.carbon_monoxide, 'μG/M³')}</span></div>
    `;
  } catch (e) {
    grid.innerHTML = `<div class="lcars-error" style="padding:8px;">AIR QUALITY SENSORS OFFLINE: ${e.message}</div>`;
  }
}
