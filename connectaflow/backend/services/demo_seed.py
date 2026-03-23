from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select

from models import (
    Activity,
    BuyingTrigger,
    CompanyProfile,
    EmailVariant,
    ExternalSignal,
    GTMContext,
    GTMPlay,
    ICP,
    ICPScore,
    Lead,
    ManualActivityLog,
    MeetingBrief,
    MessagingPlay,
    Persona,
    Play,
    PlayComponent,
    PlayEnrollment,
    PlayStep,
    PlayVariation,
    Playbook,
    Reply,
    Signal,
    SignalDefinition,
    SmartleadStats,
    SocialProofAsset,
    Workspace,
)
from services.icp_sync import build_legacy_rubric_from_mission_icp, sync_context_icp_state, sync_mission_icp_definition
from services.intelligence.demo_data import build_demo_gtm_strategy
from services.intelligence.scorer import assign_tiers, score_company
from services.records import ensure_account_for_domain, record_outcome, sync_follow_up_task, sync_lead_account


def seed_demo_workspace(session: Session, workspace_id: uuid.UUID) -> dict:
    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError("Workspace not found")

    workspace.settings = {
        "cooldown_contact_threshold": 3,
        "cooldown_months": 6,
        "demo_seeded_at": datetime.utcnow().isoformat(),
        **(workspace.settings or {}),
    }
    session.add(workspace)

    suffix = workspace_id.hex[:6]

    def demo_domain(slug: str) -> str:
        return f"{slug}-{suffix}.com"

    def lead_email(local: str, domain: str) -> str:
        root = domain.split(".")[0]
        return f"{local}.{suffix}@{root}.com"

    context = session.exec(
        select(GTMContext)
        .where(GTMContext.workspace_id == workspace_id)
        .where(GTMContext.name == "Connectaflow Demo Mission")
    ).first()
    if not context:
        context = GTMContext(
            workspace_id=workspace_id,
            company_name="Connectaflow",
            website_url="https://connectaflow.ai",
            core_problem="Revenue teams struggle to turn scattered account data, signals, and replies into clear next steps.",
            product_category="GTM intelligence",
            context_notes="Demo mission seeded for end-to-end product QA and UX review.",
            name="Connectaflow Demo Mission",
            product_description="Connectaflow helps GTM teams define ICPs, enrich accounts, detect urgency signals, craft messaging, and track outcomes in one place.",
            target_industries=["B2B SaaS", "Fintech", "Developer Tools"],
            customer_examples=["Vanta", "Merge", "Ramp"],
            value_proposition="Move from raw data to prioritized execution with less manual research and better timing.",
            competitors=["Apollo", "Clay", "ZoomInfo"],
            geographic_focus="United States",
            avg_deal_size="$18k-$80k ARR",
            sales_cycle_days="30-75 days",
            decision_process="VP evaluates, RevOps validates, and security signs off.",
            key_integrations=["Salesforce", "HubSpot", "Smartlead", "Gmail"],
            why_customers_buy="They need cleaner prioritization, faster research, and message quality that scales.",
            why_customers_churn="Low operator adoption and unclear workflows.",
            common_objections=["We already have data tools", "Signal quality is inconsistent", "Our reps will not use another dashboard"],
            market_maturity="growing",
            pricing_model="workspace",
            icp_name="Revenue Teams Scaling Outbound",
            icp_statement="US-based B2B software companies with 50-500 employees hiring sales talent or improving RevOps rigor.",
            icp_priority="Primary",
            firmographic_range={
                "employee_range": "50-500",
                "revenue_range": "$5M-$100M",
                "business_model": "B2B SaaS",
                "geography": "United States",
            },
            icp_rationale="These teams feel the pain of scattered signals and need structured prioritization before scaling outreach.",
            list_sourcing_guidance="Prioritize companies hiring SDRs, AEs, or RevOps leaders in the last 90 days.",
        )
        session.add(context)
        session.flush()

    strategy = build_demo_gtm_strategy(context)

    icp_specs = [
        {
            "name": "Revenue Teams Scaling Outbound",
            "industry": ["B2B SaaS", "Fintech", "Developer Tools"],
            "company_size": {"min": 50, "max": 500, "unit": "employees"},
            "geography": ["United States"],
            "use_cases": ["outbound automation", "account prioritization", "RevOps scale"],
            "firmographic_range": context.firmographic_range,
            "icp_statement": context.icp_statement,
            "icp_priority": "Primary",
            "list_sourcing_guidance": context.list_sourcing_guidance,
            "icp_rationale": context.icp_rationale,
        },
        {
            "name": "RevOps-Led Expansion",
            "industry": ["B2B SaaS", "Developer Tools"],
            "company_size": {"min": 120, "max": 1200, "unit": "employees"},
            "geography": ["United States", "United Kingdom"],
            "use_cases": ["pipeline quality", "signal scoring", "workflow visibility"],
            "firmographic_range": {
                "employee_range": "120-1200",
                "revenue_range": "$20M-$250M",
                "business_model": "B2B SaaS",
                "geography": "US/UK",
            },
            "icp_statement": "Mid-market and enterprise GTM teams professionalizing RevOps and signal-led outbound.",
            "icp_priority": "Secondary",
            "list_sourcing_guidance": "Look for RevOps hiring, expansion into new segments, and multi-team outbound orchestration.",
            "icp_rationale": "These accounts care deeply about process clarity and measurable workflow lift.",
        },
    ]

    icps: list[ICP] = []
    for spec in icp_specs:
        icp = session.exec(
            select(ICP)
            .where(ICP.workspace_id == workspace_id)
            .where(ICP.mission_id == context.id)
            .where(ICP.name == spec["name"])
        ).first()
        if not icp:
            icp = ICP(
                workspace_id=workspace_id,
                mission_id=context.id,
                **spec,
            )
        else:
            for key, value in spec.items():
                setattr(icp, key, value)
        session.add(icp)
        session.flush()
        sync_mission_icp_definition(icp, context, session)
        icps.append(icp)

    primary_icp = next((icp for icp in icps if icp.icp_priority == "Primary"), icps[0])
    sync_context_icp_state(context, session)

    persona_lookup: dict[str, Persona] = {}
    for persona_data in strategy["personas"]:
        persona = session.exec(
            select(Persona)
            .where(Persona.workspace_id == workspace_id)
            .where(Persona.gtm_context_id == context.id)
            .where(Persona.name == persona_data["name"])
        ).first()
        if not persona:
            persona = Persona(workspace_id=workspace_id, gtm_context_id=context.id, icp_id=primary_icp.id, **persona_data)
        else:
            for key, value in persona_data.items():
                setattr(persona, key, value)
            persona.icp_id = primary_icp.id
        session.add(persona)
        session.flush()
        persona_lookup[persona.name] = persona

    trigger_lookup: dict[str, BuyingTrigger] = {}
    for trigger_data in strategy["triggers"]:
        trigger = session.exec(
            select(BuyingTrigger)
            .where(BuyingTrigger.workspace_id == workspace_id)
            .where(BuyingTrigger.gtm_context_id == context.id)
            .where(BuyingTrigger.name == trigger_data["name"])
        ).first()
        if not trigger:
            trigger = BuyingTrigger(workspace_id=workspace_id, gtm_context_id=context.id, **trigger_data)
        else:
            for key, value in trigger_data.items():
                setattr(trigger, key, value)
        session.add(trigger)
        session.flush()
        trigger_lookup[trigger.name] = trigger

    signal_lookup: dict[str, SignalDefinition] = {}
    for signal_data in strategy["signal_definitions"]:
        signal_def = session.exec(
            select(SignalDefinition)
            .where(SignalDefinition.workspace_id == workspace_id)
            .where(SignalDefinition.gtm_context_id == context.id)
            .where(SignalDefinition.name == signal_data["name"])
        ).first()
        payload = {
            **signal_data,
            "trigger_id": trigger_lookup[signal_data["trigger_name"]].id,
        }
        payload.pop("trigger_name", None)
        if not signal_def:
            signal_def = SignalDefinition(workspace_id=workspace_id, gtm_context_id=context.id, **payload)
        else:
            for key, value in payload.items():
                setattr(signal_def, key, value)
        session.add(signal_def)
        session.flush()
        signal_lookup[signal_def.name] = signal_def

    for play_data in strategy["plays"]:
        gtm_play = session.exec(
            select(GTMPlay)
            .where(GTMPlay.workspace_id == workspace_id)
            .where(GTMPlay.gtm_context_id == context.id)
            .where(GTMPlay.name == play_data["name"])
        ).first()
        payload = {
            key: value for key, value in play_data.items()
            if key not in {"trigger_name", "signal_name", "persona_name"}
        }
        payload["trigger_id"] = trigger_lookup[play_data["trigger_name"]].id
        payload["signal_id"] = signal_lookup[play_data["signal_name"]].id
        payload["persona_id"] = persona_lookup[play_data["persona_name"]].id
        if not gtm_play:
            gtm_play = GTMPlay(workspace_id=workspace_id, gtm_context_id=context.id, **payload)
        else:
            for key, value in payload.items():
                setattr(gtm_play, key, value)
        session.add(gtm_play)

    assets = [
        ("case_study", "Ramp cut research time 68%", "Ramp’s outbound team reduced account research time by 68% after shifting to signal-ranked account planning."),
        ("testimonial", "RevOps finally trusted the queue", "The ranking reasons made the next-step decisions obvious for our SDR and RevOps leads."),
        ("metric", "2.1x better reply rate on signaled accounts", "Teams running signal-aware plays saw 2.1x better replies than static list campaigns."),
    ]
    for asset_type, title, content in assets:
        asset = session.exec(
            select(SocialProofAsset)
            .where(SocialProofAsset.workspace_id == workspace_id)
            .where(SocialProofAsset.title == title)
        ).first()
        if not asset:
            asset = SocialProofAsset(
                workspace_id=workspace_id,
                type=asset_type,
                title=title,
                content=content,
                icp_id=primary_icp.id,
                use_case_tags=["prioritization", "signals", "messaging"],
            )
        else:
            asset.type = asset_type
            asset.content = content
            asset.icp_id = primary_icp.id
        session.add(asset)

    playbook = session.exec(
        select(Playbook)
        .where(Playbook.workspace_id == workspace_id)
        .where(Playbook.name == "Signal-to-Sequence Demo")
    ).first()
    if not playbook:
        playbook = Playbook(
            workspace_id=workspace_id,
            name="Signal-to-Sequence Demo",
            description="Sample playbook seeded for QA to validate execution flow.",
            icp_id=primary_icp.id,
            status="active",
        )
    else:
        playbook.icp_id = primary_icp.id
        playbook.status = "active"
    session.add(playbook)
    session.flush()

    playbook_specs = [
        {
            "name": "Immediate Signal Follow-up",
            "description": "High-urgency signal play for fresh hiring or funding momentum.",
            "priority": 10,
            "trigger_rules": {"fit_categories": ["high", "medium"], "min_score": 45, "signal_types": ["hiring_sdr", "funding_announcement"], "min_signals": 1},
            "steps": [
                ("email", {"subject": "Saw the outbound momentum at {{company_name}}", "body": "You have new GTM motion in market. Want the 3 hottest accounts surfaced automatically?"}),
                ("wait", {"days": 2}),
                ("task", {"title": "LinkedIn touch", "description": "Reference the hiring or funding signal in a short personalized note."}),
            ],
        },
        {
            "name": "Ops Validation Sequence",
            "description": "More consultative play for RevOps-led opportunities.",
            "priority": 7,
            "trigger_rules": {"fit_categories": ["high", "medium"], "min_score": 40, "signal_types": ["revops_hire", "process_refresh"], "min_signals": 1},
            "steps": [
                ("email", {"subject": "How are you ranking accounts right now?", "body": "Curious how your team is currently joining enrichment, signals, and rep action."}),
                ("wait", {"days": 3}),
                ("task", {"title": "Follow-up call", "description": "Ask about prioritization workflow and evidence trust."}),
            ],
        },
    ]

    playbook_play_lookup: dict[str, Play] = {}
    for spec in playbook_specs:
        play = session.exec(
            select(Play)
            .where(Play.workspace_id == workspace_id)
            .where(Play.playbook_id == playbook.id)
            .where(Play.name == spec["name"])
        ).first()
        if not play:
            play = Play(
                workspace_id=workspace_id,
                playbook_id=playbook.id,
                name=spec["name"],
                description=spec["description"],
                trigger_rules=spec["trigger_rules"],
                priority=spec["priority"],
                status="active",
            )
        else:
            play.description = spec["description"]
            play.trigger_rules = spec["trigger_rules"]
            play.priority = spec["priority"]
            play.status = "active"
        session.add(play)
        session.flush()
        playbook_play_lookup[play.name] = play

        for index, (step_type, config) in enumerate(spec["steps"], start=1):
            step = session.exec(
                select(PlayStep)
                .where(PlayStep.workspace_id == workspace_id)
                .where(PlayStep.play_id == play.id)
                .where(PlayStep.step_number == index)
            ).first()
            if not step:
                step = PlayStep(
                    workspace_id=workspace_id,
                    play_id=play.id,
                    step_number=index,
                    step_type=step_type,
                    config=config,
                )
            else:
                step.step_type = step_type
                step.config = config
            session.add(step)

    messaging_play = session.exec(
        select(MessagingPlay)
        .where(MessagingPlay.workspace_id == workspace_id)
        .where(MessagingPlay.mission_id == context.id)
        .where(MessagingPlay.name == "Signal-Aware Narrative")
    ).first()
    if not messaging_play:
        messaging_play = MessagingPlay(
            workspace_id=workspace_id,
            mission_id=context.id,
            icp_id=primary_icp.id,
            persona_id=next(iter(persona_lookup.values())).id,
            name="Signal-Aware Narrative",
            global_instruction="Keep the message practical, signal-led, and crisp. Explain why the account matters now.",
            status="active",
        )
    else:
        messaging_play.icp_id = primary_icp.id
        messaging_play.status = "active"
        messaging_play.global_instruction = "Keep the message practical, signal-led, and crisp. Explain why the account matters now."
    session.add(messaging_play)
    session.flush()

    component_specs = {
        "subject": [
            ("Fresh GTM signal at {{company_name}}", "curious"),
            ("A sharper way to rank accounts at {{company_name}}", "direct"),
        ],
        "greeting": [
            ("Hi {{first_name}},", "neutral"),
        ],
        "opener": [
            ("Noticed a fresh signal around your GTM motion and wanted to reach out while it is still timely.", "observational"),
        ],
        "problem": [
            ("Most teams can see the data, but not which accounts deserve action first.", "problem-led"),
        ],
        "value_prop": [
            ("Connectaflow pulls ICP fit, evidence quality, and urgency into one ranked view so reps know what to work next.", "value"),
        ],
        "story": [
            ("Teams use it to cut research time, tighten prioritization, and turn scattered signals into execution-ready plays.", "proof"),
        ],
        "cta": [
            ("Worth sending over a 2-minute walkthrough?", "soft-cta"),
        ],
        "closer": [
            ("Best,\nConnectaflow", "standard"),
        ],
        "variables": [
            ("company_name, first_name, top_signal, fit_tier", "variables"),
        ],
    }
    for order, component_type in enumerate(component_specs.keys(), start=1):
        component = session.exec(
            select(PlayComponent)
            .where(PlayComponent.workspace_id == workspace_id)
            .where(PlayComponent.play_id == messaging_play.id)
            .where(PlayComponent.component_type == component_type)
        ).first()
        if not component:
            component = PlayComponent(
                workspace_id=workspace_id,
                play_id=messaging_play.id,
                component_type=component_type,
                display_order=order,
            )
        else:
            component.display_order = order
        session.add(component)
        session.flush()

        existing_variations = session.exec(
            select(PlayVariation)
            .where(PlayVariation.workspace_id == workspace_id)
            .where(PlayVariation.component_id == component.id)
        ).all()
        if not existing_variations:
            for idx, (content, tone) in enumerate(component_specs[component_type]):
                session.add(PlayVariation(
                    workspace_id=workspace_id,
                    component_id=component.id,
                    content=content,
                    tone=tone,
                    is_selected=(idx == 0),
                ))

    email_variants = [
        (
            "Signal-led concise",
            "Fresh GTM signal at {{company_name}}",
            "Hi {{first_name}},\n\nNoticed a fresh signal around your GTM motion. Connectaflow helps teams rank the accounts that matter now so reps can move with evidence instead of guesswork.\n\nWorth sending a 2-minute walkthrough?\n\nBest,\nConnectaflow",
        ),
        (
            "Ops-forward",
            "A sharper way to rank accounts at {{company_name}}",
            "Hi {{first_name}},\n\nCurious how your team is joining ICP fit, active signals, and rep execution today. Connectaflow turns those pieces into one ranked operating view so RevOps and reps stay aligned.\n\nHappy to share a short example if useful.\n\nBest,\nConnectaflow",
        ),
    ]
    for style_label, subject, body in email_variants:
        variant = session.exec(
            select(EmailVariant)
            .where(EmailVariant.workspace_id == workspace_id)
            .where(EmailVariant.play_id == messaging_play.id)
            .where(EmailVariant.style_label == style_label)
        ).first()
        if not variant:
            variant = EmailVariant(
                workspace_id=workspace_id,
                play_id=messaging_play.id,
                subject=subject,
                body=body,
                style_label=style_label,
            )
        else:
            variant.subject = subject
            variant.body = body
        session.add(variant)

    company_specs = [
        {
            "domain": demo_domain("atlasgrid"),
            "name": "AtlasGrid",
            "industry": "B2B SaaS",
            "business_model": "B2B SaaS",
            "hq_location": "New York, United States",
            "employee_count": 180,
            "company_description": "AtlasGrid sells revenue intelligence software and is actively expanding outbound coverage.",
            "pricing_model": "Per seat",
            "funding_stage": "Series B",
            "linkedin_url": "https://linkedin.com/company/atlasgrid",
            "signals": [("hiring_sdr", 0.92, "Hiring 6 SDRs across New York and Austin."), ("funding_announcement", 0.86, "Raised a Series B round 45 days ago.")],
            "status": "Meeting Booked",
            "contacts": [("Ava", "Stone", "VP Sales"), ("Leo", "Hart", "RevOps Director")],
            "reply_text": "This is timely. Happy to see a quick walkthrough next week.",
            "meeting_brief": True,
        },
        {
            "domain": demo_domain("luminaops"),
            "name": "LuminaOps",
            "industry": "Developer Tools",
            "business_model": "B2B SaaS",
            "hq_location": "San Francisco, United States",
            "employee_count": 240,
            "company_description": "LuminaOps is standardizing outbound planning after adding a dedicated RevOps team.",
            "pricing_model": "Usage-based",
            "funding_stage": "Series C",
            "linkedin_url": "https://linkedin.com/company/luminaops",
            "signals": [("revops_hire", 0.88, "Opened a RevOps Systems Lead role focused on lead routing."), ("process_refresh", 0.73, "Posted about redesigning outbound workflow operations.")],
            "status": "Replied",
            "contacts": [("Mia", "Chen", "Head of RevOps")],
            "reply_text": "Can you send a short overview first? We are comparing a few workflow options.",
            "meeting_brief": False,
        },
        {
            "domain": demo_domain("relayforge"),
            "name": "RelayForge",
            "industry": "Fintech",
            "business_model": "B2B SaaS",
            "hq_location": "Chicago, United States",
            "employee_count": 95,
            "company_description": "RelayForge is building its first structured outbound process after recent growth.",
            "pricing_model": "Custom enterprise",
            "funding_stage": "Series A",
            "linkedin_url": "https://linkedin.com/company/relayforge",
            "signals": [("hiring_sdr", 0.83, "Hiring first SDR manager and outbound reps.")],
            "status": "Contacted",
            "contacts": [("Ivy", "Santos", "Founder")],
            "reply_text": "",
            "meeting_brief": False,
        },
        {
            "domain": demo_domain("northstarlabs"),
            "name": "Northstar Labs",
            "industry": "B2B SaaS",
            "business_model": "B2B SaaS",
            "hq_location": "Austin, United States",
            "employee_count": 410,
            "company_description": "Northstar Labs is scaling GTM teams after opening a second US sales pod.",
            "pricing_model": "Per workspace",
            "funding_stage": "Growth equity",
            "linkedin_url": "https://linkedin.com/company/northstarlabs",
            "signals": [("leadership_hire", 0.78, "New VP Revenue Operations joined last month.")],
            "status": "Cool Down",
            "contacts": [("Nora", "Blake", "VP Revenue Operations")],
            "reply_text": "",
            "meeting_brief": False,
        },
        {
            "domain": demo_domain("vectorlane"),
            "name": "VectorLane",
            "industry": "Developer Tools",
            "business_model": "B2B SaaS",
            "hq_location": "Seattle, United States",
            "employee_count": 62,
            "company_description": "VectorLane is experimenting with a more signal-aware outbound motion.",
            "pricing_model": "Freemium + enterprise",
            "funding_stage": "Seed+",
            "linkedin_url": "https://linkedin.com/company/vectorlane",
            "signals": [("hiring_ae", 0.71, "Adding account executives after first product-led traction.")],
            "status": "Not Contacted",
            "contacts": [("Theo", "Price", "Head of Sales")],
            "reply_text": "",
            "meeting_brief": False,
        },
    ]

    primary_play = playbook_play_lookup["Immediate Signal Follow-up"]
    secondary_play = playbook_play_lookup["Ops Validation Sequence"]

    created_lead_ids: list[uuid.UUID] = []
    for company_index, company in enumerate(company_specs):
        profile = session.exec(select(CompanyProfile).where(CompanyProfile.domain == company["domain"])).first()
        enriched_data = {
            "company_name": _dp(company["name"], 0.98, "demo_seed", f"Seeded demo company profile for {company['name']}."),
            "industry": _dp(company["industry"], 0.92, "demo_seed", "Seeded firmographic data."),
            "business_model": _dp(company["business_model"], 0.9, "demo_seed", "Seeded firmographic data."),
            "hq_location": _dp(company["hq_location"], 0.88, "demo_seed", "Seeded firmographic data."),
            "employee_count": _dp(company["employee_count"], 0.86, "demo_seed", "Seeded employee count."),
            "company_description": _dp(company["company_description"], 0.84, "demo_seed", "Seeded demo description."),
            "pricing_model": _dp(company["pricing_model"], 0.76, "demo_seed", "Seeded demo pricing model."),
            "funding_stage": _dp(company["funding_stage"], 0.79, "demo_seed", "Seeded demo funding stage."),
            "linkedin_url": _dp(company["linkedin_url"], 0.95, "demo_seed", "Seeded demo LinkedIn URL."),
        }
        if not profile:
            profile = CompanyProfile(
                domain=company["domain"],
                workspace_id=workspace_id,
                name=company["name"],
                enriched_data=enriched_data,
                quality_score=0.82 - (company_index * 0.05),
                quality_tier="high" if company_index < 3 else "medium",
                sources_used=["demo_seed", "external_discovery"],
                enriched_at=datetime.utcnow() - timedelta(days=company_index),
                fetch_metadata={"source": "demo_seed"},
            )
        else:
            profile.name = company["name"]
            profile.enriched_data = enriched_data
            profile.quality_score = 0.82 - (company_index * 0.05)
            profile.quality_tier = "high" if company_index < 3 else "medium"
            profile.sources_used = ["demo_seed", "external_discovery"]
            profile.enriched_at = datetime.utcnow() - timedelta(days=company_index)
            profile.fetch_metadata = {"source": "demo_seed"}
        session.add(profile)
        session.flush()

        account = ensure_account_for_domain(session, workspace_id, company["domain"], name=company["name"], touch_signal=True)

        signal_models: list[Signal] = []
        for signal_index, (signal_type, strength, evidence) in enumerate(company["signals"]):
            signal = session.exec(
                select(Signal)
                .where(Signal.workspace_id == workspace_id)
                .where(Signal.domain == company["domain"])
                .where(Signal.signal_type == signal_type)
            ).first()
            detected_at = datetime.utcnow() - timedelta(days=signal_index + company_index)
            if not signal:
                signal = Signal(
                    workspace_id=workspace_id,
                    domain=company["domain"],
                    signal_type=signal_type,
                    strength=strength,
                    source_url=f"https://signals.example/{company['name'].lower().replace(' ', '-')}",
                    evidence=evidence,
                    detected_at=detected_at,
                )
            else:
                signal.strength = strength
                signal.source_url = f"https://signals.example/{company['name'].lower().replace(' ', '-')}"
                signal.evidence = evidence
                signal.detected_at = detected_at
            session.add(signal)
            session.flush()
            signal_models.append(signal)

            external_signal = session.exec(
                select(ExternalSignal)
                .where(ExternalSignal.workspace_id == workspace_id)
                .where(ExternalSignal.domain == company["domain"])
                .where(ExternalSignal.signal_type == signal_type)
            ).first()
            if not external_signal:
                external_signal = ExternalSignal(
                    workspace_id=workspace_id,
                    domain=company["domain"],
                    company_name=company["name"],
                    signal_type=signal_type,
                    strength=strength,
                    relevance=max(0.55, strength - 0.05),
                    confidence=max(0.62, strength - 0.1),
                    evidence=evidence,
                    source_url=f"https://signals.example/{company['name'].lower().replace(' ', '-')}",
                    matched_icp_id=primary_icp.id,
                    status="added" if company_index < 2 else "new",
                    discovered_at=detected_at,
                )
            else:
                external_signal.company_name = company["name"]
                external_signal.strength = strength
                external_signal.relevance = max(0.55, strength - 0.05)
                external_signal.confidence = max(0.62, strength - 0.1)
                external_signal.evidence = evidence
                external_signal.source_url = f"https://signals.example/{company['name'].lower().replace(' ', '-')}"
                external_signal.matched_icp_id = primary_icp.id
                external_signal.status = "added" if company_index < 2 else "new"
                external_signal.discovered_at = detected_at
            session.add(external_signal)

        rubric = build_legacy_rubric_from_mission_icp(primary_icp)
        score = score_company(profile, rubric, signal_models)
        score.icp_id = primary_icp.id
        score.workspace_id = workspace_id
        existing_score = session.exec(
            select(ICPScore)
            .where(ICPScore.workspace_id == workspace_id)
            .where(ICPScore.domain == company["domain"])
            .where(ICPScore.icp_id == primary_icp.id)
        ).first()
        if existing_score:
            for key, value in score.model_dump(exclude_unset=True, exclude={"id"}).items():
                setattr(existing_score, key, value)
        else:
            session.add(score)

        for contact_index, (first_name, last_name, title) in enumerate(company["contacts"]):
            email = lead_email(first_name.lower(), company["domain"])
            lead = session.exec(select(Lead).where(Lead.email == email)).first()
            if not lead:
                lead = Lead(
                    workspace_id=workspace_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    domain=company["domain"],
                    status=company["status"] if contact_index == 0 else "Not Contacted",
                    custom_data={"title": title, "company_name": company["name"], "notes": f"{title} at {company['name']}"},
                    follow_up_date=datetime.utcnow() + timedelta(days=contact_index + 2) if company["status"] in {"Contacted", "Replied"} else None,
                )
            else:
                lead.first_name = first_name
                lead.last_name = last_name
                lead.domain = company["domain"]
                lead.status = company["status"] if contact_index == 0 else lead.status
                lead.custom_data = {"title": title, "company_name": company["name"], "notes": f"{title} at {company['name']}"}
                if company["status"] in {"Contacted", "Replied"}:
                    lead.follow_up_date = datetime.utcnow() + timedelta(days=contact_index + 2)
            session.add(lead)
            session.flush()
            lead.company_id = account.id if account else lead.company_id
            sync_lead_account(session, workspace_id, lead)
            sync_follow_up_task(session, workspace_id, lead)
            created_lead_ids.append(lead.id)

            chosen_play = secondary_play if company_index == 1 else primary_play
            enrollment = session.exec(
                select(PlayEnrollment)
                .where(PlayEnrollment.workspace_id == workspace_id)
                .where(PlayEnrollment.play_id == chosen_play.id)
                .where(PlayEnrollment.lead_id == lead.id)
            ).first()
            if not enrollment:
                enrollment = PlayEnrollment(
                    workspace_id=workspace_id,
                    play_id=chosen_play.id,
                    lead_id=lead.id,
                    domain=company["domain"],
                    current_step=1,
                    status="active" if company["status"] not in {"Meeting Booked", "Cool Down"} else "completed",
                    enrolled_at=datetime.utcnow() - timedelta(days=3 + company_index),
                    last_step_at=datetime.utcnow() - timedelta(days=1),
                    step_history=[{"timestamp": (datetime.utcnow() - timedelta(days=2)).isoformat(), "action": "enrolled", "status": "active", "step": 1}],
                )
                session.add(enrollment)

            if contact_index == 0 and company["status"] in {"Contacted", "Replied", "Meeting Booked", "Cool Down"}:
                latest_variant = session.exec(
                    select(EmailVariant)
                    .where(EmailVariant.workspace_id == workspace_id)
                    .where(EmailVariant.play_id == messaging_play.id)
                    .order_by(EmailVariant.created_at.asc())  # type: ignore
                ).first()
                activity = session.exec(
                    select(Activity)
                    .where(Activity.workspace_id == workspace_id)
                    .where(Activity.lead_id == lead.id)
                    .where(Activity.channel == "email")
                ).first()
                if not activity:
                    activity = Activity(
                        workspace_id=workspace_id,
                        lead_id=lead.id,
                        account_id=account.id if account else None,
                        account_domain=company["domain"],
                        play_id=chosen_play.id,
                        channel="email",
                        email_variant_id=latest_variant.id if latest_variant else None,
                        notes="Seeded email activity for demo review.",
                        occurred_at=datetime.utcnow() - timedelta(days=2 + company_index),
                    )
                else:
                    activity.account_id = account.id if account else None
                    activity.account_domain = company["domain"]
                    activity.play_id = chosen_play.id
                    activity.email_variant_id = latest_variant.id if latest_variant else None
                    activity.notes = "Seeded email activity for demo review."
                session.add(activity)
                session.flush()

                if company["reply_text"]:
                    reply = session.exec(
                        select(Reply)
                        .where(Reply.workspace_id == workspace_id)
                        .where(Reply.lead_id == lead.id)
                        .where(Reply.reply_text == company["reply_text"])
                    ).first()
                    if not reply:
                        reply = Reply(
                            workspace_id=workspace_id,
                            lead_id=lead.id,
                            account_id=account.id if account else None,
                            account_domain=company["domain"],
                            activity_id=activity.id,
                            play_id=chosen_play.id,
                            email_variant_id=latest_variant.id if latest_variant else None,
                            channel="email",
                            reply_text=company["reply_text"],
                            classification="interested" if company["status"] == "Meeting Booked" else "neutral",
                            sentiment="positive",
                            source="manual_entry",
                            received_at=datetime.utcnow() - timedelta(days=1 + company_index),
                        )
                        session.add(reply)

                    record_outcome(
                        session,
                        workspace_id,
                        lead_id=lead.id,
                        account_id=account.id if account else None,
                        play_id=chosen_play.id,
                        channel="email",
                        outcome_type="reply_received",
                        notes="Seeded reply for demo flow.",
                        occurred_at=datetime.utcnow() - timedelta(days=1 + company_index),
                    )

                if company["status"] == "Meeting Booked":
                    record_outcome(
                        session,
                        workspace_id,
                        lead_id=lead.id,
                        account_id=account.id if account else None,
                        play_id=chosen_play.id,
                        channel="email",
                        outcome_type="meeting_booked",
                        notes="Seeded meeting-booked outcome.",
                        occurred_at=datetime.utcnow() - timedelta(hours=20),
                    )
                    brief = session.exec(
                        select(MeetingBrief)
                        .where(MeetingBrief.workspace_id == workspace_id)
                        .where(MeetingBrief.lead_id == lead.id)
                    ).first()
                    content_json = {
                        "company_overview": f"{company['name']} is scaling outbound and has active GTM urgency signals.",
                        "icp_fit_score": 82,
                        "icp_fit_reason": "Strong firmographic fit plus high-confidence recent signals.",
                        "icp_tier": "T1",
                        "active_signals": [evidence for _, _, evidence in company["signals"]],
                        "conversation_history": company["reply_text"] or "No prior conversation recorded.",
                        "key_talking_points": ["Why now", "How prioritization works", "Evidence trust", "Operator workflow", "Expected lift"],
                        "likely_objections": ["Tool overlap", "Adoption risk"],
                        "suggested_questions": ["How do reps pick next accounts today?", "Which signals do you trust least?", "What slows personalization most?"],
                    }
                    if not brief:
                        brief = MeetingBrief(
                            workspace_id=workspace_id,
                            lead_id=lead.id,
                            content_json=content_json,
                        )
                    else:
                        brief.content_json = content_json
                        brief.generated_at = datetime.utcnow()
                    session.add(brief)

    all_scores = session.exec(
        select(ICPScore)
        .where(ICPScore.workspace_id == workspace_id)
        .where(ICPScore.icp_id == primary_icp.id)
    ).all()
    for tiered_score in assign_tiers(list(all_scores)):
        session.add(tiered_score)
        account = ensure_account_for_domain(session, workspace_id, tiered_score.domain)
        if account:
            account.latest_tier = tiered_score.tier
            account.latest_icp_score = tiered_score.final_score
            session.add(account)

    smartlead = session.exec(
        select(SmartleadStats)
        .where(SmartleadStats.workspace_id == workspace_id)
        .where(SmartleadStats.campaign_id == f"demo-{suffix}")
    ).first()
    if not smartlead:
        smartlead = SmartleadStats(
            workspace_id=workspace_id,
            campaign_id=f"demo-{suffix}",
            campaign_name="Demo Signal Campaign",
        )
    smartlead.emails_sent = 126
    smartlead.opens = 71
    smartlead.open_rate = 56.3
    smartlead.replies = 14
    smartlead.reply_rate = 11.1
    smartlead.meetings_booked = 4
    smartlead.synced_at = datetime.utcnow()
    session.add(smartlead)

    manual_log_specs = [
        ("linkedin", "replied", "LinkedIn touch after reviewing queue evidence."),
        ("call", "meeting_booked", "Demo cold call converted into booked follow-up."),
    ]
    for idx, (channel, status, notes) in enumerate(manual_log_specs):
        log = session.exec(
            select(ManualActivityLog)
            .where(ManualActivityLog.workspace_id == workspace_id)
            .where(ManualActivityLog.channel == channel)
            .where(ManualActivityLog.lead_email == lead_email("sample", company_specs[idx]["domain"]))
        ).first()
        if not log:
            log = ManualActivityLog(
                workspace_id=workspace_id,
                lead_email=lead_email("sample", company_specs[idx]["domain"]),
                lead_name=f"Sample {channel.title()}",
                company=company_specs[idx]["name"],
                channel=channel,
            )
        log.status = status
        log.notes = notes
        log.activity_date = datetime.utcnow() - timedelta(days=idx + 1)
        log.call_duration = 240 if channel == "call" else None
        session.add(log)

    session.commit()

    return {
        "workspace_id": str(workspace_id),
        "mission_id": str(context.id),
        "primary_icp_id": str(primary_icp.id),
        "companies": len(company_specs),
        "leads": len(created_lead_ids),
        "signals": sum(len(spec["signals"]) for spec in company_specs),
        "playbook_id": str(playbook.id),
        "messaging_play_id": str(messaging_play.id),
    }


def _dp(value, confidence: float, source: str, evidence: str) -> dict:
    return {
        "value": value,
        "confidence": confidence,
        "source": source,
        "evidence": evidence,
    }
