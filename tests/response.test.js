const test = require('node:test');
const assert = require('node:assert/strict');

const { serializeForJson } = require('../src/utils/response');
const { normalizeRoomId } = require('../src/utils/roomValidation');

test('serializeForJson converts BigInt values to strings', () => {
  const input = { count: 1n, nested: { value: 2n } };

  assert.deepEqual(serializeForJson(input), { count: '1', nested: { value: '2' } });
});

test('normalizeRoomId rejects unsafe values', () => {
  assert.throws(() => normalizeRoomId('DROP TABLE users;'), /Invalid room id/);
  assert.equal(normalizeRoomId('P101'), 'P101');
});
