import asyncio
import struct
import warnings
from io import BytesIO
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status
from google.api_core.exceptions import NotFound
from google.cloud import storage
from PIL import Image, ImageOps

from app.settings import get_settings

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_IMAGE_EDGE = 1600
READ_CHUNK_BYTES = 1024 * 1024
STORAGE_TIMEOUT = 30
SUPPORTED_FORMATS = ("JPEG", "PNG", "WEBP")
UPLOAD_UNAVAILABLE = "Photo uploads unavailable"


def object_key(user_id: UUID, photo_id: UUID) -> str:
    return f"covers/{UUID(str(user_id))}/{UUID(str(photo_id))}.jpg"


def _normalize_image(data: BytesIO) -> bytes:
    pixel_limit = min(MAX_IMAGE_PIXELS, Image.MAX_IMAGE_PIXELS or MAX_IMAGE_PIXELS)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            data.seek(0)
            with Image.open(data, formats=SUPPORTED_FORMATS) as image:
                animated = getattr(image, "is_animated", False) or (
                    getattr(image, "n_frames", 1) > 1
                )
                if image.width * image.height > pixel_limit or animated:
                    raise ValueError("Unsupported image")
                image.verify()

            data.seek(0)
            with Image.open(data, formats=SUPPORTED_FORMATS) as image:
                ImageOps.exif_transpose(image, in_place=True)
                image.thumbnail(
                    (MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS
                )
                converted = image.convert("RGB")
            converted.info.clear()
            output = BytesIO()
            converted.save(output, format="JPEG", quality=85)
            return output.getvalue()
    except (
        EOFError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        IndexError,
        KeyError,
        OSError,
        OverflowError,
        SyntaxError,
        TypeError,
        ValueError,
        struct.error,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid image",
        ) from None


def _blob(user_id: UUID, photo_id: UUID) -> storage.Blob:
    bucket_name = get_settings().COVER_UPLOAD_BUCKET
    if not bucket_name:
        raise ValueError("Cover upload bucket is not configured")
    return storage.Client().bucket(bucket_name).blob(object_key(user_id, photo_id))


def _upload(user_id: UUID, photo_id: UUID, data: bytes) -> None:
    blob = _blob(user_id, photo_id)
    blob.cache_control = "private, no-store"
    blob.upload_from_string(
        data,
        content_type="image/jpeg",
        if_generation_match=0,
        timeout=STORAGE_TIMEOUT,
        retry=None,
    )


def _download(user_id: UUID, photo_id: UUID) -> bytes:
    data: bytes = _blob(user_id, photo_id).download_as_bytes(
        timeout=STORAGE_TIMEOUT, retry=None
    )
    return data


def _delete(user_id: UUID, photo_id: UUID) -> None:
    _blob(user_id, photo_id).delete(timeout=STORAGE_TIMEOUT, retry=None)


async def create_upload(file: UploadFile, user_id: UUID) -> UUID:
    data = BytesIO()
    while chunk := await file.read(READ_CHUNK_BYTES):
        if data.tell() + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Image exceeds 10 MiB",
            )
        data.write(chunk)

    normalized = await asyncio.to_thread(_normalize_image, data)
    photo_id = uuid4()
    try:
        await asyncio.to_thread(_upload, user_id, photo_id, normalized)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=UPLOAD_UNAVAILABLE,
        ) from None
    return photo_id


async def read_upload(user_id: UUID, photo_id: UUID) -> bytes | None:
    try:
        return await asyncio.to_thread(_download, user_id, photo_id)
    except NotFound:
        return None
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=UPLOAD_UNAVAILABLE,
        ) from None


async def delete_upload(user_id: UUID, photo_id: UUID) -> None:
    try:
        await asyncio.to_thread(_delete, user_id, photo_id)
    except NotFound:
        return
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=UPLOAD_UNAVAILABLE,
        ) from None
