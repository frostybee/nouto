import { d as derived, w as writable, a as delegate, p as push, v as sibling, A as each, D as index, t as template_effect, C as set_text, k as get, h as append, i as if_block, x as set_class, I as set_checked, z as set_value, c as delegated, l as set, j as pop, o as state, r as child, y as set_attribute, m as from_html, n as user_derived, F as proxy, u as user_effect, q as store_get, s as setup_stores, f as first_child, N as mount } from "./theme-U7NfCYzD.js";
import { i as init_select, s as select_option } from "./select-DSDGlR6s.js";
import { g as generateId } from "./index-browser-esm-DdBOuD5K.js";
const initialState = {
  status: "stopped",
  config: {
    port: 3e3,
    routes: []
  },
  logs: []
};
const mockServerState = writable({ ...initialState });
derived(mockServerState, ($s) => $s.status);
derived(mockServerState, ($s) => $s.config);
derived(mockServerState, ($s) => $s.config.routes);
derived(mockServerState, ($s) => $s.logs);
function initMockServer(data) {
  mockServerState.update((s) => ({
    ...s,
    status: data.status,
    config: data.config,
    logs: []
  }));
}
function setMockStatus(status) {
  mockServerState.update((s) => ({ ...s, status }));
}
function setPort(port) {
  mockServerState.update((s) => ({
    ...s,
    config: { ...s.config, port }
  }));
}
function addRoute(route) {
  mockServerState.update((s) => ({
    ...s,
    config: { ...s.config, routes: [...s.config.routes, route] }
  }));
}
function removeRoute(routeId) {
  mockServerState.update((s) => ({
    ...s,
    config: { ...s.config, routes: s.config.routes.filter((r) => r.id !== routeId) }
  }));
}
function updateRoute(routeId, updates) {
  mockServerState.update((s) => ({
    ...s,
    config: {
      ...s.config,
      routes: s.config.routes.map((r) => r.id === routeId ? { ...r, ...updates } : r)
    }
  }));
}
function addLog(log) {
  mockServerState.update((s) => ({
    ...s,
    logs: [...s.logs, log].slice(-100)
  }));
}
function clearLogs() {
  mockServerState.update((s) => ({ ...s, logs: [] }));
}
var root_1$2 = from_html(`<option> </option>`);
var root_2$2 = from_html(`<div class="route-details svelte-raono2"><div class="detail-row svelte-raono2"><label class="svelte-raono2">Description</label> <input type="text" placeholder="Optional description" class="svelte-raono2"/></div> <div class="detail-row svelte-raono2"><label class="svelte-raono2">Response Body</label> <textarea rows="5" class="svelte-raono2"></textarea></div> <div class="detail-row latency svelte-raono2"><label class="svelte-raono2">Latency (ms)</label> <div class="latency-inputs svelte-raono2"><input type="number" min="0" placeholder="Min" class="svelte-raono2"/> <span class="svelte-raono2">to</span> <input type="number" min="0" placeholder="Max" class="svelte-raono2"/></div></div></div>`);
var root$2 = from_html(`<div><div class="route-summary svelte-raono2"><input type="checkbox" title="Enable/disable route"/> <select></select> <input class="path-input svelte-raono2" type="text" placeholder="/api/endpoint/:id"/> <input class="status-input svelte-raono2" type="number" min="100" max="599"/> <button class="expand-btn svelte-raono2"> </button> <button class="remove-btn svelte-raono2" title="Remove route">\\u00D7</button></div> <!></div>`);
function MockRouteRow($$anchor, $$props) {
  push($$props, true);
  let expanded = state(false);
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  var div = root$2();
  let classes;
  var div_1 = child(div);
  var input = child(div_1);
  var select = sibling(input, 2);
  each(select, 21, () => methods, index, ($$anchor2, m) => {
    var option = root_1$2();
    var text = child(option);
    var option_value = {};
    template_effect(() => {
      set_text(text, get(m));
      if (option_value !== (option_value = get(m))) {
        option.value = (option.__value = get(m)) ?? "";
      }
    });
    append($$anchor2, option);
  });
  var select_value;
  init_select(select);
  var input_1 = sibling(select, 2);
  var input_2 = sibling(input_1, 2);
  var button = sibling(input_2, 2);
  var text_1 = child(button);
  var button_1 = sibling(button, 2);
  var node = sibling(div_1, 2);
  {
    var consequent = ($$anchor2) => {
      var div_2 = root_2$2();
      var div_3 = child(div_2);
      var label = child(div_3);
      var input_3 = sibling(label, 2);
      var div_4 = sibling(div_3, 2);
      var label_1 = child(div_4);
      var textarea = sibling(label_1, 2);
      set_attribute(textarea, "placeholder", '{"key": "value"}');
      var div_5 = sibling(div_4, 2);
      var label_2 = child(div_5);
      var div_6 = sibling(label_2, 2);
      var input_4 = child(div_6);
      var input_5 = sibling(input_4, 4);
      template_effect(() => {
        set_attribute(label, "for", `desc-${$$props.route.id ?? ""}`);
        set_attribute(input_3, "id", `desc-${$$props.route.id ?? ""}`);
        set_value(input_3, $$props.route.description || "");
        set_attribute(label_1, "for", `body-${$$props.route.id ?? ""}`);
        set_attribute(textarea, "id", `body-${$$props.route.id ?? ""}`);
        set_value(textarea, $$props.route.responseBody);
        set_attribute(label_2, "for", `latency-min-${$$props.route.id ?? ""}`);
        set_attribute(input_4, "id", `latency-min-${$$props.route.id ?? ""}`);
        set_value(input_4, $$props.route.latencyMin);
        set_value(input_5, $$props.route.latencyMax);
      });
      delegated("change", input_3, (e) => $$props.onUpdate({ description: e.target.value }));
      delegated("change", textarea, (e) => $$props.onUpdate({ responseBody: e.target.value }));
      delegated("change", input_4, (e) => $$props.onUpdate({ latencyMin: parseInt(e.target.value) || 0 }));
      delegated("change", input_5, (e) => $$props.onUpdate({ latencyMax: parseInt(e.target.value) || 0 }));
      append($$anchor2, div_2);
    };
    if_block(node, ($$render) => {
      if (get(expanded)) $$render(consequent);
    });
  }
  template_effect(
    ($0) => {
      classes = set_class(div, 1, "route-row svelte-raono2", null, classes, { disabled: !$$props.route.enabled });
      set_checked(input, $$props.route.enabled);
      set_class(select, 1, `method-select method-${$0 ?? ""}`, "svelte-raono2");
      if (select_value !== (select_value = $$props.route.method)) {
        select.value = (select.__value = $$props.route.method) ?? "", select_option(select, $$props.route.method);
      }
      set_value(input_1, $$props.route.path);
      set_value(input_2, $$props.route.statusCode);
      set_text(text_1, get(expanded) ? "▲" : "▼");
    },
    [() => $$props.route.method.toLowerCase()]
  );
  delegated("change", input, () => $$props.onUpdate({ enabled: !$$props.route.enabled }));
  delegated("change", select, (e) => $$props.onUpdate({ method: e.target.value }));
  delegated("change", input_1, (e) => $$props.onUpdate({ path: e.target.value }));
  delegated("change", input_2, (e) => $$props.onUpdate({ statusCode: parseInt(e.target.value) || 200 }));
  delegated("click", button, () => set(expanded, !get(expanded)));
  delegated("click", button_1, function(...$$args) {
    var _a;
    (_a = $$props.onRemove) == null ? void 0 : _a.apply(this, $$args);
  });
  append($$anchor, div);
  pop();
}
delegate(["change", "click"]);
var root_1$1 = from_html(`<div class="empty svelte-yfdcp4">No requests logged yet. Start the server and send requests to see them here.</div>`);
var root_3$1 = from_html(`<tr><td class="time svelte-yfdcp4"> </td><td> </td><td class="path svelte-yfdcp4"> </td><td class="route svelte-yfdcp4"> </td><td> </td><td class="duration svelte-yfdcp4"> </td></tr>`);
var root_2$1 = from_html(`<table class="svelte-yfdcp4"><thead><tr><th class="svelte-yfdcp4">Time</th><th class="svelte-yfdcp4">Method</th><th class="svelte-yfdcp4">Path</th><th class="svelte-yfdcp4">Matched Route</th><th class="svelte-yfdcp4">Status</th><th class="svelte-yfdcp4">Duration</th></tr></thead><tbody></tbody></table>`);
var root$1 = from_html(`<div class="log-table-container svelte-yfdcp4"><!></div>`);
function MockRequestLogTable($$anchor, $$props) {
  push($$props, true);
  function getRouteName(routeId) {
    if (!routeId) return "-";
    const route = $$props.routes.find((r) => r.id === routeId);
    return route ? `${route.method} ${route.path}` : routeId;
  }
  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
  }
  const reversedLogs = user_derived(() => [...$$props.logs].reverse());
  var div = root$1();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$1();
      append($$anchor2, div_1);
    };
    var alternate = ($$anchor2) => {
      var table = root_2$1();
      var tbody = sibling(child(table));
      each(tbody, 21, () => get(reversedLogs), (log) => log.id, ($$anchor3, log) => {
        var tr = root_3$1();
        let classes;
        var td = child(tr);
        var text = child(td);
        var td_1 = sibling(td);
        var text_1 = child(td_1);
        var td_2 = sibling(td_1);
        var text_2 = child(td_2);
        var td_3 = sibling(td_2);
        var text_3 = child(td_3);
        var td_4 = sibling(td_3);
        let classes_1;
        var text_4 = child(td_4);
        var td_5 = sibling(td_4);
        var text_5 = child(td_5);
        template_effect(
          ($0, $1, $2) => {
            classes = set_class(tr, 1, "svelte-yfdcp4", null, classes, { unmatched: !get(log).matchedRouteId });
            set_text(text, $0);
            set_class(td_1, 1, `method method-${$1 ?? ""}`, "svelte-yfdcp4");
            set_text(text_1, get(log).method);
            set_text(text_2, get(log).path);
            set_text(text_3, $2);
            classes_1 = set_class(td_4, 1, "status svelte-yfdcp4", null, classes_1, {
              ok: get(log).statusCode < 400,
              error: get(log).statusCode >= 400
            });
            set_text(text_4, get(log).statusCode);
            set_text(text_5, `${get(log).duration ?? ""}ms`);
          },
          [
            () => formatTime(get(log).timestamp),
            () => get(log).method.toLowerCase(),
            () => getRouteName(get(log).matchedRouteId)
          ]
        );
        append($$anchor3, tr);
      });
      append($$anchor2, table);
    };
    if_block(node, ($$render) => {
      if ($$props.logs.length === 0) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  append($$anchor, div);
  pop();
}
var root_1 = from_html(`<button class="stop-btn svelte-dhkdr8">Stop Server</button> <span class="status-badge running svelte-dhkdr8"> </span>`, 1);
var root_2 = from_html(`<button class="start-btn svelte-dhkdr8">Start Server</button> <span class="status-badge stopped svelte-dhkdr8"> </span>`, 1);
var root_5 = from_html(`<div class="empty svelte-dhkdr8">No routes defined. Add a route or import from a collection.</div>`);
var root_3 = from_html(`<div class="routes-toolbar svelte-dhkdr8"><button class="tool-btn svelte-dhkdr8">+ Add Route</button> <button class="tool-btn svelte-dhkdr8">Import from Collection</button></div> <div class="routes-list svelte-dhkdr8"><!> <!></div>`, 1);
var root_6 = from_html(`<div class="log-toolbar svelte-dhkdr8"><button class="tool-btn svelte-dhkdr8">Clear Logs</button></div> <!>`, 1);
var root = from_html(`<div class="mock-panel svelte-dhkdr8"><div class="header svelte-dhkdr8"><h2 class="svelte-dhkdr8">Mock Server</h2> <div class="controls svelte-dhkdr8"><div class="port-input svelte-dhkdr8"><label for="port">Port:</label> <input id="port" type="number" min="1024" max="65535" class="svelte-dhkdr8"/></div> <!></div></div> <div class="tabs svelte-dhkdr8"><button> </button> <button> </button></div> <!></div>`);
function MockServerPanel($$anchor, $$props) {
  push($$props, true);
  const $mockServerState = () => store_get(mockServerState, "$mockServerState", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let state$1 = state(proxy($mockServerState()));
  user_effect(() => {
    set(state$1, $mockServerState(), true);
  });
  let activeTab = state("routes");
  function handleStart() {
    vscode.postMessage({
      type: "startMockServer",
      data: { config: get(state$1).config }
    });
  }
  function handleStop() {
    vscode.postMessage({ type: "stopMockServer" });
  }
  function handleAddRoute() {
    const route = {
      id: generateId(),
      enabled: true,
      method: "GET",
      path: "/new-route",
      statusCode: 200,
      responseBody: "{}",
      responseHeaders: [],
      latencyMin: 0,
      latencyMax: 0
    };
    addRoute(route);
    sendRouteUpdate();
  }
  function handleRemoveRoute(routeId) {
    removeRoute(routeId);
    sendRouteUpdate();
  }
  function handleUpdateRoute(routeId, updates) {
    updateRoute(routeId, updates);
    sendRouteUpdate();
  }
  function handleClearLogs() {
    clearLogs();
    vscode.postMessage({ type: "clearMockLogs" });
  }
  function handleImportCollection() {
    vscode.postMessage({ type: "importCollectionAsMocks" });
  }
  function sendRouteUpdate() {
    vscode.postMessage({
      type: "updateMockRoutes",
      data: { config: get(state$1).config }
    });
  }
  const isRunning = user_derived(() => get(state$1).status === "running");
  const isBusy = user_derived(() => get(state$1).status === "starting" || get(state$1).status === "stopping");
  var div = root();
  var div_1 = child(div);
  var div_2 = sibling(child(div_1), 2);
  var div_3 = child(div_2);
  var input = sibling(child(div_3), 2);
  var node = sibling(div_3, 2);
  {
    var consequent = ($$anchor2) => {
      var fragment = root_1();
      var button = first_child(fragment);
      var span = sibling(button, 2);
      var text = child(span);
      template_effect(() => {
        button.disabled = get(isBusy);
        set_text(text, `Running on :${get(state$1).config.port ?? ""}`);
      });
      delegated("click", button, handleStop);
      append($$anchor2, fragment);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_2();
      var button_1 = first_child(fragment_1);
      var span_1 = sibling(button_1, 2);
      var text_1 = child(span_1);
      template_effect(() => {
        button_1.disabled = get(isBusy) || get(state$1).config.routes.length === 0;
        set_text(text_1, get(state$1).status === "error" ? "Error" : "Stopped");
      });
      delegated("click", button_1, handleStart);
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (get(isRunning)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var div_4 = sibling(div_1, 2);
  var button_2 = child(div_4);
  let classes;
  var text_2 = child(button_2);
  var button_3 = sibling(button_2, 2);
  let classes_1;
  var text_3 = child(button_3);
  var node_1 = sibling(div_4, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var fragment_2 = root_3();
      var div_5 = first_child(fragment_2);
      var button_4 = child(div_5);
      var button_5 = sibling(button_4, 2);
      var div_6 = sibling(div_5, 2);
      var node_2 = child(div_6);
      each(node_2, 17, () => get(state$1).config.routes, (route) => route.id, ($$anchor3, route) => {
        MockRouteRow($$anchor3, {
          get route() {
            return get(route);
          },
          onUpdate: (updates) => handleUpdateRoute(get(route).id, updates),
          onRemove: () => handleRemoveRoute(get(route).id)
        });
      });
      var node_3 = sibling(node_2, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_7 = root_5();
          append($$anchor3, div_7);
        };
        if_block(node_3, ($$render) => {
          if (get(state$1).config.routes.length === 0) $$render(consequent_1);
        });
      }
      delegated("click", button_4, handleAddRoute);
      delegated("click", button_5, handleImportCollection);
      append($$anchor2, fragment_2);
    };
    var alternate_1 = ($$anchor2) => {
      var fragment_4 = root_6();
      var div_8 = first_child(fragment_4);
      var button_6 = child(div_8);
      var node_4 = sibling(div_8, 2);
      MockRequestLogTable(node_4, {
        get logs() {
          return get(state$1).logs;
        },
        get routes() {
          return get(state$1).config.routes;
        }
      });
      template_effect(() => button_6.disabled = get(state$1).logs.length === 0);
      delegated("click", button_6, handleClearLogs);
      append($$anchor2, fragment_4);
    };
    if_block(node_1, ($$render) => {
      if (get(activeTab) === "routes") $$render(consequent_2);
      else $$render(alternate_1, false);
    });
  }
  template_effect(() => {
    set_value(input, get(state$1).config.port);
    input.disabled = get(isRunning) || get(isBusy);
    classes = set_class(button_2, 1, "tab svelte-dhkdr8", null, classes, { active: get(activeTab) === "routes" });
    set_text(text_2, `Routes (${get(state$1).config.routes.length ?? ""})`);
    classes_1 = set_class(button_3, 1, "tab svelte-dhkdr8", null, classes_1, { active: get(activeTab) === "logs" });
    set_text(text_3, `Request Log (${get(state$1).logs.length ?? ""})`);
  });
  delegated("change", input, (e) => {
    setPort(parseInt(e.target.value) || 3e3);
    sendRouteUpdate();
  });
  delegated("click", button_2, () => set(activeTab, "routes"));
  delegated("click", button_3, () => set(activeTab, "logs"));
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["change", "click"]);
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "initMockServer":
      initMockServer(message.data);
      break;
    case "mockStatusChanged":
      setMockStatus(message.data.status);
      break;
    case "mockLogAdded":
      addLog(message.data);
      break;
  }
});
mount(MockServerPanel, { target: document.body });
vscode.postMessage({ type: "ready" });
//# sourceMappingURL=mock.js.map
