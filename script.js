// Core logic for loading patient data and calculating continuity of care metrics.
// Users can upload multiple CSV files which are parsed and aggregated.
document.getElementById('csvFile').setAttribute('multiple', 'multiple'); // Allow multiple file selection

// Parse uploaded CSV files then compute and display UPC statistics.
document.getElementById('csvFile').addEventListener('change', function(event) {
  const files = event.target.files;
  if (!files.length) return;

  let allData = [];
  let filesProcessed = 0;

  for (let i = 0; i < files.length; i++) {
    Papa.parse(files[i], {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        allData = allData.concat(results.data);
        filesProcessed++;
        if (filesProcessed === files.length) {
          window.allData = allData;
          const upcStats = calculateUPC(allData);
          displayResults(upcStats);
          displayTabulator(upcStats.patientUpcMap);
          document.getElementById('showGpFilterBtn').style.display = 'inline-block'; // <-- Add this line
        }
      }
    });
  }
});

// Calculate UPC values for each patient and return overall statistics.
function calculateUPC(data) {
  const patientMap = new Map();
  const patientUpcMap = new Map();
  const patientAgeMap = new Map();

  for (const row of data) {
    const patientID = row['Patient ID'];
    const clinician = row['Clinician'];
    const age = row['Age in years'] ? Number(row['Age in years']) : null;

    if (!patientID || !clinician) continue;

    if (!patientMap.has(patientID)) {
      patientMap.set(patientID, new Map());
      if (age !== null && !isNaN(age)) patientAgeMap.set(patientID, age);
    }
    const gpCounts = patientMap.get(patientID);
    gpCounts.set(clinician, (gpCounts.get(clinician) || 0) + 1);
  }

  const upcs = [];

  for (const [patientID, gpCounts] of patientMap.entries()) {
    const totalAppointments = Array.from(gpCounts.values()).reduce((a, b) => a + b, 0);
    const maxAppointmentsWithSingleGP = Math.max(...gpCounts.values());
    const upc = maxAppointmentsWithSingleGP / totalAppointments;
    const age = patientAgeMap.get(patientID) ?? null;
    patientUpcMap.set(patientID, { upc, count: totalAppointments, age });

    if (totalAppointments >= 2) {
      upcs.push(upc);
    }
  }

  const overallMean = mean(upcs);

  return { overallMean, patientUpcMap };
}

// Compute the arithmetic mean of an array of numbers.
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Compute the median of an array of numbers.
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Render summary results and trigger chart drawing.
function displayResults(stats) {
  const div = document.getElementById('results');
  let alertClass = "alert-danger"; // red by default
  if (stats.overallMean >= 0.7) {
    alertClass = "alert-success"; // green
  } else if (stats.overallMean >= 0.4) {
    alertClass = "alert-warning"; // yellow
  }
  div.innerHTML = `
    <div class="alert ${alertClass} text-center fs-4 fw-bold" role="alert" style="letter-spacing:0.5px;">
      Overall Mean UPC (≥2 consults): <span class="fs-3">${stats.overallMean.toFixed(3)}</span>
    </div>
  `;
  document.getElementById('helpSection').style.display = 'block';
  drawHistogram(stats.patientUpcMap);
  drawAgeHistogram(stats.patientUpcMap); // <-- Add this line
}

// Draw histogram of mean UPC grouped by number of consults (2+ only).
function drawHistogram(patientUpcMap) {
  // Group patients by number of consults (2+ only)
  const cohortBins = {};
  for (const [_, val] of patientUpcMap.entries()) {
    let bin = val.count;
    if (bin < 2) continue; // Exclude only 1 consult
    if (bin > 10) bin = '10+';
    cohortBins[bin] = cohortBins[bin] || [];
    cohortBins[bin].push(val.upc);
  }

  // Prepare data for chart
  const labels = [];
  const means = [];
  Object.keys(cohortBins)
    .sort((a, b) => {
      if (a === '10+') return 1;
      if (b === '10+') return -1;
      return Number(a) - Number(b);
    })
    .forEach(bin => {
      labels.push(bin.toString());
      means.push(mean(cohortBins[bin]));
    });

  // Destroy previous chart if exists
  if (window.upcHistogramChart) {
    window.upcHistogramChart.destroy();
  }

  const ctx = document.getElementById('upcHistogram').getContext('2d');
  window.upcHistogramChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Mean UPC by Number of Consults',
        data: means,
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            redLine: {
              type: 'line',
              yMin: 0.4,
              yMax: 0.4,
              borderColor: 'red',
              borderWidth: 2,
              label: {
                content: 'UPC = 0.4',
                enabled: true,
                position: 'end',
                color: 'red'
              }
            },
            greenLine: {
              type: 'line',
              yMin: 0.7,
              yMax: 0.7,
              borderColor: 'green',
              borderWidth: 2,
              label: {
                content: 'UPC = 0.7',
                enabled: true,
                position: 'end',
                color: 'green'
              }
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          title: { display: true, text: 'Mean UPC' }
        },
        x: {
          title: { display: true, text: 'Number of Consults (Cohort)' }
        }
      }
    }
  });
}

