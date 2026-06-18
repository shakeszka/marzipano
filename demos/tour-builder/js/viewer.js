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
      // Apply custom control button color if provided in settings
      if (settings.controlButtonColor) {
        var btns = document.querySelectorAll('.viewControlButton');
        for (var i = 0; i < btns.length; i++) {
          btns[i].style.backgroundColor = settings.controlButtonColor;
        }
        // Also apply to other toggle buttons
        var toggles = ['fullscreenToggle', 'autorotateToggle', 'sceneListToggle'];
        for (var j = 0; j < toggles.length; j++) {
          var el = document.getElementById(toggles[j]);
          if (el) el.style.backgroundColor = settings.controlButtonColor;
        }
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
      viewControlButtons: true,
      controlButtonColor: null
    }, tourData.settings || (tourData.tour && tourData.tour.settings) || {});

    var statusEl = document.getElementById('loadStatus');

    // Add body class depending on number of scenes so CSS shows scene list toggle
    if (Array.isArray(data.scenes) && data.scenes.length > 1) {
      document.body.classList.add('multiple-scenes');
      document.body.classList.remove('single-scene');
    } else {
      document.body.classList.add('single-scene');
      document.body.classList.remove('multiple-scenes');
    }

    // Build scene list UI (if present in the page)
    var sceneListEl = document.getElementById('sceneList');
    var sceneListToggleEl = document.getElementById('sceneListToggle');
    // If toggle button missing from the page, create it with expand/collapse icons.
    if (!sceneListToggleEl) {
      sceneListToggleEl = document.createElement('a');
      sceneListToggleEl.href = 'javascript:void(0)';
      sceneListToggleEl.id = 'sceneListToggle';
      var imgOff = document.createElement('img');
      imgOff.className = 'icon off';
      imgOff.src = '/demos/sample-tour/img/expand.png';
      var imgOn = document.createElement('img');
      imgOn.className = 'icon on';
      imgOn.src = '/demos/sample-tour/img/collapse.png';
      sceneListToggleEl.appendChild(imgOff);
      sceneListToggleEl.appendChild(imgOn);
      document.body.appendChild(sceneListToggleEl);
    }
    if (sceneListEl && Array.isArray(data.scenes)) {
      var ul = document.createElement('ul');
      ul.className = 'scenes';
      data.scenes.forEach(function(sceneData) {
        var a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.className = 'scene';
        a.setAttribute('data-id', getSceneId(sceneData));
        var li = document.createElement('li');
        li.className = 'text';
        li.textContent = sceneData.title || sceneData.name || 'Untitled Scene';
        a.appendChild(li);
        ul.appendChild(a);
      });
      // Clear and append
      sceneListEl.innerHTML = '';
      sceneListEl.appendChild(ul);
      // Show scene list immediately on desktop so it doesn't flash away.
      if (sceneListEl) {
        var mql = window.matchMedia ? matchMedia("(max-width: 500px), (max-height: 500px)") : null;
        var updateSceneListMode = function() {
          if (mql && mql.matches) {
            sceneListEl.classList.remove('enabled');
            if (sceneListToggleEl) sceneListToggleEl.classList.remove('enabled');
            document.body.classList.add('mobile');
            document.body.classList.remove('desktop');
          } else {
            sceneListEl.classList.add('enabled');
            if (sceneListToggleEl) sceneListToggleEl.classList.add('enabled');
            document.body.classList.add('desktop');
            document.body.classList.remove('mobile');
          }
        };
        // Run once to set initial state and keep it updated on changes.
        updateSceneListMode();
        if (mql) mql.addListener(updateSceneListMode);
      }
    }

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

      // Wire up scene list click handlers and toggle behavior now that scenes exist.
      if (sceneListEl) {
        var sceneAnchors = sceneListEl.querySelectorAll('.scene');
        for (var i = 0; i < sceneAnchors.length; i++) {
          (function(i) {
            var anchor = sceneAnchors[i];
            anchor.addEventListener('click', function() {
              var id = anchor.getAttribute('data-id');
              for (var j = 0; j < scenes.length; j++) {
                if (getSceneId(scenes[j].data) === id) {
                  stopAutorotate();
                  viewer.switchScene(scenes[j].scene);
                  currentScene = scenes[j].scene;
                  updateSceneName(scenes[j].data);
                  // Update list highlighting
                  for (var k = 0; k < sceneAnchors.length; k++) {
                    sceneAnchors[k].classList.remove('current');
                  }
                  anchor.classList.add('current');
                  if (tourData.settings && tourData.settings.autorotateEnabled) {
                    startAutorotate();
                  }
                  break;
                }
              }
            });
          })(i);
        }
      }

      if (sceneListToggleEl) {
        sceneListToggleEl.addEventListener('click', function() {
          if (sceneListEl.classList.contains('enabled')) {
            sceneListEl.classList.remove('enabled');
            sceneListToggleEl.classList.remove('enabled');
          } else {
            sceneListEl.classList.add('enabled');
            sceneListToggleEl.classList.add('enabled');
          }
        });
        // Show scene list by default on desktop
        if (!document.body.classList.contains('mobile')) {
          sceneListEl.classList.add('enabled');
          sceneListToggleEl.classList.add('enabled');
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
