const psdangkyModel = require('../models/psdangky.model');

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

const KiemTraUuTien = (ngaysinh, gioitinh) => {
    if (!ngaysinh) return false;
    const d = new Date(ngaysinh);
    if (isNaN(d.getTime())) return false;
    
    const now = new Date();

    //Ưu tiên người cao tuổi (từ 75 tuổi trở lên)
    const seventyFiveYearsAgo = new Date(now);
    seventyFiveYearsAgo.setFullYear(now.getFullYear() - 75);
    const isElderly = d <= seventyFiveYearsAgo;

    // Ưu tiên trẻ em (dưới 6 tuổi)
    // const sixYearsAgo = new Date(now);
    // sixYearsAgo.setFullYear(now.getFullYear() - 6);
    // const isChild = d >= sixYearsAgo;

    // //Ưu tiên phụ nữ mang thai
    // const isPregnancy = gioitinh === 2 && (isElderly || isChild);

    return isElderly;
};

const LayDanhSachBenhNhanChoCuaPhong = async (maphong) => {
    const data = await psdangkyModel.LayDanhSachBenhNhanChoTheoPhongId(maphong);
    
    if (!data || data.length === 0) {
        const roomInfo = await psdangkyModel.LayThongTinPhong(maphong);
        if (!roomInfo) return null; // Room completely invalid
        
        return {
            maphong: roomInfo.maphong,
            tenphong: roomInfo.tenphong,
            totalDKPlus: 0,
            totalWaiting: 0,
            waitingList: []
        };
    }
    
    const row = data[0];
    const rawPatients = row.psdangky || [];
    
    const room = {
        maphong: row.maphong,
        tenphong: row.tenphong,
        totalDKPlus: rawPatients.length,
        totalWaiting: rawPatients.length,
        waitingList: rawPatients.map(p => {
            const ngaysinh = p.dmbenhnhan ? p.dmbenhnhan.ngaysinh : null;
            const gioitinh = p.dmbenhnhan ? p.dmbenhnhan.gioitinh : null;
            
            return {
                makb: p.makb,
                mabn: p.dmbenhnhan ? p.dmbenhnhan.mabn : null,
                holot: p.dmbenhnhan ? p.dmbenhnhan.holot : '',
                ten: p.dmbenhnhan ? p.dmbenhnhan.ten : '',
                ngaysinh: ngaysinh,
                dobStr: DinhDangNgaySinh(ngaysinh),
                gioitinh: gioitinh,
                genderStr: LayChuoiGioiTinh(gioitinh),
                isPriority: KiemTraUuTien(ngaysinh, gioitinh),
                ngaydk: p.ngaydk,
                dakham: 0
            };
        })
    };
    
    return room;
};

module.exports = {
    LayDanhSachBenhNhanChoCuaPhong,
};
