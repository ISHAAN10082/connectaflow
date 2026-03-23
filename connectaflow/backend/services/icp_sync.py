from __future__ import annotations

import re
import uuid
from typing import Optional

from sqlmodel import Session, select

from models import GTMContext, ICP, ICPDefinition, ICPCriterion, ICPRubric


def _parse_employee_range(company_size: dict, firmographic_range: dict) -> Optional[tuple[float, float]]:
    if isinstance(company_size, dict):
        minimum = company_size.get("min")
        maximum = company_size.get("max")
        if minimum is not None and maximum is not None:
            try:
                return float(minimum), float(maximum)
            except (TypeError, ValueError):
                pass

    employee_range = ""
    if isinstance(firmographic_range, dict):
        employee_range = str(firmographic_range.get("employee_range") or "")
    match = re.search(r"(\d+)\D+(\d+)", employee_range.replace(",", ""))
    if match:
        return float(match.group(1)), float(match.group(2))
    return None


def build_legacy_rubric_from_mission_icp(icp: ICP) -> ICPRubric:
    criteria: list[ICPCriterion] = []
    required_fields: list[str] = []
    firmographic_range = icp.firmographic_range or {}

    industries = [item.strip() for item in (icp.industry or []) if item and item.strip()]
    if not industries and firmographic_range.get("industry"):
        industries = [str(firmographic_range["industry"]).strip()]
    if industries:
        criteria.append(ICPCriterion(
            field_name="industry",
            label="Industry match",
            weight=0.32,
            match_type="contains",
            match_value=", ".join(industries),
        ))
        required_fields.append("industry")

    employee_range = _parse_employee_range(icp.company_size or {}, firmographic_range)
    if employee_range:
        criteria.append(ICPCriterion(
            field_name="employee_count",
            label="Employee count fit",
            weight=0.24,
            match_type="range",
            match_value=[employee_range[0], employee_range[1]],
        ))
        required_fields.append("employee_count")

    geographies = [item.strip() for item in (icp.geography or []) if item and item.strip()]
    if not geographies and firmographic_range.get("geography"):
        geographies = [str(firmographic_range["geography"]).strip()]
    if geographies:
        criteria.append(ICPCriterion(
            field_name="hq_location",
            label="Geography fit",
            weight=0.16,
            match_type="contains",
            match_value=", ".join(geographies),
        ))
        required_fields.append("hq_location")

    business_model = str(firmographic_range.get("business_model") or "").strip()
    if business_model:
        criteria.append(ICPCriterion(
            field_name="business_model",
            label="Business model fit",
            weight=0.14,
            match_type="contains",
            match_value=business_model,
        ))
        required_fields.append("business_model")

    use_cases = [item.strip() for item in (icp.use_cases or []) if item and item.strip()]
    if use_cases:
        criteria.append(ICPCriterion(
            field_name="company_description",
            label="Use case resonance",
            weight=0.14,
            match_type="contains",
            match_value=", ".join(use_cases),
        ))
        required_fields.append("company_description")

    if not criteria:
        criteria.append(ICPCriterion(
            field_name="company_description",
            label="General fit",
            weight=1.0,
            match_type="contains",
            match_value=icp.name or icp.icp_statement or "b2b",
        ))
        required_fields.append("company_description")

    return ICPRubric(
        criteria=criteria,
        required_fields=required_fields,
        description=icp.icp_statement or icp.name,
    )


def sync_mission_icp_definition(icp: ICP, ctx: GTMContext, session: Session) -> ICPDefinition:
    legacy = session.get(ICPDefinition, icp.id)
    rubric = build_legacy_rubric_from_mission_icp(icp)

    if not legacy:
        legacy = ICPDefinition(
            id=icp.id,
            workspace_id=icp.workspace_id,
            name=icp.name,
        )

    legacy.workspace_id = icp.workspace_id
    legacy.name = icp.name
    legacy.product_description = ctx.product_description or ctx.product_category or ""
    legacy.customer_examples = list(ctx.customer_examples or [])
    legacy.rubric = rubric.model_dump()
    legacy.draft_text = icp.icp_statement or ctx.icp_statement
    legacy.redteam_text = icp.icp_rationale or ""
    session.add(legacy)
    session.flush()
    return legacy


def select_primary_mission_icp(session: Session, workspace_id: uuid.UUID, mission_id: uuid.UUID) -> Optional[ICP]:
    icps = session.exec(
        select(ICP)
        .where(ICP.workspace_id == workspace_id)
        .where(ICP.mission_id == mission_id)
        .order_by(ICP.created_at.asc())  # type: ignore
    ).all()
    if not icps:
        return None

    for priority in ("Primary", "Secondary", "Experimental"):
        for icp in icps:
            if (icp.icp_priority or "").lower() == priority.lower():
                return icp
    return icps[0]


def sync_context_icp_state(ctx: GTMContext, session: Session) -> Optional[ICP]:
    primary = select_primary_mission_icp(session, ctx.workspace_id, ctx.id)
    if not primary:
        return None

    ctx.icp_id = primary.id
    ctx.icp_name = primary.name
    ctx.icp_statement = primary.icp_statement
    ctx.icp_priority = primary.icp_priority
    ctx.firmographic_range = primary.firmographic_range or ctx.firmographic_range
    ctx.icp_rationale = primary.icp_rationale
    ctx.list_sourcing_guidance = primary.list_sourcing_guidance
    session.add(ctx)
    session.flush()
    sync_mission_icp_definition(primary, ctx, session)
    return primary


def ensure_embedded_context_icp(session: Session, ctx: GTMContext) -> Optional[ICP]:
    existing = session.exec(
        select(ICP)
        .where(ICP.workspace_id == ctx.workspace_id)
        .where(ICP.mission_id == ctx.id)
    ).first()
    if existing:
        sync_mission_icp_definition(existing, ctx, session)
        return existing

    has_embedded_icp = any([
        (ctx.icp_name or "").strip(),
        (ctx.icp_statement or "").strip(),
        bool(ctx.firmographic_range),
        (ctx.list_sourcing_guidance or "").strip(),
        (ctx.icp_rationale or "").strip(),
    ])
    if not has_embedded_icp:
        return None

    icp = ICP(
        id=ctx.icp_id or uuid.uuid4(),
        workspace_id=ctx.workspace_id,
        mission_id=ctx.id,
        name=ctx.icp_name or f"{ctx.company_name or ctx.name or 'Primary'} ICP",
        industry=list(ctx.target_industries or []),
        geography=[ctx.geographic_focus] if ctx.geographic_focus else [],
        use_cases=[],
        company_size={},
        firmographic_range=ctx.firmographic_range or {},
        icp_statement=ctx.icp_statement or "",
        icp_priority=ctx.icp_priority or "Primary",
        list_sourcing_guidance=ctx.list_sourcing_guidance or "",
        icp_rationale=ctx.icp_rationale or "",
    )
    session.add(icp)
    session.flush()
    sync_mission_icp_definition(icp, ctx, session)
    return icp
