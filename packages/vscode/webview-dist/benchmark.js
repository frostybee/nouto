import { d as derived, w as writable, a as delegate, p as push, v as sibling, r as child, i as if_block, t as template_effect, c as delegated, h as append, j as pop, m as from_html, z as set_value, C as set_text, A as each, k as get, D as index, n as user_derived, x as set_class, o as state, F as proxy, u as user_effect, l as set, q as store_get, s as setup_stores, f as first_child, N as mount } from "./theme-U7NfCYzD.js";
import { s as set_style } from "./style-BHbAZ2u6.js";
const defaultConfig = {
  iterations: 10,
  concurrency: 1,
  delayBetweenMs: 0
};
const initialState = {
  status: "idle",
  requestId: "",
  requestName: "",
  requestMethod: "GET",
  requestUrl: "",
  config: { ...defaultConfig },
  progress: { current: 0, total: 0 },
  iterations: [],
  statistics: null,
  distribution: []
};
const benchmarkState = writable({ ...initialState });
derived(benchmarkState, ($s) => $s.status);
derived(benchmarkState, ($s) => $s.progress);
derived(benchmarkState, ($s) => $s.iterations);
derived(benchmarkState, ($s) => $s.statistics);
derived(benchmarkState, ($s) => $s.distribution);
function initBenchmark(data) {
  benchmarkState.update((s) => ({
    ...s,
    status: "idle",
    requestId: data.requestId,
    requestName: data.requestName,
    requestMethod: data.requestMethod,
    requestUrl: data.requestUrl,
    collectionId: data.collectionId,
    config: { ...defaultConfig },
    iterations: [],
    statistics: null,
    distribution: [],
    progress: { current: 0, total: 0 }
  }));
}
function setRunning() {
  benchmarkState.update((s) => ({
    ...s,
    status: "running",
    iterations: [],
    statistics: null,
    distribution: []
  }));
}
function updateProgress(current, total) {
  benchmarkState.update((s) => ({ ...s, progress: { current, total } }));
}
function addIteration(iteration) {
  benchmarkState.update((s) => ({
    ...s,
    iterations: [...s.iterations, iteration]
  }));
}
function setCompleted(result) {
  benchmarkState.update((s) => ({
    ...s,
    status: "completed",
    statistics: result.statistics,
    distribution: result.distribution,
    iterations: result.iterations
  }));
}
function setCancelled() {
  benchmarkState.update((s) => ({ ...s, status: "cancelled" }));
}
function updateConfig(updates) {
  benchmarkState.update((s) => ({
    ...s,
    config: { ...s.config, ...updates }
  }));
}
function resetBenchmark() {
  benchmarkState.update((s) => ({
    ...s,
    status: "idle",
    iterations: [],
    statistics: null,
    distribution: [],
    progress: { current: 0, total: 0 }
  }));
}
var root_1$3 = from_html(`<div class="form-row svelte-1i06by3"><label for="delay" class="svelte-1i06by3">Delay between (ms)</label> <input id="delay" type="number" min="0" max="60000" class="svelte-1i06by3"/></div>`);
var root$4 = from_html(`<div class="config-form svelte-1i06by3"><div class="form-row svelte-1i06by3"><label for="iterations" class="svelte-1i06by3">Iterations</label> <input id="iterations" type="number" min="1" max="10000" class="svelte-1i06by3"/></div> <div class="form-row svelte-1i06by3"><label for="concurrency" class="svelte-1i06by3">Concurrency</label> <input id="concurrency" type="number" min="1" max="100" class="svelte-1i06by3"/> <span class="hint svelte-1i06by3"> </span></div> <!> <button class="start-btn svelte-1i06by3">Run Benchmark</button></div>`);
function BenchmarkConfigForm($$anchor, $$props) {
  push($$props, true);
  var div = root$4();
  var div_1 = child(div);
  var input = sibling(child(div_1), 2);
  var div_2 = sibling(div_1, 2);
  var input_1 = sibling(child(div_2), 2);
  var span = sibling(input_1, 2);
  var text = child(span);
  var node = sibling(div_2, 2);
  {
    var consequent = ($$anchor2) => {
      var div_3 = root_1$3();
      var input_2 = sibling(child(div_3), 2);
      template_effect(() => set_value(input_2, $$props.config.delayBetweenMs));
      delegated("change", input_2, (e) => $$props.onUpdate({ delayBetweenMs: parseInt(e.target.value) || 0 }));
      append($$anchor2, div_3);
    };
    if_block(node, ($$render) => {
      if ($$props.config.concurrency <= 1) $$render(consequent);
    });
  }
  var button = sibling(node, 2);
  template_effect(() => {
    set_value(input, $$props.config.iterations);
    set_value(input_1, $$props.config.concurrency);
    set_text(text, $$props.config.concurrency <= 1 ? "Sequential" : `${$$props.config.concurrency} concurrent`);
  });
  delegated("change", input, (e) => $$props.onUpdate({ iterations: parseInt(e.target.value) || 10 }));
  delegated("change", input_1, (e) => $$props.onUpdate({ concurrency: parseInt(e.target.value) || 1 }));
  delegated("click", button, function(...$$args) {
    var _a;
    (_a = $$props.onStart) == null ? void 0 : _a.apply(this, $$args);
  });
  append($$anchor, div);
  pop();
}
delegate(["change", "click"]);
var root$3 = from_html(`<div class="stats-section svelte-wb7f90"><h3 class="svelte-wb7f90">Statistics</h3> <div class="stats-grid svelte-wb7f90"><div class="stat-card svelte-wb7f90"><div class="stat-label svelte-wb7f90">Total</div> <div class="stat-value svelte-wb7f90"> </div></div> <div class="stat-card success svelte-wb7f90"><div class="stat-label svelte-wb7f90">Success</div> <div class="stat-value svelte-wb7f90"> </div></div> <div class="stat-card fail svelte-wb7f90"><div class="stat-label svelte-wb7f90">Failed</div> <div class="stat-value svelte-wb7f90"> </div></div> <div class="stat-card svelte-wb7f90"><div class="stat-label svelte-wb7f90">Req/s</div> <div class="stat-value svelte-wb7f90"> </div></div></div> <table class="stats-table svelte-wb7f90"><thead><tr><th class="svelte-wb7f90">Min</th><th class="svelte-wb7f90">Max</th><th class="svelte-wb7f90">Mean</th><th class="svelte-wb7f90">Median</th><th class="svelte-wb7f90">P75</th><th class="svelte-wb7f90">P90</th><th class="svelte-wb7f90">P95</th><th class="svelte-wb7f90">P99</th></tr></thead><tbody><tr><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td><td class="svelte-wb7f90"> </td></tr></tbody></table></div>`);
function BenchmarkStatisticsTable($$anchor, $$props) {
  push($$props, true);
  function fmt(ms) {
    if (ms < 1) return "<1ms";
    return `${Math.round(ms)}ms`;
  }
  var div = root$3();
  var div_1 = sibling(child(div), 2);
  var div_2 = child(div_1);
  var div_3 = sibling(child(div_2), 2);
  var text = child(div_3);
  var div_4 = sibling(div_2, 2);
  var div_5 = sibling(child(div_4), 2);
  var text_1 = child(div_5);
  var div_6 = sibling(div_4, 2);
  var div_7 = sibling(child(div_6), 2);
  var text_2 = child(div_7);
  var div_8 = sibling(div_6, 2);
  var div_9 = sibling(child(div_8), 2);
  var text_3 = child(div_9);
  var table = sibling(div_1, 2);
  var tbody = sibling(child(table));
  var tr = child(tbody);
  var td = child(tr);
  var text_4 = child(td);
  var td_1 = sibling(td);
  var text_5 = child(td_1);
  var td_2 = sibling(td_1);
  var text_6 = child(td_2);
  var td_3 = sibling(td_2);
  var text_7 = child(td_3);
  var td_4 = sibling(td_3);
  var text_8 = child(td_4);
  var td_5 = sibling(td_4);
  var text_9 = child(td_5);
  var td_6 = sibling(td_5);
  var text_10 = child(td_6);
  var td_7 = sibling(td_6);
  var text_11 = child(td_7);
  template_effect(
    ($0, $1, $2, $3, $4, $5, $6, $7) => {
      set_text(text, $$props.statistics.totalIterations);
      set_text(text_1, $$props.statistics.successCount);
      set_text(text_2, $$props.statistics.failCount);
      set_text(text_3, $$props.statistics.requestsPerSecond);
      set_text(text_4, $0);
      set_text(text_5, $1);
      set_text(text_6, $2);
      set_text(text_7, $3);
      set_text(text_8, $4);
      set_text(text_9, $5);
      set_text(text_10, $6);
      set_text(text_11, $7);
    },
    [
      () => fmt($$props.statistics.min),
      () => fmt($$props.statistics.max),
      () => fmt($$props.statistics.mean),
      () => fmt($$props.statistics.median),
      () => fmt($$props.statistics.p75),
      () => fmt($$props.statistics.p90),
      () => fmt($$props.statistics.p95),
      () => fmt($$props.statistics.p99)
    ]
  );
  append($$anchor, div);
  pop();
}
var root_1$2 = from_html(`<div class="bar-row svelte-1mjtsq5"><span class="bucket-label svelte-1mjtsq5"> </span> <div class="bar-container svelte-1mjtsq5"><div class="bar svelte-1mjtsq5"></div></div> <span class="bar-count svelte-1mjtsq5"> </span></div>`);
var root$2 = from_html(`<div class="distribution-section svelte-1mjtsq5"><h3 class="svelte-1mjtsq5">Response Time Distribution</h3> <div class="chart svelte-1mjtsq5"></div></div>`);
function BenchmarkDistributionChart($$anchor, $$props) {
  push($$props, true);
  const maxCount = user_derived(() => Math.max(...$$props.distribution.map((d) => d.count), 1));
  var div = root$2();
  var div_1 = sibling(child(div), 2);
  each(div_1, 21, () => $$props.distribution, index, ($$anchor2, bucket) => {
    var div_2 = root_1$2();
    var span = child(div_2);
    var text = child(span);
    var div_3 = sibling(span, 2);
    var div_4 = child(div_3);
    var span_1 = sibling(div_3, 2);
    var text_1 = child(span_1);
    template_effect(() => {
      set_text(text, get(bucket).bucket);
      set_style(div_4, `width: ${get(bucket).count / get(maxCount) * 100}%`);
      set_text(text_1, get(bucket).count);
    });
    append($$anchor2, div_2);
  });
  append($$anchor, div);
  pop();
}
var root_1$1 = from_html(`<tr><td class="num svelte-1vtff2y"> </td><td class="svelte-1vtff2y"> </td><td class="num svelte-1vtff2y"> </td><td class="num svelte-1vtff2y"> </td><td class="svelte-1vtff2y"><span> </span></td><td class="error svelte-1vtff2y"> </td></tr>`);
var root$1 = from_html(`<div class="iteration-section svelte-1vtff2y"><h3 class="svelte-1vtff2y"> </h3> <div class="table-container svelte-1vtff2y"><table class="svelte-1vtff2y"><thead><tr><th class="svelte-1vtff2y">#</th><th class="svelte-1vtff2y">Status</th><th class="svelte-1vtff2y">Duration</th><th class="svelte-1vtff2y">Size</th><th class="svelte-1vtff2y">Result</th><th class="svelte-1vtff2y">Error</th></tr></thead><tbody></tbody></table></div></div>`);
function BenchmarkIterationTable($$anchor, $$props) {
  push($$props, true);
  var div = root$1();
  var h3 = child(div);
  var text = child(h3);
  var div_1 = sibling(h3, 2);
  var table = child(div_1);
  var tbody = sibling(child(table));
  each(tbody, 21, () => $$props.iterations, index, ($$anchor2, iter) => {
    var tr = root_1$1();
    let classes;
    var td = child(tr);
    var text_1 = child(td);
    var td_1 = sibling(td);
    var text_2 = child(td_1);
    var td_2 = sibling(td_1);
    var text_3 = child(td_2);
    var td_3 = sibling(td_2);
    var text_4 = child(td_3);
    var td_4 = sibling(td_3);
    var span = child(td_4);
    let classes_1;
    var text_5 = child(span);
    var td_5 = sibling(td_4);
    var text_6 = child(td_5);
    template_effect(
      ($0) => {
        classes = set_class(tr, 1, "svelte-1vtff2y", null, classes, { failed: !get(iter).success });
        set_text(text_1, get(iter).iteration);
        set_text(text_2, get(iter).status || "-");
        set_text(text_3, `${get(iter).duration ?? ""}ms`);
        set_text(text_4, $0);
        classes_1 = set_class(span, 1, "badge svelte-1vtff2y", null, classes_1, { pass: get(iter).success, fail: !get(iter).success });
        set_text(text_5, get(iter).success ? "OK" : "FAIL");
        set_text(text_6, get(iter).error || "");
      },
      [
        () => get(iter).size > 0 ? `${(get(iter).size / 1024).toFixed(1)}KB` : "-"
      ]
    );
    append($$anchor2, tr);
  });
  template_effect(() => set_text(text, `Iterations (${$$props.iterations.length ?? ""})`));
  append($$anchor, div);
  pop();
}
var root_1 = from_html(`<div class="request-info svelte-1xsvkst"><span> </span> <span class="url svelte-1xsvkst"> </span></div>`);
var root_3 = from_html(`<div class="progress-section svelte-1xsvkst"><div class="progress-header svelte-1xsvkst"><span> </span> <button class="cancel-btn svelte-1xsvkst">Cancel</button></div> <div class="progress-bar svelte-1xsvkst"><div class="progress-fill svelte-1xsvkst"></div></div></div> <!>`, 1);
var root_6 = from_html(`<span class="cancelled-badge svelte-1xsvkst">Cancelled</span>`);
var root_5 = from_html(`<div class="results-actions svelte-1xsvkst"><button class="action-btn svelte-1xsvkst">New Benchmark</button> <button class="action-btn svelte-1xsvkst">Export JSON</button> <button class="action-btn svelte-1xsvkst">Export CSV</button> <!></div> <!> <!> <!>`, 1);
var root = from_html(`<div class="benchmark-panel svelte-1xsvkst"><div class="header svelte-1xsvkst"><h2 class="svelte-1xsvkst">Performance Benchmark</h2> <!></div> <!></div>`);
function BenchmarkPanel($$anchor, $$props) {
  push($$props, true);
  const $benchmarkState = () => store_get(benchmarkState, "$benchmarkState", $$stores);
  const [$$stores, $$cleanup] = setup_stores();
  let state$1 = state(proxy($benchmarkState()));
  user_effect(() => {
    set(state$1, $benchmarkState(), true);
  });
  function handleStart() {
    setRunning();
    vscode.postMessage({
      type: "startBenchmark",
      data: { config: get(state$1).config }
    });
  }
  function handleCancel() {
    vscode.postMessage({ type: "cancelBenchmark" });
  }
  function handleExport(format) {
    vscode.postMessage({ type: "exportBenchmarkResults", data: { format } });
  }
  function handleReset() {
    resetBenchmark();
  }
  const progressPercent = user_derived(() => get(state$1).progress.total > 0 ? Math.round(get(state$1).progress.current / get(state$1).progress.total * 100) : 0);
  var div = root();
  var div_1 = child(div);
  var node = sibling(child(div_1), 2);
  {
    var consequent = ($$anchor2) => {
      var div_2 = root_1();
      var span = child(div_2);
      var text = child(span);
      var span_1 = sibling(span, 2);
      var text_1 = child(span_1);
      template_effect(
        ($0) => {
          set_class(span, 1, `method method-${$0 ?? ""}`, "svelte-1xsvkst");
          set_text(text, get(state$1).requestMethod);
          set_text(text_1, get(state$1).requestUrl);
        },
        [() => get(state$1).requestMethod.toLowerCase()]
      );
      append($$anchor2, div_2);
    };
    if_block(node, ($$render) => {
      if (get(state$1).requestName) $$render(consequent);
    });
  }
  var node_1 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      BenchmarkConfigForm($$anchor2, {
        get config() {
          return get(state$1).config;
        },
        onUpdate: (updates) => updateConfig(updates),
        onStart: handleStart
      });
    };
    var consequent_3 = ($$anchor2) => {
      var fragment_1 = root_3();
      var div_3 = first_child(fragment_1);
      var div_4 = child(div_3);
      var span_2 = child(div_4);
      var text_2 = child(span_2);
      var button = sibling(span_2, 2);
      var div_5 = sibling(div_4, 2);
      var div_6 = child(div_5);
      var node_2 = sibling(div_3, 2);
      {
        var consequent_2 = ($$anchor3) => {
          BenchmarkIterationTable($$anchor3, {
            get iterations() {
              return get(state$1).iterations;
            }
          });
        };
        if_block(node_2, ($$render) => {
          if (get(state$1).iterations.length > 0) $$render(consequent_2);
        });
      }
      template_effect(() => {
        set_text(text_2, `Running... ${get(state$1).progress.current ?? ""} / ${get(state$1).progress.total ?? ""}`);
        set_style(div_6, `width: ${get(progressPercent) ?? ""}%`);
      });
      delegated("click", button, handleCancel);
      append($$anchor2, fragment_1);
    };
    var consequent_7 = ($$anchor2) => {
      var fragment_3 = root_5();
      var div_7 = first_child(fragment_3);
      var button_1 = child(div_7);
      var button_2 = sibling(button_1, 2);
      var button_3 = sibling(button_2, 2);
      var node_3 = sibling(button_3, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var span_3 = root_6();
          append($$anchor3, span_3);
        };
        if_block(node_3, ($$render) => {
          if (get(state$1).status === "cancelled") $$render(consequent_4);
        });
      }
      var node_4 = sibling(div_7, 2);
      {
        var consequent_5 = ($$anchor3) => {
          BenchmarkStatisticsTable($$anchor3, {
            get statistics() {
              return get(state$1).statistics;
            }
          });
        };
        if_block(node_4, ($$render) => {
          if (get(state$1).statistics) $$render(consequent_5);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_6 = ($$anchor3) => {
          BenchmarkDistributionChart($$anchor3, {
            get distribution() {
              return get(state$1).distribution;
            }
          });
        };
        if_block(node_5, ($$render) => {
          if (get(state$1).distribution.length > 0) $$render(consequent_6);
        });
      }
      var node_6 = sibling(node_5, 2);
      BenchmarkIterationTable(node_6, {
        get iterations() {
          return get(state$1).iterations;
        }
      });
      delegated("click", button_1, handleReset);
      delegated("click", button_2, () => handleExport("json"));
      delegated("click", button_3, () => handleExport("csv"));
      append($$anchor2, fragment_3);
    };
    if_block(node_1, ($$render) => {
      if (get(state$1).status === "idle") $$render(consequent_1);
      else if (get(state$1).status === "running") $$render(consequent_3, 1);
      else if (get(state$1).status === "completed" || get(state$1).status === "cancelled") $$render(consequent_7, 2);
    });
  }
  append($$anchor, div);
  pop();
  $$cleanup();
}
delegate(["click"]);
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "initBenchmark":
      initBenchmark(message.data);
      break;
    case "benchmarkProgress":
      updateProgress(message.data.current, message.data.total);
      break;
    case "benchmarkIterationComplete":
      addIteration(message.data);
      break;
    case "benchmarkComplete":
      setCompleted(message.data);
      break;
    case "benchmarkCancelled":
      setCancelled();
      break;
  }
});
mount(BenchmarkPanel, { target: document.body });
vscode.postMessage({ type: "ready" });
//# sourceMappingURL=benchmark.js.map
