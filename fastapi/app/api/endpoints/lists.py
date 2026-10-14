import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import LIST_ALREADY_EXISTS_ERROR, LIST_NOT_FOUND_ERROR
from app.crud import item as item_crud, list as list_crud
from app.db.database import get_db
from app.db.models import List as ListModel
from app.schemas.item import Item
from app.schemas.list import List, ListSimple, ListUpdate
from app.schemas.user import User
from app.services.auth import get_current_user
from app.services.list_service import (
    build_list_response,
    build_list_simple_response,
    get_items_best_first,
)

router = APIRouter()


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


@router.post("/", response_model=List)
async def create_list(
    name: str,
    description: str,
    color: Literal["blue", "teal", "amber", "pink"] | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Create new list.
    """
    # Check if list with same name already exists for this user
    existing = await list_crud.get_by_title_and_user(db, name, current_user.user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=LIST_ALREADY_EXISTS_ERROR,
        )

    list_obj = ListModel(
        list_id=uuid.uuid4(),
        title=name,
        user_id=current_user.user_id,
        description=description,
        color=color,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    list_obj = await list_crud.create(db, list_obj)

    return build_list_response(list_obj)


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

    return build_list_response(list_obj)


@router.get("/{list_id}/items", response_model=list[Item])
async def read_list_items(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get all items for a list, best first; unranked items last.
    """
    # Verify list exists and belongs to current user
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
    list_in: ListUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Update a list.
    """
    list_obj = await list_crud.get_by_id_and_user(db, list_id, current_user.user_id)
    if not list_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )

    update_data = list_in.model_dump(exclude_unset=True)
    list_obj = await list_crud.update(db, list_obj, update_data)

    # Get items to include in response
    items = await item_crud.get_by_list_id(db, list_id)

    # Format items
    items_data = [
        {
            "item_id": item.item_id,
            "list_id": item.list_id,
            "name": item.name,
            "description": item.description,
            "image_url": item.image_url,
            "position": getattr(item, "position", None),
            "rating": item.rating,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in items
    ]

    return build_list_response(list_obj, items_data)


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

    await list_crud.delete(db, list_obj)
