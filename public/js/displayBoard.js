// soundEnabled lưu trong localStorage - duy trì qua các lần mở trang
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

// ==========================================
// CHUẨN HÓA TÊN PHÒNG KHI ĐỌC GIỌNG NÓI
// ==========================================
function formatRoomSpokenName(roomName) {
  if (!roomName || !roomName.trim()) return "";
  const clean = roomName.trim();
  if (/^(phòng|khoa)/i.test(clean)) {
    return clean;
  }
  return `phòng ${clean}`;
}

// ==========================================
// AUDIO QUEUE MANAGER (XẾP HÀNG ÂM THANH)
// Đảm bảo không bị đè giọng khi có nhiều phòng cùng gọi
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
        setTimeout(() => this.playNext(), 350);
      };

      this.currentAudio.onerror = (err) => {
        console.warn("Lỗi phát audio stream:", err);
        if ("speechSynthesis" in window) {
          try {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = "vi-VN";
            utterance.onend = () => setTimeout(() => this.playNext(), 350);
            utterance.onerror = () => setTimeout(() => this.playNext(), 350);
            window.speechSynthesis.speak(utterance);
            return;
          } catch (e) {}
        }
        setTimeout(() => this.playNext(), 350);
      };

      this.currentAudio.play().catch((err) => {
        console.warn("Không thể autoplay, chuyển câu tiếp theo:", err);
        setTimeout(() => this.playNext(), 350);
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
  const btn = document.getElementById("soundToggleBtn");

  if (soundEnabled) {
    if (icon) {
      icon.className = "fas fa-volume-up text-green-600 text-sm animate-pulse";
    }
    if (text) {
      text.textContent = "Loa: BẬT";
    }
    if (btn) {
      btn.title = "Loa: ĐANG BẬT (Phím S hoặc Enter để tắt, Space để Đọc Lại)";
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 text-sm";
    }
    if (text) {
      text.textContent = "Loa: TẮT";
    }
    if (btn) {
      btn.title = "Loa: ĐANG TẮT (Phím S hoặc Enter để bật)";
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

    speakCurrentPatients(true);
  } else {
    audioQueue.clear();
  }
}

// Gọi đọc 1 bệnh nhân cụ thể
function requestSpeak(patientName, roomName) {
  if (!patientName || !patientName.trim()) return;
  const spokenRoom = formatRoomSpokenName(roomName);
  const speakText = `Mời bệnh nhân, ${patientName.trim()}, vào ${spokenRoom}`;
  audioQueue.enqueue(speakText);
}

// Hàm nhận sự kiện click vào dòng bệnh nhân (Data-driven, không lỗi nháy đơn)
function onRowClick(el) {
  if (!el) return;
  const patientName = el.dataset.patient || "";
  const roomName = el.dataset.room || "";
  if (patientName) {
    requestSpeak(patientName, roomName);
  }
}
window.onRowClick = onRowClick;

function speakSpecificPatient(patientName) {
  const roomContainers = document.querySelectorAll(".room-container");
  let roomName = "";
  if (roomContainers.length > 0) {
    roomName = roomContainers[0].dataset.roomName || "";
  }
  requestSpeak(patientName, roomName);
}

// Đọc bệnh nhân kế tiếp của các phòng đang hiển thị
function speakCurrentPatients(force = false) {
  if (!soundEnabled) return;
  const roomContainers = document.querySelectorAll(".room-container");
  
  roomContainers.forEach((card) => {
    const roomId = card.dataset.roomId || "";
    const roomName = card.dataset.roomName || roomId;
    const tracker = document.getElementById(`speech-track-${roomId}`) || document.getElementById("speechData");
    
    let pName = "";
    if (tracker && tracker.dataset.patient) {
      pName = tracker.dataset.patient.trim();
    }

    if (pName) {
      const storageKey = `lastSpoken_${roomId}`;
      const lastSpoken = localStorage.getItem(storageKey);
      
      if (force || pName !== lastSpoken) {
        requestSpeak(pName, roomName);
        localStorage.setItem(storageKey, pName);
      }
    }
  });
}

// ==========================================
// CẬP NHẬT GIAO DIỆN REAL-TIME QUA SOCKET.IO
// ==========================================
function updateRoomDOM(roomId, data) {
  if (!data) return;

  const card = document.getElementById(`room-card-${roomId}`);
  const roomName = card ? (card.dataset.roomName || roomId) : roomId;
  const waitingList = data.waitingList || [];
  let nextPatientNameToRead = "";

  // 1. Cập nhật số liệu Đăng Ký & Đang Chờ
  const singleDk = document.getElementById("totalDKPlus");
  if (singleDk && data.totalDKPlus !== undefined) {
    singleDk.textContent = data.totalDKPlus;
  }
  const multiDk = document.getElementById(`total-dk-${roomId}`);
  if (multiDk && data.totalDKPlus !== undefined) {
    multiDk.textContent = data.totalDKPlus;
  }

  const singleWait = document.getElementById("totalWaiting");
  if (singleWait && data.totalWaiting !== undefined) {
    singleWait.textContent = data.totalWaiting;
  }
  const multiWait = document.getElementById(`total-wait-${roomId}`);
  if (multiWait && data.totalWaiting !== undefined) {
    multiWait.textContent = data.totalWaiting;
  }

  // 2. Cập nhật Bảng bệnh nhân
  const isMulti = !!document.getElementById(`tbody-${roomId}`);
  const tbody = isMulti ? document.getElementById(`tbody-${roomId}`) : document.getElementById("patientTableBody");

  if (tbody) {
    if (waitingList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${isMulti ? 4 : 5}" class="text-center ${isMulti ? 'py-8 text-slate-400 font-bold text-base md:text-xl italic' : 'py-16 text-slate-400 text-3xl font-bold italic'}">
            Phòng trống, không có bệnh nhân.
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

        let noteBadge = "";
        if (patient.priorityLabel) {
          noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 ${isMulti ? 'text-[10px] md:text-xs px-1 py-0.5' : 'px-3 py-1 text-lg md:text-xl'} rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên: ${patient.priorityLabel}</span>`;
        } else if (patient.isPriority) {
          noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 ${isMulti ? 'text-[10px] md:text-xs px-1 py-0.5' : 'px-3 py-1 text-lg md:text-xl'} rounded font-extrabold border border-yellow-300 ml-1">Ưu tiên</span>`;
        }

        const safePatientName = currentPatientName.replace(/"/g, '&quot;');
        const safeRoomName = roomName.replace(/"/g, '&quot;');

        if (isMulti) {
          // Giao diện ô chia phòng
          const rowClass = isNear
            ? "bg-red-50 hover:bg-red-100 border-l-8 border-red-500 shadow-md font-black"
            : "hover:bg-blue-50 border-b border-slate-200";

          const sttClass = isNear ? "text-danger text-2xl md:text-4xl lg:text-5xl font-black" : "text-xl md:text-3xl font-bold";
          const nameClass = isNear ? "text-danger text-2xl md:text-4xl lg:text-5xl font-black tracking-tight" : "text-xl md:text-3xl lg:text-4xl font-extrabold";
          const dobClass = isNear ? "text-danger text-xl md:text-3xl lg:text-4xl font-black" : "text-lg md:text-2xl font-bold";

          const statusBadge = isNear
            ? `<span class="inline-block bg-red-600 text-white px-2.5 md:px-4 py-1 rounded-xl text-sm md:text-xl font-black uppercase shadow-lg animate-pulse">Tới Lượt</span>`
            : `<span class="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs md:text-base font-bold border border-slate-300 shadow-sm">Chờ khám</span>`;

          rowsHtml += `
            <tr data-patient="${safePatientName}" data-room="${safeRoomName}" onclick="onRowClick(this)" class="cursor-pointer transition-all ${rowClass}">
              <td class="py-2.5 px-2 text-center font-bold text-blue-900 ${sttClass}">
                ${index + 1}
              </td>
              <td class="py-2.5 px-2 text-blue-900 ${nameClass}">
                <div class="patient-name-container flex items-center overflow-hidden">
                  <span class="patient-name-text truncate">
                    ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
                  </span>
                  ${noteBadge}
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
        } else {
          // Giao diện 1 phòng toàn màn hình
          const rowClass = isNear
            ? "bg-red-50 hover:bg-red-100 border-l-8 border-red-500 shadow-md"
            : "hover:bg-blue-50 border-b border-slate-200";

          const sttClass = isNear ? "text-5xl md:text-7xl font-black text-danger" : "text-4xl md:text-6xl font-bold";
          const nameClass = isNear ? "text-5xl md:text-7xl font-black tracking-tight text-danger" : "text-4xl md:text-6xl font-black";
          const dobClass = isNear ? "text-4xl md:text-6xl font-black text-danger" : "text-3xl md:text-5xl";

          const statusBadge = isNear
            ? `<span class="inline-block bg-red-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl text-xl md:text-3xl font-black uppercase shadow-lg animate-pulse">Tới Lượt Khám</span>`
            : `<span class="inline-block bg-slate-100 text-slate-600 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-lg md:text-2xl font-bold border-2 border-slate-200 shadow-sm">Chờ Lượt khám</span>`;

          rowsHtml += `
            <tr data-patient="${safePatientName}" data-room="${safeRoomName}" onclick="onRowClick(this)" class="transition-all cursor-pointer ${rowClass}">
              <td class="py-5 px-4 font-bold text-center text-blue-900 ${sttClass}">
                ${index + 1}
              </td>
              <td class="py-5 px-4 text-blue-900 overflow-hidden ${nameClass}">
                <div class="patient-name-container truncate">
                  ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
                </div>
              </td>
              <td class="py-5 px-4 font-bold text-center text-blue-900 ${dobClass}">
                ${dobYear}
              </td>
              <td class="py-5 px-4 text-center text-blue-900">
                ${noteBadge}
              </td>
              <td class="py-5 px-4 text-center">
                ${statusBadge}
              </td>
            </tr>
          `;
        }
      });

      tbody.innerHTML = rowsHtml;
    }
  }

  // 3. Cập nhật speech tracker và phát âm thanh nếu có bệnh nhân mới
  const tracker = document.getElementById(`speech-track-${roomId}`) || document.getElementById("speechData");
  if (tracker) {
    tracker.dataset.patient = nextPatientNameToRead;
  }

  const storageKey = `lastSpoken_${roomId}`;
  const lastSpoken = localStorage.getItem(storageKey);

  if (nextPatientNameToRead && nextPatientNameToRead !== lastSpoken) {
    requestSpeak(nextPatientNameToRead, roomName);
    localStorage.setItem(storageKey, nextPatientNameToRead);
  }

  fitText();
}

// ==========================================
// KHỞI TẠO SOCKET.IO CLIENT
// ==========================================
function initSocket() {
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

  const roomContainers = document.querySelectorAll(".room-container");

  socket.on("connect", () => {
    console.log("[Socket.IO] Đã kết nối tới server. Đang join các phòng hiển thị...");
    roomContainers.forEach((card) => {
      const roomType = card.dataset.roomType || "room";
      const roomId = card.dataset.roomId || "";
      if (roomId) {
        socket.emit("join_room", { roomType, roomId });
      }
    });
  });

  socket.on("room_data_updated", (payload) => {
    if (payload && payload.roomId && payload.data) {
      updateRoomDOM(payload.roomId, payload.data);
    }
  });

  socket.on("disconnect", () => {
    console.warn("[Socket.IO] Mất kết nối tới server, đang thử kết nối lại...");
  });
}

// ==========================================
// MODAL CẤU HÌNH CHIA PHÒNG
// ==========================================
function toggleRoomModal(open) {
  const modal = document.getElementById("roomModal");
  if (modal) {
    if (open) {
      modal.classList.remove("hidden");
    } else {
      modal.classList.add("hidden");
    }
    if (window.TVRemoteNav && typeof window.TVRemoteNav.onModalToggle === "function") {
      window.TVRemoteNav.onModalToggle(open);
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

function applyRoomSelection(basePath = "/room") {
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

  if (selected.length === 1) {
    window.location.href = `${basePath}/${encodeURIComponent(selected[0])}`;
  } else {
    window.location.href = `${basePath}/${encodeURIComponent(selected[0])}?rooms=${encodeURIComponent(selected.join(","))}`;
  }
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.name === "roomSelection") {
    updateSelectedCount();
  }
});

window.addEventListener("keydown", (e) => {
  const modal = document.getElementById("roomModal");
  const isModalOpen = modal && !modal.classList.contains("hidden");

  const key = (e.key || "").toLowerCase();
  const code = e.keyCode || e.which;

  // Bật/Tắt âm thanh: Phím S, Enter, OK
  if (key === "s" || key === "enter" || key === "ok" || code === 13 || code === 14 || code === 29443 || code === 83) {
    if (isModalOpen) return;
    toggleSound();
  } 
  // Đọc lại ngay: Phím Space, Phím mũi tên Phải, Phím R
  else if (e.code === "Space" || key === " " || key === "arrowright" || key === "right" || key === "r" || code === 39 || code === 32 || code === 82) {
    if (isModalOpen) return;
    e.preventDefault();
    speakCurrentPatients(true);
  } 
  // Mở modal chia phòng: Phím M
  else if (key === "m" || code === 77) {
    toggleRoomModal(!isModalOpen);
  }
}, true);

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
  setTimeout(() => speakCurrentPatients(false), 1500);
});
