import uuid
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import Message

from app.core.constants import LIST_ALREADY_EXISTS_ERROR, LIST_NOT_FOUND_ERROR
from app.crud import item as item_crud, list as list_crud
from app.db.database import get_db
from app.db.models import List as ListModel
from app.schemas.item import Item
from app.schemas.list import (
    List,
    ListCreate,
    ListSimple,
    ListUpdate,
)
from app.schemas.user import User
from app.services import cover_upload_service, unsplash_service
from app.services.auth import get_current_user
from app.services.list_cover_service import (
    cleanup_upload,
    parse_metadata,
    prepare_cover_update,
)
from app.services.list_service import (
    build_list_simple_response,
    get_items_best_first,
)

MAX_LIST_WRITE_BYTES = cover_upload_service.MAX_UPLOAD_BYTES + 1024 * 1024 + 64 * 1024


class _BoundedListWriteRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()
        if not self.methods or self.methods.isdisjoint({"POST", "PUT"}):
            return handler

        def check_size(size: int) -> None:
            if size > MAX_LIST_WRITE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="List request exceeds size limit",
                )

        async def bounded_handler(request: Request) -> Response:
            try:
                content_length = int(request.headers.get("content-length", "0"))
            except ValueError:
                content_length = 0
            check_size(content_length)
            receive = request.receive
            received = 0

            async def bounded_receive() -> Message:
                nonlocal received
                message = await receive()
                if message["type"] == "http.request":
                    received += len(message.get("body", b""))
                    check_size(received)
                return message

            return await handler(Request(request.scope, receive=bounded_receive))

        return bounded_handler


router = APIRouter(route_class=_BoundedListWriteRoute)


async def _require_multipart(request: Request) -> None:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
    if content_type.lower() != "multipart/form-data":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Multipart form data required",
        )
    form = await request.form()
    if (
        set(form.keys()) - {"metadata", "file"}
        or len(form.getlist("metadata")) != 1
        or len(form.getlist("file")) > 1
    ):
        raise HTTPException(status_code=422, detail="Invalid multipart fields")


@router.get("/", response_model=list[ListSimple])
async def read_lists(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Retrieve lists created by the current user.
    """
    lists_with_counts = await list_crud.get_by_user_with_stats(
        db, current_user.user_id, skip, limit
    )
    return [build_list_simple_response(row) for row in lists_with_counts]


@router.get("/cover-search", dependencies=[Depends(get_current_user)])
async def search_list_covers(
    query: str = Query(...), page: int = Query(default=1, ge=1, le=100)
) -> Any:
    query = query.strip()
    if not query or len(query) > 100:
        raise HTTPException(status_code=422, detail="Invalid photo search query")
    return await unsplash_service.search_photos(query, page)


@router.post("/", response_model=List)
async def create_list(
    request: Request,
    metadata: str = Form(...),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Create new list.
    """
    await _require_multipart(request)
    list_in = parse_metadata(metadata, ListCreate)
    existing = await list_crud.get_by_title_and_user(
        db, list_in.title, current_user.user_id
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=LIST_ALREADY_EXISTS_ERROR,
        )
    data = await prepare_cover_update(
        list_in.model_dump(mode="json", exclude_unset=True),
        file,
        None,
        current_user.user_id,
        creating=True,
    )

    list_obj = ListModel(
        list_id=uuid.uuid4(),
        **data,
        user_id=current_user.user_id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    list_obj = await list_crud.create(db, list_obj)

    return list_obj


@router.get("/{list_id}", response_model=List)
async def read_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get a specific list by ID with all its items.
    """
    list_obj = await list_crud.get_by_id_and_user(db, list_id, current_user.user_id)
    if not list_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )

    return list_obj


@router.get("/{list_id}/cover-photo/{photo_id}")
async def read_list_cover_photo(
    list_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    list_obj = await list_crud.get_by_id_and_user(db, list_id, current_user.user_id)
    photo = list_obj.cover_photo if list_obj else None
    if not photo or photo.get("source") != "upload" or photo.get("id") != str(photo_id):
        raise HTTPException(status_code=404, detail=LIST_NOT_FOUND_ERROR)
    content = await cover_upload_service.read_upload(current_user.user_id, photo_id)
    if content is None:
        raise HTTPException(status_code=404, detail=LIST_NOT_FOUND_ERROR)
    return Response(
        content=content,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/{list_id}/items", response_model=list[Item])
async def read_list_items(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get all items for a list, best first; unranked items last.
    """
    list_obj = await list_crud.get_by_id_and_user(db, list_id, current_user.user_id)
    if not list_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )

    items = await item_crud.get_by_list_id(db, list_id)
    if not items:
        return []

    return get_items_best_first(items)


@router.put("/{list_id}", response_model=List)
async def update_list(
    list_id: uuid.UUID,
    request: Request,
    metadata: str = Form(...),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Update a list.
    """
    await _require_multipart(request)
    list_in = parse_metadata(metadata, ListUpdate)
    list_obj = await list_crud.get_by_id_and_user(
        db, list_id, current_user.user_id, for_update=True
    )
    if not list_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )

    update_data = list_in.model_dump(mode="json", exclude_unset=True)
    if ("ranking_mode" in update_data and update_data["ranking_mode"] is None) or (
        "title" in update_data and update_data["title"] is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid list update",
        )
    previous_photo = list_obj.cover_photo
    update_data = await prepare_cover_update(
        update_data, file, previous_photo, current_user.user_id, creating=False
    )
    list_obj = await list_crud.update(db, list_obj, update_data)
    if previous_photo != list_obj.cover_photo:
        await cleanup_upload(current_user.user_id, previous_photo)

    return list_obj


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Delete a list.
    """
    list_obj = await list_crud.get_by_id_and_user(
        db, list_id, current_user.user_id, for_update=True
    )
    if not list_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )

    previous_photo = list_obj.cover_photo
    await list_crud.delete(db, list_obj)
    await cleanup_upload(current_user.user_id, previous_photo)
