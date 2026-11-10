from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock, call
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, insert, update

from app.db.models import Base, User
from app.services.cover_upload_service import object_key
from scripts import cleanup_photo_uploads as cleanup

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER_OWNER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


@pytest.fixture
def cleanup_setup(tmp_path, monkeypatch):
    path = tmp_path / "cleanup.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(User),
            [
                {"user_id": OWNER, "email": "owner@example.com"},
                {"user_id": OTHER_OWNER, "email": "other@example.com"},
            ],
        )

    settings = SimpleNamespace(
        DATABASE_URL=f"sqlite+aiosqlite:///{path}",
        COVER_UPLOAD_BUCKET="private-covers",
    )
    client = Mock()
    bucket = client.bucket.return_value
    client.list_blobs.return_value = []
    client_factory = Mock(return_value=client)
    clock = Mock(wraps=datetime)
    clock.now.return_value = NOW
    monkeypatch.setattr(cleanup, "get_settings", lambda: settings)
    monkeypatch.setattr(cleanup, "datetime", clock)
    monkeypatch.setattr(cleanup.storage, "Client", client_factory)
    yield SimpleNamespace(
        engine=engine,
        settings=settings,
        client=client,
        client_factory=client_factory,
        bucket=bucket,
    )
    engine.dispose()


def _set_background(engine, owner, photo_id):
    with engine.begin() as connection:
        connection.execute(
            update(User)
            .where(User.user_id == owner)
            .values(background_photo_id=photo_id)
        )


def _blob(name, created, generation=1):
    return SimpleNamespace(name=name, time_created=created, generation=generation)


@pytest.mark.parametrize("apply", [False, True])
def test_cleanup_uses_exact_owner_and_age_and_requires_apply(
    cleanup_setup, capsys, apply
):
    referenced_id = uuid4()
    orphan_id = uuid4()
    _set_background(cleanup_setup.engine, OWNER, referenced_id)

    oldest = NOW - timedelta(days=2)
    cutoff = NOW - timedelta(hours=24)
    referenced = _blob(object_key(OWNER, referenced_id), oldest)
    orphan = _blob(object_key(OWNER, orphan_id), cutoff - timedelta(microseconds=1), 10)
    same_id_other_owner = _blob(object_key(OTHER_OWNER, referenced_id), oldest, 11)
    boundary = _blob(object_key(OWNER, uuid4()), cutoff)
    recent = _blob(object_key(OWNER, uuid4()), cutoff + timedelta(microseconds=1))
    unrelated = [
        _blob(f"uploads/{OWNER}/{uuid4()}.jpg", None),
        _blob(f"covers/{OWNER}/{uuid4()}.jpg/extra", None),
        _blob(f"covers/{str(OWNER).upper()}/{uuid4()}.jpg", None),
        _blob(f"covers/{OWNER}/not-a-uuid.jpg", None),
        _blob(f"covers/{OWNER}/{uuid4()}", None),
    ]
    cleanup_setup.client.list_blobs.return_value = [
        referenced,
        orphan,
        same_id_other_owner,
        boundary,
        recent,
        *unrelated,
    ]

    assert cleanup.main(["--apply"] if apply else []) == 0
    output = capsys.readouterr().out
    assert ("Apply" if apply else "Dry run") in output
    assert "2 candidates" in output
    assert orphan.name in output
    assert same_id_other_owner.name in output
    assert referenced.name not in output
    assert boundary.name not in output
    assert recent.name not in output
    cleanup_setup.client.list_blobs.assert_called_once_with(
        cleanup_setup.bucket, prefix="covers/", timeout=30, retry=None
    )
    expected = [
        call(orphan.name, if_generation_match=10, timeout=30, retry=None),
        call(same_id_other_owner.name, if_generation_match=11, timeout=30, retry=None),
    ]
    deletions = cleanup_setup.bucket.delete_blob.call_args_list
    assert deletions == (expected if apply else [])


@pytest.mark.parametrize(
    ("created", "generation"),
    [
        (None, 1),
        (datetime(2026, 11, 1), 1),
        (NOW - timedelta(days=2), None),
        (NOW - timedelta(days=2), 0),
    ],
)
def test_missing_creation_time_or_generation_stops_all_deletions(
    cleanup_setup, capsys, created, generation
):
    cleanup_setup.client.list_blobs.return_value = [
        _blob(object_key(OWNER, uuid4()), NOW - timedelta(days=2)),
        _blob(object_key(OWNER, uuid4()), created, generation),
    ]

    assert cleanup.main(["--apply"]) == 1
    assert "no objects deleted" in capsys.readouterr().err
    cleanup_setup.bucket.delete_blob.assert_not_called()


def test_unreadable_database_stops_cleanup(cleanup_setup, tmp_path, capsys):
    cleanup_setup.settings.DATABASE_URL = (
        f"sqlite+aiosqlite:///{tmp_path / 'missing.db'}"
    )

    assert cleanup.main(["--apply"]) == 1
    assert "details suppressed" in capsys.readouterr().err
    cleanup_setup.client_factory.assert_not_called()
    cleanup_setup.bucket.delete_blob.assert_not_called()


def test_incomplete_storage_listing_stops_cleanup(cleanup_setup, capsys):
    def failed_listing():
        yield _blob(object_key(OWNER, uuid4()), NOW - timedelta(days=2))
        raise RuntimeError("private storage error")

    cleanup_setup.client.list_blobs.return_value = failed_listing()
    assert cleanup.main(["--apply"]) == 1
    assert "private storage error" not in capsys.readouterr().err
    cleanup_setup.bucket.delete_blob.assert_not_called()


def test_delete_failure_is_sanitized_and_not_retried(cleanup_setup, capsys):
    blob = _blob(object_key(OWNER, uuid4()), NOW - timedelta(days=2), 7)
    cleanup_setup.client.list_blobs.return_value = [blob]
    cleanup_setup.bucket.delete_blob.side_effect = RuntimeError("private storage error")

    assert cleanup.main(["--apply"]) == 1
    assert "private storage error" not in capsys.readouterr().err
    cleanup_setup.bucket.delete_blob.assert_called_once_with(
        blob.name, if_generation_match=7, timeout=30, retry=None
    )


def test_missing_bucket_stops_cleanup(cleanup_setup, capsys):
    cleanup_setup.settings.COVER_UPLOAD_BUCKET = ""

    assert cleanup.main(["--apply"]) == 1
    assert "COVER_UPLOAD_BUCKET is not configured" in capsys.readouterr().err
    cleanup_setup.client_factory.assert_not_called()
    cleanup_setup.bucket.delete_blob.assert_not_called()
