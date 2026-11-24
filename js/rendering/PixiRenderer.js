'use strict';
/* PixiRenderer.js — Overlay PixiJS v8 trên canvas #pixi-overlay: HUD, crosshair, text.
   Nhóm RENDERING. Nếu PIXI chưa load thì degrade gracefully (không crash). */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var app = null;
  var available = false;
  var overlayText = null;
  var crosshair = null;
  var fallbackDiv = null;

  function init() {
    var canvas = document.getElementById('pixi-overlay');
    if (!canvas) { return false; }
    if (typeof PIXI === 'undefined') {
      console.warn('[PixiRenderer] PIXI chưa load — HUD overlay tắt, engine vẫn chạy.');
      available = false;
      return false;
    }
    try {
      app = new PIXI.Application();
      var p = app.init({
        canvas: canvas,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
      });
      if (p && typeof p.then === 'function') {
        p.then(function () { afterInit(canvas); }).catch(function (e) {
          console.warn('[PixiRenderer] init lỗi:', e);
          available = false;
        });
      } else { afterInit(canvas); }
      return true;
    } catch (e) {
      console.warn('[PixiRenderer] init lỗi:', e);
      available = false;
      return false;
    }
  }

  function afterInit(canvas) {
    available = true;
    resizeToCanvas(canvas);
    drawCrosshair();
    overlayText = new PIXI.Text({ text: '', style: { fontFamily: 'Segoe UI, sans-serif', fontSize: 14, fill: 0xffffff } });
    overlayText.position.set(12, 12);
    app.stage.addChild(overlayText);
    window.addEventListener('resize', resize);
  }

  function resizeToCanvas(canvas) {
    if (!app || !canvas) { return; }
    var wrap = document.getElementById('viewport-wrap');
    var w = wrap ? wrap.clientWidth : canvas.clientWidth || 800;
    var h = wrap ? wrap.clientHeight : canvas.clientHeight || 600;
    try { app.renderer.resize(w, h); } catch (e) {}
  }
  function resize() { resizeToCanvas(document.getElementById('pixi-overlay')); }

  function drawCrosshair() {
    if (!app) { return; }
    if (crosshair) { try { app.stage.removeChild(crosshair); crosshair.destroy(); } catch (e) {} }
    crosshair = new PIXI.Graphics();
    var w = app.screen.width, h = app.screen.height;
    var cx = w / 2, cy = h / 2, r = 10, gap = 4;
    crosshair.stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
    crosshair.moveTo(cx - r - gap, cy); crosshair.lineTo(cx - gap, cy);
    crosshair.moveTo(cx + gap, cy); crosshair.lineTo(cx + r + gap, cy);
    crosshair.moveTo(cx, cy - r - gap); crosshair.lineTo(cx, cy - gap);
    crosshair.moveTo(cx, cy + gap); crosshair.lineTo(cx, cy + r + gap);
    crosshair.circle(cx, cy, 2); crosshair.fill({ color: 0xffffff, alpha: 0.85 });
    app.stage.addChild(crosshair);
  }

  // Vẽ/hiện text overlay (HUD). Fallback sang div DOM khi PIXI không có.
  function drawTextOverlay(text) {
    if (available && overlayText) { overlayText.text = String(text || ''); return true; }
    if (!fallbackDiv) {
      fallbackDiv = document.createElement('div');
      fallbackDiv.id = 'pixi-fallback-text';
      fallbackDiv.style.cssText = 'position:absolute;top:12px;left:12px;z-index:6;color:#fff;font-size:14px;pointer-events:none;text-shadow:0 1px 2px #000;';
      var wrap = document.getElementById('viewport-wrap');
      if (wrap) { wrap.appendChild(fallbackDiv); }
    }
    fallbackDiv.textContent = String(text || '');
    return true;
  }

  function clearOverlay() {
    if (overlayText) { overlayText.text = ''; }
    if (fallbackDiv) { fallbackDiv.textContent = ''; }
  }

  function getApp() { return app; }
  function isAvailable() { return available; }

  window.PixiEngine.PixiRenderer = {
    init: init, resize: resize, drawTextOverlay: drawTextOverlay,
    clearOverlay: clearOverlay, drawCrosshair: drawCrosshair,
    getApp: getApp, isAvailable: isAvailable
  };
  // Alias: WidgetManager (nhóm khác) sẽ vẽ widget UI qua PixiRenderer/WidgetManager.
  window.PixiEngine.WidgetManager = window.PixiEngine.WidgetManager || null;
})();
