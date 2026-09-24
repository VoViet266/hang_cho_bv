// soundEnabled lưu trong localStorage - duy trì qua các lần mở trang
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

let lastKnownRoomsData = {}; // Cache dữ liệu phòng gần nhất theo roomId


function formatRoomSpokenName(roomName) {
  if (!roomName || !roomName.trim()) return "";
  const clean = roomName.trim();
  if (/^(phòng|khoa)/i.test(clean)) {
    return clean;
  }
  return `phòng ${clean}`;
}

function extractBirthYear(val, rowEl = null) {
  if (val !== undefined && val !== null) {
    const str = typeof val === "object" ? (val.namSinh || val.dobStr || val.dob || val.ngaysinh || "") : String(val).trim();
    if (str && str !== "Chưa cập nhật" && str !== "null" && str !== "undefined") {
      const match = str.match(/(19\d{2}|20\d{2})/);
      if (match) return match[1];
    }
  }
  if (rowEl) {
    const attr = rowEl.getAttribute("data-dob-year") || rowEl.dataset?.dobYear || rowEl.getAttribute("data-nam-sinh") || rowEl.dataset?.namSinh || "";
    if (attr && attr.trim() !== "Chưa cập nhật") {
      const match = attr.match(/(19\d{2}|20\d{2})/);
      if (match) return match[1];
    }
    const cells = rowEl.querySelectorAll("td");
    for (const cell of cells) {
      const txt = cell.textContent.trim();
      const match = txt.match(/\b(19\d{2}|20\d{2})\b/);
      if (match) return match[1];
    }
  }
  return "";
}
window.extractBirthYear = extractBirthYear;

const audioQueue = new window.AudioQueueManager({
  isEnabled: () => soundEnabled,
  gapMs: 350,
});

// ==========================================
// CÁC HÀM ĐIỀU KHIỂN ÂM THANH
// ==========================================
function updateSoundIcon() {
  const icon = document.getElementById("soundIcon");
  const text = document.getElementById("soundText");
  const btn = document.getElementById("soundToggleBtn");

  if (soundEnabled) {
    if (icon) {
      icon.className = "fas fa-volume-up text-green-600 text-sm";
    }
    if (text) {
      text.textContent = "Loa: BẬT";
    }
    if (btn) {
      btn.title = "Loa: ĐANG BẬT (Phím A / S để tắt, Space để đọc lại)";
      btn.setAttribute("aria-label", "Tắt âm thanh");
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 text-sm";
    }
    if (text) {
      text.textContent = "Loa: TẮT";
    }
    if (btn) {
      btn.title = "Loa: ĐANG TẮT (Phím A / S để bật)";
      btn.setAttribute("aria-label", "Bật âm thanh");
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
    unlockAudio.play().catch(() => { });
    // Bật loa chỉ mở khóa âm thanh cho trình duyệt, KHÔNG tự động phát tiếng bệnh nhân hiện tại
  } else {
    audioQueue.clear();
  }
}
window.toggleSound = toggleSound;

// Gọi đọc 1 bệnh nhân cụ thể
function requestSpeak(patientName, roomName, dobYear) {
  if (!patientName || !patientName.trim()) return;
  const spokenRoom = formatRoomSpokenName(roomName);
  const dobClean = extractBirthYear(dobYear);
  const dobText = dobClean ? `, sinh năm ${dobClean}` : "";
  const speakText = `Mời bệnh nhân, ${patientName.trim()}${dobText}, vào ${spokenRoom}`;
  audioQueue.enqueue(speakText);
}
window.requestSpeak = requestSpeak;

// ==========================================
// TOAST NOTIFICATION TRÊN MÀN HÌNH TV
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

function removePatient(patientKey, patientName, roomName, meta = {}) {
  if (!patientName && !patientKey) return;

  const roomType = meta.roomType || (window.location.pathname.includes("/cdha") ? "cdha" : "room");
  const isCdha = roomType === "cdha";

  if (isCdha) {
    const makb = meta.makb || "";
    const mabn = meta.mabn || "";
    const tenphong = meta.tenphong || roomName;

    // Optimistic UI: làm mờ dòng ngay lập tức để phản hồi tức thì
    const rows = document.querySelectorAll(`tr[data-patient-key="${patientKey}"], tr[data-patient="${patientName}"]`);
    rows.forEach((r) => {
      if (!tenphong || r.dataset.room === tenphong) {
        r.style.opacity = "0.3";
        r.style.pointerEvents = "none";
      }
    });

    fetch("/api/cdha/patient/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ makb, mabn, tenphong }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          showToast(`Đã ẩn BN: ${patientName || patientKey}`, "info");
        } else {
          showToast(`Không thể ẩn BN: ${data.message || "Lỗi máy chủ"}`, "error");
          rows.forEach((r) => {
            r.style.opacity = "1";
            r.style.pointerEvents = "auto";
          });
        }
      })
      .catch((err) => {
        console.error("Lỗi khi ẩn BN CDHA vào DB:", err);
        showToast("Lỗi kết nối máy chủ khi ẩn bệnh nhân", "error");
        rows.forEach((r) => {
          r.style.opacity = "1";
          r.style.pointerEvents = "auto";
        });
      });

    if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
      window.TVRemoteNav.refresh();
    }
    return;
  }

  // Với phòng khám thông thường: giữ nguyên client QueuePolicy
  if (window.QueuePolicy) {
    window.QueuePolicy.hide(patientKey, patientName, roomName);
  }

  // Rerender lại tất cả các phòng đang hiển thị
  const roomContainers = document.querySelectorAll(".room-container");
  roomContainers.forEach((container) => {
    const rId = container.dataset.roomId;
    if (lastKnownRoomsData[rId]) {
      updateRoomDOM(rId, lastKnownRoomsData[rId]);
    }
  });

  updateHiddenBadge();

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
  const makb = row.dataset.makb || "";
  const mabn = row.dataset.mabn || "";
  const container = row.closest(".room-container");
  const roomType = row.dataset.roomType || container?.dataset?.roomType || (window.location.pathname.includes("/cdha") ? "cdha" : "room");

  removePatient(patientKey, patientName, roomName, { makb, mabn, roomType, tenphong: roomName });
}
window.removePatientFromElement = removePatientFromElement;