// Draw histogram of mean UPC grouped by patient age cohorts.
function drawAgeHistogram(patientUpcMap) {
  // Define age cohorts
  const cohorts = [
    { label: "0-17", min: 0, max: 17 },
    { label: "18-29", min: 18, max: 29 },
    { label: "30-59", min: 30, max: 59 },
    { label: "60-69", min: 60, max: 69 },
    { label: "70-89", min: 70, max: 89 },
    { label: "90+", min: 90, max: Infinity }
  ];

  // Group UPCs by age cohort
  const cohortBins = {};
  for (const [_, val] of patientUpcMap.entries()) {
    if (val.age === null || isNaN(val.age) || val.count < 2) continue;
    const age = val.age;
    const cohort = cohorts.find(c => age >= c.min && age <= c.max);
    if (!cohort) continue;
    cohortBins[cohort.label] = cohortBins[cohort.label] || [];
    cohortBins[cohort.label].push(val.upc);
  }

  // Prepare data for chart
  const labels = cohorts.map(c => c.label);
  const means = labels.map(label => mean(cohortBins[label] || []));

  // Destroy previous chart if exists
  if (window.upcAgeHistogramChart) {
    window.upcAgeHistogramChart.destroy();
  }

  const ctx = document.getElementById('upcAgeHistogram').getContext('2d');
  window.upcAgeHistogramChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Mean UPC by Age Cohort',
        data: means,
        backgroundColor: 'rgba(255, 159, 64, 0.7)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            redLine: {
              type: 'line',
              yMin: 0.4,
              yMax: 0.4,
              borderColor: 'red',
              borderWidth: 2,
              label: {
                content: 'UPC = 0.4',
                enabled: true,
                position: 'end',
                color: 'red'
              }
            },
            greenLine: {
              type: 'line',
              yMin: 0.7,
              yMax: 0.7,
              borderColor: 'green',
              borderWidth: 2,
              label: {
                content: 'UPC = 0.7',
                enabled: true,
                position: 'end',
                color: 'green'
              }
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          title: { display: true, text: 'Mean UPC' }
        },
        x: {
          title: { display: true, text: 'Age Cohort' }
        }
      }
    }
  });
}

// Display patient-level UPC data in a paginated table.
function displayTabulator(patientUpcMap) {
  const tableData = Array.from(patientUpcMap.entries()).map(([pid, val]) => ({
    patientID: pid,
    upc: val.upc,
    consults: val.count,
    age: val.age
  }));

  if (window.patientTable) {
    window.patientTable.destroy();
    document.getElementById('patientUpcsTable').innerHTML = "";
  }

  const tableDiv = document.getElementById('patientUpcsTable');
  tableDiv.style.display = "block";
  tableDiv.innerHTML = "";

  window.patientTable = new Tabulator(tableDiv, {
    data: tableData,
    layout: "fitColumns",
    responsiveLayout: "hide",
    pagination: "local",
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250],
    columns: [
      { title: "Patient ID", field: "patientID", sorter: "string", headerFilter: "input" },
      { title: "UPC", field: "upc", sorter: "number", formatter: cell => cell.getValue().toFixed(3) },
      { title: "Consults", field: "consults", sorter: "number" },
      { title: "Age", field: "age", sorter: "number" }
    ],
    initialSort: [
      { column: "consults", dir: "desc" }
    ],
    placeholder: "No data available",
    footerElement: "<div style='padding: 10px; text-align: center;'>Patient Data Table</div>",
  });
}

// --- GP Filter State ---
let includedGPs = null; // null = all included

// --- Show Modal Button ---
document.getElementById('showGpFilterBtn').addEventListener('click', function() {
  if (!window.allData) return;
  showGpFilterModal();
});

// --- Modal Logic ---
// Build and show modal allowing users to filter by GP.
function showGpFilterModal() {
  // Count consults per GP
  const gpCounts = {};
  window.allData.forEach(row => {
    const gp = row['Clinician'];
    if (!gp) return;
    gpCounts[gp] = (gpCounts[gp] || 0) + 1;
  });
  // Sort GPs by consult count descending
  const sortedGPs = Object.entries(gpCounts).sort((a, b) => b[1] - a[1]);

  // Build table
  let tableHtml = `<table class="table table-sm table-bordered align-middle mb-0">
    <thead>
      <tr>
        <th scope="col"></th>
        <th scope="col">GP Name</th>
        <th scope="col">Appointments</th>
      </tr>
    </thead>
    <tbody>
      ${sortedGPs.map(([gp, count]) => `
        <tr>
          <td>
            <input class="form-check-input" type="checkbox" value="${gp}" id="gpCheck_${gp.replace(/[^a-zA-Z0-9]/g,'_')}" ${(!includedGPs || includedGPs.has(gp)) ? 'checked' : ''}>
          </td>
          <td>
            <label class="form-check-label" for="gpCheck_${gp.replace(/[^a-zA-Z0-9]/g,'_')}">${gp}</label>
          </td>
          <td>
            <span class="badge bg-secondary">${count}</span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

  const gpFilterList = document.getElementById('gpFilterList');
  gpFilterList.innerHTML = tableHtml;

  // Add select all/none functionality
  setTimeout(() => {
    document.getElementById('gpSelectAllBtn').onclick = function() {
      document.querySelectorAll('#gpFilterList input[type=checkbox]').forEach(chk => chk.checked = true);
    };
    document.getElementById('gpSelectNoneBtn').onclick = function() {
      document.querySelectorAll('#gpFilterList input[type=checkbox]').forEach(chk => chk.checked = false);
    };
  }, 0);

  // Show modal (Bootstrap 5)
  const modal = new bootstrap.Modal(document.getElementById('gpFilterModal'));
  modal.show();
}

// --- Apply Filter ---
document.getElementById('applyGpFilter').addEventListener('click', function() {
  // Get checked GPs
  const checks = document.querySelectorAll('#gpFilterList input[type=checkbox]');
  includedGPs = new Set();
  checks.forEach(chk => { if (chk.checked) includedGPs.add(chk.value); });
  // Filter allData and re-run analysis
  const filteredData = window.allData.filter(row => includedGPs.has(row['Clinician']));
  const upcStats = calculateUPC(filteredData);
  displayResults(upcStats);
  displayTabulator(upcStats.patientUpcMap);
});