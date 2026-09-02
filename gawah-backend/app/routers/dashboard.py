from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.database import Database, get_db
from app.auth import get_current_user
from app.services.kpi_service import compute_kpis

# Every route here exposes full statement content, so the whole router is
# staff-only. Witnesses use /api/statements/{ref_code}, which stays anonymous.
router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/statements")
async def dashboard_statements(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    flags: Optional[str] = None,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    items, total = db.list_statements(
        page=page, page_size=page_size, status=status, flags=flags
    )
    return {
        "items": [
            {
                "ref_code": s.ref_code,
                "created_at": s.created_at.isoformat()
                if hasattr(s.created_at, "isoformat")
                else s.created_at,
                "location": s.location,
                "status": s.status,
                "intimidation_flag": s.intimidation_flag,
                "inconsistency_flags": [
                    f.model_dump() if hasattr(f, "model_dump") else f
                    for f in (s.inconsistency_flags or [])
                ],
                "corroboration_score": s.corroboration_score,
                "incident_cluster_id": s.incident_cluster_id,
                "privacy_mode": s.privacy_mode,
                "language_of_call": s.language_of_call,
                "witness_type": s.witness_type,
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/clusters")
async def dashboard_clusters(db: Database = Depends(get_db)) -> Dict[str, Any]:
    clusters = db.list_clusters()
    return {"items": [c.to_summary() for c in clusters]}


@router.get("/clusters/{cluster_id}")
async def dashboard_cluster_detail(
    cluster_id: str,
    db: Database = Depends(get_db),
) -> Dict[str, Any]:
    cluster = db.get_cluster(cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    linked = db.list_statements_in_cluster(cluster_id)
    linked_payload = [
        {
            "ref_code": s.ref_code,
            "created_at": s.created_at.isoformat()
            if hasattr(s.created_at, "isoformat")
            else s.created_at,
            "location": s.location,
            "status": s.status,
            "language_of_call": s.language_of_call,
            "witness_type": s.witness_type,
            "corroboration_score": s.corroboration_score,
            "intimidation_flag": s.intimidation_flag,
            "inconsistency_flags": [
                f.model_dump() if hasattr(f, "model_dump") else f
                for f in (s.inconsistency_flags or [])
            ],
            "privacy_mode": s.privacy_mode,
            "incident_cluster_id": s.incident_cluster_id,
        }
        for s in linked
    ]
    return cluster.to_detail(linked_payload)


@router.get("/kpis")
async def dashboard_kpis(db: Database = Depends(get_db)) -> Dict[str, Any]:
    return compute_kpis(db)
