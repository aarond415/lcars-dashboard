// LCARS Clock — Live date/time + Stardate calculation

function calcStardate(now) {
  // TNG-era mapping: Stardate 41000 began in 1987 (TNG season 1), and each
  // year adds 1000. The fraction of the year gives the digits after that.
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const yearMs = new Date(year + 1, 0, 1) - start;
  return (41000 + 1000 * (year - 1987) + 1000 * (now - start) / yearMs).toFixed(1);
}

function updateClock() {
  const now = new Date();
  const stardate = calcStardate(now);
  const stardateStr = `STARDATE ${stardate}`;

  // Top bar stardate
  const topStardate = document.getElementById('stardate');
  if (topStardate) topStardate.textContent = stardateStr;

  // Datetime widget stardate
  const widgetStardate = document.getElementById('stardate-widget');
  if (widgetStardate) widgetStardate.textContent = stardate;

  // Time display — 24hr
  const timeStr = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Date display — full readable
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();

  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

// Tick every second
setInterval(updateClock, 1000);
updateClock();
