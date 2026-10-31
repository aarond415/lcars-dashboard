// LCARS Science Module — Stellar Cartography & Planetary Analysis


function sciEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sciRow(label, value) {
  return `
    <div class="eng-data-row">
      <span class="eng-label">${label}</span>
      <span class="eng-value">${sciEscape(String(value))}</span>
    </div>`;
}

// ── MAIN ENTRY ──
async function loadSciView() {
  // Run all in parallel — each updates its own panel independently
  Promise.allSettled([
    loadAPOD(),
    loadSpaceWeather(),
    loadNEOs(),
    loadEarthquakes(),
    loadCrewInSpace(),
  ]);
}

// ── NASA ASTRONOMY PICTURE OF THE DAY ──
// APOD moved to science.nasa.gov, and api.nasa.gov/planetary/apod now often
// returns a NASA-logo placeholder. So read the latest APOD post from the
// science.nasa.gov WordPress feed first, and fall back to the API.

const APOD_FEED = 'https://science.nasa.gov/wp-json/wp/v2/image-article?search=apod&per_page=5&_embed=wp:featuredmedia';

async function loadAPOD() {
  const el = document.getElementById('sci-apod-content');
  if (!el) return;

  try {
    renderAPOD(el, await fetchApodFromFeed());
    return;
  } catch (e) {
    console.warn('[LCARS SCI] APOD feed failed, trying api.nasa.gov:', e.message);
  }

  const apiKey = LCARS_CONFIG.nasaApiKey || 'DEMO_KEY';
  const usingDemo = !LCARS_CONFIG.nasaApiKey || apiKey === 'DEMO_KEY';

  try {
    const res  = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}`);
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch {
      // NASA returned non-JSON (HTML rate-limit page)
      el.innerHTML = apodRateLimitHtml(usingDemo);
      return;
    }

    if (d.error) {
      const msg = d.error.message || JSON.stringify(d.error);
      if (msg.toLowerCase().includes('rate limit') || res.status === 429) {
        el.innerHTML = apodRateLimitHtml(usingDemo);
        return;
      }
      throw new Error(msg);
    }
    // APOD also reports errors as { code, msg } (e.g. no picture yet for today's UTC date)
    if (!d.media_type) throw new Error(d.msg || 'NO DATA RETURNED');
    if (/nasa-logo/.test(d.url || '')) throw new Error('NASA API RETURNED A PLACEHOLDER IMAGE');

    renderAPOD(el, {
      title: d.title,
      date: d.date,
      credit: d.copyright ? `© ${d.copyright.replace(/\n/g, ' ')}` : 'PUBLIC DOMAIN',
      explanation: d.explanation,
      mediaType: d.media_type,
      src: d.hdurl || d.url,
      fallbackSrc: d.url,
      link: d.url,
    });
  } catch (e) {
    el.innerHTML = `<div class="lcars-error">STARFLEET DATABASE UNAVAILABLE: ${sciEscape(e.message)}</div>`;
  }
}

// Loaded as JSONP (WordPress's built-in _jsonp parameter) because the feed's
// CORS headers only allow some origins.
function sciJsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cb = `__lcarsJsonp${Date.now()}`;
    const script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); delete window[cb]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('FEED TIMEOUT')); }, timeoutMs);
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('FEED UNAVAILABLE')); };
    script.src = `${url}&_jsonp=${cb}`;
    document.head.appendChild(script);
  });
}

async function fetchApodFromFeed() {
  const posts = await sciJsonp(APOD_FEED);
  const post  = (posts || []).find(p => /^APOD:/.test(p.title?.rendered || ''));
  if (!post) throw new Error('NO APOD POST IN FEED');

  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (!media?.source_url) throw new Error('APOD POST HAS NO MEDIA');

  const toText = html => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const body        = toText(post.content?.rendered);
  const explanation = body.match(/Explanation:\s*(.*?)\s*(Tomorrow['’]s picture|Authors & editors|$)/)?.[1]
                      || toText(post.excerpt?.rendered);
  const credit      = body.match(/Credit(?: & Copyright)?:\s*(.*?)\s*Authors & editors/)?.[1];
  const sizes       = media.media_details?.sizes || {};

  return {
    title: toText(post.title.rendered).replace(/^APOD:\s*\d{4} \w+ \d{1,2}\s*[–-]\s*/, ''),
    date: post.date.slice(0, 10),
    credit: credit ? `CREDIT: ${credit}` : 'NASA APOD',
    explanation,
    mediaType: (media.mime_type || '').startsWith('video/') ? 'video-file' : 'image',
    src: (sizes['2048x2048'] || sizes.large || media).source_url,
    fallbackSrc: media.source_url,
    link: post.link,
  };
}

function renderAPOD(el, d) {
  const caption = `
    <div class="sci-apod-title">${sciEscape(d.title)}</div>
    <div class="sci-apod-meta">${sciEscape(d.date)} — ${sciEscape(d.credit)}</div>
    <div class="sci-apod-explanation">${sciEscape(d.explanation)}</div>`;

  if (d.mediaType === 'image') {
    el.innerHTML = `
      <div class="sci-apod-image-wrap">
        <img src="${sciEscape(d.src)}" class="sci-apod-img" alt="${sciEscape(d.title)}"
             onerror="this.onerror=null; this.src='${sciEscape(d.fallbackSrc)}'" />
      </div>${caption}`;
  } else if (d.mediaType === 'video-file') {
    el.innerHTML = `
      <div class="sci-apod-image-wrap">
        <video src="${sciEscape(d.src)}" class="sci-apod-img" controls muted loop playsinline></video>
      </div>${caption}`;
  } else {
    // Video hosted elsewhere (usually YouTube)
    el.innerHTML = `
      <div class="sci-apod-video-box">
        <div class="sci-apod-video-label">VIDEO TRANSMISSION</div>
        <a href="${sciEscape(d.link)}" target="_blank" class="lcars-button" style="display:inline-block; margin-top:12px;">
          OPEN EXTERNAL VIEWER ↗
        </a>
      </div>
      <div style="margin-top:16px;">${caption}</div>`;
  }
}

function apodRateLimitHtml(usingDemo) {
  return `
    <div class="sci-apod-rate-limit">
      <div class="sci-apod-title" style="color:var(--lcars-yellow);">NASA API RATE LIMIT REACHED</div>
      <div class="sci-apod-meta" style="color:#666; margin-top:8px;">
        ${usingDemo ? 'DEMO_KEY IS LIMITED TO 30 REQUESTS/HOUR — GET A FREE KEY AT API.NASA.GOV' : 'PERSONAL KEY RATE LIMIT HIT — TRY AGAIN SHORTLY'}
      </div>
    </div>`;
}

// ── SPACE WEATHER — NOAA Kp Index + Solar Wind ──
async function loadSpaceWeather() {
  const grid = document.getElementById('sci-weather-grid');
  if (!grid) return;

  // Fetch Kp and wind summary independently so one failure doesn't kill the panel
  const [kpRes, speedRes, magRes] = await Promise.allSettled([
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json').then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json').then(r => r.json()),
  ]);

  // Kp index
  let kp = 0, obsTime = '—';
  if (kpRes.status === 'fulfilled') {
    try {
      const rows = kpRes.value.slice(1);
      const latest = rows[rows.length - 1];
      kp = parseFloat(latest[1]) || 0;
      obsTime = latest[0]?.substring(0, 16).replace('T', ' ') || '—';
    } catch {}
  }

  const kpLevel =
    kp < 2 ? { label: 'QUIET',             color: 'var(--lcars-teal)'   } :
    kp < 4 ? { label: 'UNSETTLED',         color: 'var(--lcars-yellow)' } :
    kp < 5 ? { label: 'ACTIVE',            color: 'var(--lcars-orange)' } :
    kp < 7 ? { label: 'GEOMAGNETIC STORM', color: 'var(--lcars-red)'    } :
             { label: 'SEVERE STORM',      color: 'var(--lcars-red)'    };
  const kpPct = Math.min(100, (kp / 9) * 100);

  // Solar wind speed summary — compact single-value JSON
  let solarSpeed = '—';
  if (speedRes.status === 'fulfilled') {
    try {
      const spd = speedRes.value?.WindSpeed;
      if (spd) solarSpeed = `${Math.round(spd)} KM/S`;
    } catch {}
  }

  // Magnetic field summary
  let bt = '—', bz = '—';
  if (magRes.status === 'fulfilled') {
    try {
      const m = magRes.value;
      if (m?.Bt)  bt = `${parseFloat(m.Bt).toFixed(1)} NT`;
      if (m?.Bz)  bz = `${parseFloat(m.Bz).toFixed(1)} NT`;
    } catch {}
  }

  grid.innerHTML = `
    <div class="sci-kp-row">
      <div class="sci-kp-display">
        <span class="sci-kp-num" style="color:${kpLevel.color}">${kp.toFixed(1)}</span>
        <span class="sci-kp-unit">Kp</span>
      </div>
      <div class="sci-kp-status" style="color:${kpLevel.color}">${kpLevel.label}</div>
    </div>
    <div class="eng-bar-label">
      <span class="eng-label">GEOMAGNETIC ACTIVITY</span>
      <span class="eng-value">${kp.toFixed(1)} / 9</span>
    </div>
    <div class="eng-bar-track">
      <div class="eng-bar-fill" style="width:${kpPct}%; background:${kpLevel.color};"></div>
    </div>
    ${sciRow('SOLAR WIND SPEED',    solarSpeed)}
    ${sciRow('MAGNETIC FIELD (Bt)', bt)}
    ${sciRow('Bz COMPONENT',        bz)}
    ${sciRow('OBSERVATION',         obsTime + ' UTC')}
  `;
}

// ── NEAR EARTH OBJECTS — NASA ──
async function loadNEOs() {
  const listEl = document.getElementById('sci-neo-list');
  if (!listEl) return;

  const apiKey = LCARS_CONFIG.nasaApiKey || 'DEMO_KEY';
  const today  = new Date().toISOString().split('T')[0];

  try {
    const res  = await fetch(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${apiKey}`);
    const d    = await res.json();

    if (d.error) throw new Error(d.error.message || 'NASA API error');

    const allNeos = Object.values(d.near_earth_objects || {}).flat();

    // Sort by closest approach distance
    allNeos.sort((a, b) => {
      const da = parseFloat(a.close_approach_data[0]?.miss_distance?.kilometers || Infinity);
      const db = parseFloat(b.close_approach_data[0]?.miss_distance?.kilometers || Infinity);
      return da - db;
    });

    const hazardous = allNeos.filter(n => n.is_potentially_hazardous_asteroid);
    const top = allNeos.slice(0, 6);

    if (!top.length) {
      listEl.innerHTML = `<div class="lcars-empty" style="padding:10px;">NO OBJECTS DETECTED TODAY</div>`;
      return;
    }

    listEl.innerHTML =
      `<div class="sci-count-banner">${allNeos.length} OBJECTS DETECTED TODAY ${hazardous.length > 0 ? `— <span style="color:var(--lcars-red)">⚠ ${hazardous.length} POTENTIALLY HAZARDOUS</span>` : ''}</div>` +
      top.map(neo => {
        const approach = neo.close_approach_data[0] || {};
        const distKm   = parseFloat(approach.miss_distance?.kilometers || 0);
        const distLd   = parseFloat(approach.miss_distance?.lunar || 0);
        const distStr  = distLd < 10
          ? `${distLd.toFixed(2)} LD`
          : distKm > 1e6 ? `${(distKm / 1e6).toFixed(2)}M KM`
          : `${Math.round(distKm).toLocaleString()} KM`;
        const diam     = neo.estimated_diameter?.meters || {};
        const diamStr  = diam.estimated_diameter_min
          ? `${Math.round(diam.estimated_diameter_min)}–${Math.round(diam.estimated_diameter_max)}M`
          : '—';
        const vel      = parseFloat(approach.relative_velocity?.kilometers_per_hour || 0);
        const velStr   = vel > 0 ? `${Math.round(vel).toLocaleString()} KM/H` : '—';
        const hazard   = neo.is_potentially_hazardous_asteroid;
        const name     = neo.name.replace(/[()]/g, '').trim();

        return `
          <div class="sci-neo-row">
            <div class="sci-neo-name">
              ${sciEscape(name)}
              ${hazard ? '<span class="sci-neo-hazard">⚠ PHA</span>' : ''}
            </div>
            <div class="sci-neo-stats">
              <span class="sci-neo-stat"><span class="eng-label">MISS</span> ${distStr}</span>
              <span class="sci-neo-stat"><span class="eng-label">DIAM</span> ${diamStr}</span>
              <span class="sci-neo-stat"><span class="eng-label">VEL</span> ${velStr}</span>
            </div>
          </div>`;
      }).join('');

  } catch (e) {
    listEl.innerHTML = `<div class="lcars-error" style="padding:8px;">SENSOR ARRAY OFFLINE: ${sciEscape(e.message)}</div>`;
  }
}