function restorePatient(patientKey, patientName, roomName, meta = {}) {
  const isCdha = (meta && meta.roomType === "cdha") || window.location.pathname.includes("/cdha");

  if (isCdha) {
    const makb = (meta && meta.makb) || patientKey;
    const mabn = (meta && meta.mabn) || "";
    const tenphong = (meta && meta.tenphong) || roomName;

    fetch("/api/cdha/patient/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ makb, mabn, tenphong }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          showToast(`Đã khôi phục BN: ${patientName || patientKey}`, "info");
          renderHiddenModalList();
        } else {
          showToast(`Không thể khôi phục: ${data.message || ""}`, "error");
        }
      })
      .catch((err) => {
        console.error("Lỗi khi khôi phục BN CDHA:", err);
        showToast("Lỗi kết nối máy chủ khi khôi phục", "error");
      });

    if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
      window.TVRemoteNav.refresh();
    }
    return;
  }

  if (window.QueuePolicy) {
    window.QueuePolicy.restore(patientKey, patientName);
  }

  const roomContainers = document.querySelectorAll(".room-container");
  roomContainers.forEach((container) => {
    const rId = container.dataset.roomId;
    if (lastKnownRoomsData[rId]) {
      updateRoomDOM(rId, lastKnownRoomsData[rId]);
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
  const isCdha = window.location.pathname.includes("/cdha");

  if (isCdha) {
    const roomContainers = document.querySelectorAll(".room-container");
    const roomIds = Array.from(roomContainers).map((c) => c.dataset.roomId).filter(Boolean);

    fetch("/api/cdha/patient/restore-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: roomIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          showToast("Đã khôi phục tất cả bệnh nhân", "info");
          renderHiddenModalList();
        } else {
          showToast(`Không thể khôi phục: ${data.message || ""}`, "error");
        }
      })
      .catch((err) => {
        console.error("Lỗi khi khôi phục tất cả BN CDHA:", err);
        showToast("Lỗi kết nối máy chủ khi khôi phục", "error");
      });

    if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
      window.TVRemoteNav.refresh();
    }
    return;
  }

  if (window.QueuePolicy) {
    window.QueuePolicy.restoreAll();
  }

  const roomContainers = document.querySelectorAll(".room-container");
  roomContainers.forEach((container) => {
    const rId = container.dataset.roomId;
    if (lastKnownRoomsData[rId]) {
      updateRoomDOM(rId, lastKnownRoomsData[rId]);
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

  const isCdha = window.location.pathname.includes("/cdha");
  if (isCdha) {
    let count = 0;
    Object.values(lastKnownRoomsData).forEach((r) => {
      if (r && Array.isArray(r.hiddenList)) {
        count += r.hiddenList.length;
      }
    });
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "0";
      badge.classList.add("hidden");
    }
    return;
  }

  const list = window.QueuePolicy ? window.QueuePolicy.getHiddenList() : [];
  if (list.length > 0) {
    badge.textContent = list.length;
    badge.classList.remove("hidden");
  } else {
    badge.textContent = "0";
    badge.classList.add("hidden");
  }
}

async function renderHiddenModalList() {
  const container = document.getElementById("hiddenPatientsListContainer");
  if (!container) return;

  const isCdha = window.location.pathname.includes("/cdha");
  if (isCdha) {
    const roomContainers = document.querySelectorAll(".room-container");
    const roomIds = Array.from(roomContainers).map((c) => c.dataset.roomId).filter(Boolean);
    const roomsParam = encodeURIComponent(roomIds.join(","));

    container.innerHTML = `
      <div class="text-center py-10 text-slate-400">
        <i class="fas fa-spinner fa-spin text-3xl mb-2 text-brand"></i>
        <p class="font-bold text-sm">Đang tải danh sách từ cơ sở dữ liệu...</p>
      </div>
    `;

    try {
      const res = await fetch(`/api/cdha/hidden?rooms=${roomsParam}`);
      const result = await res.json();

      if (!result.success || !result.data || result.data.length === 0) {
        container.innerHTML = `
          <div class="text-center py-10 text-slate-400">
            <i class="fas fa-check-circle text-4xl mb-2 text-green-500 block"></i>
            <p class="font-bold text-base">Không có bệnh nhân nào bị xóa/ẩn.</p>
          </div>
        `;
        const badge = document.getElementById("hiddenBadgeCount");
        if (badge) {
          badge.textContent = "0";
          badge.classList.add("hidden");
        }
        return;
      }

      const badge = document.getElementById("hiddenBadgeCount");
      if (badge) {
        badge.textContent = result.data.length;
        badge.classList.remove("hidden");
      }

      let html = `<div class="divide-y divide-slate-200">`;
      result.data.forEach((item) => {
        const safeMakb = (item.makb || "").replace(/"/g, '&quot;');
        const safeMabn = (item.mabn || "").replace(/"/g, '&quot;');
        const safeName = (item.name || "").replace(/"/g, '&quot;');
        const safeRoom = (item.room || "").replace(/"/g, '&quot;');

        html += `
          <div class="py-3 px-3 flex justify-between items-center hover:bg-blue-50/50 rounded-lg transition-colors gap-3">
            <div class="min-w-0">
              <div class="font-black text-slate-800 text-sm md:text-base uppercase truncate">${safeName}</div>
              <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                ${safeRoom ? `<span class="bg-blue-50 text-brand px-1.5 py-0.5 rounded font-bold border border-blue-200">${safeRoom}</span>` : ""}
                <span>Đã nhập lúc: ${item.time || "--:--"}</span>
              </div>
            </div>
            <button onclick="restorePatient('${safeMakb}', '${safeName}', '${safeRoom}', { makb: '${safeMakb}', mabn: '${safeMabn}', tenphong: '${safeRoom}', roomType: 'cdha' })"
                    class="remote-item bg-green-50 hover:bg-green-600 hover:text-white text-green-700 font-black px-3 py-1.5 rounded-lg text-xs md:text-sm border border-green-300 transition-all shrink-0 cursor-pointer"
                    tabindex="0">
              <i class="fas fa-undo mr-1"></i> Khôi phục
            </button>
          </div>
        `;
      });
      html += `</div>`;
      container.innerHTML = html;

      if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
        window.TVRemoteNav.refresh();
      }
    } catch (e) {
      console.error("Lỗi lấy danh sách ẩn CDHA:", e);
      container.innerHTML = `
        <div class="text-center py-8 text-red-500 font-bold">
          Không thể kết nối máy chủ để lấy danh sách đã ẩn.
        </div>
      `;
    }
    return;
  }

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
  const row = el.tagName === "TR" ? el : (el.closest("tr[data-patient]") || el.closest("tr") || el);
  const patientName = (row.dataset.patient || row.getAttribute("data-patient") || "").trim();
  const roomName = (row.dataset.room || row.getAttribute("data-room") || "").trim();
  const dobYear = extractBirthYear(row.dataset.dobYear || row.getAttribute("data-dob-year"), row);
  if (!patientName) return;

  if (!soundEnabled) {
    soundEnabled = true;
    localStorage.setItem("soundEnabled", "true");
    updateSoundIcon();
  }

  // Gọi ngay khi người dùng chọn bệnh nhân.
  const roomContainer = row.closest(".room-container, .room-card, [data-room-id]") || document.querySelector(".room-container");
  const roomId = roomContainer ? roomContainer.dataset.roomId : null;
  const roomType = (roomContainer ? roomContainer.dataset.roomType : "") || (row.dataset.roomType || "room");
  requestSpeak(patientName, roomName, dobYear);

  // Phát tín hiệu Socket.IO để các máy khác cùng phòng đồng thời phát loa
  if (typeof emitBroadcastSpeak === "function") {
    emitBroadcastSpeak(roomType, roomId, patientName, roomName, dobYear);
  }
}
window.onRowClick = onRowClick;

// ==========================================
// GỌI BỆNH NHÂN HIỆN TẠI BẰNG PHÍM SPACE
// ==========================================
function speakCurrentPatients(force = false) {
  if (!force || !soundEnabled) return;

  const roomContainers = document.querySelectorAll(".room-container");
  roomContainers.forEach((container) => {
    const roomId = container.dataset.roomId;
    const roomName = container.dataset.roomName || roomId;

    const tracker =
      document.getElementById(`speech-track-${roomId}`) ||
      document.getElementById("speechData");

    let currentPatient = tracker ? (tracker.dataset.patient || tracker.getAttribute("data-patient") || "").trim() : "";
    let dobYear = tracker ? extractBirthYear(tracker.dataset.dobYear || tracker.getAttribute("data-dob-year")) : "";

    // Fallback nếu tracker chưa có dữ liệu: Lấy dòng đầu tiên trong bảng
    if (!currentPatient) {
      const firstRow = container.querySelector("tbody tr[data-patient]");
      if (firstRow) {
        currentPatient = (firstRow.dataset.patient || firstRow.getAttribute("data-patient") || "").trim();
        dobYear = extractBirthYear(firstRow.dataset.dobYear || firstRow.getAttribute("data-dob-year"), firstRow);
      }
    }

    if (!currentPatient) return;

    requestSpeak(currentPatient, roomName, dobYear);
  });
}

// ==========================================
// ==========================================
// TỰ ĐỘNG CUỘN MƯỢT DANH SÁCH (SMOOTH AUTO-SCROLL)
// ==========================================
let lastUserInteractionAt = 0;

function registerUserActivity() {
  lastUserInteractionAt = Date.now();
}
document.addEventListener("mousemove", registerUserActivity, { passive: true });
document.addEventListener("keydown", registerUserActivity, { passive: true });
document.addEventListener("touchstart", registerUserActivity, { passive: true });

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const scrollStates = {};

function stepAutoScroll() {
  requestAnimationFrame(stepAutoScroll);

  // Tạm dừng 15 giây khi người dùng thao tác chuột / bàn phím / remote
  if (Date.now() - lastUserInteractionAt < 15000) return;

  const containers = document.querySelectorAll(".overflow-y-auto");
  const now = Date.now();

  containers.forEach((container, idx) => {
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 15) return; // Danh sách vừa vặn màn hình thì không cần cuộn

    const id = container.id || `scroll-box-${idx}`;
    if (!scrollStates[id]) {
      scrollStates[id] = {
        direction: 1,
        pauseUntil: now + 5000, // Dừng 5 giây ở đầu danh sách để người xem đọc người tới lượt
        lastStep: now,
      };
    }

    const state = scrollStates[id];
    if (now < state.pauseUntil) {
      state.lastStep = now;
      return;
    }

    const elapsed = Math.min(100, now - (state.lastStep || now));
    state.lastStep = now;

    // Tốc độ cuộn êm dịu, dễ đọc (~32px / giây)
    const pxToMove = (32 * elapsed) / 1000;

    if (state.direction === 1) {
      container.scrollTop += pxToMove;
      if (container.scrollTop >= maxScroll - 2) {
        container.scrollTop = maxScroll;
        state.direction = -1;
        state.pauseUntil = now + 4000; // Dừng 4 giây ở đáy danh sách
      }
    } else {
      // Cuộn ngược lên đầu trang
      container.scrollTop -= pxToMove * 1.5;
      if (container.scrollTop <= 2) {
        container.scrollTop = 0;
        state.direction = 1;
        state.pauseUntil = now + 5000; // Dừng 5 giây ở đầu trang
      }
    }
  });
}
requestAnimationFrame(stepAutoScroll);

// ==========================================
// CẬP NHẬT GIAO DIỆN DOM PHÒNG KHÁM
// ==========================================
function updateRoomDOM(roomId, data) {
  if (!data) return;
  lastKnownRoomsData[roomId] = data;

  const roomContainer = document.getElementById(`room-card-${roomId}`);
  const roomName = (roomContainer ? roomContainer.dataset.roomName : "") || (data.tenphong || data.maphong || roomId);
  const roomType = (roomContainer ? roomContainer.dataset.roomType : "") || (data.tenphong ? "cdha" : "room");

  const rawList = data.waitingList || [];
  // Lọc bỏ bệnh nhân đã bị xóa/ẩn và áp dụng đôn thứ tự
  // Với CDHA: Server đã lọc trực tiếp trong database (an = '0'), không lọc qua QueuePolicy sessionStorage
  const waitingList = (window.QueuePolicy && roomType !== "cdha")
    ? window.QueuePolicy.applyQueuePolicy(rawList)
    : (window.QueuePolicy ? window.QueuePolicy.applyManualDemotions(rawList) : [...rawList]);
  const activeWaitingCount = waitingList.filter((p) => p.dakham == 0).length;

  let nextPatientNameToRead = "";
  let nextPatientKeyToRead = "";
  let nextPatientDobYearToRead = "";

  // 1. Cập nhật các badge số đếm
  const singleDk = document.getElementById("totalDKPlus");
  if (singleDk && data.totalDKPlus !== undefined) {
    singleDk.textContent = data.totalDKPlus;
  }
  const multiDk = document.getElementById(`total-dk-${roomId}`);
  if (multiDk && data.totalDKPlus !== undefined) {
    multiDk.textContent = data.totalDKPlus;
  }

  const singleWait = document.getElementById("totalWaiting");
  if (singleWait) {
    singleWait.textContent = activeWaitingCount;
  }
  const multiWait = document.getElementById(`total-wait-${roomId}`);
  if (multiWait) {
    multiWait.textContent = activeWaitingCount;
  }

  // 2. Cập nhật Bảng bệnh nhân
  const isMulti = !!document.getElementById(`tbody-${roomId}`);
  const tbody = isMulti ? document.getElementById(`tbody-${roomId}`) : document.getElementById("patientTableBody");

  if (tbody) {
    if (waitingList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${isMulti ? 4 : 5}" class="text-center ${isMulti ? 'py-8 text-slate-400 font-bold text-base md:text-2xl italic' : 'py-16 text-slate-400 text-3xl font-bold italic'}">
            Phòng trống, không có bệnh nhân.
          </td>
        </tr>
      `;
      const existingBadge = document.getElementById(`page-badge-${roomId}`);
      if (existingBadge) existingBadge.remove();
    } else {
      // Xác định bệnh nhân tới lượt khám
      let waitCounter = 0;
      let nextPatientIndex = -1;

      waitingList.forEach((patient, idx) => {
        if (patient.dakham == 0) {
          waitCounter++;
          if (waitCounter === 1) {
            nextPatientIndex = idx;
            nextPatientNameToRead = `${patient.holot || ""} ${patient.ten || ""}`.trim();
            nextPatientKeyToRead = getPatientKey(patient);
            nextPatientDobYearToRead = extractBirthYear(patient.dobStr || patient.ngaysinh || patient.namSinh);
          }
        }
      });

      const existingBadge = document.getElementById(`page-badge-${roomId}`);
      if (existingBadge) existingBadge.remove();

      let rowsHtml = "";

      waitingList.forEach((patient, index) => {
        const isNear = (index === nextPatientIndex);
        const sttDisplay = index + 1;
        const currentPatientName = `${patient.holot || ""} ${patient.ten || ""}`.trim();
        const pKey = getPatientKey(patient);
        const dobYear = extractBirthYear(patient.dobStr || patient.ngaysinh || patient.namSinh);

        let noteBadge = "";
        if (patient.priorityLabel) {
          noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 text-xs md:text-sm px-1.5 py-0.5 rounded font-extrabold border border-yellow-300 ml-1 whitespace-nowrap truncate max-w-full">Ưu tiên: ${escapeHtml(patient.priorityLabel)}</span>`;
        } else if (patient.isPriority) {
          noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 ${isMulti ? 'text-xs md:text-sm px-1.5 py-0.5' : 'px-3 py-1 text-lg md:text-xl'} rounded font-extrabold border border-yellow-300 ml-1 whitespace-nowrap truncate max-w-full">Ưu tiên</span>`;
        }

        const safePatientName = escapeHtml(currentPatientName);
        const safeRoomName = escapeHtml(roomName);
        const safeKey = escapeHtml(pKey);
        const safeMakb = escapeHtml(patient.makb || "");
        const safeMabn = escapeHtml(patient.mabn || "");
        const safeRoomType = escapeHtml(roomType || "room");
        const safeDobYear = escapeHtml(dobYear);
        const displayPatientName = escapeHtml((currentPatientName || "Chưa cập nhật").toUpperCase());

        if (isMulti) {
          // Giao diện ô chia phòng (Split Screen)
          const rowClass = isNear
            ? "bg-yellow-100 hover:bg-yellow-200 border-l-8 border-yellow-500 shadow-md font-black"
            : "hover:bg-blue-50 border-b border-slate-200";

          const sttClass = isNear ? "text-2xl md:text-4xl lg:text-5xl font-black" : "text-xl md:text-3xl font-bold";
          const nameClass = isNear ? "text-2xl md:text-4xl lg:text-5xl font-black tracking-tight" : "text-xl md:text-3xl lg:text-4xl font-extrabold";
          const dobClass = isNear ? "text-xl md:text-3xl lg:text-4xl font-black" : "text-lg md:text-2xl font-bold";

          const statusBadge = isNear
            ? `<span class="inline-flex items-center justify-center bg-red-600 text-white px-1.5 py-0.5 rounded text-xs font-black uppercase whitespace-nowrap shadow-none">Tới Lượt</span>`
            : `<span class="inline-flex items-center justify-center bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs font-bold border border-slate-300 whitespace-nowrap shadow-none">Chờ khám</span>`;

          const deleteBtn = `
            <button type="button"
                    title="Xóa/Ẩn khỏi màn hình"
                    aria-label="Xóa bệnh nhân khỏi danh sách hiển thị"
                    onclick="removePatientFromElement(this, event)"
                    class="btn-hide-patient p-1 text-slate-300 hover:text-danger hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                    tabindex="0">
              <i class="fas fa-trash-alt text-xs"></i>
            </button>
          `;

          rowsHtml += `
            <tr data-patient="${safePatientName}" data-patient-key="${safeKey}" data-dob-year="${safeDobYear}" data-makb="${safeMakb}" data-mabn="${safeMabn}" data-room="${safeRoomName}" data-room-type="${safeRoomType}" onclick="onRowClick(this)" class="remote-item cursor-pointer transition-all ${rowClass}" tabindex="0">
              <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${sttClass} overflow-hidden">
                ${sttDisplay}
              </td>
              <td class="py-2.5 px-2 text-blue-900 overflow-hidden ${nameClass}">
                <div class="patient-name-container flex flex-col items-start justify-center min-w-0">
                  <span class="patient-name-text truncate max-w-full block">
                    ${displayPatientName}
                  </span>
                  ${noteBadge}
                </div>
              </td>
              <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${dobClass} overflow-hidden">
                ${safeDobYear}
              </td>
              <td class="py-2.5 px-2 text-center whitespace-nowrap overflow-hidden">
                <div class="flex items-center justify-center gap-1.5 flex-nowrap min-w-0">
                  ${statusBadge}
                  ${deleteBtn}
                </div>
              </td>
            </tr>
          `;
        } else {
          // Giao diện 1 phòng toàn màn hình (Single Room)
          const rowClass = isNear
            ? "bg-yellow-100 hover:bg-yellow-200 border-l-8 border-yellow-500 shadow-md"
            : "hover:bg-blue-50 border-b border-slate-200";

          const sttClass = isNear ? "text-5xl md:text-7xl font-black" : "text-4xl md:text-6xl font-bold";
          const nameClass = isNear ? "text-5xl md:text-7xl font-black tracking-tight" : "text-4xl md:text-6xl font-black";
          const dobClass = isNear ? "text-4xl md:text-6xl font-black" : "text-3xl md:text-5xl";

          const statusBadge = isNear
            ? `<span class="inline-block bg-red-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl text-xl md:text-3xl font-black uppercase whitespace-nowrap">Tới Lượt</span>`
            : `<span class="inline-block bg-slate-100 text-slate-600 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-lg md:text-2xl font-bold border-2 border-slate-200 shadow-sm whitespace-nowrap">Chờ Lượt khám</span>`;

          const deleteBtn = `
            <button type="button"
                    title="Xóa/Ẩn khỏi màn hình"
                    aria-label="Xóa bệnh nhân khỏi danh sách hiển thị"
                    onclick="removePatientFromElement(this, event)"
                    class="btn-hide-patient p-2 text-slate-300 hover:text-danger hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                    tabindex="0">
              <i class="fas fa-trash-alt text-lg md:text-2xl"></i>
            </button>
          `;

          rowsHtml += `
            <tr data-patient="${safePatientName}" data-patient-key="${safeKey}" data-dob-year="${safeDobYear}" data-makb="${safeMakb}" data-mabn="${safeMabn}" data-room="${safeRoomName}" data-room-type="${safeRoomType}" onclick="onRowClick(this)" class="remote-item transition-all cursor-pointer ${rowClass}" tabindex="0">
              <td class="py-5 px-4 font-bold text-center text-blue-900 ${sttClass} overflow-hidden">
                ${sttDisplay}
              </td>
              <td class="py-5 px-4 text-blue-900 overflow-hidden ${nameClass}">
                <div class="patient-name-container min-w-0 flex items-center">
                  <span class="patient-name-text truncate max-w-full block">${displayPatientName}</span>
                </div>
              </td>
              <td class="py-5 px-4 font-bold text-center text-blue-900 ${dobClass} overflow-hidden">
                ${safeDobYear}
              </td>
              <td class="py-5 px-4 text-center text-blue-900 overflow-hidden">
                ${noteBadge}
              </td>
              <td class="py-5 px-4 text-center whitespace-nowrap overflow-hidden">
                <div class="flex items-center justify-center gap-2 flex-nowrap min-w-0">
                  ${statusBadge}
                  ${deleteBtn}
                </div>
              </td>
            </tr>
          `;
        }
      });

      tbody.innerHTML = rowsHtml;
    }
  }

  updateHiddenBadge();

  // 3. Cập nhật bệnh nhân tới lượt để gọi bằng phím Space khi cần.
  const tracker = document.getElementById(`speech-track-${roomId}`) || document.getElementById("speechData");
  if (tracker) {
    tracker.dataset.patient = nextPatientNameToRead;
    tracker.dataset.patientKey = nextPatientKeyToRead;
    tracker.dataset.dobYear = nextPatientDobYearToRead;
  }

  if (window.TVRemoteNav && typeof window.TVRemoteNav.refresh === "function") {
    window.TVRemoteNav.refresh();
  }
}
window.updateRoomDOM = updateRoomDOM;

