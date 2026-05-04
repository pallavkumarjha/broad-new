from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import time
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt as pyjwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, EmailStr


# ---------- Logging (must be before first use) ----------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("broad")


# ---------- Rate limiter (in-memory, per (scope, key)) ----------
# NOTE: Single-instance only. Scaling beyond one uvicorn worker requires a
# Redis-backed store — swap _rl_store for a RedisTimeWindow once deployed behind a
# load balancer. See docs/ops/rate-limiting.md (TODO) for the migration.
_rl_store: dict = defaultdict(list)

def _rate_limit(key: str, max_hits: int = 10, window: int = 60, scope: str = "default") -> None:
    """Raise HTTP 429 if `key` has exceeded `max_hits` calls within `window` seconds in `scope`.
    No-ops entirely when RATE_LIMIT_DISABLED=1 — used by the test suite."""
    if os.environ.get("RATE_LIMIT_DISABLED") == "1":
        return
    bucket = f"{scope}:{key}"
    now = time.monotonic()
    hits = _rl_store[bucket]
    _rl_store[bucket] = [t for t in hits if now - t < window]
    if len(_rl_store[bucket]) >= max_hits:
        raise HTTPException(status_code=429, detail="Too many requests — try again later")
    _rl_store[bucket].append(now)


def _client_ip(request: Request) -> str:
    # Honour X-Forwarded-For when present (set by trusted reverse proxies like Render/Fly)
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# ---------- App ----------
app = FastAPI(title="Broad — The Rider's Companion API")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# ---------- Helpers ----------
# bcrypt work factor. 10 rounds ≈ 2025-safe for interactive logins and is ~4×
# faster than the library default of 12 — a meaningful latency win on Railway's
# free-tier CPU (bcrypt is the single dominant cost of /auth/login and
# /auth/register). Raise to 12+ only after moving off shared CPU.
BCRYPT_ROUNDS = 10


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


ACCESS_TOKEN_TTL = timedelta(hours=2)
REFRESH_TOKEN_TTL = timedelta(days=30)


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_TTL,
        "type": "access",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGO)


def create_refresh_token(user_id: str, jti: str) -> str:
    """Long-lived refresh token. `jti` is stored server-side so we can revoke it."""
    payload = {
        "sub": user_id,
        "jti": jti,
        "exp": datetime.now(timezone.utc) + REFRESH_TOKEN_TTL,
        "type": "refresh",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGO)


async def _issue_refresh(user_id: str, request: Request | None = None) -> str:
    """Create a refresh-token record in Mongo and return the signed JWT."""
    jti = str(uuid.uuid4())
    doc = {
        "jti": jti,
        "user_id": user_id,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + REFRESH_TOKEN_TTL).isoformat(),
        "revoked": False,
        "ip": _client_ip(request) if request else None,
        "user_agent": (request.headers.get("user-agent") if request else None),
    }
    await db.refresh_tokens.insert_one(doc)
    return create_refresh_token(user_id, jti)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class Bike(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    registration: Optional[str] = None
    odometer_km: Optional[int] = 0


class EmergencyContact(BaseModel):
    name: str
    phone: str
    relation: Optional[str] = None


class UserStats(BaseModel):
    total_km: float = 0
    trips_completed: int = 0
    highest_point_m: int = 0


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    bike: Bike = Field(default_factory=Bike)
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    stats: UserStats = Field(default_factory=UserStats)
    home_city: Optional[str] = None  # e.g. "Bangalore", "Manali" — filters Discover trips
    created_at: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str                      # short-lived access token (2 hours)
    refresh_token: Optional[str] = None  # long-lived refresh token (30 days) — Optional for back-compat
    user: UserPublic


class RefreshIn(BaseModel):
    refresh_token: str


class UpdateUserIn(BaseModel):
    name: Optional[str] = None
    bike: Optional[Bike] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    home_city: Optional[str] = None


class Waypoint(BaseModel):
    name: str
    lat: float
    lng: float


class TripCreate(BaseModel):
    name: str
    start: Waypoint
    end: Waypoint
    waypoints: List[Waypoint] = Field(default_factory=list)
    distance_km: float = 0
    elevation_m: int = 0
    planned_date: Optional[str] = None
    crew: List[str] = Field(default_factory=list)       # display names
    crew_ids: List[str] = Field(default_factory=list)   # user IDs for push notifications
    notes: Optional[str] = ""
    is_public: bool = False
    # ---- Public-trip fields (only meaningful when is_public=True) ----
    max_riders: int = 8                # cap including organiser; 2..50
    description: str = ""              # optional public-facing pitch
    city: str = ""                     # short region tag, e.g. "Bangalore" — used by Discover filter


class PushTokenIn(BaseModel):
    token: str


class Trip(TripCreate):
    id: str
    user_id: str
    status: Literal["planned", "active", "completed", "cancelled"] = "planned"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    actual_distance_km: float = 0
    top_speed_kmh: float = 0
    duration_min: int = 0
    created_at: str


class TripUpdate(BaseModel):
    # Status transitions
    status: Optional[Literal["planned", "active", "completed", "cancelled"]] = None
    # Ride stats — set at completion
    actual_distance_km: Optional[float] = Field(None, ge=0)
    top_speed_kmh: Optional[float] = Field(None, ge=0, le=400)
    duration_min: Optional[int] = Field(None, ge=0)
    # Editable metadata — organiser only, planned trips only.
    # Bounds match the frontend constraints; without these, a hand-crafted
    # PATCH could store empty names, 99999 max_riders, or arbitrary date strings.
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    # Strict YYYY-MM-DD; the frontend always serialises this shape, so a
    # mismatch here means a client bug we want to surface as 422.
    planned_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: Optional[str] = Field(None, max_length=2000)
    description: Optional[str] = Field(None, max_length=500)
    # Hard ceiling matches Plan/Edit screens. Floor of 1 is the absolute
    # minimum (organiser); we additionally enforce >= current crew_ids+1
    # at the endpoint level since that bound depends on the trip doc.
    max_riders: Optional[int] = Field(None, ge=1, le=50)


class TripRequestCreate(BaseModel):
    note: Optional[str] = ""


class TripRequest(BaseModel):
    id: str
    trip_id: str
    requested_by: str                 # user id
    requester_name: str
    requester_email: str
    note: str = ""
    status: Literal["pending", "approved", "declined", "cancelled"] = "pending"
    created_at: str
    decided_at: Optional[str] = None
    decided_by: Optional[str] = None  # organiser user id


class SOSCreate(BaseModel):
    trip_id: Optional[str] = None
    # Geo bounds validated by pydantic — ensures bogus payloads (lat=999, etc.)
    # never make it into the convoy fanout or the responder's map pin.
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    # Cap speed at the same ceiling we use for ConvoyHub pos validation.
    # Anything above _MAX_SPEED_KMH is GPS noise / a teleport.
    speed_kmh: float = Field(0, ge=0, le=400)
    # Heading is degrees clockwise from north. 360 lets the client send
    # a normalised wrap if it pre-modded; we clamp on read either way.
    heading_deg: float = Field(0, ge=0, le=360)
    note: Optional[str] = Field("", max_length=500)


class SOSEvent(SOSCreate):
    id: str
    user_id: str
    status: Literal["active", "resolved"] = "active"
    created_at: str
    resolved_at: Optional[str] = None


class SOSContact(BaseModel):
    name: str
    phone: str
    relation: Optional[str] = None


class SOSDetail(SOSEvent):
    sender_name: str
    sender_email: EmailStr
    emergency_contact: Optional[SOSContact] = None


class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    data: dict = Field(default_factory=dict)
    read: bool = False
    created_at: str


# ---------- Auth dependency ----------
async def get_current_user(request: Request) -> dict:
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def to_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u.get("name", ""),
        bike=Bike(**(u.get("bike") or {})),
        emergency_contacts=[EmergencyContact(**c) for c in (u.get("emergency_contacts") or [])],
        stats=UserStats(**(u.get("stats") or {})),
        home_city=u.get("home_city"),
        created_at=u.get("created_at", now_iso()),
    )


