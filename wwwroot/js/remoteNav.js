/**
 * remoteNav.js - Bộ điều hướng toàn diện cho Bàn phím máy tính (PC Keyboard) & Smart TV Remote
 * Hỗ trợ đầy đủ các phím chuẩn trên bàn phím máy tính:
 *  - Phím M: Mở / Đóng modal chia phòng (Multi Tab / Cấu hình phòng)
 *  - Phím A hoặc S: Bật / Tắt âm thanh (Audio / Sound)
 *  - Phím Space (Phím cách): Đọc lại tên bệnh nhân hiện tại
 *  - Phím H: Mở / Đóng danh sách bệnh nhân đã xóa / ẩn
 *  - Phím Delete (Del), D, X, 0: Xóa / Ẩn bệnh nhân khỏi màn hình
 *  - Phím Backspace: Khi ở trên dòng bệnh nhân -> Xóa/Ẩn; Khi ở ngoài -> Quay lại trang trước; Khi trong modal -> Đóng modal
 *  - Phím Escape (Esc): Đóng modal đang mở
 *  - Phím Mũi tên (Lên / Xuống / Trái / Phải): Di chuyển focus 2D
 *  - Phím Tab / Shift+Tab: Di chuyển tới / lui giữa các phần tử
 *  - Phím Home / End: Về đầu / Về cuối danh sách
 *  - Phím Enter / Return: Chọn nút, check ô phòng hoặc gọi tên bệnh nhân
 */

