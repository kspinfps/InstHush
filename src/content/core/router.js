(function () {
  "use strict";
  const core = IY.core, subscribers = new Set();
  let detach, previous;

  function current() { return location.href || location.pathname; }
  function notify() {
    const url = current();
    if (url === previous) return;
    previous = url;
    for (const callback of subscribers) callback();
  }
  function clicked(event) {
    const node = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
    if (node?.closest?.("a[href]")) Promise.resolve().then(notify);
  }
  core.route = function (fn) {
    if (typeof fn !== "function") return current();
    const callback = core.bind(fn);
    if (!subscribers.size) {
      const win = globalThis.window || globalThis;
      previous = current();
      // The existing MAIN history wrappers report pushState/replaceState through the private bridge.
      const off = IY.onRoute && IY.onRoute(notify);
      win.addEventListener("popstate", notify);
      win.navigation?.addEventListener("currententrychange", notify);
      document.addEventListener?.("click", clicked, { capture: true, passive: true });
      detach = () => {
        if (off) off();
        win.removeEventListener("popstate", notify);
        win.navigation?.removeEventListener("currententrychange", notify);
        document.removeEventListener?.("click", clicked, true);
      };
    }
    subscribers.add(callback);
    return core.cleanup(() => { subscribers.delete(callback); if (!subscribers.size) detach(); });
  };
})();
