/**
 * remoteNav.js - Bộ điều khiển D-Pad (Lên / Xuống / Trái / Phải / OK) cho Smart TV
 * Hỗ trợ tối ưu cho: Toshiba (VIDAA OS), Sony/TCL (Android TV), LG (webOS), Samsung (Tizen)
 * Tích hợp điều khiển toàn diện:
 *  - Dashboard chọn phòng
 *  - Nút Mở loa, Nút Chia phòng (M), Nút Quay lại trên Header
 *  - Di chuyển trực tiếp đến từng dòng bệnh nhân trên bảng (Chế độ 1 phòng & Multi-room Chia 2/Chia 4)
 *  - Phím OK trên dòng bệnh nhân: Mở bảng tác vụ (Gọi đọc tên / Bỏ qua & Đôn người khác lên)
 *  - Phím nóng D / Delete / Backspace: Bỏ qua trực tiếp bệnh nhân đang focus và đôn người kế tiếp lên
 *  - Điều hướng và chọn phòng trực tiếp trong Modal Chia Phòng (M) bằng D-Pad & OK
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
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease !important;
      }
      /* Nút hoặc thẻ card thông thường */
      .remote-item.tv-focused:not(tr) {
        outline: none !important;
        border-color: #1e40af !important;
        background-color: #eff6ff !important;
        box-shadow: 0 0 0 4px #2563eb, 0 10px 25px -4px rgba(30, 64, 175, 0.35) !important;
        transform: scale(1.03) !important;
        z-index: 40 !important;
        position: relative !important;
      }
      /* Dòng bệnh nhân trong bảng (tr) */
      tr.remote-item.tv-focused {
        outline: none !important;
        background-color: #dbeafe !important; /* bg-blue-100 */
        box-shadow: inset 0 0 0 3px #1d4ed8, 0 4px 14px rgba(29, 78, 216, 0.3) !important;
        position: relative !important;
        z-index: 25 !important;
      }
      tr.remote-item.tv-focused td {
        color: #1e3a8a !important;
      }
      tr.remote-item.tv-focused.bg-red-50 td {
        color: #b91c1c !important;
      }
      /* Toast notification banner */
      .tv-toast {
        animation: slideInRight 0.25s ease-out forwards;
      }
      @keyframes slideInRight {
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
    if (activeModal) {
      // Khi Modal đang mở: Chỉ điều hướng các phần tử bên trong Modal đang mở
      return Array.from(activeModal.querySelectorAll(".remote-item")).filter(
        (el) => el.offsetParent !== null && !el.disabled
      );
    }

    // Khi Modal đóng: Điều hướng các phần tử trên trang chính (Header, các dòng bệnh nhân trên bảng)
    const roomModal = document.getElementById("roomModal");
    const patientModal = document.getElementById("patientActionModal");

    return Array.from(document.querySelectorAll(".remote-item")).filter((el) => {
      if (roomModal && roomModal.contains(el)) return false;
      if (patientModal && patientModal.contains(el)) return false;
      return el.offsetParent !== null && !el.disabled;
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
          el.focus();
        }
        if (shouldScroll) {
          el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      } else {
        el.classList.remove(FOCUS_CLASS);
      }
    });

    currentIndex = index;
  }

  /**
   * Tính toán ô mục tiêu theo hướng di chuyển (2D Spatial Navigation)
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
          isValidDirection = dx > 15;
          primaryDist = dx;
          secondaryDist = Math.abs(dy);
          break;
        case "left":
          isValidDirection = dx < -15;
          primaryDist = -dx;
          secondaryDist = Math.abs(dy);
          break;
        case "down":
          isValidDirection = dy > 15;
          primaryDist = dy;
          secondaryDist = Math.abs(dx);
          break;
        case "up":
          isValidDirection = dy < -15;
          primaryDist = -dy;
          secondaryDist = Math.abs(dx);
          break;
      }

      if (isValidDirection) {
        // Ưu tiên các phần tử cùng trục
        const distance = primaryDist + secondaryDist * 2.2;
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
    const key = (e.key || "").toLowerCase();
    const code = e.keyCode || e.which;

    items = getNavItems();
    const currentEl = items[currentIndex];

    // 1. Phím Back / Return / Escape trên Smart TV khi Modal đang mở: Đóng Modal
    if (isModalOpen() && (code === 27 || code === 8 || code === 10009 || code === 461 || key === "escape" || key === "backspace")) {
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

    // 2. Phím nóng Bỏ qua bệnh nhân (Delete, Backspace, phím D, phím X) khi đang focus vào 1 dòng bệnh nhân
    if (!isModalOpen() && currentEl && (currentEl.hasAttribute("data-patient") || currentEl.closest("tr[data-patient]"))) {
      if (code === 46 || code === 8 || key === "delete" || key === "backspace" || key === "d" || key === "x") {
        e.preventDefault();
        e.stopPropagation();
        const tr = currentEl.hasAttribute("data-patient") ? currentEl : currentEl.closest("tr[data-patient]");
        if (typeof window.skipPatientFromElement === "function") {
          window.skipPatientFromElement(tr);
        }
        return;
      }
    }

    let handled = false;

    // PHÍM SANG PHẢI (ArrowRight, Right, VK_RIGHT = 39)
    if (code === 39 || key === "arrowright" || key === "right") {
      moveFocus("right");
      handled = true;
    }
    // PHÍM SANG TRÁI (ArrowLeft, Left, VK_LEFT = 37)
    else if (code === 37 || key === "arrowleft" || key === "left") {
      moveFocus("left");
      handled = true;
    }
    // PHÍM XUỐNG DƯỚI (ArrowDown, Down, VK_DOWN = 40)
    else if (code === 40 || key === "arrowdown" || key === "down") {
      moveFocus("down");
      handled = true;
    }
    // PHÍM LÊN TRÊN (ArrowUp, Up, VK_UP = 38)
    else if (code === 38 || key === "arrowup" || key === "up") {
      moveFocus("up");
      handled = true;
    }
    // PHÍM OK / ENTER (Enter, OK, Select, VK_ENTER = 13, 14, 29443)
    else if (code === 13 || code === 14 || code === 29443 || key === "enter" || key === "ok" || key === "select") {
      if (currentEl) {
        // Nếu là checkbox item trong Modal: toggle checkbox
        const checkbox = currentEl.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          const changeEvt = new Event("change", { bubbles: true });
          checkbox.dispatchEvent(changeEvt);
          if (typeof updateSelectedCount === "function") {
            updateSelectedCount();
          }
        } else if (currentEl.hasAttribute("data-patient") || currentEl.tagName === "TR") {
          // Bấm OK trên dòng bệnh nhân -> Mở modal tác vụ hoặc gọi đọc tên
          if (typeof onRowClick === "function") {
            onRowClick(currentEl);
          } else {
            currentEl.click();
          }
        } else {
          currentEl.click();
        }
        handled = true;
      }
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function bindMouseEvents() {
    items = getNavItems();
    items.forEach((el, idx) => {
      el.addEventListener("mouseenter", () => {
        setFocus(idx, false);
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

    try {
      window.focus();
    } catch (e) {}
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
    window.addEventListener("load", init);
  }

  setTimeout(init, 200);

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
        // Giữ vị trí focus hợp lệ
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
