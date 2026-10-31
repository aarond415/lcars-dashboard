// LCARS Meteorology — NWS alerts, 7-day forecast, next 24 hours, tropical outlook.
// Forecast from Open-Meteo (free, no key); alerts come from alerts.js.

const NHC_OUTLOOK_IMG  = 'https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png';
const NHC_OUTLOOK_PAGE = 'https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=7';

async function loadMetView() {
  renderMetAlerts();
  loadTropicalOutlook();
  try {
    const f = await fetchForecast();
    renderForecastDays(f.daily);
    renderNext24(f.hourly);
  } catch (e) {
    const msg = `<div class="lcars-error">FORECAST UNAVAILABLE: ${launchEscape(e.message)}</div>`;
    document.getElementById('met-days').innerHTML = msg;
    document.getElementById('met-hours').innerHTML = '';
  }
}

async function fetchForecast() {
  const { lat, lon } = LCARS_CONFIG.location;
  const url = 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset' +
    '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OPEN-METEO ${res.status}`);
  return res.json();
}

function renderMetAlerts() {
  const el = document.getElementById('met-alerts');
  if (!el) return;
  const city = LCARS_CONFIG.location.city.toUpperCase();
  const header = document.getElementById('met-alerts-header');
  if (header) header.textContent = `NATIONAL WEATHER SERVICE — ACTIVE ALERTS FOR ${city}`;

  if (!lcarsAlerts.length) {
    el.innerHTML = `<div class="met-condition-green">CONDITION GREEN — NO ACTIVE WATCHES, WARNINGS OR ADVISORIES</div>`;
    return;
  }
  el.innerHTML = lcarsAlerts.map(a => `
    <details class="met-alert met-alert-${a.level}">
      <summary>
        <span class="met-alert-event">${launchEscape(a.event.toUpperCase())}</span>
        <span class="met-alert-expires">UNTIL ${launchEscape(new Date(a.expires).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase())}</span>
      </summary>
      <div class="met-alert-headline">${launchEscape(a.headline)}</div>
      <div class="met-alert-text">${launchEscape(a.description)}</div>
      ${a.instruction ? `<div class="met-alert-text met-alert-instruction">${launchEscape(a.instruction)}</div>` : ''}
    </details>`).join('');
}

function renderForecastDays(daily) {
  const el = document.getElementById('met-days');
  if (!el) return;
  el.innerHTML = daily.time.map((day, i) => {
    const date = new Date(`${day}T12:00:00`);
    const name = i === 0 ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const code = daily.weather_code[i];
    const rain = daily.precipitation_probability_max[i];
    return `
      <div class="met-day">
        <div class="met-day-name">${name}</div>
        <div class="met-day-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</div>
        <div class="met-day-icon">${WMO_ICONS[code] || '—'}</div>
        <div class="met-day-cond">${WMO_CODES[code] || ''}</div>
        <div class="met-day-temps"><span class="met-hi">${Math.round(daily.temperature_2m_max[i])}°</span> <span class="met-lo">${Math.round(daily.temperature_2m_min[i])}°</span></div>
        <div class="met-day-row"><span>RAIN</span><span class="${rain >= 60 ? 'met-wet' : ''}">${rain ?? '—'}%</span></div>
        <div class="met-day-row"><span>WIND</span><span>${Math.round(daily.wind_speed_10m_max[i])} MPH</span></div>
        <div class="met-day-row"><span>UV</span><span>${daily.uv_index_max[i]?.toFixed(0) ?? '—'}</span></div>
      </div>`;
  }).join('');
}

function renderNext24(hourly) {
  const el = document.getElementById('met-hours');
  if (!el) return;
  const now = Date.now();
  const start = hourly.time.findIndex(t => new Date(t).getTime() >= now - 3600e3);
  const cells = [];
  for (let i = Math.max(0, start); i < hourly.time.length && cells.length < 12; i += 2) {
    const t = new Date(hourly.time[i]);
    const rain = hourly.precipitation_probability[i] ?? 0;
    cells.push(`
      <div class="met-hour">
        <div class="met-hour-time">${t.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '')}</div>
        <div class="met-hour-icon">${WMO_ICONS[hourly.weather_code[i]] || '—'}</div>
        <div class="met-hour-temp">${Math.round(hourly.temperature_2m[i])}°</div>
        <div class="met-hour-rain ${rain >= 60 ? 'met-wet' : ''}">${rain}% RAIN</div>
        <div class="met-hour-wind">${Math.round(hourly.wind_speed_10m[i])} MPH</div>
      </div>`);
  }
  el.innerHTML = cells.join('');
}

function loadTropicalOutlook() {
  const el = document.getElementById('met-tropics');
  if (!el) return;
  // Cache-bust hourly; NHC updates the outlook every 6 hours
  const stamp = Math.floor(Date.now() / 3600e3);
  const month = new Date().getMonth(); // hurricane season: Jun 1 – Nov 30
  const inSeason = month >= 5 && month <= 10;
  el.innerHTML = `
    <a href="${NHC_OUTLOOK_PAGE}" target="_blank" class="met-tropics-link">
      <img src="${NHC_OUTLOOK_IMG}?t=${stamp}" alt="NHC 7-day Atlantic tropical weather outlook" class="met-tropics-img"
           onerror="this.closest('a').outerHTML='<div class=&quot;lcars-error&quot;>OUTLOOK IMAGE UNAVAILABLE</div>'"/>
    </a>
    <div class="met-tropics-note">
      ${inSeason ? 'ATLANTIC HURRICANE SEASON IS ACTIVE (JUN 1 – NOV 30).' : 'OUTSIDE ATLANTIC HURRICANE SEASON (JUN 1 – NOV 30).'}
      X MARKS SHOW AREAS NHC IS WATCHING FOR DEVELOPMENT. CLICK THE MAP FOR DETAILS.
    </div>`;
}
