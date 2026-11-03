"""scrypt password hashing, byte-compatible with src/lib/server/password.ts.

Hashes are stored as ``base64(salt):base64(key)`` with N=16384, r=8, p=1, a 32-byte salt
and a 64-byte key. Passwords are NFKC-normalised before hashing, as in Node.
"""

import base64
import binascii
import hashlib
import hmac
import os
import unicodedata

KEY_LENGTH = 64
SALT_LENGTH = 32
N, R, P = 16384, 8, 1
# 128 * N * r bytes is 16 MiB; Python's default OpenSSL limit is 32 MiB, give headroom.
MAXMEM = 64 * 1024 * 1024


def _encode(password: str) -> bytes:
    """NFKC, then UTF-8 with lone surrogates as U+FFFD, which is what Node does."""
    normalized = unicodedata.normalize("NFKC", password)
    cleaned = normalized.encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    return cleaned.encode("utf-8")


def _derive(password: str, salt: bytes, length: int) -> bytes:
    return hashlib.scrypt(
        _encode(password),
        salt=salt,
        n=N,
        r=R,
        p=P,
        maxmem=MAXMEM,
        dklen=length,
    )


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_LENGTH)
    key = _derive(password, salt, KEY_LENGTH)
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(key).decode()}"


def verify_password(password: str, hashed: str) -> bool:
    salt_b64, _, key_b64 = (hashed or "").partition(":")
    if not salt_b64 or not key_b64:
        return False
    try:
        salt = base64.b64decode(salt_b64, validate=True)
        key = base64.b64decode(key_b64, validate=True)
    except (binascii.Error, ValueError):
        return False
    if not key:
        return False
    return hmac.compare_digest(key, _derive(password, salt, len(key)))
