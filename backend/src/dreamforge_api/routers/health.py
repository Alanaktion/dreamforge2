from fastapi import APIRouter
from sqlalchemy import text

from ..db import Db

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz(db: Db):
    db.exec(text("SELECT 1"))  # type: ignore[call-overload]
    return {"status": "ok"}
