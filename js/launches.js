// LCARS Launch Operations — upcoming rocket launches (Launch Library 2, free, no key)
// Launches from pads within LAUNCH_VISIBLE_KM of your location are flagged as
// visible (for Wellington, FL that means Cape Canaveral / Kennedy).

const LAUNCH_API        = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=30&hide_recent_previous=true';
const LAUNCH_CACHE_KEY  = 'lcars_launches';
const LAUNCH_CACHE_MS   = 15 * 60 * 1000;   // free tier allows 15 requests/hour
const LAUNCH_VISIBLE_KM = 320;

let launchData     = [];
let launchSelected = null;   // launch id shown in the detail card
let launchFilter   = 'all';  // 'all' | 'local'
let launchTicker   = null;
const launchNotified = new Set();

function launchEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Great-circle distance in km
function launchDistanceKm(lat1, lon1, lat2, lon2) {
  const rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function launchCountdown(net, now = Date.now()) {
  let s = Math.round((new Date(net) - now) / 1000);
  const sign = s < 0 ? 'T+' : 'T−';
  s = Math.abs(s);
  const d = Math.floor(s / 86400);
  const h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return d > 0 ? `${sign}${d}D ${pad(h)}:${pad(m)}:${pad(sec)}` : `${sign}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function launchLocalTime(net) {
  return new Date(net).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).toUpperCase();
}

// ── DATA ──

async function fetchLaunches(force = false) {
  try {
    const cached = JSON.parse(localStorage.getItem(LAUNCH_CACHE_KEY));
    if (!force && cached && Date.now() - cached.at < LAUNCH_CACHE_MS) return cached.results;
  } catch {}

  const res = await fetch(LAUNCH_API);
  if (res.status === 429) throw new Error('LAUNCH LIBRARY RATE LIMIT — RETRYING LATER');
  if (!res.ok) throw new Error(`LAUNCH LIBRARY ${res.status}`);
  const data = await res.json();

  const { lat, lon } = LCARS_CONFIG.location;
  const results = (data.results || []).map(r => {
    const padLat = parseFloat(r.pad?.latitude);
    const padLon = parseFloat(r.pad?.longitude);
    const distanceKm = isFinite(padLat) && isFinite(padLon) ? launchDistanceKm(lat, lon, padLat, padLon) : null;
    return {
      id: r.id,
      name: r.name,
      rocket: r.rocket?.configuration?.full_name || r.name.split('|')[0].trim(),
      mission: r.mission?.name || r.name.split('|')[1]?.trim() || 'UNDISCLOSED',
      description: r.mission?.description || '',
      orbit: r.mission?.orbit?.name || '',
      provider: r.launch_service_provider?.name || '',
      net: r.net,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      status: r.status?.abbrev || '',
      statusName: r.status?.name || '',
      pad: r.pad?.name || '',
      location: r.pad?.location?.name || '',
      image: r.image || '',
      distanceKm,
      local: distanceKm !== null && distanceKm <= LAUNCH_VISIBLE_KM,
    };
  });

  try { localStorage.setItem(LAUNCH_CACHE_KEY, JSON.stringify({ at: Date.now(), results })); } catch {}
  return results;
}

function isNightLaunch(net) {
  const h = new Date(net).getHours();
  return h >= 19 || h < 6;
}

// ── VIEW ──

async function loadOpsView() {
  const list = document.getElementById('ops-launch-list');
  if (!list) return;

  document.querySelectorAll('.ops-filter-btn').forEach(btn => {
    btn.onclick = () => {
      launchFilter = btn.dataset.filter;
      document.querySelectorAll('.ops-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderLaunchList();
    };
  });

  try {
    launchData = await fetchLaunches();
    if (!launchSelected || !launchData.some(l => l.id === launchSelected)) {
      launchSelected = (launchData.find(l => l.local) || launchData[0])?.id || null;
    }
    renderLaunchList();
    renderLaunchDetail();
  } catch (e) {
    list.innerHTML = `<div class="lcars-error">LAUNCH DATA UNAVAILABLE: ${launchEscape(e.message)}</div>`;
  }

  clearInterval(launchTicker);
  launchTicker = setInterval(tickLaunches, 1000);
}

function renderLaunchList() {
  const list = document.getElementById('ops-launch-list');
  const count = document.getElementById('ops-launch-count');
  if (!list) return;

  const city = LCARS_CONFIG.location.city.toUpperCase();
  const shown = launchData.filter(l => launchFilter === 'all' || l.local);
  if (count) count.textContent = `[${shown.length}]`;
  const localLabel = document.querySelector('.ops-filter-btn[data-filter="local"]');
  if (localLabel) localLabel.textContent = `VISIBLE FROM ${city}`;

  if (!shown.length) {
    list.innerHTML = `<div class="lcars-empty" style="padding:16px;">NO UPCOMING LAUNCHES IN RANGE</div>`;
    return;
  }

  list.innerHTML = shown.map(l => `
    <div class="ops-launch-row ${l.id === launchSelected ? 'selected' : ''} ${l.local ? 'local' : ''}" data-id="${l.id}">
      <div class="ops-launch-when">
        <div class="ops-launch-date">${launchEscape(launchLocalTime(l.net))}</div>
        <div class="ops-launch-tminus" data-net="${l.net}">${launchCountdown(l.net)}</div>
      </div>
      <div class="ops-launch-what">
        <div class="ops-launch-name">${launchEscape(l.rocket)} <span class="ops-launch-sep">|</span> ${launchEscape(l.mission)}</div>
        <div class="ops-launch-where">${launchEscape(l.provider)} — ${launchEscape(l.location)}</div>
      </div>
      <div class="ops-launch-tags">
        ${l.local ? `<span class="lcars-tag ops-tag-local">VISIBLE</span>` : ''}
        <span class="lcars-tag ops-status ops-status-${launchEscape(l.status.toLowerCase())}">${launchEscape(l.status)}</span>
      </div>
    </div>`).join('');

  list.querySelectorAll('.ops-launch-row').forEach(row => {
    row.onclick = () => {
      launchSelected = row.dataset.id;
      list.querySelectorAll('.ops-launch-row').forEach(r => r.classList.toggle('selected', r === row));
      renderLaunchDetail();
    };
  });
}

function renderLaunchDetail() {
  const el = document.getElementById('ops-launch-detail');
  const l = launchData.find(x => x.id === launchSelected);
  if (!el || !l) return;

  const city = LCARS_CONFIG.location.city.toUpperCase();
  const viewing = l.local
    ? `<div class="ops-visibility ${isNightLaunch(l.net) ? 'night' : ''}">
         ${isNightLaunch(l.net) ? '★ NIGHT LAUNCH — EXCELLENT VIEWING' : '◆ DAYTIME LAUNCH — LOOK FOR THE EXHAUST TRAIL'}
         FROM ${city} · ${Math.round(l.distanceKm)} KM TO THE PAD · LOOK NORTH
       </div>`
    : `<div class="ops-visibility far">NOT VISIBLE FROM ${city} · ${l.distanceKm ? Math.round(l.distanceKm).toLocaleString() + ' KM AWAY' : 'LOCATION UNKNOWN'}</div>`;

  el.innerHTML = `
    ${l.image ? `<div class="ops-detail-image" style="background-image:url('${launchEscape(l.image)}')"></div>` : ''}
    <div class="ops-detail-body">
      <div class="ops-detail-countdown" data-net="${l.net}">${launchCountdown(l.net)}</div>
      <div class="ops-detail-name">${launchEscape(l.mission)}</div>
      <div class="ops-detail-rocket">${launchEscape(l.rocket)} — ${launchEscape(l.provider)}</div>
      ${viewing}
      <div class="ops-detail-grid">
        ${opsRow('LAUNCH TIME (NET)', launchLocalTime(l.net))}
        ${opsRow('STATUS', l.statusName)}
        ${opsRow('PAD', l.pad)}
        ${opsRow('LOCATION', l.location)}
        ${l.orbit ? opsRow('TARGET ORBIT', l.orbit) : ''}
        ${l.windowStart && l.windowEnd && l.windowStart !== l.windowEnd
          ? opsRow('WINDOW', `${launchLocalTime(l.windowStart)} – ${new Date(l.windowEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
          : ''}
      </div>
      ${l.description ? `<div class="ops-detail-desc">${launchEscape(l.description)}</div>` : ''}
    </div>`;
}

function opsRow(label, value) {
  return `<div class="eng-data-row"><span class="eng-label">${label}</span><span class="eng-value">${launchEscape(value)}</span></div>`;
}

function tickLaunches() {
  const now = Date.now();
  if (document.getElementById('view-ops')?.classList.contains('active')) {
    document.querySelectorAll('#view-ops [data-net]').forEach(el => {
      el.textContent = launchCountdown(el.dataset.net, now);
    });
  }
  // Heads-up 10 minutes before a visible launch (while the dashboard is open)
  launchData.filter(l => l.local && !launchNotified.has(l.id)).forEach(l => {
    const mins = (new Date(l.net) - now) / 60000;
    if (mins > 0 && mins <= 10) {
      launchNotified.add(l.id);
      LcarsNative.notify('LAUNCH IN 10 MINUTES', `${l.rocket} | ${l.mission} — look north from ${LCARS_CONFIG.location.city}`);
      LcarsSound.play('chime');
    }
  });
}

// Background: keep launch data fresh for notifications and the SYS summary
async function launchBackgroundRefresh() {
  try {
    launchData = await fetchLaunches();
    renderNextLaunchSummary();
    if (!launchTicker) launchTicker = setInterval(tickLaunches, 1000);
  } catch {}
}

// One-line "next visible launch" on the SYS status panel
function renderNextLaunchSummary() {
  const el = document.getElementById('launch-status');
  if (!el) return;
  const next = launchData.find(l => l.local && new Date(l.net) > Date.now());
  el.textContent = next ? launchLocalTime(next.net).replace(/^\w+, /, '') : 'NONE SCHEDULED';
}

launchBackgroundRefresh();
setInterval(launchBackgroundRefresh, LAUNCH_CACHE_MS);
