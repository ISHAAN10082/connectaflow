
import os
import time
import litellm
from loguru import logger
import asyncio

class AIOrchestrator:
    def __init__(self):
        # Configuration for providers
        self.providers = [
            {
                "name": "groq",
                "model": "groq/llama3-8b-8192",
                "api_key_env": "GROQ_API_KEY",
                "priority": 1,
                "cooldown": 0,  # Timestamp when cooldown expires
                "error_count": 0
            },
            {
                "name": "gemini",
                "model": "gemini/gemini-1.5-flash",
                "api_key_env": "GEMINI_API_KEY",
                "priority": 2,
                "cooldown": 0,
                "error_count": 0
            }
        ]
        
    def _is_available(self, provider):
        """Check if provider is available (keys exist and not in cooldown)"""
        api_key = os.getenv(provider["api_key_env"])
        if not api_key:
            return False
            
        if time.time() < provider["cooldown"]:
            return False
            
        return True

    def _get_best_provider(self):
        """Get the highest priority available provider"""
        # Sort by priority
        sorted_providers = sorted(self.providers, key=lambda x: x["priority"])
        
        for p in sorted_providers:
            if self._is_available(p):
                return p
        
        return None

    def _mark_as_failed(self, provider_name, cooldown_seconds=60):
        """Mark a provider as failed temporarily"""
        for p in self.providers:
            if p["name"] == provider_name:
                p["error_count"] += 1
                p["cooldown"] = time.time() + cooldown_seconds
                logger.warning(f"Orchestrator: {provider_name} failed. Cooldown for {cooldown_seconds}s.")
                break

    async def completion(self, messages, instruction=None, retries=3):
        """
        Orchestrated completion with failover logic.
        """
        last_error = None
        
        for attempt in range(retries):
            provider = self._get_best_provider()
            
            if not provider:
                error_msg = "No AI providers available (missing keys or all in cooldown)."
                logger.error(error_msg)
                return None, error_msg

            model = provider["model"]
            api_key = os.getenv(provider["api_key_env"])
            
            logger.info(f"Orchestrator: Attempting extraction with {provider['name']} ({model})...")

            try:
                # Add system instruction if provided (and supported, but usually messages[0] system helps)
                formatted_messages = list(messages)
                if instruction:
                     # Check if system message exists, else prepend
                     if formatted_messages and formatted_messages[0]['role'] == 'system':
                         pass 
                     else:
                         formatted_messages.insert(0, {"role": "system", "content": instruction})

                response = await litellm.acompletion(
                    model=model,
                    messages=formatted_messages,
                    api_key=api_key,
                    max_tokens=1024,
                    temperature=0.1
                )
                
                # If success, clear error count (optional, or just leave it)
                provider["error_count"] = 0
                return response.choices[0].message.content, None

            except Exception as e:
                error_str = str(e)
                logger.warning(f"Orchestrator: Error with {provider['name']}: {error_str}")
                
                # Check for rate limits or specific errors
                if "429" in error_str or "Rate limit" in error_str:
                    logger.warning(f"Orchestrator: Rate Limit Hit for {provider['name']}.")
                    self._mark_as_failed(provider["name"], cooldown_seconds=60) # 1 min cooldown
                else:
                    # Other errors (auth, context length, etc.)
                   self._mark_as_failed(provider["name"], cooldown_seconds=30)
                
                last_error = error_str
                # Loop continues to next available provider
        
        return None, f"All providers failed. Last error: {last_error}"
