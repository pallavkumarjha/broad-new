from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt as pyjwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


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
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=14),
        "type": "access",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGO)


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
    created_at: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: UserPublic


class UpdateUserIn(BaseModel):
    name: Optional[str] = None
    bike: Optional[Bike] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None


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
    crew: List[str] = Field(default_factory=list)  # names
    notes: Optional[str] = ""
    is_public: bool = False


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
    status: Optional[Literal["planned", "active", "completed", "cancelled"]] = None
    actual_distance_km: Optional[float] = None
    top_speed_kmh: Optional[float] = None
    duration_min: Optional[int] = None


class SOSCreate(BaseModel):
    trip_id: Optional[str] = None
    lat: float
    lng: float
    speed_kmh: float = 0
    heading_deg: float = 0
    note: Optional[str] = ""


class SOSEvent(SOSCreate):
    id: str
    user_id: str
    status: Literal["active", "resolved"] = "active"
    created_at: str
    resolved_at: Optional[str] = None


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
        created_at=u.get("created_at", now_iso()),
    )


# ---------- Auth routes ----------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
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
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return AuthOut(token=token, user=to_public(doc))


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    user.pop("password_hash", None)
    return AuthOut(token=token, user=to_public(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return to_public(user)


@api.patch("/users/me", response_model=UserPublic)
async def update_me(body: UpdateUserIn, user: dict = Depends(get_current_user)):
    update = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.bike is not None:
        update["bike"] = body.bike.dict()
    if body.emergency_contacts is not None:
        update["emergency_contacts"] = [c.dict() for c in body.emergency_contacts]
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
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    cursor = db.trips.find(query, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [trip_from_doc(d) for d in docs]


@api.get("/trips/discover", response_model=List[Trip])
async def discover_trips(user: dict = Depends(get_current_user)):
    cursor = db.trips.find(
        {"is_public": True, "status": {"$in": ["planned", "active"]}},
        {"_id": 0},
    ).sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [trip_from_doc(d) for d in docs]


@api.get("/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc["user_id"] != user["id"] and not doc.get("is_public"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return trip_from_doc(doc)


@api.patch("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, body: TripUpdate, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    if doc["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in body.dict(exclude_none=True).items()}
    if body.status == "active" and not doc.get("started_at"):
        update["started_at"] = now_iso()
    if body.status == "completed":
        update["ended_at"] = now_iso()
        # update user stats
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {
                    "stats.total_km": body.actual_distance_km or doc.get("distance_km", 0),
                    "stats.trips_completed": 1,
                }
            },
        )
    await db.trips.update_one({"id": trip_id}, {"$set": update})
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


# ---------- Convoy (mocked) ----------
@api.get("/trips/{trip_id}/convoy")
async def convoy(trip_id: str, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    crew_names = doc.get("crew", []) or ["Rhea", "Kabir", "Ishaan", "Maya"]
    base_lat = doc.get("start", {}).get("lat", 28.6)
    base_lng = doc.get("start", {}).get("lng", 77.2)
    import random
    random.seed(trip_id)
    members = []
    statuses = ["lead", "ok", "ok", "sweep"]
    for i, n in enumerate(crew_names[:6]):
        members.append({
            "name": n,
            "lat": base_lat + random.uniform(-0.05, 0.05),
            "lng": base_lng + random.uniform(-0.05, 0.05),
            "speed_kmh": random.randint(40, 90),
            "fuel_pct": random.randint(20, 95),
            "battery_pct": random.randint(30, 99),
            "position": statuses[i % len(statuses)],
            "online": True,
        })
    spread_km = round(random.uniform(0.4, 4.2), 1)
    return {"members": members, "spread_km": spread_km, "updated_at": now_iso()}


# ---------- SOS ----------
@api.post("/sos", response_model=SOSEvent)
async def trigger_sos(body: SOSCreate, user: dict = Depends(get_current_user)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "status": "active",
        "created_at": now_iso(),
        "resolved_at": None,
        **body.dict(),
    }
    await db.sos_events.insert_one(doc)
    doc.pop("_id", None)
    logger.warning("SOS TRIGGERED by %s at (%s, %s)", user.get("email"), body.lat, body.lng)
    return SOSEvent(**doc)


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


@api.get("/sos/active", response_model=Optional[SOSEvent])
async def my_active_sos(user: dict = Depends(get_current_user)):
    doc = await db.sos_events.find_one(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}
    )
    if not doc:
        return None
    return SOSEvent(**doc)


@api.get("/")
async def root():
    return {"app": "Broad", "tagline": "The Rider's Companion", "ok": True}


# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("broad")


# ---------- Seed ----------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.trips.create_index("user_id")
    await db.trips.create_index("is_public")

    admin_email = os.environ.get("ADMIN_EMAIL", "rider@broad.app")
    admin_password = os.environ.get("ADMIN_PASSWORD", "rider123")
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
                "status": "planned",
                "started_at": None, "ended_at": None,
                "actual_distance_km": 0, "top_speed_kmh": 0, "duration_min": 0,
                "created_at": now_iso(),
            },
        ]
        await db.trips.insert_many(sample_trips)
    logger.info("Seed complete. Admin: %s", admin_email)


@app.on_event("startup")
async def on_start():
    await seed()


@app.on_event("shutdown")
async def on_stop():
    client.close()
