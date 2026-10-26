## Testing

- **Framework**: `pytest` with `pytest-asyncio` for async support
- **Test Database**: SQLite in-memory for fast, isolated tests
- **HTTP Client**: `httpx.AsyncClient` for endpoint testing
- **Test Files**:
  - `tests/conftest.py` — Test configuration and fixtures
  - `tests/test_users.py` — User endpoint tests
  - `tests/test_lists.py` — List endpoint tests
  - `tests/test_items.py` — Item endpoint tests
  - `tests/app/utils/test_algorithm.py` — Algorithm tests

```bash
uv sync --group dev                                 # Install dev deps
uv run pytest                                       # All tests
uv run pytest tests/test_users.py -v                # Single file
uv run pytest tests/test_users.py -k google           # Google sign-in tests
uv run pytest --cov=app --cov-report=html           # Coverage report
```

### Coverage Areas

- **Users**: Google sign-in, tokens, current user, invalid tokens, and authorization
- **Lists**: CRUD, pagination, authorization (cross-user access denied)
- **Items**: CRUD, comparison workflow (better/worse), session management, authorization
- **Algorithm**: binary search ranking, winner/loser logic, range narrowing, edge cases
