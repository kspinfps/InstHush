(function () {
  "use strict";
  const core = IY.core, subscriptions = new Set();
  let observer, idle = null, roots = new Set(), dates = new Set();
  function dispatch() {
    idle = null;
    const batch = roots, changed = dates;
    roots = new Set();
    dates = new Set();
    for (const sub of subscriptions) {
      for (const node of batch) {
        if (!subscriptions.has(sub)) break;
        sub.deliver(node);
      }
      if (sub.datetime) for (const node of changed) {
        if (!subscriptions.has(sub)) break;
        sub.datetime(node);
      }
    }
  }

  function collect(records) {
    for (const record of records) {
      if (record.type === "attributes") dates.add(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === 1) roots.add(node);
    }
    if (idle === null && (roots.size || dates.size)) {
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(dispatch, { timeout: 500 }) : setTimeout(dispatch, 50);
    }
  }

  function configure() {
    const opts = { childList: true, subtree: true };
    if ([...subscriptions].some(sub => sub.datetime)) {
      opts.attributes = true;
      opts.attributeFilter = ["datetime"];
    }
    observer.observe(document, opts);
  }

  // String subscribers receive each matching element in an added subtree.
  // Predicate subscribers receive the added root, allowing bounded feature-specific scans.
  core.observe = function (filter, callback, datetime) {
    const sub = {
      deliver: core.bind(node => {
        if (typeof filter === "function") {
          if (filter(node)) callback(node);
        } else {
          if (node.matches(filter)) callback(node);
          for (const child of node.querySelectorAll(filter)) {
            if (!subscriptions.has(sub)) break;
            callback(child);
          }
        }
      }),
      datetime: datetime && core.bind(datetime)
    };
    if (!observer) observer = new MutationObserver(collect);
    subscriptions.add(sub);
    const unsubscribe = core.cleanup(() => {
      subscriptions.delete(sub);
      if (subscriptions.size) { if (sub.datetime) configure(); return; }
      observer.disconnect();
      if (idle !== null) {
        if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
        else clearTimeout(idle);
      }
      idle = null;
      roots.clear();
      dates.clear();
    });
    try { configure(); } catch (err) { unsubscribe(); throw err; }
    return unsubscribe;
  };
})();
