"""
user_query.py
-------------
User query layer for the AI knowledge assistant.

Responsibilities:
- Accept and validate user questions.
- Store user queries in MongoDB.
- Keep queries isolated between users.
- Provide query retrieval and status management.
- Prepare the query for the downstream retrieval pipeline.

Architecture:

    Authenticated User
          ↓
    user_query.py
          ↓
    query record
          ↓
    query_chunks.py
          ↓
    vector_search.py
          ↓
    processing.py
          ↓
    response.py

Important:
- This file does NOT create embeddings.
- This file does NOT perform query chunking.
- This file does NOT perform vector search.
- This file does NOT generate AI responses.
- Authentication is handled by auth.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pymongo import ASCENDING, DESCENDING
from pymongo.collection import Collection

from database import db, to_object_id


# ============================================================
# Collection
# ============================================================

user_queries: Collection = db["user_queries"]


# ============================================================
# Constants
# ============================================================

QUERY_STATUS_RECEIVED = "received"
QUERY_STATUS_PROCESSING = "processing"
QUERY_STATUS_COMPLETED = "completed"
QUERY_STATUS_FAILED = "failed"


ALLOWED_QUERY_STATUSES = {
    QUERY_STATUS_RECEIVED,
    QUERY_STATUS_PROCESSING,
    QUERY_STATUS_COMPLETED,
    QUERY_STATUS_FAILED,
}


# ============================================================
# Utility
# ============================================================

def utc_now() -> datetime:
    """
    Return the current UTC time.
    """

    return datetime.now(timezone.utc)


# ============================================================
# Database Initialization
# ============================================================

def init_query_db() -> None:
    """
    Create indexes required by the user query collection.
    """

    # --------------------------------------------------------
    # User query history
    # --------------------------------------------------------

    user_queries.create_index(
        [
            ("user_id", ASCENDING),
            ("created_at", DESCENDING),
        ]
    )

    # --------------------------------------------------------
    # Query status
    # --------------------------------------------------------

    user_queries.create_index(
        [
            ("user_id", ASCENDING),
            ("status", ASCENDING),
        ]
    )


# ============================================================
# Validate Query
# ============================================================

def validate_query(
    query: str,
) -> str:
    """
    Validate and normalize a user's question.

    Returns the cleaned query.

    Raises:
        ValueError:
            If the query is empty or excessively long.
    """

    if not isinstance(query, str):
        raise ValueError(
            "Query must be a string."
        )

    query = query.strip()

    if not query:
        raise ValueError(
            "Query cannot be empty."
        )

    # --------------------------------------------------------
    # Prevent accidentally enormous requests.
    #
    # This is a safety/application limit, not an LLM limit.
    # --------------------------------------------------------

    if len(query) > 20_000:
        raise ValueError(
            "Query is too long. "
            "Please reduce the question to 20,000 characters "
            "or fewer."
        )

    return query


# ============================================================
# Create Query
# ============================================================

def create_query(
    user_id: str,
    query: str,
) -> str:
    """
    Store a new user query.

    Returns:
        MongoDB query ID as a string.
    """

    query = validate_query(
        query
    )

    user_object_id = to_object_id(
        user_id
    )

    now = utc_now()

    document = {
        "user_id": user_object_id,
        "query": query,
        "status": QUERY_STATUS_RECEIVED,
        "created_at": now,
        "updated_at": now,
    }

    result = user_queries.insert_one(
        document
    )

    return str(
        result.inserted_id
    )


# ============================================================
# Get Query
# ============================================================

def get_query(
    query_id: str,
    user_id: str,
) -> Optional[dict[str, Any]]:
    """
    Retrieve a query belonging to a specific user.

    User isolation is enforced by including user_id in the
    MongoDB query.
    """

    query = user_queries.find_one(
        {
            "_id": to_object_id(
                query_id
            ),
            "user_id": to_object_id(
                user_id
            ),
        }
    )

    if query is None:
        return None

    return serialize_query(
        query
    )


# ============================================================
# Update Query Status
# ============================================================

def update_query_status(
    query_id: str,
    user_id: str,
    status: str,
) -> bool:
    """
    Update the processing status of a user's query.
    """

    status = status.strip().lower()

    if status not in ALLOWED_QUERY_STATUSES:
        raise ValueError(
            "Invalid query status. "
            f"Allowed statuses: "
            f"{sorted(ALLOWED_QUERY_STATUSES)}"
        )

    result = user_queries.update_one(
        {
            "_id": to_object_id(
                query_id
            ),
            "user_id": to_object_id(
                user_id
            ),
        },
        {
            "$set": {
                "status": status,
                "updated_at": utc_now(),
            }
        },
    )

    return result.modified_count > 0


# ============================================================
# Mark Query Processing
# ============================================================

def mark_query_processing(
    query_id: str,
    user_id: str,
) -> bool:
    """
    Mark a query as currently being processed.
    """

    return update_query_status(
        query_id=query_id,
        user_id=user_id,
        status=QUERY_STATUS_PROCESSING,
    )


# ============================================================
# Mark Query Completed
# ============================================================

def mark_query_completed(
    query_id: str,
    user_id: str,
) -> bool:
    """
    Mark a query as successfully completed.
    """

    return update_query_status(
        query_id=query_id,
        user_id=user_id,
        status=QUERY_STATUS_COMPLETED,
    )


# ============================================================
# Mark Query Failed
# ============================================================

def mark_query_failed(
    query_id: str,
    user_id: str,
) -> bool:
    """
    Mark a query as failed.
    """

    return update_query_status(
        query_id=query_id,
        user_id=user_id,
        status=QUERY_STATUS_FAILED,
    )


# ============================================================
# Get User Query History
# ============================================================

def get_user_queries(
    user_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Return recent queries belonging to a specific user.
    """

    limit = max(
        1,
        min(limit, 500),
    )

    queries = user_queries.find(
        {
            "user_id": to_object_id(
                user_id
            ),
        }
    ).sort(
        "created_at",
        DESCENDING,
    ).limit(limit)

    return [
        serialize_query(query)
        for query in queries
    ]


