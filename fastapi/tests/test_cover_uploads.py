import struct
import threading
import zlib
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, UploadFile
from google.api_core.exceptions import NotFound
from PIL import Image, ImageDraw
from starlette.datastructures import Headers

from app.services import cover_upload_service as covers


class FakeBlob:
    def __init__(self, store, key):
        self.store = store
        self.key = key
        self.cache_control = None

    def upload_from_string(self, data, **kwargs):
        self.store.record("upload", self.key, kwargs, self.cache_control)
        self.store.objects[self.key] = data

    def download_as_bytes(self, **kwargs):
        self.store.record("download", self.key, kwargs)
        if self.key not in self.store.objects:
            raise NotFound("missing object")
        return self.store.objects[self.key]

    def delete(self, **kwargs):
        self.store.record("delete", self.key, kwargs)
        if self.key not in self.store.objects:
            raise NotFound("missing object")
        del self.store.objects[self.key]


class FakeStorage:
    def __init__(self):
        self.objects = {}
        self.calls = []
        self.failures = {}

    def bucket(self, name):
        assert name == "private-covers"
        return self

    def blob(self, key):
        return FakeBlob(self, key)

    def record(self, operation, key, kwargs, cache_control=None):
        thread = threading.get_ident()
        self.calls.append((operation, key, kwargs, cache_control, thread))
        if operation in self.failures:
            raise self.failures[operation]


class RecordingUpload(UploadFile):
    def __init__(self, data):
        super().__init__(file=BytesIO(data), filename="not-a-photo.gif")
        self.read_sizes = []

    async def read(self, size=-1):
        self.read_sizes.append(size)
        return await super().read(size)


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(
        covers,
        "get_settings",
        lambda: SimpleNamespace(COVER_UPLOAD_BUCKET="private-covers"),
    )
    monkeypatch.setattr(covers.storage, "Client", lambda: fake)
    return fake


def image_bytes(image_format, size=(64, 32), **kwargs):
    image = Image.new("RGB", size, "red")
    data = BytesIO()
    image.save(data, format=image_format, **kwargs)
    return data.getvalue()


def upload(data):
    return UploadFile(
        file=BytesIO(data),
        filename="not-a-photo.gif",
        headers=Headers({"content-type": "application/octet-stream"}),
    )


def png_with_size(width, height):
    data = bytearray(image_bytes("PNG", (1, 1)))
    struct.pack_into(">II", data, 16, width, height)
    struct.pack_into(">I", data, 29, zlib.crc32(data[12:29]))
    return bytes(data)


@pytest.mark.parametrize("image_format", ["JPEG", "PNG", "WEBP"])
async def test_valid_formats_ignore_filename_and_mime(storage, image_format):
    user_id = uuid4()
    photo = await covers.create_upload(upload(image_bytes(image_format)), user_id)
    photo_id = UUID(photo["id"])
    assert photo == {"source": "upload", "id": str(photo_id)}
    assert photo_id.version == 4
    key = f"covers/{user_id}/{photo_id}.jpg"
    assert covers.object_key(user_id, photo_id) == key
    assert await covers.read_upload(user_id, photo_id) == storage.objects[key]
    with Image.open(BytesIO(storage.objects[key])) as result:
        assert result.format == "JPEG"
        assert result.mode == "RGB"
        assert result.size == (64, 32)

    operation, saved_key, kwargs, cache_control, _ = storage.calls[0]
    assert (operation, saved_key, cache_control) == ("upload", key, "private, no-store")
    assert kwargs["content_type"] == "image/jpeg"
    assert kwargs["if_generation_match"] == 0
    assert kwargs["retry"] is None
    assert kwargs["timeout"] == 30
    assert storage.calls[1][2] == {"timeout": 30, "retry": None}


async def test_orientation_resize_and_metadata_removal(storage):
    image = Image.new("RGB", (1800, 900), "white")
    ImageDraw.Draw(image).rectangle((0, 0, 449, 899), fill="red")
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = "private location"
    data = BytesIO()
    image.save(
        data,
        format="JPEG",
        exif=exif,
        comment=b"private comment",
        icc_profile=b"private profile",
    )
    user_id = uuid4()
    photo = await covers.create_upload(upload(data.getvalue()), user_id)
    saved = storage.objects[covers.object_key(user_id, UUID(photo["id"]))]
    with Image.open(BytesIO(saved)) as result:
        assert result.format == "JPEG"
        assert result.mode == "RGB"
        assert result.size == (800, 1600)
        assert result.getpixel((200, 100))[0] > result.getpixel((200, 100))[1] + 100
        assert result.getpixel((200, 1500))[1] > 200
        assert not result.getexif()
        assert not {"exif", "icc_profile", "comment", "xmp"} & result.info.keys()


@pytest.mark.parametrize(
    "data",
    [b"", b"not an image", image_bytes("GIF"), image_bytes("PNG")[:-16]],
)
async def test_rejects_invalid_or_unsupported_content(storage, data):
    with pytest.raises(HTTPException) as error:
        await covers.create_upload(upload(data), uuid4())
    assert error.value.status_code == 422
    assert not storage.calls


