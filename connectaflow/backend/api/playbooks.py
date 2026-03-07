"""
Playbooks & Plays API — persona-driven engagement sequences.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from api.deps import get_workspace_id
from database import get_session
from models import (
    Playbook, Play, PlayStep, PlayEnrollment,
    PlaybookCreate, PlaybookUpdate, PlayCreate, PlayUpdate,
    PlayStepCreate, PlayStepUpdate, EnrollRequest,
    ICPScore, Signal, Lead,
)
import uuid
from datetime import datetime
from typing import List, Optional

router = APIRouter(prefix="/playbooks", tags=["playbooks"])


# ─── Playbook CRUD ────────────────────────────────────────────

@router.get("/")
def list_playbooks(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    playbooks = session.exec(
        select(Playbook)
        .where(Playbook.workspace_id == workspace_id)
        .order_by(Playbook.created_at.desc())
    ).all()
    result = []
    for pb in playbooks:
        plays = session.exec(
            select(Play)
            .where(Play.playbook_id == pb.id)
            .where(Play.workspace_id == workspace_id)
        ).all()
        total_enrolled = 0
        for p in plays:
            count = len(session.exec(
                select(PlayEnrollment)
                .where(PlayEnrollment.play_id == p.id)
                .where(PlayEnrollment.workspace_id == workspace_id)
            ).all())
            total_enrolled += count
        result.append({
            **pb.model_dump(),
            "id": str(pb.id),
            "icp_id": str(pb.icp_id) if pb.icp_id else None,
            "play_count": len(plays),
            "total_enrolled": total_enrolled,
        })
    return {"playbooks": result}


@router.post("/")
def create_playbook(
    data: PlaybookCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pb = Playbook(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        icp_id=uuid.UUID(data.icp_id) if data.icp_id else None,
    )
    session.add(pb)
    session.commit()
    session.refresh(pb)
    return {**pb.model_dump(), "id": str(pb.id), "icp_id": str(pb.icp_id) if pb.icp_id else None}


@router.get("/{playbook_id}")
def get_playbook(
    playbook_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")

    plays_raw = session.exec(
        select(Play)
        .where(Play.playbook_id == pb.id)
        .where(Play.workspace_id == workspace_id)
        .order_by(Play.priority.desc())
    ).all()

    plays = []
    for p in plays_raw:
        steps = session.exec(
            select(PlayStep)
            .where(PlayStep.play_id == p.id)
            .where(PlayStep.workspace_id == workspace_id)
            .order_by(PlayStep.step_number)
        ).all()
        enrollments = session.exec(
            select(PlayEnrollment)
            .where(PlayEnrollment.play_id == p.id)
            .where(PlayEnrollment.workspace_id == workspace_id)
        ).all()
        plays.append({
            **p.model_dump(),
            "id": str(p.id),
            "playbook_id": str(p.playbook_id),
            "steps": [{**s.model_dump(), "id": str(s.id), "play_id": str(s.play_id)} for s in steps],
            "enrollments": [{
                **e.model_dump(),
                "id": str(e.id),
                "play_id": str(e.play_id),
                "lead_id": str(e.lead_id) if e.lead_id else None,
            } for e in enrollments],
            "enrollment_count": len(enrollments),
        })

    return {
        **pb.model_dump(),
        "id": str(pb.id),
        "icp_id": str(pb.icp_id) if pb.icp_id else None,
        "plays": plays,
    }


@router.patch("/{playbook_id}")
def update_playbook(
    playbook_id: uuid.UUID,
    data: PlaybookUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")
    update = data.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(pb, k, v)
    pb.updated_at = datetime.utcnow()
    session.add(pb)
    session.commit()
    session.refresh(pb)
    return {**pb.model_dump(), "id": str(pb.id), "icp_id": str(pb.icp_id) if pb.icp_id else None}


@router.delete("/{playbook_id}")
def delete_playbook(
    playbook_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")
    # Cascade: delete plays, steps, enrollments
    plays = session.exec(
        select(Play)
        .where(Play.playbook_id == pb.id)
        .where(Play.workspace_id == workspace_id)
    ).all()
    for p in plays:
        for s in session.exec(
            select(PlayStep)
            .where(PlayStep.play_id == p.id)
            .where(PlayStep.workspace_id == workspace_id)
        ).all():
            session.delete(s)
        for e in session.exec(
            select(PlayEnrollment)
            .where(PlayEnrollment.play_id == p.id)
            .where(PlayEnrollment.workspace_id == workspace_id)
        ).all():
            session.delete(e)
        session.delete(p)
    session.delete(pb)
    session.commit()
    return {"status": "deleted"}


# ─── Play CRUD ────────────────────────────────────────────────

@router.post("/{playbook_id}/plays")
def create_play(
    playbook_id: uuid.UUID,
    data: PlayCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")
    play = Play(
        workspace_id=workspace_id,
        playbook_id=playbook_id,
        name=data.name,
        description=data.description,
        trigger_rules=data.trigger_rules,
        priority=data.priority,
    )
    session.add(play)
    session.commit()
    session.refresh(play)
    return {**play.model_dump(), "id": str(play.id), "playbook_id": str(play.playbook_id), "steps": [], "enrollments": [], "enrollment_count": 0}


@router.patch("/plays/{play_id}")
def update_play(
    play_id: uuid.UUID,
    data: PlayUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = session.get(Play, play_id)
    if not play or play.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")
    update = data.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(play, k, v)
    session.add(play)
    session.commit()
    session.refresh(play)
    return {**play.model_dump(), "id": str(play.id), "playbook_id": str(play.playbook_id)}


@router.delete("/plays/{play_id}")
def delete_play(
    play_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = session.get(Play, play_id)
    if not play or play.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")
    for s in session.exec(
        select(PlayStep)
        .where(PlayStep.play_id == play.id)
        .where(PlayStep.workspace_id == workspace_id)
    ).all():
        session.delete(s)
    for e in session.exec(
        select(PlayEnrollment)
        .where(PlayEnrollment.play_id == play.id)
        .where(PlayEnrollment.workspace_id == workspace_id)
    ).all():
        session.delete(e)
    session.delete(play)
    session.commit()
    return {"status": "deleted"}


# ─── Play Steps ───────────────────────────────────────────────

@router.post("/plays/{play_id}/steps")
def create_step(
    play_id: uuid.UUID,
    data: PlayStepCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = session.get(Play, play_id)
    if not play or play.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")
    step = PlayStep(
        workspace_id=workspace_id,
        play_id=play_id,
        step_number=data.step_number,
        step_type=data.step_type,
        config=data.config,
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return {**step.model_dump(), "id": str(step.id), "play_id": str(step.play_id)}


@router.patch("/steps/{step_id}")
def update_step(
    step_id: uuid.UUID,
    data: PlayStepUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    step = session.get(PlayStep, step_id)
    if not step or step.workspace_id != workspace_id:
        raise HTTPException(404, "Step not found")
    update = data.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(step, k, v)
    session.add(step)
    session.commit()
    session.refresh(step)
    return {**step.model_dump(), "id": str(step.id), "play_id": str(step.play_id)}


@router.delete("/steps/{step_id}")
def delete_step(
    step_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    step = session.get(PlayStep, step_id)
    if not step or step.workspace_id != workspace_id:
        raise HTTPException(404, "Step not found")
    session.delete(step)
    session.commit()
    return {"status": "deleted"}


# ─── Enrollment ───────────────────────────────────────────────

@router.post("/plays/{play_id}/enroll")
def enroll_leads(
    play_id: uuid.UUID,
    data: EnrollRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = session.get(Play, play_id)
    if not play or play.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")

    enrolled = []
    for lid in data.lead_ids:
        lead_uuid = uuid.UUID(lid)
        # Skip if already enrolled in this play
        existing = session.exec(
            select(PlayEnrollment).where(
                PlayEnrollment.play_id == play_id,
                PlayEnrollment.lead_id == lead_uuid,
                PlayEnrollment.workspace_id == workspace_id,
            )
        ).first()
        if existing:
            continue
        lead = session.get(Lead, lead_uuid)
        enrollment = PlayEnrollment(
            workspace_id=workspace_id,
            play_id=play_id,
            lead_id=lead_uuid,
            domain=lead.domain if lead else None,
        )
        session.add(enrollment)
        enrolled.append(str(enrollment.id))

    for domain in data.domains:
        existing = session.exec(
            select(PlayEnrollment).where(
                PlayEnrollment.play_id == play_id,
                PlayEnrollment.domain == domain,
                PlayEnrollment.lead_id == None,
                PlayEnrollment.workspace_id == workspace_id,
            )
        ).first()
        if existing:
            continue
        enrollment = PlayEnrollment(
            workspace_id=workspace_id,
            play_id=play_id,
            domain=domain,
        )
        session.add(enrollment)
        enrolled.append(str(enrollment.id))

    session.commit()
    return {"enrolled": len(enrolled), "enrollment_ids": enrolled}


@router.get("/plays/{play_id}/enrollments")
def get_enrollments(
    play_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    enrollments = session.exec(
        select(PlayEnrollment)
        .where(PlayEnrollment.play_id == play_id)
        .where(PlayEnrollment.workspace_id == workspace_id)
    ).all()
    result = []
    for e in enrollments:
        lead_info = None
        if e.lead_id:
            lead = session.get(Lead, e.lead_id)
            if lead:
                lead_info = {"email": lead.email, "first_name": lead.first_name, "domain": lead.domain}
        result.append({
            **e.model_dump(),
            "id": str(e.id),
            "play_id": str(e.play_id),
            "lead_id": str(e.lead_id) if e.lead_id else None,
            "lead": lead_info,
        })
    return {"enrollments": result}


@router.patch("/enrollments/{enrollment_id}")
def update_enrollment(
    enrollment_id: uuid.UUID,
    status: str,
    current_step: Optional[int] = None,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    enrollment = session.get(PlayEnrollment, enrollment_id)
    if not enrollment or enrollment.workspace_id != workspace_id:
        raise HTTPException(404, "Enrollment not found")
    enrollment.status = status
    if current_step is not None:
        enrollment.current_step = current_step
    enrollment.last_step_at = datetime.utcnow()
    session.add(enrollment)
    session.commit()
    session.refresh(enrollment)
    return {**enrollment.model_dump(), "id": str(enrollment.id), "play_id": str(enrollment.play_id), "lead_id": str(enrollment.lead_id) if enrollment.lead_id else None}


# ─── Auto-Enroll (match leads against play trigger rules) ────

@router.post("/{playbook_id}/auto-enroll")
def auto_enroll(
    playbook_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Evaluate all scored leads against the playbook's plays' trigger rules
    and auto-enroll matching leads.
    """
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")

    plays = session.exec(
        select(Play)
        .where(Play.playbook_id == pb.id, Play.status == "active")
        .where(Play.workspace_id == workspace_id)
        .order_by(Play.priority.desc())
    ).all()

    if not plays:
        return {"enrolled_total": 0, "by_play": {}}

    # Get all ICP scores if playbook is linked to an ICP
    scores_by_domain = {}
    if pb.icp_id:
        scores = session.exec(
            select(ICPScore)
            .where(ICPScore.icp_id == pb.icp_id)
            .where(ICPScore.workspace_id == workspace_id)
        ).all()
        for s in scores:
            scores_by_domain[s.domain] = s

    # Get all signals grouped by domain
    all_signals = session.exec(select(Signal).where(Signal.workspace_id == workspace_id)).all()
    signals_by_domain = {}
    for sig in all_signals:
        signals_by_domain.setdefault(sig.domain, []).append(sig)

    # Get all leads
    all_leads = session.exec(select(Lead).where(Lead.workspace_id == workspace_id)).all()

    enrolled_total = 0
    by_play = {}

    for play in plays:
        rules = play.trigger_rules
        if not rules:
            continue

        fit_cats = set(rules.get("fit_categories", []))
        min_score = rules.get("min_score", 0)
        required_signals = set(rules.get("signal_types", []))
        min_signals = rules.get("min_signals", 0)

        matched_leads = []

        for lead in all_leads:
            if not lead.domain:
                continue

            # Check ICP score
            score_obj = scores_by_domain.get(lead.domain)
            if fit_cats and (not score_obj or score_obj.fit_category not in fit_cats):
                continue
            if min_score and (not score_obj or (score_obj.final_score or 0) < min_score):
                continue

            # Check signals
            lead_signals = signals_by_domain.get(lead.domain, [])
            if required_signals:
                lead_signal_types = {s.signal_type for s in lead_signals}
                if not required_signals.intersection(lead_signal_types):
                    continue
            if min_signals and len(lead_signals) < min_signals:
                continue

            matched_leads.append(lead)

        # Enroll matched leads (skip duplicates)
        play_enrolled = 0
        for lead in matched_leads:
            existing = session.exec(
                select(PlayEnrollment).where(
                    PlayEnrollment.play_id == play.id,
                    PlayEnrollment.lead_id == lead.id,
                    PlayEnrollment.workspace_id == workspace_id,
                )
            ).first()
            if existing:
                continue
            enrollment = PlayEnrollment(
                workspace_id=workspace_id,
                play_id=play.id,
                lead_id=lead.id,
                domain=lead.domain,
            )
            session.add(enrollment)
            play_enrolled += 1

        by_play[str(play.id)] = {"name": play.name, "enrolled": play_enrolled}
        enrolled_total += play_enrolled

    session.commit()
    return {"enrolled_total": enrolled_total, "by_play": by_play}


