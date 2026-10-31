// LCARS Navigation Module — Stellar Cartography & Planetary Navigation

let navIssInterval  = null;
let navClockInterval = null;
let navOrbitObserver = null;

// NASA's official ISS live stream (as embedded on eol.jsc.nasa.gov/ESRS/HDEV)
const ISS_STREAM_URL  = 'https://www.youtube.com/embed/ROboUHfPUrU?autoplay=1&mute=1&playsinline=1&rel=0';
const ISS_TRACKER_URL = 'https://isstracker.spaceflight.esa.int/';

// ── CONSTANTS ──
const AU_KM        = 149_597_870.7;   // km per AU
const EARTH_A      = 1.000001018;     // semi-major axis in AU
const EARTH_E      = 0.0167086;       // eccentricity
const EARTH_B      = EARTH_A * Math.sqrt(1 - EARTH_E ** 2); // semi-minor axis
// J2000 epoch perihelion: ~Jan 3, 2000 = JD 2451547.507
const J2000        = 2451545.0;       // J2000 epoch (Jan 1.5, 2000)
const PERIHELION_J2000 = 2451547.507; // Earth perihelion J2000

const MOON_PHASES = [
  '🌑 NEW MOON', '🌒 WAXING CRESCENT', '🌓 FIRST QUARTER', '🌔 WAXING GIBBOUS',
  '🌕 FULL MOON', '🌖 WANING GIBBOUS', '🌗 LAST QUARTER', '🌘 WANING CRESCENT',
];

const WORLD_CLOCKS = [
  { label: 'STARFLEET HQ',    tz: 'America/Los_Angeles', city: 'SAN FRANCISCO' },
  { label: 'EARTH GOV',       tz: 'America/New_York',    city: 'NEW YORK' },
  { label: 'LONDON BASE',     tz: 'Europe/London',       city: 'LONDON' },
  { label: 'PARIS SECTOR',    tz: 'Europe/Paris',        city: 'PARIS' },
  { label: 'TOKYO OUTPOST',   tz: 'Asia/Tokyo',          city: 'TOKYO' },
  { label: 'SYDNEY STATION',  tz: 'Australia/Sydney',    city: 'SYDNEY' },
  { label: 'DUBAI RELAY',     tz: 'Asia/Dubai',          city: 'DUBAI' },
];

// ── JULIAN DATE ──
function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// ── EARTH ORBITAL MECHANICS ──
function computeEarthOrbit(date) {
  const jd = toJulianDate(date);

  // Days since J2000 perihelion
  const daysSincePeri = jd - PERIHELION_J2000;
  const orbitalPeriod = 365.25636; // days

  // Mean anomaly (radians)
  const M = ((2 * Math.PI * daysSincePeri) / orbitalPeriod) % (2 * Math.PI);

  // Solve Kepler's equation iteratively: E - e*sin(E) = M
  let E = M;
  for (let i = 0; i < 10; i++) {
    E = E - (E - EARTH_E * Math.sin(E) - M) / (1 - EARTH_E * Math.cos(E));
  }

  // True anomaly
  const tanHalfNu = Math.sqrt((1 + EARTH_E) / (1 - EARTH_E)) * Math.tan(E / 2);
  let nu = 2 * Math.atan(tanHalfNu);
  if (nu < 0) nu += 2 * Math.PI;

  // Distance from Sun (AU)
  const r = EARTH_A * (1 - EARTH_E * Math.cos(E));

  // Orbital velocity (km/s) via vis-viva: v = sqrt(GM*(2/r - 1/a))
  // GM_sun = 1.327e20 m³/s², a in meters
  const GM   = 1.32712440018e20;
  const rM   = r * AU_KM * 1000;
  const aM   = EARTH_A * AU_KM * 1000;
  const vel  = Math.sqrt(GM * (2 / rM - 1 / aM)) / 1000; // km/s

  // Days to next perihelion / aphelion
  const fracOrbit = daysSincePeri / orbitalPeriod;
  const fracInYear = fracOrbit - Math.floor(fracOrbit);
  const daysToPeri   = fracInYear < 1 ? (1 - fracInYear) * orbitalPeriod : orbitalPeriod - fracInYear * orbitalPeriod;
  const halfOrbit = 0.5;
  const fracToAph = fracInYear < halfOrbit ? halfOrbit - fracInYear : 1 + halfOrbit - fracInYear;
  const daysToAph = fracToAph * orbitalPeriod;

  // Orbital progress (0-100%)
  const progress = (fracInYear * 100).toFixed(1);

  return { r, nu, E, vel, daysToPeri, daysToAph, progress };
}

