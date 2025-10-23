// Logic for loading appointment data and calculating the Modified St Leonard's Index of Continuity of Care (mSLICC).
// Mirrors the behaviour of the UPC calculator but implements the mSLICC specific rules.

document.getElementById('csvFile').setAttribute('multiple', 'multiple');

const monthSelectorContainer = document.getElementById('monthSelectorContainer');
const measurementMonthSelect = document.getElementById('measurementMonthSelect');

if (measurementMonthSelect) {
  measurementMonthSelect.addEventListener('change', function() {
    renderMsliccForSelectedMonth();
  });
}

document.getElementById('csvFile').addEventListener('change', function(event) {
  const files = event.target.files;
  if (!files.length) return;

  let allData = [];
  let filesProcessed = 0;
  let headerMap = null;

  const headerAliases = {
    patientId: ['Patient ID', 'NHS number', 'NHS Number'],
    clinician: ['Clinician', "User Details' Full Name"],
    age: ['Age in years', 'Age'],
    appointmentDate: ['Appointment date', 'Date']
  };

  Papa.parse(files[0], {
    header: true,
    skipEmptyLines: true,
    complete: function(firstResults) {
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
        age: matchHeader(headerAliases.age),
        appointmentDate: matchHeader(headerAliases.appointmentDate)
      };

      const missingHeaders = [];
      if (!headerMap.patientId) missingHeaders.push('Patient ID or NHS Number');
      if (!headerMap.clinician) missingHeaders.push("Clinician or User Details' Full Name");
      if (!headerMap.appointmentDate) missingHeaders.push('Appointment date or Date');

      if (missingHeaders.length) {
        alert('Missing required headers: ' + missingHeaders.join(', '));
        return;
      }

      window.headerMap = headerMap;
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
        ensureField(headerMap.age, headerAliases.age);
        ensureField(headerMap.appointmentDate, headerAliases.appointmentDate);

        return normalizedRow;
      };

      const normalizedFirstData = firstResults.data.map(normalizeRow);
      allData = allData.concat(normalizedFirstData);
      filesProcessed = 1;

      if (files.length === 1) {
        finalizeProcessing(allData);
        return;
      }

      for (let i = 1; i < files.length; i++) {
        Papa.parse(files[i], {
          header: true,
          skipEmptyLines: true,
          complete: function(results) {
            const normalizedRows = results.data.map(normalizeRow);
            allData = allData.concat(normalizedRows);
            filesProcessed++;
            if (filesProcessed === files.length) {
              finalizeProcessing(allData);
            }
          }
        });
      }
    }
  });

  function finalizeProcessing(allData) {
    window.msliccAllData = allData;
    window.msliccContext = prepareMsliccContext(allData, headerMap);
    const previousSelection = measurementMonthSelect ? measurementMonthSelect.value : null;
    updateMeasurementMonthOptions(window.msliccContext, previousSelection);
    renderMsliccForSelectedMonth();
    includedGPs = null;
    document.getElementById('showGpFilterBtn').style.display = 'inline-block';
  }
});

function parseAppointmentDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const european = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+.+)?$/);
  if (european) {
    const day = Number(european[1]);
    const month = Number(european[2]) - 1;
    let year = Number(european[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function prepareMsliccContext(data, headerMap) {
  const { records, patientAgeMap } = parseMsliccData(data, headerMap);
  return { records, patientAgeMap };
}

function parseMsliccData(data, headerMap) {
  const records = [];
  const patientAgeMap = new Map();

  if (!headerMap) {
    return { records, patientAgeMap };
  }

  const patientIdHeader = headerMap.patientId;
  const clinicianHeader = headerMap.clinician;
  const ageHeader = headerMap.age;
  const appointmentDateHeader = headerMap.appointmentDate;

  if (!patientIdHeader || !clinicianHeader || !appointmentDateHeader) {
    return { records, patientAgeMap };
  }

  for (const row of data) {
    const patientId = row[patientIdHeader];
    const clinician = row[clinicianHeader];
    const rawDate = row[appointmentDateHeader];
    if (!patientId || !clinician || !rawDate) continue;

    const appointmentDate = parseAppointmentDate(rawDate);
    if (!appointmentDate) continue;

    if (ageHeader && row[ageHeader] !== undefined && row[ageHeader] !== null && row[ageHeader] !== '') {
      const numericAge = Number(row[ageHeader]);
      if (!Number.isNaN(numericAge) && !patientAgeMap.has(patientId)) {
        patientAgeMap.set(patientId, numericAge);
      }
    }

    records.push({ patientId, clinician, appointmentDate });
  }

  return { records, patientAgeMap };
}

function calculateMSLICC(context, measurementMonthStart) {
  const patientStats = new Map();

  if (!context || !context.records || !context.records.length) {
    return {
      measurementMonthStart: null,
      measurementMonthEnd: null,
      measurementLabel: null,
      numerator: 0,
      denominator: 0,
      value: 0,
      patientStats,
      totalMonthAppointments: 0,
      excludedAppointments: 0,
      patientsWithRegularGp: 0,
      patientsSeenThisMonth: 0,
      patientsWithoutRegularGp: 0
    };
  }

  const records = context.records;
  const patientAgeMap = context.patientAgeMap || new Map();

  let monthStart = null;
  if (measurementMonthStart instanceof Date && !Number.isNaN(measurementMonthStart.getTime())) {
    monthStart = new Date(measurementMonthStart.getFullYear(), measurementMonthStart.getMonth(), 1);
  }

  if (!monthStart) {
    const maxDate = new Date(Math.max(...records.map(r => r.appointmentDate.getTime())));
    monthStart = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }

  const measurementMonthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

  const lookbackRecords = records.filter(r => r.appointmentDate < monthStart);
  const measurementRecords = records.filter(r => r.appointmentDate >= monthStart && r.appointmentDate <= measurementMonthEnd);

  const lookbackByPatient = new Map();
  for (const record of lookbackRecords) {
    if (!lookbackByPatient.has(record.patientId)) {
      lookbackByPatient.set(record.patientId, new Map());
    }
    const gpMap = lookbackByPatient.get(record.patientId);
    if (!gpMap.has(record.clinician)) {
      gpMap.set(record.clinician, { count: 0, lastDate: null });
    }
    const gpStats = gpMap.get(record.clinician);
    gpStats.count += 1;
    if (!gpStats.lastDate || gpStats.lastDate < record.appointmentDate) {
      gpStats.lastDate = record.appointmentDate;
    }
  }

  const regularGpMap = new Map();
  for (const [patientId, gpMap] of lookbackByPatient.entries()) {
    const eligible = Array.from(gpMap.entries()).filter(([, stats]) => stats.count >= 2);
    if (!eligible.length) continue;

    eligible.sort((a, b) => {
      if (b[1].count !== a[1].count) {
        return b[1].count - a[1].count;
      }
      return b[1].lastDate - a[1].lastDate;
    });

    regularGpMap.set(patientId, eligible[0][0]);
  }

  let numerator = 0;
  let denominator = 0;
  let patientsWithRegularGp = 0;

  const patientsSeenThisMonth = new Set();
  const patientsWithRegularThisMonth = new Set();

  const monthByPatient = new Map();
  for (const record of measurementRecords) {
    patientsSeenThisMonth.add(record.patientId);

    if (!regularGpMap.has(record.patientId)) {
      continue;
    }

    if (!monthByPatient.has(record.patientId)) {
      monthByPatient.set(record.patientId, { total: 0, withRegular: 0, regularGp: regularGpMap.get(record.patientId) });
    }

    const patientMonthStats = monthByPatient.get(record.patientId);
    patientMonthStats.total += 1;
    denominator += 1;

    if (record.clinician === patientMonthStats.regularGp) {
      patientMonthStats.withRegular += 1;
      numerator += 1;
    }
  }

  for (const [patientId, stats] of monthByPatient.entries()) {
    patientsWithRegularThisMonth.add(patientId);
    patientsWithRegularGp += 1;
    const age = patientAgeMap.get(patientId) ?? null;
    const ratio = stats.total ? stats.withRegular / stats.total : 0;
    patientStats.set(patientId, {
      ratio,
      total: stats.total,
      withRegular: stats.withRegular,
      regularGp: stats.regularGp,
      age
    });
  }

  const totalMonthAppointments = measurementRecords.length;
  const excludedAppointments = totalMonthAppointments - denominator;

  return {
    measurementMonthStart: monthStart,
    measurementMonthEnd,
    measurementLabel: formatMonthLabel(monthStart),
    numerator,
    denominator,
    value: denominator ? (numerator / denominator) * 100 : 0,
    patientStats,
    totalMonthAppointments,
    excludedAppointments,
    patientsWithRegularGp,
    patientsSeenThisMonth: patientsSeenThisMonth.size,
    patientsWithoutRegularGp: patientsSeenThisMonth.size - patientsWithRegularThisMonth.size
  };
}

function updateMeasurementMonthOptions(context, preferredValue) {
  if (!measurementMonthSelect) return null;

  const months = getMeasurementMonths(context?.records || []);

  if (!months.length) {
    if (monthSelectorContainer) {
      monthSelectorContainer.style.display = 'none';
    }
    measurementMonthSelect.innerHTML = '';
    measurementMonthSelect.value = '';
    return null;
  }

  if (monthSelectorContainer) {
    monthSelectorContainer.style.display = 'block';
  }

  measurementMonthSelect.innerHTML = '';

  let selectedValue = null;
  const preferredIsValid = preferredValue && months.some(date => formatMonthValue(date) === preferredValue);

  months.forEach(date => {
    const option = document.createElement('option');
    const value = formatMonthValue(date);
    option.value = value;
    option.textContent = formatMonthLabel(date);
    measurementMonthSelect.appendChild(option);
    if (!selectedValue) {
      selectedValue = value;
    }
  });

  if (preferredIsValid) {
    selectedValue = preferredValue;
  } else {
    selectedValue = formatMonthValue(months[months.length - 1]);
  }

  measurementMonthSelect.value = selectedValue;
  return parseMonthValue(selectedValue);
}

function getMeasurementMonths(records) {
  if (!records || !records.length) return [];

  const monthKeys = new Set();
  records.forEach(record => {
    const date = record.appointmentDate;
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthKeys.add(key);
  });

  const months = Array.from(monthKeys).map(key => {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    return new Date(year, month, 1);
  });

  months.sort((a, b) => a - b);
  return months;
}

function formatMonthValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseMonthValue(value) {
  if (!value) return null;
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return new Date(year, monthIndex, 1);
}

function renderMsliccForSelectedMonth() {
  if (!window.msliccContext) {
    return;
  }

  let measurementMonthStart = null;
  if (measurementMonthSelect && measurementMonthSelect.value) {
    measurementMonthStart = parseMonthValue(measurementMonthSelect.value);
  }

  const stats = calculateMSLICC(window.msliccContext, measurementMonthStart);
  window.msliccStats = stats;
  displayResults(stats);
  displayTabulator(stats.patientStats, window.headerMap?.patientId);
}

function formatMonthLabel(date) {
  if (!date) return null;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function displayResults(stats) {
  const resultsDiv = document.getElementById('results');

  if (!stats.measurementMonthStart) {
    resultsDiv.innerHTML = `
      <div class="alert alert-warning" role="alert">
        No valid appointment dates were found. Please check the CSV and try again.
      </div>
    `;
    document.getElementById('helpSection').style.display = 'none';
    resetMsliccCharts();
    return;
  }

  const monthLabel = stats.measurementLabel;
  const measurementRange = `${formatDate(stats.measurementMonthStart)} – ${formatDate(stats.measurementMonthEnd)}`;

  drawMsliccMonthlyTrend(window.msliccContext, stats.measurementMonthStart);

  if (!stats.denominator) {
    resultsDiv.innerHTML = `
      <div class="alert alert-info" role="alert">
        <p class="mb-1 fw-bold">Measurement month: ${monthLabel} (${measurementRange})</p>
        <p class="mb-1">No patients had a qualifying regular GP in the lookback period, so mSLICC cannot be calculated.</p>
        <p class="mb-0 text-muted">Appointments this month: ${stats.totalMonthAppointments}</p>
      </div>
    `;
    document.getElementById('helpSection').style.display = 'block';
    return;
  }

  let alertClass = 'alert-danger';
  if (stats.value >= 70) {
    alertClass = 'alert-success';
  } else if (stats.value >= 40) {
    alertClass = 'alert-warning';
  }

  resultsDiv.innerHTML = `
    <div class="alert ${alertClass} text-center fs-4 fw-bold" role="alert" style="letter-spacing:0.5px;">
      mSLICC for ${monthLabel}: <span class="fs-3">${stats.value.toFixed(1)}%</span>
    </div>
    <div class="card border-0 bg-body-tertiary">
      <div class="card-body">
        <p class="mb-1"><strong>Measurement month:</strong> ${monthLabel} (${measurementRange})</p>
        <p class="mb-1"><strong>Appointments with regular GP:</strong> ${stats.numerator}</p>
        <p class="mb-1"><strong>Total eligible appointments:</strong> ${stats.denominator}</p>
        <p class="mb-1 text-muted">Appointments excluded (no regular GP): ${stats.excludedAppointments}</p>
        <p class="mb-0 text-muted">Patients with regular GP this month: ${stats.patientsWithRegularGp} of ${stats.patientsSeenThisMonth}</p>
      </div>
    </div>
  `;

  document.getElementById('helpSection').style.display = 'block';
}

function resetMsliccCharts() {
  clearChart('msliccMonthlyTrendChart', 'msliccMonthlyTrend');
  const note = document.getElementById('msliccTrendNote');
  if (note) {
    note.style.display = 'none';
  }
}

function clearChart(chartRef, canvasId) {
  if (window[chartRef]) {
    window[chartRef].destroy();
    window[chartRef] = null;
  }
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function drawMsliccMonthlyTrend(context, selectedMonthStart) {
  if (!context || !context.records || !context.records.length) {
    resetMsliccCharts();
    return;
  }

  const canvas = document.getElementById('msliccMonthlyTrend');
  if (!canvas) return;

  const months = getMeasurementMonths(context.records);
  if (!months.length) {
    resetMsliccCharts();
    return;
  }

  const labels = months.map(month => formatMonthLabel(month));
  const values = months.map(month => {
    const monthStats = calculateMSLICC(context, month);
    return monthStats.denominator ? Number(monthStats.value.toFixed(2)) : null;
  });

  clearChart('msliccMonthlyTrendChart', 'msliccMonthlyTrend');

  const selectedMonthValue = selectedMonthStart ? formatMonthValue(selectedMonthStart) : null;

  const ctx = canvas.getContext('2d');
  window.msliccMonthlyTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'mSLICC by Month',
        data: values,
        borderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        borderWidth: 2,
        tension: 0.2,
        spanGaps: true,
        pointRadius: context => {
          const month = months[context.dataIndex];
          const value = month ? formatMonthValue(month) : null;
          return value && value === selectedMonthValue ? 6 : 4;
        },
        pointBackgroundColor: context => {
          const month = months[context.dataIndex];
          const value = month ? formatMonthValue(month) : null;
          return value && value === selectedMonthValue ? 'rgba(220, 53, 69, 1)' : 'rgba(54, 162, 235, 1)';
        },
        segment: {
          borderDash: ctx => (ctx.p0DataIndex < 3 ? [4, 4] : undefined)
        }
      }]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const value = context.parsed.y;
              if (value === null || value === undefined) {
                return 'Insufficient data';
              }
              return `mSLICC: ${value.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: 'mSLICC (%)' }
        },
        x: {
          title: { display: true, text: 'Month' }
        }
      }
    }
  });

  const note = document.getElementById('msliccTrendNote');
  if (note) {
    note.style.display = 'block';
  }
}

function displayTabulator(patientStatsMap, patientIdHeader) {
  if (window.patientTable) {
    window.patientTable.destroy();
    document.getElementById('patientUpcsTable').innerHTML = '';
  }

  const tableDiv = document.getElementById('patientUpcsTable');
  const downloadBtn = document.getElementById('downloadCsvBtn');

  if (!patientStatsMap || patientStatsMap.size === 0) {
    tableDiv.style.display = 'none';
    tableDiv.innerHTML = '';
    downloadBtn.style.display = 'none';
    downloadBtn.onclick = null;
    return;
  }

  const tableData = Array.from(patientStatsMap.entries()).map(([pid, val]) => ({
    patientID: pid,
    regularGP: val.regularGp,
    msliccPercent: val.ratio * 100,
    appointments: val.total,
    withRegular: val.withRegular,
    age: val.age
  }));

  tableDiv.style.display = 'block';
  tableDiv.innerHTML = '';

  window.patientTable = new Tabulator(tableDiv, {
    data: tableData,
    layout: 'fitColumns',
    responsiveLayout: 'hide',
    pagination: 'local',
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250],
    columns: [
      { title: patientIdHeader || 'Patient ID', field: 'patientID', sorter: 'string', headerFilter: 'input' },
      { title: 'Regular GP', field: 'regularGP', sorter: 'string', headerFilter: 'input' },
      { title: 'mSLICC %', field: 'msliccPercent', sorter: 'number', formatter: cell => cell.getValue().toFixed(1) },
      { title: 'Appointments (month)', field: 'appointments', sorter: 'number' },
      { title: 'With regular GP', field: 'withRegular', sorter: 'number' },
      { title: 'Age', field: 'age', sorter: 'number' }
    ],
    initialSort: [
      { column: 'appointments', dir: 'desc' }
    ],
    placeholder: 'No data available',
    footerElement: "<div style='padding: 10px; text-align: center;'>mSLICC Patient Table</div>"
  });

  downloadBtn.style.display = 'inline-block';
  downloadBtn.onclick = () => window.patientTable.download('csv', 'patient_mslicc.csv');
}

let includedGPs = null;

document.getElementById('showGpFilterBtn').addEventListener('click', function() {
  if (!window.msliccAllData) return;
  showGpFilterModal();
});

function showGpFilterModal() {
  const clinicianHeader = window.headerMap?.clinician;
  if (!clinicianHeader) return;

  const gpCounts = {};
  window.msliccAllData.forEach(row => {
    const gp = row[clinicianHeader];
    if (!gp) return;
    gpCounts[gp] = (gpCounts[gp] || 0) + 1;
  });

  const sortedGPs = Object.entries(gpCounts).sort((a, b) => b[1] - a[1]);

  const tableRows = sortedGPs.map(([gp, count]) => `
    <tr>
      <td>
        <input class="form-check-input" type="checkbox" value="${gp}" id="gpCheck_${gp.replace(/[^a-zA-Z0-9]/g, '_')}" ${(!includedGPs || includedGPs.has(gp)) ? 'checked' : ''}>
      </td>
      <td>
        <label class="form-check-label" for="gpCheck_${gp.replace(/[^a-zA-Z0-9]/g, '_')}">${gp}</label>
      </td>
      <td>
        <span class="badge bg-secondary">${count}</span>
      </td>
    </tr>
  `).join('');

  const tableHtml = `
    <table class="table table-sm table-bordered align-middle mb-0">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col">GP Name</th>
          <th scope="col">Appointments</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  const gpFilterList = document.getElementById('gpFilterList');
  gpFilterList.innerHTML = tableHtml;

  setTimeout(() => {
    document.getElementById('gpSelectAllBtn').onclick = function() {
      document.querySelectorAll('#gpFilterList input[type=checkbox]').forEach(chk => chk.checked = true);
    };
    document.getElementById('gpSelectNoneBtn').onclick = function() {
      document.querySelectorAll('#gpFilterList input[type=checkbox]').forEach(chk => chk.checked = false);
    };
  }, 0);

  const modal = new bootstrap.Modal(document.getElementById('gpFilterModal'));
  modal.show();
}

document.getElementById('applyGpFilter').addEventListener('click', function() {
  const checks = document.querySelectorAll('#gpFilterList input[type=checkbox]');
  includedGPs = new Set();
  checks.forEach(chk => { if (chk.checked) includedGPs.add(chk.value); });

  const clinicianHeader = window.headerMap?.clinician;
  if (!clinicianHeader) return;

  let filteredData = window.msliccAllData;
  if (includedGPs && includedGPs.size) {
    filteredData = window.msliccAllData.filter(row => includedGPs.has(row[clinicianHeader]));
  }

  window.msliccContext = prepareMsliccContext(filteredData, window.headerMap);
  const previousSelection = measurementMonthSelect ? measurementMonthSelect.value : null;
  updateMeasurementMonthOptions(window.msliccContext, previousSelection);
  renderMsliccForSelectedMonth();
});