# ---------- Auth routes ----------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn, request: Request):
    # 5 registrations per hour per IP to stop account farming
    _rate_limit(_client_ip(request), max_hits=5, window=3600, scope="register")
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip() or "Rider",
        "bike": Bike().dict(),
        "emergency_contacts": [],
        "stats": UserStats().dict(),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(uid, email)
    refresh = await _issue_refresh(uid, request)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return AuthOut(token=token, refresh_token=refresh, user=to_public(doc))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn, request: Request):
    # 10 attempts per 5 minutes per IP — room for typos, hostile to brute-force
    _rate_limit(_client_ip(request), max_hits=10, window=300, scope="login")
    # Also rate-limit per-email so IP-hopping brute force hits a wall at the account
    _rate_limit(body.email.lower().strip(), max_hits=15, window=900, scope="login_email")
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    refresh = await _issue_refresh(user["id"], request)
    user.pop("password_hash", None)
    return AuthOut(token=token, refresh_token=refresh, user=to_public(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return to_public(user)


@api.post("/auth/refresh", response_model=AuthOut)
async def refresh_auth(body: RefreshIn, request: Request):
    """Exchange a valid refresh token for a new access token.
    Uses refresh-token rotation: old jti is revoked, new jti issued, so a stolen
    refresh token is only usable until its next legitimate refresh."""
    _rate_limit(_client_ip(request), max_hits=30, window=300, scope="refresh")
    try:
        payload = pyjwt.decode(body.refresh_token, get_jwt_secret(), algorithms=[JWT_ALGO])
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")
    jti = payload.get("jti")
    uid = payload.get("sub")
    if not jti or not uid:
        raise HTTPException(status_code=401, detail="Malformed refresh token")
    record = await db.refresh_tokens.find_one({"jti": jti})
    if not record or record.get("revoked"):
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    # Rotate: revoke old, issue new
    await db.refresh_tokens.update_one({"jti": jti}, {"$set": {"revoked": True, "revoked_at": now_iso()}})
    new_access = create_access_token(uid, user.get("email", ""))
    new_refresh = await _issue_refresh(uid, request)
    return AuthOut(token=new_access, refresh_token=new_refresh, user=to_public(user))


@api.post("/auth/logout")
async def logout(body: RefreshIn, user: dict = Depends(get_current_user)):
    """Revoke the supplied refresh token. Access tokens naturally expire (2h)."""
    try:
        payload = pyjwt.decode(body.refresh_token, get_jwt_secret(), algorithms=[JWT_ALGO])
        jti = payload.get("jti")
        if jti:
            await db.refresh_tokens.update_one(
                {"jti": jti, "user_id": user["id"]},
                {"$set": {"revoked": True, "revoked_at": now_iso()}},
            )
    except pyjwt.PyJWTError:
        pass  # Silently accept — logout should never fail from the user's perspective
    return {"ok": True}


@api.patch("/users/me", response_model=UserPublic)
async def update_me(body: UpdateUserIn, user: dict = Depends(get_current_user)):
    # Use model_fields_set so we can distinguish "field omitted" from "field sent as null".
    # Clients clear home_city by sending {"home_city": null} — the null path must reach Mongo.
    sent = body.model_fields_set
    update = {}
    if "name" in sent and body.name is not None:
        update["name"] = body.name.strip()
    if "bike" in sent and body.bike is not None:
        update["bike"] = body.bike.dict()
    if "emergency_contacts" in sent and body.emergency_contacts is not None:
        update["emergency_contacts"] = [c.dict() for c in body.emergency_contacts]
    if "home_city" in sent:
        update["home_city"] = body.home_city.strip() if body.home_city else None
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return to_public(fresh)


# ---------- Trip routes ----------
def trip_from_doc(d: dict) -> Trip:
    d = {k: v for k, v in d.items() if k != "_id"}
    return Trip(**d)


@api.post("/trips", response_model=Trip)
async def create_trip(body: TripCreate, user: dict = Depends(get_current_user)):
    # 30 trips/hour per user — generous for real planners, hostile to spam bots
    _rate_limit(user["id"], max_hits=30, window=3600, scope="create_trip")
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "user_id": user["id"],
        "status": "planned",
        "started_at": None,
        "ended_at": None,
        "actual_distance_km": 0,
        "top_speed_kmh": 0,
        "duration_min": 0,
        "created_at": now_iso(),
        **body.dict(),
    }
    await db.trips.insert_one(doc)
    return trip_from_doc(doc)


@api.get("/trips", response_model=List[Trip])
async def list_trips(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # A user's trip list includes trips they organised AND trips they're confirmed crew on.
    # The crew field is `crew_ids` (multikey); NOT `crew_members` — that field never existed
    # and was silently hiding approved-rider trips from the Trips tab.
    query = {"$or": [{"user_id": user["id"]}, {"crew_ids": user["id"]}]}
    if status:
        query["status"] = status
    cursor = db.trips.find(query, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [trip_from_doc(d) for d in docs]


@api.get("/trips/discover", response_model=List[Trip])
async def discover_trips(user: dict = Depends(get_current_user), show_all: bool = False):
    """Get public trips. If user has a home_city set, filter to that city unless show_all=True."""
    query = {"is_public": True, "status": {"$in": ["planned", "active"]}}

    # Filter by user's home city if set and show_all is False
    if not show_all:
        home_city = (user.get("home_city") or "").strip()
        if home_city:
            query["city"] = home_city

    cursor = db.trips.find(query, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [trip_from_doc(d) for d in docs]


@api.get("/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    is_organiser = doc["user_id"] == user["id"]
    is_confirmed_crew = user["id"] in (doc.get("crew_ids") or [])
    if not is_organiser and not is_confirmed_crew and not doc.get("is_public"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return trip_from_doc(doc)


# ---------- Background position update (REST fallback) ----------
# Background tasks on Android/iOS can't reliably hold a WebSocket open while
# the app is suspended. The background-location task ships pos updates here
# instead — REST fits the constrained execution window better, and the hub
# fanout reaches every other rider exactly the same way it does for live
# WS broadcasts.
class BackgroundPosIn(BaseModel):
    lat: float
    lng: float
    speed_kmh: float = 0
    heading_deg: float = 0
    accuracy_m: float | None = None


@api.post("/trips/{trip_id}/pos")
async def post_trip_pos(trip_id: str, body: BackgroundPosIn, user: dict = Depends(get_current_user)):
    """Submit one position sample. Used by the background-location task on the
    rider's phone; the server pipes it straight into ConvoyHub so other crew
    members see the update via their WebSocket."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "user_id": 1, "crew_ids": 1, "status": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    is_member = (trip.get("user_id") == user["id"]) or (user["id"] in (trip.get("crew_ids") or []))
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")
    if trip.get("status") != "active":
        # Background task may keep firing briefly after the trip ends — silently
        # accept-but-discard so the client doesn't keep retrying.
        return {"ok": False, "reason": "trip_not_active"}

    # Make sure the room has a slot for this rider before we update — they may
    # never have opened a WS this trip (background-only mode), but still want
    # their position fanned out to crew.
    room = hub.rooms.setdefault(trip_id, {})
    if user["id"] not in room:
        room[user["id"]] = {
            "name": user.get("name", "Rider"),
            "lat": None, "lng": None, "speed_kmh": 0, "heading_deg": 0, "accuracy_m": None,
            "updated_at": now_iso(), "sockets": {},
        }
    applied = await hub.update(trip_id, user["id"], body.dict())
    return {"ok": applied}


# ---------- Route geometry (road-following polyline) ----------
# Riders expect the live ride map to draw the actual road they'll be on, not
# straight lines between waypoints. We resolve those once per trip via OSRM
# and cache on the trip doc — the route doesn't change between fixings, and
# OSRM's public demo has aggressive rate limits we don't want to hit on
# every map render.
#
# Provider is configurable via OSRM_BASE_URL env so we can swap to a
# self-hosted instance later (Docker + India OSM extract, ~$5/mo) without
# touching the frontend.
_OSRM_BASE = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org")


async def _fetch_osrm_geometry(points: list[dict]) -> list[list[float]] | None:
    """Hit OSRM /route to get a road-following polyline through the waypoints.

    Returns a list of [lat, lng] pairs or None on failure. Never raises —
    callers fall back to straight-line rendering when this returns None so
    a flaky routing service doesn't break the ride screen entirely.
    """
    if len(points) < 2:
        return None
    # OSRM wants `lon,lat;lon,lat;...` (note the order — opposite of Leaflet).
    coords = ";".join(f"{p['lng']},{p['lat']}" for p in points if p.get("lat") is not None and p.get("lng") is not None)
    url = f"{_OSRM_BASE}/route/v1/driving/{coords}"
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(url, params={"overview": "full", "geometries": "geojson", "steps": "false"})
        if r.status_code != 200:
            return None
        data = r.json()
        routes = data.get("routes") or []
        if not routes:
            return None
        coords_lonlat = (((routes[0] or {}).get("geometry") or {}).get("coordinates")) or []
        # GeoJSON is [lon, lat]; we hand the frontend [lat, lng] so it can
        # feed Leaflet directly without flipping each pair on render.
        return [[c[1], c[0]] for c in coords_lonlat if len(c) >= 2]
    except Exception:
        return None


@api.get("/trips/{trip_id}/route-geometry")
async def trip_route_geometry(trip_id: str, user: dict = Depends(get_current_user)):
    """Return the road-following polyline for a trip as `[[lat, lng], ...]`.

    Cached on the trip document under `route_geometry`. The cache key is the
    sequence of waypoints (start + waypoints + end) so editing the route
    invalidates the cache. Members + organisers + public-trip viewers can
    fetch — anyone authorised to see the trip can see its line.
    """
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    is_organiser = doc["user_id"] == user["id"]
    is_confirmed_crew = user["id"] in (doc.get("crew_ids") or [])
    if not is_organiser and not is_confirmed_crew and not doc.get("is_public"):
        raise HTTPException(status_code=403, detail="Forbidden")

    waypoints = [doc.get("start"), *(doc.get("waypoints") or []), doc.get("end")]
    waypoints = [w for w in waypoints if w and w.get("lat") is not None]
    # Cache fingerprint — bumping this if the polyline algorithm changes
    # avoids serving stale geometry from the doc.
    fingerprint = "|".join(f"{round(w['lat'],4)},{round(w['lng'],4)}" for w in waypoints) + ":v1"

    cached = doc.get("route_geometry") or {}
    if cached.get("fingerprint") == fingerprint and cached.get("coords"):
        return {"coords": cached["coords"], "source": "cache"}

    coords = await _fetch_osrm_geometry(waypoints)
    if coords is None:
        # OSRM failed — fall back to straight-line waypoints. We don't cache
        # this so the next call retries the upstream.
        return {"coords": [[w["lat"], w["lng"]] for w in waypoints], "source": "fallback"}

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"route_geometry": {"fingerprint": fingerprint, "coords": coords, "fetched_at": now_iso()}}},
    )
    return {"coords": coords, "source": "osrm"}


@api.patch("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, body: TripUpdate, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in body.dict(exclude_none=True).items()}
    # Metadata edits (name, planned_date, notes, description, max_riders) are only
    # valid on planned trips. Reject the whole PATCH with 400 if the caller is
    # trying to edit metadata on an active/completed trip — silently dropping
    # the fields would let the frontend show "saved" without any change taking
    # effect, which is worse than a clear failure.
    _METADATA_FIELDS = {"name", "planned_date", "notes", "description", "max_riders"}
    metadata_in_body = _METADATA_FIELDS & update.keys()
    if metadata_in_body and doc.get("status") != "planned":
        raise HTTPException(
            status_code=400,
            detail="Trip has already started — name, date, notes, description and max_riders can't be changed.",
        )
    # Clamp max_riders so it never drops below current confirmed crew (organiser
    # + crew_ids). Otherwise the org could "soft-kick" riders by lowering the
    # cap, leaving the trip in an over-capacity state.
    if "max_riders" in update:
        min_required = 1 + len(doc.get("crew_ids") or [])
        if update["max_riders"] < min_required:
            raise HTTPException(
                status_code=400,
                detail=f"max_riders cannot drop below current crew count ({min_required}).",
            )
    if body.status == "active" and not doc.get("started_at"):
        update["started_at"] = now_iso()
        # Notify confirmed crew that the ride has started (trigger event #4).
        crew_ids = doc.get("crew_ids") or []
        if crew_ids:
            import asyncio
            asyncio.ensure_future(_push_to_users(
                crew_ids,
                title="Ride started — saddle up.",
                body=f"{user.get('name', 'The organiser')} started {doc.get('name', 'your ride')}.",
                data={"type": "trip_started", "trip_id": trip_id},
            ))
    if body.status == "completed":
        update["ended_at"] = now_iso()
        # Credit every rider who was on the trip — organiser + all confirmed crew —
        # not just the organiser who tapped Complete. They rode the same kilometres.
        km = body.actual_distance_km or doc.get("distance_km", 0)
        rider_ids = list({doc["user_id"], *(doc.get("crew_ids") or [])})
        await db.users.update_many(
            {"id": {"$in": rider_ids}},
            {"$inc": {"stats.total_km": km, "stats.trips_completed": 1}},
        )
    await db.trips.update_one({"id": trip_id}, {"$set": update})
    # If the trip just transitioned to completed/cancelled, evict everyone from the
    # convoy WS room. Otherwise their clients keep broadcasting position to a
    # zombie room until they manually close the screen.
    if body.status in ("completed", "cancelled"):
        try:
            await hub.end_trip(trip_id)
        except Exception:
            pass
    fresh = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    return trip_from_doc(fresh)


@api.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.trips.delete_one({"id": trip_id})
    return {"ok": True}


# ---------- Trip requests (public-trip join flow) ----------
def trip_request_from_doc(d: dict) -> TripRequest:
    d = {k: v for k, v in d.items() if k != "_id"}
    return TripRequest(**d)


async def _persist_notifications(user_ids: List[str], title: str, body: str, data: dict | None = None) -> None:
    """Persist a notification record per recipient so the in-app inbox can render history."""
    if not user_ids:
        return
    created_at = now_iso()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": title,
            "body": body,
            "data": data or {},
            "read": False,
            "created_at": created_at,
        }
        for uid in user_ids
    ]
    try:
        await db.notifications.insert_many(docs)
    except Exception as exc:
        logger.warning("Notification persist failed: %s", exc)


async def _push_to_users(user_ids: List[str], title: str, body: str, data: dict | None = None) -> None:
    """Persist + push to the given user ids. Persistence runs even if no push token exists,
    so the in-app inbox still shows the notification when the user opens the app."""
    if not user_ids:
        return
    await _persist_notifications(user_ids, title, body, data)
    cursor = db.users.find(
        {"id": {"$in": user_ids}, "expo_push_token": {"$exists": True, "$ne": ""}},
        {"_id": 0, "expo_push_token": 1},
    )
    members = await cursor.to_list(50)
    tokens = [m["expo_push_token"] for m in members if m.get("expo_push_token")]
    await _send_expo_push(tokens, title, body, data)


@api.post("/trips/{trip_id}/request-join", response_model=TripRequest)
async def request_join_trip(trip_id: str, body: TripRequestCreate, request: Request, user: dict = Depends(get_current_user)):
    """Rider asks to join a public trip. Creates a pending TripRequest and pushes the organiser."""
    # Cap join requests so a hostile user can't spam organisers' push inboxes
    _rate_limit(user["id"], max_hits=10, window=3600, scope="join_requests")
    _rate_limit(_client_ip(request), max_hits=20, window=3600, scope="join_requests_ip")
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not trip.get("is_public"):
        raise HTTPException(status_code=400, detail="This ride isn't open to requests")
    if trip.get("status") not in ("planned", "active"):
        raise HTTPException(status_code=400, detail="This ride is no longer accepting riders")
    if trip["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="You're already the organiser")
    if user["id"] in (trip.get("crew_ids") or []):
        raise HTTPException(status_code=400, detail="You're already on this ride")
    # Capacity check (organiser counts as 1)
    max_riders = int(trip.get("max_riders") or 8)
    if 1 + len(trip.get("crew_ids") or []) >= max_riders:
        raise HTTPException(status_code=400, detail="This ride is full")
    # Reject duplicates (the partial unique index will also catch races)
    existing = await db.trip_requests.find_one({"trip_id": trip_id, "requested_by": user["id"], "status": "pending"})
    if existing:
        raise HTTPException(status_code=400, detail="You've already requested to join")
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "trip_id": trip_id,
        "requested_by": user["id"],
        "requester_name": user.get("name", "A rider"),
        "requester_email": user.get("email", ""),
        "note": (body.note or "").strip()[:240],
        "status": "pending",
        "created_at": now_iso(),
        "decided_at": None,
        "decided_by": None,
    }
    try:
        await db.trip_requests.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="You've already requested to join")
    # Notify organiser (best-effort)
    import asyncio
    asyncio.ensure_future(_push_to_users(
        [trip["user_id"]],
        title="New ride request",
        body=f"{doc['requester_name']} wants to join {trip.get('name', 'your ride')}.",
        data={"type": "trip_request", "trip_id": trip_id, "request_id": rid},
    ))
    return trip_request_from_doc(doc)


# Frontend already calls /trips/{id}/join — keep that name working by aliasing it to request-join
@api.post("/trips/{trip_id}/join", response_model=TripRequest)
async def join_trip_alias(trip_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Backwards-compatible alias used by the Discover screen. Creates a pending join request."""
    return await request_join_trip(trip_id, TripRequestCreate(note=""), request, user)


@api.get("/trips/{trip_id}/requests", response_model=List[TripRequest])
async def list_trip_requests(trip_id: str, user: dict = Depends(get_current_user)):
    """Organiser-only: list all requests for a trip (any status)."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "user_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    cursor = db.trip_requests.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [trip_request_from_doc(d) for d in docs]


@api.post("/trips/{trip_id}/requests/{rid}/approve", response_model=TripRequest)
async def approve_trip_request(trip_id: str, rid: str, user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    req = await db.trip_requests.find_one({"id": rid, "trip_id": trip_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")
    # Capacity re-check
    max_riders = int(trip.get("max_riders") or 8)
    if 1 + len(trip.get("crew_ids") or []) >= max_riders:
        raise HTTPException(status_code=400, detail="Ride is full")
    requester_id = req["requested_by"]
    requester = await db.users.find_one({"id": requester_id}, {"_id": 0, "name": 1})
    requester_name = (requester or {}).get("name", req.get("requester_name", "Rider"))
    # Add to crew (idempotent via $addToSet)
    await db.trips.update_one(
        {"id": trip_id},
        {"$addToSet": {"crew_ids": requester_id, "crew": requester_name}},
    )
    decided = now_iso()
    await db.trip_requests.update_one(
        {"id": rid},
        {"$set": {"status": "approved", "decided_at": decided, "decided_by": user["id"]}},
    )
    req.update({"status": "approved", "decided_at": decided, "decided_by": user["id"]})
    # Notify requester
    import asyncio
    asyncio.ensure_future(_push_to_users(
        [requester_id],
        title="You're in",
        body=f"{user.get('name','The organiser')} approved you for {trip.get('name','the ride')}.",
        data={"type": "trip_request_approved", "trip_id": trip_id, "request_id": rid},
    ))
    return trip_request_from_doc(req)


@api.post("/trips/{trip_id}/requests/{rid}/decline", response_model=TripRequest)
async def decline_trip_request(trip_id: str, rid: str, user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "user_id": 1, "name": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    req = await db.trip_requests.find_one({"id": rid, "trip_id": trip_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")
    decided = now_iso()
    await db.trip_requests.update_one(
        {"id": rid},
        {"$set": {"status": "declined", "decided_at": decided, "decided_by": user["id"]}},
    )
    req.update({"status": "declined", "decided_at": decided, "decided_by": user["id"]})
    import asyncio
    asyncio.ensure_future(_push_to_users(
        [req["requested_by"]],
        title="Request declined",
        body=f"Your request to join {trip.get('name','the ride')} wasn't accepted.",
        data={"type": "trip_request_declined", "trip_id": trip_id, "request_id": rid},
    ))
    return trip_request_from_doc(req)


@api.post("/trips/{trip_id}/requests/{rid}/cancel", response_model=TripRequest)
async def cancel_trip_request(trip_id: str, rid: str, user: dict = Depends(get_current_user)):
    """Requester-only: withdraw your own pending request."""
    req = await db.trip_requests.find_one({"id": rid, "trip_id": trip_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["requested_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")
    decided = now_iso()
    await db.trip_requests.update_one(
        {"id": rid},
        {"$set": {"status": "cancelled", "decided_at": decided, "decided_by": user["id"]}},
    )
    req.update({"status": "cancelled", "decided_at": decided, "decided_by": user["id"]})
    return trip_request_from_doc(req)


@api.post("/trips/{trip_id}/leave")
async def leave_trip(trip_id: str, user: dict = Depends(get_current_user)):
    """Confirmed crew member leaves a ride. Organiser cannot leave their own trip — must delete it."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Organisers can't leave — delete the ride instead")
    if user["id"] not in (trip.get("crew_ids") or []):
        raise HTTPException(status_code=400, detail="You're not on this ride")
    name = user.get("name", "")
    await db.trips.update_one(
        {"id": trip_id},
        {"$pull": {"crew_ids": user["id"], "crew": name}},
    )
    # Boot from convoy WS room — they're no longer a member, shouldn't keep
    # broadcasting position or seeing other riders.
    try:
        await hub.force_disconnect(trip_id, user["id"])
    except Exception:
        pass
    # Notify organiser quietly
    import asyncio
    asyncio.ensure_future(_push_to_users(
        [trip["user_id"]],
        title="A rider left",
        body=f"{name or 'A rider'} left {trip.get('name','your ride')}.",
        data={"type": "trip_left", "trip_id": trip_id},
    ))
    return {"ok": True}


@api.post("/trips/{trip_id}/riders/{uid}/remove")
async def remove_trip_rider(trip_id: str, uid: str, user: dict = Depends(get_current_user)):
    """Organiser-only: remove a confirmed rider."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Organisers can't remove themselves")
    if uid not in (trip.get("crew_ids") or []):
        raise HTTPException(status_code=400, detail="That rider isn't on this ride")
    removed = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1})
    removed_name = (removed or {}).get("name", "")
    await db.trips.update_one(
        {"id": trip_id},
        {"$pull": {"crew_ids": uid, "crew": removed_name}},
    )
    # Boot the removed rider from the convoy WS room immediately so they stop
    # broadcasting and other riders see them disappear from the map.
    try:
        await hub.force_disconnect(trip_id, uid)
    except Exception:
        pass
    import asyncio
    asyncio.ensure_future(_push_to_users(
        [uid],
        title="Removed from ride",
        body=f"You were removed from {trip.get('name','a ride')}.",
        data={"type": "trip_removed", "trip_id": trip_id},
    ))
    return {"ok": True}


@api.get("/users/me/trip-requests", response_model=List[TripRequest])
async def my_trip_requests(user: dict = Depends(get_current_user)):
    """All requests this user has made (any status), newest first. Used for the Trips badge."""
    cursor = db.trip_requests.find({"requested_by": user["id"]}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [trip_request_from_doc(d) for d in docs]


# ---------- Convoy (mocked) ----------
# ---------- Push token ----------
@api.post("/users/me/push-token")
async def save_push_token(body: PushTokenIn, user: dict = Depends(get_current_user)):
    """Store the Expo push token for this device/user. Upsert — safe to call on every app launch."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"expo_push_token": body.token.strip()}})
    return {"ok": True}


# ---------- Expo push helper ----------
async def _send_expo_push(tokens: List[str], title: str, body: str, data: dict | None = None) -> None:
    """Best-effort push via Expo's free push API. Never raises — logs failures silently."""
    if not tokens:
        return
    messages = [{"to": t, "title": title, "body": body, "data": data or {}, "sound": "default"} for t in tokens if t]
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Accept": "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json"},
            )
            if r.status_code != 200:
                logger.warning("Expo push failed: %s %s", r.status_code, r.text[:200])
    except Exception as exc:
        logger.warning("Expo push exception: %s", exc)


async def _notify_sos_crew(sos_doc: dict, sender_name: str) -> None:
    """Look up crew + organiser of the active trip and notify them (in-app inbox + Expo push).
    Excludes the sender. Persists every notification so an offline rider sees it on next open."""
    trip_id = sos_doc.get("trip_id")
    if not trip_id:
        return
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "crew_ids": 1, "user_id": 1})
    if not trip:
        return
    sender_id = sos_doc.get("user_id")
    # Notify organiser AND crew — organiser may not be in crew_ids
    recipients = list({trip.get("user_id"), *(trip.get("crew_ids") or [])} - {None, sender_id})
    if not recipients:
        return
    await _push_to_users(
        recipients,
        title="🚨 SOS Alert",
        body=f"{sender_name} triggered an SOS. Check the app now.",
        data={"type": "sos", "sos_id": sos_doc["id"], "trip_id": trip_id},
    )


# ---------- SOS ----------
@api.post("/sos", response_model=SOSEvent)
async def trigger_sos(body: SOSCreate, request: Request, user: dict = Depends(get_current_user)):
    # SOS notifies crew via push + WebSocket. Cap at 5/hour per user — enough for a real
    # emergency + retries, tight enough to block spam without stranding a user in a crash.
    _rate_limit(user["id"], max_hits=5, window=3600, scope="sos")
    # Authorise the trip_id BEFORE we accept it. Without this, an authenticated
    # user could fan SOS into any trip room they're not on (privacy + abuse).
    # We strip an unauthorised trip_id rather than 400 — the SOS itself is
    # legit, we just won't broadcast to a room the user isn't in.
    payload = body.dict()
    if payload.get("trip_id"):
        trip = await db.trips.find_one(
            {"id": payload["trip_id"]}, {"_id": 0, "user_id": 1, "crew_ids": 1}
        )
        on_trip = bool(trip) and (
            trip.get("user_id") == user["id"]
            or user["id"] in (trip.get("crew_ids") or [])
        )
        if not on_trip:
            payload["trip_id"] = None
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "status": "active",
        "created_at": now_iso(),
        "resolved_at": None,
        **payload,
    }
    await db.sos_events.insert_one(doc)
    doc.pop("_id", None)
    logger.warning("SOS TRIGGERED by %s at (%s, %s)", user.get("email"), body.lat, body.lng)
    # Notify crew in-app (WebSocket) + push (fire-and-forget — never block SOS response)
    import asyncio
    sender_name = user.get("name", "A rider")
    # Use the authorised trip_id (payload value), not the raw request body.
    # Body may have been stripped above if the user wasn't on that trip.
    if doc.get("trip_id"):
        asyncio.ensure_future(hub.broadcast_sos(doc["trip_id"], sender_name, user["id"], sid))
    asyncio.ensure_future(_notify_sos_crew(doc, sender_name))
    return SOSEvent(**doc)


@api.get("/sos/active", response_model=Optional[SOSEvent])
async def my_active_sos(user: dict = Depends(get_current_user)):
    """Must be registered BEFORE /sos/{sos_id} to avoid 'active' being captured as an ID."""
    doc = await db.sos_events.find_one(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}
    )
    if not doc:
        return None
    return SOSEvent(**doc)