// ── DRAW ORBITAL CANVAS ──
function drawOrbit(date) {
  const canvas = document.getElementById('nav-orbit-canvas');
  if (!canvas) return;

  // Size from the wrapper (the canvas itself is absolutely positioned) and
  // render at device resolution so it stays sharp on Retina screens.
  const W = canvas.parentElement.clientWidth;
  const H = canvas.parentElement.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const orbit = computeEarthOrbit(date);
  const { r, nu, vel, daysToPeri, daysToAph, progress } = orbit;

  // Scale: fit ellipse with margin
  const margin  = 28;
  const scaleX  = (W / 2 - margin) / EARTH_A;
  const scaleY  = (H / 2 - margin) / EARTH_B;
  const scale   = Math.min(scaleX, scaleY);

  // Center of canvas
  const cx = W / 2;
  const cy = H / 2;

  // Sun is at one focus: offset from center = a*e * scale
  const focusOffset = EARTH_A * EARTH_E * scale;
  const sunX = cx - focusOffset; // Sun at left focus
  const sunY = cy;

  // ── Draw orbit ellipse ──
  ctx.save();
  ctx.strokeStyle = '#4A8FB0';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, EARTH_A * scale, EARTH_B * scale, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();

  // ── Perihelion / Aphelion markers ──
  // Perihelion: nu = 0 → point closest to sun → (a*(1-e), 0) from sun focus
  const periX = sunX + EARTH_A * (1 - EARTH_E) * scale;
  const periY = sunY;
  const aphX  = sunX - EARTH_A * (1 + EARTH_E) * scale;
  const aphY  = sunY;

  function drawMarker(x, y, label, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '10px Antonio, Arial Narrow, sans-serif';
    ctx.fillStyle = color;
    ctx.letterSpacing = '1px';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 10);
    ctx.restore();
  }

  drawMarker(periX, periY, 'PERIHELION', '#FF6666');
  drawMarker(aphX,  aphY,  'APHELION',  '#9999FF');

  // ── Sun ──
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 18);
  sunGrad.addColorStop(0,   'rgba(255, 240, 180, 1)');
  sunGrad.addColorStop(0.4, 'rgba(255, 180, 40, 0.9)');
  sunGrad.addColorStop(1,   'rgba(255, 120, 0, 0)');
  ctx.beginPath();
  ctx.arc(sunX, sunY, 18, 0, 2 * Math.PI);
  ctx.fillStyle = sunGrad;
  ctx.fill();

  // Sol label
  ctx.font = 'bold 11px Antonio, Arial Narrow, sans-serif';
  ctx.fillStyle = '#FFCC66';
  ctx.textAlign = 'center';
  ctx.fillText('SOL', sunX, sunY + 26);

  // ── Earth position ──
  // In orbital plane: x = r*cos(nu), y = r*sin(nu) relative to sun focus
  // nu=0 → perihelion (right of sun), increases counterclockwise
  // We want perihelion to the right of sun on canvas → flip y for screen coords
  const earthX = sunX + r * Math.cos(nu) * scale;
  const earthY = sunY - r * Math.sin(nu) * scale; // flip y

  // Glow
  const glow = ctx.createRadialGradient(earthX, earthY, 0, earthX, earthY, 14);
  glow.addColorStop(0,   'rgba(100, 180, 255, 0.6)');
  glow.addColorStop(1,   'rgba(100, 180, 255, 0)');
  ctx.beginPath();
  ctx.arc(earthX, earthY, 14, 0, 2 * Math.PI);
  ctx.fillStyle = glow;
  ctx.fill();

  // Earth dot
  ctx.beginPath();
  ctx.arc(earthX, earthY, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#4488FF';
  ctx.fill();
  ctx.strokeStyle = '#99CCFF';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Earth label
  ctx.font = 'bold 11px Antonio, Arial Narrow, sans-serif';
  ctx.fillStyle = '#99CCFF';
  ctx.textAlign = 'center';
  ctx.fillText('EARTH', earthX, earthY - 14);

  // ── Direction line from Sun to Earth ──
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 190, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(sunX, sunY);
  ctx.lineTo(earthX, earthY);
  ctx.stroke();
  ctx.restore();

  // ── Update data sidebar ──
  const distKm  = (r * AU_KM).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' KM';
  const distAu  = r.toFixed(6) + ' AU';
  const velStr  = vel.toFixed(2) + ' KM/S';
  const nuDeg   = ((nu * 180 / Math.PI) % 360).toFixed(2) + '°';
  const periStr = Math.round(daysToPeri) + ' DAYS';
  const aphStr  = Math.round(daysToAph)  + ' DAYS';
  const progStr = progress + '% OF ORBIT COMPLETE';

  document.getElementById('nav-dist-km')   && (document.getElementById('nav-dist-km').textContent   = distKm);
  document.getElementById('nav-dist-au')   && (document.getElementById('nav-dist-au').textContent   = distAu);
  document.getElementById('nav-velocity')  && (document.getElementById('nav-velocity').textContent  = velStr);
  document.getElementById('nav-anomaly')   && (document.getElementById('nav-anomaly').textContent   = nuDeg);
  document.getElementById('nav-perihelion')&& (document.getElementById('nav-perihelion').textContent= periStr);
  document.getElementById('nav-aphelion')  && (document.getElementById('nav-aphelion').textContent  = aphStr);
  document.getElementById('nav-progress')  && (document.getElementById('nav-progress').textContent  = progStr);
}

