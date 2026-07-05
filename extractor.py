import fitz  # PyMuPDF
import re
from openpyxl import Workbook

# --- PDF READING FUNCTION ---
def read_pdf_with_pymupdf(pdf_path):
    """Reads a PDF and returns the extracted text."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text("text")
    doc.close()
    return text

# --- SCORE EXTRACTION HELPER ---
def extract_valid_scores(line):
    """
    Skip the first two tokens, then take every 3rd token (terminal exam score).
    Excludes 'E' and 'F' grades.
    """
    tokens = re.findall(r'\d{1,2}|--|AA', line)
    valid = []
    count = 0
    for tok in tokens:
        if tok not in ('E', 'F'):
            count += 1
            if count % 3 == 0:
                valid.append(tok)
    return valid

# --- STUDENT DATA PARSING ---
def extract_student_data(text):
    """
    Parses all student records from the raw text.
    Returns a list of dicts: {Seat No, Name, Scores, Status, SGPI}.
    """
    students = []
    current = None
    lines = text.splitlines()

    for i, line in enumerate(lines):
        m = re.match(r'^\s*(\d{7})\s+(.+?)\s+\|', line)
        if m:
            if current:
                students.append(current)
            current = {
                "Seat No": m.group(1),
                "Name": m.group(2).strip(),
                "Scores": [],
                "Status": "",
                "SGPI": ""
            }

        if not current:
            continue

        # Status line
        sm = re.search(r'\|\s*(Successful|Unsuccessful)', line, re.IGNORECASE)
        if sm:
            current["Status"] = sm.group(1).capitalize()
            # Line X scores (next line)
            if i+1 < len(lines):
                sx = extract_valid_scores(lines[i+1])
                current["Scores"].append(sx[:6])
            # Line Y scores (after location)
            locs = ["Mumbai","Thane","Panvel","Ratnagiri","Kankavli","Vasai",
                    "Shahapur","Karjat","Khed","Bhoisar","Badlapur","kumbhivali"]
            for j in range(i+1, len(lines)):
                if any(loc in lines[j] for loc in locs) and j+1 < len(lines):
                    sy = extract_valid_scores(lines[j+1])
                    current["Scores"].append(sy[:7])
                    break

        # SGPI only if successful
        if current["Status"] == "Successful":
            g = re.search(r'\|\s*(\d+\.\d{2})\s*--', line)
            if g and float(g.group(1)) < 10:
                current["SGPI"] = g.group(1)

    if current:
        students.append(current)
    return students

# --- SINGLE STUDENT LOOKUP ---
def extract_student_info(text, seat_no):
    """Returns the dict for one student, or None."""
    for s in extract_student_data(text):
        if s["Seat No"] == seat_no:
            return s
    return None

# --- OVERALL STUDENT ANALYSIS ---
def analyze_students(text):
    """
    Returns counts of total, successful, unsuccessful, and absent students.
    """
    students = extract_student_data(text)
    total = len(students)
    successful = sum(1 for s in students if s["Status"] == "Successful")
    unsuccessful = sum(1 for s in students if s["Status"] == "Unsuccessful")
    absent = sum(1 for s in students if not s["Status"])
    return {
        "total": total,
        "successful": successful,
        "unsuccessful": unsuccessful,
        "absent": absent
    }

# --- SUBJECT-WISE ANALYSIS HELPERS ---
SUBX = [
    "Engineering Mathematics-II",
    "Engineering Mathematics-II Term Work",
    "Engineering Physics-II",
    "Engineering Physics-II (TW)",
    "Engineering Chemistry-II",
    "Engineering Chemistry-II (TW)"
]
SUBY = [
    "Engineering Graphics",
    "Engineering Graphics (TW/Oral)",
    "C Programming",
    "C Programming (TW/Oral)",
    "Professional Communication and Ethics-I",
    "Professional Communication and Ethics-I (TW)",
    "Basic Workshop Practice-II (TW)"
]

def parse_subject_line(line, num_subjects):
    """
    Split `line` on whitespace into exactly num_subjects groups of 3 tokens each.
    Any token (number, letters, 'F', 'AA', 'R', 'RR', '--', etc.) is allowed.
    """
    tokens = line.strip().split()
    groups = []
    for i in range(num_subjects):
        start = i * 3
        groups.append(tokens[start : start + 3])
    return groups

def classify_group(group):
    """
    Pass/Fail based only on the first two tokens:
      - If either token contains 'F' anywhere, or equals 'AA' → Fail
      - Otherwise → Pass
    """
    if len(group) < 2:
        return "Fail"
    first, second = group[0], group[1]
    if "F" in first or first == "AA" or "F" in second or second == "AA":
        return "Fail"
    return "Pass"

def analyze_subjects(text):
    """
    Returns a dict mapping each subject in SUBX+SUBY to {"Passed": n, "Failed": m}.
    """
    stats = {s: {"Passed": 0, "Failed": 0} for s in (SUBX + SUBY)}
    lines = text.splitlines()
    i = 0
    LOCS = ["Mumbai","Thane","Panvel","Ratnagiri","Kankavli","Vasai",
            "Shahapur","Karjat","Khed","Bhoisar","Badlapur","kumbhivali"]

    while i < len(lines):
        if re.match(r'^\s*\d{7}\s+', lines[i]):
            j = i
            while j < len(lines) and not re.search(r'\|\s*(Successful|Unsuccessful)', lines[j], re.IGNORECASE):
                j += 1
            if j + 1 < len(lines):
                groups_x = parse_subject_line(lines[j+1], len(SUBX))
                for idx, subj in enumerate(SUBX):
                    key = "Passed" if classify_group(groups_x[idx]) == "Pass" else "Failed"
                    stats[subj][key] += 1
            k = j + 1
            while k < len(lines) and not any(loc in lines[k] for loc in LOCS):
                k += 1
            if k + 1 < len(lines):
                groups_y = parse_subject_line(lines[k+1], len(SUBY))
                for idx, subj in enumerate(SUBY):
                    key = "Passed" if classify_group(groups_y[idx]) == "Pass" else "Failed"
                    stats[subj][key] += 1
            i = k + 1
        else:
            i += 1
    return stats

# --- EXCEL EXPORT ---
def export_to_excel(student_data, save_path, semester):
    """
    Writes the student_data list (output of extract_student_data) to an Excel file.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = f"{semester} Results"

    headers = [
        "Sr. No.", "Seat No", "Name"
    ] + SUBX + SUBY + ["Status", "SGPI"]
    ws.append(headers)

    for idx, s in enumerate(student_data, start=1):
        row = [
            idx,
            s.get("Seat No","N/A"),
            s.get("Name","N/A")
        ]
        if s["Scores"]:
            row += s["Scores"][0][:len(SUBX)] + ["N/A"]*(len(SUBX)-len(s["Scores"][0]))
        else:
            row += ["N/A"]*len(SUBX)
        if len(s["Scores"]) > 1:
            row += s["Scores"][1][:len(SUBY)] + ["N/A"]*(len(SUBY)-len(s["Scores"][1]))
        else:
            row += ["N/A"]*len(SUBY)
        row += [s.get("Status","N/A"), s.get("SGPI","N/A")]
        ws.append(row)

    wb.save(save_path)
