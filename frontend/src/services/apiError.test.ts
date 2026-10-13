import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, getApiErrorMessage } from './apiError.ts';

const fallback = 'Could not save.';

test('returns a non-empty server detail unchanged', () => {
  assert.equal(
    getApiErrorMessage(
      new ApiError(409, 'Conflict', { detail: 'Duplicate name' }),
      fallback
    ),
    'Duplicate name'
  );
});

test('joins only string validation messages', () => {
  assert.equal(
    getApiErrorMessage(
      new ApiError(422, 'Unprocessable', {
        detail: [
          { msg: 'Name is required' },
          { msg: 7 },
          null,
          { msg: 'Choose a range' },
        ],
      }),
      fallback
    ),
    'Name is required, Choose a range'
  );
});

test('uses the action fallback for empty or malformed details', () => {
  assert.equal(
    getApiErrorMessage(
      new ApiError(400, 'Bad Request', { detail: '' }),
      fallback
    ),
    fallback
  );
  assert.equal(
    getApiErrorMessage(
      new ApiError(400, 'Bad Request', { detail: { msg: 'bad' } }),
      fallback
    ),
    fallback
  );
  assert.equal(
    getApiErrorMessage(
      new ApiError(422, 'Invalid', { detail: [{ msg: '' }, {}] }),
      fallback
    ),
    fallback
  );
});

test('explains network TypeErrors and falls back for other exceptions', () => {
  assert.equal(
    getApiErrorMessage(new TypeError('fetch failed'), fallback),
    'Unable to reach the server. Check your connection and try again.'
  );
  assert.equal(getApiErrorMessage(new Error('unexpected'), fallback), fallback);
});

test('preserves HTTP error fields for status handling', () => {
  const error = new ApiError(401, 'Unauthorized', { detail: 'expired' });
  assert.equal(error.name, 'ApiError');
  assert.equal(error.status, 401);
  assert.equal(error.statusText, 'Unauthorized');
  assert.deepEqual(error.data, { detail: 'expired' });
});
