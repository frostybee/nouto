import { d as derived, w as writable, g as get, a as delegate, p as push, f as first_child, v as sibling, i as if_block, k as get$1, t as template_effect, x as set_class, C as set_text, y as set_attribute, c as delegated, h as append, j as pop, n as user_derived, r as child, m as from_html, A as each, D as index, s as setup_stores, q as store_get, I as set_checked, e as event, o as state, l as set, $ as $window, z as set_value, N as mount } from "./theme-U7NfCYzD.js";
import { s as set_style } from "./style-BHbAZ2u6.js";
const defaultConfig = {
  collectionId: "",
  stopOnFailure: false,
  delayMs: 0
};
const initialState = {
  status: "idle",
  collectionId: "",
  collectionName: "",
  requests: [],
  config: { ...defaultConfig },
  progress: { current: 0, total: 0, requestName: "" },
  results: [],
  summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
  resultFilter: "all",
  expandedResultId: null
};
const runnerState = writable({ ...initialState });
derived(runnerState, ($s) => $s.status);
derived(runnerState, ($s) => $s.progress);
derived(runnerState, ($s) => $s.results);
derived(runnerState, ($s) => $s.summary);
const filteredResults = derived(runnerState, ($s) => {
  if ($s.resultFilter === "all") return $s.results;
  if ($s.resultFilter === "passed") return $s.results.filter((r) => r.passed);
  return $s.results.filter((r) => !r.passed);
});
function initRunner(data) {
  runnerState.update((s) => ({
    ...s,
    status: "idle",
    collectionId: data.collectionId,
    collectionName: data.collectionName,
    folderId: data.folderId,
    requests: data.requests.map((r) => ({ ...r, enabled: true })),
    config: { ...defaultConfig, collectionId: data.collectionId, folderId: data.folderId },
    results: [],
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: "all",
    expandedResultId: null
  }));
}
function setRunning() {
  runnerState.update((s) => ({
    ...s,
    status: "running",
    results: [],
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: "all",
    expandedResultId: null
  }));
}
function updateProgress(progress) {
  runnerState.update((s) => ({ ...s, progress }));
}
function addResult(result) {
  runnerState.update((s) => {
    const results = [...s.results, result];
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const enabledCount = s.requests.filter((r) => r.enabled).length;
    const skipped = Math.max(0, enabledCount - results.length);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    return {
      ...s,
      results,
      summary: { passed, failed, skipped, totalDuration }
    };
  });
}
function setCompleted(result) {
  runnerState.update((s) => ({
    ...s,
    status: "completed",
    summary: {
      passed: result.passedRequests,
      failed: result.failedRequests,
      skipped: result.skippedRequests,
      totalDuration: result.totalDuration
    }
  }));
}
function setCancelled() {
  runnerState.update((s) => ({
    ...s,
    status: "cancelled"
  }));
}
function updateConfig(updates) {
  runnerState.update((s) => ({
    ...s,
    config: { ...s.config, ...updates }
  }));
}
function resetRunner() {
  runnerState.update((s) => ({
    ...s,
    status: "idle",
    results: [],
    progress: { current: 0, total: 0, requestName: "" },
    summary: { passed: 0, failed: 0, skipped: 0, totalDuration: 0 },
    resultFilter: "all",
    expandedResultId: null
  }));
}
function toggleRequestEnabled(requestId) {
  runnerState.update((s) => ({
    ...s,
    requests: s.requests.map((r) => r.id === requestId ? { ...r, enabled: !r.enabled } : r)
  }));
}
function toggleAllRequests(enabled) {
  runnerState.update((s) => ({
    ...s,
    requests: s.requests.map((r) => ({ ...r, enabled }))
  }));
}
function reorderRequest(fromIdx, toIdx) {
  runnerState.update((s) => {
    const requests = [...s.requests];
    const [moved] = requests.splice(fromIdx, 1);
    requests.splice(toIdx, 0, moved);
    return { ...s, requests };
  });
}
function setResultFilter(filter) {
  runnerState.update((s) => ({ ...s, resultFilter: filter }));
}
function setExpandedResult(id) {
  runnerState.update((s) => ({
    ...s,
    expandedResultId: s.expandedResultId === id ? null : id
  }));
}
function getEnabledRequestIds() {
  return get(runnerState).requests.filter((r) => r.enabled).map((r) => r.id);
}
var root_1$2 = from_html(`<span> </span>`);
var root_2$1 = from_html(`<span class="status-error svelte-x6iln8">Error</span>`);
var root_3$1 = from_html(`<span class="assertion-count svelte-x6iln8"> </span>`);
var root_4$1 = from_html(`<tr class="error-row svelte-x6iln8"><td class="svelte-x6iln8"></td><td colspan="5" class="error-detail svelte-x6iln8"> </td></tr>`);
var root_6$1 = from_html(`<div class="detail-section svelte-x6iln8"><span class="detail-label svelte-x6iln8">URL:</span> <code class="detail-url svelte-x6iln8"> </code></div>`);
var root_9 = from_html(`<span class="test-error svelte-x6iln8"> </span>`);
var root_8 = from_html(`<div><span> </span> <span> </span> <!></div>`);
var root_7$1 = from_html(`<div class="detail-section svelte-x6iln8"><span class="detail-label svelte-x6iln8">Script Tests:</span> <div class="script-tests svelte-x6iln8"></div></div>`);
var root_11 = from_html(`<div><span class="log-level svelte-x6iln8"> </span> <span> </span></div>`);
var root_10 = from_html(`<div class="detail-section svelte-x6iln8"><span class="detail-label svelte-x6iln8">Script Logs:</span> <div class="script-logs svelte-x6iln8"></div></div>`);
var root_14 = from_html(`<span class="assertion-actual svelte-x6iln8"> </span>`);
var root_13 = from_html(`<div><span> </span> <span class="assertion-msg svelte-x6iln8"> </span> <!></div>`);
var root_12 = from_html(`<div class="detail-section svelte-x6iln8"><span class="detail-label svelte-x6iln8">Assertions:</span> <div class="assertion-details svelte-x6iln8"></div></div>`);
var root_15 = from_html(`<div class="detail-section svelte-x6iln8"><span class="detail-label svelte-x6iln8">Response Body:</span> <pre class="body-preview svelte-x6iln8"> </pre></div>`);
var root_5 = from_html(`<tr class="detail-row svelte-x6iln8"><td class="svelte-x6iln8"></td><td colspan="5" class="svelte-x6iln8"><div class="detail-content svelte-x6iln8"><!> <!> <!> <!> <!></div></td></tr>`);
var root$2 = from_html(`<tr><td class="col-index svelte-x6iln8"> </td><td class="col-name svelte-x6iln8"> </td><td class="col-method svelte-x6iln8"><span class="method-badge svelte-x6iln8"> </span></td><td class="col-status svelte-x6iln8"><!></td><td class="col-duration svelte-x6iln8"> </td><td class="col-result svelte-x6iln8"><span> </span> <!></td></tr> <!> <!>`, 1);
function RunnerResultRow($$anchor, $$props) {
  push($$props, true);
  const statusClass = user_derived(() => $$props.result.passed ? "pass" : "fail");
  const methodColor = user_derived(() => getMethodColor($$props.result.method));
  const hasAssertions = user_derived(() => $$props.result.assertionResults && $$props.result.assertionResults.length > 0);
  const assertionPassed = user_derived(() => {
    var _a;
    return ((_a = $$props.result.assertionResults) == null ? void 0 : _a.filter((r) => r.passed).length) ?? 0;
  });
  const assertionTotal = user_derived(() => {
    var _a;
    return ((_a = $$props.result.assertionResults) == null ? void 0 : _a.length) ?? 0;
  });
  const hasScriptTests = user_derived(() => $$props.result.scriptTestResults && $$props.result.scriptTestResults.length > 0);
  const hasScriptLogs = user_derived(() => $$props.result.scriptLogs && $$props.result.scriptLogs.length > 0);
  const isExpanded = user_derived(() => $$props.expandedId === $$props.result.requestId);
  const isExpandable = user_derived(() => get$1(hasAssertions) || get$1(hasScriptTests) || get$1(hasScriptLogs) || !!$$props.result.responseData);
  const bodyPreview = user_derived(() => getBodyPreview($$props.result.responseData));
  function getMethodColor(method) {
    const colors = {
      GET: "#61affe",
      POST: "#49cc90",
      PUT: "#fca130",
      PATCH: "#50e3c2",
      DELETE: "#f93e3e",
      HEAD: "#9012fe",
      OPTIONS: "#0d5aa7"
    };
    return colors[method] || "#61affe";
  }
  function formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    return `${(ms / 1e3).toFixed(2)}s`;
  }
  function getBodyPreview(data) {
    if (!data) return "";
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return str.length > 500 ? str.substring(0, 500) + "..." : str;
  }
  var fragment = root$2();
  var tr = first_child(fragment);
  let classes;
  var td = child(tr);
  var text = child(td);
  var td_1 = sibling(td);
  var text_1 = child(td_1);
  var td_2 = sibling(td_1);
  var span = child(td_2);
  var text_2 = child(span);
  var td_3 = sibling(td_2);
  var node = child(td_3);
  {
    var consequent = ($$anchor2) => {
      var span_1 = root_1$2();
      let classes_1;
      var text_3 = child(span_1);
      template_effect(() => {
        classes_1 = set_class(span_1, 1, "status-code svelte-x6iln8", null, classes_1, {
          "status-ok": $$props.result.status < 400,
          "status-err": $$props.result.status >= 400
        });
        set_text(text_3, `${$$props.result.status ?? ""} ${$$props.result.statusText ?? ""}`);
      });
      append($$anchor2, span_1);
    };
    var alternate = ($$anchor2) => {
      var span_2 = root_2$1();
      append($$anchor2, span_2);
    };
    if_block(node, ($$render) => {
      if ($$props.result.status > 0) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var td_4 = sibling(td_3);
  var text_4 = child(td_4);
  var td_5 = sibling(td_4);
  var span_3 = child(td_5);
  var text_5 = child(span_3);
  var node_1 = sibling(span_3, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var span_4 = root_3$1();
      var text_6 = child(span_4);
      template_effect(() => set_text(text_6, `${get$1(assertionPassed) ?? ""}/${get$1(assertionTotal) ?? ""}`));
      append($$anchor2, span_4);
    };
    if_block(node_1, ($$render) => {
      if (get$1(hasAssertions)) $$render(consequent_1);
    });
  }
  var node_2 = sibling(tr, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var tr_1 = root_4$1();
      var td_6 = sibling(child(tr_1));
      var text_7 = child(td_6);
      template_effect(() => set_text(text_7, $$props.result.error));
      append($$anchor2, tr_1);
    };
    if_block(node_2, ($$render) => {
      if ($$props.result.error) $$render(consequent_2);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_10 = ($$anchor2) => {
      var tr_2 = root_5();
      var td_7 = sibling(child(tr_2));
      var div = child(td_7);
      var node_4 = child(div);
      {
        var consequent_3 = ($$anchor3) => {
          var div_1 = root_6$1();
          var code = sibling(child(div_1), 2);
          var text_8 = child(code);
          template_effect(() => set_text(text_8, $$props.result.url));
          append($$anchor3, div_1);
        };
        if_block(node_4, ($$render) => {
          if ($$props.result.url) $$render(consequent_3);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_2 = root_7$1();
          var div_3 = sibling(child(div_2), 2);
          each(div_3, 21, () => $$props.result.scriptTestResults, index, ($$anchor4, test) => {
            var div_4 = root_8();
            let classes_2;
            var span_5 = child(div_4);
            var text_9 = child(span_5);
            var span_6 = sibling(span_5, 2);
            var text_10 = child(span_6);
            var node_6 = sibling(span_6, 2);
            {
              var consequent_4 = ($$anchor5) => {
                var span_7 = root_9();
                var text_11 = child(span_7);
                template_effect(() => set_text(text_11, `(${get$1(test).error ?? ""})`));
                append($$anchor5, span_7);
              };
              if_block(node_6, ($$render) => {
                if (get$1(test).error) $$render(consequent_4);
              });
            }
            template_effect(() => {
              classes_2 = set_class(div_4, 1, "test-item svelte-x6iln8", null, classes_2, {
                "test-pass": get$1(test).passed,
                "test-fail": !get$1(test).passed
              });
              set_text(text_9, get$1(test).passed ? "✓" : "✗");
              set_text(text_10, get$1(test).name);
            });
            append($$anchor4, div_4);
          });
          append($$anchor3, div_2);
        };
        if_block(node_5, ($$render) => {
          if (get$1(hasScriptTests)) $$render(consequent_5);
        });
      }
      var node_7 = sibling(node_5, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_5 = root_10();
          var div_6 = sibling(child(div_5), 2);
          each(div_6, 21, () => $$props.result.scriptLogs, index, ($$anchor4, log) => {
            var div_7 = root_11();
            var span_8 = child(div_7);
            var text_12 = child(span_8);
            var span_9 = sibling(span_8, 2);
            var text_13 = child(span_9);
            template_effect(
              ($0) => {
                set_class(div_7, 1, `log-item log-${get$1(log).level ?? ""}`, "svelte-x6iln8");
                set_text(text_12, `[${get$1(log).level ?? ""}]`);
                set_text(text_13, $0);
              },
              [() => get$1(log).args.join(" ")]
            );
            append($$anchor4, div_7);
          });
          append($$anchor3, div_5);
        };
        if_block(node_7, ($$render) => {
          if (get$1(hasScriptLogs)) $$render(consequent_6);
        });
      }
      var node_8 = sibling(node_7, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_8 = root_12();
          var div_9 = sibling(child(div_8), 2);
          each(div_9, 21, () => $$props.result.assertionResults, index, ($$anchor4, ar) => {
            var div_10 = root_13();
            let classes_3;
            var span_10 = child(div_10);
            var text_14 = child(span_10);
            var span_11 = sibling(span_10, 2);
            var text_15 = child(span_11);
            var node_9 = sibling(span_11, 2);
            {
              var consequent_7 = ($$anchor5) => {
                var span_12 = root_14();
                var text_16 = child(span_12);
                template_effect(() => set_text(text_16, `Got: ${get$1(ar).actual ?? ""}`));
                append($$anchor5, span_12);
              };
              if_block(node_9, ($$render) => {
                if (!get$1(ar).passed && get$1(ar).actual !== void 0) $$render(consequent_7);
              });
            }
            template_effect(() => {
              classes_3 = set_class(div_10, 1, "assertion-item svelte-x6iln8", null, classes_3, {
                "assertion-pass": get$1(ar).passed,
                "assertion-fail": !get$1(ar).passed
              });
              set_text(text_14, get$1(ar).passed ? "✓" : "✗");
              set_text(text_15, get$1(ar).message);
            });
            append($$anchor4, div_10);
          });
          append($$anchor3, div_8);
        };
        if_block(node_8, ($$render) => {
          if (get$1(hasAssertions)) $$render(consequent_8);
        });
      }
      var node_10 = sibling(node_8, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_11 = root_15();
          var pre = sibling(child(div_11), 2);
          var text_17 = child(pre);
          template_effect(() => set_text(text_17, get$1(bodyPreview)));
          append($$anchor3, div_11);
        };
        if_block(node_10, ($$render) => {
          if (get$1(bodyPreview)) $$render(consequent_9);
        });
      }
      append($$anchor2, tr_2);
    };
    if_block(node_3, ($$render) => {
      if (get$1(isExpanded)) $$render(consequent_10);
    });
  }
  template_effect(
    ($0) => {
      classes = set_class(tr, 1, "result-row svelte-x6iln8", null, classes, {
        pass: $$props.result.passed,
        fail: !$$props.result.passed,
        clickable: get$1(isExpandable)
      });
      set_text(text, $$props.index + 1);
      set_attribute(td_1, "title", $$props.result.requestName);
      set_text(text_1, $$props.result.requestName);
      set_style(span, `color: ${get$1(methodColor) ?? ""}`);
      set_text(text_2, $$props.result.method);
      set_text(text_4, $0);
      set_class(span_3, 1, `result-badge ${get$1(statusClass) ?? ""}`, "svelte-x6iln8");
      set_text(text_5, $$props.result.passed ? "Pass" : "Fail");
    },
    [() => formatDuration($$props.result.duration)]
  );
  delegated("click", tr, () => get$1(isExpandable) && setExpandedResult($$props.result.requestId));
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);
var root_1$1 = from_html(`<div draggable="true" role="listitem"><span class="drag-handle svelte-195llm" title="Drag to reorder">&#x2630;</span> <input type="checkbox"/> <span class="method-badge svelte-195llm"> </span> <span class="request-name svelte-195llm"> </span></div>`);
var root$1 = from_html(`<div class="request-list svelte-195llm"><div class="list-header svelte-195llm"><label class="select-all svelte-195llm"><input type="checkbox"/> </label> <span class="enabled-count svelte-195llm"> </span></div> <div class="list-items svelte-195llm"></div></div>`);
function RunnerRequestList($$anchor, $$props) {
  push($$props, true);
  const $runnerState = () => store_get(runnerState, "$runnerState", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  const requests = user_derived(() => $runnerState().requests);
  const enabledCount = user_derived(() => get$1(requests).filter((r) => r.enabled).length);
  const allEnabled = user_derived(() => get$1(enabledCount) === get$1(requests).length);
  let dragIndex = state(null);
  let dragOverIndex = state(null);
  function handleDragStart(e, idx) {
    set(dragIndex, idx, true);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
    }
  }
  function handleDragOver(e, idx) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    set(dragOverIndex, idx, true);
  }
  function handleDrop(e, idx) {
    e.preventDefault();
    if (get$1(dragIndex) !== null && get$1(dragIndex) !== idx) {
      reorderRequest(get$1(dragIndex), idx);
    }
    set(dragIndex, null);
    set(dragOverIndex, null);
  }
  function handleDragEnd() {
    set(dragIndex, null);
    set(dragOverIndex, null);
  }
  function getMethodColor(method) {
    const colors = {
      GET: "#61affe",
      POST: "#49cc90",
      PUT: "#fca130",
      PATCH: "#50e3c2",
      DELETE: "#f93e3e",
      HEAD: "#9012fe",
      OPTIONS: "#0d5aa7"
    };
    return colors[method] || "#61affe";
  }
  var div = root$1();
  var div_1 = child(div);
  var label = child(div_1);
  var input = child(label);
  var text = sibling(input);
  var span = sibling(label, 2);
  var text_1 = child(span);
  var div_2 = sibling(div_1, 2);
  each(div_2, 23, () => get$1(requests), (req) => req.id, ($$anchor2, req, idx) => {
    var div_3 = root_1$1();
    let classes;
    var input_1 = sibling(child(div_3), 2);
    var span_1 = sibling(input_1, 2);
    var text_2 = child(span_1);
    var span_2 = sibling(span_1, 2);
    var text_3 = child(span_2);
    template_effect(
      ($0) => {
        classes = set_class(div_3, 1, "request-item svelte-195llm", null, classes, {
          disabled: !get$1(req).enabled,
          "drag-over": get$1(dragOverIndex) === get$1(idx)
        });
        set_checked(input_1, get$1(req).enabled);
        set_style(span_1, `color: ${$0 ?? ""}`);
        set_text(text_2, get$1(req).method);
        set_attribute(span_2, "title", get$1(req).url);
        set_text(text_3, get$1(req).name || get$1(req).url);
      },
      [() => getMethodColor(get$1(req).method)]
    );
    event("dragstart", div_3, (e) => handleDragStart(e, get$1(idx)));
    event("dragover", div_3, (e) => handleDragOver(e, get$1(idx)));
    event("drop", div_3, (e) => handleDrop(e, get$1(idx)));
    event("dragend", div_3, handleDragEnd);
    delegated("change", input_1, () => toggleRequestEnabled(get$1(req).id));
    append($$anchor2, div_3);
  });
  template_effect(() => {
    set_checked(input, get$1(allEnabled));
    set_text(text, ` ${get$1(allEnabled) ? "Deselect All" : "Select All"}`);
    set_text(text_1, `${get$1(enabledCount) ?? ""}/${get$1(requests).length ?? ""} enabled`);
  });
  delegated("change", input, () => toggleAllRequests(!get$1(allEnabled)));
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["change"]);
var root_1 = from_html(`<div class="config-section svelte-1txmb57"><!> <div class="config-options svelte-1txmb57"><div class="config-row svelte-1txmb57"><label class="config-label svelte-1txmb57"><input type="checkbox"/> Stop on first failure</label></div> <div class="config-row svelte-1txmb57"><label class="config-label svelte-1txmb57" for="runner-delay">Delay between requests</label> <div class="delay-input-group svelte-1txmb57"><input id="runner-delay" type="number" class="delay-input svelte-1txmb57" min="0" max="60000" step="100"/> <span class="delay-unit svelte-1txmb57">ms</span></div></div></div> <button class="run-button svelte-1txmb57"> </button></div>`);
var root_2 = from_html(`<div class="progress-section svelte-1txmb57"><div class="progress-info svelte-1txmb57"><span> </span> <span> </span></div> <div class="progress-bar-container svelte-1txmb57"><div class="progress-bar svelte-1txmb57"></div></div> <button class="cancel-button svelte-1txmb57">Cancel</button></div>`);
var root_4 = from_html(`<span class="stat-divider svelte-1txmb57">|</span> <span class="stat skip svelte-1txmb57"> </span>`, 1);
var root_7 = from_html(`<button class="action-button retry svelte-1txmb57"> </button>`);
var root_6 = from_html(`<div class="actions-section svelte-1txmb57"><button class="action-button svelte-1txmb57">Export JSON</button> <button class="action-button svelte-1txmb57">Export CSV</button> <!> <button class="action-button primary svelte-1txmb57">Run Again</button></div>`);
var root_3 = from_html(`<div class="summary-section svelte-1txmb57"><div class="summary-stats svelte-1txmb57"><span class="stat pass svelte-1txmb57"> </span> <span class="stat-divider svelte-1txmb57">|</span> <span class="stat fail svelte-1txmb57"> </span> <!> <span class="stat-divider svelte-1txmb57">|</span> <span class="stat time svelte-1txmb57"> </span></div></div> <div class="filter-bar svelte-1txmb57"><button> </button> <button> </button> <button> </button></div> <div class="results-section svelte-1txmb57"><table class="results-table svelte-1txmb57"><thead class="svelte-1txmb57"><tr><th class="th-index svelte-1txmb57">#</th><th class="th-name svelte-1txmb57">Name</th><th class="th-method svelte-1txmb57">Method</th><th class="th-status svelte-1txmb57">Status</th><th class="th-duration svelte-1txmb57">Duration</th><th class="th-result svelte-1txmb57">Result</th></tr></thead><tbody></tbody></table></div> <!>`, 1);
var root = from_html(`<div class="runner-panel svelte-1txmb57"><div class="runner-header svelte-1txmb57"><h2 class="runner-title svelte-1txmb57">Collection Runner</h2> <span class="collection-name svelte-1txmb57"> </span></div> <!> <!> <!></div>`);
function CollectionRunnerPanel($$anchor, $$props) {
  push($$props, true);
  const $runnerState = () => store_get(runnerState, "$runnerState", $$stores);
  const $filteredResults = () => store_get(filteredResults, "$filteredResults", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  const state2 = user_derived($runnerState);
  const results = user_derived($filteredResults);
  const isRunning = user_derived(() => get$1(state2).status === "running");
  const hasResults = user_derived(() => get$1(state2).results.length > 0);
  const enabledCount = user_derived(() => get$1(state2).requests.filter((r) => r.enabled).length);
  const progressPercent = user_derived(() => get$1(state2).progress.total > 0 ? Math.round(get$1(state2).progress.current / get$1(state2).progress.total * 100) : 0);
  function handleRun() {
    setRunning();
    const requestIds = getEnabledRequestIds();
    vscode.postMessage({
      type: "startCollectionRun",
      data: {
        collectionId: get$1(state2).collectionId,
        folderId: get$1(state2).folderId,
        config: get$1(state2).config,
        requestIds
      }
    });
  }
  function handleCancel() {
    vscode.postMessage({ type: "cancelCollectionRun" });
  }
  function handleRunAgain() {
    resetRunner();
  }
  function handleRetryFailed() {
    const failedIds = get$1(state2).results.filter((r) => !r.passed).map((r) => r.requestId);
    if (failedIds.length === 0) return;
    setRunning();
    vscode.postMessage({
      type: "retryFailedRequests",
      data: { requestIds: failedIds, config: get$1(state2).config }
    });
  }
  function handleExportJson() {
    vscode.postMessage({
      type: "exportRunResults",
      data: {
        format: "json",
        results: get$1(state2).results,
        summary: get$1(state2).summary,
        collectionName: get$1(state2).collectionName
      }
    });
  }
  function handleExportCsv() {
    vscode.postMessage({
      type: "exportRunResults",
      data: {
        format: "csv",
        results: get$1(state2).results,
        summary: get$1(state2).summary,
        collectionName: get$1(state2).collectionName
      }
    });
  }
  function formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    return `${(ms / 1e3).toFixed(2)}s`;
  }
  function handleMessage(event2) {
    const message = event2.data;
    switch (message.type) {
      case "initRunner":
        break;
      case "collectionRunProgress":
        updateProgress(message.data);
        break;
      case "collectionRunRequestResult":
        addResult(message.data);
        break;
      case "collectionRunComplete":
        setCompleted(message.data);
        break;
      case "collectionRunCancelled":
        setCancelled();
        break;
    }
  }
  var div = root();
  event("message", $window, handleMessage);
  var div_1 = child(div);
  var span = sibling(child(div_1), 2);
  var text = child(span);
  var node = sibling(div_1, 2);
  {
    var consequent = ($$anchor2) => {
      var div_2 = root_1();
      var node_1 = child(div_2);
      RunnerRequestList(node_1, {});
      var div_3 = sibling(node_1, 2);
      var div_4 = child(div_3);
      var label = child(div_4);
      var input = child(label);
      var div_5 = sibling(div_4, 2);
      var div_6 = sibling(child(div_5), 2);
      var input_1 = child(div_6);
      var button = sibling(div_3, 2);
      var text_1 = child(button);
      template_effect(() => {
        set_checked(input, get$1(state2).config.stopOnFailure);
        set_value(input_1, get$1(state2).config.delayMs);
        button.disabled = get$1(enabledCount) === 0;
        set_text(text_1, `Run ${get$1(enabledCount) ?? ""} Request${get$1(enabledCount) !== 1 ? "s" : ""}`);
      });
      delegated("change", input, (e) => updateConfig({ stopOnFailure: e.currentTarget.checked }));
      delegated("input", input_1, (e) => updateConfig({ delayMs: parseInt(e.currentTarget.value) || 0 }));
      delegated("click", button, handleRun);
      append($$anchor2, div_2);
    };
    if_block(node, ($$render) => {
      if (get$1(state2).status === "idle") $$render(consequent);
    });
  }
  var node_2 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_7 = root_2();
      var div_8 = child(div_7);
      var span_1 = child(div_8);
      var text_2 = child(span_1);
      var span_2 = sibling(span_1, 2);
      var text_3 = child(span_2);
      var div_9 = sibling(div_8, 2);
      var div_10 = child(div_9);
      var button_1 = sibling(div_9, 2);
      template_effect(() => {
        set_text(text_2, `Running: ${get$1(state2).progress.requestName ?? ""}`);
        set_text(text_3, `${get$1(state2).progress.current ?? ""}/${get$1(state2).progress.total ?? ""}`);
        set_style(div_10, `width: ${get$1(progressPercent) ?? ""}%`);
      });
      delegated("click", button_1, handleCancel);
      append($$anchor2, div_7);
    };
    if_block(node_2, ($$render) => {
      if (get$1(isRunning)) $$render(consequent_1);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var fragment = root_3();
      var div_11 = first_child(fragment);
      var div_12 = child(div_11);
      var span_3 = child(div_12);
      var text_4 = child(span_3);
      var span_4 = sibling(span_3, 4);
      var text_5 = child(span_4);
      var node_4 = sibling(span_4, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var fragment_1 = root_4();
          var span_5 = sibling(first_child(fragment_1), 2);
          var text_6 = child(span_5);
          template_effect(() => set_text(text_6, `${get$1(state2).summary.skipped ?? ""} skipped`));
          append($$anchor3, fragment_1);
        };
        if_block(node_4, ($$render) => {
          if (get$1(state2).summary.skipped > 0) $$render(consequent_2);
        });
      }
      var span_6 = sibling(node_4, 4);
      var text_7 = child(span_6);
      var div_13 = sibling(div_11, 2);
      var button_2 = child(div_13);
      let classes;
      var text_8 = child(button_2);
      var button_3 = sibling(button_2, 2);
      let classes_1;
      var text_9 = child(button_3);
      var button_4 = sibling(button_3, 2);
      let classes_2;
      var text_10 = child(button_4);
      var div_14 = sibling(div_13, 2);
      var table = child(div_14);
      var tbody = sibling(child(table));
      each(tbody, 23, () => get$1(results), (result, i) => result.requestId + "-" + i, ($$anchor3, result, i) => {
        RunnerResultRow($$anchor3, {
          get result() {
            return get$1(result);
          },
          get index() {
            return get$1(i);
          },
          get expandedId() {
            return get$1(state2).expandedResultId;
          }
        });
      });
      var node_5 = sibling(div_14, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_15 = root_6();
          var button_5 = child(div_15);
          var button_6 = sibling(button_5, 2);
          var node_6 = sibling(button_6, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var button_7 = root_7();
              var text_11 = child(button_7);
              template_effect(() => set_text(text_11, `Retry Failed (${get$1(state2).summary.failed ?? ""})`));
              delegated("click", button_7, handleRetryFailed);
              append($$anchor4, button_7);
            };
            if_block(node_6, ($$render) => {
              if (get$1(state2).summary.failed > 0) $$render(consequent_3);
            });
          }
          var button_8 = sibling(node_6, 2);
          delegated("click", button_5, handleExportJson);
          delegated("click", button_6, handleExportCsv);
          delegated("click", button_8, handleRunAgain);
          append($$anchor3, div_15);
        };
        if_block(node_5, ($$render) => {
          if (get$1(state2).status === "completed" || get$1(state2).status === "cancelled") $$render(consequent_4);
        });
      }
      template_effect(
        ($0) => {
          set_text(text_4, `${get$1(state2).summary.passed ?? ""} passed`);
          set_text(text_5, `${get$1(state2).summary.failed ?? ""} failed`);
          set_text(text_7, `${$0 ?? ""} total`);
          classes = set_class(button_2, 1, "filter-btn svelte-1txmb57", null, classes, { active: get$1(state2).resultFilter === "all" });
          set_text(text_8, `All (${get$1(state2).results.length ?? ""})`);
          classes_1 = set_class(button_3, 1, "filter-btn pass svelte-1txmb57", null, classes_1, { active: get$1(state2).resultFilter === "passed" });
          set_text(text_9, `Passed (${get$1(state2).summary.passed ?? ""})`);
          classes_2 = set_class(button_4, 1, "filter-btn fail svelte-1txmb57", null, classes_2, { active: get$1(state2).resultFilter === "failed" });
          set_text(text_10, `Failed (${get$1(state2).summary.failed ?? ""})`);
        },
        [() => formatDuration(get$1(state2).summary.totalDuration)]
      );
      delegated("click", button_2, () => setResultFilter("all"));
      delegated("click", button_3, () => setResultFilter("passed"));
      delegated("click", button_4, () => setResultFilter("failed"));
      append($$anchor2, fragment);
    };
    if_block(node_3, ($$render) => {
      if (get$1(hasResults)) $$render(consequent_5);
    });
  }
  template_effect(() => set_text(text, get$1(state2).collectionName));
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["change", "input", "click"]);
window.addEventListener("message", (event2) => {
  const message = event2.data;
  if (message.type === "initRunner") {
    initRunner(message.data);
  }
});
mount(CollectionRunnerPanel, { target: document.body });
vscode.postMessage({ type: "ready" });
//# sourceMappingURL=runner.js.map
