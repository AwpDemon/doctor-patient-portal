/**
 * prescriptions.js - Prescription Management Module
 *
 * View, create, and manage prescriptions.
 * Patients can request refills; doctors can prescribe.
 */

const PrescriptionsModule = (() => {
  let currentFilter = 'all';

  async function render() {
    const content = document.getElementById('page-content');
    const user = App.getCurrentUser();

    try {
      const data = await App.api('/prescriptions');

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">medication</span>
            <div>
              <h1>Prescriptions</h1>
              <p>${user.role === 'doctor' ? 'Manage prescriptions for your patients' : 'Your medications and prescriptions'}</p>
            </div>
          </div>
          ${user.role === 'doctor' ? `
            <button class="btn btn-primary" onclick="PrescriptionsModule.showCreateForm()">
              <span class="material-symbols-outlined">add</span> New Prescription
            </button>
          ` : ''}
        </div>

        <div class="card">
          <div class="card-header">
            <h3>All Prescriptions</h3>
            <div class="filters-bar" style="margin-bottom:0;">
              <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" onclick="PrescriptionsModule.filter('all')">All</button>
              <button class="filter-chip ${currentFilter === 'active' ? 'active' : ''}" onclick="PrescriptionsModule.filter('active')">Active</button>
              <button class="filter-chip ${currentFilter === 'completed' ? 'active' : ''}" onclick="PrescriptionsModule.filter('completed')">Completed</button>
              <button class="filter-chip ${currentFilter === 'expired' ? 'active' : ''}" onclick="PrescriptionsModule.filter('expired')">Expired</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>${user.role === 'patient' ? 'Doctor' : 'Patient'}</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Refills</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${renderRows(data.prescriptions, user)}
              </tbody>
            </table>
          </div>
          ${data.prescriptions.length === 0 ? '<div class="empty-state"><span class="material-symbols-outlined">medication</span><h3>No prescriptions</h3></div>' : ''}
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load prescriptions</h3></div>`;
    }
  }

  function renderRows(prescriptions, user) {
    const filtered = currentFilter === 'all'
      ? prescriptions
      : prescriptions.filter(rx => rx.status === currentFilter);

    return filtered.map(rx => `
      <tr>
        <td><strong>${rx.medication}</strong></td>
        <td>${rx.dosage}</td>
        <td>${rx.frequency}</td>
        <td>${user.role === 'patient'
          ? `Dr. ${rx.doctor_first} ${rx.doctor_last}`
          : `${rx.patient_first} ${rx.patient_last}`
        }</td>
        <td>${App.formatDate(rx.start_date)}</td>
        <td>${App.getStatusBadge(rx.status)}</td>
        <td>${rx.refills_remaining}/${rx.refills_total}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-ghost" onclick="PrescriptionsModule.viewDetails(${rx.id})" title="Details">
              <span class="material-symbols-outlined">info</span>
            </button>
            ${user.role === 'patient' && rx.status === 'active' && rx.refills_remaining > 0 ? `
              <button class="btn btn-sm btn-ghost text-primary" onclick="PrescriptionsModule.requestRefill(${rx.id})" title="Request Refill">
                <span class="material-symbols-outlined">autorenew</span>
              </button>
            ` : ''}
            ${user.role === 'doctor' && rx.status === 'active' ? `
              <button class="btn btn-sm btn-ghost" onclick="PrescriptionsModule.editPrescription(${rx.id})" title="Edit">
                <span class="material-symbols-outlined">edit</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function filter(status) {
    currentFilter = status;
    render();
  }

  async function viewDetails(id) {
    try {
      const data = await App.api(`/prescriptions/${id}`);
      const rx = data.prescription;

      App.showModal(`${rx.medication} - Details`, `
        <div class="profile-details-grid">
          <div class="profile-field"><label>Medication</label><span class="value">${rx.medication}</span></div>
          <div class="profile-field"><label>Dosage</label><span class="value">${rx.dosage}</span></div>
          <div class="profile-field"><label>Frequency</label><span class="value">${rx.frequency}</span></div>
          <div class="profile-field"><label>Status</label><span class="value">${App.getStatusBadge(rx.status)}</span></div>
          <div class="profile-field"><label>Start Date</label><span class="value">${App.formatDate(rx.start_date)}</span></div>
          <div class="profile-field"><label>End Date</label><span class="value">${rx.end_date ? App.formatDate(rx.end_date) : 'Ongoing'}</span></div>
          <div class="profile-field"><label>Prescribing Doctor</label><span class="value">Dr. ${rx.doctor_first} ${rx.doctor_last}</span></div>
          <div class="profile-field"><label>Specialty</label><span class="value">${rx.doctor_specialty || 'General'}</span></div>
          <div class="profile-field"><label>Pharmacy</label><span class="value">${rx.pharmacy || 'Not specified'}</span></div>
          <div class="profile-field"><label>Refills</label><span class="value">${rx.refills_remaining} of ${rx.refills_total} remaining</span></div>
        </div>
        ${rx.instructions ? `<div class="mt-4"><label>Instructions</label><p class="text-sm mt-1">${rx.instructions}</p></div>` : ''}
        ${rx.side_effects ? `<div class="mt-3"><label>Possible Side Effects</label><p class="text-sm mt-1 text-warning">${rx.side_effects}</p></div>` : ''}
      `);
    } catch (err) {
      App.showToast(err.error || 'Failed to load details.', 'error');
    }
  }

  async function requestRefill(id) {
    if (!confirm('Request a refill for this prescription?')) return;

    try {
      await App.api(`/prescriptions/${id}/refill`, { method: 'POST' });
      App.showToast('Refill requested! Your doctor will be notified.', 'success');
      render();
    } catch (err) {
      App.showToast(err.error || 'Failed to request refill.', 'error');
    }
  }

  async function showCreateForm() {
    try {
      const patients = await App.api('/patients');

      App.showModal('New Prescription', `
        <form id="rx-form" class="auth-form">
          <div class="form-group">
            <label for="rx-patient">Patient</label>
            <select id="rx-patient" required>
              <option value="">Select patient...</option>
              ${patients.patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="rx-medication">Medication</label>
            <input type="text" id="rx-medication" placeholder="e.g., Amoxicillin" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rx-dosage">Dosage</label>
              <input type="text" id="rx-dosage" placeholder="e.g., 500mg" required>
            </div>
            <div class="form-group">
              <label for="rx-frequency">Frequency</label>
              <input type="text" id="rx-frequency" placeholder="e.g., Twice daily" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rx-start">Start Date</label>
              <input type="date" id="rx-start" required value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label for="rx-end">End Date (optional)</label>
              <input type="date" id="rx-end">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="rx-refills">Refills</label>
              <input type="number" id="rx-refills" value="0" min="0" max="12">
            </div>
            <div class="form-group">
              <label for="rx-pharmacy">Pharmacy</label>
              <input type="text" id="rx-pharmacy" placeholder="e.g., CVS Pharmacy">
            </div>
          </div>
          <div class="form-group">
            <label for="rx-instructions">Instructions</label>
            <textarea id="rx-instructions" rows="3" placeholder="Special instructions for the patient..."></textarea>
          </div>
          <div class="form-group">
            <label for="rx-side-effects">Side Effects</label>
            <textarea id="rx-side-effects" rows="2" placeholder="Known side effects..."></textarea>
          </div>
          <div id="rx-error" class="form-error hidden"></div>
          <button type="submit" class="btn btn-primary btn-block">Create Prescription</button>
        </form>
      `);

      document.getElementById('rx-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api('/prescriptions', {
            method: 'POST',
            body: {
              patient_id: parseInt(document.getElementById('rx-patient').value),
              medication: document.getElementById('rx-medication').value,
              dosage: document.getElementById('rx-dosage').value,
              frequency: document.getElementById('rx-frequency').value,
              start_date: document.getElementById('rx-start').value,
              end_date: document.getElementById('rx-end').value || undefined,
              refills: parseInt(document.getElementById('rx-refills').value),
              pharmacy: document.getElementById('rx-pharmacy').value,
              instructions: document.getElementById('rx-instructions').value,
              side_effects: document.getElementById('rx-side-effects').value,
            },
          });
          App.closeModal();
          App.showToast('Prescription created!', 'success');
          render();
        } catch (err) {
          document.getElementById('rx-error').textContent = err.error || 'Failed to create prescription.';
          document.getElementById('rx-error').classList.remove('hidden');
        }
      });
    } catch (err) {
      App.showToast('Failed to load form.', 'error');
    }
  }

  async function editPrescription(id) {
    try {
      const data = await App.api(`/prescriptions/${id}`);
      const rx = data.prescription;

      App.showModal('Edit Prescription', `
        <form id="rx-edit-form" class="auth-form">
          <div class="form-group">
            <label>Medication: <strong>${rx.medication}</strong></label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-dosage">Dosage</label>
              <input type="text" id="edit-dosage" value="${rx.dosage}" required>
            </div>
            <div class="form-group">
              <label for="edit-frequency">Frequency</label>
              <input type="text" id="edit-frequency" value="${rx.frequency}" required>
            </div>
          </div>
          <div class="form-group">
            <label for="edit-status">Status</label>
            <select id="edit-status">
              <option value="active" ${rx.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="completed" ${rx.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="cancelled" ${rx.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-refills">Refills Remaining</label>
            <input type="number" id="edit-refills" value="${rx.refills_remaining}" min="0">
          </div>
          <div class="form-group">
            <label for="edit-instructions">Instructions</label>
            <textarea id="edit-instructions" rows="3">${rx.instructions || ''}</textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Update Prescription</button>
        </form>
      `);

      document.getElementById('rx-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api(`/prescriptions/${id}`, {
            method: 'PUT',
            body: {
              dosage: document.getElementById('edit-dosage').value,
              frequency: document.getElementById('edit-frequency').value,
              status: document.getElementById('edit-status').value,
              refills_remaining: parseInt(document.getElementById('edit-refills').value),
              instructions: document.getElementById('edit-instructions').value,
            },
          });
          App.closeModal();
          App.showToast('Prescription updated.', 'success');
          render();
        } catch (err) {
          App.showToast(err.error || 'Update failed.', 'error');
        }
      });
    } catch (err) {
      App.showToast(err.error || 'Failed to load prescription.', 'error');
    }
  }

  return { render, filter, viewDetails, requestRefill, showCreateForm, editPrescription };
})();
