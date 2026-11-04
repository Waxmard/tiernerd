import pytest

from scripts import migrate_list_ranking_mode as migration
from scripts.migrate_list_ranking_mode import MigrationError, _plan_scores, main


def test_schema_expression_preserves_literal_case():
    assert migration._normalize_expression("'SCORE'::character varying") == "'SCORE'"
    assert (
        migration._normalize_expression(
            "CHECK (ranking_mode IN ('RANK'::text, 'score'::text))"
        )
        == "checkranking_modein'RANK','score'"
    )


def test_score_plan_repairs_only_incorrect_ratings_per_list():
    items = [
        {"item_id": "best", "list_id": "first", "position": "a2", "rating": 9.0},
        {"item_id": "middle", "list_id": "first", "position": "a1", "rating": 5.0},
        {"item_id": "worst", "list_id": "first", "position": "a0", "rating": None},
        {"item_id": "draft", "list_id": "first", "position": None, "rating": 8.0},
        {"item_id": "draft2", "list_id": "first", "position": None, "rating": None},
        {"item_id": "single", "list_id": "second", "position": "a2", "rating": 1.0},
    ]
    assert _plan_scores(items, {"first", "second", "empty"}) == {
        "best": 10.0,
        "worst": 0.0,
        "draft": None,
        "single": 10.0,
    }
    assert _plan_scores([], {"empty"}) == {}


@pytest.mark.parametrize(
    "items",
    [
        [
            {"item_id": "same", "list_id": "first", "position": "a1", "rating": 10.0},
            {
                "item_id": "same",
                "list_id": "second",
                "position": "a0",
                "rating": 10.0,
            },
        ],
        [
            {
                "item_id": "orphan",
                "list_id": "missing",
                "position": None,
                "rating": None,
            }
        ],
        [
            {"item_id": "one", "list_id": "first", "position": "a0", "rating": 10.0},
            {"item_id": "two", "list_id": "first", "position": "a0", "rating": 0.0},
        ],
    ],
)
def test_score_plan_rejects_corrupt_membership_or_positions(items):
    with pytest.raises(MigrationError):
        _plan_scores(items, {"first", "second"})


@pytest.mark.parametrize(
    ("arguments", "apply"), [([], False), (["--check"], False), (["--apply"], True)]
)
def test_cli_selects_requested_mode(monkeypatch, arguments, apply):
    calls = []

    async def run(value):
        calls.append(value)
        return 0

    monkeypatch.setattr(migration, "_run", run)
    assert main(arguments) == 0
    assert calls == [apply]


def test_cli_rejects_conflicting_modes(monkeypatch):
    async def run(apply):
        pytest.fail("conflicting arguments must not start migration")

    monkeypatch.setattr(migration, "_run", run)
    with pytest.raises(SystemExit) as exc:
        main(["--check", "--apply"])
    assert exc.value.code != 0


@pytest.mark.parametrize(
    "exception",
    [MigrationError("unsafe schema"), RuntimeError("sensitive database details")],
)
def test_cli_reports_errors_without_exposing_database_details(
    monkeypatch, capsys, exception
):
    async def run(apply):
        raise exception

    monkeypatch.setattr(migration, "_run", run)
    assert main(["--apply"]) == 1
    captured = capsys.readouterr()
    if isinstance(exception, MigrationError):
        assert "unsafe schema" in captured.err
    else:
        assert "sensitive database details" not in captured.out + captured.err
        assert "suppressed" in captured.err
