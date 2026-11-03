import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ITEM_NOT_FOUND_ERROR
from app.db.models import Item as ItemModel, List as ListModel, User


async def create_draft(
    client: AsyncClient,
    test_list: ListModel,
    auth_headers: dict[str, str],
    test_item: ItemModel,
    name: str = "Candidate",
) -> dict[str, Any]:
    assert test_item.position is not None
    response = await client.post(
        "/api/items/",
        params={"list_title": test_list.title},
        json={"name": name},
        headers=auth_headers,
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_answer_preview_commit_and_idempotent_commit(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    session_id = draft["session_id"]
    item_id = draft["item_id"]
    assert draft["status"] == "active"
    assert draft["revision"] == 0
    assert draft["item"]["position"] is None
    assert draft["item"]["rating"] is None

    status_response = await client.get(
        f"/api/items/comparison/{session_id}/status", headers=auth_headers
    )
    assert status_response.json()["item_id"] == item_id
    by_item = await client.get(
        f"/api/items/items/{item_id}/comparison-session", headers=auth_headers
    )
    assert by_item.json()["session_id"] == session_id

    answer = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session_id},
        json={"result": "better", "revision": 0},
        headers=auth_headers,
    )
    assert answer.status_code == 200
    ready = answer.json()
    assert ready["status"] == "ready_to_commit"
    assert ready["comparisons_answered"] == 1
    assert ready["preview"] == {"score": 10.0, "rank": 1, "ranked_count": 2}
    saved = await test_db.get(ItemModel, uuid.UUID(item_id))
    assert saved is not None and saved.position is None and saved.rating is None
    assert test_item.position == "a0"

    stale_answer = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session_id},
        json={"result": "worse", "revision": 0},
        headers=auth_headers,
    )
    assert stale_answer.status_code == 409

    committed = await client.post(
        f"/api/items/comparison/{session_id}/commit",
        json={"revision": 1},
        headers=auth_headers,
    )
    assert committed.status_code == 200
    assert committed.json()["status"] == "completed"
    assert committed.json()["preview"] == ready["preview"]
    await test_db.refresh(saved)
    await test_db.refresh(test_item)
    assert saved.rating == ready["preview"]["score"] == 10.0
    assert test_item.rating == 0.0
    assert saved.position > test_item.position

    repeated = await client.post(
        f"/api/items/comparison/{session_id}/commit",
        json={"revision": 0},
        headers=auth_headers,
    )
    assert repeated.status_code == 200
    assert repeated.json()["status"] == "completed"
    assert repeated.json()["preview"] == ready["preview"]


@pytest.mark.asyncio
async def test_undo_restores_question_before_opposite_answer(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    session_id = draft["session_id"]
    item_id = uuid.UUID(draft["item_id"])
    answer = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session_id},
        json={"result": "better", "revision": 0},
        headers=auth_headers,
    )
    assert answer.json()["status"] == "ready_to_commit"

    undo = await client.post(
        f"/api/items/comparison/{session_id}/undo",
        json={"revision": 1},
        headers=auth_headers,
    )
    assert undo.status_code == 200
    assert undo.json()["status"] == "active"
    assert undo.json()["revision"] == 2
    assert undo.json()["can_undo"] is False
    candidate = await test_db.get(ItemModel, item_id)
    assert candidate is not None and candidate.position is None
    assert test_item.position == "a0"

    answer_again = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session_id},
        json={"result": "worse", "revision": 2},
        headers=auth_headers,
    )
    assert answer_again.status_code == 200
    assert answer_again.json()["preview"] == {
        "score": 0.0,
        "rank": 2,
        "ranked_count": 2,
    }


@pytest.mark.asyncio
async def test_restart_requires_current_revision_and_resets_history(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    session_id = draft["session_id"]
    item_id = draft["item_id"]
    answered = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session_id},
        json={"result": "better", "revision": 0},
        headers=auth_headers,
    )
    assert answered.json()["status"] == "ready_to_commit"
    restarted = await client.post(
        f"/api/items/items/{item_id}/comparison-session",
        json={"restart": True, "revision": 1},
        headers=auth_headers,
    )
    assert restarted.status_code == 200
    assert restarted.json()["status"] == "active"
    assert restarted.json()["revision"] == 2
    assert restarted.json()["comparisons_answered"] == 0

    mismatch = await client.post(
        f"/api/items/items/{item_id}/comparison-session",
        json={"restart": True, "revision": 1},
        headers=auth_headers,
    )
    assert mismatch.status_code == 409


