const dashboardModel = require('../models/dashboard.model');

const getDashboardStats = async () => {
    const rows = await dashboardModel.getDashboardData();
    const roomsFromDB = await dashboardModel.getAllRooms();

    // Gom nhóm theo phòng
    const roomsMap = {};

    roomsFromDB.forEach(r => {
        roomsMap[r.maphong] = {
            maphong: r.maphong,
            tenphong: r.tenphong,
            mack: r.mack,
            tenck: r.tenck || 'Chưa phân khoa',
            totalRegistered: 0,
            totalDKPlus: 0,
            totalWaiting: 0,
            waitingList: [],
            examinedList: []
        };
    });

    // Fetch initial registrations (ĐK)
    const initialRegs = await dashboardModel.getInitialRegistrations();
    initialRegs.forEach(reg => {
        if (roomsMap[reg.maphong]) {
            roomsMap[reg.maphong].totalRegistered = Number(reg.count_dk);
        }
    });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 tiếng

    rows.forEach(row => {
        // dakham = 0 is Chua kham, other values (!=0) mean examined or other state
        const isExamined = row.dakham != 0;
        
        let actualNgayDk = row.ngaydk;
        if (actualNgayDk) {
            actualNgayDk = new Date(new Date(actualNgayDk).getTime() - 7 * 60 * 60 * 1000);
        }

        // Nếu chưa khám và đã đăng ký quá 2 tiếng thì loại bỏ
        if (!isExamined && actualNgayDk) {
            if (actualNgayDk < twoHoursAgo) {
                return;
            }
        }

        const maphong = row.maphong;
        if (!roomsMap[maphong]) {
            roomsMap[maphong] = {
                maphong: maphong,
                tenphong: row.tenphong,
                mack: row.mack,
                tenck: row.tenck || 'Chưa phân khoa',
                totalRegistered: 0,
                totalDKPlus: 0,
                totalWaiting: 0,
                waitingList: [],
                examinedList: []
            };
        }

        const room = roomsMap[maphong];

        const patientData = {
            makb: row.makb,
            mabn: row.mabn,
            holot: row.holot,
            ten: row.ten,
            ngaysinh: row.ngaysinh, 
            gioitinh: row.gioitinh,
            ngaydk: actualNgayDk,
            dakham: row.dakham
        };

        if (isExamined) {
            room.totalDKPlus++;
            room.examinedList.push(patientData);
        } else {
            room.totalDKPlus++; // Chờ is also part of totalDKPlus!
            room.totalWaiting++;
            room.waitingList.push(patientData);
        }
    });

    let totalRegistered = Object.values(roomsMap).reduce((sum, room) => sum + room.totalRegistered, 0);
    let totalDKPlus = 0;
    let totalWaiting = 0;

    Object.values(roomsMap).forEach(room => {
        totalDKPlus += room.totalDKPlus;
        totalWaiting += room.totalWaiting;
    });

    const departments = {};
    Object.values(roomsMap).forEach(room => {
        // Lấy chữ cái đầu tiên làm block (VD: 'A1' -> 'A', 'B25' -> 'B')
        const firstChar = room.maphong.charAt(0).toUpperCase();
        // Kiểm tra xem ký tự đầu tiên có phải là chữ cái không
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

    departmentsList.forEach(dept => {
        dept.rooms.sort((a, b) => a.maphong.localeCompare(b.maphong));
    });

    const rooms = Object.values(roomsMap);
    
    return {
        overview: {
            totalRegistered,
            totalDKPlus,
            totalWaiting
        },
        departments: departmentsList,
        rooms
    };
};

module.exports = {
    getDashboardStats,
};
