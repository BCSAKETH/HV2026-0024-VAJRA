from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str

    # App-issued session JWT
    APP_JWT_SECRET: str
    APP_JWT_ALGORITHM: str = "HS256"
    APP_JWT_EXPIRE_MINUTES: int = 1440

    # Hackathon demo bypass — set to "" in a real deployment to disable it
    DEMO_OTP_BYPASS_CODE: str = ""

    # Twilio — consumer notifications only, never staff OTP.
    # Auth accepts either pair: TWILIO_AUTH_TOKEN (the account's master
    # secret) OR an API Key SID/Secret (scoped, revocable without rotating
    # the account's own token — twilio.com/console -> Account -> API keys &
    # tokens). If both are set, the API Key pair wins. Either way,
    # TWILIO_ACCOUNT_SID is still required: it's the account the request
    # authenticates against, not a credential itself.
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_API_KEY_SID: str = ""
    TWILIO_API_KEY_SECRET: str = ""
    TWILIO_WHATSAPP_FROM: str = ""

    # Fast2SMS — the active consumer-SMS provider (see app/core/fast2sms.py).
    # "q" (Quick SMS) is the only route that accepts arbitrary custom text
    # without DLT template registration, but it's gated behind a real ₹100+
    # wallet top-up regardless of trial status — confirmed live, not
    # documented anywhere. Every send is best-effort until that's cleared.
    FAST2SMS_API_KEY: str = ""

    # Mistral Vision OCR (switched from Groq — Groq has zero working vision
    # models as of this build, confirmed via a live API call; see README)
    MISTRAL_API_KEY: str = ""
    MISTRAL_VISION_MODEL: str = "ministral-8b-latest"

    # Nominatim geocoding
    NOMINATIM_BASE_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_USER_AGENT: str = "locus-logistics-app"

    # OSRM road-network routing/directions — public demo instance, no key
    # needed. It's rate-limited and "not for production" per its own docs,
    # so every caller treats a miss as best-effort and falls back to the
    # straight-line haversine estimate, never blocks on it.
    OSRM_BASE_URL: str = "https://router.project-osrm.org"

    ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081"
    PUBLIC_WEB_BASE_URL: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
