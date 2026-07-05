/* =========================================================================
   SGPI Visualizer interactions — talks to /sgpi_data
   ========================================================================= */

(function () {
  "use strict";

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

  const loadingOverlay = document.getElementById("loadingOverlay");
  function showLoading() { loadingOverlay.classList.add("visible"); }
  function hideLoading() { loadingOverlay.classList.remove("visible"); }

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const dzFileLabel = document.getElementById("dzFileLabel");
  const semesterInput = document.getElementById("semesterInput");
  const fromSeatInput = document.getElementById("fromSeatInput");
  const toSeatInput = document.getElementById("toSeatInput");
  const btnVisualize = document.getElementById("btnVisualize");

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

  let sgpiChart = null;

  btnVisualize.addEventListener("click", async () => {
    if (!fileInput.files.length) {
      showToast("Upload a result PDF first.", "error");
      return;
    }
    if (!semesterInput.value.trim()) {
      showToast("Enter the semester label.", "error");
      return;
    }

    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    fd.append("semester", semesterInput.value.trim());
    if (fromSeatInput.value.trim()) fd.append("from_seat", fromSeatInput.value.trim());
    if (toSeatInput.value.trim()) fd.append("to_seat", toSeatInput.value.trim());

    showLoading();
    try {
      const res = await fetch("/sgpi_data", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not compute SGPI distribution.");
      renderSgpiChart(data.sgpi || []);
      showToast("SGPI distribution ready.", "success");
    } catch (err) {
      showToast(err.message || "Something went wrong.", "error");
    } finally {
      hideLoading();
    }
  });

  function renderSgpiChart(values) {
    const bandSize = 0.5;
    const bands = {};
    let min = 10, max = 0, sum = 0;

    values.forEach((v) => {
      const band = (Math.floor(v / bandSize) * bandSize).toFixed(2);
      bands[band] = (bands[band] || 0) + 1;
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    });

    const labels = Object.keys(bands).sort((a, b) => parseFloat(a) - parseFloat(b));
    const counts = labels.map((l) => bands[l]);
    const bandLabels = labels.map((l) => `${l}–${(parseFloat(l) + bandSize).toFixed(2)}`);

    document.getElementById("statCount").textContent = values.length;
    document.getElementById("statAvg").textContent = values.length ? (sum / values.length).toFixed(2) : "0.00";
    document.getElementById("statTop").textContent = values.length ? max.toFixed(2) : "0.00";

    const ctx = document.getElementById("sgpiChart");
    const chartData = {
      labels: bandLabels,
      datasets: [
        {
          label: "Students",
          data: counts,
          backgroundColor: "#6c8eff",
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    };

    if (sgpiChart) {
      sgpiChart.data = chartData;
      sgpiChart.update();
      return;
    }

    sgpiChart = new Chart(ctx, {
      type: "bar",
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "#97a2bf", font: { family: "JetBrains Mono", size: 11 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: "#5c6684", precision: 0 }, grid: { color: "rgba(148,163,184,0.08)" } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }
})();
