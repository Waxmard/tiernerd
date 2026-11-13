import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AI_NOT_CONFIGURED_ERROR,
    AI_UNAVAILABLE_ERROR,
    LIST_NOT_FOUND_ERROR,
)
from app.crud import item as item_crud, list as list_crud
from app.db.database import get_db
from app.schemas.ai import EmojiFillResult, EmojiSuggestionRequest, EmojiSuggestions
from app.schemas.user import User
from app.services.auth import get_current_user
from app.services.emoji_suggestion import suggest_emojis
from app.settings import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

EMOJI_FILL_BATCH = 40
EMOJI_FILL_DEADLINE = 7
_fill_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="emoji-fill")


def _pick_item_emoji(name: str, description: str, list_title: str) -> str:
    return suggest_emojis(name.casefold(), "item", description, list_title)[0]


@router.post(
    "/emoji",
    response_model=EmojiSuggestions,
    dependencies=[Depends(get_current_user)],
)
async def suggest_emoji_for_name(payload: EmojiSuggestionRequest) -> Any:
    """
    Suggest up to three emoji for a list or item name.
    """
    if not get_settings().AI_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_NOT_CONFIGURED_ERROR,
        )

    try:
        emojis = await asyncio.to_thread(
            suggest_emojis,
            payload.name.casefold(),
            payload.kind,
            payload.description,
            payload.list_title,
        )
    except Exception:
        logger.warning("Emoji suggestion failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_UNAVAILABLE_ERROR,
        ) from None

    return {"emojis": list(emojis)}


@router.post("/lists/{list_id}/item-emojis", response_model=EmojiFillResult)
async def fill_item_emojis(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Give an AI-picked emoji to up to forty items in a list that have none.
    """
    if not get_settings().AI_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_NOT_CONFIGURED_ERROR,
        )
    list_obj = await list_crud.get_by_id_and_user(db, list_id, current_user.user_id)
    if list_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
        )
    list_title = list_obj.title.strip()
    missing = [
        (item.item_id, item.name, (item.description or "")[:500].strip())
        for item in await item_crud.get_by_list_id(db, list_id)
        if item.icon is None
    ]
    await db.commit()
    batch = missing[:EMOJI_FILL_BATCH]
    if not batch:
        return {"updated": 0, "remaining": 0}

    loop = asyncio.get_running_loop()
    futures = [
        loop.run_in_executor(
            _fill_executor, _pick_item_emoji, name, description, list_title
        )
        for _, name, description in batch
    ]
    done, _ = await asyncio.wait(futures, timeout=EMOJI_FILL_DEADLINE)
    picks = {
        item_id: future.result()
        for (item_id, _, _), future in zip(batch, futures, strict=True)
        if future in done and future.exception() is None
    }
    if len(picks) < len(batch):
        logger.warning(
            "Emoji fill skipped %d of %d items", len(batch) - len(picks), len(batch)
        )

    updated = 0
    if picks:
        locked = await list_crud.get_by_id_and_user(
            db, list_id, current_user.user_id, for_update=True
        )
        if locked is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=LIST_NOT_FOUND_ERROR
            )
        now = datetime.now(UTC)
        for item in await item_crud.get_by_list_id(db, list_id):
            emoji = picks.get(item.item_id)
            if emoji is not None and item.icon is None:
                item.icon = emoji
                item.updated_at = now
                updated += 1
        if updated:
            locked.updated_at = now
    return {"updated": updated, "remaining": len(missing) - updated}
