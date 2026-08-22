const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const parseQueueTime = (value) => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

const demoteFirstOverduePatient = (patients = [], now = Date.now()) => {
    const ordered = [...patients];
    if (ordered.length < 2 || ordered[0]?.dakham != 0) return ordered;

    const queuedAt = parseQueueTime(ordered[0].ngaydk);
    if (queuedAt === null || now - queuedAt < FIFTEEN_MINUTES_MS) return ordered;

    [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
    return ordered;
};

module.exports = {
    FIFTEEN_MINUTES_MS,
    demoteFirstOverduePatient,
};
