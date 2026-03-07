from __future__ import annotations

import uuid
from sqlmodel import Session, select

from database import engine
from models import Workspace, DEFAULT_WORKSPACE_ID


def ensure_default_workspace() -> None:
    with Session(engine) as session:
        ws = session.get(Workspace, DEFAULT_WORKSPACE_ID)
        if ws:
            return
        ws = Workspace(id=DEFAULT_WORKSPACE_ID, name="Default Workspace")
        session.add(ws)
        session.commit()
