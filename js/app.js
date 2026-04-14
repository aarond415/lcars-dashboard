// LCARS Dashboard — Main App Initializer
// Stardate: initialized on load

document.addEventListener('DOMContentLoaded', () => {

  // ── STARTUP FADE-IN ──
  const frame = document.getElementById('lcars-frame');
  if (frame) {
    frame.style.opacity = '0';
    setTimeout(() => {
      frame.style.transition = 'opacity 0.8s ease';
      frame.style.opacity = '1';
    }, 80);
  }

  // ── BOOT SEQUENCE MESSAGES ──
  const statusEl = document.getElementById('system-status');
  const bottomStatusEl = document.getElementById('bottom-system-status');

  const bootMessages = [
    'INITIALIZING LCARS V47.2...',
    'LOADING SYSTEM MODULES...',
    'ESTABLISHING NETWORK CONNECTIONS...',
    'CALIBRATING ATMOSPHERIC SENSORS...',
    'ACCESSING COMM ARRAY...',
    'LOADING MISSION DATABASE...',
    'ALL SYSTEMS NOMINAL',
  ];

  let i = 0;
  const bootInterval = setInterval(() => {
    const msg = bootMessages[i];
    if (statusEl) statusEl.textContent = msg;
    if (bottomStatusEl) bottomStatusEl.textContent = msg;
    i++;
    if (i >= bootMessages.length) {
      clearInterval(bootInterval);
    }
  }, 380);

  // ── VIEW NAVIGATION ──
  const VIEW_TITLES = {
    dashboard: 'LCARS DAILY OPERATIONS',
    comms:     'COMM ARRAY — TRANSMISSIONS',
    ops:       'OPS — MISSION CONTROL',
    eng:       'ENGINEERING — COMPUTER CORE DIAGNOSTICS',
    med:       'MEDICAL — BIOSYSTEM ANALYSIS',
    nav:       'NAVIGATION — STELLAR CARTOGRAPHY',
    sec:       'SECURITY — THREAT ASSESSMENT',
    sci:       'SCIENCE — STELLAR CARTOGRAPHY & ANALYSIS',
  };

  function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.lcars-view').forEach(v => v.classList.remove('active'));
    // Show target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');
    // Update sidebar active state
    document.querySelectorAll('.sidebar-block').forEach(b => b.classList.remove('sb-active'));
    const activeBlock = document.querySelector(`.sidebar-block[data-view="${viewId}"]`);
    if (activeBlock) activeBlock.classList.add('sb-active');
    // Update bar title
    const titleEl = document.querySelector('.bar-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[viewId] || 'LCARS';
    // If navigating to comms, load the inbox
    if (viewId === 'comms' && typeof loadCommsView === 'function') {
      loadCommsView();
    }
    if (viewId === 'ops' && typeof loadOpsView === 'function') {
      loadOpsView();
    }
    if (viewId === 'med' && typeof loadMedView === 'function') {
      loadMedView();
    }
    if (viewId === 'nav' && typeof loadNavView === 'function') {
      loadNavView();
    }
    if (viewId === 'eng' && typeof loadEngView === 'function') {
      loadEngView();
    }
    if (viewId === 'sec' && typeof loadSecView === 'function') {
      loadSecView();
    }
    if (viewId === 'sci' && typeof loadSciView === 'function') {
      loadSciView();
    }
  }

  // ── SIDEBAR BLOCK INTERACTIONS ──
  document.querySelectorAll('.sidebar-block').forEach((block) => {
    block.addEventListener('click', () => {
      // Flash effect
      block.style.filter = 'brightness(2.5)';
      setTimeout(() => {
        block.style.filter = '';
      }, 180);

      const moduleName = block.textContent.trim();
      const viewTarget = block.dataset.view;

      // Navigate if this block has a view
      if (viewTarget) {
        navigateTo(viewTarget);
        if (bottomStatusEl) {
          bottomStatusEl.textContent = `${moduleName} MODULE ACTIVE`;
        }
      } else {
        // Non-navigable blocks: just flash status
        if (bottomStatusEl) {
          bottomStatusEl.textContent = `${moduleName} MODULE SELECTED`;
          clearTimeout(window._statusResetTimer);
          window._statusResetTimer = setTimeout(() => {
            bottomStatusEl.textContent = 'ALL SYSTEMS NOMINAL';
          }, 3000);
        }
      }
    });
  });

  // Activate dashboard view by default
  navigateTo('dashboard');

  // ── NETWORK STATUS MONITOR ──
  function updateNetworkStatus() {
    const el = document.getElementById('net-status');
    if (!el) return;
    if (navigator.onLine) {
      el.textContent = 'ONLINE';
      el.className = 'lcars-value status-ok';
      const dot = el.closest('.status-row')?.querySelector('.status-indicator');
      if (dot) dot.className = 'status-indicator status-green';
    } else {
      el.textContent = 'OFFLINE';
      el.className = 'lcars-value status-err';
      const dot = el.closest('.status-row')?.querySelector('.status-indicator');
      if (dot) dot.className = 'status-indicator status-red';
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  // ── KEYBOARD SHORTCUTS ──
  document.addEventListener('keydown', (e) => {
    // Press 'R' to refresh all widgets
    if (e.key === 'r' || e.key === 'R') {
      if (e.ctrlKey || e.metaKey) return; // don't intercept browser reload
      if (document.activeElement.tagName === 'INPUT') return;
      if (document.activeElement.tagName === 'TEXTAREA') return;
      if (typeof initWeather === 'function') initWeather();
      if (typeof fetchShortcutQATickets === 'function') fetchShortcutQATickets();
      if (typeof loadCommsView === 'function') {
        const commsView = document.getElementById('view-comms');
        if (commsView?.classList.contains('active')) loadCommsView();
      }
      if (bottomStatusEl) {
        bottomStatusEl.textContent = 'REFRESHING ALL SENSORS...';
        setTimeout(() => { bottomStatusEl.textContent = 'ALL SYSTEMS NOMINAL'; }, 3000);
      }
    }
  });

  // ── STARDATE SYNC (widget mirror) ──
  // The clock.js handles updates; this ensures the widget stardate
  // is also kept in sync — clock.js already targets #stardate-widget
  // so this is just a sanity note.

  console.log('[LCARS] Dashboard initialized. Press R to refresh all widgets.');
});
