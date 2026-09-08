const cdhaService = require('../services/cdhaService');
const socketService = require('../services/socketService');
const logger = require('../config/logger');

const hidePatient = async (req, res, next) => {
    try {
        const { makb, mabn, tenphong } = req.body;
        if (!tenphong || (!makb && !mabn)) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin phòng hoặc bệnh nhân (cần makb/mabn và tenphong)'
            });
        }

        await cdhaService.AnBenhNhanCDHA({ makb, mabn, tenphong });
        logger.info(`[CDHA] Đã ẩn bệnh nhân (${makb || mabn}) tại phòng ${tenphong} trực tiếp vào database`);

        // Broadcast cập nhật tức thì qua Socket.IO tới các màn hình
        await socketService.checkAndBroadcastRoom('cdha', tenphong, true);
        await socketService.checkAndBroadcastRoom('cdha_dashboard', '', true);

        return res.json({
            success: true,
            message: 'Đã ẩn bệnh nhân CĐHA thành công'
        });
    } catch (err) {
        logger.error(`[CDHA] Lỗi khi ẩn bệnh nhân vào DB: ${err.message}`);
        next(err);
    }
};

const restorePatient = async (req, res, next) => {
    try {
        const { makb, mabn, tenphong } = req.body;
        if (!tenphong || (!makb && !mabn)) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin phòng hoặc bệnh nhân (cần makb/mabn và tenphong)'
            });
        }

        await cdhaService.KhoiPhucBenhNhanCDHA({ makb, mabn, tenphong });
        logger.info(`[CDHA] Đã khôi phục bệnh nhân (${makb || mabn}) tại phòng ${tenphong} trong database`);

        // Broadcast cập nhật tức thì qua Socket.IO
        await socketService.checkAndBroadcastRoom('cdha', tenphong, true);
        await socketService.checkAndBroadcastRoom('cdha_dashboard', '', true);

        return res.json({
            success: true,
            message: 'Đã khôi phục bệnh nhân CĐHA thành công'
        });
    } catch (err) {
        logger.error(`[CDHA] Lỗi khi khôi phục bệnh nhân trong DB: ${err.message}`);
        next(err);
    }
};

const restoreAllPatients = async (req, res, next) => {
    try {
        const { tenphong, rooms } = req.body;
        await cdhaService.KhoiPhucTatCaCDHA({ tenphong, rooms });
        logger.info(`[CDHA] Đã khôi phục tất cả bệnh nhân cho phòng: ${JSON.stringify(rooms || tenphong || 'ALL')}`);

        // Broadcast cập nhật tới các phòng liên quan
        let roomList = [];
        if (Array.isArray(rooms)) {
            roomList = rooms;
        } else if (typeof rooms === 'string') {
            roomList = rooms.split(',').map(r => r.trim()).filter(Boolean);
        } else if (tenphong) {
            roomList = [tenphong];
        }

        for (const r of roomList) {
            await socketService.checkAndBroadcastRoom('cdha', r, true);
        }
        await socketService.checkAndBroadcastRoom('cdha_dashboard', '', true);

        return res.json({
            success: true,
            message: 'Đã khôi phục tất cả bệnh nhân CĐHA thành công'
        });
    } catch (err) {
        logger.error(`[CDHA] Lỗi khi khôi phục tất cả bệnh nhân: ${err.message}`);
        next(err);
    }
};

const getHiddenPatients = async (req, res, next) => {
    try {
        const { rooms, tenphong } = req.query;
        const targetRooms = rooms || tenphong || '';
        const list = await cdhaService.LayDanhSachBenhNhanDaAnCDHA(targetRooms);
        return res.json({
            success: true,
            data: list
        });
    } catch (err) {
        logger.error(`[CDHA] Lỗi khi lấy danh sách đã ẩn: ${err.message}`);
        next(err);
    }
};

module.exports = {
    hidePatient,
    restorePatient,
    restoreAllPatients,
    getHiddenPatients
};
