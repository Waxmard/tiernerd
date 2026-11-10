import argparse
import asyncio
import importlib
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from google.cloud import storage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

get_settings = importlib.import_module("app.settings").get_settings
User = importlib.import_module("app.db.models").User
object_key = importlib.import_module("app.services.photo_upload_service").object_key

REQUEST_TIMEOUT = 30


class CleanupError(Exception):
    pass


def _referenced_keys(rows):
    return {
        object_key(user_id, photo_id)
        for user_id, photo_id in rows
        if photo_id is not None
    }


def _is_upload_key(name: str) -> bool:
    parts = name.split("/")
    if len(parts) != 3 or parts[0] != "covers":
        return False
    try:
        user_id, photo_id = UUID(parts[1]), UUID(parts[2].removesuffix(".jpg"))
    except ValueError:
        return False
    return object_key(user_id, photo_id) == name


def _candidates(bucket_name: str, referenced: set[str], cutoff: datetime):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = client.list_blobs(
        bucket, prefix="covers/", timeout=REQUEST_TIMEOUT, retry=None
    )
    candidates = []
    for blob in blobs:
        if not _is_upload_key(blob.name):
            continue
        created = blob.time_created
        if created is None or created.utcoffset() is None:
            raise CleanupError(
                "A photo has no usable creation time; no objects deleted."
            )
        if blob.name in referenced or created >= cutoff:
            continue
        if blob.generation is None or blob.generation <= 0:
            raise CleanupError(
                "A candidate has no usable generation; no objects deleted."
            )
        candidates.append(blob)
    return bucket, candidates


async def _run(apply: bool) -> int:
    settings = get_settings()
    bucket_name = settings.COVER_UPLOAD_BUCKET
    if not bucket_name.strip():
        raise CleanupError("COVER_UPLOAD_BUCKET is not configured; no objects deleted.")
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.connect() as connection:
            rows = await connection.execute(
                select(User.user_id, User.background_photo_id)
            )
            referenced = _referenced_keys(rows)
    finally:
        await engine.dispose()

    bucket, candidates = await asyncio.to_thread(
        _candidates, bucket_name, referenced, cutoff
    )
    mode = "Apply" if apply else "Dry run"
    print(
        f"{mode}: {len(candidates)} candidates older than {cutoff.isoformat()} "
        f"in gs://{bucket_name}/covers/."
    )
    for blob in candidates:
        print(
            f"Candidate gs://{bucket_name}/{blob.name} "
            f"created={blob.time_created.isoformat()} generation={blob.generation}",
            flush=True,
        )
    if apply:
        for blob in candidates:
            await asyncio.to_thread(
                bucket.delete_blob,
                blob.name,
                if_generation_match=blob.generation,
                timeout=REQUEST_TIMEOUT,
                retry=None,
            )
            print(f"Deleted gs://{bucket_name}/{blob.name}", flush=True)
    return 0


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Find unreferenced photo uploads older than 24 hours."
    )
    parser.add_argument("--apply", action="store_true", help="Delete the candidates.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    try:
        return asyncio.run(_run(args.apply))
    except CleanupError as exc:
        print(f"Cleanup failed: {exc}", file=sys.stderr)
    except Exception:
        print(
            "Cleanup failed; database or storage details suppressed. "
            "Some objects may already have been deleted.",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
