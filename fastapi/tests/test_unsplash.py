from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.services import unsplash_service


@pytest.fixture
def mock_provider(monkeypatch):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        unsplash_service,
        "get_settings",
        lambda: SimpleNamespace(UNSPLASH_ACCESS_KEY="test-access-key"),
    )

    def install(handler):
        def client(**kwargs):
            return client_class(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(unsplash_service.httpx, "AsyncClient", client)

    return install


def photo_data():
    return {
        "id": "photo_1-A",
        "urls": {
            "regular": "https://images.unsplash.com/regular?w=1080&fit=crop",
            "small": "https://images.unsplash.com/small?w=400&fit=crop",
        },
        "links": {
            "html": "https://www.unsplash.com/photos/photo_1-A?utm_source=example",
            "download_location": (
                "https://api.unsplash.com/photos/photo_1-A/download"
                "?ixid=a%2Bb&other=a%2Fb"
            ),
        },
        "user": {
            "name": "A Photographer",
            "links": {"html": "https://unsplash.com/@photographer"},
        },
        "description": "Not returned",
    }


def expected_photo():
    return {
        "id": "photo_1-A",
        "url": "https://images.unsplash.com/regular?w=1080&fit=crop",
        "photographer_name": "A Photographer",
        "photographer_url": "https://unsplash.com/@photographer",
        "photo_url": "https://www.unsplash.com/photos/photo_1-A?utm_source=example",
    }


@pytest.mark.parametrize(
    ("page", "total_pages", "has_more"),
    [(1, 2, True), (2, 2, False), (3, 2, False), (99, 200, True), (100, 200, False)],
)
async def test_search_canonical_results_pagination_and_request(
    mock_provider, page, total_pages, has_more
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200, json={"total_pages": total_pages, "results": [photo_data()]}
        )

    mock_provider(handler)
    result = await unsplash_service.search_photos("city lights", page)

    assert result == {
        "results": [
            {
                **expected_photo(),
                "thumbnail_url": "https://images.unsplash.com/small?w=400&fit=crop",
            }
        ],
        "has_more": has_more,
    }
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "GET"
    assert request.url.host == "api.unsplash.com"
    assert request.url.path == "/search/photos"
    assert dict(request.url.params) == {
        "query": "city lights",
        "page": str(page),
        "per_page": "12",
        "orientation": "landscape",
        "content_filter": "high",
    }
    assert request.headers["Authorization"] == "Client-ID test-access-key"
    assert "test-access-key" not in str(request.url)
    assert all(value == 10.0 for value in request.extensions["timeout"].values())


async def test_resolve_and_track_use_canonical_data_and_preserve_query(mock_provider):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path.endswith("/download"):
            return httpx.Response(200, json={"url": "not used"})
        return httpx.Response(200, json=photo_data())

    mock_provider(handler)
    photo, tracking_url = await unsplash_service.resolve_photo("photo_1-A")
    await unsplash_service.track_download("photo_1-A", tracking_url)

    assert photo == {"source": "unsplash", **expected_photo()}
    assert tracking_url == photo_data()["links"]["download_location"]
    assert [request.url.path for request in requests] == [
        "/photos/photo_1-A",
        "/photos/photo_1-A/download",
    ]
    assert requests[1].url.raw_path == (
        b"/photos/photo_1-A/download?ixid=a%2Bb&other=a%2Fb"
    )
    assert all(
        request.headers["Authorization"] == "Client-ID test-access-key"
        for request in requests
    )


@pytest.mark.parametrize(
    ("path", "bad_value"),
    [
        (("id",), "../secret"),
        (("id",), 42),
        (("urls", "regular"), "http://images.unsplash.com/image"),
        (("urls", "regular"), "https://images.unsplash.com.evil.test/image"),
        (("urls", "regular"), "https://user:pass@images.unsplash.com/image"),
        (("urls", "regular"), "https://images.unsplash.com:8443/image"),
        (("urls", "small"), "https://images.unsplash.com@evil.test/image"),
        (("urls", "small"), "https://images.unsplash.com:443/image"),
        (("user", "name"), "  "),
        (("user", "links", "html"), "https://unsplash.com.evil.test/@user"),
        (("user", "links", "html"), "https://user:pass@unsplash.com/@user"),
        (("links", "html"), "https://unsplash.com:8443/photos/photo_1-A"),
        (("links", "html"), "http://unsplash.com/photos/photo_1-A"),
        (("urls",), []),
    ],
)
async def test_search_rejects_invalid_provider_fields(mock_provider, path, bad_value):
    data = photo_data()
    field = data
    for key in path[:-1]:
        field = field[key]
    field[path[-1]] = bad_value
    mock_provider(
        lambda request: httpx.Response(200, json={"results": [data], "total_pages": 1})
    )

    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert "secret" not in exc.value.detail


@pytest.mark.parametrize(
    "location",
    [
        "http://api.unsplash.com/photos/photo_1-A/download",
        "https://api.unsplash.com.evil.test/photos/photo_1-A/download",
        "https://api.unsplash.com@evil.test/photos/photo_1-A/download",
        "https://user:pass@api.unsplash.com/photos/photo_1-A/download",
        "https://api.unsplash.com:8443/photos/photo_1-A/download",
        "https://api.unsplash.com:443/photos/photo_1-A/download",
        "https://api.unsplash.com/photos/other/download",
        "https://api.unsplash.com/photos/photo_1-A/download/other",
        "https://api.unsplash.com/photos/photo_1-A/download%2Fother",
        "https://api.unsplash.com/photos/photo_1-A/%64ownload",
        "https://api.unsplash.com/photos/photo_1-A/download#fragment",
    ],
)
async def test_tracking_url_is_validated_at_resolution_and_use(mock_provider, location):
    requests = []
    data = photo_data()
    data["links"]["download_location"] = location

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=data)

    mock_provider(handler)
    with pytest.raises(HTTPException) as resolved:
        await unsplash_service.resolve_photo("photo_1-A")
    assert resolved.value.status_code == 503
    with pytest.raises(HTTPException) as tracked:
        await unsplash_service.track_download("photo_1-A", location)
    assert tracked.value.status_code == 503
    assert len(requests) == 1


