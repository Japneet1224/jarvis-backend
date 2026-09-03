"""
auth.py
-------

Authentication layer for Jarvis.

Responsibilities:

- Validate registration data.
- Hash user passwords securely with bcrypt.
- Create users in MongoDB.
- Authenticate users.
- Generate JWT access tokens.
- Decode and validate JWT access tokens.
- Resolve authenticated users.

Important:
Password hashing uses the bcrypt package directly rather than
Passlib's bcrypt wrapper. This avoids compatibility problems between
Passlib and newer bcrypt releases.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from jose import JWTError, jwt
from pymongo.errors import DuplicateKeyError

from config import settings
from database import (
    create_user,
    get_user,
    get_user_by_email,
    to_object_id,
)


# ============================================================
# Constants
# ============================================================

BCRYPT_MAX_PASSWORD_BYTES = 72


# ============================================================
# Validation Helpers
# ============================================================

def normalize_email(email: str) -> str:
    """
    Normalize and validate an email address.
    """

    if not isinstance(email, str):
        raise ValueError("Email must be a string.")

    email = email.strip().lower()

    if not email:
        raise ValueError("Email cannot be empty.")

    if "@" not in email:
        raise ValueError("Invalid email address.")

    if email.startswith("@") or email.endswith("@"):
        raise ValueError("Invalid email address.")

    return email


def normalize_username(
    username: Optional[str],
) -> Optional[str]:
    """
    Normalize an optional username.
    """

    if username is None:
        return None

    if not isinstance(username, str):
        raise ValueError("Username must be a string.")

    username = username.strip()

    if not username:
        return None

    if len(username) < 3:
        raise ValueError(
            "Username must contain at least 3 characters."
        )

    if len(username) > 50:
        raise ValueError(
            "Username cannot exceed 50 characters."
        )

    return username


def validate_password(password: str) -> str:
    """
    Validate a password before hashing.

    bcrypt has a maximum input size of 72 BYTES.
    """

    if not isinstance(password, str):
        raise ValueError("Password must be a string.")

    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Password must contain at least "
            f"{settings.PASSWORD_MIN_LENGTH} characters."
        )

    password_bytes = password.encode("utf-8")

    if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(
            "Password is too long. "
            "It must be 72 UTF-8 bytes or fewer."
        )

    return password


# ============================================================
# Password Hashing
# ============================================================

def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt directly.
    """

    password = validate_password(password)

    password_bytes = password.encode("utf-8")

    password_hash = bcrypt.hashpw(
        password_bytes,
        bcrypt.gensalt(),
    )

    return password_hash.decode("utf-8")


