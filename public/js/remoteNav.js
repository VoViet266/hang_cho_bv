/**
 * remoteNav.js - Bộ điều khiển D-Pad (Lên / Xuống / Trái / Phải / OK) cho Smart TV & Bàn phím
 * Hỗ trợ tối ưu 100% cho mọi dòng TV:
 *  - Android TV (Sony, TCL, Xiaomi, Casper, Sharp): KeyCode 19, 20, 21, 22, 23, 66, 4
 *  - Samsung Tizen OS: KeyCode 37, 38, 39, 40, 13, 29443, 10009, 403..406
 *  - LG webOS: KeyCode 37, 38, 39, 40, 13, 461, 65385, 403..406
 *  - Toshiba VIDAA OS / Hisense / Philips: KeyCode 13, 14, 29443, 37..40
 *  - Bàn phím máy tính / Laptop: Arrow keys, Space, Enter, Escape, D, R, S, M
 */

(function () {
  let currentIndex = 0;
  let items = [];
  let isInitialized = false;

  const FOCUS_CLASS = "tv-focused";

  // Đăng ký phím chuyên dụng nếu là Tizen OS
  try {
    if (window.tizen && window.tizen.tvinputdevice) {
      const tvKeys = [
        "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
        "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop"
      ];
      tvKeys.forEach((k) => {
        try { window.tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
  } catch (e) {}

  function injectFocusStyles() {
    if (document.getElementById("tv-focus-style")) return;
    const style = document.createElement("style");
    style.id = "tv-focus-style";
    style.innerHTML = `
      .remote-item {
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      /* Nút hoặc thẻ card thông thường */
      .remote-item.tv-focused:not(tr) {
        outline: none !important;
        border-color: #1e40af !important;
        background-color: #dbeafe !important;
        box-shadow: 0 0 0 5px #2563eb, 0 12px 30px -4px rgba(30, 64, 175, 0.45) !important;
        transform: scale(1.04) !important;
        z-index: 50 !important;
        position: relative !important;
      }
      /* Dòng bệnh nhân trong bảng (tr) */
      tr.remote-item.tv-focused {
        outline: none !important;
        background-color: #bfdbfe !important; /* bg-blue-200 đậm rõ nét */
        box-shadow: inset 0 0 0 4px #1d4ed8, 0 6px 18px rgba(29, 78, 216, 0.4) !important;
        position: relative !important;
        z-index: 30 !important;
      }
      tr.remote-item.tv-focused td {
        color: #1e3a8a !important;
        font-weight: 900 !important;
      }
      tr.remote-item.tv-focused.bg-red-50 td {
        color: #b91c1c !important;
      }
      .tv-toast {
        animation: tvToastSlide 0.25s ease-out forwards;
      }
      @keyframes tvToastSlide {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function getActiveModal() {
    const patientModal = document.getElementById("patientActionModal");
    if (patientModal && !patientModal.classList.contains("hidden")) return patientModal;
    const roomModal = document.getElementById("roomModal");
    if (roomModal && !roomModal.classList.contains("hidden")) return roomModal;
    return null;
  }

  function isModalOpen() {
    return getActiveModal() !== null;
  }

  function getNavItems() {
    const activeModal = getActiveModal();
    let rawElements = [];

    if (activeModal) {
      // Khi Modal đang mở: Chỉ điều hướng các phần tử bên trong Modal
      rawElements = Array.from(activeModal.querySelectorAll(".remote-item"));
    } else {
      // Khi Modal đóng: Điều hướng Header + Bảng bệnh nhân
      const roomModal = document.getElementById("roomModal");
      const patientModal = document.getElementById("patientActionModal");

      rawElements = Array.from(document.querySelectorAll(".remote-item")).filter((el) => {
        if (roomModal && roomModal.contains(el)) return false;
        if (patientModal && patientModal.contains(el)) return false;
        return true;
      });
    }

    // Lọc các phần tử thực sự hiển thị trên màn hình (độ tương thích TV cao)
    return rawElements.filter((el) => {
      if (el.disabled) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function setFocus(index, shouldScroll = true) {
    items = getNavItems();
    if (items.length === 0) return;

    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;

    items.forEach((el, i) => {
      if (i === index) {
        el.classList.add(FOCUS_CLASS);
        el.setAttribute("tabindex", "0");
        try {
          el.focus({ preventScroll: !shouldScroll });
        } catch (e) {
          try { el.focus(); } catch (err) {}
        }
        if (shouldScroll) {
          try {
            el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          } catch (e) {}
        }
      } else {
        el.classList.remove(FOCUS_CLASS);
      }
    });

    currentIndex = index;
  }

  /**
   * Tính toán ô mục tiêu theo hướng di chuyển 2D Spatial Navigation
   */
  function moveFocus(direction) {
    items = getNavItems();
    if (items.length === 0) return;

    const currentEl = items[currentIndex];
    if (!currentEl) {
      setFocus(0);
      return;
    }

    const currentRect = currentEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2,
    };

    let bestCandidateIndex = -1;
    let minDistance = Infinity;

    items.forEach((el, idx) => {
      if (idx === currentIndex) return;

      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      let isValidDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      switch (direction) {
        case "right":
          isValidDirection = dx > 10;
          primaryDist = dx;
          secondaryDist = Math.abs(dy);
          break;
        case "left":
          isValidDirection = dx < -10;
          primaryDist = -dx;
          secondaryDist = Math.abs(dy);
          break;
        case "down":
          isValidDirection = dy > 10;
          primaryDist = dy;
          secondaryDist = Math.abs(dx);
          break;
        case "up":
          isValidDirection = dy < -10;
          primaryDist = -dy;
          secondaryDist = Math.abs(dx);
          break;
      }

      if (isValidDirection) {
        const distance = primaryDist + secondaryDist * 2.0;
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidateIndex = idx;
        }
      }
    });

    if (bestCandidateIndex !== -1) {
      setFocus(bestCandidateIndex);
    } else {
      // Fallback 1D nếu 2D không tìm thấy
      if (direction === "right" || direction === "down") {
        if (currentIndex < items.length - 1) {
          setFocus(currentIndex + 1);
        }
      } else if (direction === "left" || direction === "up") {
        if (currentIndex > 0) {
          setFocus(currentIndex - 1);
        }
      }
    }
  }

  function handleKeyDown(e) {
    const rawKey = e.key || "";
    const key = rawKey.toLowerCase();
    const code = e.keyCode || e.which || 0;

    items = getNavItems();
    const currentEl = items[currentIndex];

    // ========================================================
    // 1. NHẬN DIỆN PHÍM LÊN (ArrowUp, DPAD_UP = 19, VK_UP = 38)
    // ========================================================
    if (code === 38 || code === 19 || key === "arrowup" || key === "up" || key === "dpadup") {
      moveFocus("up");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 2. NHẬN DIỆN PHÍM XUỐNG (ArrowDown, DPAD_DOWN = 20, VK_DOWN = 40)
    // ========================================================
    if (code === 40 || code === 20 || key === "arrowdown" || key === "down" || key === "dpaddown") {
      moveFocus("down");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 3. NHẬN DIỆN PHÍM TRÁI (ArrowLeft, DPAD_LEFT = 21, VK_LEFT = 37)
    // ========================================================
    if (code === 37 || code === 21 || key === "arrowleft" || key === "left" || key === "dpadleft") {
      moveFocus("left");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 4. NHẬN DIỆN PHÍM PHẢI (ArrowRight, DPAD_RIGHT = 22, VK_RIGHT = 39)
    // ========================================================
    if (code === 39 || code === 22 || key === "arrowright" || key === "right" || key === "dpadright") {
      moveFocus("right");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 5. NHẬN DIỆN PHÍM OK / ENTER (13, 14, 23, 66, 29443, 65385)
    // ========================================================
    if (
      code === 13 ||
      code === 23 ||
      code === 66 ||
      code === 14 ||
      code === 29443 ||
      code === 65385 ||
      key === "enter" ||
      key === "ok" ||
      key === "select" ||
      key === "dpadcenter"
    ) {
      if (currentEl) {
        const checkbox = currentEl.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          const changeEvt = new Event("change", { bubbles: true });
          checkbox.dispatchEvent(changeEvt);
          if (typeof updateSelectedCount === "function") {
            updateSelectedCount();
          }
        } else if (currentEl.hasAttribute("data-patient") || currentEl.tagName === "TR") {
          if (typeof onRowClick === "function") {
            onRowClick(currentEl);
          } else {
            currentEl.click();
          }
        } else {
          currentEl.click();
        }
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 6. NHẬN DIỆN PHÍM BACK / RETURN / ESCAPE (4, 8, 27, 461, 10009)
    // ========================================================
    if (
      code === 27 ||
      code === 4 ||
      code === 10009 ||
      code === 461 ||
      (isModalOpen() && (code === 8 || key === "backspace")) ||
      key === "escape" ||
      key === "back" ||
      key === "goback"
    ) {
      if (isModalOpen()) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof closePatientActionModal === "function" && document.getElementById("patientActionModal") && !document.getElementById("patientActionModal").classList.contains("hidden")) {
          closePatientActionModal();
        } else if (typeof toggleRoomModal === "function") {
          toggleRoomModal(false);
        }
        setTimeout(() => {
          items = getNavItems();
          setFocus(0);
        }, 100);
        return;
      }
    }

    // ========================================================
    // 7. PHÍM ĐỎ TRÊN REMOTE, PHÍM TUA TỚI (⏩), PHÍM SỐ 0 HOẶC PHÍM D / DELETE (Bỏ qua & Đôn lên)
    // Code: 403 (Tizen Red), 183 (Android TV Red), 228 (FastForward), 176 (NextTrack), 48/96 (Số 0), 46 (Delete), 8 (Backspace), phím 'd'
    // ========================================================
    if (
      code === 403 ||
      code === 183 ||
      code === 228 ||
      code === 176 ||
      code === 87 ||
      code === 48 ||
      code === 96 ||
      key === "colorf0red" ||
      key === "red" ||
      key === "mediafastforward" ||
      key === "mediatracknext" ||
      key === "0" ||
      (!isModalOpen() && (code === 46 || code === 8 || key === "delete" || key === "backspace" || key === "d" || key === "x"))
    ) {
      if (currentEl && (currentEl.hasAttribute("data-patient") || currentEl.closest("tr[data-patient]"))) {
        e.preventDefault();
        e.stopPropagation();
        const tr = currentEl.hasAttribute("data-patient") ? currentEl : currentEl.closest("tr[data-patient]");
        if (typeof window.skipPatientFromElement === "function") {
          window.skipPatientFromElement(tr);
        }
        return;
      }
    }

    // ========================================================
    // 8. PHÍM XANH LÁ TRÊN REMOTE HOẶC PHÍM R / SPACE (Đọc lại tên)
    // Code: 404 (Tizen Green), 184 (Android TV Green), 82 ('r'), 32 (Space)
    // ========================================================
    if (code === 404 || code === 184 || key === "colorf1green" || key === "green") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof speakCurrentPatients === "function") {
        speakCurrentPatients(true);
      } else if (typeof checkInitialSpeech === "function") {
        checkInitialSpeech(true);
      }
      return;
    }

    // ========================================================
    // 9. PHÍM VÀNG TRÊN REMOTE HOẶC PHÍM M (Mở Chia phòng)
    // Code: 405 (Tizen Yellow), 185 (Android TV Yellow), 77 ('m')
    // ========================================================
    if (code === 405 || code === 185 || key === "colorf2yellow" || key === "yellow") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof toggleRoomModal === "function") {
        toggleRoomModal(!isModalOpen());
      }
      return;
    }

    // ========================================================
    // 10. PHÍM XANH DƯƠNG TRÊN REMOTE HOẶC PHÍM S (Bật/Tắt Loa)
    // Code: 406 (Tizen Blue), 186 (Android TV Blue), 83 ('s')
    // ========================================================
    if (code === 406 || code === 186 || key === "colorf3blue" || key === "blue") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof toggleSound === "function") {
        toggleSound();
      }
      return;
    }
  }

  function bindMouseEvents() {
    items = getNavItems();
    items.forEach((el, idx) => {
      el.addEventListener("mouseenter", () => {
        setFocus(idx, false);
      });
      el.addEventListener("click", () => {
        currentIndex = idx;
      });
    });
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    injectFocusStyles();
    items = getNavItems();
    bindMouseEvents();

    if (items.length > 0) {
      setFocus(0, false);
    }

    // Lắng nghe cả 3 lớp sự kiện để không bị TV Browser nuốt event
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.body.addEventListener("keydown", handleKeyDown, true);

    // Bắt buộc document có focus trên TV
    try {
      window.focus();
      document.body.tabIndex = 0;
      document.body.focus();
    } catch (e) {}
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
    window.addEventListener("load", init);
  }

  setTimeout(init, 300);

  // Hook toàn cục
  window.TVRemoteNav = {
    setFocus,
    onModalToggle: (isOpen) => {
      setTimeout(() => {
        items = getNavItems();
        bindMouseEvents();
        setFocus(0);
      }, 50);
    },
    refresh: () => {
      setTimeout(() => {
        items = getNavItems();
        bindMouseEvents();
        if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);
        setFocus(currentIndex, false);
      }, 50);
    },
    getCurrentElement: () => {
      items = getNavItems();
      return items[currentIndex] || null;
    }
  };
})();