// ── SEISMIC ACTIVITY — USGS ──
async function loadEarthquakes() {
  const listEl = document.getElementById('sci-seismic-list');
  if (!listEl) return;

  try {
    const res    = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson');
    const d      = await res.json();
    const quakes = d.features || [];

    if (!quakes.length) {
      listEl.innerHTML = `<div class="lcars-empty" style="padding:10px;">NO SIGNIFICANT SEISMIC ACTIVITY</div>`;
      return;
    }

    listEl.innerHTML =
      `<div class="sci-count-banner">${quakes.length} SIGNIFICANT EVENTS THIS WEEK</div>` +
      quakes.slice(0, 6).map(q => {
        const mag      = q.properties.mag?.toFixed(1) || '—';
        const place    = (q.properties.place || 'UNKNOWN').toUpperCase();
        const depth    = q.geometry?.coordinates?.[2] ? `${Math.round(q.geometry.coordinates[2])} KM DEPTH` : '';
        const time     = new Date(q.properties.time)
                           .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
        const magColor = mag >= 7 ? 'var(--lcars-red)' :
                         mag >= 6 ? 'var(--lcars-orange)' : 'var(--lcars-yellow)';

        return `
          <div class="sci-quake-row">
            <span class="sci-quake-mag" style="color:${magColor}">M${mag}</span>
            <div class="sci-quake-info">
              <div class="sci-quake-place">${sciEscape(place)}</div>
              <div class="sci-quake-meta">${time}${depth ? ' — ' + depth : ''}</div>
            </div>
          </div>`;
      }).join('');

  } catch (e) {
    listEl.innerHTML = `<div class="lcars-error" style="padding:8px;">SEISMIC ARRAY OFFLINE: ${sciEscape(e.message)}</div>`;
  }
}

