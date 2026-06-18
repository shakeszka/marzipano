/*
 * Browser-side panorama processor: equirect/cubefaces → cube tile pyramid.
 */
(function(global) {
  'use strict';

  var FACES = ['b', 'd', 'f', 'l', 'r', 'u'];
  var FACE_ORDER = 'bdflru';
  var MAX_FACE_SIZE = 4096;
  var JPEG_QUALITY = 0.92;
  var CUBE_SUFFIXES = {
    '_b': 'b', '_d': 'd', '_f': 'f', '_l': 'l', '_r': 'r', '_u': 'u', '_t': 'u'
  };

  var VERT_SHADER = [
    'attribute vec2 aPos;',
    'varying vec2 vUV;',
    'void main() {',
    '  vUV = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_SHADER = [
    'precision mediump float;',
    'uniform sampler2D uTexture;',
    'uniform int uFace;',
    'varying vec2 vUV;',
    'const float PI = 3.141592653589793;',
    'vec2 directionToEquirectUV(vec3 dir) {',
    '  float lon = atan(dir.x, -dir.z);',
    '  float lat = asin(clamp(dir.y, -1.0, 1.0));',
    '  return vec2(-lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);',
    '}',
    'vec3 faceDirection(int face, vec2 fc) {',
    '  if (face == 0) return vec3(-fc.x,  fc.y, -1.0);', // b
    '  if (face == 1) return vec3( fc.x, -1.0,  fc.y);', // d
    '  if (face == 2) return vec3( fc.x,  fc.y,  1.0);', // f
    '  if (face == 3) return vec3(-1.0,  fc.y,  fc.x);', // l
    '  if (face == 4) return vec3( 1.0,  fc.y, -fc.x);', // r
    '  return vec3(fc.x,  1.0, -fc.y);',                 // u
    '}',
    'void main() {',
    '  vec2 fc = vUV * 2.0 - 1.0;',
    '  vec3 dir = normalize(faceDirection(uFace, fc));',
    '  gl_FragColor = texture2D(uTexture, directionToEquirectUV(dir));',
    '}'
  ].join('\n');

  function floorPower2(n) {
    var p = 1;
    while (p * 2 <= n) {
      p *= 2;
    }
    return p;
  }

  function slugify(name) {
    return name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'scene';
  }

  function uniqueId(base, existing) {
    var id = slugify(base);
    var candidate = id;
    var i = 2;
    while (existing[candidate]) {
      candidate = id + '-' + i;
      i += 1;
    }
    return candidate;
  }

  function computeFaceSize(width, height) {
    return floorPower2(Math.min(Math.floor(width / 2), height, MAX_FACE_SIZE));
  }

  function computeLevels(faceSize) {
    var levels = [{ tileSize: 256, size: 256, fallbackOnly: true }];
    for (var size = 512; size <= faceSize; size *= 2) {
      levels.push({ tileSize: 512, size: size });
    }
    return levels;
  }

  function loadImageFromFile(file) {
    return new Promise(function(resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function() {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image: ' + file.name));
      };
      image.src = url;
    });
  }

  function createCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function resizeImage(source, width, height) {
    var canvas = createCanvas(width, height);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function(resolve) {
      canvas.toBlob(function(blob) {
        resolve(blob);
      }, 'image/jpeg', JPEG_QUALITY);
    });
  }

  function createGlConverter() {
    var canvas = createCanvas(1, 1);
    var gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) {
      throw new Error('WebGL is required to process panoramas.');
    }

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    var posLoc = gl.getAttribLocation(program, 'aPos');
    var faceLoc = gl.getUniformLocation(program, 'uFace');
    var texLoc = gl.getUniformLocation(program, 'uTexture');

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return {
      convertFace: function(image, faceIndex, faceSize) {
        canvas.width = faceSize;
        canvas.height = faceSize;
        gl.viewport(0, 0, faceSize, faceSize);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.uniform1i(texLoc, 0);
        gl.uniform1i(faceLoc, faceIndex);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        var out = createCanvas(faceSize, faceSize);
        out.getContext('2d').drawImage(canvas, 0, 0);
        return out;
      }
    };
  }

  function convertEquirectToFaces(image, faceSize, onProgress) {
    var converter = createGlConverter();
    var faces = {};
    for (var i = 0; i < FACES.length; i++) {
      faces[FACES[i]] = converter.convertFace(image, i, faceSize);
      if (onProgress) {
        onProgress('Converting face ' + FACES[i], (i + 1) / FACES.length * 0.4);
      }
    }
    return faces;
  }

  function faceFromFilename(filename) {
    var lower = filename.toLowerCase();
    var face = null;
    Object.keys(CUBE_SUFFIXES).some(function(suffix) {
      if (lower.indexOf(suffix + '.') !== -1 || lower.endsWith(suffix)) {
        face = CUBE_SUFFIXES[suffix];
        return true;
      }
      return false;
    });
    return face;
  }

  function loadCubeFacesFromFiles(files, onProgress) {
    var grouped = {};
    var promises = [];

    files.forEach(function(file) {
      var face = faceFromFilename(file.name);
      if (!face) {
        return;
      }
      promises.push(loadImageFromFile(file).then(function(image) {
        grouped[face] = image;
      }));
    });

    return Promise.all(promises).then(function() {
      FACES.forEach(function(face) {
        if (!grouped[face]) {
          throw new Error('Missing cubeface for "' + face + '" (expected suffix _' + face + ').');
        }
      });

      var faceSize = MAX_FACE_SIZE;
      FACES.forEach(function(face) {
        faceSize = Math.min(faceSize, grouped[face].width, grouped[face].height);
      });
      faceSize = floorPower2(faceSize);
      if (faceSize < 512) {
        throw new Error('Cubeface images are too small. Minimum face size is 512px.');
      }

      var faces = {};
      FACES.forEach(function(face, index) {
        faces[face] = resizeImage(grouped[face], faceSize, faceSize);
        if (onProgress) {
          onProgress('Loaded face ' + face, (index + 1) / FACES.length * 0.4);
        }
      });
      return { faces: faces, faceSize: faceSize };
    });
  }

  function buildFacePyramid(faces, levels) {
    var pyramid = [];
    levels.forEach(function(level, index) {
      if (level.fallbackOnly) {
        return;
      }
      var levelFaces = {};
      FACES.forEach(function(face) {
        levelFaces[face] = resizeImage(faces[face], level.size, level.size);
      });
      pyramid[index] = levelFaces;
    });
    return pyramid;
  }

  function generatePreview(faces) {
    var previewSize = 256;
    var canvas = createCanvas(previewSize, previewSize * FACES.length);
    var ctx = canvas.getContext('2d');
    FACE_ORDER.split('').forEach(function(face, index) {
      ctx.drawImage(
        resizeImage(faces[face], previewSize, previewSize),
        0, index * previewSize, previewSize, previewSize
      );
    });
    return canvas;
  }

  function generateTiles(pyramid, levels, onProgress) {
    var tiles = {};
    var tileBlobs = {};
    var total = 0;
    var done = 0;

    levels.forEach(function(level, z) {
      if (level.fallbackOnly) {
        return;
      }
      var faceSet = pyramid[z];
      if (!faceSet) {
        return;
      }
      var tilesPerSide = level.size / level.tileSize;
      total += FACES.length * tilesPerSide * tilesPerSide;
    });

    var chain = Promise.resolve();

    levels.forEach(function(level, z) {
      if (level.fallbackOnly) {
        return;
      }
      var faceSet = pyramid[z];
      if (!faceSet) {
        return;
      }
      var tilesPerSide = level.size / level.tileSize;

      FACES.forEach(function(face) {
        for (var y = 0; y < tilesPerSide; y++) {
          for (var x = 0; x < tilesPerSide; x++) {
            (function(zVal, faceVal, xVal, yVal, levelInfo, faceCanvas) {
              chain = chain.then(function() {
                var tileCanvas = createCanvas(levelInfo.tileSize, levelInfo.tileSize);
                tileCanvas.getContext('2d').drawImage(
                  faceCanvas,
                  xVal * levelInfo.tileSize,
                  yVal * levelInfo.tileSize,
                  levelInfo.tileSize,
                  levelInfo.tileSize,
                  0, 0,
                  levelInfo.tileSize,
                  levelInfo.tileSize
                );
                var key = zVal + '/' + faceVal + '/' + yVal + '/' + xVal;
                return canvasToBlob(tileCanvas).then(function(blob) {
                  tileBlobs[key] = blob;
                  done += 1;
                  if (onProgress) {
                    onProgress('Generating tiles', 0.4 + (done / total) * 0.55);
                  }
                });
              });
            })(z, face, x, y, level, faceSet[face]);
          }
        }
      });
    });

    return chain.then(function() {
      return tileBlobs;
    });
  }

  function detectInputType(files) {
    if (files.length === 1) {
      return 'equirect';
    }
    var cubeCount = 0;
    files.forEach(function(file) {
      if (faceFromFilename(file.name)) {
        cubeCount += 1;
      }
    });
    if (cubeCount >= 6) {
      return 'cubefaces';
    }
    throw new Error('Could not detect input type. Provide one equirectangular image (2:1) or six cubefaces (_b, _d, _f, _l, _r, _u).');
  }

  function processFiles(files, existingIds, onProgress) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) {
      return Promise.reject(new Error('No files selected.'));
    }

    var inputType = detectInputType(list);
    var name = list[0].name;
    var id = uniqueId(name, existingIds);

    if (inputType === 'equirect') {
      return loadImageFromFile(list[0]).then(function(image) {
        if (image.width < image.height * 2) {
          throw new Error('Equirectangular image must have a 2:1 aspect ratio.');
        }
        var faceSize = computeFaceSize(image.width, image.height);
        if (faceSize < 512) {
          throw new Error('Image is too small. Minimum cube face size is 512px.');
        }
        if (onProgress) {
          onProgress('Converting equirectangular panorama', 0.05);
        }
        var faces = convertEquirectToFaces(image, faceSize, onProgress);
        return finalizeScene(id, name, faceSize, faces, onProgress);
      });
    }

    return loadCubeFacesFromFiles(list, onProgress).then(function(result) {
      return finalizeScene(id, name, result.faceSize, result.faces, onProgress);
    });
  }

  function finalizeScene(id, name, faceSize, faces, onProgress) {
    var levels = computeLevels(faceSize);
    if (onProgress) {
      onProgress('Building preview', 0.38);
    }
    var previewCanvas = generatePreview(faces);
    return canvasToBlob(previewCanvas).then(function(previewBlob) {
      var pyramid = buildFacePyramid(faces, levels);
      return generateTiles(pyramid, levels, onProgress).then(function(tileBlobs) {
        if (onProgress) {
          onProgress('Done', 1);
        }
        return {
          id: id,
          name: name.replace(/\.[^.]+$/, ''),
          levels: levels,
          faceSize: faceSize,
          previewBlob: previewBlob,
          tileBlobs: tileBlobs,
          initialViewParameters: {
            pitch: 0,
            yaw: 0,
            fov: Math.PI / 2
          },
          linkHotspots: []
        };
      });
    });
  }

  global.PanoProcessor = {
    FACES: FACES,
    FACE_ORDER: FACE_ORDER,
    MAX_FACE_SIZE: MAX_FACE_SIZE,
    computeLevels: computeLevels,
    processFiles: processFiles,
    slugify: slugify,
    uniqueId: uniqueId
  };

})(window);
