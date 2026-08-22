const test = require('node:test');
const assert = require('node:assert/strict');
const { demoteFirstOverduePatient, FIFTEEN_MINUTES_MS } = require('../src/utils/queuePolicy');

test('demoteFirstOverduePatient leaves recent patients unchanged', () => {
    const now = Date.now();
    const patients = [
        { makb: 'KB1', ngaydk: new Date(now - 5 * 60 * 1000).toISOString(), dakham: 0 },
        { makb: 'KB2', ngaydk: new Date(now - 3 * 60 * 1000).toISOString(), dakham: 0 },
    ];

    const result = demoteFirstOverduePatient(patients, now);
    assert.equal(result[0].makb, 'KB1');
    assert.equal(result[1].makb, 'KB2');
});

test('demoteFirstOverduePatient demotes first patient if waiting over 15 minutes', () => {
    const now = Date.now();
    const patients = [
        { makb: 'KB1', ngaydk: new Date(now - 20 * 60 * 1000).toISOString(), dakham: 0 },
        { makb: 'KB2', ngaydk: new Date(now - 3 * 60 * 1000).toISOString(), dakham: 0 },
    ];

    const result = demoteFirstOverduePatient(patients, now);
    assert.equal(result[0].makb, 'KB2');
    assert.equal(result[1].makb, 'KB1');
});