# ─── Playbook Templates ──────────────────────────────────────

@router.get("/templates/library")
def get_templates():
    """Pre-built playbook templates for common GTM motions."""
    return {"templates": [
        {
            "id": "inbound-high-intent",
            "name": "Inbound High-Intent",
            "description": "Fast-track sequence for high-fit inbound leads with buying signals",
            "plays": [
                {
                    "name": "Day-0 Speed-to-Lead",
                    "description": "Immediate outreach within minutes of signal detection",
                    "trigger_rules": {"fit_categories": ["high"], "min_score": 70, "signal_types": ["hiring_sdr", "hiring_ae"], "min_signals": 1},
                    "priority": 100,
                    "steps": [
                        {"step_number": 1, "step_type": "email", "config": {"subject": "Quick question about {{company}}'s growth", "body": "Hi {{first_name}},\n\nNoticed {{company}} is scaling the sales team — congrats! We help teams like yours {{value_prop}}.\n\nWorth a 15-min chat this week?\n\nBest,\n{{sender_name}}"}},
                        {"step_number": 2, "step_type": "wait", "config": {"days": 2}},
                        {"step_number": 3, "step_type": "task", "config": {"title": "LinkedIn connect + comment", "description": "Send connection request and engage with their recent post"}},
                        {"step_number": 4, "step_type": "wait", "config": {"days": 3}},
                        {"step_number": 5, "step_type": "email", "config": {"subject": "Re: {{company}}'s growth", "body": "Hi {{first_name}},\n\nJust circling back — I shared a quick case study below that might be relevant given {{company}}'s current stage.\n\n{{case_study_link}}\n\nHappy to walk through it if helpful.\n\nBest,\n{{sender_name}}"}},
                    ]
                },
                {
                    "name": "Nurture Medium-Fit",
                    "description": "Slower cadence for leads that match but lack urgency signals",
                    "trigger_rules": {"fit_categories": ["medium"], "min_score": 40},
                    "priority": 50,
                    "steps": [
                        {"step_number": 1, "step_type": "email", "config": {"subject": "Resource for {{company}}", "body": "Hi {{first_name}},\n\nPut together a guide on {{topic}} that I thought might be useful for {{company}}.\n\n{{resource_link}}\n\nLet me know if it resonates.\n\nBest,\n{{sender_name}}"}},
                        {"step_number": 2, "step_type": "wait", "config": {"days": 5}},
                        {"step_number": 3, "step_type": "task", "config": {"title": "Add to newsletter segment", "description": "Tag lead for monthly insights drip"}},
                        {"step_number": 4, "step_type": "wait", "config": {"days": 14}},
                        {"step_number": 5, "step_type": "email", "config": {"subject": "Thought of {{company}}", "body": "Hi {{first_name}},\n\nSaw this trend in {{industry}} and thought of your team. Would love to share how others are tackling it.\n\nOpen to a quick chat?\n\nBest,\n{{sender_name}}"}},
                    ]
                }
            ]
        },
        {
            "id": "outbound-signal-driven",
            "name": "Outbound Signal-Driven",
            "description": "Triggered by hiring signals — reach out when companies are actively building",
            "plays": [
                {
                    "name": "Hiring VP Sales Play",
                    "description": "Executive-level outreach when company hires sales leadership",
                    "trigger_rules": {"signal_types": ["hiring_vp_sales"], "min_signals": 1},
                    "priority": 90,
                    "steps": [
                        {"step_number": 1, "step_type": "task", "config": {"title": "Research the new hire", "description": "Find the VP Sales on LinkedIn, note their background and priorities"}},
                        {"step_number": 2, "step_type": "wait", "config": {"days": 7}},
                        {"step_number": 3, "step_type": "email", "config": {"subject": "Congrats on the new VP Sales hire", "body": "Hi {{first_name}},\n\nCongrats on bringing on a new sales leader at {{company}}. When new VPs come in, they usually look to build the stack that scales.\n\nWe've helped similar teams {{value_prop}} in their first 90 days.\n\nWorth comparing notes?\n\nBest,\n{{sender_name}}"}},
                        {"step_number": 4, "step_type": "wait", "config": {"days": 4}},
                        {"step_number": 5, "step_type": "email", "config": {"subject": "Re: {{company}} sales stack", "body": "Hi {{first_name}},\n\nQuick follow-up — happy to share what {{reference_customer}} did in a similar situation. Took them from X to Y in 90 days.\n\nHere if useful.\n\nBest,\n{{sender_name}}"}},
                    ]
                },
                {
                    "name": "Hiring SDR/AE Play",
                    "description": "Sales team expansion signal — they need tooling",
                    "trigger_rules": {"signal_types": ["hiring_sdr", "hiring_ae"], "min_signals": 1, "min_score": 30},
                    "priority": 70,
                    "steps": [
                        {"step_number": 1, "step_type": "email", "config": {"subject": "Scaling the sales team at {{company}}?", "body": "Hi {{first_name}},\n\nNoticed {{company}} is hiring sales reps — exciting growth phase.\n\nWhen teams scale from X to Y reps, the tools that got you here usually don't get you there. We help bridge that gap.\n\n15 mins this week?\n\nBest,\n{{sender_name}}"}},
                        {"step_number": 2, "step_type": "wait", "config": {"days": 3}},
                        {"step_number": 3, "step_type": "task", "config": {"title": "Engage on LinkedIn", "description": "Like/comment on company posts, connect with hiring manager"}},
                        {"step_number": 4, "step_type": "wait", "config": {"days": 4}},
                        {"step_number": 5, "step_type": "email", "config": {"subject": "Quick case study for {{company}}", "body": "Hi {{first_name}},\n\nHere's how {{reference_customer}} ramped new reps 40% faster after implementing our solution.\n\n{{case_study_link}}\n\nHappy to walk through it.\n\nBest,\n{{sender_name}}"}},
                    ]
                }
            ]
        },
        {
            "id": "product-led-expansion",
            "name": "Product-Led Expansion",
            "description": "For companies showing tech stack signals and SaaS model fit",
            "plays": [
                {
                    "name": "Tech Signal Outreach",
                    "description": "Reach out when tech stack alignment is detected",
                    "trigger_rules": {"fit_categories": ["high", "medium"], "signal_types": ["hiring_ai_ml", "hiring_engineering"], "min_signals": 1},
                    "priority": 80,
                    "steps": [
                        {"step_number": 1, "step_type": "email", "config": {"subject": "{{company}} + {{product_name}}", "body": "Hi {{first_name}},\n\nNoticed {{company}} is investing in {{tech_area}} — we integrate natively and can amplify what you're building.\n\nQuick demo?\n\nBest,\n{{sender_name}}"}},
                        {"step_number": 2, "step_type": "wait", "config": {"days": 3}},
                        {"step_number": 3, "step_type": "task", "config": {"title": "Send personalized Loom", "description": "Record 2-min Loom showing integration with their stack"}},
                        {"step_number": 4, "step_type": "wait", "config": {"days": 5}},
                        {"step_number": 5, "step_type": "email", "config": {"subject": "Made you a quick video", "body": "Hi {{first_name}},\n\nRecorded a quick walkthrough of how {{product_name}} plugs into what {{company}} is building.\n\n{{loom_link}}\n\n2 mins — let me know what you think.\n\nBest,\n{{sender_name}}"}},
                    ]
                }
            ]
        },
    ]}


@router.post("/templates/{template_id}/apply")
def apply_template(
    template_id: str,
    playbook_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Apply a template's plays and steps to an existing playbook."""
    pb = session.get(Playbook, playbook_id)
    if not pb or pb.workspace_id != workspace_id:
        raise HTTPException(404, "Playbook not found")

    templates = get_templates()["templates"]
    template = next((t for t in templates if t["id"] == template_id), None)
    if not template:
        raise HTTPException(404, "Template not found")

    created_plays = []
    for play_tmpl in template["plays"]:
        play = Play(
            workspace_id=workspace_id,
            playbook_id=playbook_id,
            name=play_tmpl["name"],
            description=play_tmpl.get("description", ""),
            trigger_rules=play_tmpl.get("trigger_rules", {}),
            priority=play_tmpl.get("priority", 0),
        )
        session.add(play)
        session.flush()

        for step_tmpl in play_tmpl.get("steps", []):
            step = PlayStep(
                workspace_id=workspace_id,
                play_id=play.id,
                step_number=step_tmpl["step_number"],
                step_type=step_tmpl["step_type"],
                config=step_tmpl.get("config", {}),
            )
            session.add(step)

        created_plays.append(play.name)

    session.commit()
    return {"applied": True, "plays_created": created_plays}
