"""Warehouse access levels without authentication."""

from __future__ import annotations

from enum import IntEnum


class WarehouseAccessLevel(IntEnum):
    """Ordered effective authority for one warehouse."""

    VIEW = 1
    EDIT = 2
    MANAGE = 3


# Backwards compatibility stubs for code that previously imported these symbols.
# They are no-ops now that the app runs without authentication.

class CurrentUserPrincipal:  # pragma: no cover - compatibility only
    subject_id = None
    username = "anonymous"
    global_role = "SYSTEM_ADMIN"
    scopes = frozenset()
    warehouse_access = {}

    @classmethod
    def from_claims(cls, *args, **kwargs):
        return cls()

    @classmethod
    def from_admin_claims(cls, *args, **kwargs):
        return cls()

    @property
    def audit_actor(self):
        return "anonymous"

    @property
    def has_global_warehouse_access(self):
        return True

    def can_access(self, *args, **kwargs):
        return True

    def require_scope(self, *args, **kwargs):
        return None

    def require_warehouse(self, *args, **kwargs):
        return None


class AccessTokenVerifier:  # pragma: no cover
    async def verify(self, token=None):
        return {}


class JwksAccessTokenVerifier(AccessTokenVerifier):  # pragma: no cover
    def __init__(self, *args, **kwargs):
        pass


def unauthenticated(*args, **kwargs):  # pragma: no cover
    from app.errors import ApiError

    return ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication disabled")


def forbidden(*args, **kwargs):  # pragma: no cover
    from app.errors import ApiError

    return ApiError(403, "ACCESS_DENIED", "Access disabled")