// ── ISS TRACKING ──
async function updateISS() {
  const grid = document.getElementById('nav-iss-grid');
  if (!grid) return;

  try {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    const d   = await res.json();

    const lat      = parseFloat(d.latitude).toFixed(4);
    const lon      = parseFloat(d.longitude).toFixed(4);
    const alt      = parseFloat(d.altitude).toFixed(1);
    const vel      = parseFloat(d.velocity).toFixed(1);
    const vis      = (d.visibility || '—').toUpperCase();
    const footprint= parseFloat(d.footprint).toFixed(0);

    // Rough region from lat/lon
    function getRegion(la, lo) {
      if (la > 60) return 'ARCTIC REGION';
      if (la < -60) return 'ANTARCTIC REGION';
      if (lo > -30 && lo < 60)  return la > 0 ? 'EUROPE / N AFRICA' : 'CENTRAL AFRICA';
      if (lo >= 60 && lo < 150) return la > 0 ? 'ASIA' : 'INDIAN OCEAN / OCEANIA';
      if (lo >= 150 || lo < -120) return 'PACIFIC OCEAN';
      if (lo >= -120 && lo < -30) return la > 0 ? 'NORTH AMERICA' : 'SOUTH AMERICA';
      return 'UNKNOWN SECTOR';
    }

    const region = getRegion(parseFloat(d.latitude), parseFloat(d.longitude));

    grid.innerHTML = `
      <div class="nav-iss-coords">
        <div class="nav-iss-coord-block">
          <span class="nav-coord-label">LATITUDE</span>
          <span class="nav-coord-value">${lat}°</span>
        </div>
        <div class="nav-iss-coord-block">
          <span class="nav-coord-label">LONGITUDE</span>
          <span class="nav-coord-value">${lon}°</span>
        </div>
      </div>
      <div class="nav-orbit-stat"><span class="eng-label">REGION</span><span class="eng-value" style="color:var(--lcars-teal)">${region}</span></div>
      <div class="nav-orbit-stat"><span class="eng-label">ALTITUDE</span><span class="eng-value">${alt} KM</span></div>
      <div class="nav-orbit-stat"><span class="eng-label">VELOCITY</span><span class="eng-value">${vel} KM/H</span></div>
      <div class="nav-orbit-stat"><span class="eng-label">VISIBILITY</span><span class="eng-value">${vis}</span></div>
      <div class="nav-orbit-stat"><span class="eng-label">SENSOR FOOTPRINT</span><span class="eng-value">${footprint} KM</span></div>
      <div class="nav-iss-update">SIGNAL REFRESHING EVERY 5 SECONDS</div>
    `;
  } catch (e) {
    const grid = document.getElementById('nav-iss-grid');
    if (grid) grid.innerHTML = `<div class="lcars-error" style="padding:8px;">ISS SIGNAL LOST: ${e.message}</div>`;
  }
}

