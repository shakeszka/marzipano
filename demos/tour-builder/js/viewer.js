/*
 * Dynamic Tour Viewer - loads tours from Supabase or local data
 */
(function(global) {
  'use strict';

  var Marzipano = global.Marzipano;
  var screenfull = global.screenfull;
  var viewer, scenes = [];
  var tourData = null;
  var currentScene = null;
  var autorotate = null;
  var uiInitialized = false;

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
        fullscreenButton: true,
        viewControlButtons: true
      }
    };

    viewer = new Marzipano.Viewer(container, viewerOpts);
    autorotate = Marzipano.autorotate({
      yawSpeed: 0.7,
      targetPitch: 0,
      targetFov: Math.PI / 2
    });

    setupViewerUi({
      fullscreenButton: true,
      viewControlButtons: true,
      autorotateEnabled: false
    });

    return viewer;
  }

  function setupViewerUi(settings) {
    var fullscreenToggleElement = document.getElementById('fullscreenToggle');
    var autorotateToggleElement = document.getElementById('autorotateToggle');
    var viewUpElement = document.getElementById('viewUp');
    var viewDownElement = document.getElementById('viewDown');
    var viewLeftElement = document.getElementById('viewLeft');
    var viewRightElement = document.getElementById('viewRight');
    var viewInElement = document.getElementById('viewIn');
    var viewOutElement = document.getElementById('viewOut');

    if (settings.fullscreenButton && screenfull && screenfull.enabled) {
      document.body.classList.add('fullscreen-enabled');
      document.body.classList.remove('fullscreen-disabled');
      if (fullscreenToggleElement && !fullscreenToggleElement._fullscreenHandlerAttached) {
        fullscreenToggleElement.addEventListener('click', function() {
          screenfull.toggle();
        });
        fullscreenToggleElement._fullscreenHandlerAttached = true;
      }
      if (screenfull && !screenfull._changeHandlerAttached) {
        screenfull.on('change', function() {
          if (fullscreenToggleElement) {
            fullscreenToggleElement.classList.toggle('enabled', screenfull.isFullscreen);
          }
        });
        screenfull._changeHandlerAttached = true;
      }
    } else {
      document.body.classList.add('fullscreen-disabled');
      document.body.classList.remove('fullscreen-enabled');
    }

    if (settings.viewControlButtons) {
      document.body.classList.add('view-control-buttons');
      if (!uiInitialized) {
        var controls = viewer.controls();
        var velocity = 0.7;
        var friction = 3;
        if (viewUpElement) controls.registerMethod('upElement', new Marzipano.ElementPressControlMethod(viewUpElement, 'y', -velocity, friction), true);
        if (viewDownElement) controls.registerMethod('downElement', new Marzipano.ElementPressControlMethod(viewDownElement, 'y', velocity, friction), true);
        if (viewLeftElement) controls.registerMethod('leftElement', new Marzipano.ElementPressControlMethod(viewLeftElement, 'x', -velocity, friction), true);
        if (viewRightElement) controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement, 'x', velocity, friction), true);
        if (viewInElement) controls.registerMethod('inElement', new Marzipano.ElementPressControlMethod(viewInElement, 'zoom', -velocity, friction), true);
        if (viewOutElement) controls.registerMethod('outElement', new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom', velocity, friction), true);
      }
    }

    if (autorotateToggleElement && !autorotateToggleElement._autorotateHandlerAttached) {
      autorotateToggleElement.addEventListener('click', function() {
        if (autorotateToggleElement.classList.contains('enabled')) {
          autorotateToggleElement.classList.remove('enabled');
          stopAutorotate();
        } else {
          autorotateToggleElement.classList.add('enabled');
          startAutorotate();
        }
      });
      autorotateToggleElement._autorotateHandlerAttached = true;
    }

    if (settings.autorotateEnabled) {
      if (autorotateToggleElement) {
        autorotateToggleElement.classList.add('enabled');
      }
      startAutorotate();
    }

    if (!uiInitialized) {
      uiInitialized = true;
    }
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
    // Create hotspot element that matches builder hotspot styling
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
          stopAutorotate();
          viewer.switchScene(targetScene.marzipanoScene);
          currentScene = targetScene.marzipanoScene;
          if (tourData.settings && tourData.settings.autorotateEnabled) {
            startAutorotate();
          }
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

  function updateSceneName(sceneData) {
    var sceneNameElement = document.querySelector('#titleBar .sceneName');
    if (!sceneNameElement) {
      return;
    }
    sceneNameElement.textContent = sceneData.title || sceneData.name || 'Untitled Scene';
  }

  function buildTourFromData(data) {
    if (!data || !data.scenes) {
      throw new Error('Invalid tour data');
    }

    tourData = data;
    scenes = [];

    // Normalize and default tour settings.
    tourData.settings = Object.assign({
      mouseViewMode: 'drag',
      autorotateEnabled: false,
      fullscreenButton: true,
      viewControlButtons: true
    }, tourData.settings || (tourData.tour && tourData.tour.settings) || {});

    var statusEl = document.getElementById('loadStatus');

    // Setup UI and hide loading screen immediately so the builder opens
    // while panoramas continue to load in the background.
    setupViewerUi(tourData.settings || {});
    if (statusEl) statusEl.style.display = 'none';

    // Create scenes asynchronously so the UI is responsive right away.
    setTimeout(function() {
      // Create scenes
      data.scenes.forEach(function(sceneData, index) {
        var scene = createScene(sceneData, index);
        scenes.push({ data: sceneData, scene: scene });
      });

      // Switch to first scene
      if (scenes.length > 0) {
        viewer.switchScene(scenes[0].scene);
        currentScene = scenes[0].scene;
        updateSceneName(scenes[0].data);
        if (tourData.settings && tourData.settings.autorotateEnabled) {
          startAutorotate();
        }
      }
    }, 0);
  }

  function startAutorotate() {
    if (!viewer || !autorotate) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    if (!viewer) {
      return;
    }
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  global.DynamicTourViewer = {
    setupViewer: setupViewer,
    loadTourFromUrl: loadTourFromUrl,
    buildTourFromData: buildTourFromData,
    getTourData: function() { return tourData; }
  };

})(window);
