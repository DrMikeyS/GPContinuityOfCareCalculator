"""Generate fictional GP appointment data for continuity calculator.

Produces a CSV file with columns suitable for both index.html and listbuilder.html:
Patient ID, Clinician, Age in years, Appointment date

The data contains ~3,000 patients and ~20,000 appointments within the last year.
"""

import csv
import random
from datetime import datetime, timedelta

# Constants
NUM_PATIENTS = 3000
TARGET_APPOINTMENTS = 20000
MAX_APPOINTMENTS_PER_PATIENT = 15
CLINICIANS = [
    "Dr Smith",
    "Dr Jones",
    "Dr Patel",
    "Dr Brown",
    "Dr Taylor",
    "Dr Wilson",
    "Dr Johnson",
    "Dr Davis",
    "Dr Evans",
    "Dr Thomas",
]


def generate_nhs_number() -> str:
    """Generate a random valid NHS number."""
    while True:
        digits = [random.randint(0, 9) for _ in range(9)]
        weights = list(range(10, 1, -1))
        total = sum(d * w for d, w in zip(digits, weights))
        remainder = total % 11
        check = 11 - remainder
        if check == 11:
            check = 0
        if check == 10:
            continue  # invalid combination, retry
        digits.append(check)
        # Format as 3-3-4 with spaces: XXX XXX XXXX
        return f"{digits[0]}{digits[1]}{digits[2]} {digits[3]}{digits[4]}{digits[5]} {digits[6]}{digits[7]}{digits[8]}{digits[9]}"


def allocate_appointments() -> list[int]:
    """Allocate appointment counts per patient respecting constraints."""
    counts: list[int] = []
    for _ in range(NUM_PATIENTS):
        if random.random() < 0.5:
            counts.append(1)
        else:
            # Start with a decreasing distribution for 2-15 appointments
            weights = list(reversed(range(1, 15)))  # 14..1
            counts.append(random.choices(range(2, 16), weights=weights, k=1)[0])
    # Increase appointment counts for non-single patients until target reached
    eligible = [i for i, c in enumerate(counts) if 1 < c < MAX_APPOINTMENTS_PER_PATIENT]
    while sum(counts) < TARGET_APPOINTMENTS and eligible:
        idx = random.choice(eligible)
        counts[idx] += 1
        if counts[idx] >= MAX_APPOINTMENTS_PER_PATIENT:
            eligible.remove(idx)
    return counts


def generate_appointments():
    """Create appointment records and write them to a CSV file."""
    counts = allocate_appointments()
    today = datetime.today()
    start_date = today - timedelta(days=365)

    rows: list[dict[str, str]] = []
    for _ in range(NUM_PATIENTS):
        patient_id = generate_nhs_number()
        age = random.randint(0, 100)
        num_apps = counts.pop()  # get and remove last count

        primary_clinician = random.choice(CLINICIANS)
        loyal = random.random() < 0.5  # True -> all appointments with primary clinician

        for _ in range(num_apps):
            if loyal:
                clinician = primary_clinician
            else:
                # Mostly with primary clinician but some variety
                clinician = (
                    primary_clinician if random.random() < 0.7 else random.choice(CLINICIANS)
                )
            # Random appointment date within last year
            delta = random.randint(0, 365)
            date = start_date + timedelta(days=delta)
            rows.append(
                {
                    "Patient ID": patient_id,
                    "Clinician": clinician,
                    "Age in years": str(age),
                    "Appointment date": date.strftime("%Y-%m-%d"),
                }
            )

    # Shuffle rows to mix patient appointments
    random.shuffle(rows)

    with open("appointments.csv", "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Patient ID", "Clinician", "Age in years", "Appointment date"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} appointments for {NUM_PATIENTS} patients -> appointments.csv")


if __name__ == "__main__":
    random.seed(42)  # reproducibility
    generate_appointments()
