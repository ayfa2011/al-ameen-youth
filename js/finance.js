/* =========================================================
   AYFA FINANCE REPORT
   Reference data is loaded from authenticated Firebase paths.
========================================================= */

let AYFA_FINANCE_DATA = {};
let financeDataReady = false;

async function loadFinanceData() {
  try {
    const reports = await loadReferenceData("financeReports", "financeReports");
    AYFA_FINANCE_DATA = reports || {};
    financeDataReady = true;
  } catch (error) {
    financeDataReady = false;
    if (window.firebaseAuth?.currentUser) {
      console.error("Finance report read failed:", error);
    }
  }
}

let currentFinanceYear = "2026";
let currentFinanceSearch = "";

function financeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function financeMoney(value) {
  return "₹ " + financeNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function financeCleanText(value) {
  return String(value ?? "").trim();
}

function getFinanceRows(year) {
  const rows = Array.isArray(AYFA_FINANCE_DATA[year]) ? AYFA_FINANCE_DATA[year] : [];
  return rows.map(row => ({
    label: financeCleanText(row?.[0]),
    amount: row?.[1] === null || row?.[1] === "" || typeof row?.[1] === "undefined"
      ? null
      : financeNumber(row[1])
  }));
}

function financeIsSection(label) {
  return /^(1\.|2\.|3\.)/.test(label);
}

function financeIsHeader(label) {
  return /Particulars|ವಿವರ/.test(label) && /Amount|ಮೊತ್ತ/.test(label);
}

function calculateFinance(year) {
  const rows = getFinanceRows(year);

  let income = [];
  let expense = [];
  let finalRows = [];
  let mode = "";
  let totalAvailable = null;
  let totalExpenses = null;
  let closingBalance = null;

  rows.forEach((row, index) => {
    const label = row.label;
    if (!label) return;

    if (label.startsWith("1.")) {
      mode = "income";
      return;
    }
    if (label.startsWith("2.")) {
      mode = "expense";
      return;
    }
    if (label.startsWith("3.")) {
      mode = "final";
      return;
    }
    if (financeIsHeader(label)) return;

    if (/Total Available Fund|ಲಭ್ಯವಿರುವ ಮೊತ್ತ/.test(label)) {
      totalAvailable = row.amount;
      return;
    }
    if (/Total Expenses|ಒಟ್ಟು ಆದ ವೆಚ್ಚ/.test(label)) {
      if (mode === "expense") totalExpenses = row.amount;
      else finalRows.push(row);
      return;
    }
    if (/Closing Balance|ಕೈಯಲ್ಲಿರುವ ಉಳಿಕೆ ಹಣ/.test(label)) {
      closingBalance = row.amount;
      finalRows.push(row);
      return;
    }

    if (mode === "income") income.push(row);
    else if (mode === "expense") expense.push(row);
    else if (mode === "final") finalRows.push(row);
  });

  // Excel total cells may be formula cells and can arrive without a value.
  // Calculate totals from the supplied numeric rows without inventing data.
  if (totalAvailable === null) {
    totalAvailable = income.reduce((sum, r) => sum + financeNumber(r.amount), 0);
  }
  if (totalExpenses === null) {
    totalExpenses = expense.reduce((sum, r) => sum + financeNumber(r.amount), 0);
  }
  if (closingBalance === null && (income.some(r => r.amount !== null) || expense.some(r => r.amount !== null))) {
    closingBalance = totalAvailable - totalExpenses;
  }

  return {
    income,
    expense,
    finalRows,
    totalAvailable,
    totalExpenses,
    closingBalance,
    hasData: rows.some(r => r.amount !== null)
  };
}

function financeRowHTML(row, extraClass = "") {
  const amount = row.amount === null ? "—" : financeMoney(row.amount);
  return `
    <tr class="${extraClass}">
      <td>${escapeFinanceHTML(row.label)}</td>
      <td class="amount">${amount}</td>
    </tr>
  `;
}

function escapeFinanceHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function showFinanceYear(year) {
  if (!financeDataReady) await loadFinanceData();
  currentFinanceYear = String(year);

  document.querySelectorAll("#financeYearTabs .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.trim() === currentFinanceYear);
  });

  const result = calculateFinance(currentFinanceYear);
  const matchesFinanceSearch = row => !currentFinanceSearch || String(row.label || "").toLocaleLowerCase().includes(currentFinanceSearch);

  const incomeEl = document.getElementById("totalIncome");
  const expenseEl = document.getElementById("totalExpense");
  const balanceEl = document.getElementById("totalBalance");
  const incomeBody = document.getElementById("financeIncomeBody");
  const expenseBody = document.getElementById("financeExpenseBody");
  const finalBody = document.getElementById("financeFinalBody");
  const yearTitle = document.getElementById("financeYearTitle");

  if (!incomeEl || !expenseEl || !balanceEl) return;

  incomeEl.textContent = result.hasData ? financeMoney(result.totalAvailable) : "ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ";
  expenseEl.textContent = result.hasData ? financeMoney(result.totalExpenses) : "ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ";
  balanceEl.textContent = result.hasData ? financeMoney(result.closingBalance) : "ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ";

  balanceEl.classList.remove("finance-balance-positive", "finance-balance-negative");
  if (result.hasData) {
    balanceEl.classList.add(result.closingBalance >= 0 ? "finance-balance-positive" : "finance-balance-negative");
  }

  if (yearTitle) {
    const rows = getFinanceRows(currentFinanceYear);
    const title = rows[0]?.label || `Finance Report ${currentFinanceYear}`;
    yearTitle.textContent = `${currentFinanceYear} — ${title}`;
  }

  if (incomeBody) {
    const rows = result.income.filter(matchesFinanceSearch);
    incomeBody.innerHTML = rows.length
      ? rows.map(r => financeRowHTML(r)).join("")
      : `<tr><td colspan="2" class="finance-empty">ಈ ವರ್ಷದ ಆದಾಯದ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</td></tr>`;
  }

  if (expenseBody) {
    const rows = result.expense.filter(matchesFinanceSearch);
    expenseBody.innerHTML = rows.length
      ? rows.map(r => financeRowHTML(r)).join("")
      : `<tr><td colspan="2" class="finance-empty">ಈ ವರ್ಷದ ವೆಚ್ಚದ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</td></tr>`;
  }

  if (finalBody) {
    const final = [];
    if (result.totalAvailable !== null) {
      final.push({ label: "ಒಟ್ಟು ಲಭ್ಯವಿದ್ದ ಮೊತ್ತ (Total Fund)", amount: result.totalAvailable });
    }
    if (result.totalExpenses !== null) {
      final.push({ label: "ಒಟ್ಟು ಆದ ವೆಚ್ಚ (Total Expenses)", amount: result.totalExpenses });
    }
    if (result.closingBalance !== null) {
      final.push({ label: "ಪ್ರಸ್ತುತ ಕೈಯಲ್ಲಿರುವ ಉಳಿಕೆ ಹಣ (Closing Balance)", amount: result.closingBalance });
    }
    result.finalRows.forEach(r => {
      if (!final.some(x => x.label === r.label)) final.push(r);
    });

    const rows = final.filter(matchesFinanceSearch);
    finalBody.innerHTML = rows.length
      ? rows.map((r, i) => financeRowHTML(r, i < 3 ? "total-row" : "")).join("")
      : `<tr><td colspan="2" class="finance-empty">ಅಂತಿಮ ಲೆಕ್ಕಾಚಾರ ಲಭ್ಯವಿಲ್ಲ.</td></tr>`;
  }
}

