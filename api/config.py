from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    models_dir: Path = Path(__file__).resolve().parent.parent / "models"
    workspace_checkpoint: str = "workspace/workspace_cnn.pt"
    technical_model_dir: str = "technical"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    # ASR: whisper-tiny is fast but error-prone; whisper-base is a better default for interview audio.
    asr_model: str = "openai/whisper-base"

    # Launch hardening
    environment: str = "dev"  # dev|prod
    admin_key: str | None = None
    allow_transcript_override: bool = False
    enable_rate_limit: bool = True
    rate_limit_per_minute: int = 60

    def cors_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
