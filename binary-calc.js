"use strict";
/* ============ 2進数の計算（足し算・補数）の画面 ============
   CS Math Trainer の 4 つ目のカテゴリ．app.js は触らず，この画面が自分の 3 つの画面
   （サブメニュー／解説／練習）を .screen の active で切り替える．
   binary-calc-drill（HEAD 9795fa7）の画面を移し，次を変えた：
   ・時間制限・タイマー・コンボは持たない
   ・難易度は 初級（4ビット）と 中級（8ビット）だけ
   ・見た目は style.css の変数に合わせる（binary-calc.css）
   ============================================================ */
(function () {
  var C = BinCalcCore, T = C.TEXT, U = T.ui, qs = window.location.search;
  var SELFTEST = /[?&]selftest=1/.test(qs);

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function bin(v, n) { var s = v.toString(2); while (s.length < n) s = "0" + s; return s; }
  var LEVEL_ID = { 4: "easy", 8: "medium" };

  /* ---- 画面の切り替え（app.js の showScreen には触らない．.screen をまとめて切り替える） ---- */
  function show(id) {
    var all = document.querySelectorAll(".screen"), i, app = document.querySelector(".app-container");
    for (i = 0; i < all.length; i++) all[i].classList.toggle("active", all[i].id === id);
    if (app) { app.classList.toggle("bc-compact", id === "bc-play-screen"); app.classList.toggle("bc-learn", id === "bc-learn-screen"); }
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* ---- 記録（localStorage．使えなくてもその場限りで動く） ---- */
  function memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
  var storage = null;
  if (SELFTEST) storage = memStorage();                       // 自己検査は端末の記録を汚さない
  else { try { storage = window.localStorage; } catch (e0) { storage = null; } }
  var loaded = C.loadRec(storage), rec = loaded.rec, storageOk = loaded.usable && !!storage;
  var sel = rec.sel;
  function updateNote() { var n = $("bc-storage-note"); n.textContent = T.msg.storageOff; n.hidden = storageOk; }
  function persist() { storageOk = !!storage && C.saveRec(storage, rec); updateNote(); }

  /* ---- 状態 ---- */
  var S = null, lastP = null;

  /* ---- 筆算の行の定義 ---- */
  function rowSpecs(p, stages) {
    var n = p.bits, R = T.row, rows = [];
    if (p.kind === "calc") {
      rows.push({ id: "carry", label: R.carry, type: "input", stage: 0 });
      rows.push({ id: "a", label: "", type: "static", digits: bin(p.a, n) });
      rows.push({ id: "b", label: "", type: "static", digits: bin(p.b, n), op: "＋" });
      rows.push({ id: "ans", label: R.answer, type: "input", stage: 1, ruled: true });
    } else if (p.kind === "comp") {
      rows.push({ id: "x", label: R.x, type: "static", digits: bin(p.x, n) });
      rows.push({ id: "invert", label: R.invert, type: "input", stage: 0 });
      rows.push({ id: "plus1", label: R.plus1, type: "input", stage: 1 });
    } else {
      rows.push({ id: "b", label: R.b, type: "static", digits: bin(p.b, n) });
      rows.push({ id: "invert", label: R.invert, type: "input", stage: 0 });
      rows.push({ id: "plus1", label: R.plus1, type: "input", stage: 1 });
      rows.push({ id: "a", label: R.a, type: "static", digits: bin(p.a, n) });
      rows.push({ id: "cmp", label: R.cmp, type: "copy", digits: stages[1].model.join(""), from: 1, op: "＋" });
      rows.push({ id: "sum", label: R.sum, type: "input", stage: 2, ruled: true, over: true });
      rows.push({ id: "ans", label: R.answer, type: "input", stage: 3 });
    }
    return rows;
  }

  /* ---- 格子を組む ---- */
  var LOCK_SVG = '<svg class="bc-lk" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function makeInput(i) {
    var e = document.createElement("input");
    e.type = "text"; e.setAttribute("inputmode", "numeric"); e.setAttribute("autocomplete", "off");
    e.setAttribute("autocapitalize", "off"); e.setAttribute("enterkeyhint", "done"); e.spellcheck = false;
    e.className = "bc-cell bc-in";
    e.setAttribute("data-i", String(i));
    return e;
  }

  // 1つの行を DOM にする．leadOn：左端に（n+1 桁目・演算子用の）枠を持つか
  function buildRow(sp, p, stages, leadOn, host) {
    var n = p.bits, row = el("div", "bc-row"), lab = el("div", "bc-rlab"), cells = el("div", "bc-cells");
    var leadEl = null, colEls = [], col, d, i, e, st, r, w;
    if (leadOn) { leadEl = el("span", "bc-cell bc-lead bc-ph"); cells.appendChild(leadEl); }
    for (col = 0; col < n; col++) {
      e = el("span", "bc-cell bc-ph");
      if (col > 0 && (n - 1 - col) % 4 === 3) e.className += " bc-nib";       // 4 ビットずつ間を空ける（全行で同じ位置）
      colEls.push(e); cells.appendChild(e);
    }
    function put(slotEl, node) { node.className += (slotEl.className.indexOf(" bc-nib") >= 0 ? " bc-nib" : "") + (slotEl.className.indexOf("bc-lead") >= 0 ? " bc-lead" : ""); cells.replaceChild(node, slotEl); return node; }
    row.setAttribute("data-row", sp.id);
    lab.appendChild(document.createTextNode(sp.label));
    r = { spec: sp, el: row, lab: lab, inputs: [], statics: [], lead: leadEl };
    if (sp.op && leadEl) { leadEl.className = "bc-cell bc-lead bc-op"; leadEl.textContent = sp.op; }
    if (sp.leadText && leadEl) { leadEl.className = "bc-cell bc-lead bc-st bc-over"; leadEl.textContent = sp.leadText; }
    if (sp.type === "static") {
      for (col = 0; col < n; col++) {
        e = el("span", "bc-cell bc-st", sp.digits.charAt(col));
        r.statics.push(put(colEls[col], e));
      }
    } else if (sp.type === "copy") {      // 模範の値は JS の中だけに持つ．その段が解けるまで DOM には入れない（refreshRows が入れる）
      r.digits = sp.digits.split("");
      for (col = 0; col < n; col++) {
        e = el("span", "bc-cell bc-cp");
        r.statics.push(put(colEls[col], e));
      }
    } else {
      st = stages[sp.stage];
      for (i = 0; i < st.len; i++) {
        d = st.lo + st.len - 1 - i;
        e = makeInput(i);
        if (d >= n && sp.over) {                                   // はみ出す桁：斜線は <input> に描けないので外側の枠（bc-cwrap）に描く
          e.className += " bc-over";
          w = el("span", "bc-cwrap bc-lead"); w.appendChild(e); cells.replaceChild(w, leadEl); r.leadCell = w;
        }
        else if (d >= n) e = put(leadEl, e);
        else e = put(colEls[n - 1 - d], e);
        r.inputs.push(e);
      }
    }
    if (sp.ruled) row.className += " bc-ruled";
    row.appendChild(lab); row.appendChild(cells); host.appendChild(row);
    return r;
  }

  function buildGrid() {
    var g = $("bc-grid"), p = S.p, leadOn = p.kind !== "comp";
    g.innerHTML = ""; S.rows = [];
    g.style.setProperty("--cols", String(p.bits + (leadOn ? 1 : 0)));
    rowSpecs(p, S.stages).forEach(function (sp) { S.rows.push(buildRow(sp, p, S.stages, leadOn, g)); });
  }

  /* ---- 行の見た目を現在の状態に合わせる ---- */
  function setCellValue(e, v) { e.value = v; }
  function refreshRows() {
    S.rows.forEach(function (r) {
      var sp = r.spec, st, mode, vals, i, shown;
      if (sp.type === "input") {
        st = S.stages[sp.stage];
        mode = sp.stage < S.idx ? "locked" : sp.stage === S.idx ? "active" : "future";
        r.el.className = "bc-row bc-" + mode + (sp.ruled ? " bc-ruled" : "") + (mode === "locked" && S.view[sp.stage] === "rev" ? " bc-rev" : "");
        vals = mode === "locked" ? st.model : mode === "active" ? S.cells : st.model.map(function () { return ""; });
        for (i = 0; i < r.inputs.length; i++) {
          setCellValue(r.inputs[i], vals[i]);
          r.inputs[i].disabled = mode !== "active";
          r.inputs[i].setAttribute("tabindex", mode === "active" && i === S.focus ? "0" : "-1");
          r.inputs[i].setAttribute("aria-label", C.cellLabel(sp.label, st.lo + st.len - i, vals[i]));
          r.inputs[i].classList.toggle("bc-bad", mode === "active" && !!S.bad[i]);
          r.inputs[i].classList.toggle("bc-fix", mode === "locked" && S.view[sp.stage] === "rev" && (S.fixes[sp.stage] || []).indexOf(i) >= 0);
        }
        r.lab.innerHTML = "";
        r.lab.appendChild(document.createTextNode(sp.label));
        if (mode === "locked") { r.lab.insertAdjacentHTML("beforeend", LOCK_SVG); r.lab.appendChild(el("span", "bc-sr", "（" + U.lockedLabel + "）")); }
      } else if (sp.type === "copy") {      // 「1を足す」段が解けるまでは空（文字も属性も入れない）
        shown = S.idx > sp.from;
        r.el.className = "bc-row" + (shown ? "" : " bc-future");
        r.statics.forEach(function (e, c) { e.textContent = shown ? r.digits[c] : ""; });
      }
      if (sp.over && r.leadCell) r.leadCell.classList.toggle("bc-slash", S.idx >= 3);
    });
  }

  /* ---- 画面の各部分 ---- */
  function renderPlayControls() {
    var k = $("bc-kinds"), b = $("bc-bitsw");
    if (!k.firstChild) {
      C.KINDS.forEach(function (kind) {
        var bt = el("button", "bc-kbtn", T.kind[kind]); bt.type = "button"; bt.setAttribute("data-kind", kind);
        bt.addEventListener("click", function () { choose(kind, sel.bits); });
        k.appendChild(bt);
      });
      C.BITS.forEach(function (bits) {
        var bt = el("button", "bc-bbtn", T.level[bits] + "（" + T.bits[bits] + "）"); bt.type = "button"; bt.setAttribute("data-bits", String(bits));
        bt.addEventListener("click", function () { choose(sel.kind, bits); });
        b.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(k.children, function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-kind") === sel.kind ? "true" : "false"); });
    Array.prototype.forEach.call(b.children, function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-bits") === String(sel.bits) ? "true" : "false"); });
  }
  // サブメニュー：難易度の選択と，カードごとの ✓（初級・中級）
  function renderSubmenu() {
    var d = $("bc-diff"), ticks = document.querySelectorAll(".bc-ticks");
    if (!d.firstChild) {
      C.BITS.forEach(function (bits) {
        var bt = el("button", "bc-diff-btn"); bt.type = "button";               // 既存の .modal-diff-tab-btn（app.js が掴む）は使わない
        bt.setAttribute("data-bits", String(bits)); bt.setAttribute("data-level", LEVEL_ID[bits]);
        bt.appendChild(document.createTextNode(T.level[bits])); bt.appendChild(document.createElement("br"));
        bt.appendChild(el("span", "bc-diffsub", T.bits[bits]));
        bt.addEventListener("click", function () { sel.bits = bits; persist(); renderSubmenu(); });
        d.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(d.children, function (bt) {
      var on = bt.getAttribute("data-bits") === String(sel.bits);
      bt.classList.toggle("bc-sel", on); bt.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(ticks, function (host) {
      var kind = host.getAttribute("data-kind");
      host.innerHTML = "";
      C.BITS.forEach(function (bits) {
        var done = C.tickOf(rec, kind, bits), it = el("span", "bc-tick" + (done ? " bc-done" : ""));
        it.appendChild(document.createTextNode(T.level[bits] + " "));
        it.appendChild(el("span", "bc-mk", done ? "✓" : "—"));
        it.setAttribute("aria-label", T.level[bits] + "（" + T.bits[bits] + "）：" + (done ? U.cleared : U.notYet));
        host.appendChild(it);
      });
    });
  }
  function renderStreak() {
    var host = $("bc-streak"), c = rec.rec[C.comboKey(sel.kind, sel.bits)], need = C.CLEAR_STREAK[sel.kind], i, d;
    host.innerHTML = "";
    host.appendChild(document.createTextNode(U.streak + " "));
    for (i = 0; i < need; i++) { d = el("span", "bc-dot" + (i < Math.min(c.streak, need) ? " bc-on" : "")); d.setAttribute("aria-hidden", "true"); host.appendChild(d); }
    host.appendChild(el("span", "bc-sr", Math.min(c.streak, need) + "／" + need));
    if (c.cleared) host.appendChild(el("span", "bc-clearmark", "✓"));
    host.title = U.streakNote;
  }
  function chipState(i) {
    var s = S.sst[i];
    if (s.result === "ok1") return "ok";
    if (s.attempts >= 1) return "ng";
    return "yet";
  }
  function renderSide() {
    var chips = $("bc-chips"), i, st, cs, li;
    $("bc-qtitle").textContent = C.titleOf(S.p);
    renderStreak();
    if (S.idx < S.stages.length) {
      st = S.stages[S.idx];
      $("bc-stagehead").innerHTML = "";
      $("bc-stagehead").appendChild(document.createTextNode(U.stage + " " + (S.idx + 1) + "／" + S.stages.length + "　"));
      $("bc-stagehead").appendChild(el("b", "", st.name));
      $("bc-instr").textContent = st.instr;
    } else {
      $("bc-stagehead").textContent = U.stageEnd;
      $("bc-instr").textContent = "";
    }
    chips.innerHTML = "";
    for (i = 0; i < S.stages.length; i++) {
      cs = chipState(i);
      li = el("li", "bc-chip bc-" + cs + (i === S.idx ? " bc-cur" : ""));
      li.appendChild(el("span", "bc-mk", cs === "ok" ? "✓" : cs === "ng" ? "×" : "—"));
      li.appendChild(document.createTextNode(S.stages[i].name));
      li.setAttribute("aria-label", S.stages[i].name + "：" + (cs === "ok" ? U.chipOk : cs === "ng" ? U.chipNg : i === S.idx ? U.chipNow : U.chipYet));
      if (i === S.idx) li.setAttribute("aria-current", "step");
      chips.appendChild(li);
    }
    $("bc-check").textContent = S.done ? U.next : U.check;
    $("bc-enterhint").textContent = S.done ? U.hintNext : U.hintCheck;
  }

  function freshStageCells() { var st = S.stages[S.idx]; S.cells = []; for (var i = 0; i < st.len; i++) S.cells.push(""); S.focus = st.len - 1; S.bad = {}; S.dir = "rtl"; }

  function newProblem() {
    var p = C.gen(sel.kind, sel.bits, lastP), stages;
    lastP = p; stages = C.stagesOf(p);
    S = { p: p, stages: stages, idx: 0, sst: stages.map(function () { return C.newStageState(); }), results: [], view: [], fixes: [], done: false, doneAt: 0, rows: [], cells: [], focus: 0, dir: "rtl", bad: {} };
    C.recStart(rec, sel.kind, sel.bits); persist();
    freshStageCells();
    buildGrid(); refreshRows(); renderSide(); renderMine();
    $("bc-verify").hidden = true; $("bc-verify").innerHTML = "";
    clearFeedback(); $("bc-extra").textContent = ""; $("bc-cellmsg").textContent = "";
    focusCell(S.focus, true);
  }
  function focusCell(i, noScroll) {
    var r = activeRow(); if (!r || !r.inputs[i]) return;
    try { r.inputs[i].focus({ preventScroll: !!noScroll }); } catch (e) { r.inputs[i].focus(); }
  }
  function activeRow() { for (var i = 0; i < S.rows.length; i++) if (S.rows[i].spec.type === "input" && S.rows[i].spec.stage === S.idx) return S.rows[i]; return null; }

  /* ---- 結果欄 ---- */
  function clearFeedback() { var f = $("bc-feedback"); f.className = "bc-feedback"; f.innerHTML = ""; }
  function showFeedback(kind, head, detail, hint) {
    var f = $("bc-feedback");
    f.className = "bc-feedback bc-" + kind; f.innerHTML = "";
    f.appendChild(el("p", "bc-fh", head));
    if (detail) f.appendChild(el("p", "bc-fd", detail));
    if (hint) f.appendChild(el("p", "bc-fhint", hint));
  }

  /* ---- マスの操作（cellEdit は純粋関数．ここは DOM との橋渡し） ---- */
  function normKey(k) { var t = String(k); try { t = t.normalize("NFKC"); } catch (e) { } return t; }
  function cellIndex(t) { return parseInt(t.getAttribute("data-i"), 10); }
  function isCell(t) { return t && t.classList && t.classList.contains("bc-in") && !t.disabled; }
  function flash(i) {
    var r = activeRow(), e = r && r.inputs[i];
    if (!e) return;
    e.classList.add("bc-flash");
    setTimeout(function () { e.classList.remove("bc-flash"); }, 700);
  }
  function apply(ev, i) {
    if (!S || S.done) return;
    var at, r, before, j;
    if (i != null && !isNaN(i)) S.focus = i;
    at = S.focus; before = S.cells;
    r = C.cellEdit({ cells: S.cells, focus: S.focus, dir: S.dir }, ev);
    S.cells = r.cells; S.focus = r.focus; S.dir = r.dir;
    for (j = 0; j < before.length; j++) if (before[j] !== r.cells[j]) delete S.bad[j];
    $("bc-cellmsg").textContent = r.rejected ? r.msg : r.note;
    refreshRows();
    focusCell(S.focus);
    if (r.rejected) flash(at);
    if (r.submit) check();
    else if (r.msg && !r.rejected) showFeedback("retry", r.msg);
  }
  function setFocusIndex(i) {
    var r = activeRow(); if (!r || isNaN(i)) return;
    S.focus = i;
    r.inputs.forEach(function (e, k) { e.setAttribute("tabindex", k === i ? "0" : "-1"); });
  }
  var compEnd = { t: 0, v: "" };
  function wireGrid() {
    var g = $("bc-grid");
    g.addEventListener("keydown", function (ev) {
      var t = ev.target, k;
      if (!isCell(t) || !S || S.done) return;
      if (ev.isComposing || ev.keyCode === 229) return;                        // IME の変換中は触らない
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      k = normKey(ev.key);
      if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Enter"].indexOf(k) >= 0) {
        ev.preventDefault();
        if (ev.repeat && k === "Enter") return;
        apply({ type: "key", key: k }, cellIndex(t));
      }
    });
    g.addEventListener("input", function (ev) {
      var t = ev.target, v;
      if (!isCell(t) || !S || S.done) return;
      if (ev.isComposing) return;                                              // 確定は compositionend で受ける
      if (performance.now() - compEnd.t < 40 && ev.data === compEnd.v) { refreshRows(); return; }   // 確定の二重受けは捨てる．ブラウザが入れた文字は描き直して消す
      v = (ev.data != null && ev.inputType && ev.inputType.indexOf("insert") === 0) ? ev.data : t.value.slice(-1);   // 何桁かまとめて入る（insertText）ときは全部渡す
      apply({ type: "input", value: v }, cellIndex(t));
    });
    g.addEventListener("compositionend", function (ev) {
      var t = ev.target;
      if (!isCell(t) || !S || S.done) return;
      compEnd = { t: performance.now(), v: ev.data };
      apply({ type: "input", value: ev.data || t.value.slice(-1) }, cellIndex(t));
    });
    ["paste", "cut", "drop"].forEach(function (name) {
      g.addEventListener(name, function (ev) {
        if (!isCell(ev.target)) return;
        ev.preventDefault();
        if (name === "paste") apply({ type: "paste" }, cellIndex(ev.target));
      });
    });
    g.addEventListener("pointerdown", function (ev) {                          // クリック・タップでマスを選んだ：入力の向きは既定（右端から左へ）に戻る
      if (!isCell(ev.target) || !S || S.done) return;
      apply({ type: "focus", index: cellIndex(ev.target) }, cellIndex(ev.target));
    });
    g.addEventListener("focusin", function (ev) {
      var t = ev.target;
      if (!isCell(t) || !S) return;
      setFocusIndex(cellIndex(t));
      try { t.select(); } catch (e) { }
    });
  }

  /* ---- 答え合わせ・段の進行 ---- */
  function lastEmptyFromRight() { for (var i = S.cells.length - 1; i >= 0; i--) if (S.cells[i] === "") return i; return S.cells.length - 1; }
  function check() {
    var st, o;
    if (!S) return;
    if (S.done) { goNext(); return; }
    st = S.stages[S.idx];
    o = C.attempt(S.p, st, S.sst[S.idx], S.cells);
    $("bc-cellmsg").textContent = "";
    if (!o.counted) {                                                         // 空のマスがある：試行に数えない
      showFeedback("retry", o.head);
      S.focus = lastEmptyFromRight(); S.dir = "rtl"; refreshRows(); focusCell(S.focus);
      return;
    }
    S.sst[S.idx] = o.st;
    if (o.final) { settle(st, o); return; }
    S.bad = {}; o.wrong.forEach(function (k) { S.bad[k] = true; });
    refreshRows(); renderSide();
    showFeedback("ng", o.head, o.detail, o.hint);
    S.focus = o.wrong[o.wrong.length - 1]; S.dir = "rtl"; refreshRows(); focusCell(S.focus);
  }
  function settle(st, o) {                                                     // 段が決まった（正解・値を見せた）
    var last = S.idx === S.stages.length - 1, head = o.head, detail = o.detail, kind, sum, ids, wasCleared;
    S.results.push(o.result); S.view[S.idx] = o.reveal ? "rev" : "ok"; S.fixes[S.idx] = o.reveal ? o.wrong : [];
    S.bad = {};
    if (o.reveal && last) head = U.revLast;
    kind = o.reveal ? "retry" : "ok";
    S.idx++;
    if (!last) {
      freshStageCells(); refreshRows(); renderSide();
      showFeedback(kind, head, detail, o.hint);
      focusCell(S.focus);
      return;
    }
    S.done = true; S.doneAt = Date.now();
    ids = S.stages.map(function (x) { return x.id; });
    sum = C.problemSummary(ids, S.results);
    wasCleared = rec.rec[C.comboKey(sel.kind, sel.bits)].cleared;
    C.recFinish(rec, sel.kind, sel.bits, ids, S.results); persist();
    refreshRows(); renderSide(); renderMine();
    showFeedback(sum.perfect ? "clear" : kind, head, detail ? detail + "　" + C.summaryText(S.p.kind, sum) : C.summaryText(S.p.kind, sum), o.hint);
    if (!wasCleared && rec.rec[C.comboKey(sel.kind, sel.bits)].cleared) $("bc-feedback").appendChild(el("p", "bc-fd", U.justCleared));
    showAfterSolved();
    try { $("bc-check").focus({ preventScroll: true }); } catch (e) { $("bc-check").focus(); }
  }
  function showAfterSolved() {
    var p = S.p, v, host = $("bc-verify"), n = p.bits;
    if (p.kind === "viacomp") $("bc-extra").textContent = C.decimalText(p);
    if (p.kind === "comp") {
      v = C.verifyOf(p);
      host.innerHTML = ""; host.hidden = false; host.style.setProperty("--cols", String(n + 1));
      buildRow({ id: "vx", label: T.row.vx, type: "static", digits: v.x }, p, S.stages, true, host);
      buildRow({ id: "vc", label: T.row.vcomp, type: "static", digits: v.comp, op: "＋" }, p, S.stages, true, host);
      buildRow({ id: "vs", label: T.row.vsum, type: "static", digits: v.sum.slice(1), leadText: v.sum.charAt(0), ruled: true }, p, S.stages, true, host);
      $("bc-extra").textContent = T.msg.verify;
    }
  }
  function goNext() {
    if (!S || !S.done) return;
    if (Date.now() - S.doneAt < 400) return;                                   // Enter 連打で飛ばさない
    newProblem();
  }

  /* ---- 記録の画面 ---- */
  function renderMine() {
    var body = $("bc-mine-body"), c = rec.rec[C.comboKey(sel.kind, sel.bits)], need = C.CLEAR_STREAK[sel.kind], weak = C.weakestStage(c, sel.kind);
    var tbl, thead, tr, head, tbody;
    body.innerHTML = "";
    body.appendChild(el("p", "", T.kind[sel.kind] + "・" + T.level[sel.bits] + "（" + T.bits[sel.bits] + "）　" + U.mineTried + " " + c.tried + " 問，" + U.mineFirst + " " + c.perfect + " 問，" + U.streak + " " + Math.min(c.streak, need) + "／" + need));
    if (c.tried === 0 && STAGE_ZERO(c)) body.appendChild(el("p", "bc-note", U.mineNone));
    tbl = el("table"); thead = el("thead"); tr = el("tr");
    U.mineHead.forEach(function (h, i) { head = el("th", i ? "bc-num" : "", h); head.setAttribute("scope", "col"); tr.appendChild(head); });
    thead.appendChild(tr); tbl.appendChild(thead); tbody = el("tbody");
    C.STAGE_IDS[sel.kind].forEach(function (id) {
      var st = c.stage[id], r = el("tr"), nameTd = el("td", "");
      nameTd.appendChild(document.createTextNode(U.stageName[id]));
      if (id === weak) { nameTd.appendChild(document.createTextNode(" ")); nameTd.appendChild(el("span", "bc-weak", U.weak)); }
      r.appendChild(nameTd);
      r.appendChild(el("td", "bc-num", String(st.n))); r.appendChild(el("td", "bc-num", String(st.miss1)));
      r.appendChild(el("td", "bc-num", st.n ? Math.round(st.miss1 * 100 / st.n) + "%" : "—"));
      tbody.appendChild(r);
    });
    tbl.appendChild(tbody); body.appendChild(tbl);
    body.appendChild(el("p", "bc-note", U.mineNote));
  }
  function STAGE_ZERO(c) { return Object.keys(c.stage).every(function (k) { return c.stage[k].n === 0; }); }

  function choose(kind, bits) {
    if (kind === sel.kind && bits === sel.bits && S) return;
    if (S && !S.done) C.recAbandon(rec, sel.kind, sel.bits);   // 解き終わらずに離れた：連続は 0
    sel.kind = kind; sel.bits = bits;
    renderPlayControls(); newProblem();
  }
  function enterPlay(kind) {
    sel.kind = kind;
    show("bc-play-screen");
    renderPlayControls(); newProblem();
  }
  function leavePlay() {                                       // 練習からサブメニューへ（解き終わらずに離れたら連続は 0）
    if (S && !S.done) C.recAbandon(rec, sel.kind, sel.bits);
    S = null; lastP = null; persist();
    renderSubmenu(); show("bc-submenu-screen");
  }

  /* ---- 記録を消す（画面内の確認．最初のフォーカスは「やめる」） ---- */
  function openReset() { $("bc-reset-confirm").hidden = false; $("bc-reset-no").focus(); }
  function closeReset(back) { $("bc-reset-confirm").hidden = true; if (back) $("bc-reset-btn").focus(); }
  function doReset() {
    var kind = sel.kind, bits = sel.bits;                     // 消しても，いま選んでいる種類・難易度は保つ
    if (storage) C.clearRec(storage);
    rec = C.newRec(); sel = rec.sel; sel.kind = kind; sel.bits = bits; lastP = null; S = null;
    closeReset(false);
    renderPlayControls(); renderSubmenu(); newProblem();
  }

  /* ============ 解説 ============ */
  var learnIdx = 0;
  function richText(host, str) {                              // <b>…</b> だけを太字にする（それ以外のタグは使わない）
    String(str).split(/(<b>.*?<\/b>)/).forEach(function (part) {
      var m = /^<b>(.*)<\/b>$/.exec(part);
      if (m) host.appendChild(el("strong", "", m[1]));
      else if (part) host.appendChild(document.createTextNode(part));
    });
  }
  function visGrid(spec, delayBase) {
    var box = el("div", "bc-vis"), row, ci, cells, ch, c, lab, opc, note;
    spec.rows.forEach(function (rw, ri) {
      row = el("div", "bc-vrow bc-fade" + (rw.ruled ? " bc-vruled" : "") + (rw.odo ? " bc-vodo" : ""));
      row.style.setProperty("--d", (delayBase + ri * 0.45).toFixed(2) + "s");
      lab = el("div", "bc-vlab", rw.label || "");
      opc = el("span", "bc-vop", rw.op || "");
      cells = el("div", "bc-vcells");
      for (ci = 0; ci < rw.d.length; ci++) {
        ch = rw.d.charAt(ci);
        c = el("span", "bc-vc" + (ch === " " ? " bc-vph" : "") + (rw.hl && rw.hl.indexOf(ci) >= 0 ? " bc-vhl" : "") + (rw.slash && rw.slash.indexOf(ci) >= 0 ? " bc-vslash" : ""), ch === " " ? "" : ch);
        cells.appendChild(c);
      }
      note = el("div", "bc-vnote", rw.note || "");
      row.appendChild(lab); row.appendChild(opc); row.appendChild(cells); row.appendChild(note);
      box.appendChild(row);
    });
    return box;
  }
  function visual(spec) {
    var O = T.learn.odo;
    if (!spec) return null;
    if (spec.type === "odo") {
      return visGrid({ rows: [
        { label: O.now, d: " " + spec.from, odo: true, note: "km" },
        { label: O.add, d: " " + spec.add, op: "＋" },
        { label: O.sum, d: spec.sum, ruled: true, slash: [0], note: O.noWindow },
        { label: O.shown, d: " " + spec.to, odo: true, hl: [1, 2, 3], note: "km" } ] }, 0.1);
    }
    return visGrid(spec, 0.1);
  }
  function renderLearn() {
    var L = T.learn, step = L.steps[learnIdx], card = $("bc-tutorial-card"), body = el("div", "tutorial-content"), txt = el("div", "tutorial-text"), vis, v, i, dots = $("bc-step-indicators");
    card.innerHTML = "";
    txt.appendChild(el("h3", "bc-learn-h", step.title));
    step.text.forEach(function (t) { var p = el("p", "bc-learn-p"); richText(p, t); txt.appendChild(p); });
    body.appendChild(txt);
    v = visual(step.visual);
    if (v) { vis = el("div", "tutorial-visual"); vis.appendChild(v); body.appendChild(vis); }
    card.appendChild(body);
    $("bc-learn-prev").disabled = learnIdx === 0;
    $("bc-learn-next").textContent = learnIdx === L.steps.length - 1 ? L.done : L.next;
    dots.innerHTML = "";
    for (i = 0; i < L.steps.length; i++) dots.appendChild(el("div", "step-dot" + (i === learnIdx ? " active" : "")));
  }
  function openLearn() { learnIdx = 0; show("bc-learn-screen"); renderLearn(); }
  function learnMove(d) {
    var n = T.learn.steps.length;
    if (d > 0 && learnIdx === n - 1) { renderSubmenu(); show("bc-submenu-screen"); return; }
    learnIdx = Math.max(0, Math.min(n - 1, learnIdx + d)); renderLearn();
  }

  /* ============ 起動 ============ */
  function isActive(id) { var e = $(id); return !!(e && e.classList.contains("active")); }
  function init() {
    // メニューのカード
    $("bc-open-title").textContent = U.menuTitle; $("bc-open-desc").textContent = U.menuDesc;
    $("bc-open-btn").addEventListener("click", function () { renderSubmenu(); show("bc-submenu-screen"); });
    // サブメニュー
    $("bc-submenu-title").textContent = U.submenuTitle;
    $("bc-action-label").textContent = U.actionLabel; $("bc-level-label").textContent = U.levelLabel; $("bc-level-note").textContent = U.levelNote;
    $("bc-learn-title").textContent = U.learnTitle; $("bc-learn-desc").textContent = U.learnDesc;
    C.KINDS.forEach(function (kind) { $("bc-kind-title-" + kind).textContent = T.kind[kind]; $("bc-kind-desc-" + kind).textContent = U.kindDesc[kind]; });
    $("bc-submenu-back-btn").textContent = U.backToMenu;
    $("bc-submenu-back-btn").addEventListener("click", function () { show("menu-screen"); });
    Array.prototype.forEach.call(document.querySelectorAll(".bc-action-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var a = btn.getAttribute("data-action");
        if (a === "learn") openLearn(); else enterPlay(a);
      });
    });
    // 解説
    $("bc-learn-screen-title").textContent = T.learn.title;
    $("bc-learn-prev").textContent = T.learn.prev; $("bc-learn-close").textContent = T.learn.close;
    $("bc-learn-prev").addEventListener("click", function () { learnMove(-1); });
    $("bc-learn-next").addEventListener("click", function () { learnMove(1); });
    $("bc-learn-close").addEventListener("click", function () { renderSubmenu(); show("bc-submenu-screen"); });
    // 練習
    $("bc-back-btn").textContent = U.backToSubShort; $("bc-back-btn").addEventListener("click", leavePlay);
    $("bc-reset-btn").textContent = U.reset;
    $("bc-defs-sum").textContent = U.words; $("bc-mine-sum").textContent = U.mine;
    var body = $("bc-defs-body"); T.defs.concat(U.wordsExtra).forEach(function (t) { body.appendChild(el("p", "", t)); });
    wireGrid();
    $("bc-check").addEventListener("click", function () { check(); });
    $("bc-reset-btn").addEventListener("click", openReset);
    $("bc-reset-no").addEventListener("click", function () { closeReset(true); });
    $("bc-reset-yes").addEventListener("click", doReset);
    $("bc-reset-confirm").addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); closeReset(true); } });
    $("bc-reset-ask").textContent = U.resetAsk; $("bc-reset-yes").textContent = U.resetYes; $("bc-reset-no").textContent = U.resetNo;
    document.addEventListener("keydown", function (ev) {
      var tag = ev.target && ev.target.tagName;
      if (isActive("bc-learn-screen")) {                                      // 解説：← → で前後
        if (ev.key === "ArrowRight" && !$("bc-learn-next").disabled) { ev.preventDefault(); $("bc-learn-next").click(); }
        else if (ev.key === "ArrowLeft" && !$("bc-learn-prev").disabled) { ev.preventDefault(); $("bc-learn-prev").click(); }
        return;
      }
      if (!isActive("bc-play-screen")) return;                                 // 解き終わったあとは，どこにいても Enter で次へ
      if (ev.key !== "Enter" || ev.defaultPrevented || ev.repeat || !S || !S.done) return;
      if (tag === "BUTTON" || tag === "SUMMARY" || tag === "A" || tag === "INPUT") return;
      ev.preventDefault(); goNext();
    });
    renderSubmenu(); updateNote();
  }

  init();

  /* ---- 画面の検査（?selftest=1 のとき．DOM のテキストの禁止語・格子・横スクロール・既存画面に影響しないこと） ---- */
  function domAudit() {
    var out = { combos: 0, problems: 0, states: 0, checked: 0, fail: 0, failures: [], layout: { vw: innerWidth, vh: innerHeight, states: 0, maxDoc: 0, maxBtn: 0, maxGrid: 0, maxPanel: 0, taller: 0, overX: 0 } }, seen = {};
    var MINE = "#bc-open-btn, #bc-submenu-screen, #bc-learn-screen, #bc-play-screen";
    function fail(m) { out.fail++; if (out.failures.length < 20) out.failures.push(m); }
    // app.js が DOMContentLoaded で掴む（querySelector／querySelectorAll）クラス・属性。新カテゴリの要素がこれに当たると，app.js の状態が動く
    var APP_SEL = ".category-select-btn, .submenu-action-btn, .modal-diff-tab-btn, .modal-mode-btn, .timer-container, .bit-switch, .weight-tag, .learn-tabs .diff-btn, .diff-btn, [data-diff], [data-mode], [data-tab]";
    function appHits(label) {
      var mine = document.querySelectorAll("#bc-open-btn, #bc-open-btn *, #bc-submenu-screen, #bc-submenu-screen *, #bc-learn-screen, #bc-learn-screen *, #bc-play-screen, #bc-play-screen *"), i, hit = 0;
      for (i = 0; i < mine.length; i++) if (mine[i].matches(APP_SEL)) hit++;
      out.checked++; if (hit) fail(label + "：新カテゴリの要素 " + hit + " 個が既存の app.js の対象（" + APP_SEL + "）に当たる");
    }
    function mineClone(dropDefs) {                       // このカテゴリの画面だけを写す
      var wrap = document.createElement("div"), list = document.querySelectorAll(MINE);
      Array.prototype.forEach.call(list, function (n) { wrap.appendChild(n.cloneNode(true)); });
      Array.prototype.forEach.call(wrap.querySelectorAll("script, style" + (dropDefs ? ", #bc-defs-body" : "")), function (n) { n.parentNode.removeChild(n); });
      return wrap;
    }
    function texts() {                                   // 定義文（「ことば」）は除いて，各要素の文字・aria-label・title を集める
      var clone = mineClone(true), list = [], i, e, k, attrs = ["aria-label", "title", "placeholder", "alt"], nodes = clone.querySelectorAll("*");
      function add(x) { if (x && !seen[x]) { seen[x] = 1; list.push(x); } }
      add(clone.textContent);
      for (i = 0; i < nodes.length; i++) {
        e = nodes[i]; add(e.textContent);
        for (k = 0; k < attrs.length; k++) if (e.hasAttribute(attrs[k])) add(e.getAttribute(attrs[k]));
        if (e.tagName === "INPUT") add(e.value);
      }
      return list;
    }
    function leaks() {                                    // 解決前の行に模範の値が出ていないか（文字・値・aria-label）を返す
      var found = [];
      S.rows.forEach(function (r) {
        var sp = r.spec, unresolved = sp.type === "input" ? sp.stage > S.idx : sp.type === "copy" ? S.idx <= sp.from : false;
        var active = sp.type === "input" && sp.stage === S.idx, txt = "";
        if (active) {                                     // いまの段：入っているのは本人の入力だけ
          r.inputs.forEach(function (e, i) { if (e.value !== S.cells[i]) found.push(sp.id + " の値が本人の入力と違う"); });
          return;
        }
        if (!unresolved) return;
        Array.prototype.forEach.call(r.el.querySelectorAll(".bc-cells .bc-in, .bc-cells > span:not(.bc-cwrap)"), function (e) { txt += e.tagName === "INPUT" ? e.value : e.textContent; });
        if (txt.replace(/[＋−]/g, "") !== "") found.push(sp.id + " の未解決の行に文字がある「" + txt + "」");
        r.el.querySelectorAll("*").forEach(function (e) {
          var k, a;
          for (k = 0; k < e.attributes.length; k++) {
            a = e.attributes[k];
            if (/^(class|data-i|data-row|type|tabindex|inputmode|autocomplete|autocapitalize|enterkeyhint|spellcheck|disabled|viewbox|focusable|fill|stroke|stroke-width|x|y|width|height|rx|d)$/i.test(a.name)) continue;
            if (a.name === "aria-label") { if (r.inputs.indexOf(e) >= 0 && /未入力$/.test(a.value)) continue; }
            found.push(sp.id + " の属性 " + a.name + "「" + a.value + "」");
          }
        });
        r.inputs.forEach(function (e) { if (e.tagName === "INPUT" && e.value !== "") found.push(sp.id + " の入力欄に値"); });
      });
      return found;
    }
    function meas() {                                    // 画面の収まり：文書の高さ・「答え合わせ」ボタン・筆算・パネルの底（練習画面のとき）
      var L = out.layout, q = function (id) { return $(id).getBoundingClientRect().bottom; }, h = document.documentElement.scrollHeight;
      if (!isActive("bc-play-screen") || $("bc-mine").open || !$("bc-reset-confirm").hidden) return;      // 「きみの記録」を開いた・確認を出した状態は除く
      L.states++; L.maxDoc = Math.max(L.maxDoc, h); L.maxBtn = Math.max(L.maxBtn, q("bc-check")); L.maxGrid = Math.max(L.maxGrid, q("bc-grid")); L.maxPanel = Math.max(L.maxPanel, q("bc-panel"));
      if (h > innerHeight) L.taller++;
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) L.overX++;
    }
    function noScrollX(label) { out.checked++; if (document.documentElement.scrollWidth > document.documentElement.clientWidth) fail(label + "：横スクロールがある"); }
    function audit1(label) {
      var list = texts(), bad = C.checkTexts(list, T.defs);
      out.states++; out.checked += list.length + 1;
      bad.forEach(function (b) { fail(label + "：" + b); });
      (function () {                                      // 「ことば」（定義文）を含む画面全体に，繰り下げ・桁借り・繰り下がり・借りが1つもない
        var whole = mineClone(false).textContent; out.checked++;
        C.BANNED_BORROW.forEach(function (w) { if (whole.indexOf(w) >= 0) fail(label + "：「ことば」を含む画面に「" + w + "」がある"); });
        if ($("bc-defs-body").textContent.indexOf("繰り上げ（桁上げ）") < 0) fail(label + "：「ことば」に加算の定義文がない");
      })();
      if (S) { leaks().forEach(function (b) { fail(label + "：答えの先出し " + b); }); out.checked++; }
      noScrollX(label); meas();
      out.checked++; if (document.querySelector("#bc-play-screen .timer-container, #bc-play-screen .combo-display, #bc-play-screen .timer-bar, #bc-play-screen [id*=timer]")) fail(label + "：タイマー・コンボの部品がある");
    }
    function lockedRowsMatch() {                          // 解決した行の表示が模範の値と一致
      S.rows.forEach(function (r) {
        var st, vals;
        if (r.spec.type !== "input") return;
        st = S.stages[r.spec.stage];
        vals = r.inputs.map(function (e) { return e.value; });
        out.checked++;
        if (vals.join(",") !== st.model.join(",")) fail("解決した行が模範の値と違う：" + C.titleOf(S.p) + " " + st.id);
      });
    }
    function variant(model, kind) {
      return model.map(function (v, i) {
        if (kind === "last") return i === model.length - 1 ? (v === "0" ? "1" : "0") : v;
        return v === "0" ? "1" : "0";
      });
    }
    function runProblem(mode, n) {
      var st = S.stages, si, j, nWrong, model, kinds = ["all", "last"];
      if (mode === 3) { check(); audit1("空で答え合わせ"); }
      for (si = 0; si < st.length; si++) {
        nWrong = (mode === 1 && si === n % st.length) ? 1 : (mode === 2 && si === n % st.length) ? 2 : 0;
        model = st[si].model;
        for (j = 0; j < nWrong; j++) { S.cells = variant(model, kinds[(n + j) % 2]); refreshRows(); check(); audit1("誤り " + C.titleOf(S.p) + " " + st[si].id); }
        if (nWrong < 2) { S.cells = model.slice(); refreshRows(); check(); audit1("正解 " + C.titleOf(S.p) + " " + st[si].id); }
      }
      lockedRowsMatch(); audit1("解き終わり " + C.titleOf(S.p));
      out.problems++;
      S.doneAt = 0; goNext();
    }
    /* 既存の画面に影響しないこと：メニュー・サブメニューの作りと，既存カテゴリの遷移（解説・タイマー・コンボには触れない） */
    (function () {
      var cats = document.querySelectorAll(".category-select-btn"), cards = document.querySelectorAll("#menu-screen .card-btn"), i, ids = ["menu-screen", "submenu-screen", "game-screen", "result-screen", "learn-screen", "settings-modal", "timer-bar", "combo-display", "answer-input", "submit-btn"];
      out.checked += 4 + ids.length;
      if (cats.length !== 3) fail("既存の 3 カテゴリのボタンが " + cats.length + " 個");
      if (cards.length !== 4) fail("メニューのカードが " + cards.length + " 枚（既存 3＋新 1 のはず）");
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
      // 新カテゴリ：メニュー → サブメニュー → メニュー
      out.checked += 3;
      $("bc-open-btn").click();
      if (!isActive("bc-submenu-screen") || $("menu-screen").classList.contains("active")) fail("新カテゴリ：サブメニューへ進まない");
      if ($("bc-submenu-screen").querySelectorAll(".bc-action-btn").length !== 4) fail("新カテゴリのサブメニューのボタンが 4 つでない");
      if ($("bc-diff").querySelectorAll("button").length !== 2 || $("bc-diff").querySelector("[data-level=hard], [data-bits='16']")) fail("難易度が初級・中級の 2 つだけでない（上級が選べる）");
      // 既存の設定モーダルの難易度を，新カテゴリの操作で動かさない（app.js が DOMContentLoaded で掴むクラス・属性・id を，新カテゴリの要素が持たない）
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
        for (i = 0; i < all.length; i++) if (APP_IDS.indexOf(all[i].id) < 0 && /^(menu|submenu|game|result|learn|settings|modal|timer|combo|answer|submit|quit|restart|question|review|tutorial|step)[-_]/.test(all[i].id) && !/^bc-/.test(all[i].id)) fail("既存の命名の id が増えている #" + all[i].id);
        // 難易度を押す：既存の設定モーダルの選択が動かない
        tabs = document.querySelectorAll(".modal-diff-tab-btn");
        before = Array.prototype.map.call(tabs, function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",");
        if (tabs.length !== 3 || before !== "easy:false,medium:true,hard:false") fail("既存の設定モーダルの難易度の初期状態が違う " + before);
        sels = $("bc-diff").querySelectorAll("button"); bad = 0;
        for (k = 0; k < sels.length; k++) { sels[k].click(); if (Array.prototype.map.call(document.querySelectorAll(".modal-diff-tab-btn"), function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",") !== before) bad++; }
        for (k = sels.length - 1; k >= 0; k--) { sels[k].click(); }
        if (bad) fail("新カテゴリの難易度を押すと，既存の設定モーダルの選択が変わる");
        if (document.querySelectorAll(".modal-diff-tab-btn.selected").length !== 1) fail("既存の設定モーダルで選択中の難易度が 1 つでない");
      })();
      $("bc-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("bc-submenu-screen")) fail("新カテゴリ：メニューへ戻らない");
      noScrollX("メニュー");
    })();
    /* 解説：全ステップを出して禁止語・横スクロール */
    (function () {
      var i, n = T.learn.steps.length;
      show("bc-learn-screen");
      for (i = 0; i < n; i++) {
        learnIdx = i; renderLearn(); audit1("解説 " + (i + 1));
        (function () {                                    // 解説：1280×768 以上の画面で，どのステップもスクロールなしに収まり，「次へ」「メニューに戻る」が見える
          var L = out.layout, h = document.documentElement.scrollHeight, nb = $("bc-learn-next").getBoundingClientRect().bottom, cb = $("bc-learn-close").getBoundingClientRect().bottom;
          L.learnSteps = (L.learnSteps || 0) + 1; L.learnMaxClose = Math.max(L.learnMaxClose || 0, cb);
          if (h > innerHeight) L.learnTaller = (L.learnTaller || 0) + 1;
          out.checked++;
          if (innerWidth >= 1280 && innerHeight >= 768 && (h > innerHeight || nb > innerHeight || cb > innerHeight)) fail("解説 " + (i + 1) + "：スクロールが出る（文書の高さ " + h + "／窓 " + innerHeight + "）");
        })();
      }
      out.checked++; if ($("bc-learn-screen").querySelector(".tutorial-visual .bc-vc") === null) fail("解説の絵が出ていない");
      learnIdx = 0;
    })();
    show("bc-play-screen");
    C.KINDS.forEach(function (kind) { C.BITS.forEach(function (bits) {
      var n;
      choose(kind, bits); out.combos++;
      for (n = 0; n < 16; n++) runProblem(n % 4, n);
    }); });
    (function () {                                       // 検査自体が働くこと：画面に禁止語を入れると見つかる
      var keep = $("bc-extra").textContent, found;
      $("bc-extra").textContent = "オーバーフロー"; found = C.checkTexts(texts(), T.defs).length > 0; $("bc-extra").textContent = keep;
      out.checked++; if (!found) fail("画面の禁止語の検査が働かない");
    })();
    (function () {                                       // 先出しの検査自体が働くこと：③の「補数」の行に値を入れると見つかる
      var r, found = false;
      choose("viacomp", 4);
      r = S.rows.filter(function (x) { return x.spec.id === "cmp"; })[0];
      r.statics[0].textContent = "1"; found = leaks().length > 0; r.statics[0].textContent = "";
      r.statics[1].setAttribute("title", "0100"); found = found && leaks().length > 0; r.statics[1].removeAttribute("title");
      out.checked += 2; if (!found || leaks().length) fail("答えの先出しの検査が働かない");
    })();
    appHits("練習・解説の描画後");
    (function () {                                       // 「記録を消す」のあとも，選んでいた種類・難易度（ビット数）が保たれる
      var combos = [["calc", 8], ["comp", 8], ["viacomp", 4], ["comp", 4]], i, kk, bb, c;
      for (i = 0; i < combos.length; i++) {
        kk = combos[i][0]; bb = combos[i][1];
        choose(kk, bb);
        if (S) { S.done = false; }
        $("bc-reset-btn").click(); $("bc-reset-yes").click();
        c = rec.rec[C.comboKey(kk, bb)];
        out.checked += 4;
        if (sel.kind !== kk || sel.bits !== bb) fail("記録を消したあと，選択が " + sel.kind + "/" + sel.bits + " に変わった（" + kk + "/" + bb + " のはず）");
        if (c.tried !== 0 || c.streak !== 0) fail("記録を消したのに記録が残っている");
        if (!S || S.p.kind !== kk || S.p.bits !== bb) fail("記録を消したあとの問題が " + kk + "/" + bb + " でない");
        if (document.querySelector("#bc-bitsw [aria-pressed=true]").getAttribute("data-bits") !== String(bb)) fail("記録を消したあと，難易度のボタンの表示が変わった");
      }
    })();
    $("bc-reset-confirm").hidden = false; audit1("記録を消す確認"); $("bc-reset-confirm").hidden = true;
    $("bc-mine").open = true; audit1("きみの記録"); $("bc-mine").open = false;
    S = null; lastP = null; renderSubmenu(); show("menu-screen");
    return out;
  }

  if (SELFTEST) {
    (function () { var st = document.createElement("style"); st.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }"; document.head.appendChild(st); })();   // 寸法を測るので動きを止める
    setTimeout(function () {
      var rep = C.selfTest(3000, 20261019), au = domAudit(), pre = $("bc-selftest");
      rep.extra.domAudit = { combos: au.combos, problems: au.problems, states: au.states, checked: au.checked, fail: au.fail, layout: au.layout };
      rep.totalChecked += au.checked; rep.totalFail += au.fail; rep.failures = rep.failures.concat(au.failures);
      C.setSeed((Math.random() * 4294967296) >>> 0);        // 自己検査のあとは乱数を戻す
      pre.textContent = "SELFTEST " + JSON.stringify(rep, null, 1); pre.hidden = false;
      window.__selftestResult = rep; console.log("SELFTEST", rep);
    }, 60);
  }
})();
