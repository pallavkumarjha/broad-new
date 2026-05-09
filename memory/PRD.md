# Broad — The Rider's Companion (PRD)

## Vision
Quiet, considered, analog companion app for motorcycle riders in India. Built around four pillars:
**Plan · Ride together · SOS · Glovebox**

## V1.2 — Editorial Redesign Pass

End-to-end redesign of Profile, Edit Profile, Settings, and Home using the existing print-editorial design system (Fraunces serif + JetBrains Mono + paper/ink/amber tokens). No real images — SVG illustrations only. Reduced visual chrome (1px rules over Card backgrounds), dramatic typographic scale, and chip-first input where text typing was excessive.

### Profile screen
- Deterministic dummy avatar (ui-avatars, no upload flow)
- 72pt Fraunces "instrument" numeral promoted for lifetime distance (design-system scale was defined but unused)
- Mini-stat strip below hero: trips / highest point / badges, divider-separated
- Achievements list → horizontal scrollable tile strip (scales past 4 badges without expanding the page)
- Bike spec Card collapsed into single tappable row (`Make Model` headline + `REG · ODO KM` mono sub) — saved ~210pt vertical
- Emergency contacts: inline `+ ADD` amber affordance in section head
- Glovebox: dropped ghost doc chips, tightened to single row
- Sign-out demoted from footer; canonical home is now Settings · Danger Zone

### Edit Profile screen — chip-first UX
- Reusable `Chip` primitive (ink-fill active, 1px-rule idle)
- **Rider type** chip select (`solo / crew / commuter / mixed`) — schema field existed since V1.1 but was never editable
- Bike make: chip grid of top 15 India makes + `Other → text fallback`
- Bike model: cascading suggestion chips per selected make + free-text fallback
- Odometer: numeric input + quick-add chips (`+100 / +500 / +1k / +5k`)
- Contact relation: chip select (`Spouse / Parent / Sibling / Child / Friend / Crew / Doctor / Other`) — was free text
- Registration + odometer use mono font for plate / numeral feel
- Sticky save bar: equal-width Cancel ghost + Save primary
- **Always-text fields reduced from 7 to 3** (name, registration, contact name + phone)

### Settings screen
- Card chrome dropped → bare 1px-rule rows divided by section
- **Identity card** at top (avatar + name + email → tap routes to edit profile)
- **ACCOUNT** section: edit profile nav, push-notifications toggle
- **RIDE** kept (background location, crash detection, share live location)
- **FEEL**: haptics toggle + units segment (KM / MI)
- **ABOUT**: version badge + Terms / Privacy / Help nav rows (was static text card)
- **DANGER ZONE**: Sign out + Delete account, both behind native confirm sheets
- `SettingsContext` extended with `pushEnabled: boolean`
- Push toggle wired to backend (`DELETE /users/me/push-token` on off)

