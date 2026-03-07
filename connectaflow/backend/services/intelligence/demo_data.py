from __future__ import annotations

from typing import Any, List, Optional

from models import GTMContext


def _first(items: Optional[List[str]], default: str) -> str:
    if items:
        return items[0]
    return default


def _firmo(ctx: GTMContext, key: str, default: str) -> str:
    if isinstance(ctx.firmographic_range, dict):
        val = ctx.firmographic_range.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return default


def build_demo_icp_suggestions(ctx: GTMContext) -> list[dict[str, Any]]:
    industry = _first(ctx.target_industries, ctx.product_category or "B2B SaaS")
    geo = ctx.geographic_focus or "US"
    employee_primary = _firmo(ctx, "employee_range", "50-200")
    revenue_primary = _firmo(ctx, "revenue_range", "$5M-$50M")
    business_model = _firmo(ctx, "business_model", "B2B SaaS")
    core_problem = ctx.core_problem or "pipeline generation and personalization"
    value_prop = ctx.value_proposition or "reduce research time and improve reply rates"

    return [
        {
            "icp_name": "Outbound-Stage Growth",
            "icp_statement": f"{geo} {industry} companies with {employee_primary} employees scaling outbound teams",
            "icp_priority": "Primary",
            "firmographic_range": {
                "employee_range": employee_primary,
                "revenue_range": revenue_primary,
                "business_model": business_model,
                "geography": geo,
            },
            "icp_rationale": f"These teams feel the pain of {core_problem} and have budget for tools that {value_prop}.",
            "list_sourcing_guidance": (
                f"Apollo filters: Geography={geo}, Industry={industry}, Employees={employee_primary}. "
                "Keywords=SDR, outbound, sales development. Titles=VP Sales, Head of Sales, CRO, RevOps."
            ),
        },
        {
            "icp_name": "Mid-Market Expansion",
            "icp_statement": f"{geo} {industry} companies with 200-1000 employees professionalizing RevOps",
            "icp_priority": "Secondary",
            "firmographic_range": {
                "employee_range": "200-1000",
                "revenue_range": "$50M-$250M",
                "business_model": business_model,
                "geography": geo,
            },
            "icp_rationale": "Larger teams need consistent messaging and account research at scale to keep pipeline quality high.",
            "list_sourcing_guidance": (
                f"Apollo filters: Geography={geo}, Industry={industry}, Employees=200-1000. "
                "Keywords=RevOps, revenue operations, sales analytics. Titles=VP RevOps, Revenue Ops Director."
            ),
        },
        {
            "icp_name": "Early-Stage Pipeline Build",
            "icp_statement": f"{geo} {industry} companies with 20-80 employees hiring first SDRs",
            "icp_priority": "Experimental",
            "firmographic_range": {
                "employee_range": "20-80",
                "revenue_range": "$1M-$10M",
                "business_model": business_model,
                "geography": geo,
            },
            "icp_rationale": "First outbound hires need playbooks and research speed. Great land-and-expand potential.",
            "list_sourcing_guidance": (
                f"Apollo filters: Geography={geo}, Industry={industry}, Employees=20-80. "
                "Keywords=first SDR, outbound, sales hire. Titles=Founder, Head of Sales."
            ),
        },
    ]


def build_demo_sourcing_guide(ctx: GTMContext) -> str:
    industry = _first(ctx.target_industries, "Software/SaaS")
    geo = ctx.geographic_focus or "US"
    employee_range = _firmo(ctx, "employee_range", "50-200")
    titles = "VP Sales, Head of Sales, CRO, RevOps"
    keywords = "SDR, outbound, sales development"
    lines = [
        f"Apollo filters: Geography={geo}",
        f"Industry={industry}, Employees={employee_range}",
        f"Job keywords={keywords}",
        f"Target titles: {titles}",
    ]
    if ctx.key_integrations:
        lines.append(f"Tech stack filters: {', '.join(ctx.key_integrations)}")
    return "\n".join(lines)


