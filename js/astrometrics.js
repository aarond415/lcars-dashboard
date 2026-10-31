// LCARS Astrometrics — what's in the sky tonight, and when the ISS flies over.
// Planet positions: Astronomy Engine (js/vendor/astronomy.browser.min.js, MIT).
// ISS passes: satellite.js SGP4 (js/vendor/satellite.min.js, MIT) with the
// current orbital elements (TLE) from CelesTrak.

const AST_TLE_URL      = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const AST_TLE_KEY      = 'lcars_iss_tle';
const AST_TLE_MAX_AGE  = 12 * 3600e3;
const AST_PASS_DAYS    = 5;
const AST_MIN_ELEV     = 10;      // degrees above the horizon
const EARTH_RADIUS_KM  = 6371;

const AST_PLANETS = [
  { body: 'Mercury', color: '#B5B5B5' },
  { body: 'Venus',   color: '#FFF4C2' },
  { body: 'Mars',    color: '#FF7755' },
  { body: 'Jupiter', color: '#FFCC99' },
  { body: 'Saturn',  color: '#E8D28A' },
  { body: 'Moon',    color: '#FFEEAA' },
];

let astPasses = [];
const astNotified = new Set();

function astObserver() {
  const { lat, lon } = LCARS_CONFIG.location;
  return new Astronomy.Observer(lat, lon, 0);
}

function astCompass(az) {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
}

function astTime(date) {
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
}

function astDay(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400e3);
  return diff === 0 ? 'TONIGHT' : diff === 1 ? 'TOMORROW' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

// Time, with the weekday when it isn't today
function astRiseSet(date) {
  if (!date) return '—';
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? astTime(date) : `${date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} ${astTime(date)}`;
}

function astHorizon(body, date, obs) {
  const eq = Astronomy.Equator(body, date, obs, true, true);
  return Astronomy.Horizon(date, obs, eq.ra, eq.dec, 'normal');
}

// Reference time for "tonight": now if it's already dark, else 30 min after dusk
function astTonight(obs) {
  const now = new Date();
  if (astHorizon('Sun', now, obs).altitude < -6) return now;
  const dusk = Astronomy.SearchAltitude('Sun', obs, -1, now, 1, -6);
  return dusk ? new Date(dusk.date.getTime() + 30 * 60e3) : now;
}

// ── VIEW ──

function loadAstView() {
  if (typeof Astronomy === 'undefined') {
    document.getElementById('ast-sky-table').innerHTML = `<div class="lcars-error">ASTRONOMY LIBRARY NOT LOADED</div>`;
    return;
  }
  renderSkyTonight();
  computeIssPasses().then(renderIssPasses).catch(e => {
    document.getElementById('ast-iss-list').innerHTML = `<div class="lcars-error">ISS ORBIT DATA UNAVAILABLE: ${launchEscape(e.message)}</div>`;
  });
}

function renderSkyTonight() {
  const obs = astObserver();
  const ref = astTonight(obs);
  const dayStart = new Date(ref); dayStart.setHours(12, 0, 0, 0);
  if (ref < dayStart) dayStart.setDate(dayStart.getDate() - 1);

  const sunset = Astronomy.SearchRiseSet('Sun', obs, -1, dayStart, 1)?.date;
  const dark   = Astronomy.SearchAltitude('Sun', obs, -1, dayStart, 1, -18)?.date;
  const dawn   = Astronomy.SearchAltitude('Sun', obs, +1, sunset || dayStart, 1, -6)?.date;

  document.getElementById('ast-sky-header').textContent =
    `SKY TONIGHT — ${LCARS_CONFIG.location.city.toUpperCase()} — POSITIONS AT ${astTime(ref).toUpperCase()}`;
  document.getElementById('ast-twilight').innerHTML = `
    <div class="ast-tw"><span class="eng-label">SUNSET</span><span class="ast-tw-val">${astTime(sunset)}</span></div>
    <div class="ast-tw"><span class="eng-label">FULL DARK</span><span class="ast-tw-val">${astTime(dark)}</span></div>
    <div class="ast-tw"><span class="eng-label">DAWN</span><span class="ast-tw-val">${astTime(dawn)}</span></div>`;

  const rows = AST_PLANETS.map(p => {
    const hor  = astHorizon(p.body, ref, obs);
    const mag  = Astronomy.Illumination(p.body, ref).mag;
    // One rise→set arc around tonight: the rise up to 12 h before the
    // reference time (or the next one), and the set that follows it
    const rise = Astronomy.SearchRiseSet(p.body, obs, +1, new Date(ref - 12 * 3600e3), 2)?.date;
    const set  = rise ? Astronomy.SearchRiseSet(p.body, obs, -1, rise, 2)?.date : null;
    return { ...p, alt: hor.altitude, az: hor.azimuth, mag, rise, set, visible: hor.altitude > AST_MIN_ELEV };
  });

  drawSkyDome(rows);

  document.getElementById('ast-sky-table').innerHTML = `
    <div class="ast-planet-row ast-planet-head">
      <span>OBJECT</span><span>STATUS</span><span>DIRECTION</span><span>ALT</span><span>MAG</span><span>RISES</span><span>SETS</span>
    </div>
    ${rows.map(r => `
      <div class="ast-planet-row ${r.visible ? 'visible' : ''}">
        <span class="ast-planet-name"><i style="background:${r.color}"></i>${r.body.toUpperCase()}</span>
        <span class="${r.visible ? 'ast-up' : 'ast-down'}">${r.visible ? 'VISIBLE' : r.alt > 0 ? 'LOW' : 'BELOW HORIZON'}</span>
        <span>${r.alt > 0 ? astCompass(r.az) : '—'}</span>
        <span>${r.alt > 0 ? Math.round(r.alt) + '°' : '—'}</span>
        <span>${r.mag.toFixed(1)}</span>
        <span>${astRiseSet(r.rise)}</span>
        <span>${astRiseSet(r.set)}</span>
      </div>`).join('')}
    <div class="ast-sky-note">LOWER MAGNITUDE = BRIGHTER · VENUS AND JUPITER ARE THE BRIGHTEST "STARS" WHEN UP</div>`;
}

