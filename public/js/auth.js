/**
 * auth.js - Client-side Authentication Module
 *
 * Handles login, registration, password reset,
 * 2FA verification, and password strength validation.
 */

const AuthModule = (() => {
  function init() {
    setupLoginForm();
    setupRegisterForm();
    setupForgotForm();
    setupResetForm();
    setup2FAForm();
    setupViewSwitching();
    setupPasswordStrength();
  }

  // ============================================================
  // Login
  // ============================================================
  function setupLoginForm() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('login-error');
      errorEl.classList.add('hidden');

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const data = await App.api('/auth/login', {
          method: 'POST',
          body: { email, password },
        });

        if (data.requires2FA) {
          // Show 2FA verification
          document.getElementById('login-form').classList.add('hidden');
          document.getElementById('twofa-section').classList.remove('hidden');
          document.querySelector('.auth-demo-info').classList.add('hidden');
          return;
        }

        App.showApp(data.user);
        App.showToast(`Welcome back, ${data.user.first_name}!`, 'success');
      } catch (err) {
        errorEl.textContent = err.error || 'Login failed. Please try again.';
        errorEl.classList.remove('hidden');
      }
    });
  }

  // ============================================================
  // 2FA Verification
  // ============================================================
  function setup2FAForm() {
    const form = document.getElementById('twofa-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('twofa-error');
      errorEl.classList.add('hidden');

      const token = document.getElementById('twofa-code').value;

      try {
        const data = await App.api('/auth/verify-2fa', {
          method: 'POST',
          body: { token },
        });

        App.showApp(data.user);
        App.showToast(`Welcome back, ${data.user.first_name}!`, 'success');
      } catch (err) {
        errorEl.textContent = err.error || 'Invalid verification code.';
        errorEl.classList.remove('hidden');
      }
    });
  }

  // ============================================================
  // Registration
  // ============================================================
  function setupRegisterForm() {
    const form = document.getElementById('register-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('register-error');
      errorEl.classList.add('hidden');

      const password = document.getElementById('reg-password').value;
      const confirmPassword = document.getElementById('reg-confirm-password').value;

      if (password !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.classList.remove('hidden');
        return;
      }

      const payload = {
        email: document.getElementById('reg-email').value,
        password: password,
        first_name: document.getElementById('reg-first-name').value,
        last_name: document.getElementById('reg-last-name').value,
        role: document.getElementById('reg-role').value,
        phone: document.getElementById('reg-phone').value,
      };

      try {
        const data = await App.api('/auth/register', {
          method: 'POST',
          body: payload,
        });

        App.showApp(data.user);
        App.showToast('Account created successfully! Welcome to HealthBridge.', 'success');
      } catch (err) {
        const message = err.errors
          ? err.errors.map(e => e.msg).join(' ')
          : err.error || 'Registration failed.';
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
    });
  }

  // ============================================================
  // Forgot Password
  // ============================================================
  function setupForgotForm() {
    const form = document.getElementById('forgot-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('forgot-message');

      try {
        const data = await App.api('/auth/forgot-password', {
          method: 'POST',
          body: { email: document.getElementById('forgot-email').value },
        });

        msgEl.textContent = data.message;
        msgEl.classList.remove('hidden');
        msgEl.className = 'form-message';

        // In dev mode, show the reset token section
        if (data._dev_reset_token) {
          document.getElementById('reset-section').classList.remove('hidden');
          document.getElementById('reset-token').value = data._dev_reset_token;
        }
      } catch (err) {
        msgEl.textContent = err.error || 'Request failed.';
        msgEl.className = 'form-error';
        msgEl.classList.remove('hidden');
      }
    });
  }

  // ============================================================
  // Reset Password
  // ============================================================
  function setupResetForm() {
    const form = document.getElementById('reset-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('reset-error');
      errorEl.classList.add('hidden');

      try {
        const data = await App.api('/auth/reset-password', {
          method: 'POST',
          body: {
            token: document.getElementById('reset-token').value,
            password: document.getElementById('reset-password').value,
          },
        });

        App.showToast(data.message, 'success');
        switchView('login');
      } catch (err) {
        const message = err.errors
          ? err.errors.map(e => e.msg).join(' ')
          : err.error || 'Reset failed.';
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
    });
  }

  // ============================================================
  // View Switching
  // ============================================================
  function setupViewSwitching() {
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('register');
    });

    document.getElementById('show-login-from-register').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('login');
    });

    document.getElementById('show-forgot-password').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('forgot');
    });

    document.getElementById('show-login-from-forgot').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('login');
    });
  }

  function switchView(view) {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.add('hidden');
    document.getElementById('forgot-view').classList.add('hidden');
    document.getElementById('twofa-section').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.querySelector('.auth-demo-info').classList.remove('hidden');

    // Clear errors
    document.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.form-message').forEach(el => el.classList.add('hidden'));

    document.getElementById(`${view}-view`).classList.remove('hidden');
  }

  // ============================================================
  // Password Strength Indicator
  // ============================================================
  function setupPasswordStrength() {
    const input = document.getElementById('reg-password');
    const indicator = document.getElementById('password-strength');

    input.addEventListener('input', () => {
      const value = input.value;
      let strength = 0;

      if (value.length >= 8) strength++;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) strength++;
      if (/\d/.test(value)) strength++;
      if (/[^a-zA-Z0-9]/.test(value)) strength++;

      indicator.className = 'password-strength';
      if (value.length === 0) return;

      if (strength <= 1) indicator.classList.add('weak');
      else if (strength === 2) indicator.classList.add('fair');
      else if (strength === 3) indicator.classList.add('good');
      else indicator.classList.add('strong');
    });
  }

  return { init };
})();
