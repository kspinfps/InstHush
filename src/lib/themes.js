(function () {
  "use strict";
  // Bounded local settings; kept identical to the MAIN-world normalizer.
  const normalizeMute = (function () {
  const uncurry = Function.prototype.bind.bind(Function.prototype.call);
  const isArray = Array.isArray;
  const strTrim = uncurry(String.prototype.trim);
  const strLower = uncurry(String.prototype.toLowerCase);
  const strLocaleLower = uncurry(String.prototype.toLocaleLowerCase);
  const strSlice = uncurry(String.prototype.slice);
  const strIncludes = uncurry(String.prototype.includes);
  const regexExec = uncurry(RegExp.prototype.exec);
  function muteEntry(value, account) {
    if (typeof value !== "string" || value.length > 102) return "";
    let clean = strTrim(value);
    if (account && clean[0] === "@") clean = strSlice(clean, 1);
    if (!clean || clean.length > 50) return "";
    if (account) {
      if (!regexExec(/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/, clean) || strIncludes(clean, "..")) return "";
      return strLower(clean);
    }
    return strLocaleLower(clean, "tr");
  }
  function normalizeMute(value) {
    const result = { words: [], accounts: [] };
    if (!value || typeof value !== "object" || isArray(value)) return result;
    for (let k = 0, names = ["words", "accounts"]; k < names.length; k++) {
      const key = names[k], list = value[key], out = result[key];
      if (!isArray(list)) continue;
      for (let i = 0; i < list.length && i < 100; i++) {
        const clean = muteEntry(list[i], key === "accounts");
        if (!clean) continue;
        let duplicate = false;
        for (let j = 0; j < out.length; j++) if (out[j] === clean) duplicate = true;
        if (!duplicate) out[out.length] = clean;
      }
    }
    return result;
  }
    return normalizeMute;
  })();

  var THEMES = {
    green: {
      accent: "#9DCEAB", accentText: "#9DCEAB", onAccent: "#17251C",
      surface: "#171D19", surfaceRaised: "#252E27", text: "#EAF0E8",
      muted: "#ACB9AE", border: "#39473D", track: "#748279", thumb: "#17251C", swatch: "#246346",
      light: {
        accent: "#246346", accentText: "#246346", onAccent: "#FFFFFF",
        surface: "#F4F3EF", surfaceRaised: "#FFFFFF", text: "#202923",
        muted: "#59655D", border: "#D7DDD7", track: "#707B73", thumb: "#FFFFFF",
        hover: "#E9EEE8", ghost: "#183E30", ghostOff: "#303A34", ghostText: "#F0F6ED",
        ghostMuted: "#BED2C4", ghostHighlight: "#9DCEAB", ghostInk: "#183E30",
        ghostTrack: "#5B6A60", ghostAccent: "#4F8F66", ghostThumb: "#F0F6ED",
        glass: "#F4F3EFEB", hairline: "#2029231F"
      },
      dark: {
        accent: "#9DCEAB", accentText: "#9DCEAB", onAccent: "#17251C",
        surface: "#171D19", surfaceRaised: "#252E27", text: "#EAF0E8",
        muted: "#ACB9AE", border: "#39473D", track: "#748279", thumb: "#17251C",
        hover: "#252E27", ghost: "#203F31", ghostOff: "#303A34", ghostText: "#F0F6ED",
        ghostMuted: "#BED2C4", ghostHighlight: "#C9E6AB", ghostInk: "#183E30",
        ghostTrack: "#748279", ghostAccent: "#9DCEAB", ghostThumb: "#17251C",
        glass: "#171D19EB", hairline: "#FFFFFF1F"
      }
    },
    black: {
      accent: "#E6EAEF", accentText: "#E6EAEF", onAccent: "#121416",
      surface: "#121416", surfaceRaised: "#1E2124", text: "#F0F2F4",
      muted: "#A9B0B7", border: "#2E3338", track: "#6E767E", thumb: "#121416", swatch: "#181B1E",
      light: {
        accent: "#E6EAEF", accentText: "#E6EAEF", onAccent: "#121416",
        surface: "#121416", surfaceRaised: "#1E2124", text: "#F0F2F4",
        muted: "#A9B0B7", border: "#2E3338", track: "#6E767E", thumb: "#121416",
        hover: "#1E2124", ghost: "#1B1F23", ghostOff: "#23282D", ghostText: "#F0F2F4",
        ghostMuted: "#B8C0C8", ghostHighlight: "#E6EAEF", ghostInk: "#121416",
        ghostTrack: "#6E767E", ghostAccent: "#E6EAEF", ghostThumb: "#121416",
        glass: "#121416EB", hairline: "#FFFFFF1F"
      },
      dark: {
        accent: "#E6EAEF", accentText: "#E6EAEF", onAccent: "#121416",
        surface: "#121416", surfaceRaised: "#1E2124", text: "#F0F2F4",
        muted: "#A9B0B7", border: "#2E3338", track: "#6E767E", thumb: "#121416",
        hover: "#1E2124", ghost: "#1B1F23", ghostOff: "#23282D", ghostText: "#F0F2F4",
        ghostMuted: "#B8C0C8", ghostHighlight: "#E6EAEF", ghostInk: "#121416",
        ghostTrack: "#6E767E", ghostAccent: "#E6EAEF", ghostThumb: "#121416",
        glass: "#121416EB", hairline: "#FFFFFF1F"
      }
    },
    white: {
      accent: "#20262C", accentText: "#20262C", onAccent: "#FFFFFF",
      surface: "#F5F6F7", surfaceRaised: "#FFFFFF", text: "#181B1E",
      muted: "#555D65", border: "#D5DAE0", track: "#6E7780", thumb: "#FFFFFF", swatch: "#F5F6F7",
      light: {
        accent: "#20262C", accentText: "#20262C", onAccent: "#FFFFFF",
        surface: "#F5F6F7", surfaceRaised: "#FFFFFF", text: "#181B1E",
        muted: "#555D65", border: "#D5DAE0", track: "#6E7780", thumb: "#FFFFFF",
        hover: "#EAECEF", ghost: "#20262C", ghostOff: "#323941", ghostText: "#F5F6F7",
        ghostMuted: "#C4CCD4", ghostHighlight: "#E2E8F0", ghostInk: "#181B1E",
        ghostTrack: "#606972", ghostAccent: "#6E859C", ghostThumb: "#F5F6F7",
        glass: "#F5F6F7EB", hairline: "#181B1E1F"
      },
      dark: {
        accent: "#20262C", accentText: "#20262C", onAccent: "#FFFFFF",
        surface: "#F5F6F7", surfaceRaised: "#FFFFFF", text: "#181B1E",
        muted: "#555D65", border: "#D5DAE0", track: "#6E7780", thumb: "#FFFFFF",
        hover: "#EAECEF", ghost: "#20262C", ghostOff: "#323941", ghostText: "#F5F6F7",
        ghostMuted: "#C4CCD4", ghostHighlight: "#E2E8F0", ghostInk: "#181B1E",
        ghostTrack: "#606972", ghostAccent: "#6E859C", ghostThumb: "#F5F6F7",
        glass: "#F5F6F7EB", hairline: "#181B1E1F"
      }
    },
    pink: {
      accent: "#F0A3C2", accentText: "#F0A3C2", onAccent: "#28131C",
      surface: "#1F161A", surfaceRaised: "#2E2228", text: "#F5E9EE",
      muted: "#C8B0B9", border: "#47353D", track: "#88727B", thumb: "#28131C", swatch: "#C84B7C",
      light: {
        accent: "#8C2D56", accentText: "#8C2D56", onAccent: "#FFFFFF",
        surface: "#F7F1F3", surfaceRaised: "#FFFFFF", text: "#2C1D23",
        muted: "#6E545E", border: "#E3D4D9", track: "#826B74", thumb: "#FFFFFF",
        hover: "#EFE4E8", ghost: "#481C30", ghostOff: "#422E37", ghostText: "#F9EEF2",
        ghostMuted: "#DEC2CD", ghostHighlight: "#F5B8D0", ghostInk: "#481C30",
        ghostTrack: "#705862", ghostAccent: "#A84872", ghostThumb: "#F9EEF2",
        glass: "#F7F1F3EB", hairline: "#2C1D231F"
      },
      dark: {
        accent: "#F0A3C2", accentText: "#F0A3C2", onAccent: "#28131C",
        surface: "#1F161A", surfaceRaised: "#2E2228", text: "#F5E9EE",
        muted: "#C8B0B9", border: "#47353D", track: "#88727B", thumb: "#28131C",
        hover: "#2E2228", ghost: "#3D1D2C", ghostOff: "#34272D", ghostText: "#F9EEF2",
        ghostMuted: "#DEC2CD", ghostHighlight: "#F5B8D0", ghostInk: "#28131C",
        ghostTrack: "#88727B", ghostAccent: "#F0A3C2", ghostThumb: "#28131C",
        glass: "#1F161AEB", hairline: "#FFFFFF1F"
      }
    },
    purple: {
      accent: "#C6B2F2", accentText: "#C6B2F2", onAccent: "#1E1533",
      surface: "#191622", surfaceRaised: "#262233", text: "#EEEAF6",
      muted: "#B8B0CA", border: "#3D3650", track: "#7B738F", thumb: "#1E1533", swatch: "#734BB8",
      light: {
        accent: "#5B3896", accentText: "#5B3896", onAccent: "#FFFFFF",
        surface: "#F4F1F8", surfaceRaised: "#FFFFFF", text: "#231D2E",
        muted: "#5F5670", border: "#DAD3E5", track: "#766D87", thumb: "#FFFFFF",
        hover: "#EAE5F2", ghost: "#2E1E4A", ghostOff: "#352F42", ghostText: "#F2EFFA",
        ghostMuted: "#CEC6E0", ghostHighlight: "#D4C4F7", ghostInk: "#2E1E4A",
        ghostTrack: "#635A75", ghostAccent: "#7752B5", ghostThumb: "#F2EFFA",
        glass: "#F4F1F8EB", hairline: "#231D2E1F"
      },
      dark: {
        accent: "#C6B2F2", accentText: "#C6B2F2", onAccent: "#1E1533",
        surface: "#191622", surfaceRaised: "#262233", text: "#EEEAF6",
        muted: "#B8B0CA", border: "#3D3650", track: "#7B738F", thumb: "#1E1533",
        hover: "#262233", ghost: "#2B2046", ghostOff: "#2E2A3B", ghostText: "#F2EFFA",
        ghostMuted: "#CEC6E0", ghostHighlight: "#D4C4F7", ghostInk: "#1E1533",
        ghostTrack: "#7B738F", ghostAccent: "#C6B2F2", ghostThumb: "#1E1533",
        glass: "#191622EB", hairline: "#FFFFFF1F"
      }
    },
    ocean: {
      accent: "#82CEE0", accentText: "#82CEE0", onAccent: "#10242B",
      surface: "#131C21", surfaceRaised: "#1E2B32", text: "#E6F1F5",
      muted: "#A4BCC6", border: "#31454F", track: "#6C828C", thumb: "#10242B", swatch: "#1F7A94",
      light: {
        accent: "#175E73", accentText: "#175E73", onAccent: "#FFFFFF",
        surface: "#EEF4F6", surfaceRaised: "#FFFFFF", text: "#18262C",
        muted: "#4E626B", border: "#CFE0E6", track: "#687D86", thumb: "#FFFFFF",
        hover: "#E2ECEF", ghost: "#133B47", ghostOff: "#29383E", ghostText: "#ECF6F9",
        ghostMuted: "#B8D2DC", ghostHighlight: "#9ADCEE", ghostInk: "#133B47",
        ghostTrack: "#556B73", ghostAccent: "#2A7D96", ghostThumb: "#ECF6F9",
        glass: "#EEF4F6EB", hairline: "#18262C1F"
      },
      dark: {
        accent: "#82CEE0", accentText: "#82CEE0", onAccent: "#10242B",
        surface: "#131C21", surfaceRaised: "#1E2B32", text: "#E6F1F5",
        muted: "#A4BCC6", border: "#31454F", track: "#6C828C", thumb: "#10242B",
        hover: "#1E2B32", ghost: "#173742", ghostOff: "#243138", ghostText: "#ECF6F9",
        ghostMuted: "#B8D2DC", ghostHighlight: "#9ADCEE", ghostInk: "#10242B",
        ghostTrack: "#6C828C", ghostAccent: "#82CEE0", ghostThumb: "#10242B",
        glass: "#131C21EB", hairline: "#FFFFFF1F"
      }
    }
  };

  var ALIASES = {
    green: "green", yesil: "green", "yeşil": "green",
    black: "black", siyah: "black",
    white: "white", beyaz: "white",
    pink: "pink", pembe: "pink",
    purple: "purple", mor: "purple",
    ocean: "ocean", okyanus: "ocean"
  };

  var THEME_ORDER = ["green", "black", "white", "pink", "purple", "ocean"];

  function resolveName(name) {
    if (typeof name !== "string") return "black";
    var key = name.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ALIASES, key) ? ALIASES[key] : "black";
  }

  function resolveMode(key, mode) {
    if (key === "black") return "dark";
    if (key === "white") return "light";
    if (mode === "light" || mode === "dark") return mode;
    try {
      if (typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    } catch (err) {}
    return "dark";
  }

  function themeVars(name, mode) {
    var key = resolveName(name);
    var entry = THEMES[key] || THEMES.green;
    var p = entry[resolveMode(key, mode)] || entry.dark;
    return [
      "--iy-accent:" + p.accent,
      "--iy-accent-text:" + p.accentText,
      "--iy-on-accent:" + p.onAccent,
      "--iy-surface:" + p.surface,
      "--iy-surface-raised:" + p.surfaceRaised,
      "--iy-text:" + p.text,
      "--iy-muted:" + p.muted,
      "--iy-border:" + p.border,
      "--iy-track:" + p.track,
      "--iy-thumb:" + p.thumb,
      "--iy-hover:" + p.hover,
      "--iy-ghost:" + p.ghost,
      "--iy-ghost-off:" + p.ghostOff,
      "--iy-ghost-text:" + p.ghostText,
      "--iy-ghost-muted:" + p.ghostMuted,
      "--iy-ghost-highlight:" + p.ghostHighlight,
      "--iy-ghost-ink:" + p.ghostInk,
      "--iy-ghost-track:" + p.ghostTrack,
      "--iy-ghost-accent:" + p.ghostAccent,
      "--iy-ghost-thumb:" + p.ghostThumb,
      "--iy-glass:" + p.glass,
      "--iy-hairline:" + p.hairline
    ].join(";") + ";";
  }

  // Toolbar uses the light accent: green retains the packaged #246346 mark.
  function iconColors(name) {
    var key = resolveName(name);
    var theme = THEMES[key];
    return {
      fill: theme.light.accent,
      stroke: key === "green" ? "#c3dcc9" : theme.light.accent,
      play: key === "green" ? "#f0f6ed" : theme.light.onAccent
    };
  }

  function editMute(value, edit) {
    var mute = normalizeMute(value);
    if (!edit || (edit.key !== "words" && edit.key !== "accounts")) return mute;
    var one = normalizeMute({ [edit.key]: [edit.value] })[edit.key][0];
    if (!one) return mute;
    var list = mute[edit.key], index = list.indexOf(one);
    if (edit.remove) { if (index !== -1) list.splice(index, 1); }
    else if (index === -1 && list.length < 100) list.push(one);
    return mute;
  }
  // Shared inline editor: native controls supply keyboard behavior, including
  // Enter to submit. There is deliberately no Backspace deletion shortcut.
  function createMuteEditor(options) {
    var doc = options.parent.ownerDocument, t = options.t;
    function node(tag, className, text) {
      var el = doc.createElement(tag); el.className = className || "";
      if (text) el.textContent = text;
      return el;
    }
    function permitted(event) { return !options.trusted || event.isTrusted; }
    function svg(className, viewBox, paths) {
      var ns = "http://www.w3.org/2000/svg", icon = doc.createElementNS(ns, "svg");
      var attrs = { class: className, width: "16", height: "16", viewBox: viewBox, fill: "none", stroke: "currentColor",
        "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" };
      Object.keys(attrs).forEach(function (k) { icon.setAttribute(k, attrs[k]); });
      paths.forEach(function (d) { var p = doc.createElementNS(ns, "path"); p.setAttribute("d", d); icon.appendChild(p); });
      return icon;
    }
    // Same row anatomy as the other disclosures: emblem + label on the left, count + chevron on the right.
    var row = node("button", options.rowClass + " mute-toggle"); row.type = "button";
    var lead = node("span", options.leadClass || "");
    var label = node("span", options.labelClass, t("muteTitle")), count = node("span", "mute-count");
    lead.append(svg("emblem", "0 0 16 16", ["M2.75 6h2.5l3.5-3v10l-3.5-3h-2.5Z", "M11 6.25l3 3.5M14 6.25l-3 3.5"]), label);
    var end = node("span", "mute-end");
    end.append(count, svg("emblem mute-chevron", "0 0 24 24", ["m8 10 4 4 4-4"]));
    row.append(lead, end); row.setAttribute("aria-expanded", "false");
    var panel = node("div", "mute-editor"); panel.id = options.id; panel.hidden = true;
    row.setAttribute("aria-controls", panel.id);
    row.addEventListener("click", function (event) {
      if (!permitted(event)) return;
      var open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open)); panel.hidden = !open;
      if (open) { fields.words.input.focus(); panel.scrollIntoView({ block: "nearest" }); }
    });
    var status = node("p", "description"); status.setAttribute("role", "status");
    var fields = {};
    ["words", "accounts"].forEach(function (key) {
      var group = node("fieldset", "mute-group");
      var legend = node("legend", options.labelClass, t(key === "words" ? "muteWords" : "muteAccounts"));
      var form = node("form", "mute-form");
      var input = node("input"); input.type = "text"; input.maxLength = key === "accounts" ? 51 : 50;
      input.setAttribute("aria-label", legend.textContent);
      input.placeholder = t(key === "words" ? "muteWordsPlaceholder" : "muteAccountsPlaceholder");
      input.autocomplete = "off"; input.spellcheck = false;
      var add = node("button", "mute-add", t("muteAdd")); add.type = "submit";
      var list = node("div", "mute-chips"); list.setAttribute("role", "list"); list.setAttribute("aria-label", legend.textContent);
      form.append(input, add); group.append(legend, form, list); panel.appendChild(group);
      fields[key] = { input: input, add: add, list: list, signature: null };
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!permitted(event) || input.disabled) return;
        var clean = normalizeMute({ [key]: [input.value] })[key][0], current = normalizeMute(options.read())[key];
        if (!clean || current.indexOf(clean) !== -1 || current.length >= 100) {
          status.textContent = t("muteInvalid"); return;
        }
        status.textContent = "";
        fields[key].pending = clean;
        options.save({ muteEdit: { key: key, value: clean } });
      });
    });
    panel.appendChild(status); options.parent.append(row, panel);
    return { row: row, panel: panel, fields: fields, render: function (value, disabled) {
      var mute = normalizeMute(value);
      count.textContent = String(mute.words.length + mute.accounts.length);
      row.disabled = disabled;
      ["words", "accounts"].forEach(function (key) {
        var field = fields[key], list = mute[key], signature = JSON.stringify(list);
        field.input.disabled = disabled; field.add.disabled = disabled;
        if (field.pending && list.indexOf(field.pending) !== -1) { field.input.value = ""; field.pending = null; }
        if (signature !== field.signature) {
          field.signature = signature; field.list.replaceChildren();
          list.forEach(function (value) {
            var item = node("span", "mute-chip"); item.setAttribute("role", "listitem");
            var text = (key === "accounts" ? "@" : "") + value;
            var remove = node("button", "mute-remove", "×"); remove.type = "button";
            remove.setAttribute("aria-label", t("muteRemove") + " " + text);
            remove.addEventListener("click", function (event) {
              if (!permitted(event) || remove.disabled) return;
              status.textContent = ""; field.input.focus();
              options.save({ muteEdit: { key: key, value: value, remove: true } });
            });
            item.append(node("span", "", text), remove); field.list.appendChild(item);
          });
        }
        Array.from(field.list.querySelectorAll("button")).forEach(function (button) { button.disabled = disabled; });
      });
    } };
  }
  var API = { normalizeMute: normalizeMute, editMute: editMute, createMuteEditor: createMuteEditor, iconColors: iconColors, THEMES: THEMES, THEME_ORDER: THEME_ORDER, resolveThemeName: resolveName, themeVars: themeVars };
  if (typeof module !== "undefined") module.exports = API;
  else globalThis.IY = Object.assign(globalThis.IY || {}, API);
})();
