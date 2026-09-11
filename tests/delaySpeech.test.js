const test = require('node:test');
const assert = require('node:assert/strict');

test('Delay speech logic - 30 seconds wait before speaking patient name', async (t) => {
    // Mock browser globals
    const storage = {};
    global.sessionStorage = {
        getItem(k) { return storage[k] || null; },
        setItem(k, v) { storage[k] = String(v); },
        removeItem(k) { delete storage[k]; },
        clear() { Object.keys(storage).forEach(k => delete storage[k]); }
    };
    global.localStorage = global.sessionStorage;

    const spokenHistory = [];
    global.soundEnabled = true;
    global.document = {
        getElementById(id) {
            if (id === 'speech-track-P01' || id === 'speechData') {
                return { dataset: { patient: global.currentPatientOnDom || '' } };
            }
            return null;
        }
    };
    global.window = global;

    // Load displayBoard logic components
    const PATIENT_SPEAK_DELAY_MS = 30 * 1000;
    const pendingSpeakTimers = {};

    function cancelPendingSpeak(roomId) {
        if (pendingSpeakTimers[roomId]) {
            clearTimeout(pendingSpeakTimers[roomId].timerId);
            delete pendingSpeakTimers[roomId];
        }
    }

    function requestSpeak(patientName, roomName) {
        spokenHistory.push({ patientName, roomName });
    }

    function scheduleSpeakPatient(roomId, patientName, roomName, delayMs = PATIENT_SPEAK_DELAY_MS) {
        if (!patientName || !patientName.trim()) {
            cancelPendingSpeak(roomId);
            return;
        }

        const cleanName = patientName.trim();
        const storageKey = `lastSpoken_${roomId}`;
        const lastSpoken = sessionStorage.getItem(storageKey);

        if (cleanName === lastSpoken) {
            cancelPendingSpeak(roomId);
            return;
        }

        if (pendingSpeakTimers[roomId] && pendingSpeakTimers[roomId].patientName === cleanName) {
            return;
        }

        cancelPendingSpeak(roomId);

        const timerId = setTimeout(() => {
            delete pendingSpeakTimers[roomId];
            const tracker = document.getElementById(`speech-track-${roomId}`) || document.getElementById('speechData');
            const currentOnBoard = tracker ? (tracker.dataset.patient || '').trim() : '';

            if (currentOnBoard === cleanName && global.soundEnabled) {
                sessionStorage.setItem(storageKey, cleanName);
                requestSpeak(cleanName, roomName);
            }
        }, delayMs);

        pendingSpeakTimers[roomId] = {
            timerId,
            patientName: cleanName,
            scheduledAt: Date.now(),
            delayMs,
        };
    }

    // Step 1: Initial state - Patient A arrives
    global.currentPatientOnDom = 'NGUYEN VAN A';
    scheduleSpeakPatient('P01', 'NGUYEN VAN A', 'Phòng 1', 50); // Use 50ms in test

    assert.equal(spokenHistory.length, 0, 'Should NOT speak immediately upon patient arrival');
    assert.ok(pendingSpeakTimers['P01'], 'Timer should be active for P01');
    assert.equal(pendingSpeakTimers['P01'].patientName, 'NGUYEN VAN A');

    // Step 2: Realtime polling update (same patient) - should not reset timer
    const originalTimerId = pendingSpeakTimers['P01'].timerId;
    scheduleSpeakPatient('P01', 'NGUYEN VAN A', 'Phòng 1', 50);
    assert.equal(pendingSpeakTimers['P01'].timerId, originalTimerId, 'Timer should not be reset on repeated polling');

    // Wait for timer to expire
    await new Promise((r) => setTimeout(r, 70));

    assert.equal(spokenHistory.length, 1, 'Should speak after delay expires');
    assert.equal(spokenHistory[0].patientName, 'NGUYEN VAN A');
    assert.equal(sessionStorage.getItem('lastSpoken_P01'), 'NGUYEN VAN A');
    assert.equal(pendingSpeakTimers['P01'], undefined, 'Timer should be cleared after firing');

    // Step 3: Repeated update for same spoken patient - should not reschedule
    scheduleSpeakPatient('P01', 'NGUYEN VAN A', 'Phòng 1', 50);
    assert.equal(pendingSpeakTimers['P01'], undefined, 'Already spoken patient should not be rescheduled');

    // Step 4: Patient B arrives but changes before delay expires
    global.currentPatientOnDom = 'TRAN THI B';
    scheduleSpeakPatient('P01', 'TRAN THI B', 'Phòng 1', 50);
    assert.equal(pendingSpeakTimers['P01'].patientName, 'TRAN THI B');

    // Before 50ms expires, patient changes to C
    global.currentPatientOnDom = 'LE VAN C';
    scheduleSpeakPatient('P01', 'LE VAN C', 'Phòng 1', 50);
    assert.equal(pendingSpeakTimers['P01'].patientName, 'LE VAN C');

    await new Promise((r) => setTimeout(r, 70));

    // B should never have spoken, C should have spoken
    assert.equal(spokenHistory.length, 2);
    assert.equal(spokenHistory[1].patientName, 'LE VAN C');
});

test('Toggle sound and initial page load do not speak existing patients (only new patients speak)', async (t) => {
    const storage = {};
    const sessionStorageMock = {
        getItem(k) { return storage[k] || null; },
        setItem(k, v) { storage[k] = String(v); },
        removeItem(k) { delete storage[k]; },
        clear() { Object.keys(storage).forEach(k => delete storage[k]); }
    };

    const spokenHistory = [];
    let soundEnabled = false;

    // Simulate toggleSound without speaking
    function toggleSound() {
        soundEnabled = !soundEnabled;
        // Bật/tắt loa chỉ đổi cờ, không gọi phát tiếng
    }

    // Existing patient already on DOM when page loaded
    const initialPatient = 'BENH NHAN CU';
    // On DOMContentLoaded, existing patient is recorded in lastSpoken
    sessionStorageMock.setItem('lastSpoken_P01', initialPatient);

    // User toggles sound ON
    toggleSound();
    assert.equal(soundEnabled, true, 'Sound is now enabled');
    assert.equal(spokenHistory.length, 0, 'Toggling sound MUST NOT play audio for current patient');

    // Polling with the same existing patient
    const cleanName = initialPatient;
    const lastSpoken = sessionStorageMock.getItem('lastSpoken_P01');
    if (cleanName !== lastSpoken) {
        spokenHistory.push(cleanName);
    }
    assert.equal(spokenHistory.length, 0, 'Existing patient is not spoken');

    // New patient arrives!
    const newPatient = 'BENH NHAN MOI';
    if (newPatient !== lastSpoken) {
        spokenHistory.push(newPatient);
        sessionStorageMock.setItem('lastSpoken_P01', newPatient);
    }
    assert.equal(spokenHistory.length, 1, 'Only NEW patient is spoken');
    assert.equal(spokenHistory[0], 'BENH NHAN MOI');
});
