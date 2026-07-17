const dashboardModel = require('../models/dashboard.model');

const createRoomSummary = (roomInfo = {}) => ({
    maphong: roomInfo.maphong,
    tenphong: roomInfo.tenphong,
    mack: roomInfo.mack,
    tenck: roomInfo.tenck || 'Chưa phân khoa',
    totalRegistered: 0,
    totalDKPlus: 0,
    totalWaiting: 0,
    waitingList: [],
    examinedList: []
});

const normalizePatientDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
};

const buildDashboardState = ({ roomsFromDB, initialRegs, rows }) => {
    const roomsMap = {};

    roomsFromDB.forEach((room) => {
        roomsMap[room.maphong] = createRoomSummary(room);
    });

    initialRegs.forEach((reg) => {
        if (roomsMap[reg.maphong]) {
            roomsMap[reg.maphong].totalRegistered = Number(reg.count_dk || 0);
            roomsMap[reg.maphong].totalDKPlus = Number(reg.count_dk || 0);
        }
    });

    const currentHour = new Date().getHours();
    const hr = currentHour - 2;

    rows.forEach((row) => {
        const isExamined = Number(row.dakham || 0) !== 0;
        const effectiveRoom = row.effective_maphong || row.maphong;
        const registeredRoom = row.registered_maphong || effectiveRoom;
        const isTransferIn = registeredRoom && effectiveRoom && registeredRoom !== effectiveRoom;

        if (!roomsMap[effectiveRoom]) {
            roomsMap[effectiveRoom] = createRoomSummary({
                maphong: effectiveRoom,
                tenphong: row.tenphong,
            });
        }

        const room = roomsMap[effectiveRoom];
        const actualNgayDk = normalizePatientDate(row.ngaydk);
        const actualNgayKcb = normalizePatientDate(row.ngaykcb) || actualNgayDk;

        if (!isExamined && actualNgayKcb && actualNgayKcb.getHours() < hr) {
            return;
        }

        const patientData = {
            makb: row.makb,
            mabn: row.mabn,
            holot: row.holot,
            ten: row.ten,
            ngaysinh: row.ngaysinh,
            gioitinh: row.gioitinh,
            ngaydk: actualNgayDk,
            dakham: Number(row.dakham || 0),
            maphong: effectiveRoom,
        };

        if (isExamined) {
            room.examinedList.push(patientData);
        } else {
            room.totalWaiting += 1;
            room.waitingList.push(patientData);
        }

        if (isTransferIn) {
            room.totalDKPlus += 1;
        }
    });

    const totalRegistered = Object.values(roomsMap).reduce((sum, room) => sum + room.totalRegistered, 0);
    const totalDKPlus = Object.values(roomsMap).reduce((sum, room) => sum + room.totalDKPlus, 0);
    const totalWaiting = Object.values(roomsMap).reduce((sum, room) => sum + room.totalWaiting, 0);

    const departments = {};
    Object.values(roomsMap).forEach((room) => {
        const firstChar = room.maphong.charAt(0).toUpperCase();
        const isLetter = /^[A-Z]$/.test(firstChar);
        const deptId = isLetter ? `Block ${firstChar}` : 'Khác';

        if (!departments[deptId]) {
            departments[deptId] = {
                mack: deptId,
                tenck: deptId,
                rooms: []
            };
        }
        departments[deptId].rooms.push(room);
    });

    const departmentsList = Object.values(departments).sort((a, b) => {
        if (a.mack === 'Khác') return 1;
        if (b.mack === 'Khác') return -1;
        return a.tenck.localeCompare(b.tenck);
    });

    departmentsList.forEach((dept) => {
        dept.rooms.sort((a, b) => a.maphong.localeCompare(b.maphong));
    });

    return {
        overview: {
            totalRegistered,
            totalDKPlus,
            totalWaiting,
        },
        departments: departmentsList,
        rooms: Object.values(roomsMap),
    };
};

const getDashboardStats = async () => {
    const rows = await dashboardModel.getDashboardData();
    const roomsFromDB = await dashboardModel.getAllRooms();
    const initialRegs = await dashboardModel.getInitialRegistrations();

    return buildDashboardState({ roomsFromDB, initialRegs, rows });
};

module.exports = {
    getDashboardStats,
    buildDashboardState,
};
