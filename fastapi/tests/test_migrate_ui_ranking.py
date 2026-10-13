import pytest
from sqlalchemy import JSON, Boolean, Integer, String

from scripts.migrate_ui_ranking import (
    ITEM_BASE_COLUMNS,
    LEGACY_SESSION_COLUMNS,
    SESSION_NEW_COLUMNS,
    MigrationError,
    _arguments,
    _check_current_schema,
    _check_legacy_schema,
    classify_schema,
    preflight_items,
    require_postgresql,
)


def test_preflight_accepts_trimmed_casefold_keys_across_lists() -> None:
    normalized, issues = preflight_items(
        [
            {"item_id": "one", "list_id": "first", "name": "  Café  "},
            {"item_id": "two", "list_id": "first", "name": "Tea"},
            {"item_id": "three", "list_id": "second", "name": "café"},
        ]
    )

    assert normalized["one"] == ("Café", "café")
    assert issues == []


def test_preflight_detects_casefold_duplicates_only_within_a_list() -> None:
    _, issues = preflight_items(
        [
            {"item_id": "one", "list_id": "first", "name": "Straße"},
            {"item_id": "two", "list_id": "first", "name": "STRASSE"},
            {"item_id": "three", "list_id": "second", "name": "STRASSE"},
        ]
    )

    duplicates = [issue for issue in issues if issue.code == "duplicate_name_key"]
    assert len(duplicates) == 1
    assert duplicates[0].list_id == "first"
    assert duplicates[0].item_ids == ("one", "two")
    assert duplicates[0].key == "strasse"


def test_preflight_rejects_blank_and_overlength_trimmed_names() -> None:
    _, issues = preflight_items(
        [
            {"item_id": "blank", "list_id": "first", "name": " \t "},
            {"item_id": "long", "list_id": "second", "name": f" {'x' * 101} "},
        ]
    )

    assert [(issue.code, issue.length) for issue in issues] == [
        ("blank_name", 0),
        ("name_too_long", 101),
    ]


def test_schema_recognition_accepts_only_complete_legacy_or_current_shapes() -> None:
    legacy_items = set(ITEM_BASE_COLUMNS)
    legacy_sessions = set(LEGACY_SESSION_COLUMNS)
    current_items = legacy_items | {"name_key"}
    current_sessions = (legacy_sessions - {"is_complete"}) | set(SESSION_NEW_COLUMNS)

    assert classify_schema(legacy_items, legacy_sessions) == "legacy"
    assert classify_schema(current_items, current_sessions) == "current"
    with pytest.raises(MigrationError, match="partially migrated"):
        classify_schema(current_items, legacy_sessions)


def test_database_dialect_rejects_sqlite_and_accepts_postgresql() -> None:
    assert (
        require_postgresql("postgresql+asyncpg://example:example@localhost/db")
        == "postgresql"
    )
    with pytest.raises(MigrationError, match="PostgreSQL only"):
        require_postgresql("sqlite+aiosqlite:///:memory:")


def test_current_schema_requires_300_character_name_key() -> None:
    snapshot = {
        "items": {
            "name": {"type": String(100), "nullable": False},
            "list_id": {"type": String(), "nullable": False},
            "name_key": {"type": String(300), "nullable": False},
        },
        "sessions": {
            "status": {"type": String(20), "nullable": False},
            "comparisons_answered": {
                "type": Integer(),
                "nullable": False,
                "default": "0",
            },
            "revision": {"type": Integer(), "nullable": False, "default": "0"},
            "discard_on_cancel": {
                "type": Boolean(),
                "nullable": False,
                "default": "false",
            },
            "peer_snapshot": {
                "type": JSON(),
                "nullable": False,
                "default": "'[]'::json",
            },
            "candidate_snapshot": {
                "type": JSON(),
                "nullable": False,
                "default": "'{}'::json",
            },
            "previous_state": {
                "type": JSON(),
                "nullable": True,
                "default": None,
            },
        },
    }

    _check_current_schema(snapshot)
    snapshot["items"]["name_key"]["type"] = String(200)
    with pytest.raises(MigrationError, match="unexpected length"):
        _check_current_schema(snapshot)


def test_cli_defaults_to_read_only_and_accepts_apply_without_extra_flags() -> None:
    assert _arguments([]).apply is False
    assert _arguments(["--apply"]).apply is True


def test_preflight_requires_trimmed_names_and_matching_stored_keys() -> None:
    normalized, issues = preflight_items(
        [
            {
                "item_id": "one",
                "list_id": "first",
                "name": "  Tea  ",
                "name_key": "tea",
            },
            {
                "item_id": "two",
                "list_id": "first",
                "name": "Coffee",
                "name_key": "coffee",
            },
            {
                "item_id": "three",
                "list_id": "first",
                "name": "Mate",
                "name_key": "yerba",
            },
        ],
        require_stored_keys=True,
    )

    assert normalized["one"] == ("Tea", "tea")
    assert [(issue.code, issue.item_ids) for issue in issues] == [
        ("name_not_trimmed", ("one",)),
        ("name_key_mismatch", ("three",)),
    ]


def _legacy_snapshot() -> dict:
    return {
        "items": {
            "name": {"type": String(100), "nullable": False},
            "list_id": {"type": String(), "nullable": False},
            "position": {"type": String(255), "nullable": True},
            "tier_set": {"type": String(10), "nullable": True},
        },
        "sessions": {
            "is_complete": {"type": Boolean(), "nullable": False},
            "new_item_id": {"type": String(), "nullable": False},
        },
    }


def test_legacy_schema_accepts_only_the_known_legacy_shape() -> None:
    _check_legacy_schema(_legacy_snapshot())

    changed_nullability = _legacy_snapshot()
    changed_nullability["sessions"]["is_complete"]["nullable"] = True
    with pytest.raises(MigrationError, match="unexpected"):
        _check_legacy_schema(changed_nullability)

    missing_column = _legacy_snapshot()
    del missing_column["items"]["position"]
    with pytest.raises(MigrationError, match="is missing"):
        _check_legacy_schema(missing_column)