@pytest.mark.parametrize("image_format", ["PNG", "WEBP"])
async def test_rejects_animated_images(storage, image_format):
    first = Image.new("RGB", (8, 8), "red")
    second = Image.new("RGB", (8, 8), "blue")
    data = BytesIO()
    first.save(
        data,
        format=image_format,
        save_all=True,
        append_images=[second],
        duration=100,
        loop=0,
    )
    with pytest.raises(HTTPException) as error:
        await covers.create_upload(upload(data.getvalue()), uuid4())
    assert error.value.status_code == 422
    assert not storage.calls


@pytest.mark.parametrize("dimensions", [(10000, 4001), (20000, 10000)])
async def test_rejects_large_and_decompression_bomb_images(storage, dimensions):
    with pytest.raises(HTTPException) as error:
        await covers.create_upload(upload(png_with_size(*dimensions)), uuid4())
    assert error.value.status_code == 422
    assert not storage.calls


@pytest.mark.parametrize("extra, expected", [(0, 422), (1, 413)])
async def test_streaming_size_limit(storage, extra, expected):
    file = RecordingUpload(b"x" * (10 * 1024 * 1024 + extra))
    with pytest.raises(HTTPException) as error:
        await covers.create_upload(file, uuid4())
    assert error.value.status_code == expected
    assert file.read_sizes
    assert all(0 < size <= 1024 * 1024 for size in file.read_sizes)
    assert not storage.calls


async def test_delete_missing_and_key_safety(storage):
    user_id, photo_id = uuid4(), uuid4()
    photo = {"source": "upload", "id": str(photo_id)}
    assert await covers.read_upload(user_id, photo_id) is None
    assert await covers.delete_upload(user_id, photo) is None
    assert storage.calls[-1][2] == {"timeout": 30, "retry": None}
    calls = len(storage.calls)
    for invalid in (
        None,
        {"source": "unsplash", "id": str(photo_id)},
        {"source": "upload", "id": "../../other-user/secret"},
        {"source": "upload", "id": None},
    ):
        await covers.delete_upload(user_id, invalid)
    assert len(storage.calls) == calls
    for invalid_user, invalid_photo in (
        (user_id, "../../other-user/secret"),
        ("../../other-user", photo_id),
    ):
        with pytest.raises(ValueError):
            covers.object_key(invalid_user, invalid_photo)


async def test_upload_is_private_to_owner(storage):
    owner, other = uuid4(), uuid4()
    photo = await covers.create_upload(upload(image_bytes("PNG")), owner)
    photo_id = UUID(photo["id"])
    assert await covers.read_upload(other, photo_id) is None
    await covers.delete_upload(other, photo)
    assert await covers.read_upload(owner, photo_id) is not None
    await covers.delete_upload(owner, photo)
    assert await covers.read_upload(owner, photo_id) is None


@pytest.mark.parametrize("operation", ["upload", "download", "delete"])
async def test_storage_failures_are_sanitized_and_not_retried(storage, operation):
    storage.failures[operation] = TimeoutError("secret provider details")
    user_id, photo_id = uuid4(), uuid4()
    with pytest.raises(HTTPException) as error:
        if operation == "upload":
            await covers.create_upload(upload(image_bytes("JPEG")), user_id)
        elif operation == "download":
            await covers.read_upload(user_id, photo_id)
        else:
            await covers.delete_upload(
                user_id, {"source": "upload", "id": str(photo_id)}
            )
    assert error.value.status_code == 503
    assert "secret provider details" not in str(error.value.detail)
    assert error.value.__cause__ is None
    assert len(storage.calls) == 1
    assert storage.calls[0][2]["timeout"] == 30
    assert storage.calls[0][2]["retry"] is None


async def test_unconfigured_bucket_is_sanitized(storage, monkeypatch):
    monkeypatch.setattr(
        covers, "get_settings", lambda: SimpleNamespace(COVER_UPLOAD_BUCKET="")
    )
    with pytest.raises(HTTPException) as error:
        await covers.read_upload(uuid4(), uuid4())
    assert error.value.status_code == 503
    assert not storage.calls


async def test_image_and_storage_work_runs_off_event_loop(storage, monkeypatch):
    event_loop_thread = threading.get_ident()
    image_threads = []
    original_open = Image.open

    def record_image_thread(*args, **kwargs):
        image_threads.append(threading.get_ident())
        return original_open(*args, **kwargs)

    monkeypatch.setattr(covers.Image, "open", record_image_thread)
    user_id = uuid4()
    photo = await covers.create_upload(upload(image_bytes("PNG")), user_id)
    photo_id = UUID(photo["id"])
    await covers.read_upload(user_id, photo_id)
    await covers.delete_upload(user_id, photo)
    assert image_threads
    assert all(thread != event_loop_thread for thread in image_threads)
    assert all(call[4] != event_loop_thread for call in storage.calls)
