// soundEnabled lưu trong localStorage
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

let lastKnownMultiRoomsData = {}; // Cache dữ liệu các phòng

const audioQueue = new window.AudioQueueManager({
  isEnabled: () => soundEnabled,
  gapMs: 300,
});

// ==========================================
// CÁC HÀM ĐIỀU KHIỂN ÂM THANH
// ==========================================
function updateSoundIcon() {
  const icon = document.getElementById("soundIcon");
  const text = document.getElementById("soundText");
  const button = document.getElementById("soundToggleBtn");

  if (soundEnabled) {
    if (icon) {
      icon.className = "fas fa-volume-up text-green-600 text-sm animate-pulse";
    }
    if (text) {
      text.textContent = "Loa: BẬT";
    }
    if (button) {
      button.title = "Loa: ĐANG BẬT (Phím A / S để tắt, Space để đọc lại)";
      button.setAttribute("aria-label", "Tắt âm thanh");
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 text-sm";
    }
    if (text) {
      text.textContent = "Loa: TẮT";
    }
    if (button) {
      button.title = "Loa: ĐANG TẮT (Phím A / S để bật)";
      button.setAttribute("aria-label", "Bật âm thanh");
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
window.toggleSound = toggleSound;

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
window.requestSpeak = requestSpeak;

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
      <i class="${type === 'danger' ? 'fas fa-trash-alt' : 'fas fa-info-circle'} text-lg"></i>
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
window.showToast = showToast;

// ==========================================
// QUẢN LÝ XÓA / ẨN BỆNH NHÂN KHỎI MÀN HÌNH
// ==========================================
function getPatientKey(p) {
  return window.QueuePolicy ? window.QueuePolicy.getPatientKey(p) : "";
}

function removePatient(patientKey, patientName, roomName) {
  if (!patientName && !patientKey) return;

  if (window.QueuePolicy) {
    window.QueuePolicy.hide(patientKey, patientName, roomName);
  }

  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");
  quadrants.forEach((q) => {
    const rId = q.dataset.roomId;
    if (lastKnownMultiRoomsData[rId]) {
      updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
    }
  });

  updateHiddenBadge();

  setTimeout(() => {
    checkInitialSpeech(true);
  }, 200);

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.removePatient = removePatient;

function removePatientFromElement(btnOrEl, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (!btnOrEl) return;
  const row = btnOrEl.tagName === "TR" ? btnOrEl : btnOrEl.closest("tr[data-patient]");
  if (!row) return;

  const patientKey = row.dataset.patientKey || row.dataset.patient;
  const patientName = row.dataset.patient || "";
  const roomName = row.dataset.room || "";

  removePatient(patientKey, patientName, roomName);
}
window.removePatientFromElement = removePatientFromElement;

function restorePatient(patientKey, patientName) {
  if (window.QueuePolicy) {
    window.QueuePolicy.restore(patientKey, patientName);
  }

  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");
  quadrants.forEach((q) => {
    const rId = q.dataset.roomId;
    if (lastKnownMultiRoomsData[rId]) {
      updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
    }
  });

  updateHiddenBadge();
  renderHiddenModalList();
  showToast(`Đã khôi phục BN: ${patientName || patientKey}`, "info");

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.restorePatient = restorePatient;

function restoreAllHiddenPatients() {
  if (window.QueuePolicy) {
    window.QueuePolicy.restoreAll();
  }

  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");
  quadrants.forEach((q) => {
    const rId = q.dataset.roomId;
    if (lastKnownMultiRoomsData[rId]) {
      updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
    }
  });

  updateHiddenBadge();
  renderHiddenModalList();
  showToast("Đã khôi phục tất cả bệnh nhân", "info");

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.restoreAllHiddenPatients = restoreAllHiddenPatients;

function updateHiddenBadge() {
  const badge = document.getElementById("hiddenBadgeCount");
  if (!badge) return;

  const list = window.QueuePolicy ? window.QueuePolicy.getHiddenList() : [];
  if (list.length > 0) {
    badge.textContent = list.length;
    badge.classList.remove("hidden");
  } else {
    badge.textContent = "0";
    badge.classList.add("hidden");
  }
}

function renderHiddenModalList() {
  const container = document.getElementById("hiddenPatientsListContainer");
  if (!container) return;

  const list = window.QueuePolicy ? window.QueuePolicy.getHiddenList() : [];

  if (list.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400">
        <i class="fas fa-check-circle text-4xl mb-2 text-green-500 block"></i>
        <p class="font-bold text-base">Không có bệnh nhân nào bị xóa/ẩn.</p>
      </div>
    `;
    return;
  }

  let html = `<div class="divide-y divide-slate-200">`;
  list.forEach((item) => {
    const safeKey = (item.key || "").replace(/"/g, '&quot;');
    const safeName = (item.name || "").replace(/"/g, '&quot;');
    html += `
      <div class="py-3 px-3 flex justify-between items-center hover:bg-blue-50/50 rounded-lg transition-colors gap-3">
        <div class="min-w-0">
          <div class="font-black text-slate-800 text-sm md:text-base uppercase truncate">${item.name}</div>
          <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            ${item.room ? `<span class="bg-blue-50 text-brand px-1.5 py-0.5 rounded font-bold border border-blue-200">${item.room}</span>` : ""}
            <span>Đã xóa lúc: ${item.time || "--:--"}</span>
          </div>
        </div>
        <button onclick="restorePatient('${safeKey}', '${safeName}')"
                class="remote-item bg-green-50 hover:bg-green-600 hover:text-white text-green-700 font-black px-3 py-1.5 rounded-lg text-xs md:text-sm border border-green-300 transition-all shrink-0 cursor-pointer"
                tabindex="0">
          <i class="fas fa-undo mr-1"></i> Khôi phục
        </button>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function toggleHiddenModal(show) {
  const modal = document.getElementById("hiddenPatientsModal");
  if (!modal) return;

  if (show) {
    renderHiddenModalList();
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
window.toggleHiddenModal = toggleHiddenModal;

// Nhấp hoặc nhấn Enter trên dòng để gọi tên ngay
function onRowClick(el) {
  if (!el) return;
  const patientName = (el.dataset.patient || "").trim();
  const roomName = (el.dataset.room || "").trim();
  if (!patientName) return;

  if (!soundEnabled) {
    soundEnabled = true;
    localStorage.setItem("soundEnabled", "true");
    updateSoundIcon();
  }

  requestSpeak(patientName, roomName);
}
window.onRowClick = onRowClick;

function checkInitialSpeech(force = false) {
  if (!soundEnabled) return;
  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");
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

  const rawList = data.waitingList || [];
  // Lọc bỏ bệnh nhân đã bị xóa/ẩn và áp dụng đôn thứ tự
  const waitingList = window.QueuePolicy
    ? window.QueuePolicy.applyQueuePolicy(rawList)
    : [...rawList];
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

      const deleteBtn = `
        <button type="button" 
                title="Xóa/Ẩn khỏi màn hình" 
                aria-label="Xóa bệnh nhân khỏi danh sách hiển thị" 
                onclick="removePatientFromElement(this, event)" 
                class="btn-hide-patient p-1 text-slate-300 hover:text-danger hover:bg-red-50 rounded transition-colors cursor-pointer" 
                tabindex="0">
          <i class="fas fa-trash-alt text-xs md:text-sm"></i>
        </button>
      `;

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
              <span class="patient-name-text">
                ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
              </span>
              ${noteTag}
            </div>
          </td>
          <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${dobClass}">
            ${dobYear}
          </td>
          <td class="py-2.5 px-2 text-center">
            <div class="flex items-center justify-center gap-1.5">
              ${statusBadge}
              ${deleteBtn}
            </div>
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

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.updateQuadrantDOM = updateQuadrantDOM;

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

  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");

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
window.toggleRoomModal = toggleRoomModal;

function clearRoomSelection() {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]');
  checkboxes.forEach((cb) => (cb.checked = false));
  updateSelectedCount();
}
window.clearRoomSelection = clearRoomSelection;

function updateSelectedCount() {
  const checked = document.querySelectorAll('input[name="roomSelection"]:checked');
  const textEl = document.getElementById("selectedCountText");
  if (textEl) {
    textEl.textContent = `Đã chọn: ${checked.length} phòng`;
  }
}
window.updateSelectedCount = updateSelectedCount;

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

  const currentType = new URLSearchParams(window.location.search).get("type") || "room";
  window.location.href = `/multi?type=${currentType}&rooms=${encodeURIComponent(selected.join(","))}`;
}
window.applyRoomSelection = applyRoomSelection;

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

setInterval(() => {
  Object.entries(lastKnownMultiRoomsData).forEach(([roomId, data]) => {
    updateQuadrantDOM(roomId, data);
  });
}, 30 * 1000);

window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();
  updateHiddenBadge();
  initSocket();

  const quadrants = document.querySelectorAll(".room-quadrant, .room-container");
  quadrants.forEach((q) => {
    const rId = q.dataset.roomId;
    if (lastKnownMultiRoomsData[rId]) {
      updateQuadrantDOM(rId, lastKnownMultiRoomsData[rId]);
    }
  });

  setTimeout(() => checkInitialSpeech(false), 1500);
});
