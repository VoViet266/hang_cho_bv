// soundEnabled lưu trong localStorage - duy trì qua các lần mở trang
let soundEnabled = localStorage.getItem("soundEnabled") === "true";

function updateSoundIcon() {
  const icon = document.getElementById("soundIcon");
  const btn = document.getElementById("soundToggleBtn");

  if (soundEnabled) {
    if (icon) {
      icon.className = "fas fa-volume-up text-green-600 text-sm animate-pulse";
    }
    if (btn) {
      btn.title = "Auto đọc: ĐANG BẬT (Bấm để tắt hoặc nhấn phím S)";
    }
  } else {
    if (icon) {
      icon.className = "fas fa-volume-mute text-slate-400 hover:text-slate-600 text-sm";
    }
    if (btn) {
      btn.title = "Auto đọc: ĐANG TẮT (Bấm để bật hoặc nhấn phím S)";
    }
  }
}

function playAudioUrl(url, fallbackText) {
  const audio = new Audio(url);
  audio.volume = 1.0;

  audio.play().catch((err) => {
    console.warn("Lỗi phát âm thanh audio element:", err);
    // Fallback sang Web Speech API (cho thiết bị có hỗ trợ vi-VN)
    if (fallbackText && "speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        utterance.lang = "vi-VN";
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(
          (v) => v.lang.includes("vi") || v.name.includes("Vietnamese"),
        );
        if (viVoice) utterance.voice = viVoice;
        window.speechSynthesis.speak(utterance);
      } catch (speechErr) {
        console.error("Web Speech API fallback thất bại:", speechErr);
      }
    }
  });
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("soundEnabled", soundEnabled);
  updateSoundIcon();

  if (soundEnabled) {
    // Mở khóa Audio context trên Smart TV / Browser bằng file silent.mp3 tĩnh
    const unlockAudio = new Audio("/audio/silent.mp3");
    unlockAudio.volume = 0.01;
    unlockAudio.play().catch(() => {});

    checkAndSpeak(true);
  }
}

function checkAndSpeak(force = false) {
  if (!soundEnabled) return;

  const speechData = document.getElementById("speechData");
  if (!speechData) return;

  const patientName = speechData.dataset.patient;
  const roomName = speechData.dataset.room;
  const prefix = speechData.dataset.prefix || "Mời bệnh nhân,";

  if (!patientName || !patientName.trim()) return;

  const storageKey = "lastSpokenPatient_" + roomName;
  const lastSpoken = localStorage.getItem(storageKey);

  if (force || patientName !== lastSpoken) {
    const speakText = `${prefix} ${patientName}, vào ${roomName}`;
    const audioUrl = `/api/tts?text=${encodeURIComponent(speakText)}`;

    playAudioUrl(audioUrl, speakText);
    localStorage.setItem(storageKey, patientName);
  }
}

// Function phát âm thanh khi click vào bệnh nhân bất kỳ
function speakSpecificPatient(patientName) {
  const speechData = document.getElementById("speechData");
  if (!speechData) return;

  const roomName = speechData.dataset.room;
  const prefix = speechData.dataset.prefix || "Mời bệnh nhân,";

  if (!patientName || !patientName.trim()) return;

  const speakText = `${prefix} ${patientName.trim()}, vào ${roomName}`;
  const audioUrl = `/api/tts?text=${encodeURIComponent(speakText)}`;

  playAudioUrl(audioUrl, speakText);
}

