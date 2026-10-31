// LCARS Email Module — Gmail REST API via Google Identity Services (GIS)
// Uses direct fetch() with Bearer token — no gapi dependency.

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

let gmailAccessToken = null;
let gmailTokenClient = null;
let cachedMessages = []; // shared between dashboard widget + comms view
let currentDetailMessage = null; // currently open email in COMM view

const GMAIL_TOKEN_KEY = 'lcars_gmail_token';

function saveToken(tokenResponse) {
  const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000;
  localStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify({
    access_token: tokenResponse.access_token,
    expires_at: expiresAt,
  }));
}

function loadStoredToken() {
  try {
    const d = JSON.parse(localStorage.getItem(GMAIL_TOKEN_KEY));
    if (d && d.access_token && d.expires_at > Date.now() + 60_000) {
      return d.access_token; // valid for at least another minute
    }
  } catch {}
  return null;
}

function clearStoredToken() {
  localStorage.removeItem(GMAIL_TOKEN_KEY);
}

// ── NATIVE APP AUTH ──
// Inside the macOS app, Google blocks the GIS pop-up, so sign-in goes through
// the app's native bridge (see macos/Sources/LCARS/GmailAuth.swift). It mimics
// the GIS token client: prompt 'none' = silent refresh, otherwise interactive.

function isNativeApp() {
  return !!(window.LCARS_NATIVE && window.webkit?.messageHandlers?.lcarsGmail);
}

function createNativeTokenClient(clientId, callback) {
  window.lcarsGmailNative = { onResult: callback };
  return {
    requestAccessToken: ({ prompt } = {}) => window.webkit.messageHandlers.lcarsGmail.postMessage({
      action: prompt === 'none' ? 'refresh' : 'signIn',
      clientId,
      scopes: GMAIL_SCOPES,
    }),
  };
}

function gmailClientId() {
  return isNativeApp() ? LCARS_CONFIG.gmailMacClientId : LCARS_CONFIG.gmailClientId;
}

// ── UTILITIES ──

function renderEmailWidget(html) {
  const widget = document.getElementById('email-widget');
  if (widget) widget.innerHTML = html;
}

function updateGmailStatus(text, level) {
  const el = document.getElementById('gmail-status');
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

function decodeBase64url(str) {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    // Handle UTF-8
    return decodeURIComponent(
      decoded.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
  } catch {
    return '';
  }
}

// Returns { html, text } — preferring HTML for rich rendering, text as fallback
function extractBody(payload) {
  if (!payload) return { html: '', text: '' };

  // Direct plain text
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    const text = decodeBase64url(payload.body.data);
    return { html: '', text };
  }
  // Direct HTML
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return { html: decodeBase64url(payload.body.data), text: '' };
  }
  // Multipart — collect both parts
  if (payload.parts) {
    let html = '';
    let text = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data)  html = decodeBase64url(part.body.data);
      if (part.mimeType === 'text/plain' && part.body?.data) text = decodeBase64url(part.body.data);
      // Recurse into nested multipart
      if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractBody(part);
        if (nested.html) html = nested.html;
        if (nested.text) text = nested.text;
      }
    }
    return { html, text };
  }
  return { html: '', text: '' };
}

// ── GMAIL FETCH ──

