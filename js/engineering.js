// LCARS Engineering Module — Computer Core Diagnostics

const PAGE_LOAD_TIME = Date.now();
let engUptimeInterval = null;
let engBatteryRef = null;

// ── HELPERS ──

function engRow(label, value, accent) {
  return `
    <div class="eng-data-row">
      <span class="eng-label">${label}</span>
      <span class="eng-value${accent ? ' eng-accent-' + accent : ''}">${value}</span>
    </div>`;
}

function engBar(pct, color) {
  const clamped = Math.min(100, Math.max(0, pct));
  // Color shifts red as it fills up (for storage/memory)
  return `
    <div class="eng-bar-track">
      <div class="eng-bar-fill" style="width:${clamped}%; background:${color || 'var(--lcars-blue)'};"></div>
    </div>`;
}

function fmtBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setGrid(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ── PROCESSOR ──
function scanCPU() {
  const cores = navigator.hardwareConcurrency || '—';
  const arch = /arm|aarch/i.test(navigator.userAgent) ? 'ARM' :
               /x86_64|x86-64|win64|wow64/i.test(navigator.userAgent) ? 'X86-64' : 'X86';

  // Rough perf benchmark
  const t0 = performance.now();
  let x = 0;
  for (let i = 0; i < 1e6; i++) x += Math.sqrt(i);
  const elapsed = (performance.now() - t0).toFixed(1);

  setGrid('eng-cpu-grid',
    engRow('LOGICAL CORES', cores, 'orange') +
    engRow('ARCHITECTURE', arch) +
    engRow('BENCHMARK (1M √)', `${elapsed} MS`) +
    engRow('CONCURRENT THREADS', cores) +
    engRow('JS ENGINE', 'V8 / WEBKIT')
  );
}

// ── MEMORY ──
function scanMemory() {
  const deviceMem = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'UNDISCLOSED';

  let html = engRow('DEVICE MEMORY', deviceMem, 'orange');

  if (performance.memory) {
    const used  = fmtBytes(performance.memory.usedJSHeapSize);
    const total = fmtBytes(performance.memory.totalJSHeapSize);
    const limit = fmtBytes(performance.memory.jsHeapSizeLimit);
    const pct   = Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100);
    const barColor = pct > 75 ? 'var(--lcars-red)' : pct > 50 ? 'var(--lcars-yellow)' : 'var(--lcars-teal)';

    html +=
      engRow('HEAP USED', used) +
      engRow('HEAP TOTAL', total) +
      engRow('HEAP LIMIT', limit) +
      `<div class="eng-bar-label"><span class="eng-label">HEAP UTILIZATION</span><span class="eng-value">${pct}%</span></div>` +
      engBar(pct, barColor);
  } else {
    html += engRow('HEAP METRICS', 'FIREFOX / SAFARI — UNAVAILABLE');
  }

  setGrid('eng-memory-grid', html);
}

// ── GPU ──
function scanGPU() {
  let renderer = '—';
  let vendor   = '—';
  let maxTex   = '—';
  let maxVerts = '—';

  try {
    const canvas  = document.createElement('canvas');
    const gl      = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgInfo) {
        renderer = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) || '—';
        vendor   = gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL)   || '—';
      }
      maxTex   = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      maxVerts = gl.getParameter(gl.MAX_ELEMENTS_VERTICES);
    }
  } catch (e) {}

  // Truncate long GPU strings
  const shortRenderer = renderer.length > 40 ? renderer.substring(0, 38) + '…' : renderer;
  const shortVendor   = vendor.length > 30   ? vendor.substring(0, 28)   + '…' : vendor;

  setGrid('eng-gpu-grid',
    engRow('RENDERER', shortRenderer, 'orange') +
    engRow('VENDOR', shortVendor) +
    engRow('MAX TEXTURE SIZE', maxTex ? `${maxTex}px` : '—') +
    engRow('MAX VERTICES', maxVerts ? maxVerts.toLocaleString() : '—') +
    engRow('WEBGL', 'ACTIVE')
  );
}

