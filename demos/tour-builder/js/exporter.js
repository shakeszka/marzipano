/*
 * Export tour as a zip archive compatible with the Marzipano Tool output layout.
 */
(function(global) {
  'use strict';

  var ICON_BASE = '//www.marzipano.net/demos/sample-tour/img';

  var EXPORT_INDEX_JS = function() {/*
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  var scenes = data.scenes.map(function(sceneData) {
    var urlPrefix = "data/" + sceneData.id;
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/preview.jpg" }
    );
    var geometry = new Marzipano.CubeGeometry(sceneData.levels);
    var limiter = Marzipano.RectilinearView.limit.traditional(
      sceneData.faceSize, 100 * Math.PI / 180, 120 * Math.PI / 180
    );
    var view = new Marzipano.RectilinearView(sceneData.initialViewParameters, limiter);
    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    sceneData.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return { data: sceneData, scene: scene, view: view };
  });

  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.8,
    targetPitch: 0,
    targetFov: Math.PI / 2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      fullscreenToggleElement.classList.toggle('enabled', screenfull.isFullscreen);
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  sceneListToggleElement.addEventListener('click', toggleSceneList);

  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  document.querySelectorAll('#sceneList .scene').forEach(function(el) {
    el.addEventListener('click', function() {
      switchScene(findSceneById(el.getAttribute('data-id')));
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');
  var velocity = 0.7;
  var friction = 3;
  var controls = viewer.controls();
  controls.registerMethod('upElement', new Marzipano.ElementPressControlMethod(viewUpElement, 'y', -velocity, friction), true);
  controls.registerMethod('downElement', new Marzipano.ElementPressControlMethod(viewDownElement, 'y', velocity, friction), true);
  controls.registerMethod('leftElement', new Marzipano.ElementPressControlMethod(viewLeftElement, 'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement, 'x', velocity, friction), true);
  controls.registerMethod('inElement', new Marzipano.ElementPressControlMethod(viewInElement, 'zoom', -velocity, friction), true);
  controls.registerMethod('outElement', new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom', velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    sceneNameElement.innerHTML = sanitize(scene.data.name);
    updateSceneList(scene);
  }

  function updateSceneList(scene) {
    document.querySelectorAll('#sceneList .scene').forEach(function(el) {
      el.classList.toggle('current', el.getAttribute('data-id') === scene.data.id);
    });
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) return;
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    autorotateToggleElement.classList.toggle('enabled');
    if (autorotateToggleElement.classList.contains('enabled')) startAutorotate();
    else stopAutorotate();
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'link-hotspot');
    var title = document.createElement('div');
    title.classList.add('link-hotspot-title');
    title.innerHTML = findSceneDataById(hotspot.target).name;
    var icon = document.createElement('div');
    icon.classList.add('link-hotspot-icon');
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });
    stopTouchAndScrollEventPropagation(wrapper);
    wrapper.appendChild(title);
    wrapper.appendChild(icon);
    return wrapper;
  }

  function stopTouchAndScrollEventPropagation(element) {
    ['touchstart', 'touchmove', 'touchend', 'touchcancel',
     'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'
    ].forEach(function(type) {
      element.addEventListener(type, function(event) { event.stopPropagation(); });
    });
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) return scenes[i];
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) return data.scenes[i];
    }
    return null;
  }

  if (scenes.length) switchScene(scenes[0]);
})();
*/}.toString().match(/\/\*([\s\S]*)\*\//)[1];

  function buildIndexHtml(data) {
    var sceneLinks = data.scenes.map(function(scene) {
      return '    <a href="javascript:void(0)" class="scene" data-id="' + scene.id + '">\n' +
        '      <li class="text">' + escapeHtml(scene.name) + '</li>\n' +
        '    </a>';
    }).join('\n');

    var bodyClass = data.settings.viewControlButtons ? 'view-control-buttons' : '';
    if (data.scenes.length > 1) {
      bodyClass = ('multiple-scenes ' + bodyClass).trim();
    } else {
      bodyClass = ('single-scene ' + bodyClass).trim();
    }

    return '<!DOCTYPE html>\n<html>\n<head>\n' +
      '<title>' + escapeHtml(data.name) + ' | Marzipano</title>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="target-densitydpi=device-dpi, width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, minimal-ui" />\n' +
      '<style> @-ms-viewport { width: device-width; } </style>\n' +
      '<link rel="stylesheet" href="style.css">\n' +
      '</head>\n<body class="' + bodyClass + '">\n\n' +
      '<div id="pano"></div>\n\n' +
      '<div id="sceneList">\n  <ul class="scenes">\n' + sceneLinks + '\n  </ul>\n</div>\n\n' +
      '<div id="titleBar"><h1 class="sceneName"></h1></div>\n\n' +
      '<a href="javascript:void(0)" id="autorotateToggle">\n' +
      '  <img class="icon off" src="img/play.png">\n' +
      '  <img class="icon on" src="img/pause.png">\n' +
      '</a>\n\n' +
      '<a href="javascript:void(0)" id="fullscreenToggle">\n' +
      '  <img class="icon off" src="img/fullscreen.png">\n' +
      '  <img class="icon on" src="img/windowed.png">\n' +
      '</a>\n\n' +
      '<a href="javascript:void(0)" id="sceneListToggle">\n' +
      '  <img class="icon off" src="img/expand.png">\n' +
      '  <img class="icon on" src="img/collapse.png">\n' +
      '</a>\n\n' +
      '<style>\n' +
      '  .viewControlButton, #fullscreenToggle, #autorotateToggle, #sceneListToggle { background-color: ' + (data.settings.controlButtonColor || 'rgba(103,115,131,0.8)') + '; }\n' +
      '</style>\n' +
      '<a href="javascript:void(0)" id="viewUp" class="viewControlButton viewControlButton-1"><img class="icon" src="img/up.png"></a>\n' +
      '<a href="javascript:void(0)" id="viewDown" class="viewControlButton viewControlButton-2"><img class="icon" src="img/down.png"></a>\n' +
      '<a href="javascript:void(0)" id="viewLeft" class="viewControlButton viewControlButton-3"><img class="icon" src="img/left.png"></a>\n' +
      '<a href="javascript:void(0)" id="viewRight" class="viewControlButton viewControlButton-4"><img class="icon" src="img/right.png"></a>\n' +
      '<a href="javascript:void(0)" id="viewIn" class="viewControlButton viewControlButton-5"><img class="icon" src="img/plus.png"></a>\n' +
      '<a href="javascript:void(0)" id="viewOut" class="viewControlButton viewControlButton-6"><img class="icon" src="img/minus.png"></a>\n\n' +
      '<script src="vendor/screenfull.js"></script>\n' +
      '<script src="vendor/bowser.js"></script>\n' +
      '<script src="vendor/marzipano.js"></script>\n' +
      '<script src="data.js"></script>\n' +
      '<script src="index.js"></script>\n' +
      '</body>\n</html>\n';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildDataJs(data) {
    return 'var APP_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
  }

  function buildReadme(data) {
    return [
      data.name,
      '========',
      '',
      'This virtual tour was generated by the Marzipano Tour Builder demo.',
      '',
      'To view the tour, open index.html in a web browser.',
      'For best results, serve the files from a local web server rather than opening directly from disk.',
      '',
      'Directory layout:',
      '  index.html    - Tour viewer',
      '  index.js      - Tour logic',
      '  data.js       - Scene and hotspot configuration',
      '  style.css     - Tour styling',
      '  vendor/       - Marzipano and dependencies',
      '  data/         - Panorama tiles for each scene',
      '',
      'You may customize the tour by editing data.js, index.js, index.html and style.css.',
      ''
    ].join('\n');
  }

  function fetchText(url) {
    return fetch(url).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to fetch ' + url);
      }
      return response.text();
    });
  }

  function exportTour(tour, marzipanoJsUrl, styleCssUrl, vendorUrls) {
    if (!global.JSZip) {
      return Promise.reject(new Error('JSZip is not loaded.'));
    }
    if (!tour.scenes.length) {
      return Promise.reject(new Error('Add at least one panorama before exporting.'));
    }

    var data = tour.toData();
    var zip = new JSZip();
    var folderName = PanoProcessor.slugify(tour.name) || 'tour';

    zip.file('index.html', buildIndexHtml(data));
    zip.file('index.js', EXPORT_INDEX_JS);
    zip.file('data.js', buildDataJs(data));
    zip.file('README.txt', buildReadme(data));

    return fetchText(styleCssUrl).then(function(styleCss) {
      zip.file('style.css', styleCss);
      return fetchText(marzipanoJsUrl);
    }).then(function(marzipanoJs) {
      zip.file('vendor/marzipano.js', marzipanoJs);
      return Promise.all([
        fetchText(vendorUrls.bowser),
        fetchText(vendorUrls.screenfull)
      ]);
    }).then(function(vendorFiles) {
      zip.file('vendor/bowser.js', vendorFiles[0]);
      zip.file('vendor/screenfull.js', vendorFiles[1]);

      var iconNames = [
        'link.png', 'info.png', 'close.png', 'play.png', 'pause.png',
        'fullscreen.png', 'windowed.png', 'expand.png', 'collapse.png',
        'up.png', 'down.png', 'left.png', 'right.png', 'plus.png', 'minus.png'
      ];
      return Promise.all(iconNames.map(function(name) {
        return fetch(ICON_BASE + '/' + name).then(function(r) { return r.blob(); }).then(function(blob) {
          zip.file('img/' + name, blob);
        });
      }));
    }).then(function() {
      tour.scenes.forEach(function(scene) {
        zip.file('data/' + scene.id + '/preview.jpg', scene.previewBlob);
        Object.keys(scene.tileBlobs).forEach(function(key) {
          zip.file('data/' + scene.id + '/' + key + '.jpg', scene.tileBlobs[key]);
        });
      });

      return zip.generateAsync({ type: 'blob' }, function(metadata) {
        if (global.TourBuilderApp && global.TourBuilderApp.onExportProgress) {
          global.TourBuilderApp.onExportProgress(metadata.percent);
        }
      });
    }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = folderName + '.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    });
  }

  global.TourExporter = {
    exportTour: exportTour
  };

})(window);
