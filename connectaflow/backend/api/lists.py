from __future__ import annotations

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import CompanyList, ListItem

router = APIRouter(prefix="/lists", tags=["lists"])


class ListCreate(BaseModel):
    name: str
    icp_id: Optional[str] = None
    source: str = "csv"
    raw_columns: dict = {}


class ListItemCreate(BaseModel):
    domain: str
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_title: Optional[str] = None
    raw_data: dict = {}


@router.get("/")
def list_lists(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    items = session.exec(select(CompanyList).where(CompanyList.workspace_id == workspace_id)).all()
    return {"lists": items}


@router.post("/")
def create_list(
    payload: ListCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    icp_uuid = uuid.UUID(payload.icp_id) if payload.icp_id else None
    lst = CompanyList(
        workspace_id=workspace_id,
        name=payload.name,
        icp_id=icp_uuid,
        source=payload.source,
        raw_columns=payload.raw_columns,
    )
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return lst


@router.get("/{list_id}")
def get_list(
    list_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    lst = session.get(CompanyList, list_id)
    if not lst or lst.workspace_id != workspace_id:
        raise HTTPException(404, "List not found")
    return lst


@router.get("/{list_id}/items")
def list_items(
    list_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    lst = session.get(CompanyList, list_id)
    if not lst or lst.workspace_id != workspace_id:
        raise HTTPException(404, "List not found")
    query = (
        select(ListItem)
        .where(ListItem.list_id == list_id)
        .where(ListItem.workspace_id == workspace_id)
        .offset(skip)
        .limit(limit)
    )
    items = session.exec(query).all()
    return {"items": items, "skip": skip, "limit": limit}


@router.post("/{list_id}/items")
def add_items(
    list_id: uuid.UUID,
    payload: list[ListItemCreate],
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    lst = session.get(CompanyList, list_id)
    if not lst or lst.workspace_id != workspace_id:
        raise HTTPException(404, "List not found")

    for item in payload:
        row = ListItem(
            workspace_id=workspace_id,
            list_id=list_id,
            domain=item.domain,
            company_name=item.company_name,
            contact_name=item.contact_name,
            contact_email=item.contact_email,
            contact_title=item.contact_title,
            raw_data=item.raw_data,
        )
        session.add(row)

    lst.row_count += len(payload)
    session.add(lst)
    session.commit()
    return {"added": len(payload)}