// ==========================================
// SOCKET.IO REALTIME LISTENER & BROADCAST SPEAK
// ==========================================
let boardSocket = null;

function emitBroadcastSpeak(roomType, roomId, patientName, roomName, dobYear) {
  if (boardSocket && typeof boardSocket.emit === "function") {
    boardSocket.emit("broadcast_speak", {
      roomType: roomType || "room",
      roomId: roomId || "",
      patientName,
      roomName,
      dobYear: dobYear || "",
    });
  }
}
window.emitBroadcastSpeak = emitBroadcastSpeak;

function initSocket() {
  if (typeof io === "undefined") return;

  boardSocket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });
  window.boardSocket = boardSocket;

  const roomContainers = document.querySelectorAll(".room-container");

  function updateConnectionStatus(connected, lastSyncTime = null) {
    let indicator = document.getElementById("connectionStatusIndicator");
    if (!indicator) {
      const clock = document.querySelector(".tv-clock");
      if (clock) {
        indicator = document.createElement("div");
        indicator.id = "connectionStatusIndicator";
        indicator.className = "flex items-center gap-1 text-[10px] font-bold ml-1 pl-2 border-l border-slate-200";
        clock.appendChild(indicator);
      }
    }
    if (!indicator) return;

    if (connected) {
      const timeText = lastSyncTime ? lastSyncTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
      indicator.innerHTML = `
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Kết nối máy chủ thời gian thực"></span>
        <span class="text-emerald-700 hidden sm:inline">${timeText ? timeText : 'Trực tiếp'}</span>
      `;
    } else {
      indicator.innerHTML = `
        <span class="inline-block w-2 h-2 rounded-full bg-red-500" title="Mất kết nối máy chủ"></span>
        <span class="text-red-600 font-extrabold text-[10px]">Mất kết nối...</span>
      `;
    }
  }

  boardSocket.on("connect", () => {
    updateConnectionStatus(true, new Date());
    roomContainers.forEach((container) => {
      const roomType = container.dataset.roomType;
      const roomId = container.dataset.roomId;
      boardSocket.emit("join_room", { roomType, roomId });
    });
  });

  boardSocket.on("disconnect", () => {
    updateConnectionStatus(false);
  });

  boardSocket.on("connect_error", () => {
    updateConnectionStatus(false);
  });

  boardSocket.on("room_data_updated", (payload) => {
    if (!payload || !payload.roomId) return;
    updateConnectionStatus(true, new Date());
    updateRoomDOM(payload.roomId, payload.data);
  });

  // Lắng nghe tín hiệu phát thanh loa từ máy khác cùng phòng
  boardSocket.on("trigger_speak", (payload) => {
    if (!payload || !payload.patientName) return;
    const { patientName, roomName, dobYear } = payload;
    requestSpeak(patientName, roomName, dobYear);
  });
}

