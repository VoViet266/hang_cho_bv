/**
 * remoteNav.js - Bộ điều khiển D-Pad (Lên / Xuống / Trái / Phải / OK) cho Smart TV (Toshiba VIDAA, Android TV, Tizen, webOS)
 * Sử dụng thuật toán 2D Spatial Navigation dựa trên tọa độ thực tế trên màn hình
 */

(function () {
  let currentIndex = 0;
  let items = [];

  // CSS Style cho ô đang được Focus trên TV
  const FOCUS_CLASS = "tv-focused";

  function injectFocusStyles() {
    if (document.getElementById("tv-focus-style")) return;
    const style = document.createElement("style");
    style.id = "tv-focus-style";
    style.innerHTML = `
      .tv-focused {
        outline: none !important;
        border-color: #1e40af !important;
        background-color: #eff6ff !important; /* bg-blue-50 */
        box-shadow: 0 0 0 4px #3b82f6, 0 10px 25px -5px rgba(0, 0, 0, 0.2) !important;
        transform: scale(1.04) !important;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease !important;
        z-index: 20 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getNavItems() {
    // Lấy tất cả các phần tử có class .remote-item hiển thị trên màn hình
    return Array.from(document.querySelectorAll(".remote-item")).filter(
      (el) => el.offsetParent !== null && !el.disabled
    );
  }

  function setFocus(index) {
    items = getNavItems();
    if (items.length === 0) return;

    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;

    items.forEach((el) => el.classList.remove(FOCUS_CLASS));

    currentIndex = index;
    const target = items[currentIndex];
    if (target) {
      target.classList.add(FOCUS_CLASS);
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  /**
   * Tính toán ô mục tiêu gần nhất theo hướng di chuyển (Spatial 2D Navigation)
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
        // Trọng số ưu tiên hướng chính hơn hướng phụ
        const distance = primaryDist + secondaryDist * 2;
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidateIndex = idx;
        }
      }
    });

    if (bestCandidateIndex !== -1) {
      setFocus(bestCandidateIndex);
    }
  }

  function handleKeyDown(e) {
    const key = e.key;
    const keyCode = e.keyCode;

    // Phím điều hướng D-pad TV: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
    if (key === "ArrowRight" || keyCode === 39) {
      e.preventDefault();
      moveFocus("right");
    } else if (key === "ArrowLeft" || keyCode === 37) {
      e.preventDefault();
      moveFocus("left");
    } else if (key === "ArrowDown" || keyCode === 40) {
      e.preventDefault();
      moveFocus("down");
    } else if (key === "ArrowUp" || keyCode === 38) {
      e.preventDefault();
      moveFocus("up");
    } else if (key === "Enter" || keyCode === 13) {
      items = getNavItems();
      const currentEl = items[currentIndex];
      if (currentEl) {
        e.preventDefault();
        currentEl.click();
      }
    }
  }

  // Khởi tạo
  window.addEventListener("DOMContentLoaded", () => {
    injectFocusStyles();
    items = getNavItems();
    if (items.length > 0) {
      // Focus vào ô đầu tiên mặc định
      setFocus(0);
    }
    window.addEventListener("keydown", handleKeyDown);
  });

  // Hỗ trợ cập nhật lại danh sách ô khi DOM thay đổi
  window.TVRemoteNav = {
    setFocus,
    refresh: () => {
      items = getNavItems();
      setFocus(currentIndex);
    },
  };
})();