async function gmailFetch(path, options = {}) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${gmailAccessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GMAIL API ${res.status}: ${body.substring(0, 120)}`);
  }
  return res.json();
}

// ── DASHBOARD WIDGET: compact inbox preview ──

async function loadEmails() {
  try {
    renderEmailWidget(`
      <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
      <div class="lcars-loading blink">DECRYPTING COMM BUFFER...</div>
    `);

    const listData = await gmailFetch('/messages?maxResults=10&labelIds=INBOX&q=is:unread');
    const messages = listData.messages || [];
    cachedMessages = messages;

    if (messages.length === 0) {
      renderEmailWidget(`
        <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
        <div class="lcars-empty">NO UNREAD MESSAGES — COMM CHANNELS CLEAR</div>
      `);
      updateGmailStatus('CLEAR', 'ok');
      return;
    }

    const details = await Promise.all(
      messages.slice(0, 10).map(async (m) => {
        const msg = await gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        );
        const headers = msg.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || '';
        return { id: m.id, threadId: m.threadId, from: get('From'), subject: get('Subject'), date: get('Date') };
      })
    );

    // Cache enriched messages for COMM view
    cachedMessages = details;

    let html = `
      <div class="lcars-panel-header">
        INCOMING TRANSMISSIONS
        <span class="lcars-count">[${messages.length} UNREAD]</span>
      </div>
      <div class="email-list">
    `;

    details.forEach((email) => {
      const displayName = email.from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || email.from;
      let dateStr = '—';
      try {
        const d = new Date(email.date);
        const isToday = d.toDateString() === new Date().toDateString();
        dateStr = isToday
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      } catch {}

      html += `
        <div class="email-row">
          <span class="email-from">${escapeHtml(displayName.toUpperCase().substring(0, 28))}</span>
          <span class="email-subject">${escapeHtml(email.subject || '(NO SUBJECT)')}</span>
          <span class="email-time">${dateStr}</span>
        </div>
      `;
    });

    html += `</div>`;
    renderEmailWidget(html);
    updateGmailStatus(`${messages.length} UNREAD`, 'ok');

  } catch (err) {
    console.error('[LCARS Email] loadEmails error:', err);
    renderEmailWidget(`
      <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
      <div class="lcars-error">COMM ERROR: ${escapeHtml(err.message)}</div>
    `);
    updateGmailStatus('ERROR', 'err');
  }
}

// ── COMM VIEW: full inbox list ──

async function loadCommsView() {
  if (!gmailAccessToken) {
    // Not authorized yet — show the auth prompt in the comms panel too
    const inboxList = document.getElementById('comms-inbox-list');
    if (inboxList) {
      inboxList.innerHTML = `
        <div class="lcars-label" style="padding: 16px; color: var(--lcars-yellow);">
          AUTHORIZATION REQUIRED
        </div>
        <div style="padding: 0 16px;">
          <button class="lcars-button" onclick="document.getElementById('email-widget').querySelector('.lcars-button')?.click()">
            AUTHORIZE COMM LINK
          </button>
        </div>
      `;
    }
    return;
  }

  const inboxList = document.getElementById('comms-inbox-list');
  const unreadCount = document.getElementById('comms-unread-count');
  if (!inboxList) return;

  inboxList.innerHTML = `<div class="lcars-loading blink">ACCESSING COMM ARRAY...</div>`;

  try {
    // Fetch more messages for the full view
    const listData = await gmailFetch('/messages?maxResults=25&labelIds=INBOX');
    const messages = listData.messages || [];

    if (unreadCount) unreadCount.textContent = `[${messages.length}]`;

    if (messages.length === 0) {
      inboxList.innerHTML = `<div class="lcars-empty" style="padding: 20px;">INBOX CLEAR — NO TRANSMISSIONS</div>`;
      return;
    }

    // Fetch metadata for all messages
    const details = await Promise.all(
      messages.map(async (m) => {
        const msg = await gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        );
        const headers = msg.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || '';
        const labelIds = msg.labelIds || [];
        return {
          id: m.id,
          threadId: m.threadId,
          from: get('From'),
          subject: get('Subject'),
          date: get('Date'),
          unread: labelIds.includes('UNREAD'),
        };
      })
    );

    inboxList.innerHTML = details.map((email, idx) => {
      const displayName = email.from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || email.from;
      let dateStr = '—';
      try {
        const d = new Date(email.date);
        const isToday = d.toDateString() === new Date().toDateString();
        dateStr = isToday
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      } catch {}

      return `
        <div class="comms-inbox-row ${email.unread ? 'unread' : ''}"
             data-id="${email.id}"
             data-thread="${email.threadId}"
             data-from="${escapeHtml(email.from)}"
             data-subject="${escapeHtml(email.subject || '(NO SUBJECT)')}"
             data-date="${escapeHtml(email.date)}"
             onclick="openEmailDetail(this)">
          <div class="comms-unread-dot ${email.unread ? 'is-unread' : ''}"></div>
          <div class="comms-inbox-row-body">
            <div class="comms-inbox-from">${escapeHtml(displayName.substring(0, 30).toUpperCase())}</div>
            <div class="comms-inbox-subject">${escapeHtml((email.subject || '(NO SUBJECT)').substring(0, 55))}</div>
          </div>
          <div class="comms-inbox-time">${dateStr}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('[LCARS Email] loadCommsView error:', err);
    inboxList.innerHTML = `<div class="lcars-error" style="padding: 16px;">COMM ERROR: ${escapeHtml(err.message)}</div>`;
  }
}

// ── EMAIL DETAIL VIEW ──