// ── MOON PHASE ──
function computeMoonPhase(date) {
  // Known new moon reference: Jan 6, 2000 18:14 UTC
  const refNewMoon = new Date('2000-01-06T18:14:00Z');
  const synodicPeriod = 29.53058867; // days
  const elapsed = (date - refNewMoon) / (1000 * 60 * 60 * 24);
  const phase   = ((elapsed % synodicPeriod) + synodicPeriod) % synodicPeriod;
  const pct     = phase / synodicPeriod;

  const phaseIndex = Math.round(pct * 8) % 8;
  const phaseName  = MOON_PHASES[phaseIndex];
  const illum      = Math.round((1 - Math.cos(pct * 2 * Math.PI)) / 2 * 100);

  // Days to next full / new
  const daysToFull = ((0.5 - pct + 1) % 1) * synodicPeriod;
  const daysToNew  = ((1   - pct + 1) % 1) * synodicPeriod;

  // Approximate lunar distance (km) — oscillates between 356,500 and 406,700
  const lunarDist = Math.round(384400 - 27000 * Math.cos(pct * 2 * Math.PI));

  return { phase, pct, phaseName, illum, daysToFull, daysToNew, lunarDist };
}

function renderMoon(date) {
  const el = document.getElementById('nav-moon-content');
  if (!el) return;

  const m = computeMoonPhase(date);

  // Draw moon SVG
  const pct   = m.pct;
  const isWaxing = pct < 0.5;
  // illumination arc direction
  const d1 = isWaxing ? 1 : 0;
  const d2 = isWaxing ? 0 : 1;
  const limbX = Math.cos(Math.PI * (isWaxing ? (pct * 2) : (pct * 2 - 1))) * 30;

  const moonSvg = `
    <svg width="70" height="70" viewBox="0 0 70 70" class="nav-moon-svg">
      <defs>
        <clipPath id="moon-clip"><circle cx="35" cy="35" r="30"/></clipPath>
      </defs>
      <!-- Dark side -->
      <circle cx="35" cy="35" r="30" fill="#1a1a2e"/>
      <!-- Lit side -->
      <g clip-path="url(#moon-clip)">
        <ellipse cx="35" cy="35" rx="${Math.abs(limbX)}" ry="30"
          transform="translate(${limbX >= 0 ? 0 : -limbX * 0 },0)"
          fill="#FFEEAA" opacity="0.9"/>
        ${Math.abs(m.illum) > 50
          ? `<rect x="${isWaxing ? 35 : 5}" y="5" width="30" height="60" fill="#FFEEAA" opacity="0.9"/>`
          : ''}
      </g>
      <circle cx="35" cy="35" r="30" fill="none" stroke="#333" stroke-width="1"/>
    </svg>`;

  el.innerHTML = `
    <div class="nav-moon-row">
      ${moonSvg}
      <div class="nav-moon-info">
        <div class="nav-moon-phase">${m.phaseName}</div>
        <div class="nav-moon-illum">${m.illum}% ILLUMINATED</div>
      </div>
    </div>
    <div class="nav-orbit-stat"><span class="eng-label">LUNAR DISTANCE</span><span class="eng-value">${m.lunarDist.toLocaleString()} KM</span></div>
    <div class="nav-orbit-stat"><span class="eng-label">DAYS TO FULL MOON</span><span class="eng-value">${m.daysToFull.toFixed(1)} DAYS</span></div>
    <div class="nav-orbit-stat"><span class="eng-label">DAYS TO NEW MOON</span><span class="eng-value">${m.daysToNew.toFixed(1)} DAYS</span></div>
  `;
}

