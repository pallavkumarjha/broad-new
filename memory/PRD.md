# Broad — The Rider's Companion (PRD)

## Vision
Quiet, considered, analog companion app for motorcycle riders in India. Built around four pillars:
**Plan · Ride together · SOS · Glovebox** (Glovebox deferred from V1).

## V1.0 — What Shipped
1. **Auth** — Email + password (JWT, bcrypt). Token stored in expo-secure-store / localStorage.
2. **Home Dashboard** — Greeting, quick actions (Plan / Find), upcoming trips, active trip card, "field note" quote card.
3. **Trip Planner** — Pick start / end / waypoints from curated India presets (Bangalore, Coorg, Manali, Leh, Spiti, Goa, Pondicherry, Shimla). Live-computed distance + elevation estimate. Crew names + packing notes.
4. **Trip Detail** — Pre-ride briefing with topographic SVG map, route stats, waypoints list, crew avatars, START / OPEN INSTRUMENT PANEL CTA.
5. **Live Ride (DARK)** — Instrument-panel aesthetic. Mocked GPS progresses along route. Live speedometer (Fraunces 72pt), top speed, elapsed time, distance covered. Convoy list with mocked riders (speed, fuel, position). Hold-to-trigger SOS button (1.2s).
6. **SOS Active (DARK)** — Critical alert with blinking dot, broadcast log, location/speed spec rows, 2s "I AM SAFE" hold-to-resolve button.
7. **Trips Archive** — Active / Upcoming / Past tabs with editorial journal-entry styling.
8. **Discover** — Public open-invite rides feed with hero imagery.
9. **Profile** — Stats (total km, trips, highest point), bike spec card, emergency contacts, sign-out, settings entry.
10. **Trip Complete** — "Safely home" summary with stats and field note.
11. **Settings** — Background location, crash detection, share live location, haptics toggles.

## Design Language (per provided spec)
- **Palette:** Paper #F7F5F0 / Ink #1C1B1A / Amber #D96606 (light); Obsidian #0A0A0A / Amber #FF8C00 (dark for Live Ride & SOS).
- **Typography:** Fraunces serif (variable optical size) for headlines/body/numerals; JetBrains Mono UPPERCASED with wide tracking for metadata, eyebrows, coordinates, units.
- **Layout:** Print-editorial — eyebrow / headline / deck / body / 1px rule. Tiny 2px radius. No drop shadows, no chrome, no emojis.
- **Map:** SVG-based topographic placeholder (grid + contour rings + route line + compass) — fits the analog aesthetic and works on iOS / Android / web preview without needing an API key.

## Tech
- **Backend:** FastAPI · Motor (MongoDB async) · PyJWT · bcrypt. All routes prefixed `/api`.
- **Frontend:** Expo SDK 54 · expo-router file-based routing · @expo-google-fonts/{fraunces, jetbrains-mono} · @expo/vector-icons (Feather) · react-native-svg · expo-secure-store · axios.
- **Auth:** JWT Bearer, 14-day access token. Auto-seed `rider@broad.app` / `rider123` with full bike, emergency contacts, stats, and 3 sample trips.

## Mocked
- Live convoy member positions, speed, fuel (server-generated per trip).
- Live GPS during Live Ride (frontend interpolates progress along the planned route).

## Deferred (V1.1+)
- Glovebox (encrypted document vault with PIN/biometric)
- Real WebSocket convoy fanout
- Mapbox / MapLibre tiles + OSM road data
- Phone OTP auth + DigiLocker integration
- Convoy chat (voice notes + text)
- Onboarding permissions screens
- Hindi & Kannada localisation