// Polar sky map: zenith in the centre, horizon at the edge, north up, east left
function drawSkyDome(rows) {
  const canvas = document.getElementById('ast-sky-canvas');
  if (!canvas) return;
  const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
  if (!size) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const c = size / 2, R = size / 2 - 18;
  const toXY = (alt, az) => {
    const r = R * (90 - alt) / 90;
    const a = az * Math.PI / 180;
    return [c - r * Math.sin(a), c - r * Math.cos(a)];
  };

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#04070d';
  ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.fill();

  ctx.strokeStyle = '#1f3a4f';
  ctx.lineWidth = 1;
  [30, 60].forEach(alt => { ctx.beginPath(); ctx.arc(c, c, R * (90 - alt) / 90, 0, 2 * Math.PI); ctx.stroke(); });
  ctx.strokeStyle = '#4A8FB0';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(c, c, R, 0, 2 * Math.PI); ctx.stroke();

  ctx.fillStyle = '#FF9900';
  ctx.font = '600 12px Antonio, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, az]) => {
    const [x, y] = toXY(-9, az);
    ctx.fillText(l, x, y);
  });

  rows.filter(r => r.alt > 0).forEach(r => {
    const [x, y] = toXY(r.alt, r.az);
    const radius = Math.max(3, Math.min(8, 6 - r.mag));
    ctx.fillStyle = r.color;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ccc';
    ctx.font = '500 11px Antonio, sans-serif';
    ctx.fillText(r.body.toUpperCase(), x, y - radius - 9);
  });
}

// ── ISS PASSES ──

async function getIssTle() {
  try {
    const c = JSON.parse(localStorage.getItem(AST_TLE_KEY));
    if (c && Date.now() - c.at < AST_TLE_MAX_AGE) return c.lines;
  } catch {}
  const res = await fetch(AST_TLE_URL);
  if (!res.ok) throw new Error(`CELESTRAK ${res.status}`);
  const lines = (await res.text()).split('\n').map(l => l.trim()).filter(l => /^[12] /.test(l));
  if (lines.length < 2) throw new Error('BAD TLE');
  try { localStorage.setItem(AST_TLE_KEY, JSON.stringify({ at: Date.now(), lines })); } catch {}
  return lines;
}

async function computeIssPasses() {
  const [l1, l2] = await getIssTle();
  const satrec = satellite.twoline2satrec(l1, l2);
  const { lat, lon } = LCARS_CONFIG.location;
  const gd  = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0 };
  const obs = astObserver();

  const look = date => {
    const pv = satellite.propagate(satrec, date);
    if (!pv.position) return null;
    const ecf = satellite.eciToEcf(pv.position, satellite.gstime(date));
    const la = satellite.ecfToLookAngles(gd, ecf);
    return { el: la.elevation * 180 / Math.PI, az: la.azimuth * 180 / Math.PI, eci: pv.position };
  };

  // Is the station in sunlight, and is it dark enough on the ground to see it?
  const visibleAt = (date, eci) => {
    if (astHorizon('Sun', date, obs).altitude > -6) return false;
    const s = Astronomy.GeoVector('Sun', date, true);
    const sl = Math.hypot(s.x, s.y, s.z);
    const sx = s.x / sl, sy = s.y / sl, sz = s.z / sl;
    const dot = eci.x * sx + eci.y * sy + eci.z * sz;
    if (dot > 0) return true;
    const px = eci.x - dot * sx, py = eci.y - dot * sy, pz = eci.z - dot * sz;
    return Math.hypot(px, py, pz) > EARTH_RADIUS_KM;
  };

  const passes = [];
  const step = 20e3;
  const end = Date.now() + AST_PASS_DAYS * 86400e3;
  let cur = null;
  for (let t = Date.now() - 10 * 60e3; t < end; t += step) {
    const date = new Date(t);
    const p = look(date);
    if (!p) continue;
    if (p.el > 0) {
      if (!cur) cur = { start: date, startAz: p.az, max: p.el, maxTime: date, maxAz: p.az, samples: [] };
      if (p.el > cur.max) { cur.max = p.el; cur.maxTime = date; cur.maxAz = p.az; }
      cur.samples.push({ date, ...p });
      cur.end = date; cur.endAz = p.az;
    } else if (cur) {
      if (cur.max >= AST_MIN_ELEV) passes.push(cur);
      cur = null;
    }
  }

  return passes.map(p => {
    const vis = p.samples.filter(s => s.el >= AST_MIN_ELEV && visibleAt(s.date, s.eci));
    delete p.samples;
    if (!vis.length) return { ...p, visible: false };
    return {
      ...p,
      visible: true,
      visStart: vis[0].date, visStartAz: vis[0].az, visStartEl: vis[0].el,
      visEnd: vis[vis.length - 1].date, visEndAz: vis[vis.length - 1].az,
      visMax: Math.max(...vis.map(s => s.el)),
    };
  }).filter(p => p.end > new Date());
}

