"""
config.py
---------

Central configuration for the AI knowledge assistant.

Responsibilities:
- Load environment variables.
- Configure the application.
- Configure MongoDB Atlas.
- Configure embeddings (algorithmic).
- Configure RAG.
- Configure file processing.
- Configure authentication/security.
- Configure knowledge graph generation.
- Configure MongoDB Atlas Vector Search.
- Configure file-storage paths.

Important:
- Do not put application logic in this file.
- Secrets must come from environment variables.
- Never hard-code API keys, passwords, or JWT secrets.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


# ============================================================
# Base Paths
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR = DATA_DIR / "uploads"


# ============================================================
# Settings
# ============================================================

class Settings(BaseSettings):
    """
    Application configuration loaded from environment variables
    and .env.
    """

    # --------------------------------------------------------
    # Application
    # --------------------------------------------------------

    APP_NAME: str = (
        "Personal AI Knowledge Assistant"
    )

    APP_VERSION: str = "1.0.0"

    DEBUG: bool = True


    # --------------------------------------------------------
    # API
    # --------------------------------------------------------

    API_HOST: str = "127.0.0.1"

    API_PORT: int = 8000




    # --------------------------------------------------------
    # Embeddings
    # --------------------------------------------------------

    # Using algorithmic TF-IDF embeddings (no external models)
    # Produces 384-dimensional embeddings
    EMBEDDING_DIMENSIONS: int = 384


    # --------------------------------------------------------
    # RAG
    # --------------------------------------------------------

    RAG_TOP_K: int = 5

    MIN_RELEVANCE_SCORE: float = 0.50

    MAX_CONTEXT_CHUNKS: int = 5


    # --------------------------------------------------------
    # Document Chunking
    # --------------------------------------------------------

    CHUNK_SIZE: int = 1000

    CHUNK_OVERLAP: int = 150

    MIN_CHUNK_SIZE: int = 50


    # --------------------------------------------------------
    # Query Processing
    # --------------------------------------------------------

    QUERY_MAX_LENGTH: int = 5000

    QUERY_MIN_LENGTH: int = 1


    # --------------------------------------------------------
    # File Processing
    # --------------------------------------------------------

    MAX_FILE_SIZE_MB: int = 100

    ALLOW_UNKNOWN_FILE_TYPES: bool = False

    # IMPORTANT:
    # upload.py accesses settings.UPLOAD_DIR.
    # This exposes the global upload directory through
    # the Settings object.
    UPLOAD_DIR: Path = Field(
        default=UPLOAD_DIR,
    )


    # --------------------------------------------------------
    # Supported File Types
    # --------------------------------------------------------

    ALLOWED_FILE_EXTENSIONS: tuple[str, ...] = (
        ".pdf",
        ".docx",
        ".xlsx",
        ".xls",
        ".pptx",
        ".txt",
        ".md",
        ".html",
        ".htm",
        ".xml",
        ".csv",
    )


    # --------------------------------------------------------
    # MongoDB Atlas
    # --------------------------------------------------------

    MONGODB_URI: str = Field(
        default="",
        repr=False,
    )

    MONGODB_DATABASE: str = (
        "ai_assistant"
    )

    MONGODB_MIN_POOL_SIZE: int = 1

    MONGODB_MAX_POOL_SIZE: int = 10

    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = 5000


    # --------------------------------------------------------
    # MongoDB Atlas Vector Search
    # --------------------------------------------------------

    VECTOR_INDEX_NAME: str = (
        "knowledge_vector_index"
    )

    VECTOR_FIELD_NAME: str = (
        "embedding"
    )

    VECTOR_NUM_CANDIDATES: int = 100


    # --------------------------------------------------------
    # Knowledge Graph
    # --------------------------------------------------------

    ENABLE_KNOWLEDGE_GRAPH: bool = True

    GRAPH_MAX_ENTITIES: int = 100

    GRAPH_MAX_RELATIONSHIPS: int = 200


    # --------------------------------------------------------
    # Authentication
    # --------------------------------------------------------

    JWT_SECRET_KEY: str = Field(
        default="",
        repr=False,
    )

    JWT_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60


    # --------------------------------------------------------
    # Password Security
    # --------------------------------------------------------

    PASSWORD_MIN_LENGTH: int = 8


    # --------------------------------------------------------
    # Memory
    # --------------------------------------------------------

    MEMORY_TOP_K: int = 3

    MEMORY_MIN_RELEVANCE_SCORE: float = 0.20


    # --------------------------------------------------------
    # Conversation
    # --------------------------------------------------------

    MAX_CONVERSATION_HISTORY: int = 10


    # --------------------------------------------------------
    # Environment Configuration
    # --------------------------------------------------------

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


# ============================================================
# Global Settings Instance
# ============================================================

settings = Settings()


# ============================================================
# Create Required Directories
# ============================================================

DATA_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

settings.UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)