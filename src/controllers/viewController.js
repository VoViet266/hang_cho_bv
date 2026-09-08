const dashboardService = require("../services/dashboardService");
const psdangkyService = require("../services/psdangkyService");
const cdhaService = require("../services/cdhaService");

const getDashboard = async (req, res) => {
  try {
    const stats = await dashboardService.fetchDashboardStats();
    res.render("index", { data: stats });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("Error loading dashboard: " + (error.message || String(error)));
  }
};

const getRoom = async (req, res) => {
  try {
    const currentRoomId = req.params.id;
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
    const currentRoomId = req.params.tenphong;
    const rawRoomsParam = req.query.rooms || req.query.r || "";

    const cdhaStats = await cdhaService.LayDanhSachCacPhongCDHA();
    const allAvailableRooms = (cdhaStats.rooms || []).map((r) => ({
      id: r.tenphong,
      name: r.tenphong,
    }));

    let selectedRoomIds = [];
    if (rawRoomsParam) {
      selectedRoomIds = rawRoomsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (currentRoomId) {
      // Mặc định hiển thị 1 phòng đã chọn, sau đó người dùng có thể bấm M để chọn thêm tối đa 4 phòng
      selectedRoomIds = [currentRoomId];
    } else {
      selectedRoomIds =
        allAvailableRooms.length > 0
          ? [allAvailableRooms[0].id]
          : ["Phòng Siêu âm 1"];
    }

    // Trên TV chia màn hình tối đa chỉ 4 phòng
    selectedRoomIds = Array.from(new Set(selectedRoomIds)).slice(0, 4);

    const roomsData = await Promise.all(
      selectedRoomIds.map(async (id) => {
        return await cdhaService.LayDanhSachBenhNhanChoCDHA(id);
      }),
    );

    res.render("cdha", {
      currentRoomId: currentRoomId || selectedRoomIds[0] || "CDHA",
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

const getMultiRoomView = async (req, res) => {
  try {
    const roomType = req.query.type === "cdha" ? "cdha" : "room";
    const rawRoomsParam = req.query.rooms || req.query.r || "";

    let allAvailableRooms = [];
    if (roomType === "cdha") {
      const cdhaStats = await cdhaService.LayDanhSachCacPhongCDHA();
      allAvailableRooms = (cdhaStats.rooms || []).map((r) => ({
        id: r.tenphong,
        name: r.tenphong,
      }));
    } else {
      const dashboardStats = await dashboardService.fetchDashboardStats();
      allAvailableRooms = (dashboardStats.rooms || []).map((r) => ({
        id: r.maphong,
        name: r.tenphong || r.maphong,
      }));
    }

    let selectedRoomIds = rawRoomsParam
      ? rawRoomsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

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
};
