import re
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException, status

from app.settings import get_settings

_API_URL = "https://api.unsplash.com"
_IMAGE_HOSTS = {"images.unsplash.com"}
_PAGE_HOSTS = {"unsplash.com", "www.unsplash.com"}
_API_HOSTS = {"api.unsplash.com"}


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Photo search unavailable",
    )


def _object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _unavailable()
    return value


def _text(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _unavailable()
    return value


def _photo_id(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value):
        raise _unavailable()
    return value


def _url(value: Any, hosts: set[str], *, path: str | None = None) -> str:
    text = _text(value)
    if any(ord(char) <= 32 or ord(char) == 127 for char in text):
        raise _unavailable()
    try:
        parsed = urlsplit(text)
    except ValueError:
        raise _unavailable() from None
    if (
        parsed.scheme != "https"
        or parsed.netloc.lower() not in hosts
        or not parsed.path.startswith("/")
        or (path is not None and (parsed.path != path or parsed.fragment))
    ):
        raise _unavailable()
    return text


def _photo(value: Any) -> dict[str, str]:
    photo = _object(value)
    urls = _object(photo.get("urls"))
    links = _object(photo.get("links"))
    user = _object(photo.get("user"))
    user_links = _object(user.get("links"))
    return {
        "id": _photo_id(photo.get("id")),
        "url": _url(urls.get("regular"), _IMAGE_HOSTS),
        "photographer_name": _text(user.get("name")),
        "photographer_url": _url(user_links.get("html"), _PAGE_HOSTS),
        "photo_url": _url(links.get("html"), _PAGE_HOSTS),
    }


def is_configured() -> bool:
    return bool(get_settings().UNSPLASH_ACCESS_KEY.strip())


async def _get(url: str, params: dict[str, str | int] | None = None) -> httpx.Response:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unsplash photo search is not configured",
        )
    key = get_settings().UNSPLASH_ACCESS_KEY
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            response = await client.get(
                url, params=params, headers={"Authorization": f"Client-ID {key}"}
            )
    except httpx.HTTPError, httpx.InvalidURL, ValueError:
        raise _unavailable() from None

    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS or (
        response.status_code == status.HTTP_403_FORBIDDEN
        and response.headers.get("X-Ratelimit-Remaining") == "0"
    ):
        retry_after = response.headers.get("Retry-After")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Photo search rate limited",
            headers={"Retry-After": retry_after} if retry_after else None,
        )
    if not response.is_success:
        raise _unavailable()
    return response


def _json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError, RecursionError:
        raise _unavailable() from None


async def search_photos(query: str, page: int) -> dict[str, Any]:
    response = await _get(
        f"{_API_URL}/search/photos",
        {
            "query": query,
            "page": page,
            "per_page": 12,
            "orientation": "landscape",
            "content_filter": "high",
        },
    )
    data = _object(_json(response))
    results = data.get("results")
    total_pages = data.get("total_pages")
    if (
        not isinstance(results, list)
        or not isinstance(total_pages, int)
        or isinstance(total_pages, bool)
        or total_pages < 0
    ):
        raise _unavailable()
    photos = []
    for result in results:
        photo = _photo(result)
        urls = _object(_object(result).get("urls"))
        photo["thumbnail_url"] = _url(urls.get("small"), _IMAGE_HOSTS)
        photos.append(photo)
    return {"results": photos, "has_more": page < total_pages and page < 100}


async def resolve_photo(photo_id: str) -> tuple[dict[str, str], str]:
    photo_id = _photo_id(photo_id)
    response = await _get(f"{_API_URL}/photos/{photo_id}")
    data = _object(_json(response))
    photo = _photo(data)
    if photo["id"] != photo_id:
        raise _unavailable()
    links = _object(data.get("links"))
    tracking_url = _url(
        links.get("download_location"),
        _API_HOSTS,
        path=f"/photos/{photo_id}/download",
    )
    return {"source": "unsplash", **photo}, tracking_url


async def track_download(photo_id: str, download_location: str) -> None:
    photo_id = _photo_id(photo_id)
    url = _url(download_location, _API_HOSTS, path=f"/photos/{photo_id}/download")
    await _get(url)
