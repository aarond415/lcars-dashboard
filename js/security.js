// LCARS Security Module — Threat Assessment Console


function secEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function secRow(label, value, cls) {
  return `
    <div class="eng-data-row">
      <span class="eng-label">${label}</span>
      <span class="eng-value${cls ? ' ' + cls : ''}">${secEscape(String(value))}</span>
    </div>`;
}

// ── MAIN ENTRY ──
async function loadSecView() {
  await Promise.all([
    scanNetworkIdentity(),
    loadSecurityNews(),
  ]);
  initBreachChecker();
}

// ── NETWORK IDENTITY ──
async function scanNetworkIdentity() {
  const grid = document.getElementById('sec-ip-grid');
  if (!grid) return;

  try {
    const res = await fetch('https://ipapi.co/json/');
    const d   = await res.json();

    if (d.error) throw new Error(d.reason || 'API error');

    // Simple VPN/hosting heuristic based on org name
    const orgLower  = (d.org || '').toLowerCase();
    const vpnHints  = ['hosting', 'vpn', 'datacenter', 'cloud', 'amazon', 'google',
                       'microsoft', 'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner'];
    const vpnLikely = vpnHints.some(k => orgLower.includes(k));

    grid.innerHTML =
      secRow('PUBLIC IP',   d.ip || '—', 'eng-accent-orange') +
      secRow('CITY',        (d.city        || '—').toUpperCase()) +
      secRow('REGION',      (d.region      || '—').toUpperCase()) +
      secRow('COUNTRY',     (d.country_name|| '—').toUpperCase()) +
      secRow('ISP / ORG',   (d.org         || '—').toUpperCase().substring(0, 36)) +
      secRow('TIMEZONE',    d.timezone     || '—') +
      secRow('COORDINATES', `${(d.latitude||0).toFixed(3)}, ${(d.longitude||0).toFixed(3)}`) +
      secRow('VPN SIGNAL',  vpnLikely ? '⚠ POSSIBLE' : 'NONE DETECTED',
             vpnLikely ? 'sec-warn' : 'sec-ok');

  } catch (e) {
    grid.innerHTML = `<div class="lcars-error" style="padding:8px;">SCAN FAILED: ${secEscape(e.message)}</div>`;
  }
}

// ── PASSWORD BREACH CHECKER (HIBP k-anonymity) ──
function initBreachChecker() {
  const btn    = document.getElementById('sec-breach-btn');
  const input  = document.getElementById('sec-breach-input');
  const result = document.getElementById('sec-breach-result');
  if (!btn || !input || !result) return;

  async function runCheck() {
    const pw = input.value;
    if (!pw) return;

    result.innerHTML = `<div class="lcars-loading blink" style="padding:8px;">CROSS-REFERENCING BREACH DATABASE...</div>`;

    try {
      // SHA-1 via Web Crypto
      const buf  = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
      const hash = Array.from(new Uint8Array(buf))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('').toUpperCase();

      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const res   = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      const text  = await res.text();
      const match = text.split('\n').find(l => l.startsWith(suffix));

      if (match) {
        const count = parseInt(match.split(':')[1].trim(), 10).toLocaleString();
        result.innerHTML = `
          <div class="sec-breach-found">
            <div class="sec-breach-icon-bad">⚠</div>
            <div>
              <div class="sec-breach-title bad">SECURITY BREACH DETECTED</div>
              <div class="sec-breach-detail">
                THIS PASSWORD APPEARS IN <strong style="color:var(--lcars-red)">${count}</strong> KNOWN DATA BREACHES
              </div>
              <div class="sec-breach-advice">IMMEDIATE REPLACEMENT RECOMMENDED — DO NOT USE ON ANY SYSTEM</div>
            </div>
          </div>`;
      } else {
        result.innerHTML = `
          <div class="sec-breach-clear">
            <div class="sec-breach-icon-good">✓</div>
            <div>
              <div class="sec-breach-title good">NO BREACHES DETECTED</div>
              <div class="sec-breach-detail">THIS PASSWORD DOES NOT APPEAR IN KNOWN BREACH DATABASES</div>
            </div>
          </div>`;
      }
    } catch (e) {
      result.innerHTML = `<div class="lcars-error" style="padding:8px;">SCAN ERROR: ${secEscape(e.message)}</div>`;
    }
  }

  btn.onclick = runCheck;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(); });
}

// ── THREAT INTELLIGENCE FEED ──
async function loadSecurityNews() {
  const listEl = document.getElementById('sec-news-list');
  if (!listEl) return;

  try {
    const rssUrl = encodeURIComponent('https://krebsonsecurity.com/feed/');
    const res    = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
    const data   = await res.json();

    if (data.status !== 'ok' || !data.items?.length) throw new Error('NO FEED DATA');

    listEl.innerHTML = data.items.map(item => {
      const date  = new Date(item.pubDate)
                      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      .toUpperCase();
      const cats  = (item.categories || []).slice(0, 3)
                      .map(c => `<span class="sec-news-tag">${secEscape(c.toUpperCase().substring(0,20))}</span>`)
                      .join('');
      return `
        <div class="sec-news-row" onclick="window.open('${secEscape(item.link)}', '_blank')">
          <div class="sec-news-date">${date}</div>
          <div class="sec-news-body">
            <div class="sec-news-title">${secEscape(item.title || '(NO TITLE)')}</div>
            <div class="sec-news-tags">${cats}</div>
          </div>
          <div class="sec-news-arrow">↗</div>
        </div>`;
    }).join('');

  } catch (e) {
    listEl.innerHTML = `<div class="lcars-error" style="padding:12px;">INTELLIGENCE FEED UNAVAILABLE: ${secEscape(e.message)}</div>`;
  }
}
