/**
 * remoteNav.js - Bộ điều khiển D-Pad (Lên / Xuống / Trái / Phải / OK) cho Smart TV
 * Hỗ trợ tối ưu cho: Toshiba (VIDAA OS), Sony/TCL (Android TV), LG (webOS), Samsung (Tizen)
 * Tích hợp điều khiển toàn diện:
 *  - Dashboard chọn phòng
 *  - Nút Mở loa, Nút Chia phòng (M), Nút Quay lại trên Header
 *  - Dòng bệnh nhân trên bảng (bấm OK để gọi đọc tên)
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
      .remote-item.tv-focused {
        outline: none !important;
        border-color: #1e40af !important;
        background-color: #eff6ff !important; /* bg-blue-50 */
        box-shadow: 0 0 0 4px #2563eb, 0 10px 25px -4px rgba(30, 64, 175, 0.35) !important;
        transform: scale(1.04) !important;
        z-index: 40 !important;
        position: relative !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isModalOpen() {
    const modal = document.getElementById("roomModal");
    return modal && !modal.classList.contains("hidden");
  }

  function getNavItems() {
    const modal = document.getElementById("roomModal");
    if (modal && !modal.classList.contains("hidden")) {
      // Khi Modal đang mở: Chỉ điều hướng các phần tử bên trong Modal
      return Array.from(modal.querySelectorAll(".remote-item")).filter(
        (el) => el.offsetParent !== null && !el.disabled
      );
    }

    // Khi Modal đóng: Điều hướng các phần tử trên trang chính (bỏ qua phần tử trong modal)
    return Array.from(document.querySelectorAll(".remote-item")).filter((el) => {
      if (modal && modal.contains(el)) return false;
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
        const distance = primaryDist + secondaryDist * 2.5;
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidateIndex = idx;
        }
      }
    });

    if (bestCandidateIndex !== -1) {
      setFocus(bestCandidateIndex);
    } else {
      // Fallback 1D nếu góc 2D không khớp
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

    // Phím Back / Return / Escape trên Smart TV khi Modal đang mở: Đóng Modal
    if (isModalOpen() && (code === 27 || code === 8 || code === 10009 || code === 461 || key === "escape" || key === "backspace")) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof toggleRoomModal === "function") {
        toggleRoomModal(false);
      }
      setTimeout(() => {
        items = getNavItems();
        setFocus(0);
      }, 100);
      return;
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
      items = getNavItems();
      const currentEl = items[currentIndex];
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

  // Hook hỗ trợ khi mở/đóng Modal
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
      items = getNavItems();
      bindMouseEvents();
      setFocus(currentIndex);
    },
  };
})();
