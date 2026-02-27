/**
 * messages.js - Secure Messaging Module
 *
 * Inbox/sent views, compose functionality,
 * message threads, and read status tracking.
 */

const MessagesModule = (() => {
  let currentTab = 'inbox';

  async function render() {
    const content = document.getElementById('page-content');

    try {
      const inbox = await App.api('/messages/inbox');
      const sent = await App.api('/messages/sent');
      const unread = await App.api('/messages/unread-count');

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">mail</span>
            <div>
              <h1>Messages</h1>
              <p>${unread.count} unread messages</p>
            </div>
          </div>
          <button class="btn btn-primary" onclick="MessagesModule.showCompose()">
            <span class="material-symbols-outlined">edit</span> Compose
          </button>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="tabs" style="border:none; margin:0;">
              <button class="tab ${currentTab === 'inbox' ? 'active' : ''}" onclick="MessagesModule.switchTab('inbox')">
                Inbox ${unread.count > 0 ? `<span class="badge" style="position:static;margin-left:6px;">${unread.count}</span>` : ''}
              </button>
              <button class="tab ${currentTab === 'sent' ? 'active' : ''}" onclick="MessagesModule.switchTab('sent')">Sent</button>
            </div>
            ${currentTab === 'inbox' ? '<button class="btn btn-sm btn-outline" onclick="MessagesModule.markAllRead()">Mark All Read</button>' : ''}
          </div>
          <div id="messages-list" style="padding:0;">
            ${currentTab === 'inbox' ? renderInbox(inbox.messages) : renderSent(sent.messages)}
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load messages</h3><p>${err.error || ''}</p></div>`;
    }
  }

  function renderInbox(messages) {
    if (messages.length === 0) {
      return '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><h3>Inbox is empty</h3><p>No messages yet.</p></div>';
    }

    return messages.map(msg => `
      <div class="list-item ${msg.is_read ? '' : 'unread'} ${msg.is_urgent ? 'urgent' : ''}" onclick="MessagesModule.viewMessage(${msg.id})">
        <div class="list-item-icon" style="background: ${msg.is_urgent ? 'var(--danger-light)' : 'var(--primary-100)'}; color: ${msg.is_urgent ? 'var(--danger)' : 'var(--primary-600)'};">
          <span class="material-symbols-outlined">${msg.is_urgent ? 'priority_high' : 'person'}</span>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">
            ${msg.sender_role === 'doctor' ? 'Dr. ' : ''}${msg.sender_first} ${msg.sender_last}
            ${msg.is_urgent ? ' <span class="text-danger text-xs font-bold">URGENT</span>' : ''}
          </div>
          <div class="list-item-subtitle"><strong>${msg.subject}</strong> - ${msg.body.substring(0, 80)}...</div>
        </div>
        <div class="list-item-meta">${App.timeAgo(msg.created_at)}</div>
      </div>
    `).join('');
  }

  function renderSent(messages) {
    if (messages.length === 0) {
      return '<div class="empty-state"><span class="material-symbols-outlined">send</span><h3>No sent messages</h3></div>';
    }

    return messages.map(msg => `
      <div class="list-item" onclick="MessagesModule.viewMessage(${msg.id})">
        <div class="list-item-icon" style="background: var(--gray-200); color: var(--gray-600);">
          <span class="material-symbols-outlined">send</span>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">
            To: ${msg.recipient_role === 'doctor' ? 'Dr. ' : ''}${msg.recipient_first} ${msg.recipient_last}
          </div>
          <div class="list-item-subtitle"><strong>${msg.subject}</strong> - ${msg.body.substring(0, 80)}...</div>
        </div>
        <div class="list-item-meta">${App.timeAgo(msg.created_at)}</div>
      </div>
    `).join('');
  }

  function switchTab(tab) {
    currentTab = tab;
    render();
  }

  async function viewMessage(id) {
    try {
      const data = await App.api(`/messages/${id}`);
      const msg = data.message;
      const user = App.getCurrentUser();

      // Load thread if exists
      const thread = await App.api(`/messages/${id}/thread`);

      let threadHTML = '';
      if (thread.messages.length > 1) {
        threadHTML = '<h4 class="mt-4 mb-3">Conversation</h4>' + thread.messages.map(m => `
          <div class="message-bubble ${m.sender_id === user.id ? 'sent' : 'received'}">
            <div style="font-weight:500; margin-bottom:4px;">
              ${m.sender_role === 'doctor' ? 'Dr. ' : ''}${m.sender_first} ${m.sender_last}
            </div>
            ${m.body}
            <div class="bubble-meta">${App.timeAgo(m.created_at)}</div>
          </div>
        `).join('');
      }

      const isSent = msg.sender_id === user.id;
      const otherName = isSent
        ? `${msg.recipient_role === 'doctor' ? 'Dr. ' : ''}${msg.recipient_first} ${msg.recipient_last}`
        : `${msg.sender_role === 'doctor' ? 'Dr. ' : ''}${msg.sender_first} ${msg.sender_last}`;
      const otherId = isSent ? msg.recipient_id : msg.sender_id;

      App.showModal(msg.subject, `
        <div class="flex-between mb-3">
          <div>
            <span class="text-sm text-muted">${isSent ? 'To' : 'From'}: <strong>${otherName}</strong></span>
          </div>
          <span class="text-xs text-muted">${App.formatDateTime(msg.created_at)}</span>
        </div>
        ${msg.is_urgent ? '<div class="form-error" style="margin-bottom:12px;">This message is marked as URGENT</div>' : ''}
        <div style="white-space: pre-wrap; line-height: 1.7; font-size: 0.9rem;">${msg.body}</div>
        ${threadHTML}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--gray-200);">
        <button class="btn btn-primary" onclick="MessagesModule.composeReply(${msg.id}, ${otherId}, '${otherName.replace(/'/g, "\\'")}', '${msg.subject.replace(/'/g, "\\'")}')">
          <span class="material-symbols-outlined">reply</span> Reply
        </button>
        <button class="btn btn-outline btn-danger" onclick="MessagesModule.deleteMessage(${msg.id})" style="margin-left:8px;">
          <span class="material-symbols-outlined">delete</span> Delete
        </button>
      `);

      App.updateBadges();
    } catch (err) {
      App.showToast(err.error || 'Failed to load message.', 'error');
    }
  }

  async function showCompose() {
    try {
      const contacts = await App.api('/messages/contacts');

      App.showModal('New Message', `
        <form id="compose-form" class="auth-form">
          <div class="form-group">
            <label for="msg-recipient">To</label>
            <select id="msg-recipient" required>
              <option value="">Select recipient...</option>
              ${contacts.contacts.map(c => `
                <option value="${c.id}">${c.role === 'doctor' ? 'Dr. ' : ''}${c.first_name} ${c.last_name} (${c.specialty || c.role})</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="msg-subject">Subject</label>
            <input type="text" id="msg-subject" placeholder="Message subject" required>
          </div>
          <div class="form-group">
            <label for="msg-body">Message</label>
            <textarea id="msg-body" rows="6" placeholder="Type your message..." required></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="msg-urgent"> Mark as urgent
            </label>
          </div>
          <div id="compose-error" class="form-error hidden"></div>
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-symbols-outlined">send</span> Send Message
          </button>
        </form>
      `);

      document.getElementById('compose-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api('/messages', {
            method: 'POST',
            body: {
              recipient_id: parseInt(document.getElementById('msg-recipient').value),
              subject: document.getElementById('msg-subject').value,
              body: document.getElementById('msg-body').value,
              is_urgent: document.getElementById('msg-urgent').checked,
            },
          });
          App.closeModal();
          App.showToast('Message sent!', 'success');
          render();
        } catch (err) {
          document.getElementById('compose-error').textContent = err.error || 'Failed to send.';
          document.getElementById('compose-error').classList.remove('hidden');
        }
      });
    } catch (err) {
      App.showToast('Failed to load contacts.', 'error');
    }
  }

  function composeToUser(userId, name) {
    showCompose().then(() => {
      setTimeout(() => {
        const select = document.getElementById('msg-recipient');
        if (select) select.value = userId.toString();
      }, 200);
    });
  }

  function composeReply(parentId, recipientId, recipientName, subject) {
    App.closeModal();
    setTimeout(async () => {
      const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

      App.showModal(`Reply to ${recipientName}`, `
        <form id="reply-form" class="auth-form">
          <div class="form-group">
            <label>To: <strong>${recipientName}</strong></label>
          </div>
          <div class="form-group">
            <label for="reply-subject">Subject</label>
            <input type="text" id="reply-subject" value="${reSubject}" required>
          </div>
          <div class="form-group">
            <label for="reply-body">Message</label>
            <textarea id="reply-body" rows="6" placeholder="Type your reply..." required></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <span class="material-symbols-outlined">send</span> Send Reply
          </button>
        </form>
      `);

      document.getElementById('reply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await App.api('/messages', {
            method: 'POST',
            body: {
              recipient_id: recipientId,
              subject: document.getElementById('reply-subject').value,
              body: document.getElementById('reply-body').value,
              parent_id: parentId,
            },
          });
          App.closeModal();
          App.showToast('Reply sent!', 'success');
          render();
        } catch (err) {
          App.showToast(err.error || 'Failed to send reply.', 'error');
        }
      });
    }, 300);
  }

  async function deleteMessage(id) {
    if (!confirm('Delete this message?')) return;
    try {
      await App.api(`/messages/${id}`, { method: 'DELETE' });
      App.closeModal();
      App.showToast('Message deleted.', 'success');
      render();
    } catch (err) {
      App.showToast(err.error || 'Failed to delete.', 'error');
    }
  }

  async function markAllRead() {
    try {
      await App.api('/messages/mark-all-read', { method: 'PUT' });
      App.showToast('All messages marked as read.', 'success');
      App.updateBadges();
      render();
    } catch (err) {
      App.showToast(err.error || 'Failed.', 'error');
    }
  }

  return { render, switchTab, viewMessage, showCompose, composeToUser, composeReply, deleteMessage, markAllRead };
})();
