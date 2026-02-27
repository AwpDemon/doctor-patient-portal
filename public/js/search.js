/**
 * search.js - Global Search Module
 *
 * Provides real-time search across patients, doctors,
 * appointments, and prescriptions with keyboard navigation.
 */

const SearchModule = (() => {
  let searchTimeout = null;

  function init() {
    const input = document.getElementById('global-search');
    const dropdown = document.getElementById('search-results-dropdown');

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      if (query.length < 2) {
        dropdown.classList.add('hidden');
        return;
      }

      // Debounce search
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(query), 300);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) {
        dropdown.classList.remove('hidden');
      }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        input.blur();
      }
    });
  }

  async function performSearch(query) {
    const dropdown = document.getElementById('search-results-dropdown');

    try {
      const data = await App.api(`/dashboard/search?q=${encodeURIComponent(query)}`);
      const results = data.results;

      let html = '';
      let hasResults = false;

      // Patients
      if (results.patients && results.patients.length > 0) {
        hasResults = true;
        html += '<div class="search-category">Patients</div>';
        html += results.patients.map(p => `
          <div class="search-item" onclick="SearchModule.goTo('patients', ${p.id})">
            <span class="material-symbols-outlined">person</span>
            <div class="search-item-text">
              <div class="search-item-title">${p.first_name} ${p.last_name}</div>
              <div class="search-item-subtitle">${p.email}</div>
            </div>
          </div>
        `).join('');
      }

      // Doctors
      if (results.doctors && results.doctors.length > 0) {
        hasResults = true;
        html += '<div class="search-category">Doctors</div>';
        html += results.doctors.map(d => `
          <div class="search-item" onclick="SearchModule.goTo('appointments')">
            <span class="material-symbols-outlined">stethoscope</span>
            <div class="search-item-text">
              <div class="search-item-title">Dr. ${d.first_name} ${d.last_name}</div>
              <div class="search-item-subtitle">${d.specialty || 'General Practice'}</div>
            </div>
          </div>
        `).join('');
      }

      // Appointments
      if (results.appointments && results.appointments.length > 0) {
        hasResults = true;
        html += '<div class="search-category">Appointments</div>';
        html += results.appointments.map(a => `
          <div class="search-item" onclick="SearchModule.goTo('appointments')">
            <span class="material-symbols-outlined">calendar_month</span>
            <div class="search-item-text">
              <div class="search-item-title">${a.patient_first} ${a.patient_last} - ${a.type}</div>
              <div class="search-item-subtitle">${App.formatDate(a.date)} at ${App.formatTime(a.time)} ${App.getStatusBadge(a.status)}</div>
            </div>
          </div>
        `).join('');
      }

      // Prescriptions
      if (results.prescriptions && results.prescriptions.length > 0) {
        hasResults = true;
        html += '<div class="search-category">Prescriptions</div>';
        html += results.prescriptions.map(rx => `
          <div class="search-item" onclick="SearchModule.goTo('prescriptions')">
            <span class="material-symbols-outlined">medication</span>
            <div class="search-item-text">
              <div class="search-item-title">${rx.medication} ${rx.dosage}</div>
              <div class="search-item-subtitle">${rx.patient_first ? rx.patient_first + ' ' + rx.patient_last : 'Dr. ' + rx.doctor_first + ' ' + rx.doctor_last} ${App.getStatusBadge(rx.status)}</div>
            </div>
          </div>
        `).join('');
      }

      if (!hasResults) {
        html = `
          <div class="empty-state" style="padding:24px;">
            <span class="material-symbols-outlined">search_off</span>
            <p class="text-sm">No results found for "${query}"</p>
          </div>
        `;
      }

      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    } catch (err) {
      dropdown.innerHTML = `<div class="empty-state" style="padding:16px;"><p class="text-sm text-muted">Search failed</p></div>`;
      dropdown.classList.remove('hidden');
    }
  }

  function goTo(page, id) {
    document.getElementById('search-results-dropdown').classList.add('hidden');
    document.getElementById('global-search').value = '';

    if (page === 'patients' && id) {
      App.navigate('patients');
      setTimeout(() => PatientsModule.viewPatient(id), 300);
    } else {
      App.navigate(page);
    }
  }

  return { init, performSearch, goTo };
})();