@pytest.mark.asyncio
async def test_stale_draft_status_is_read_only_and_marks_stale(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    test_item.position = "z0"
    await test_db.commit()

    response = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["is_stale"] is True
    assert response.json()["current_comparison"] is None
    assert response.json()["preview"] is None


@pytest.mark.asyncio
async def test_cancel_new_draft_discards_candidate(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    deleted = await client.delete(
        f"/api/items/comparison/{draft['session_id']}", headers=auth_headers
    )
    assert deleted.status_code == 204
    assert await test_db.get(ItemModel, uuid.UUID(draft["item_id"])) is None
    missing = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status",
        headers=auth_headers,
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_cancel_existing_draft_preserves_saved_scores_and_order(
    client: AsyncClient,
    test_list: ListModel,
    multiple_items: list[ItemModel],
    auth_headers: dict[str, str],
) -> None:
    list_url = f"/api/lists/{test_list.list_id}/items"
    before_response = await client.get(list_url, headers=auth_headers)
    assert before_response.status_code == 200
    before = before_response.json()
    assert [item["item_id"] for item in before] == [
        str(item.item_id) for item in reversed(multiple_items)
    ]
    assert [item["rating"] for item in before] == [10.0, 7.5, 5.0, 2.5, 0.0]

    mover = multiple_items[0]
    started = await client.post(
        f"/api/items/items/{mover.item_id}/comparison-session",
        json={},
        headers=auth_headers,
    )
    assert started.status_code == 200
    draft = started.json()
    assert draft["discard_on_cancel"] is False
    still_asking = await answer(client, draft, auth_headers)
    assert still_asking["status"] == "active"
    ready = await answer(client, still_asking, auth_headers)
    assert ready["status"] == "ready_to_commit"
    assert ready["preview"] == {"score": 10.0, "rank": 1, "ranked_count": 5}
    assert (await client.get(list_url, headers=auth_headers)).json() == before

    cancelled = await client.delete(
        f"/api/items/comparison/{draft['session_id']}", headers=auth_headers
    )
    assert cancelled.status_code == 204
    assert (await client.get(list_url, headers=auth_headers)).json() == before
    item = await client.get(f"/api/items/items/{mover.item_id}", headers=auth_headers)
    assert item.json() == before[-1]
    status_response = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status", headers=auth_headers
    )
    assert status_response.json()["status"] == "cancelled"
    assert (
        await client.get(
            f"/api/items/items/{mover.item_id}/comparison-session",
            headers=auth_headers,
        )
    ).json() is None


@pytest.mark.asyncio
async def test_wrong_owner_cannot_read_or_answer_session(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    auth_headers_user2: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    session_id = draft["session_id"]
    responses = (
        await client.get(
            f"/api/items/comparison/{session_id}/status",
            headers=auth_headers_user2,
        ),
        await client.post(
            "/api/items/comparison/result",
            params={"session_id": session_id},
            json={"result": "better", "revision": 0},
            headers=auth_headers_user2,
        ),
        await client.post(
            f"/api/items/comparison/{session_id}/undo",
            json={"revision": 0},
            headers=auth_headers_user2,
        ),
        await client.post(
            f"/api/items/comparison/{session_id}/commit",
            json={"revision": 0},
            headers=auth_headers_user2,
        ),
        await client.delete(
            f"/api/items/comparison/{session_id}", headers=auth_headers_user2
        ),
    )
    assert [response.status_code for response in responses] == [404, 404, 404, 404, 404]


async def seed_list(db: AsyncSession, user: User, title: str) -> ListModel:
    now = datetime.now(UTC)
    list_obj = ListModel(
        list_id=uuid.uuid4(),
        user_id=user.user_id,
        title=title,
        description="",
        created_at=now,
        updated_at=now,
    )
    db.add(list_obj)
    await db.commit()
    return list_obj


async def seed_ranked_items(
    db: AsyncSession, list_obj: ListModel, count: int
) -> list[ItemModel]:
    now = datetime.now(UTC)
    items = [
        ItemModel(
            item_id=uuid.uuid4(),
            list_id=list_obj.list_id,
            name=f"Peer-{index}",
            description="",
            image_url=None,
            position=f"a{index}",
            rating=round(10 * index / (count - 1), 1) if count > 1 else 10.0,
            created_at=now,
            updated_at=now,
        )
        for index in range(count)
    ]
    db.add_all(items)
    await db.commit()
    return items


async def answer(
    client: AsyncClient,
    session: dict[str, Any],
    auth_headers: dict[str, str],
    result: str = "better",
) -> dict[str, Any]:
    response = await client.post(
        "/api/items/comparison/result",
        params={"session_id": session["session_id"]},
        json={"result": result, "revision": session["revision"]},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def drop_candidate_row(db: AsyncSession, item_id: str) -> None:
    """Delete an item row the way a second process would, sessions left behind."""
    candidate = await db.get(ItemModel, uuid.UUID(item_id))
    assert candidate is not None
    await db.delete(candidate)
    await db.commit()


@pytest.mark.asyncio
async def test_unknown_session_id_is_not_found_on_every_mutation(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    unknown = str(uuid.uuid4())
    responses = (
        await client.get(
            f"/api/items/comparison/{unknown}/status", headers=auth_headers
        ),
        await client.post(
            "/api/items/comparison/result",
            params={"session_id": unknown},
            json={"result": "better", "revision": 0},
            headers=auth_headers,
        ),
        await client.post(
            f"/api/items/comparison/{unknown}/undo",
            json={"revision": 0},
            headers=auth_headers,
        ),
        await client.post(
            f"/api/items/comparison/{unknown}/commit",
            json={"revision": 0},
            headers=auth_headers,
        ),
        await client.delete(f"/api/items/comparison/{unknown}", headers=auth_headers),
    )
    assert [response.status_code for response in responses] == [404, 404, 404, 404, 404]


@pytest.mark.asyncio
async def test_vanished_candidate_row_is_not_found(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    await drop_candidate_row(test_db, draft["item_id"])

    status_response = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status", headers=auth_headers
    )
    answer_response = await client.post(
        "/api/items/comparison/result",
        params={"session_id": draft["session_id"]},
        json={"result": "better", "revision": 0},
        headers=auth_headers,
    )
    assert status_response.status_code == 404
    assert answer_response.status_code == 404
    assert status_response.json()["detail"] == ITEM_NOT_FOUND_ERROR


@pytest.mark.asyncio
async def test_undo_and_commit_after_candidate_row_vanishes_are_not_found(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    undo_draft = await create_draft(
        client, test_list, auth_headers, test_item, name="Undo Me"
    )
    answered = await answer(client, undo_draft, auth_headers)
    assert answered["status"] == "ready_to_commit"
    await drop_candidate_row(test_db, undo_draft["item_id"])
    undo = await client.post(
        f"/api/items/comparison/{undo_draft['session_id']}/undo",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )

    commit_draft = await create_draft(
        client, test_list, auth_headers, test_item, name="Commit Me"
    )
    answered_commit = await answer(client, commit_draft, auth_headers)
    await drop_candidate_row(test_db, commit_draft["item_id"])
    commit = await client.post(
        f"/api/items/comparison/{commit_draft['session_id']}/commit",
        json={"revision": answered_commit["revision"]},
        headers=auth_headers,
    )
    assert undo.status_code == 404
    assert commit.status_code == 404


@pytest.mark.asyncio
async def test_repeat_commit_after_candidate_row_vanishes_is_not_found(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )
    assert committed.json()["status"] == "completed"

    await drop_candidate_row(test_db, draft["item_id"])
    repeated = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": committed.json()["revision"]},
        headers=auth_headers,
    )
    assert repeated.status_code == 404


@pytest.mark.asyncio
async def test_cancel_completed_ranking_is_conflict(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )
    assert committed.json()["status"] == "completed"

    cancel = await client.delete(
        f"/api/items/comparison/{draft['session_id']}", headers=auth_headers
    )
    assert cancel.status_code == 409
    assert cancel.json()["detail"] == "Ranking has already been saved."


@pytest.mark.asyncio
async def test_cancel_is_idempotent_for_retained_draft(
    client: AsyncClient, test_item: ItemModel, auth_headers: dict[str, str]
) -> None:
    started = await client.post(
        f"/api/items/items/{test_item.item_id}/comparison-session",
        json={},
        headers=auth_headers,
    )
    session_id = started.json()["session_id"]
    first = await client.delete(
        f"/api/items/comparison/{session_id}", headers=auth_headers
    )
    second = await client.delete(
        f"/api/items/comparison/{session_id}", headers=auth_headers
    )
    assert (first.status_code, second.status_code) == (204, 204)


@pytest.mark.asyncio
async def test_live_draft_is_reused_without_resetting_progress(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    resumed = await client.post(
        f"/api/items/items/{draft['item_id']}/comparison-session",
        json={},
        headers=auth_headers,
    )
    assert resumed.status_code == 200
    assert resumed.json()["session_id"] == draft["session_id"]
    assert resumed.json()["revision"] == draft["revision"]
    assert resumed.json()["comparisons_answered"] == 0

    ready = await answer(client, resumed.json(), auth_headers)
    resumed_ready = await client.post(
        f"/api/items/items/{draft['item_id']}/comparison-session",
        json={},
        headers=auth_headers,
    )
    assert resumed_ready.status_code == 200
    assert resumed_ready.json()["session_id"] == draft["session_id"]
    assert resumed_ready.json()["status"] == "ready_to_commit"
    assert resumed_ready.json()["revision"] == ready["revision"]
    assert resumed_ready.json()["preview"] == ready["preview"]


@pytest.mark.asyncio
async def test_restart_needs_a_live_draft_and_a_revision(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    without_draft = await client.post(
        f"/api/items/items/{test_item.item_id}/comparison-session",
        json={"restart": True, "revision": 0},
        headers=auth_headers,
    )
    assert without_draft.status_code == 409
    assert without_draft.json()["detail"] == (
        "Ranking changed. Reload the current question."
    )

    draft = await create_draft(client, test_list, auth_headers, test_item)
    missing_revision = await client.post(
        f"/api/items/items/{draft['item_id']}/comparison-session",
        json={"restart": True},
        headers=auth_headers,
    )
    assert missing_revision.status_code == 422


@pytest.mark.asyncio
async def test_multi_peer_draft_keeps_asking_until_the_gap_is_unique(
    client: AsyncClient,
    test_user: User,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    target_list = await seed_list(test_db, test_user, "Multi Peer List")
    peers = await seed_ranked_items(test_db, target_list, 3)

    created = await client.post(
        "/api/items/",
        params={"list_title": target_list.title},
        json={"name": "Newcomer"},
        headers=auth_headers,
    )
    assert created.status_code == 200
    draft = created.json()
    assert draft["status"] == "active"
    assert draft["comparison_limit"] == 2
    assert draft["current_comparison"]["target_item"]["name"] == peers[1].name

    still_asking = await answer(client, draft, auth_headers)
    assert still_asking["status"] == "active"
    assert still_asking["comparisons_answered"] == 1
    assert still_asking["current_comparison"]["target_item"]["name"] == peers[2].name

    ready = await answer(client, still_asking, auth_headers, result="worse")
    assert ready["status"] == "ready_to_commit"
    assert ready["preview"] == {"score": 6.7, "rank": 2, "ranked_count": 4}

    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": ready["revision"]},
        headers=auth_headers,
    )
    assert committed.status_code == 200
    assert committed.json()["status"] == "completed"
    assert committed.json()["preview"] == ready["preview"]
    candidate = await test_db.get(ItemModel, uuid.UUID(draft["item_id"]))
    assert candidate is not None
    await test_db.refresh(candidate)
    assert candidate.rating == ready["preview"]["score"] == 6.7
    assert peers[1].position < candidate.position < peers[2].position
    for peer, expected in zip(peers, [0.0, 3.3, 10.0], strict=True):
        await test_db.refresh(peer)
        assert peer.rating == expected


@pytest.mark.asyncio
async def test_undo_without_history_is_conflict(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    conflict = await client.post(
        f"/api/items/comparison/{draft['session_id']}/undo",
        json={"revision": draft["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "There is no answer to undo."


@pytest.mark.asyncio
async def test_undo_after_completion_is_conflict(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )
    conflict = await client.post(
        f"/api/items/comparison/{draft['session_id']}/undo",
        json={"revision": committed.json()["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Ranking changed. Reload the current question."


@pytest.mark.asyncio
async def test_undo_after_list_change_is_conflict_and_keeps_draft(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    test_item.position = "z0"
    await test_db.commit()

    conflict = await client.post(
        f"/api/items/comparison/{draft['session_id']}/undo",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "The list changed. Restart ranking to continue."
    status_response = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status", headers=auth_headers
    )
    assert status_response.json()["revision"] == answered["revision"]
    assert status_response.json()["comparisons_answered"] == 1


@pytest.mark.asyncio
async def test_commit_before_ready_is_conflict(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    conflict = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": draft["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Ranking changed. Reload the current question."


@pytest.mark.asyncio
async def test_commit_after_list_change_is_conflict_without_ranking_candidate(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    test_item.position = "z0"
    await test_db.commit()

    conflict = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": answered["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "The list changed. Restart ranking to continue."
    candidate = await test_db.get(ItemModel, uuid.UUID(draft["item_id"]))
    assert candidate is not None
    await test_db.refresh(candidate)
    assert candidate.position is None
    assert candidate.rating is None


@pytest.mark.asyncio
async def test_answer_on_ready_draft_is_conflict(
    client: AsyncClient,
    test_list: ListModel,
    test_item: ItemModel,
    auth_headers: dict[str, str],
) -> None:
    draft = await create_draft(client, test_list, auth_headers, test_item)
    answered = await answer(client, draft, auth_headers)
    assert answered["status"] == "ready_to_commit"

    conflict = await client.post(
        "/api/items/comparison/result",
        params={"session_id": draft["session_id"]},
        json={"result": "worse", "revision": answered["revision"]},
        headers=auth_headers,
    )
    assert conflict.status_code == 409
    status_response = await client.get(
        f"/api/items/comparison/{draft['session_id']}/status", headers=auth_headers
    )
    assert status_response.json()["revision"] == answered["revision"]


@pytest.mark.asyncio
async def test_reranking_bottom_to_top_rescores_entire_list(
    client: AsyncClient,
    test_user: User,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    target_list = await seed_list(test_db, test_user, "Reranked List")
    items = await seed_ranked_items(test_db, target_list, 5)
    mover = items[0]
    list_url = f"/api/lists/{target_list.list_id}/items"
    before_response = await client.get(list_url, headers=auth_headers)
    assert before_response.status_code == 200
    before = before_response.json()
    assert [item["item_id"] for item in before] == [
        str(item.item_id) for item in reversed(items)
    ]
    assert [item["rating"] for item in before] == [10.0, 7.5, 5.0, 2.5, 0.0]

    started = await client.post(
        f"/api/items/items/{mover.item_id}/comparison-session",
        json={},
        headers=auth_headers,
    )
    assert started.status_code == 200
    draft = started.json()
    assert draft["discard_on_cancel"] is False
    assert draft["current_comparison"]["target_item"]["item_id"] == str(
        items[3].item_id
    )

    still_asking = await answer(client, draft, auth_headers)
    assert still_asking["status"] == "active"
    assert still_asking["current_comparison"]["target_item"]["item_id"] == str(
        items[4].item_id
    )
    ready = await answer(client, still_asking, auth_headers)
    assert ready["status"] == "ready_to_commit"
    assert ready["preview"] == {"score": 10.0, "rank": 1, "ranked_count": 5}
    assert (await client.get(list_url, headers=auth_headers)).json() == before

    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": ready["revision"]},
        headers=auth_headers,
    )
    assert committed.status_code == 200
    assert committed.json()["status"] == "completed"
    assert committed.json()["preview"] == ready["preview"]
    ranked_response = await client.get(list_url, headers=auth_headers)
    assert ranked_response.status_code == 200
    ranked = ranked_response.json()
    assert [item["item_id"] for item in ranked] == [
        str(item.item_id) for item in [mover, *reversed(items[1:])]
    ]
    assert [item["rating"] for item in ranked] == [10.0, 7.5, 5.0, 2.5, 0.0]
    assert ranked[0]["rating"] == ready["preview"]["score"]


@pytest.mark.asyncio
async def test_unranked_item_immediately_readies_and_commits_in_empty_list(
    client: AsyncClient,
    test_user: User,
    auth_headers: dict[str, str],
    test_db: AsyncSession,
) -> None:
    target_list = await seed_list(test_db, test_user, "Orphan List")
    orphan = ItemModel(
        item_id=uuid.uuid4(),
        list_id=target_list.list_id,
        name="Orphan",
        description="",
        image_url=None,
        position=None,
        rating=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    test_db.add(orphan)
    await test_db.commit()

    no_draft = await client.get(
        f"/api/items/items/{orphan.item_id}/comparison-session", headers=auth_headers
    )
    assert no_draft.json() is None

    started = await client.post(
        f"/api/items/items/{orphan.item_id}/comparison-session",
        json={},
        headers=auth_headers,
    )
    assert started.status_code == 200
    draft = started.json()
    assert draft["status"] == "ready_to_commit"
    assert draft["comparisons_answered"] == 0
    assert draft["comparison_limit"] == 0
    assert draft["can_undo"] is False
    assert draft["current_comparison"] is None
    assert draft["preview"] == {"score": 10.0, "rank": 1, "ranked_count": 1}
    assert draft["item"]["position"] is None
    assert draft["item"]["rating"] is None

    committed = await client.post(
        f"/api/items/comparison/{draft['session_id']}/commit",
        json={"revision": draft["revision"]},
        headers=auth_headers,
    )
    assert committed.status_code == 200
    assert committed.json()["status"] == "completed"
    assert committed.json()["preview"] == draft["preview"]
    await test_db.refresh(orphan)
    assert orphan.rating == draft["preview"]["score"] == 10.0
    assert orphan.position is not None
