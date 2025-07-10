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
          const upcStats = calculateUPC(allData);
          displayResults(upcStats);
          displayTabulator(upcStats.patientUpcMap);
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

    if (totalAppointments >= 3) {
      upcs.push(upc);
    }
  }

  const overallMean = mean(upcs);
  const overallMedian = median(upcs);

  return { overallMean, overallMedian, patientUpcMap };
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
  div.innerHTML = `<h2>UPC Results</h2>
    <p><strong>Overall Mean UPC (≥3 consults):</strong> ${stats.overallMean.toFixed(3)}</p>
    <p><strong>Overall Median UPC (≥3 consults):</strong> ${stats.overallMedian.toFixed(3)}</p>`;

  drawHistogram(stats.patientUpcMap);
}

// Add this function to create the histogram
function drawHistogram(patientUpcMap) {
  // Group patients by number of consults (e.g., 3, 4, 5, ..., 10+)
  const cohortBins = {};
  for (const [_, val] of patientUpcMap.entries()) {
    let bin = val.count;
    if (bin > 10) bin = '10+';
    cohortBins[bin] = cohortBins[bin] || [];
    cohortBins[bin].push(val.upc);
  }

  // Prepare data for chart
  const labels = [];
  const medians = [];
  Object.keys(cohortBins)
    .sort((a, b) => {
      if (a === '10+') return 1;
      if (b === '10+') return -1;
      return Number(a) - Number(b);
    })
    .forEach(bin => {
      labels.push(bin.toString());
      medians.push(median(cohortBins[bin]));
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
        label: 'Median UPC by Number of Consults',
        data: medians,
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          title: { display: true, text: 'Median UPC' }
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