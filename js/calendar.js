// LCARS Mission Schedule — today's and tomorrow's Google Calendar events on SYS.
// Uses the Gmail sign-in (email.js) with the added calendar.readonly scope.

async function loadCalendar() {
  const el = document.getElementById('calendar-widget');
  if (!el || !gmailAccessToken) return;

  const header = `<div class="lcars-panel-header">MISSION SCHEDULE — TODAY &amp; TOMORROW</div>`;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 2);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '15',
  });

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${gmailAccessToken}` },
    });
    if (res.status === 403 || res.status === 401) {
      const body = await res.text();
      if (/SERVICE_DISABLED|accessNotConfigured|has not been used/i.test(body)) {
        el.innerHTML = `${header}
          <div class="lcars-setup-prompt">
            <span class="lcars-label">GOOGLE CALENDAR API NOT ENABLED</span>
            <ol class="setup-steps">
              <li>Open <strong>console.cloud.google.com</strong> → your Gmail project</li>
              <li>APIs &amp; Services → <strong>Enable APIs</strong> → enable <strong>Google Calendar API</strong></li>
              <li>Reload the dashboard (⌘R)</li>
            </ol>
          </div>`;
      } else {
        // Signed in before the calendar scope was added — needs one more consent
        el.innerHTML = `${header}
          <div class="lcars-label" style="color: var(--lcars-yellow); margin-bottom: 4px;">CALENDAR ACCESS REQUIRED</div>
          <div class="lcars-label" style="font-size: 11px; color: #666;">GOOGLE WILL ASK YOU TO ALLOW READ-ONLY CALENDAR ACCESS</div>`;
        const btn = document.createElement('button');
        btn.className = 'lcars-button';
        btn.textContent = 'AUTHORIZE CALENDAR';
        btn.onclick = () => gmailTokenClient.requestAccessToken({ prompt: 'consent' });
        el.appendChild(btn);
      }
      return;
    }
    if (!res.ok) throw new Error(`CALENDAR API ${res.status}`);
    const data = await res.json();
    renderCalendar(el, header, data.items || []);
  } catch (e) {
    el.innerHTML = `${header}<div class="lcars-error">SCHEDULE UNAVAILABLE: ${launchEscape(e.message)}</div>`;
  }
}

function renderCalendar(el, header, events) {
  if (!events.length) {
    el.innerHTML = `${header}<div class="lcars-empty">NO SCHEDULED EVENTS — OPEN SCHEDULE</div>`;
    return;
  }
  const today = new Date().toDateString();
  const now = Date.now();
  let lastDay = null;

  el.innerHTML = header + events.map(ev => {
    const allDay = !ev.start.dateTime;
    const startD = new Date(ev.start.dateTime || `${ev.start.date}T00:00:00`);
    const endD = new Date(ev.end.dateTime || `${ev.end.date}T00:00:00`);
    const dayLabel = startD.toDateString() === today ? 'TODAY' : 'TOMORROW';
    const divider = dayLabel !== lastDay ? `<div class="cal-day">${dayLabel}</div>` : '';
    lastDay = dayLabel;
    const live = !allDay && startD <= now && endD > now;
    const past = endD <= now;
    const time = allDay ? 'ALL DAY'
      : `${startD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    return `${divider}
      <div class="cal-event ${live ? 'live' : ''} ${past ? 'past' : ''}">
        <span class="cal-time">${time}</span>
        <span class="cal-title">${launchEscape(ev.summary || '(NO TITLE)')}</span>
        ${live ? '<span class="lcars-tag cal-now">NOW</span>' : ''}
      </div>`;
  }).join('');
}

// Refresh every 10 minutes while signed in
setInterval(() => { if (gmailAccessToken) loadCalendar(); }, 10 * 60e3);
