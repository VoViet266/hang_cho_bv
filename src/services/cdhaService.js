const cdhaModel = require('../models/cdha.model');
const roomHelper = require('../utils/roomHelper');

const DinhDangNgaySinh = (dateVal) => {
    if (!dateVal) return 'Chưa cập nhật';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Chưa cập nhật';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const DinhDangGioPhut = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
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
    const canonicalName = roomHelper.resolveCdhaRoomName(tenphong);

    const [rawData, rawHidden] = await Promise.all([
        cdhaModel.LayDanhSachHangChoCDHA(canonicalName),
        cdhaModel.LayDanhSachBenhNhanDaAnCDHA(canonicalName).catch(() => [])
    ]);

    const waitingList = (rawData || []).map(p => {
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
            tenphong: canonicalName,
            ghichu: p.ghichu,
            dakham: 0,
        };
    });

    const hiddenList = (rawHidden || []).map(p => {
        const pName = `${p.holot || ''} ${p.ten || ''}`.trim();
        return {
            makb: p.makb,
            mabn: p.mabn,
            name: pName || p.makb || p.mabn,
            room: canonicalName,
            time: p.ngaynhap ? DinhDangGioPhut(p.ngaynhap) : '',
            key: p.makb || p.mabn || pName,
        };
    });

    const room = {
        tenphong: canonicalName,
        totalWaiting: waitingList.length,
        waitingList,
        hiddenList,
    };
    
    return room;
};

const LayDanhSachCacPhongCDHA = async () => {
    const rawRooms = await cdhaModel.LayDanhSachPhongCDHA();
    const rooms = (rawRooms || []).map(r => {
        const alias = roomHelper.resolveCdhaRoomAlias(r.tenphong);
        return {
            ...r,
            alias: alias || '',
            displayName: alias ? `Phòng ${alias} - ${r.tenphong}` : r.tenphong,
        };
    });

    return {
        overview: {
            tong_cho_kham: rooms.reduce((sum, r) => sum + Number(r.tong_cho_kham || 0), 0),
        },
        rooms: rooms
    };
};

const AnBenhNhanCDHA = async ({ makb, mabn, tenphong }) => {
    return await cdhaModel.AnBenhNhanCDHA(makb, mabn, tenphong);
};

const KhoiPhucBenhNhanCDHA = async ({ makb, mabn, tenphong }) => {
    return await cdhaModel.KhoiPhucBenhNhanCDHA(makb, mabn, tenphong);
};

const KhoiPhucTatCaCDHA = async ({ tenphong, rooms }) => {
    const target = rooms || tenphong;
    return await cdhaModel.KhoiPhucTatCaCDHA(target);
};

const LayDanhSachBenhNhanDaAnCDHA = async (tenphongList) => {
    const rawHidden = await cdhaModel.LayDanhSachBenhNhanDaAnCDHA(tenphongList);
    return (rawHidden || []).map(p => {
        const pName = `${p.holot || ''} ${p.ten || ''}`.trim();
        return {
            makb: p.makb,
            mabn: p.mabn,
            name: pName || p.makb || p.mabn,
            room: p.tenphong || '',
            time: p.ngaynhap ? DinhDangGioPhut(p.ngaynhap) : '',
            key: p.makb || p.mabn || pName,
        };
    });
};

module.exports = {
    LayDanhSachBenhNhanChoCDHA,
    LayDanhSachCacPhongCDHA,
    AnBenhNhanCDHA,
    KhoiPhucBenhNhanCDHA,
    KhoiPhucTatCaCDHA,
    LayDanhSachBenhNhanDaAnCDHA
};
