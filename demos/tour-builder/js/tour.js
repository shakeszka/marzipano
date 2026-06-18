/*
 * Tour model and Marzipano preview using in-memory tile blobs.
 */
(function(global) {
  'use strict';

  var FACE_ORDER = 'bdflru';

  function buildDefaultLevels() {
    return [
      { tileSize: 256, size: 256, fallbackOnly: true },
      { tileSize: 512, size: 512 },
      { tileSize: 512, size: 1024 },
      { tileSize: 512, size: 2048 },
      { tileSize: 512, size: 4096 }
    ];
  }

  function Tour(name) {
    this.name = name || 'Untitled Tour';
    this.settings = {
      mouseViewMode: 'drag',
      autorotateEnabled: false,
      fullscreenButton: true,
      viewControlButtons: true
      , controlButtonColor: '#677383'
    };
    this.scenes = [];
    this._objectUrls = [];
  }

  Tour.prototype.addScene = function(scene) {
    this.scenes.push(scene);
    this._registerSceneUrls(scene);
    return scene;
  };

  Tour.prototype.removeScene = function(id) {
    var scene = this.getScene(id);
    if (!scene) {
      return;
    }
    this._revokeSceneUrls(scene);
    this.scenes = this.scenes.filter(function(s) { return s.id !== id; });
    this.scenes.forEach(function(s) {
      s.linkHotspots = s.linkHotspots.filter(function(h) { return h.target !== id; });
    });
  };

  Tour.prototype.getScene = function(id) {
    for (var i = 0; i < this.scenes.length; i++) {
      if (this.scenes[i].id === id) {
        return this.scenes[i];
      }
    }
    return null;
  };

  Tour.prototype.toData = function() {
    return {
      name: this.name,
      settings: this.settings,
      scenes: this.scenes.map(function(scene) {
        return {
          id: scene.id,
          name: scene.name,
          levels: scene.levels,
          faceSize: scene.faceSize,
          initialViewParameters: scene.initialViewParameters,
          linkHotspots: scene.linkHotspots.slice()
        };
      })
    };
  };

  Tour.prototype._registerSceneUrls = function(scene) {
    scene.previewUrl = URL.createObjectURL(scene.previewBlob);
    scene.tileUrls = {};
    Object.keys(scene.tileBlobs).forEach(function(key) {
      scene.tileUrls[key] = URL.createObjectURL(scene.tileBlobs[key]);
    });
    this._objectUrls.push(scene.previewUrl);
    Object.keys(scene.tileUrls).forEach(function(key) {
      this._objectUrls.push(scene.tileUrls[key]);
    }, this);
  };

  Tour.prototype._revokeSceneUrls = function(scene) {
    if (scene.previewUrl) {
      URL.revokeObjectURL(scene.previewUrl);
    }
    if (scene.tileUrls) {
      Object.keys(scene.tileUrls).forEach(function(key) {
        URL.revokeObjectURL(scene.tileUrls[key]);
      });
    }
  };

  Tour.prototype.destroy = function() {
    this.scenes.forEach(this._revokeSceneUrls.bind(this));
    this._objectUrls = [];
    this.scenes = [];
  };

  function createTileSource(scene) {
    var previewUrl = scene.previewUrl;
    var tileUrls = scene.tileUrls;
    return new Marzipano.ImageUrlSource(function(tile) {
      if (tile.z === 0) {
        var y = FACE_ORDER.indexOf(tile.face) / 6;
        return {
          url: previewUrl,
          rect: { x: 0, y: y, width: 1, height: 1 / 6 }
        };
      }
      var key = tile.z + '/' + tile.face + '/' + tile.y + '/' + tile.x;
      return { url: tileUrls[key] };
    });
  }

  function TourPreview(container, tour) {
    this._container = container;
    this._tour = tour;
    this._viewer = null;
    this._scenes = [];
    this._current = null;
    this._hotspotMode = null;
    this._hotspotClickHandler = null;
    this._sceneSwitchHandler = null;
    this._autorotate = null;
    this._controlMethods = [];
  }

  TourPreview.prototype.init = function() {
    if (this._viewer) {
      this.destroy();
    }

    var viewerOpts = {
      controls: {
        mouseViewMode: this._tour.settings.mouseViewMode,
        fullscreenButton: this._tour.settings.fullscreenButton,
        viewControlButtons: this._tour.settings.viewControlButtons
      }
    };

    this._viewer = new Marzipano.Viewer(this._container, viewerOpts);
    this._autorotate = Marzipano.autorotate({
      yawSpeed: 0.8,
      targetPitch: 0,
      targetFov: Math.PI / 2
    });

    var controlButtonColor = this._tour.settings.controlButtonColor;
    var initialButtonColor = controlButtonColor ? hexToRgba(controlButtonColor, 0.55) : 'rgba(103,115,131,0.8)';

    // Ensure view control buttons exist in the DOM for the preview and register control methods
    (function(self) {
      var parent = self._container.parentNode || document.body;
      var btnDefs = [
        { id: 'viewUp', cls: 'viewControlButton viewControlButton-1', icon: 'up.png', alt: 'Up' },
        { id: 'viewDown', cls: 'viewControlButton viewControlButton-2', icon: 'down.png', alt: 'Down' },
        { id: 'viewLeft', cls: 'viewControlButton viewControlButton-3', icon: 'left.png', alt: 'Left' },
        { id: 'viewRight', cls: 'viewControlButton viewControlButton-4', icon: 'right.png', alt: 'Right' },
        { id: 'viewIn', cls: 'viewControlButton viewControlButton-5', icon: 'plus.png', alt: 'Zoom in' },
        { id: 'viewOut', cls: 'viewControlButton viewControlButton-6', icon: 'minus.png', alt: 'Zoom out' }
      ];
      btnDefs.forEach(function(def, idx) {
        var el = document.getElementById(def.id);
        if (!el) {
          el = document.createElement('a');
          el.href = 'javascript:void(0)';
          el.id = def.id;
          el.className = def.cls;
          el.style.position = 'absolute';
          el.style.right = '12px';
          el.style.bottom = (12 + idx * 48) + 'px';
          el.style.width = '40px';
          el.style.height = '40px';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.borderRadius = '6px';
          el.style.zIndex = 999;
          el.style.background = initialButtonColor;
          parent.appendChild(el);
        } else {
          el.style.background = initialButtonColor;
        }
        if (!el.querySelector('.icon')) {
          var iconEl = document.createElement('img');
          iconEl.className = 'icon';
          iconEl.src = '/demos/sample-tour/img/' + def.icon;
          iconEl.alt = def.alt;
          iconEl.style.width = '24px';
          iconEl.style.height = '24px';
          iconEl.style.pointerEvents = 'none';
          el.appendChild(iconEl);
        }
      });

      var titleBar = document.getElementById('titleBar');
      if (!titleBar) {
        titleBar = document.createElement('div');
        titleBar.id = 'titleBar';
        var nameEl = document.createElement('h1');
        nameEl.className = 'sceneName';
        nameEl.style.margin = '0';
        nameEl.style.padding = '0 10px';
        nameEl.style.fontSize = '16px';
        nameEl.style.lineHeight = '40px';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.style.flex = '1';
        titleBar.appendChild(nameEl);
        parent.appendChild(titleBar);
      }
      titleBar.style.position = 'absolute';
      titleBar.style.top = '0';
      titleBar.style.left = '40px';
      titleBar.style.right = '80px';
      titleBar.style.height = '40px';
      titleBar.style.padding = '0 10px';
      titleBar.style.zIndex = '1001';
      titleBar.style.pointerEvents = 'none';
      titleBar.style.display = 'flex';
      titleBar.style.alignItems = 'center';
      titleBar.style.background = 'rgba(0,0,0,0.3)';
      titleBar.style.color = '#fff';

      var toggleDefs = [
        { id: 'autorotateToggle', icons: ['play.png', 'pause.png'], left: '', right: '40px', top: '0', alt: 'Autorotate' },
        { id: 'fullscreenToggle', icons: ['fullscreen.png', 'windowed.png'], left: '', right: '0', top: '0', alt: 'Fullscreen' },
        { id: 'sceneListToggle', icons: ['expand.png', 'collapse.png'], left: '0', right: '', top: '0', alt: 'Scene list' }
      ];
      var toggles = {};
      toggleDefs.forEach(function(def) {
        var el = document.getElementById(def.id);
        if (!el) {
          el = document.createElement('a');
          el.href = 'javascript:void(0)';
          el.id = def.id;
          el.style.position = 'absolute';
          if (def.left !== '') {
            el.style.left = def.left;
          }
          if (def.right !== '') {
            el.style.right = def.right;
          }
          el.style.top = def.top;
          el.style.width = '40px';
          el.style.height = '40px';
          el.style.padding = '5px';
          el.style.background = initialButtonColor;
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.zIndex = '1001';
          el.style.cursor = 'pointer';
          parent.appendChild(el);
        } else {
          el.style.background = initialButtonColor;
        }
        if (!el.querySelector('.icon.off')) {
          var imgOff = document.createElement('img');
          imgOff.className = 'icon off';
          imgOff.src = '/demos/sample-tour/img/' + def.icons[0];
          imgOff.alt = def.alt + ' off';
          imgOff.style.position = 'absolute';
          imgOff.style.top = '0';
          imgOff.style.left = '0';
          imgOff.style.width = '100%';
          imgOff.style.height = '100%';
          imgOff.style.pointerEvents = 'none';
          el.appendChild(imgOff);
        }
        if (!el.querySelector('.icon.on')) {
          var imgOn = document.createElement('img');
          imgOn.className = 'icon on';
          imgOn.src = '/demos/sample-tour/img/' + def.icons[1];
          imgOn.alt = def.alt + ' on';
          imgOn.style.position = 'absolute';
          imgOn.style.top = '0';
          imgOn.style.left = '0';
          imgOn.style.width = '100%';
          imgOn.style.height = '100%';
          imgOn.style.pointerEvents = 'none';
          imgOn.style.display = 'none';
          el.appendChild(imgOn);
        }
        toggles[def.id] = el;
      });

      function setToggleState(el, enabled) {
        if (!el) return;
        el.classList.toggle('enabled', enabled);
        var iconOn = el.querySelector('.icon.on');
        var iconOff = el.querySelector('.icon.off');
        if (iconOn && iconOff) {
          iconOn.style.display = enabled ? 'block' : 'none';
          iconOff.style.display = enabled ? 'none' : 'block';
        }
      }

      var sidebarLeft = self._container.parentNode.parentNode.querySelector('.sidebar-left');
      var sceneListToggleElement = toggles.sceneListToggle;
      if (sceneListToggleElement && !sceneListToggleElement._handlerAttached) {
        sceneListToggleElement.addEventListener('click', function() {
          if (sidebarLeft) {
            var hidden = sidebarLeft.classList.toggle('hidden');
            setToggleState(sceneListToggleElement, !hidden);
          }
          if (self._controlToggleHandler) {
            self._controlToggleHandler('sceneListToggle', sidebarLeft && !sidebarLeft.classList.contains('hidden'));
          }
        });
        sceneListToggleElement._handlerAttached = true;
      }

      var autorotateToggleElement = toggles.autorotateToggle;
      if (autorotateToggleElement && !autorotateToggleElement._handlerAttached) {
        autorotateToggleElement.addEventListener('click', function() {
          var enabled = !autorotateToggleElement.classList.contains('enabled');
          setToggleState(autorotateToggleElement, enabled);
          self._tour.settings.autorotateEnabled = enabled;
          if (enabled) {
            self.startAutorotate();
          } else {
            self.stopAutorotate();
          }
          if (self._controlToggleHandler) {
            self._controlToggleHandler('autorotateEnabled', enabled);
          }
        });
        autorotateToggleElement._handlerAttached = true;
      }

      var previewPanel = self._container.parentNode;
      var fullscreenToggleElement = toggles.fullscreenToggle;
      if (fullscreenToggleElement && !fullscreenToggleElement._handlerAttached) {
        fullscreenToggleElement.addEventListener('click', function() {
          var inFs = document.fullscreenElement === previewPanel;
          if (!inFs) {
            if (previewPanel.requestFullscreen) {
              previewPanel.requestFullscreen();
            } else if (previewPanel.webkitRequestFullscreen) {
              previewPanel.webkitRequestFullscreen();
            }
          } else if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        });
        fullscreenToggleElement._handlerAttached = true;
      }

      document.addEventListener('fullscreenchange', function() {
        setToggleState(fullscreenToggleElement, document.fullscreenElement === previewPanel);
      });

      setToggleState(autorotateToggleElement, !!self._tour.settings.autorotateEnabled);
      setToggleState(sceneListToggleElement, !(sidebarLeft && sidebarLeft.classList.contains('hidden')));
      setToggleState(fullscreenToggleElement, document.fullscreenElement === previewPanel);
      self._updateTitleBar(self._tour.scenes.length ? self._tour.scenes[0].name : '');

      var controls = self._viewer.controls();
      var velocity = 0.7;
      var friction = 3;
      var up = document.getElementById('viewUp');
      var down = document.getElementById('viewDown');
      var left = document.getElementById('viewLeft');
      var right = document.getElementById('viewRight');
      var inEl = document.getElementById('viewIn');
      var outEl = document.getElementById('viewOut');
      if (up) {
        var upMethod = new Marzipano.ElementPressControlMethod(up, 'y', -velocity, friction);
        controls.registerMethod('preview-upElement', upMethod, true);
        self._controlMethods.push(upMethod);
      }
      if (down) {
        var downMethod = new Marzipano.ElementPressControlMethod(down, 'y', velocity, friction);
        controls.registerMethod('preview-downElement', downMethod, true);
        self._controlMethods.push(downMethod);
      }
      if (left) {
        var leftMethod = new Marzipano.ElementPressControlMethod(left, 'x', -velocity, friction);
        controls.registerMethod('preview-leftElement', leftMethod, true);
        self._controlMethods.push(leftMethod);
      }
      if (right) {
        var rightMethod = new Marzipano.ElementPressControlMethod(right, 'x', velocity, friction);
        controls.registerMethod('preview-rightElement', rightMethod, true);
        self._controlMethods.push(rightMethod);
      }
      if (inEl) {
        var inMethod = new Marzipano.ElementPressControlMethod(inEl, 'zoom', -velocity, friction);
        controls.registerMethod('preview-inElement', inMethod, true);
        self._controlMethods.push(inMethod);
      }
      if (outEl) {
        var outMethod = new Marzipano.ElementPressControlMethod(outEl, 'zoom', velocity, friction);
        controls.registerMethod('preview-outElement', outMethod, true);
        self._controlMethods.push(outMethod);
      }
    })(this);

    this._applyControlButtonColor();

    this._scenes = this._tour.scenes.map(function(sceneData) {
      return this._createScene(sceneData);
    }, this);

    if (this._scenes.length) {
      this.switchScene(this._scenes[0].data.id);
    }
  };

  TourPreview.prototype._createScene = function(sceneData) {
    var source;
    // If the scene references a remote imageUrl (saved tour), use the same
    // ImageUrlSource pattern as the viewer to fetch tiles from Supabase.
    if (sceneData.imageUrl || sceneData.image_url) {
      var imageUrl = sceneData.imageUrl || sceneData.image_url;
      var supabaseBase = 'https://qnquicysinpybpnlqtan.supabase.co/storage/v1/object/public/panoramas/';
      source = new Marzipano.ImageUrlSource(function(tile) {
        if (tile.z === 0) {
          return { url: supabaseBase + imageUrl + '/1/' + tile.face + '/0/0.jpg' };
        }
        var tilePath = imageUrl + '/' + tile.z + '/' + tile.face + '/' + tile.y + '/' + tile.x + '.jpg';
        return { url: supabaseBase + tilePath };
      });
    } else {
      source = createTileSource(sceneData);
    }

    // Ensure levels and faceSize have sensible defaults so CubeGeometry doesn't throw
    var levels = Array.isArray(sceneData.levels) ? sceneData.levels : buildDefaultLevels();
    var faceSize = sceneData.faceSize || sceneData.face_size || (levels[levels.length - 1] && levels[levels.length - 1].size) || 4096;
    var geometry = new Marzipano.CubeGeometry(levels);
    var limiter = Marzipano.RectilinearView.limit.traditional(
      faceSize,
      100 * Math.PI / 180,
      120 * Math.PI / 180
    );
    var view = new Marzipano.RectilinearView(sceneData.initialViewParameters, limiter);
    var scene = this._viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    sceneData.linkHotspots.forEach(function(hotspot) {
      this._addLinkHotspot(scene, sceneData, hotspot);
    }, this);

    return { data: sceneData, scene: scene, view: view };
  };

  function hexToRgba(hex, alpha) {
    if (!hex) {
      return '';
    }
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
      return r + r + g + g + b + b;
    });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return hex;
    }
    var r = parseInt(result[1], 16);
    var g = parseInt(result[2], 16);
    var b = parseInt(result[3], 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  TourPreview.prototype._applyControlButtonColor = function() {
    var color = this._tour.settings.controlButtonColor;
    var transparent = color ? hexToRgba(color, 0.55) : '';
    var titleBarColor = color ? hexToRgba(color, 0.45) : '';
    var sel = '.viewControlButton, #fullscreenToggle, #autorotateToggle, #sceneListToggle';
    var buttons = document.querySelectorAll(sel);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].style.backgroundColor = transparent;
    }
    var titleBar = document.getElementById('titleBar');
    if (titleBar) {
      titleBar.style.backgroundColor = titleBarColor;
    }
  };

  TourPreview.prototype._addLinkHotspot = function(marzipanoScene, sceneData, hotspot) {
    var self = this;
    var wrapper = document.createElement('div');
    wrapper.className = 'hotspot link-hotspot preview-hotspot';

    var target = this._tour.getScene(hotspot.target);
    if (target) {
      var label = document.createElement('div');
      label.className = 'preview-link-label';
      label.textContent = target.name;
      wrapper.appendChild(label);
    }

    var icon = document.createElement('div');
    icon.className = 'link-hotspot-icon preview-link-icon';
    wrapper.appendChild(icon);

    var marzipanoHotspot = marzipanoScene.hotspotContainer().createHotspot(wrapper, {
      yaw: hotspot.yaw,
      pitch: hotspot.pitch
    });

    var dragState = { active: false, moved: false, startX: 0, startY: 0 };

    function updateHotspotPosition(event) {
      var rect = self._container.getBoundingClientRect();
      var coords = self._current.view.screenToCoordinates({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      if (!coords) {
        return;
      }
      marzipanoHotspot.setPosition(coords);
      hotspot.yaw = coords.yaw;
      hotspot.pitch = coords.pitch;
    }

    function onPointerMove(event) {
      if (!dragState.active) {
        return;
      }
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
        dragState.moved = true;
      }
      event.preventDefault();
      updateHotspotPosition(event);
    }

    function onPointerUp(event) {
      if (!dragState.active) {
        return;
      }
      dragState.active = false;
      wrapper.releasePointerCapture(event.pointerId);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      if (dragState.moved) {
        event.stopPropagation();
      }
    }

    wrapper.addEventListener('pointerdown', function(event) {
      if (self._hotspotMode || event.button !== 0) {
        return;
      }
      dragState.active = true;
      dragState.moved = false;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      wrapper.setPointerCapture(event.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      event.stopPropagation();
      event.preventDefault();
    });

    wrapper.addEventListener('click', function(e) {
      e.stopPropagation();
      if (self._hotspotMode || dragState.moved) {
        dragState.moved = false;
        return;
      }
      self.switchScene(hotspot.target);
    });
  };

  TourPreview.prototype.switchScene = function(id) {
    this.stopAutorotate();
    var entry = this._scenes.filter(function(s) { return s.data.id === id; })[0];
    if (!entry) {
      var sceneData = this._tour.getScene(id);
      if (!sceneData) {
        return null;
      }
      entry = this._createScene(sceneData);
      this._scenes.push(entry);
    }
    entry.view.setParameters(entry.data.initialViewParameters);
    entry.scene.switchTo();
    this._current = entry;
    if (this._sceneSwitchHandler) {
      this._sceneSwitchHandler(id);
    }
    if (this._tour.settings.autorotateEnabled) {
      this.startAutorotate();
    }
    this._updateTitleBar(entry.data.name || entry.data.title || '');
    return entry;
  };

  TourPreview.prototype.getCurrentScene = function() {
    return this._current;
  };

  TourPreview.prototype.startAutorotate = function() {
    if (!this._viewer || !this._autorotate) {
      return;
    }
    this._viewer.startMovement(this._autorotate);
    this._viewer.setIdleMovement(3000, this._autorotate);
  };

  TourPreview.prototype.stopAutorotate = function() {
    if (!this._viewer) {
      return;
    }
    this._viewer.stopMovement();
    this._viewer.setIdleMovement(Infinity);
  };

  TourPreview.prototype.setInitialViewFromCurrent = function() {
    if (!this._current) {
      return;
    }
    var params = this._current.view.parameters();
    var sceneData = this._current.data;
    var viewParams = {
      yaw: params.yaw,
      pitch: params.pitch,
      fov: params.fov
    };
    sceneData.initialViewParameters = viewParams;
    sceneData.initialYaw = viewParams.yaw;
    sceneData.initialPitch = viewParams.pitch;

    // Also update the current view immediately and sync the underlying tour scene.
    this._current.view.setParameters(viewParams);
    this._current.scene.switchTo();
    for (var i = 0; i < this._tour.scenes.length; i++) {
      if (this._tour.scenes[i].id === sceneData.id) {
        this._tour.scenes[i].initialViewParameters = viewParams;
        this._tour.scenes[i].initialYaw = viewParams.yaw;
        this._tour.scenes[i].initialPitch = viewParams.pitch;
        break;
      }
    }
  };

  TourPreview.prototype.setHotspotMode = function(mode, callback) {
    this._hotspotMode = mode;
    this._hotspotClickHandler = callback;
    this._container.classList.toggle('placing-hotspot', !!mode);
  };

  TourPreview.prototype.onSceneSwitch = function(handler) {
    this._sceneSwitchHandler = handler;
  };

  TourPreview.prototype.onControlToggle = function(handler) {
    this._controlToggleHandler = handler;
  };

  TourPreview.prototype._updateTitleBar = function(sceneName) {
    var titleBar = document.getElementById('titleBar');
    if (!titleBar) {
      return;
    }
    var sceneNameEl = titleBar.querySelector('.sceneName');
    if (sceneNameEl) {
      sceneNameEl.textContent = sceneName || '';
    }
  };

  TourPreview.prototype.handleClick = function(event) {
    if (!this._hotspotMode || !this._current) {
      return;
    }
    var rect = this._container.getBoundingClientRect();
    var coords = this._current.view.screenToCoordinates({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
    if (!coords) {
      return;
    }
    if (this._hotspotClickHandler) {
      this._hotspotClickHandler({
        yaw: coords.yaw,
        pitch: coords.pitch,
        rotation: 0
      });
    }
    this.setHotspotMode(null, null);
  };

  TourPreview.prototype.refresh = function() {
    this.init();
  };

  TourPreview.prototype.destroy = function() {
    if (this._controlMethods && this._controlMethods.length) {
      this._controlMethods.forEach(function(method) {
        if (method && typeof method.destroy === 'function') {
          method.destroy();
        }
      });
      this._controlMethods = [];
    }
    if (this._viewer) {
      this._viewer.destroy();
      this._viewer = null;
    }
    this._scenes = [];
    this._current = null;
  };

  global.Tour = Tour;
  global.TourPreview = TourPreview;

})(window);
