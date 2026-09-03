"""
database.py
-----------

MongoDB Atlas database layer for the AI knowledge assistant.

Responsibilities:
- Connect to MongoDB Atlas using PyMongo.
- Expose application collections.
- Provide MongoDB ObjectId utilities.
- Provide UTC timestamps.
- Initialize application indexes.
- Provide a database health check.

Architecture:

    MongoDB Atlas
        |
        +-- users
        +-- knowledge_sources
        +-- knowledge_chunks
        +-- knowledge_graphs
        +-- conversations
        +-- memories
        +-- response_feedback

Important:
- This file contains database infrastructure only.
- Authentication belongs in auth.py.
- File handling belongs in upload.py.
- Chunking belongs in chunks.py.
- Query processing belongs in query_chunks.py.
- Vector search belongs in vector_search.py.
- AI response generation belongs in response.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import OperationFailure
from pymongo.operations import SearchIndexModel
from pymongo.server_api import ServerApi

from config import settings


# ============================================================
# MongoDB Client
# ============================================================

if not settings.MONGODB_URI:
    raise RuntimeError(
        "MONGODB_URI is not configured in the .env file."
    )


client = MongoClient(
    settings.MONGODB_URI,
    server_api=ServerApi(
        "1",
        # $vectorSearch (used by vector_index.py / vector_search.py)
        # is not part of MongoDB's Stable API and is rejected outright
        # when strict mode is enabled, so Atlas Vector Search must run
        # with strict=False. Vector search silently fell back to the
        # keyword-search path on every query until this was disabled.
        strict=False,
        deprecation_errors=True,
    ),
    minPoolSize=settings.MONGODB_MIN_POOL_SIZE,
    maxPoolSize=settings.MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS=(
        settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS
    ),
)


# ============================================================
# Database
# ============================================================

db: Database = client[settings.MONGODB_DATABASE]


# ============================================================
# Collections
# ============================================================

users: Collection = db["users"]

knowledge_sources: Collection = (
    db["knowledge_sources"]
)

knowledge_chunks: Collection = (
    db["knowledge_chunks"]
)

knowledge_graphs: Collection = (
    db["knowledge_graphs"]
)

conversations: Collection = (
    db["conversations"]
)

memories: Collection = db["memories"]

response_feedback: Collection = (
    db["response_feedback"]
)


# ============================================================
# Utility Functions
# ============================================================

def utc_now() -> datetime:
    """
    Return the current UTC timestamp.

    MongoDB stores timezone-aware datetimes when provided with
    a timezone-aware Python datetime.
    """
    return datetime.now(timezone.utc)


GLOBAL_USER_ID = "000000000000000000000001"


def to_object_id(
    value: str | ObjectId,
) -> ObjectId:
    """
    Convert a string or ObjectId into a MongoDB ObjectId.

    Raises:
        ValueError:
            If the supplied value is not a valid ObjectId.
    """

    if isinstance(value, ObjectId):
        return value

    if not isinstance(value, str):
        raise ValueError(
            "MongoDB ObjectId must be a string or ObjectId."
        )

    if not ObjectId.is_valid(value):
        raise ValueError(
            f"Invalid MongoDB ObjectId: {value}"
        )

    return ObjectId(value)


def object_id_to_str(
    value: Optional[ObjectId],
) -> Optional[str]:
    """
    Convert an ObjectId into a string.

    Returns None when the supplied value is None.
    """

    if value is None:
        return None

    return str(value)


# ============================================================
# Database Health Check
# ============================================================

def ping_database() -> bool:
    """
    Test the MongoDB Atlas connection.

    Returns:
        True if MongoDB responds successfully.
        False if the connection fails.
    """

    try:
        client.admin.command("ping")
        return True

    except Exception:
        return False


# ============================================================
# Database Initialization
# ============================================================

def init_db() -> None:
    """
    Initialize MongoDB indexes used by the application.

    MongoDB creates collections automatically when documents
    are inserted, so this function primarily establishes indexes.
    """

    # --------------------------------------------------------
    # Users
    # --------------------------------------------------------

    users.create_index(
        [("email", ASCENDING)],
        unique=True,
        name="users_email_unique",
    )

    users.create_index(
        [("username", ASCENDING)],
        unique=True,
        sparse=True,
        name="users_username_unique",
    )

    users.create_index(
        [("created_at", DESCENDING)],
        name="users_created_at",
    )

    # --------------------------------------------------------
    # Knowledge Sources
    # --------------------------------------------------------

    knowledge_sources.create_index(
        [
            ("user_id", ASCENDING),
            ("created_at", DESCENDING),
        ],
        name="knowledge_sources_user_created",
    )

    knowledge_sources.create_index(
        [
            ("user_id", ASCENDING),
            ("filename", ASCENDING),
        ],
        name="knowledge_sources_user_filename",
    )

    knowledge_sources.create_index(
        [
            ("user_id", ASCENDING),
            ("status", ASCENDING),
        ],
        name="knowledge_sources_user_status",
    )

    # --------------------------------------------------------
    # Knowledge Chunks
    # --------------------------------------------------------

    knowledge_chunks.create_index(
        [
            ("user_id", ASCENDING),
            ("source_id", ASCENDING),
        ],
        name="knowledge_chunks_user_source",
    )

    knowledge_chunks.create_index(
        [
            ("source_id", ASCENDING),
            ("chunk_index", ASCENDING),
        ],
        name="knowledge_chunks_source_chunk",
    )

    # --------------------------------------------------------
    # Knowledge Graphs
    # --------------------------------------------------------

    knowledge_graphs.create_index(
        [
            ("user_id", ASCENDING),
            ("source_id", ASCENDING),
        ],
        unique=True,
        name="knowledge_graphs_user_source_unique",
    )

    # --------------------------------------------------------
    # Conversations
    # --------------------------------------------------------

    conversations.create_index(
        [
            ("user_id", ASCENDING),
            ("updated_at", DESCENDING),
        ],
        name="conversations_user_updated",
    )

    # --------------------------------------------------------
    # Memories
    # --------------------------------------------------------

    memories.create_index(
        [
            ("user_id", ASCENDING),
            ("created_at", DESCENDING),
        ],
        name="memories_user_created",
    )

    memories.create_index(
        [
            ("user_id", ASCENDING),
            ("memory_type", ASCENDING),
        ],
        name="memories_user_type",
    )

    # --------------------------------------------------------
    # Response Feedback
    # --------------------------------------------------------

    response_feedback.create_index(
        [
            ("user_id", ASCENDING),
            ("created_at", DESCENDING),
        ],
        name="feedback_user_created",
    )

    response_feedback.create_index(
        [
            ("conversation_id", ASCENDING),
        ],
        name="feedback_conversation",
    )

    # --------------------------------------------------------
    # Atlas Vector Search index
    #
    # Deferred import: vector_index.py imports from this module,
    # so importing it at module load time would be circular.
    # --------------------------------------------------------

    _ensure_vector_search_index()


def _ensure_vector_search_index() -> None:
    """
    Create the Atlas Vector Search index used by vector_search.py
    if it does not already exist.

    Regular MongoDB indexes are created implicitly by
    collection.create_index(), but Atlas Search/Vector Search
    indexes are a separate index type that must be created
    explicitly via create_search_index(). Without this, semantic
    search silently falls back to keyword search on every query.
    """

    from vector_index import (
        get_vector_index_definition,
        get_vector_index_name,
    )

    existing_names = {
        index.get("name")
        for index in knowledge_chunks.list_search_indexes()
    }

    if get_vector_index_name() in existing_names:
        return

    definition = get_vector_index_definition()

    try:
        knowledge_chunks.create_search_index(
            SearchIndexModel(
                definition=definition["definition"],
                name=definition["name"],
                type=definition["type"],
            )
        )
    except OperationFailure:
        # The cluster tier may not support Atlas Search
        # (e.g. some self-managed/local MongoDB deployments), or
        # the index may have just been created by a concurrent
        # startup. Vector search will fall back to keyword search
        # in that case.
        pass


def create_user(
    email: str,
    username: Optional[str] = None,
    password_hash: Optional[str] = None,
) -> str:
    document: dict[str, Any] = {
        "email": email.lower().strip(),
        "password_hash": password_hash,
        "is_active": True,
        "created_at": utc_now(),
    }

    # The "users_username_unique" index is a sparse unique index.
    # MongoDB only excludes documents that are missing the field
    # entirely from a sparse index -- a document with the field
    # explicitly set to null is still indexed. Omitting the key
    # here (rather than setting it to None) lets multiple users
    # register without a username.
    if username:
        document["username"] = username.strip()

    result = users.insert_one(document)

    return str(result.inserted_id)


def get_user(
    user_id: str,
) -> Optional[dict[str, Any]]:
    object_id = to_object_id(user_id)

    return users.find_one(
        {
            "_id": object_id,
        }
    )


def get_user_by_email(
    email: str,
) -> Optional[dict[str, Any]]:
    return users.find_one(
        {
            "email": email.lower().strip(),
        }
    )


# ============================================================
# Knowledge source persistence
# ============================================================

def create_knowledge_source(
    user_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    file_size: int,
) -> str:
    """Create a private knowledge-source record for an uploaded file."""
    now = utc_now()
    result = knowledge_sources.insert_one({
        "user_id": user_id,
        "filename": filename,
        "file_path": file_path,
        "file_type": file_type,
        "file_size": file_size,
        "status": "processing",
        "created_at": now,
        "updated_at": now,
    })
    return str(result.inserted_id)


def list_knowledge_sources(user_id: str) -> list[dict[str, Any]]:
    return [serialize_knowledge_source(source) for source in knowledge_sources.find(
        {"user_id": user_id}
    ).sort("created_at", DESCENDING)]


def get_knowledge_source(source_id: str, user_id: str) -> Optional[dict[str, Any]]:
    return knowledge_sources.find_one({"_id": to_object_id(source_id), "user_id": user_id})


def delete_knowledge_source(source_id: str, user_id: str) -> Optional[dict[str, Any]]:
    source = knowledge_sources.find_one_and_delete(
        {"_id": to_object_id(source_id), "user_id": user_id}
    )
    knowledge_chunks.delete_many(
        {"source_id": to_object_id(source_id), "user_id": to_object_id(user_id)}
    )
    return source


def serialize_knowledge_source(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(source["_id"]),
        "filename": source["filename"],
        "file_type": source.get("file_type", "unknown"),
        "file_size": source.get("file_size", 0),
        "status": source.get("status", "processing"),
        "created_at": source.get("created_at").isoformat() if source.get("created_at") else None,
    }

# ============================================================
# Knowledge Chunk Persistence
# ============================================================

def create_knowledge_chunks(
    chunk_documents: list[dict[str, Any]],
) -> list[str]:
    """
    Insert knowledge chunks into MongoDB.

    The chunking layer prepares the documents. This function
    normalizes user_id and source_id into MongoDB ObjectIds so
    they are compatible with Atlas Vector Search filters.
    """

    if not chunk_documents:
        return []

    now = utc_now()
    documents: list[dict[str, Any]] = []

    for chunk in chunk_documents:
        user_id = chunk.get("user_id")
        source_id = chunk.get("source_id")

        if not user_id:
            raise ValueError(
                "Knowledge chunk user_id is required."
            )

        if not source_id:
            raise ValueError(
                "Knowledge chunk source_id is required."
            )

        document = dict(chunk)

        # ----------------------------------------------------
        # Normalize IDs
        # ----------------------------------------------------

        document["user_id"] = to_object_id(
            user_id
        )

        document["source_id"] = to_object_id(
            source_id
        )

        # ----------------------------------------------------
        # Ensure embedding field exists
        # ----------------------------------------------------

        if "embedding" not in document:
            document["embedding"] = None

        # ----------------------------------------------------
        # Timestamps
        # ----------------------------------------------------

        document.setdefault(
            "created_at",
            now,
        )

        document.setdefault(
            "updated_at",
            now,
        )

        documents.append(
            document
        )

    result = knowledge_chunks.insert_many(
        documents
    )

    return [
        str(inserted_id)
        for inserted_id in result.inserted_ids
    ]


# ============================================================
# Conversation persistence
# ============================================================

def create_conversation(user_id: str, title: str = "New conversation") -> dict[str, Any]:
    now = utc_now()
    result = conversations.insert_one({
        "user_id": user_id,
        "title": title.strip()[:120] or "New conversation",
        "messages": [],
        "created_at": now,
        "updated_at": now,
    })
    return get_conversation(str(result.inserted_id), user_id)  # type: ignore[return-value]


def list_conversations(user_id: str) -> list[dict[str, Any]]:
    return [serialize_conversation(item, include_messages=False) for item in conversations.find(
        {"user_id": user_id}
    ).sort("updated_at", DESCENDING)]


def get_conversation(conversation_id: str, user_id: str) -> Optional[dict[str, Any]]:
    document = conversations.find_one({"_id": to_object_id(conversation_id), "user_id": user_id})
    return serialize_conversation(document, include_messages=True) if document else None


def rename_conversation(conversation_id: str, user_id: str, title: str) -> Optional[dict[str, Any]]:
    document = conversations.find_one_and_update(
        {"_id": to_object_id(conversation_id), "user_id": user_id},
        {"$set": {"title": title.strip()[:120] or "New conversation"}},
        return_document=True,
    )
    return serialize_conversation(document, include_messages=False) if document else None


def delete_conversation(conversation_id: str, user_id: str) -> bool:
    return conversations.delete_one({"_id": to_object_id(conversation_id), "user_id": user_id}).deleted_count == 1


def append_conversation_messages(
    conversation_id: str, user_id: str, messages: list[dict[str, Any]], title: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    update: dict[str, Any] = {"$push": {"messages": {"$each": messages}}, "$set": {"updated_at": utc_now()}}
    if title:
        update["$set"]["title"] = title.strip()[:120]
    document = conversations.find_one_and_update(
        {"_id": to_object_id(conversation_id), "user_id": user_id}, update, return_document=True
    )
    return serialize_conversation(document, include_messages=True) if document else None


def serialize_conversation(document: dict[str, Any], include_messages: bool) -> dict[str, Any]:
    payload = {
        "id": str(document["_id"]), "title": document.get("title", "New conversation"),
        "created_at": document.get("created_at").isoformat() if document.get("created_at") else None,
        "updated_at": document.get("updated_at").isoformat() if document.get("updated_at") else None,
    }
    if include_messages:
        payload["messages"] = [
            {**message, "created_at": message.get("created_at").isoformat() if message.get("created_at") else None}
            for message in document.get("messages", [])
        ]
    return payload


# ============================================================
# Initialization
# ============================================================

init_db()
