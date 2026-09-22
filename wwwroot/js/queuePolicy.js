(function (global) {
  const demotedPatients = new Set();
  const hiddenPatientsSet = new Set();
  let hiddenPatientsList = [];

  const STORAGE_KEY = "queue_hidden_patients";
  const STORAGE_DATE_KEY = "queue_hidden_patients_date";

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function checkDateRollover() {
    try {
      const savedDate = sessionStorage.getItem(STORAGE_DATE_KEY);
      const today = getTodayString();
      if (savedDate && savedDate !== today) {
        hiddenPatientsSet.clear();
        demotedPatients.clear();
        hiddenPatientsList = [];
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.setItem(STORAGE_DATE_KEY, today);
      }
    } catch (e) {
      console.warn("Lỗi kiểm tra ngày trong sessionStorage:", e);
    }
  }

  // Khôi phục danh sách đã ẩn từ sessionStorage
  function loadHiddenFromStorage() {
    try {
      const today = getTodayString();
      const savedDate = sessionStorage.getItem(STORAGE_DATE_KEY);
      if (savedDate && savedDate !== today) {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.setItem(STORAGE_DATE_KEY, today);
        return;
      }
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          hiddenPatientsList = parsed;
          hiddenPatientsList.forEach((item) => {
            if (item.key) hiddenPatientsSet.add(String(item.key).trim());
            if (item.name) hiddenPatientsSet.add(String(item.name).trim());
          });
        }
      }
      sessionStorage.setItem(STORAGE_DATE_KEY, today);
    } catch (e) {
      console.warn("Không thể đọc hidden patients từ sessionStorage:", e);
    }
  }

  function saveHiddenToStorage() {
    try {
      sessionStorage.setItem(STORAGE_DATE_KEY, getTodayString());
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenPatientsList));
    } catch (e) {
      console.warn("Không thể lưu hidden patients vào sessionStorage:", e);
    }
  }

  function getPatientKey(patient) {
    if (!patient) return "";
    return String(
      patient.makb ||
      patient.mabn ||
      `${(patient.holot || "").trim()}_${(patient.ten || "").trim()}_${(patient.dobStr || "").trim()}`
    ).trim();
  }

  function getPatientName(patient) {
    return `${(patient?.holot || "").trim()} ${(patient?.ten || "").trim()}`.trim();
  }

  // ================= ẨN / XÓA BỆNH NHÂN =================
  function hide(patientKey, patientName, roomName = "") {
    checkDateRollover();
    const key = patientKey ? String(patientKey).trim() : "";
    const name = patientName ? String(patientName).trim() : "";

    if (!key && !name) return;

    const identity = key || name;
    hiddenPatientsSet.add(identity);

    // Tránh trùng lặp trong list
    hiddenPatientsList = hiddenPatientsList.filter(
      (item) => (item.key || item.name) !== identity
    );

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    hiddenPatientsList.unshift({
      key,
      name: name || key,
      room: roomName || "",
      time: timeStr,
    });

    saveHiddenToStorage();
  }

  function restore(patientKey, patientName) {
    checkDateRollover();
    const key = patientKey ? String(patientKey).trim() : "";
    const name = patientName ? String(patientName).trim() : "";
    const identity = key || name;

    hiddenPatientsSet.delete(identity);
    demotedPatients.delete(identity);

    hiddenPatientsList = hiddenPatientsList.filter(
      (item) => (item.key || item.name) !== identity
    );

    saveHiddenToStorage();
  }

  function restoreAll() {
    checkDateRollover();
    hiddenPatientsSet.clear();
    demotedPatients.clear();
    hiddenPatientsList = [];
    saveHiddenToStorage();
  }

  function isPatientHidden(patient) {
    checkDateRollover();
    if (!patient) return false;
    const key = getPatientKey(patient);
    const name = getPatientName(patient);
    return hiddenPatientsSet.has(key || name);
  }

  function getHiddenList() {
    checkDateRollover();
    return [...hiddenPatientsList];
  }

  // ================= BỎ QUA / ĐÔN THỨ TỰ (DEMOTE) =================
  function demote(patientKey, patientName) {
    if (patientKey) demotedPatients.add(String(patientKey).trim());
    if (patientName) demotedPatients.add(String(patientName).trim());
  }

  function isDemoted(patient) {
    const key = getPatientKey(patient);
    return demotedPatients.has(key || getPatientName(patient));
  }

  function applyManualDemotions(patients = []) {
    const ordered = [...patients];

    for (let index = 0; index < ordered.length - 1; index += 1) {
      if (!isDemoted(ordered[index])) continue;
      [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
      index += 1;
    }

    return ordered;
  }

  // Chỉ xử lý thao tác thủ công tại trình duyệt. Bệnh nhân quá 30 phút đã được SQL loại bỏ.
  function applyQueuePolicy(patients = []) {
    checkDateRollover();
    const active = patients.filter((patient) => !isPatientHidden(patient));
    return applyManualDemotions(active);
  }

  // Khởi tạo
  loadHiddenFromStorage();

  global.QueuePolicy = {
    applyManualDemotions,
    applyQueuePolicy,
    demote,
    getHiddenList,
    getPatientKey,
    getPatientName,
    hide,
    isDemoted,
    isPatientHidden,
    restore,
    restoreAll,
  };
})(window);
