// soundEnabled lưu trong localStorage
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

// ==========================================
// AUDIO QUEUE MANAGER (XẾP HÀNG ÂM THANH)
// Tránh 2-4 phòng đọc đè tiếng lên nhau
// ==========================================
class AudioQueueManager {
  constructor() {
    this.queue = [];
    this.isPlaying = false;
    this.currentAudio = null;
  }

  enqueue(speakText) {
    if (!soundEnabled || !speakText || !speakText.trim()) return;
    this.queue.push(speakText.trim());
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentAudio = null;
      return;
    }

    this.isPlaying = true;
    const textToSpeak = this.queue.shift();
    const audioUrl = `/api/tts?text=${encodeURIComponent(textToSpeak)}`;

    try {
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.volume = 1.0;

      this.currentAudio.onended = () => {
        // Nghỉ 300ms giữa 2 câu đọc
        setTimeout(() => this.playNext(), 300);
      };

      this.currentAudio.onerror = (err) => {
        console.warn("Lỗi phát audio trong queue:", err);
        setTimeout(() => this.playNext(), 300);
      };

      this.currentAudio.play().catch((err) => {
        console.warn("Không thể autoplay:", err);
        setTimeout(() => this.playNext(), 300);
      });
    } catch (e) {
      console.error("Lỗi khởi tạo audio:", e);
      this.isPlaying = false;
    }
  }

  clear() {
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }
}

const audioQueue = new AudioQueueManager();