function renderIssPasses(passes) {
  astPasses = passes;
  const list = document.getElementById('ast-iss-list');
  const hero = document.getElementById('ast-iss-next');
  if (!list || !hero) return;

  const visible = passes.filter(p => p.visible);
  const next = visible[0];
  if (next) {
    const rating = next.visMax > 60 ? 'EXCELLENT — NEARLY OVERHEAD' : next.visMax > 35 ? 'GOOD — HIGH IN THE SKY' : 'FAIR — LOW ON THE HORIZON';
    hero.innerHTML = `
      <div class="ast-next-label">NEXT VISIBLE PASS</div>
      <div class="ast-next-when">${astDay(next.visStart)} · ${astTime(next.visStart).toUpperCase()}</div>
      <div class="ast-next-countdown" data-start="${next.visStart.toISOString()}">${launchCountdown(next.visStart)}</div>
      <div class="ast-next-path">
        APPEARS <b>${astCompass(next.visStartAz)}</b> → HIGHEST <b>${Math.round(next.visMax)}°</b> ${astCompass(next.maxAz)} → VANISHES <b>${astCompass(next.visEndAz)}</b>
      </div>
      <div class="ast-next-rating">${rating} · ${Math.max(1, Math.round((next.visEnd - next.visStart) / 60e3))} MIN</div>`;
  } else {
    hero.innerHTML = `<div class="ast-next-label">NO VISIBLE PASSES IN THE NEXT ${AST_PASS_DAYS} DAYS</div>
      <div class="ast-sky-note">THE ISS IS ONLY VISIBLE NEAR DAWN OR DUSK, WHEN IT IS SUNLIT AND YOUR SKY IS DARK.</div>`;
  }

  list.innerHTML = visible.length ? visible.map(p => `
    <div class="ast-pass-row">
      <div class="ast-pass-when">
        <div class="ast-pass-day">${astDay(p.visStart)}</div>
        <div class="ast-pass-time">${astTime(p.visStart)} – ${astTime(p.visEnd)}</div>
      </div>
      <div class="ast-pass-path">${astCompass(p.visStartAz)} → ${astCompass(p.visEndAz)}</div>
      <div class="ast-pass-max ${p.visMax > 45 ? 'high' : ''}">${Math.round(p.visMax)}°</div>
    </div>`).join('') +
    `<div class="ast-sky-note">${passes.length} PASSES ABOVE ${AST_MIN_ELEV}° IN ${AST_PASS_DAYS} DAYS · ${visible.length} VISIBLE TO THE EYE</div>`
  : `<div class="ast-sky-note">${passes.length} DAYLIGHT OR SHADOWED PASSES IN ${AST_PASS_DAYS} DAYS — NONE VISIBLE.</div>`;
}

function tickAstrometrics() {
  const now = Date.now();
  document.querySelectorAll('#view-ast [data-start]').forEach(el => {
    el.textContent = launchCountdown(el.dataset.start, now);
  });
  // Heads-up 5 minutes before a visible pass
  astPasses.filter(p => p.visible && !astNotified.has(+p.visStart)).forEach(p => {
    const mins = (p.visStart - now) / 60e3;
    if (mins > 0 && mins <= 5) {
      astNotified.add(+p.visStart);
      LcarsNative.notify('ISS PASS IN 5 MINUTES',
        `Look ${astCompass(p.visStartAz)} — it climbs to ${Math.round(p.visMax)}° and vanishes ${astCompass(p.visEndAz)}.`);
      LcarsSound.play('chime');
    }
  });
}

// Compute passes in the background too, for notifications
setTimeout(() => {
  if (typeof satellite === 'undefined' || typeof Astronomy === 'undefined') return;
  computeIssPasses().then(p => { astPasses = p; }).catch(() => {});
  setInterval(() => computeIssPasses().then(p => {
    astPasses = p;
    if (document.getElementById('view-ast')?.classList.contains('active')) renderIssPasses(p);
  }).catch(() => {}), 60 * 60e3);
}, 8000);
setInterval(tickAstrometrics, 1000);
