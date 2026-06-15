/*
 * Tour Builder application controller.
 */
(function(global) {
  'use strict';

  var tour = new Tour('My Virtual Tour');
  var preview = null;
  var currentSceneId = null;
  var hotspotMode = null;
  var actionMessageTimeout = null;

  var ui = {};

  function $(id) {
    return document.getElementById(id);
  }

  function existingIds() {
    var map = {};
    tour.scenes.forEach(function(scene) {
      map[scene.id] = true;
    });
    return map;
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function(el) {
      el.classList.toggle('active', el.id === 'screen-' + name);
    });
  }

  function setProgress(label, percent) {
    ui.progressLabel.textContent = label;
    ui.progressBar.style.width = Math.round(percent * 100) + '%';
  }

  function renderSceneList() {
    ui.sceneList.innerHTML = '';
    tour.scenes.forEach(function(scene) {
      var item = document.createElement('li');
      item.className = 'scene-item' + (scene.id === currentSceneId ? ' active' : '');
      item.innerHTML =
        '<button type="button" class="scene-select" data-id="' + scene.id + '">' +
        escapeHtml(scene.name) + '</button>' +
        '<button type="button" class="scene-remove" data-id="' + scene.id + '" title="Remove">×</button>';
      ui.sceneList.appendChild(item);
    });

    ui.sceneList.querySelectorAll('.scene-select').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectScene(btn.getAttribute('data-id'));
      });
    });
    ui.sceneList.querySelectorAll('.scene-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeScene(btn.getAttribute('data-id'));
      });
    });

    renderHotspotLists();
    renderLinkTargetOptions();
  }

  function renderHotspotLists() {
    var scene = tour.getScene(currentSceneId);
    if (!scene) {
      ui.linkHotspots.innerHTML = '<li class="empty">Select a scene</li>';
      return;
    }

    ui.linkHotspots.innerHTML = scene.linkHotspots.length ? '' : '<li class="empty">None yet</li>';
    scene.linkHotspots.forEach(function(hotspot, index) {
      var target = tour.getScene(hotspot.target);
      var li = document.createElement('li');
      li.innerHTML = '→ ' + escapeHtml(target ? target.name : hotspot.target) +
        ' <button type="button" data-index="' + index + '" class="remove-hotspot">Remove</button>';
      ui.linkHotspots.appendChild(li);
    });

    ui.linkHotspots.querySelectorAll('.remove-hotspot').forEach(function(btn) {
      btn.addEventListener('click', function() {
        scene.linkHotspots.splice(parseInt(btn.getAttribute('data-index'), 10), 1);
        refreshPreview();
        renderHotspotLists();
      });
    });
  }

  function renderLinkTargetOptions() {
    var scene = tour.getScene(currentSceneId);
    ui.linkTarget.innerHTML = '';
    tour.scenes.forEach(function(s) {
      if (!scene || s.id === scene.id) return;
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      ui.linkTarget.appendChild(opt);
    });
    ui.btnAddLink.disabled = !scene || ui.linkTarget.options.length === 0;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function processFiles(files) {
    showScreen('processing');
    setProgress('Starting…', 0);

    PanoProcessor.processFiles(files, existingIds(), setProgress)
      .then(function(scene) {
        tour.addScene(scene);
        showScreen('editor');
        renderSceneList();
        selectScene(scene.id);
      })
      .catch(function(err) {
        alert(err.message || String(err));
        showScreen(tour.scenes.length ? 'editor' : 'welcome');
      });
  }

  function selectScene(id) {
    currentSceneId = id;
    var scene = tour.getScene(id);
    if (!scene) return;

    ui.sceneName.value = scene.name;
    renderSceneList();
    if (!preview) {
      refreshPreview();
    } else {
      preview.switchScene(id);
    }
  }

  function removeScene(id) {
    if (!confirm('Remove this scene?')) return;
    tour.removeScene(id);
    if (currentSceneId === id) {
      currentSceneId = tour.scenes.length ? tour.scenes[0].id : null;
    }
    renderSceneList();
    refreshPreview();
    if (!tour.scenes.length) {
      showScreen('welcome');
    } else if (currentSceneId) {
      selectScene(currentSceneId);
    }
  }

  function refreshPreview() {
    if (!preview) {
      preview = new TourPreview(ui.pano, tour);
      preview.onSceneSwitch(function(id) {
        currentSceneId = id;
        renderSceneList();
      });
    }
    preview.init();
    if (currentSceneId) {
      preview.switchScene(currentSceneId);
    }
  }

  function showActionMessage(text) {
    ui.hotspotHint.textContent = text;
    ui.hotspotHint.classList.add('visible');
    if (actionMessageTimeout) {
      clearTimeout(actionMessageTimeout);
    }
    actionMessageTimeout = setTimeout(function() {
      ui.hotspotHint.classList.remove('visible');
      actionMessageTimeout = null;
    }, 1800);
  }

  function setHotspotMode(mode) {
    hotspotMode = mode;
    ui.btnAddLink.classList.toggle('active', mode === 'link');
    ui.btnSetView.classList.remove('active');
    if (preview) {
      preview.setHotspotMode(mode, onHotspotPlaced);
    }
    if (mode === 'link') {
      ui.hotspotHint.classList.add('visible');
      ui.hotspotHint.textContent = 'Click the panorama to place a hotspot';
    } else {
      ui.hotspotHint.classList.remove('visible');
    }
  }

  function onHotspotPlaced(coords) {
    var scene = tour.getScene(currentSceneId);
    if (!scene) return;

    if (hotspotMode === 'link') {
      var target = ui.linkTarget.value;
      if (!target) {
        alert('Choose a target scene first.');
        return;
      }
      scene.linkHotspots.push({
        yaw: coords.yaw,
        pitch: coords.pitch,
        rotation: coords.rotation,
        target: target
      });
    }

    setHotspotMode(null);
    refreshPreview();
    renderHotspotLists();
  }

  function bindEvents() {
    ui.dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      ui.dropZone.classList.add('dragover');
    });
    ui.dropZone.addEventListener('dragleave', function() {
      ui.dropZone.classList.remove('dragover');
    });
    ui.dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      ui.dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        processFiles(e.dataTransfer.files);
      }
    });

    ui.fileInput.addEventListener('change', function() {
      if (ui.fileInput.files.length) {
        processFiles(ui.fileInput.files);
        ui.fileInput.value = '';
      }
    });

    ui.btnBrowse.addEventListener('click', function() {
      ui.fileInput.click();
    });

    ui.btnAddMore.addEventListener('click', function() {
      ui.fileInput.click();
    });

    ui.sceneName.addEventListener('change', function() {
      var scene = tour.getScene(currentSceneId);
      if (scene) {
        scene.name = ui.sceneName.value.trim() || scene.id;
        renderSceneList();
      }
    });

    ui.tourName.addEventListener('change', function() {
      tour.name = ui.tourName.value.trim() || 'My Virtual Tour';
    });

    ui.settingAutorotate.addEventListener('change', function() {
      tour.settings.autorotateEnabled = ui.settingAutorotate.checked;
    });
    ui.settingFullscreen.addEventListener('change', function() {
      tour.settings.fullscreenButton = ui.settingFullscreen.checked;
    });
    ui.settingViewControls.addEventListener('change', function() {
      tour.settings.viewControlButtons = ui.settingViewControls.checked;
    });
    ui.settingMouseMode.addEventListener('change', function() {
      tour.settings.mouseViewMode = ui.settingMouseMode.value;
      refreshPreview();
    });

    ui.btnSetView.addEventListener('click', function() {
      if (preview) {
        preview.setInitialViewFromCurrent();
        ui.btnSetView.classList.add('active');
        showActionMessage('Initial view saved');
        setTimeout(function() { ui.btnSetView.classList.remove('active'); }, 800);
      }
    });

    ui.btnAddLink.addEventListener('click', function() {
      setHotspotMode(hotspotMode === 'link' ? null : 'link');
    });

    ui.pano.addEventListener('click', function(e) {
      if (preview && hotspotMode) {
        preview.handleClick(e);
      }
    });

    ui.btnExport.addEventListener('click', function() {
      ui.btnExport.disabled = true;
      ui.btnExport.textContent = 'Exporting…';
      TourExporter.exportTour(
        tour,
        '../../build/marzipano.js',
        '../sample-tour/style.css',
        {
          bowser: '//www.marzipano.net/demos/common/bowser.js',
          screenfull: '//www.marzipano.net/demos/common/screenfull.js'
        }
      ).then(function() {
        ui.btnExport.disabled = false;
        ui.btnExport.textContent = 'Export zip';
      }).catch(function(err) {
        alert(err.message || String(err));
        ui.btnExport.disabled = false;
        ui.btnExport.textContent = 'Export zip';
      });
    });
  }

  function init() {
    ui = {
      dropZone: $('dropZone'),
      fileInput: $('fileInput'),
      btnBrowse: $('btnBrowse'),
      btnAddMore: $('btnAddMore'),
      btnExport: $('btnExport'),
      progressLabel: $('progressLabel'),
      progressBar: $('progressBar'),
      sceneList: $('sceneList'),
      sceneName: $('sceneName'),
      tourName: $('tourName'),
      pano: $('pano'),
      linkHotspots: $('linkHotspots'),
      linkTarget: $('linkTarget'),
      btnSetView: $('btnSetView'),
      btnAddLink: $('btnAddLink'),
      hotspotHint: $('hotspotHint'),
      settingAutorotate: $('settingAutorotate'),
      settingFullscreen: $('settingFullscreen'),
      settingViewControls: $('settingViewControls'),
      settingMouseMode: $('settingMouseMode')
    };

    bindEvents();
    showScreen('welcome');
  }

  global.TourBuilderApp = {
    init: init,
    onExportProgress: function() {}
  };

  document.addEventListener('DOMContentLoaded', init);

})(window);
