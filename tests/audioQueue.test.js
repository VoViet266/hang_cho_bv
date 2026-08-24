const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.speechSynthesis = { cancel() {}, speak() {} };
global.Audio = class {
    play() {
        return Promise.resolve();
    }

    pause() {}
};

require('../public/js/audioQueue.js');

test('AudioQueueManager ignores a repeated announcement while it is playing', () => {
    const queue = new global.AudioQueueManager({ isEnabled: () => true });

    assert.equal(queue.enqueue('Mời bệnh nhân A'), true);
    assert.equal(queue.enqueue('Mời bệnh nhân A'), false);
    assert.equal(queue.enqueue('Mời bệnh nhân B'), true);

    queue.clear();
});