def verify_password(
    password: str,
    password_hash: str,
) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.

    Returns False for an invalid password or malformed hash.
    """

    if not isinstance(password, str):
        return False

    if not isinstance(password_hash, str):
        return False

    if not password or not password_hash:
        return False

    try:
        password_bytes = password.encode("utf-8")
        hash_bytes = password_hash.encode("utf-8")

        # bcrypt cannot process passwords larger than 72 bytes.
        if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
            return False

        return bcrypt.checkpw(
            password_bytes,
            hash_bytes,
        )

    except (ValueError, TypeError, UnicodeError):
        return False

    except Exception:
        return False


# ============================================================
# User Registration
# ============================================================

def register_user(
    email: str,
    password: str,
    username: Optional[str] = None,
) -> str:
    """
    Register a new user.

    Returns:
        MongoDB user ID as a string.
    """

    email = normalize_email(email)
    username = normalize_username(username)
    password = validate_password(password)

    # --------------------------------------------------------
    # Check whether email already exists
    # --------------------------------------------------------

    existing_user = get_user_by_email(email)

    if existing_user is not None:
        raise ValueError(
            "An account with this email already exists."
        )

    # --------------------------------------------------------
    # Create password hash
    # --------------------------------------------------------

    password_hash = hash_password(password)

    # --------------------------------------------------------
    # Create MongoDB user
    # --------------------------------------------------------

    try:
        user_id = create_user(
            email=email,
            username=username,
            password_hash=password_hash,
        )

    except DuplicateKeyError as exc:
        raise ValueError(
            "A user with this email or username already exists."
        ) from exc

    return user_id


# ============================================================
# User Authentication
# ============================================================

def authenticate_user(
    email: str,
    password: str,
) -> Optional[dict[str, Any]]:
    """
    Authenticate an existing user.

    Returns:
        User document without password_hash,
        or None when authentication fails.
    """

    email = normalize_email(email)

    # --------------------------------------------------------
    # Find user
    # --------------------------------------------------------

    user = get_user_by_email(email)

    if user is None:
        return None

    # --------------------------------------------------------
    # Get stored password hash
    # --------------------------------------------------------

    password_hash = user.get("password_hash")

    if not password_hash:
        return None

    # --------------------------------------------------------
    # Verify password
    # --------------------------------------------------------

    if not verify_password(
        password,
        password_hash,
    ):
        return None

    # --------------------------------------------------------
    # Check account status
    # --------------------------------------------------------

    if not user.get("is_active", True):
        return None

    # --------------------------------------------------------
    # Remove sensitive password hash
    # --------------------------------------------------------

    user.pop("password_hash", None)

    # --------------------------------------------------------
    # Convert MongoDB ObjectId to string
    # --------------------------------------------------------

    if "_id" in user:
        user["_id"] = str(user["_id"])

    return user


# ============================================================
# JWT Creation
# ============================================================

def create_access_token(
    user_id: str,
) -> str:
    """
    Create a JWT access token.
    """

    if not settings.JWT_SECRET_KEY:
        raise RuntimeError(
            "JWT_SECRET_KEY is not configured."
        )

    # Validate that the user ID is a valid MongoDB ObjectId.
    to_object_id(user_id)

    now = datetime.now(timezone.utc)

    expires_at = (
        now
        + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    payload = {
        "sub": user_id,
        "iat": now,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


# ============================================================
# JWT Decoding
# ============================================================

def decode_access_token(
    token: str,
) -> Optional[dict[str, Any]]:
    """
    Decode and validate a JWT access token.
    """

    if not token:
        return None

    if not settings.JWT_SECRET_KEY:
        raise RuntimeError(
            "JWT_SECRET_KEY is not configured."
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ],
        )

    except JWTError:
        return None

    user_id = payload.get("sub")

    if not user_id:
        return None

    try:
        to_object_id(user_id)

    except ValueError:
        return None

    return payload


# ============================================================
# Current User
# ============================================================

def get_current_user(
    token: str,
) -> Optional[dict[str, Any]]:
    """
    Resolve a JWT token to the corresponding user.
    """

    payload = decode_access_token(token)

    if payload is None:
        return None

    user_id = payload.get("sub")

    if not user_id:
        return None

    user = get_user(user_id)

    if user is None:
        return None

    if not user.get("is_active", True):
        return None

    user.pop("password_hash", None)

    if "_id" in user:
        user["_id"] = str(user["_id"])

    return user


# ============================================================
# Current User ID
# ============================================================

def get_current_user_id(
    token: str,
) -> Optional[str]:
    """
    Resolve a JWT token directly to a user ID.
    """

    payload = decode_access_token(token)

    if payload is None:
        return None

    user_id = payload.get("sub")

    if not user_id:
        return None

    return user_id


# ============================================================
# Registration + Token
# ============================================================

def register_and_create_token(
    email: str,
    password: str,
    username: Optional[str] = None,
) -> dict[str, Any]:
    """
    Register a user and immediately create a JWT.
    """

    user_id = register_user(
        email=email,
        password=password,
        username=username,
    )

    token = create_access_token(user_id)

    user = get_user(user_id)

    if user is None:
        raise RuntimeError(
            "User was created but could not be retrieved."
        )

    user.pop("password_hash", None)

    if "_id" in user:
        user["_id"] = str(user["_id"])

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


# ============================================================
# Login + Token
# ============================================================

def login_and_create_token(
    email: str,
    password: str,
) -> Optional[dict[str, Any]]:
    """
    Authenticate a user and create a JWT.
    """

    user = authenticate_user(
        email=email,
        password=password,
    )

    if user is None:
        return None

    user_id = user.get("_id")

    if not user_id:
        raise RuntimeError(
            "Authenticated user does not have a valid ID."
        )

    token = create_access_token(user_id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }