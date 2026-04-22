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

    # ASR: default to tiny for local dev responsiveness. For higher accuracy, set env ASR_MODEL=openai/whisper-base.
    asr_model: str = "openai/whisper-tiny"
    preload_asr: bool = True
    max_asr_seconds: int = 60
    asr_chunk_length_s: int = 20
    asr_stride_length_s: int = 5

    # Launch hardening
    environment: str = "dev"  # dev|prod
    admin_key: str | None = None
    allow_transcript_override: bool = False
    dev_allow_transcript_override: bool = True
    enable_rate_limit: bool = True
    rate_limit_per_minute: int = 60

    # Transcript emotion + audio prosody (small Fit weight); gaze is advisory only.
    # Default off for speed; enable via env ENABLE_DELIVERY_INSIGHTS=true if desired.
    enable_delivery_insights: bool = False
    fit_weight_delivery: float = 0.05

    # Whisper tends to be more stable when you explicitly set language in multilingual checkpoints.
    asr_language: str = "en"

    def cors_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
