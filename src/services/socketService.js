const { Server } = require("socket.io");
const crypto = require("node:crypto");
const logger = require("../config/logger");
const psdangkyService = require("./psdangkyService");
const cdhaService = require("./cdhaService");
const dashboardService = require("./dashboardService");

let io = null;
const roomDataCache = new Map(); // key -> hash of JSON
let pollingTimeout = null;
let isPolling = false;
const POLLING_INTERVAL_MS = 3000;

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

function cleanupIfEmpty(channelName) {
  if (!io) return;
  const room = io.sockets.adapter.rooms.get(channelName);
  if (!room || room.size === 0) {
    roomDataCache.delete(channelName);
  }
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

  // 1. Quét dọn các cache của phòng không còn ai kết nối
  for (const cachedChannel of roomDataCache.keys()) {
    const activeRoom = adapterRooms.get(cachedChannel);
    if (!activeRoom || activeRoom.size === 0) {
      roomDataCache.delete(cachedChannel);
    }
  }

  // 2. Cập nhật dữ liệu cho các phòng đang có client hoạt động
  for (const [channelName, sockets] of adapterRooms.entries()) {
    if (!sockets || sockets.size === 0) continue;
    // Bỏ qua room ID mặc định của từng socket connection
    if (!channelName.includes(":")) continue;

    const [roomType, ...rest] = channelName.split(":");
    const roomId = rest.join(":");
    await checkAndBroadcastRoom(roomType, roomId);
  }
}

async function runPollingCycle() {
  if (isPolling || !io) return;
  isPolling = true;
  try {
    await pollActiveRooms();
  } catch (err) {
    logger.error(`[Socket] Lỗi trong chu kỳ polling: ${err.message}`);
  } finally {
    isPolling = false;
    // Chỉ hẹn giờ chu kỳ tiếp theo sau khi chu kỳ trước đã hoàn tất 100% (chống dồn toa/overlap)
    if (io) {
      pollingTimeout = setTimeout(runPollingCycle, POLLING_INTERVAL_MS);
    }
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

      // Gửi ngay dữ liệu hiện tại tới riêng client vừa kết nối.
      // LƯU Ý: KHÔNG gán roomDataCache.set ở đây để tránh làm mất vết thay đổi
      // của các TV khác đang mở trong chu kỳ broadcast tiếp theo.
      try {
        const data = await fetchRoomData(roomType, roomId);
        if (data) {
          socket.emit("room_data_updated", {
            roomType,
            roomId,
            data,
            timestamp: Date.now(),
          });
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
      cleanupIfEmpty(channelName);
    });

    socket.on("disconnecting", () => {
      for (const roomName of socket.rooms) {
        if (roomName !== socket.id && roomName.includes(":")) {
          // Kiểm tra và dọn dẹp sau khi socket ngắt kết nối
          setTimeout(() => cleanupIfEmpty(roomName), 50);
        }
      }
    });

    socket.on("broadcast_speak", (params) => {
      if (!params || !params.patientName) return;
      const { roomType, roomId, patientName, roomName } = params;
      const channelName = getRoomKey(roomType || "room", roomId);
      logger.info(
        `[Socket] Phát loa gọi bệnh nhân phòng ${channelName}: "${patientName}" -> "${roomName || ""}"`,
      );
      // Chuyển tiếp tới tất cả các màn hình khác trong cùng phòng khám
      socket.to(channelName).emit("trigger_speak", {
        roomType: roomType || "room",
        roomId: roomId || "",
        patientName,
        roomName: roomName || "",
        timestamp: Date.now(),
      });
    });
  });

  // Khởi chạy chu kỳ polling không chồng chéo
  if (!pollingTimeout) {
    pollingTimeout = setTimeout(runPollingCycle, POLLING_INTERVAL_MS);
  }

  logger.info("[Socket.IO] Dịch vụ Real-time khởi tạo thành công (polling 3s không chồng chéo cho Active Rooms)");
  return io;
}

function close() {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
  }
  isPolling = false;
  if (io) {
    io.close();
    io = null;
  }
  roomDataCache.clear();
}

module.exports = {
  init,
  checkAndBroadcastRoom,
  close,
  _getRoomDataCache: () => roomDataCache,
  _runPollingCycle: runPollingCycle,
};