// ── SUNRISE / SUNSET ──
async function renderSunTimes() {
  const grid = document.getElementById('nav-sun-grid');
  if (!grid) return;

  const lat = LCARS_CONFIG.location.lat;
  const lon = LCARS_CONFIG.location.lon;
  const city = LCARS_CONFIG.location.city;

  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(
      `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lon}&date=${today}&time_format=24`
    );
    const d = await res.json();
    const r = d.results;

    if (!r) throw new Error('no data');

    const fmt = (t) => t ? t.substring(0,5) : '—';

    const dawn    = fmt(r.dawn);
    const sunrise = fmt(r.sunrise);
    const transit = fmt(r.solar_noon);
    const sunset  = fmt(r.sunset);
    const dusk    = fmt(r.dusk);
    const dayLen  = r.day_length || '—';

    grid.innerHTML = `
      <div class="nav-sun-location">${city.toUpperCase()}</div>
      <div class="nav-sun-row main-event">
        <span class="nav-sun-icon">🌅</span>
        <span class="eng-label">SUNRISE</span>
        <span class="nav-sun-time">${sunrise}</span>
      </div>
      <div class="nav-sun-row">
        <span class="nav-sun-icon">🌄</span>
        <span class="eng-label">DAWN</span>
        <span class="nav-sun-time">${dawn}</span>
      </div>
      <div class="nav-sun-row main-event">
        <span class="nav-sun-icon">☀️</span>
        <span class="eng-label">SOLAR NOON</span>
        <span class="nav-sun-time">${transit}</span>
      </div>
      <div class="nav-sun-row main-event">
        <span class="nav-sun-icon">🌇</span>
        <span class="eng-label">SUNSET</span>
        <span class="nav-sun-time">${sunset}</span>
      </div>
      <div class="nav-sun-row">
        <span class="nav-sun-icon">🌆</span>
        <span class="eng-label">DUSK</span>
        <span class="nav-sun-time">${dusk}</span>
      </div>
      <div class="nav-sun-row" style="margin-top:6px; border-top:1px solid #1a1a1a; padding-top:6px;">
        <span class="nav-sun-icon">⏱</span>
        <span class="eng-label">DAYLIGHT</span>
        <span class="nav-sun-time" style="color:var(--lcars-yellow)">${dayLen}</span>
      </div>
    `;
  } catch (e) {
    grid.innerHTML = `<div class="lcars-error" style="padding:8px;">SUN DATA UNAVAILABLE</div>`;
  }
}

// ── WORLD CLOCKS ──
function renderWorldClocks() {
  const grid = document.getElementById('nav-clocks-grid');
  if (!grid) return;

  // Set up initial HTML
  grid.innerHTML = WORLD_CLOCKS.map((c, i) => `
    <div class="nav-clock-row">
      <div class="nav-clock-label">
        <span class="nav-clock-city">${c.city}</span>
        <span class="nav-clock-name">${c.label}</span>
      </div>
      <span class="nav-clock-time" id="nav-clock-${i}">--:--:--</span>
    </div>
  `).join('');

  function tick() {
    const now = new Date();
    WORLD_CLOCKS.forEach((c, i) => {
      const el = document.getElementById(`nav-clock-${i}`);
      if (!el) return;
      el.textContent = now.toLocaleTimeString('en-US', {
        timeZone: c.tz, hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    });
  }

  tick();
  if (navClockInterval) clearInterval(navClockInterval);
  navClockInterval = setInterval(tick, 1000);
}

// ── MAIN ENTRY ──
async function loadNavView() {
  const now = new Date();

  // Draw orbital plot, and redraw whenever its panel changes size
  drawOrbit(now);
  if (!navOrbitObserver) {
    navOrbitObserver = new ResizeObserver(() => drawOrbit(new Date()));
    navOrbitObserver.observe(document.getElementById('nav-orbit-canvas-wrap'));
  }

  loadNavMedia();

  // ISS — start live polling
  if (navIssInterval) clearInterval(navIssInterval);
  await updateISS();
  navIssInterval = setInterval(updateISS, 5000);

  // Moon, Sun, Clocks
  renderMoon(now);
  renderWorldClocks();
  renderSunTimes();
}

// ── ISS LIVE CAMERA + MAP ──
// Embedded only while NAV is open (app.js calls unloadNavMedia on leaving),
// so the video stream and map don't keep loading in the background.
function loadNavMedia() {
  const embed = (id, src, title) => {
    const box = document.getElementById(id);
    if (!box || box.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    box.appendChild(frame);
  };
  embed('nav-iss-cam', ISS_STREAM_URL, 'ISS live Earth view');
  embed('nav-iss-map', ISS_TRACKER_URL, 'ISS tracking map');
}

function unloadNavMedia() {
  document.querySelectorAll('#nav-iss-cam iframe, #nav-iss-map iframe').forEach(f => f.remove());
}
