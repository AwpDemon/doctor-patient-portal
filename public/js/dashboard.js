/**
 * dashboard.js - Dashboard Module
 *
 * Renders role-specific dashboards with stats,
 * upcoming appointments, and recent activity.
 */

const DashboardModule = (() => {
  async function render() {
    const content = document.getElementById('page-content');

    try {
      const data = await App.api('/dashboard');
      const user = App.getCurrentUser();

      if (data.role === 'doctor') {
        renderDoctorDashboard(content, data, user);
      } else if (data.role === 'patient') {
        renderPatientDashboard(content, data, user);
      } else if (data.role === 'admin') {
        renderAdminDashboard(content, data, user);
      }
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">error</span><h3>Failed to load dashboard</h3><p>${err.error || 'Please try again.'}</p></div>`;
    }
  }

  // ============================================================
  // Doctor Dashboard
  // ============================================================
  function renderDoctorDashboard(content, data, user) {
    content.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <span class="material-symbols-outlined">dashboard</span>
          <div>
            <h1>Good ${getGreeting()}, Dr. ${user.last_name}</h1>
            <p>Here's your overview for today</p>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue"><span class="material-symbols-outlined">today</span></div>
          <div class="stat-info">
            <h4>Today's Appointments</h4>
            <div class="stat-value">${data.stats.todayCount}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><span class="material-symbols-outlined">groups</span></div>
          <div class="stat-info">
            <h4>Total Patients</h4>
            <div class="stat-value">${data.stats.patients}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow"><span class="material-symbols-outlined">event_upcoming</span></div>
          <div class="stat-info">
            <h4>Upcoming</h4>
            <div class="stat-value">${data.stats.upcoming}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red"><span class="material-symbols-outlined">mail</span></div>
          <div class="stat-info">
            <h4>Unread Messages</h4>
            <div class="stat-value">${data.stats.unreadMessages}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Today's Schedule</h3>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('appointments')">View All</button>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.todayAppointments.length === 0
              ? '<div class="empty-state"><span class="material-symbols-outlined">event_available</span><h3>No appointments today</h3><p>Enjoy your free day!</p></div>'
              : data.todayAppointments.map(apt => `
                <div class="list-item">
                  <div class="list-item-icon" style="background: var(--primary-100); color: var(--primary-600);">
                    <span class="material-symbols-outlined">person</span>
                  </div>
                  <div class="list-item-content">
                    <div class="list-item-title">${apt.patient_first} ${apt.patient_last}</div>
                    <div class="list-item-subtitle">${apt.type} ${apt.reason ? '- ' + apt.reason : ''}</div>
                  </div>
                  <div class="list-item-meta">
                    ${App.formatTime(apt.time)}
                    ${App.getStatusBadge(apt.status)}
                  </div>
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Recent Patients</h3>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('patients')">View All</button>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.recentPatients.map(patient => `
              <div class="list-item" onclick="PatientsModule.viewPatient(${patient.id})">
                <div class="list-item-icon" style="background: var(--accent-100); color: var(--accent-600);">
                  <span class="material-symbols-outlined">person</span>
                </div>
                <div class="list-item-content">
                  <div class="list-item-title">${patient.first_name} ${patient.last_name}</div>
                  <div class="list-item-subtitle">${patient.email}</div>
                </div>
                <div class="list-item-meta">
                  Last visit: ${App.formatDate(patient.last_visit)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Upcoming Appointments</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.upcomingAppointments.length === 0
              ? '<div class="empty-state" style="padding:24px;"><p>No upcoming appointments</p></div>'
              : data.upcomingAppointments.map(apt => `
                <div class="list-item">
                  <div class="list-item-content">
                    <div class="list-item-title">${apt.patient_first} ${apt.patient_last}</div>
                    <div class="list-item-subtitle">${apt.type} - ${App.formatDate(apt.date)} at ${App.formatTime(apt.time)}</div>
                  </div>
                  ${App.getStatusBadge(apt.status)}
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Patient Dashboard
  // ============================================================
  function renderPatientDashboard(content, data, user) {
    content.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <span class="material-symbols-outlined">dashboard</span>
          <div>
            <h1>Welcome, ${user.first_name}</h1>
            <p>Your health dashboard</p>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue"><span class="material-symbols-outlined">event_upcoming</span></div>
          <div class="stat-info">
            <h4>Upcoming Appointments</h4>
            <div class="stat-value">${data.stats.upcoming}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><span class="material-symbols-outlined">medication</span></div>
          <div class="stat-info">
            <h4>Active Medications</h4>
            <div class="stat-value">${data.stats.activeMedications}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow"><span class="material-symbols-outlined">mail</span></div>
          <div class="stat-info">
            <h4>Unread Messages</h4>
            <div class="stat-value">${data.stats.unreadMessages}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${data.stats.outstandingBalance > 0 ? 'red' : 'green'}">
            <span class="material-symbols-outlined">payments</span>
          </div>
          <div class="stat-info">
            <h4>Outstanding Balance</h4>
            <div class="stat-value">${App.formatCurrency(data.stats.outstandingBalance)}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Upcoming Appointments</h3>
            <button class="btn btn-sm btn-primary" onclick="AppointmentsModule.showBookingModal()">
              <span class="material-symbols-outlined">add</span> Book
            </button>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.upcomingAppointments.length === 0
              ? '<div class="empty-state"><span class="material-symbols-outlined">calendar_month</span><h3>No upcoming appointments</h3><p>Schedule a visit with your doctor.</p><button class="btn btn-primary" onclick="AppointmentsModule.showBookingModal()">Book Appointment</button></div>'
              : data.upcomingAppointments.map(apt => `
                <div class="list-item">
                  <div class="list-item-icon" style="background: var(--primary-100); color: var(--primary-600);">
                    <span class="material-symbols-outlined">stethoscope</span>
                  </div>
                  <div class="list-item-content">
                    <div class="list-item-title">Dr. ${apt.doctor_first} ${apt.doctor_last}</div>
                    <div class="list-item-subtitle">${apt.doctor_specialty} - ${apt.type}</div>
                  </div>
                  <div class="list-item-meta" style="text-align:right;">
                    <div>${App.formatDate(apt.date)}</div>
                    <div>${App.formatTime(apt.time)}</div>
                  </div>
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Current Medications</h3>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('prescriptions')">View All</button>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.activeMedications.length === 0
              ? '<div class="empty-state" style="padding:24px;"><p>No active medications</p></div>'
              : data.activeMedications.map(rx => `
                <div class="list-item">
                  <div class="list-item-icon" style="background: var(--success-light); color: var(--success);">
                    <span class="material-symbols-outlined">pill</span>
                  </div>
                  <div class="list-item-content">
                    <div class="list-item-title">${rx.medication} ${rx.dosage}</div>
                    <div class="list-item-subtitle">${rx.frequency} - Dr. ${rx.doctor_last}</div>
                  </div>
                  ${rx.refills_remaining > 0 ? `<span class="text-xs text-muted">${rx.refills_remaining} refills</span>` : '<span class="text-xs text-danger">No refills</span>'}
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Recent Lab Results</h3>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('lab-results')">View All</button>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.recentLabResults.length === 0
              ? '<div class="empty-state" style="padding:24px;"><p>No lab results yet</p></div>'
              : data.recentLabResults.map(lab => `
                <div class="list-item">
                  <div class="list-item-icon" style="background: ${lab.status === 'normal' ? 'var(--success-light)' : lab.status === 'abnormal' ? 'var(--warning-light)' : 'var(--gray-200)'}; color: ${lab.status === 'normal' ? 'var(--success)' : lab.status === 'abnormal' ? 'var(--warning)' : 'var(--gray-500)'};">
                    <span class="material-symbols-outlined">biotech</span>
                  </div>
                  <div class="list-item-content">
                    <div class="list-item-title">${lab.test_name}</div>
                    <div class="list-item-subtitle">${App.formatDate(lab.test_date)} - ${lab.category}</div>
                  </div>
                  ${App.getStatusBadge(lab.status)}
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>My Doctors</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            ${data.myDoctors.map(doc => `
              <div class="list-item">
                <div class="list-item-icon" style="background: var(--primary-100); color: var(--primary-600);">
                  <span class="material-symbols-outlined">stethoscope</span>
                </div>
                <div class="list-item-content">
                  <div class="list-item-title">Dr. ${doc.first_name} ${doc.last_name}</div>
                  <div class="list-item-subtitle">${doc.specialty || 'General Practice'}</div>
                </div>
                <button class="btn btn-sm btn-ghost" onclick="MessagesModule.composeToUser(${doc.id}, 'Dr. ${doc.first_name} ${doc.last_name}')">
                  <span class="material-symbols-outlined">mail</span>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Admin Dashboard
  // ============================================================
  function renderAdminDashboard(content, data, user) {
    content.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <span class="material-symbols-outlined">admin_panel_settings</span>
          <div>
            <h1>Admin Dashboard</h1>
            <p>System overview and management</p>
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue"><span class="material-symbols-outlined">groups</span></div>
          <div class="stat-info">
            <h4>Total Users</h4>
            <div class="stat-value">${data.stats.users.total}</div>
            <div class="stat-change">${data.stats.users.doctors} doctors, ${data.stats.users.patients} patients</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><span class="material-symbols-outlined">event</span></div>
          <div class="stat-info">
            <h4>Appointments Today</h4>
            <div class="stat-value">${data.stats.appointments.todayCount}</div>
            <div class="stat-change">${data.stats.appointments.thisWeek} this week</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow"><span class="material-symbols-outlined">payments</span></div>
          <div class="stat-info">
            <h4>Revenue Collected</h4>
            <div class="stat-value">${App.formatCurrency(data.stats.revenue.collected)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red"><span class="material-symbols-outlined">warning</span></div>
          <div class="stat-info">
            <h4>Outstanding</h4>
            <div class="stat-value">${App.formatCurrency(data.stats.revenue.outstanding)}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Recent Activity</h3>
          </div>
          <div class="card-body" style="padding:0;">
            ${data.recentActivity.map(log => `
              <div class="list-item">
                <div class="list-item-icon" style="background: var(--gray-200); color: var(--gray-600);">
                  <span class="material-symbols-outlined">history</span>
                </div>
                <div class="list-item-content">
                  <div class="list-item-title">${log.action.replace(/_/g, ' ')}</div>
                  <div class="list-item-subtitle">${log.first_name ? log.first_name + ' ' + log.last_name : 'System'} ${log.details ? '- ' + log.details : ''}</div>
                </div>
                <div class="list-item-meta">${App.timeAgo(log.created_at)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>New Users</h3>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('admin')">Manage Users</button>
          </div>
          <div class="card-body" style="padding:0;">
            ${data.recentUsers.map(u => `
              <div class="list-item">
                <div class="list-item-icon" style="background: var(--primary-100); color: var(--primary-600);">
                  <span class="material-symbols-outlined">person</span>
                </div>
                <div class="list-item-content">
                  <div class="list-item-title">${u.first_name} ${u.last_name}</div>
                  <div class="list-item-subtitle">${u.email}</div>
                </div>
                <span class="status-badge status-active">${u.role}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Admin panel page
  async function renderAdmin() {
    const content = document.getElementById('page-content');
    try {
      const data = await App.api('/dashboard/admin/users');

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">admin_panel_settings</span>
            <div>
              <h1>User Management</h1>
              <p>${data.stats.total} total users</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>All Users</h3>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.users.map(u => `
                  <tr>
                    <td><strong>${u.first_name} ${u.last_name}</strong></td>
                    <td>${u.email}</td>
                    <td><span class="status-badge status-active">${u.role}</span></td>
                    <td>${u.is_active ? App.getStatusBadge('active') : App.getStatusBadge('cancelled')}</td>
                    <td>${u.last_login ? App.timeAgo(u.last_login) : 'Never'}</td>
                    <td>
                      <button class="btn btn-sm btn-outline" onclick="DashboardModule.toggleUserActive(${u.id})">
                        ${u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Access Denied</h3><p>${err.error || 'Admin access required.'}</p></div>`;
    }
  }

  async function toggleUserActive(userId) {
    try {
      await App.api(`/dashboard/admin/users/${userId}/toggle-active`, { method: 'PUT' });
      App.showToast('User status updated.', 'success');
      renderAdmin();
    } catch (err) {
      App.showToast(err.error || 'Failed to update user.', 'error');
    }
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  return { render, renderAdmin, toggleUserActive };
})();
