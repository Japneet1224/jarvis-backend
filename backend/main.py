"""
main.py
-------
FastAPI entry point for the AI knowledge assistant.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from pydantic import BaseModel, Field

from auth import (
    get_current_user,
    login_and_create_token,
    register_and_create_token,
)
from config import settings
from database import (
    GLOBAL_USER_ID,
    append_conversation_messages,
    create_conversation,
    delete_conversation,
    delete_knowledge_source,
    get_conversation,
    get_knowledge_source,
    init_db,
    list_conversations,
    list_knowledge_sources,
    ping_database,
    rename_conversation,
    utc_now,
)
from response import (
    generate_response_from_results,
    generate_response_with_metadata,
)
from chunks import get_user_chunk_graph
from upload import upload_file
from vector_search import (
    search_query_chunks,
)


# ============================================================
# Application
# ============================================================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Knowledge-grounded AI assistant using "
        "MongoDB Atlas Vector Search."
    ),
    debug=settings.DEBUG,
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Authentication
# ============================================================

security = HTTPBearer()


def authenticated_user(
    credentials: HTTPAuthorizationCredentials,
) -> dict[str, Any]:

    user = get_current_user(
        credentials.credentials
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid or expired "
                "authentication token."
            ),
        )

    return user


def authenticated_user_id(
    credentials: HTTPAuthorizationCredentials,
) -> str:

    user = authenticated_user(
        credentials
    )

    user_id = user.get(
        "_id"
    )

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authenticated user ID is missing.",
        )

    return str(
        user_id
    )


# ============================================================
# Startup
# ============================================================

@app.on_event("startup")
def startup_event() -> None:

    try:
        init_db()

    except Exception as exc:

        raise RuntimeError(
            f"Database initialization failed: {exc}"
        ) from exc


# ============================================================
# Models
# ============================================================

class RegisterRequest(BaseModel):

    email: str = Field(
        ...,
        min_length=3,
        max_length=255,
    )

    password: str = Field(
        ...,
        min_length=1,
    )

    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
    )


class LoginRequest(BaseModel):

    email: str = Field(
        ...,
        min_length=3,
        max_length=255,
    )

    password: str = Field(
        ...,
        min_length=1,
    )


class AuthResponse(BaseModel):

    access_token: str
    token_type: str
    user: dict[str, Any]


class RenameRequest(BaseModel):
    title: str


class QueryRequest(BaseModel):

    query: str = Field(
        ...,
        min_length=1,
        max_length=settings.QUERY_MAX_LENGTH,
    )

    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
    )

    conversation_id: Optional[str] = None


class QueryResponse(BaseModel):

    answer: str
    sources: list[str] = []
    knowledge_count: int = 0
    conversation_id: str


# ============================================================
# Root
# ============================================================

@app.get("/")
def root() -> dict[str, Any]:

    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


# ============================================================
# Health
# ============================================================

@app.get("/health")
def health_check() -> dict[str, Any]:

    database_available = ping_database()

    return {
        "status": (
            "healthy"
            if database_available
            else "degraded"
        ),
        "database": (
            "connected"
            if database_available
            else "disconnected"
        ),
    }


# ============================================================
# Register
# ============================================================

@app.post(
    "/auth/register",
    response_model=AuthResponse,
)
def register(
    request: RegisterRequest,
) -> AuthResponse:

    try:

        result = register_and_create_token(
            email=request.email,
            password=request.password,
            username=request.username,
        )

        return AuthResponse(
            access_token=result[
                "access_token"
            ],
            token_type=result[
                "token_type"
            ],
            user=result[
                "user"
            ],
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail="Failed to register user.",
        ) from exc


# ============================================================
# Login
# ============================================================

@app.post(
    "/auth/login",
    response_model=AuthResponse,
)
def login(
    request: LoginRequest,
) -> AuthResponse:

    try:

        result = login_and_create_token(
            email=request.email,
            password=request.password,
        )

        if result is None:

            raise HTTPException(
                status_code=401,
                detail="Invalid email or password.",
            )

        return AuthResponse(
            access_token=result[
                "access_token"
            ],
            token_type=result[
                "token_type"
            ],
            user=result[
                "user"
            ],
        )

    except HTTPException:
        raise

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail="Failed to authenticate user.",
        ) from exc


# ============================================================
# Current User
# ============================================================

@app.get("/auth/me")
def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    return authenticated_user(
        credentials
    )


# ============================================================
# Upload
# ============================================================

@app.post("/upload")
async def upload_knowledge_file(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    user_id = authenticated_user_id(
        credentials
    )

    return await upload_file(
        file=file,
        user_id=user_id,
    )


# ============================================================
# Uploaded Files
# ============================================================

@app.get("/files")
def get_uploaded_files(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> list[dict[str, Any]]:

    user_id = authenticated_user_id(
        credentials
    )

    return list_knowledge_sources(
        user_id
    )


@app.post("/upload/global")
async def upload_global_knowledge_file(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    authenticated_user_id(
        credentials
    )

    return await upload_file(
        file=file,
        user_id=GLOBAL_USER_ID,
    )


@app.get("/files/global")
def get_global_files(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> list[dict[str, Any]]:

    authenticated_user_id(
        credentials
    )

    return list_knowledge_sources(
        GLOBAL_USER_ID
    )


@app.delete("/files/global/{source_id}")
def remove_global_file(
    source_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, bool]:

    authenticated_user_id(
        credentials
    )

    deleted = delete_knowledge_source(
        source_id,
        GLOBAL_USER_ID,
    )

    return {
        "deleted": deleted is not None
    }


@app.get("/files/graph")
def get_files_knowledge_graph(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, list[dict[str, Any]]]:

    user_id = authenticated_user_id(
        credentials
    )

    return get_user_chunk_graph(
        user_id
    )


@app.delete("/files/{source_id}")
def remove_uploaded_file(
    source_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, bool]:

    user_id = authenticated_user_id(
        credentials
    )

    try:

        source = get_knowledge_source(
            source_id,
            user_id,
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail="File not found.",
        ) from exc

    if source is None:

        raise HTTPException(
            status_code=404,
            detail="File not found.",
        )

    deleted = delete_knowledge_source(
        source_id,
        user_id,
    )

    if deleted and deleted.get(
        "file_path"
    ):

        Path(
            deleted[
                "file_path"
            ]
        ).unlink(
            missing_ok=True
        )

    return {
        "deleted": True
    }


# ============================================================
# Conversations
# ============================================================

@app.post("/conversations")
def create_user_conversation(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    return create_conversation(
        authenticated_user_id(
            credentials
        )
    )


@app.get("/conversations")
def get_user_conversations(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> list[dict[str, Any]]:

    return list_conversations(
        authenticated_user_id(
            credentials
        )
    )


@app.get("/conversations/{conversation_id}")
def get_user_conversation(
    conversation_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    user_id = authenticated_user_id(
        credentials
    )

    try:

        conversation = get_conversation(
            conversation_id,
            user_id,
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        ) from exc

    if conversation is None:

        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


@app.patch("/conversations/{conversation_id}")
def rename_user_conversation(
    conversation_id: str,
    request: RenameRequest,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:

    user_id = authenticated_user_id(
        credentials
    )

    conversation = rename_conversation(
        conversation_id,
        user_id,
        request.title,
    )

    if conversation is None:

        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


@app.delete("/conversations/{conversation_id}")
def remove_user_conversation(
    conversation_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, bool]:

    user_id = authenticated_user_id(
        credentials
    )

    try:

        deleted = delete_conversation(
            conversation_id,
            user_id,
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        ) from exc

    if not deleted:

        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return {
        "deleted": True
    }


# ============================================================
# AI Query
# ============================================================

@app.post(
    "/query",
    response_model=QueryResponse,
)
def query_ai(
    request: QueryRequest,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> QueryResponse:

    # --------------------------------------------------------
    # Resolve authenticated user
    # --------------------------------------------------------

    user = authenticated_user(
        credentials
    )

    user_id = str(
        user["_id"]
    )

    query = request.query.strip()

    if not query:

        raise HTTPException(
            status_code=400,
            detail="Query cannot be empty.",
        )

    try:

        # ----------------------------------------------------
        # Knowledge retrieval
        # ----------------------------------------------------

        search_results = search_query_chunks(
            query=query,
            user_id=user_id,
            top_k=request.top_k,
        ) + search_query_chunks(
            query=query,
            user_id=GLOBAL_USER_ID,
            top_k=request.top_k,
        )

        # ----------------------------------------------------
        # Generate answer
        # ----------------------------------------------------

        response_data = generate_response_with_metadata(
            query=query,
            search_results=search_results,
        )

        result = response_data['answer']

        # ----------------------------------------------------
        # Conversation
        # ----------------------------------------------------

        conversation_id = (
            request.conversation_id
        )

        is_new_conversation = conversation_id is None

        if is_new_conversation:

            conversation = create_conversation(
                user_id=user_id,
                title=query[:80],
            )

            conversation_id = conversation[
                "id"
            ]

        else:

            conversation = get_conversation(
                conversation_id,
                user_id,
            )

            if conversation is None:

                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found.",
                )

        # ----------------------------------------------------
        # Sources
        # ----------------------------------------------------

        sources = []

        for search_result in search_results:

            source = search_result.get(
                "source"
            )

            if source and source not in sources:
                sources.append(
                    source
                )

        # ----------------------------------------------------
        # Save conversation
        # ----------------------------------------------------

        saved = append_conversation_messages(
            conversation_id=conversation_id,
            user_id=user_id,
            messages=[
                {
                    "role": "user",
                    "content": query,
                    "created_at": utc_now(),
                },
                {
                    "role": "assistant",
                    "content": result,
                    "sources": sources,
                    "knowledge_count": len(
                        search_results
                    ),
                    "created_at": utc_now(),
                },
            ],
            title=query[:80] if is_new_conversation else None,
        )

        if saved is None:

            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        return QueryResponse(
            answer=result,
            sources=sources,
            knowledge_count=len(
                search_results
            ),
            conversation_id=conversation_id,
        )

    except HTTPException:
        raise

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        print(
            "QUERY ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to generate the AI response. "
                f"{exc}"
            ),
        ) from exc


# ============================================================
# Development Server
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
    )