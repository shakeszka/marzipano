/*
 * Dynamic Tour Viewer - loads tours from Supabase or local data
 */
(function(global) {
  'use strict';

  var Marzipano = global.Marzipano;
  var viewer, scenes = [];
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

    return viewer;
  }

  function getSceneId(sceneData) {
    return sceneData.id;
  }

  function getSceneImageUrl(sceneData) {
    return sceneData.imageUrl || sceneData.image_url;
  }

  function buildDefaultLevels() {
    return [
      { tileSize: 256, size: 256, fallbackOnly: true },
      { tileSize: 512, size: 512 },
      { tileSize: 512, size: 1024 },
      { tileSize: 512, size: 2048 },
      { tileSize: 512, size: 4096 }
    ];
  }

  function createScene(sceneData, index) {
    var imageUrl = getSceneImageUrl(sceneData);
    if (!imageUrl) {
      throw new Error('Scene is missing image URL.');
    }

    var levels = sceneData.levels || buildDefaultLevels();
    var faceSize = sceneData.faceSize || sceneData.face_size || levels[levels.length - 1].size;
    var geometry = new Marzipano.CubeGeometry(levels);
    var supabaseBase = 'https://qnquicysinpybpnlqtan.supabase.co/storage/v1/object/public/panoramas/';
    var source = new Marzipano.ImageUrlSource(function(tile) {
      if (tile.z === 0) {
        return { url: supabaseBase + imageUrl + '/1/' + tile.face + '/0/0.jpg' };
      }
      var tilePath = imageUrl + '/' + tile.z + '/' + tile.face + '/' + tile.y + '/' + tile.x + '.jpg';
      return { url: supabaseBase + tilePath };
    });
    var limiter = Marzipano.RectilinearView.limit.traditional(
      faceSize,
      100 * Math.PI / 180,
      120 * Math.PI / 180
    );
    var view = new Marzipano.RectilinearView({
      yaw: sceneData.yaw || sceneData.initialYaw || 0,
      pitch: sceneData.pitch || sceneData.initialPitch || 0,
      fov: sceneData.fov || Math.PI / 2
    }, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Store reference
    sceneData.marzipanoScene = scene;

    // Add hotspots
    if (sceneData.hotspots && sceneData.hotspots.length > 0) {
      sceneData.hotspots.forEach(function(hotspot) {
        addHotspot(scene, hotspot, getSceneId(sceneData));
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

    // Click handler
    element.addEventListener('click', function() {
      var targetSceneId = hotspotData.targetSceneId || hotspotData.target_scene_id;
      if (targetSceneId) {
        var targetScene = tourData.scenes.find(function(s) { return getSceneId(s) === targetSceneId; });
        if (targetScene && targetScene.marzipanoScene) {
          viewer.switchScene(targetScene.marzipanoScene);
          currentScene = targetScene.marzipanoScene;
        }
      }
    });

    scene.hotspotContainer().createHotspot(element, coords);
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
