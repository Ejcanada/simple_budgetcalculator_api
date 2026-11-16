import os
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

load_dotenv()  # reads .env locally; on Vercel the variables come from project settings

TABLE = "landmarks"

app = FastAPI(
    title="World Heritage Sites API",
    description="REST API for world landmarks, backed by a Supabase PostgreSQL database.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# DATABASE CONNECTION (credentials from environment variables only)
# ==========================================
_client = None


def get_db():
    """Create the Supabase client once. Never include credentials in error messages."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise HTTPException(status_code=503, detail="Database is not configured.")
        from supabase import create_client

        _client = create_client(url, key)
    return _client


def run_query(build):
    """Run a database query and convert any failure into a safe HTTP error."""
    try:
        return build(get_db()).execute()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", None)
        if code == "23505":  # unique violation
            raise HTTPException(status_code=409, detail="A landmark with this title already exists.")
        if code in ("23502", "23514", "22P02", "22003"):  # not null / check / bad type
            raise HTTPException(status_code=422, detail="Data rejected by database rules.")
        if code is not None:  # other query error reported by the database
            raise HTTPException(status_code=500, detail="Database query failed.")
        raise HTTPException(status_code=503, detail="Database unavailable.")


# ==========================================
# MODELS AND VALIDATION
# ==========================================
class LandmarkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=150)
    site_type: str = Field(min_length=1, max_length=100)
    established_year: int = Field(ge=-10000, le=2100)
    visitor_rating: Optional[str] = Field(default=None, pattern=r"^\d(\.\d)?/5$")
    governing_body: Optional[str] = Field(default=None, max_length=150)
    notable_architects: Optional[str] = Field(default=None, max_length=150)
    icon: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    country: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    protection_status: Optional[str] = Field(default=None, max_length=100)
    annual_visitors: Optional[str] = Field(default=None, max_length=20)
    entry_fee: str = Field(min_length=1, max_length=50)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    hotel_rate: int = Field(gt=0, le=10_000_000)

    @field_validator("icon")
    @classmethod
    def icon_path(cls, v):
        if v is not None and not v.startswith("/images/"):
            raise ValueError("icon must start with /images/")
        return v


class LandmarkUpdate(BaseModel):
    """Every field optional, so PATCH only changes what the client sends."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    site_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    established_year: Optional[int] = Field(default=None, ge=-10000, le=2100)
    visitor_rating: Optional[str] = Field(default=None, pattern=r"^\d(\.\d)?/5$")
    governing_body: Optional[str] = Field(default=None, max_length=150)
    notable_architects: Optional[str] = Field(default=None, max_length=150)
    icon: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    country: Optional[str] = Field(default=None, min_length=1, max_length=100)
    city: Optional[str] = Field(default=None, min_length=1, max_length=100)
    region: Optional[str] = Field(default=None, min_length=1, max_length=100)
    protection_status: Optional[str] = Field(default=None, max_length=100)
    annual_visitors: Optional[str] = Field(default=None, max_length=20)
    entry_fee: Optional[str] = Field(default=None, min_length=1, max_length=50)
    currency: Optional[str] = Field(default=None, pattern=r"^[A-Z]{3}$")
    hotel_rate: Optional[int] = Field(default=None, gt=0, le=10_000_000)

    @field_validator("icon")
    @classmethod
    def icon_path(cls, v):
        if v is not None and not v.startswith("/images/"):
            raise ValueError("icon must start with /images/")
        return v


# ==========================================
# API KEY AUTHENTICATION (write operations only)
# ==========================================
def verify_api_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.getenv("API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    return True


# ==========================================
# ERROR FORMAT (no stack traces or internals)
# ==========================================
@app.exception_handler(Exception)
async def unhandled_error(request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


# ==========================================
# ROUTES
# ==========================================
@app.get("/")
def home():
    result = run_query(lambda db: db.table(TABLE).select("id", count="exact").limit(1))
    return {
        "message": "Welcome to the World Heritage Sites API!",
        "count": result.count,
        "endpoints": [
            "/health",
            "/landmarks",
            "/landmarks/{id}",
            "/landmarks/search?q=",
        ],
    }


@app.get("/health")
def health_check():
    run_query(lambda db: db.table(TABLE).select("id").limit(1))
    return {
        "status": "ok",
        "database": "connected",
        "service": "World Heritage Sites API",
        "version": app.version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/landmarks")
def get_landmarks(country: Optional[str] = Query(default=None, max_length=100)):
    def build(db):
        q = db.table(TABLE).select("*").order("id")
        if country:
            q = q.ilike("country", country)
        return q

    data = run_query(build).data
    return {"count": len(data), "landmarks": data}


# Must stay above /landmarks/{landmark_id}, otherwise "search" is read as an id
@app.get("/landmarks/search")
def search_landmarks(q: str = Query(..., min_length=1, max_length=100)):
    term = re.sub(r"[,()%*\\]", " ", q).strip()
    if not term:
        raise HTTPException(status_code=422, detail="Search text is not valid.")
    pattern = f"%{term}%"
    cols = ["title", "site_type", "country", "city", "region", "description"]
    cond = ",".join(f"{c}.ilike.{pattern}" for c in cols)
    data = run_query(lambda db: db.table(TABLE).select("*").or_(cond).order("id")).data
    return {"query": q, "count": len(data), "results": data}


@app.get("/landmarks/{landmark_id}")
def get_landmark(landmark_id: int = Path(..., ge=1)):
    data = run_query(lambda db: db.table(TABLE).select("*").eq("id", landmark_id)).data
    if not data:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return data[0]


@app.post("/landmarks", status_code=201, dependencies=[Depends(verify_api_key)])
def create_landmark(landmark: LandmarkCreate):
    data = run_query(lambda db: db.table(TABLE).insert(landmark.model_dump())).data
    return data[0]


@app.patch("/landmarks/{landmark_id}", dependencies=[Depends(verify_api_key)])
def update_landmark(landmark: LandmarkUpdate, landmark_id: int = Path(..., ge=1)):
    changes = landmark.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Provide at least one field to update.")
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    data = run_query(lambda db: db.table(TABLE).update(changes).eq("id", landmark_id)).data
    if not data:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return data[0]


@app.delete("/landmarks/{landmark_id}", dependencies=[Depends(verify_api_key)])
def delete_landmark(landmark_id: int = Path(..., ge=1)):
    data = run_query(lambda db: db.table(TABLE).delete().eq("id", landmark_id)).data
    if not data:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return {"message": "Landmark deleted.", "id": landmark_id}
