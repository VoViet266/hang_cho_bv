const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRoomViewModel } = require('../src/services/psdangkyService');

test('buildRoomViewModel flattens waiting patients into the format used by the room view', () => {
    const rows = [
        {
            maphong: 'P101',
            tenphong: 'Phòng 1',
            psdangky: [
                {
                    makb: 'KB001',
                    ngaydk: '2026-07-29 08:30:00',
                    dmbenhnhan: {
                        mabn: 'BN001',
                        holot: 'Nguyễn Văn',
                        ten: 'An',
                        ngaysinh: '1990-01-01',
                        gioitinh: 1,
                    },
                },
            ],
        },
    ];

    const result = buildRoomViewModel('P101', rows, { tenphong: 'Phòng 1' });

    assert.equal(result.totalWaiting, 1);
    assert.equal(result.totalDKPlus, 1);
    assert.equal(result.waitingList[0].mabn, 'BN001');
    assert.equal(result.waitingList[0].holot, 'Nguyễn Văn');
    assert.equal(result.waitingList[0].ten, 'An');
});
