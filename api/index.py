import os
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Read the .env file when running on my computer.
# On Vercel, the values come from the Environment Variables settings.
load_dotenv()

app = FastAPI(
    title="World Heritage Sites API",
    description="Landmark API with Supabase database, user login and bcrypt password hashing.",
    version="5.0.0",
)

# The website and the API are on the same domain, so no other website needs permission.
# Extra websites can be allowed with ALLOWED_ORIGINS (optional).
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ==========================================
# SETTINGS
# ==========================================
TOKEN_MINUTES = 60        # how long a login lasts
MAX_FAILED_LOGINS = 10    # wrong passwords before the account is locked
LOCK_MINUTES = 5          # how long the account stays locked
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


# ==========================================
# DATABASE CONNECTION
# The URL and the key come from environment variables, never from the code.
# ==========================================
database = None


def get_db():
    global database
    if database is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise HTTPException(status_code=503, detail="Database is not configured.")
        from supabase import create_client

        database = create_client(url, key)
    return database


def run(query, duplicate_message="A landmark with this title already exists."):
    """Run a database query. If it fails, send a short and safe error message."""
    try:
        return query.execute()
    except HTTPException:
        raise
    except Exception as error:
        print("DATABASE ERROR:", repr(error))  # visible in Vercel logs only
        code = getattr(error, "code", None)
        if code == "23505":  # the value must be unique but it already exists
            raise HTTPException(status_code=409, detail=duplicate_message)
        if code in ("23502", "23514", "22P02", "22003"):  # database rule broken
            raise HTTPException(status_code=422, detail="The data does not follow the database rules.")
        if code is not None:  # another database error
            raise HTTPException(status_code=500, detail="Database query failed.")
        raise HTTPException(status_code=503, detail="Database unavailable.")


# ==========================================
# DATABASE FUNCTIONS (all the Supabase queries are here)
# ==========================================
# ----- landmarks table -----
def db_get_landmarks(country=None):
    query = get_db().table("landmarks").select("*").order("id")
    if country:
        query = query.ilike("country", country)
    return run(query).data


def db_get_landmark(landmark_id):
    result = run(get_db().table("landmarks").select("*").eq("id", landmark_id)).data
    if len(result) == 0:
        return None
    return result[0]


def db_search_landmarks(word):
    # look for the word in these columns (not case sensitive)
    columns = ["title", "site_type", "country", "city", "region", "description"]
    conditions = ",".join(column + ".ilike.%" + word + "%" for column in columns)
    return run(get_db().table("landmarks").select("*").or_(conditions).order("id")).data


def db_add_landmark(data):
    return run(get_db().table("landmarks").insert(data)).data[0]


def db_update_landmark(landmark_id, changes):
    result = run(get_db().table("landmarks").update(changes).eq("id", landmark_id)).data
    if len(result) == 0:
        return None
    return result[0]


def db_delete_landmark(landmark_id):
    result = run(get_db().table("landmarks").delete().eq("id", landmark_id)).data
    return len(result) > 0


# ----- users table (each user has a role_id that points to the roles table) -----
def db_get_user_by_email(email):
    result = run(get_db().table("users").select("*, role:roles(role)").eq("email", email)).data
    if len(result) == 0:
        return None
    return result[0]


def db_get_user_by_login(login_name):
    """The login box accepts an email or a username (not case sensitive)."""
    user = db_get_user_by_email(login_name)
    if user is not None:
        return user
    result = run(get_db().table("users").select("*, role:roles(role)").eq("username", login_name)).data
    if len(result) == 0:
        return None
    return result[0]


def db_get_user_by_id(user_id):
    result = run(
        get_db().table("users").select("id, full_name, email, is_active, role:roles(role)").eq("id", user_id)
    ).data
    if len(result) == 0:
        return None
    return result[0]


