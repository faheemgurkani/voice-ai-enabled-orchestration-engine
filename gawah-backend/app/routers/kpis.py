from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.db.database import Database, get_db
from app.services.kpi_service import compute_kpis

router = APIRouter(prefix="/api", tags=["kpis"])


# KPI counts are aggregates over statement content — same disclosure boundary
# as the dashboard list, so the same gate.
@router.get("/kpis", dependencies=[Depends(get_current_user)])
async def get_kpis(db: Database = Depends(get_db)) -> Dict[str, Any]:
    return compute_kpis(db)
