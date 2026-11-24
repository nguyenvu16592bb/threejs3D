'use strict';
/* UndoRedoManager.js — Undo/Redo bằng action {label, undo(), redo()}.
   Nhóm CORE. Giới hạn 100 bước. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var undoStack = [];
  var redoStack = [];
  var MAX_STEPS = 100;

  function push(action) {
    if (!action || typeof action.undo !== 'function' || typeof action.redo !== 'function') { return; }
    undoStack.push(action);
    if (undoStack.length > MAX_STEPS) { undoStack.shift(); }
    redoStack.length = 0;
    emitChange();
  }

  function undo() {
    if (!canUndo()) { return false; }
    var action = undoStack.pop();
    try { action.undo(); } catch (e) { console.error('[UndoRedo] undo lỗi:', action.label, e); }
    redoStack.push(action);
    emitChange();
    return true;
  }

  function redo() {
    if (!canRedo()) { return false; }
    var action = redoStack.pop();
    try { action.redo(); } catch (e) { console.error('[UndoRedo] redo lỗi:', action.label, e); }
    undoStack.push(action);
    emitChange();
    return true;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }
  function clear() { undoStack.length = 0; redoStack.length = 0; emitChange(); }
  function getUndoLabel() { return canUndo() ? undoStack[undoStack.length - 1].label : ''; }
  function getRedoLabel() { return canRedo() ? redoStack[redoStack.length - 1].label : ''; }

  function emitChange() {
    if (window.PixiEngine.EventBus) {
      window.PixiEngine.EventBus.emit('undo-redo-changed', { canUndo: canUndo(), canRedo: canRedo() });
    }
  }

  // Helper: tạo action snapshot serialize trước/sau (SceneManager dùng cho add/remove/transform-commit).
  function snapshotAction(label, beforeJson, afterJson) {
    var sm = window.PixiEngine.SceneManager;
    if (!sm) { return null; }
    return {
      label: label,
      undo: function () { sm._restoreSnapshot(beforeJson); },
      redo: function () { sm._restoreSnapshot(afterJson); }
    };
  }

  window.PixiEngine.UndoRedoManager = {
    push: push, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    clear: clear, getUndoLabel: getUndoLabel, getRedoLabel: getRedoLabel,
    snapshotAction: snapshotAction
  };
})();
