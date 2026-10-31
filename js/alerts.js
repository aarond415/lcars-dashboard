// LCARS Alert Condition — National Weather Service alerts for your location.
// Runs on every tab: warnings for hurricanes, tropical storms, tornadoes etc.
// (or any Severe/Extreme alert) put the whole interface on RED ALERT; other
// watches and advisories show a YELLOW ALERT banner.
// Test from the console with lcarsTestAlert('red' | 'yellow' | 'clear').

const ALERT_POLL_MS   = 5 * 60 * 1000;
const ALERT_SEEN_KEY  = 'lcars_alerts_seen';
const RED_ALERT_EVENTS = /hurricane warning|tropical storm warning|tornado warning|storm surge warning|extreme wind warning|flash flood emergency|tsunami warning/i;

let lcarsAlerts = [];          // [{ id, event, severity, headline, description, instruction, expires, areaDesc, level }]
let lcarsAlertLevel = 'green'; // 'green' | 'yellow' | 'red'
let lcarsAlertTest = null;

function alertLevelFor(p) {
  if (RED_ALERT_EVENTS.test(p.event) || p.severity === 'Extreme' || p.severity === 'Severe') return 'red';
  return 'yellow';
}

async function pollWeatherAlerts() {
  if (lcarsAlertTest) return;
  try {
    const { lat, lon } = LCARS_CONFIG.location;
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { Accept: 'application/geo+json' },
    });
    if (!res.ok) throw new Error(`NWS ${res.status}`);
    const data = await res.json();
    lcarsAlerts = (data.features || []).map(f => {
      const p = f.properties;
      return {
        id: p.id || f.id,
        event: p.event,
        severity: p.severity,
        headline: p.headline || p.event,
        description: p.description || '',
        instruction: p.instruction || '',
        expires: p.ends || p.expires,
        areaDesc: p.areaDesc || '',
        level: alertLevelFor(p),
      };
    });
    applyAlertCondition();
  } catch (e) {
    console.warn('[LCARS Alerts]', e.message);
    const el = document.getElementById('alert-status');
    if (el) { el.textContent = 'NO SIGNAL'; el.className = 'lcars-value status-warn'; }
  }
}

function applyAlertCondition() {
  const level = lcarsAlerts.some(a => a.level === 'red') ? 'red'
              : lcarsAlerts.length ? 'yellow' : 'green';
  const changed = level !== lcarsAlertLevel;
  lcarsAlertLevel = level;

  document.body.classList.toggle('alert-red', level === 'red');
  document.body.classList.toggle('alert-yellow', level === 'yellow');

  // Banner across the top of the content area
  const banner = document.getElementById('alert-banner');
  if (banner) {
    const top = lcarsAlerts.find(a => a.level === 'red') || lcarsAlerts[0];
    banner.hidden = level === 'green';
    if (top) {
      banner.className = `alert-banner alert-banner-${level}`;
      banner.innerHTML = `
        <span class="alert-banner-label">${level === 'red' ? 'RED ALERT' : 'YELLOW ALERT'}</span>
        <span class="alert-banner-text">${launchEscape(top.event.toUpperCase())}
          ${lcarsAlerts.length > 1 ? ` + ${lcarsAlerts.length - 1} MORE` : ''}</span>
        <span class="alert-banner-more">DETAILS ▸</span>`;
    }
  }

  // SYS status row
  const status = document.getElementById('alert-status');
  if (status) {
    status.textContent = level === 'green' ? 'CONDITION GREEN' : `${lcarsAlerts.length} ACTIVE`;
    status.className = `lcars-value status-${level === 'green' ? 'ok' : level === 'red' ? 'err' : 'warn'}`;
    const dot = status.closest('.status-row')?.querySelector('.status-indicator');
    if (dot) dot.className = `status-indicator status-${level === 'green' ? 'green' : level === 'red' ? 'red' : 'yellow'}`;
  }

  // Sound + notification for alerts we haven't seen before
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(ALERT_SEEN_KEY)) || []; } catch {}
  const fresh = lcarsAlerts.filter(a => !seen.includes(a.id));
  if (fresh.length) {
    const worst = fresh.some(a => a.level === 'red') ? 'red' : 'yellow';
    LcarsSound.play(worst);
    fresh.forEach(a => LcarsNative.notify(`${a.level === 'red' ? 'RED' : 'YELLOW'} ALERT — ${a.event}`, a.headline));
    if (!lcarsAlertTest) {
      try { localStorage.setItem(ALERT_SEEN_KEY, JSON.stringify(lcarsAlerts.map(a => a.id))); } catch {}
    }
  } else if (changed && level === 'red') {
    LcarsSound.play('red');
  }

  if (typeof renderMetAlerts === 'function') renderMetAlerts();
}

// Console helper for previewing the alert states
window.lcarsTestAlert = function(level = 'red') {
  if (level === 'clear') {
    lcarsAlertTest = null;
    lcarsAlerts = [];
    applyAlertCondition();
    pollWeatherAlerts();
    return;
  }
  lcarsAlertTest = level;
  lcarsAlerts = [{
    id: `test-${Date.now()}`,
    event: level === 'red' ? 'Hurricane Warning' : 'Tropical Storm Watch',
    severity: level === 'red' ? 'Extreme' : 'Moderate',
    headline: `TEST — ${level === 'red' ? 'Hurricane Warning' : 'Tropical Storm Watch'} for ${LCARS_CONFIG.location.city}`,
    description: 'This is a simulated alert for testing the dashboard. Run lcarsTestAlert("clear") to return to normal.',
    instruction: '',
    expires: new Date(Date.now() + 6 * 3600e3).toISOString(),
    areaDesc: LCARS_CONFIG.location.city,
    level,
  }];
  applyAlertCondition();
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('alert-banner')?.addEventListener('click', () => {
    document.querySelector('.sidebar-block[data-view="met"]')?.click();
  });
  pollWeatherAlerts();
  setInterval(pollWeatherAlerts, ALERT_POLL_MS);
});
