"""
upload.py
---------

File upload and initial knowledge-processing layer.

Responsibilities:
- Validate uploaded files.
- Store files in the authenticated user's directory.
- Create the MongoDB knowledge-source record.
- Extract and chunk the uploaded document.
- Update processing status.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from config import settings
from database import (
    create_knowledge_source,
    knowledge_sources,
    to_object_id,
)
from chunks import process_knowledge_source


# ============================================================
# Supported File Types
# ============================================================

ALLOWED_FILE_TYPES: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".xls": "xls",
    ".pptx": "pptx",
    ".txt": "txt",
    ".md": "markdown",
    ".csv": "csv",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
}


# ============================================================
# Validate File
# ============================================================

def validate_file(
    file: UploadFile,
) -> tuple[str, int]:
    """
    Validate filename, extension, and declared file size.

    Returns:
        tuple[file_type, file_size]
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="A filename is required.",
        )

    filename = Path(file.filename).name

    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_FILE_TYPES:
        if not settings.ALLOW_UNKNOWN_FILE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type: "
                    f"{extension or 'unknown'}."
                ),
            )

    file_type = ALLOWED_FILE_TYPES.get(
        extension,
        "unknown",
    )

    # --------------------------------------------------------
    # Determine file size
    # --------------------------------------------------------

    try:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to determine "
                "uploaded file size."
            ),
        ) from exc

    max_size = (
        settings.MAX_FILE_SIZE_MB
        * 1024
        * 1024
    )

    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=(
                "File is too large. "
                f"Maximum allowed size is "
                f"{settings.MAX_FILE_SIZE_MB} MB."
            ),
        )

    return file_type, file_size


# ============================================================
# Safe Filename
# ============================================================

def create_safe_filename(
    filename: str,
) -> str:
    """
    Prevent directory traversal by keeping only
    the actual filename.
    """

    safe_name = Path(filename).name.strip()

    if not safe_name:
        raise ValueError(
            "Filename cannot be empty."
        )

    return safe_name


# ============================================================
# User Upload Directory
# ============================================================

def get_user_upload_directory(
    user_id: str,
) -> Path:
    """
    Return and create the authenticated user's
    private upload directory.
    """

    if not user_id:
        raise ValueError(
            "user_id is required."
        )

    directory = (
        settings.UPLOAD_DIR
        / user_id
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    return directory


# ============================================================
# Storage Path
# ============================================================

def create_storage_path(
    user_id: str,
    filename: str,
) -> Path:
    """
    Create a unique filesystem path for an upload.
    """

    directory = get_user_upload_directory(
        user_id
    )

    safe_filename = create_safe_filename(
        filename
    )

    path = directory / safe_filename

    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix

    counter = 1

    while True:
        candidate = (
            directory
            / f"{stem}_{counter}{suffix}"
        )

        if not candidate.exists():
            return candidate

        counter += 1


# ============================================================
# Save File
# ============================================================

async def save_uploaded_file(
    file: UploadFile,
    storage_path: Path,
) -> int:
    """
    Stream the uploaded file to disk.

    Returns:
        Number of bytes actually written.
    """

    total_bytes = 0

    try:
        with storage_path.open("wb") as output_file:

            while True:
                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                output_file.write(chunk)

                total_bytes += len(chunk)

    except Exception:
        storage_path.unlink(
            missing_ok=True
        )
        raise

    finally:
        await file.close()

    return total_bytes


# ============================================================
# Upload File
# ============================================================

async def upload_file(
    file: UploadFile,
    user_id: str,
) -> dict[str, Any]:
    """
    Complete upload pipeline:

        Upload
          ↓
        Validate
          ↓
        Save to disk
          ↓
        Create knowledge source
          ↓
        Extract/chunk document
          ↓
        Update status
    """

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated user "
                "is required."
            ),
        )

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    file_type, _ = validate_file(file)

    filename = create_safe_filename(
        file.filename or ""
    )

    # --------------------------------------------------------
    # Create storage path
    # --------------------------------------------------------

    storage_path = create_storage_path(
        user_id=user_id,
        filename=filename,
    )

    # --------------------------------------------------------
    # Save physical file
    # --------------------------------------------------------

    actual_size = await save_uploaded_file(
        file=file,
        storage_path=storage_path,
    )

    max_size = (
        settings.MAX_FILE_SIZE_MB
        * 1024
        * 1024
    )

    if actual_size > max_size:
        storage_path.unlink(
            missing_ok=True
        )

        raise HTTPException(
            status_code=413,
            detail=(
                "File is too large. "
                f"Maximum allowed size is "
                f"{settings.MAX_FILE_SIZE_MB} MB."
            ),
        )

    # --------------------------------------------------------
    # Create MongoDB knowledge-source record
    # --------------------------------------------------------

    try:
        source_id = create_knowledge_source(
            user_id=user_id,
            filename=filename,
            file_path=str(storage_path),
            file_type=file_type,
            file_size=actual_size,
        )

    except Exception:
        storage_path.unlink(
            missing_ok=True
        )
        raise

    # --------------------------------------------------------
    # Process document
    #
    # This extracts text and creates chunks.
    # Embedding generation/vector indexing is handled
    # elsewhere in the RAG pipeline.
    # --------------------------------------------------------

    processing_status = "processing"

    try:
        process_knowledge_source(
            source_id=source_id,
            user_id=user_id,
        )

        # NOTE:
        # knowledge_sources documents store MongoDB's native
        # ObjectId as "_id". source_id here is the string form
        # returned by create_knowledge_source(), so it must be
        # converted back with to_object_id() before it can be
        # used to match "_id" in a query/update.

        knowledge_sources.update_one(
            {
                "_id": to_object_id(source_id),
                "user_id": user_id,
            },
            {
                "$set": {
                    "status": "ready",
                    "processing_error": None,
                }
            },
        )

        processing_status = "ready"

    except Exception as exc:

        knowledge_sources.update_one(
            {
                "_id": to_object_id(source_id),
                "user_id": user_id,
            },
            {
                "$set": {
                    "status": "failed",
                    "processing_error": str(exc),
                }
            },
        )

        # Keep the physical file.
        # This allows the processing pipeline to be
        # retried later without requiring another upload.

        processing_status = "failed"

    # --------------------------------------------------------
    # Return upload information
    # --------------------------------------------------------

    return {
        "source_id": str(source_id),
        "user_id": user_id,
        "filename": filename,
        "file_type": file_type,
        "file_size": actual_size,
        "status": processing_status,
        "storage_path": str(storage_path),
    }