def db_add_user(full_name, email, password_hash):
    # role_id is not sent. The database gives new accounts the normal "user" role by itself.
    new_user = {"full_name": full_name, "email": email, "password_hash": password_hash}
    run(get_db().table("users").insert(new_user), duplicate_message="This email is already registered.")
    return db_get_user_by_email(email)


def db_update_user(user_id, changes):
    run(get_db().table("users").update(changes).eq("id", user_id))


# ----- favorites table (user_id -> users.id, landmark_id -> landmarks.id) -----
def db_get_favorites(user_id):
    query = get_db().table("favorites").select("id, created_at, landmark:landmarks(*)").eq("user_id", user_id)
    return run(query.order("id")).data


def db_add_favorite(user_id, landmark_id):
    new_favorite = {"user_id": user_id, "landmark_id": landmark_id}
    return run(get_db().table("favorites").insert(new_favorite), duplicate_message="Already in your favorites.").data[0]


def db_delete_favorite(user_id, landmark_id):
    query = get_db().table("favorites").delete().eq("user_id", user_id).eq("landmark_id", landmark_id)
    return len(run(query).data) > 0


# ----- trips table (saved budget estimates) -----
def db_get_trips(user_id):
    query = get_db().table("trips").select("*, landmark:landmarks(title, country)").eq("user_id", user_id)
    return run(query.order("id", desc=True)).data


def db_add_trip(data):
    return run(get_db().table("trips").insert(data)).data[0]


def db_delete_trip(user_id, trip_id):
    query = get_db().table("trips").delete().eq("id", trip_id).eq("user_id", user_id)
    return len(run(query).data) > 0


# ==========================================
# PASSWORD HASHING (bcrypt)
# ==========================================
def hash_password(password):
    # bcrypt adds a random salt, so the same password gives a different hash every time
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def check_password(password, password_hash):
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# Used when the email is not registered, so the answer takes the same time as a real check
FAKE_HASH = hash_password("not-a-real-password-1")


def role_name(user):
    """Return 'admin' or 'user' from the role text in the roles table."""
    role = user.get("role") or {}
    if role.get("role") == "admin":
        return "admin"
    return "user"


# ==========================================
# LOGIN TOKEN (JWT)
# ==========================================
def get_jwt_secret():
    secret = os.getenv("JWT_SECRET")
    if not secret or len(secret) < 32:
        raise HTTPException(status_code=503, detail="Login is not configured.")
    return secret


def make_token(user_id):
    now = datetime.now(timezone.utc)
    data = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=TOKEN_MINUTES)}
    return jwt.encode(data, get_jwt_secret(), algorithm="HS256")


bearer = HTTPBearer(auto_error=False)


