from __future__ import annotations

import uuid
from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import DEFAULT_WORKSPACE_ID
from models import Workspace


def get_workspace_id(
    x_workspace_id: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> uuid.UUID:
    if not x_workspace_id:
        default_workspace = session.get(Workspace, DEFAULT_WORKSPACE_ID)
        if default_workspace:
            return DEFAULT_WORKSPACE_ID
        fallback = session.exec(select(Workspace)).first()
        if fallback:
            return fallback.id
        raise HTTPException(status_code=503, detail="No workspace is configured")

    try:
        workspace_id = uuid.UUID(x_workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid X-Workspace-Id header") from exc

    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace_id
