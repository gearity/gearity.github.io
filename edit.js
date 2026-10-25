// Edit mode for gearity.github.io and the project sites under it. Open a page with ?edit, pick
// any text and rewrite it, then save: each changed file is committed to its repo through the
// GitHub contents API, and GitHub Pages redeploys. Visitors never load this file.
//
// Text in a page's HTML is found by its exact markup in the file. Text a script writes comes
// from that site's js/copy.js (window.COPY), matched with each {slot} as a wildcard.
(function () {
  if (window.EditMode) return;
  window.EditMode = true;

  const OWNER = "gearity";
  const PROJECTS = ["windmill"];   // project repos, which Pages serves at /<repo>/
  const AUTHOR = { name: "Jacob Gearity", email: "97267607+gearity@users.noreply.github.com" };
  const API = "https://api.github.com";
  const TOKEN_KEY = "gearity.editToken";
  const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

  // ---------- files on GitHub ----------
  function locate(url) {
    let path = decodeURIComponent(new URL(url, location.href).pathname).replace(/^\/+/, "");
    let repo = `${OWNER}.github.io`;
    const first = path.split("/")[0];
    if (PROJECTS.includes(first)) { repo = first; path = path.slice(first.length + 1); }
    if (!path || path.endsWith("/")) path += "index.html";
    else if (!/\.\w+$/.test(path)) path += ".html";   // Pages serves /scottie-effect from scottie-effect.html
    return { repo, path, id: `${repo}/${path}` };
  }

  let memToken = "";
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || memToken; } catch (e) { return memToken; } }
  function setToken(v) {
    memToken = v;
    try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function github(file, put, anonymous) {
    const url = `${API}/repos/${OWNER}/${file.repo}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`;
    const headers = { Accept: "application/vnd.github+json" };
    const token = anonymous ? "" : getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (put) headers["Content-Type"] = "application/json";
    const res = await fetch(put ? url : `${url}?ref=main`, {
      method: put ? "PUT" : "GET", headers, cache: "no-store", body: put ? JSON.stringify(put) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    // A bad saved token shouldn't stop reading public files; the save will report it.
    if (res.status === 401 && token && !put) return github(file, null, true);
    if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status });
    return data;
  }

  const files = new Map();   // file id -> { file, text, sha, crlf }
  async function load(file) {
    const data = await github(file);
    const raw = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
    // The browser turns CRLF into LF on the page, so match against LF and put the endings back on save.
    const entry = { file, sha: data.sha, crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") };
    files.set(file.id, entry);
    return entry;
  }
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  const page = locate(location.href);
  const copyScript = window.COPY && document.querySelector('script[src$="copy.js"]');
  const copyFile = copyScript ? locate(copyScript.src) : null;
  let copy = null;   // { file, entries: [{ key, group, value }] }

  const ENTRY = /^\s*(\w+)\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/;
  function parseCopy(entry) {
    const entries = [];
    let group = "", inside = false;
    for (const line of entry.text.split("\n")) {
      if (!inside) { inside = /^\s*window\.COPY\s*=\s*\{/.test(line); continue; }
      if (/^\s*\};?\s*$/.test(line)) break;
      const c = line.match(/^\s*\/\/\s*(.+)$/);
      if (c) { group = c[1]; continue; }
      const m = line.match(ENTRY);
      if (m) entries.push({ key: m[1], group, value: JSON.parse(m[2]) });
    }
    return { file: entry.file, entries };
  }

  // ---------- matching page text to the files ----------
  const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\xa0/g, "&nbsp;");
  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\xa0/g, "&nbsp;");
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clip = (s, n = 60) => (s.length > n ? s.slice(0, n - 3).trimEnd() + "..." : s);
  const fill = (tpl, vals) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
  function split(s) {
    const lead = s.match(/^\s*/)[0], rest = s.slice(lead.length), trail = rest.match(/\s*$/)[0];
    return [lead, rest.slice(0, rest.length - trail.length), trail];
  }
  function positions(text, needle) {
    const out = [];
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) out.push(i);
    return out;
  }
  function allText() {
    const out = [], walk = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n);
    return out;
  }

  // Repeated text is told apart by its order on the page, which only works when the page and
  // the file hold the same number of copies.
  function occurrence(find, peers, item) {
    const count = positions(files.get(page.id).text, find).length;
    if (!count) return { error: "missing" };
    if (count === 1) return { nth: 0, count };
    if (count === peers.length) return { nth: peers.indexOf(item), count };
    return { error: "repeated", count };
  }
  function rangeOf(text, find, at, offset, length) {
    const pos = positions(text, find);
    if (pos.length !== at.count) return null;
    const start = pos[at.nth] + offset;
    return [start, start + length];
  }

  // A target is one piece of text the editor can change. range(text) finds it in a fresh copy
  // of its file (null if it's gone) and insert(value) is what goes in that range.
  const targets = new Map();
  const changed = new Set();
  const ids = new WeakMap();
  let nextId = 0;
  const idOf = (obj) => { if (!ids.has(obj)) ids.set(obj, ++nextId); return ids.get(obj); };
  function target(key, props) {
    if (!targets.has(key)) targets.set(key, Object.assign({ key, value: props.original }, props));
    return targets.get(key);
  }
  function setValue(t, v) {
    t.value = v;
    t.preview(v);
    if (v === t.original) changed.delete(t.key); else changed.add(t.key);
    renderBar();
  }

  function textTarget(node) {
    const key = "text:" + idOf(node);
    if (targets.has(key)) return targets.get(key);
    const [lead, body, trail] = split(node.data);
    const find = ">" + escText(node.data) + "<";
    const at = occurrence(find, allText().filter((n) => n.data === node.data), node);
    if (at.error) return at;
    return target(key, {
      file: page, label: page.path, original: body,
      preview: (v) => { node.data = lead + v + trail; },
      range: (text) => rangeOf(text, find, at, 1, find.length - 2),
      insert: (v) => escText(lead + v + trail),
    });
  }

  // An element with links or other tags inside edits as one HTML box, as long as its markup is
  // in the file exactly as the browser shows it.
  function htmlTarget(unit) {
    const key = "html:" + idOf(unit);
    if (targets.has(key)) return targets.get(key);
    const inner = unit.innerHTML, tag = unit.localName;
    const find = ">" + inner + "</" + tag + ">";
    const peers = [...document.getElementsByTagName(tag)].filter((el) => el.innerHTML === inner);
    const at = occurrence(find, peers, unit);
    if (at.error) return null;
    const [lead, body, trail] = split(inner);
    return target(key, {
      file: page, label: page.path, original: body,
      preview: (v) => { unit.innerHTML = lead + v + trail; },
      range: (text) => rangeOf(text, find, at, 1, inner.length),
      insert: (v) => lead + v + trail,
    });
  }

  function matchTemplate(tpl, s) {
    if (!tpl.replace(/\{\w+\}/g, "").trim()) return null;
    const names = [];
    const pattern = tpl.trim().split(/(\{\w+\})/).map((part) => {
      const slot = part.match(/^\{(\w+)\}$/);
      if (!slot) return escRe(part);
      names.push(slot[1]);
      return "(.+?)";
    }).join("");
    const m = s.match(new RegExp("^" + pattern + "$"));
    return m ? Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) : null;
  }

  function copyTarget(entry) {
    const key = "copy:" + entry.key;
    if (targets.has(key)) return targets.get(key);
    const nodes = new Map();   // text node on the page -> { lead, trail, vals }
    const t = target(key, {
      file: copy.file, label: entry.group, sub: entry.key, original: entry.value, nodes,
      preview: (v) => {
        window.COPY[entry.key] = v;
        nodes.forEach(({ lead, trail, vals }, n) => { n.data = lead + fill(v, vals) + trail; });
      },
      range: (text) => {
        const all = [...text.matchAll(new RegExp(String.raw`^(\s*${entry.key}\s*:\s*)("(?:[^"\\\n]|\\.)*")`, "gm"))];
        if (all.length !== 1) return null;
        const start = all[0].index + all[0][1].length;
        return [start, start + all[0][2].length];
      },
      insert: (v) => JSON.stringify(v),
    });
    t.match = (n) => {
      const [lead, body, trail] = split(n.data);
      const vals = matchTemplate(t.value, body) || matchTemplate(String(window.COPY[entry.key] ?? ""), body);
      return vals && { lead, trail, vals };
    };
    t.scan = () => allText().forEach((n) => { const m = n.data.trim() && t.match(n); if (m) nodes.set(n, m); });
    return t;
  }
  // When several entries fit, the one with the most fixed text wins: "from {seasons}." also fits
  // the postseason line, but "from {seasons}, postseason included." is the one that wrote it.
  // Entries that tie (two "About average." lines) all show.
  function copyFor(node) {
    if (!copy) return [];
    const fixed = (t) => t.value.replace(/\{\w+\}/g, "").length;
    const hits = copy.entries.map(copyTarget).map((t) => ({ t, m: t.match(node) })).filter((h) => h.m);
    const best = Math.max(...hits.map((h) => fixed(h.t)));
    return hits.filter((h) => fixed(h.t) === best).map(({ t, m }) => { t.nodes.set(node, m); return t; });
  }

  function headTargets() {
    const out = [];
    const title = document.querySelector("head > title");
    if (title) {
      out.push(target("head:title", {
        file: page, label: "Tab title", original: title.textContent,
        preview: (v) => { document.title = v; },
        range: (text) => { const m = /<title>([^<]*)<\/title>/.exec(text); return m ? [m.index + 7, m.index + 7 + m[1].length] : null; },
        insert: escText,
      }));
    }
    const metas = [
      ["name", "description", "Search description"],
      ["property", "og:title", "Link preview title"],
      ["property", "og:description", "Link preview description"],
    ];
    for (const [attr, name, label] of metas) {
      const el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) continue;
      out.push(target("head:" + name, {
        file: page, label, original: el.getAttribute("content") || "",
        preview: (v) => { el.setAttribute("content", v); },
        range: (text) => {
          const tags = [...text.matchAll(new RegExp(`<meta\\s[^>]*\\b${attr}="${escRe(name)}"[^>]*>`, "g"))];
          if (tags.length !== 1) return null;
          const c = /\bcontent="([^"]*)"/.exec(tags[0][0]);
          if (!c) return null;
          const start = tags[0].index + c.index + 'content="'.length;
          return [start, start + c[1].length];
        },
        insert: escAttr,
      }));
    }
    return out;
  }

  // ---------- picking ----------
  const INLINE = new Set(["A", "ABBR", "B", "CODE", "EM", "I", "KBD", "MARK", "S", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());

  // The element that holds the text at a point: climb to the first element with text of its
  // own, then out of inline tags like <a> or <b> that sit inside a sentence.
  function unitAt(x, y) {
    let u = document.elementsFromPoint(x, y).find((el) => el !== host);
    while (u && !ownText(u)) u = u.parentElement;
    if (!u || u === document.body || SKIP.has(u.tagName)) return null;
    while (INLINE.has(u.tagName) && u.parentElement && ownText(u.parentElement)) u = u.parentElement;
    return u;
  }

  function targetsFor(unit) {
    if (unit.children.length) {
      const t = htmlTarget(unit);
      if (t) return { list: [t], errors: [] };
    }
    const list = [], errors = [];
    const walk = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.data.trim()) continue;
      const fromCopy = copyFor(n);
      if (fromCopy.length) { fromCopy.forEach((t) => list.includes(t) || list.push(t)); continue; }
      const t = textTarget(n);
      if (t.error) errors.push(t); else list.push(t);
    }
    return { list, errors };
  }

  // ---------- UI ----------
  const host = document.createElement("div");
  host.id = "edit-mode";
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .ui { --bg: var(--board, #1e3a2b); --deep: var(--board-deep, #142a1e); --line: var(--board-line, #2d5240);
            --ink: var(--chalk, #eef0e8); --dim: var(--chalk-dim, #a9bcae); --hot: var(--signal, #f2c230);
            font: 500 17px/1.3 "Barlow Condensed", "Arial Narrow", sans-serif; color: var(--ink); }
      [hidden] { display: none !important; }
      button { font: inherit; font-weight: 600; color: var(--ink); background: var(--deep); border: 1px solid var(--line);
               padding: 6px 12px; cursor: pointer; }
      button:hover:not(:disabled) { border-color: var(--hot); }
      button:disabled { opacity: .45; cursor: default; }
      button[aria-pressed="true"], button.go { background: var(--hot); color: #2a2206; border-color: var(--hot); }
      a { color: var(--hot); }
      .overlay { position: absolute; inset: 0; pointer-events: auto; cursor: crosshair; }
      .hl, .sel { position: absolute; pointer-events: none; outline: 2px dashed var(--hot); outline-offset: 0; }
      .sel { outline-style: solid; }
      .bar { position: absolute; right: 12px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
             max-width: calc(100% - 24px); padding: 8px; background: var(--bg); border: 2px solid var(--line);
             box-shadow: 0 6px 24px rgba(0, 0, 0, .45); pointer-events: auto; }
      .status { flex-basis: 100%; color: var(--dim); font-size: 15px; }
      .status:empty { display: none; }
      .pop, .sheet { position: absolute; pointer-events: auto; background: var(--bg); border: 2px solid var(--line);
                     box-shadow: 0 8px 28px rgba(0, 0, 0, .5); }
      .pop { width: min(460px, calc(100% - 16px)); max-height: 60vh; overflow: auto; padding: 12px; }
      .sheet { top: 0; right: 0; bottom: 0; width: min(460px, 100%); overflow: auto; padding: 16px 16px 120px; }
      .sheet h2 { font: 400 28px/1 "Saira Stencil One", Impact, sans-serif; margin: 0 0 12px; }
      .sheet h3 { font-size: 19px; margin: 18px 0 6px; color: var(--hot); }
      .sheet-head { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
      .field { display: block; margin: 0 0 12px; }
      .field-label { display: block; color: var(--dim); font-size: 15px; margin-bottom: 3px; }
      .field-label small { font-size: 13px; opacity: .8; margin-left: 6px; }
      .field-warn { display: block; color: var(--out, #e0553f); font-size: 15px; }
      .field-warn:empty { display: none; }
      textarea, input { width: 100%; font: 400 16px/1.4 "Barlow", "Segoe UI", system-ui, sans-serif; color: var(--ink);
                        background: var(--deep); border: 1px solid var(--line); padding: 6px 8px; resize: vertical; }
      textarea:focus, input:focus { outline: 2px solid var(--hot); outline-offset: -1px; }
      .note { color: var(--dim); font: 400 15px/1.4 "Barlow", "Segoe UI", system-ui, sans-serif; margin: 0 0 10px; }
      .actions { display: flex; gap: 6px; justify-content: flex-end; }
      .change { border-top: 1px solid var(--line); padding: 8px 0; font: 400 15px/1.4 "Barlow", "Segoe UI", system-ui, sans-serif; }
      .change del { display: block; color: var(--dim); }
      .change ins { display: block; text-decoration: none; }
      .problem { color: var(--out, #e0553f); }
    </style>
    <div class="ui">
      <div class="overlay" hidden></div>
      <div class="hl" hidden></div>
      <div class="sel" hidden></div>
      <div class="pop" hidden></div>
      <aside class="sheet" hidden></aside>
      <div class="bar">
        <button type="button" data-act="pick" aria-pressed="false" disabled>Pick text</button>
        <button type="button" data-act="list" disabled>All text</button>
        <button type="button" data-act="save" disabled>Save</button>
        <button type="button" data-act="exit">Exit</button>
        <span class="status" aria-live="polite"></span>
      </div>
    </div>`;
  const q = (sel) => root.querySelector(sel);
  const overlay = q(".overlay"), hl = q(".hl"), sel = q(".sel"), pop = q(".pop"), sheet = q(".sheet"), bar = q(".bar");
  const btn = (act) => q(`[data-act="${act}"]`);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const status = (text) => { q(".status").textContent = text; };

  let picking = false, active = null;

  function renderBar() {
    const n = changed.size;
    btn("save").disabled = !n;
    btn("save").textContent = n ? `Save ${n} ${n === 1 ? "change" : "changes"}` : "Save";
    btn("pick").setAttribute("aria-pressed", String(picking));
  }
  function setPicking(on) {
    picking = on;
    overlay.hidden = !on;
    if (!on) frame(hl, null);
    renderBar();
  }
  function frame(box, rect) {
    if (!rect) { box.hidden = true; return; }
    box.hidden = false;
    Object.assign(box.style, { left: rect.left - 3 + "px", top: rect.top - 3 + "px", width: rect.width + 6 + "px", height: rect.height + 6 + "px" });
  }
  function fitBox(box) { box.style.height = "auto"; box.style.height = box.scrollHeight + 2 + "px"; }

  // `grouped` fields sit under a heading that already names their group, so they show only the key.
  function fieldFor(t, onEnter, grouped) {
    const wrap = el("label", "field");
    const head = el("span", "field-label", grouped && t.sub ? t.sub : t.label);
    if (t.sub && !grouped) head.append(el("small", null, t.sub));
    const box = el("textarea");
    box.rows = 1;
    box.value = t.value;
    const warn = el("span", "field-warn");
    const slots = t.original.match(/\{\w+\}/g) || [];
    const check = () => {
      const missing = slots.filter((s) => !box.value.includes(s));
      warn.textContent = missing.length ? `Missing ${missing.join(" ")}` : "";
    };
    box.addEventListener("input", () => { setValue(t, box.value); fitBox(box); check(); });
    box.addEventListener("focus", () => { if (t.scan) t.scan(); });
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); } });
    check();
    wrap.append(head, box, warn);
    wrap.box = box;
    wrap.target = t;
    return wrap;
  }

  function openPop(unit) {
    const { list, errors } = targetsFor(unit);
    active = unit;
    pop.replaceChildren();
    const fields = list.map((t) => fieldFor(t, closePop));
    pop.append(...fields);
    const names = [page.path, copy && copy.file.path].filter(Boolean).join(" or ");
    const repeated = errors.find((e) => e.error === "repeated");
    if (repeated) pop.append(el("p", "note", `Part of this is in ${page.path} ${repeated.count} times, so change that part in the file.`));
    else if (!list.length) pop.append(el("p", "note", `Can't find this in ${names}. Either data fills it in or the page is behind GitHub, so reload if you saved in the last few minutes.`));
    else if (errors.length) pop.append(el("p", "note", "The rest of this comes from data."));
    const actions = el("div", "actions");
    if (list.length) {
      const undo = el("button", null, "Undo");
      undo.type = "button";
      undo.addEventListener("click", () => fields.forEach((f) => { setValue(f.target, f.target.original); f.box.value = f.target.original; fitBox(f.box); }));
      actions.append(undo);
    }
    const done = el("button", "go", "Done");
    done.type = "button";
    done.addEventListener("click", closePop);
    actions.append(done);
    pop.append(actions);
    pop.hidden = false;
    fields.forEach((f) => fitBox(f.box));
    place();
    if (fields[0]) fields[0].box.focus({ preventScroll: true });
  }
  function closePop() {
    pop.hidden = true;
    active = null;
    frame(sel, null);
  }
  function place() {
    if (pop.hidden || !active) return;
    const r = active.getBoundingClientRect();
    frame(sel, r);
    const vw = innerWidth, room = innerHeight - bar.offsetHeight - 24;
    if (vw < 640) {
      Object.assign(pop.style, { left: "8px", top: "", bottom: bar.offsetHeight + 20 + "px" });
      return;
    }
    let top = r.bottom + 10;
    if (top + pop.offsetHeight > room) top = Math.max(8, r.top - 10 - pop.offsetHeight);
    Object.assign(pop.style, { bottom: "", top: top + "px", left: Math.min(Math.max(8, r.left), vw - pop.offsetWidth - 8) + "px" });
  }

  function sheetHead(title) {
    sheet.replaceChildren();
    sheet.dataset.view = title;
    const head = el("div", "sheet-head");
    const close = el("button", null, "Close");
    close.type = "button";
    close.addEventListener("click", () => { sheet.hidden = true; });
    head.append(el("h2", null, title), close);
    sheet.append(head);
    sheet.hidden = false;
  }

  function openList() {
    sheetHead("All text");
    const filter = el("input");
    filter.type = "search";
    filter.placeholder = "Filter";
    sheet.append(filter);
    const blur = () => root.activeElement && root.activeElement.blur();
    const fields = [];
    const section = (title, list) => {
      if (!list.length) return;
      const h = el("h3", null, title);
      sheet.append(h);
      list.forEach((t) => { const f = fieldFor(t, blur, true); f.heading = h; fields.push(f); sheet.append(f); });
    };
    section("This page", headTargets());
    if (copy) {
      const groups = new Map();
      copy.entries.forEach((e) => { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(copyTarget(e)); });
      groups.forEach((list, group) => section(`${copy.file.path}: ${group}`, list));
    }
    filter.addEventListener("input", () => {
      const needle = filter.value.trim().toLowerCase();
      const shown = new Set();
      fields.forEach((f) => {
        const t = f.target, hay = [t.label, t.sub || "", t.value].join(" ").toLowerCase();
        f.hidden = !!needle && !hay.includes(needle);
        if (!f.hidden) shown.add(f.heading);
      });
      sheet.querySelectorAll("h3").forEach((h) => { h.hidden = !shown.has(h); });
    });
    fields.forEach((f) => fitBox(f.box));
    filter.focus();
  }

  function defaultMessage(list) {
    if (list.length === 1) return `Reword "${clip(list[0].original, 50)}"`;
    return `Reword ${list.length} pieces of text`;
  }

  function openSave() {
    closePop();
    const list = [...changed].map((k) => targets.get(k));
    sheetHead("Save to GitHub");
    list.forEach((t) => {
      const row = el("div", "change");
      const what = t.sub || (t.label === t.file.path ? "" : t.label);
      row.append(el("span", "field-label", `${t.file.repo}/${t.file.path}${what ? ", " + what : ""}`), el("del", null, t.original), el("ins", null, t.value));
      sheet.append(row);
    });
    const msgField = el("label", "field");
    const msg = Object.assign(el("input"), { value: defaultMessage(list) });
    msgField.append(el("span", "field-label", "Commit message"), msg);
    sheet.append(msgField);
    let tokenBox = null;
    if (!getToken()) {
      const f = el("label", "field");
      tokenBox = Object.assign(el("input"), { type: "password", autocomplete: "off" });
      const help = el("p", "note");
      const link = Object.assign(el("a", null, "Make a fine-grained token"), { href: TOKEN_URL, target: "_blank", rel: "noopener" });
      help.append(link, ` with Contents read and write on ${OWNER}.github.io and ${PROJECTS.join(" and ")}.`);
      f.append(el("span", "field-label", "GitHub token"), tokenBox);
      sheet.append(f, help);
    }
    const result = el("div");
    const actions = el("div", "actions");
    if (getToken()) {
      const forget = el("button", null, "Forget token");
      forget.type = "button";
      forget.addEventListener("click", () => { setToken(""); openSave(); });
      actions.append(forget);
    }
    const commit = el("button", "go", "Commit");
    commit.type = "button";
    commit.addEventListener("click", async () => {
      if (tokenBox) {
        if (!tokenBox.value.trim()) { result.replaceChildren(el("p", "note problem", "Paste a token first.")); return; }
        setToken(tokenBox.value.trim());
      }
      commit.disabled = true;
      result.replaceChildren(el("p", "note", "Saving."));
      const { done, problems } = await save(msg.value.trim() || defaultMessage(list));
      result.replaceChildren();
      done.forEach(({ file, url }) => {
        const p = el("p", "note", `Saved ${file.repo}/${file.path}. `);
        if (url) p.append(Object.assign(el("a", null, "See the commit"), { href: url, target: "_blank", rel: "noopener" }));
        result.append(p);
      });
      problems.forEach((text) => result.append(el("p", "note problem", text)));
      if (done.length) status("Saved. The live site updates in a minute or two.");
      commit.disabled = !changed.size;
      renderBar();
    });
    actions.append(commit);
    sheet.append(actions, result);
    msg.focus();
  }

  function failure(file, e) {
    const where = `${file.repo}/${file.path}`;
    if (e.status === 401) return `GitHub refused the token. Forget it and paste a new one.`;
    if (e.status === 403) return `The token can't write to ${file.repo} (${e.message}). It needs Contents read and write on that repo.`;
    if (e.status === 404) return `GitHub can't find ${where}, or the token can't see ${file.repo}.`;
    if (e.status === 409) return `${where} changed on GitHub during the save. Commit again.`;
    return `${where}: ${e.message}`;
  }

  async function save(message) {
    const groups = new Map();
    for (const k of changed) {
      const t = targets.get(k);
      if (!groups.has(t.file.id)) groups.set(t.file.id, []);
      groups.get(t.file.id).push(t);
    }
    const done = [], problems = [];
    for (const list of groups.values()) {
      const file = list[0].file;
      try {
        const fresh = await load(file);
        const edits = [];
        for (const t of list) {
          const r = t.range(fresh.text);
          if (r) edits.push({ t, r });
          else problems.push(`"${clip(t.original)}" isn't in ${file.path} on GitHub any more. Reload and redo that change.`);
        }
        if (!edits.length) continue;
        edits.sort((a, b) => b.r[0] - a.r[0]);
        let text = fresh.text;
        for (const { t, r } of edits) text = text.slice(0, r[0]) + t.insert(t.value) + text.slice(r[1]);
        const res = await github(file, {
          message, branch: "main", sha: fresh.sha, author: AUTHOR,
          content: encode(fresh.crlf ? text.replace(/\n/g, "\r\n") : text),
        });
        Object.assign(fresh, { text, sha: res.content.sha });
        edits.forEach(({ t }) => changed.delete(t.key));
        // Saved text moves everything after it, so drop this file's targets and rebuild on the next pick.
        [...targets.values()].forEach((t) => { if (t.file.id === file.id && !changed.has(t.key)) targets.delete(t.key); });
        if (copy && file.id === copy.file.id) copy = parseCopy(fresh);
        done.push({ file, url: res.commit && res.commit.html_url });
      } catch (e) {
        problems.push(failure(file, e));
      }
    }
    return { done, problems };
  }

  // ---------- events ----------
  overlay.addEventListener("pointermove", (e) => {
    const u = unitAt(e.clientX, e.clientY);
    frame(hl, u && u !== active ? u.getBoundingClientRect() : null);
  });
  overlay.addEventListener("pointerleave", () => frame(hl, null));
  overlay.addEventListener("click", (e) => {
    const u = unitAt(e.clientX, e.clientY);
    frame(hl, null);
    if (u) openPop(u); else closePop();
  });
  btn("pick").addEventListener("click", () => { setPicking(!picking); if (!picking) closePop(); });
  btn("list").addEventListener("click", () => {
    if (!sheet.hidden && sheet.dataset.view === "All text") sheet.hidden = true; else openList();
  });
  btn("save").addEventListener("click", openSave);
  btn("exit").addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("edit");
    location.href = url.toString();
  });

  // Keys typed in the editor stay out of the page's own shortcuts (Windmill's S, H and Enter).
  ["keydown", "keyup", "keypress"].forEach((type) => host.addEventListener(type, (e) => {
    e.stopPropagation();
    if (type === "keydown" && e.key === "Escape") {
      e.preventDefault();
      if (!pop.hidden) closePop(); else sheet.hidden = true;
    }
  }));
  addEventListener("scroll", () => { frame(hl, null); place(); }, true);
  addEventListener("resize", place);
  addEventListener("beforeunload", (e) => { if (changed.size) { e.preventDefault(); e.returnValue = ""; } });

  // A modal dialog makes the rest of the page inert, so the editor moves inside it while it's open.
  function rehome() {
    const modal = [...document.querySelectorAll("dialog[open]")].filter((d) => d.matches(":modal")).pop();
    const parent = modal || document.body;
    if (host.parentNode !== parent) parent.append(host);
  }
  new MutationObserver(rehome).observe(document.body, { attributes: true, attributeFilter: ["open"], subtree: true });

  // ---------- start ----------
  document.body.append(host);
  rehome();
  (async () => {
    status(`Loading ${page.path} from GitHub.`);
    let loading = page;
    try {
      await load(page);
      if (copyFile) { loading = copyFile; copy = parseCopy(await load(copyFile)); }
    } catch (e) {
      status(`Couldn't load ${loading.repo}/${loading.path} from GitHub: ${e.message}.`);
      return;
    }
    status("");
    btn("pick").disabled = false;
    btn("list").disabled = false;
    setPicking(true);
  })();
})();