// ── PERSONNEL IN ORBIT ──
async function loadCrewInSpace() {
  const listEl = document.getElementById('sci-crew-list');
  if (!listEl) return;

  try {
    const res    = await fetch('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json');
    const d      = await res.json();
    const people = d.people || [];

    if (!people.length) {
      listEl.innerHTML = `<div class="lcars-empty" style="padding:10px;">NO PERSONNEL IN ORBIT</div>`;
      return;
    }

    // Group by spacecraft
    const byCraft = {};
    people.forEach(p => {
      const craft = p.craft || 'UNKNOWN';
      if (!byCraft[craft]) byCraft[craft] = [];
      byCraft[craft].push(p.name);
    });

    listEl.innerHTML =
      `<div class="sci-count-banner">${people.length} PERSONNEL CURRENTLY IN ORBIT</div>` +
      Object.entries(byCraft).map(([craft, crew]) => `
        <div class="sci-crew-craft">${sciEscape(craft.toUpperCase())}</div>
        ${crew.map(name => `
          <div class="sci-crew-row">
            <span class="sci-crew-dot">◈</span>
            <span class="sci-crew-name">${sciEscape(name.toUpperCase())}</span>
          </div>`).join('')}
      `).join('');

  } catch (e) {
    listEl.innerHTML = `<div class="lcars-error" style="padding:8px;">CREW MANIFEST UNAVAILABLE</div>`;
  }
}
