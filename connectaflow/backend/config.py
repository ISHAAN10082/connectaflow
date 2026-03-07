from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Validated at startup. Missing vars → crash immediately, not mid-batch."""
    GROQ_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    DATABASE_URL: str = "sqlite:///./connectaflow.db"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    ENRICHMENT_CONCURRENCY: int = 30
    ENRICHMENT_CACHE_TTL_DAYS: int = 30
    LLM_MAX_RETRIES: int = 3
    COMMONCRAWL_INDEX: str = "CC-MAIN-2025-08"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def has_any_llm_provider(self) -> bool:
        return bool(self.GROQ_API_KEY or self.GEMINI_API_KEY)


settings = Settings()
