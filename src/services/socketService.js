const { Server } = require("socket.io");
const crypto = require("node:crypto");
const logger = require("../config/logger");
const psdangkyService = require("./psdangkyService");
const cdhaService = require("./cdhaService");
const dashboardService = require("./dashboardService");

let io = null;
const roomDataCache = new Map(); // key -> hash of JSON
let pollingInterval = null;

function getRoomKey(roomType, roomId) {
  return `${roomType}:${roomId || ""}`;
}

function hashData(data) {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(data || {}))
    .digest("hex");
}

async function fetchRoomData(roomType, roomId) {
  if (roomType === "room") {
    return await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(roomId);
  }
  if (roomType === "cdha") {
    return await cdhaService.LayDanhSachBenhNhanChoCDHA(roomId);
  }
  if (roomType === "dashboard") {
    return await dashboardService.fetchDashboardStats();
  }
  if (roomType === "cdha_dashboard") {
    return await cdhaService.LayDanhSachCacPhongCDHA();
  }
  return null;
}

async function checkAndBroadcastRoom(roomType, roomId, force = false) {
  if (!io) return;
  const channelName = getRoomKey(roomType, roomId);
  const room = io.sockets.adapter.rooms.get(channelName);

  // Chỉ truy vấn khi có ít nhất 1 TV/client đang mở phòng này
  if (!room || room.size === 0) {
    roomDataCache.delete(channelName);
    return;
  }

  try {
    const data = await fetchRoomData(roomType, roomId);
    if (!data) return;

    const currentHash = hashData(data);
    const previousHash = roomDataCache.get(channelName);

    if (force || currentHash !== previousHash) {
      roomDataCache.set(channelName, currentHash);
      io.to(channelName).emit("room_data_updated", {
        roomType,
        roomId,
        data,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    logger.error(
      `[Socket] Lỗi cập nhật dữ liệu phòng ${channelName}: ${err.message}`,
    );
  }
}

async function pollActiveRooms() {
  if (!io) return;
  const adapterRooms = io.sockets.adapter.rooms;

  for (const [channelName, sockets] of adapterRooms.entries()) {
    if (!sockets || sockets.size === 0) continue;
    // Bỏ qua room ID mặc định của từng socket connection
    if (!channelName.includes(":")) continue;

    const [roomType, ...rest] = channelName.split(":");
    const roomId = rest.join(":");
    await checkAndBroadcastRoom(roomType, roomId);
  }
}

function init(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
    pingTimeout: 10000,
    pingInterval: 5000,
  });

  io.on("connection", (socket) => {
    socket.on("join_room", async (params) => {
      if (!params || !params.roomType) return;
      const { roomType, roomId } = params;
      const channelName = getRoomKey(roomType, roomId);

      socket.join(channelName);

      // Gửi ngay dữ liệu hiện tại tới client vừa kết nối
      try {
        const data = await fetchRoomData(roomType, roomId);
        if (data) {
          socket.emit("room_data_updated", {
            roomType,
            roomId,
            data,
            timestamp: Date.now(),
          });
          const hash = hashData(data);
          roomDataCache.set(channelName, hash);
        }
      } catch (e) {
        logger.error(
          `[Socket] Lỗi lấy dữ liệu ban đầu cho ${channelName}: ${e.message}`,
        );
      }
    });

    socket.on("leave_room", (params) => {
      if (!params || !params.roomType) return;
      const channelName = getRoomKey(params.roomType, params.roomId);
      socket.leave(channelName);
    });
  });

  // Chạy chu kỳ quét các phòng đang active mỗi 3 giây
  if (!pollingInterval) {
    pollingInterval = setInterval(pollActiveRooms, 3000);
  }

  logger.info("[Socket.IO] Dịch vụ Real-time khởi tạo thành công (polling 3s cho Active Rooms)");
  return io;
}

module.exports = {
  init,
  checkAndBroadcastRoom,
};
