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
  - Select the following columns (any of the equivalent headings shown are accepted):
    - `Appointments -> Appointment Date` or `Date`
    - `Appointments -> Clinician` or `User Details' Full Name`
    - `Demographics -> Age in years` or `Age`
    - `Demographics -> NHS Number` or `Patient ID`
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

To generate a CSV from EMIS Web that matches the format needed by the Continuity Calculator (i.e. one row per GP consultation, with columns: `NHS Number, Age, Date, User Details' Full Name`), follow these steps:

1. **Open Population Reporting**  
   From the EMIS main menu: **Reporting → Population Reporting**.

2. **Create (or import) a Search**  
   - If you already have a search that returns all **consultations in the last 12 months** with a GP, import it (via **Import → Enquiry Document**) or build it from scratch.  
   - If building: use **Add → Search → Consultations**; filter by date (last year) and restrict to GP consultations (e.g. by consultation type or by clinician role).

3. **Add a List Report**  
   - With your search selected, click **Add → Patient → List report**.  
   - In “Results from”, select the search you just made (or imported).

4. **Define the required report columns**  
   Add (via **Add**) the following fields:  
   - `Patient Details → NHS Number`  
   - `Patient Details → Age (in years)`  
   - `Consultations → Date` (this is the date of the individual consultation)  
   - `Consultations → User Details' Full Name` (this will capture the clinician name for each consult)

5. **Save & Run the report**  
   Save the report, then run it. Ensure the output shows multiple rows per patient (one for each consultation), by virtue of listing the date & clinician of each consultation.

6. **View Results**  
   Once the report has run, click **View Results**. If the output contains expansions (i.e. multiple consultation rows per patient), confirm all the required fields appear correctly.

7. **Export to CSV**  
   - From the View Results screen, choose **Export** → **CSV**.  
   - If given the option, tick **“Exclude report header”** only if you want only your column headings in row 1 (you may **not** want to exclude header so you can see them).  
   - Save the CSV locally.

8. **Check output format**  
   - Ensure the headings are exactly: `NHS Number, Age, Date, User Details' Full Name` (in that order).  
   - Check the “Date” values are the **consultation dates**.  
   - Check “User Details' Full Name” corresponds to the GP clinician for each consultation.  
   - Check that ages are in years (properly calculated from date of birth to date of consultation).

---

### Supporting links & references

- How to export appointment or consultations data from EMIS Web for analysis using Appointment Reporting → Tabular view → Export.  [Hero Health](https://www.herohealthsoftware.net/primary-care/emis-support/article/how-do-i-export-appointment-data-from-emis-web-for-analysis?utm_source=chatgpt.com)  
- EMIS Web guidance for creating list reports in Population Reporting and exporting CSVs.  [Ardens EMIS Web](https://support-ew.ardens.org.uk/support/solutions/articles/31000176445-export-and-import-patient-lists?utm_source=chatgpt.com)  


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
