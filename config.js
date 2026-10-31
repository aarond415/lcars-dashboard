// LCARS Dashboard Configuration
// Edit this file to configure your dashboard

const LCARS_CONFIG = {
  // Fallback location if geolocation is denied (lat, lon)
  location: {
    lat: 40.7128,
    lon: -74.0060,
    city: 'New York'
  },

  // Gmail OAuth Client ID - get from Google Cloud Console
  gmailClientId: 'YOUR_GMAIL_CLIENT_ID.apps.googleusercontent.com',

  // Gmail OAuth Client ID for the macOS app (Google Cloud → OAuth client type "iOS",
  // bundle ID com.aarond415.lcars). The web client ID above is used in a browser.
  gmailMacClientId: 'YOUR_GMAIL_MAC_CLIENT_ID.apps.googleusercontent.com',

  // Weather refresh interval in milliseconds (default: 10 minutes)
  weatherRefreshInterval: 10 * 60 * 1000,

  // NASA API key - free at https://api.nasa.gov (DEMO_KEY works but is rate-limited)
  nasaApiKey: 'YOUR_NASA_API_KEY',
};
