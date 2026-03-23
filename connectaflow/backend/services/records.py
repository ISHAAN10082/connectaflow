from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from models import Account, Lead, OutcomeEvent, TaskItem


def normalize_domain(domain: Optional[str]) -> Optional[str]:
    if not domain:
        return None
    normalized = domain.strip().lower()
    if not normalized:
        return None
    return normalized.replace("https://", "").replace("http://", "").replace("www.", "").strip("/")


def ensure_account_for_domain(
    session: Session,
    workspace_id: uuid.UUID,
    domain: Optional[str],
    *,
    name: Optional[str] = None,
    touch_signal: bool = False,
) -> Optional[Account]:
    normalized = normalize_domain(domain)
    if not normalized:
        return None

    account = session.exec(
        select(Account)
        .where(Account.workspace_id == workspace_id)
        .where(Account.domain == normalized)
    ).first()

    now = datetime.utcnow()
    if not account:
        account = Account(
            workspace_id=workspace_id,
            domain=normalized,
            name=name or normalized,
            last_signal_at=now if touch_signal else None,
        )
    else:
        if name and not account.name:
            account.name = name
        if touch_signal:
            account.last_signal_at = now
        account.updated_at = now

    session.add(account)
    session.flush()
    return account


def sync_lead_account(session: Session, workspace_id: uuid.UUID, lead: Lead) -> Optional[Account]:
    account = ensure_account_for_domain(
        session,
        workspace_id,
        lead.domain,
        name=(lead.custom_data or {}).get("company_name") if isinstance(lead.custom_data, dict) else None,
    )
    lead.company_id = account.id if account else None
    lead.updated_at = datetime.utcnow()
    session.add(lead)
    return account


def sync_follow_up_task(session: Session, workspace_id: uuid.UUID, lead: Lead) -> None:
    open_task = session.exec(
        select(TaskItem)
        .where(TaskItem.workspace_id == workspace_id)
        .where(TaskItem.lead_id == lead.id)
        .where(TaskItem.task_type == "follow_up")
        .where(TaskItem.status == "open")
    ).first()

    if lead.follow_up_date:
        if open_task:
            open_task.title = f"Follow up with {lead.first_name or lead.email}"
            open_task.description = f"Reach back out to {lead.email}."
            open_task.due_at = lead.follow_up_date
            open_task.updated_at = datetime.utcnow()
            session.add(open_task)
            return

        session.add(TaskItem(
            workspace_id=workspace_id,
            lead_id=lead.id,
            account_id=lead.company_id,
            title=f"Follow up with {lead.first_name or lead.email}",
            description=f"Reach back out to {lead.email}.",
            task_type="follow_up",
            due_at=lead.follow_up_date,
        ))
        return

    if open_task:
        open_task.status = "cancelled"
        open_task.updated_at = datetime.utcnow()
        session.add(open_task)


def record_outcome(
    session: Session,
    workspace_id: uuid.UUID,
    *,
    lead_id: Optional[uuid.UUID] = None,
    account_id: Optional[uuid.UUID] = None,
    play_id: Optional[uuid.UUID] = None,
    channel: Optional[str] = None,
    outcome_type: str,
    notes: Optional[str] = None,
    metadata: Optional[dict] = None,
    occurred_at: Optional[datetime] = None,
) -> OutcomeEvent:
    outcome = OutcomeEvent(
        workspace_id=workspace_id,
        lead_id=lead_id,
        account_id=account_id,
        play_id=play_id,
        channel=channel,
        outcome_type=outcome_type,
        notes=notes,
        meta_data=metadata or {},
        occurred_at=occurred_at or datetime.utcnow(),
    )
    session.add(outcome)
    session.flush()
    return outcome
