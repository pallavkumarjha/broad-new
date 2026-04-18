# Broad — The Rider's Companion

A motorcycle touring app: plan trips, track rides live with your crew, log stats,
trigger SOS. Originally scaffolded in Emergent, now runs on your own infra.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React Native + Expo (SDK 54, expo-router), runs on iOS / Android / Web |
| Backend | Python 3.13 · FastAPI · Uvicorn · Motor (async MongoDB) |
| Database | MongoDB Atlas (free M0 tier is plenty for dev) |
| Auth | JWT (bcrypt password hashing) |
| External APIs | OpenStreetMap Nominatim (geocoding), Open-Elevation (altitude) |

---

## Prerequisites

Make sure these are installed on your machine:

- **Node.js 20+** (`node -v`)
- **Python 3.11+** (`python3 -V`)
- **Corepack** (ships with Node; enables yarn) — `corepack enable`
- **A MongoDB Atlas account** — https://www.mongodb.com/cloud/atlas/register

---

## First-time setup

### 1. MongoDB Atlas

1. Create a free **M0** cluster
2. **Database Access** → add a user with "Read and write to any database"
3. **Network Access** → allow your IP (or `0.0.0.0/0` for dev)
4. **Database → Connect → Drivers → Python** → copy the `mongodb+srv://...` URI
5. Replace `<db_password>` in the URI with your actual password
   (URL-encode it if it has special characters like `@`, `:`, `/`, `#`, `?`, `&`, `%`)

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=broad
JWT_SECRET=<generate with: python3 -c "import secrets; print(secrets.token_urlsafe(48))">
ADMIN_EMAIL=rider@broad.app
ADMIN_PASSWORD=rider123
```

On first boot the backend auto-seeds your Atlas DB with an admin user and 3 sample trips.

### 3. Frontend

```bash
cd frontend
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
```

Create `frontend/.env`:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

> **Testing on a physical phone?** `localhost` won't reach your Mac from the phone.
> Use your LAN IP instead: `EXPO_PUBLIC_BACKEND_URL=http://<your-mac-lan-ip>:8001`
> Get your IP with `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux).
> After changing `.env`, restart Expo with `yarn start --clear`.

---

## Daily run commands

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn server:app --reload --port 8001
```
- API: http://localhost:8001/api/
- Swagger UI: http://localhost:8001/docs

**Terminal 2 — Frontend:**
```bash
cd frontend
yarn web        # browser
# or
yarn ios        # iOS simulator
yarn android    # Android emulator
yarn start      # choose target interactively (QR code for Expo Go on phone)
```

**Default login:**
- Email: `rider@broad.app`
- Password: `rider123`

---

## Environment variables reference

### `backend/.env`
| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB Atlas SRV connection string |
| `DB_NAME` | ✅ | Database name inside the cluster (default: `broad`) |
| `JWT_SECRET` | ✅ | Secret key for signing auth tokens. Rotate for prod. |
| `ADMIN_EMAIL` | ➖ | Seed admin email (default `rider@broad.app`) |
| `ADMIN_PASSWORD` | ➖ | Seed admin password (default `rider123`) |

### `frontend/.env`
| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | ✅ | Base URL the app calls for `/api/*` |

> Only variables prefixed with `EXPO_PUBLIC_` are exposed to the client bundle.

---

## Project structure

```
.
├── backend/
│   ├── server.py            # FastAPI app — all routes, models, seed logic
│   ├── requirements.txt     # Python deps
│   ├── .env                 # ⛔ gitignored — create locally
│   └── .venv/               # ⛔ gitignored — your virtualenv
│
├── frontend/
│   ├── app/                 # expo-router screens (file-based routing)
│   │   ├── (auth)/          #   login / register
│   │   ├── (tabs)/          #   discover, trips, profile, home
│   │   ├── ride/            #   active ride / convoy
│   │   ├── plan.tsx         #   trip planner
│   │   ├── sos/             #   emergency screen
│   │   └── _layout.tsx      #   root layout
│   ├── src/
│   │   ├── lib/api.ts       # axios client + token storage
│   │   ├── contexts/        # Auth + Settings providers
│   │   ├── components/      # Map, SOSButton, UI primitives
│   │   └── theme/           # Design tokens
│   ├── package.json         # Expo SDK 54, React Native 0.81
│   └── .env                 # ⛔ gitignored — create locally
│
├── .emergent/               # Emergent platform metadata (can be ignored)
└── README.md                # you are here
```

---

## API surface (what the frontend actually calls)

All routes prefixed `/api`. Auth required except `/auth/*` and `/`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/auth/register` | Sign up → returns JWT |
| `POST` | `/auth/login` | Log in → returns JWT |
| `GET` | `/auth/me` | Current user |
| `PATCH` | `/users/me` | Update profile (name, bike, emergency contacts) |
| `GET` | `/users/search?q=` | Find riders by name (crew invites) |
| `GET` | `/users/me/achievements` | Derived badges + aggregate stats |
| `GET` | `/trips` | My trips (owned + crewed) |
| `GET` | `/trips/discover` | Public trips |
| `POST` | `/trips` | Plan a new trip |
| `GET` | `/trips/{id}` | Trip detail |
| `PATCH` | `/trips/{id}` | Start / end / update trip |
| `DELETE` | `/trips/{id}` | Delete trip |
| `GET` | `/trips/{id}/convoy` | Mocked convoy snapshot |
| `POST` | `/sos` | Trigger SOS |
| `POST` | `/sos/{id}/resolve` | Resolve SOS |
| `GET` | `/sos/active` | My active SOS (if any) |
| `GET` | `/places/search?q=` | Geocode via OpenStreetMap |
| `POST` | `/places/elevation` | Altitude for waypoints via Open-Elevation |
| `WS` | `/ws/convoy/{trip_id}?token=` | Real-time crew positions (in-memory) |

---

## MongoDB collections

| Collection | Indexed on | Docs hold |
|---|---|---|
| `users` | `email` (unique) | profile, bike, password hash, emergency contacts, stats |
| `trips` | `user_id`, `is_public` | route, waypoints, status, crew, performance data |
| `sos_events` | — | lat/lng/speed snapshot + active/resolved state |

---

## Troubleshooting

**Backend crashes with `pymongo.errors.ConfigurationError: DNS query name does not exist`**
Your `MONGO_URL` still has `<cluster>` or other placeholder text — paste the real Atlas URI.

**Backend crashes with `ServerSelectionTimeoutError`**
Your IP isn't in the Atlas Network Access allowlist. Add it or use `0.0.0.0/0` for dev.

**Frontend calls go to `undefined/api/...`**
`frontend/.env` is missing or `EXPO_PUBLIC_BACKEND_URL` isn't set. Restart Expo with `--clear`.

**Physical phone can't reach the backend**
Swap `localhost` for your Mac's LAN IP in `frontend/.env`, then `yarn start --clear`.

**`yarn` command not found**
`corepack enable && corepack prepare yarn@1.22.22 --activate`

**I changed `backend/.env` but the server doesn't see new values**
Restart uvicorn — `.env` is only read on startup.

---

## Security notes

- `backend/.env` and `frontend/.env` are gitignored — never commit them
- JWT tokens are stored in `expo-secure-store` (iOS Keychain / Android Keystore) on device,
  and `localStorage` on web
- Passwords are hashed with bcrypt (cost 12)
- Convoy WebSocket auth is via `?token=<jwt>` query param (manually decoded in `server.py`)
- Rotate `JWT_SECRET` and Atlas DB password before anything production-facing

---

## License

TBD.
