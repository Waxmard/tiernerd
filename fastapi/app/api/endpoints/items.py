import uuid
from datetime import UTC, datetime
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ITEM_NAME_ALREADY_EXISTS_ERROR, ITEM_NOT_FOUND_ERROR
from app.core.fractional_index import generate_key_between
from app.crud import item as item_crud, list as list_crud
from app.db.database import get_db
from app.db.models import Item as ItemModel
from app.schemas.item import Item, ItemCreate, ItemUpdate
from app.schemas.user import User
from app.services.auth import get_current_user
from app.services.ranking import (
    assign_scores,
    filter_ranked_items,
    manual_rating_bounds_error,
)

router = APIRouter()


async def _raise_item_name_error(db: AsyncSession, error: IntegrityError) -> NoReturn:
    await db.rollback()
    if item_crud.is_duplicate_name_error(error):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ITEM_NAME_ALREADY_EXISTS_ERROR,
        ) from error
    raise error


@router.post("/", response_model=Item)
async def create_item(
    list_id: uuid.UUID,
    item_in: ItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Item:
    list_obj = await list_crud.get_by_id_and_user(
        db, list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found or does not belong to current user",
        )

    if item_in.item_id is not None:
        existing = await item_crud.get_by_id(db, item_in.item_id)
        if existing is not None:
            if existing.list_id == list_obj.list_id:
                return Item.model_validate(existing)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Item ID already in use",
            )

    name_key = item_in.name.casefold()
    if await item_crud.get_by_name_key(db, list_obj.list_id, name_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ITEM_NAME_ALREADY_EXISTS_ERROR,
        )

    now = datetime.now(UTC)
    item_obj = ItemModel(
        item_id=item_in.item_id or uuid.uuid4(),
        list_id=list_obj.list_id,
        name=item_in.name,
        description=item_in.description,
        image_url=str(item_in.image_url) if item_in.image_url else None,
        icon=item_in.icon,
        position=None,
        rating=None,
        manual_rating=None,
        created_at=now,
        updated_at=now,
    )
    list_obj.updated_at = now

    if not filter_ranked_items(await item_crud.get_by_list_id(db, list_obj.list_id)):
        item_obj.position = generate_key_between(None, None)
        assign_scores([item_obj])

    try:
        await item_crud.create(db, item_obj)
    except IntegrityError as error:
        await _raise_item_name_error(db, error)
    await db.commit()
    await db.refresh(item_obj)
    return Item.model_validate(item_obj)


@router.get("/items/{item_id}", response_model=Item)
async def read_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Item:
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    return Item.model_validate(item_obj)


@router.put("/items/{item_id}", response_model=Item)
async def update_item(
    item_id: uuid.UUID,
    item_in: ItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Item:
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id, populate_existing=True
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    list_obj = await list_crud.get_by_id_and_user(
        db, item_obj.list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    update_data = item_in.model_dump(exclude_unset=True)
    if "name" in update_data:
        duplicate = await item_crud.get_by_name_key(
            db,
            item_obj.list_id,
            update_data["name"].casefold(),
            exclude_id=item_obj.item_id,
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ITEM_NAME_ALREADY_EXISTS_ERROR,
            )
    ranked_asc: list[ItemModel] = []
    if "manual_rating" in update_data:
        if item_obj.position is None and update_data["manual_rating"] is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Rank this item before setting a manual score.",
            )
        if item_obj.position is not None:
            items = await item_crud.get_by_list_id(db, list_obj.list_id)
            ranked_asc = sorted(
                filter_ranked_items(items), key=lambda x: x.position or ""
            )
            best_first = list(reversed(ranked_asc))
            if update_data["manual_rating"] is not None:
                error = manual_rating_bounds_error(
                    best_first, item_obj.item_id, update_data["manual_rating"]
                )
                if error is not None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=error,
                    )
    if update_data:
        list_obj.updated_at = datetime.now(UTC)
    try:
        await item_crud.update(db, item_obj, update_data)
        if "manual_rating" in update_data and item_obj.position is not None:
            assign_scores(ranked_asc)
            await db.flush()
    except IntegrityError as error:
        await _raise_item_name_error(db, error)
    await db.commit()
    await db.refresh(item_obj)
    return Item.model_validate(item_obj)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id, populate_existing=True
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    list_obj = await list_crud.get_by_id_and_user(
        db, item_obj.list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )

    was_ranked = item_obj.position is not None
    await item_crud.delete(db, item_obj)
    if was_ranked:
        await db.flush()
        items = await item_crud.get_by_list_id(db, list_obj.list_id)
        assign_scores(
            sorted(filter_ranked_items(items), key=lambda item: item.position or "")
        )
    list_obj.updated_at = datetime.now(UTC)
    await db.commit()
