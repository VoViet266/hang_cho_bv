const normalizeRoomId = (value) => {
    if (typeof value !== 'string') {
        throw new Error('Invalid room id');
    }

    const trimmed = value.trim();
    const isSafe = /^[A-Za-z0-9_-]{1,50}$/.test(trimmed);

    if (!isSafe) {
        throw new Error('Invalid room id');
    }

    return trimmed;
};

module.exports = {
    normalizeRoomId,
};
