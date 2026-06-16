/*
 * Dynamic Tour Viewer - loads tours from Supabase or local data
 */
(function(global) {
  'use strict';

  var Marzipano = global.Marzipano;
  var viewer, stage, effects, scenes = [];
  var tourData = null;
  var currentScene = null;

  function setupViewer(containerId) {
    // Get container
    var container = document.getElementById(containerId);
    if (!container) {
      console.error('Container not found:', containerId);
      return;
    }

    // Create viewer
    var viewerOpts = {
      controls: {
        mouseViewMode: 'drag',
        autorotateEnabled: false,
        fullscreenButton: true,
        viewControlButtons: false
      }
    };

    viewer = new Marzipano.Viewer(container, viewerOpts);

    // Create stage
    stage = viewer.stage();

    return viewer;
  }

  function createScene(sceneData, index) {
    // Determine geometry
    var geometry = new Marzipano.CubeGeometry([
      { tileSize: 256, size: 1024 },
      { tileSize: 256, size: 512 }
    ]);

    // Create tile source (for cubes)
    var source = new Marzipano.ImageUrlSource(function(tile) {
      return sceneData.imageUrl + '/' + tile.face + '/' + tile.z + '/' + tile.x + '.jpg';
    });

    // Create view
    var view = new Marzipano.RectilinearView(
      { yaw: sceneData.yaw || 0, pitch: sceneData.pitch || 0, fov: Math.PI / 2 }
    );

    // Create scene
    var sceneOpts = { stage: stage };
    var scene = viewer.createScene(sceneOpts);
    scene.source(source);
    scene.geometry(geometry);
    scene.view(view);

    // Store reference
    sceneData.marzipanoScene = scene;

    // Add hotspots
    if (sceneData.hotspots && sceneData.hotspots.length > 0) {
      sceneData.hotspots.forEach(function(hotspot) {
        addHotspot(scene, hotspot, sceneData.id);
      });
    }

    return scene;
  }

  function addHotspot(scene, hotspotData, currentSceneId) {
    // Create hotspot element
    var element = document.createElement('div');
    element.className = 'hotspot hotspot-link';
    element.innerHTML =
      '<div class="hotspot-icon"></div>' +
      '<div class="hotspot-title">' + (hotspotData.title || 'Link') + '</div>';

    // Convert yaw/pitch to coords
    var coords = {
      yaw: hotspotData.yaw,
      pitch: hotspotData.pitch
    };

    // Create hotspot
    var hotspot = new Marzipano.Hotspot(element, coords);

    // Click handler
    element.addEventListener('click', function() {
      if (hotspotData.targetSceneId) {
        var targetScene = tourData.scenes.find(function(s) { return s.id === hotspotData.targetSceneId; });
        if (targetScene && targetScene.marzipanoScene) {
          viewer.switchScene(targetScene.marzipanoScene);
          currentScene = targetScene.marzipanoScene;
        }
      }
    });

    scene.hotspots().add(hotspot);
  }

  async function loadTourFromUrl(tourId) {
    try {
      var statusEl = document.getElementById('loadStatus');
      if (statusEl) statusEl.textContent = 'Loading tour...';

      var response = await fetch('/api/tours/' + tourId);
      if (!response.ok) {
        throw new Error('Failed to load tour');
      }

      tourData = await response.json();
      return tourData;
    } catch (error) {
      console.error('Error loading tour:', error);
      if (statusEl) statusEl.textContent = 'Failed to load tour';
      throw error;
    }
  }

  function buildTourFromData(data) {
    if (!data || !data.scenes) {
      throw new Error('Invalid tour data');
    }

    tourData = data;
    scenes = [];

    // Create scenes
    data.scenes.forEach(function(sceneData, index) {
      var scene = createScene(sceneData, index);
      scenes.push(scene);
    });

    // Switch to first scene
    if (scenes.length > 0) {
      viewer.switchScene(scenes[0]);
      currentScene = scenes[0];
    }

    // Remove loading message
    var statusEl = document.getElementById('loadStatus');
    if (statusEl) statusEl.style.display = 'none';
  }

  global.DynamicTourViewer = {
    setupViewer: setupViewer,
    loadTourFromUrl: loadTourFromUrl,
    buildTourFromData: buildTourFromData,
    getTourData: function() { return tourData; }
  };

})(window);
