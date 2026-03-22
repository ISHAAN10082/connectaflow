"""
Smartlead Integration Service.
Wraps Smartlead API for campaign stats and reply ingestion.
Ref: https://helpcenter.smartlead.ai/en/articles/57-data-export-options-in-smartlead
"""
import httpx
from loguru import logger
from typing import Optional


class SmartleadService:
    def __init__(self, api_key: str, base_url: str = "https://server.smartlead.ai/api/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _headers(self) -> dict:
        return {"Content-Type": "application/json"}

    def _params(self, extra: dict = None) -> dict:
        params = {"api_key": self.api_key}
        if extra:
            params.update(extra)
        return params

    async def list_campaigns(self) -> list[dict]:
        """List all campaigns from Smartlead."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.base_url}/campaigns",
                    params=self._params(),
                )
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list):
                    return data
                return data.get("data", [])
        except Exception as e:
            logger.warning(f"Smartlead list_campaigns failed: {e}")
            return []

    async def get_campaign_stats(self, campaign_id: str) -> dict:
        """Get statistics for a single campaign."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.base_url}/campaigns/{campaign_id}/statistics",
                    params=self._params(),
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Smartlead get_campaign_stats({campaign_id}) failed: {e}")
            return {}

    async def get_campaign_leads(self, campaign_id: str, offset: int = 0, limit: int = 100) -> list[dict]:
        """Get leads (contacts) in a campaign."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.base_url}/campaigns/{campaign_id}/leads",
                    params=self._params({"offset": offset, "limit": limit}),
                )
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list):
                    return data
                return data.get("data", [])
        except Exception as e:
            logger.warning(f"Smartlead get_campaign_leads({campaign_id}) failed: {e}")
            return []

    async def get_lead_message_history(self, campaign_id: str, lead_id: str) -> list[dict]:
        """Get message history for a specific lead in a campaign."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self.base_url}/campaigns/{campaign_id}/leads/{lead_id}/message-history",
                    params=self._params(),
                )
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list):
                    return data
                return data.get("history", [])
        except Exception as e:
            logger.warning(f"Smartlead get_message_history failed: {e}")
            return []

    async def get_all_replies(self, campaign_id: str) -> list[dict]:
        """
        Get all replied leads for a campaign.
        Returns list of {email, reply_text, replied_at, ...}
        """
        try:
            leads = await self.get_campaign_leads(campaign_id)
            replied_leads = [l for l in leads if l.get("reply_count", 0) > 0 or l.get("replied", False)]
            replies = []
            for lead in replied_leads[:50]:  # cap at 50 per sync to avoid rate limits
                lead_id = lead.get("id") or lead.get("lead_id")
                if not lead_id:
                    continue
                history = await self.get_lead_message_history(campaign_id, str(lead_id))
                for msg in history:
                    if msg.get("type") == "reply" or msg.get("message_type") == "reply":
                        replies.append({
                            "email": lead.get("email", ""),
                            "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
                            "reply_text": msg.get("message", "") or msg.get("reply_message", ""),
                            "replied_at": msg.get("time") or msg.get("created_at"),
                            "campaign_id": campaign_id,
                        })
            return replies
        except Exception as e:
            logger.warning(f"Smartlead get_all_replies({campaign_id}) failed: {e}")
            return []


def get_smartlead_service(workspace_settings: dict) -> Optional[SmartleadService]:
    """Factory: create SmartleadService from workspace settings dict."""
    api_key = workspace_settings.get("smartlead_api_key")
    if not api_key:
        return None
    base_url = workspace_settings.get("smartlead_base_url", "https://server.smartlead.ai/api/v1")
    return SmartleadService(api_key=api_key, base_url=base_url)