// ==========================================
// XỬ LÝ MODAL CHIA PHÒNG (SPLIT SCREEN)
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

function applyRoomSelection(basePath = "/room") {
  const checkboxes = document.querySelectorAll('input[name="roomSelection"]:checked');
  const selected = Array.from(checkboxes).map((cb) => cb.value);

  if (selected.length === 0) {
    alert("Vui lòng chọn ít nhất 1 phòng!");
    return;
  }

  if (selected.length > 4) {
    alert("Màn hình chia chỉ hỗ trợ tối đa 4 phòng trên một màn hình TV!");
    return;
  }

  const isCdha =
    basePath.includes("/cdha") ||
    window.location.pathname.includes("/cdha") ||
    document.querySelector('[data-room-type="cdha"]') !== null;

  if (isCdha) {
    // Chuyển sang alias ngắn (1, 2, 3, 4, 5, 6)
    const aliases = selected.map((s) => {
      const match = s.match(/(\d+)/);
      return match ? match[1] : s;
    });

    if (aliases.length === 1) {
      window.location.href = `/cdha/${aliases[0]}`;
    } else {
      window.location.href = `/cdha/${aliases.join(",")}`;
    }
    return;
  }

  if (selected.length === 1) {
    window.location.href = `${basePath}/${encodeURIComponent(selected[0])}`;
  } else {
    window.location.href = `${basePath}/${encodeURIComponent(selected[0])}?rooms=${encodeURIComponent(selected.join(","))}`;
  }
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


window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();
  updateHiddenBadge();
  initSocket();

  // Khởi tạo ban đầu: nếu có bệnh nhân đã bị xóa/ẩn trong sessionStorage, lọc ngay
  const roomContainers = document.querySelectorAll(".room-container");
  roomContainers.forEach((container) => {
    const rId = container.dataset.roomId;
    if (lastKnownRoomsData[rId]) {
      updateRoomDOM(rId, lastKnownRoomsData[rId]);
    }
  });
});
