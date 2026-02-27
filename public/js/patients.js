/**
 * patients.js - Patient Records Module
 *
 * Patient listing for doctors, detailed patient views,
 * medical history, and record management.
 */

const PatientsModule = (() => {
  async function render() {
    const content = document.getElementById('page-content');
    const user = App.getCurrentUser();

    if (user.role === 'patient') {
      // Redirect patients to their own profile
      App.navigate('profile');
      return;
    }

    try {
      const data = await App.api('/patients');

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">groups</span>
            <div>
              <h1>${user.role === 'doctor' ? 'My Patients' : 'All Patients'}</h1>
              <p>${data.patients.length} patients</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Patient List</h3>
            <div class="search-bar" style="max-width:280px;">
              <span class="material-symbols-outlined">search</span>
              <input type="text" id="patient-search" placeholder="Search patients..." oninput="PatientsModule.filterList()">
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>DOB</th>
                  <th>Gender</th>
                  <th>Visits</th>
                  <th>Last Visit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="patients-tbody">
                ${data.patients.map(p => `
                  <tr data-name="${p.first_name} ${p.last_name}">
                    <td><strong>${p.first_name} ${p.last_name}</strong></td>
                    <td>${p.email}</td>
                    <td>${p.phone || '-'}</td>
                    <td>${App.formatDate(p.date_of_birth)}</td>
                    <td>${p.gender || '-'}</td>
                    <td>${p.appointment_count}</td>
                    <td>${p.last_visit ? App.formatDate(p.last_visit) : 'N/A'}</td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-sm btn-ghost" onclick="PatientsModule.viewPatient(${p.id})" title="View Records">
                          <span class="material-symbols-outlined">folder_open</span>
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="MessagesModule.composeToUser(${p.id}, '${p.first_name} ${p.last_name}')" title="Message">
                          <span class="material-symbols-outlined">mail</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${data.patients.length === 0 ? '<div class="empty-state"><span class="material-symbols-outlined">group_off</span><h3>No patients found</h3></div>' : ''}
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load patients</h3><p>${err.error || ''}</p></div>`;
    }
  }

  function filterList() {
    const search = document.getElementById('patient-search').value.toLowerCase();
    document.querySelectorAll('#patients-tbody tr').forEach(row => {
      const name = row.getAttribute('data-name').toLowerCase();
      row.style.display = name.includes(search) ? '' : 'none';
    });
  }

  async function viewPatient(patientId) {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading-spinner" style="margin: 100px auto;"></div>';

    try {
      const data = await App.api(`/patients/${patientId}/records`);
      const p = data.patient;

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <button class="btn btn-outline" onclick="PatientsModule.render()" style="margin-right:8px;">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <span class="material-symbols-outlined">person</span>
            <div>
              <h1>${p.first_name} ${p.last_name}</h1>
              <p>Patient Records</p>
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary" onclick="AppointmentsModule.showBookingModal()">
              <span class="material-symbols-outlined">event</span> Schedule
            </button>
            <button class="btn btn-outline" onclick="MessagesModule.composeToUser(${p.id}, '${p.first_name} ${p.last_name}')">
              <span class="material-symbols-outlined">mail</span> Message
            </button>
          </div>
        </div>

        <!-- Patient Info Card -->
        <div class="card mb-4">
          <div class="card-header"><h3>Patient Information</h3></div>
          <div class="card-body">
            <div class="profile-details-grid">
              <div class="profile-field"><label>Full Name</label><span class="value">${p.first_name} ${p.last_name}</span></div>
              <div class="profile-field"><label>Email</label><span class="value">${p.email}</span></div>
              <div class="profile-field"><label>Phone</label><span class="value">${p.phone || 'Not provided'}</span></div>
              <div class="profile-field"><label>Date of Birth</label><span class="value">${App.formatDate(p.date_of_birth)}</span></div>
              <div class="profile-field"><label>Gender</label><span class="value">${p.gender || 'Not specified'}</span></div>
              <div class="profile-field"><label>Insurance ID</label><span class="value">${p.insurance_id || 'Not provided'}</span></div>
              <div class="profile-field"><label>Emergency Contact</label><span class="value">${p.emergency_contact || 'Not provided'}</span></div>
              <div class="profile-field"><label>Emergency Phone</label><span class="value">${p.emergency_phone || 'Not provided'}</span></div>
            </div>
          </div>
        </div>

        <div class="tabs" id="patient-tabs">
          <button class="tab active" onclick="PatientsModule.showTab('appointments')">Appointments (${data.appointments.length})</button>
          <button class="tab" onclick="PatientsModule.showTab('prescriptions')">Prescriptions (${data.prescriptions.length})</button>
          <button class="tab" onclick="PatientsModule.showTab('labs')">Lab Results (${data.labResults.length})</button>
          <button class="tab" onclick="PatientsModule.showTab('billing')">Billing (${data.billing.length})</button>
        </div>

        <div id="patient-tab-content">
          <!-- Appointments tab (default) -->
          <div class="card" id="tab-appointments">
            <div class="table-container">
              <table>
                <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  ${data.appointments.map(a => `
                    <tr>
                      <td>${App.formatDate(a.date)}</td>
                      <td>${App.formatTime(a.time)}</td>
                      <td>${a.type}</td>
                      <td>${App.getStatusBadge(a.status)}</td>
                      <td>${a.notes || a.reason || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="card hidden" id="tab-prescriptions">
            <div class="table-container">
              <table>
                <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Started</th><th>Status</th><th>Refills</th></tr></thead>
                <tbody>
                  ${data.prescriptions.map(rx => `
                    <tr>
                      <td><strong>${rx.medication}</strong></td>
                      <td>${rx.dosage}</td>
                      <td>${rx.frequency}</td>
                      <td>${App.formatDate(rx.start_date)}</td>
                      <td>${App.getStatusBadge(rx.status)}</td>
                      <td>${rx.refills_remaining}/${rx.refills_total}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="hidden" id="tab-labs">
            ${data.labResults.map(lab => `
              <div class="lab-result-card ${lab.status}">
                <div class="lab-result-header">
                  <span class="lab-result-name">${lab.test_name}</span>
                  ${App.getStatusBadge(lab.status)}
                </div>
                <div class="lab-result-values">
                  <div><span class="field-label">Result</span><div class="field-value">${lab.result_value}</div></div>
                  <div><span class="field-label">Reference</span><div class="field-value">${lab.reference_range || 'N/A'}</div></div>
                  <div><span class="field-label">Date</span><div class="field-value">${App.formatDate(lab.test_date)}</div></div>
                </div>
                ${lab.notes ? `<p class="text-xs text-muted mt-2">${lab.notes}</p>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="card hidden" id="tab-billing">
            <div class="table-container">
              <table>
                <thead><tr><th>Invoice</th><th>Description</th><th>Total</th><th>Insurance</th><th>Patient Owes</th><th>Status</th></tr></thead>
                <tbody>
                  ${data.billing.map(b => `
                    <tr>
                      <td>${b.invoice_number}</td>
                      <td>${b.description}</td>
                      <td>${App.formatCurrency(b.amount)}</td>
                      <td>${App.formatCurrency(b.insurance_covered)}</td>
                      <td>${App.formatCurrency(b.patient_responsibility)}</td>
                      <td>${App.getStatusBadge(b.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load patient records</h3><p>${err.error || ''}</p></div>`;
    }
  }

  function showTab(tab) {
    document.querySelectorAll('#patient-tabs .tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    document.querySelectorAll('#patient-tab-content > div').forEach(d => d.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
  }

  return { render, filterList, viewPatient, showTab };
})();
