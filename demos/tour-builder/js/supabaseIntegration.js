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
      await Promise.all(
        tour.scenes.map(async (scene, index) => {
          if (scene.tileBlobs && Object.keys(scene.tileBlobs).length > 0) {
            const tileKeys = Object.keys(scene.tileBlobs);
            await Promise.all(
              tileKeys.map(async (key) => {
                const blob = scene.tileBlobs[key];
                // Upload to tours/{tourId}/{sceneIndex}/{tile_path}
                const tilePath = `tours/${tourId}/${index}/${key}.jpg`;
                
                return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const base64 = reader.result.split(',')[1];
                      const resp = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fileName: tilePath,
                          fileData: base64,
                          tourId: tourId
                        })
                      });
                      if (!resp.ok) throw new Error('Tile upload failed');
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
          }
        })
      );

      if (status) status.textContent = 'Finalizing tour...';

      // Prepare scenes with shared base URL
      const scenesWithUrls = tour.scenes.map((scene, index) => ({
        title: scene.name,
        imageUrl: `tours/${tourId}/${index}`,
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
        setTimeout(() => { status.textContent = ''; }, 3000);
      }

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

  global.SupabaseIntegration = {
    saveTourToSupabase: saveTourToSupabase,
    uploadImageToSupabase: uploadImageToSupabase,
    loadTourFromSupabase: loadTourFromSupabase
  };

})(window);