window.openEmailDetail = async function(rowEl) {
  // Highlight selected row
  document.querySelectorAll('.comms-inbox-row').forEach(r => r.classList.remove('selected'));
  rowEl.classList.add('selected');
  rowEl.classList.remove('unread');
  rowEl.querySelector('.comms-unread-dot')?.classList.remove('is-unread');

  const id = rowEl.dataset.id;
  const threadId = rowEl.dataset.thread;
  const fromRaw = rowEl.dataset.from;
  const subject = rowEl.dataset.subject;
  const date = rowEl.dataset.date;

  // Show detail panel with loading state
  document.getElementById('comms-detail-empty').style.display = 'none';
  const detailContent = document.getElementById('comms-detail-content');
  detailContent.style.display = 'flex';

  document.getElementById('detail-from').textContent = fromRaw;
  document.getElementById('detail-subject').textContent = subject;
  document.getElementById('detail-date').textContent = new Date(date).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }).toUpperCase();
  document.getElementById('detail-body').innerHTML = '<span style="color:#555;letter-spacing:1px;font-family:Antonio,sans-serif;">DECRYPTING MESSAGE BODY...</span>';
  document.getElementById('detail-to').textContent = '—';
  document.getElementById('reply-textarea').value = '';
  document.getElementById('reply-status').textContent = '';

  // Store for reply use
  currentDetailMessage = { id, threadId, from: fromRaw, subject };

  // Set up reply button
  document.getElementById('reply-send-btn').onclick = () => sendReply();
  document.getElementById('reply-clear-btn').onclick = () => {
    document.getElementById('reply-textarea').value = '';
    document.getElementById('reply-status').textContent = '';
  };

  try {
    const msg = await gmailFetch(`/messages/${id}?format=full`);
    const headers = msg.payload?.headers || [];
    const get = (name) => headers.find(h => h.name === name)?.value || '';

    document.getElementById('detail-to').textContent = get('To') || '(UNDISCLOSED)';

    const { html, text } = extractBody(msg.payload);
    const bodyEl = document.getElementById('detail-body');

    if (html) {
      // Render in a sandboxed iframe so email CSS can't bleed into the dashboard
      const iframe = document.createElement('iframe');
      iframe.className = 'comms-email-iframe';
      iframe.sandbox = 'allow-same-origin allow-popups';
      iframe.scrolling = 'yes';
      bodyEl.innerHTML = '';
      bodyEl.appendChild(iframe);

      // Inject email HTML with a dark-friendly base style
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  html, body {
    margin: 0; padding: 8px;
    background: #080808;
    color: #cccccc;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
  }
  a { color: #9999FF; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  * { box-sizing: border-box; }
</style>
</head>
<body>${html}</body>
</html>`);
      iframeDoc.close();

      // Auto-size iframe to content height
      const resize = () => {
        try {
          const h = iframeDoc.body.scrollHeight;
          iframe.style.height = Math.min(h, 600) + 'px';
        } catch {}
      };
      iframe.onload = resize;
      setTimeout(resize, 200);

    } else {
      // Plain text fallback
      bodyEl.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'comms-body';
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = text || '(NO BODY CONTENT)';
      bodyEl.appendChild(pre);
    }

  } catch (err) {
    document.getElementById('detail-body').textContent = `ERROR RETRIEVING MESSAGE: ${err.message}`;
  }
};

// ── SEND REPLY ──

async function sendReply() {
  if (!currentDetailMessage) return;
  const textarea = document.getElementById('reply-textarea');
  const statusEl = document.getElementById('reply-status');
  const sendBtn = document.getElementById('reply-send-btn');
  const body = textarea.value.trim();

  if (!body) {
    statusEl.textContent = '⚠ NO TRANSMISSION BODY';
    statusEl.style.color = 'var(--lcars-yellow)';
    return;
  }

  sendBtn.disabled = true;
  statusEl.textContent = 'TRANSMITTING...';
  statusEl.style.color = 'var(--lcars-orange)';

  try {
    const { from, subject, threadId, id } = currentDetailMessage;

    // Extract reply-to address
    const toMatch = from.match(/<([^>]+)>/);
    const toAddress = toMatch ? toMatch[1] : from;

    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    const messageParts = [
      `To: ${toAddress}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${id}`,
      `References: ${id}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `MIME-Version: 1.0`,
      '',
      body,
    ];

    const rawMessage = messageParts.join('\r\n');
    // Base64url encode
    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmailFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: encoded, threadId }),
    });

    statusEl.textContent = '✓ TRANSMISSION SUCCESSFUL';
    statusEl.style.color = 'var(--lcars-teal)';
    textarea.value = '';

  } catch (err) {
    console.error('[LCARS Email] sendReply error:', err);
    statusEl.textContent = `TRANSMISSION FAILED: ${err.message.substring(0, 60)}`;
    statusEl.style.color = 'var(--lcars-red)';
  } finally {
    sendBtn.disabled = false;
  }
}

// ── INIT ──

