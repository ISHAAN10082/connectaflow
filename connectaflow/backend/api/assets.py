"""
Social Proof Assets API — case studies, testimonials, metrics.
Used by the Plays messaging studio for story component.
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from api.deps import get_workspace_id
from models import SocialProofAsset, AssetCreate, AssetUpdate

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/", response_model=dict)
def list_assets(
    icp_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    asset_type: Optional[str] = None,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    q = select(SocialProofAsset).where(SocialProofAsset.workspace_id == workspace_id)
    if icp_id:
        q = q.where(SocialProofAsset.icp_id == uuid.UUID(icp_id))
    if persona_id:
        q = q.where(SocialProofAsset.persona_id == uuid.UUID(persona_id))
    if asset_type:
        q = q.where(SocialProofAsset.type == asset_type)

    assets = session.exec(q.order_by(SocialProofAsset.created_at.desc())).all()  # type: ignore
    return {
        "assets": [_asset_dict(a) for a in assets],
        "total": len(assets),
    }


@router.post("/", response_model=dict)
def create_asset(
    payload: AssetCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    asset = SocialProofAsset(
        workspace_id=workspace_id,
        type=payload.type,
        title=payload.title,
        content=payload.content,
        icp_id=uuid.UUID(payload.icp_id) if payload.icp_id else None,
        persona_id=uuid.UUID(payload.persona_id) if payload.persona_id else None,
        use_case_tags=payload.use_case_tags,
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return _asset_dict(asset)


@router.get("/{asset_id}", response_model=dict)
def get_asset(
    asset_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    asset = session.exec(
        select(SocialProofAsset)
        .where(SocialProofAsset.id == uuid.UUID(asset_id))
        .where(SocialProofAsset.workspace_id == workspace_id)
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_dict(asset)


@router.patch("/{asset_id}", response_model=dict)
def update_asset(
    asset_id: str,
    payload: AssetUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    asset = session.exec(
        select(SocialProofAsset)
        .where(SocialProofAsset.id == uuid.UUID(asset_id))
        .where(SocialProofAsset.workspace_id == workspace_id)
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "icp_id":
            setattr(asset, field, uuid.UUID(value) if value else None)
        elif field == "persona_id":
            setattr(asset, field, uuid.UUID(value) if value else None)
        else:
            setattr(asset, field, value)

    session.add(asset)
    session.commit()
    session.refresh(asset)
    return _asset_dict(asset)


@router.delete("/{asset_id}", response_model=dict)
def delete_asset(
    asset_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    asset = session.exec(
        select(SocialProofAsset)
        .where(SocialProofAsset.id == uuid.UUID(asset_id))
        .where(SocialProofAsset.workspace_id == workspace_id)
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    session.delete(asset)
    session.commit()
    return {"deleted": True}


def _asset_dict(asset: SocialProofAsset) -> dict:
    return {
        "id": str(asset.id),
        "workspace_id": str(asset.workspace_id),
        "type": asset.type,
        "title": asset.title,
        "content": asset.content,
        "icp_id": str(asset.icp_id) if asset.icp_id else None,
        "persona_id": str(asset.persona_id) if asset.persona_id else None,
        "use_case_tags": asset.use_case_tags or [],
        "created_at": asset.created_at.isoformat(),
    }
