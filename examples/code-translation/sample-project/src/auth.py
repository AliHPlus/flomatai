"""
auth.py — Authentication module

Handles user authentication, JWT token generation, and session management.
"""

import hashlib
import hmac
import base64
import json
from datetime import datetime, timedelta
from typing import Optional


class AuthError(Exception):
    """Base authentication error."""
    pass


class InvalidCredentialsError(AuthError):
    """Raised when credentials are invalid."""
    pass


class TokenExpiredError(AuthError):
    """Raised when JWT token has expired."""
    pass


def hash_password(password: str, salt: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256."""
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations=100000
    )
    return base64.b64encode(dk).decode('utf-8')


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    """Verify a password against its stored hash."""
    computed = hash_password(password, salt)
    return hmac.compare_digest(computed, stored_hash)


def generate_token(user_id: str, secret: str, expires_in_hours: int = 24) -> str:
    """Generate a simple JWT-like token."""
    header = base64.b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode()
    payload = {
        "sub": user_id,
        "iat": datetime.utcnow().isoformat(),
        "exp": (datetime.utcnow() + timedelta(hours=expires_in_hours)).isoformat()
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    signing_input = f"{header}.{payload_b64}"
    signature = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.b64encode(signature).decode()
    return f"{signing_input}.{sig_b64}"


def verify_token(token: str, secret: str) -> dict:
    """Verify a token and return the payload."""
    parts = token.split('.')
    if len(parts) != 3:
        raise AuthError("Invalid token format")

    header, payload_b64, sig_b64 = parts
    signing_input = f"{header}.{payload_b64}"

    expected_sig = base64.b64encode(
        hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    ).decode()

    if not hmac.compare_digest(sig_b64, expected_sig):
        raise AuthError("Invalid token signature")

    payload = json.loads(base64.b64decode(payload_b64 + "==").decode())

    exp = datetime.fromisoformat(payload.get("exp", ""))
    if datetime.utcnow() > exp:
        raise TokenExpiredError("Token has expired")

    return payload


class AuthService:
    """Service for managing user authentication."""

    def __init__(self, secret: str, user_store: dict):
        self.secret = secret
        self.user_store = user_store  # {username: {password_hash, salt, user_id}}

    def login(self, username: str, password: str) -> str:
        """Authenticate user and return a token."""
        user = self.user_store.get(username)
        if not user:
            raise InvalidCredentialsError("User not found")

        if not verify_password(password, user["salt"], user["password_hash"]):
            raise InvalidCredentialsError("Invalid password")

        return generate_token(user["user_id"], self.secret)

    def validate_token(self, token: str) -> Optional[str]:
        """Validate token and return user_id if valid."""
        try:
            payload = verify_token(token, self.secret)
            return payload.get("sub")
        except AuthError:
            return None