function showAuthButton() {
  const widget = document.getElementById('email-widget');
  if (!widget) return;
  widget.innerHTML = `
    <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
    <div class="lcars-label" style="margin-bottom: 4px; color: var(--lcars-yellow);">
      AUTHORIZATION REQUIRED TO ACCESS COMM ARRAY
    </div>
    <div class="lcars-label" style="margin-bottom: 12px; font-size: 11px; color: #666;">
      ${isNativeApp()
        ? 'SIGN-IN OPENS IN A SECURE GOOGLE WINDOW'
        : `ENSURE <span style="color: var(--lcars-teal);">${window.location.origin}</span> IS IN YOUR GOOGLE OAUTH AUTHORIZED ORIGINS`}
    </div>
  `;
  const btn = document.createElement('button');
  btn.className = 'lcars-button';
  btn.textContent = 'AUTHORIZE COMM LINK';
  btn.onclick = () => gmailTokenClient.requestAccessToken({ prompt: '' });
  widget.appendChild(btn);
  updateGmailStatus('AWAITING AUTH', 'warn');
}

async function initGmail() {
  const widget = document.getElementById('email-widget');
  if (!widget) return;

  const clientId = gmailClientId();
  if (!clientId || clientId.startsWith('YOUR_')) {
    const steps = isNativeApp() ? `
          <li>Navigate to <strong>console.cloud.google.com</strong> → your Gmail project</li>
          <li>Go to <strong>Credentials → Create OAuth 2.0 Client ID</strong> (type <strong>iOS</strong>)</li>
          <li>Bundle ID: <strong>com.aarond415.lcars</strong></li>
          <li>Copy the Client ID into <code>config.js → gmailMacClientId</code> and rebuild the app</li>
    ` : `
          <li>Navigate to <strong>console.cloud.google.com</strong></li>
          <li>Create a project and enable the <strong>Gmail API</strong></li>
          <li>Go to <strong>Credentials → Create OAuth 2.0 Client ID</strong> (Web application)</li>
          <li>Add your origin to Authorized JavaScript Origins</li>
          <li>Copy the Client ID into <code>config.js → gmailClientId</code></li>
    `;
    widget.innerHTML = `
      <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
      <div class="lcars-setup-prompt">
        <span class="lcars-label">GMAIL ACCESS NOT CONFIGURED</span>
        <ol class="setup-steps">${steps}</ol>
      </div>
    `;
    updateGmailStatus('UNCONFIGURED', 'warn');
    return;
  }

  // Use stored token if still valid — no popup needed
  const stored = loadStoredToken();
  if (stored) {
    gmailAccessToken = stored;
    updateGmailStatus('AUTHORIZED', 'ok');
    await loadEmails();
    // GIS still initializes below for silent background token refresh
  } else {
    widget.innerHTML = `
      <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
      <div class="lcars-loading blink">ESTABLISHING COMM LINK...</div>
    `;
    updateGmailStatus('LOADING', 'warn');
  }

  const onToken = async (tokenResponse) => {
    if (tokenResponse.error) {
      clearStoredToken();
      if (!gmailAccessToken) showAuthButton();
      return;
    }
    gmailAccessToken = tokenResponse.access_token;
    saveToken(tokenResponse);
    updateGmailStatus('AUTHORIZED', 'ok');
    // Renew silently shortly before expiry so a long-running session stays signed in
    clearTimeout(window._gmailRefreshTimer);
    window._gmailRefreshTimer = setTimeout(
      () => gmailTokenClient.requestAccessToken({ prompt: 'none' }),
      Math.max(60, (tokenResponse.expires_in || 3600) - 300) * 1000,
    );
    await loadEmails();
  };

  try {
    if (isNativeApp()) {
      gmailTokenClient = createNativeTokenClient(clientId, onToken);
    } else {
      await new Promise((resolve, reject) => {
        if (typeof google !== 'undefined' && google.accounts) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        script.onerror = () => reject(new Error('FAILED TO LOAD GOOGLE IDENTITY SERVICES'));
        document.head.appendChild(script);
      });

      gmailTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPES,
        callback: onToken,
      });
    }

    if (!stored) {
      // No valid stored token — show the auth button immediately
      showAuthButton();
    }
    // Attempt a silent token refresh in the background regardless
    gmailTokenClient.requestAccessToken({ prompt: 'none' });

  } catch (err) {
    console.error('[LCARS Email] Init error:', err);
    if (!gmailAccessToken) {
      widget.innerHTML = `
        <div class="lcars-panel-header">INCOMING TRANSMISSIONS</div>
        <div class="lcars-error">INITIALIZATION FAILURE: ${escapeHtml(err.message)}</div>
      `;
      updateGmailStatus('INIT ERROR', 'err');
    }
  }
}

initGmail();