// ── DISPLAY ──
function scanDisplay() {
  const w       = screen.width;
  const h       = screen.height;
  const dpr     = window.devicePixelRatio || 1;
  const depth   = screen.colorDepth || '—';
  const avail   = `${screen.availWidth} × ${screen.availHeight}`;
  const orient  = screen.orientation?.type?.replace(/-/g, ' ').toUpperCase() || '—';
  const physical = `${Math.round(w * dpr)} × ${Math.round(h * dpr)}`;

  setGrid('eng-display-grid',
    engRow('RESOLUTION', `${w} × ${h}`, 'orange') +
    engRow('PHYSICAL PIXELS', physical) +
    engRow('PIXEL RATIO', `${dpr}×`) +
    engRow('AVAILABLE AREA', avail) +
    engRow('COLOR DEPTH', `${depth} BIT`) +
    engRow('ORIENTATION', orient)
  );
}

// ── BATTERY ──
async function scanBattery() {
  const grid = 'eng-battery-grid';

  if (!navigator.getBattery) {
    setGrid(grid, engRow('STATUS', 'NOT SUPPORTED ON THIS SYSTEM'));
    return;
  }

  try {
    const battery = await navigator.getBattery();
    engBatteryRef = battery;

    function renderBattery(b) {
      const pct      = Math.round(b.level * 100);
      const charging = b.charging;
      const barColor = pct < 20 ? 'var(--lcars-red)' : pct < 50 ? 'var(--lcars-yellow)' : 'var(--lcars-teal)';

      let timeStr = '—';
      if (charging && b.chargingTime !== Infinity) {
        const m = Math.round(b.chargingTime / 60);
        timeStr = m > 60 ? `${Math.floor(m/60)}H ${m%60}M TO FULL` : `${m}M TO FULL`;
      } else if (!charging && b.dischargingTime !== Infinity) {
        const m = Math.round(b.dischargingTime / 60);
        timeStr = m > 60 ? `${Math.floor(m/60)}H ${m%60}M REMAINING` : `${m}M REMAINING`;
      }

      setGrid(grid,
        engRow('CHARGE LEVEL', `${pct}%`, pct < 20 ? 'red' : 'orange') +
        `<div class="eng-bar-label"><span class="eng-label">POWER RESERVE</span><span class="eng-value">${pct}%</span></div>` +
        engBar(pct, barColor) +
        engRow('STATUS', charging ? '⚡ CHARGING' : '🔋 ON BATTERY') +
        engRow('TIME ESTIMATE', timeStr)
      );
    }

    renderBattery(battery);
    battery.addEventListener('levelchange',    () => renderBattery(battery));
    battery.addEventListener('chargingchange', () => renderBattery(battery));

  } catch (e) {
    setGrid(grid, engRow('STATUS', 'POWER DATA RESTRICTED'));
  }
}