function filterFinanceRows(query) {
  currentFinanceSearch = String(query || "").trim().toLocaleLowerCase();
  showFinanceYear(currentFinanceYear);
}

function openFinanceReport() {
  if (typeof navigateAppView === "function" && history.state?.appView !== "finance") history.pushState({ appView: "finance" }, "", location.pathname + location.search + "#finance");
  updateAppTopBar("finance");
  if (typeof hideAllViews === "function") {
    hideAllViews();
  }

  const view = document.getElementById("financeView");
  if (view) view.classList.remove("hidden");

  void showFinanceYear(currentFinanceYear || "2026");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function downloadFinancePDF() {
  const section = document.getElementById("finance");
  if (!section) {
    alert("Finance Report ಸಿಗಲಿಲ್ಲ.");
    return;
  }

  if (typeof html2canvas === "undefined") {
    alert("PDF download library load ಆಗಿಲ್ಲ.");
    return;
  }

  const button = document.querySelector(".btn-finance-pdf");
  const oldText = button ? button.innerHTML : "";

  try {
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...';
    }

    const canvas = await html2canvas(section, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library load ಆಗಿಲ್ಲ. Report ಅನ್ನು Print → Save as PDF ಮೂಲಕ save ಮಾಡಬಹುದು.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - margin * 2;
    const imageHeight = canvas.height * usableWidth / canvas.width;

    let remainingHeight = imageHeight;
    let sourceY = 0;

    while (remainingHeight > 0) {
      if (sourceY > 0) pdf.addPage();

      const sliceHeightPx = Math.min(
        canvas.height - sourceY,
        Math.floor((pageHeight - margin * 2) * canvas.width / usableWidth)
      );

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;

      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, sourceY, canvas.width, sliceHeightPx,
        0, 0, canvas.width, sliceHeightPx
      );

      const sliceHeightMm = sliceHeightPx * usableWidth / canvas.width;
      pdf.addImage(
        sliceCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        margin,
        usableWidth,
        sliceHeightMm
      );

      sourceY += sliceHeightPx;
      remainingHeight -= sliceHeightMm;
    }

    pdf.save(`AYFA_Finance_Report_${currentFinanceYear}.pdf`);
  } catch (error) {
    console.error("Finance PDF error:", error);
    alert("PDF download ಮಾಡುವಾಗ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = oldText;
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  showFinanceYear("2026");
  if (window.firebaseAuth) {
    window.firebaseAuth.onAuthStateChanged(user => {
      if (user) {
        financeDataReady = false;
        showFinanceYear(currentFinanceYear);
      } else {
        AYFA_FINANCE_DATA = {};
        financeDataReady = false;
        showFinanceYear(currentFinanceYear);
      }
    });
  }
});
