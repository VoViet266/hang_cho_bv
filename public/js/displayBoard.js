// soundEnabled lưu trong localStorage - duy trì qua các lần reload trang
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
    // Fallback sang Web Speech API (cho Desktop Chrome / thiết bị có hỗ trợ vi-VN)
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
  // Prefix is configured per-page, e.g. "Kính mời bệnh nhân," or "Mời bệnh nhân,"
  const prefix = speechData.dataset.prefix || "Mời bệnh nhân,";

  if (!patientName) return;

  const storageKey = "lastSpokenPatient_" + roomName;
  const lastSpoken = localStorage.getItem(storageKey);

  if (force || patientName !== lastSpoken) {
    const speakText = `${prefix} ${patientName}, vào ${roomName}`;
    const audioUrl = `/api/tts?text=${encodeURIComponent(speakText)}`;

    playAudioUrl(audioUrl, speakText);
    localStorage.setItem(storageKey, patientName);
  }
}

// Function để phát âm thanh khi click vào tên bất kỳ
function speakSpecificPatient(patientName) {
  const speechData = document.getElementById("speechData");
  if (!speechData) return;

  const roomName = speechData.dataset.room;
  const prefix = speechData.dataset.prefix || "Mời bệnh nhân,";

  if (!patientName) return;

  const speakText = `${prefix} ${patientName}, vào ${roomName}`;
  const audioUrl = `/api/tts?text=${encodeURIComponent(speakText)}`;

  playAudioUrl(audioUrl, speakText);
}

window.addEventListener("DOMContentLoaded", () => {
  updateSoundIcon();

  // Tự động kiểm tra và phát âm thanh nếu có bệnh nhân mới tới lượt
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

// Auto-reload trang mỗi 30s
setTimeout(() => {
  window.location.reload();
}, 30000);

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