(function () {
  let currentIndex = 0;
  let items = [];
  let isInitialized = false;
  let focusedKey = "";
  let refreshTimer = null;
  let resetFocusOnRefresh = false;

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
        transform: none !important;
        z-index: 50 !important;
        position: relative !important;
      }
      /* Dòng bệnh nhân trong bảng (tr) */
      tr.remote-item.tv-focused {
        outline: none !important;
        background-color: #bfdbfe !important; /* bg-blue-200 đậm rõ nét */
        box-shadow: inset 0 0 0 3px #1d4ed8 !important;
        position: relative !important;
        z-index: 30 !important;
      }
      tr.remote-item.tv-focused td {
        color: #1e3a8a !important;
        font-weight: 900 !important;
      }
      tr.remote-item.tv-focused.bg-red-50 td,
      tr.remote-item.tv-focused.bg-yellow-100 td {
        color: #1e3a8a !important;
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
    const roomModal = document.getElementById("roomModal");
    if (roomModal && !roomModal.classList.contains("hidden")) return roomModal;

    const hiddenModal = document.getElementById("hiddenPatientsModal");
    if (hiddenModal && !hiddenModal.classList.contains("hidden")) return hiddenModal;

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
      const hiddenModal = document.getElementById("hiddenPatientsModal");

      rawElements = Array.from(document.querySelectorAll(".remote-item")).filter((el) => {
        if (roomModal && roomModal.contains(el)) return false;
        if (hiddenModal && hiddenModal.contains(el)) return false;
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

  function getItemKey(el) {
    if (!el) return "";
    if (el.dataset && el.dataset.patientKey) {
      const room = el.closest("[data-room-id]");
      return JSON.stringify([
        room?.dataset.roomType || el.dataset.roomType || "room",
        room?.dataset.roomId || el.dataset.room || "",
        el.dataset.patientKey,
      ]);
    }
    return el.id ? `id:${el.id}` : "";
  }

  function refreshItems() {
    items = getNavItems();
    const matchingIndex = focusedKey ? items.findIndex((el) => getItemKey(el) === focusedKey) : -1;
    if (matchingIndex >= 0) currentIndex = matchingIndex;
    else currentIndex = Math.min(currentIndex, Math.max(0, items.length - 1));
    return items;
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
    focusedKey = getItemKey(items[index]);
  }

  /**
   * Tính toán ô mục tiêu theo hướng di chuyển 2D Spatial Navigation
   */
  function moveFocus(direction) {
    refreshItems();
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
    // Nếu đang gõ vào ô nhập liệu văn bản thực sự thì không can thiệp
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    const targetType = (e.target && e.target.type) ? e.target.type.toLowerCase() : "";
    if (targetTag === "TEXTAREA" || (targetTag === "INPUT" && targetType !== "checkbox" && targetType !== "button")) {
      return;
    }

    const rawKey = e.key || "";
    const key = rawKey.toLowerCase();
    const code = e.keyCode || e.which || 0;

    refreshItems();
    const currentEl = items[currentIndex];

    if (key === "m" || code === 77) {
      e.preventDefault();
      e.stopPropagation();
      const roomModal = document.getElementById("roomModal");
      const isRoomModalOpen = roomModal && !roomModal.classList.contains("hidden");
      if (typeof toggleRoomModal === "function") {
        toggleRoomModal(!isRoomModalOpen);
      }
      return;
    }

    if (key === "a" || code === 65 || key === "s" || code === 83) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof toggleSound === "function") {
        toggleSound();
      }
      return;
    }

    if (key === "h" || code === 72) {
      e.preventDefault();
      e.stopPropagation();
      const hiddenModal = document.getElementById("hiddenPatientsModal");
      const isHiddenOpen = hiddenModal && !hiddenModal.classList.contains("hidden");
      if (typeof toggleHiddenModal === "function") {
        toggleHiddenModal(!isHiddenOpen);
      }
      return;
    }


    if (key === " " || key === "spacebar" || code === 32) {
      e.preventDefault();
      e.stopPropagation();

      if (currentEl && (currentEl.hasAttribute("data-patient") || currentEl.tagName === "TR")) {
        if (typeof onRowClick === "function") {
          onRowClick(currentEl);
        }
      } else {
        if (typeof speakCurrentPatients === "function") {
          speakCurrentPatients(true);
        }
      }
      return;
    }

    if (key === "tab" || code === 9) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        if (currentIndex > 0) setFocus(currentIndex - 1);
        else setFocus(items.length - 1);
      } else {
        if (currentIndex < items.length - 1) setFocus(currentIndex + 1);
        else setFocus(0);
      }
      return;
    }
    if (key === "home" || code === 36) {
      e.preventDefault();
      e.stopPropagation();
      setFocus(0);
      return;
    }
    if (key === "end" || code === 35) {
      e.preventDefault();
      e.stopPropagation();
      setFocus(items.length - 1);
      return;
    }

    if (code === 38 || code === 19 || key === "arrowup" || key === "up" || key === "dpadup") {
      moveFocus("up");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (code === 40 || code === 20 || key === "arrowdown" || key === "down" || key === "dpaddown") {
      moveFocus("down");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (code === 37 || code === 21 || key === "arrowleft" || key === "left" || key === "dpadleft") {
      moveFocus("left");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (code === 39 || code === 22 || key === "arrowright" || key === "right" || key === "dpadright") {
      moveFocus("right");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

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


    if (
      code === 46 ||
      key === "delete" ||
      (!isModalOpen() && (key === "d" || key === "x" || key === "0" || code === 48 || code === 96 || code === 403 || code === 183 || key === "red" || key === "colorf0red"))
    ) {
      const patientRow = currentEl ? (currentEl.hasAttribute("data-patient") ? currentEl : currentEl.closest("tr[data-patient]")) : null;
      if (patientRow) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof removePatientFromElement === "function") {
          removePatientFromElement(patientRow, e);
        }
        return;
      }
    }

    // ========================================================
    // 10. PHÍM BACKSPACE / ESCAPE / BACK / RETURN (Quay lại trước hoặc đóng modal)
    // ========================================================
    if (
      code === 27 ||
      code === 4 ||
      code === 8 ||
      code === 10009 ||
      code === 461 ||
      key === "escape" ||
      key === "backspace" ||
      key === "back" ||
      key === "goback"
    ) {
      e.preventDefault();
      e.stopPropagation();

      if (isModalOpen()) {
        // Đóng các modal đang mở
        if (typeof toggleRoomModal === "function") {
          toggleRoomModal(false);
        }
        if (typeof toggleHiddenModal === "function") {
          toggleHiddenModal(false);
        }
        setTimeout(() => {
          items = getNavItems();
          setFocus(0);
        }, 100);
        return;
      }

      // Khi đang focus vào 1 dòng bệnh nhân và bấm Backspace -> Xóa bệnh nhân đó
      if (code === 8 || key === "backspace") {
        const patientRow = currentEl ? (currentEl.hasAttribute("data-patient") ? currentEl : currentEl.closest("tr[data-patient]")) : null;
        if (patientRow && typeof removePatientFromElement === "function") {
          removePatientFromElement(patientRow, e);
          return;
        }
      }

      if (window.history && window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    }
  }

  function handlePointerEvent(event) {
    const el = event.target?.closest?.(".remote-item");
    if (!el || (event.type === "mouseover" && event.relatedTarget && el.contains(event.relatedTarget))) return;
    refreshItems();
    const index = items.indexOf(el);
    if (index >= 0) setFocus(index, false);
  }

  function scheduleRefresh(resetFocus = false) {
    resetFocusOnRefresh = resetFocusOnRefresh || resetFocus;
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshItems();
      const shouldReset = resetFocusOnRefresh;
      resetFocusOnRefresh = false;
      setFocus(shouldReset ? 0 : currentIndex, shouldReset);
    }, 50);
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    injectFocusStyles();
    items = getNavItems();
    // Chỉ gán click pointer, không đổi màu khi rê chuột
    document.addEventListener("click", handlePointerEvent, true);

    if (items.length > 0) {
      setFocus(0, false);
    }

    window.addEventListener("keydown", handleKeyDown, true);

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
    onModalToggle: () => scheduleRefresh(true),
    refresh: () => scheduleRefresh(),
    getCurrentElement: () => {
      refreshItems();
      return items[currentIndex] || null;
    }
  };
})();