@pytest.mark.parametrize("photo_id", ["", "../x", "a/b", "a%2Fb", "x\n", "x" * 101])
async def test_unsafe_requested_ids_never_reach_provider(mock_provider, photo_id):
    requests = []
    mock_provider(requests.append)
    with pytest.raises(HTTPException) as resolved:
        await unsplash_service.resolve_photo(photo_id)
    with pytest.raises(HTTPException) as tracked:
        await unsplash_service.track_download(photo_id, "https://api.unsplash.com/")
    assert resolved.value.status_code == 503
    assert tracked.value.status_code == 503
    assert requests == []


async def test_resolve_rejects_mismatched_provider_id(mock_provider):
    data = photo_data()
    data["id"] = "different"
    mock_provider(lambda request: httpx.Response(200, json=data))
    with pytest.raises(HTTPException) as exc:
        await unsplash_service.resolve_photo("photo_1-A")
    assert exc.value.status_code == 503


@pytest.mark.parametrize(
    ("status_code", "operation", "retry_after"),
    [
        (403, "search", None),
        (403, "resolve", "120"),
        (403, "track", "Wed, 21 Oct 2015 07:28:00 GMT"),
        (429, "search", "120"),
        (429, "resolve", "Wed, 21 Oct 2015 07:28:00 GMT"),
        (429, "track", None),
    ],
)
async def test_rate_limit_preserves_retry_after_without_retry(
    mock_provider, retry_after, status_code, operation
):
    requests = []

    def handler(request):
        requests.append(request)
        headers = {"Retry-After": retry_after} if retry_after else {}
        if status_code == 403:
            headers["X-Ratelimit-Remaining"] = "0"
        return httpx.Response(
            status_code, headers=headers, text="private upstream error"
        )

    mock_provider(handler)
    with pytest.raises(HTTPException) as exc:
        if operation == "search":
            await unsplash_service.search_photos("city", 1)
        elif operation == "resolve":
            await unsplash_service.resolve_photo("photo_1-A")
        else:
            await unsplash_service.track_download(
                "photo_1-A", "https://api.unsplash.com/photos/photo_1-A/download"
            )
    assert exc.value.status_code == 429
    assert exc.value.headers == ({"Retry-After": retry_after} if retry_after else None)
    assert "private" not in exc.value.detail
    assert len(requests) == 1


async def test_missing_access_key_is_unavailable_without_request(
    mock_provider, monkeypatch
):
    requests = []
    mock_provider(requests.append)
    monkeypatch.setattr(
        unsplash_service,
        "get_settings",
        lambda: SimpleNamespace(UNSPLASH_ACCESS_KEY=""),
    )
    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert "not configured" in exc.value.detail
    assert requests == []


async def test_timeout_is_sanitized_and_not_retried(mock_provider):
    requests = []

    def handler(request):
        requests.append(request)
        raise httpx.ReadTimeout("private upstream error", request=request)

    mock_provider(handler)
    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert "private" not in exc.value.detail
    assert len(requests) == 1


@pytest.mark.parametrize("status_code", [302, 403, 500])
async def test_provider_errors_and_redirects_are_sanitized(mock_provider, status_code):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            status_code,
            headers={"Location": "https://evil.test/"},
            text="private upstream error",
        )

    mock_provider(handler)
    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert "private" not in exc.value.detail
    assert len(requests) == 1


@pytest.mark.parametrize("remaining", [None, "1"])
async def test_other_forbidden_responses_are_sanitized(mock_provider, remaining):
    headers = {"Retry-After": "120"}
    if remaining is not None:
        headers["X-Ratelimit-Remaining"] = remaining
    mock_provider(
        lambda request: httpx.Response(
            403, headers=headers, text="private upstream error"
        )
    )

    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert exc.value.detail == "Photo search unavailable"
    assert exc.value.headers is None


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="private invalid json"),
        httpx.Response(200, json=[]),
        httpx.Response(200, json={"results": {}, "total_pages": 1}),
        httpx.Response(200, json={"results": [], "total_pages": True}),
        httpx.Response(200, json={"results": [], "total_pages": -1}),
        httpx.Response(200, json={"results": [None], "total_pages": 1}),
    ],
)
async def test_invalid_provider_response_is_sanitized(mock_provider, response):
    mock_provider(lambda request: response)
    with pytest.raises(HTTPException) as exc:
        await unsplash_service.search_photos("city", 1)
    assert exc.value.status_code == 503
    assert "private" not in exc.value.detail