### Home screen
- Default hero illustration removed (eats fold) — kept only as zero-rides empty state
- Lifetime stats row removed (Profile owns it now — single source of truth)
- Top strip: minimal date + home_city + name + INBOX dot (no floating bell button or numeric badge)
- New `HorizonStrip` SVG illustration (56pt: cream sky, layered ridges, amber sun + road line) added to `illustrations.tsx`
- **Brief poster** (when there's a next planned ride): italic light "In" + bold display countdown (spelled out for ≤ 10 days, numeric after) + 22pt "days." + right-side spec stack (KM / CREW)
- **Active hero** (when a trip is in progress): dark obsidian card + amber progress bar (KM done %) + 3-stat split (KM DONE / KM LEFT / CREW) + DAY {N} pulse derived from `started_at`
- **Approved-join inline tag** (only when present)
- **Monthly micro-stat ribbon** ("320 km this month, four trips.") — derived from completed trips with `ended_at` in current month
- **The Docket**: numbered upcoming list (`01 / 02 / 03` mono) with serif title + right-aligned mono date+dow column. Date pill / crew pill stutter from V1.1 dropped.
- **Page-break quote**: field note moved between docket and postcard, italic Fraunces between rules
- **Postcard last ride**: existing `MountainIllus` art + corner PEAK altitude stamp (`elevation_m`) + dashed-rule stat row (KM / HRS · MOVING / CREW). Replaces TripIllus card.
- Quick actions demoted to two compact rows under em-dash kicker
- **Colophon** footer ("BROAD · MADE IN INDIA")

### Backend additions
- `DELETE /users/me/push-token` — clears stored Expo token when user toggles push notifications off
- `DELETE /users/me` — hard-delete user account. Cascades: refresh tokens, notifications, trip requests. Trips with crew are intentionally preserved (organiser can vanish without erasing other riders' planned rides). Stale references already tolerated by readers.
- `UpdateUserIn` already accepted `rider_type` in V1.1 — exposed in UI for the first time in V1.2

### Cleanup pass (post-redesign)
- Dropped `Theme · Dark mode coming soon` SegmentRow stub from Settings
- Dropped `DATA · Export ride history` placeholder section from Settings
- Removed orphan `DawnIllus` export from `illustrations.tsx` (zero callers)
- Removed unused `Button` import from Profile

## V1.1 — Round 2 Completions (items 7-18 from audit)
- **Real maps** — Replaced SVG topo placeholder with Leaflet + OSM / CartoDB tiles (iframe on web, WebView on native). Light theme on Plan / Trip Detail / Complete; dark theme on Live Ride & SOS.
- **Real place search** — New `/api/places/search` proxies Nominatim (OSM). Plan picker now has a search box that returns real India-restricted results; the 9 hardcoded presets are only the initial list.
- **Real elevation** — New `/api/places/elevation` proxies Open-Elevation. Plan screen shows a live "HIGH POINT" metric in metres for the current route. Saved trips store the real elevation.
- **Per-trip hero images** — Discover cards now use keyword-bucketed Unsplash images keyed deterministically by trip id (Himalaya / Ghats / Coast / default).
- **Rotating field notes** — Home's "Field Note" quote rotates daily from a library of 6 quotes; Trip Complete's field note rotates per-trip with a stat subtitle.
- **Persistent Settings** — Settings toggles now live in a `SettingsContext` backed by `expo-secure-store` / `localStorage` and survive app restarts.
- **Profile edit** — New `/profile/edit` screen lets riders update name, bike (make/model/reg/odometer), and emergency contacts (add/remove). Saves via `PATCH /api/users/me`.
- **Onboarding redirect** — After sign-up, new riders go to `/profile/edit?onboarding=1` with a welcome header + SKIP FOR NOW option, so new accounts aren't blank.
- **SOS resolve confirmation** — After the 2s "I AM SAFE" hold, users see a dedicated `/sos/safe/[id]` screen ("Stay safe.") for 6s before returning to Home.
- **Glovebox shipped** — Device-only document vault is now live, protected by biometric / device auth, with secure local storage for RC book, insurance, driving licence, and medical information. No server upload.
- **Live convoy fanout shipped** — Backend now exposes `/api/ws/convoy/{trip_id}` and Live Ride consumes it for real-time crew position updates and SOS event broadcast.
- **Onboarding permissions shipped** — Dedicated permissions flow now exists for location, notifications, and crash detection before rider setup continues.

## Tech additions in V1.1
- `httpx` on backend for Nominatim + Open-Elevation proxies
- `react-native-webview` for native map rendering; `<iframe srcDoc>` for web
- `SettingsContext` with secure-store / localStorage persistence
- WebSocket convoy transport for live ride updates
- Device-auth-protected Glovebox storage flow

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
## Later Phase Todo
- Phone OTP auth + DigiLocker integration
- Convoy chat (voice notes + text)
- Hindi & Kannada localisation
- Mapbox / MapLibre tiles + OSM road data
