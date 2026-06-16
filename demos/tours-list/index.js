(function() {
  'use strict';

  const container = document.getElementById('toursContainer');

  async function loadAllTours() {
    try {
      const response = await fetch('/api/tours-list/');
      if (!response.ok) {
        let message = 'Failed to load tours';
        try {
          const errorData = await response.json();
          message = errorData.error || message;
        } catch (e) {}
        throw new Error(message);
      }
      const data = await response.json();
      return data.tours || [];
    } catch (error) {
      console.error('Error loading tours:', error);
      throw error;
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderTours(tours) {
    if (!tours || tours.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No tours yet</h2>
          <p>Get started by creating your first virtual tour!</p>
          <br>
          <a href="/builder/" class="btn btn-primary">Create First Tour</a>
        </div>
      `;
      return;
    }

    const toursHtml = tours.map(tour => `
      <div class="tour-card">
        <div class="tour-card-header">
          <div class="tour-card-title">${escapeHtml(tour.title)}</div>
          <div class="tour-card-id">ID: ${tour.id}</div>
        </div>
        <div class="tour-card-body">
          <div class="tour-info">
            <div class="tour-info-row">
              <span class="tour-info-label">Description:</span>
              <div>${escapeHtml(tour.description || 'No description')}</div>
            </div>
            <div class="tour-info-row">
              <span class="tour-info-label">Scenes:</span>
              <div>${tour.scene_count || 0} scene(s)</div>
            </div>
            <div class="tour-info-row">
              <span class="tour-info-label">Created:</span>
              <div>${formatDate(tour.created_at)}</div>
            </div>
            <div class="tour-info-row">
              <span class="tour-info-label">Public:</span>
              <div>${tour.is_public ? '✓ Yes' : '✗ No'}</div>
            </div>
          </div>
        </div>
        <div class="tour-card-footer">
          <a href="/3dtour/viewer?id=${tour.id}" class="tour-btn tour-btn-view">👁️ View Tour</a>
        </div>
      </div>
    `).join('');

    container.innerHTML = `<div class="tours-grid">${toursHtml}</div>`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showError(message) {
    container.innerHTML = `
      <div class="error">
        <h2>Error Loading Tours</h2>
        <p>${escapeHtml(message)}</p>
        <br>
        <button onclick="location.reload()" class="btn btn-secondary">Try Again</button>
      </div>
    `;
  }

  // Load tours on page load
  loadAllTours()
    .then(renderTours)
    .catch(error => showError(error.message || 'Unknown error occurred'));
})();
