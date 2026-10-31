# LCARS Daily Operations Dashboard

A Star Trek TNG-styled personal daily dashboard built with vanilla HTML, CSS, and JavaScript. No build step — runs directly in the browser and deploys to GitHub Pages or any static host.

![LCARS Dashboard](https://img.shields.io/badge/style-LCARS-FF9900?style=flat-square) ![Vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20JS-blue?style=flat-square)

---

## Tabs

| Tab | Label | What it shows |
|-----|-------|---------------|
| SYS | SYSTEMS | Clock, Stardate, weather, alert condition, next visible launch, unread email, today's calendar |
| COM | COMM ARRAY | Full Gmail inbox with HTML rendering and reply capability |
| MET | METEOROLOGY | NWS watches/warnings, 7-day and 24-hour forecast, NHC tropical outlook |
| NAV | NAVIGATION | Earth's orbit, NASA ISS live camera, ESA ISS map, ISS telemetry, moon phase, sunrise/sunset, world clocks |
| AST | ASTROMETRICS | Planets visible tonight with a sky map, rise/set times, and visible ISS passes over your location |
| OPS | OPERATIONS | Worldwide launch manifest with countdowns; launches visible from your location are flagged |
| SCI | SCIENCE | NASA APOD, NOAA space weather / Kp index, near-Earth objects, earthquakes, ISS crew |
| MED | MEDICAL | Environmental bioscan, air quality, hydration log, Pomodoro timer |
| ENG | ENGINEERING | Live browser/hardware diagnostics — CPU, memory, GPU, battery, network, storage |
| SEC | SECURITY | Network identity, HIBP k-anonymity password breach checker, Krebs on Security feed |

### Across every tab

- **Red Alert** — NWS warnings for hurricanes, tropical storms, tornadoes etc. (or any Severe/Extreme alert) turn the frame red and pulsing with a banner; other watches/advisories show a yellow banner. Preview with `lcarsTestAlert('red')`, `'yellow'` or `'clear'` in the browser console.
- **Sounds** — synthesized LCARS chirps and alert tones; toggle with **AUDIO** in the bottom bar.
- **Display mode** — press **D** for full screen, an idle-hidden cursor and automatic tab rotation (SYS → NAV → MET → OPS → AST → SCI every minute; clicking a tab pauses it for 5 minutes).
- **Keyboard** — **R** refreshes widgets, **D** toggles display mode.
- **Stardate** — TNG-era mapping: 41000 in 1987, +1000 per year.

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
5. Also enable the **Google Calendar API** (for the SYS mission schedule)
6. Click **AUTHORIZE COMM LINK** on first launch — your session is then stored locally and reused automatically

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

The app also adds:

- **Dock badge** with your unread inbox count
- **Notifications** for new weather alerts, Pomodoro sessions, visible launches (10 min before) and visible ISS passes (5 min before), while LCARS is running
- **LCARS → Open at Login**
- **View → Display Mode** (⇧⌘D) — full screen, keeps the display awake, rotates tabs

The app serves the dashboard from `http://127.0.0.1:47823` (loopback only, with a random per-launch path token) rather than a custom scheme, because YouTube won't play embedded videos without a web address.

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
| Astronomy picture | [science.nasa.gov APOD feed](https://science.nasa.gov/apod/), falling back to [NASA APOD API](https://api.nasa.gov) | No / Yes (free) |
| Space weather | [NOAA SWPC](https://www.swpc.noaa.gov/products/real-time-solar-wind) | No |
| Near-Earth objects | [NASA NeoWs](https://api.nasa.gov) | Yes (free) |
| Earthquakes | [USGS GeoJSON Feed](https://earthquake.usgs.gov/earthquakes/feed/) | No |
| ISS position | [wheretheiss.at](https://wheretheiss.at/) | No |
| ISS live video | [NASA HDEV / YouTube](https://eol.jsc.nasa.gov/ESRS/HDEV/) | No |
| ISS map | [ESA ISS Tracker](https://isstracker.spaceflight.esa.int/) | No |
| ISS orbit (passes) | [CelesTrak](https://celestrak.org/) TLE + [satellite.js](https://github.com/shashwatak/satellite-js) | No |
| Planet positions | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (bundled) | No |
| Rocket launches | [Launch Library 2](https://thespacedevs.com/llapi) | No |
| Weather alerts | [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | No |
| Tropical outlook | [National Hurricane Center](https://www.nhc.noaa.gov/) | No |
| Calendar | [Google Calendar API](https://developers.google.com/calendar) (same sign-in as Gmail) | Yes (free) |
| Password breach check | [HIBP k-anonymity API](https://haveibeenpwned.com/API/v3) | No |
| Security news | [Krebs on Security](https://krebsonsecurity.com/) via rss2json.com | No |

---

## Project Structure

```
lcars-dashboard/
├── index.html            — All 10 views defined
├── config.js             — Your API tokens and preferences (fill this in)
├── css/
│   ├── lcars.css         — LCARS design system (colors, components, elbows, fonts)
│   └── dashboard.css     — Layout, widget sizing, view-specific styles
├── js/
│   ├── app.js            — Boot sequence, view routing, keyboard shortcuts
│   ├── native.js         — Bridge to the macOS app (badge, notifications, display mode)
│   ├── sounds.js         — Synthesized LCARS sounds + audio toggle
│   ├── clock.js          — Live time, date, Stardate
│   ├── weather.js        — Open-Meteo current weather
│   ├── alerts.js         — NWS alerts and red/yellow alert condition
│   ├── meteorology.js    — MET tab: forecast, alerts, tropical outlook
│   ├── email.js          — Gmail REST API, inbox, HTML rendering, reply
│   ├── calendar.js       — SYS mission schedule (Google Calendar)
│   ├── navigation.js     — Orbit plot, ISS camera/map/telemetry, moon, world clocks
│   ├── astrometrics.js   — AST tab: sky tonight, ISS visible passes
│   ├── launches.js       — OPS tab: launch manifest and countdowns
│   ├── medical.js        — Pomodoro, hydration, UV, air quality
│   ├── engineering.js    — Browser/hardware diagnostics via Web APIs
│   ├── security.js       — Network identity, HIBP checker, security news feed
│   ├── science.js        — APOD, space weather, NEOs, earthquakes, crew in space
│   ├── display.js        — Display mode (full screen, tab rotation)
│   └── vendor/           — Astronomy Engine, satellite.js (MIT)
└── macos/                — Native macOS app (see "macOS App")
```
