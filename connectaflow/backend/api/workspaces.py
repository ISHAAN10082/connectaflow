from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Workspace
from services.demo_seed import seed_demo_workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    settings: Optional[dict] = None


@router.get("/")
def list_workspaces(session: Session = Depends(get_session)):
    items = session.exec(select(Workspace)).all()
    return {"workspaces": items}


@router.post("/")
def create_workspace(payload: WorkspaceCreate, session: Session = Depends(get_session)):
    ws = Workspace(id=uuid.uuid4(), name=payload.name)
    session.add(ws)
    session.commit()
    session.refresh(ws)
    return ws


@router.patch("/{workspace_id}")
def update_workspace(
    workspace_id: str,
    payload: WorkspaceUpdate,
    session: Session = Depends(get_session),
):
    workspace = session.get(Workspace, uuid.UUID(workspace_id))
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if payload.name is not None:
        workspace.name = payload.name
    if payload.settings is not None:
        workspace.settings = payload.settings

    session.add(workspace)
    session.commit()
    session.refresh(workspace)
    return workspace


@router.post("/{workspace_id}/seed-demo")
def seed_workspace_examples(
    workspace_id: str,
    session: Session = Depends(get_session),
):
    workspace = session.get(Workspace, uuid.UUID(workspace_id))
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    result = seed_demo_workspace(session, workspace.id)
    return {"status": "ok", **result}
