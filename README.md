# LCARS Daily Operations Dashboard

A Star Trek TNG-styled personal daily dashboard built with vanilla HTML, CSS, and JavaScript. No build step — runs directly in the browser and deploys to GitHub Pages or any static host.

![LCARS Dashboard](https://img.shields.io/badge/style-LCARS-FF9900?style=flat-square) ![Vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20JS-blue?style=flat-square)

---

## Tabs

| Tab | Label | What it shows |
|-----|-------|---------------|
| SYS | SYSTEMS | Live clock, Stardate, weather, unread email preview |
| COM | COMM ARRAY | Full Gmail inbox with HTML rendering and reply capability |
| NAV | NAVIGATION | Earth's orbital position, moon phase, ISS live tracker, world clocks, sunrise/sunset |
| MED | MEDICAL | Habit tracker, Pomodoro timer, hydration log, UV index, air quality |
| ENG | ENGINEERING | Live browser/hardware diagnostics — CPU, memory, GPU, battery, network, storage |
| SEC | SECURITY | Network identity, HIBP k-anonymity password breach checker, Krebs on Security feed |
| SCI | SCIENCE | NASA APOD, NOAA space weather / Kp index, near-Earth objects, earthquakes, ISS crew |

---

## Quick Start

Serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> **Note:** Geolocation and Gmail OAuth require `localhost` or HTTPS. Opening via `file://` works for everything except Gmail.

---

## Configuration

Edit `config.js` and fill in your credentials:

```js
const LCARS_CONFIG = {
  location: { lat: 40.7128, lon: -74.0060, city: 'New York' },
  gmailClientId: 'YOUR_GMAIL_CLIENT_ID.apps.googleusercontent.com',
  nasaApiKey: 'YOUR_NASA_API_KEY',
  // ...
};
```

---

### Weather

No setup needed. The dashboard prompts for browser geolocation and falls back to the coordinates in `config.js`.

Powered by [Open-Meteo](https://open-meteo.com/) — free, no key required.

---

### Gmail

Gmail requires a Google Cloud OAuth 2.0 setup:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project and enable the **Gmail API** under APIs & Services
3. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: your serving URL (e.g. `http://localhost:8080`)
4. Copy the **Client ID** into `config.js → gmailClientId`
5. Click **AUTHORIZE COMM LINK** on first launch — your session is then stored locally and reused automatically

---

### NASA APOD (SCI tab)

1. Get a free key at [api.nasa.gov](https://api.nasa.gov)
2. Paste it into `config.js → nasaApiKey`

`DEMO_KEY` works but is rate-limited to 30 requests/hour.

---

## macOS App

`macos/` wraps the dashboard in a native Mac app (Swift + WKWebView) with a combadge icon, so it launches from the Dock without a server.

```bash
macos/build.sh --install
```

This builds `LCARS.app`, bundles the dashboard files into it and copies it to `/Applications`. Re-run it after changing any dashboard file. It needs Xcode installed (it doesn't need to be the selected toolchain). To edit the app code in Xcode, open `macos/Package.swift`.

Gmail sign-in works differently in the app, because Google blocks its web sign-in pop-up inside apps. The app uses the system sign-in sheet instead, which needs a second OAuth client ID:

1. In Google Cloud Console → **Credentials → Create Credentials → OAuth 2.0 Client ID**, choose type **iOS**
2. Bundle ID: `com.aarond415.lcars`
3. Copy the Client ID into `config.js → gmailMacClientId` and run `macos/build.sh --install`

After the first sign-in, the app keeps a refresh token in your Keychain and signs in silently.

---

## Hosting on a Raspberry Pi

Install nginx and copy files to the web root:

```bash
sudo apt update && sudo apt install nginx -y
sudo cp -r /path/to/lcars-dashboard/* /var/www/html/
```

For remote access, [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) gives you a free public HTTPS URL without port forwarding.

After changing your URL, add the new origin to your Google OAuth Client ID's authorized list in Google Cloud Console.

---

## APIs Used

| Data | Source | Key required |
|------|--------|-------------|
| Weather & air quality | [Open-Meteo](https://open-meteo.com/) | No |
| Gmail | [Gmail REST API](https://developers.google.com/gmail/api) + Google Identity Services OAuth | Yes (free) |
| Astronomy picture | [NASA APOD](https://api.nasa.gov) | Yes (free) |
| Space weather | [NOAA SWPC](https://www.swpc.noaa.gov/products/real-time-solar-wind) | No |
| Near-Earth objects | [NASA NeoWs](https://api.nasa.gov) | Yes (free) |
| Earthquakes | [USGS GeoJSON Feed](https://earthquake.usgs.gov/earthquakes/feed/) | No |
| ISS position | [wheretheiss.at](https://wheretheiss.at/) | No |
| Password breach check | [HIBP k-anonymity API](https://haveibeenpwned.com/API/v3) | No |
| Security news | [Krebs on Security](https://krebsonsecurity.com/) via rss2json.com | No |

---

## Project Structure

```
lcars-dashboard/
├── index.html          — All 7 views defined
├── config.js           — Your API tokens and preferences (fill this in)
├── css/
│   ├── lcars.css       — LCARS design system (colors, components, elbows, fonts)
│   └── dashboard.css   — Layout, widget sizing, view-specific styles
└── js/
    ├── app.js          — Boot sequence, view routing, keyboard shortcuts
    ├── clock.js        — Live time, date, Stardate (TNG formula)
    ├── weather.js      — Open-Meteo weather + air quality
    ├── email.js        — Gmail REST API, inbox, HTML rendering, reply
    ├── navigation.js   — Orbital mechanics, ISS tracking, moon phase, world clocks
    ├── medical.js      — Habit tracker, Pomodoro, hydration (localStorage)
    ├── engineering.js  — Browser/hardware diagnostics via Web APIs
    ├── security.js     — Network identity, HIBP checker, security news feed
    └── science.js      — NASA APOD, space weather, NEOs, earthquakes, crew in space
```
