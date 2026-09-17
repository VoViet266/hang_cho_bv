/**
 * Định nghĩa và helper quản lý phòng (Khoa Chẩn Đoán Hình Ảnh - CĐHA)
 * Ánh xạ chuẩn các số 1, 2, 3, 4, 5, 6 thành từng phòng cụ thể
 */

const CDHA_ROOMS = [
  {
    id: "1",
    tenphong: "Phòng Siêu âm 1",
    shortName: "Siêu âm 1",
    displayName: "Phòng 1 (Phòng Siêu âm 1)",
    aliases: ["1", "sa1", "phong 1", "phòng 1", "phòng siêu âm 1", "phong sieu am 1"],
  },
  {
    id: "2",
    tenphong: "Phòng Siêu âm 2",
    shortName: "Siêu âm 2",
    displayName: "Phòng 2 (Phòng Siêu âm 2)",
    aliases: ["2", "sa2", "phong 2", "phòng 2", "phòng siêu âm 2", "phong sieu am 2"],
  },
  {
    id: "3",
    tenphong: "Phòng Siêu âm 3",
    shortName: "Siêu âm 3",
    displayName: "Phòng 3 (Phòng Siêu âm 3)",
    aliases: ["3", "sa3", "phong 3", "phòng 3", "phòng siêu âm 3", "phong sieu am 3"],
  },
  {
    id: "4",
    tenphong: "Phòng Siêu âm 4",
    shortName: "Siêu âm 4",
    displayName: "Phòng 4 (Phòng Siêu âm 4)",
    aliases: ["4", "sa4", "phong 4", "phòng 4", "phòng siêu âm 4", "phong sieu am 4"],
  },
  {
    id: "5",
    tenphong: "Phòng Siêu âm 5",
    shortName: "Siêu âm 5",
    displayName: "Phòng 5 (Phòng Siêu âm 5)",
    aliases: ["5", "sa5", "phong 5", "phòng 5", "phòng siêu âm 5", "phong sieu am 5"],
  },
  {
    id: "6",
    tenphong: "Phòng Siêu âm 6",
    shortName: "Siêu âm 6",
    displayName: "Phòng 6 (Phòng Siêu âm 6)",
    aliases: ["6", "sa6", "phong 6", "phòng 6", "phòng siêu âm 6", "phong sieu am 6"],
  },
];

// Danh sách 4 phòng mặc định hiển thị trên TV khi chưa chọn phòng
const DEFAULT_CDHA_ROOMS = [
  "Phòng Siêu âm 1",
  "Phòng Siêu âm 2",
  "Phòng Siêu âm 3",
  "Phòng Siêu âm 4",
];

/**
 * Chuẩn hóa chuỗi tìm kiếm (xóa dấu tiếng Việt, chữ thường, bỏ khoảng trắng thừa)
 */
function normalizeText(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Kiểm tra xem chuỗi có phải là param phòng CĐHA hợp lệ (1..6, hoặc danh sách '1,2,3,4', hoặc '1-4')
 */
function isCdhaRoomParam(param) {
  if (!param) return false;
  const p = String(param).trim();
  // Khớp dải số '1-4' hoặc '1-2'
  if (/^[1-6]-[1-6]$/.test(p)) return true;
  // Khớp số đơn hoặc danh sách phân cách dấu phẩy: '1' hoặc '1,2' hoặc '1,2,3,4'
  if (/^[1-6](\s*,\s*[1-6])*$/.test(p)) return true;
  // Khớp tên phòng hoặc sa1..sa6
  const norm = normalizeText(p);
  return CDHA_ROOMS.some(
    (r) => r.aliases.includes(norm) || normalizeText(r.tenphong) === norm
  );
}

/**
 * Chuyển alias (1, 2, 'sa1', v.v.) thành tên phòng chuẩn trong database
 * Ví dụ: '1' -> 'Phòng Siêu âm 1'
 */
function resolveCdhaRoomName(input) {
  if (!input) return "";
  const raw = String(input).trim();
  const norm = normalizeText(raw);

  // 1. Tìm chính xác theo aliases hoặc id
  const found = CDHA_ROOMS.find(
    (r) =>
      r.id === raw ||
      r.aliases.includes(norm) ||
      normalizeText(r.tenphong) === norm
  );
  if (found) return found.tenphong;

  // 2. Tìm số cuối nếu có định dạng "Siêu âm X" hoặc "Phòng X"
  const digitMatch = raw.match(/(\d+)/);
  if (digitMatch) {
    const numStr = digitMatch[1];
    const matchByNum = CDHA_ROOMS.find((r) => r.id === numStr);
    if (matchByNum) return matchByNum.tenphong;
  }

  return raw;
}

/**
 * Chuyển tên phòng chuẩn thành số alias ngắn gọn
 * Ví dụ: 'Phòng Siêu âm 1' -> '1'
 */
function resolveCdhaRoomAlias(roomName) {
  if (!roomName) return "";
  const raw = String(roomName).trim();
  const norm = normalizeText(raw);

  const found = CDHA_ROOMS.find(
    (r) =>
      r.id === raw ||
      r.aliases.includes(norm) ||
      normalizeText(r.tenphong) === norm
  );
  if (found) return found.id;

  const digitMatch = raw.match(/(\d+)/);
  return digitMatch ? digitMatch[1] : raw;
}

/**
 * Phân tích param phòng (URL path hoặc query string) thành mảng tên phòng chuẩn
 * Hỗ trợ:
 * - '1' -> ['Phòng Siêu âm 1']
 * - '1,2,3,4' -> ['Phòng Siêu âm 1', 'Phòng Siêu âm 2', 'Phòng Siêu âm 3', 'Phòng Siêu âm 4']
 * - '1-4' -> ['Phòng Siêu âm 1', 'Phòng Siêu âm 2', 'Phòng Siêu âm 3', 'Phòng Siêu âm 4']
 * - Mảng: ['1', '2'] hoặc ['Phòng Siêu âm 1', 'Phòng Siêu âm 2']
 */
function parseCdhaRoomParams(param) {
  if (!param) return [];

  let rawTokens = [];

  if (Array.isArray(param)) {
    rawTokens = param.map((item) => String(item).trim()).filter(Boolean);
  } else if (typeof param === "string") {
    const str = param.trim();
    // Hỗ trợ dạng dải số 1-4
    const rangeMatch = str.match(/^([1-6])-([1-6])$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) {
        rawTokens.push(String(i));
      }
    } else {
      rawTokens = str.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  // Chuyển từng token thành tên phòng chuẩn
  const resolved = rawTokens.map(resolveCdhaRoomName).filter(Boolean);

  // Loại trừ trùng lặp và giới hạn tối đa 4 phòng trên TV
  return Array.from(new Set(resolved)).slice(0, 4);
}

/**
 * Trả về danh sách định nghĩa phòng CĐHA đầy đủ
 */
function getCdhaRoomDefinitions() {
  return CDHA_ROOMS;
}

module.exports = {
  CDHA_ROOMS,
  DEFAULT_CDHA_ROOMS,
  isCdhaRoomParam,
  resolveCdhaRoomName,
  resolveCdhaRoomAlias,
  parseCdhaRoomParams,
  getCdhaRoomDefinitions,
};
