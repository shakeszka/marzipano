#!/usr/bin/env node
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = parseInt(process.env.PORT, 10) || 8000;
var ROOT = path.resolve(__dirname, '..');
var TOUR_BASE = '/tour/';
var MIME_TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json'
};

function safePath(base, requestedPath) {
  var normalized = path.normalize(requestedPath).replace(/^\/+/, '');
  var fullPath = path.join(base, normalized);
  if (fullPath.indexOf(base) !== 0) {
    return null;
  }
  return fullPath;
}

function getStaticFile(reqUrl) {
  var parsedUrl = url.parse(reqUrl);
  var pathname = parsedUrl.pathname;

  if (pathname === '/tour') {
    return { redirect: '/tour/' };
  }
  if (pathname === '/') {
    return { redirect: '/tour/' };
  }

  if (pathname.indexOf(TOUR_BASE) === 0) {
    var subPath = pathname.slice(TOUR_BASE.length);
    if (!subPath || subPath === '/') {
      subPath = 'index.html';
    }
    var filePath = safePath(path.join(ROOT, 'demos', 'tour-builder'), subPath);
    return { path: filePath };
  }

  var filePath = safePath(ROOT, pathname);
  return { path: filePath };
}

function getContentType(filePath) {
  var ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

var server = http.createServer(function(req, res) {
  var result = getStaticFile(req.url);
  if (result && result.redirect) {
    res.writeHead(302, { Location: result.redirect });
    res.end();
    return;
  }
  if (!result || !result.path) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  fs.stat(result.path, function(err, stats) {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(result.path) });
    fs.createReadStream(result.path).pipe(res);
  });
});

server.listen(PORT, function() {
  console.log('Serving tour builder at http://localhost:' + PORT + '/tour/');
});