def build_demo_gtm_strategy(ctx: GTMContext) -> dict[str, Any]:
    industry = _first(ctx.target_industries, "B2B SaaS")
    geo = ctx.geographic_focus or "US"
    employee_range = _firmo(ctx, "employee_range", "50-200")
    icp_statement = ctx.icp_statement or f"{geo} {industry} companies with {employee_range} employees scaling outbound"
    product_category = ctx.product_category or "Sales Engagement"
    core_problem = ctx.core_problem or "manual account research and generic outreach"
    value_prop = ctx.value_proposition or "cut research time and improve personalization"
    competitor = _first(ctx.competitors, "ZoomInfo")
    integrations = ctx.key_integrations or ["Salesforce", "HubSpot"]

    personas = [
        {
            "name": "The Revenue Leader",
            "department": "Sales",
            "seniority": "VP",
            "job_titles": ["VP Sales", "Head of Sales", "CRO"],
            "responsibilities": [
                "Owns pipeline coverage and quarterly targets",
                "Sets outbound strategy and SDR hiring plan",
                "Reviews conversion rates and rep productivity",
            ],
            "kpis": ["Pipeline coverage", "SQL volume", "Rep ramp time"],
            "pain_points": [
                f"Teams lose hours to {core_problem}",
                "Reply rates drop when personalization is shallow",
                "Hard to prioritize which accounts to pursue first",
            ],
            "decision_role": "Decision Maker",
            "buying_style": "analytical",
            "information_diet": ["Pavilion", "Revenue Collective", "Gartner reports", "Peer referrals"],
            "objections": [f"We already use {competitor}", "AI accuracy concerns", "Adoption risk"],
            "internal_politics": "Needs CRO buy-in and RevOps validation before changing tooling.",
            "trigger_phrases": [
                "We need better account prioritization",
                "Reps are spending too much time researching",
                "Outbound is not scaling the way it should",
            ],
            "day_in_life": "Forecast reviews in the morning, rep 1:1s midday, pipeline analysis in the afternoon.",
            "success_looks_like": "Pipeline coverage improves without adding headcount.",
            "nightmare_scenario": "Misses targets and loses confidence from the board.",
            "evaluation_criteria": ["Time to value", "Data accuracy", "CRM integration", "ROI math"],
            "messaging_do": ["Lead with time savings", "Use pipeline math", "Reference similar teams"],
            "messaging_dont": ["Do not lead with jargon", "Avoid generic AI claims"],
        },
        {
            "name": "The RevOps Architect",
            "department": "Revenue Operations",
            "seniority": "Director",
            "job_titles": ["Head of RevOps", "RevOps Director", "Sales Operations"],
            "responsibilities": [
                "Owns data quality and systems architecture",
                "Maintains CRM hygiene and enrichment workflows",
                "Evaluates tooling changes and integration impact",
            ],
            "kpis": ["Data completeness", "Automation coverage", "Ops SLA"],
            "pain_points": [
                "Manual enrichment workflows do not scale",
                f"Teams lack consistent signals for {product_category}",
                "Tools create silos across sales and marketing",
            ],
            "decision_role": "Influencer",
            "buying_style": "consensus",
            "information_diet": ["RevOps Co-op", "Modern Revenue newsletters", "Vendor docs"],
            "objections": ["Implementation time", "Security review burden", "Overlap with existing tools"],
            "internal_politics": "Needs to align with Sales leadership and Security.",
            "trigger_phrases": [
                "Data is stale",
                "We need better signal tagging",
                "We need to reduce manual list work",
            ],
            "day_in_life": "Monitors integrations, fixes data issues, meets with sales leaders on workflow gaps.",
            "success_looks_like": "Automations reduce manual work and improve data trust.",
            "nightmare_scenario": "Data breaks cause missed outreach and lost revenue.",
            "evaluation_criteria": ["API coverage", "Field-level control", "Auditability", "Security posture"],
            "messaging_do": ["Speak in system outcomes", "Show data lineage", "Offer clear rollout path"],
            "messaging_dont": ["Avoid vague automation claims", "Do not skip security details"],
        },
    ]

    triggers = [
        {
            "name": "Scaling SDR Team",
            "description": "Company is hiring SDRs or building its first outbound team.",
            "category": "hiring",
            "urgency_level": "short_term",
            "why_it_matters": "Outbound scaling forces a rethink of research and personalization speed.",
            "ideal_timing": "Within 30 days of SDR hiring announcements.",
            "qualifying_questions": [
                "How many SDRs are you adding this quarter?",
                "What is current research time per account?",
                "How are you prioritizing accounts today?",
            ],
        },
        {
            "name": "Recent Funding + Growth Pressure",
            "description": "Company raised funding and has aggressive pipeline targets for the next 2 quarters.",
            "category": "growth",
            "urgency_level": "immediate",
            "why_it_matters": "New capital raises expectations for faster pipeline growth.",
            "ideal_timing": "Within 60 days of funding announcement.",
            "qualifying_questions": [
                "What growth targets are tied to the new round?",
                "Which segments are highest priority now?",
                "What tooling gaps are slowing outreach?",
            ],
        },
    ]

    signal_definitions = [
        {
            "name": "SDR job postings mentioning outbound",
            "description": "LinkedIn job postings for SDRs that reference outbound or account research.",
            "source": "linkedin",
            "detection_method": "keyword",
            "trigger_name": "Scaling SDR Team",
            "keywords": ["SDR", "sales development", "outbound", "prospecting", "account research"],
            "strength_score": 0.86,
            "false_positive_notes": "Backfill roles may look similar but indicate replacement, not growth.",
            "enrichment_fields_used": ["employee_count", "industry"],
        },
        {
            "name": "Funding announcement in last 90 days",
            "description": "News or database signal indicating a recent funding round.",
            "source": "funding_db",
            "detection_method": "api",
            "trigger_name": "Recent Funding + Growth Pressure",
            "keywords": ["Series A", "Series B", "Series C", "funding", "round"],
            "strength_score": 0.9,
            "false_positive_notes": "Debt rounds without growth goals are weaker signals.",
            "enrichment_fields_used": ["industry", "employee_count", "business_model"],
        },
    ]

    plays = [
        {
            "name": "SDR Scale Play",
            "icp_statement": icp_statement,
            "trigger_name": "Scaling SDR Team",
            "signal_name": "SDR job postings mentioning outbound",
            "persona_name": "The Revenue Leader",
            "messaging_angle": f"Teams scaling SDRs need faster research to hit targets. {value_prop}.",
            "channel_sequence": ["email", "linkedin_connect", "email", "phone"],
            "timing_rationale": "Warm on LinkedIn before second email. Call after two touches.",
            "opening_hook": "Noticed you are hiring SDRs. How are you keeping account research from slowing ramp?",
            "objection_handling": {
                f"We already use {competitor}": "Totally fair. Most teams still spend 20-30 minutes per account even with data tools. We focus on the last mile: intent + personalization.",
                "Not a priority": "Understood. When SDR volume increases, research time becomes the bottleneck. Happy to share a 2-minute overview for later.",
            },
            "competitive_positioning": f"Unlike {competitor}, we blend live signals with automated summaries to reduce manual research.",
            "success_criteria": "15% reply rate, 3% meeting booked, 30% reduction in research time.",
            "email_subject_lines": [
                "SDR ramp at {{company_name}}",
                "Outbound scaling question",
                "Reducing research time for SDRs",
            ],
            "call_talk_track": "Saw you are hiring SDRs. Quick question: how are you making sure reps are not stuck researching instead of booking meetings?",
        },
        {
            "name": "Funding Momentum Play",
            "icp_statement": icp_statement,
            "trigger_name": "Recent Funding + Growth Pressure",
            "signal_name": "Funding announcement in last 90 days",
            "persona_name": "The RevOps Architect",
            "messaging_angle": f"Funding increases pressure on pipeline quality. {value_prop} with clean data lineage.",
            "channel_sequence": ["email", "email", "linkedin_comment", "email"],
            "timing_rationale": "Lead with ops value, reinforce with proof, then engage on LinkedIn.",
            "opening_hook": "Congrats on the round. Are you scaling pipeline without adding manual data work?",
            "objection_handling": {
                "Implementation time": "We start with a single segment and expand once data quality is proven.",
                "Security review": "We provide SOC2, field-level controls, and audit logs before rollout.",
            },
            "competitive_positioning": f"We complement your {integrations[0]} stack with signal-aware enrichment instead of static lists.",
            "success_criteria": "Higher ICP fit rate, cleaner segments, faster launch of campaigns.",
            "email_subject_lines": [
                "Post-funding pipeline scale",
                "RevOps question after your round",
                "Signal-driven targeting",
            ],
            "call_talk_track": "Congrats on the funding. Curious how you are keeping targeting quality high as volume increases.",
        },
    ]

    return {
        "personas": personas,
        "triggers": triggers,
        "signal_definitions": signal_definitions,
        "plays": plays,
    }
