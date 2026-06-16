/*
 * Supabase integration for Tour Builder
 */
(function(global) {
  'use strict';

  async function saveTourToSupabase(tour, preview) {
    try {
      const status = document.getElementById('saveStatus');
      if (status) status.textContent = 'Saving tour to cloud...';

      // First, create a temporary tour to get tourId
      const tempTourResponse = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tour.name,
          description: 'Built with Tour Builder',
          scenes: [],
          isPublic: false
        })
      });

      let tempResult = {};
      try {
        tempResult = await tempTourResponse.json();
      } catch (e) {}

      if (!tempTourResponse.ok) {
        throw new Error('HTTP ' + tempTourResponse.status + ': Failed to create tour');
      }

      const tourId = tempResult.tourId;
      if (status) status.textContent = 'Uploading panoramas...';

      // Upload panorama tiles for each scene under tours/{tourId}/{sceneIndex}/...
      console.log('Saving tour', { tourId: tourId, sceneCount: tour.scenes.length, origin: window.location.origin });
      await Promise.all(
        tour.scenes.map(async (scene, index) => {
          if (scene.tileBlobs && Object.keys(scene.tileBlobs).length > 0) {
            const tileKeys = Object.keys(scene.tileBlobs);
            console.log('Uploading scene tiles', { sceneIndex: index, tileCount: tileKeys.length });
            await Promise.all(
              tileKeys.map(async (key) => {
                const blob = scene.tileBlobs[key];
                // Send scene-relative path; endpoint will prepend tours/{tourId}/
                const sceneRelativePath = `${index}/${key}.jpg`;

                return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const base64 = reader.result.split(',')[1];
                      const resp = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fileName: sceneRelativePath,
                          fileData: base64,
                          tourId: tourId
                        })
                      });
                      const text = await resp.text();
                      console.log('Upload response', { url: resp.url, status: resp.status, ok: resp.ok, body: text });
                      if (!resp.ok) {
                        throw new Error('Tile upload failed: ' + resp.status + ' ' + text);
                      }
                      resolve();
                    } catch (e) {
                      reject(e);
                    }
                  };
                  reader.onerror = () => reject(new Error('Blob read failed'));
                  reader.readAsDataURL(blob);
                });
              })
            );
          } else {
            console.log('Skipping scene upload: no tile blobs', index);
          }
        })
      );

      if (status) status.textContent = 'Finalizing tour...';

      // Prepare scenes with shared base URL
      const scenesWithUrls = tour.scenes.map((scene, index) => ({
        title: scene.name,
        imageUrl: `tours/${tourId}/${index}`,
        initialYaw: scene.initialViewParameters ? scene.initialViewParameters.yaw : 0,
        initialPitch: scene.initialViewParameters ? scene.initialViewParameters.pitch : 0,
        hotspots: (scene.linkHotspots || []).map(hotspot => ({
          title: tour.getScene(hotspot.target)?.name || 'Untitled',
          yaw: hotspot.yaw,
          pitch: hotspot.pitch,
          type: 'link',
          targetSceneIndex: tour.scenes.findIndex(s => s.id === hotspot.target)
        }))
      }));

      // Save the full tour with scene data
      const finalResponse = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tour.name,
          description: 'Built with Tour Builder',
          scenes: scenesWithUrls,
          isPublic: false
        })
      });

      let finalResult = {};
      try {
        finalResult = await finalResponse.json();
      } catch (e) {}

      if (!finalResponse.ok) {
        throw new Error('HTTP ' + finalResponse.status + ': Failed to save tour');
      }

      const finalTourId = finalResult.tourId;
      if (status) {
        status.textContent = 'Tour saved! ID: ' + finalTourId;
        setTimeout(() => { status.textContent = ''; }, 5000);
      }

      // Show success popup
      showSuccessPopup(finalTourId);

      return finalTourId;
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

  function showSuccessPopup(tourId) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      text-align: center;
      font-family: Arial, sans-serif;
    `;

    modal.innerHTML = `
      <h2 style="margin-top: 0; color: #333;">🎉 Tour Saved Successfully!</h2>
      <p style="color: #666; margin: 15px 0;">Your tour has been saved to the cloud.</p>
      <div style="background: #f0f0f0; padding: 12px; border-radius: 4px; margin: 20px 0; word-break: break-all;">
        <strong>Tour ID:</strong> <code>${tourId}</code>
      </div>
      <div style="margin-top: 20px;">
        <a href="/${tourId}/tour" style="display: inline-block; background: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin-right: 10px;">View Tour</a>
        <a href="/tours-list" style="display: inline-block; background: #6c757d; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">All Tours</a>
      </div>
      <button onclick="this.closest('div').parentElement.remove()" style="margin-top: 20px; padding: 8px 16px; background: #e9ecef; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  global.SupabaseIntegration = {
    saveTourToSupabase: saveTourToSupabase,
    uploadImageToSupabase: uploadImageToSupabase,
    loadTourFromSupabase: loadTourFromSupabase
  };

})(window);
