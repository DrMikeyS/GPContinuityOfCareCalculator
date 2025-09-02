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

  const requiredHeaders = ['Patient ID', 'Clinician', 'Appointment date'];

  const firstResults = await new Promise((resolve, reject) => {
    Papa.parse(files[0], {
      header: true,
      skipEmptyLines: true,
      complete: resolve,
      error: reject
    });
  });

  const missing = requiredHeaders.filter(h => !firstResults.meta.fields.includes(h));
  if (missing.length) {
    alert('Missing required headers: ' + missing.join(', '));
    return;
  }

  const includeAll = includeAllCheckbox.checked;
  const minAppointments = parseInt(minAppointmentsInput.value, 10) || 0;

  // Load and combine data from the uploaded CSV files
  const parsedArrays = [firstResults.data];
  if (files.length > 1) {
    const otherFiles = files.slice(1);
    const otherArrays = await Promise.all(otherFiles.map(parseCsv));
    parsedArrays.push(...otherArrays);
  }
  const combinedData = parsedArrays.flat();

  // Step 1: count appointments per patient
  const patientCounts = new Map();
  combinedData.forEach(row => {
    const id = row['Patient ID'];
    if (!id) return;
    patientCounts.set(id, (patientCounts.get(id) || 0) + 1);
  });

  // Step 2: optionally filter by minimum appointment count
  const filteredData = combinedData
    .filter(row => includeAll || patientCounts.get(row['Patient ID']) >= minAppointments)
    .map(row => ({
      'Appointment date': row['Appointment date'],
      'Clinician': row['Clinician'],
      'Patient ID': row['Patient ID'],
      'Patient Count': patientCounts.get(row['Patient ID'])
    }));

  // Step 3: build counts of appointments per patient per clinician
  const patientClinicianCounts = new Map();
  filteredData.forEach(row => {
    const pid = row['Patient ID'];
    const clinician = row['Clinician'];
    if (!patientClinicianCounts.has(pid)) {
      patientClinicianCounts.set(pid, {});
    }
    const counts = patientClinicianCounts.get(pid);
    counts[clinician] = (counts[clinician] || 0) + 1;
  });

  // Step 4: calculate UPC for each patient
  const patientUpc = new Map();
  const patientTotalAppointments = new Map();
  patientClinicianCounts.forEach((counts, pid) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    patientTotalAppointments.set(pid, total);
    const upc = {};
    Object.entries(counts).forEach(([clinician, count]) => {
      upc[clinician] = count / total;
    });
    patientUpc.set(pid, upc);
  });

  // Sort patients by total appointments (frequent attenders first)
  const sortedPatients = Array.from(patientTotalAppointments.entries())
    .sort((a, b) => b[1] - a[1]);

  // Count appointments per clinician and scale to session estimates
  const clinicianAppointmentCounts = {};
  filteredData.forEach(row => {
    const clinician = row['Clinician'];
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
    group.className = 'mb-2';
    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = clinician;
    label.setAttribute('for', `session-${idx}`);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '10';
    input.value = sessions;
    input.id = `session-${idx}`;
    input.dataset.clinician = clinician;
    input.className = 'form-control';
    group.appendChild(label);
    group.appendChild(input);
    sessionForm.appendChild(group);
    idx += 1;
  });

  document.getElementById('sessionControls').classList.remove('d-none');

  // Store data for patient allocation
  assignmentData = { patientClinicianCounts, patientUpc, sortedPatients };
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
  const sessionInputs = document.querySelectorAll('#sessionForm input');
  const clinicianSessions = {};
  sessionInputs.forEach(input => {
    const clinician = input.dataset.clinician;
    const value = parseInt(input.value, 10);
    clinicianSessions[clinician] = isNaN(value) ? 1 : value;
  });

  const { patientClinicianCounts, patientUpc, sortedPatients } = assignmentData;

  // Initialise caseloads and fair share for each clinician
  const clinicianCaseloads = {};
  Object.keys(clinicianSessions).forEach(c => (clinicianCaseloads[c] = 0));

  const totalSessions = Object.values(clinicianSessions).reduce((a, b) => a + b, 0);
  const fairShare = {};
  Object.keys(clinicianSessions).forEach(c => {
    fairShare[c] = (patientUpc.size * clinicianSessions[c]) / totalSessions;
  });

  // Assign patients to clinicians based on UPC and fair share rules
  const patientAssignments = {};
  sortedPatients.forEach(([pid]) => {
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
    assignmentsOutput += `Patient ID: ${pid} -> Assigned Clinician: ${clinician}\n`;
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
}

function exportAssignments() {
  if (!latestAssignments) {
    alert('No assignments to export.');
    return;
  }
  const rows = Object.entries(latestAssignments).map(([pid, clinician]) => ({
    'Patient ID': pid,
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
