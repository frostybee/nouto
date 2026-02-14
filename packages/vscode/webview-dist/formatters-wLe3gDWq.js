import { b as block, O as EFFECT_TRANSPARENT, B as BranchManager, P as listen_to_event_and_reset_event, Q as current_batch, M as tick, R as untrack, S as render_effect, T as previous_batch, U as effect, V as queue_micro_task, W as STATE_SYMBOL, X as get_descriptor, Y as capture_store_binding, Z as props_invalid_value, _ as PROPS_IS_UPDATED, k as get, F as proxy, l as set, a0 as is_destroying_effect, a1 as active_effect, a2 as DESTROYED, a3 as PROPS_IS_BINDABLE, a4 as PROPS_IS_IMMUTABLE, a5 as derived, a6 as derived_safe_equal, a7 as PROPS_IS_LAZY_INITIAL, a8 as LEGACY_PROPS, a9 as component_context, u as user_effect, w as writable, d as derived$1, g as get$1, a as delegate, o as state, i as if_block, e as event, c as delegated, h as append, v as sibling, t as template_effect, m as from_html, x as set_class, C as set_text, r as child, p as push, E as comment, f as first_child, j as pop, s as setup_stores, n as user_derived, y as set_attribute, q as store_get, z as set_value, A as each, D as index, I as set_checked } from "./theme-U7NfCYzD.js";
import { a as isRequest, i as isFolder, c as createCollection, g as generateId$1, b as createFolder } from "./types-yqghzbIO.js";
import { s as set_style } from "./style-BHbAZ2u6.js";
function lifecycle_outside_component(name) {
  {
    throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
  }
}
function snippet(node, get_snippet, ...args) {
  var branches = new BranchManager(node);
  block(() => {
    const snippet2 = get_snippet() ?? null;
    branches.ensure(snippet2, snippet2 && ((anchor) => snippet2(anchor, ...args)));
  }, EFFECT_TRANSPARENT);
}
function bind_value(input, get2, set2 = get2) {
  var batches = /* @__PURE__ */ new WeakSet();
  listen_to_event_and_reset_event(input, "input", async (is_reset) => {
    var value = is_reset ? input.defaultValue : input.value;
    value = is_numberlike_input(input) ? to_number(value) : value;
    set2(value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
    await tick();
    if (value !== (value = get2())) {
      var start = input.selectionStart;
      var end = input.selectionEnd;
      var length = input.value.length;
      input.value = value ?? "";
      if (end !== null) {
        var new_length = input.value.length;
        if (start === end && end === length && new_length > length) {
          input.selectionStart = new_length;
          input.selectionEnd = new_length;
        } else {
          input.selectionStart = start;
          input.selectionEnd = Math.min(end, new_length);
        }
      }
    }
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the updated value from the input instead.
    // If defaultValue is set, then value == defaultValue
    // TODO Svelte 6: remove input.value check and set to empty string?
    untrack(get2) == null && input.value
  ) {
    set2(is_numberlike_input(input) ? to_number(input.value) : input.value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
  }
  render_effect(() => {
    var value = get2();
    if (input === document.activeElement) {
      var batch = (
        /** @type {Batch} */
        previous_batch ?? current_batch
      );
      if (batches.has(batch)) {
        return;
      }
    }
    if (is_numberlike_input(input) && value === to_number(input.value)) {
      return;
    }
    if (input.type === "date" && !value && !input.value) {
      return;
    }
    if (value !== input.value) {
      input.value = value ?? "";
    }
  });
}
function bind_checked(input, get2, set2 = get2) {
  listen_to_event_and_reset_event(input, "change", (is_reset) => {
    var value = is_reset ? input.defaultChecked : input.checked;
    set2(value);
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the update value from the input instead.
    // If defaultChecked is set, then checked == defaultChecked
    untrack(get2) == null
  ) {
    set2(input.checked);
  }
  render_effect(() => {
    var value = get2();
    input.checked = Boolean(value);
  });
}
function is_numberlike_input(input) {
  var type = input.type;
  return type === "number" || type === "range";
}
function to_number(value) {
  return value === "" ? null : +value;
}
function is_bound_this(bound_value, element_or_component) {
  return bound_value === element_or_component || (bound_value == null ? void 0 : bound_value[STATE_SYMBOL]) === element_or_component;
}
function bind_this(element_or_component = {}, update, get_value, get_parts) {
  effect(() => {
    var old_parts;
    var parts;
    render_effect(() => {
      old_parts = parts;
      parts = [];
      untrack(() => {
        if (element_or_component !== get_value(...parts)) {
          update(element_or_component, ...parts);
          if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) {
            update(null, ...old_parts);
          }
        }
      });
    });
    return () => {
      queue_micro_task(() => {
        if (parts && is_bound_this(get_value(...parts), element_or_component)) {
          update(null, ...parts);
        }
      });
    };
  });
  return element_or_component;
}
function prop(props, key, flags, fallback) {
  var _a;
  var bindable = (flags & PROPS_IS_BINDABLE) !== 0;
  var lazy = (flags & PROPS_IS_LAZY_INITIAL) !== 0;
  var fallback_value = (
    /** @type {V} */
    fallback
  );
  var fallback_dirty = true;
  var get_fallback = () => {
    if (fallback_dirty) {
      fallback_dirty = false;
      fallback_value = lazy ? untrack(
        /** @type {() => V} */
        fallback
      ) : (
        /** @type {V} */
        fallback
      );
    }
    return fallback_value;
  };
  var setter;
  if (bindable) {
    var is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;
    setter = ((_a = get_descriptor(props, key)) == null ? void 0 : _a.set) ?? (is_entry_props && key in props ? (v) => props[key] = v : void 0);
  }
  var initial_value;
  var is_store_sub = false;
  if (bindable) {
    [initial_value, is_store_sub] = capture_store_binding(() => (
      /** @type {V} */
      props[key]
    ));
  } else {
    initial_value = /** @type {V} */
    props[key];
  }
  if (initial_value === void 0 && fallback !== void 0) {
    initial_value = get_fallback();
    if (setter) {
      props_invalid_value();
      setter(initial_value);
    }
  }
  var getter;
  {
    getter = () => {
      var value = (
        /** @type {V} */
        props[key]
      );
      if (value === void 0) return get_fallback();
      fallback_dirty = true;
      return value;
    };
  }
  if ((flags & PROPS_IS_UPDATED) === 0) {
    return getter;
  }
  if (setter) {
    var legacy_parent = props.$$legacy;
    return (
      /** @type {() => V} */
      (function(value, mutation) {
        if (arguments.length > 0) {
          if (!mutation || legacy_parent || is_store_sub) {
            setter(mutation ? getter() : value);
          }
          return value;
        }
        return getter();
      })
    );
  }
  var overridden = false;
  var d = ((flags & PROPS_IS_IMMUTABLE) !== 0 ? derived : derived_safe_equal)(() => {
    overridden = false;
    return getter();
  });
  if (bindable) get(d);
  var parent_effect = (
    /** @type {Effect} */
    active_effect
  );
  return (
    /** @type {() => V} */
    (function(value, mutation) {
      if (arguments.length > 0) {
        const new_value = mutation ? get(d) : bindable ? proxy(value) : value;
        set(d, new_value);
        overridden = true;
        if (fallback_value !== void 0) {
          fallback_value = new_value;
        }
        return value;
      }
      if (is_destroying_effect && overridden || (parent_effect.f & DESTROYED) !== 0) {
        return d.v;
      }
      return get(d);
    })
  );
}
function onMount(fn) {
  if (component_context === null) {
    lifecycle_outside_component();
  }
  {
    user_effect(() => {
      const cleanup = untrack(fn);
      if (typeof cleanup === "function") return (
        /** @type {() => void} */
        cleanup
      );
    });
  }
}
function onDestroy(fn) {
  if (component_context === null) {
    lifecycle_outside_component();
  }
  onMount(() => () => untrack(fn));
}
const initialState = {
  method: "GET",
  url: "",
  params: [],
  headers: [],
  auth: { type: "none" },
  body: { type: "none", content: "" },
  assertions: [],
  scripts: { preRequest: "", postResponse: "" },
  description: ""
};
const request = writable(initialState);
function clone(value) {
  if (value === null || value === void 0 || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}
function setMethod(method) {
  request.update((state2) => ({ ...state2, method }));
}
function setUrl(url) {
  request.update((state2) => ({ ...state2, url }));
}
function setParams(params) {
  request.update((state2) => ({ ...state2, params: clone(params) }));
}
function setUrlAndParams(url, params) {
  request.update((state2) => ({ ...state2, url, params: clone(params) }));
}
function setHeaders(headers) {
  request.update((state2) => ({ ...state2, headers: clone(headers) }));
}
function setAuth(auth) {
  request.update((state2) => ({ ...state2, auth: clone(auth) }));
}
function setBody(body) {
  request.update((state2) => ({ ...state2, body: clone(body) }));
}
function setAssertions(assertions) {
  request.update((state2) => ({ ...state2, assertions: clone(assertions) }));
}
function setAuthInheritance(authInheritance) {
  request.update((state2) => ({ ...state2, authInheritance }));
}
function setScripts(scripts) {
  request.update((state2) => ({ ...state2, scripts: clone(scripts) }));
}
function setDescription(description) {
  request.update((state2) => ({ ...state2, description }));
}
class VSCodeMessageBus {
  send(message) {
    var _a;
    (_a = window.vscode) == null ? void 0 : _a.postMessage(message);
  }
  onMessage(callback) {
    const handler = (event2) => {
      callback(event2.data);
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }
  getState() {
    var _a;
    return (_a = window.vscode) == null ? void 0 : _a.getState();
  }
  setState(state2) {
    var _a;
    (_a = window.vscode) == null ? void 0 : _a.setState(state2);
  }
}
const bus = new VSCodeMessageBus();
function postMessage(message) {
  bus.send(message);
}
function onMessage(callback) {
  return bus.onMessage(callback);
}
function getState() {
  return bus.getState();
}
function setState(state2) {
  bus.setState(state2);
}
const collections = writable([]);
const selectedCollectionId = writable(null);
const selectedRequestId = writable(null);
const selectedFolderId = writable(null);
function findItemRecursive(items, id) {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (isFolder(item)) {
      const found = findItemRecursive(item.children, id);
      if (found) return found;
    }
  }
  return null;
}
function addItemToContainer(items, newItem, targetFolderId) {
  if (!targetFolderId) {
    return [...items, newItem];
  }
  return items.map((item) => {
    if (item.id === targetFolderId && isFolder(item)) {
      return {
        ...item,
        children: [...item.children, newItem],
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: addItemToContainer(item.children, newItem, targetFolderId)
      };
    }
    return item;
  });
}
function removeItemFromTree(items, itemId) {
  return items.filter((item) => item.id !== itemId).map((item) => {
    if (isFolder(item)) {
      return {
        ...item,
        children: removeItemFromTree(item.children, itemId)
      };
    }
    return item;
  });
}
function updateItemInTree(items, itemId, updater) {
  return items.map((item) => {
    if (item.id === itemId) {
      return updater(item);
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: updateItemInTree(item.children, itemId, updater)
      };
    }
    return item;
  });
}
function toggleFolderExpandedInTree(items, folderId) {
  return items.map((item) => {
    if (item.id === folderId && isFolder(item)) {
      return { ...item, expanded: !item.expanded };
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: toggleFolderExpandedInTree(item.children, folderId)
      };
    }
    return item;
  });
}
derived$1(
  [collections, selectedCollectionId],
  ([$collections, $selectedCollectionId]) => {
    if (!$selectedCollectionId) return null;
    return $collections.find((c) => c.id === $selectedCollectionId) || null;
  }
);
derived$1(
  [collections, selectedRequestId],
  ([$collections, $selectedRequestId]) => {
    if (!$selectedRequestId) return null;
    for (const collection of $collections) {
      const item = findItemRecursive(collection.items, $selectedRequestId);
      if (item && isRequest(item)) return item;
    }
    return null;
  }
);
derived$1(
  [collections, selectedFolderId],
  ([$collections, $selectedFolderId]) => {
    if (!$selectedFolderId) return null;
    for (const collection of $collections) {
      const item = findItemRecursive(collection.items, $selectedFolderId);
      if (item && isFolder(item)) return item;
    }
    return null;
  }
);
function initCollections(data) {
  collections.set(data);
}
function addCollection(name) {
  const existing = get$1(collections);
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase() && !c.builtin)) {
    return null;
  }
  const newCollection = createCollection(name);
  collections.update((cols) => [...cols, newCollection]);
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
  return newCollection;
}
function renameCollection(id, name) {
  collections.update((cols) => cols.map((col) => {
    if (col.id === id) {
      return { ...col, name, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    return col;
  }));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function toggleCollectionExpanded(id) {
  collections.update((cols) => cols.map((col) => {
    if (col.id === id) {
      return { ...col, expanded: !col.expanded };
    }
    return col;
  }));
}
function toggleFolderExpanded(folderId) {
  collections.update((cols) => cols.map((col) => ({
    ...col,
    items: toggleFolderExpandedInTree(col.items, folderId)
  })));
}
function addFolder(collectionId, name, parentFolderId) {
  const newFolder = createFolder(name);
  collections.update((cols) => cols.map((col) => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newFolder, parentFolderId),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    return col;
  }));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
  return newFolder;
}
function renameFolder(folderId, name) {
  collections.update((cols) => cols.map((col) => ({
    ...col,
    items: updateItemInTree(col.items, folderId, (folder) => ({
      ...folder,
      name,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    })),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  })));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function addRequestToCollection(collectionId, request2, parentFolderId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newRequest = {
    type: "request",
    id: generateId$1(),
    ...request2,
    createdAt: now,
    updatedAt: now
  };
  collections.update((cols) => cols.map((col) => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newRequest, parentFolderId),
        updatedAt: now
      };
    }
    return col;
  }));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
  return newRequest;
}
function updateRequest(requestId, updates) {
  collections.update((cols) => cols.map((col) => ({
    ...col,
    items: updateItemInTree(col.items, requestId, (request2) => ({
      ...request2,
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    })),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  })));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function deleteRequest(requestId) {
  collections.update((cols) => cols.map((col) => ({
    ...col,
    items: removeItemFromTree(col.items, requestId),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  })));
  if (get$1(selectedRequestId) === requestId) {
    selectedRequestId.set(null);
  }
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function duplicateRequest(requestId) {
  const cols = get$1(collections);
  let foundRequest = null;
  let foundCollection = null;
  for (const col of cols) {
    const item = findItemRecursive(col.items, requestId);
    if (item && isRequest(item)) {
      foundRequest = item;
      foundCollection = col;
      break;
    }
  }
  if (!foundRequest || !foundCollection) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const duplicate = {
    ...foundRequest,
    id: generateId$1(),
    name: `${foundRequest.name} (copy)`,
    createdAt: now,
    updatedAt: now
  };
  collections.update((cols2) => cols2.map((col) => {
    if (col.id === foundCollection.id) {
      return {
        ...col,
        items: [...col.items, duplicate],
        updatedAt: now
      };
    }
    return col;
  }));
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function moveItem(itemId, targetCollectionId, targetFolderId) {
  const cols = get$1(collections);
  let itemToMove = null;
  for (const col of cols) {
    const found = findItemRecursive(col.items, itemId);
    if (found) {
      itemToMove = found;
      break;
    }
  }
  if (!itemToMove) return;
  collections.update((cols2) => {
    let updatedCols = cols2.map((col) => ({
      ...col,
      items: removeItemFromTree(col.items, itemId),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }));
    updatedCols = updatedCols.map((col) => {
      if (col.id === targetCollectionId) {
        return {
          ...col,
          items: addItemToContainer(col.items, itemToMove, targetFolderId),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      return col;
    });
    return updatedCols;
  });
  postMessage({
    type: "saveCollections",
    data: get$1(collections)
  });
}
function selectRequest(collectionId, requestId) {
  selectedCollectionId.set(collectionId);
  selectedRequestId.set(requestId);
  selectedFolderId.set(null);
}
function isRecentCollection(collection) {
  return collection.builtin === "recent";
}
derived$1(
  collections,
  ($collections) => $collections.find((c) => c.builtin === "recent") || null
);
const responseContext = writable({
  responses: /* @__PURE__ */ new Map(),
  lastResponse: null,
  nameToId: /* @__PURE__ */ new Map()
});
function storeResponse(requestId, response, requestName) {
  responseContext.update((ctx) => {
    const newResponses = new Map(ctx.responses);
    newResponses.set(requestId, response);
    const newNameToId = new Map(ctx.nameToId);
    if (requestName) {
      newNameToId.set(requestName, requestId);
    }
    return {
      responses: newResponses,
      lastResponse: response,
      nameToId: newNameToId
    };
  });
}
function getResponse(requestId) {
  const ctx = get$1(responseContext);
  return ctx.responses.get(requestId) || null;
}
function getResponseValue(path) {
  const ctx = get$1(responseContext);
  if (!ctx.lastResponse) return void 0;
  const parts = parsePath(path);
  if (parts.length === 0) return void 0;
  const firstPart = parts[0];
  switch (firstPart) {
    case "body":
    case "data":
      return getNestedValue(ctx.lastResponse.data, parts.slice(1));
    case "headers":
      return getNestedValue(ctx.lastResponse.headers, parts.slice(1));
    case "status":
      return ctx.lastResponse.status;
    case "statusText":
      return ctx.lastResponse.statusText;
    case "duration":
      return ctx.lastResponse.duration;
    case "size":
      return ctx.lastResponse.size;
    default:
      return getNestedValue(ctx.lastResponse.data, parts);
  }
}
function getResponseValueById(requestId, path) {
  const response = getResponse(requestId);
  if (!response) return void 0;
  const parts = parsePath(path);
  if (parts.length === 0) return void 0;
  const firstPart = parts[0];
  switch (firstPart) {
    case "body":
    case "data":
      return getNestedValue(response.data, parts.slice(1));
    case "headers":
      return getNestedValue(response.headers, parts.slice(1));
    case "status":
      return response.status;
    case "statusText":
      return response.statusText;
    default:
      return getNestedValue(response.data, parts);
  }
}
function getResponseValueByName(requestName, path) {
  const ctx = get$1(responseContext);
  const requestId = ctx.nameToId.get(requestName);
  if (!requestId) return void 0;
  return getResponseValueById(requestId, path);
}
function parsePath(path) {
  if (!path) return [];
  const parts = [];
  let current = "";
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === ".") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      const closingIndex = path.indexOf("]", i);
      if (closingIndex > i + 1) {
        const index2 = path.substring(i + 1, closingIndex);
        parts.push(index2);
        i = closingIndex;
      }
    } else if (char !== "]") {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
function getNestedValue(obj, pathParts) {
  if (obj === void 0 || obj === null) return void 0;
  if (pathParts.length === 0) return obj;
  let current = obj;
  for (const part of pathParts) {
    if (current === void 0 || current === null) {
      return void 0;
    }
    const index2 = parseInt(part, 10);
    if (!isNaN(index2) && Array.isArray(current) && index2 >= 0 && index2 < current.length) {
      current = current[index2];
    } else if (typeof current === "object") {
      current = current[part];
    } else {
      return void 0;
    }
  }
  return current;
}
const environments = writable([]);
const globalVariables = writable([]);
const activeEnvironmentId = writable(null);
const envFileVariables = writable([]);
const envFilePath = writable(null);
const activeEnvironment = derived$1(
  [environments, activeEnvironmentId],
  ([$environments, $activeId]) => {
    if (!$activeId) return null;
    return $environments.find((env) => env.id === $activeId) || null;
  }
);
const activeVariables = derived$1(
  [activeEnvironment, globalVariables, envFileVariables],
  ([$env, $globalVars, $envFileVars]) => {
    const map = /* @__PURE__ */ new Map();
    for (const v of $envFileVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }
    for (const v of $globalVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }
    if ($env) {
      for (const v of $env.variables) {
        if (v.enabled && v.key) {
          map.set(v.key, v.value);
        }
      }
    }
    return map;
  }
);
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function getUniqueEnvName(baseName, currentEnvs, excludeId) {
  const names = new Set(currentEnvs.filter((e) => e.id !== excludeId).map((e) => e.name));
  if (!names.has(baseName)) return baseName;
  let counter = 2;
  while (names.has(`${baseName} (${counter})`)) {
    counter++;
  }
  return `${baseName} (${counter})`;
}
function filterEmptyKeys(variables) {
  return variables.filter((v) => v.key.trim() !== "");
}
function addEnvironment(name) {
  const currentEnvs = get$1(environments);
  const uniqueName = getUniqueEnvName(name, currentEnvs);
  const env = {
    id: generateId(),
    name: uniqueName,
    variables: []
  };
  environments.update((envs) => [...envs, env]);
  saveEnvironments();
  return env;
}
function deleteEnvironment(id) {
  environments.update((envs) => envs.filter((e) => e.id !== id));
  activeEnvironmentId.update((activeId) => activeId === id ? null : activeId);
  saveEnvironments();
}
function renameEnvironment(id, name) {
  const currentEnvs = get$1(environments);
  const uniqueName = getUniqueEnvName(name, currentEnvs, id);
  environments.update(
    (envs) => envs.map((e) => e.id === id ? { ...e, name: uniqueName } : e)
  );
  saveEnvironments();
}
function setActiveEnvironment(id) {
  activeEnvironmentId.set(id);
  saveEnvironments();
}
function updateEnvironmentVariables(id, variables) {
  const filtered = filterEmptyKeys(variables);
  environments.update(
    (envs) => envs.map((e) => e.id === id ? { ...e, variables: filtered } : e)
  );
  saveEnvironments();
}
function updateGlobalVariables(variables) {
  globalVariables.set(filterEmptyKeys(variables));
  saveEnvironments();
}
function loadEnvironments(data) {
  environments.set(data.environments || []);
  activeEnvironmentId.set(data.activeId);
  globalVariables.set(data.globalVariables || []);
  if (data.envFilePath !== void 0) {
    envFilePath.set(data.envFilePath ?? null);
  }
  if (data.envFileVariables) {
    envFileVariables.set(data.envFileVariables);
  }
}
function loadEnvFileVariables(data) {
  envFileVariables.set(data.variables || []);
  envFilePath.set(data.filePath);
}
function saveEnvironments() {
  const envs = get$1(environments);
  const activeId = get$1(activeEnvironmentId);
  const globalVars = get$1(globalVariables);
  const data = JSON.parse(JSON.stringify({ environments: envs, activeId, globalVariables: globalVars }));
  postMessage({
    type: "saveEnvironments",
    data
  });
}
function getUnresolvedVariables(text, vars) {
  if (!text) return [];
  const unresolved = [];
  const pattern = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const trimmed = match[1].trim();
    if (trimmed.startsWith("$")) continue;
    if (!/^\w+$/.test(trimmed)) continue;
    if (!vars.has(trimmed)) {
      unresolved.push(trimmed);
    }
  }
  return [...new Set(unresolved)];
}
function substituteVariables(text) {
  const vars = get$1(activeVariables);
  return text.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
    const trimmed = expression.trim();
    const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
    if (namedRefMatch) {
      const [, reqName, responsePath] = namedRefMatch;
      const value = getResponseValueByName(reqName, responsePath);
      if (value !== void 0) {
        return typeof value === "object" ? JSON.stringify(value) : String(value);
      }
      return match;
    }
    if (trimmed.startsWith("$")) {
      return substituteBuiltInVariable(trimmed) ?? match;
    }
    if (/^\w+$/.test(trimmed)) {
      return vars.has(trimmed) ? vars.get(trimmed) : match;
    }
    return match;
  });
}
function substituteBuiltInVariable(expression) {
  if (expression.startsWith("$response.")) {
    const path = expression.substring("$response.".length);
    const value = getResponseValue(path);
    if (value === void 0) {
      return void 0;
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value).replace(/<[^>]*>/g, "");
  }
  const parts = expression.split(",").map((s) => s.trim());
  const varName = parts[0];
  const args = parts.slice(1);
  switch (varName) {
    case "$guid":
    case "$uuid":
      return generateUUID();
    case "$timestamp":
      return Math.floor(Date.now() / 1e3).toString();
    case "$isoTimestamp":
      return (/* @__PURE__ */ new Date()).toISOString();
    case "$randomInt":
      return Math.floor(Math.random() * 1001).toString();
    case "$name":
      return generateRandomName();
    case "$email":
      return generateRandomEmail();
    case "$string": {
      const len = args[0] ? parseInt(args[0], 10) : 16;
      return generateRandomString(isNaN(len) ? 16 : len);
    }
    case "$number": {
      let min = args[0] !== void 0 ? Number(args[0]) : 0;
      let max = args[1] !== void 0 ? Number(args[1]) : 1e3;
      if (isNaN(min) || isNaN(max)) {
        min = 0;
        max = 1e3;
      }
      return generateRandomNumber(min, max).toString();
    }
    case "$bool":
      return Math.random() < 0.5 ? "true" : "false";
    case "$enum": {
      if (args.length === 0) return void 0;
      return args[Math.floor(Math.random() * args.length)];
    }
    case "$date": {
      const format = args[0] || "YYYY-MM-DDTHH:mm:ss";
      return formatDate(/* @__PURE__ */ new Date(), format);
    }
    case "$dateISO":
      return (/* @__PURE__ */ new Date()).toISOString();
    default:
      return void 0;
  }
}
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
const FIRST_NAMES = [
  "James",
  "Mary",
  "John",
  "Patricia",
  "Robert",
  "Jennifer",
  "Michael",
  "Linda",
  "William",
  "Elizabeth",
  "David",
  "Barbara",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Charles",
  "Karen"
];
const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin"
];
function generateRandomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}
function generateRandomEmail() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].toLowerCase();
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)].toLowerCase();
  const suffix = Math.floor(Math.random() * 1e3);
  const domains = ["example.com", "test.com", "example.org"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${first}.${last}${suffix}@${domain}`;
}
function generateRandomString(length) {
  const clamped = Math.max(1, Math.min(256, length));
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < clamped; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}
function generateRandomNumber(min, max) {
  if (min > max) {
    [min, max] = [max, min];
  }
  if (Number.isInteger(min) && Number.isInteger(max)) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function formatDate(date, format) {
  const tokens = {
    "YYYY": date.getFullYear().toString(),
    "MM": String(date.getMonth() + 1).padStart(2, "0"),
    "DD": String(date.getDate()).padStart(2, "0"),
    "HH": String(date.getHours()).padStart(2, "0"),
    "mm": String(date.getMinutes()).padStart(2, "0"),
    "ss": String(date.getSeconds()).padStart(2, "0")
  };
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
}
var root_1$3 = from_html(`<div role="tooltip"> <span class="arrow svelte-kaiebb"></span></div>`);
var root$2 = from_html(`<div class="tooltip-wrapper svelte-kaiebb"><!> <!></div>`);
function Tooltip($$anchor, $$props) {
  let position = prop($$props, "position", 3, "bottom"), delay = prop($$props, "delay", 3, 150);
  let visible = state(false);
  let ready = state(false);
  let timeoutId;
  let wrapperEl = state(void 0);
  let tooltipEl = state(void 0);
  let pos = state(proxy({ top: 0, left: 0 }));
  let arrowLeft = state(0);
  function show() {
    timeoutId = setTimeout(
      () => {
        set(visible, true);
        set(ready, false);
        requestAnimationFrame(() => {
          if (!get(tooltipEl) || !get(wrapperEl)) return;
          const wr = get(wrapperEl).getBoundingClientRect();
          const tr = get(tooltipEl).getBoundingClientRect();
          const pad = 6;
          let left = wr.left + wr.width / 2 - tr.width / 2;
          if (left < pad) left = pad;
          if (left + tr.width > window.innerWidth - pad) {
            left = window.innerWidth - pad - tr.width;
          }
          let top;
          if (position() === "bottom") {
            top = wr.bottom + 6;
          } else {
            top = wr.top - tr.height - 6;
          }
          set(arrowLeft, wr.left + wr.width / 2 - left);
          set(pos, { top, left }, true);
          set(ready, true);
        });
      },
      delay()
    );
  }
  function hide() {
    clearTimeout(timeoutId);
    set(visible, false);
    set(ready, false);
  }
  var div = root$2();
  var node = child(div);
  snippet(node, () => $$props.children);
  var node_1 = sibling(node, 2);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$3();
      let classes;
      var text_1 = child(div_1);
      bind_this(div_1, ($$value) => set(tooltipEl, $$value), () => get(tooltipEl));
      template_effect(() => {
        classes = set_class(div_1, 1, `tooltip ${position() ?? ""}`, "svelte-kaiebb", classes, { ready: get(ready) });
        set_style(div_1, `left: ${get(pos).left ?? ""}px; top: ${get(pos).top ?? ""}px; --arrow-left: ${get(arrowLeft) ?? ""}px`);
        set_text(text_1, `${$$props.text ?? ""} `);
      });
      append($$anchor2, div_1);
    };
    if_block(node_1, ($$render) => {
      if (get(visible) && $$props.text) $$render(consequent);
    });
  }
  bind_this(div, ($$value) => set(wrapperEl, $$value), () => get(wrapperEl));
  event("mouseenter", div, show);
  event("mouseleave", div, hide);
  delegated("focusin", div, show);
  delegated("focusout", div, hide);
  append($$anchor, div);
}
delegate(["focusin", "focusout"]);
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
const DYNAMIC_PREFIXES = [
  "$guid",
  "$uuid",
  "$timestamp",
  "$isoTimestamp",
  "$randomInt",
  "$name",
  "$email",
  "$string",
  "$number",
  "$bool",
  "$enum",
  "$date",
  "$dateISO",
  "$response"
];
function isDynamic(name) {
  const trimmed = name.trim();
  return DYNAMIC_PREFIXES.some((p) => trimmed === p || trimmed.startsWith(p + ".") || trimmed.startsWith(p + ","));
}
function classifyVariables(text, activeVars) {
  if (!text) return [];
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  let match;
  const pattern = new RegExp(VARIABLE_PATTERN.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1].trim();
    if (seen.has(raw)) continue;
    seen.add(raw);
    if (isDynamic(raw)) {
      results.push({ name: raw, status: "dynamic" });
    } else if (/^\w+$/.test(raw) && activeVars.has(raw)) {
      results.push({ name: raw, status: "resolved" });
    } else if (/^\w+$/.test(raw)) {
      results.push({ name: raw, status: "unresolved" });
    } else {
      results.push({ name: raw, status: "dynamic" });
    }
  }
  return results;
}
function aggregateStatus(infos) {
  if (infos.length === 0) return null;
  if (infos.some((v) => v.status === "unresolved")) return "unresolved";
  if (infos.some((v) => v.status === "dynamic")) return "dynamic";
  return "resolved";
}
var root_1$2 = from_html(`<span class="variable-indicator svelte-4ch561"><i></i></span>`);
function VariableIndicator($$anchor, $$props) {
  push($$props, true);
  const $activeVariables = () => store_get(activeVariables, "$activeVariables", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  const vars = user_derived(() => classifyVariables($$props.text, $activeVariables()));
  const status = user_derived(() => aggregateStatus(get(vars)));
  const statusColors = {
    resolved: "#49cc90",
    // green
    unresolved: "#fca130",
    // orange
    dynamic: "#61affe"
    // blue
  };
  const statusIcons = {
    resolved: "codicon-pass-filled",
    unresolved: "codicon-warning",
    dynamic: "codicon-zap"
  };
  const tooltipText = user_derived(() => {
    if (!get(vars).length) return "";
    const grouped = { resolved: [], unresolved: [], dynamic: [] };
    for (const v of get(vars)) grouped[v.status].push(v.name);
    const parts = [];
    if (grouped.resolved.length) parts.push(`Resolved: ${grouped.resolved.join(", ")}`);
    if (grouped.unresolved.length) parts.push(`Unresolved: ${grouped.unresolved.join(", ")}`);
    if (grouped.dynamic.length) parts.push(`Dynamic: ${grouped.dynamic.join(", ")}`);
    return parts.join(" | ");
  });
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var span = root_1$2();
      var i = child(span);
      template_effect(() => {
        set_style(span, `color: ${statusColors[get(status)] ?? ""}`);
        set_attribute(span, "title", get(tooltipText));
        set_class(i, 1, `codicon ${statusIcons[get(status)] ?? ""}`, "svelte-4ch561");
      });
      append($$anchor2, span);
    };
    if_block(node, ($$render) => {
      if (get(status)) $$render(consequent);
    });
  }
  append($$anchor, fragment);
  pop();
  $$cleanup();
}
var root_3$1 = from_html(`<span class="info-icon codicon codicon-info svelte-1wsi4pi"></span>`);
var root_2$1 = from_html(`<div role="option" tabindex="-1"> <!></div>`);
var root_6 = from_html(`<button class="tooltip-link svelte-1wsi4pi"><span class="codicon codicon-link-external svelte-1wsi4pi"></span> View on MDN</button>`);
var root_5$1 = from_html(`<div class="suggestion-tooltip svelte-1wsi4pi" role="tooltip"><div class="tooltip-description svelte-1wsi4pi"> </div> <!></div>`);
var root_1$1 = from_html(`<div class="autocomplete-dropdown svelte-1wsi4pi" role="listbox"></div> <!>`, 1);
var root$1 = from_html(`<div class="autocomplete-wrapper svelte-1wsi4pi"><input type="text" class="key-input svelte-1wsi4pi"/> <!></div>`);
function AutocompleteInput($$anchor, $$props) {
  push($$props, true);
  let value = prop($$props, "value", 3, ""), placeholder = prop($$props, "placeholder", 3, ""), suggestions = prop($$props, "suggestions", 19, () => []);
  let inputElement = state(void 0);
  let showDropdown = state(false);
  let selectedIndex = state(-1);
  let hoveredSuggestion = state(null);
  let hideTooltipTimeout = null;
  let filteredSuggestions = user_derived(() => {
    if (!value() || !suggestions().length) return [];
    const lowerValue = value().toLowerCase();
    return suggestions().filter((s) => s.toLowerCase().includes(lowerValue)).slice(0, 50);
  });
  function handleInput(e) {
    var _a;
    const target = e.currentTarget;
    (_a = $$props.oninput) == null ? void 0 : _a.call($$props, target.value);
    set(showDropdown, get(filteredSuggestions).length > 0);
    set(selectedIndex, -1);
  }
  function handleKeyDown(e) {
    var _a, _b;
    if (!get(showDropdown) || get(filteredSuggestions).length === 0) {
      (_a = $$props.onkeydown) == null ? void 0 : _a.call($$props, e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      set(selectedIndex, Math.min(get(selectedIndex) + 1, get(filteredSuggestions).length - 1), true);
      scrollToSelected();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      set(selectedIndex, Math.max(get(selectedIndex) - 1, -1), true);
      scrollToSelected();
    } else if (e.key === "Enter" && get(selectedIndex) >= 0) {
      e.preventDefault();
      selectSuggestion(get(filteredSuggestions)[get(selectedIndex)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      set(showDropdown, false);
      set(selectedIndex, -1);
    } else {
      (_b = $$props.onkeydown) == null ? void 0 : _b.call($$props, e);
    }
  }
  function selectSuggestion(suggestion) {
    var _a, _b;
    (_a = $$props.oninput) == null ? void 0 : _a.call($$props, suggestion);
    set(showDropdown, false);
    set(selectedIndex, -1);
    (_b = get(inputElement)) == null ? void 0 : _b.focus();
  }
  function handleFocus() {
    if (get(filteredSuggestions).length > 0) {
      set(showDropdown, true);
    }
  }
  function handleBlur() {
    setTimeout(
      () => {
        set(showDropdown, false);
        set(selectedIndex, -1);
        set(hoveredSuggestion, null);
      },
      150
    );
  }
  function getDescription(suggestion) {
    if (!$$props.suggestionDescriptions) return void 0;
    if ($$props.suggestionDescriptions[suggestion]) {
      return $$props.suggestionDescriptions[suggestion];
    }
    const normalizedKey = Object.keys($$props.suggestionDescriptions).find((key) => key.toLowerCase() === suggestion.toLowerCase());
    return normalizedKey ? $$props.suggestionDescriptions[normalizedKey] : void 0;
  }
  function handleLinkClick(e, url) {
    e.preventDefault();
    e.stopPropagation();
    const vscode = window.vscode;
    if (vscode) {
      vscode.postMessage({ type: "openExternal", url });
    }
  }
  function scrollToSelected() {
    tick().then(() => {
      const dropdown = document.querySelector(".autocomplete-dropdown");
      const selected = dropdown == null ? void 0 : dropdown.querySelector(".suggestion-item.selected");
      if (selected && dropdown) {
        selected.scrollIntoView({ block: "nearest" });
      }
    });
  }
  var div = root$1();
  var input = child(div);
  bind_this(input, ($$value) => set(inputElement, $$value), () => get(inputElement));
  var node = sibling(input, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var fragment = root_1$1();
      var div_1 = first_child(fragment);
      each(div_1, 21, () => get(filteredSuggestions), index, ($$anchor3, suggestion, index2) => {
        const description = user_derived(() => getDescription(get(suggestion)));
        var div_2 = root_2$1();
        let classes;
        var text = child(div_2);
        var node_1 = sibling(text);
        {
          var consequent = ($$anchor4) => {
            var span = root_3$1();
            append($$anchor4, span);
          };
          if_block(node_1, ($$render) => {
            if (get(description)) $$render(consequent);
          });
        }
        template_effect(() => {
          classes = set_class(div_2, 1, "suggestion-item svelte-1wsi4pi", null, classes, {
            selected: index2 === get(selectedIndex),
            "has-description": !!get(description)
          });
          set_attribute(div_2, "aria-selected", index2 === get(selectedIndex));
          set_text(text, `${get(suggestion) ?? ""} `);
        });
        delegated("mousedown", div_2, (e) => {
          e.preventDefault();
          selectSuggestion(get(suggestion));
        });
        event("mouseenter", div_2, () => {
          if (hideTooltipTimeout) {
            clearTimeout(hideTooltipTimeout);
            hideTooltipTimeout = null;
          }
          set(hoveredSuggestion, get(suggestion), true);
        });
        event("mouseleave", div_2, () => {
          hideTooltipTimeout = window.setTimeout(
            () => {
              set(hoveredSuggestion, null);
            },
            200
          );
        });
        append($$anchor3, div_2);
      });
      var node_2 = sibling(div_1, 2);
      {
        var consequent_3 = ($$anchor3) => {
          const headerInfo = user_derived(() => getDescription(get(hoveredSuggestion)));
          var fragment_1 = comment();
          var node_3 = first_child(fragment_1);
          {
            var consequent_2 = ($$anchor4) => {
              var div_3 = root_5$1();
              var div_4 = child(div_3);
              var text_1 = child(div_4);
              var node_4 = sibling(div_4, 2);
              {
                var consequent_1 = ($$anchor5) => {
                  var button = root_6();
                  delegated("click", button, (e) => handleLinkClick(e, get(headerInfo).mdnUrl));
                  append($$anchor5, button);
                };
                if_block(node_4, ($$render) => {
                  if (get(headerInfo).mdnUrl) $$render(consequent_1);
                });
              }
              template_effect(() => set_text(text_1, get(headerInfo).description));
              event("mouseenter", div_3, () => {
                if (hideTooltipTimeout) {
                  clearTimeout(hideTooltipTimeout);
                  hideTooltipTimeout = null;
                }
              });
              event("mouseleave", div_3, () => {
                set(hoveredSuggestion, null);
              });
              append($$anchor4, div_3);
            };
            if_block(node_3, ($$render) => {
              if (get(headerInfo)) $$render(consequent_2);
            });
          }
          append($$anchor3, fragment_1);
        };
        var d = user_derived(() => get(hoveredSuggestion) && getDescription(get(hoveredSuggestion)));
        if_block(node_2, ($$render) => {
          if (get(d)) $$render(consequent_3);
        });
      }
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(showDropdown) && get(filteredSuggestions).length > 0) $$render(consequent_4);
    });
  }
  template_effect(() => {
    set_attribute(input, "placeholder", placeholder());
    set_value(input, value());
  });
  delegated("input", input, handleInput);
  delegated("keydown", input, handleKeyDown);
  event("focus", input, handleFocus);
  event("blur", input, handleBlur);
  append($$anchor, div);
  pop();
}
delegate(["input", "keydown", "mousedown", "click"]);
var root_1 = from_html(`<div class="empty-state svelte-112dt7r"><p class="svelte-112dt7r">No items added yet</p> <button class="add-btn svelte-112dt7r"><span class="icon codicon codicon-add svelte-112dt7r"></span> Add Item</button></div>`);
var root_5 = from_html(`<input type="text" class="key-input svelte-112dt7r"/>`);
var root_7 = from_html(`<input type="text" class="value-input svelte-112dt7r"/>`);
var root_3 = from_html(`<div><div class="col-check svelte-112dt7r"><input type="checkbox" class="svelte-112dt7r"/></div> <div class="col-key svelte-112dt7r"><!></div> <div class="col-value svelte-112dt7r"><!></div> <div class="col-indicator svelte-112dt7r"><!></div> <div class="col-actions svelte-112dt7r"><button class="remove-btn svelte-112dt7r" title="Remove"><span class="icon codicon codicon-close svelte-112dt7r"></span></button></div></div>`);
var root_2 = from_html(`<div class="kv-header svelte-112dt7r"><div class="col-check svelte-112dt7r"></div> <div class="col-key svelte-112dt7r"> </div> <div class="col-value svelte-112dt7r"> </div> <div class="col-actions svelte-112dt7r"></div></div> <!> <button class="add-row-btn svelte-112dt7r"><span class="icon codicon codicon-add svelte-112dt7r"></span> Add</button>`, 1);
var root = from_html(`<div class="kv-editor svelte-112dt7r"><!></div>`);
function KeyValueEditor($$anchor, $$props) {
  push($$props, true);
  let items = prop($$props, "items", 23, () => []), keyPlaceholder = prop($$props, "keyPlaceholder", 3, "Key"), valuePlaceholder = prop($$props, "valuePlaceholder", 3, "Value");
  function getValueSuggestionsForRow(key) {
    if (!$$props.valueSuggestions || !key) return void 0;
    if ($$props.valueSuggestions[key]) {
      return $$props.valueSuggestions[key];
    }
    const normalizedKey = Object.keys($$props.valueSuggestions).find((k) => k.toLowerCase() === key.toLowerCase());
    return normalizedKey ? $$props.valueSuggestions[normalizedKey] : void 0;
  }
  function updateItems(newItems) {
    var _a;
    items(newItems);
    (_a = $$props.onchange) == null ? void 0 : _a.call($$props, items());
  }
  function toggleEnabled(index2) {
    const newItems = [...items()];
    newItems[index2] = { ...newItems[index2], enabled: !newItems[index2].enabled };
    updateItems(newItems);
  }
  function updateKey(index2, key) {
    const newItems = [...items()];
    newItems[index2] = { ...newItems[index2], key };
    updateItems(newItems);
  }
  function updateValue(index2, value) {
    const newItems = [...items()];
    newItems[index2] = { ...newItems[index2], value };
    updateItems(newItems);
  }
  function addRow() {
    updateItems([
      ...items(),
      { id: generateId$1(), key: "", value: "", enabled: true }
    ]);
  }
  function removeRow(index2) {
    const newItems = items().filter((_, i) => i !== index2);
    updateItems(newItems);
  }
  function handleKeyDown(event2, index2) {
    if (event2.key === "Enter" && !event2.ctrlKey && !event2.metaKey) {
      event2.preventDefault();
      if (index2 === items().length - 1) {
        addRow();
        tick().then(() => {
          const inputs = document.querySelectorAll(".kv-row .key-input");
          const lastInput = inputs[inputs.length - 1];
          lastInput == null ? void 0 : lastInput.focus();
        });
      }
    }
  }
  var div = root();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1();
      var button = sibling(child(div_1), 2);
      delegated("click", button, addRow);
      append($$anchor2, div_1);
    };
    var alternate_2 = ($$anchor2) => {
      var fragment = root_2();
      var div_2 = first_child(fragment);
      var div_3 = sibling(child(div_2), 2);
      var text = child(div_3);
      var div_4 = sibling(div_3, 2);
      var text_1 = child(div_4);
      var node_1 = sibling(div_2, 2);
      each(node_1, 19, items, (item) => item.id, ($$anchor3, item, index2) => {
        var div_5 = root_3();
        let classes;
        var div_6 = child(div_5);
        var input = child(div_6);
        var div_7 = sibling(div_6, 2);
        var node_2 = child(div_7);
        {
          var consequent_1 = ($$anchor4) => {
            AutocompleteInput($$anchor4, {
              get value() {
                return get(item).key;
              },
              get placeholder() {
                return keyPlaceholder();
              },
              get suggestions() {
                return $$props.keySuggestions;
              },
              get suggestionDescriptions() {
                return $$props.keyDescriptions;
              },
              oninput: (value) => updateKey(get(index2), value),
              onkeydown: (e) => handleKeyDown(e, get(index2))
            });
          };
          var alternate = ($$anchor4) => {
            var input_1 = root_5();
            template_effect(() => {
              set_attribute(input_1, "placeholder", keyPlaceholder());
              set_value(input_1, get(item).key);
            });
            delegated("input", input_1, (e) => updateKey(get(index2), e.currentTarget.value));
            delegated("keydown", input_1, (e) => handleKeyDown(e, get(index2)));
            append($$anchor4, input_1);
          };
          if_block(node_2, ($$render) => {
            if ($$props.keySuggestions && $$props.keySuggestions.length > 0) $$render(consequent_1);
            else $$render(alternate, false);
          });
        }
        var div_8 = sibling(div_7, 2);
        var node_3 = child(div_8);
        {
          var consequent_2 = ($$anchor4) => {
            {
              let $0 = user_derived(() => getValueSuggestionsForRow(get(item).key) ?? []);
              AutocompleteInput($$anchor4, {
                get value() {
                  return get(item).value;
                },
                get placeholder() {
                  return valuePlaceholder();
                },
                get suggestions() {
                  return get($0);
                },
                oninput: (value) => updateValue(get(index2), value),
                onkeydown: (e) => handleKeyDown(e, get(index2))
              });
            }
          };
          var d = user_derived(() => {
            var _a;
            return $$props.valueSuggestions && ((_a = getValueSuggestionsForRow(get(item).key)) == null ? void 0 : _a.length);
          });
          var alternate_1 = ($$anchor4) => {
            var input_2 = root_7();
            template_effect(() => {
              set_attribute(input_2, "placeholder", valuePlaceholder());
              set_value(input_2, get(item).value);
            });
            delegated("input", input_2, (e) => updateValue(get(index2), e.currentTarget.value));
            delegated("keydown", input_2, (e) => handleKeyDown(e, get(index2)));
            append($$anchor4, input_2);
          };
          if_block(node_3, ($$render) => {
            if (get(d)) $$render(consequent_2);
            else $$render(alternate_1, false);
          });
        }
        var div_9 = sibling(div_8, 2);
        var node_4 = child(div_9);
        {
          let $0 = user_derived(() => `${get(item).key} ${get(item).value}`);
          VariableIndicator(node_4, {
            get text() {
              return get($0);
            }
          });
        }
        var div_10 = sibling(div_9, 2);
        var button_1 = child(div_10);
        template_effect(() => {
          classes = set_class(div_5, 1, "kv-row svelte-112dt7r", null, classes, { disabled: !get(item).enabled });
          set_checked(input, get(item).enabled);
          set_attribute(input, "title", get(item).enabled ? "Disable" : "Enable");
        });
        delegated("change", input, () => toggleEnabled(get(index2)));
        delegated("click", button_1, () => removeRow(get(index2)));
        append($$anchor3, div_5);
      });
      var button_2 = sibling(node_1, 2);
      template_effect(() => {
        set_text(text, keyPlaceholder());
        set_text(text_1, valuePlaceholder());
      });
      delegated("click", button_2, addRow);
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (items().length === 0) $$render(consequent);
      else $$render(alternate_2, false);
    });
  }
  append($$anchor, div);
  pop();
}
delegate(["click", "change", "input", "keydown"]);
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function getDisplayUrl(url) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "") || "No URL";
}
function getNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    return path === "/" ? urlObj.hostname : path.split("/").filter(Boolean).pop() || "New Request";
  } catch {
    return "New Request";
  }
}
export {
  addFolder as $,
  bind_checked as A,
  setDescription as B,
  formatSize as C,
  setParams as D,
  getState as E,
  setState as F,
  setAuthInheritance as G,
  setScripts as H,
  globalVariables as I,
  updateGlobalVariables as J,
  KeyValueEditor as K,
  loadEnvFileVariables as L,
  storeResponse as M,
  loadEnvironments as N,
  selectRequest as O,
  getDisplayUrl as P,
  selectedRequestId as Q,
  duplicateRequest as R,
  deleteRequest as S,
  Tooltip as T,
  toggleFolderExpanded as U,
  VariableIndicator as V,
  moveItem as W,
  selectedFolderId as X,
  renameFolder as Y,
  updateRequest as Z,
  addRequestToCollection as _,
  setUrl as a,
  findItemRecursive as a0,
  isRecentCollection as a1,
  toggleCollectionExpanded as a2,
  selectedCollectionId as a3,
  renameCollection as a4,
  getNameFromUrl as a5,
  collections as a6,
  addCollection as a7,
  envFilePath as a8,
  envFileVariables as a9,
  initCollections as aa,
  bind_this as b,
  setUrlAndParams as c,
  setMethod as d,
  setHeaders as e,
  setAuth as f,
  getUnresolvedVariables as g,
  setBody as h,
  activeVariables as i,
  bind_value as j,
  activeEnvironment as k,
  setActiveEnvironment as l,
  deleteEnvironment as m,
  addEnvironment as n,
  renameEnvironment as o,
  postMessage as p,
  activeEnvironmentId as q,
  request as r,
  substituteVariables as s,
  environments as t,
  updateEnvironmentVariables as u,
  prop as v,
  onMessage as w,
  onMount as x,
  onDestroy as y,
  setAssertions as z
};
//# sourceMappingURL=formatters-wLe3gDWq.js.map
