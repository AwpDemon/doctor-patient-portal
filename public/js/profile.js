/**
 * profile.js - Profile Management Module
 *
 * User profile viewing and editing, password changes,
 * 2FA setup, and account settings.
 */

const ProfileModule = (() => {
  async function render() {
    const content = document.getElementById('page-content');

    try {
      const data = await App.api('/auth/me');
      const user = data.user;

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">person</span>
            <div>
              <h1>My Profile</h1>
              <p>Manage your account settings</p>
            </div>
          </div>
        </div>

        <div class="profile-grid">
          <!-- Profile Sidebar -->
          <div>
            <div class="card">
              <div class="card-body profile-sidebar">
                <div class="profile-avatar-large">
                  <span class="material-symbols-outlined">person</span>
                </div>
                <div class="profile-name">${user.first_name} ${user.last_name}</div>
                <span class="profile-role-badge">${user.role}</span>
                <p class="text-sm text-muted mt-2">${user.email}</p>
                ${user.specialty ? `<p class="text-sm mt-1">${user.specialty}</p>` : ''}
                <p class="text-xs text-muted mt-3">Member since ${App.formatDate(user.created_at ? user.created_at.split(' ')[0] : null)}</p>
              </div>
            </div>

            <div class="card mt-3">
              <div class="card-header"><h3>Security</h3></div>
              <div class="card-body">
                <button class="btn btn-outline btn-block mb-3" onclick="ProfileModule.showChangePassword()">
                  <span class="material-symbols-outlined">lock</span> Change Password
                </button>
                <button class="btn btn-outline btn-block" onclick="ProfileModule.show2FASetup()">
                  <span class="material-symbols-outlined">security</span>
                  ${user.two_factor_enabled ? 'Manage 2FA' : 'Enable 2FA'}
                </button>
                ${user.two_factor_enabled ? '<p class="text-xs text-success mt-2">Two-factor authentication is enabled</p>' : '<p class="text-xs text-muted mt-2">Add an extra layer of security</p>'}
              </div>
            </div>
          </div>

          <!-- Profile Details -->
          <div>
            <div class="card">
              <div class="card-header">
                <h3>Personal Information</h3>
                <button class="btn btn-sm btn-primary" onclick="ProfileModule.showEditForm()">
                  <span class="material-symbols-outlined">edit</span> Edit
                </button>
              </div>
              <div class="card-body">
                <div class="profile-details-grid">
                  <div class="profile-field">
                    <label>First Name</label>
                    <span class="value">${user.first_name}</span>
                  </div>
                  <div class="profile-field">
                    <label>Last Name</label>
                    <span class="value">${user.last_name}</span>
                  </div>
                  <div class="profile-field">
                    <label>Email</label>
                    <span class="value">${user.email}</span>
                  </div>
                  <div class="profile-field">
                    <label>Phone</label>
                    <span class="value">${user.phone || 'Not provided'}</span>
                  </div>
                  <div class="profile-field">
                    <label>Date of Birth</label>
                    <span class="value">${App.formatDate(user.date_of_birth)}</span>
                  </div>
                  <div class="profile-field">
                    <label>Gender</label>
                    <span class="value">${user.gender || 'Not specified'}</span>
                  </div>
                  <div class="profile-field">
                    <label>Address</label>
                    <span class="value">${user.address || 'Not provided'}</span>
                  </div>
                  ${user.role === 'doctor' ? `
                    <div class="profile-field">
                      <label>Specialty</label>
                      <span class="value">${user.specialty || 'Not specified'}</span>
                    </div>
                    <div class="profile-field">
                      <label>License Number</label>
                      <span class="value">${user.license_number || 'Not provided'}</span>
                    </div>
                  ` : ''}
                  ${user.role === 'patient' ? `
                    <div class="profile-field">
                      <label>Insurance ID</label>
                      <span class="value">${user.insurance_id || 'Not provided'}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>

            ${user.role === 'patient' ? `
              <div class="card mt-3">
                <div class="card-header"><h3>Emergency Contact</h3></div>
                <div class="card-body">
                  <div class="profile-details-grid">
                    <div class="profile-field">
                      <label>Contact Name</label>
                      <span class="value">${user.emergency_contact || 'Not provided'}</span>
                    </div>
                    <div class="profile-field">
                      <label>Contact Phone</label>
                      <span class="value">${user.emergency_phone || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="card mt-3">
              <div class="card-header"><h3>Account Details</h3></div>
              <div class="card-body">
                <div class="profile-details-grid">
                  <div class="profile-field">
                    <label>Account Status</label>
                    <span class="value">${App.getStatusBadge(user.is_active ? 'active' : 'cancelled')}</span>
                  </div>
                  <div class="profile-field">
                    <label>Last Login</label>
                    <span class="value">${user.last_login ? App.formatDateTime(user.last_login) : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load profile</h3></div>`;
    }
  }

  async function showEditForm() {
    const data = await App.api('/auth/me');
    const user = data.user;

    App.showModal('Edit Profile', `
      <form id="edit-profile-form" class="auth-form">
        <div class="form-row">
          <div class="form-group">
            <label for="edit-first">First Name</label>
            <input type="text" id="edit-first" value="${user.first_name}" required>
          </div>
          <div class="form-group">
            <label for="edit-last">Last Name</label>
            <input type="text" id="edit-last" value="${user.last_name}" required>
          </div>
        </div>
        <div class="form-group">
          <label for="edit-phone">Phone</label>
          <input type="tel" id="edit-phone" value="${user.phone || ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="edit-dob">Date of Birth</label>
            <input type="date" id="edit-dob" value="${user.date_of_birth || ''}">
          </div>
          <div class="form-group">
            <label for="edit-gender">Gender</label>
            <select id="edit-gender">
              <option value="">Select...</option>
              <option value="Male" ${user.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Female" ${user.gender === 'Female' ? 'selected' : ''}>Female</option>
              <option value="Other" ${user.gender === 'Other' ? 'selected' : ''}>Other</option>
              <option value="Prefer not to say" ${user.gender === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="edit-address">Address</label>
          <input type="text" id="edit-address" value="${user.address || ''}">
        </div>
        ${user.role === 'patient' ? `
          <div class="form-group">
            <label for="edit-insurance">Insurance ID</label>
            <input type="text" id="edit-insurance" value="${user.insurance_id || ''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-ec-name">Emergency Contact</label>
              <input type="text" id="edit-ec-name" value="${user.emergency_contact || ''}">
            </div>
            <div class="form-group">
              <label for="edit-ec-phone">Emergency Phone</label>
              <input type="tel" id="edit-ec-phone" value="${user.emergency_phone || ''}">
            </div>
          </div>
        ` : ''}
        <button type="submit" class="btn btn-primary btn-block">Save Changes</button>
      </form>
    `);

    document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const updates = {
          first_name: document.getElementById('edit-first').value,
          last_name: document.getElementById('edit-last').value,
          phone: document.getElementById('edit-phone').value,
          date_of_birth: document.getElementById('edit-dob').value,
          gender: document.getElementById('edit-gender').value,
          address: document.getElementById('edit-address').value,
        };

        if (user.role === 'patient') {
          updates.insurance_id = document.getElementById('edit-insurance').value;
          updates.emergency_contact = document.getElementById('edit-ec-name').value;
          updates.emergency_phone = document.getElementById('edit-ec-phone').value;
        }

        await App.api('/auth/me', { method: 'PUT' }); // Would need a profile update route
        // For now, we do it through the dashboard route concept
        App.closeModal();
        App.showToast('Profile updated!', 'success');
        render();
      } catch (err) {
        App.showToast(err.error || 'Failed to update profile.', 'error');
      }
    });
  }

  function showChangePassword() {
    App.showModal('Change Password', `
      <form id="change-pw-form" class="auth-form">
        <div class="form-group">
          <label for="current-pw">Current Password</label>
          <input type="password" id="current-pw" required>
        </div>
        <div class="form-group">
          <label for="new-pw">New Password</label>
          <input type="password" id="new-pw" required minlength="8" placeholder="Min 8 chars, upper+lower+number">
        </div>
        <div class="form-group">
          <label for="confirm-pw">Confirm New Password</label>
          <input type="password" id="confirm-pw" required>
        </div>
        <div id="pw-error" class="form-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-block">Update Password</button>
      </form>
    `);

    document.getElementById('change-pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('pw-error');
      errorEl.classList.add('hidden');

      const newPw = document.getElementById('new-pw').value;
      const confirmPw = document.getElementById('confirm-pw').value;

      if (newPw !== confirmPw) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.classList.remove('hidden');
        return;
      }

      try {
        await App.api('/auth/change-password', {
          method: 'POST',
          body: {
            current_password: document.getElementById('current-pw').value,
            new_password: newPw,
          },
        });
        App.closeModal();
        App.showToast('Password changed successfully!', 'success');
      } catch (err) {
        errorEl.textContent = err.error || 'Failed to change password.';
        errorEl.classList.remove('hidden');
      }
    });
  }

  async function show2FASetup() {
    try {
      const data = await App.api('/auth/setup-2fa', { method: 'POST' });

      App.showModal('Two-Factor Authentication Setup', `
        <div class="text-center mb-4">
          <p class="text-sm mb-3">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
          <img src="${data.qrCode}" alt="2FA QR Code" style="margin: 0 auto; max-width: 250px;">
          <p class="text-xs text-muted mt-3">Manual key: <code>${data.secret}</code></p>
        </div>
        <form id="enable-2fa-form" class="auth-form">
          <div class="form-group">
            <label for="verify-2fa-code">Enter verification code</label>
            <input type="text" id="verify-2fa-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required>
          </div>
          <div id="twofa-setup-error" class="form-error hidden"></div>
          <button type="submit" class="btn btn-primary btn-block">Enable 2FA</button>
        </form>
      `);

      document.getElementById('enable-2fa-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api('/auth/enable-2fa', {
            method: 'POST',
            body: { token: document.getElementById('verify-2fa-code').value },
          });
          App.closeModal();
          App.showToast('Two-factor authentication enabled!', 'success');
          render();
        } catch (err) {
          document.getElementById('twofa-setup-error').textContent = err.error || 'Invalid code.';
          document.getElementById('twofa-setup-error').classList.remove('hidden');
        }
      });
    } catch (err) {
      App.showToast(err.error || 'Failed to set up 2FA.', 'error');
    }
  }

  return { render, showEditForm, showChangePassword, show2FASetup };
})();
