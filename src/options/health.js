// Settings page health check row: runs the check in the background (src/bg/health.js), shows the
// result per page and copies an anonymous report. Adapted from Glassgram (github.com/jewdev/glassgram),
// GPL-3.0-only. Copyright jewdev; InstHush changes GPL-3.0-only.
(function () {
  "use strict";

  const REPORT_KEY = "healthReport";
  const RUN_KEY = "iy.health.run";
  const MARKS = { pass: "m5 12.5 4.5 4.5L19 7.5", warn: "M12 7v6M12 17h.01", fail: "M7 7l10 10M17 7 7 17", skip: "M7 12h10" };
  const STATUSES = ["pass", "warn", "fail", "skip"];
  const sid = value => String(value).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

  function browserName(agent) {
    const text = String(agent || "");
    for (const [re, name] of [[/Firefox\/(\d+)/, "Firefox"], [/Edg\/(\d+)/, "Edge"], [/Chrome\/(\d+)/, "Chrome"]]) {
      const m = re.exec(text);
      if (m) return name + " " + m[1];
    }
    return "Unknown";
  }

  function validReport(value) {
    return !!value && typeof value === "object" && Number.isFinite(value.at) && Array.isArray(value.checks);
  }

  function createRow(ctx) {
    const { doc, chrome: api, t, el, entry } = ctx;
    const lib = ctx.lib;
    let report = null;
    let running = false;
    let progress = "";
    let loadedStore = false;

    const row = el("div", "setting compact-setting row stack-row health-row");
    row.id = "row-" + entry.id;
    row.dataset.entry = entry.id;
    row.appendChild(ctx.copyBlock(Object.assign({}, entry, { icon: "health" }), { label: "label-" + entry.id, desc: "desc-" + entry.id }));
    const last = el("p", "meta health-last");
    last.id = "health-last";
    const actions = el("div", "row-actions");
    const run = el("button", "btn btn-accent", t("optHealthRun"));
    run.type = "button";
    run.id = "health-run";
    const copy = el("button", "btn", t("optHealthCopy"));
    copy.type = "button";
    copy.id = "health-copy";
    const close = el("button", "btn", t("optHealthClose"));
    close.type = "button";
    close.id = "health-close";
    actions.append(run, copy, close);
    const status = el("p", "description health-status");
    status.id = "health-status";
    status.setAttribute("role", "status");
    const results = el("div", "health-results");
    results.id = "health-results";
    results.hidden = true;
    row.append(last, actions, status, results);

    function lookup(key, subs) {
      const value = t(key, subs);
      return value && value !== key ? value : "";
    }
    function detailOf(check, state) {
      const base = "hc_" + sid(check.id) + "_";
      const subs = Number.isFinite(check.n) ? [String(check.n)] : undefined;
      return lookup(base + state, subs) || (/_step$/.test(base.slice(0, -1)) ? lookup("hc_step_" + state) : "") || check.detail || "";
    }
    function labelOf(check) {
      return lookup("hc_" + sid(check.id)) || check.label || "";
    }
    function groupName(group) {
      if (!group) return t("optHealthOwn");
      const step = lib.STEPS.find(name => lib.STEP_LABELS[name] === group);
      const value = t("hcGroup_" + (step || sid(group)));
      return value && !/^hcGroup_/.test(value) ? value : group;
    }
    function affectName(name) {
      const value = t("hcAff_" + sid(name));
      return value && !/^hcAff_/.test(value) ? value : name;
    }

    function line(check) {
      const state = STATUSES.indexOf(check.status === "ok" ? "pass" : check.status) < 0 ? "skip" : (check.status === "ok" ? "pass" : check.status);
      const li = el("li", "health-item is-" + state);
      const mark = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [k, v] of Object.entries({ class: "health-mark", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
        "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) mark.setAttribute(k, v);
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", MARKS[state]);
      mark.appendChild(path);
      const body = el("div", "health-text");
      const label = el("p", "health-label");
      label.append(el("span", "sr-only", t("hcStatus_" + state) + ": "), el("span", "", labelOf(check)));
      body.append(label, el("p", "description health-detail", detailOf(check, state)));
      if (Array.isArray(check.affects) && check.affects.length && (state === "fail" || state === "warn")) {
        body.append(el("p", "meta health-affects", t("optHealthAffects", [check.affects.map(affectName).join(", ")])));
      }
      li.append(mark, body);
      return li;
    }

    function renderList() {
      results.replaceChildren();
      if (!report) { results.hidden = true; return; }
      const overall = lib.overall(report.checks);
      const head = el("p", "health-summary is-" + overall, t("optHealthSummary_" + overall));
      const list = el("ul", "health-list");
      let group;
      for (const check of report.checks) {
        if (!check || typeof check !== "object") continue;
        if (check.group !== group || list.children.length === 0) {
          group = check.group;
          list.appendChild(el("li", "health-group", groupName(group)));
        }
        list.appendChild(line(check));
      }
      results.append(head, list);
      results.hidden = false;
    }

    function update() {
      const ready = ctx.ready();
      const canRun = ready;
      run.disabled = !canRun || running;
      copy.disabled = !report || running;
      close.hidden = !report || running;
      last.textContent = report ? t("optHealthLast", [new Date(report.at).toLocaleString(ctx.locale)]) : t("optHealthNever");
      status.textContent = running ? (progress || t("optHealthRunning")) : status.dataset.done || "";
      if (running) row.setAttribute("aria-busy", "true"); else row.removeAttribute("aria-busy");
      renderList();
    }

    function setReport(value) {
      report = validReport(value) ? value : null;
      if (!running) status.dataset.done = report && report.loggedOut ? t("optHealthLoggedOut") : "";
      update();
    }

    async function start() {
      if (running || !ctx.ready()) return;
      const steps = el("ul", "change-list");
      for (const key of ["optHealthStep1", "optHealthStep2", "optHealthStep3", "optHealthStep4"]) steps.appendChild(el("li", "", t(key)));
      const answer = await ctx.openDialog({
        title: t("optHealthConfirmTitle"), desc: t("optHealthConfirmDesc"),
        body: [steps],
        actions: [{ value: "run", label: t("optHealthRun"), accent: true }]
      });
      if (answer !== "run") return;
      running = true;
      progress = "";
      status.dataset.done = "";
      update();
      let reply;
      try {
        reply = await new Promise((resolve, reject) => {
          const done = value => { const error = api.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(value); };
          if (!api.runtime || typeof api.runtime.sendMessage !== "function") { reject(new Error("runtime")); return; }
          const maybe = api.runtime.sendMessage({ type: "iy:health-run" }, done);
          if (maybe && typeof maybe.then === "function") maybe.then(done, reject);
        });
      } catch (_) { reply = null; }
      running = false;
      if (reply && reply.ok && validReport(reply.report)) { setReport(reply.report); ctx.announce("optHealthDone"); }
      else {
        status.dataset.done = t(reply && reply.error === "busy" ? "optHealthBusy" : "optHealthFailed");
        update();
      }
    }

    async function copyReport() {
      if (!report) return;
      const body = lib.reportText({ version: report.version, page: "full check", at: report.at, checks: report.checks }, browserName(ctx.agent));
      try {
        await ctx.clipboard.writeText(body);
        status.dataset.done = t("optHealthCopied");
      } catch (_) { status.dataset.done = t("optHealthCopyFailed"); }
      update();
    }

    run.addEventListener("click", start);
    copy.addEventListener("click", copyReport);
    close.addEventListener("click", () => { report = null; status.dataset.done = ""; update(); });

    // The stored last report, and live progress / results written by the background.
    function read(area, key, then) {
      try {
        const target = api.storage && api.storage[area];
        if (!target) return;
        const done = value => { if (!(api.runtime && api.runtime.lastError)) then((value || {})[key]); };
        const maybe = target.get(key, done);
        if (maybe && typeof maybe.then === "function") maybe.then(done, () => {});
      } catch (_) {}
    }
    function load() {
      if (loadedStore) return;
      loadedStore = true;
      read("local", REPORT_KEY, value => { if (!running) setReport(value); });
      read("session", RUN_KEY, value => {
        if (value && Number.isInteger(value.index)) { running = true; progress = stepText(value); update(); }
      });
    }
    function stepText(value) {
      return t("optHealthStep", [lib.STEP_LABELS[value.step] ? groupName(lib.STEP_LABELS[value.step]) : "", String(value.index), String(value.total)]);
    }
    function onChanged(changes, areaName) {
      // A row that left the page (another category was shown) stops listening.
      if (row.isConnected === false) { try { api.storage.onChanged.removeListener(onChanged); } catch (_) {} return; }
      if (areaName === "local" && changes[REPORT_KEY]) { running = false; setReport(changes[REPORT_KEY].newValue); }
      if (areaName === "session" && changes[RUN_KEY]) {
        const value = changes[RUN_KEY].newValue;
        if (!value) { if (running) { running = false; update(); } return; }
        if (Number.isInteger(value.index)) { progress = stepText(value); if (!running) running = true; update(); }
      }
    }
    try { api.storage.onChanged.addListener(onChanged); } catch (_) {}
    ctx.register(() => { load(); update(); });
    return row;
  }

  const api = { createRow, browserName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.IY = Object.assign(globalThis.IY || {}, { optionsHealth: api });
})();
