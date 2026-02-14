import { d as derived, w as writable, t as template_effect, k as get, C as set_text, h as append, n as user_derived, r as child, m as from_html, a as delegate, p as push, e as event, $ as $window, f as first_child, v as sibling, i as if_block, x as set_class, y as set_attribute, c as delegated, j as pop, s as setup_stores, o as state, l as set, G as autofocus, q as store_get, A as each, E as comment, g as get$1, M as tick, F as proxy, D as index, N as mount } from "./theme-U7NfCYzD.js";
import { v as prop, O as selectRequest, j as bind_value, P as getDisplayUrl, Q as selectedRequestId, R as duplicateRequest, S as deleteRequest, U as toggleFolderExpanded, W as moveItem, X as selectedFolderId, Y as renameFolder, Z as updateRequest, r as request, _ as addRequestToCollection, $ as addFolder, a0 as findItemRecursive, a1 as isRecentCollection, a2 as toggleCollectionExpanded, a3 as selectedCollectionId, a4 as renameCollection, a5 as getNameFromUrl, b as bind_this, T as Tooltip, a6 as collections, a7 as addCollection, I as globalVariables, a8 as envFilePath, n as addEnvironment, K as KeyValueEditor, t as environments, a9 as envFileVariables, J as updateGlobalVariables, u as updateEnvironmentVariables, o as renameEnvironment, q as activeEnvironmentId, x as onMount, y as onDestroy, L as loadEnvFileVariables, N as loadEnvironments, aa as initCollections } from "./formatters-wLe3gDWq.js";
import { a as isRequest, i as isFolder, R as REQUEST_KIND } from "./types-yqghzbIO.js";
import { s as set_style } from "./style-BHbAZ2u6.js";
function countAllItems(items) {
  let count = 0;
  for (const item of items) {
    if (isRequest(item)) {
      count++;
    } else if (isFolder(item)) {
      count += countAllItems(item.children);
    }
  }
  return count;
}
const initialDragState = {
  isDragging: false,
  draggedItemId: null,
  draggedItemType: null,
  sourceCollectionId: null,
  sourceFolderId: null
};
const dragState = writable(initialDragState);
const dropTarget = writable(null);
derived(
  [dragState, dropTarget],
  ([$dragState, $dropTarget]) => {
    if (!$dragState.isDragging || !$dropTarget) return false;
    if ($dragState.draggedItemId === $dropTarget.id) return false;
    if ($dragState.draggedItemType === "folder" && $dropTarget.type === "folder") ;
    return true;
  }
);
function startDrag(itemId, itemType, collectionId, folderId) {
  dragState.set({
    isDragging: true,
    draggedItemId: itemId,
    draggedItemType: itemType,
    sourceCollectionId: collectionId,
    sourceFolderId: folderId || null
  });
}
function endDrag() {
  dragState.set(initialDragState);
  dropTarget.set(null);
}
function setDropTarget(target) {
  dropTarget.set(target);
}
var root$8 = from_html(`<span class="method-badge svelte-164wa1a"> </span>`);
function MethodBadge($$anchor, $$props) {
  const methodColors = {
    GET: "#61affe",
    POST: "#49cc90",
    PUT: "#fca130",
    PATCH: "#50e3c2",
    DELETE: "#f93e3e",
    HEAD: "#9012fe",
    OPTIONS: "#0d5aa7"
  };
  const color = user_derived(() => methodColors[$$props.method] || "#999");
  var span = root$8();
  var text = child(span);
  template_effect(() => {
    set_style(span, `--method-color: ${get(color) ?? ""}`);
    set_text(text, $$props.method);
  });
  append($$anchor, span);
}
var root_1$6 = from_html(`<input type="text" class="edit-input svelte-1qdrsth"/>`);
var root_2$6 = from_html(`<span class="request-name svelte-1qdrsth"> </span> <span class="request-url svelte-1qdrsth"> </span>`, 1);
var root_4$4 = from_html(`<span class="response-duration svelte-1qdrsth"> </span>`);
var root_3$4 = from_html(`<div class="response-meta svelte-1qdrsth"><span> </span> <!></div>`);
var root_5$3 = from_html(`<div class="context-menu svelte-1qdrsth" role="menu" tabindex="-1"><button class="context-item svelte-1qdrsth" role="menuitem"><span class="context-icon codicon codicon-link-external svelte-1qdrsth"></span> Open in New Tab</button> <button class="context-item svelte-1qdrsth"><span class="context-icon codicon codicon-play svelte-1qdrsth"></span> Run Request</button> <div class="context-divider svelte-1qdrsth"></div> <button class="context-item svelte-1qdrsth"><span class="context-icon codicon codicon-edit svelte-1qdrsth"></span> Rename</button> <button class="context-item svelte-1qdrsth"><span class="context-icon codicon codicon-copy svelte-1qdrsth"></span> Duplicate</button> <div class="context-divider svelte-1qdrsth"></div> <button class="context-item danger svelte-1qdrsth"><span class="context-icon codicon codicon-trash svelte-1qdrsth"></span> Delete</button></div>`);
var root$7 = from_html(`<div role="button" tabindex="0"><!> <div class="request-info svelte-1qdrsth"><!></div> <!></div> <!>`, 1);
function RequestItem($$anchor, $$props) {
  push($$props, true);
  const $selectedRequestId = () => store_get(selectedRequestId, "$selectedRequestId", $$stores);
  const $dragState = () => store_get(dragState, "$dragState", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  function formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
    const mins = Math.floor(ms / 6e4);
    const secs = Math.round(ms % 6e4 / 1e3);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  let depth = prop($$props, "depth", 3, 1), parentFolderId = prop($$props, "parentFolderId", 3, void 0), postMessage = prop($$props, "postMessage", 3, void 0);
  let showContextMenu = state(false);
  let contextMenuX = state(0);
  let contextMenuY = state(0);
  let isEditing = state(false);
  let editName = state("");
  const isSelected = user_derived(() => $selectedRequestId() === $$props.item.id);
  const isBeingDragged = user_derived(() => $dragState().isDragging && $dragState().draggedItemId === $$props.item.id);
  function handleClick(e) {
    var _a;
    selectRequest($$props.collectionId, $$props.item.id);
    (_a = postMessage()) == null ? void 0 : _a({
      type: "openCollectionRequest",
      data: {
        requestId: $$props.item.id,
        collectionId: $$props.collectionId,
        newTab: e.ctrlKey || e.metaKey
        // Ctrl+Click for new tab
      }
    });
  }
  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function closeContextMenu() {
    set(showContextMenu, false);
  }
  function handleRename() {
    closeContextMenu();
    set(isEditing, true);
    set(editName, $$props.item.name, true);
  }
  function handleDelete() {
    closeContextMenu();
    deleteRequest($$props.item.id);
  }
  function handleDuplicate() {
    closeContextMenu();
    duplicateRequest($$props.item.id);
  }
  function handleOpenNewTab() {
    var _a;
    closeContextMenu();
    (_a = postMessage()) == null ? void 0 : _a({
      type: "openCollectionRequest",
      data: {
        requestId: $$props.item.id,
        collectionId: $$props.collectionId,
        newTab: true
      }
    });
  }
  function handleRunRequest() {
    var _a;
    closeContextMenu();
    (_a = postMessage()) == null ? void 0 : _a({
      type: "runCollectionRequest",
      data: {
        requestId: $$props.item.id,
        collectionId: $$props.collectionId
      }
    });
  }
  function finishEditing() {
    var _a;
    set(isEditing, false);
    if (get(editName).trim() && get(editName) !== $$props.item.name) {
      (_a = $$props.onrename) == null ? void 0 : _a.call($$props, { id: $$props.item.id, name: get(editName).trim() });
    }
  }
  function handleKeydown(e) {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      set(isEditing, false);
      set(editName, $$props.item.name, true);
    }
  }
  function handleDragStart(e) {
    var _a;
    if (get(isEditing)) {
      e.preventDefault();
      return;
    }
    (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", $$props.item.id);
    e.dataTransfer.effectAllowed = "move";
    startDrag($$props.item.id, "request", $$props.collectionId, parentFolderId());
  }
  function handleDragEnd() {
    endDrag();
  }
  var fragment = root$7();
  event("click", $window, closeContextMenu);
  event("keydown", $window, (e) => e.key === "Escape" && closeContextMenu());
  var div = first_child(fragment);
  let classes;
  var node = child(div);
  MethodBadge(node, {
    get method() {
      return $$props.item.method;
    }
  });
  var div_1 = sibling(node, 2);
  var node_1 = child(div_1);
  {
    var consequent = ($$anchor2) => {
      var input = root_1$6();
      autofocus(input);
      event("blur", input, finishEditing);
      delegated("keydown", input, handleKeydown);
      bind_value(input, () => get(editName), ($$value) => set(editName, $$value));
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_2$6();
      var span = first_child(fragment_1);
      var text = child(span);
      var span_1 = sibling(span, 2);
      var text_1 = child(span_1);
      template_effect(
        ($0) => {
          set_text(text, $$props.item.name);
          set_text(text_1, $0);
        },
        [() => getDisplayUrl($$props.item.url)]
      );
      append($$anchor2, fragment_1);
    };
    if_block(node_1, ($$render) => {
      if (get(isEditing)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var node_2 = sibling(div_1, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_2 = root_3$4();
      var span_2 = child(div_2);
      let classes_1;
      var text_2 = child(span_2);
      var node_3 = sibling(span_2, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var span_3 = root_4$4();
          var text_3 = child(span_3);
          template_effect(($0) => set_text(text_3, $0), [() => formatDuration($$props.item.lastResponseDuration)]);
          append($$anchor3, span_3);
        };
        if_block(node_3, ($$render) => {
          if ($$props.item.lastResponseDuration) $$render(consequent_1);
        });
      }
      template_effect(() => {
        classes_1 = set_class(span_2, 1, "status-badge svelte-1qdrsth", null, classes_1, {
          "status-2xx": $$props.item.lastResponseStatus >= 200 && $$props.item.lastResponseStatus < 300,
          "status-3xx": $$props.item.lastResponseStatus >= 300 && $$props.item.lastResponseStatus < 400,
          "status-4xx": $$props.item.lastResponseStatus >= 400 && $$props.item.lastResponseStatus < 500,
          "status-5xx": $$props.item.lastResponseStatus >= 500
        });
        set_text(text_2, $$props.item.lastResponseStatus);
      });
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if ($$props.item.lastResponseStatus) $$render(consequent_2);
    });
  }
  var node_4 = sibling(div, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_3 = root_5$3();
      var button = child(div_3);
      var button_1 = sibling(button, 2);
      var button_2 = sibling(button_1, 4);
      var button_3 = sibling(button_2, 2);
      var button_4 = sibling(button_3, 4);
      template_effect(() => set_style(div_3, `left: ${get(contextMenuX) ?? ""}px; top: ${get(contextMenuY) ?? ""}px`));
      delegated("click", div_3, (e) => e.stopPropagation());
      delegated("keydown", div_3, (e) => e.key === "Escape" && closeContextMenu());
      delegated("click", button, handleOpenNewTab);
      delegated("click", button_1, handleRunRequest);
      delegated("click", button_2, handleRename);
      delegated("click", button_3, handleDuplicate);
      delegated("click", button_4, handleDelete);
      append($$anchor2, div_3);
    };
    if_block(node_4, ($$render) => {
      if (get(showContextMenu)) $$render(consequent_3);
    });
  }
  template_effect(() => {
    classes = set_class(div, 1, "request-item svelte-1qdrsth", null, classes, { selected: get(isSelected), dragging: get(isBeingDragged) });
    set_style(div, `padding-left: ${8 + depth() * 12}px`);
    set_attribute(div, "draggable", !get(isEditing));
  });
  delegated("click", div, handleClick);
  delegated("contextmenu", div, handleContextMenu);
  delegated("keydown", div, (e) => e.key === "Enter" && handleClick(new MouseEvent("click")));
  event("dragstart", div, handleDragStart);
  event("dragend", div, handleDragEnd);
  append($$anchor, fragment);
  pop();
  $$cleanup();
}
delegate(["click", "contextmenu", "keydown"]);
var root_1$5 = from_html(`<input type="text" class="edit-input svelte-nd23uu"/>`);
var root_3$3 = from_html(`<span class="item-count svelte-nd23uu"> </span>`);
var root_2$5 = from_html(`<span class="folder-name svelte-nd23uu"> </span> <!> <button class="quick-add-btn svelte-nd23uu" title="Add new request">+</button>`, 1);
var root_4$3 = from_html(`<div class="children-list svelte-nd23uu"></div>`);
var root_8$3 = from_html(`<div class="context-menu svelte-nd23uu" role="menu" tabindex="-1"><button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-globe svelte-nd23uu"></span> New HTTP Request</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-symbol-structure svelte-nd23uu"></span> New GraphQL Request</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-plug svelte-nd23uu"></span> New WebSocket</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-broadcast svelte-nd23uu"></span> New SSE Connection</button> <div class="context-divider svelte-nd23uu"></div> <button class="context-item svelte-nd23uu" role="menuitem"><span class="context-icon codicon codicon-file-add svelte-nd23uu"></span> Save Current Request Here</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-new-folder svelte-nd23uu"></span> New Folder</button> <div class="context-divider svelte-nd23uu"></div> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-play svelte-nd23uu"></span> Run All</button> <div class="context-divider svelte-nd23uu"></div> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-edit svelte-nd23uu"></span> Rename</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-copy svelte-nd23uu"></span> Duplicate</button> <button class="context-item svelte-nd23uu"><span class="context-icon codicon codicon-export svelte-nd23uu"></span> Export</button> <div class="context-divider svelte-nd23uu"></div> <button class="context-item danger svelte-nd23uu"><span class="context-icon codicon codicon-trash svelte-nd23uu"></span> Delete</button></div>`);
var root$6 = from_html(`<div role="group"><div role="button" tabindex="0"><span></span> <span></span> <!></div> <!></div> <!>`, 1);
function FolderItem_1($$anchor, $$props) {
  push($$props, true);
  const $selectedFolderId = () => store_get(selectedFolderId, "$selectedFolderId", $$stores);
  const $dragState = () => store_get(dragState, "$dragState", $$stores);
  const $dropTarget = () => store_get(dropTarget, "$dropTarget", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let depth = prop($$props, "depth", 3, 1), parentFolderId = prop($$props, "parentFolderId", 3, void 0);
  let showContextMenu = state(false);
  let contextMenuX = state(0);
  let contextMenuY = state(0);
  let isEditing = state(false);
  let editName = state("");
  const isSelected = user_derived(() => $selectedFolderId() === $$props.folder.id);
  const expanded = user_derived(() => $$props.folder.expanded);
  const childCount = user_derived(() => countItems($$props.folder.children));
  const isBeingDragged = user_derived(() => $dragState().isDragging && $dragState().draggedItemId === $$props.folder.id);
  const isDropTarget = user_derived(() => {
    var _a, _b;
    return ((_a = $dropTarget()) == null ? void 0 : _a.type) === "folder" && ((_b = $dropTarget()) == null ? void 0 : _b.id) === $$props.folder.id;
  });
  const canAcceptDrop = user_derived(() => $dragState().isDragging && $dragState().draggedItemId !== $$props.folder.id && !isDescendant($dragState().draggedItemId));
  function isDescendant(itemId) {
    if (!itemId) return false;
    return findItemRecursive($$props.folder.children, itemId) !== null;
  }
  function countItems(items) {
    let count = 0;
    for (const item of items) {
      if (isRequest(item)) {
        count++;
      } else if (isFolder(item)) {
        count += countItems(item.children);
      }
    }
    return count;
  }
  function handleToggle() {
    toggleFolderExpanded($$props.folder.id);
  }
  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function closeContextMenu() {
    set(showContextMenu, false);
  }
  function handleRename() {
    closeContextMenu();
    set(isEditing, true);
    set(editName, $$props.folder.name, true);
  }
  function handleDelete() {
    closeContextMenu();
    $$props.postMessage({
      type: "deleteFolder",
      data: {
        folderId: $$props.folder.id,
        collectionId: $$props.collectionId
      }
    });
  }
  function handleRunAll() {
    closeContextMenu();
    $$props.postMessage({
      type: "runAllInFolder",
      data: {
        folderId: $$props.folder.id,
        collectionId: $$props.collectionId
      }
    });
  }
  function handleDuplicate() {
    closeContextMenu();
    $$props.postMessage({
      type: "duplicateFolder",
      data: {
        folderId: $$props.folder.id,
        collectionId: $$props.collectionId
      }
    });
  }
  function handleExport() {
    closeContextMenu();
    $$props.postMessage({
      type: "exportFolder",
      data: {
        folderId: $$props.folder.id,
        collectionId: $$props.collectionId
      }
    });
  }
  function handleQuickAddClick(e) {
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function handleCreateTypedRequest(kind) {
    closeContextMenu();
    $$props.postMessage({
      type: "createRequest",
      data: {
        collectionId: $$props.collectionId,
        parentFolderId: $$props.folder.id,
        openInPanel: true,
        requestKind: kind
      }
    });
    if (!get(expanded)) {
      toggleFolderExpanded($$props.folder.id);
    }
  }
  function handleAddFolder() {
    closeContextMenu();
    addFolder($$props.collectionId, "New Folder", $$props.folder.id);
    if (!get(expanded)) {
      toggleFolderExpanded($$props.folder.id);
    }
  }
  function handleAddRequest() {
    closeContextMenu();
    const currentRequest = get$1(request);
    addRequestToCollection(
      $$props.collectionId,
      {
        name: currentRequest.url ? getNameFromUrl2(currentRequest.url) : "New Request",
        method: currentRequest.method,
        url: currentRequest.url,
        params: currentRequest.params,
        headers: currentRequest.headers,
        auth: currentRequest.auth,
        body: currentRequest.body
      },
      $$props.folder.id
    );
    if (!get(expanded)) {
      toggleFolderExpanded($$props.folder.id);
    }
  }
  function getNameFromUrl2(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return path === "/" ? urlObj.hostname : path.split("/").filter(Boolean).pop() || "New Request";
    } catch {
      return "New Request";
    }
  }
  function finishEditing() {
    set(isEditing, false);
    if (get(editName).trim() && get(editName) !== $$props.folder.name) {
      renameFolder($$props.folder.id, get(editName).trim());
    }
  }
  function handleKeydown(e) {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      set(isEditing, false);
      set(editName, $$props.folder.name, true);
    }
  }
  function handleRequestRename(data) {
    updateRequest(data.id, { name: data.name });
  }
  function handleDragStart(e) {
    var _a;
    if (get(isEditing)) {
      e.preventDefault();
      return;
    }
    (_a = e.dataTransfer) == null ? void 0 : _a.setData("text/plain", $$props.folder.id);
    e.dataTransfer.effectAllowed = "move";
    startDrag($$props.folder.id, "folder", $$props.collectionId, parentFolderId());
  }
  function handleDragEnd() {
    endDrag();
  }
  function handleDragOver(e) {
    if (!get(canAcceptDrop)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({
      type: "folder",
      id: $$props.folder.id,
      collectionId: $$props.collectionId
    });
  }
  function handleDragEnter(e) {
    if (!get(canAcceptDrop)) return;
    e.preventDefault();
    setDropTarget({
      type: "folder",
      id: $$props.folder.id,
      collectionId: $$props.collectionId
    });
  }
  function handleDragLeave(e) {
    var _a;
    const relatedTarget = e.relatedTarget;
    const currentTarget = e.currentTarget;
    if (!currentTarget.contains(relatedTarget)) {
      if (((_a = $dropTarget()) == null ? void 0 : _a.id) === $$props.folder.id) {
        setDropTarget(null);
      }
    }
  }
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = $dragState().draggedItemId;
    if (!draggedId || !get(canAcceptDrop)) {
      endDrag();
      return;
    }
    moveItem(draggedId, $$props.collectionId, $$props.folder.id);
    if (!get(expanded)) {
      toggleFolderExpanded($$props.folder.id);
    }
    endDrag();
  }
  var fragment = root$6();
  event("click", $window, closeContextMenu);
  event("keydown", $window, (e) => e.key === "Escape" && closeContextMenu());
  var div = first_child(fragment);
  let classes;
  var div_1 = child(div);
  let classes_1;
  var span = child(div_1);
  let classes_2;
  var span_1 = sibling(span, 2);
  let classes_3;
  var node = sibling(span_1, 2);
  {
    var consequent = ($$anchor2) => {
      var input = root_1$5();
      autofocus(input);
      event("blur", input, finishEditing);
      delegated("keydown", input, handleKeydown);
      delegated("click", input, (e) => e.stopPropagation());
      bind_value(input, () => get(editName), ($$value) => set(editName, $$value));
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_2$5();
      var span_2 = first_child(fragment_1);
      var text = child(span_2);
      var node_1 = sibling(span_2, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var span_3 = root_3$3();
          var text_1 = child(span_3);
          template_effect(() => set_text(text_1, get(childCount)));
          append($$anchor3, span_3);
        };
        if_block(node_1, ($$render) => {
          if (get(childCount) > 0) $$render(consequent_1);
        });
      }
      var button = sibling(node_1, 2);
      template_effect(() => set_text(text, $$props.folder.name));
      delegated("click", button, handleQuickAddClick);
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (get(isEditing)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var node_2 = sibling(div_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_2 = root_4$3();
      each(div_2, 21, () => $$props.folder.children, (child2) => child2.id, ($$anchor3, child2) => {
        var fragment_2 = comment();
        var node_3 = first_child(fragment_2);
        {
          var consequent_2 = ($$anchor4) => {
            {
              let $0 = user_derived(() => depth() + 1);
              FolderItem_1($$anchor4, {
                get folder() {
                  return get(child2);
                },
                get collectionId() {
                  return $$props.collectionId;
                },
                get parentFolderId() {
                  return $$props.folder.id;
                },
                get depth() {
                  return get($0);
                },
                get postMessage() {
                  return $$props.postMessage;
                }
              });
            }
          };
          var d = user_derived(() => isFolder(get(child2)));
          var consequent_3 = ($$anchor4) => {
            {
              let $0 = user_derived(() => depth() + 1);
              RequestItem($$anchor4, {
                get item() {
                  return get(child2);
                },
                get collectionId() {
                  return $$props.collectionId;
                },
                get parentFolderId() {
                  return $$props.folder.id;
                },
                get depth() {
                  return get($0);
                },
                get postMessage() {
                  return $$props.postMessage;
                },
                onrename: handleRequestRename
              });
            }
          };
          var d_1 = user_derived(() => isRequest(get(child2)));
          if_block(node_3, ($$render) => {
            if (get(d)) $$render(consequent_2);
            else if (get(d_1)) $$render(consequent_3, 1);
          });
        }
        append($$anchor3, fragment_2);
      });
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if (get(expanded) && $$props.folder.children.length > 0) $$render(consequent_4);
    });
  }
  var node_4 = sibling(div, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var div_3 = root_8$3();
      var button_1 = child(div_3);
      var button_2 = sibling(button_1, 2);
      var button_3 = sibling(button_2, 2);
      var button_4 = sibling(button_3, 2);
      var button_5 = sibling(button_4, 4);
      var button_6 = sibling(button_5, 2);
      var button_7 = sibling(button_6, 4);
      var button_8 = sibling(button_7, 4);
      var button_9 = sibling(button_8, 2);
      var button_10 = sibling(button_9, 2);
      var button_11 = sibling(button_10, 4);
      template_effect(() => set_style(div_3, `left: ${get(contextMenuX) ?? ""}px; top: ${get(contextMenuY) ?? ""}px`));
      delegated("click", div_3, (e) => e.stopPropagation());
      delegated("keydown", div_3, (e) => e.key === "Escape" && closeContextMenu());
      delegated("click", button_1, () => handleCreateTypedRequest(REQUEST_KIND.HTTP));
      delegated("click", button_2, () => handleCreateTypedRequest(REQUEST_KIND.GRAPHQL));
      delegated("click", button_3, () => handleCreateTypedRequest(REQUEST_KIND.WEBSOCKET));
      delegated("click", button_4, () => handleCreateTypedRequest(REQUEST_KIND.SSE));
      delegated("click", button_5, handleAddRequest);
      delegated("click", button_6, handleAddFolder);
      delegated("click", button_7, handleRunAll);
      delegated("click", button_8, handleRename);
      delegated("click", button_9, handleDuplicate);
      delegated("click", button_10, handleExport);
      delegated("click", button_11, handleDelete);
      append($$anchor2, div_3);
    };
    if_block(node_4, ($$render) => {
      if (get(showContextMenu)) $$render(consequent_5);
    });
  }
  template_effect(() => {
    classes = set_class(div, 1, "folder-item svelte-nd23uu", null, classes, { "drop-target": get(isDropTarget) });
    classes_1 = set_class(div_1, 1, "folder-header svelte-nd23uu", null, classes_1, { selected: get(isSelected), dragging: get(isBeingDragged) });
    set_style(div_1, `padding-left: ${8 + depth() * 12}px`);
    set_attribute(div_1, "draggable", !get(isEditing));
    classes_2 = set_class(span, 1, "expand-icon codicon svelte-nd23uu", null, classes_2, {
      expanded: get(expanded),
      "codicon-chevron-down": get(expanded),
      "codicon-chevron-right": !get(expanded)
    });
    classes_3 = set_class(span_1, 1, "folder-icon codicon svelte-nd23uu", null, classes_3, {
      "codicon-folder-opened": get(expanded),
      "codicon-folder": !get(expanded)
    });
  });
  event("dragover", div, handleDragOver);
  event("dragenter", div, handleDragEnter);
  event("dragleave", div, handleDragLeave);
  event("drop", div, handleDrop);
  delegated("click", div_1, handleToggle);
  delegated("contextmenu", div_1, handleContextMenu);
  delegated("keydown", div_1, (e) => e.key === "Enter" && handleToggle());
  event("dragstart", div_1, handleDragStart);
  event("dragend", div_1, handleDragEnd);
  append($$anchor, fragment);
  pop();
  $$cleanup();
}
delegate(["click", "contextmenu", "keydown"]);
var root_1$4 = from_html(`<input type="text" class="edit-input svelte-17qppwy"/>`);
var root_2$4 = from_html(`<span class="collection-name svelte-17qppwy"> </span> <span class="request-count svelte-17qppwy"> </span> <button title="Add new request"><span class="codicon codicon-kebab-vertical"></span></button>`, 1);
var root_3$2 = from_html(`<div class="items-list svelte-17qppwy"></div>`);
var root_8$2 = from_html(`<button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-play svelte-17qppwy"></span> Run All</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item danger svelte-17qppwy"><span class="context-icon codicon codicon-clear-all svelte-17qppwy"></span> Clear All</button>`, 1);
var root_9$2 = from_html(`<button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-globe svelte-17qppwy"></span> New HTTP Request</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-symbol-structure svelte-17qppwy"></span> New GraphQL Request</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-plug svelte-17qppwy"></span> New WebSocket</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-broadcast svelte-17qppwy"></span> New SSE Connection</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item svelte-17qppwy" role="menuitem"><span class="context-icon codicon codicon-file-add svelte-17qppwy"></span> Save Current Request Here</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-new-folder svelte-17qppwy"></span> New Folder</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-play svelte-17qppwy"></span> Run All</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-key svelte-17qppwy"></span> Set Auth...</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-list-flat svelte-17qppwy"></span> Set Headers...</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-edit svelte-17qppwy"></span> Rename</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-copy svelte-17qppwy"></span> Duplicate</button> <button class="context-item svelte-17qppwy"><span class="context-icon codicon codicon-export svelte-17qppwy"></span> Export</button> <div class="context-divider svelte-17qppwy"></div> <button class="context-item danger svelte-17qppwy"><span class="context-icon codicon codicon-trash svelte-17qppwy"></span> Delete</button>`, 1);
var root_7$2 = from_html(`<div class="context-backdrop svelte-17qppwy" role="presentation"></div> <div class="context-menu svelte-17qppwy" role="menu" tabindex="-1"><!></div>`, 1);
var root$5 = from_html(`<div role="group"><div role="button" tabindex="0"><span></span> <span></span> <!></div> <!></div> <!>`, 1);
function CollectionItem($$anchor, $$props) {
  push($$props, true);
  const $selectedCollectionId = () => store_get(selectedCollectionId, "$selectedCollectionId", $$stores);
  const $dropTarget = () => store_get(dropTarget, "$dropTarget", $$stores);
  const $dragState = () => store_get(dragState, "$dragState", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let showContextMenu = state(false);
  let contextMenuX = state(0);
  let contextMenuY = state(0);
  let isEditing = state(false);
  let editName = state("");
  const isSelected = user_derived(() => $selectedCollectionId() === $$props.collection.id);
  const expanded = user_derived(() => $$props.collection.expanded);
  const itemCount = user_derived(() => countAllItems($$props.collection.items));
  const isDropTarget = user_derived(() => {
    var _a, _b;
    return ((_a = $dropTarget()) == null ? void 0 : _a.type) === "collection" && ((_b = $dropTarget()) == null ? void 0 : _b.id) === $$props.collection.id;
  });
  const canAcceptDrop = user_derived(() => $dragState().isDragging);
  const isRecent = user_derived(() => isRecentCollection($$props.collection));
  function handleToggle() {
    toggleCollectionExpanded($$props.collection.id);
  }
  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function closeContextMenu() {
    set(showContextMenu, false);
  }
  function handleRename() {
    closeContextMenu();
    set(isEditing, true);
    set(editName, $$props.collection.name, true);
  }
  function handleDelete() {
    closeContextMenu();
    $$props.postMessage({
      type: "deleteCollection",
      data: { id: $$props.collection.id }
    });
  }
  function handleRunAll() {
    closeContextMenu();
    $$props.postMessage({
      type: "runAllInCollection",
      data: { collectionId: $$props.collection.id }
    });
  }
  function handleDuplicate() {
    closeContextMenu();
    $$props.postMessage({
      type: "duplicateCollection",
      data: { id: $$props.collection.id }
    });
  }
  function handleExport() {
    closeContextMenu();
    $$props.postMessage({
      type: "exportCollection",
      data: { collectionId: $$props.collection.id }
    });
  }
  function handleSetAuth() {
    closeContextMenu();
    $$props.postMessage({
      type: "setCollectionAuth",
      data: { collectionId: $$props.collection.id }
    });
  }
  function handleSetHeaders() {
    closeContextMenu();
    $$props.postMessage({
      type: "setCollectionHeaders",
      data: { collectionId: $$props.collection.id }
    });
  }
  function handleClearRecent() {
    closeContextMenu();
    $$props.postMessage({ type: "clearRecent" });
  }
  function handleQuickAddClick(e) {
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function handleCreateTypedRequest(kind) {
    closeContextMenu();
    $$props.postMessage({
      type: "createRequest",
      data: {
        collectionId: $$props.collection.id,
        openInPanel: true,
        requestKind: kind
      }
    });
    if (!get(expanded)) {
      toggleCollectionExpanded($$props.collection.id);
    }
  }
  function handleAddRequest() {
    closeContextMenu();
    const currentRequest = get$1(request);
    addRequestToCollection($$props.collection.id, {
      name: currentRequest.url ? getNameFromUrl(currentRequest.url) : "New Request",
      method: currentRequest.method,
      url: currentRequest.url,
      params: currentRequest.params,
      headers: currentRequest.headers,
      auth: currentRequest.auth,
      body: currentRequest.body
    });
    if (!get(expanded)) {
      toggleCollectionExpanded($$props.collection.id);
    }
  }
  function handleAddFolder() {
    closeContextMenu();
    addFolder($$props.collection.id, "New Folder");
    if (!get(expanded)) {
      toggleCollectionExpanded($$props.collection.id);
    }
  }
  function finishEditing() {
    set(isEditing, false);
    if (get(editName).trim() && get(editName) !== $$props.collection.name) {
      renameCollection($$props.collection.id, get(editName).trim());
    }
  }
  function handleKeydown(e) {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      set(isEditing, false);
      set(editName, $$props.collection.name, true);
    }
  }
  function handleRequestRename(data) {
    updateRequest(data.id, { name: data.name });
  }
  function handleDragOver(e) {
    if (!get(canAcceptDrop)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({
      type: "collection",
      id: $$props.collection.id,
      collectionId: $$props.collection.id
    });
  }
  function handleDragEnter(e) {
    if (!get(canAcceptDrop)) return;
    e.preventDefault();
    setDropTarget({
      type: "collection",
      id: $$props.collection.id,
      collectionId: $$props.collection.id
    });
  }
  function handleDragLeave(e) {
    var _a;
    const relatedTarget = e.relatedTarget;
    const currentTarget = e.currentTarget;
    if (!currentTarget.contains(relatedTarget)) {
      if (((_a = $dropTarget()) == null ? void 0 : _a.id) === $$props.collection.id) {
        setDropTarget(null);
      }
    }
  }
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = $dragState().draggedItemId;
    if (!draggedId || !get(canAcceptDrop)) {
      endDrag();
      return;
    }
    moveItem(draggedId, $$props.collection.id);
    if (!get(expanded)) {
      toggleCollectionExpanded($$props.collection.id);
    }
    endDrag();
  }
  var fragment = root$5();
  event("click", $window, closeContextMenu);
  event("keydown", $window, (e) => e.key === "Escape" && closeContextMenu());
  var div = first_child(fragment);
  let classes;
  var div_1 = child(div);
  let classes_1;
  var span = child(div_1);
  let classes_2;
  var span_1 = sibling(span, 2);
  let classes_3;
  var node = sibling(span_1, 2);
  {
    var consequent = ($$anchor2) => {
      var input = root_1$4();
      autofocus(input);
      event("blur", input, finishEditing);
      delegated("keydown", input, handleKeydown);
      delegated("click", input, (e) => e.stopPropagation());
      bind_value(input, () => get(editName), ($$value) => set(editName, $$value));
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_2$4();
      var span_2 = first_child(fragment_1);
      var text = child(span_2);
      var span_3 = sibling(span_2, 2);
      var text_1 = child(span_3);
      var button = sibling(span_3, 2);
      let classes_4;
      template_effect(() => {
        set_text(text, $$props.collection.name);
        set_text(text_1, get(itemCount));
        classes_4 = set_class(button, 1, "quick-add-btn svelte-17qppwy", null, classes_4, { "hidden-spacer": get(isRecent) });
      });
      delegated("click", button, handleQuickAddClick);
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (get(isEditing)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var node_1 = sibling(div_1, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_2 = root_3$2();
      each(div_2, 21, () => $$props.collection.items, (item) => item.id, ($$anchor3, item) => {
        var fragment_2 = comment();
        var node_2 = first_child(fragment_2);
        {
          var consequent_1 = ($$anchor4) => {
            FolderItem_1($$anchor4, {
              get folder() {
                return get(item);
              },
              get collectionId() {
                return $$props.collection.id;
              },
              depth: 1,
              get postMessage() {
                return $$props.postMessage;
              }
            });
          };
          var d = user_derived(() => isFolder(get(item)));
          var consequent_2 = ($$anchor4) => {
            RequestItem($$anchor4, {
              get item() {
                return get(item);
              },
              get collectionId() {
                return $$props.collection.id;
              },
              depth: 1,
              get postMessage() {
                return $$props.postMessage;
              },
              onrename: handleRequestRename
            });
          };
          var d_1 = user_derived(() => isRequest(get(item)));
          if_block(node_2, ($$render) => {
            if (get(d)) $$render(consequent_1);
            else if (get(d_1)) $$render(consequent_2, 1);
          });
        }
        append($$anchor3, fragment_2);
      });
      append($$anchor2, div_2);
    };
    if_block(node_1, ($$render) => {
      if (get(expanded) && $$props.collection.items.length > 0) $$render(consequent_3);
    });
  }
  var node_3 = sibling(div, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var fragment_5 = root_7$2();
      var div_3 = first_child(fragment_5);
      var div_4 = sibling(div_3, 2);
      var node_4 = child(div_4);
      {
        var consequent_4 = ($$anchor3) => {
          var fragment_6 = root_8$2();
          var button_1 = first_child(fragment_6);
          var button_2 = sibling(button_1, 4);
          delegated("click", button_1, handleRunAll);
          delegated("click", button_2, handleClearRecent);
          append($$anchor3, fragment_6);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_7 = root_9$2();
          var button_3 = first_child(fragment_7);
          var button_4 = sibling(button_3, 2);
          var button_5 = sibling(button_4, 2);
          var button_6 = sibling(button_5, 2);
          var button_7 = sibling(button_6, 4);
          var button_8 = sibling(button_7, 2);
          var button_9 = sibling(button_8, 4);
          var button_10 = sibling(button_9, 4);
          var button_11 = sibling(button_10, 2);
          var button_12 = sibling(button_11, 4);
          var button_13 = sibling(button_12, 2);
          var button_14 = sibling(button_13, 2);
          var button_15 = sibling(button_14, 4);
          delegated("click", button_3, () => handleCreateTypedRequest(REQUEST_KIND.HTTP));
          delegated("click", button_4, () => handleCreateTypedRequest(REQUEST_KIND.GRAPHQL));
          delegated("click", button_5, () => handleCreateTypedRequest(REQUEST_KIND.WEBSOCKET));
          delegated("click", button_6, () => handleCreateTypedRequest(REQUEST_KIND.SSE));
          delegated("click", button_7, handleAddRequest);
          delegated("click", button_8, handleAddFolder);
          delegated("click", button_9, handleRunAll);
          delegated("click", button_10, handleSetAuth);
          delegated("click", button_11, handleSetHeaders);
          delegated("click", button_12, handleRename);
          delegated("click", button_13, handleDuplicate);
          delegated("click", button_14, handleExport);
          delegated("click", button_15, handleDelete);
          append($$anchor3, fragment_7);
        };
        if_block(node_4, ($$render) => {
          if (get(isRecent)) $$render(consequent_4);
          else $$render(alternate_1, false);
        });
      }
      template_effect(() => set_style(div_4, `left: ${get(contextMenuX) ?? ""}px; top: ${get(contextMenuY) ?? ""}px`));
      delegated("click", div_3, closeContextMenu);
      delegated("click", div_4, (e) => e.stopPropagation());
      delegated("keydown", div_4, (e) => e.key === "Escape" && closeContextMenu());
      append($$anchor2, fragment_5);
    };
    if_block(node_3, ($$render) => {
      if (get(showContextMenu)) $$render(consequent_5);
    });
  }
  template_effect(() => {
    classes = set_class(div, 1, "collection-item svelte-17qppwy", null, classes, { "drop-target": get(isDropTarget) });
    classes_1 = set_class(div_1, 1, "collection-header svelte-17qppwy", null, classes_1, { selected: get(isSelected) });
    classes_2 = set_class(span, 1, "expand-icon codicon svelte-17qppwy", null, classes_2, {
      expanded: get(expanded),
      "codicon-chevron-down": get(expanded),
      "codicon-chevron-right": !get(expanded)
    });
    classes_3 = set_class(span_1, 1, "folder-icon codicon svelte-17qppwy", null, classes_3, {
      "codicon-history": get(isRecent),
      "codicon-folder": !get(isRecent)
    });
  });
  event("dragover", div, handleDragOver);
  event("dragenter", div, handleDragEnter);
  event("dragleave", div, handleDragLeave);
  event("drop", div, handleDrop);
  delegated("click", div_1, handleToggle);
  delegated("contextmenu", div_1, handleContextMenu);
  delegated("keydown", div_1, (e) => e.key === "Enter" && handleToggle());
  append($$anchor, fragment);
  pop();
  $$cleanup();
}
delegate(["click", "contextmenu", "keydown"]);
var root$4 = from_html(`<div class="collection-tree svelte-nrvtq3"></div>`);
function CollectionTree($$anchor, $$props) {
  var div = root$4();
  each(div, 21, () => $$props.collections, (collection) => collection.id, ($$anchor2, collection) => {
    CollectionItem($$anchor2, {
      get collection() {
        return get(collection);
      },
      get postMessage() {
        return $$props.postMessage;
      }
    });
  });
  append($$anchor, div);
}
var root_1$3 = from_html(`<button class="clear-search svelte-b58ezz" title="Clear search"><i class="codicon codicon-close svelte-b58ezz"></i></button>`);
var root_2$3 = from_html(`<div class="create-form svelte-b58ezz"><input type="text" class="create-input svelte-b58ezz" placeholder="Name..."/></div>`);
var root_4$2 = from_html(`<button class="toolbar-button svelte-b58ezz" aria-label="New Collection"><span class="codicon codicon-add svelte-b58ezz"></span></button>`);
var root_5$2 = from_html(`<button class="toolbar-button svelte-b58ezz" aria-label="Import"><span class="codicon codicon-cloud-download svelte-b58ezz"></span></button>`);
var root_6$2 = from_html(`<div class="import-menu svelte-b58ezz"><button class="import-item svelte-b58ezz">Import Postman</button> <button class="import-item svelte-b58ezz">Import OpenAPI</button> <button class="import-item svelte-b58ezz">Import Insomnia</button> <button class="import-item svelte-b58ezz">Import Hoppscotch</button> <button class="import-item svelte-b58ezz">Import cURL</button> <button class="import-item svelte-b58ezz">Import from URL</button></div>`);
var root_8$1 = from_html(`<div class="collections-list svelte-b58ezz"><!></div>`);
var root_9$1 = from_html(`<div class="empty-state svelte-b58ezz"><div class="empty-icon codicon codicon-search svelte-b58ezz"></div> <p class="empty-title svelte-b58ezz">No results</p> <p class="empty-description svelte-b58ezz"> </p> <button class="clear-search-button svelte-b58ezz">Clear search</button></div>`);
var root_10 = from_html(`<div class="empty-state svelte-b58ezz"><div class="empty-icon codicon codicon-folder svelte-b58ezz"></div> <p class="empty-title svelte-b58ezz">No Collections</p> <p class="empty-description svelte-b58ezz">Create a collection to organize your API requests</p></div>`);
var root$3 = from_html(`<div class="collections-tab svelte-b58ezz"><div class="toolbar svelte-b58ezz"><div class="search-wrapper svelte-b58ezz"><span class="search-icon codicon codicon-search svelte-b58ezz"></span> <input type="text" class="search-input svelte-b58ezz" placeholder="Filter collections..."/> <!></div> <!> <div class="import-wrapper svelte-b58ezz"><!> <!></div></div> <!></div>`);
function CollectionsTab($$anchor, $$props) {
  push($$props, true);
  const $collections = () => store_get(collections, "$collections", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let isCreating = state(false);
  let newCollectionName = state("");
  let searchQuery = state("");
  let searchInput = state(void 0);
  let debounceTimer;
  const hasCollections = user_derived(() => $collections().length > 0);
  function filterItems(items, query) {
    const result = [];
    for (const item of items) {
      if (isFolder(item)) {
        const folderMatches = item.name.toLowerCase().includes(query);
        const filteredChildren = filterItems(item.children, query);
        if (folderMatches || filteredChildren.length > 0) {
          result.push({
            ...item,
            children: folderMatches ? item.children : filteredChildren,
            expanded: filteredChildren.length > 0 || item.expanded
          });
        }
      } else if (isRequest(item)) {
        if (item.name.toLowerCase().includes(query) || item.url.toLowerCase().includes(query) || item.method.toLowerCase().includes(query)) {
          result.push(item);
        }
      }
    }
    return result;
  }
  function filterCollections(cols, query) {
    if (!query.trim()) return cols;
    const lowerQuery = query.toLowerCase();
    return cols.map((collection) => {
      const collectionMatches = collection.name.toLowerCase().includes(lowerQuery);
      const matchingItems = filterItems(collection.items, lowerQuery);
      if (collectionMatches || matchingItems.length > 0) {
        return {
          ...collection,
          // If collection name matches, show all items; otherwise show only matching
          items: collectionMatches ? collection.items : matchingItems,
          // Auto-expand collections with matching items
          expanded: matchingItems.length > 0 || collection.expanded
        };
      }
      return null;
    }).filter((col) => col !== null);
  }
  const filteredCollections = user_derived(() => filterCollections($collections(), get(searchQuery)));
  const hasResults = user_derived(() => get(filteredCollections).length > 0);
  const showNoResults = user_derived(() => get(hasCollections) && !get(hasResults) && get(searchQuery).trim().length > 0);
  function handleSearchInput(e) {
    const target = e.target;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => {
        set(searchQuery, target.value, true);
      },
      150
    );
  }
  function clearSearch() {
    set(searchQuery, "");
    if (get(searchInput)) {
      get(searchInput).value = "";
      get(searchInput).focus();
    }
  }
  function handleSearchKeydown(e) {
    if (e.key === "Escape" && get(searchQuery)) {
      e.preventDefault();
      clearSearch();
    }
  }
  let showImportMenu = state(false);
  function handleNewCollection() {
    set(isCreating, true);
    set(newCollectionName, "");
  }
  function handleImportPostman() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importPostman" });
  }
  function handleImportOpenApi() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importOpenApi" });
  }
  function handleImportInsomnia() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importInsomnia" });
  }
  function handleImportHoppscotch() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importHoppscotch" });
  }
  function handleImportCurl() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importCurl" });
  }
  function handleImportFromUrl() {
    set(showImportMenu, false);
    $$props.postMessage({ type: "importFromUrl" });
  }
  function toggleImportMenu() {
    set(showImportMenu, !get(showImportMenu));
  }
  function closeImportMenu() {
    set(showImportMenu, false);
  }
  function createCollection() {
    const name = get(newCollectionName).trim();
    if (name) {
      const result = addCollection(name);
      if (!result) {
        return;
      }
    }
    set(isCreating, false);
    set(newCollectionName, "");
  }
  function cancelCreate() {
    set(isCreating, false);
    set(newCollectionName, "");
  }
  function handleCreateKeydown(e) {
    if (e.key === "Enter") {
      createCollection();
    } else if (e.key === "Escape") {
      cancelCreate();
    }
  }
  var div = root$3();
  event("click", $window, closeImportMenu);
  var div_1 = child(div);
  var div_2 = child(div_1);
  var input = sibling(child(div_2), 2);
  bind_this(input, ($$value) => set(searchInput, $$value), () => get(searchInput));
  var node = sibling(input, 2);
  {
    var consequent = ($$anchor2) => {
      var button = root_1$3();
      delegated("click", button, clearSearch);
      append($$anchor2, button);
    };
    if_block(node, ($$render) => {
      if (get(searchQuery)) $$render(consequent);
    });
  }
  var node_1 = sibling(div_2, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_3 = root_2$3();
      var input_1 = child(div_3);
      autofocus(input_1);
      delegated("keydown", input_1, handleCreateKeydown);
      event("blur", input_1, createCollection);
      bind_value(input_1, () => get(newCollectionName), ($$value) => set(newCollectionName, $$value));
      append($$anchor2, div_3);
    };
    var alternate = ($$anchor2) => {
      Tooltip($$anchor2, {
        text: "New Collection",
        children: ($$anchor3, $$slotProps) => {
          var button_1 = root_4$2();
          delegated("click", button_1, handleNewCollection);
          append($$anchor3, button_1);
        },
        $$slots: { default: true }
      });
    };
    if_block(node_1, ($$render) => {
      if (get(isCreating)) $$render(consequent_1);
      else $$render(alternate, false);
    });
  }
  var div_4 = sibling(node_1, 2);
  var node_2 = child(div_4);
  Tooltip(node_2, {
    text: "Import",
    children: ($$anchor2, $$slotProps) => {
      var button_2 = root_5$2();
      delegated("click", button_2, toggleImportMenu);
      append($$anchor2, button_2);
    },
    $$slots: { default: true }
  });
  var node_3 = sibling(node_2, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_5 = root_6$2();
      var button_3 = child(div_5);
      var button_4 = sibling(button_3, 2);
      var button_5 = sibling(button_4, 2);
      var button_6 = sibling(button_5, 2);
      var button_7 = sibling(button_6, 2);
      var button_8 = sibling(button_7, 2);
      delegated("click", button_3, handleImportPostman);
      delegated("click", button_4, handleImportOpenApi);
      delegated("click", button_5, handleImportInsomnia);
      delegated("click", button_6, handleImportHoppscotch);
      delegated("click", button_7, handleImportCurl);
      delegated("click", button_8, handleImportFromUrl);
      append($$anchor2, div_5);
    };
    if_block(node_3, ($$render) => {
      if (get(showImportMenu)) $$render(consequent_2);
    });
  }
  var node_4 = sibling(div_1, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var fragment_1 = comment();
      var node_5 = first_child(fragment_1);
      {
        var consequent_3 = ($$anchor3) => {
          var div_6 = root_8$1();
          var node_6 = child(div_6);
          CollectionTree(node_6, {
            get collections() {
              return get(filteredCollections);
            },
            get postMessage() {
              return $$props.postMessage;
            }
          });
          append($$anchor3, div_6);
        };
        var consequent_4 = ($$anchor3) => {
          var div_7 = root_9$1();
          var p = sibling(child(div_7), 4);
          var text = child(p);
          var button_9 = sibling(p, 2);
          template_effect(() => set_text(text, `No collections or requests match "${get(searchQuery) ?? ""}"`));
          delegated("click", button_9, clearSearch);
          append($$anchor3, div_7);
        };
        if_block(node_5, ($$render) => {
          if (get(hasResults)) $$render(consequent_3);
          else if (get(showNoResults)) $$render(consequent_4, 1);
        });
      }
      append($$anchor2, fragment_1);
    };
    var alternate_1 = ($$anchor2) => {
      var div_8 = root_10();
      append($$anchor2, div_8);
    };
    if_block(node_4, ($$render) => {
      if (get(hasCollections)) $$render(consequent_5);
      else $$render(alternate_1, false);
    });
  }
  delegated("input", input, handleSearchInput);
  delegated("keydown", input, handleSearchKeydown);
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["input", "keydown", "click"]);
var root_1$2 = from_html(`<input type="text" class="rename-input svelte-6h5739"/>`);
var root_3$1 = from_html(`<span class="global-icon codicon codicon-globe svelte-6h5739" title="Global Variables"></span>`);
var root_2$2 = from_html(`<div class="item-left svelte-6h5739"><!> <span class="env-name svelte-6h5739"> </span></div>`);
var root_4$1 = from_html(`<span class="var-count svelte-6h5739"> </span>`);
var root_5$1 = from_html(`<span class="active-badge svelte-6h5739">Active</span>`);
var root_6$1 = from_html(`<div class="context-menu svelte-6h5739" role="menu" tabindex="-1"><button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-edit svelte-6h5739"></span> Edit Variables</button> <button class="context-item svelte-6h5739"><span></span> </button> <div class="context-divider svelte-6h5739"></div> <button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-edit svelte-6h5739"></span> Rename</button> <button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-copy svelte-6h5739"></span> Duplicate</button> <button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-export svelte-6h5739"></span> Export</button> <div class="context-divider svelte-6h5739"></div> <button class="context-item danger svelte-6h5739"><span class="context-icon codicon codicon-trash svelte-6h5739"></span> Delete</button></div>`);
var root_7$1 = from_html(`<div class="context-menu svelte-6h5739" role="menu" tabindex="-1"><button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-edit svelte-6h5739"></span> Edit Global Variables</button> <button class="context-item svelte-6h5739"><span class="context-icon codicon codicon-export svelte-6h5739"></span> Export</button></div>`);
var root$2 = from_html(`<div role="button" tabindex="0"><div class="item-content svelte-6h5739"><!> <div class="item-right svelte-6h5739"><!> <!></div></div></div> <!> <!>`, 1);
function EnvironmentItem($$anchor, $$props) {
  push($$props, true);
  let isActive = prop($$props, "isActive", 3, false), isGlobal = prop($$props, "isGlobal", 3, false);
  let showContextMenu = state(false);
  let contextMenuX = state(0);
  let contextMenuY = state(0);
  let isRenaming = state(false);
  let renameValue = state("");
  let renameInput = state(void 0);
  const enabledCount = user_derived(() => $$props.environment.variables.filter((v) => v.enabled && v.key).length);
  const totalCount = user_derived(() => $$props.environment.variables.length);
  function handleClick() {
    var _a;
    (_a = $$props.onOpenEditor) == null ? void 0 : _a.call($$props, $$props.environment, isGlobal());
  }
  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    set(showContextMenu, true);
    const menuWidth = 210;
    set(contextMenuX, Math.min(e.clientX, window.innerWidth - menuWidth), true);
    set(contextMenuY, e.clientY, true);
  }
  function closeContextMenu() {
    set(showContextMenu, false);
  }
  function handleSetActive() {
    closeContextMenu();
    $$props.postMessage({
      type: "setActiveEnvironment",
      data: { id: isActive() ? null : $$props.environment.id }
    });
  }
  function startRename() {
    closeContextMenu();
    set(renameValue, $$props.environment.name, true);
    set(isRenaming, true);
    tick().then(() => {
      var _a;
      return (_a = get(renameInput)) == null ? void 0 : _a.select();
    });
  }
  function submitRename() {
    const name = get(renameValue).trim();
    if (name && name !== $$props.environment.name) {
      $$props.postMessage({
        type: "renameEnvironment",
        data: { id: $$props.environment.id, name }
      });
    }
    set(isRenaming, false);
  }
  function cancelRename() {
    set(isRenaming, false);
  }
  function handleRenameKeydown(e) {
    if (e.key === "Enter") {
      submitRename();
    } else if (e.key === "Escape") {
      cancelRename();
    }
  }
  function handleDuplicate() {
    closeContextMenu();
    $$props.postMessage({
      type: "duplicateEnvironment",
      data: { id: $$props.environment.id }
    });
  }
  function handleExport() {
    closeContextMenu();
    $$props.postMessage({
      type: "exportEnvironment",
      data: { id: $$props.environment.id }
    });
  }
  function handleDelete() {
    closeContextMenu();
    $$props.postMessage({
      type: "deleteEnvironment",
      data: { id: $$props.environment.id }
    });
  }
  var fragment = root$2();
  event("click", $window, closeContextMenu);
  event("keydown", $window, (e) => e.key === "Escape" && closeContextMenu());
  var div = first_child(fragment);
  let classes;
  var div_1 = child(div);
  var node = child(div_1);
  {
    var consequent = ($$anchor2) => {
      var input = root_1$2();
      bind_this(input, ($$value) => set(renameInput, $$value), () => get(renameInput));
      event("blur", input, submitRename);
      delegated("keydown", input, handleRenameKeydown);
      delegated("click", input, (e) => e.stopPropagation());
      bind_value(input, () => get(renameValue), ($$value) => set(renameValue, $$value));
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var div_2 = root_2$2();
      var node_1 = child(div_2);
      {
        var consequent_1 = ($$anchor3) => {
          var span = root_3$1();
          append($$anchor3, span);
        };
        if_block(node_1, ($$render) => {
          if (isGlobal()) $$render(consequent_1);
        });
      }
      var span_1 = sibling(node_1, 2);
      var text = child(span_1);
      template_effect(() => set_text(text, $$props.environment.name));
      append($$anchor2, div_2);
    };
    if_block(node, ($$render) => {
      if (get(isRenaming)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var div_3 = sibling(node, 2);
  var node_2 = child(div_3);
  {
    var consequent_2 = ($$anchor2) => {
      var span_2 = root_4$1();
      var text_1 = child(span_2);
      template_effect(() => {
        set_attribute(span_2, "title", `${get(enabledCount) ?? ""} of ${get(totalCount) ?? ""} variables enabled`);
        set_text(text_1, `${get(enabledCount) ?? ""}/${get(totalCount) ?? ""}`);
      });
      append($$anchor2, span_2);
    };
    if_block(node_2, ($$render) => {
      if (get(totalCount) > 0) $$render(consequent_2);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var span_3 = root_5$1();
      append($$anchor2, span_3);
    };
    if_block(node_3, ($$render) => {
      if (isActive() && !isGlobal()) $$render(consequent_3);
    });
  }
  var node_4 = sibling(div, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_4 = root_6$1();
      var button = child(div_4);
      var button_1 = sibling(button, 2);
      var span_4 = child(button_1);
      let classes_1;
      var text_2 = sibling(span_4);
      var button_2 = sibling(button_1, 4);
      var button_3 = sibling(button_2, 2);
      var button_4 = sibling(button_3, 2);
      var button_5 = sibling(button_4, 4);
      template_effect(() => {
        set_style(div_4, `left: ${get(contextMenuX) ?? ""}px; top: ${get(contextMenuY) ?? ""}px`);
        classes_1 = set_class(span_4, 1, "context-icon codicon svelte-6h5739", null, classes_1, {
          "codicon-check": isActive(),
          "codicon-circle-outline": !isActive()
        });
        set_text(text_2, ` ${isActive() ? "Deactivate" : "Set Active"}`);
      });
      delegated("click", div_4, (e) => e.stopPropagation());
      delegated("keydown", div_4, (e) => e.key === "Escape" && closeContextMenu());
      delegated("click", button, handleClick);
      delegated("click", button_1, handleSetActive);
      delegated("click", button_2, startRename);
      delegated("click", button_3, handleDuplicate);
      delegated("click", button_4, handleExport);
      delegated("click", button_5, handleDelete);
      append($$anchor2, div_4);
    };
    if_block(node_4, ($$render) => {
      if (get(showContextMenu) && !isGlobal()) $$render(consequent_4);
    });
  }
  var node_5 = sibling(node_4, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var div_5 = root_7$1();
      var button_6 = child(div_5);
      var button_7 = sibling(button_6, 2);
      template_effect(() => set_style(div_5, `left: ${get(contextMenuX) ?? ""}px; top: ${get(contextMenuY) ?? ""}px`));
      delegated("click", div_5, (e) => e.stopPropagation());
      delegated("keydown", div_5, (e) => e.key === "Escape" && closeContextMenu());
      delegated("click", button_6, handleClick);
      delegated("click", button_7, handleExport);
      append($$anchor2, div_5);
    };
    if_block(node_5, ($$render) => {
      if (get(showContextMenu) && isGlobal()) $$render(consequent_5);
    });
  }
  template_effect(() => classes = set_class(div, 1, "environment-item svelte-6h5739", null, classes, { active: isActive(), global: isGlobal() }));
  delegated("click", div, handleClick);
  delegated("contextmenu", div, handleContextMenu);
  delegated("keydown", div, (e) => e.key === "Enter" && handleClick());
  append($$anchor, fragment);
  pop();
}
delegate(["click", "contextmenu", "keydown"]);
var root_1$1 = from_html(`<button class="clear-search svelte-102o5yz" title="Clear search"><i class="codicon codicon-close svelte-102o5yz"></i></button>`);
var root_2$1 = from_html(`<span class="section-hint svelte-102o5yz"> </span>`);
var root_5 = from_html(`<div class="env-var-row svelte-102o5yz"><span class="env-var-key svelte-102o5yz"> </span> <span class="env-var-value svelte-102o5yz"> </span></div>`);
var root_4 = from_html(`<div class="env-file-vars svelte-102o5yz"></div>`);
var root_3 = from_html(`<div class="env-file-linked svelte-102o5yz"><div class="env-file-info svelte-102o5yz"><span class="env-file-icon codicon codicon-file svelte-102o5yz"></span> <span class="env-file-name svelte-102o5yz"> </span> <span class="env-file-count svelte-102o5yz"> </span></div> <!> <button class="unlink-btn svelte-102o5yz"><span class="codicon codicon-unlink svelte-102o5yz"></span> Unlink</button></div>`);
var root_6 = from_html(`<div class="env-file-unlinked svelte-102o5yz"><button class="link-btn svelte-102o5yz"><span class="codicon codicon-link svelte-102o5yz"></span> Link .env File</button></div>`);
var root_7 = from_html(`<div class="section svelte-102o5yz"><div class="section-header svelte-102o5yz"><span class="section-title svelte-102o5yz">Global</span> <span class="section-hint svelte-102o5yz">Always active</span></div> <!></div>`);
var root_9 = from_html(`<div class="environments-list svelte-102o5yz"></div>`);
var root_11 = from_html(`<div class="empty-state small svelte-102o5yz"><p class="empty-description svelte-102o5yz"> </p> <button class="clear-search-button svelte-102o5yz">Clear search</button></div>`);
var root_12 = from_html(`<div class="empty-state small svelte-102o5yz"><p class="empty-description svelte-102o5yz">Click + to create an environment</p></div>`);
var root_8 = from_html(`<div class="section svelte-102o5yz"><div class="section-header svelte-102o5yz"><span class="section-title svelte-102o5yz">Environments</span> <span class="section-count svelte-102o5yz"> </span></div> <!></div>`);
var root_13 = from_html(`<div class="empty-state full svelte-102o5yz"><div class="empty-icon codicon codicon-symbol-variable svelte-102o5yz"></div> <p class="empty-title svelte-102o5yz">No Variables</p> <p class="empty-description svelte-102o5yz">Create environments to manage variables across requests. Use <code class="svelte-102o5yz"></code> in
        URLs, headers, and body.</p> <button class="create-button svelte-102o5yz">Create Environment</button></div>`);
var root_15 = from_html(`<span class="editor-title svelte-102o5yz">Global Variables</span>`);
var root_16 = from_html(`<input type="text" class="env-name-input svelte-102o5yz" placeholder="Environment name"/>`);
var root_14 = from_html(`<div class="env-editor-overlay svelte-102o5yz" role="dialog" aria-modal="true" tabindex="-1"><div class="env-editor svelte-102o5yz"><div class="editor-header svelte-102o5yz"><!> <button class="close-btn svelte-102o5yz" title="Close"><span class="codicon codicon-close svelte-102o5yz"></span></button></div> <div class="editor-content svelte-102o5yz"><p class="editor-hint svelte-102o5yz">Use <code class="svelte-102o5yz"></code> in URLs, headers, and body to substitute values.</p> <!></div> <div class="editor-footer svelte-102o5yz"><button class="cancel-btn svelte-102o5yz">Cancel</button> <button class="save-btn svelte-102o5yz">Save</button></div></div></div>`);
var root$1 = from_html(`<div class="variables-tab svelte-102o5yz"><div class="toolbar svelte-102o5yz"><div class="search-wrapper svelte-102o5yz"><span class="search-icon codicon codicon-search svelte-102o5yz"></span> <input type="text" class="search-input svelte-102o5yz" placeholder="Filter environments..."/> <!></div> <button class="toolbar-button svelte-102o5yz" title="New Environment"><span class="codicon codicon-add svelte-102o5yz"></span></button></div> <div class="environments-content svelte-102o5yz"><div class="section svelte-102o5yz"><div class="section-header svelte-102o5yz"><span class="section-title svelte-102o5yz">.env File</span> <!></div> <!></div> <!> <!></div> <!> <!></div>`);
function VariablesTab($$anchor, $$props) {
  push($$props, true);
  const $globalVariables = () => store_get(globalVariables, "$globalVariables", $$stores);
  const $environments = () => store_get(environments, "$environments", $$stores);
  const $envFilePath = () => store_get(envFilePath, "$envFilePath", $$stores);
  const $envFileVariables = () => store_get(envFileVariables, "$envFileVariables", $$stores);
  const $activeEnvironmentId = () => store_get(activeEnvironmentId, "$activeEnvironmentId", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let searchQuery = state("");
  let searchInput = state(void 0);
  let debounceTimer;
  let showEditor = state(false);
  let editingEnv = state(null);
  let editingIsGlobal = state(false);
  let editingVariables = state(proxy([]));
  let editingName = state("");
  const globalEnv = user_derived(() => ({
    id: "__global__",
    name: "Global Variables",
    variables: $globalVariables(),
    isGlobal: true
  }));
  function filterEnvironments(envs, query) {
    if (!query.trim()) return envs;
    const lowerQuery = query.toLowerCase();
    return envs.filter((env) => env.name.toLowerCase().includes(lowerQuery));
  }
  const filteredEnvironments = user_derived(() => filterEnvironments($environments(), get(searchQuery)));
  const hasEnvironments = user_derived(() => $environments().length > 0);
  const hasResults = user_derived(() => get(filteredEnvironments).length > 0);
  const showNoResults = user_derived(() => get(hasEnvironments) && !get(hasResults) && get(searchQuery).trim().length > 0);
  const showGlobal = user_derived(() => !get(searchQuery).trim() || get(globalEnv).name.toLowerCase().includes(get(searchQuery).toLowerCase()));
  const envFileName = user_derived(() => $envFilePath() ? $envFilePath().split(/[\\/]/).pop() || ".env" : null);
  function handleLinkEnvFile() {
    $$props.postMessage({ type: "linkEnvFile" });
  }
  function handleUnlinkEnvFile() {
    $$props.postMessage({ type: "unlinkEnvFile" });
  }
  function handleSearchInput(e) {
    const target = e.target;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => {
        set(searchQuery, target.value, true);
      },
      150
    );
  }
  function clearSearch() {
    set(searchQuery, "");
    if (get(searchInput)) {
      get(searchInput).value = "";
      get(searchInput).focus();
    }
  }
  function handleSearchKeydown(e) {
    if (e.key === "Escape" && get(searchQuery)) {
      e.preventDefault();
      clearSearch();
    }
  }
  function handleNewEnvironment() {
    const env = addEnvironment("New Environment");
    handleOpenEditor(env, false);
  }
  function handleOpenEditor(env, isGlobal) {
    set(editingEnv, { ...env }, true);
    set(editingVariables, env.variables.map((v) => ({ ...v })), true);
    set(editingName, env.name, true);
    set(editingIsGlobal, isGlobal, true);
    set(showEditor, true);
  }
  function handleSaveEditor() {
    if (!get(editingEnv)) return;
    if (get(editingIsGlobal)) {
      updateGlobalVariables(get(editingVariables));
    } else {
      updateEnvironmentVariables(get(editingEnv).id, get(editingVariables));
      const trimmedName = get(editingName).trim();
      if (trimmedName && trimmedName !== get(editingEnv).name) {
        renameEnvironment(get(editingEnv).id, trimmedName);
      }
    }
    set(showEditor, false);
    set(editingEnv, null);
  }
  function handleCancelEditor() {
    set(showEditor, false);
    set(editingEnv, null);
  }
  function handleVariablesChange(items) {
    set(editingVariables, items, true);
  }
  function handleEditorOverlayKeydown(e) {
    if (e.key === "Escape") {
      handleCancelEditor();
    }
  }
  var div = root$1();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var input = sibling(child(div_2), 2);
  bind_this(input, ($$value) => set(searchInput, $$value), () => get(searchInput));
  var node = sibling(input, 2);
  {
    var consequent = ($$anchor2) => {
      var button = root_1$1();
      delegated("click", button, clearSearch);
      append($$anchor2, button);
    };
    if_block(node, ($$render) => {
      if (get(searchQuery)) $$render(consequent);
    });
  }
  var button_1 = sibling(div_2, 2);
  var div_3 = sibling(div_1, 2);
  var div_4 = child(div_3);
  var div_5 = child(div_4);
  var node_1 = sibling(child(div_5), 2);
  {
    var consequent_1 = ($$anchor2) => {
      var span = root_2$1();
      var text = child(span);
      template_effect(() => set_text(text, get(envFileName)));
      append($$anchor2, span);
    };
    if_block(node_1, ($$render) => {
      if (get(envFileName)) $$render(consequent_1);
    });
  }
  var node_2 = sibling(div_5, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_6 = root_3();
      var div_7 = child(div_6);
      var span_1 = sibling(child(div_7), 2);
      var text_1 = child(span_1);
      var span_2 = sibling(span_1, 2);
      var text_2 = child(span_2);
      var node_3 = sibling(div_7, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_8 = root_4();
          each(div_8, 5, $envFileVariables, index, ($$anchor4, v) => {
            var div_9 = root_5();
            var span_3 = child(div_9);
            var text_3 = child(span_3);
            var span_4 = sibling(span_3, 2);
            var text_4 = child(span_4);
            template_effect(() => {
              set_text(text_3, get(v).key);
              set_text(text_4, get(v).value);
            });
            append($$anchor4, div_9);
          });
          append($$anchor3, div_8);
        };
        if_block(node_3, ($$render) => {
          if ($envFileVariables().length > 0) $$render(consequent_2);
        });
      }
      var button_2 = sibling(node_3, 2);
      template_effect(() => {
        set_attribute(span_1, "title", $envFilePath());
        set_text(text_1, get(envFileName));
        set_text(text_2, `${$envFileVariables().length ?? ""} var${$envFileVariables().length !== 1 ? "s" : ""}`);
      });
      delegated("click", button_2, handleUnlinkEnvFile);
      append($$anchor2, div_6);
    };
    var alternate = ($$anchor2) => {
      var div_10 = root_6();
      var button_3 = child(div_10);
      delegated("click", button_3, handleLinkEnvFile);
      append($$anchor2, div_10);
    };
    if_block(node_2, ($$render) => {
      if ($envFilePath()) $$render(consequent_3);
      else $$render(alternate, false);
    });
  }
  var node_4 = sibling(div_4, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_11 = root_7();
      var node_5 = sibling(child(div_11), 2);
      EnvironmentItem(node_5, {
        get environment() {
          return get(globalEnv);
        },
        isGlobal: true,
        get postMessage() {
          return $$props.postMessage;
        },
        onOpenEditor: handleOpenEditor
      });
      append($$anchor2, div_11);
    };
    if_block(node_4, ($$render) => {
      if (get(showGlobal)) $$render(consequent_4);
    });
  }
  var node_6 = sibling(node_4, 2);
  {
    var consequent_8 = ($$anchor2) => {
      var div_12 = root_8();
      var div_13 = child(div_12);
      var span_5 = sibling(child(div_13), 2);
      var text_5 = child(span_5);
      var node_7 = sibling(div_13, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_14 = root_9();
          each(div_14, 21, () => get(filteredEnvironments), (env) => env.id, ($$anchor4, env) => {
            {
              let $0 = user_derived(() => get(env).id === $activeEnvironmentId());
              EnvironmentItem($$anchor4, {
                get environment() {
                  return get(env);
                },
                get isActive() {
                  return get($0);
                },
                get postMessage() {
                  return $$props.postMessage;
                },
                onOpenEditor: handleOpenEditor
              });
            }
          });
          append($$anchor3, div_14);
        };
        var consequent_6 = ($$anchor3) => {
          var div_15 = root_11();
          var p = child(div_15);
          var text_6 = child(p);
          var button_4 = sibling(p, 2);
          template_effect(() => set_text(text_6, `No environments match "${get(searchQuery) ?? ""}"`));
          delegated("click", button_4, clearSearch);
          append($$anchor3, div_15);
        };
        var consequent_7 = ($$anchor3) => {
          var div_16 = root_12();
          append($$anchor3, div_16);
        };
        if_block(node_7, ($$render) => {
          if (get(hasResults)) $$render(consequent_5);
          else if (get(showNoResults)) $$render(consequent_6, 1);
          else if (!get(hasEnvironments)) $$render(consequent_7, 2);
        });
      }
      template_effect(() => set_text(text_5, $environments().length));
      append($$anchor2, div_12);
    };
    if_block(node_6, ($$render) => {
      if (get(hasEnvironments) || !get(searchQuery)) $$render(consequent_8);
    });
  }
  var node_8 = sibling(div_3, 2);
  {
    var consequent_9 = ($$anchor2) => {
      var div_17 = root_13();
      var p_1 = sibling(child(div_17), 4);
      var code = sibling(child(p_1));
      code.textContent = "{{varName}}";
      var button_5 = sibling(p_1, 2);
      delegated("click", button_5, handleNewEnvironment);
      append($$anchor2, div_17);
    };
    if_block(node_8, ($$render) => {
      if (!get(hasEnvironments) && $globalVariables().length === 0 && !get(searchQuery)) $$render(consequent_9);
    });
  }
  var node_9 = sibling(node_8, 2);
  {
    var consequent_11 = ($$anchor2) => {
      var div_18 = root_14();
      var div_19 = child(div_18);
      var div_20 = child(div_19);
      var node_10 = child(div_20);
      {
        var consequent_10 = ($$anchor3) => {
          var span_6 = root_15();
          append($$anchor3, span_6);
        };
        var alternate_1 = ($$anchor3) => {
          var input_1 = root_16();
          bind_value(input_1, () => get(editingName), ($$value) => set(editingName, $$value));
          append($$anchor3, input_1);
        };
        if_block(node_10, ($$render) => {
          if (get(editingIsGlobal)) $$render(consequent_10);
          else $$render(alternate_1, false);
        });
      }
      var button_6 = sibling(node_10, 2);
      var div_21 = sibling(div_20, 2);
      var p_2 = child(div_21);
      var code_1 = sibling(child(p_2));
      code_1.textContent = "{{variableName}}";
      var node_11 = sibling(p_2, 2);
      KeyValueEditor(node_11, {
        get items() {
          return get(editingVariables);
        },
        keyPlaceholder: "Variable name",
        valuePlaceholder: "Value",
        onchange: handleVariablesChange
      });
      var div_22 = sibling(div_21, 2);
      var button_7 = child(div_22);
      var button_8 = sibling(button_7, 2);
      delegated("click", div_18, (e) => {
        if (e.target === e.currentTarget) handleCancelEditor();
      });
      delegated("keydown", div_18, handleEditorOverlayKeydown);
      delegated("click", button_6, handleCancelEditor);
      delegated("click", button_7, handleCancelEditor);
      delegated("click", button_8, handleSaveEditor);
      append($$anchor2, div_18);
    };
    if_block(node_9, ($$render) => {
      if (get(showEditor) && get(editingEnv)) $$render(consequent_11);
    });
  }
  delegated("input", input, handleSearchInput);
  delegated("keydown", input, handleSearchKeydown);
  delegated("click", button_1, handleNewEnvironment);
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["input", "keydown", "click"]);
var root_1 = from_html(`<button class="new-request-button svelte-fcgxts"><span class="button-icon codicon codicon-add svelte-fcgxts"></span> <span class="button-label svelte-fcgxts">New Request</span></button>`);
var root_2 = from_html(`<div class="loading svelte-fcgxts">Loading...</div>`);
var root = from_html(`<div class="sidebar svelte-fcgxts"><div class="new-request-bar svelte-fcgxts"><!></div> <div class="tab-bar svelte-fcgxts"><button title="Collections">Collections</button> <button title="Variables">Variables</button></div> <div class="tab-content svelte-fcgxts"><!></div></div>`);
function SidebarApp($$anchor, $$props) {
  push($$props, true);
  let activeTab = state("collections");
  let isLoading = state(true);
  function handleMessage(event2) {
    const message = event2.data;
    switch (message.type) {
      case "initialData":
        initCollections(message.data.collections || []);
        loadEnvironments({
          ...message.data.environments || { environments: [], activeId: null, globalVariables: [] },
          envFileVariables: message.data.envFileVariables,
          envFilePath: message.data.envFilePath
        });
        set(isLoading, false);
        break;
      case "collectionsUpdated":
        initCollections(message.data || []);
        break;
      case "environmentsUpdated":
        loadEnvironments(message.data || { environments: [], activeId: null, globalVariables: [] });
        break;
      case "envFileVariablesUpdated":
        loadEnvFileVariables(message.data);
        break;
    }
  }
  onMount(() => {
    var _a;
    window.addEventListener("message", handleMessage);
    (_a = window.vscode) == null ? void 0 : _a.postMessage({ type: "ready" });
  });
  onDestroy(() => {
    window.removeEventListener("message", handleMessage);
  });
  function postMessage(message) {
    var _a;
    (_a = window.vscode) == null ? void 0 : _a.postMessage(message);
  }
  function handleNewRequest() {
    postMessage({ type: "newRequest" });
  }
  function setActiveTab(tab) {
    set(activeTab, tab, true);
  }
  var div = root();
  var div_1 = child(div);
  var node = child(div_1);
  Tooltip(node, {
    text: "New Request (Ctrl+N)",
    children: ($$anchor2, $$slotProps) => {
      var button = root_1();
      delegated("click", button, handleNewRequest);
      append($$anchor2, button);
    },
    $$slots: { default: true }
  });
  var div_2 = sibling(div_1, 2);
  var button_1 = child(div_2);
  let classes;
  var button_2 = sibling(button_1, 2);
  let classes_1;
  var div_3 = sibling(div_2, 2);
  var node_1 = child(div_3);
  {
    var consequent = ($$anchor2) => {
      var div_4 = root_2();
      append($$anchor2, div_4);
    };
    var consequent_1 = ($$anchor2) => {
      CollectionsTab($$anchor2, { postMessage });
    };
    var consequent_2 = ($$anchor2) => {
      VariablesTab($$anchor2, { postMessage });
    };
    if_block(node_1, ($$render) => {
      if (get(isLoading)) $$render(consequent);
      else if (get(activeTab) === "collections") $$render(consequent_1, 1);
      else if (get(activeTab) === "variables") $$render(consequent_2, 2);
    });
  }
  template_effect(() => {
    classes = set_class(button_1, 1, "tab-button svelte-fcgxts", null, classes, { active: get(activeTab) === "collections" });
    classes_1 = set_class(button_2, 1, "tab-button svelte-fcgxts", null, classes_1, { active: get(activeTab) === "variables" });
  });
  delegated("click", button_1, () => setActiveTab("collections"));
  delegated("click", button_2, () => setActiveTab("variables"));
  append($$anchor, div);
  pop();
}
delegate(["click"]);
mount(SidebarApp, {
  target: document.body
});
//# sourceMappingURL=sidebar.js.map
