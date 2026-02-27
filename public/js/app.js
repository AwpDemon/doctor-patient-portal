/**
 * app.js - Core Application Logic & Client-side Router
 *
 * Manages SPA routing, page transitions, navigation,
 * authentication state, and shared utilities.
 */

const App = (() => {
  let currentUser = null;
  let currentPage = 'dashboard';

  // ============================================================
  // API Utility
  // ============================================================
  async function api(endpoint, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(`/api${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          // Session expired, redirect to login
          currentUser = null;
          showAuth();
        }
        throw { status: response.status, ...data };
      }

      return data;
    } catch (err) {
      if (err.status) throw err;
      throw { error: 'Network error. Please check your connection.' };
    }
  }

  // ============================================================
  // Toast Notifications
  // ============================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-symbols-outlined">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 300);">
        <span class="material-symbols-outlined" style="font-size:18px;">close</span>
      </button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // ============================================================
  // Modal
  // ============================================================
  function showModal(title, content, footer = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;

    // Add footer if provided
    const existingFooter = document.querySelector('.modal-footer');
    if (existingFooter) existingFooter.remove();
    if (footer) {
      const footerDiv = document.createElement('div');
      footerDiv.className = 'modal-footer';
      footerDiv.innerHTML = footer;
      document.getElementById('modal-container').appendChild(footerDiv);
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ============================================================
  // Navigation
  // ============================================================
  const navConfig = {
    patient: [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'appointments', icon: 'calendar_month', label: 'Appointments' },
      { id: 'prescriptions', icon: 'medication', label: 'Prescriptions' },
      { id: 'lab-results', icon: 'biotech', label: 'Lab Results' },
      { id: 'messages', icon: 'mail', label: 'Messages', badge: 'unread' },
      { id: 'billing', icon: 'receipt_long', label: 'Billing' },
      { divider: true },
      { id: 'profile', icon: 'person', label: 'My Profile' },
    ],
    doctor: [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'appointments', icon: 'calendar_month', label: 'Appointments' },
      { id: 'patients', icon: 'groups', label: 'My Patients' },
      { id: 'prescriptions', icon: 'medication', label: 'Prescriptions' },
      { id: 'messages', icon: 'mail', label: 'Messages', badge: 'unread' },
      { divider: true },
      { id: 'profile', icon: 'person', label: 'My Profile' },
    ],
    admin: [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'appointments', icon: 'calendar_month', label: 'Appointments' },
      { id: 'patients', icon: 'groups', label: 'Patients' },
      { id: 'prescriptions', icon: 'medication', label: 'Prescriptions' },
      { id: 'messages', icon: 'mail', label: 'Messages', badge: 'unread' },
      { id: 'billing', icon: 'receipt_long', label: 'Billing' },
      { divider: true },
      { id: 'admin', icon: 'admin_panel_settings', label: 'Admin Panel' },
      { id: 'profile', icon: 'person', label: 'My Profile' },
    ],
  };

  function buildNavigation() {
    const menu = document.getElementById('nav-menu');
    const items = navConfig[currentUser.role] || navConfig.patient;
    menu.innerHTML = '';

    items.forEach(item => {
      if (item.divider) {
        menu.innerHTML += '<li class="nav-divider"></li>';
        return;
      }

      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <a class="nav-link ${item.id === currentPage ? 'active' : ''}" data-page="${item.id}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span class="nav-text">${item.label}</span>
          ${item.badge ? `<span class="badge hidden" id="nav-badge-${item.id}">0</span>` : ''}
        </a>
      `;
      li.querySelector('.nav-link').addEventListener('click', () => navigate(item.id));
      menu.appendChild(li);
    });

    // Update user info in sidebar
    document.getElementById('sidebar-name').textContent =
      `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('sidebar-role').textContent = currentUser.role;
  }

  function navigate(page) {
    currentPage = page;

    // Update active nav
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('mobile-open');

    // Load page content
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading-spinner" style="margin: 100px auto;"></div>';

    switch (page) {
      case 'dashboard':
        DashboardModule.render();
        break;
      case 'appointments':
        AppointmentsModule.render();
        break;
      case 'messages':
        MessagesModule.render();
        break;
      case 'patients':
        PatientsModule.render();
        break;
      case 'prescriptions':
        PrescriptionsModule.render();
        break;
      case 'billing':
        BillingModule.render();
        break;
      case 'lab-results':
        LabResultsModule.render();
        break;
      case 'profile':
        ProfileModule.render();
        break;
      case 'admin':
        DashboardModule.renderAdmin();
        break;
      default:
        content.innerHTML = `
          <div class="empty-state">
            <span class="material-symbols-outlined">search_off</span>
            <h3>Page Not Found</h3>
            <p>The page you're looking for doesn't exist.</p>
            <button class="btn btn-primary" onclick="App.navigate('dashboard')">Go to Dashboard</button>
          </div>
        `;
    }

    // Update unread counts
    updateBadges();
  }

  async function updateBadges() {
    try {
      const data = await api('/messages/unread-count');
      const badge = document.getElementById('nav-badge-messages');
      if (badge) {
        if (data.count > 0) {
          badge.textContent = data.count;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch (e) {
      // Silently fail for badge updates
    }
  }

  // ============================================================
  // Authentication State
  // ============================================================
  function showAuth() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    AuthModule.init();
  }

  function showApp(user) {
    currentUser = user;
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    buildNavigation();
    navigate('dashboard');
    NotificationsModule.init();
  }

  async function checkSession() {
    try {
      const data = await api('/auth/session');
      if (data.authenticated && data.twoFactorVerified) {
        showApp(data.user);
      } else {
        showAuth();
      }
    } catch {
      showAuth();
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================
  function initEventHandlers() {
    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // Mobile menu
    document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
        currentUser = null;
        showAuth();
        showToast('Logged out successfully.', 'success');
      } catch (err) {
        showToast('Logout failed.', 'error');
      }
    });

    // Profile button
    document.getElementById('profile-btn').addEventListener('click', () => {
      navigate('profile');
    });

    // Notifications button
    document.getElementById('notifications-btn').addEventListener('click', () => {
      NotificationsModule.toggle();
    });

    // Global search
    SearchModule.init();

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.getElementById('notifications-panel').classList.add('hidden');
        document.getElementById('search-results-dropdown').classList.add('hidden');
      }
    });

    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar')) {
        document.getElementById('search-results-dropdown').classList.add('hidden');
      }
      if (!e.target.closest('.notifications-panel') && !e.target.closest('#notifications-btn')) {
        document.getElementById('notifications-panel').classList.add('hidden');
      }
    });
  }

  // ============================================================
  // Utility functions
  // ============================================================
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return 'N/A';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${ampm}`;
  }

  function formatDateTime(datetimeStr) {
    if (!datetimeStr) return 'N/A';
    const d = new Date(datetimeStr);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(dateStr.split('T')[0]);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  function getStatusBadge(status) {
    const label = status.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<span class="status-badge status-${status}">${label}</span>`;
  }

  function getInitials(firstName, lastName) {
    return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase();
  }

  // ============================================================
  // Initialize
  // ============================================================
  function init() {
    initEventHandlers();
    checkSession();

    // Hide loading screen after a brief moment
    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('fade-out');
      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
      }, 500);
    }, 800);
  }

  // Start on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  // Public API
  return {
    api,
    showToast,
    showModal,
    closeModal,
    navigate,
    showApp,
    showAuth,
    getCurrentUser: () => currentUser,
    formatDate,
    formatTime,
    formatDateTime,
    timeAgo,
    formatCurrency,
    getStatusBadge,
    getInitials,
    updateBadges,
  };
})();
