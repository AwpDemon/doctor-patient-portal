/**
 * billing.js - Billing Module
 *
 * Displays billing history, outstanding balances,
 * payment processing, and financial summaries.
 */

const BillingModule = (() => {
  async function render() {
    const content = document.getElementById('page-content');
    const user = App.getCurrentUser();

    try {
      const patientId = user.role === 'patient' ? user.id : null;
      let bills, summary;

      if (user.role === 'patient') {
        const data = await App.api(`/patients/${user.id}/billing`);
        bills = data.bills;
        summary = data.summary;
      } else {
        // Admin/Doctor - show all or limited view
        content.innerHTML = `
          <div class="page-header">
            <div class="page-title">
              <span class="material-symbols-outlined">receipt_long</span>
              <div><h1>Billing Overview</h1><p>Financial management and invoices</p></div>
            </div>
          </div>
          <div class="empty-state">
            <span class="material-symbols-outlined">receipt_long</span>
            <h3>Select a patient to view billing</h3>
            <p>Navigate to a patient's profile to manage their billing records.</p>
            <button class="btn btn-primary" onclick="App.navigate('patients')">View Patients</button>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">receipt_long</span>
            <div>
              <h1>Billing & Payments</h1>
              <p>View your invoices and payment history</p>
            </div>
          </div>
        </div>

        <div class="billing-summary">
          <div class="billing-stat">
            <div class="amount blue">${App.formatCurrency(summary.total_charges)}</div>
            <div class="label">Total Charges</div>
          </div>
          <div class="billing-stat">
            <div class="amount green">${App.formatCurrency(summary.total_insurance)}</div>
            <div class="label">Insurance Covered</div>
          </div>
          <div class="billing-stat">
            <div class="amount green">${App.formatCurrency(summary.total_paid)}</div>
            <div class="label">Amount Paid</div>
          </div>
          <div class="billing-stat">
            <div class="amount ${summary.outstanding > 0 ? 'red' : 'green'}">${App.formatCurrency(summary.outstanding)}</div>
            <div class="label">Outstanding Balance</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Invoices</h3>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Insurance</th>
                  <th>You Owe</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${bills.map(b => `
                  <tr>
                    <td><strong>${b.invoice_number}</strong></td>
                    <td>${b.description}</td>
                    <td>${App.formatDate(b.created_at ? b.created_at.split(' ')[0] : null)}</td>
                    <td>${App.formatCurrency(b.amount)}</td>
                    <td class="text-success">${App.formatCurrency(b.insurance_covered)}</td>
                    <td><strong>${App.formatCurrency(b.patient_responsibility)}</strong></td>
                    <td>${App.getStatusBadge(b.status)}</td>
                    <td>
                      ${(b.status === 'pending' || b.status === 'overdue') ? `
                        <button class="btn btn-sm btn-success" onclick="BillingModule.payBill(${user.id}, ${b.id}, ${b.patient_responsibility})">
                          <span class="material-symbols-outlined">payments</span> Pay
                        </button>
                      ` : b.status === 'paid' ? `
                        <span class="text-xs text-muted">Paid ${b.paid_date ? App.formatDate(b.paid_date.split(' ')[0]) : ''}</span>
                      ` : `
                        <span class="text-xs text-muted">${b.status}</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${bills.length === 0 ? '<div class="empty-state"><span class="material-symbols-outlined">receipt</span><h3>No billing records</h3></div>' : ''}
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load billing</h3><p>${err.error || ''}</p></div>`;
    }
  }

  async function payBill(patientId, billId, amount) {
    App.showModal('Pay Invoice', `
      <div class="text-center mb-4">
        <h2 class="text-primary">${App.formatCurrency(amount)}</h2>
        <p class="text-muted">Amount Due</p>
      </div>
      <form id="pay-form" class="auth-form">
        <div class="form-group">
          <label for="pay-method">Payment Method</label>
          <select id="pay-method" required>
            <option value="credit_card">Credit Card</option>
            <option value="debit_card">Debit Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="online">Online Payment</option>
          </select>
        </div>
        <div class="form-group">
          <label for="pay-card">Card Number (simulated)</label>
          <input type="text" id="pay-card" placeholder="**** **** **** ****" maxlength="19">
        </div>
        <p class="text-xs text-muted">This is a demo. No real payment will be processed.</p>
        <button type="submit" class="btn btn-success btn-block">
          <span class="material-symbols-outlined">lock</span> Confirm Payment
        </button>
      </form>
    `);

    document.getElementById('pay-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await App.api(`/patients/${patientId}/billing/${billId}/pay`, {
          method: 'PUT',
          body: { payment_method: document.getElementById('pay-method').value },
        });
        App.closeModal();
        App.showToast('Payment successful!', 'success');
        render();
      } catch (err) {
        App.showToast(err.error || 'Payment failed.', 'error');
      }
    });
  }

  return { render, payBill };
})();
