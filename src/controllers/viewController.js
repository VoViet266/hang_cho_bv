const dashboardService = require("../services/dashboardService");
const psdangkyService = require("../services/psdangkyService");
const cdhaService = require("../services/cdhaService");
const roomHelper = require("../utils/roomHelper");

const getDashboard = async (req, res, next) => {
  try {
    const rawRoomsParam = req.query.rooms || req.query.r || "";
    if (rawRoomsParam) {
      // Nếu có query param rooms/r trên root, kiểm tra và mở chế độ tương ứng
      if (roomHelper.isCdhaRoomParam(rawRoomsParam)) {
        return await getCdhaRoom(req, res);
      }
    }
    const stats = await dashboardService.fetchDashboardStats();
    res.render("index", { data: stats });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("Error loading dashboard: " + (error.message || String(error)));
  }
};

const getRoom = async (req, res, next) => {
  try {
    const currentRoomId = req.params.id;
    // Nếu gõ /room/1 hoặc /room/2 mà là phòng CĐHA, chuyển hướng/mở CĐHA
    if (currentRoomId && roomHelper.isCdhaRoomParam(currentRoomId)) {
      req.params.tenphong = currentRoomId;
      return await getCdhaRoom(req, res);
    }

    const rawRoomsParam = req.query.rooms || req.query.r || "";

    const dashboardStats = await dashboardService.fetchDashboardStats();
    const allAvailableRooms = (dashboardStats.rooms || []).map((r) => ({
      id: r.maphong,
      name: r.tenphong || r.maphong,
    }));

    let selectedRoomIds = rawRoomsParam
      ? rawRoomsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [currentRoomId];

    selectedRoomIds = Array.from(new Set(selectedRoomIds)).slice(0, 4);

    const roomsData = await Promise.all(
      selectedRoomIds.map(async (id) => {
        return await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(id);
      }),
    );

    res.render("room", {
      currentRoomId,
      selectedRoomIds,
      allAvailableRooms,
      room: roomsData[0] || {},
      roomsData: roomsData.filter(Boolean),
      roomType: "room",
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("Error loading room details: " + (error.message || String(error)));
  }
};

const getCdhaDashboard = async (req, res) => {
  try {
    const stats = await cdhaService.LayDanhSachCacPhongCDHA();
    res.render("cdha_index", { data: stats });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send(
        "Error loading CDHA dashboard: " + (error.message || String(error)),
      );
  }
};

const getCdhaRoom = async (req, res) => {
  try {
    const currentRoomParam = req.params.tenphong;
    const rawRoomsParam = req.query.rooms || req.query.r || "";

    const cdhaStats = await cdhaService.LayDanhSachCacPhongCDHA();
    const allAvailableRooms = (cdhaStats.rooms || []).map((r) => ({
      id: r.tenphong,
      alias: r.alias || roomHelper.resolveCdhaRoomAlias(r.tenphong),
      name: r.tenphong,
      displayName: r.displayName || r.tenphong,
    }));

    let selectedRoomIds = [];

    if (rawRoomsParam) {
      // 1. Nếu có param ?rooms=... hoặc ?r=...
      selectedRoomIds = roomHelper.parseCdhaRoomParams(rawRoomsParam);
    } else if (currentRoomParam) {
      // 2. Nếu có path param: ví dụ /1 hoặc /1,2 hoặc /1,2,3,4 hoặc /Phòng Siêu âm 1
      selectedRoomIds = roomHelper.parseCdhaRoomParams(currentRoomParam);
    }

    // 3. Mặc định: Luôn cố định 4 phòng 1, 2, 3, 4 (KHÔNG lấy động slice tránh dữ liệu rác làm lệch thứ tự)
    if (!selectedRoomIds || selectedRoomIds.length === 0) {
      selectedRoomIds = [...roomHelper.DEFAULT_CDHA_ROOMS];
    }

    // Giới hạn tối đa 4 phòng trên màn hình chia TV
    selectedRoomIds = Array.from(new Set(selectedRoomIds)).slice(0, 4);

    const roomsData = await Promise.all(
      selectedRoomIds.map(async (id) => {
        return await cdhaService.LayDanhSachBenhNhanChoCDHA(id);
      }),
    );

    const currentDisplayRoomId =
      selectedRoomIds.length === 1
        ? selectedRoomIds[0]
        : (currentRoomParam ? roomHelper.resolveCdhaRoomName(currentRoomParam) : "CDHA");

    res.render("cdha", {
      currentRoomId: currentDisplayRoomId,
      selectedRoomIds,
      allAvailableRooms,
      room: roomsData[0] || {},
      roomsData: roomsData.filter(Boolean),
      roomType: "cdha",
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send(
        "Error loading CDHA room details: " + (error.message || String(error)),
      );
  }
};

const handleShortUrl = async (req, res, next) => {
  try {
    const param = req.params.roomParam;
    if (!param) return next();

    // Bỏ qua nếu là file tĩnh hoặc API
    if (param === "api" || param.includes(".")) {
      return next();
    }

    // 1. Nếu là phòng CĐHA (1..6, hoặc danh sách '1,2', '1,2,3,4', '1-4', hoặc 'sa1', v.v.)
    if (roomHelper.isCdhaRoomParam(param)) {
      req.params.tenphong = param;
      return await getCdhaRoom(req, res);
    }

    // 2. Nếu là phòng khám lâm sàng (A1, B1, B22, v.v., case-insensitive)
    const dashboardStats = await dashboardService.fetchDashboardStats();
    const clinicRooms = dashboardStats.rooms || [];
    const matchedClinic = clinicRooms.find(
      (r) => (r.maphong || "").toLowerCase() === param.toLowerCase()
    );
    if (matchedClinic) {
      req.params.id = matchedClinic.maphong;
      return await getRoom(req, res);
    }

    // Nếu không khớp phòng nào, chuyển sang 404
    return next();
  } catch (err) {
    return next(err);
  }
};

const getMultiRoomView = async (req, res) => {
  try {
    const roomType = req.query.type === "cdha" ? "cdha" : "room";
    const rawRoomsParam = req.query.rooms || req.query.r || "";

    let allAvailableRooms = [];
    if (roomType === "cdha") {
      const cdhaStats = await cdhaService.LayDanhSachCacPhongCDHA();
      allAvailableRooms = (cdhaStats.rooms || []).map((r) => ({
        id: r.tenphong,
        alias: r.alias || roomHelper.resolveCdhaRoomAlias(r.tenphong),
        name: r.tenphong,
        displayName: r.displayName || r.tenphong,
      }));
    } else {
      const dashboardStats = await dashboardService.fetchDashboardStats();
      allAvailableRooms = (dashboardStats.rooms || []).map((r) => ({
        id: r.maphong,
        name: r.tenphong || r.maphong,
      }));
    }

    let selectedRoomIds = [];
    if (rawRoomsParam) {
      if (roomType === "cdha") {
        selectedRoomIds = roomHelper.parseCdhaRoomParams(rawRoomsParam);
      } else {
        selectedRoomIds = rawRoomsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else {
      selectedRoomIds =
        roomType === "cdha"
          ? [...roomHelper.DEFAULT_CDHA_ROOMS]
          : [];
    }

    if (selectedRoomIds.length > 4) {
      selectedRoomIds = selectedRoomIds.slice(0, 4);
    }

    const roomsData = await Promise.all(
      selectedRoomIds.map(async (roomId) => {
        if (roomType === "cdha") {
          return await cdhaService.LayDanhSachBenhNhanChoCDHA(roomId);
        } else {
          return await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(roomId);
        }
      }),
    );

    res.render("multi_room", {
      roomType,
      selectedRoomIds,
      allAvailableRooms,
      roomsData: roomsData.filter(Boolean),
    });
  } catch (error) {
    console.error("Error loading multi-room view:", error);
    res
      .status(500)
      .send(
        "Error loading multi-room view: " + (error.message || String(error)),
      );
  }
};

module.exports = {
  getDashboard,
  getRoom,
  getCdhaDashboard,
  getCdhaRoom,
  getMultiRoomView,
  handleShortUrl,
};
