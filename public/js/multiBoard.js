// soundEnabled lưu trong localStorage
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

// Quản lý danh sách bệnh nhân đã bị bỏ qua (đôn người kế tiếp lên) trong phiên hiển thị
window.dismissedPatientsSet = window.dismissedPatientsSet || new Set();
let activeActionPatient = null;
let lastKnownMultiRoomsData = {}; // Cache dữ liệu các phòng

// ==========================================
// AUDIO QUEUE MANAGER (XẾP HÀNG ÂM THANH)
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
      try {
        this.currentAudio.pause();
      } catch (e) {}
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
      icon.className = "fas fa-volume-up text-green-600 text-sm animate-pulse";
    }
    if (text) {
      text.textContent = "Loa: BẬT";
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 text-sm";
    }
    if (text) {
      text.textContent = "Loa: TẮT";
    }
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("soundEnabled", soundEnabled);
  updateSoundIcon();

  if (soundEnabled) {
    const unlockAudio = new Audio("/audio/silent.mp3");
    unlockAudio.volume = 0.01;
    unlockAudio.play().catch(() => {});

    checkInitialSpeech(true);
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

// ==========================================
// TOAST NOTIFICATION TRÊN TV
// ==========================================
function showToast(message, type = "info", undoCallback = null) {
  let container = document.getElementById("tvToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "tvToastContainer";
    container.className = "fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const bgClass = type === "danger" ? "bg-red-600 border-red-400" : "bg-blue-800 border-blue-500";
  toast.className = `tv-toast pointer-events-auto flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl border-2 text-white font-bold shadow-2xl text-sm md:text-base ${bgClass}`;

  toast.innerHTML = `
    <div class="flex items-center gap-2.5">
      <i class="${type === 'danger' ? 'fas fa-forward' : 'fas fa-info-circle'} text-lg"></i>
      <span>${message}</span>
    </div>
  `;

  if (undoCallback) {
    const undoBtn = document.createElement("button");
    undoBtn.className = "bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-black uppercase transition-all cursor-pointer";
    undoBtn.textContent = "Hoàn tác";
    undoBtn.onclick = () => {
      undoCallback();
      toast.remove();
    };
    toast.appendChild(undoBtn);
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// QUẢN LÝ BỎ QUA BỆNH NHÂN & ĐÔN NGƯỜI KẾ TIẾP
// ==========================================
function getPatientKey(p) {
  if (!p) return "";
  return (p.makb || p.mabn || `${(p.holot || "").trim()}_${(p.ten || "").trim()}_${(p.dobStr || "").trim()}`).trim();
}

function isPatientDismissed(p) {
  if (!p) return false;
  const key = getPatientKey(p);
  const fullName = `${(p.holot || "").trim()} ${(p.ten || "").trim()}`.trim();
  return window.dismissedPatientsSet.has(key) || window.dismissedPatientsSet.has(fullName);
}

function skipPatient(patientKey, patientName, roomName) {
  if (!patientName) return;

  window.dismissedPatientsSet.add(patientKey);
  window.dismissedPatientsSet.add(patientName.trim());

  // Rerender lại tất cả các quadrant đang hiển thị
  const quadrants = document.querySelectorAll(".room-quadrant");
  quadrants.forEach((q) => {
    const rId = q.dataset.roomId;
    if (lastKnownMultiRoomsData[rId]) {
      updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
    }
  });

  // Tự động đọc bệnh nhân mới vừa được đôn lên
  setTimeout(() => {
    checkInitialSpeech(true);
  }, 200);

  showToast(`Đã bỏ qua BN: ${patientName}. Đôn người kế tiếp lên!`, "danger", () => {
    window.dismissedPatientsSet.delete(patientKey);
    window.dismissedPatientsSet.delete(patientName.trim());
    quadrants.forEach((q) => {
      const rId = q.dataset.roomId;
      if (lastKnownMultiRoomsData[rId]) {
        updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
      }
    });
    showToast(`Đã khôi phục BN: ${patientName}`, "info");
  });

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.skipPatient = skipPatient;

window.skipPatientFromElement = function (el) {
  if (!el) return;
  const patientKey = el.dataset.patientKey || el.dataset.patient;
  const patientName = el.dataset.patient;
  const roomName = el.dataset.room;
  skipPatient(patientKey, patientName, roomName);
};

// ==========================================
// MODAL TÁC VỤ BỆNH NHÂN (POPUP ACTION)
// ==========================================
function openPatientActionModal(el) {
  if (!el) return;
  const patientKey = el.dataset.patientKey || el.dataset.patient || "";
  const patientName = el.dataset.patient || "";
  const roomName = el.dataset.room || "";

  if (!patientName) return;

  activeActionPatient = { patientKey, patientName, roomName, el };

  const modal = document.getElementById("patientActionModal");
  const nameEl = document.getElementById("modalPatientName");
  const roomEl = document.getElementById("modalPatientRoom");

  if (nameEl) nameEl.textContent = patientName.toUpperCase();
  if (roomEl) roomEl.textContent = roomName ? formatRoomSpokenName(roomName).toUpperCase() : "HÀNG CHỜ PHÒNG KHÁM";

  if (modal) {
    modal.classList.remove("hidden");
    if (window.TVRemoteNav && typeof window.TVRemoteNav.onModalToggle === "function") {
      window.TVRemoteNav.onModalToggle(true);
    }
  }
}
window.openPatientActionModal = openPatientActionModal;

function closePatientActionModal() {
  const modal = document.getElementById("patientActionModal");
  if (modal) {
    modal.classList.add("hidden");
    activeActionPatient = null;
    if (window.TVRemoteNav && typeof window.TVRemoteNav.onModalToggle === "function") {
      window.TVRemoteNav.onModalToggle(false);
    }
  }
}
window.closePatientActionModal = closePatientActionModal;

function triggerModalSpeak() {
  if (activeActionPatient && activeActionPatient.patientName) {
    requestSpeak(activeActionPatient.patientName, activeActionPatient.roomName);
  }
  closePatientActionModal();
}
window.triggerModalSpeak = triggerModalSpeak;

function triggerModalSkip() {
  if (activeActionPatient && activeActionPatient.patientName) {
    skipPatient(activeActionPatient.patientKey, activeActionPatient.patientName, activeActionPatient.roomName);
  }
  closePatientActionModal();
}
window.triggerModalSkip = triggerModalSkip;

// Nhấp vào dòng bệnh nhân
function onRowClick(el) {
  openPatientActionModal(el);
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
  lastKnownMultiRoomsData[roomId] = data;

  const card = document.getElementById(`room-card-${roomId}`);
  const roomTitle = card ? card.dataset.roomName : (data.tenphong || data.maphong || roomId);

  // Lọc bỏ bệnh nhân đã bị bỏ qua
  const rawList = data.waitingList || [];
  const waitingList = rawList.filter((p) => !isPatientDismissed(p));
  const activeWaitingCount = waitingList.filter((p) => p.dakham == 0).length;

  // 1. Cập nhật số liệu Đang Chờ & Tổng Đăng Ký
  const waitEl = document.getElementById(`total-wait-${roomId}`);
  if (waitEl) {
    waitEl.textContent = activeWaitingCount;
  }

  const dkEl = document.getElementById(`total-dk-${roomId}`);
  if (dkEl && data.totalDKPlus !== undefined) {
    dkEl.textContent = data.totalDKPlus;
  }

  // 2. Cập nhật Bảng bệnh nhân
  const tbody = document.getElementById(`tbody-${roomId}`);
  if (!tbody) return;

  let nextPatientNameToRead = "";

  if (waitingList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-8 text-slate-400 font-bold text-base md:text-2xl italic">
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
      const pKey = getPatientKey(patient);
      const dobYear = patient.dobStr && patient.dobStr !== "Chưa cập nhật"
        ? patient.dobStr.split("/").pop()
        : "";

      let noteTag = "";
      if (patient.priorityLabel) {
        noteTag = `<span class="inline-block bg-yellow-100 text-yellow-800 text-xs md:text-sm px-1.5 py-0.5 rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên: ${patient.priorityLabel}</span>`;
      } else if (patient.isPriority) {
        noteTag = `<span class="inline-block bg-yellow-100 text-yellow-800 text-xs md:text-sm px-1.5 py-0.5 rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên</span>`;
      }

      const rowClass = isNear
        ? "bg-red-50 hover:bg-red-100 border-l-8 border-red-500 shadow-md font-black"
        : "hover:bg-blue-50 border-b border-slate-200";

      const sttClass = isNear ? "text-danger text-2xl md:text-4xl lg:text-5xl font-black" : "text-xl md:text-3xl font-bold";
      const nameClass = isNear ? "text-danger text-2xl md:text-4xl lg:text-5xl font-black tracking-tight" : "text-xl md:text-3xl lg:text-4xl font-extrabold";
      const dobClass = isNear ? "text-danger text-xl md:text-3xl lg:text-4xl font-black" : "text-lg md:text-2xl font-bold";

      const statusBadge = isNear
        ? `<span class="inline-block bg-red-600 text-white px-2.5 md:px-4 py-1 rounded-xl text-sm md:text-xl font-black uppercase shadow-lg animate-pulse">Tới Lượt</span>`
        : `<span class="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs md:text-base font-bold border border-slate-300 shadow-sm">Chờ khám</span>`;

      const safePatientName = currentPatientName.replace(/"/g, '&quot;');
      const safeRoomTitle = roomTitle.replace(/"/g, '&quot;');
      const safeKey = pKey.replace(/"/g, '&quot;');

      rowsHtml += `
        <tr data-patient="${safePatientName}" data-patient-key="${safeKey}" data-room="${safeRoomTitle}" onclick="onRowClick(this)" class="remote-item cursor-pointer transition-all ${rowClass}" tabindex="0">
          <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${sttClass}">
            ${index + 1}
          </td>
          <td class="py-2.5 px-2 text-blue-900 ${nameClass}">
            <div class="patient-name-container flex items-center overflow-hidden">
              <span class="patient-name-text truncate">
                ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
              </span>
              ${noteTag}
            </div>
          </td>
          <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${dobClass}">
            ${dobYear}
          </td>
          <td class="py-2.5 px-2 text-center">
            ${statusBadge}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // 3. Cập nhật speech tracker
  const tracker = document.getElementById(`speech-track-${roomId}`);
  if (tracker) {
    tracker.dataset.patient = nextPatientNameToRead;
  }

  const storageKey = `lastSpokenMulti_${roomId}`;
  const lastSpoken = localStorage.getItem(storageKey);
  if (nextPatientNameToRead && nextPatientNameToRead !== lastSpoken) {
    localStorage.setItem(storageKey, nextPatientNameToRead);
    requestSpeak(nextPatientNameToRead, roomTitle);
  }

  fitText();

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}

// ==========================================
// SOCKET.IO REALTIME LISTENER
// ==========================================
function initSocket() {
  if (typeof io === "undefined") return;

  const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  const quadrants = document.querySelectorAll(".room-quadrant");

  socket.on("connect", () => {
    quadrants.forEach((q) => {
      const roomType = q.dataset.roomType || "room";
      const roomId = q.dataset.roomId;
      socket.emit("join_room", { roomType, roomId });
    });
  });

  socket.on("room_data_updated", (payload) => {
    if (!payload || !payload.roomId) return;
    updateQuadrantDOM(payload.roomId, payload.data);
  });
}

// ==========================================
// XỬ LÝ MODAL CHỌN PHÒNG
// ==========================================
function toggleRoomModal(show) {
  const modal = document.getElementById("roomModal");
  if (!modal) return;

  if (show) {
    modal.classList.remove("hidden");
    if (window.TVRemoteNav && typeof window.TVRemoteNav.onModalToggle === "function") {
      window.TVRemoteNav.onModalToggle(true);
    }
  } else {
    modal.classList.add("hidden");
    if (window.TVRemoteNav && typeof window.TVRemoteNav.onModalToggle === "function") {
      window.TVRemoteNav.onModalToggle(false);
    }
  }
}

function clearRoomSelection() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]');
  checkboxes.forEach((cb) => (cb.checked = false));
  updateSelectedCount();
}

function updateSelectedCount() {
  const checked = document.querySelectorAll('input[name="roomSelection"]:checked');
  const textEl = document.getElementById("selectedCountText");
  if (textEl) {
    textEl.textContent = `Đã chọn: ${checked.length} phòng`;
  }
}

function applyRoomSelection() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]:checked');
  const selected = Array.from(checkboxes).map((cb) => cb.value);

  if (selected.length === 0) {
    alert("Vui lòng chọn ít nhất 1 phòng!");
    return;
  }

  if (selected.length > 4) {
    alert("Hệ thống chỉ hỗ trợ tối đa 4 phòng trên một màn hình TV!");
    return;
  }

  const query = selected.join(",");
  window.location.href = `/multi-rooms?rooms=${encodeURIComponent(query)}`;
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "roomSelection") {
    updateSelectedCount();
  }
});

// Đồng hồ
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

// FitText
function fitText() {
  const containers = document.querySelectorAll(".patient-name-container");
  containers.forEach((container) => {
    const textSpan = container.querySelector(".patient-name-text") || container;
    if (!textSpan) return;

    textSpan.style.transform = "scale(1)";
    const containerWidth = container.clientWidth;
    const textWidth = textSpan.scrollWidth;

    if (textWidth > containerWidth && containerWidth > 0) {
      const scale = containerWidth / textWidth;
      textSpan.style.transform = `scale(${scale})`;
      textSpan.style.transformOrigin = "left center";
    }
  });
}
window.addEventListener("load", fitText);
window.addEventListener("resize", fitText);
fitText();

window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();
  initSocket();
  setTimeout(() => checkInitialSpeech(false), 1500);
});
