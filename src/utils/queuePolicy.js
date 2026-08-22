const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const parseQueueTime = (value) => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

const isPatientOverdue = (patient, now = Date.now()) => {
    if (!patient) return false;
    const queuedAt = parseQueueTime(patient.ngaydk);
    if (queuedAt === null) return false;
    return (now - queuedAt) >= FIFTEEN_MINUTES_MS;
};

/**
 * Nếu bệnh nhân đứng đầu (index 0) đã chờ quá 15 phút mà chưa vào khám:
 * Đẩy bệnh nhân đứng đầu sang vị trí thứ 2 (hoán đổi với bệnh nhân đứng thứ 2).
 */
const demoteFirstOverduePatient = (patients = [], now = Date.now()) => {
    if (!Array.isArray(patients) || patients.length < 2) return patients;
    const ordered = [...patients];

    if (ordered[0] && ordered[0].dakham == 0 && isPatientOverdue(ordered[0], now)) {
        const first = ordered[0];
        ordered[0] = ordered[1];
        ordered[1] = first;
    }

    return ordered;
};

module.exports = {
    FIFTEEN_MINUTES_MS,
    parseQueueTime,
    isPatientOverdue,
    demoteFirstOverduePatient,
};
