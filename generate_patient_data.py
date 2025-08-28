import csv

# Basic fictional patient and clinician data
patients = [
    ("P001", 34),
    ("P002", 52),
    ("P003", 27),
    ("P004", 45),
    ("P005", 63),
]

clinicians = ["Dr Smith", "Dr Jones", "Dr Lee"]

# Generate appointments for the main calculator (script.js)
with open("sample_appointments.csv", "w", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=["Patient ID", "Clinician", "Age in years"])
    writer.writeheader()
    for idx, (pid, age) in enumerate(patients):
        for visit in range(3):
            writer.writerow({
                "Patient ID": pid,
                "Clinician": clinicians[(idx + visit) % len(clinicians)],
                "Age in years": age,
            })

# Generate two appointment lists for the list builder
fieldnames = ["Appointment date", "Clinician", "Patient ID"]
with open("recent_appointments.csv", "w", newline="") as fr, open("past_appointments.csv", "w", newline="") as fp:
    recent_writer = csv.DictWriter(fr, fieldnames=fieldnames)
    past_writer = csv.DictWriter(fp, fieldnames=fieldnames)
    recent_writer.writeheader()
    past_writer.writeheader()
    for idx, (pid, _) in enumerate(patients, start=1):
        recent_writer.writerow({
            "Appointment date": f"2024-01-{idx:02d}",
            "Clinician": clinicians[idx % len(clinicians)],
            "Patient ID": pid,
        })
        past_writer.writerow({
            "Appointment date": f"2023-07-{idx:02d}",
            "Clinician": clinicians[(idx + 1) % len(clinicians)],
            "Patient ID": pid,
        })
