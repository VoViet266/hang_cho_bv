const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: Client } = require('socket.io-client');
const socketService = require('../src/services/socketService');

test('Socket.IO - broadcast_speak triggers trigger_speak only to other clients in the same room', async (t) => {
    // Tạo HTTP server tạm thời
    const server = http.createServer();
    const ioServer = socketService.init(server);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const serverUrl = `http://localhost:${port}`;

    const makeClient = () => {
        return Client(serverUrl, {
            transports: ['websocket'],
            forceNew: true,
        });
    };

    const client1 = makeClient();
    const client2 = makeClient();
    const client3 = makeClient();

    // Chờ cả 3 client kết nối
    await Promise.all([
        new Promise((res) => client1.on('connect', res)),
        new Promise((res) => client2.on('connect', res)),
        new Promise((res) => client3.on('connect', res)),
    ]);

    // Client 1 & 2 vào phòng 'P01', Client 3 vào phòng 'P02'
    client1.emit('join_room', { roomType: 'room', roomId: 'P01' });
    client2.emit('join_room', { roomType: 'room', roomId: 'P01' });
    client3.emit('join_room', { roomType: 'room', roomId: 'P02' });

    // Đợi 50ms để socket join room hoàn tất
    await new Promise((resolve) => setTimeout(resolve, 50));

    const client1Received = [];
    const client2Received = [];
    const client3Received = [];

    client1.on('trigger_speak', (data) => client1Received.push(data));
    client2.on('trigger_speak', (data) => client2Received.push(data));
    client3.on('trigger_speak', (data) => client3Received.push(data));

    // Client 1 click gọi bệnh nhân ở phòng P01
    client1.emit('broadcast_speak', {
        roomType: 'room',
        roomId: 'P01',
        patientName: 'Nguyễn Văn A',
        roomName: 'Phòng 01',
    });

    // Chờ 100ms để sự kiện được chuyển tiếp
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Client 2 (cùng phòng P01) PHẢI nhận được trigger_speak
    assert.equal(client2Received.length, 1, 'Client 2 phải nhận được 1 sự kiện trigger_speak');
    assert.equal(client2Received[0].patientName, 'Nguyễn Văn A');
    assert.equal(client2Received[0].roomName, 'Phòng 01');
    assert.equal(client2Received[0].roomId, 'P01');

    // Client 1 (người phát lệnh) KHÔNG nhận lại (tránh đọc trùng lặp trên cùng máy)
    assert.equal(client1Received.length, 0, 'Client 1 không nhận lại trigger_speak vì đã phát loa tại chỗ');

    // Client 3 (phòng P02 khác) KHÔNG nhận được
    assert.equal(client3Received.length, 0, 'Client 3 ở phòng khác không nhận được trigger_speak');

    // Cleanup
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();
    socketService.close();
    await new Promise((resolve) => server.close(resolve));
});