@api.get("/sos/{sos_id}", response_model=SOSDetail)
async def get_sos_detail(sos_id: str, user: dict = Depends(get_current_user)):
    doc = await db.sos_events.find_one({"id": sos_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SOS not found")

    is_owner = doc["user_id"] == user["id"]
    allowed = is_owner
    if not allowed and doc.get("trip_id"):
        trip = await db.trips.find_one({"id": doc["trip_id"]}, {"_id": 0, "user_id": 1, "crew_ids": 1})
        if trip:
            allowed = user["id"] == trip.get("user_id") or user["id"] in (trip.get("crew_ids") or [])
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    sender = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "name": 1, "email": 1, "emergency_contacts": 1})
    primary = None
    contacts = (sender or {}).get("emergency_contacts") or []
    if contacts:
        primary = SOSContact(**contacts[0])
    return SOSDetail(
        **doc,
        sender_name=(sender or {}).get("name", "Rider"),
        sender_email=(sender or {}).get("email", user.get("email", "rider@broad.app")),
        emergency_contact=primary,
    )


@api.post("/sos/{sos_id}/resolve", response_model=SOSEvent)
async def resolve_sos(sos_id: str, user: dict = Depends(get_current_user)):
    doc = await db.sos_events.find_one({"id": sos_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SOS not found")
    if doc["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.sos_events.update_one(
        {"id": sos_id},
        {"$set": {"status": "resolved", "resolved_at": now_iso()}},
    )
    doc.update({"status": "resolved", "resolved_at": now_iso()})
    return SOSEvent(**doc)


# ---------- Notifications inbox ----------
@api.get("/notifications", response_model=List[Notification])
async def list_notifications(user: dict = Depends(get_current_user), limit: int = 100):
    """Return current user's notifications, newest first. Caps at 100 by default."""
    limit = max(1, min(int(limit or 100), 200))
    cursor = (
        db.notifications.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    docs = await cursor.to_list(limit)
    return [Notification(**d) for d in docs]


@api.get("/notifications/unread-count")
async def notifications_unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": n}


@api.post("/notifications/read-all")
async def notifications_read_all(user: dict = Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"updated": res.modified_count}


@api.post("/notifications/{nid}/read")
async def notifications_read_one(nid: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"id": nid, "user_id": user["id"]},
        {"$set": {"read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@api.delete("/notifications/{nid}")
async def notifications_delete(nid: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.delete_one({"id": nid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@api.get("/users/search")
async def users_search(q: str, user: dict = Depends(get_current_user)):
    """Search registered riders by name (case-insensitive). Excludes self. For crew invites."""
    if not q or len(q.strip()) < 2:
        return {"results": []}
    pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
    cursor = db.users.find(
        {"name": pattern, "id": {"$ne": user["id"]}},
        {"_id": 0, "password_hash": 0, "emergency_contacts": 0},
    ).limit(10)
    docs = await cursor.to_list(10)
    results = [{"id": d["id"], "name": d.get("name", ""), "email": d.get("email", "")} for d in docs]
    return {"results": results}


@api.get("/users/me/achievements")
async def my_achievements(user: dict = Depends(get_current_user)):
    """Derive badges from completed trips + stats."""
    cursor = db.trips.find(
        {"$or": [{"user_id": user["id"]}, {"crew_members": user["id"]}], "status": "completed"},
        {"_id": 0},
    )
    trips = await cursor.to_list(500)
    total_km = sum((t.get("actual_distance_km") or t.get("distance_km") or 0) for t in trips)
    count = len(trips)
    max_elev = max((t.get("elevation_m") or 0) for t in trips) if trips else 0
    longest = max((t.get("actual_distance_km") or t.get("distance_km") or 0) for t in trips) if trips else 0
    fastest = max((t.get("top_speed_kmh") or 0) for t in trips) if trips else 0

    badges = []
    if count >= 1:
        badges.append({"code": "first_ride", "title": "First Ride", "meta": "The road remembers the first one."})
    if count >= 10:
        badges.append({"code": "ten_rides", "title": "Ten Rides", "meta": f"{count} rides and still counting."})
    if total_km >= 1000:
        badges.append({"code": "1000km", "title": "1,000 KM Club", "meta": f"{int(total_km)} km logged."})
    if total_km >= 5000:
        badges.append({"code": "5000km", "title": "5,000 KM Club", "meta": f"{int(total_km)} km logged."})
    if total_km >= 10000:
        badges.append({"code": "10000km", "title": "10,000 KM Club", "meta": f"{int(total_km)} km logged."})
    if max_elev >= 3000:
        badges.append({"code": "mountain", "title": "Mountain Rider", "meta": f"Crested {max_elev} m."})
    if max_elev >= 4500:
        badges.append({"code": "high_pass", "title": "High Pass", "meta": f"Above 4,500 m — thinner air, wider road."})
    if longest >= 300:
        badges.append({"code": "long_run", "title": "Long Run", "meta": f"{int(longest)} km in a single ride."})
    if fastest >= 100:
        badges.append({"code": "century_kmh", "title": "Century Club", "meta": f"Peaked at {int(fastest)} km/h."})
    return {
        "badges": badges,
        "stats": {
            "total_km": total_km,
            "trips_completed": count,
            "highest_point_m": max_elev,
            "longest_ride_km": longest,
            "top_speed_kmh": fastest,
        },
    }


# ---------- Places (Nominatim search + Open-Elevation) ----------
NOMINATIM_HEADERS = {"User-Agent": "Broad-Rider-Companion/1.0 (rider@broad.app)"}


@api.get("/places/search")
async def places_search(q: str, request: Request, user: dict = Depends(get_current_user)):
    """Free OpenStreetMap-backed geocoding. Limited to India by countrycodes=in."""
    # Nominatim enforces 1 req/sec — protect our global User-Agent budget per user
    _rate_limit(user["id"], max_hits=60, window=60, scope="places_search")
    if not q or len(q.strip()) < 2:
        return {"results": []}
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q.strip(), "format": "json", "limit": 8, "countrycodes": "in", "addressdetails": 0},
                headers=NOMINATIM_HEADERS,
            )
            data = r.json() if r.status_code == 200 else []
        results = [
            {"name": d.get("display_name", "").split(",")[0], "full": d.get("display_name", ""),
             "lat": float(d["lat"]), "lng": float(d["lon"])}
            for d in data
        ]
        return {"results": results}
    except Exception as e:
        logger.warning("nominatim error: %s", e)
        return {"results": []}


class ElevationIn(BaseModel):
    points: List[Waypoint]


@api.post("/places/elevation")
async def places_elevation(body: ElevationIn, request: Request, user: dict = Depends(get_current_user)):
    """Real elevation via Open-Elevation. Returns per-point elevation_m and a simple max."""
    # Open-Elevation is a free community API — be a good citizen
    _rate_limit(user["id"], max_hits=30, window=60, scope="elevation")
    if not body.points:
        return {"elevations": [], "max_m": 0}
    try:
        async with httpx.AsyncClient(timeout=12) as c:
            payload = {"locations": [{"latitude": p.lat, "longitude": p.lng} for p in body.points]}
            r = await c.post("https://api.open-elevation.com/api/v1/lookup", json=payload)
            if r.status_code != 200:
                return {"elevations": [0] * len(body.points), "max_m": 0}
            j = r.json()
            elevs = [int(round(item.get("elevation", 0) or 0)) for item in j.get("results", [])]
            return {"elevations": elevs, "max_m": max(elevs) if elevs else 0}
    except Exception as e:
        logger.warning("open-elevation error: %s", e)
        return {"elevations": [0] * len(body.points), "max_m": 0}


@api.get("/")
async def root():
    return {"app": "Broad", "tagline": "The Rider's Companion", "ok": True}


# ---------- Mount ----------
app.include_router(api)


# ---------- WebSocket convoy (real-time positions) ----------
# Sanity bounds for inbound GPS samples. Reject anything outside these.
# Tuned for motorcycle / car use: 250 km/h cap rejects teleports from cell
# tower fallback; 100m accuracy cap drops indoor-wifi-only fixes that would
# render the rider 200m off the actual road.
_MAX_SPEED_KMH = 250
_MAX_ACCURACY_M = 100


class ConvoyHub:
    """In-memory pub/sub for live trip positions + SOS alerts.

    State shape:
      rooms[trip_id][user_id] = {
        name, lat, lng, speed_kmh, heading_deg, accuracy_m, updated_at,
        sockets: {conn_id: WebSocket}
      }

    Persistence: none. State lost on restart — riders reconnect and repopulate
    via their next pos broadcast. Acceptable since "now" is the only relevant
    time for live tracking.
    """

    def __init__(self) -> None:
        self.rooms: dict[str, dict[str, dict]] = {}

    async def join(self, trip_id: str, user_id: str, name: str, ws: WebSocket) -> str:
        await ws.accept()
        room = self.rooms.setdefault(trip_id, {})
        rider = room.setdefault(
            user_id,
            {
                "name": name,
                "lat": None,
                "lng": None,
                "speed_kmh": 0,
                "heading_deg": 0,
                "accuracy_m": None,
                "updated_at": now_iso(),
                "sockets": {},
            },
        )
        rider["name"] = name
        conn_id = str(uuid.uuid4())
        rider["sockets"][conn_id] = ws
        await self.broadcast_state(trip_id)
        return conn_id

    def leave(self, trip_id: str, user_id: str, conn_id: str) -> None:
        room = self.rooms.get(trip_id)
        if not room:
            return
        rider = room.get(user_id)
        if not rider:
            return
        rider.get("sockets", {}).pop(conn_id, None)
        if not rider.get("sockets"):
            room.pop(user_id, None)
        if not room:
            self.rooms.pop(trip_id, None)

    async def force_disconnect(self, trip_id: str, user_id: str, code: int = 4410) -> None:
        """Boot a user from the room — used when a rider is removed from the trip
        or the trip ends. Closes all their sockets, prunes state, broadcasts new
        member list to everyone else."""
        room = self.rooms.get(trip_id)
        if not room:
            return
        rider = room.get(user_id)
        if not rider:
            return
        for ws in list((rider.get("sockets") or {}).values()):
            try:
                await ws.close(code=code)
            except Exception:
                pass
        room.pop(user_id, None)
        if not room:
            self.rooms.pop(trip_id, None)
        await self.broadcast_state(trip_id)

    async def end_trip(self, trip_id: str) -> None:
        """Notify everyone the trip ended, then close all sockets for that trip."""
        await self._fanout(trip_id, {"type": "trip_ended"})
        room = self.rooms.pop(trip_id, None) or {}
        for rider in room.values():
            for ws in list((rider.get("sockets") or {}).values()):
                try:
                    await ws.close(code=4411)
                except Exception:
                    pass

    async def update(self, trip_id: str, user_id: str, data: dict) -> bool:
        """Apply a position update. Returns True if applied, False if rejected.

        Rejection reasons:
        - lat/lng missing or non-numeric
        - lat/lng out of range
        - accuracy worse than `_MAX_ACCURACY_M`
        - speed greater than `_MAX_SPEED_KMH` (teleport / GPS spike)
        """
        room = self.rooms.get(trip_id, {})
        if user_id not in room:
            return False
        try:
            lat = float(data["lat"])
            lng = float(data["lng"])
        except (KeyError, TypeError, ValueError):
            return False
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return False
        speed = float(data.get("speed_kmh") or 0)
        if speed < 0 or speed > _MAX_SPEED_KMH:
            return False
        accuracy = data.get("accuracy_m")
        if accuracy is not None:
            try:
                accuracy = float(accuracy)
                if accuracy > _MAX_ACCURACY_M:
                    return False
            except (TypeError, ValueError):
                accuracy = None
        heading = data.get("heading_deg")
        try:
            heading = float(heading) if heading is not None else 0.0
        except (TypeError, ValueError):
            heading = 0.0

        rider = room[user_id]
        rider["lat"] = lat
        rider["lng"] = lng
        rider["speed_kmh"] = speed
        rider["heading_deg"] = heading
        rider["accuracy_m"] = accuracy
        rider["updated_at"] = now_iso()
        await self.broadcast_state(trip_id)
        return True

    async def _fanout(self, trip_id: str, payload: dict) -> None:
        """Send payload to every socket in the room. Prune any that fail."""
        room = self.rooms.get(trip_id, {})
        dead: list[tuple[str, str]] = []
        for uid, rider in list(room.items()):
            for conn_id, ws in list((rider.get("sockets") or {}).items()):
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append((uid, conn_id))
        for uid, conn_id in dead:
            self.leave(trip_id, uid, conn_id)

    async def broadcast_sos(self, trip_id: str, sender_name: str, sender_user_id: str, sos_id: str) -> None:
        await self._fanout(trip_id, {
            "type": "sos",
            "sender": sender_name,
            "sender_user_id": sender_user_id,
            "sos_id": sos_id,
        })

    async def broadcast_state(self, trip_id: str) -> None:
        room = self.rooms.get(trip_id, {})
        members = [
            {
                "user_id": uid,
                "name": r["name"],
                "lat": r["lat"],
                "lng": r["lng"],
                "speed_kmh": r["speed_kmh"],
                "heading_deg": r.get("heading_deg", 0),
                "accuracy_m": r.get("accuracy_m"),
                "online": True,
                "updated_at": r["updated_at"],
            }
            for uid, r in room.items()
        ]
        await self._fanout(trip_id, {"type": "state", "members": members})


hub = ConvoyHub()


@app.websocket("/api/ws/convoy/{trip_id}")
async def ws_convoy(ws: WebSocket, trip_id: str, token: str = ""):
    # 1. Verify JWT (passed as query param — Web/RN WebSocket APIs don't support custom headers).
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGO])
        uid = payload["sub"]
    except Exception:
        await ws.close(code=4401)
        return
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        await ws.close(code=4403)
        return

    # 2. Verify trip exists, user is a member, and trip is active.
    # Members = organizer (user_id) OR confirmed crew (crew_ids).
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "user_id": 1, "crew_ids": 1, "status": 1})
    if not trip:
        await ws.close(code=4404)
        return
    is_member = (trip.get("user_id") == uid) or (uid in (trip.get("crew_ids") or []))
    if not is_member:
        await ws.close(code=4403)
        return
    if trip.get("status") != "active":
        await ws.close(code=4409)  # 4409 = trip not active
        return

    name = u.get("name", "Rider")
    conn_id = await hub.join(trip_id, uid, name, ws)
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "pos":
                await hub.update(trip_id, uid, msg)
    except WebSocketDisconnect:
        pass
    finally:
        hub.leave(trip_id, uid, conn_id)
        try:
            await hub.broadcast_state(trip_id)
        except Exception:
            pass


# gzip — compress JSON list responses (trips, requests, /auth/me).
# minimum_size=500: don't spend CPU compressing tiny payloads (single-object
# responses, 401s, ping). The big wins are /trips and /trips/discover which
# commonly exceed 5-20KB and compress 70-85%. Runs *before* CORS middleware
# in the stack (added second = executes first on egress in Starlette).
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS — read allowed origins from env; wildcard + credentials is invalid per spec.
_cors_raw = os.environ.get("CORS_ORIGINS", "http://localhost:8081,http://localhost:19006,exp://localhost:8081")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Seed ----------
async def seed():
    # ---- Index audit (2026-04) ----
    # Every authenticated request hits users.find_one({"id": ...}) via
    # get_current_user, and every trip detail/mutation hits
    # trips.find_one({"id": ...}). Without explicit id indexes these were
    # COLLSCANs — fine at tens of users, multiplies linearly into the
    # request critical path as the collection grows. Adding unique id
    # indexes makes single-doc lookups O(log N) and typically saves
    # 50-300ms per authenticated call at scale.
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)  # <- hot path: every auth call
    await db.trips.create_index("id", unique=True)  # <- hot path: every detail/mutation
    await db.trips.create_index("user_id")
    # Compound index for the "my trips, newest first" list query. Covers both
    # the filter and the sort, letting Mongo skip an in-memory sort step.
    await db.trips.create_index([("user_id", 1), ("created_at", -1)])
    await db.trips.create_index("is_public")
    await db.trips.create_index("city")
    # Discover screen: find(is_public=True, [city=X]).sort(created_at, -1)
    await db.trips.create_index([("is_public", 1), ("city", 1), ("created_at", -1)])
    # Trips list uses $or: [{user_id}, {crew_ids}]. Each $or branch is evaluated
    # separately, so crew_ids (a multikey array) needs its own index or it's a COLLSCAN
    # on the crew side every time a rider opens the Trips tab.
    await db.trips.create_index([("crew_ids", 1), ("created_at", -1)])
    await db.refresh_tokens.create_index("jti", unique=True)
    await db.refresh_tokens.create_index("user_id")
    await db.trip_requests.create_index("id", unique=True)  # <- approve/decline/cancel lookups
    await db.trip_requests.create_index([("trip_id", 1), ("status", 1)])
    await db.trip_requests.create_index([("requested_by", 1), ("status", 1)])
    # one pending request per (trip, user) — approved/declined/cancelled allowed to repeat history
    await db.trip_requests.create_index(
        [("trip_id", 1), ("requested_by", 1), ("status", 1)],
        name="uniq_pending_per_user_per_trip",
        unique=True,
        partialFilterExpression={"status": "pending"},
    )
    # SOS is low-volume but /sos/active fires on every ride screen mount
    await db.sos_events.create_index("id", unique=True)
    await db.sos_events.create_index([("user_id", 1), ("status", 1)])
    # Notifications inbox: per-user list newest-first + unread-count
    await db.notifications.create_index("id", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("read", 1)])

    admin_email = os.environ.get("ADMIN_EMAIL", "rider@broad.app")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if not admin_password:
        raise RuntimeError("ADMIN_PASSWORD env var is required — set it in .env before starting the server")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid,
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Arjun Mehra",
            "bike": {"make": "Royal Enfield", "model": "Himalayan 450", "registration": "KA-01-AB-2024", "odometer_km": 18420},
            "emergency_contacts": [
                {"name": "Priya Mehra", "phone": "+91 98765 43210", "relation": "Spouse"},
                {"name": "Dr. Suresh", "phone": "+91 98765 99999", "relation": "Doctor"},
            ],
            "stats": {"total_km": 12480.5, "trips_completed": 23, "highest_point_m": 5359},
            "created_at": now_iso(),
        })
        existing = await db.users.find_one({"email": admin_email})

    # Heal admin state if earlier tests mutated name/bike. Keeps seeded fixtures
    # deterministic across runs without wiping the DB. Tests assert on these
    # canonical values, so we restore them on every boot.
    if existing:
        canonical_bike = {
            "make": "Royal Enfield",
            "model": "Himalayan 450",
            "registration": "KA-01-AB-2024",
            "odometer_km": 18420,
        }
        healed: dict = {}
        if existing.get("name") != "Arjun Mehra":
            healed["name"] = "Arjun Mehra"
        if (existing.get("bike") or {}).get("make") != "Royal Enfield":
            healed["bike"] = canonical_bike
        if "home_city" not in existing:
            healed["home_city"] = None
        if healed:
            await db.users.update_one({"email": admin_email}, {"$set": healed})
            existing = await db.users.find_one({"email": admin_email})

    # Seed sample trips for the admin
    if existing and (await db.trips.count_documents({"user_id": existing["id"]})) == 0:
        sample_trips = [
            {
                "id": str(uuid.uuid4()),
                "user_id": existing["id"],
                "name": "Bangalore to Coorg",
                "start": {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946},
                "end": {"name": "Madikeri, Coorg", "lat": 12.4244, "lng": 75.7382},
                "waypoints": [
                    {"name": "Mysuru", "lat": 12.2958, "lng": 76.6394},
                    {"name": "Kushalnagar", "lat": 12.4583, "lng": 75.9551},
                ],
                "distance_km": 268,
                "elevation_m": 1170,
                "planned_date": (datetime.now(timezone.utc) + timedelta(days=4)).date().isoformat(),
                "crew": ["Rhea", "Kabir", "Ishaan", "Maya"],
                "notes": "Tank full at Mysuru. Carry rain liners — coffee country in monsoon.",
                "is_public": False,
                "status": "planned",
                "started_at": None, "ended_at": None,
                "actual_distance_km": 0, "top_speed_kmh": 0, "duration_min": 0,
                "created_at": now_iso(),
            },
            {
                "id": str(uuid.uuid4()),
                "user_id": existing["id"],
                "name": "Manali to Leh",
                "start": {"name": "Manali", "lat": 32.2396, "lng": 77.1887},
                "end": {"name": "Leh", "lat": 34.1526, "lng": 77.5771},
                "waypoints": [
                    {"name": "Sarchu", "lat": 32.8167, "lng": 77.45},
                    {"name": "Pang", "lat": 33.05, "lng": 77.78},
                ],
                "distance_km": 472,
                "elevation_m": 5359,
                "planned_date": (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat(),
                "crew": ["Rhea", "Kabir"],
                "notes": "",
                "is_public": False,
                "status": "completed",
                "started_at": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
                "ended_at": (datetime.now(timezone.utc) - timedelta(days=58)).isoformat(),
                "actual_distance_km": 478.3, "top_speed_kmh": 92, "duration_min": 1740,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=70)).isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "user_id": existing["id"],
                "name": "Spiti Loop — Open Invite",
                "start": {"name": "Shimla", "lat": 31.1048, "lng": 77.1734},
                "end": {"name": "Manali", "lat": 32.2396, "lng": 77.1887},
                "waypoints": [
                    {"name": "Kalpa", "lat": 31.5384, "lng": 78.2552},
                    {"name": "Kaza", "lat": 32.2257, "lng": 78.0716},
                ],
                "distance_km": 760,
                "elevation_m": 4551,
                "planned_date": (datetime.now(timezone.utc) + timedelta(days=21)).date().isoformat(),
                "crew": ["Open"],
                "notes": "8 days. Spiti circuit with acclimatisation day at Kaza.",
                "is_public": True,
                "max_riders": 8,
                "description": "Eight days through the cold desert. Tar gives way to gravel after Reckong Peo. Riders should be comfortable on loose surfaces, carry their own basic spares, and have at least one Himalayan ride under their belt.",
                "city": "Shimla",
                "status": "planned",
                "started_at": None, "ended_at": None,
                "actual_distance_km": 0, "top_speed_kmh": 0, "duration_min": 0,
                "created_at": now_iso(),
            },
        ]
        await db.trips.insert_many(sample_trips)

    # Idempotent seed for the public Spiti trip — ensures Discover has at least one
    # public trip even in DBs that were seeded before public-trips existed.
    # Also heal pre-existing Spiti records that lack the public-trip fields.
    if existing:
        healthy = await db.trips.find_one({
            "name": "Spiti Loop — Open Invite",
            "is_public": True,
            "city": "Shimla",
            "status": "planned",
        })
        if not healthy:
            # Remove any broken variant so we don't duplicate on name
            await db.trips.delete_many({"name": "Spiti Loop — Open Invite"})
    if existing and not await db.trips.find_one({"name": "Spiti Loop — Open Invite"}):
        await db.trips.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": existing["id"],
            "name": "Spiti Loop — Open Invite",
            "start": {"name": "Shimla", "lat": 31.1048, "lng": 77.1734},
            "end": {"name": "Manali", "lat": 32.2396, "lng": 77.1887},
            "waypoints": [
                {"name": "Kalpa", "lat": 31.5384, "lng": 78.2552},
                {"name": "Kaza", "lat": 32.2257, "lng": 78.0716},
            ],
            "distance_km": 760,
            "elevation_m": 4551,
            "planned_date": (datetime.now(timezone.utc) + timedelta(days=21)).date().isoformat(),
            "crew": ["Open"],
            "notes": "8 days. Spiti circuit with acclimatisation day at Kaza.",
            "is_public": True,
            "max_riders": 8,
            "description": "Eight days through the cold desert. Tar gives way to gravel after Reckong Peo. Riders should be comfortable on loose surfaces, carry their own basic spares, and have at least one Himalayan ride under their belt.",
            "city": "Shimla",
            "status": "planned",
            "started_at": None, "ended_at": None,
            "actual_distance_km": 0, "top_speed_kmh": 0, "duration_min": 0,
            "created_at": now_iso(),
        })

    logger.info("Seed complete. Admin: %s", admin_email)


@app.on_event("startup")
async def on_start():
    await seed()


@app.on_event("shutdown")
async def on_stop():
    client.close()
