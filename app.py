from flask import Flask, request, render_template, send_file, jsonify
import os
from extractor import (
    read_pdf_with_pymupdf,
    extract_student_data,
    export_to_excel
)

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/extract', methods=['POST'])
def extract_info():
    file = request.files.get('file')
    semester = request.form.get('semester', '').strip()
    seat_no = request.form.get('seat_no', '').strip()

    if not file or not semester or not seat_no:
        return "Missing file / semester / seat number.", 400

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)

    text = read_pdf_with_pymupdf(path)
    students = extract_student_data(text)
    os.remove(path)

    student = next((s for s in students if s['Seat No'] == seat_no), None)
    if not student:
        return f"Seat No {seat_no} not found.", 400

    output_lines = [
        f"Name: {student.get('Name', 'N/A')}",
        f"Status: {student.get('Status', 'N/A')}",
        "Subjects and Scores:"
    ]
    subx = [
        "Engineering Mathematics-II",
        "Engineering Mathematics-II Term Work",
        "Engineering Physics-II",
        "Engineering Physics-II (TW)",
        "Engineering Chemistry-II",
        "Engineering Chemistry-II (TW)"
    ]
    suby = [
        "Engineering Graphics",
        "Engineering Graphics (TW/Oral)",
        "C Programming",
        "C Programming (TW/Oral)",
        "Professional Communication and Ethics-I",
        "Professional Communication and Ethics-I (TW)",
        "Basic Workshop Practice-II (TW)"
    ]
    scores = student.get('Scores', [])
    if scores:
        for idx, subject in enumerate(subx):
            mark = scores[0][idx] if idx < len(scores[0]) else "N/A"
            output_lines.append(f"- {subject}: {mark}")
    if len(scores) > 1:
        for idx, subject in enumerate(suby):
            mark = scores[1][idx] if idx < len(scores[1]) else "N/A"
            output_lines.append(f"- {subject}: {mark}")

    if student.get("Status") == "Successful":
        output_lines.append(f"Final SGPI: {student.get('SGPI', 'N/A')}")
    else:
        output_lines.append("SGPI is not available for unsuccessful students.")

    return "\n".join(output_lines)

@app.route('/analyze', methods=['POST'])
def analyze_info():
    file = request.files.get('file')
    semester = request.form.get('semester', '').strip()
    if not file or not semester:
        return jsonify({"error": "Missing file / semester."}), 400

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)
    text = read_pdf_with_pymupdf(path)
    os.remove(path)

    # build student list and apply optional range filter
    students = extract_student_data(text)
    from_seat = request.form.get('from_seat', '').strip()
    to_seat = request.form.get('to_seat', '').strip()
    if from_seat and to_seat:
        students = [s for s in students if from_seat <= s['Seat No'] <= to_seat]

    total = len(students)
    successful = sum(1 for s in students if s['Status'] == 'Successful')
    unsuccessful = sum(1 for s in students if s['Status'] == 'Unsuccessful')
    absent = sum(1 for s in students if not s['Status'])
    return jsonify({
        "total": total,
        "successful": successful,
        "unsuccessful": unsuccessful,
        "absent": absent
    })

@app.route('/subject_analysis', methods=['POST'])
def subject_analysis():
    file = request.files.get('file')
    semester = request.form.get('semester', '').strip()
    if not file or not semester:
        return jsonify({"error": "Missing file / semester."}), 400

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)
    text = read_pdf_with_pymupdf(path)
    os.remove(path)

    # build student list and apply optional range filter
    students = extract_student_data(text)
    from_seat = request.form.get('from_seat', '').strip()
    to_seat = request.form.get('to_seat', '').strip()
    if from_seat and to_seat:
        students = [s for s in students if from_seat <= s['Seat No'] <= to_seat]
        if from_seat and to_seat and not students:#ADDED
         return jsonify({"error": "Invalid seat range. No students found."}), 400


    # subjects lists
    subx = [
        "Engineering Mathematics-II",
        "Engineering Mathematics-II Term Work",
        "Engineering Physics-II",
        "Engineering Physics-II (TW)",
        "Engineering Chemistry-II",
        "Engineering Chemistry-II (TW)"
    ]
    suby = [
        "Engineering Graphics",
        "Engineering Graphics (TW/Oral)",
        "C Programming",
        "C Programming (TW/Oral)",
        "Professional Communication and Ethics-I",
        "Professional Communication and Ethics-I (TW)",
        "Basic Workshop Practice-II (TW)"
    ]
    # init stats
    stats = {s: {"Passed": 0, "Failed": 0} for s in (subx + suby)}
    for s in students:
        scores = s.get('Scores', [])
        # first line subjects
        for idx, subject in enumerate(subx):
            mark = scores[0][idx] if scores and idx < len(scores[0]) else '--'
            if mark not in ('--', 'AA'):
                stats[subject]['Passed'] += 1
            else:
                stats[subject]['Failed'] += 1
        # second line subjects
        if len(scores) > 1:
            for idx, subject in enumerate(suby):
                mark = scores[1][idx] if idx < len(scores[1]) else '--'
                if mark not in ('--', 'AA'):
                    stats[subject]['Passed'] += 1
                else:
                    stats[subject]['Failed'] += 1
    return jsonify(stats)

@app.route('/export', methods=['POST'])
def export_info():
    file = request.files.get('file')
    semester = request.form.get('semester', '').strip()
    if not file or not semester:
        return "Missing file / semester.", 400

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)
    text = read_pdf_with_pymupdf(path)
    students = extract_student_data(text)
    os.remove(path)

    output_file = os.path.join(UPLOAD_FOLDER, 'Results.xlsx')
    export_to_excel(students, output_file, semester)
    return send_file(output_file, as_attachment=True)

@app.route('/visualize')
def visualize():
    return render_template('visualize.html')

@app.route('/sgpi_data', methods=['POST'])
def sgpi_data():
    file = request.files.get('file')
    semester = request.form.get('semester', '').strip()
    if not file or not semester:
        return jsonify({"error": "Missing file / semester."}), 400

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)
    text = read_pdf_with_pymupdf(path)
    students = extract_student_data(text)
    os.remove(path)

    from_seat = request.form.get('from_seat', '').strip()
    to_seat = request.form.get('to_seat', '').strip()
    if from_seat and to_seat:
        students = [s for s in students if from_seat <= s['Seat No'] <= to_seat]

    sgpis = [float(s['SGPI']) for s in students if s.get('SGPI')]
    return jsonify({"sgpi": sgpis})

if __name__ == '__main__':
    app.run(debug=True)
