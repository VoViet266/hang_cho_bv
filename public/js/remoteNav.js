/**
 * remoteNav.js - Bộ điều hướng thuần D-Pad (Lên / Xuống / Trái / Phải / OK / Back) cho Smart TV & Bàn phím
 * Đã loại bỏ toàn bộ các phím tắt phức tạp, chỉ giữ lại các phím điều hướng chuẩn:
 *  - Lên / Xuống / Trái / Phải (D-Pad): Di chuyển giữa các ô phòng, dòng bệnh nhân và nút bấm
 *  - OK / Enter: Chọn, kích hoạt nút, hoặc mở bảng tác vụ bệnh nhân
 *  - Back / Escape: Đóng hộp thoại / Quay lại
 */

(function () {
  let currentIndex = 0;
  let items = [];
  let isInitialized = false;

  const FOCUS_CLASS = "tv-focused";

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

    // Lọc các phần tử thực sự hiển thị trên màn hình
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
    // 1. PHÍM LÊN (ArrowUp, DPAD_UP = 19, VK_UP = 38)
    // ========================================================
    if (code === 38 || code === 19 || key === "arrowup" || key === "up" || key === "dpadup") {
      moveFocus("up");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 2. PHÍM XUỐNG (ArrowDown, DPAD_DOWN = 20, VK_DOWN = 40)
    // ========================================================
    if (code === 40 || code === 20 || key === "arrowdown" || key === "down" || key === "dpaddown") {
      moveFocus("down");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 3. PHÍM TRÁI (ArrowLeft, DPAD_LEFT = 21, VK_LEFT = 37)
    // ========================================================
    if (code === 37 || code === 21 || key === "arrowleft" || key === "left" || key === "dpadleft") {
      moveFocus("left");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 4. PHÍM PHẢI (ArrowRight, DPAD_RIGHT = 22, VK_RIGHT = 39)
    // ========================================================
    if (code === 39 || code === 22 || key === "arrowright" || key === "right" || key === "dpadright") {
      moveFocus("right");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ========================================================
    // 5. PHÍM OK / ENTER (13, 14, 23, 66, 29443, 65385)
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
    // 6. PHÍM BACK / RETURN / ESCAPE (4, 27, 461, 10009, Backspace)
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

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.body.addEventListener("keydown", handleKeyDown, true);

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
