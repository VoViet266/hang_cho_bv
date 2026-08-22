(function (global) {
  const demotedPatients = new Set();

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

  function demote(patientKey, patientName) {
    if (patientKey) demotedPatients.add(String(patientKey).trim());
    if (patientName) demotedPatients.add(String(patientName).trim());
  }

  function restore(patientKey, patientName) {
    if (patientKey) demotedPatients.delete(String(patientKey).trim());
    if (patientName) demotedPatients.delete(String(patientName).trim());
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

  global.QueuePolicy = {
    applyManualDemotions,
    demote,
    getPatientKey,
    restore,
  };
})(window);
