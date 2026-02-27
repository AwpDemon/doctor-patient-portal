/**
 * notifications.js - Notifications Module
 *
 * Real-time notification panel, badge updates,
 * and notification management.
 */

const NotificationsModule = (() => {
  let pollingInterval = null;

  function init() {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(updateBadge, 30000);
  }

  function toggle() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      loadNotifications();
    }
  }

  async function loadNotifications() {
    try {
      const data = await App.api('/dashboard/notifications');

      // Update badge
      const badge = document.getElementById('notification-badge');
      if (data.unreadCount > 0) {
        badge.textContent = data.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }

      // Render notification list
      const list = document.getElementById('notifications-list');
      if (data.notifications.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:32px;"><span class="material-symbols-outlined">notifications_off</span><h3>No notifications</h3><p>You\'re all caught up!</p></div>';
        return;
      }

      const typeIcons = {
        appointment: 'calendar_month',
        message: 'mail',
        prescription: 'medication',
        lab_result: 'biotech',
        billing: 'receipt_long',
        refill_request: 'autorenew',
        system: 'info',
      };

      list.innerHTML = data.notifications.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="NotificationsModule.handleClick(${n.id}, '${n.link || '/dashboard'}', ${n.is_read})">
          <div class="notification-type">
            <span class="material-symbols-outlined">${typeIcons[n.type] || 'notifications'}</span>
            ${n.type.replace(/_/g, ' ')}
          </div>
          <div class="notification-title">${n.title}</div>
          <div class="notification-message">${n.message}</div>
          <div class="notification-time">${App.timeAgo(n.created_at)}</div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  async function handleClick(id, link, isRead) {
    if (!isRead) {
      try {
        await App.api(`/dashboard/notifications/${id}/read`, { method: 'PUT' });
      } catch (e) {
        // Non-critical
      }
    }

    // Navigate to the linked page
    const page = link.replace('/', '');
    if (page) {
      App.navigate(page);
    }

    // Close panel
    document.getElementById('notifications-panel').classList.add('hidden');
    loadNotifications();
  }

  async function markAllRead() {
    try {
      await App.api('/dashboard/notifications/read-all', { method: 'PUT' });
      App.showToast('All notifications marked as read.', 'success');
      loadNotifications();
    } catch (err) {
      App.showToast('Failed to update notifications.', 'error');
    }
  }

  async function updateBadge() {
    try {
      const data = await App.api('/dashboard/notifications?limit=1');
      const badge = document.getElementById('notification-badge');
      if (data.unreadCount > 0) {
        badge.textContent = data.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {
      // Silent fail for badge updates
    }
  }

  // Attach mark all read handler
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mark-all-read-btn');
    if (btn) btn.addEventListener('click', markAllRead);
  });

  return { init, toggle, loadNotifications, handleClick, markAllRead };
})();
