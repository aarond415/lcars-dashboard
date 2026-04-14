// LCARS Shortcut Module — Shortcut REST API v3

// ── SHARED CACHE (used by dashboard widget + OPS view) ──
let scCache = null; // { iteration, stories, stateMap, qaStateIds, qaStories }

function updateShortcutStatus(text, level) {
  const el = document.getElementById('shortcut-status');
  if (!el) return;
  el.textContent = text;
  el.className = `lcars-value status-${level}`;
  const dot = el.closest('.status-row')?.querySelector('.status-indicator');
  if (!dot) return;
  if (level === 'ok')   dot.className = 'status-indicator status-green';
  if (level === 'warn') dot.className = 'status-indicator status-yellow';
  if (level === 'err')  dot.className = 'status-indicator status-red';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scApi(path) {
  const token = LCARS_CONFIG.shortcutApiToken;
  return `https://api.app.shortcut.com/api/v3/${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

// ── SHARED DATA FETCH ──
async function fetchSprintData(force = false) {
  if (scCache && !force) return scCache;

  const iterRes = await fetch(scApi('iterations?page_size=25'));
  if (!iterRes.ok) {
    if (iterRes.status === 401) throw new Error('INVALID API TOKEN (401 UNAUTHORIZED)');
    throw new Error(`ITERATIONS API ERROR ${iterRes.status}`);
  }
  const iterations = await iterRes.json();

  const now = new Date();
  const iteration = iterations.find((it) => {
    if (it.status === 'started') return true;
    const start = new Date(it.start_date);
    const end   = new Date(it.end_date);
    return start <= now && end >= now;
  });

  if (!iteration) return null;

  const [storiesRes, wfRes] = await Promise.all([
    fetch(scApi(`iterations/${iteration.id}/stories`)),
    fetch(scApi('workflows')),
  ]);
  if (!storiesRes.ok) throw new Error(`STORIES FETCH ERROR ${storiesRes.status}`);
  if (!wfRes.ok)      throw new Error(`WORKFLOWS FETCH ERROR ${wfRes.status}`);

  const stories   = await storiesRes.json();
  const workflows = await wfRes.json();

  const stateMap    = {};
  const qaStateIds  = new Set();

  workflows.forEach((wf) => {
    wf.states.forEach((st) => {
      stateMap[st.id] = st.name;
      const n = (st.name || '').toLowerCase();
      if (n.includes('qa') || n.includes('review') || n.includes('testing') || n.includes('verification')) {
        qaStateIds.add(st.id);
      }
    });
  });

  const qaStories = stories.filter((s) => qaStateIds.has(s.workflow_state_id));

  scCache = { iteration, stories, stateMap, qaStateIds, qaStories };
  return scCache;
}

// ── DASHBOARD WIDGET ──
async function fetchShortcutQATickets() {
  const widget = document.getElementById('shortcut-widget');
  if (!widget) return;

  widget.innerHTML = `
    <div class="lcars-panel-header">SHORTCUT — QA READY [CURRENT SPRINT]</div>
    <div class="lcars-loading blink">ACCESSING DATABASE...</div>
  `;

  if (!LCARS_CONFIG.shortcutApiToken) {
    widget.innerHTML = `
      <div class="lcars-panel-header">SHORTCUT — QA READY [CURRENT SPRINT]</div>
      <div class="lcars-setup-prompt">
        <span class="lcars-label" style="color: var(--lcars-yellow);">SHORTCUT API TOKEN NOT CONFIGURED</span>
        <ol class="setup-steps">
          <li>Navigate to <strong>app.shortcut.com/settings/account/api-tokens</strong></li>
          <li>Generate a new API token</li>
          <li>Paste it into <code>config.js → shortcutApiToken</code></li>
        </ol>
      </div>
    `;
    updateShortcutStatus('UNCONFIGURED', 'warn');
    return;
  }

  try {
    const data = await fetchSprintData(true); // always fresh on dashboard load

    if (!data) {
      widget.innerHTML = `
        <div class="lcars-panel-header">SHORTCUT — QA READY [CURRENT SPRINT]</div>
        <div class="lcars-empty">NO ACTIVE SPRINT DETECTED</div>
      `;
      updateShortcutStatus('NO SPRINT', 'warn');
      return;
    }

    const { iteration, stories, stateMap, qaStories } = data;
    const sprintName  = iteration.name.toUpperCase();
    const totalStories = stories.length;
    const pct = totalStories > 0 ? Math.round((qaStories.length / totalStories) * 100) : 0;

    let html = `
      <div class="lcars-panel-header">
        SHORTCUT — ${escapeHtml(sprintName)}
        <span class="lcars-count">[QA: ${qaStories.length} / TOTAL: ${totalStories}]</span>
      </div>
      <div style="margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span class="lcars-label">IN QA / REVIEW</span>
          <span class="lcars-value">${pct}% OF SPRINT</span>
        </div>
        <div style="height:4px; background:#1a1a1a; border-radius:2px;">
          <div style="height:100%; width:${pct}%; background:var(--lcars-blue); border-radius:2px; transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;

    if (qaStories.length === 0) {
      html += `<div class="lcars-empty">NO STORIES IN QA — ALL CLEAR</div>`;
    } else {
      html += `<div class="ticket-list">`;
      qaStories.forEach((story) => {
        const storyType = (story.story_type || 'story').toLowerCase();
        const stateName = (stateMap[story.workflow_state_id] || 'UNKNOWN').toUpperCase();
        const ownersStr = story.owner_ids?.length > 0 ? `${story.owner_ids.length} ASSIGNED` : 'UNASSIGNED';
        const appUrl    = story.app_url || '#';
        html += `
          <div class="ticket-card" onclick="window.open('${escapeHtml(appUrl)}', '_blank')">
            <div class="ticket-meta">
              <span class="ticket-id">SC-${story.id}</span>
              <span class="lcars-tag type-${storyType}">${storyType.toUpperCase()}</span>
            </div>
            <div class="ticket-name">${escapeHtml(story.name)}</div>
            <div class="ticket-footer">
              <span class="lcars-tag status-qa">${stateName}</span>
              <span class="ticket-owner">${ownersStr}</span>
              ${story.estimate != null ? `<span class="ticket-points">${story.estimate} PTS</span>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    widget.innerHTML = html;
    updateShortcutStatus(`${qaStories.length} IN QA`, qaStories.length > 0 ? 'ok' : 'warn');

  } catch (err) {
    console.error('[LCARS Shortcut] Error:', err);
    widget.innerHTML = `
      <div class="lcars-panel-header">SHORTCUT — QA READY [CURRENT SPRINT]</div>
      <div class="lcars-error">COMM FAILURE: ${escapeHtml(err.message)}</div>
    `;
    updateShortcutStatus('ERROR', 'err');
  }
}

// ── OPS VIEW ──
let opsCurrentFilter = 'all';

async function loadOpsView() {
  const listEl   = document.getElementById('ops-ticket-list');
  const titleEl  = document.getElementById('ops-sprint-title');
  const datesEl  = document.getElementById('ops-sprint-dates');
  if (!listEl) return;

  if (!LCARS_CONFIG.shortcutApiToken) {
    listEl.innerHTML = `<div class="lcars-error" style="padding:20px;">SHORTCUT API TOKEN NOT CONFIGURED — SEE config.js</div>`;
    return;
  }

  // Show loading only if no cache yet
  if (!scCache) {
    listEl.innerHTML = `<div class="lcars-loading blink" style="padding:20px;">ACCESSING MISSION DATABASE...</div>`;
  }

  try {
    const data = await fetchSprintData();

    if (!data) {
      listEl.innerHTML = `<div class="lcars-empty" style="padding:20px;">NO ACTIVE SPRINT DETECTED</div>`;
      return;
    }

    const { iteration, stateMap, qaStories } = data;

    // ── Sprint header ──
    if (titleEl) titleEl.textContent = `MISSION: ${iteration.name.toUpperCase()}`;
    if (datesEl) {
      const start = new Date(iteration.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      const end   = new Date(iteration.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      datesEl.textContent = `${start} — ${end}`;
    }

    // ── Stats ──
    const bugs     = qaStories.filter(s => s.story_type === 'bug');
    const features = qaStories.filter(s => s.story_type === 'feature');
    const chores   = qaStories.filter(s => s.story_type === 'chore');

    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setStat('ops-stat-total',    qaStories.length);
    setStat('ops-stat-bugs',     bugs.length);
    setStat('ops-stat-features', features.length);
    setStat('ops-stat-chores',   chores.length);

    // ── Render tickets ──
    renderOpsTickets(qaStories, stateMap);

    // ── Wire filter buttons (once) ──
    document.querySelectorAll('.ops-filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.ops-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        opsCurrentFilter = btn.dataset.filter;
        renderOpsTickets(qaStories, stateMap);
      };
    });

  } catch (err) {
    console.error('[LCARS OPS] Error:', err);
    listEl.innerHTML = `<div class="lcars-error" style="padding:20px;">MISSION DATA UNAVAILABLE: ${escapeHtml(err.message)}</div>`;
  }
}

function renderOpsTickets(qaStories, stateMap) {
  const listEl = document.getElementById('ops-ticket-list');
  if (!listEl) return;

  const filtered = opsCurrentFilter === 'all'
    ? qaStories
    : qaStories.filter(s => s.story_type === opsCurrentFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="lcars-empty" style="padding:20px;">NO ${opsCurrentFilter.toUpperCase()} STORIES IN QA</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(story => {
    const storyType = (story.story_type || 'story').toLowerCase();
    const stateName = (stateMap[story.workflow_state_id] || 'UNKNOWN').toUpperCase();
    const ownersStr = story.owner_ids?.length > 0 ? `${story.owner_ids.length} ASSIGNED` : 'UNASSIGNED';
    const appUrl    = escapeHtml(story.app_url || '#');

    return `
      <div class="ops-ticket-card" data-type="${storyType}" onclick="window.open('${appUrl}', '_blank')">
        <div class="ops-ticket-header">
          <span class="ticket-id">SC-${story.id}</span>
          <div class="ops-ticket-tags">
            <span class="lcars-tag type-${storyType}">${storyType.toUpperCase()}</span>
            <span class="lcars-tag status-qa">${stateName}</span>
          </div>
          <span class="ops-ticket-pts">${story.estimate != null ? story.estimate + ' PTS' : '— PTS'}</span>
        </div>
        <div class="ops-ticket-name">${escapeHtml(story.name)}</div>
        <div class="ops-ticket-footer">
          <span class="ops-ticket-owner">${ownersStr}</span>
          <span class="ops-open-link">OPEN IN SHORTCUT ↗</span>
        </div>
      </div>
    `;
  }).join('');
}

// Initial load
fetchShortcutQATickets();

if (LCARS_CONFIG.shortcutRefreshInterval) {
  setInterval(fetchShortcutQATickets, LCARS_CONFIG.shortcutRefreshInterval);
}
