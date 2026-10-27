import uuid
from datetime import UTC, datetime
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ITEM_NAME_ALREADY_EXISTS_ERROR, ITEM_NOT_FOUND_ERROR
from app.core.fractional_index import generate_key_between
from app.crud import comparison as comparison_crud, item as item_crud, list as list_crud
from app.db.database import get_db
from app.db.models import Item as ItemModel
from app.schemas.item import (
    ComparisonSession,
    ComparisonSessionStartRequest,
    Item,
    ItemCreate,
    ItemUpdate,
)
from app.schemas.user import User
from app.services.auth import get_current_user
from app.services.comparison_service import (
    ComparisonConflict,
    ComparisonItemNotFound,
    build_comparison_session_response,
    start_comparison,
)
from app.services.ranking import assign_scores_for_set, filter_ranked_items

router = APIRouter()


async def _raise_item_name_error(db: AsyncSession, error: IntegrityError) -> NoReturn:
    await db.rollback()
    if item_crud.is_duplicate_name_error(error):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ITEM_NAME_ALREADY_EXISTS_ERROR,
        ) from error
    raise error


@router.post("/", response_model=Item | ComparisonSession)
async def create_item(
    list_title: str,
    item_in: ItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Item | ComparisonSession:
    list_hint = await list_crud.get_by_title_and_user(
        db, list_title, current_user.user_id
    )
    if list_hint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found or does not belong to current user",
        )
    list_obj = await list_crud.get_by_id_and_user(
        db, list_hint.list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found or does not belong to current user",
        )

    name_key = item_in.name.casefold()
    if await item_crud.get_by_name_key(db, list_obj.list_id, name_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ITEM_NAME_ALREADY_EXISTS_ERROR,
        )

    now = datetime.now(UTC)
    item_obj = ItemModel(
        item_id=uuid.uuid4(),
        list_id=list_obj.list_id,
        name=item_in.name,
        description=item_in.description,
        image_url=str(item_in.image_url) if item_in.image_url else None,
        position=None,
        rating=None,
        tier_set=item_in.tier_set.value,
        created_at=now,
        updated_at=now,
    )
    set_items = await item_crud.get_by_list_and_tier_set(
        db, list_obj.list_id, item_in.tier_set.value
    )
    ranked_items = filter_ranked_items(set_items)
    list_obj.updated_at = now

    if not ranked_items:
        item_obj.position = generate_key_between(None, None)
        assign_scores_for_set([item_obj], item_in.tier_set.value)
        try:
            await item_crud.create(db, item_obj)
        except IntegrityError as error:
            await _raise_item_name_error(db, error)
        await db.commit()
        await db.refresh(item_obj)
        return Item.model_validate(item_obj)

    try:
        await item_crud.create(db, item_obj)
        session = await start_comparison(
            db, item_obj, item_in.tier_set.value, discard_on_cancel=True
        )
    except IntegrityError as error:
        await _raise_item_name_error(db, error)
    await db.commit()
    await db.refresh(session)
    try:
        return await build_comparison_session_response(db, session)
    except ComparisonItemNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        ) from None


@router.get(
    "/items/{item_id}/comparison-session", response_model=ComparisonSession | None
)
async def get_item_comparison_session(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession | None:
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    session = await comparison_crud.get_active_by_item(
        db, item_obj.item_id, populate_existing=True
    )
    if session is None:
        return None
    if session.list_id != item_obj.list_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    try:
        return await build_comparison_session_response(db, session)
    except ComparisonItemNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        ) from None


@router.post("/items/{item_id}/comparison-session", response_model=ComparisonSession)
async def start_item_comparison_session(
    item_id: uuid.UUID,
    request: ComparisonSessionStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession:
    list_id = await item_crud.get_list_id_by_id_with_ownership(
        db, item_id, current_user.user_id
    )
    if list_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    list_obj = await list_crud.get_by_id_and_user(
        db, list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id, populate_existing=True
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    active_session = await comparison_crud.get_active_by_item(
        db, item_id, populate_existing=True
    )
    if request.restart and active_session is not None and request.revision is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A revision is required to restart a ranking",
        )
    try:
        session = await start_comparison(
            db,
            item_obj,
            request.tier_set.value,
            restart=request.restart,
            revision=request.revision,
        )
        await db.commit()
        await db.refresh(session)
        return await build_comparison_session_response(db, session)
    except ComparisonConflict as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(error)
        ) from error
    except ComparisonItemNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        ) from None


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
        db, item_id, current_user.user_id
    )
    if item_obj is None:
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
    try:
        await item_crud.update(db, item_obj, update_data)
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
    list_id = await item_crud.get_list_id_by_id_with_ownership(
        db, item_id, current_user.user_id
    )
    if list_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    list_obj = await list_crud.get_by_id_and_user(
        db, list_id, current_user.user_id, for_update=True
    )
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )
    item_obj = await item_crud.get_by_id_with_ownership(
        db, item_id, current_user.user_id, populate_existing=True
    )
    if item_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ITEM_NOT_FOUND_ERROR
        )

    tier_set = item_obj.tier_set
    was_ranked = item_obj.position is not None
    await item_crud.delete(db, item_obj)
    if was_ranked and tier_set:
        await db.flush()
        items = await item_crud.get_ranked_by_list_and_tier_set(db, list_id, tier_set)
        assign_scores_for_set(items, tier_set)
    list_obj.updated_at = datetime.now(UTC)
    await db.commit()
