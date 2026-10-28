"use strict";
/* ============ 論理回路の画面 ============
   CS Math Trainer の 6 つ目のカテゴリ．app.js は触らず，この画面が自分の 3 つの画面
   （サブメニュー／解説／練習）を .screen の active で切り替える．
   5 つ目のカテゴリ（binary-fraction.js）の作りにならい，次を変えた：
   ・種類は AND・OR・NOT／組み合わせ／回路を選ぶ／半加算・全加算．難易度は 初級（2 入力）／中級（3 入力）（AND・OR・NOT は難易度なし）
   ・作業用紙は回路図（SVG．座標はコアが計算）と真理値表．入力は 0/1 のマス（<button>．タップで 空→0→1→0…）．文字入力欄は使わない
   ・直リンク #logic（サブメニュー）・#logic-basic・#logic-combine・#logic-choose・#logic-adder（練習へ直行．答えが出る指定は入れない）
   ・時間制限・タイマー・コンボは持たない
   ============================================================ */
(function () {
  var C = LogicCore, T = C.TEXT, U = T.ui, qs = window.location.search;
  var SELFTEST = /[?&]selftest=1(?:&|$)/.test(qs);                // 値がちょうど 1 のときだけ
  var SVGNS = "http://www.w3.org/2000/svg";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag), k;
    if (attrs) for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
    if (text != null) e.textContent = text;
    return e;
  }
  function richText(host, str) {                                   // <b>…</b> だけ太字
    String(str).split(/(<b>[^<]*<\/b>)/).forEach(function (part) {
      var m = /^<b>([^<]*)<\/b>$/.exec(part);
      if (m) host.appendChild(el("strong", "", m[1]));
      else if (part) host.appendChild(document.createTextNode(part));
    });
    return host;
  }
  function rich(tag, cls, str) { return richText(el(tag, cls), str); }
  function levelSub(kind, lv) { return kind === "adder" ? T.levelSubAdder[lv] : T.levelSub[lv]; }
  function lvLabel(kind, lv) { return kind === "adder" ? T.level[lv] + "：" + T.levelSubAdder[lv] : T.level[lv] + "（" + T.levelSub[lv] + "）"; }       // 括弧は 1 段（中級：全加算回路（挑戦））
  var LEVEL_ID = { 1: "easy", 2: "medium" };

  /* ---- 画面の切り替え（app.js の showScreen には触らない．.screen をまとめて切り替える） ---- */
  function show(id) {
    var all = document.querySelectorAll(".screen"), i, app = document.querySelector(".app-container");
    for (i = 0; i < all.length; i++) all[i].classList.toggle("active", all[i].id === id);
    if (app) {
      app.classList.toggle("lg-compact", id === "lg-play-screen"); app.classList.toggle("lg-learn", id === "lg-learn-screen");
      app.classList.remove("bc-compact"); app.classList.remove("bc-learn"); app.classList.remove("bf-compact"); app.classList.remove("bf-learn");
    }
    document.body.classList.toggle("lg-top", id === "lg-play-screen");
    document.body.classList.remove("bc-top"); document.body.classList.remove("bf-top");
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* ---- 記録（localStorage．使えなくてもその場限りで動く） ---- */
  function memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
  var storage = null;
  if (SELFTEST) storage = memStorage();                       // 自己検査は端末の記録を汚さない
  else { try { storage = window.localStorage; } catch (e0) { storage = null; } }
  var loaded = C.loadRec(storage), rec = loaded.rec, storageOk = loaded.usable && !!storage;
  var sel = rec.sel;
  function lvOf(kind) { return C.hasLv(kind) ? sel.lv : 0; }
  function updateNote() { var n = $("lg-storage-note"); n.textContent = T.msg.storageOff; n.hidden = storageOk; }
  function persist() { storageOk = !!storage && C.saveRec(storage, rec); updateNote(); }

  /* ---- 状態 ---- */
  var S = null, recent = [], figCache = {};

  /* ============ 回路図（SVG） ============ */
  function circuitData(c) {                                    // e2e が読む回路の定義（部品と接続．答えを含まない）
    return JSON.stringify({ inputs: c.inputs, gates: c.gates.map(function (g) { return { id: g.id, t: g.t, in: g.in }; }), outs: c.outs.map(function (o) { return { name: o.name, src: o.src, stage: o.stage !== false }; }), wires: c.wires.map(function (w) { return { ref: w.ref, name: w.name }; }) });
  }
  function drawCircuit(c, opt) {
    opt = opt || {};
    var tags = opt.tags !== false, lay = C.layoutCircuit(c, tags), svg = sv("svg", { viewBox: "0 0 " + lay.w + " " + lay.h, "class": "lg-svg", role: "img", "aria-label": C.describeCircuit(c), "data-circuit": circuitData(c), focusable: "false" }), i, g, hIdx = 0, CIRC = ["①", "②", "③"];
    svg.style.maxWidth = (lay.w * (opt.scale || 1)) + "px";
    svg.setAttribute("width", String(lay.w)); svg.setAttribute("height", String(lay.h));
    lay.segs.forEach(function (s) { svg.appendChild(sv("line", { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, "class": "lg-wire" })); });
    lay.dots.forEach(function (d) { svg.appendChild(sv("circle", { cx: d.x, cy: d.y, r: 2.5, "class": "lg-dot" })); });
    lay.trunks.forEach(function (t) { svg.appendChild(sv("text", { x: t.x, y: 12, "class": "lg-inname", "text-anchor": "middle" }, t.name)); });
    lay.nodes.forEach(function (nd) {
      var grp;
      if (nd.kind === "out") {
        grp = sv("g", { "class": "lg-term" });
        grp.appendChild(sv("rect", { x: nd.x, y: nd.y, width: nd.w, height: nd.h, rx: 3, "class": "lg-termbox" }));
        grp.appendChild(sv("text", { x: nd.x + nd.w / 2, y: nd.y + nd.h / 2 + 3.6, "class": "lg-gname", "text-anchor": "middle" }, nd.name));
        svg.appendChild(grp); return;
      }
      grp = sv("g", { "class": "lg-gate", "data-gate": nd.id });
      grp.appendChild(sv("path", { d: C.shapePath(nd), "class": "lg-shape" }));
      if (nd.t === "NOT") grp.appendChild(sv("circle", { cx: nd.x + nd.w - 3, cy: nd.y + nd.h / 2, r: 3, "class": "lg-shape" }));
      if (nd.t === "HA") {
        grp.appendChild(sv("text", { x: nd.x + nd.w / 2, y: nd.y + 26, "class": "lg-gname lg-small", "text-anchor": "middle" }, CIRC[hIdx++] + "半加算回路"));
        grp.appendChild(sv("text", { x: nd.x + nd.w - 4, y: nd.y + 14, "class": "lg-gname lg-tiny", "text-anchor": "end" }, "S"));
        grp.appendChild(sv("text", { x: nd.x + nd.w - 4, y: nd.y + 40, "class": "lg-gname lg-tiny", "text-anchor": "end" }, "C"));
      } else grp.appendChild(sv("text", { x: nd.x + (nd.t === "NOT" ? 16 : nd.t === "AND" ? 20 : 21), y: nd.y + nd.h / 2 + 3.6, "class": "lg-gname", "text-anchor": "middle" }, nd.t));
      svg.appendChild(grp);
    });
    lay.tags.forEach(function (t) {
      var grp = sv("g", { "class": "lg-tag", "data-wire": t.net });
      grp.appendChild(sv("rect", { x: t.x, y: t.y, width: t.w, height: t.h, rx: 2, "class": "lg-tagbox" }));
      grp.appendChild(sv("text", { x: t.x + t.w / 2, y: t.y + 9.3, "class": "lg-tagtext", "text-anchor": "middle" }, t.text));
      svg.appendChild(grp);
    });
    return svg;
  }
  function setHot(gateId) {
    var gs = $("lg-fig").querySelectorAll(".lg-gate"), i;
    for (i = 0; i < gs.length; i++) gs[i].classList.toggle("lg-hot", !!gateId && gs[i].getAttribute("data-gate") === gateId);
  }

  /* ============ 表 ============ */
  function stageMode(si) { return si < S.idx ? "locked" : si === S.idx ? "active" : "future"; }
  function nIn() { return S.p.kind === "choose" ? S.p.n : S.p.circuit.inputs.length; }
  function inNames() { return S.p.kind === "choose" ? S.p.circuits[0].inputs : S.p.circuit.inputs; }
  function rowsN() { return 1 << nIn(); }
  function colAt(si, ci) { return S.stages[si].cols[ci]; }

  function buildSheet() {
    var host = $("lg-sheet"), n = nIn(), R = rowsN(), names = inNames(), r, i, si, ci, nTap = 0, h, b, st, cl, tpl;
    host.innerHTML = ""; S.cells = [];
    if (S.p.kind === "choose") {
      tpl = "repeat(" + n + ", var(--lg-in)) var(--lg-cell)";
      host.style.gridTemplateColumns = tpl;
      names.forEach(function (nm) { host.appendChild(el("div", "lg-h lg-hin", nm)); });
      h = el("div", "lg-h lg-hout"); h.appendChild(el("b", "", "L")); host.appendChild(h);
      for (r = 0; r < R; r++) {
        for (i = 0; i < n; i++) host.appendChild(el("div", "lg-in", String(C.inputBit(n, i, r))));
        b = el("div", "lg-given" + (S.p.tbl.charAt(r) === "1" ? " lg-one" : ""), S.p.tbl.charAt(r)); host.appendChild(b);
      }
      return;
    }
    for (si = 0; si < S.stages.length; si++) nTap += S.stages[si].cols.length;
    host.style.gridTemplateColumns = "repeat(" + n + ", var(--lg-in)) repeat(" + nTap + ", var(--lg-cell))";
    names.forEach(function (nm) { host.appendChild(el("div", "lg-h lg-hin", nm)); });
    for (si = 0; si < S.stages.length; si++) for (ci = 0; ci < S.stages[si].cols.length; ci++) {
      cl = S.stages[si].cols[ci]; h = el("div", "lg-h lg-htap"); h.setAttribute("data-si", String(si)); h.setAttribute("data-c", String(ci));
      h.appendChild(el("b", "", cl.headName || cl.name)); h.appendChild(el("span", "lg-sub", cl.sub)); host.appendChild(h);
    }
    S.cells = S.stages.map(function (s2) { return s2.cols.map(function () { return []; }); });
    for (r = 0; r < R; r++) {
      for (i = 0; i < n; i++) host.appendChild(el("div", "lg-in", String(C.inputBit(n, i, r))));
      for (si = 0; si < S.stages.length; si++) for (ci = 0; ci < S.stages[si].cols.length; ci++) {
        b = el("button", "lg-cell"); b.type = "button"; b.setAttribute("data-si", String(si)); b.setAttribute("data-c", String(ci)); b.setAttribute("data-r", String(r));
        host.appendChild(b); S.cells[si][ci][r] = b;
      }
    }
  }
  function buildOpts() {
    var host = $("lg-opts"), st = S.stages[0];
    host.innerHTML = ""; S.optEls = [];
    if (S.p.kind !== "choose") return;
    st.options.forEach(function (o, i) {
      var b = el("button", "lg-opt"), head = el("span", "lg-opthead"), fig;
      b.type = "button"; b.setAttribute("data-i", String(i)); b.setAttribute("data-label", o.label); b.setAttribute("aria-pressed", "false");
      head.appendChild(el("b", "lg-optlabel", o.label)); head.appendChild(el("span", "lg-optstate", ""));
      b.appendChild(head);
      fig = drawCircuit(o.circuit, { tags: false, scale: 1.2 }); fig.classList.add("lg-optsvg"); b.appendChild(fig);
      b.appendChild(el("span", "lg-optout", ""));
      host.appendChild(b); S.optEls.push(b);
    });
  }
  function drawFigure() {
    var host = $("lg-fig");
    host.innerHTML = "";
    if (S.p.kind === "choose") { host.hidden = true; return; }
    host.hidden = false;
    host.appendChild(drawCircuit(S.p.circuit, { tags: S.p.kind !== "basic", scale: 1.35 }));
  }

  /* ---- 作業用紙の見た目を現在の状態に合わせる ---- */
  function bad(c, r) { return !!S.bad[c + "," + r]; }
  function refresh() {
    var si, ci, r, st, mode, cl, b, v, rev, fix;
    if (S.p.kind === "choose") {
      st = S.stages[0]; mode = S.idx >= 1 ? "locked" : "active";
      S.optEls.forEach(function (b2, i) {
        var o = st.options[i], chosen = !!(mode === "locked" ? S.finalSel[i] : S.vals[i]), on;
        rev = mode === "locked" && S.view[0] === "rev";
        on = rev ? o.correct : chosen;                                                   // 値を見せたとき：正しい回路を示す（選んでいない回路に「選択中」は付けない）
        b2.setAttribute("aria-pressed", chosen ? "true" : "false");
        b2.className = "lg-opt" + (on ? " lg-on" : "") + (mode === "locked" ? " lg-locked" : "") + (rev ? " lg-rev" : "") + (mode === "active" && S.bad[i] ? " lg-bad" : "") + (rev && S.fixes[0] && S.fixes[0].indexOf(i) >= 0 ? " lg-fix" : "");
        b2.disabled = mode === "locked";
        b2.querySelector(".lg-optstate").textContent = rev ? (o.correct ? U.correctOpt : (chosen ? U.chosenOpt : "")) : (chosen ? U.selected : "");
        b2.querySelector(".lg-optout").textContent = mode === "locked" ? "出力 L：" + o.table : "";
        b2.setAttribute("aria-label", U.pickAria + " " + o.label + "　" + (chosen ? U.selected : U.notSelected) + (rev && o.correct ? "．" + U.correctOpt : ""));
      });
      return;
    }
    for (si = 0; si < S.stages.length; si++) {
      st = S.stages[si]; mode = stageMode(si); rev = mode === "locked" && S.view[si] === "rev";
      for (ci = 0; ci < st.cols.length; ci++) {
        cl = st.cols[ci];
        for (r = 0; r < st.rows; r++) {
          b = S.cells[si][ci][r];
          v = mode === "locked" ? cl.model[r] : mode === "active" ? S.vals[ci][r] : "";
          fix = rev && (S.fixes[si] || []).some(function (w) { return w.c === ci && w.r === r; });
          b.className = "lg-cell lg-" + mode + (v === "1" ? " lg-one" : "") + (rev ? " lg-rev" : "") + (fix ? " lg-fix" : "") + (mode === "active" && bad(ci, r) ? " lg-bad" : "");
          b.textContent = v; b.disabled = mode !== "active";
          b.setAttribute("aria-label", C.cellLabel(cl.name, r + 1, C.rowName(S.p.circuit, r), v));
          b.setAttribute("tabindex", mode === "active" && ci === S.focus.c && r === S.focus.r ? "0" : "-1");
        }
      }
    }
    if (S.idx < S.stages.length) { cl = S.stages[S.idx].cols[S.focus.c]; setHot(cl && cl.gateId); } else setHot(null);
  }

  /* ---- 画面の各部分 ---- */
  function renderPlayControls() {
    var k = $("lg-kinds"), b = $("lg-lvsw");
    if (!k.firstChild) {
      C.KINDS.forEach(function (kind) {
        var bt = el("button", "lg-kbtn", T.kind[kind]); bt.type = "button"; bt.setAttribute("data-kind", kind);
        bt.addEventListener("click", function () { choose(kind, sel.lv); });
        k.appendChild(bt);
      });
      C.LEVELS.forEach(function (lv) {
        var bt = el("button", "lg-lbtn"); bt.type = "button"; bt.setAttribute("data-lv", String(lv));
        bt.addEventListener("click", function () { choose(sel.kind, lv); });
        b.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(k.children, function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-kind") === sel.kind ? "true" : "false"); });
    Array.prototype.forEach.call(b.children, function (bt) {
      var lv = parseInt(bt.getAttribute("data-lv"), 10);
      bt.textContent = lvLabel(sel.kind, lv);
      bt.setAttribute("aria-pressed", String(lv) === String(sel.lv) ? "true" : "false");
    });
    b.hidden = !C.hasLv(sel.kind);
  }
  function renderSubmenu() {
    var d = $("lg-diff"), ticks = document.querySelectorAll(".lg-ticks");
    if (!d.firstChild) {
      C.LEVELS.forEach(function (lv) {
        var bt = el("button", "lg-diff-btn"); bt.type = "button";               // 既存の .modal-diff-tab-btn（app.js が掴む）は使わない
        bt.setAttribute("data-lv", String(lv)); bt.setAttribute("data-level", LEVEL_ID[lv]);
        bt.appendChild(document.createTextNode(T.level[lv])); bt.appendChild(document.createElement("br"));
        bt.appendChild(el("span", "lg-diffsub", T.levelSub[lv]));
        bt.addEventListener("click", function () { sel.lv = lv; persist(); renderSubmenu(); });
        d.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(d.children, function (bt) {
      var on = bt.getAttribute("data-lv") === String(sel.lv);
      bt.classList.toggle("lg-sel", on); bt.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(ticks, function (host) {
      var kind = host.getAttribute("data-kind"), done, it, lvs = C.hasLv(kind) ? C.LEVELS : [0];
      host.innerHTML = "";
      lvs.forEach(function (lv) {
        done = C.tickOf(rec, kind, lv); it = el("span", "lg-tick" + (done ? " lg-done" : ""));
        if (lv) it.appendChild(document.createTextNode(T.level[lv] + " "));
        it.appendChild(el("span", "lg-mk", done ? "✓" : "—"));
        it.setAttribute("aria-label", (lv ? lvLabel(kind, lv) + "：" : "") + (done ? U.cleared : U.notYet));
        host.appendChild(it);
      });
    });
  }
  function renderStreak() {
    var host = $("lg-streak"), c = rec.rec[C.comboKey(sel.kind, lvOf(sel.kind))], need = C.CLEAR_STREAK, i, d;
    host.innerHTML = "";
    host.appendChild(document.createTextNode(U.streak + " "));
    for (i = 0; i < need; i++) { d = el("span", "lg-dot-s" + (i < Math.min(c.streak, need) ? " lg-on" : "")); d.setAttribute("aria-hidden", "true"); host.appendChild(d); }
    host.appendChild(el("span", "lg-sr", Math.min(c.streak, need) + "／" + need));
    if (c.cleared) host.appendChild(el("span", "lg-clearmark", "✓"));
    host.title = U.streakNote;
  }
  function chipState(i) {
    var s = S.sst[i];
    if (s.result === "ok1") return "ok";
    if (s.attempts >= 1) return "ng";
    return "yet";
  }
  function renderSide() {
    var chips = $("lg-chips"), i, st, cs, li;
    $("lg-qtitle").textContent = S.p.kind === "choose" ? U.chooseTitle : U.ques[S.p.kind];
    $("lg-ask").textContent = S.p.kind === "choose" ? U.chooseTitleAbove : "";                 // 狭い幅では題を表の上に出す（CSS で切り替える）
    $("lg-qkind").textContent = T.kind[S.p.kind] + (C.hasLv(S.p.kind) ? "　" + lvLabel(S.p.kind, S.p.lv) : "");
    $("lg-usage").textContent = S.p.kind === "choose" ? U.usageChoose : U.usage;
    renderStreak();
    if (S.idx < S.stages.length) {
      st = S.stages[S.idx];
      $("lg-stagehead").innerHTML = "";
      if (S.stages.length > 1) { $("lg-stagehead").appendChild(document.createTextNode(U.stage + " " + (S.idx + 1) + "／" + S.stages.length + "　")); $("lg-stagehead").appendChild(el("b", "", st.name)); }
      $("lg-instr").textContent = st.instr;
    } else {
      $("lg-stagehead").textContent = S.stages.length > 1 ? U.stageEnd : "";
      $("lg-instr").textContent = "";
    }
    chips.innerHTML = "";
    for (i = 0; i < S.stages.length; i++) {
      cs = chipState(i);
      li = el("li", "lg-chip lg-" + cs + (i === S.idx ? " lg-cur" : ""));
      li.appendChild(el("span", "lg-mk", cs === "ok" ? "✓" : cs === "ng" ? "×" : "—"));
      li.appendChild(document.createTextNode(S.stages[i].name));
      li.setAttribute("aria-label", S.stages[i].name + "：" + (cs === "ok" ? U.chipOk : cs === "ng" ? U.chipNg : i === S.idx ? U.chipNow : U.chipYet));
      if (i === S.idx) li.setAttribute("aria-current", "step");
      chips.appendChild(li);
    }
    $("lg-check").textContent = S.done ? U.next : U.check;
    $("lg-enterhint").textContent = S.done ? U.hintNext : U.hintCheck;
    renderHalf();
  }
  function renderHalf() {                                          // 全加算回路：半加算回路の表（参照用）
    var d = $("lg-half"), body = $("lg-half-body"), v, r, tbl, tr, th;
    d.hidden = !(S.p.kind === "adder" && S.p.lv === 2);
    if (d.hidden || body.firstChild) return;
    $("lg-half-sum").textContent = U.halfTable;
    body.appendChild(el("p", "lg-note", U.halfTableNote));
    tbl = el("table", "lg-mini"); tr = el("tr");
    ["A", "B", "C", "S"].forEach(function (h) { th = el("th", "", h); th.setAttribute("scope", "col"); tr.appendChild(th); });
    tbl.appendChild(el("thead")); tbl.firstChild.appendChild(tr);
    v = ["0001".split(""), "0110".split("")];
    var tb = el("tbody");
    for (r = 0; r < 4; r++) { tr = el("tr"); [r >> 1, r & 1, v[0][r], v[1][r]].forEach(function (x) { tr.appendChild(el("td", "", String(x))); }); tb.appendChild(tr); }
    tbl.appendChild(tb); body.appendChild(tbl);
  }

  function freshStage() {
    var st = S.stages[S.idx];
    S.vals = C.emptyVals(st); S.focus = { c: 0, r: 0 }; S.bad = {};
  }
  function newProblem(forced) {                                 // forced：自己検査・e2e が決まった問題を出すとき
    var p = forced || C.gen(sel.kind, lvOf(sel.kind), recent), stages;
    if (!forced) { recent.push(p.avoid); if (recent.length > C.AVOID) recent.shift(); }
    stages = C.stagesOf(p);
    S = { p: p, stages: stages, idx: 0, sst: stages.map(function () { return C.newStageState(); }), results: [], view: [], fixes: [], done: false, doneAt: 0, cells: [], optEls: [], vals: [], focus: { c: 0, r: 0 }, bad: {}, finalSel: [] };
    C.recStart(rec, sel.kind, lvOf(sel.kind)); persist();
    freshStage();
    drawFigure(); buildSheet(); buildOpts();
    $("lg-panel").classList.toggle("lg-p-wide3", nIn() >= 3 && p.kind !== "choose");
    $("lg-panel").setAttribute("data-kind", p.kind);
    refresh(); renderSide(); renderMine();
    clearFeedback(); $("lg-extra").textContent = ""; $("lg-cellmsg").textContent = "";
    if (!SELFTEST && p.kind !== "choose") focusCell(S.focus.c, S.focus.r, true);
  }
  function focusCell(c, r, noScroll) {
    var b = S.cells[S.idx] && S.cells[S.idx][c] && S.cells[S.idx][c][r];
    if (!b || b.disabled) return;
    try { b.focus({ preventScroll: !!noScroll }); } catch (er) { b.focus(); }
  }

  /* ---- 結果欄 ---- */
  function clearFeedback() { var f = $("lg-feedback"); f.className = "lg-feedback"; f.innerHTML = ""; }
  function showFeedback(kind, head, detail, hint) {
    var f = $("lg-feedback");
    f.className = "lg-feedback lg-" + kind; f.innerHTML = "";
    f.appendChild(el("p", "lg-fh", head));
    if (detail) f.appendChild(el("p", "lg-fd", detail));
    if (hint) f.appendChild(el("p", "lg-fhint", hint));
    revealFeedback();
  }
  function revealFeedback() {                                  // 縦にスクロールする画面（狭い幅）で，結果欄が窓の外なら窓に入れる．スクロールのない画面では動かさない
    var r;
    if (document.documentElement.scrollHeight <= window.innerHeight + 1) return;
    r = $("lg-feedback").getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) { try { $("lg-feedback").scrollIntoView({ block: "nearest" }); } catch (e) { } }
  }

  /* ---- 入力の受け取り ---- */
  function applyEdit(ev) {
    var r, j, k, before;
    if (!S || S.done || S.p.kind === "choose") return;
    before = S.vals;
    r = C.cellEdit({ vals: S.vals, focus: S.focus }, ev);
    for (j = 0; j < before.length; j++) for (k = 0; k < before[j].length; k++) if (before[j][k] !== r.vals[j][k]) delete S.bad[j + "," + k];
    S.vals = r.vals; S.focus = r.focus;
    $("lg-cellmsg").textContent = r.rejected ? r.msg : "";
    refresh(); focusCell(S.focus.c, S.focus.r);
    if (r.submit) check();
  }
  function cellOf(t) { var b = t && t.closest ? t.closest(".lg-cell") : null; return b && !b.disabled ? b : null; }
  function wireSheet() {
    var g = $("lg-sheet");
    g.addEventListener("click", function (ev) {
      var b = cellOf(ev.target);
      if (!b || !S || S.done) return;
      applyEdit({ type: "tap", c: parseInt(b.getAttribute("data-c"), 10), r: parseInt(b.getAttribute("data-r"), 10) });
    });
    g.addEventListener("keydown", function (ev) {
      var b = cellOf(ev.target);
      if (!b || !S || S.done) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "Tab" || ev.key === " " || ev.key === "Spacebar") return;                // Tab は表全体で 1 つの停止位置．Space はボタンの標準の動き（タップ）
      ev.preventDefault();
      if (ev.repeat && ev.key === "Enter") return;
      if (ev.key === "Enter" || ev.key === "Backspace" || ev.key === "Delete" || ev.key.indexOf("Arrow") === 0 || ev.key.length >= 1) {
        S.focus = { c: parseInt(b.getAttribute("data-c"), 10), r: parseInt(b.getAttribute("data-r"), 10) };
        applyEdit({ type: "key", key: ev.key, code: ev.code });
      }
    });
    g.addEventListener("focusin", function (ev) {
      var b = cellOf(ev.target);
      if (!b || !S) return;
      S.focus = { c: parseInt(b.getAttribute("data-c"), 10), r: parseInt(b.getAttribute("data-r"), 10) };
      refresh();
    });
    ["paste", "cut", "drop"].forEach(function (name) { g.addEventListener(name, function (ev) { ev.preventDefault(); }); });
    $("lg-opts").addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".lg-opt") : null, i;
      if (!b || b.disabled || !S || S.done || S.p.kind !== "choose") return;
      i = parseInt(b.getAttribute("data-i"), 10);
      S.vals[i] = !S.vals[i]; delete S.bad[i]; $("lg-cellmsg").textContent = "";
      refresh();
    });
  }

  /* ---- 答え合わせ・段の進行 ---- */
  function check() {
    var st, o;
    if (!S) return;
    if (S.done) { goNext(); return; }
    st = S.stages[S.idx];
    o = C.attempt(S.p, st, S.sst[S.idx], S.vals);
    $("lg-cellmsg").textContent = "";
    if (!o.counted) {                                                         // 空のマスがある：試行に数えない．Enter も「答え合わせ」ボタンも同じ（先頭の空きへ）
      showFeedback("retry", o.head);
      if (st.type !== "pick") { S.focus = C.firstEmptyCell(S.vals); refresh(); focusCell(S.focus.c, S.focus.r); }
      return;
    }
    S.sst[S.idx] = o.st;
    if (o.final) { settle(st, o); return; }
    S.bad = {};
    if (st.type === "pick") { if (o.over.length) S.bad[o.over[0]] = true; }
    else o.wrongCells.forEach(function (w) { S.bad[w.c + "," + w.r] = true; });
    refresh(); renderSide();
    showFeedback("ng", o.head, o.detail, o.hint);
    if (st.type !== "pick" && o.wrongCells.length) { S.focus = { c: o.wrongCells[0].c, r: o.wrongCells[0].r }; refresh(); focusCell(S.focus.c, S.focus.r); }
  }
  function settle(st, o) {                                                     // 段が決まった（正解・値を見せた）
    var last = S.idx === S.stages.length - 1, head = o.head, detail = o.detail, kind, sum, col, wasCleared, key = C.comboKey(sel.kind, lvOf(sel.kind));
    S.results.push(o.result); S.view[S.idx] = o.reveal ? "rev" : "ok";
    S.fixes[S.idx] = o.reveal ? (st.type === "pick" ? o.over : o.wrongCells) : [];
    if (st.type === "pick") S.finalSel = S.vals.slice();
    S.bad = {};
    if (o.reveal && last && st.type !== "pick") head = U.revLast;
    kind = o.reveal ? "retry" : "ok";
    S.idx++;
    if (!last) {
      freshStage(); refresh(); renderSide();
      showFeedback(kind, head, detail, o.hint);
      focusCell(S.focus.c, S.focus.r);
      return;
    }
    S.done = true; S.doneAt = Date.now();
    col = C.collapse(S.stages, S.results); sum = C.problemSummary(col.ids, col.results);
    wasCleared = rec.rec[key].cleared;
    C.recFinish(rec, sel.kind, lvOf(sel.kind), S.stages, S.results); persist();
    refresh(); renderSide(); renderMine();
    showFeedback(sum.perfect ? "clear" : kind, head, detail ? detail + "　" + C.summaryText(sum) : C.summaryText(sum), o.hint);
    if (!wasCleared && rec.rec[key].cleared) $("lg-feedback").appendChild(el("p", "lg-fd", U.justCleared));
    try { $("lg-check").focus({ preventScroll: true }); } catch (e) { $("lg-check").focus(); }
  }
  function goNext() {
    if (!S || !S.done) return;
    if (Date.now() - S.doneAt < 400) return;                                   // Enter 連打で飛ばさない
    newProblem();
  }

  /* ---- 記録の画面 ---- */
  function renderMine() {
    var body = $("lg-mine-body"), kind = sel.kind, lv = lvOf(kind), c = rec.rec[C.comboKey(kind, lv)], need = C.CLEAR_STREAK, weak = C.weakestStage(c, kind);
    var tbl, thead, tr, head, tbody;
    body.innerHTML = "";
    body.appendChild(el("p", "", T.kind[kind] + (lv ? "・" + lvLabel(kind, lv) : "") + "　" + U.mineTried + " " + c.tried + " 問，" + U.mineFirst + " " + c.perfect + " 問，" + U.streak + " " + Math.min(c.streak, need) + "／" + need));
    if (c.tried === 0) body.appendChild(el("p", "lg-note", U.mineNone));
    tbl = el("table"); thead = el("thead"); tr = el("tr");
    U.mineHead.forEach(function (h, i) { head = el("th", i ? "lg-num" : "", h); head.setAttribute("scope", "col"); tr.appendChild(head); });
    thead.appendChild(tr); tbl.appendChild(thead); tbody = el("tbody");
    C.STAGE_IDS[kind].forEach(function (id) {
      var st = c.stage[id], r = el("tr"), nameTd = el("td", "");
      nameTd.appendChild(document.createTextNode(U.stageName[id]));
      if (id === weak) { nameTd.appendChild(document.createTextNode(" ")); nameTd.appendChild(el("span", "lg-weak", U.weak)); }
      r.appendChild(nameTd);
      r.appendChild(el("td", "lg-num", String(st.n))); r.appendChild(el("td", "lg-num", String(st.miss1)));
      r.appendChild(el("td", "lg-num", st.n ? Math.floor((st.miss1 * 200 + st.n) / (st.n * 2)) + "%" : "—"));
      tbody.appendChild(r);
    });
    tbl.appendChild(tbody); body.appendChild(tbl);
    body.appendChild(el("p", "lg-note", U.mineNote));
  }

  function choose(kind, lv) {
    var newLv = C.hasLv(kind) ? lv : sel.lv;
    if (kind === sel.kind && newLv === sel.lv && S) return;
    if (S && !S.done) C.recAbandon(rec, sel.kind, lvOf(sel.kind));   // 解き終わらずに離れた：連続は 0
    sel.kind = kind; sel.lv = newLv; recent = [];
    renderPlayControls(); newProblem();
  }
  function enterPlay(kind) {
    sel.kind = kind; recent = [];
    show("lg-play-screen");
    renderPlayControls(); newProblem();
  }
  function leavePlay() {                                       // 練習からサブメニューへ（解き終わらずに離れたら連続は 0）
    if (S && !S.done) C.recAbandon(rec, sel.kind, lvOf(sel.kind));
    S = null; recent = []; persist();
    renderSubmenu(); show("lg-submenu-screen");
  }

  /* ---- 別のタブで記録が変わった（消された）とき：読み直す．古い回数を書き戻さない ---- */
  function onStorage(ev) {
    var kind = sel.kind, lv = sel.lv, fresh;
    if (SELFTEST || !storage || ev.storageArea !== storage) return;
    if (ev.key !== null && ev.key !== C.STORAGE_KEY) return;
    fresh = C.loadRec(storage); rec = fresh.rec; storageOk = fresh.usable; sel = rec.sel; sel.kind = kind; sel.lv = lv;     // 選んでいる種類・難易度はこのタブのまま
    if (S && !S.done) C.recStart(rec, kind, lvOf(kind));
    renderSubmenu(); renderMine(); updateNote();
    if (S) renderStreak();
  }

  /* ---- 記録を消す（画面内の確認．最初のフォーカスは「やめる」） ---- */
  function openReset() { $("lg-reset-confirm").hidden = false; $("lg-reset-no").focus(); }
  function closeReset(back) { $("lg-reset-confirm").hidden = true; if (back) $("lg-reset-btn").focus(); }
  function doReset() {
    var kind = sel.kind, lv = sel.lv;                         // 消しても，いま選んでいる種類・難易度は保つ
    if (storage) C.clearRec(storage);
    rec = C.newRec(); sel = rec.sel; sel.kind = kind; sel.lv = lv; recent = []; S = null;
    closeReset(false);
    renderPlayControls(); renderSubmenu(); newProblem();
  }

  /* ============ 解説 ============ */
  var learnIdx = 0, LEARN_TRACE = { A: 1, B: 0 };
  function gateNode(t, x, y) { return { t: t, x: x, y: y, w: { AND: 44, OR: 44, NOT: 48 }[t], h: { AND: 36, OR: 36, NOT: 34 }[t] }; }
  function drawGate(svg, t, x, y) {
    var nd = gateNode(t, x, y), g = sv("g", { "class": "lg-gate" });
    g.appendChild(sv("path", { d: C.shapePath(nd), "class": "lg-shape" }));
    if (t === "NOT") g.appendChild(sv("circle", { cx: x + nd.w - 3, cy: y + nd.h / 2, r: 3, "class": "lg-shape" }));
    g.appendChild(sv("text", { x: x + (t === "NOT" ? 16 : t === "AND" ? 20 : 21), y: y + nd.h / 2 + 3.6, "class": "lg-gname", "text-anchor": "middle" }, t));
    svg.appendChild(g); return nd;
  }
  function visGates3() {
    var svg = sv("svg", { viewBox: "0 0 360 70", "class": "lg-svg lg-vsvg", role: "img", "aria-label": "三つの図記号：AND，OR，NOT" }), xs = [10, 130, 250], ts = ["AND", "OR", "NOT"], nm = ["論理積回路", "論理和回路", "否定回路"];
    ts.forEach(function (t, i) {
      var nd = drawGate(svg, t, xs[i], 8), two = t !== "NOT";
      if (two) { svg.appendChild(sv("line", { x1: xs[i] - 8, y1: 17, x2: xs[i], y2: 17, "class": "lg-wire" })); svg.appendChild(sv("line", { x1: xs[i] - 8, y1: 35, x2: xs[i], y2: 35, "class": "lg-wire" })); }
      else svg.appendChild(sv("line", { x1: xs[i] - 8, y1: 25, x2: xs[i], y2: 25, "class": "lg-wire" }));
      svg.appendChild(sv("line", { x1: xs[i] + nd.w, y1: 8 + nd.h / 2, x2: xs[i] + nd.w + 12, y2: 8 + nd.h / 2, "class": "lg-wire" }));
      svg.appendChild(sv("text", { x: xs[i] + 24, y: 62, "class": "lg-vcap", "text-anchor": "middle" }, nm[i]));
    });
    svg.style.maxWidth = "520px";
    return svg;
  }
  function switchSym(svg, x, y, open) {                                        // 横向きのスイッチ（教科書の図の描き直し．写真は使わない）
    svg.appendChild(sv("circle", { cx: x, cy: y, r: 2.5, "class": "lg-dot" })); svg.appendChild(sv("circle", { cx: x + 20, cy: y, r: 2.5, "class": "lg-dot" }));
    svg.appendChild(sv("line", { x1: x, y1: y, x2: x + 18, y2: open ? y - 9 : y - 1, "class": "lg-wire" }));
  }
  function visSwitches() {
    var svg = sv("svg", { viewBox: "0 0 360 132", "class": "lg-svg lg-vsvg", role: "img", "aria-label": "スイッチの図：AND は直列，OR は並列，NOT は反転" }), bulb = function (x, y) { svg.appendChild(sv("circle", { cx: x, cy: y, r: 9, "class": "lg-shape" })); svg.appendChild(sv("path", { d: "M" + (x - 6) + "," + (y - 6) + " L" + (x + 6) + "," + (y + 6) + " M" + (x + 6) + "," + (y - 6) + " L" + (x - 6) + "," + (y + 6), "class": "lg-wire" })); };
    function ln(a, b, c, d) { svg.appendChild(sv("line", { x1: a, y1: b, x2: c, y2: d, "class": "lg-wire" })); }
    function cap(x, y, s) { svg.appendChild(sv("text", { x: x, y: y, "class": "lg-vcap", "text-anchor": "middle" }, s)); }
    // AND：直列
    ln(6, 40, 20, 40); switchSym(svg, 20, 40, true); ln(40, 40, 52, 40); switchSym(svg, 52, 40, true); ln(72, 40, 90, 40); bulb(99, 40); ln(108, 40, 112, 40); ln(112, 40, 112, 70); ln(112, 70, 6, 70); ln(6, 70, 6, 40);
    cap(31, 28, "A"); cap(63, 28, "B"); cap(59, 94, "AND＝直列"); cap(59, 108, "ともに入っている"); cap(59, 122, "ときだけ点く");
    // OR：並列
    ln(130, 40, 142, 40); ln(142, 25, 142, 55); ln(142, 25, 150, 25); switchSym(svg, 150, 25, true); ln(170, 25, 184, 25); ln(142, 55, 150, 55); switchSym(svg, 150, 55, true); ln(170, 55, 184, 55); ln(184, 25, 184, 55); ln(184, 40, 196, 40); bulb(205, 40); ln(214, 40, 220, 40); ln(220, 40, 220, 75); ln(220, 75, 130, 75); ln(130, 75, 130, 40);
    cap(160, 14, "A"); cap(160, 70, "B"); cap(175, 94, "OR＝並列"); cap(175, 108, "入力の少なくとも一方が"); cap(175, 122, "入っていれば点く");
    // NOT：反転（電球と並列のスイッチ）
    ln(250, 40, 262, 40); ln(262, 40, 262, 40); ln(262, 40, 290, 40); bulb(299, 40); ln(308, 40, 336, 40); ln(336, 40, 336, 75); ln(336, 75, 250, 75); ln(250, 75, 250, 40);
    ln(290, 40, 290, 24); ln(290, 24, 300, 24); ln(308, 40, 308, 24); ln(308, 24, 300, 24);
    cap(294, 14, "A"); cap(293, 94, "NOT＝反転"); cap(293, 108, "入ると消え，"); cap(293, 122, "切れると点く");
    svg.style.maxWidth = "520px";
    return svg;
  }
  function miniTable(headers, rows, hl, hlRow) {                                      // hl：強調する列の番号
    var tbl = el("table", "lg-mini"), thead = el("thead"), tr = el("tr"), tb = el("tbody");
    headers.forEach(function (h, i) { var th = el("th", hl && hl.indexOf(i) >= 0 ? "lg-hl" : "", h); th.setAttribute("scope", "col"); tr.appendChild(th); });
    thead.appendChild(tr); tbl.appendChild(thead);
    rows.forEach(function (row, ri) { var r = el("tr"); row.forEach(function (x, i) { r.appendChild(el("td", (hl && hl.indexOf(i) >= 0) || ri === hlRow ? "lg-hl" : "", String(x))); }); tb.appendChild(r); });
    tbl.appendChild(tb); return tbl;
  }
  function gateFig(t) {                                                       // 解説 1 と同じ図記号（部品の中に名前）
    var svg = sv("svg", { viewBox: "0 0 84 46", "class": "lg-svg lg-vsvg lg-gfig", role: "img", "aria-label": t + " の図記号" }), nd = drawGate(svg, t, 14, 5), two = t !== "NOT";
    if (two) { svg.appendChild(sv("line", { x1: 4, y1: 14, x2: 14, y2: 14, "class": "lg-wire" })); svg.appendChild(sv("line", { x1: 4, y1: 32, x2: 14, y2: 32, "class": "lg-wire" })); }
    else svg.appendChild(sv("line", { x1: 4, y1: 22, x2: 14, y2: 22, "class": "lg-wire" }));
    svg.appendChild(sv("line", { x1: 14 + nd.w, y1: 5 + nd.h / 2, x2: 14 + nd.w + 8, y2: 5 + nd.h / 2, "class": "lg-wire" }));
    svg.style.maxWidth = "110px";
    return svg;
  }
  function visTable3() {
    var box = el("div", "lg-vtables"), rows = function (t) { return [0, 1, 2, 3].map(function (r) { return [r >> 1, r & 1, t.charAt(r)]; }); };
    [["AND", ["A", "B", "L"], rows("0001")], ["OR", ["A", "B", "L"], rows("0111")], ["NOT", ["A", "L"], [[0, 1], [1, 0]]]].forEach(function (d) {
      var w = el("div", "lg-vt");
      w.appendChild(gateFig(d[0])); w.appendChild(el("b", "", { AND: "論理積回路", OR: "論理和回路", NOT: "否定回路" }[d[0]])); w.appendChild(miniTable(d[1], d[2], [d[1].length - 1]));
      box.appendChild(w);
    });
    return box;
  }
  function visTrace() {
    var c = C.CIRC.p05, wrap = el("div", "lg-vtrace"), fig = drawCircuit(c, { tags: true, scale: 1.8 }), lay = C.layoutCircuit(c, true), v = {}, r = 2, k = 0;
    var vals = { g1: 0, g2: 1, g3: 1 };                       // A＝1，B＝0 の行（表の 3 行目）の値．selfTest が評価器と照合する
    wrap.appendChild(fig);
    lay.tags.forEach(function (t) {
      var b = sv("text", { x: t.x + t.w + 3, y: t.y + 9.3, "class": "lg-val lg-fade", style: "animation-delay:" + (0.4 + k * 0.7) + "s" }, "＝" + vals[t.net]); k++;
      fig.appendChild(b);
    });
    wrap.appendChild(el("p", "lg-vnote", "入力：A＝" + LEARN_TRACE.A + "，B＝" + LEARN_TRACE.B + "（表の 3 行目）"));
    lay.nodes.filter(function (nd) { return nd.kind === "out"; }).forEach(function (nd) { fig.appendChild(sv("text", { x: nd.x + nd.w / 2, y: nd.y - 3, "class": "lg-val lg-fade", style: "animation-delay:" + (0.4 + k * 0.7) + "s", "text-anchor": "middle" }, "＝" + vals.g3)); });
    return wrap;
  }
  function tableFromEval(cid, cols, hl, hlRow) {                                       // cols：[見出し, 参照]
    var c = C.CIRC[cid], n = c.inputs.length, R = 1 << n, rows = [], r, i, v = LogicCoreEval(c);
    for (r = 0; r < R; r++) { rows.push(c.inputs.map(function (nm, i2) { return C.inputBit(n, i2, r); }).concat(cols.map(function (cc) { return v[cc[1]][r]; }))); }
    return miniTable(c.inputs.concat(cols.map(function (cc) { return cc[0]; })), rows, hl, hlRow);
  }
  function wn(cid, ref) { return C.CIRC[cid].wireName[ref]; }                               // 途中の線の名前（図の上下の位置で決まる）
  function LogicCoreEval(c) { return C.evalOf(c); }
  function visHalf() {
    var box = el("div", "lg-vhalf"), fig = drawCircuit(C.CIRC.ad1, { tags: true, scale: 1.8 });
    box.appendChild(fig);
    box.appendChild(tableFromEval("ad1", [[wn("ad1", "g1") + "＝C", "g1"], [wn("ad1", "g2"), "g2"], [wn("ad1", "g3"), "g3"], ["S", "g4"]], [2, 5], 3));
    return box;
  }
  function visFull() {
    var box = el("div", "lg-vhalf"), fig = drawCircuit(C.CIRC.ad2, { tags: true, scale: 1.8 });
    box.appendChild(fig);
    box.appendChild(tableFromEval("ad2", [[wn("ad2", "h1.S"), "h1.S"], [wn("ad2", "h1.C"), "h1.C"], [wn("ad2", "h2.C"), "h2.C"], ["S", "h2.S"], ["Co", "o1"]], [6, 7]));
    return box;
  }
  function visual(spec) {
    if (!spec) return null;
    return { gates3: visGates3, switches: visSwitches, table3: visTable3, trace: visTrace, half: visHalf, full: visFull }[spec.type]();
  }
  function renderLearn() {
    var L = T.learn, step = L.steps[learnIdx], card = $("lg-tutorial-card"), body = el("div", "tutorial-content"), txt = el("div", "tutorial-text"), vis, v, i, dots = $("lg-step-indicators"), h = el("h3", "lg-learn-h");
    card.innerHTML = "";
    richText(h, step.title); txt.appendChild(h);
    step.text.forEach(function (t) { var p = el("p", "lg-learn-p"); richText(p, t); txt.appendChild(p); });
    body.appendChild(txt);
    v = visual(step.visual);
    if (v) { vis = el("div", "tutorial-visual lg-tvis"); vis.appendChild(v); body.appendChild(vis); }
    card.appendChild(body);
    $("lg-learn-prev").disabled = learnIdx === 0;
    $("lg-learn-next").textContent = learnIdx === L.steps.length - 1 ? L.done : L.next;
    dots.innerHTML = "";
    for (i = 0; i < L.steps.length; i++) dots.appendChild(el("div", "step-dot" + (i === learnIdx ? " active" : "")));
  }
  function openLearn() { learnIdx = 0; show("lg-learn-screen"); renderLearn(); }
  function learnMove(d) {
    var n = T.learn.steps.length;
    if (d > 0 && learnIdx === n - 1) { renderSubmenu(); show("lg-submenu-screen"); return; }
    learnIdx = Math.max(0, Math.min(n - 1, learnIdx + d)); renderLearn();
  }

  /* ============ 起動・直リンク ============ */
  function isActive(id) { var e = $(id); return !!(e && e.classList.contains("active")); }
  var HASH = { "#logic": "sub", "#logic-basic": "basic", "#logic-combine": "combine", "#logic-choose": "choose", "#logic-adder": "adder" };
  function routeHash(h) {                                                      // 直リンク．答えが出る指定は入れない（種類までで，問題は毎回ランダム）
    var t = HASH[h];
    if (!t) return false;
    if (S && !S.done) C.recAbandon(rec, sel.kind, lvOf(sel.kind));
    if (t === "sub") { S = null; renderSubmenu(); show("lg-submenu-screen"); return true; }
    enterPlay(t); return true;
  }
  function init() {
    $("lg-open-title").textContent = U.menuTitle; $("lg-open-desc").textContent = U.menuDesc;
    $("lg-open-btn").addEventListener("click", function () { renderSubmenu(); show("lg-submenu-screen"); });
    if (SELFTEST) { $("lg-selftest-note").textContent = T.msg.selftestNote; $("lg-selftest-note").hidden = false; }
    $("lg-submenu-title").textContent = U.submenuTitle; $("lg-first").textContent = U.first;
    $("lg-action-label").textContent = U.actionLabel; $("lg-level-label").textContent = U.levelLabel; $("lg-level-note").textContent = U.levelNote;
    $("lg-learn-title").textContent = U.learnTitle; $("lg-learn-desc").textContent = U.learnDesc;
    C.KINDS.forEach(function (kind) { $("lg-kind-title-" + kind).textContent = T.kind[kind]; $("lg-kind-desc-" + kind).textContent = U.kindDesc[kind]; });
    $("lg-submenu-back-btn").textContent = U.backToMenu;
    $("lg-submenu-back-btn").addEventListener("click", function () { show("menu-screen"); });
    Array.prototype.forEach.call(document.querySelectorAll(".lg-action-btn"), function (btn) {
      btn.addEventListener("click", function () { var a = btn.getAttribute("data-action"); if (a === "learn") openLearn(); else enterPlay(a); });
    });
    $("lg-learn-screen-title").textContent = T.learn.title;
    $("lg-learn-prev").textContent = T.learn.prev; $("lg-learn-close").textContent = T.learn.close;
    $("lg-learn-prev").addEventListener("click", function () { learnMove(-1); });
    $("lg-learn-next").addEventListener("click", function () { learnMove(1); });
    $("lg-learn-close").addEventListener("click", function () { renderSubmenu(); show("lg-submenu-screen"); });
    $("lg-back-btn").textContent = U.backToSubShort; $("lg-back-btn").addEventListener("click", leavePlay);
    $("lg-reset-btn").textContent = U.reset;
    $("lg-defs-sum").textContent = U.words; $("lg-mine-sum").textContent = U.mine;
    var body = $("lg-defs-body"); T.defs.concat(T.defsAdder).forEach(function (t) { body.appendChild(rich("p", "", t)); });
    wireSheet();
    $("lg-check").addEventListener("click", function () { check(); });
    $("lg-reset-btn").addEventListener("click", openReset);
    $("lg-reset-no").addEventListener("click", function () { closeReset(true); });
    $("lg-reset-yes").addEventListener("click", doReset);
    $("lg-reset-confirm").addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); closeReset(true); } });
    $("lg-reset-ask").textContent = U.resetAsk; $("lg-reset-yes").textContent = U.resetYes; $("lg-reset-no").textContent = U.resetNo;
    document.addEventListener("keydown", function (ev) {
      var tag = ev.target && ev.target.tagName;
      if (isActive("lg-learn-screen")) {                                      // 解説：← → で前後
        if (ev.key === "ArrowRight" && !$("lg-learn-next").disabled) { ev.preventDefault(); $("lg-learn-next").click(); }
        else if (ev.key === "ArrowLeft" && !$("lg-learn-prev").disabled) { ev.preventDefault(); $("lg-learn-prev").click(); }
        return;
      }
      if (!isActive("lg-play-screen")) return;                                 // 解き終わったあとは，どこにいても Enter で次へ．選ぶ問題では Enter で答え合わせ
      if (ev.key !== "Enter" || ev.defaultPrevented || ev.repeat || !S) return;
      if (tag === "BUTTON" || tag === "SUMMARY" || tag === "A" || tag === "INPUT") return;
      ev.preventDefault();
      if (S.done) goNext(); else check();
    });
    window.addEventListener("storage", onStorage);
    window.addEventListener("hashchange", function () { if (!SELFTEST) routeHash(window.location.hash); });
    renderSubmenu(); updateNote();
    if (!SELFTEST && HASH[window.location.hash]) routeHash(window.location.hash);
  }

  init();

  /*@@TEST@@*/
  /* ---- 画面の検査（?selftest=1 のとき．DOM の文字の禁止語・先出し・横スクロール・既存画面に影響しないこと） ---- */
  function domAudit() {
    var out = { combos: 0, problems: 0, states: 0, checked: 0, fail: 0, failures: [], layout: { vw: innerWidth, vh: innerHeight, states: 0, maxDoc: 0, maxBtn: 0, maxSheet: 0, maxPanel: 0, taller: 0, overX: 0, maxShift: 0, minTap: 999, tapChecked: 0 } }, seen = {};
    var MINE = "#lg-open-btn, #lg-submenu-screen, #lg-learn-screen, #lg-play-screen";
    function fail(m) { out.fail++; if (out.failures.length < 20) out.failures.push(m); }
    var APP_SEL = ".category-select-btn, .submenu-action-btn, .modal-diff-tab-btn, .modal-mode-btn, .timer-container, .bit-switch, .weight-tag, .learn-tabs .diff-btn, .diff-btn, [data-diff], [data-mode], [data-tab]";
    function appHits(label) {
      var mine = document.querySelectorAll("#lg-open-btn, #lg-open-btn *, #lg-submenu-screen, #lg-submenu-screen *, #lg-learn-screen, #lg-learn-screen *, #lg-play-screen, #lg-play-screen *"), i, hit = 0;
      for (i = 0; i < mine.length; i++) if (mine[i].matches(APP_SEL)) hit++;
      out.checked++; if (hit) fail(label + "：新カテゴリの要素 " + hit + " 個が既存の app.js の対象（" + APP_SEL + "）に当たる");
    }
    function mineClone() {
      var wrap = document.createElement("div"), list = document.querySelectorAll(MINE);
      Array.prototype.forEach.call(list, function (n) { wrap.appendChild(n.cloneNode(true)); });
      Array.prototype.forEach.call(wrap.querySelectorAll("script, style"), function (n) { n.parentNode.removeChild(n); });
      return wrap;
    }
    function texts() {
      var clone = mineClone(), list = [], i, e, k, attrs = ["aria-label", "title", "placeholder", "alt"], nodes = clone.querySelectorAll("*");
      function add(x) { if (x && !seen[x]) { seen[x] = 1; list.push(x); } }
      add(clone.textContent);
      for (i = 0; i < nodes.length; i++) {
        e = nodes[i]; add(e.textContent);
        for (k = 0; k < attrs.length; k++) if (e.hasAttribute(attrs[k])) add(e.getAttribute(attrs[k]));
      }
      return list;
    }
    function leaks() {                                    // 解決前の欄・選択肢に模範の値が出ていないか（文字・属性）を返す
      var found = [];
      if (S.p.kind === "choose") {
        S.optEls.forEach(function (b, i) {
          if (S.idx < 1 && b.querySelector(".lg-optout").textContent !== "") found.push("選択肢 " + i + " の出力の列が先に出ている");
          if (S.idx < 1 && /correct|answer/i.test(b.outerHTML)) found.push("選択肢に答えの属性がある");
          if (S.idx < 1 && b.classList.contains("lg-rev")) found.push("選択肢が先に答えの色になっている");
        });
        return found;
      }
      S.stages.forEach(function (st, si) {
        var mode = stageMode(si);
        st.cols.forEach(function (cl, ci) {
          S.cells[si][ci].forEach(function (e, r) {
            var k, a;
            if (mode === "active" && e.textContent !== S.vals[ci][r]) found.push(st.key + " の値が本人の入力と違う");
            if (mode === "future") {
              if (e.textContent !== "") found.push(st.key + " の未解決のマスに値「" + e.textContent + "」");
              for (k = 0; k < e.attributes.length; k++) {
                a = e.attributes[k];
                if (/^(class|type|tabindex|disabled|data-si|data-c|data-r)$/i.test(a.name)) continue;
                if (a.name === "aria-label" && new RegExp(U.emptyCell + "$").test(a.value)) continue;
                found.push(st.key + " の属性 " + a.name + "「" + a.value + "」");
              }
            }
          });
        });
      });
      (function () {                                      // 図の data-circuit に答え（表の値）がない
        var f = $("lg-fig").querySelector("svg"), d = f && f.getAttribute("data-circuit");
        if (d && /"(table|model|values?|bits)"/.test(d)) found.push("data-circuit に答えの項目がある");
      })();
      return found;
    }
    function tapSizes(label) {                            // 375px 幅：マス・選択肢・ボタンの高さと幅が 44px 以上
      var list = document.querySelectorAll("#lg-play-screen .lg-cell, #lg-play-screen .lg-opt, #lg-check, #lg-play-screen .lg-kbtn, #lg-play-screen .lg-lbtn, #lg-back-btn"), i, r, L = out.layout;
      for (i = 0; i < list.length; i++) {
        if (list[i].disabled && list[i].classList.contains("lg-future")) { /* 未解決のマスも 44px の大きさは持つ */ }
        r = list[i].getBoundingClientRect(); if (r.width === 0) continue;
        L.tapChecked++; L.minTap = Math.min(L.minTap, r.width, r.height);
        if (r.width < 43.5 || r.height < 43.5) { out.fail++; if (out.failures.length < 20) out.failures.push(label + "：タップ領域が 44px 未満 " + list[i].className + " " + Math.floor(r.width) + "×" + Math.floor(r.height)); }
      }
    }
    function meas(label) {
      var L = out.layout, q = function (id) { return $(id).getBoundingClientRect().bottom; }, h = document.documentElement.scrollHeight;
      if (!isActive("lg-play-screen") || $("lg-mine").open || $("lg-defs").open) return;
      L.states++; if (h > L.maxDoc) L.maxLabel = label + " " + h; L.maxDoc = Math.max(L.maxDoc, h); L.maxBtn = Math.max(L.maxBtn, q("lg-check")); L.maxSheet = Math.max(L.maxSheet, q("lg-sheet")); L.maxPanel = Math.max(L.maxPanel, q("lg-panel"));
      if (h > innerHeight && innerWidth >= 768 && innerHeight >= 768) fail("スクロールが出る（文書の高さ " + h + "／窓 " + innerHeight + "）：" + label);
      if (h > innerHeight) { L.taller++; (L.tallLabels = L.tallLabels || []).length < 8 && L.tallLabels.push(label + " " + h); }
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) L.overX++;
      if (innerWidth <= 420) tapSizes(label);
    }
    function noScrollX(label) {
      var act = document.querySelector(".screen.active"), nodes, i, r, bad = 0, w = document.documentElement.clientWidth;
      out.checked += 2;
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) fail(label + "：横スクロールがある");
      if (!act) return;
      nodes = act.querySelectorAll("*");
      for (i = 0; i < nodes.length; i++) { r = nodes[i].getBoundingClientRect(); if (r.width > 0 && (r.right > w + 1 || r.left < -1) && !nodes[i].classList.contains("lg-sr") && !nodes[i].closest(".lg-selftest") && !nodes[i].closest("[hidden]")) { bad++; if (!out.layout.clipSample) out.layout.clipSample = label + " " + nodes[i].tagName + "." + (nodes[i].className.baseVal !== undefined ? nodes[i].className.baseVal : nodes[i].className) + " right=" + Math.floor(r.right); } }
      out.layout.clipped = (out.layout.clipped || 0) + (bad ? 1 : 0);
      if (bad) fail(label + "：画面の幅からはみ出している要素が " + bad + " 個ある（幅 " + w + "）");
    }
    function hiddenInDetails(e) { var d = e.closest("details"); return !!d && !d.open && !e.closest("summary") && e !== d; }
    function ownText(e) { var k; for (k = 0; k < e.childNodes.length; k++) if (e.childNodes[k].nodeType === 3 && e.childNodes[k].nodeValue.replace(/\s/g, "") !== "") return true; return false; }
    function geom(label, rootSel) {                       // 要素どうしの重なり（矩形の交差）と，文字の切れ
      var root = document.querySelector(rootSel), nodes, leaves = [], i, j, a, b, ra, rb, ox, oy;
      if (!root) return;
      nodes = root.querySelectorAll("*");
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        if (a.namespaceURI === SVGNS && a.tagName !== "svg") continue;                      // 図の中は図の幾何（core）で検査する
        if (a.classList.contains("lg-sr") || a.closest("[hidden]") || a.closest(".lg-selftest") || a.closest("svg") || hiddenInDetails(a) || !(ownText(a) || a.classList.contains("lg-cell") || a.tagName === "svg")) continue;
        if (a.tagName !== "svg" && getComputedStyle(a).display === "inline") continue;                 // 行内の要素（太字など）は折り返すと矩形が重なって見えるので，親の行で見る
        ra = a.getBoundingClientRect();
        if (ra.width <= 0 || ra.height <= 0) continue;
        leaves.push({ e: a, r: ra });
        if (a.tagName !== "svg" && a.clientWidth > 0 && a.scrollWidth > a.clientWidth + 1) { out.layout.cut = (out.layout.cut || 0) + 1; fail(label + "：文字が切れている（scrollWidth " + a.scrollWidth + "／clientWidth " + a.clientWidth + "）" + a.tagName + "." + a.className + " 「" + (a.textContent || "").slice(0, 12) + "」"); }
      }
      out.checked += leaves.length;
      for (i = 0; i < leaves.length; i++) for (j = i + 1; j < leaves.length; j++) {
        a = leaves[i]; b = leaves[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left); oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 1.5 && oy > 1.5) { out.layout.overlap = (out.layout.overlap || 0) + 1; fail(label + "：要素が重なっている " + a.e.tagName + "." + a.e.className + " と " + b.e.tagName + "." + b.e.className + "（" + Math.floor(ox) + "×" + Math.floor(oy) + "px）"); }
      }
      out.layout.geomStates = (out.layout.geomStates || 0) + 1;
    }
    function svgFit(label) {                              // 図：幅が親に収まり，viewBox の幅・高さが SPEC の上限以内
      var svgs = document.querySelectorAll(".screen.active svg.lg-svg"), i, r, p, vb, L = out.layout;
      for (i = 0; i < svgs.length; i++) {
        r = svgs[i].getBoundingClientRect(); vb = svgs[i].viewBox.baseVal; p = svgs[i].parentNode.getBoundingClientRect();
        out.checked++;
        if (r.width <= 0) continue;
        L.maxFigW = Math.max(L.maxFigW || 0, Math.round(r.width)); L.maxFigH = Math.max(L.maxFigH || 0, Math.round(r.height));
        if (r.right > p.right + 1.5 || r.left < p.left - 1.5) fail(label + "：図が親からはみ出す（図 " + Math.floor(r.left) + "〜" + Math.floor(r.right) + "／親 " + Math.floor(p.left) + "〜" + Math.floor(p.right) + "）");
        if (vb.width > 380 || vb.height > 230) fail(label + "：図の viewBox が上限を超える " + vb.width + "×" + vb.height);
        svgText(svgs[i], label);
      }
    }
    function svgText(svg, label) {                        // 図の中の文字：外枠（getBBox）どうしが重ならない・図（viewBox）からはみ出さない
      var ts = svg.querySelectorAll("text"), boxes = [], i, j, a, b, vb = svg.viewBox.baseVal, L = out.layout;
      for (i = 0; i < ts.length; i++) { try { a = ts[i].getBBox(); } catch (e) { continue; } if (a.width > 0 && a.height > 0) boxes.push({ b: a, t: ts[i].textContent }); }
      L.svgTexts = (L.svgTexts || 0) + boxes.length; out.checked += boxes.length;
      for (i = 0; i < boxes.length; i++) {
        a = boxes[i].b;
        if (a.x < -0.5 || a.y < -0.5 || a.x + a.width > vb.width + 0.5 || a.y + a.height > vb.height + 0.5) fail(label + "：図の文字が図からはみ出す「" + boxes[i].t + "」（" + Math.floor(a.x) + "〜" + Math.ceil(a.x + a.width) + "／" + Math.floor(a.y) + "〜" + Math.ceil(a.y + a.height) + "．図 " + vb.width + "×" + vb.height + "）");
        for (j = i + 1; j < boxes.length; j++) {
          b = boxes[j].b;
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5) { L.svgTextOverlap = (L.svgTextOverlap || 0) + 1; fail(label + "：図の文字が重なる「" + boxes[i].t + "」と「" + boxes[j].t + "」"); }
        }
      }
    }
    function confirmFit(label) {
      var r = $("lg-reset-confirm").getBoundingClientRect(), t = $("lg-reset-ask").textContent;
      out.checked += 2;
      var lim = Math.max(innerHeight, document.documentElement.scrollHeight);                  // 縦にスクロールする画面では，確認の箱は画面（文書）の底に出る．「記録を消す」のボタンも文書の底にある
      if (innerWidth >= 360 && (r.left < 0 || r.right > innerWidth + 0.5 || r.bottom > lim + 0.5 || r.top < 0)) fail(label + "：確認の箱が窓に収まらない（" + Math.floor(r.left) + "〜" + Math.floor(r.right) + "／" + Math.floor(r.top) + "〜" + Math.floor(r.bottom) + "）");
      if (t.indexOf("このカテゴリ（論理回路）の記録が消えます") < 0 || t.indexOf("ほかのカテゴリの記録は消えません") < 0 || t.indexOf("この端末の記録がすべて") >= 0) fail(label + "：確認の文が，このカテゴリの記録だけが消えると言っていない「" + t + "」");
    }
    function audit1(label) {
      var list = texts(), bad = C.checkTexts(list);
      out.states++; out.checked += list.length + 1;
      bad.forEach(function (b) { fail(label + "：" + b); });
      if (S && isActive("lg-play-screen")) { leaks().forEach(function (b) { fail(label + "：答えの先出し " + b); }); out.checked++; }
      noScrollX(label); meas(label);
      if (isActive("lg-play-screen")) { geom(label, "#lg-panel"); svgFit(label); } else if (isActive("lg-learn-screen")) { geom(label, "#lg-tutorial-card"); svgFit(label); }
      out.checked++; if (document.querySelector("#lg-play-screen .timer-container, #lg-play-screen .combo-display, #lg-play-screen .timer-bar, #lg-play-screen [id*=timer]")) fail(label + "：タイマー・コンボの部品がある");
    }
    function typeInto(vals) { S.vals = vals.map(function (v) { return Array.isArray(v) ? v.slice() : v; }); refresh(); }
    function modelVals(st) { return st.type === "pick" ? st.options.map(function (o) { return o.correct; }) : st.cols.map(function (cl) { return cl.model.slice(); }); }
    function wrongVals(st, kind) {
      if (st.type === "pick") return st.options.map(function (o) { return !o.correct; });
      return st.cols.map(function (cl, ci) { return cl.model.map(function (b, r) { return kind === "one" ? (ci === 0 && r === 0 ? (b === "0" ? "1" : "0") : b) : (b === "0" ? "1" : "0"); }); });
    }
    function pos() { var g = $("lg-sheet").getBoundingClientRect(), q = $("lg-qtitle").getBoundingClientRect(), f = $("lg-fig").getBoundingClientRect(); return [g.top, g.bottom, q.top, q.bottom, f.top, f.bottom]; }
    function checkSteady() {
      var a = pos(), b, d, k;
      check(); b = pos(); d = 0;
      for (k = 0; k < 6; k++) d = Math.max(d, Math.abs(a[k] - b[k]));
      out.layout.maxShift = Math.max(out.layout.maxShift || 0, d);
      out.checked++; if (d > 2 && innerWidth > 1100) fail("答え合わせの前後で表・図の位置が " + Math.floor(d) + "px 動く：" + S.p.key);
    }
    function runProblem(mode, n) {
      var st = S.stages, si, j, nWrong, ks = ["all", "one"];
      if (mode === 3 && st[0].type !== "pick") { checkSteady(); audit1("空で答え合わせ"); }
      for (si = 0; si < st.length; si++) {
        nWrong = (mode === 1 && si === n % st.length) ? 1 : (mode === 2 && si === n % st.length) ? 2 : 0;
        for (j = 0; j < nWrong; j++) { typeInto(wrongVals(st[si], ks[(n + j) % 2])); checkSteady(); audit1("誤り " + S.p.key + " " + st[si].key); }
        if (nWrong < 2) { typeInto(modelVals(st[si])); checkSteady(); audit1("正解 " + S.p.key + " " + st[si].key); }
      }
      lockedMatch(); audit1("解き終わり " + S.p.key);
      out.problems++;
      S.doneAt = 0; goNext();
    }
    function lockedMatch() {
      if (S.p.kind === "choose") return;
      S.stages.forEach(function (st, si) { st.cols.forEach(function (cl, ci) { cl.model.forEach(function (mv, r) { out.checked++; if (S.cells[si][ci][r].textContent !== mv) fail("解決したマスが模範の値と違う：" + S.p.key + " " + st.key + " " + ci + "," + r); }); }); });
    }
    /* 既存の画面に影響しないこと */
    (function () {
      var cats = document.querySelectorAll(".category-select-btn"), cards = document.querySelectorAll("#menu-screen .card-btn"), i, ids = ["menu-screen", "submenu-screen", "game-screen", "result-screen", "learn-screen", "settings-modal", "timer-bar", "combo-display", "answer-input", "submit-btn"];
      out.checked += 10 + ids.length;
      (function () {
        var doc = document.documentElement.scrollHeight, cb = document.querySelector(".app-container").getBoundingClientRect().bottom;
        out.layout.menuDoc = doc; out.layout.menuBottom = Math.floor(cb);
        if (innerWidth >= 768 && innerHeight >= 768 && (doc > innerHeight || cb > innerHeight)) fail("メニューが窓に収まらない（文書の高さ " + doc + "／枠の底 " + Math.floor(cb) + "／窓 " + innerHeight + "）");
        if (document.querySelectorAll("#menu-screen .mode-grid > .card-btn").length !== 6) fail("メニューのカードが 6 枚でない");
        out.layout.menuCols = getComputedStyle(document.querySelector("#menu-screen .mode-grid")).gridTemplateColumns.split(" ").length;
        if (innerWidth >= 900 && out.layout.menuCols !== 2) fail("幅 900px 以上のメニューが 2 列でない（" + out.layout.menuCols + "）");
        if (innerWidth < 900 && out.layout.menuCols !== 1) fail("幅 900px 未満のメニューが 1 列でない（" + out.layout.menuCols + "）");
      })();
      if (cats.length !== 3) fail("既存の 3 カテゴリのボタンが " + cats.length + " 個");
      if (cards.length !== 6) fail("メニューのカードが " + cards.length + " 枚（既存 3＋4 つ目＋5 つ目＋新 1 のはず）");
      if (!$("bc-open-btn") || !$("bf-open-btn") || !$("lg-open-btn")) fail("4 つ目〜6 つ目のカードのどれかが無い");
      if (document.querySelectorAll(".modal-diff-tab-btn[data-diff=hard]").length !== 1) fail("既存の設定モーダルの上級（16ビット）が変わっている");
      for (i = 0; i < ids.length; i++) if (!$(ids[i])) fail("既存の要素 #" + ids[i] + " が無い");
      ["bin-dec", "bin-hex", "dec-hex"].forEach(function (cat) {
        var btn = document.querySelector(".category-select-btn[data-category=" + cat + "]"), title = { "bin-dec": "2進法 ⇔ 10進法", "bin-hex": "2進法 ⇔ 16進法", "dec-hex": "10進法 ⇔ 16進法" }[cat];
        out.checked += 3;
        btn.click();
        if (!$("submenu-screen").classList.contains("active") || $("menu-screen").classList.contains("active")) fail("既存カテゴリ " + cat + "：サブメニューへ進まない");
        if ($("submenu-title").textContent !== title) fail("既存カテゴリ " + cat + "：サブメニューの題が「" + $("submenu-title").textContent + "」");
        $("submenu-back-btn").click();
        if (!$("menu-screen").classList.contains("active") || $("submenu-screen").classList.contains("active")) fail("既存カテゴリ " + cat + "：メニューへ戻らない");
      });
      out.checked += 3;
      $("bc-open-btn").click();
      if (!isActive("bc-submenu-screen") || $("menu-screen").classList.contains("active")) fail("4 つ目のカテゴリ：サブメニューへ進まない");
      $("bc-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("bc-submenu-screen")) fail("4 つ目のカテゴリ：メニューへ戻らない");
      out.checked += 3;
      $("bf-open-btn").click();
      if (!isActive("bf-submenu-screen") || $("menu-screen").classList.contains("active")) fail("5 つ目のカテゴリ：サブメニューへ進まない");
      $("bf-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("bf-submenu-screen")) fail("5 つ目のカテゴリ：メニューへ戻らない");
      // 新カテゴリ：メニュー → サブメニュー → メニュー
      out.checked += 6;
      $("lg-open-btn").click();
      if (!isActive("lg-submenu-screen") || $("menu-screen").classList.contains("active")) fail("新カテゴリ：サブメニューへ進まない");
      if ($("lg-submenu-screen").querySelectorAll(".lg-action-btn").length !== 5) fail("新カテゴリのサブメニューのボタンが 5 つでない");
      if ($("lg-diff").querySelectorAll("button").length !== 2 || $("lg-diff").querySelector("[data-level=hard], [data-bits='16']")) fail("難易度が初級・中級の 2 つだけでない");
      if (document.querySelector(".app-container").classList.contains("bc-compact") || document.body.classList.contains("bc-top") || document.querySelector(".app-container").classList.contains("bf-compact")) fail("4 つ目・5 つ目の画面のクラスが残っている");
      if ($("lg-first").textContent.indexOf("はじめての人は「解説」から（3 分）") !== 0) fail("サブメニューの導線の 1 行が無い");
      (function () {
        var APP_IDS = ["menu-screen", "submenu-screen", "game-screen", "result-screen", "learn-screen", "settings-modal", "timer-bar", "combo-display", "answer-input", "submit-btn", "quit-btn", "restart-btn", "back-to-menu-btn",
                       "submenu-title", "play-a-title", "play-b-title", "play-mix-title", "submenu-back-btn", "modal-cancel-btn", "modal-start-btn", "question-text", "question-mode-label", "question-progress", "game-progress-label",
                       "game-score-label", "game-score", "question-card", "bit-input-area", "text-input-area", "binary-input-tip", "char-counter", "result-score", "result-rank", "result-accuracy", "result-max-combo", "review-list",
                       "result-title", "result-meta", "learn-close-btn", "learn-prev-btn", "learn-next-btn", "tutorial-card", "step-indicators"];
        var i, ids = {}, dup = 0, all = document.querySelectorAll("[id]"), sels, before, tabs, k, bad;
        out.checked += 4;
        appHits("開始時");
        for (i = 0; i < all.length; i++) { if (ids[all[i].id]) dup++; ids[all[i].id] = 1; }
        if (dup) fail("id が重複している（" + dup + "）");
        for (i = 0; i < APP_IDS.length; i++) if (!$(APP_IDS[i])) fail("app.js が使う id #" + APP_IDS[i] + " が無い");
        for (i = 0; i < all.length; i++) if (APP_IDS.indexOf(all[i].id) < 0 && /^(menu|submenu|game|result|learn|settings|modal|timer|combo|answer|submit|quit|restart|question|review|tutorial|step)[-_]/.test(all[i].id) && !/^(b[cf]|lg)-/.test(all[i].id)) fail("既存の命名の id が増えている #" + all[i].id);
        tabs = document.querySelectorAll(".modal-diff-tab-btn");
        before = Array.prototype.map.call(tabs, function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",");
        if (tabs.length !== 3 || before !== "easy:false,medium:true,hard:false") fail("既存の設定モーダルの難易度の初期状態が違う " + before);
        sels = $("lg-diff").querySelectorAll("button"); bad = 0;
        for (k = 0; k < sels.length; k++) { sels[k].click(); if (Array.prototype.map.call(document.querySelectorAll(".modal-diff-tab-btn"), function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",") !== before) bad++; }
        for (k = sels.length - 1; k >= 0; k--) { sels[k].click(); }
        if (bad) fail("新カテゴリの難易度を押すと，既存の設定モーダルの選択が変わる");
      })();
      $("lg-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("lg-submenu-screen")) fail("新カテゴリ：メニューへ戻らない");
      if (document.querySelector(".app-container").classList.contains("lg-compact") || document.body.classList.contains("lg-top") || document.querySelector(".app-container").classList.contains("lg-learn")) fail("メニューへ戻ったあとも lg-* のクラスが残っている");
      noScrollX("メニュー");
    })();
    /* 他のカテゴリへ移ったとき lg-* のクラスが残らない（練習画面からメニューへ戻り，4 つ目・5 つ目を開く） */
    (function () {
      out.checked += 3;
      show("lg-play-screen"); renderPlayControls(); newProblem(); show("menu-screen");
      if (document.querySelector(".app-container").classList.contains("lg-compact") || document.body.classList.contains("lg-top")) fail("練習画面のあとメニューに戻ると lg-* のクラスが残る");
      $("bf-open-btn").click(); $("bf-submenu-back-btn").click();
      $("bc-open-btn").click(); $("bc-submenu-back-btn").click();
      if (document.querySelector(".app-container").className.indexOf("lg-") >= 0 || document.body.className.indexOf("lg-") >= 0) fail("ほかのカテゴリを開いたあとも lg-* のクラスが残る");
      S = null;
    })();
    /* 直リンク */
    (function () {
      var map = { "#logic": "lg-submenu-screen", "#logic-basic": "basic", "#logic-combine": "combine", "#logic-choose": "choose", "#logic-adder": "adder" };
      Object.keys(map).forEach(function (h) {
        out.checked += 2;
        sel.kind = "basic"; sel.lv = 1;
        routeHash(h);
        if (h === "#logic") { if (!isActive("lg-submenu-screen")) fail("直リンク " + h + "：サブメニューが開かない"); }
        else {
          if (!isActive("lg-play-screen") || sel.kind !== map[h] || !S || S.p.kind !== map[h]) fail("直リンク " + h + "：練習（" + map[h] + "）へ進まない");
          if (S && S.idx !== 0 && S.done) fail("直リンク " + h + "：答えが出ている");
        }
      });
      out.checked += 2;
      if (routeHash("#logic-answer") !== false || routeHash("#x") !== false) fail("直リンク：知らない指定を受けてしまう");
      show("menu-screen"); S = null;
    })();
    /* 解説：全ステップを出して禁止語・横スクロール・収まり */
    (function () {
      var i, n = T.learn.steps.length;
      show("lg-learn-screen");
      for (i = 0; i < n; i++) {
        learnIdx = i; renderLearn(); audit1("解説 " + (i + 1));
        (function () {
          var L = out.layout, h = document.documentElement.scrollHeight, nb = $("lg-learn-next").getBoundingClientRect().bottom, cb = $("lg-learn-close").getBoundingClientRect().bottom;
          L.learnSteps = (L.learnSteps || 0) + 1; L.learnMaxClose = Math.max(L.learnMaxClose || 0, cb);
          if (h > innerHeight) L.learnTaller = (L.learnTaller || 0) + 1;
          out.checked++;
          if (innerWidth >= 768 && innerHeight >= 768 && (h > innerHeight || nb > innerHeight || cb > innerHeight)) fail("解説 " + (i + 1) + "：スクロールが出る（文書の高さ " + h + "／窓 " + innerHeight + "）");
        })();
      }
      learnIdx = 0;
    })();
    show("lg-play-screen");
    (function () {                                       // 全種類×難易度：誤りのあと正解／2 回目も誤り／1 回目で正解の 4 通りをくり返し
      var combos = [["basic", 1], ["combine", 1], ["combine", 2], ["choose", 1], ["choose", 2], ["adder", 1], ["adder", 2]];
      combos.forEach(function (kl) {
        var n;
        choose(kl[0], kl[1]); out.combos++;
        for (n = 0; n < 16; n++) runProblem(n % 4, n);
      });
    })();
    (function () {                                       // 全問題の全段：入力中・誤り・誤り＋記録を消す確認・正解（要素の重なり・文字切れ・縦スクロール・横はみ出し・図の収まり）
      var E = out.layout, probs = [];
      E.exProblems = 0; E.exStates = 0;
      ["b_and", "b_or", "b_not"].forEach(function (id) { probs.push({ kind: "basic", lv: 0, cid: id }); });
      C.P_LIST.forEach(function (c) { probs.push({ kind: "combine", lv: 1, cid: c.id }); });
      C.R_LIST.forEach(function (c) { probs.push({ kind: "combine", lv: 2, cid: c.id }); });
      ["ad1", "ad1m"].forEach(function (id) { probs.push({ kind: "adder", lv: 1, cid: id }); });
      ["ad2", "ad2m"].forEach(function (id) { probs.push({ kind: "adder", lv: 2, cid: id }); });
      function each(p) {
        var si, st, label;
        sel.kind = p.kind; sel.lv = p.lv || sel.lv; recent = []; renderPlayControls();
        newProblem(C.makeProblem(p)); E.exProblems++;
        for (si = 0; si < S.stages.length; si++) {
          st = S.stages[si]; label = "全数 " + S.p.key + " " + st.key;
          typeInto(modelVals(st)); meas(label); noScrollX(label); geom(label, "#lg-panel"); svgFit(label); E.exStates++;
          check(); typeInto(wrongVals(st, "all")); S.sst[S.idx] = C.newStageState(); check(); meas(label + " 誤り"); noScrollX(label + " 誤り"); geom(label + " 誤り", "#lg-panel"); E.exStates++;
          $("lg-reset-confirm").hidden = false; confirmFit(label + " 確認"); meas(label + " 誤り＋確認"); geom(label + " 誤り＋確認", "#lg-panel"); $("lg-reset-confirm").hidden = true; E.exStates++;
          S.sst[S.idx] = C.newStageState(); typeInto(modelVals(st)); check(); meas(label + " 正解"); noScrollX(label + " 正解"); geom(label + " 正解", "#lg-panel"); E.exStates++;
        }
        if (!S.done) fail("全数：最後まで解けない " + S.p.key);
      }
      probs.forEach(each);
      [1, 2].forEach(function (lv) {                      // ③：題の表ごとに 1 問（全題の表）
        var seenT = {}, k, p, tries = 0;
        while (tries++ < 600) { p = C.gen("choose", lv, []); if (seenT[p.tbl]) continue; seenT[p.tbl] = 1; each({ kind: "choose", lv: lv, target: p.tbl, opts: p.opts }); }
      });
      each({ kind: "choose", lv: 1, target: "0110", opts: ["q02", "q07", "q01", "q08"] });          // 思5 の 4 つ（ア＝q02，イ＝q07，ウ＝q01，エ＝q08）．q07・q08 の小図を全状態で測る
      each({ kind: "choose", lv: 1, target: "1110", opts: ["q08", "q07", "p01", "p04"] });
      out.problems += E.exProblems;
    })();
    (function () {                                       // 全問題の全段：2回目も誤りで値を見せた状態
      var E = out.layout;
      E.revStates = 0;
      [{ kind: "combine", lv: 2, cid: "r02" }, { kind: "combine", lv: 1, cid: "p05" }, { kind: "adder", lv: 2, cid: "ad2" }, { kind: "adder", lv: 1, cid: "ad1m" }, { kind: "basic", lv: 0, cid: "b_not" }].forEach(function (p) {
        var si, st, label;
        sel.kind = p.kind; sel.lv = p.lv || sel.lv; recent = []; renderPlayControls();
        newProblem(C.makeProblem(p));
        for (si = 0; si < S.stages.length; si++) {
          st = S.stages[si]; label = "値を見せる " + S.p.key + " " + st.key;
          typeInto(wrongVals(st, "all")); check(); typeInto(wrongVals(st, "all")); check();
          if (S.view[si] !== "rev") fail(label + "：値を見せる状態にならない");
          meas(label); noScrollX(label); geom(label, "#lg-panel"); E.revStates++;
        }
      });
      (function () {                                      // ③ の値を見せた状態
        var p = C.gen("choose", 1, []);
        sel.kind = "choose"; sel.lv = 1; recent = []; renderPlayControls(); newProblem(p);
        typeInto(wrongVals(S.stages[0], "all")); check(); typeInto(wrongVals(S.stages[0], "all")); check();
        if (S.view[0] !== "rev") fail("③：値を見せる状態にならない");
        meas("③ 値を見せる"); noScrollX("③ 値を見せる"); geom("③ 値を見せる", "#lg-panel"); E.revStates++;
        audit1("③ 値を見せる");
      })();
    })();
    show("lg-play-screen"); choose("combine", 1);
    (function () {
      var keep = $("lg-extra").textContent, found;
      $("lg-extra").textContent = "論理式"; found = C.checkTexts(texts()).length > 0; $("lg-extra").textContent = keep;
      out.checked++; if (!found) fail("画面の禁止語の検査が働かない");
    })();
    (function () {                                       // 先出しの検査自体が働くこと
      var found = false, b;
      choose("combine", 2);
      b = S.cells[1][0][0]; b.textContent = "1"; found = leaks().length > 0; b.textContent = "";
      b.setAttribute("title", "1"); found = found && leaks().length > 0; b.removeAttribute("title");
      out.checked += 2; if (!found || leaks().length) fail("答えの先出しの検査が働かない");
    })();
    (function () {                                       // 図の文字の検査自体が働くこと：重なる文字・はみ出す文字を入れた図で失敗が出る
      var host = document.createElement("div"), s = sv("svg", { viewBox: "0 0 100 40", "class": "lg-svg" }), f0 = out.fail, got, keep = out.failures.length;
      host.style.cssText = "position:absolute;left:0;top:0;width:200px;opacity:0"; s.appendChild(sv("text", { x: 20, y: 20, "class": "lg-vcap" }, "ともに入っているときだけ点く")); s.appendChild(sv("text", { x: 22, y: 22, "class": "lg-vcap" }, "重なる文字"));
      host.appendChild(s); document.body.appendChild(host);
      svgText(s, "検査の検査"); got = out.fail - f0; out.fail = f0; out.failures.length = keep; document.body.removeChild(host);
      out.checked++; if (got < 2) fail("図の文字の検査が働かない（重なり・はみ出しを見つけられない）");
    })();
    appHits("練習・解説の描画後");
    (function () {                                       // 「記録を消す」のあとも，選んでいた種類・難易度が保たれる
      var combos = [["adder", 2], ["choose", 2], ["combine", 1], ["basic", 1]], i, kk, ll, c;
      for (i = 0; i < combos.length; i++) {
        kk = combos[i][0]; ll = combos[i][1];
        choose(kk, ll);
        if (S) S.done = false;
        $("lg-reset-btn").click(); $("lg-reset-yes").click();
        c = rec.rec[C.comboKey(kk, C.hasLv(kk) ? ll : 0)];
        out.checked += 4;
        if (sel.kind !== kk || (C.hasLv(kk) && sel.lv !== ll)) fail("記録を消したあと，選択が " + sel.kind + "/" + sel.lv + " に変わった（" + kk + "/" + ll + " のはず）");
        if (c.tried !== 0 || c.streak !== 0) fail("記録を消したのに記録が残っている");
        if (!S || S.p.kind !== kk) fail("記録を消したあとの問題が " + kk + " でない");
        if (C.hasLv(kk) && document.querySelector("#lg-lvsw [aria-pressed=true]").getAttribute("data-lv") !== String(ll)) fail("記録を消したあと，難易度のボタンの表示が変わった");
      }
    })();
    $("lg-reset-confirm").hidden = false; confirmFit("記録を消す確認"); audit1("記録を消す確認"); $("lg-reset-confirm").hidden = true;
    $("lg-mine").open = true; audit1("きみの記録"); $("lg-mine").open = false;
    $("lg-defs").open = true; audit1("ことば"); $("lg-defs").open = false;
    S = null; recent = []; renderSubmenu(); show("menu-screen");
    return out;
  }

  if (SELFTEST) {
    (function () { var st = document.createElement("style"); st.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }"; document.head.appendChild(st); })();
    (function run(tries) {
      if ((window.__selftestResult === undefined || window.__bfSelftestResult === undefined) && tries < 300) { setTimeout(function () { run(tries + 1); }, 200); return; }      // 4 つ目・5 つ目のカテゴリの自己検査（同じ URL で動く）が終わってから動く（画面の切り替えが重ならないように）
      var rep = C.selfTest(3000, 20261027), au = domAudit(), pre = $("lg-selftest");
      rep.extra.domAudit = { combos: au.combos, problems: au.problems, states: au.states, checked: au.checked, fail: au.fail, layout: au.layout };
      rep.totalChecked += au.checked; rep.totalFail += au.fail; rep.failures = rep.failures.concat(au.failures);
      C.setSeed((Math.random() * 4294967296) >>> 0);        // 自己検査のあとは乱数を戻す
      window.__lgSelftestResult = rep;
      pre.textContent = "SELFTEST " + JSON.stringify(rep, null, 1); pre.hidden = false;
      console.log("SELFTEST-LG", rep);
    })(0);
  }
})();