def require_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    """Only logged-in users can pass. The token must be valid and not expired."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Login required.")
    try:
        data = jwt.decode(
            credentials.credentials, get_jwt_secret(), algorithms=["HS256"], options={"require": ["exp", "sub"]}
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Login expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid login token.")

    user = db_get_user_by_id(data.get("sub"))
    if user is None or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Account not found or disabled.")
    return user


def require_admin(user=Depends(require_user)):
    """Only admin users can pass."""
    if role_name(user) != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


# ==========================================
# DATA MODELS (validation rules)
# ==========================================
class RegisterData(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    full_name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=6, max_length=72)

    @field_validator("email")
    @classmethod
    def make_email_lowercase(cls, value):
        return value.lower()

    @field_validator("password")
    @classmethod
    def check_password_length(cls, value):
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password is too long")
        return value


class LoginData(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    # "email" can hold an email or a username (the field keeps this name for the login page)
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def make_email_lowercase(cls, value):
        return value.lower()


class TripCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    landmark_id: int = Field(ge=1)
    travel_style: Literal["budget", "standard", "luxury"]
    days: int = Field(ge=1, le=365)
    travelers: int = Field(ge=1, le=100)
    total_cost: float = Field(ge=0, le=1000000000)
    currency: str = Field(pattern=r"^[A-Z]{3}$")


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
    hotel_rate: int = Field(gt=0, le=10000000)

    @field_validator("icon")
    @classmethod
    def check_icon(cls, value):
        if value is not None and not value.startswith("/images/"):
            raise ValueError("icon must start with /images/")
        return value


class LandmarkUpdate(BaseModel):
    """Every field is optional, so PATCH only changes the fields that are sent."""

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
    hotel_rate: Optional[int] = Field(default=None, gt=0, le=10000000)

    @field_validator("icon")
    @classmethod
    def check_icon(cls, value):
        if value is not None and not value.startswith("/images/"):
            raise ValueError("icon must start with /images/")
        return value


# ==========================================
# ANY OTHER ERROR (no secrets or stack trace is shown)
# ==========================================
@app.exception_handler(Exception)
async def handle_other_errors(request, error):
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


# ==========================================
# LOGIN ROUTES (public)
# ==========================================
@app.post("/auth/register", status_code=201)
def register(data: RegisterData):
    # Save only the hash. The real password is never saved.
    user = db_add_user(data.full_name, data.email, hash_password(data.password))
    return {
        "message": "Account created. You can log in now.",
        "user": {"id": user["id"], "full_name": user["full_name"], "email": user["email"], "role": role_name(user)},
    }


@app.post("/auth/login")
def login(data: LoginData):
    user = db_get_user_by_login(data.email)
    now = datetime.now(timezone.utc)

    # 1. Is the account locked because of too many wrong passwords?
    if user is not None and user.get("locked_until"):
        locked_until = datetime.fromisoformat(user["locked_until"].replace("Z", "+00:00"))
        if locked_until > now:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in a few minutes.")

    # 2. Check the password against the saved hash
    if user is None:
        password_is_correct = check_password(data.password, FAKE_HASH)
    else:
        password_is_correct = check_password(data.password, user["password_hash"])

    # 3. Wrong email or wrong password (same message for both)
    if user is None or not password_is_correct:
        if user is not None:
            failed = (user.get("failed_login_attempts") or 0) + 1
            if failed >= MAX_FAILED_LOGINS:
                lock_time = (now + timedelta(minutes=LOCK_MINUTES)).isoformat()
                db_update_user(user["id"], {"failed_login_attempts": 0, "locked_until": lock_time})
            else:
                db_update_user(user["id"], {"failed_login_attempts": failed})
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # 4. Is the account disabled?
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="This account is disabled.")

    # 5. Login is correct. Reset the counters and save the login time.
    db_update_user(
        user["id"], {"failed_login_attempts": 0, "locked_until": None, "last_login_at": now.isoformat()}
    )
    return {
        "access_token": make_token(user["id"]),
        "token_type": "bearer",
        "expires_in_minutes": TOKEN_MINUTES,
        "email": user["email"],
        "username": user.get("username"),
        "full_name": user["full_name"],
        "role": role_name(user),
    }


@app.get("/auth/me")
def who_am_i(user=Depends(require_user)):
    return {"full_name": user["full_name"], "email": user["email"], "role": role_name(user)}


# ==========================================
# PUBLIC ROUTES
# ==========================================
@app.get("/")
def home():
    result = run(get_db().table("landmarks").select("id", count="exact").limit(1))
    return {
        "message": "Welcome to the World Heritage Sites API!",
        "count": result.count,
        "endpoints": ["/health", "/auth/login", "/auth/register", "/landmarks", "/landmarks/{id}", "/landmarks/search?q=", "/favorites", "/trips"],
    }


@app.get("/health")
def health_check():
    run(get_db().table("landmarks").select("id").limit(1))
    return {
        "status": "ok",
        "database": "connected",
        "service": "World Heritage Sites API",
        "version": app.version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ==========================================
# LANDMARK ROUTES - READ (any logged-in user)
# ==========================================
@app.get("/landmarks", dependencies=[Depends(require_user)])
def get_landmarks(country: Optional[str] = Query(default=None, max_length=100)):
    landmarks = db_get_landmarks(country)
    return {"count": len(landmarks), "landmarks": landmarks}


# This route must stay above /landmarks/{landmark_id}, or "search" is read as an id
@app.get("/landmarks/search", dependencies=[Depends(require_user)])
def search_landmarks(q: str = Query(..., min_length=1, max_length=100)):
    word = re.sub(r"[,()%*\\]", " ", q).strip()  # remove characters that break the search
    if word == "":
        raise HTTPException(status_code=422, detail="Search text is not valid.")
    results = db_search_landmarks(word)
    return {"query": q, "count": len(results), "results": results}


@app.get("/landmarks/{landmark_id}", dependencies=[Depends(require_user)])
def get_landmark(landmark_id: int = Path(..., ge=1)):
    landmark = db_get_landmark(landmark_id)
    if landmark is None:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return landmark


# ==========================================
# LANDMARK ROUTES - CREATE, UPDATE, DELETE (admin only)
# ==========================================
@app.post("/landmarks", status_code=201)
def create_landmark(landmark: LandmarkCreate, admin=Depends(require_admin)):
    data = landmark.model_dump()
    data["created_by"] = admin["id"]  # remember which admin added this landmark
    return db_add_landmark(data)


@app.patch("/landmarks/{landmark_id}", dependencies=[Depends(require_admin)])
def update_landmark(landmark: LandmarkUpdate, landmark_id: int = Path(..., ge=1)):
    changes = landmark.model_dump(exclude_unset=True)  # only the fields that were sent
    if len(changes) == 0:
        raise HTTPException(status_code=422, detail="Send at least one field to update.")
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated = db_update_landmark(landmark_id, changes)
    if updated is None:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return updated


@app.delete("/landmarks/{landmark_id}", dependencies=[Depends(require_admin)])
def delete_landmark(landmark_id: int = Path(..., ge=1)):
    if not db_delete_landmark(landmark_id):
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return {"message": "Landmark deleted.", "id": landmark_id}


# ==========================================
# FAVORITE ROUTES (each user sees only their own)
# ==========================================
@app.get("/favorites")
def get_favorites(user=Depends(require_user)):
    favorites = db_get_favorites(user["id"])
    return {"count": len(favorites), "favorites": favorites}


@app.post("/favorites/{landmark_id}", status_code=201)
def add_favorite(landmark_id: int = Path(..., ge=1), user=Depends(require_user)):
    if db_get_landmark(landmark_id) is None:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    return db_add_favorite(user["id"], landmark_id)


@app.delete("/favorites/{landmark_id}")
def remove_favorite(landmark_id: int = Path(..., ge=1), user=Depends(require_user)):
    if not db_delete_favorite(user["id"], landmark_id):
        raise HTTPException(status_code=404, detail="Favorite not found.")
    return {"message": "Favorite removed.", "landmark_id": landmark_id}


# ==========================================
# TRIP ROUTES (saved budget estimates, each user sees only their own)
# ==========================================
@app.get("/trips")
def get_trips(user=Depends(require_user)):
    trips = db_get_trips(user["id"])
    return {"count": len(trips), "trips": trips}


@app.post("/trips", status_code=201)
def create_trip(trip: TripCreate, user=Depends(require_user)):
    if db_get_landmark(trip.landmark_id) is None:
        raise HTTPException(status_code=404, detail="Landmark not found.")
    data = trip.model_dump()
    data["user_id"] = user["id"]  # the user comes from the login token, not from the request body
    return db_add_trip(data)


@app.delete("/trips/{trip_id}")
def delete_trip(trip_id: int = Path(..., ge=1), user=Depends(require_user)):
    if not db_delete_trip(user["id"], trip_id):
        raise HTTPException(status_code=404, detail="Trip not found.")
    return {"message": "Trip deleted.", "id": trip_id}
