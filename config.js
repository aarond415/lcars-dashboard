// LCARS Dashboard Configuration
// Edit this file to configure your dashboard

const LCARS_CONFIG = {
  // Shortcut API token - get from https://app.shortcut.com/settings/account/api-tokens
  shortcutApiToken: 'YOUR_SHORTCUT_API_TOKEN',

  // Fallback location if geolocation is denied (lat, lon)
  location: {
    lat: 40.7128,
    lon: -74.0060,
    city: 'New York'
  },

  // Gmail OAuth Client ID - get from Google Cloud Console
  gmailClientId: 'YOUR_GMAIL_CLIENT_ID.apps.googleusercontent.com',

  // Weather refresh interval in milliseconds (default: 10 minutes)
  weatherRefreshInterval: 10 * 60 * 1000,

  // Shortcut refresh interval (default: 5 minutes)
  shortcutRefreshInterval: 5 * 60 * 1000,

  // Your Shortcut workspace slug (appears in your Shortcut URL)
  shortcutWorkspace: '',

  // NASA API key - free at https://api.nasa.gov (DEMO_KEY works but is rate-limited)
  nasaApiKey: 'YOUR_NASA_API_KEY',
};
