import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    COMPARISON_SESSION_NOT_FOUND_ERROR,
    ITEM_NOT_FOUND_ERROR,
    SESSION_NOT_FOUND_ERROR,
)
from app.crud import comparison as comparison_crud, list as list_crud
from app.db.database import get_db
from app.db.models import ComparisonSession as ComparisonSessionModel
from app.schemas.item import (
    ComparisonResultRequest,
    ComparisonRevisionRequest,
    ComparisonSession,
)
from app.schemas.user import User
from app.services.auth import get_current_user
from app.services.comparison_service import (
    ComparisonConflict,
    ComparisonItemNotFound,
    build_comparison_session_response,
    cancel_comparison,
    finalize_comparison,
    process_comparison_result,
    undo_comparison,
)

router = APIRouter()


def _parse_session_id(value: str, detail: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=detail
        ) from None


def _not_found(detail: str) -> NoReturn:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _conflict(error: ComparisonConflict) -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail=str(error)
    ) from error


async def _get_locked_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, detail: str
) -> ComparisonSessionModel:
    list_id = await comparison_crud.get_list_id(db, session_id)
    if list_id is None:
        _not_found(detail)
    list_obj = await list_crud.get_by_id_and_user(db, list_id, user_id, for_update=True)
    if list_obj is None:
        _not_found(detail)
    session = await comparison_crud.get_by_id(db, session_id, populate_existing=True)
    if session is None or session.list_id != list_id:
        _not_found(detail)
    return session


async def _response(
    db: AsyncSession, session_id: uuid.UUID, detail: str
) -> ComparisonSession:
    session = await comparison_crud.get_by_id(db, session_id, populate_existing=True)
    if session is None:
        _not_found(detail)
    try:
        return await build_comparison_session_response(db, session)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)


@router.get("/{session_id}/status", response_model=ComparisonSession)
async def get_comparison_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession:
    parsed_id = _parse_session_id(session_id, SESSION_NOT_FOUND_ERROR)
    session = await comparison_crud.get_by_id(db, parsed_id, populate_existing=True)
    if session is None:
        _not_found(SESSION_NOT_FOUND_ERROR)
    list_obj = await list_crud.get_by_id_and_user(
        db, session.list_id, current_user.user_id
    )
    if list_obj is None:
        _not_found(SESSION_NOT_FOUND_ERROR)
    try:
        return await build_comparison_session_response(db, session)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)


@router.post("/result", response_model=ComparisonSession)
async def submit_comparison_result(
    result: ComparisonResultRequest,
    session_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession:
    parsed_id = _parse_session_id(session_id, COMPARISON_SESSION_NOT_FOUND_ERROR)
    session = await _get_locked_session(
        db,
        parsed_id,
        current_user.user_id,
        COMPARISON_SESSION_NOT_FOUND_ERROR,
    )
    try:
        await process_comparison_result(db, session, result.result, result.revision)
        await db.commit()
    except ComparisonConflict as error:
        _conflict(error)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)
    return await _response(db, parsed_id, COMPARISON_SESSION_NOT_FOUND_ERROR)


@router.post("/{session_id}/undo", response_model=ComparisonSession)
async def undo_comparison_answer(
    session_id: str,
    request: ComparisonRevisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession:
    parsed_id = _parse_session_id(session_id, COMPARISON_SESSION_NOT_FOUND_ERROR)
    session = await _get_locked_session(
        db,
        parsed_id,
        current_user.user_id,
        COMPARISON_SESSION_NOT_FOUND_ERROR,
    )
    try:
        await undo_comparison(db, session, request.revision)
        await db.commit()
    except ComparisonConflict as error:
        _conflict(error)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)
    return await _response(db, parsed_id, COMPARISON_SESSION_NOT_FOUND_ERROR)


@router.post("/{session_id}/commit", response_model=ComparisonSession)
async def commit_comparison(
    session_id: str,
    request: ComparisonRevisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComparisonSession:
    parsed_id = _parse_session_id(session_id, COMPARISON_SESSION_NOT_FOUND_ERROR)
    session = await _get_locked_session(
        db,
        parsed_id,
        current_user.user_id,
        COMPARISON_SESSION_NOT_FOUND_ERROR,
    )
    try:
        await finalize_comparison(db, session, request.revision)
        await db.commit()
    except ComparisonConflict as error:
        _conflict(error)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)
    return await _response(db, parsed_id, COMPARISON_SESSION_NOT_FOUND_ERROR)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comparison(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    parsed_id = _parse_session_id(session_id, COMPARISON_SESSION_NOT_FOUND_ERROR)
    session = await _get_locked_session(
        db,
        parsed_id,
        current_user.user_id,
        COMPARISON_SESSION_NOT_FOUND_ERROR,
    )
    try:
        await cancel_comparison(db, session)
        await db.commit()
    except ComparisonConflict as error:
        _conflict(error)
    except ComparisonItemNotFound:
        _not_found(ITEM_NOT_FOUND_ERROR)