// ── NETWORK ──
function scanNetwork() {
  const grid = 'eng-network-grid';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  let html = '';

  if (conn) {
    const type       = (conn.effectiveType || '—').toUpperCase();
    const downlink   = conn.downlink   ? `${conn.downlink} MBPS`  : '—';
    const rtt        = conn.rtt        ? `${conn.rtt} MS`         : '—';
    const saveData   = conn.saveData   ? 'ENABLED' : 'DISABLED';
    const connType   = (conn.type      || '—').toUpperCase();

    html +=
      engRow('EFFECTIVE TYPE', type, 'orange') +
      engRow('DOWNLINK SPEED', downlink) +
      engRow('ROUND TRIP TIME', rtt) +
      engRow('CONNECTION TYPE', connType) +
      engRow('DATA SAVER', saveData) +
      engRow('ONLINE STATUS', navigator.onLine ? 'ONLINE' : 'OFFLINE');
  } else {
    html +=
      engRow('ONLINE STATUS', navigator.onLine ? 'ONLINE' : 'OFFLINE', 'orange') +
      engRow('DETAILED METRICS', 'SAFARI — UNAVAILABLE') +
      engRow('TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  setGrid(grid, html);
}

// ── STORAGE ──
async function scanStorage() {
  const grid = 'eng-storage-grid';

  try {
    const est = await navigator.storage.estimate();
    const used  = est.usage  || 0;
    const quota = est.quota  || 0;
    const pct   = quota > 0 ? Math.round((used / quota) * 100) : 0;
    const barColor = pct > 80 ? 'var(--lcars-red)' : pct > 60 ? 'var(--lcars-yellow)' : 'var(--lcars-blue)';

    const persistent = await navigator.storage.persisted?.() ?? null;

    setGrid(grid,
      engRow('USED', fmtBytes(used), 'orange') +
      engRow('QUOTA', fmtBytes(quota)) +
      engRow('FREE', fmtBytes(quota - used)) +
      `<div class="eng-bar-label"><span class="eng-label">UTILIZATION</span><span class="eng-value">${pct}%</span></div>` +
      engBar(pct, barColor) +
      engRow('PERSISTENT', persistent === null ? '—' : persistent ? 'GRANTED' : 'NOT GRANTED')
    );
  } catch (e) {
    setGrid(grid, engRow('STATUS', 'STORAGE API UNAVAILABLE'));
  }
}

// ── SYSTEM PROFILE ──
function scanSystem() {
  const ua = navigator.userAgent;

  // OS detection
  let os = 'UNKNOWN';
  if (/mac os x/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/);
    os = 'MACOS ' + (m ? m[1].replace(/_/g, '.') : '');
  } else if (/windows nt/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/);
    const versions = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    os = 'WINDOWS ' + (m ? (versions[m[1]] || m[1]) : '');
  } else if (/iphone|ipad/i.test(ua)) {
    os = 'IOS';
  } else if (/android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    os = 'ANDROID ' + (m ? m[1] : '');
  } else if (/linux/i.test(ua)) {
    os = 'LINUX';
  }

  // Browser detection
  let browser = 'UNKNOWN';
  if (/edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/);
    browser = 'EDGE ' + (m ? m[1].split('.')[0] : '');
  } else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    browser = 'CHROME ' + (m ? m[1].split('.')[0] : '');
  } else if (/firefox\//i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    browser = 'FIREFOX ' + (m ? m[1].split('.')[0] : '');
  } else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/);
    browser = 'SAFARI ' + (m ? m[1].split('.')[0] : '');
  }

  const lang     = navigator.language?.toUpperCase() || '—';
  const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const touch    = navigator.maxTouchPoints > 0 ? `YES (${navigator.maxTouchPoints} POINTS)` : 'NO';
  const cookies  = navigator.cookieEnabled ? 'ENABLED' : 'DISABLED';

  setGrid('eng-system-grid',
    engRow('OPERATING SYSTEM', os.toUpperCase(), 'orange') +
    engRow('BROWSER', browser) +
    engRow('LANGUAGE', lang) +
    engRow('TIMEZONE', tz) +
    engRow('TOUCH INPUT', touch) +
    engRow('COOKIES', cookies)
  );
}

// ── UPTIME ──
function startUptime() {
  if (engUptimeInterval) clearInterval(engUptimeInterval);

  function renderUptime() {
    const elapsed = Math.floor((Date.now() - PAGE_LOAD_TIME) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const fmt = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const loadEntry = performance.getEntriesByType('navigation')[0];
    const loadTime  = loadEntry ? `${Math.round(loadEntry.loadEventEnd - loadEntry.startTime)} MS` : '—';

    const paintEntry = performance.getEntriesByName('first-contentful-paint')[0];
    const fcp = paintEntry ? `${Math.round(paintEntry.startTime)} MS` : '—';

    setGrid('eng-uptime-grid',
      `<div class="eng-uptime-clock">${fmt}</div>` +
      engRow('SESSION START', new Date(PAGE_LOAD_TIME).toLocaleTimeString('en-US', { hour12: false })) +
      engRow('PAGE LOAD TIME', loadTime) +
      engRow('FIRST PAINT', fcp) +
      engRow('MEMORY SNAPSHOTS', performance.memory ? 'ACTIVE' : 'INACTIVE')
    );
  }

  renderUptime();
  engUptimeInterval = setInterval(renderUptime, 1000);
}

// ── MAIN ENTRY ──
let engLoaded = false;

async function loadEngView() {
  if (engLoaded) {
    // Just restart uptime ticker — rest is static
    startUptime();
    return;
  }
  engLoaded = true;

  // Run all scans in parallel
  scanCPU();
  scanMemory();
  scanGPU();
  scanDisplay();
  scanSystem();
  scanNetwork();
  startUptime();
  await Promise.all([
    scanBattery(),
    scanStorage(),
  ]);
}
