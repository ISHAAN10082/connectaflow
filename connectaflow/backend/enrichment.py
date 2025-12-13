from crawl4ai import AsyncWebCrawler
from pydantic import BaseModel, Field, create_model
from services.search_service import SearchService
import os
import asyncio
import json
from loguru import logger
from orchestrator import AIOrchestrator

class EnrichmentService:
    def __init__(self, api_token: str = None):
        # We still accept api_token for legacy reasons, but Orchestrator manages env vars
        if api_token:
            os.environ["GEMINI_API_KEY"] = api_token
        
        self.orchestrator = AIOrchestrator()

    async def extract_company_info(self, url: str):
        # Deprecated manual single-url method, but let's upgrade it to use orchestrator too if possible
        # For now, sticking to the main flow `enrich_lead` which is what we use.
        print(f"Enriching URL: {url}...")
        
        # We can implement this later or route it logic. 
        # For this refactor, let's focus on `enrich_lead`.
        return {"error": "Use batch flow"}

    async def enrich_lead(self, lead_data: dict, target_columns: list[str], context_columns: list[str] = ['company'], instruction: str = None):
        """
        Enrich a single lead using Orchestrator for Failover/Free-Tier limits.
        """
        
        # 1. Construct Search Query
        query_parts = []
        for col in context_columns:
            if val := lead_data.get(col):
                query_parts.append(str(val))
        
        query_parts.extend(target_columns)
        query = " ".join(query_parts)
        
        logger.debug(f"Generated Search Query: '{query}' for lead data: {lead_data}")
        
        search_service = SearchService()
        urls = search_service.search_urls(query, max_results=2)
        logger.info(f"Search Service found URLs: {urls}")
        
        if not urls:
            logger.warning(f"No URLs found for query: {query}")
            return {"error": "No info found"}

        # 2. Crawl & Extract using Orchestrator
        async with AsyncWebCrawler(verbose=True) as crawler:
            url = urls[0] # Try first URL
            logger.info(f"Attempting to crawl URL: {url}")
            
            # Just fetch content with magic mode (anti-bot)
            result = await crawler.arun(url=url, bypass_cache=True, magic=True)
            logger.debug(f"Crawl result for {url}: Success={result.success}, Length={len(result.markdown) if result.markdown else 0}")
            
            if result.success and result.markdown:
                content_md = result.markdown
                
                # Construct Prompt
                prompt = f"""
                You are a research agent. 
                Extract the following fields from the content: {', '.join(target_columns)}. 
                
                Content (Truncated):
                {content_md[:15000]} 

                Instructions:
                {instruction if instruction else "Extract the data accurately."}
                
                Rules:
                1. If exact field name is not found, look for synonyms (e.g. 'CEO' -> 'Director', 'Founder', 'Principle').
                2. Return valid JSON dictionary with keys matching the requested columns exactly.
                3. If a value is absolutely not found, use null.
                4. Do NOT hallucinate.
                5. Return ONLY JSON. No markdown formatting.
                """
                
                # USE ORCHESTRATOR
                content, error = await self.orchestrator.completion(
                    messages=[{"role": "user", "content": prompt}],
                    instruction="You are a data extraction assistant. Return valid JSON."
                )
                
                if error:
                    return {"error": error}

                # Parse Response
                try:
                    logger.debug(f"LLM Raw Response: {content[:100]}...") 
                    
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0]
                    
                    content = content.strip()
                    data = json.loads(content)
                    
                    if isinstance(data, list) and data:
                        return data[0]
                    return data

                except Exception as e:
                    logger.warning(f"Parse Error: {e}. Content: {content[:100]}...")
                    return {"raw": content, "error": "Failed to parse JSON"}
            else:
                return {"error": f"Failed to crawl: {result.error_message}"}
