'use strict';
/* SelectionManager.js — Chọn object trong scene (đơn + đa chọn).
   Nhóm CORE. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var selectedIds = [];

  function select(id) {
    if (id === null || id === undefined) {
      selectedIds = [];
      window.PixiEngine.state.selected = null;
    } else {
      selectedIds = [id];
      // state.selected LUÔN là object (không phải id string): Inspector, Gizmo,
      // TerrainBrush, AnimationEditor đều đọc state.selected như object.
      window.PixiEngine.state.selected = getSelected();
    }
    if (window.PixiEngine.EventBus) {
      window.PixiEngine.EventBus.emit('selection-changed', { selected: getSelected(), selectedIds: selectedIds.slice() });
    }
    return getSelected();
  }

  function getSelected() {
    if (!selectedIds.length) { return null; }
    var sm = window.PixiEngine.SceneManager;
    return sm ? sm.findById(selectedIds[0]) : null;
  }

  function addToSelection(id) {
    if (id === null || id === undefined) { return; }
    if (selectedIds.indexOf(id) === -1) { selectedIds.push(id); }
    var smAdd = window.PixiEngine.SceneManager;
    window.PixiEngine.state.selected = smAdd ? smAdd.findById(selectedIds[selectedIds.length - 1]) : null;
    if (window.PixiEngine.EventBus) {
      window.PixiEngine.EventBus.emit('selection-changed', { selected: getSelected(), selectedIds: selectedIds.slice() });
    }
  }

  function removeFromSelection(id) {
    var i = selectedIds.indexOf(id);
    if (i !== -1) { selectedIds.splice(i, 1); }
    var smRem = window.PixiEngine.SceneManager;
    window.PixiEngine.state.selected = selectedIds.length && smRem ? smRem.findById(selectedIds[selectedIds.length - 1]) : null;
    if (window.PixiEngine.EventBus) {
      window.PixiEngine.EventBus.emit('selection-changed', { selected: getSelected(), selectedIds: selectedIds.slice() });
    }
  }

  function toggleSelection(id) {
    if (selectedIds.indexOf(id) !== -1) { removeFromSelection(id); } else { addToSelection(id); }
  }

  function clearSelection() { select(null); }
  function isSelected(id) { return selectedIds.indexOf(id) !== -1; }

  window.PixiEngine.SelectionManager = {
    select: select,
    getSelected: getSelected,
    addToSelection: addToSelection,
    removeFromSelection: removeFromSelection,
    toggleSelection: toggleSelection,
    clearSelection: clearSelection,
    isSelected: isSelected,
    get selectedIds() { return selectedIds; },
    set selectedIds(v) { selectedIds = Array.isArray(v) ? v.slice() : []; }
  };
  // Giữ selectedIds đồng bộ qua getter trên object trên: các nhóm khác đọc
  // PixiEngine.SelectionManager.selectedIds sẽ thấy mảng hiện tại.
})();
