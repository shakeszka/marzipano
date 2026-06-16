/*
 * Supabase integration for Tour Builder
 */
(function(global) {
  'use strict';

  async function saveTourToSupabase(tour, preview) {
    try {
      // Show message
      const status = document.getElementById('saveStatus');
      if (status) status.textContent = 'Saving tour to cloud...';

      // Prepare scenes data
      const scenes = tour.scenes.map((scene, index) => ({
        title: scene.name,
        imageUrl: scene.imageUrl || '',
        initialYaw: scene.initialYaw || 0,
        initialPitch: scene.initialPitch || 0,
        hotspots: (scene.linkHotspots || []).map(hotspot => ({
          title: tour.getScene(hotspot.target)?.name || 'Untitled',
          yaw: hotspot.yaw,
          pitch: hotspot.pitch,
          type: 'link',
          targetSceneIndex: tour.scenes.findIndex(s => s.id === hotspot.target)
        }))
      }));

      // Save tour via API
      const response = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tour.name,
          description: 'Built with Tour Builder',
          scenes: scenes,
          isPublic: false
        })
      });

      let result = {};
      let rawBody = null;
      try {
        result = await response.json();
      } catch (e) {
        rawBody = await response.text().catch(() => null);
      }

      if (!response.ok) {
        const details = (result && (result.error || result.message)) || rawBody || 'No response body';
        throw new Error('HTTP ' + response.status + ': ' + details);
      }

      const { tourId } = result;
      
      if (status) {
        status.textContent = 'Tour saved! ID: ' + tourId;
        setTimeout(() => { status.textContent = ''; }, 3000);
      }

      return tourId;
    } catch (error) {
      console.error('Error saving tour:', error);
      alert('Failed to save tour: ' + error.message);
      throw error;
    }
  }

  async function uploadImageToSupabase(file, tourId) {
    try {
      // Read file as base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64 = e.target.result.split(',')[1];
            const response = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                fileData: base64,
                tourId: tourId
              })
            });

            if (!response.ok) {
              throw new Error('Upload failed');
            }

            const data = await response.json();
            resolve(data.url);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  async function loadTourFromSupabase(tourId) {
    try {
      const response = await fetch('/api/tours/' + tourId);
      if (!response.ok) {
        throw new Error('Failed to load tour');
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading tour:', error);
      throw error;
    }
  }

  global.SupabaseIntegration = {
    saveTourToSupabase: saveTourToSupabase,
    uploadImageToSupabase: uploadImageToSupabase,
    loadTourFromSupabase: loadTourFromSupabase
  };

})(window);
