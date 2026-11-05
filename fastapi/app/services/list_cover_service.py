import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from pydantic import BaseModel, ValidationError

from app.services import cover_upload_service, unsplash_service

logger = logging.getLogger(__name__)


def parse_metadata[Model: BaseModel](metadata: str, model: type[Model]) -> Model:
    try:
        return model.model_validate_json(metadata)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid list metadata",
        ) from exc


async def prepare_cover_update(
    data: dict[str, Any],
    file: UploadFile | None,
    current_photo: dict[str, str] | None,
    user_id: UUID,
    *,
    creating: bool,
) -> dict[str, Any]:
    photo = data.get("cover_photo")
    cover = data.get("cover")
    if cover is not None and photo is not None:
        raise HTTPException(status_code=422, detail="Choose one list cover")
    if file is not None and (not photo or photo["source"] != "upload" or "id" in photo):
        raise HTTPException(status_code=422, detail="File requires a new upload")
    if "cover" not in data and "cover_photo" not in data:
        return data
    if photo is None:
        data["cover_photo"] = None
        if cover is None:
            data["cover"] = None
        return data
    if photo["source"] == "upload":
        if "id" in photo:
            if (
                creating
                or photo["id"] is None
                or not current_photo
                or current_photo.get("source") != "upload"
                or current_photo.get("id") != photo["id"]
            ):
                raise HTTPException(status_code=422, detail="Invalid upload selection")
            selected_photo = current_photo
        elif file is None:
            raise HTTPException(status_code=422, detail="Upload file is required")
        else:
            selected_photo = await cover_upload_service.create_upload(file, user_id)
    elif current_photo and (
        current_photo.get("source") == "unsplash"
        and current_photo.get("id") == photo["id"]
    ):
        selected_photo = current_photo
    else:
        selected_photo, download_location = await unsplash_service.resolve_photo(
            photo["id"]
        )
        await unsplash_service.track_download(photo["id"], download_location)

    data["cover"] = None
    data["cover_photo"] = selected_photo
    return data


async def cleanup_upload(user_id: UUID, photo: dict[str, str] | None) -> None:
    if not photo or photo.get("source") != "upload":
        return
    try:
        await cover_upload_service.delete_upload(user_id, photo)
    except Exception:
        logger.warning("Failed to clean up a list cover upload")
