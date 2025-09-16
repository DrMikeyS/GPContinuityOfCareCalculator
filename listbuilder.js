// Browser-based list builder for GP continuity analysis
// Combines two appointment CSVs, filters frequent attenders,
// assigns patients to clinicians, and reports allocation summaries.

// Parse a CSV file using PapaParse and return a promise of row objects
function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data),
      error: err => reject(err)
    });
  });
}

// Store processed data for later patient assignment
let assignmentData = null;
let latestAssignments = null;
let patientIdHeader = null;
let headerMap = null;
const minAppointmentsInput = document.getElementById('minAppointments');
const includeAllCheckbox = document.getElementById('includeAll');

// Load CSVs and estimate clinician sessions
async function loadData() {
  const fileInput = document.getElementById('fileInput');
  const patientAssignmentsEl = document.getElementById('patientAssignments');
  const clinicianSummaryEl = document.getElementById('clinicianSummary');
  const exportBtn = document.getElementById('exportBtn');


  // Reset output areas
  patientAssignmentsEl.textContent = '';
  clinicianSummaryEl.textContent = '';
  exportBtn.classList.add('d-none');
  latestAssignments = null;

  const files = Array.from(fileInput.files);
  if (!files.length) {
    alert('Please upload at least one CSV file before loading data.');
    return;
  }

  const headerAliases = {
    patientId: ['Patient ID', 'NHS number', 'NHS Number'],
    clinician: ['Clinician', "User Details' Full Name"],
    appointmentDate: ['Appointment date', 'Date']
  };

  const firstResults = await new Promise((resolve, reject) => {
    Papa.parse(files[0], {
      header: true,
      skipEmptyLines: true,
      complete: resolve,
      error: reject
    });
  });

  const fields = firstResults.meta.fields || [];
  const normalizedFieldMap = new Map(
    fields.map(field => [field.trim().toLowerCase(), field])
  );

  const matchHeader = aliases => {
    for (const alias of aliases) {
      const normalized = alias.trim().toLowerCase();
      if (normalizedFieldMap.has(normalized)) {
        return normalizedFieldMap.get(normalized);
      }
    }
    return null;
  };

  headerMap = {
    patientId: matchHeader(headerAliases.patientId),
    clinician: matchHeader(headerAliases.clinician),
    appointmentDate: matchHeader(headerAliases.appointmentDate)
  };

  patientIdHeader = headerMap.patientId;

  const missingHeaders = [];
  if (!headerMap.patientId) missingHeaders.push('Patient ID or NHS Number');
  if (!headerMap.clinician) missingHeaders.push("Clinician or User Details' Full Name");
  if (!headerMap.appointmentDate) missingHeaders.push('Appointment date or Date');

  if (missingHeaders.length) {
    alert('Missing required headers: ' + missingHeaders.join(', '));
    return;
  }

  const normalizeRow = row => {
    const normalizedRow = { ...row };
    const rowKeyLookup = new Map(
      Object.keys(row).map(key => [key.trim().toLowerCase(), key])
    );

    const ensureField = (resolvedKey, aliases) => {
      if (!resolvedKey) return;
      if (resolvedKey in normalizedRow && normalizedRow[resolvedKey] !== undefined) return;
      for (const alias of aliases) {
        if (alias in normalizedRow && normalizedRow[alias] !== undefined) {
          normalizedRow[resolvedKey] = normalizedRow[alias];
          return;
        }
        const normalizedAlias = alias.trim().toLowerCase();
        if (rowKeyLookup.has(normalizedAlias)) {
          const sourceKey = rowKeyLookup.get(normalizedAlias);
          const value = normalizedRow[sourceKey];
          if (value !== undefined) {
            normalizedRow[resolvedKey] = value;
            return;
          }
        }
      }
    };

    ensureField(headerMap.patientId, headerAliases.patientId);
    ensureField(headerMap.clinician, headerAliases.clinician);
    ensureField(headerMap.appointmentDate, headerAliases.appointmentDate);

    return normalizedRow;
  };

  // Load and combine data from the uploaded CSV files
  const parsedArrays = [firstResults.data.map(normalizeRow)];
  if (files.length > 1) {
    const otherFiles = files.slice(1);
    const otherArrays = await Promise.all(otherFiles.map(parseCsv));
    const normalizedOthers = otherArrays.map(rows => rows.map(normalizeRow));
    parsedArrays.push(...normalizedOthers);
  }
  const combinedData = parsedArrays.flat();

  // Step 1: count appointments per patient
  const patientCounts = new Map();
  combinedData.forEach(row => {
    const id = row[patientIdHeader];
    if (!id) return;
    patientCounts.set(id, (patientCounts.get(id) || 0) + 1);
  });
  // Step 2: build counts of appointments per patient per clinician
  const patientClinicianCounts = new Map();
  combinedData.forEach(row => {
    const pid = row[patientIdHeader];
    const clinician = row[headerMap.clinician];
    if (!pid || !clinician) return;
    if (!patientClinicianCounts.has(pid)) {
      patientClinicianCounts.set(pid, {});
    }
    const counts = patientClinicianCounts.get(pid);
    counts[clinician] = (counts[clinician] || 0) + 1;
  });

  // Step 3: calculate UPC for each patient
  const patientUpc = new Map();
  patientClinicianCounts.forEach((counts, pid) => {
    const total = patientCounts.get(pid) || 0;
    const upc = {};
    Object.entries(counts).forEach(([clinician, count]) => {
      upc[clinician] = count / total;
    });
    patientUpc.set(pid, upc);
  });

  // Sort patients by total appointments (frequent attenders first)
  const sortedPatients = Array.from(patientCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  // Count appointments per clinician and scale to session estimates
  const clinicianAppointmentCounts = {};
  combinedData.forEach(row => {
    const clinician = row[headerMap.clinician];
    if (!clinician) return;
    clinicianAppointmentCounts[clinician] =
      (clinicianAppointmentCounts[clinician] || 0) + 1;
  });

  const counts = Object.values(clinicianAppointmentCounts);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const clinicianSessions = {};
  Object.entries(clinicianAppointmentCounts).forEach(([clinician, count]) => {
    let scaled;
    if (maxCount === minCount) {
      scaled = 10;
    } else {
      scaled = 1 + ((count - minCount) / (maxCount - minCount)) * 9;
    }
    clinicianSessions[clinician] = Math.round(scaled);
  });

  // Populate session form for manual adjustments
  const sessionForm = document.getElementById('sessionForm');
  sessionForm.innerHTML = '';
  let idx = 0;
  Object.entries(clinicianSessions).forEach(([clinician, sessions]) => {
    const group = document.createElement('div');
    group.className = 'mb-2 d-flex align-items-center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input me-2';
    checkbox.id = `clinician-${idx}`;
    checkbox.checked = true;
    const label = document.createElement('label');
    label.className = 'form-check-label me-2 flex-grow-1';
    label.setAttribute('for', `clinician-${idx}`);
    label.textContent = clinician;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '10';
    input.value = sessions;
    input.dataset.clinician = clinician;
    input.className = 'form-control';
    input.style.width = '80px';
    checkbox.addEventListener('change', () => {
      group.classList.toggle('text-muted', !checkbox.checked);
      input.disabled = !checkbox.checked;
    });
    group.appendChild(checkbox);
    group.appendChild(label);
    group.appendChild(input);
    sessionForm.appendChild(group);
    idx += 1;
  });

  document.getElementById('sessionModalBtn').classList.remove('d-none');
  document.getElementById('buildBtn').classList.remove('d-none');

  // Store data for patient allocation
  assignmentData = { patientClinicianCounts, patientUpc, sortedPatients, patientCounts };
}
// Assign patients to clinicians using the session values from the UI
function assignPatients() {
  if (!assignmentData) {
    alert('Please load data first.');
    return;
  }

  const patientAssignmentsEl = document.getElementById('patientAssignments');
  const clinicianSummaryEl = document.getElementById('clinicianSummary');
  patientAssignmentsEl.textContent = '';
  clinicianSummaryEl.textContent = '';

  // Read clinician sessions from form inputs
  const sessionInputs = document.querySelectorAll(
    '#sessionForm input[type="number"]'
  );
  const clinicianSessions = {};
  sessionInputs.forEach(input => {
    if (input.disabled) return;
    const clinician = input.dataset.clinician;
    const value = parseInt(input.value, 10);
    clinicianSessions[clinician] = isNaN(value) ? 1 : value;
  });

  const includeAll = includeAllCheckbox.checked;
  const minAppointments = parseInt(minAppointmentsInput.value, 10) || 0;
  const { patientClinicianCounts, patientUpc, sortedPatients, patientCounts } = assignmentData;

  const eligiblePatients = includeAll
    ? sortedPatients
    : sortedPatients.filter(([pid]) => patientCounts.get(pid) >= minAppointments);

  const numPatients = eligiblePatients.length;

  // Initialise caseloads and fair share for each clinician
  const clinicianCaseloads = {};
  Object.keys(clinicianSessions).forEach(c => (clinicianCaseloads[c] = 0));

  const totalSessions = Object.values(clinicianSessions).reduce((a, b) => a + b, 0);
  const fairShare = {};
  Object.keys(clinicianSessions).forEach(c => {
    fairShare[c] = (numPatients * clinicianSessions[c]) / totalSessions;
  });

  // Assign patients to clinicians based on UPC and fair share rules
  const patientAssignments = {};
  eligiblePatients.forEach(([pid]) => {
    const upc = patientUpc.get(pid);
    let sorted = Object.entries(upc).sort((a, b) => b[1] - a[1]);
    sorted = sorted.filter(([c]) => clinicianSessions[c] !== undefined);
    if (!sorted.length) return;
    const [topClinician, topValue] = sorted[0];

    let chosen;
    if (topValue > 0.6) {
      // High continuity, keep with top clinician
      chosen = topClinician;
    } else {
      const eligible = sorted
        .filter(([c, v]) => v > 0.4 && clinicianCaseloads[c] < fairShare[c])
        .map(([c]) => c);
      if (eligible.length) {
        eligible.sort((a, b) => {
          const countDiff =
            patientClinicianCounts.get(pid)[b] - patientClinicianCounts.get(pid)[a];
          if (countDiff !== 0) return countDiff;
          return clinicianCaseloads[a] - clinicianCaseloads[b];
        });
        chosen = eligible[0];
      } else {
        const seen = sorted
          .filter(([c, v]) => v > 0 && clinicianCaseloads[c] < fairShare[c])
          .map(([c]) => c);
        if (seen.length) {
          chosen = seen.reduce((min, c) =>
            clinicianCaseloads[c] < clinicianCaseloads[min] ? c : min
          );
        } else {
          chosen = Object.keys(clinicianSessions).reduce((min, c) => {
            const load = clinicianCaseloads[c];
            if (
              load < fairShare[c] &&
              (clinicianCaseloads[min] >= fairShare[min] || load < clinicianCaseloads[min])
            ) {
              return c;
            }
            return min;
          }, Object.keys(clinicianSessions)[0]);
        }
      }
    }

    patientAssignments[pid] = chosen;
    clinicianCaseloads[chosen] += 1;
  });

  // Build patient assignments output
  let assignmentsOutput = '';
  Object.entries(patientAssignments).forEach(([pid, clinician]) => {
    assignmentsOutput += `${patientIdHeader}: ${pid} -> Assigned Clinician: ${clinician}\n`;
  });
  patientAssignmentsEl.textContent = assignmentsOutput;
  latestAssignments = patientAssignments;
  document.getElementById('exportBtn').classList.remove('d-none');

  // Build clinician allocation summary
  let summaryOutput = '';
  Object.keys(clinicianCaseloads).forEach(clinician => {
    const caseload = clinicianCaseloads[clinician];
    const fair = fairShare[clinician];
    const deviation = caseload - fair;
    summaryOutput += `${clinician}: Assigned ${caseload} unique patients, Fair Share ${fair.toFixed(2)}, Deviation ${deviation.toFixed(2)}\n`;
  });
  clinicianSummaryEl.textContent = summaryOutput;
  const sessionModalEl = document.getElementById('sessionModal');
  const sessionModal = bootstrap.Modal.getInstance(sessionModalEl);
  if (sessionModal) sessionModal.hide();
}

function exportAssignments() {
  if (!latestAssignments) {
    alert('No assignments to export.');
    return;
  }
  const rows = Object.entries(latestAssignments).map(([pid, clinician]) => ({
    [patientIdHeader]: pid,
    'Assigned Clinician': clinician
  }));
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'patient_assignments.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Attach click handlers
const loadBtn = document.getElementById('loadBtn');
loadBtn.addEventListener('click', loadData);
const buildBtn = document.getElementById('buildBtn');
buildBtn.addEventListener('click', assignPatients);
const exportBtn = document.getElementById('exportBtn');
exportBtn.addEventListener('click', exportAssignments);
includeAllCheckbox.addEventListener('change', () => {
  minAppointmentsInput.disabled = includeAllCheckbox.checked;
});
minAppointmentsInput.disabled = includeAllCheckbox.checked;
