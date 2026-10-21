// Pure rental money calculations. Keep these rules independent of the UI.
window.RentalsService = Object.freeze({
  number(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  },
  status(totalValue, paidValue) {
    const total = this.number(totalValue);
    const paid = this.number(paidValue);
    if (paid >= total && total > 0) return "paid";
    if (paid > 0) return "partial";
    return "pending";
  },
  balance(totalValue, paidValue) {
    return Math.max(0, this.number(totalValue) - this.number(paidValue));
  },
  totals(rentals) {
    return (rentals || []).reduce((totals, rental) => {
      const total = this.number(rental.totalAmount);
      const paid = this.number(rental.paidAmount);
      totals.total += total;
      totals.paid += paid;
      totals.advance += this.number(rental.advanceAmount ?? rental.initialAdvance ?? rental.paidAmount);
      totals.balance += Math.max(0, this.number(rental.balance ?? (total - paid)));
      return totals;
    }, { total: 0, paid: 0, advance: 0, balance: 0 });
  },
  paymentResult(totalValue, paidValue, amountValue) {
    const total = this.number(totalValue);
    const paid = Math.min(total, this.number(paidValue) + this.number(amountValue));
    return { paid, balance: this.balance(total, paid), status: this.status(total, paid) };
  },
  canApplyPayment(totalValue, paidValue, amountValue) {
    const amount = this.number(amountValue);
    return amount > 0 && amount <= this.balance(totalValue, paidValue);
  },
  prepareEntry(totalValue, advanceValue, existingPaidValue = null) {
    const total = this.number(totalValue);
    const requestedAdvance = Math.max(0, this.number(advanceValue));
    const paid = existingPaidValue === null ? requestedAdvance : this.number(existingPaidValue);
    return {
      total,
      requestedAdvance,
      paid,
      advanceExceedsTotal: requestedAdvance > total,
      paidExceedsTotal: paid > total,
      balance: total - paid,
      status: this.status(total, paid)
    };
  },
  maintenanceTotal(rentals) {
    return (rentals || []).reduce((sum, rental) => sum + this.number(rental.maintenanceCost), 0);
  },
  netRevenue(collectedValue, maintenanceValue) {
    return this.number(collectedValue) - this.number(maintenanceValue);
  }
});
