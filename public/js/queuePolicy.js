(function (global) {
  const demotedPatients = new Set();
  const hiddenPatientsSet = new Set();
  let hiddenPatientsList = [];

  const STORAGE_KEY = "queue_hidden_patients";
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

  // Khôi phục danh sách đã ẩn từ sessionStorage
  function loadHiddenFromStorage() {
    try {
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
    } catch (e) {
      console.warn("Không thể đọc hidden patients từ sessionStorage:", e);
    }
  }

  function saveHiddenToStorage() {
    try {
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

  function parseQueueTime(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  function isPatientOverdue(patient, now = Date.now()) {
    const queuedAt = parseQueueTime(patient?.ngaydk);
    if (queuedAt === null) return false;
    return (now - queuedAt) >= FIFTEEN_MINUTES_MS;
  }

  // ================= ẨN / XÓA BỆNH NHÂN =================
  function hide(patientKey, patientName, roomName = "") {
    const key = patientKey ? String(patientKey).trim() : "";
    const name = patientName ? String(patientName).trim() : "";

    if (!key && !name) return;

    if (key) hiddenPatientsSet.add(key);
    if (name) hiddenPatientsSet.add(name);

    // Tránh trùng lặp trong list
    hiddenPatientsList = hiddenPatientsList.filter(
      (item) => item.key !== key && item.name !== name
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
    const key = patientKey ? String(patientKey).trim() : "";
    const name = patientName ? String(patientName).trim() : "";

    if (key) {
      hiddenPatientsSet.delete(key);
      demotedPatients.delete(key);
    }
    if (name) {
      hiddenPatientsSet.delete(name);
      demotedPatients.delete(name);
    }

    hiddenPatientsList = hiddenPatientsList.filter(
      (item) => item.key !== key && item.name !== name
    );

    saveHiddenToStorage();
  }

  function restoreAll() {
    hiddenPatientsSet.clear();
    demotedPatients.clear();
    hiddenPatientsList = [];
    saveHiddenToStorage();
  }

  function isPatientHidden(patient) {
    if (!patient) return false;
    const key = getPatientKey(patient);
    const name = getPatientName(patient);
    return (
      (key && hiddenPatientsSet.has(key)) ||
      (name && hiddenPatientsSet.has(name))
    );
  }

  function getHiddenList() {
    return [...hiddenPatientsList];
  }

  // ================= BỎ QUA / ĐÔN THỨ TỰ (DEMOTE) =================
  function demote(patientKey, patientName) {
    if (patientKey) demotedPatients.add(String(patientKey).trim());
    if (patientName) demotedPatients.add(String(patientName).trim());
  }

  function isDemoted(patient) {
    return demotedPatients.has(getPatientKey(patient)) || demotedPatients.has(getPatientName(patient));
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

  // Đẩy bệnh nhân quá 15 phút xuống dưới bệnh nhân đúng giờ
  function demoteOverduePatients(patients = [], now = Date.now()) {
    if (!Array.isArray(patients) || patients.length <= 1) return patients;

    const onTimePatients = [];
    const overduePatients = [];

    for (const patient of patients) {
      if (patient.dakham != 0) {
        onTimePatients.push(patient);
        continue;
      }

      if (isPatientOverdue(patient, now)) {
        overduePatients.push(patient);
      } else {
        onTimePatients.push(patient);
      }
    }

    if (onTimePatients.length > 0 && overduePatients.length > 0) {
      return [...onTimePatients, ...overduePatients];
    }

    if (onTimePatients.length === 0 && overduePatients.length > 1) {
      const [first, ...rest] = overduePatients;
      return [...rest, first];
    }

    return patients;
  }

  // Áp dụng chính sách phía Client:
  // 1. Lọc bỏ các bệnh nhân đã bị người dùng xóa/ẩn (hidden)
  // 2. Áp dụng các đôn thứ tự thủ công của người dùng (manual demotions)
  function applyQueuePolicy(patients = []) {
    const active = patients.filter((p) => !isPatientHidden(p));
    return applyManualDemotions(active);
  }

  // Khởi tạo
  loadHiddenFromStorage();

  global.QueuePolicy = {
    applyManualDemotions,
    applyQueuePolicy,
    demote,
    demoteOverduePatients,
    getHiddenList,
    getPatientKey,
    getPatientName,
    hide,
    isDemoted,
    isPatientHidden,
    isPatientOverdue,
    restore,
    restoreAll,
  };
})(window);
