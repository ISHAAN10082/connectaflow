from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Workspace

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreate(BaseModel):
    name: str


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