// ==========================================
// CẬP NHẬT GIAO DIỆN REAL-TIME QUA SOCKET.IO
// ==========================================
function updateRoomDOM(data) {
  if (!data) return;

  // 1. Cập nhật Tổng Đăng Ký
  const totalDKEl = document.getElementById("totalDKPlus");
  if (totalDKEl && data.totalDKPlus !== undefined) {
    totalDKEl.textContent = data.totalDKPlus;
  }

  // 2. Cập nhật Đang Chờ
  
  const totalWaitingEl = document.getElementById("totalWaiting");
  if (totalWaitingEl && data.totalWaiting !== undefined) {
    totalWaitingEl.textContent = data.totalWaiting;
  }

  // 3. Cập nhật bảng bệnh nhân
  const tbody = document.getElementById("patientTableBody");
  if (!tbody) return;

  const waitingList = data.waitingList || [];
  let nextPatientNameToRead = "";

  if (waitingList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center p-12 text-slate-500 text-3xl font-bold">Phòng trống, không có bệnh nhân.</td>
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
        noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 p-1 rounded-lg border border-yellow-300 font-extrabold shadow-sm text-xl">Ưu tiên: ${patient.priorityLabel}</span>`;
      } else if (patient.isPriority) {
        noteBadge = `<span class="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-lg border border-yellow-300 font-extrabold uppercase shadow-sm text-xl">Ưu tiên</span>`;
      }

      const rowClass = isNear
        ? "bg-red-50 hover:bg-red-100 border-l-8 border-red-500 shadow-md cursor-pointer"
        : "hover:bg-blue-50 cursor-pointer border-b border-slate-200";

      const sttClass = isNear ? "text-5xl font-black text-danger" : "text-4xl";
      const nameClass = isNear ? "text-6xl font-black tracking-tight text-danger" : "text-5xl font-extrabold";
      const dobClass = isNear ? "text-4xl font-black text-danger" : "text-3xl";

      const statusBadge = isNear
        ? `<span class="inline-block bg-red-600 text-white px-6 py-3 rounded-xl text-3xl font-black uppercase shadow-lg animate-pulse">Tới Lượt Khám</span>`
        : `<span class="inline-block bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-2xl font-bold border-2 border-slate-200 shadow-sm">Chờ Lượt khám</span>`;

      rowsHtml += `
        <tr onclick="speakSpecificPatient('${currentPatientName.replace(/'/g, "\\'")}')" class="transition-all ${rowClass}">
          <td class="py-6 px-6 font-bold text-center text-blue-900 ${sttClass}">
            ${index + 1}
          </td>
          <td class="py-6 px-6 text-blue-900 overflow-hidden">
            <div class="patient-name-container w-full h-full flex items-center">
              <span class="patient-name-text whitespace-nowrap origin-left inline-block ${nameClass}">
                ${(currentPatientName || "Chưa cập nhật").toUpperCase()}
              </span>
            </div>
          </td>
          <td class="py-6 px-6 font-bold text-center text-blue-900 ${dobClass}">
            ${dobYear}
          </td>
          <td class="py-6 px-6 text-center text-blue-900">${noteBadge}</td>
          <td class="py-6 px-6 text-center">
            ${statusBadge}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // 4. Cập nhật speechData và phát âm thanh nếu bệnh nhân mới tới lượt
  const speechData = document.getElementById("speechData");
  if (speechData) {
    speechData.dataset.patient = nextPatientNameToRead;
  }

  // Co giãn font tên nếu bị dài
  fitText();

  // Gọi phát âm thanh tự động nếu có lượt mới
  checkAndSpeak(false);
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

  const speechData = document.getElementById("speechData");
  if (speechData) {
    const roomType = speechData.dataset.roomType || "room";
    const roomId = speechData.dataset.roomId || "";

    socket.on("connect", () => {
      console.log(`[Socket.IO] Đã kết nối tới server. Đang join: ${roomType}:${roomId}`);
      socket.emit("join_room", { roomType, roomId });
    });

    socket.on("room_data_updated", (payload) => {
      if (payload && payload.data) {
        updateRoomDOM(payload.data);
      }
    });

    socket.on("disconnect", () => {
      console.warn("[Socket.IO] Mất kết nối tới server, đang thử kết nối lại...");
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();
  initSocket();

  // Tự động kiểm tra và phát âm thanh ban đầu
  setTimeout(() => checkAndSpeak(false), 1500);
});

// Phím tắt (Bao gồm cả Remote TV):
// 's' hoặc 'Enter' (Phím OK) để bật/tắt âm thanh
// 'Space' (phím cách) hoặc 'ArrowRight' (Phím điều hướng phải) để đọc lại
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "s" || e.key === "Enter") {
    toggleSound();
  } else if (e.code === "Space" || e.key === "ArrowRight") {
    e.preventDefault(); // Tránh cuộn trang
    checkAndSpeak(true);
  }
});

// Logic cập nhật Đồng Hồ
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

// Logic FitText cho khung tên dài
function fitText() {
  const containers = document.querySelectorAll(".patient-name-container");
  containers.forEach((container) => {
    const textSpan = container.querySelector(".patient-name-text");
    if (!textSpan) return;

    // Reset scale to measure true width
    textSpan.style.transform = "scale(1)";

    const containerWidth = container.clientWidth;
    const textWidth = textSpan.scrollWidth;

    if (textWidth > containerWidth && containerWidth > 0) {
      const scale = containerWidth / textWidth;
      textSpan.style.transform = `scale(${scale})`;
    }
  });
}
window.addEventListener("load", fitText);
window.addEventListener("resize", fitText);
// Run once immediately in case fonts are already loaded
fitText();
