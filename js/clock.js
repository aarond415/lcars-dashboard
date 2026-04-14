// LCARS Clock — Live date/time + Stardate calculation

function calcStardate(now) {
  // TNG stardate formula: 1000 * (year - 2323) + (dayOfYear / 365) * 1000
  const year = now.getFullYear();
  const start = new Date(year, 0, 0);
  const diff = now - start;
  const oneDay = 86400000;
  const dayOfYear = Math.floor(diff / oneDay);
  return (1000 * (year - 2323) + Math.floor((dayOfYear / 365) * 1000)).toFixed(1);
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