// ==========================================
// CÁC HÀM ĐIỀU KHIỂN ÂM THANH
// ==========================================
function updateSoundIcon() {
  const icon = document.getElementById("soundIcon");
  const text = document.getElementById("soundText");

  if (soundEnabled) {
    if (icon) {
      icon.className = "fas fa-volume-up text-green-400 text-sm animate-pulse";
    }
    if (text) {
      text.textContent = "Âm thanh: BẬT";
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 text-sm";
    }
    if (text) {
      text.textContent = "Âm thanh: TẮT";
    }
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("soundEnabled", soundEnabled);
  updateSoundIcon();

  if (soundEnabled) {
    // Mở khóa Audio context trên Smart TV
    const unlockAudio = new Audio("/audio/silent.mp3");
    unlockAudio.volume = 0.01;
    unlockAudio.play().catch(() => {});

    // Kiểm tra và phát cho các phòng hiện tại
    checkInitialSpeech();
  } else {
    audioQueue.clear();
  }
}

function formatRoomSpokenName(roomName) {
  if (!roomName || !roomName.trim()) return "";
  const clean = roomName.trim();
  if (/^(phòng|khoa)/i.test(clean)) {
    return clean;
  }
  return `phòng ${clean}`;
}

function requestSpeak(patientName, roomName) {
  if (!patientName || !patientName.trim()) return;
  const spokenRoom = formatRoomSpokenName(roomName);
  const speakText = `Mời bệnh nhân, ${patientName.trim()}, vào ${spokenRoom}`;
  audioQueue.enqueue(speakText);
}

function onRowClick(el) {
  if (!el) return;
  const patientName = el.dataset.patient || "";
  const roomName = el.dataset.room || "";
  if (patientName) {
    requestSpeak(patientName, roomName);
  }
}
window.onRowClick = onRowClick;

function checkInitialSpeech(force = false) {
  if (!soundEnabled) return;
  const quadrants = document.querySelectorAll(".room-quadrant");
  quadrants.forEach((q) => {
    const roomId = q.dataset.roomId;
    const roomName = q.dataset.roomName;
    const tracker = document.getElementById(`speech-track-${roomId}`);
    if (tracker && tracker.dataset.patient) {
      const pName = tracker.dataset.patient.trim();
      const storageKey = `lastSpokenMulti_${roomId}`;
      const lastSpoken = localStorage.getItem(storageKey);
      if (pName && (force || pName !== lastSpoken)) {
        requestSpeak(pName, roomName);
        localStorage.setItem(storageKey, pName);
      }
    }
  });
}

// ==========================================
// CẬP NHẬT GIAO DIỆN TỪNG Ô PHÒNG (QUADRANT)
// ==========================================
function updateQuadrantDOM(roomId, data) {
  if (!data) return;

  // 1. Cập nhật số liệu Đang Chờ & Tổng Đăng Ký
  const waitEl = document.getElementById(`total-wait-${roomId}`);
  if (waitEl && data.totalWaiting !== undefined) {
    waitEl.textContent = data.totalWaiting;
  }

  const dkEl = document.getElementById(`total-dk-${roomId}`);
  if (dkEl && data.totalDKPlus !== undefined) {
    dkEl.textContent = data.totalDKPlus;
  }

  // 2. Cập nhật Bảng bệnh nhân
  const tbody = document.getElementById(`tbody-${roomId}`);
  const card = document.getElementById(`room-card-${roomId}`);
  const roomTitle = card ? card.dataset.roomName : roomId;

  if (!tbody) return;

  const waitingList = data.waitingList || [];
  let nextPatientNameToRead = "";

  if (waitingList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-slate-400 font-bold italic">
          Không có bệnh nhân chờ.
        </td>
      </tr>
    `;
  } else {
    let waitCounter = 0;
    let rowsHtml = "";

    waitingList.forEach((patient, index) => {
      let isNear = false;
      if (patient.dakham == 0) {
        waitCounter++;
        if (waitCounter === 1) {
          isNear = true;
          nextPatientNameToRead = `${patient.holot || ""} ${patient.ten || ""}`.trim();
        }
      }

      const currentPatientName = `${patient.holot || ""} ${patient.ten || ""}`.trim();
      const dobYear = patient.dobStr && patient.dobStr !== "Chưa cập nhật"
        ? patient.dobStr.split("/").pop()
        : "";

      let noteTag = "";
      if (patient.priorityLabel) {
        noteTag = `<span class="inline-block bg-yellow-100 text-yellow-800 text-[10px] md:text-xs px-1.5 py-0.5 rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên: ${patient.priorityLabel}</span>`;
      } else if (patient.isPriority) {
        noteTag = `<span class="inline-block bg-yellow-100 text-yellow-800 text-[10px] md:text-xs px-1.5 py-0.5 rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên</span>`;
      }

      const rowClass = isNear
        ? "bg-red-50 hover:bg-red-100 border-l-8 border-red-500 shadow-md font-black"
        : "hover:bg-blue-50 border-b border-slate-200";

      const sttClass = isNear ? "text-danger text-lg md:text-2xl font-black" : "text-base md:text-lg text-blue-900 font-bold";
      const nameClass = isNear ? "text-danger text-base md:text-2xl font-black tracking-tight" : "text-base md:text-lg text-blue-900 font-bold";
      const dobClass = isNear ? "text-danger text-base md:text-xl font-black" : "text-sm md:text-base text-blue-900 font-bold";

      const statusBadge = isNear
        ? `<span class="inline-block bg-red-600 text-white px-2 md:px-3 py-1 rounded-xl text-xs md:text-base font-black uppercase shadow-lg animate-pulse">Tới Lượt</span>`
        : `<span class="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs md:text-sm font-bold border border-slate-300 shadow-sm">Chờ khám</span>`;

      const safePatientName = currentPatientName.replace(/"/g, '&quot;');
      const safeRoomTitle = roomTitle.replace(/"/g, '&quot;');

      rowsHtml += `
        <tr data-patient="${safePatientName}" data-room="${safeRoomTitle}" onclick="onRowClick(this)" class="cursor-pointer transition-all ${rowClass}">
          <td class="py-2 px-2 text-center ${sttClass}">
            ${index + 1}
          </td>
          <td class="py-2 px-2 text-blue-900 ${nameClass}">
            <div class="patient-name-container flex items-center overflow-hidden">
              <span class="patient-name-text truncate">
                ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
              </span>
              ${noteTag}
            </div>
          </td>
          <td class="py-2 px-2 text-center ${dobClass}">
            ${dobYear}
          </td>
          <td class="py-2 px-2 text-center">
            ${statusBadge}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // 3. Tự động xếp hàng phát âm thanh nếu bệnh nhân kế tiếp thay đổi
  const tracker = document.getElementById(`speech-track-${roomId}`);
  if (tracker) {
    tracker.dataset.patient = nextPatientNameToRead;
  }

  const storageKey = `lastSpokenMulti_${roomId}`;
  const lastSpoken = localStorage.getItem(storageKey);

  if (nextPatientNameToRead && nextPatientNameToRead !== lastSpoken) {
    requestSpeak(nextPatientNameToRead, roomTitle);
    localStorage.setItem(storageKey, nextPatientNameToRead);
  }
}

// ==========================================
// SOCKET.IO KẾT NỐI ĐA PHÒNG
// ==========================================
function initMultiSocket() {
  if (typeof io === "undefined") {
    console.warn("Socket.io client chưa được tải.");
    return;
  }

  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const quadrants = document.querySelectorAll(".room-quadrant");

  socket.on("connect", () => {
    console.log("[Socket.IO Multi] Đã kết nối. Đang đăng ký các phòng hiển thị...");
    quadrants.forEach((q) => {
      const roomType = q.dataset.roomType || "room";
      const roomId = q.dataset.roomId || "";
      if (roomId) {
        socket.emit("join_room", { roomType, roomId });
      }
    });
  });

  socket.on("room_data_updated", (payload) => {
    if (payload && payload.roomId && payload.data) {
      updateQuadrantDOM(payload.roomId, payload.data);
    }
  });
}

// ==========================================
// MODAL CHỌN PHÒNG
// ==========================================
function toggleRoomModal(open) {
  const modal = document.getElementById("roomModal");
  if (modal) {
    if (open) {
      modal.classList.remove("hidden");
    } else {
      modal.classList.add("hidden");
    }
  }
}

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]:checked');
  const countText = document.getElementById("selectedCountText");
  if (countText) {
    countText.textContent = `Đã chọn: ${checkboxes.length} phòng`;
  }
}

function clearRoomSelection() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]');
  checkboxes.forEach((cb) => {
    cb.checked = false;
  });
  updateSelectedCount();
}

function applyRoomSelection() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]:checked');
  const selected = Array.from(checkboxes).map((cb) => cb.value);

  if (selected.length === 0) {
    alert("Vui lòng chọn ít nhất 1 phòng!");
    return;
  }
  if (selected.length > 4) {
    alert("Vui lòng chọn tối đa 4 phòng (chia 2 hoặc chia 4)!");
    return;
  }

  const currentParams = new URLSearchParams(window.location.search);
  currentParams.set("rooms", selected.join(","));
  window.location.search = currentParams.toString();
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "roomSelection") {
    updateSelectedCount();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "s" || e.key === "Enter") {
    const modal = document.getElementById("roomModal");
    if (modal && !modal.classList.contains("hidden")) return;
    toggleSound();
  } else if (e.key.toLowerCase() === "m") {
    const modal = document.getElementById("roomModal");
    const isHidden = modal && modal.classList.contains("hidden");
    toggleRoomModal(isHidden);
  }
});

function updateTime() {
  const now = new Date();
  const dateOpts = { day: "2-digit", month: "2-digit", year: "numeric" };
  const timeOpts = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  const dateStrEl = document.getElementById("date-str");
  const timeStrEl = document.getElementById("time-str");
  if (dateStrEl && timeStrEl) {
    dateStrEl.textContent = now.toLocaleDateString("en-GB", dateOpts);
    timeStrEl.textContent = now.toLocaleTimeString("en-GB", timeOpts);
  }
}
setInterval(updateTime, 1000);
updateTime();

window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();
  initMultiSocket();
  setTimeout(checkInitialSpeech, 1500);
});
