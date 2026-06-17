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
      viewControlButtons: false
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
  }

  TourPreview.prototype.init = function() {
    if (this._viewer) {
      this.destroy();
    }

    var viewerOpts = {
      controls: {
        mouseViewMode: this._tour.settings.mouseViewMode
      }
    };

    this._viewer = new Marzipano.Viewer(this._container, viewerOpts);
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
    return entry;
  };

  TourPreview.prototype.getCurrentScene = function() {
    return this._current;
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

    // Also update the current view immediately and sync the underlying tour scene.
    this._current.view.setParameters(viewParams);
    this._current.scene.switchTo();
    for (var i = 0; i < this._tour.scenes.length; i++) {
      if (this._tour.scenes[i].id === sceneData.id) {
        this._tour.scenes[i].initialViewParameters = viewParams;
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