# ============================================================
# Delete Query
# ============================================================

def delete_query(
    query_id: str,
    user_id: str,
) -> bool:
    """
    Delete a user's query.

    Only the owner of the query can delete it.
    """

    result = user_queries.delete_one(
        {
            "_id": to_object_id(
                query_id
            ),
            "user_id": to_object_id(
                user_id
            ),
        }
    )

    return result.deleted_count > 0


# ============================================================
# Delete User Queries
# ============================================================

def delete_user_queries(
    user_id: str,
) -> int:
    """
    Delete all queries belonging to a specific user.

    Returns:
        Number of deleted queries.
    """

    result = user_queries.delete_many(
        {
            "user_id": to_object_id(
                user_id
            ),
        }
    )

    return result.deleted_count


# ============================================================
# Query Statistics
# ============================================================

def get_query_statistics(
    user_id: str,
) -> dict[str, int]:
    """
    Return basic query statistics for a user.
    """

    user_object_id = to_object_id(
        user_id
    )

    total = user_queries.count_documents(
        {
            "user_id": user_object_id,
        }
    )

    received = user_queries.count_documents(
        {
            "user_id": user_object_id,
            "status": QUERY_STATUS_RECEIVED,
        }
    )

    processing = user_queries.count_documents(
        {
            "user_id": user_object_id,
            "status": QUERY_STATUS_PROCESSING,
        }
    )

    completed = user_queries.count_documents(
        {
            "user_id": user_object_id,
            "status": QUERY_STATUS_COMPLETED,
        }
    )

    failed = user_queries.count_documents(
        {
            "user_id": user_object_id,
            "status": QUERY_STATUS_FAILED,
        }
    )

    return {
        "total": total,
        "received": received,
        "processing": processing,
        "completed": completed,
        "failed": failed,
    }


# ============================================================
# Serialization
# ============================================================

def serialize_query(
    query: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert a MongoDB query document into a JSON-friendly
    dictionary.
    """

    return {
        "id": str(
            query["_id"]
        ),
        "user_id": str(
            query["user_id"]
        ),
        "query": query["query"],
        "status": query.get(
            "status",
            QUERY_STATUS_RECEIVED,
        ),
        "created_at": (
            query["created_at"].isoformat()
            if query.get("created_at")
            else None
        ),
        "updated_at": (
            query["updated_at"].isoformat()
            if query.get("updated_at")
            else None
        ),
    }


# ============================================================
# Initialize
# ============================================================

init_query_db()