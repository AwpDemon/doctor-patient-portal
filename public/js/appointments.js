/**
 * appointments.js - Appointment Scheduling Module
 *
 * Handles appointment listing, booking, cancellation,
 * and status updates with calendar view integration.
 */

const AppointmentsModule = (() => {
  let currentFilter = 'all';

  async function render() {
    const content = document.getElementById('page-content');
    const user = App.getCurrentUser();

    try {
      const data = await App.api('/appointments');
      const stats = await App.api('/appointments/stats');

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">calendar_month</span>
            <div>
              <h1>Appointments</h1>
              <p>Manage your appointments and schedule</p>
            </div>
          </div>
          ${user.role === 'patient'
            ? '<button class="btn btn-primary" onclick="AppointmentsModule.showBookingModal()"><span class="material-symbols-outlined">add</span> Book Appointment</button>'
            : ''
          }
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue"><span class="material-symbols-outlined">event</span></div>
            <div class="stat-info"><h4>Total</h4><div class="stat-value">${stats.stats.total}</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green"><span class="material-symbols-outlined">event_upcoming</span></div>
            <div class="stat-info"><h4>Upcoming</h4><div class="stat-value">${stats.stats.upcoming}</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon teal"><span class="material-symbols-outlined">check_circle</span></div>
            <div class="stat-info"><h4>Completed</h4><div class="stat-value">${stats.stats.completed}</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red"><span class="material-symbols-outlined">cancel</span></div>
            <div class="stat-info"><h4>Cancelled</h4><div class="stat-value">${stats.stats.cancelled}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>All Appointments</h3>
            <div class="filters-bar" style="margin-bottom:0;">
              <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" onclick="AppointmentsModule.filter('all')">All</button>
              <button class="filter-chip ${currentFilter === 'scheduled' ? 'active' : ''}" onclick="AppointmentsModule.filter('scheduled')">Scheduled</button>
              <button class="filter-chip ${currentFilter === 'confirmed' ? 'active' : ''}" onclick="AppointmentsModule.filter('confirmed')">Confirmed</button>
              <button class="filter-chip ${currentFilter === 'completed' ? 'active' : ''}" onclick="AppointmentsModule.filter('completed')">Completed</button>
              <button class="filter-chip ${currentFilter === 'cancelled' ? 'active' : ''}" onclick="AppointmentsModule.filter('cancelled')">Cancelled</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>${user.role === 'patient' ? 'Doctor' : 'Patient'}</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="appointments-table-body">
                ${renderAppointmentRows(data.appointments, user)}
              </tbody>
            </table>
          </div>
          ${data.appointments.length === 0 ? '<div class="empty-state"><span class="material-symbols-outlined">event_busy</span><h3>No appointments found</h3></div>' : ''}
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load appointments</h3><p>${err.error || ''}</p></div>`;
    }
  }

  function renderAppointmentRows(appointments, user) {
    const filtered = currentFilter === 'all'
      ? appointments
      : appointments.filter(a => a.status === currentFilter);

    return filtered.map(apt => `
      <tr>
        <td>
          <strong>${App.formatDate(apt.date)}</strong><br>
          <span class="text-muted text-sm">${App.formatTime(apt.time)} (${apt.duration}min)</span>
        </td>
        <td>
          ${user.role === 'patient'
            ? `Dr. ${apt.doctor_first} ${apt.doctor_last}<br><span class="text-muted text-xs">${apt.doctor_specialty || ''}</span>`
            : `${apt.patient_first} ${apt.patient_last}<br><span class="text-muted text-xs">${apt.patient_email || ''}</span>`
          }
        </td>
        <td>${apt.type}</td>
        <td>${apt.reason || '-'}</td>
        <td>${App.getStatusBadge(apt.status)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-ghost" onclick="AppointmentsModule.viewDetails(${apt.id})" title="View">
              <span class="material-symbols-outlined">visibility</span>
            </button>
            ${apt.status === 'scheduled' || apt.status === 'confirmed' ? `
              <button class="btn btn-sm btn-ghost text-danger" onclick="AppointmentsModule.cancel(${apt.id})" title="Cancel">
                <span class="material-symbols-outlined">close</span>
              </button>
            ` : ''}
            ${user.role === 'doctor' && apt.status === 'scheduled' ? `
              <button class="btn btn-sm btn-ghost text-success" onclick="AppointmentsModule.updateStatus(${apt.id}, 'confirmed')" title="Confirm">
                <span class="material-symbols-outlined">check</span>
              </button>
            ` : ''}
            ${user.role === 'doctor' && (apt.status === 'confirmed' || apt.status === 'in-progress') ? `
              <button class="btn btn-sm btn-ghost" onclick="AppointmentsModule.updateStatus(${apt.id}, 'completed')" title="Complete">
                <span class="material-symbols-outlined">done_all</span>
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
      const data = await App.api(`/appointments/${id}`);
      const apt = data.appointment;

      App.showModal('Appointment Details', `
        <div class="profile-details-grid">
          <div class="profile-field">
            <label>Date</label>
            <span class="value">${App.formatDate(apt.date)}</span>
          </div>
          <div class="profile-field">
            <label>Time</label>
            <span class="value">${App.formatTime(apt.time)} (${apt.duration} min)</span>
          </div>
          <div class="profile-field">
            <label>Doctor</label>
            <span class="value">Dr. ${apt.doctor_first} ${apt.doctor_last}</span>
          </div>
          <div class="profile-field">
            <label>Patient</label>
            <span class="value">${apt.patient_first} ${apt.patient_last}</span>
          </div>
          <div class="profile-field">
            <label>Type</label>
            <span class="value">${apt.type}</span>
          </div>
          <div class="profile-field">
            <label>Status</label>
            <span class="value">${App.getStatusBadge(apt.status)}</span>
          </div>
          <div class="profile-field">
            <label>Location</label>
            <span class="value">${apt.location || 'Main Office'}</span>
          </div>
          <div class="profile-field">
            <label>Reason</label>
            <span class="value">${apt.reason || 'Not specified'}</span>
          </div>
        </div>
        ${apt.notes ? `<div class="mt-4"><label>Notes</label><p class="text-sm mt-1">${apt.notes}</p></div>` : ''}
      `);
    } catch (err) {
      App.showToast(err.error || 'Failed to load details.', 'error');
    }
  }

  async function cancel(id) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      await App.api(`/appointments/${id}/cancel`, { method: 'PUT' });
      App.showToast('Appointment cancelled.', 'success');
      render();
    } catch (err) {
      App.showToast(err.error || 'Failed to cancel.', 'error');
    }
  }

  async function updateStatus(id, status) {
    try {
      await App.api(`/appointments/${id}`, {
        method: 'PUT',
        body: { status },
      });
      App.showToast(`Appointment ${status}.`, 'success');
      render();
    } catch (err) {
      App.showToast(err.error || 'Failed to update.', 'error');
    }
  }

  async function showBookingModal() {
    try {
      const doctors = await App.api('/doctors');

      App.showModal('Book Appointment', `
        <form id="booking-form" class="auth-form">
          <div class="form-group">
            <label for="book-doctor">Select Doctor</label>
            <select id="book-doctor" required>
              <option value="">Choose a doctor...</option>
              ${doctors.doctors.map(d => `
                <option value="${d.id}">Dr. ${d.first_name} ${d.last_name} - ${d.specialty || 'General'}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="book-date">Date</label>
              <input type="date" id="book-date" required min="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label for="book-time">Time</label>
              <select id="book-time" required>
                <option value="">Select date first</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="book-type">Appointment Type</label>
            <select id="book-type">
              <option value="checkup">General Checkup</option>
              <option value="follow-up">Follow-up Visit</option>
              <option value="consultation">Consultation</option>
              <option value="procedure">Procedure</option>
              <option value="lab-work">Lab Work</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div class="form-group">
            <label for="book-reason">Reason for Visit</label>
            <textarea id="book-reason" placeholder="Briefly describe why you need to see the doctor..." rows="3"></textarea>
          </div>
          <div id="booking-error" class="form-error hidden"></div>
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-symbols-outlined">event_available</span>
            Confirm Booking
          </button>
        </form>
      `);

      // Load available slots when doctor and date are selected
      const doctorSelect = document.getElementById('book-doctor');
      const dateInput = document.getElementById('book-date');

      async function loadSlots() {
        const doctorId = doctorSelect.value;
        const date = dateInput.value;
        const timeSelect = document.getElementById('book-time');

        if (!doctorId || !date) return;

        try {
          const data = await App.api(`/appointments/available-slots?doctor_id=${doctorId}&date=${date}`);
          timeSelect.innerHTML = data.slots.length === 0
            ? '<option value="">No available slots</option>'
            : '<option value="">Choose a time...</option>' + data.slots.map(s => `<option value="${s}">${App.formatTime(s)}</option>`).join('');
        } catch (err) {
          timeSelect.innerHTML = '<option value="">Error loading slots</option>';
        }
      }

      doctorSelect.addEventListener('change', loadSlots);
      dateInput.addEventListener('change', loadSlots);

      // Handle form submission
      document.getElementById('booking-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('booking-error');

        try {
          await App.api('/appointments', {
            method: 'POST',
            body: {
              doctor_id: parseInt(doctorSelect.value),
              date: dateInput.value,
              time: document.getElementById('book-time').value,
              type: document.getElementById('book-type').value,
              reason: document.getElementById('book-reason').value,
            },
          });

          App.closeModal();
          App.showToast('Appointment booked successfully!', 'success');
          render();
        } catch (err) {
          errorEl.textContent = err.error || 'Booking failed.';
          errorEl.classList.remove('hidden');
        }
      });
    } catch (err) {
      App.showToast('Failed to load booking form.', 'error');
    }
  }

  return { render, filter, viewDetails, cancel, updateStatus, showBookingModal };
})();
