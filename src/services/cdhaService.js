const cdhaModel = require('../models/cdha.model');




const DinhDangNgaySinh = (dateVal) => {
    if (!dateVal) return 'Chưa cập nhật';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Chưa cập nhật';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const LayChuoiGioiTinh = (gioitinh) => {
    if (gioitinh == 1) return 'Nam';
    if (gioitinh == 2 || gioitinh == 0) return 'Nữ';
    return 'Khác';
};

const getPriorityLabel = (uutienFromDB) => {
    const uutienMap = {
        '1': 'Bệnh cấp cứu',
        '2': 'Khám theo yêu cầu',
        '3': 'Bệnh tàn tật',
        '4': '>=75 tuổi',
        '5': 'Có thai',
        '6': 'Trẻ em <6 tuổi'
    };
    
    // Convert to string to ensure matching
    const key = String(uutienFromDB);
    if (uutienMap[key]) {
        return uutienMap[key];
    }
    
    return null; // Not a priority
};

const LayDanhSachBenhNhanChoCDHA = async (tenphong) => {
    const rawData = await cdhaModel.LayDanhSachHangChoCDHA(tenphong);
    
    if (!rawData || rawData.length === 0) {
        return {
            tenphong: tenphong,
            totalWaiting: 0,
            waitingList: []
        };
    }

    const room = {
        tenphong: tenphong,
        totalWaiting: rawData.length,
        waitingList: rawData.map(p => {
            return {
                makb: p.makb,
                mabn: p.mabn,
                holot: p.holot || '',
                ten: p.ten || '',
                ngaysinh: p.ngaysinh,
                dobStr: DinhDangNgaySinh(p.ngaysinh),
                gioitinh: p.gioitinh,
                genderStr: LayChuoiGioiTinh(p.gioitinh),
                priorityLabel: getPriorityLabel(p.uutien),
                ngaydk: p.ngaynhap,
                tenphong: p.tenphong,
                ghichu: p.ghichu,
                dakham: 0 // Assume 0 as they are in waiting list view
            };
        })
    };
    
    return room;
};

const LayDanhSachCacPhongCDHA = async () => {
    const rooms = await cdhaModel.LayDanhSachPhongCDHA();
    return {
        overview: {
            tong_cho_kham: rooms.reduce((sum, r) => sum + Number(r.tong_cho_kham || 0), 0),
        },
        rooms: rooms
    };
};

module.exports = {
    LayDanhSachBenhNhanChoCDHA,
    LayDanhSachCacPhongCDHA,
};
