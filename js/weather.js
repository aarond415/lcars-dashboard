// LCARS Weather Module — Open-Meteo API (free, no key required)

const WMO_CODES = {
  0:  'CLEAR SKIES',
  1:  'MOSTLY CLEAR',
  2:  'PARTLY CLOUDY',
  3:  'OVERCAST',
  45: 'FOGGY',
  48: 'RIME FOG',
  51: 'LIGHT DRIZZLE',
  53: 'DRIZZLE',
  55: 'HEAVY DRIZZLE',
  61: 'LIGHT RAIN',
  63: 'RAIN',
  65: 'HEAVY RAIN',
  71: 'LIGHT SNOW',
  73: 'SNOW',
  75: 'HEAVY SNOW',
  80: 'SHOWERS',
  81: 'RAIN SHOWERS',
  82: 'VIOLENT SHOWERS',
  95: 'THUNDERSTORM',
  99: 'SEVERE STORM',
};

// WMO code → icon (Unicode weather glyphs)
const WMO_ICONS = {
  0: '☀', 1: '🌤', 2: '⛅', 3: '☁',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '❄', 73: '❄', 75: '❄',
  80: '🌦', 81: '🌧', 82: '⛈',
  95: '⛈', 99: '⛈',
};

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.current;
}

async function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GEOLOCATION NOT AVAILABLE'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

async function reverseGeocode(lat, lon) {
  // Use the Open-Meteo geocoding API to get city name
  try {
    // Use a simple lat/lon display as fallback
    const absLon = Math.abs(lon);
    const lonDir = lon < 0 ? 'W' : 'E';
    const latDir = lat < 0 ? 'S' : 'N';
    return `${Math.abs(lat).toFixed(2)}°${latDir} ${absLon.toFixed(2)}°${lonDir}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

async function initWeather() {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  widget.innerHTML = `
    <div class="lcars-panel-header">ATMOSPHERIC CONDITIONS</div>
    <div class="lcars-loading blink">SCANNING SENSORS...</div>
  `;

  try {
    let lat = LCARS_CONFIG.location.lat;
    let lon = LCARS_CONFIG.location.lon;
    let city = LCARS_CONFIG.location.city;

    // Attempt geolocation
    try {
      const coords = await getUserLocation();
      lat = coords.latitude;
      lon = coords.longitude;
      city = await reverseGeocode(lat, lon);
    } catch (geoErr) {
      // Silently fall back to config location
      console.info('[LCARS Weather] Using config fallback location:', geoErr.message);
    }

    const weather = await fetchWeather(lat, lon);
    const code = weather.weather_code;
    const condition = WMO_CODES[code] || 'UNKNOWN';
    const icon = WMO_ICONS[code] || '—';
    const temp = Math.round(weather.temperature_2m);
    const feelsLike = Math.round(weather.apparent_temperature);
    const humidity = weather.relative_humidity_2m;
    const wind = Math.round(weather.wind_speed_10m);

    // Update status widget
    const weatherStatus = document.getElementById('weather-status');
    if (weatherStatus) {
      weatherStatus.textContent = 'ONLINE';
      weatherStatus.className = 'lcars-value status-ok';
      const dot = weatherStatus.closest('.status-row')?.querySelector('.status-indicator');
      if (dot) { dot.className = 'status-indicator status-green'; }
    }

    widget.innerHTML = `
      <div class="lcars-panel-header">ATMOSPHERIC CONDITIONS</div>
      <div class="weather-location lcars-label">${city.toUpperCase()}</div>
      <div class="weather-temp">${temp}<span class="weather-unit">°F</span></div>
      <div class="weather-condition lcars-value">${icon} ${condition}</div>
      <div class="lcars-data-row">
        <span class="lcars-label">FEELS LIKE</span>
        <span class="lcars-value">${feelsLike}°F</span>
      </div>
      <div class="lcars-data-row">
        <span class="lcars-label">HUMIDITY</span>
        <span class="lcars-value">${humidity}%</span>
      </div>
      <div class="lcars-data-row">
        <span class="lcars-label">WIND</span>
        <span class="lcars-value">${wind} MPH</span>
      </div>
    `;
  } catch (err) {
    console.error('[LCARS Weather] Error:', err);

    const weatherStatus = document.getElementById('weather-status');
    if (weatherStatus) {
      weatherStatus.textContent = 'ERROR';
      weatherStatus.className = 'lcars-value status-err';
      const dot = weatherStatus.closest('.status-row')?.querySelector('.status-indicator');
      if (dot) dot.className = 'status-indicator status-red';
    }

    // Keep header, append error
    const existing = widget.querySelector('.lcars-panel-header');
    widget.innerHTML = `
      <div class="lcars-panel-header">ATMOSPHERIC CONDITIONS</div>
      <div class="lcars-error">SENSOR ERROR: ${err.message}</div>
    `;
  }
}

// Initial load
initWeather();

// Refresh on interval
if (LCARS_CONFIG.weatherRefreshInterval) {
  setInterval(initWeather, LCARS_CONFIG.weatherRefreshInterval);
}
