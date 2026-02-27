/**
 * labresults.js - Lab Results Viewer Module
 *
 * Displays lab results with color-coded status,
 * filtering by category, and detail views.
 */

const LabResultsModule = (() => {
  let currentFilter = 'all';

  async function render() {
    const content = document.getElementById('page-content');
    const user = App.getCurrentUser();

    try {
      const patientId = user.role === 'patient' ? user.id : null;

      if (user.role !== 'patient') {
        content.innerHTML = `
          <div class="page-header">
            <div class="page-title">
              <span class="material-symbols-outlined">biotech</span>
              <div><h1>Lab Results</h1><p>View lab results from patient records</p></div>
            </div>
          </div>
          <div class="empty-state">
            <span class="material-symbols-outlined">biotech</span>
            <h3>Select a patient to view lab results</h3>
            <button class="btn btn-primary" onclick="App.navigate('patients')">View Patients</button>
          </div>
        `;
        return;
      }

      const data = await App.api(`/patients/${user.id}/lab-results`);
      const results = data.labResults;

      // Get unique categories
      const categories = [...new Set(results.map(r => r.category))];

      content.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <span class="material-symbols-outlined">biotech</span>
            <div>
              <h1>Lab Results</h1>
              <p>${results.length} test results</p>
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green"><span class="material-symbols-outlined">check_circle</span></div>
            <div class="stat-info">
              <h4>Normal</h4>
              <div class="stat-value">${results.filter(r => r.status === 'normal').length}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow"><span class="material-symbols-outlined">warning</span></div>
            <div class="stat-info">
              <h4>Abnormal</h4>
              <div class="stat-value">${results.filter(r => r.status === 'abnormal').length}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red"><span class="material-symbols-outlined">error</span></div>
            <div class="stat-info">
              <h4>Critical</h4>
              <div class="stat-value">${results.filter(r => r.status === 'critical').length}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon teal"><span class="material-symbols-outlined">pending</span></div>
            <div class="stat-info">
              <h4>Pending</h4>
              <div class="stat-value">${results.filter(r => r.status === 'pending').length}</div>
            </div>
          </div>
        </div>

        <div class="filters-bar">
          <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" onclick="LabResultsModule.filter('all')">All</button>
          ${categories.map(cat => `
            <button class="filter-chip ${currentFilter === cat ? 'active' : ''}" onclick="LabResultsModule.filter('${cat}')">${cat}</button>
          `).join('')}
        </div>

        <div id="lab-results-list">
          ${renderResults(results)}
        </div>

        ${results.length === 0 ? '<div class="empty-state"><span class="material-symbols-outlined">biotech</span><h3>No lab results yet</h3></div>' : ''}
      `;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>Failed to load lab results</h3><p>${err.error || ''}</p></div>`;
    }
  }

  function renderResults(results) {
    const filtered = currentFilter === 'all'
      ? results
      : results.filter(r => r.category === currentFilter);

    return filtered.map(lab => `
      <div class="lab-result-card ${lab.status}" onclick="LabResultsModule.viewDetail(${lab.id}, '${lab.test_name.replace(/'/g, "\\'")}', '${lab.category}', '${lab.result_value.replace(/'/g, "\\'")}', '${(lab.reference_range || '').replace(/'/g, "\\'")}', '${lab.unit || ''}', '${lab.status}', '${(lab.notes || '').replace(/'/g, "\\'")}', '${lab.test_date}', '${lab.result_date || ''}', '${lab.doctor_first} ${lab.doctor_last}')">
        <div class="lab-result-header">
          <div>
            <span class="lab-result-name">${lab.test_name}</span>
            <span class="text-xs text-muted" style="margin-left:8px;">${lab.category}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${App.getStatusBadge(lab.status)}
            <span class="text-xs text-muted">${App.formatDate(lab.test_date)}</span>
          </div>
        </div>
        <div class="lab-result-values">
          <div>
            <span class="field-label">Result</span>
            <div class="field-value">${lab.result_value}</div>
          </div>
          <div>
            <span class="field-label">Reference Range</span>
            <div class="field-value">${lab.reference_range || 'N/A'}</div>
          </div>
          <div>
            <span class="field-label">Ordered By</span>
            <div class="field-value">Dr. ${lab.doctor_first} ${lab.doctor_last}</div>
          </div>
        </div>
        ${lab.notes ? `<p class="text-xs text-muted mt-2"><strong>Note:</strong> ${lab.notes}</p>` : ''}
      </div>
    `).join('');
  }

  function filter(category) {
    currentFilter = category;
    render();
  }

  function viewDetail(id, testName, category, resultValue, referenceRange, unit, status, notes, testDate, resultDate, doctor) {
    App.showModal(testName, `
      <div class="profile-details-grid">
        <div class="profile-field"><label>Test Name</label><span class="value">${testName}</span></div>
        <div class="profile-field"><label>Category</label><span class="value">${category}</span></div>
        <div class="profile-field"><label>Result</label><span class="value font-bold">${resultValue} ${unit}</span></div>
        <div class="profile-field"><label>Reference Range</label><span class="value">${referenceRange || 'N/A'} ${unit}</span></div>
        <div class="profile-field"><label>Status</label><span class="value">${App.getStatusBadge(status)}</span></div>
        <div class="profile-field"><label>Ordered By</label><span class="value">Dr. ${doctor}</span></div>
        <div class="profile-field"><label>Test Date</label><span class="value">${App.formatDate(testDate)}</span></div>
        <div class="profile-field"><label>Result Date</label><span class="value">${resultDate ? App.formatDate(resultDate) : 'Pending'}</span></div>
      </div>
      ${notes ? `<div class="mt-4"><label>Doctor's Notes</label><p class="text-sm mt-2">${notes}</p></div>` : ''}
    `);
  }

  return { render, filter, viewDetail };
})();
