document.getElementById('csvFile').setAttribute('multiple', 'multiple'); // Allow multiple file selection

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

function calculateUPC(data) {
  const patientMap = new Map();
  const patientUpcMap = new Map();

  for (const row of data) {
    const patientID = row['Patient ID'];
    const clinician = row['Clinician'];

    if (!patientID || !clinician) continue;

    if (!patientMap.has(patientID)) {
      patientMap.set(patientID, new Map());
    }
    const gpCounts = patientMap.get(patientID);
    gpCounts.set(clinician, (gpCounts.get(clinician) || 0) + 1);
  }

  const upcs = [];

  for (const [patientID, gpCounts] of patientMap.entries()) {
    const totalAppointments = Array.from(gpCounts.values()).reduce((a, b) => a + b, 0);
    const maxAppointmentsWithSingleGP = Math.max(...gpCounts.values());
    const upc = maxAppointmentsWithSingleGP / totalAppointments;
    patientUpcMap.set(patientID, { upc, count: totalAppointments });

    if (totalAppointments >= 2) { // Now include 2 or more contacts
      upcs.push(upc);
    }
  }

  const overallMean = mean(upcs);

  return { overallMean, patientUpcMap };
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function displayResults(stats) {
  const div = document.getElementById('results');
  // Use only included GPs for classification
  let gpCount = 0;
  let uniqueClinicians = [];
  if (window.allData) {
    // If a filter is active, use only included GPs
    let dataToCount = window.allData;
    if (includedGPs && includedGPs.size > 0) {
      dataToCount = window.allData.filter(row => includedGPs.has(row['Clinician']));
    }
    const allClinicians = dataToCount.map(row => row['Clinician']).filter(Boolean);
    uniqueClinicians = Array.from(new Set(allClinicians));
    gpCount = uniqueClinicians.length;
    console.log("GPs in data (after filter):", uniqueClinicians);
  }

  // Classify practice size
  const fte = gpCount * 0.5;
  let practiceSize = '';
  let nationalMean = 0.61, iqr = '0.54-0.71'; // Default to 'All practices'
  if (fte >= 7) {
    practiceSize = 'large';
    nationalMean = 0.59;
    iqr = '0.51-0.64';
  } else if (fte >= 4) {
    practiceSize = 'medium';
    nationalMean = 0.63;
    iqr = '0.56-0.68';
  } else {
    practiceSize = 'small';
    nationalMean = 0.70;
    iqr = '0.61-0.82';
  }

  // Compare to quartiles
  const [iqrLow, iqrHigh] = iqr.split('-').map(Number);
  let comparison = '';
  if (stats.overallMean < iqrLow) {
    comparison = 'below average (bottom quartile)';
  } else if (stats.overallMean > iqrHigh) {
    comparison = 'better than average (top quartile)';
  } else {
    comparison = 'average (middle quartiles)';
  }

  div.innerHTML = `<h2>UPC Results</h2>
    <p><strong>Overall Mean UPC (≥2 consults):</strong> ${stats.overallMean.toFixed(3)}</p>
    <p>UPC is calculated as the maximum number of appointments with a single GP divided by the total number of appointments for that patient.</p>
    <p>Your practice is classified as a <strong>${practiceSize}</strong> practice (${gpCount} GPs, estimated ${fte} FTEs).<br>
    The national UPC for a practice of this size based on a 2017 study was <strong>${nationalMean.toFixed(2)}</strong> with an interquartile range of <strong>${iqr}</strong>.<br>
    Therefore you are classified as <strong>${comparison}</strong> on that comparison.<br>
    <a href="https://www.bmj.com/content/356/bmj.j84.long" target="_blank">See the study</a>.
    <p>More generally, UPC 0.4-0.7 is considered acceptable, with 0.7+ being very good.
    </p>`;
  drawHistogram(stats.patientUpcMap);
}

// Update this function to include 2+ consults in the graph
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

function displayTabulator(patientUpcMap) {
  const tableData = Array.from(patientUpcMap.entries()).map(([pid, val]) => ({
    patientID: pid,
    upc: val.upc,
    consults: val.count
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
    pagination: "local",            // Enable local pagination
    paginationSize: 50,             // Show 50 rows per page (adjust as needed)
    paginationSizeSelector: [25, 50, 100, 250],
    columns: [
      { title: "Patient ID", field: "patientID", sorter: "string", headerFilter: "input" },
      { title: "UPC", field: "upc", sorter: "number", formatter: cell => cell.getValue().toFixed(3) },
      { title: "Consults", field: "consults", sorter: "number" }
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