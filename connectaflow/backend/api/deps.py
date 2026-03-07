from __future__ import annotations

import uuid
from fastapi import Header

from models import DEFAULT_WORKSPACE_ID


def get_workspace_id(x_workspace_id: str | None = Header(default=None)) -> uuid.UUID:
    if not x_workspace_id:
        return DEFAULT_WORKSPACE_ID
    try:
        return uuid.UUID(x_workspace_id)
    except Exception:
        return DEFAULT_WORKSPACE_ID
