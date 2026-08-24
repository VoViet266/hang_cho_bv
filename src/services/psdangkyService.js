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

const buildRoomViewModel = (maphong, data = [], roomInfo = {}, totalDKPlus) => {
    const roomData = data[0] || roomInfo;
    const rawPatients = roomData.psdangky || [];

    const waitingList = rawPatients.map((patient) => {
        const patientInfo = patient.dmbenhnhan || {};
        const { ngaysinh = null, gioitinh = null } = patientInfo;

        return {
            makb: patient.makb,
            mabn: patientInfo.mabn || null,
            holot: patientInfo.holot || '',
            ten: patientInfo.ten || '',
            ngaysinh,
            dobStr: DinhDangNgaySinh(ngaysinh),
            gioitinh,
            genderStr: LayChuoiGioiTinh(gioitinh),
            isPriority: KiemTraUuTien(ngaysinh, gioitinh),
            ngaydk: patient.ngaydk,
            dakham: 0,
        };
    });

    return {
        maphong: roomData.maphong || maphong,
        tenphong: roomData.tenphong || roomInfo.tenphong || maphong,
        totalDKPlus: totalDKPlus ?? rawPatients.length,
        totalWaiting: rawPatients.length,
        waitingList,
    };
};

const LayDanhSachBenhNhanChoCuaPhong = async (maphong) => {
    // Lấy thông số Tổng Đăng Ký từ model psdangky
    const totalDKPlus = await psdangkyModel.LayThongKeCuaPhong(maphong);
    const data = await psdangkyModel.LayDanhSachBenhNhanChoTheoPhongId(maphong);
    
    if (!data || data.length === 0) {
        const roomInfo = await psdangkyModel.LayThongTinPhong(maphong);
        if (!roomInfo) return null; // Room completely invalid
        
        return buildRoomViewModel(maphong, [], roomInfo, totalDKPlus);
    }

    return buildRoomViewModel(maphong, data, data[0], totalDKPlus);
};

module.exports = {
    buildRoomViewModel,
    LayDanhSachBenhNhanChoCuaPhong,
};
