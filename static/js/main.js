/* =========================================================================
   Result Ledger — Dashboard interactions
   Talks to the existing Flask endpoints without altering their contracts:
   /extract  /analyze  /subject_analysis  /export  /sgpi_data
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------- Utility: Toasts ---------------- */
  const toastStack = document.getElementById("toastStack");

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon =
      type === "success"
        ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
    toast.innerHTML = `${icon}<div class="toast-msg">${message}</div><button class="toast-close" aria-label="Dismiss">&times;</button>`;
    toastStack.appendChild(toast);

    const remove = () => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 250);
    };
    toast.querySelector(".toast-close").addEventListener("click", remove);
    setTimeout(remove, 5200);
  }

  /* ---------------- Utility: Loading overlay ---------------- */
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  const LOADING_MESSAGES = [
    "Reading mark sheet…",
    "Parsing seat-wise records…",
    "Tallying results…",
    "Almost done…",
  ];
  let loadingInterval = null;

  function showLoading() {
    let i = 0;
    loadingText.textContent = LOADING_MESSAGES[0];
    loadingOverlay.classList.add("visible");
    loadingInterval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      loadingText.textContent = LOADING_MESSAGES[i];
    }, 1400);
  }

  function hideLoading() {
    loadingOverlay.classList.remove("visible");
    clearInterval(loadingInterval);
  }

  /* ---------------- Sidebar / panel navigation ---------------- */
  const sideLinks = document.querySelectorAll(".side-link[data-panel]");
  const panels = document.querySelectorAll(".panel");

  sideLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sideLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      const target = link.getAttribute("data-panel");
      panels.forEach((p) => p.classList.toggle("active", p.id === target));
    });
  });

  /* ---------------- Shared file upload (drag & drop) ---------------- */
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const dzFileLabel = document.getElementById("dzFileLabel");
  const semesterInput = document.getElementById("semesterInput");

  function setFileLabel(file) {
    if (file) {
      dzFileLabel.textContent = `Selected: ${file.name}`;
      dzFileLabel.classList.add("visible");
    } else {
      dzFileLabel.classList.remove("visible");
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      fileInput.files = e.dataTransfer.files;
      setFileLabel(file);
    }
  });
  fileInput.addEventListener("change", () => setFileLabel(fileInput.files[0]));

  /* ---------------- Hero live counters ---------------- */
  function animateCount(el, target, suffix = "") {
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- Validation helper ---------------- */
  function validateBase() {
    if (!fileInput.files.length) {
      showToast("Upload a result PDF before continuing.", "error");
      return false;
    }
    if (!semesterInput.value.trim()) {
      showToast("Enter the semester label (e.g. Semester II).", "error");
      return false;
    }
    return true;
  }

  function baseFormData() {
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    fd.append("semester", semesterInput.value.trim());
    return fd;
  }

  /* ---------------- Student lookup (/extract) ---------------- */
  const seatNoInput = document.getElementById("seatNoInput");
  const btnLookup = document.getElementById("btnLookup");
  const resultCard = document.getElementById("resultCard");
  const resultEmpty = document.getElementById("resultEmpty");

  btnLookup.addEventListener("click", async () => {
    if (!validateBase()) return;
    if (!seatNoInput.value.trim()) {
      showToast("Enter a seat number to look up.", "error");
      return;
    }
    const fd = baseFormData();
    fd.append("seat_no", seatNoInput.value.trim());

    showLoading();
    try {
      const res = await fetch("/extract", { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Seat number not found.");
      renderStudentResult(text, seatNoInput.value.trim());
      showToast("Student record found.", "success");
    } catch (err) {
      resultCard.classList.remove("visible");
      resultEmpty.style.display = "block";
      showToast(err.message || "Could not extract that record.", "error");
    } finally {
      hideLoading();
    }
  });

  function renderStudentResult(raw, seatNo) {
    // Normalize line endings and drop empty lines so parsing is resilient
    // to \r\n vs \n and any stray whitespace from the server response.
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let name = "N/A";
    let status = "N/A";
    let sgpi = null;
    const subjects = [];

    lines.forEach((line) => {
      if (/^Name:/i.test(line)) {
        name = line.replace(/^Name:/i, "").trim();
      } else if (/^Status:/i.test(line)) {
        status = line.replace(/^Status:/i, "").trim();
      } else if (/^Final SGPI:/i.test(line)) {
        sgpi = line.replace(/^Final SGPI:/i, "").trim();
      } else if (/^SGPI is not available/i.test(line)) {
        sgpi = null;
      } else if (/^Subjects and Scores:/i.test(line)) {
        // section header, nothing to capture
      } else if (line.startsWith("-")) {
        // Line looks like "- Subject Name: 78" — split on the LAST colon
        // so subject names containing punctuation still parse correctly.
        const withoutDash = line.replace(/^-+\s*/, "");
        const idx = withoutDash.lastIndexOf(":");
        if (idx !== -1) {
          subjects.push({
            subject: withoutDash.slice(0, idx).trim(),
            mark: withoutDash.slice(idx + 1).trim(),
          });
        }
      }
    });

    // Helpful during setup/debugging — only visible in the browser console,
    // never shown to the end user.
    console.debug("[Result Ledger] /extract raw response:", raw);
    console.debug("[Result Ledger] parsed subjects:", subjects);

    // If the sheet didn't report a status, treat the student as
    // Unsuccessful rather than leaving the badge blank.
    if (!status || status.trim() === "") {
      status = "Unsuccessful";
    }

    const isPass = status.toLowerCase() === "successful";
    document.getElementById("resultName").textContent = name;
    document.getElementById("resultSeat").textContent = `Seat No. ${seatNo}`;
    const badge = document.getElementById("resultStatusBadge");
    badge.textContent = status;
    badge.className = `status-badge ${isPass ? "pass" : "fail"}`;

    const tbody = document.getElementById("resultTableBody");
    if (subjects.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="2" style="text-align:center; color:var(--text-tertiary); padding:20px 10px;">No subject-wise marks are recorded for this student.</td></tr>';
    } else {
      tbody.innerHTML = subjects
        .map(
          (s) =>
            `<tr><td>${s.subject}</td><td class="mark">${s.mark}</td></tr>`
        )
        .join("");
    }

    const sgpiWrap = document.getElementById("sgpiWrap");
    if (sgpi && isPass) {
      sgpiWrap.style.display = "inline-flex";
      document.getElementById("sgpiValue").textContent = sgpi;
    } else {
      sgpiWrap.style.display = "none";
    }

    resultEmpty.style.display = "none";
    resultCard.classList.add("visible");
  }

  /* ---------------- Class analysis (/analyze + /subject_analysis) ---------------- */
  const fromSeatInput = document.getElementById("fromSeatInput");
  const toSeatInput = document.getElementById("toSeatInput");
  const btnAnalyze = document.getElementById("btnAnalyze");

  let overviewChart = null;
  let subjectChart = null;

  function rangeFormData() {
    const fd = baseFormData();
    if (fromSeatInput.value.trim()) fd.append("from_seat", fromSeatInput.value.trim());
    if (toSeatInput.value.trim()) fd.append("to_seat", toSeatInput.value.trim());
    return fd;
  }

  btnAnalyze.addEventListener("click", async () => {
    if (!validateBase()) return;
    showLoading();
    try {
      const [analyzeRes, subjectRes] = await Promise.all([
        fetch("/analyze", { method: "POST", body: rangeFormData() }),
        fetch("/subject_analysis", { method: "POST", body: rangeFormData() }),
      ]);
      const analyzeData = await analyzeRes.json();
      const subjectData = await subjectRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed.");
      if (!subjectRes.ok) throw new Error(subjectData.error || "Subject analysis failed.");

      renderOverviewStats(analyzeData);
      renderOverviewChart(analyzeData);
      renderSubjectChart(subjectData);
      document.getElementById("analysisEmpty").style.display = "none";
      document.getElementById("analysisResults").style.display = "block";
      showToast("Class results analyzed.", "success");
    } catch (err) {
      showToast(err.message || "Could not analyze the file.", "error");
    } finally {
      hideLoading();
    }
  });

  function renderOverviewStats(data) {
    animateCount(document.getElementById("statTotal"), data.total || 0);
    animateCount(document.getElementById("statPass"), data.successful || 0);
    animateCount(document.getElementById("statFail"), data.unsuccessful || 0);
    animateCount(document.getElementById("statAbsent"), data.absent || 0);
  }

  function renderOverviewChart(data) {
    const ctx = document.getElementById("overviewChart");
    const chartData = {
      labels: ["Successful", "Unsuccessful", "Absent"],
      datasets: [
        {
          data: [data.successful || 0, data.unsuccessful || 0, data.absent || 0],
          backgroundColor: ["#3ddc97", "#ff6b81", "#ffc155"],
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    };
    if (overviewChart) {
      overviewChart.data = chartData;
      overviewChart.update();
      return;
    }
    overviewChart = new Chart(ctx, {
      type: "doughnut",
      data: chartData,
      options: {
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#97a2bf", font: { family: "Inter", size: 12 }, padding: 16 },
          },
        },
      },
    });
  }

  function renderSubjectChart(stats) {
    const ctx = document.getElementById("subjectChart");
    const labels = Object.keys(stats);
    const passed = labels.map((l) => stats[l].Passed);
    const failed = labels.map((l) => stats[l].Failed);
    const shortLabels = labels.map((l) => (l.length > 22 ? l.slice(0, 20) + "…" : l));

    const chartData = {
      labels: shortLabels,
      datasets: [
        { label: "Passed", data: passed, backgroundColor: "#3ddc97", borderRadius: 4, maxBarThickness: 22 },
        { label: "Failed", data: failed, backgroundColor: "#ff6b81", borderRadius: 4, maxBarThickness: 22 },
      ],
    };

    if (subjectChart) {
      subjectChart.data = chartData;
      subjectChart.update();
      return;
    }

    subjectChart = new Chart(ctx, {
      type: "bar",
      data: chartData,
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: "#5c6684" }, grid: { color: "rgba(148,163,184,0.08)" } },
          y: { stacked: true, ticks: { color: "#97a2bf", font: { size: 11 } }, grid: { display: false } },
        },
        plugins: {
          legend: { labels: { color: "#97a2bf" }, position: "top", align: "end" },
        },
      },
    });
  }

  /* ---------------- Export (/export) ---------------- */
  const btnExport = document.getElementById("btnExport");

  btnExport.addEventListener("click", async () => {
    if (!validateBase()) return;
    showLoading();
    try {
      const res = await fetch("/export", { method: "POST", body: baseFormData() });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Export failed.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Results.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("Spreadsheet downloaded.", "success");
    } catch (err) {
      showToast(err.message || "Could not export results.", "error");
    } finally {
      hideLoading();
    }
  });

  /* ---------------- Ledger ticker (decorative, generated once) ---------------- */
  const ledgerTrack = document.getElementById("ledgerTrack");
  if (ledgerTrack) {
    const sample = [];
    for (let i = 0; i < 24; i++) {
      const seat = String(2200000 + Math.floor(Math.random() * 9999)).slice(0, 7);
      const pass = Math.random() > 0.22;
      const sgpi = (6 + Math.random() * 4).toFixed(2);
      sample.push(
        `<span class="${pass ? "" : "fail"}">${seat} — <b>${pass ? "SGPI " + sgpi : "UNSUCCESSFUL"}</b></span>`
      );
    }
    ledgerTrack.innerHTML = sample.join("") + sample.join("");
  }
})();