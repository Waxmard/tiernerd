import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.constants import AI_NOT_CONFIGURED_ERROR, AI_UNAVAILABLE_ERROR
from app.schemas.ai import EmojiSuggestion, EmojiSuggestionRequest
from app.services.auth import get_current_user
from app.services.emoji_suggestion import suggest_emoji
from app.settings import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/emoji",
    response_model=EmojiSuggestion,
    dependencies=[Depends(get_current_user)],
)
async def suggest_emoji_for_name(payload: EmojiSuggestionRequest) -> Any:
    """
    Suggest one emoji for a list or item name.
    """
    if not get_settings().AI_PROJECT:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_NOT_CONFIGURED_ERROR,
        )

    try:
        emoji = await asyncio.to_thread(
            suggest_emoji, payload.name.casefold(), payload.kind
        )
    except Exception:
        logger.warning("Emoji suggestion failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AI_UNAVAILABLE_ERROR,
        ) from None

    return {"emoji": emoji}
