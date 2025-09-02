# GP Continuity Calculator

## Background

The **GP Continuity Calculator** is a tool for UK general practices to analyse appointment data and calculate the Usual Provider of Care (UPC) index for their patients. The UPC is a widely used measure of continuity of care, indicating how often patients see the same GP. Higher UPC scores reflect better continuity, which is associated with improved patient outcomes.

This tool is designed to work with appointment data exported from EMIS or SystmOne (TPP) clinical systems.

---

## Features

- Calculates the overall mean UPC for your practice.
- Shows mean UPC by number of consults and by patient age cohort.
- Allows you to filter which GPs are included in the analysis.
- Results are displayed in clear tables and charts.
- Export patient-level UPC data as a CSV file.

## Development and Testing

- Synthetic appointment data for development and testing is available in `synthetic_test_data/appointments.csv`.
- Use `synthetic_test_data/generate_fictional_data.py` to generate additional synthetic datasets.

## Security & Data Privacy

- **All processing is done locally in your web browser.**
  No patient data is uploaded to any server or leaves your computer at any point.
- You can use this tool offline by opening `index.html` directly from the release ZIP.
- Always handle and store patient data in accordance with your organisation’s information governance and data protection policies.

---

## Exporting Data from TPP SystmOne (S1)

1. **Import the S1 Searches**
   - Import the provided S1 searches file into your SystmOne clinical system.
   - The imported searches will allow you to output all GP appointments for various time intervals.

2. **Run the Search**
   - SystmOne only allows reports to export 30,000 rows at a time.
   - For larger practices, you may need to use the half-year or quarter-period searches instead of the full-year search.
   - Start by trying the full-year search; if you hit the row limit, use the shorter interval searches.

3. **Export the Data**
   - Once the search has run, click **Breakdown Results**.
   - Select the following columns:
     - `Appointments -> Appointment Date`
     - `Appointments -> Clinician`
     - `Demographics -> Age in years`
     - `Demographics -> NHS Number`
   - Click **Refresh** to update the results.
   - When the results are ready, click the **CSV** button and save the file somewhere on your computer.

---

## Running the Calculator and List Builder

1. **Download the Release ZIP**
   - Download the latest release ZIP file from this repository and extract it to a folder on your computer.

2. **Run the Calculator**
   - Open `index.html` in your web browser (double-click or right-click and choose "Open with" your browser).
   - Use the file upload button to import your CSV file.
   - Use the "Filter GPs" button to select which GPs to include in the analysis as needed.

3. **Run the List Builder**
   - Open `listbuilder.html` in your web browser.
   - Follow the on-screen prompts to combine appointment files and allocate patients to clinicians.

---

## For EMIS Users

- Coming soon

---

## List Builder Logic

The separate **List Builder** helps allocate frequent attenders to a GP for continuity work. It works as follows:

1. **Combine appointment CSVs** from the last 6 months and the previous 6 months to create a single dataset.
2. **Count visits per patient** and keep only those with 11 or more appointments over the year.
3. **Calculate continuity** by tallying each remaining patient's appointments with each clinician and deriving UPC scores.
4. **Estimate clinician capacity** from appointment counts (which can be adjusted manually).
5. **Allocate patients to clinicians**:
   - Patients with a UPC above 0.6 remain with their top clinician.
   - Otherwise, patients are offered to clinicians they have seen with UPC above 0.4 who still have capacity based on fair share of sessions.
   - If no such clinician is available, patients are assigned to a clinician they have seen before or, as a last resort, to the clinician with the lightest caseload.
6. **Produce outputs**: a list of patient assignments (which can be exported as a CSV), a summary comparing each clinician's caseload with their fair share, and the mean UPC for the cohort.

---

## License

This project is released under the MIT License.

---

## Support

For issues or suggestions, please open an issue on this repository.
