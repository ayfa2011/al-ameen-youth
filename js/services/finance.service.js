// Pure finance report parsing and calculations. No DOM or Firebase access.
window.FinanceService = Object.freeze({
  number(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  },
  cleanText(value) { return String(value ?? "").trim(); },
  isHeader(label) { return /Particulars|ವಿವರ/.test(label) && /Amount|ಮೊತ್ತ/.test(label); },
  normalizeRows(sourceRows) {
    return (Array.isArray(sourceRows) ? sourceRows : []).map(row => ({
      label: this.cleanText(row?.[0]),
      amount: row?.[1] === null || row?.[1] === "" || typeof row?.[1] === "undefined" ? null : this.number(row[1])
    }));
  },
  calculate(sourceRows) {
    const rows = this.normalizeRows(sourceRows);
    const income = [];
    const expense = [];
    const finalRows = [];
    let mode = "";
    let totalAvailable = null;
    let totalExpenses = null;
    let closingBalance = null;
    rows.forEach(row => {
      const label = row.label;
      if (!label) return;
      if (label.startsWith("1.")) { mode = "income"; return; }
      if (label.startsWith("2.")) { mode = "expense"; return; }
      if (label.startsWith("3.")) { mode = "final"; return; }
      if (this.isHeader(label)) return;
      if (/Total Available Fund|ಲಭ್ಯವಿರುವ ಮೊತ್ತ/.test(label)) { totalAvailable = row.amount; return; }
      if (/Total Expenses|ಒಟ್ಟು ಆದ ವೆಚ್ಚ/.test(label)) {
        if (mode === "expense") totalExpenses = row.amount;
        else finalRows.push(row);
        return;
      }
      if (/Closing Balance|ಕೈಯಲ್ಲಿರುವ ಉಳಿಕೆ ಹಣ/.test(label)) { closingBalance = row.amount; finalRows.push(row); return; }
      if (mode === "income") income.push(row);
      else if (mode === "expense") expense.push(row);
      else if (mode === "final") finalRows.push(row);
    });
    if (totalAvailable === null) totalAvailable = income.reduce((sum, row) => sum + this.number(row.amount), 0);
    if (totalExpenses === null) totalExpenses = expense.reduce((sum, row) => sum + this.number(row.amount), 0);
    if (closingBalance === null && (income.some(row => row.amount !== null) || expense.some(row => row.amount !== null))) {
      closingBalance = totalAvailable - totalExpenses;
    }
    return { income, expense, finalRows, totalAvailable, totalExpenses, closingBalance, hasData: rows.some(row => row.amount !== null) };
  }
});
