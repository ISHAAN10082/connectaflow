from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import LLMExtractionStrategy
from pydantic import BaseModel, Field, create_model
from services.search_service import SearchService
import os
import asyncio
import json
import litellm
from loguru import logger

class EnrichmentService:
    def __init__(self, api_token: str = None):
        self.api_token = api_token or os.getenv("GEMINI_API_KEY")
        if self.api_token:
            os.environ["GEMINI_API_KEY"] = self.api_token

    async def extract_company_info(self, url: str):
        if not self.api_token:
            print("Warning: No GEMINI_API_KEY found. Skipping enrichment.")
            return {"error": "Missing API Key"}

        print(f"Enriching URL: {url}...")
        
        # Define Schema for Extraction
        class CompanyInfo(BaseModel):
            summary: str = Field(..., description="1-sentence company summary")
            pricing_model: str = Field(..., description="Freemium, Paid, or Enterprise")
            competitors: list[str] = Field(..., description="List of competitors mentioned")
            tech_stack: list[str] = Field(..., description="Technologies mentioned (e.g. React, Python)")

        strategy = LLMExtractionStrategy(
            provider="gemini/gemini-flash-latest", 
            api_token=self.api_token,
            schema=CompanyInfo.model_json_schema(),
            instruction="Extract key business details from this page. Focus on what they do, pricing, and technology."
        )

        async with AsyncWebCrawler(verbose=True) as crawler:
            result = await crawler.arun(url=url, extraction_strategy=strategy, bypass_cache=True)
            
            if result.success:
                return result.extracted_content
            else:
                return {"error": f"Failed to crawl: {result.error_message}"}

    async def enrich_lead(self, lead_data: dict, target_columns: list[str], context_columns: list[str] = ['company'], instruction: str = None):
        """
        Enrich a single lead by searching and extracting specific columns.
        """
        if not self.api_token:
            return {"error": "Missing API Key"}

        # 1. Construct Search Query
        query_parts = []
        for col in context_columns:
            if val := lead_data.get(col):
                query_parts.append(str(val))
        
        # Add targets to query to be specific
        query_parts.extend(target_columns)
        query = " ".join(query_parts)
        
        # Append instruction specific keywords to query if provided?
        # Maybe better to keep query simple: "Company Name Revenue"
        
        search_service = SearchService()
        urls = search_service.search_urls(query, max_results=2) # Limit to 2 for speed
        
        if not urls:
            return {"error": "No info found"}

        # 2. Dynamic Schema
        # 3. Crawl & Extract Manually (Bypassing Crawl4AI Strategy due to issues)
        async with AsyncWebCrawler(verbose=True) as crawler:
            url = urls[0] # Try first URL
            # Just fetch content with magic mode (anti-bot)
            result = await crawler.arun(url=url, bypass_cache=True, magic=True)
            
            if result.success and result.markdown:
                content_md = result.markdown
                prompt = f"""
                You are a research agent. 
                Extract the following fields from the content: {', '.join(target_columns)}. 
                
                Content:
                {content_md[:20000]} 

                Instructions:
                {instruction if instruction else "Extract the data accurately."}
                
                Rules:
                1. If exact field name is not found, look for synonyms (e.g. 'CEO' -> 'Director', 'Founder', 'Principle').
                2. Return valid JSON dictionary with keys matching the requested columns exactly.
                3. If a value is absolutely not found, use null.
                4. Do NOT hallucinate.
                """
                
                try:
                    response = litellm.completion(
                        model="gemini/gemini-flash-latest",
                        messages=[{"role": "user", "content": prompt}],
                        api_key=self.api_token
                    )
                    content = response.choices[0].message.content or ""
                    
                    # Sanitize JSON: Remove markdown code blocks if present
                    if "```json" in content:
                        content = content.replace("```json", "").replace("```", "")
                    elif "```" in content:
                        content = content.replace("```", "")
                    
                    content = content.strip()
                    
                    data = json.loads(content)
                    if isinstance(data, list) and data:
                        return data[0]
                    return data

                except Exception as e:
                    logger.warning(f"LLM/Parse Error: {e}. Content: {content[:100] if 'content' in locals() else 'N/A'}...")
                    return {"raw": "Extraction Failed", "error": str(e)}
            else:
                return {"error": f"Failed to crawl: {result.error_message}"}
