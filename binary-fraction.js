"use strict";
/* ============ 2進数の小数の画面 ============
   CS Math Trainer の 5 つ目のカテゴリ．app.js は触らず，この画面が自分の 3 つの画面
   （サブメニュー／解説／練習）を .screen の active で切り替える．
   4 つ目のカテゴリ（binary-calc.js）の作りにならい，次を変えた：
   ・向きは 10進数→2進数／2進数→10進数．難易度は 初級（小数第4位まで）／中級（整数部分つき）
   ・作業用紙は ×2 の縦計算（小数部分／×2 の答え／整数）と，位取りの表
   ・入力は，ビット欄（1 マス 1 ビット，左から右）と，数の欄（10進数の小数）と，整数の欄
   ・時間制限・タイマー・コンボは持たない
   ============================================================ */
(function () {
  var C = BinFracCore, T = C.TEXT, U = T.ui, SH = T.sheet, qs = window.location.search;
  var SELFTEST = /[?&]selftest=1(?:&|$)/.test(qs);                // 値がちょうど 1 のときだけ（?selftest=10 などでは有効にならない）

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var LEVEL_ID = { 1: "easy", 2: "medium" };
  var MAX_INPUT = C.MAX_INPUT;

  /* ---- 文字の組み立て：<b>…</b> は太字，^{…} は上付き（それ以外のタグは使わない） ---- */
  function richText(host, str) {
    String(str).split(/(<b>[^<]*<\/b>|\^\{[^}]*\})/).forEach(function (part) {
      var m = /^<b>([^<]*)<\/b>$/.exec(part), q = /^\^\{([^}]*)\}$/.exec(part);
      if (m) host.appendChild(el("strong", m[1].length <= 12 ? "bf-nb" : "", m[1]));
      else if (q) host.appendChild(el("sup", "bf-sup", q[1]));
      else if (part) host.appendChild(document.createTextNode(part));
    });
    return host;
  }
  function rich(tag, cls, str) { return richText(el(tag, cls), str); }
  function titleInto(host, str) {                                   // 「…(2)」の (2) だけ添字に
    var m = /^(.*)\(2\)$/.exec(str);
    host.innerHTML = "";
    if (m) { host.appendChild(document.createTextNode(m[1])); host.appendChild(el("sub", "bf-base", "(2)")); }
    else host.appendChild(document.createTextNode(str));
  }

  /* ---- 画面の切り替え（app.js の showScreen には触らない．.screen をまとめて切り替える） ---- */
  function show(id) {
    var all = document.querySelectorAll(".screen"), i, app = document.querySelector(".app-container");
    for (i = 0; i < all.length; i++) all[i].classList.toggle("active", all[i].id === id);
    if (app) { app.classList.toggle("bf-compact", id === "bf-play-screen"); app.classList.toggle("bf-learn", id === "bf-learn-screen"); app.classList.remove("bc-compact"); app.classList.remove("bc-learn"); }
    document.body.classList.toggle("bf-top", id === "bf-play-screen");
    document.body.classList.remove("bc-top");
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* ---- 記録（localStorage．使えなくてもその場限りで動く） ---- */
  function memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
  var storage = null;
  if (SELFTEST) storage = memStorage();                       // 自己検査は端末の記録を汚さない
  else { try { storage = window.localStorage; } catch (e0) { storage = null; } }
  var loaded = C.loadRec(storage), rec = loaded.rec, storageOk = loaded.usable && !!storage;
  var sel = rec.sel;
  function updateNote() { var n = $("bf-storage-note"); n.textContent = T.msg.storageOff; n.hidden = storageOk; }
  function persist() { storageOk = !!storage && C.saveRec(storage, rec); updateNote(); }

  /* ---- 状態 ---- */
  var S = null, recent = [];

  /* ============ 作業用紙 ============ */
  function makeBitInput(i) {
    var e = document.createElement("input");
    e.type = "text"; e.setAttribute("inputmode", "numeric"); e.setAttribute("autocomplete", "off");
    e.setAttribute("autocapitalize", "off"); e.setAttribute("enterkeyhint", "done"); e.spellcheck = false;
    e.setAttribute("maxlength", String(MAX_INPUT));
    e.className = "bf-in bf-bit"; e.setAttribute("data-i", String(i));
    return e;
  }
  function makeNumInput(i, kind) {                                  // kind：dec（数の欄）／int（整数の欄）
    var e = document.createElement("input");
    e.type = "text"; e.setAttribute("inputmode", kind === "int" ? "numeric" : "decimal"); e.setAttribute("autocomplete", "off");
    e.setAttribute("autocapitalize", "off"); e.setAttribute("enterkeyhint", "done"); e.spellcheck = false;
    e.setAttribute("maxlength", String(kind === "int" ? C.MAX_INT : C.MAX_NUM));
    e.className = "bf-in bf-num " + (kind === "int" ? "bf-int" : "bf-dec"); e.setAttribute("data-i", String(i));
    return e;
  }
  function inputFor(f, i) { return f.kind === "bit" ? makeBitInput(i) : makeNumInput(i, f.kind); }

  function buildSheet() {
    var host = $("bf-sheet"), p = S.p, sts = S.stages, si = 0, line, bits, grid, row, cols, i, st;
    host.innerHTML = ""; S.inputs = []; S.extras = {};
    if (p.kind === "d2b") {
      host.className = "bf-sheet bf-d2b";
      $("bf-panel").classList.remove("bf-p-wide");
      if (p.lv === 2) {
        line = el("div", "bf-line"); line.appendChild(el("div", "bf-rlab", SH.intPart));
        line.appendChild(el("span", "bf-given", String(p.I))); line.appendChild(el("span", "bf-arrow", "→"));
        bits = el("div", "bf-bits");
        S.inputs[si] = sts[si].fields.map(function (f, k) { var e = inputFor(f, k); bits.appendChild(e); return e; });
        line.appendChild(bits); host.appendChild(line); si++;
      }
      grid = el("div", "bf-x2grid");
      ["", SH.fracHead, "", SH.x2Head, SH.intHead].forEach(function (h) { grid.appendChild(el("div", "bf-x2h", h)); });
      S.extras.frac = [];
      for (; si < sts.length && sts[si].type === "x2"; si++) {
        st = sts[si];
        grid.appendChild(el("div", "bf-rlab bf-rowlab", st.name));
        var fr = el("div", "bf-frac"); grid.appendChild(fr); S.extras.frac[si] = fr;
        grid.appendChild(el("div", "bf-times", "×2"));
        S.inputs[si] = st.fields.map(function (f, k) { var e = inputFor(f, k); grid.appendChild(e); return e; });
      }
      host.appendChild(grid);
      line = el("div", "bf-line bf-ansline"); line.appendChild(el("div", "bf-rlab", SH.answer));
      S.extras.lead = el("span", "bf-lead", ""); line.appendChild(S.extras.lead); line.appendChild(el("span", "bf-dot", "."));
      bits = el("div", "bf-bits");
      S.inputs[si] = sts[si].fields.map(function (f, k) { var e = inputFor(f, k); bits.appendChild(e); return e; });
      line.appendChild(bits); host.appendChild(line);
    } else {
      host.className = "bf-sheet bf-b2d";
      cols = sts[0].cols;
      $("bf-panel").classList.toggle("bf-p-wide", cols.length >= 6);
      var lead = p.lv === 2 ? 0 : 1, nd = cols.length, ncol = nd + 1 + lead, intN = cols.filter(function (c) { return c.part === "int"; }).length;
      grid = el("div", "bf-tbl"); grid.style.setProperty("--n", String(nd));
      var tpl;
      // 列：（初級）0 ／ 整数部分の桁 ／ 小数点 ／ 小数部分の桁
      tpl = ["var(--lab)"];
      if (lead) { tpl.push("var(--dw)"); }
      for (i = 0; i < intN; i++) tpl.push("var(--cw)");
      tpl.push("var(--dw)");
      for (i = intN; i < nd; i++) tpl.push("var(--cw)");
      grid.style.gridTemplateColumns = tpl.join(" ");
      function cell(cls, content) { var d = el("div", "bf-tc " + cls); if (content != null) { if (typeof content === "string") richText(d, content); else d.appendChild(content); } grid.appendChild(d); return d; }
      // 位取り
      cell("bf-rlab", SH.place);
      if (lead) cell("bf-gap", "");
      cols.forEach(function (c, ci) { if (ci === intN) cell("bf-gap", ""); cell("bf-hd", "2^{" + (c.exp < 0 ? "−" + (-c.exp) : String(c.exp)) + "}"); });
      if (intN === nd) cell("bf-gap", "");
      // 2進数
      cell("bf-rlab", SH.binary);
      if (lead) cell("bf-gap bf-bn", "0");
      cols.forEach(function (c, ci) { if (ci === intN) cell("bf-gap bf-bn", "."); cell("bf-bd", c.bit); });
      if (intN === nd) cell("bf-gap bf-bn", ".");
      // 10進数
      cell("bf-rlab", SH.decimal);
      if (lead) cell("bf-gap", "");
      S.inputs[0] = [];
      var fi = 0;
      cols.forEach(function (c, ci) {
        if (ci === intN) cell("bf-gap", "");
        if (c.bit === "1") { var e = inputFor(sts[0].fields[fi], fi); var d = el("div", "bf-tc bf-vd"); d.appendChild(e); grid.appendChild(d); S.inputs[0].push(e); fi++; }
        else cell("bf-vd bf-zero", SH.dash);
      });
      if (intN === nd) cell("bf-gap", "");
      // 和
      cell("bf-rlab", SH.sum);
      var sumrow = el("div", "bf-sumrow"); sumrow.style.gridColumn = "2 / -1";
      S.extras.expr = el("span", "bf-expr", ""); sumrow.appendChild(S.extras.expr);
      S.inputs[1] = [inputFor(sts[1].fields[0], 0)]; sumrow.appendChild(S.inputs[1][0]);
      grid.appendChild(sumrow);
      host.appendChild(grid);
    }
  }

  function stageMode(si) { return si < S.idx ? "locked" : si === S.idx ? "active" : "future"; }
  function rowLabelOf(st) { return st.type === "x2" ? st.name : st.type === "bits" ? (st.isInt ? SH.intPart : SH.answer) : st.type === "place" ? SH.decimal : SH.sum; }

  /* ---- 作業用紙の見た目を現在の状態に合わせる ---- */
  function refresh() {
    var p = S.p;
    S.stages.forEach(function (st, si) {
      var mode = stageMode(si), ins = S.inputs[si], rev = mode === "locked" && S.view[si] === "rev";
      st.fields.forEach(function (f, fi) {
        var e = ins[fi], v = mode === "locked" ? f.model : mode === "active" ? S.vals[fi] : "";
        e.value = v; e.disabled = mode !== "active";
        e.className = e.className.replace(/ bf-(locked|active|future|rev|fix|bad|flash)/g, "") + " bf-" + mode + (rev ? " bf-rev" : "");
        if (rev && (S.fixes[si] || []).indexOf(fi) >= 0) e.classList.add("bf-fix");
        if (mode === "active" && S.bad[fi]) e.classList.add("bf-bad");
        e.setAttribute("aria-label", C.cellLabel(rowLabelOf(st), f.name, v));
        if (f.kind === "bit") e.setAttribute("tabindex", mode === "active" && fi === S.focus ? "0" : "-1");
        else e.removeAttribute("tabindex");
      });
    });
    if (p.kind === "d2b") {
      S.stages.forEach(function (st, si) {                                  // 小数部分：1 行目は題から．2 行目以降は，前の行が解けてから写す
        var fr = S.extras.frac && S.extras.frac[si], prev;
        if (!fr) return;
        prev = si - 1;
        fr.textContent = (st.row === 1 || S.idx > prev) ? st.frac : "";
        fr.className = "bf-frac" + (st.row > 1 && S.idx > prev && S.idx === si ? " bf-new" : "");
      });
      S.extras.lead.textContent = p.lv === 2 ? (S.idx > 0 ? p.ib : "") : "0";
      S.extras.lead.className = "bf-lead" + (p.lv === 2 && S.idx === 0 ? " bf-future" : "");
    } else {
      S.extras.expr.textContent = S.idx >= 1 ? C.expressionOf(p) : "";
    }
  }

  /* ---- 画面の各部分 ---- */
  function renderPlayControls() {
    var k = $("bf-kinds"), b = $("bf-lvsw");
    if (!k.firstChild) {
      C.KINDS.forEach(function (kind) {
        var bt = el("button", "bf-kbtn", T.kind[kind]); bt.type = "button"; bt.setAttribute("data-kind", kind);
        bt.addEventListener("click", function () { choose(kind, sel.lv); });
        k.appendChild(bt);
      });
      C.LEVELS.forEach(function (lv) {
        var bt = el("button", "bf-lbtn", T.level[lv] + "（" + T.levelSub[lv] + "）"); bt.type = "button"; bt.setAttribute("data-lv", String(lv));
        bt.addEventListener("click", function () { choose(sel.kind, lv); });
        b.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(k.children, function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-kind") === sel.kind ? "true" : "false"); });
    Array.prototype.forEach.call(b.children, function (bt) { bt.setAttribute("aria-pressed", bt.getAttribute("data-lv") === String(sel.lv) ? "true" : "false"); });
  }
  // サブメニュー：難易度の選択と，カードごとの ✓（初級・中級）
  function renderSubmenu() {
    var d = $("bf-diff"), ticks = document.querySelectorAll(".bf-ticks");
    if (!d.firstChild) {
      C.LEVELS.forEach(function (lv) {
        var bt = el("button", "bf-diff-btn"); bt.type = "button";              // 既存の .modal-diff-tab-btn（app.js が掴む）は使わない
        bt.setAttribute("data-lv", String(lv)); bt.setAttribute("data-level", LEVEL_ID[lv]);
        bt.appendChild(document.createTextNode(T.level[lv])); bt.appendChild(document.createElement("br"));
        bt.appendChild(el("span", "bf-diffsub", T.levelSub[lv]));
        bt.addEventListener("click", function () { sel.lv = lv; persist(); renderSubmenu(); });
        d.appendChild(bt);
      });
    }
    Array.prototype.forEach.call(d.children, function (bt) {
      var on = bt.getAttribute("data-lv") === String(sel.lv);
      bt.classList.toggle("bf-sel", on); bt.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(ticks, function (host) {
      var kind = host.getAttribute("data-kind");
      host.innerHTML = "";
      C.LEVELS.forEach(function (lv) {
        var done = C.tickOf(rec, kind, lv), it = el("span", "bf-tick" + (done ? " bf-done" : ""));
        it.appendChild(document.createTextNode(T.level[lv] + " "));
        it.appendChild(el("span", "bf-mk", done ? "✓" : "—"));
        it.setAttribute("aria-label", T.level[lv] + "（" + T.levelSub[lv] + "）：" + (done ? U.cleared : U.notYet));
        host.appendChild(it);
      });
    });
  }
  function renderStreak() {
    var host = $("bf-streak"), c = rec.rec[C.comboKey(sel.kind, sel.lv)], need = C.CLEAR_STREAK[sel.kind], i, d;
    host.innerHTML = "";
    host.appendChild(document.createTextNode(U.streak + " "));
    for (i = 0; i < need; i++) { d = el("span", "bf-dot-s" + (i < Math.min(c.streak, need) ? " bf-on" : "")); d.setAttribute("aria-hidden", "true"); host.appendChild(d); }
    host.appendChild(el("span", "bf-sr", Math.min(c.streak, need) + "／" + need));
    if (c.cleared) host.appendChild(el("span", "bf-clearmark", "✓"));
    host.title = U.streakNote;
  }
  function chipState(i) {
    var s = S.sst[i];
    if (s.result === "ok1") return "ok";
    if (s.attempts >= 1) return "ng";
    return "yet";
  }
  function renderSide() {
    var chips = $("bf-chips"), i, st, cs, li;
    titleInto($("bf-qtitle"), C.titleOf(S.p));
    $("bf-qkind").textContent = T.kind[S.p.kind] + "　" + T.level[S.p.lv];
    renderStreak();
    if (S.idx < S.stages.length) {
      st = S.stages[S.idx];
      $("bf-stagehead").innerHTML = "";
      $("bf-stagehead").appendChild(document.createTextNode(U.stage + " " + (S.idx + 1) + "／" + S.stages.length + "　"));
      $("bf-stagehead").appendChild(el("b", "", st.name));
      $("bf-instr").textContent = st.instr;
    } else {
      $("bf-stagehead").textContent = U.stageEnd;
      $("bf-instr").textContent = "";
    }
    chips.innerHTML = "";
    for (i = 0; i < S.stages.length; i++) {
      cs = chipState(i);
      li = el("li", "bf-chip bf-" + cs + (i === S.idx ? " bf-cur" : ""));
      li.appendChild(el("span", "bf-mk", cs === "ok" ? "✓" : cs === "ng" ? "×" : "—"));
      li.appendChild(document.createTextNode(S.stages[i].name));
      li.setAttribute("aria-label", S.stages[i].name + "：" + (cs === "ok" ? U.chipOk : cs === "ng" ? U.chipNg : i === S.idx ? U.chipNow : U.chipYet));
      if (i === S.idx) li.setAttribute("aria-current", "step");
      chips.appendChild(li);
    }
    $("bf-check").textContent = S.done ? U.next : U.check;
    $("bf-enterhint").textContent = S.done ? U.hintNext : U.hintCheck;
  }

  function freshStage() { var st = S.stages[S.idx]; S.vals = st.fields.map(function () { return ""; }); S.focus = 0; S.bad = {}; }

  function newProblem() {
    var p = C.gen(sel.kind, sel.lv, recent), stages;
    recent.push(p.key); if (recent.length > C.AVOID) recent.shift();
    stages = C.stagesOf(p);
    S = { p: p, stages: stages, idx: 0, sst: stages.map(function () { return C.newStageState(); }), results: [], view: [], fixes: [], done: false, doneAt: 0, inputs: [], extras: {}, vals: [], focus: 0, bad: {} };
    C.recStart(rec, sel.kind, sel.lv); persist();
    freshStage();
    buildSheet(); refresh(); renderSide(); renderMine();
    clearFeedback(); $("bf-extra").textContent = ""; $("bf-cellmsg").textContent = "";
    focusField(S.focus, true);
  }
  function focusField(i, noScroll) {
    var ins = S.inputs[S.idx], e = ins && ins[i];
    if (!e || e.disabled) return;
    try { e.focus({ preventScroll: !!noScroll }); } catch (er) { e.focus(); }
  }

  /* ---- 結果欄 ---- */
  function clearFeedback() { var f = $("bf-feedback"); f.className = "bf-feedback"; f.innerHTML = ""; }
  function showFeedback(kind, head, detail, hint) {
    var f = $("bf-feedback");
    f.className = "bf-feedback bf-" + kind; f.innerHTML = "";
    f.appendChild(el("p", "bf-fh", head));
    if (detail) f.appendChild(el("p", "bf-fd", detail));
    if (hint) f.appendChild(el("p", "bf-fhint", hint));
  }

  /* ---- 入力の受け取り ---- */
  function normKey(k) { var t = String(k); try { t = t.normalize("NFKC"); } catch (e) { } return t; }
  function fieldIndex(t) { return parseInt(t.getAttribute("data-i"), 10); }
  function isField(t) { return t && t.classList && t.classList.contains("bf-in") && !t.disabled; }
  function flash(i) {
    var ins = S && S.inputs[S.idx], e = ins && ins[i];
    if (!e) return;
    e.classList.add("bf-flash");
    setTimeout(function () { e.classList.remove("bf-flash"); }, 700);
  }
  function setFocusIndex(i) {
    var ins = S.inputs[S.idx];
    if (!ins || isNaN(i)) return;
    S.focus = i;
    if (S.stages[S.idx].fields[i] && S.stages[S.idx].fields[i].kind === "bit") ins.forEach(function (e, k) { e.setAttribute("tabindex", k === i ? "0" : "-1"); });
  }
  // ビット欄（cellEdit は純粋関数．ここは DOM との橋渡し）
  function applyBit(ev, i) {
    if (!S || S.done) return;
    var at, r, before, j;
    if (i != null && !isNaN(i)) S.focus = i;
    at = S.focus; before = S.vals;
    r = C.cellEdit({ cells: S.vals, focus: S.focus }, ev);
    S.vals = r.cells; S.focus = r.focus;
    for (j = 0; j < before.length; j++) if (before[j] !== r.cells[j]) delete S.bad[j];
    $("bf-cellmsg").textContent = r.rejected ? r.msg : r.note;
    refresh();
    focusField(S.focus);
    if (r.rejected) flash(at);
    if (r.submit) check();
  }
  // 数の欄・整数の欄：入れてよい文字だけを残す
  function applyNum(t) {
    var i = fieldIndex(t), kind = S.stages[S.idx].fields[i].kind, r = kind === "int" ? C.sanitizeInt(t.value) : C.sanitizeNum(t.value);
    if (r.value !== t.value) t.value = r.value;
    if (S.vals[i] !== r.value) delete S.bad[i];
    S.vals[i] = r.value; S.focus = i;
    t.classList.remove("bf-bad");
    $("bf-cellmsg").textContent = r.rejected ? (kind === "int" ? T.msg.rejectInt : T.msg.rejectNum) : "";
    if (r.rejected) flash(i);
  }
  var compEnd = { t: 0, v: "" };
  function wireSheet() {
    var g = $("bf-sheet");
    g.addEventListener("keydown", function (ev) {
      var t = ev.target, k;
      if (!isField(t) || !S || S.done) return;
      if (ev.isComposing || ev.keyCode === 229) return;                        // IME の変換中は触らない
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      k = normKey(ev.key);
      if (t.classList.contains("bf-bit")) {
        if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Enter"].indexOf(k) >= 0) {
          ev.preventDefault();
          if (ev.repeat && k === "Enter") return;
          applyBit({ type: "key", key: k }, fieldIndex(t));
        }
      } else if (k === "Enter") {
        ev.preventDefault();
        if (ev.repeat) return;
        S.focus = fieldIndex(t);
        check();
      }
    });
    g.addEventListener("input", function (ev) {
      var t = ev.target, v;
      if (!isField(t) || !S || S.done) return;
      if (ev.isComposing) return;                                              // 確定は compositionend で受ける
      if (t.classList.contains("bf-num")) { applyNum(t); return; }
      if (performance.now() - compEnd.t < 40 && ev.data === compEnd.v) { refresh(); return; }   // 確定の二重受けは捨てる．ブラウザが入れた文字は描き直して消す
      v = (ev.data != null && ev.inputType && ev.inputType.indexOf("insert") === 0) ? String(ev.data).slice(0, MAX_INPUT) : t.value.slice(-1);
      applyBit({ type: "input", value: v }, fieldIndex(t));
    });
    g.addEventListener("compositionend", function (ev) {
      var t = ev.target;
      if (!isField(t) || !S || S.done) return;
      if (t.classList.contains("bf-num")) { applyNum(t); return; }
      compEnd = { t: performance.now(), v: ev.data };
      applyBit({ type: "input", value: String(ev.data || "").slice(0, MAX_INPUT) || t.value.slice(-1) }, fieldIndex(t));
    });
    ["paste", "cut", "drop"].forEach(function (name) {
      g.addEventListener(name, function (ev) {
        if (!isField(ev.target) || !ev.target.classList.contains("bf-bit")) return;      // 数の欄は貼り付けてよい（入れてよい文字だけ残る）
        ev.preventDefault();
        if (name === "paste") applyBit({ type: "paste" }, fieldIndex(ev.target));
      });
    });
    g.addEventListener("pointerdown", function (ev) {
      if (!isField(ev.target) || !S || S.done) return;
      if (ev.target.classList.contains("bf-bit")) applyBit({ type: "focus", index: fieldIndex(ev.target) }, fieldIndex(ev.target));
    });
    g.addEventListener("focusin", function (ev) {
      var t = ev.target;
      if (!isField(t) || !S) return;
      setFocusIndex(fieldIndex(t));
      try { t.select(); } catch (e) { }
    });
  }

  /* ---- 答え合わせ・段の進行 ---- */
  function check() {
    var st, o, fe;
    if (!S) return;
    if (S.done) { goNext(); return; }
    st = S.stages[S.idx];
    o = C.attempt(S.p, st, S.sst[S.idx], S.vals);
    $("bf-cellmsg").textContent = "";
    if (!o.counted) {                                                         // 空の欄がある：試行に数えない．Enter も「答え合わせ」ボタンも同じ（先頭の空きへ）
      showFeedback("retry", o.head);
      fe = C.firstEmpty(S.vals); S.focus = fe; refresh(); focusField(S.focus);
      return;
    }
    S.sst[S.idx] = o.st;
    if (o.final) { settle(st, o); return; }
    S.bad = {}; o.wrong.forEach(function (k) { S.bad[k] = true; });
    refresh(); renderSide();
    showFeedback("ng", o.head, o.detail, o.hint);
    S.focus = o.wrong[0]; refresh(); focusField(S.focus);
  }
  function settle(st, o) {                                                     // 段が決まった（正解・値を見せた）
    var last = S.idx === S.stages.length - 1, head = o.head, detail = o.detail, kind, sum, col, wasCleared;
    S.results.push(o.result); S.view[S.idx] = o.reveal ? "rev" : "ok"; S.fixes[S.idx] = o.reveal ? o.wrong : [];
    S.bad = {};
    if (o.reveal && last) head = U.revLast;
    kind = o.reveal ? "retry" : "ok";
    S.idx++;
    if (!last) {
      freshStage(); refresh(); renderSide();
      showFeedback(kind, head, detail, o.hint);
      focusField(S.focus);
      return;
    }
    S.done = true; S.doneAt = Date.now();
    col = C.collapse(S.stages, S.results); sum = C.problemSummary(col.ids, col.results);
    wasCleared = rec.rec[C.comboKey(sel.kind, sel.lv)].cleared;
    C.recFinish(rec, sel.kind, sel.lv, S.stages, S.results); persist();
    refresh(); renderSide(); renderMine();
    showFeedback(sum.perfect ? "clear" : kind, head, detail ? detail + "　" + C.summaryText(sum) : C.summaryText(sum), o.hint);
    if (!wasCleared && rec.rec[C.comboKey(sel.kind, sel.lv)].cleared) $("bf-feedback").appendChild(el("p", "bf-fd", U.justCleared));
    if (S.p.kind === "d2b") $("bf-extra").textContent = C.confirmText(S.p);
    try { $("bf-check").focus({ preventScroll: true }); } catch (e) { $("bf-check").focus(); }
  }
  function goNext() {
    if (!S || !S.done) return;
    if (Date.now() - S.doneAt < 400) return;                                   // Enter 連打で飛ばさない
    newProblem();
  }

  /* ---- 記録の画面 ---- */
  function renderMine() {
    var body = $("bf-mine-body"), c = rec.rec[C.comboKey(sel.kind, sel.lv)], need = C.CLEAR_STREAK[sel.kind], weak = C.weakestStage(c, sel.kind);
    var tbl, thead, tr, head, tbody;
    body.innerHTML = "";
    body.appendChild(el("p", "", T.kind[sel.kind] + "・" + T.level[sel.lv] + "（" + T.levelSub[sel.lv] + "）　" + U.mineTried + " " + c.tried + " 問，" + U.mineFirst + " " + c.perfect + " 問，" + U.streak + " " + Math.min(c.streak, need) + "／" + need));
    if (c.tried === 0) body.appendChild(el("p", "bf-note", U.mineNone));
    tbl = el("table"); thead = el("thead"); tr = el("tr");
    U.mineHead.forEach(function (h, i) { head = el("th", i ? "bf-num" : "", h); head.setAttribute("scope", "col"); tr.appendChild(head); });
    thead.appendChild(tr); tbl.appendChild(thead); tbody = el("tbody");
    C.STAGE_IDS[sel.kind].forEach(function (id) {
      var st = c.stage[id], r = el("tr"), nameTd = el("td", "");
      if (id === "int" && sel.lv === 1) return;                                // 整数部分の段は中級だけ
      nameTd.appendChild(document.createTextNode(U.stageName[id]));
      if (id === weak) { nameTd.appendChild(document.createTextNode(" ")); nameTd.appendChild(el("span", "bf-weak", U.weak)); }
      r.appendChild(nameTd);
      r.appendChild(el("td", "bf-num", String(st.n))); r.appendChild(el("td", "bf-num", String(st.miss1)));
      r.appendChild(el("td", "bf-num", st.n ? Math.floor((st.miss1 * 200 + st.n) / (st.n * 2)) + "%" : "—"));
      tbody.appendChild(r);
    });
    tbl.appendChild(tbody); body.appendChild(tbl);
    body.appendChild(el("p", "bf-note", U.mineNote));
  }

  function choose(kind, lv) {
    if (kind === sel.kind && lv === sel.lv && S) return;
    if (S && !S.done) C.recAbandon(rec, sel.kind, sel.lv);   // 解き終わらずに離れた：連続は 0
    sel.kind = kind; sel.lv = lv; recent = [];
    renderPlayControls(); newProblem();
  }
  function enterPlay(kind) {
    sel.kind = kind; recent = [];
    show("bf-play-screen");
    renderPlayControls(); newProblem();
  }
  function leavePlay() {                                       // 練習からサブメニューへ（解き終わらずに離れたら連続は 0）
    if (S && !S.done) C.recAbandon(rec, sel.kind, sel.lv);
    S = null; recent = []; persist();
    renderSubmenu(); show("bf-submenu-screen");
  }

  /* ---- 記録を消す（画面内の確認．最初のフォーカスは「やめる」） ---- */
  function openReset() { $("bf-reset-confirm").hidden = false; $("bf-reset-no").focus(); }
  function closeReset(back) { $("bf-reset-confirm").hidden = true; if (back) $("bf-reset-btn").focus(); }
  function doReset() {
    var kind = sel.kind, lv = sel.lv;                         // 消しても，いま選んでいる向き・難易度は保つ
    if (storage) C.clearRec(storage);
    rec = C.newRec(); sel = rec.sel; sel.kind = kind; sel.lv = lv; recent = []; S = null;
    closeReset(false);
    renderPlayControls(); renderSubmenu(); newProblem();
  }

  /* ============ 解説 ============ */
  var learnIdx = 0;
  function dcell(cls, content, delay) { var d = el("div", "bf-vc " + cls); richText(d, content); return d; }
  function visTbl(spec, delayBase) {
    var box = el("div", "bf-vis bf-vtbl bf-fade"), n = spec.rows[0].cells.length, tpl = ["var(--vlab)"], i, ri, row, rw, c, hasSep = !!spec.sep;
    box.style.setProperty("--d", delayBase);
    for (i = 0; i < n; i++) {
      if (hasSep && i > 0) tpl.push("var(--vsep)");
      tpl.push(spec.rows[0].cells[i] === "." ? "var(--vdot)" : "var(--vcw)");
    }
    box.style.gridTemplateColumns = tpl.join(" ");
    spec.rows.forEach(function (rw2, ri2) {
      box.appendChild(rich("div", "bf-vlab", rw2.label));
      rw2.cells.forEach(function (cc, ci) {
        if (hasSep && ci > 0) box.appendChild(el("div", "bf-vsepc", ri2 === spec.rows.length - 1 ? spec.sep : ""));
        box.appendChild(rich("div", "bf-vc" + (cc === "." ? " bf-vdotc" : "") + (cc === "—" ? " bf-vzero" : "") + (C.plain(cc).length >= 6 ? " bf-vlong" : "") + (rw2.hl && rw2.hl.indexOf(ci) >= 0 ? " bf-vhl" : ""), cc));
      });
    });
    return box;
  }
  function visX2(spec, delayBase) {
    var box = el("div", "bf-vis bf-vx2 bf-fade"), L = T.learn.cols;
    box.style.setProperty("--d", delayBase);
    [L.frac, "", L.x2, L.int].forEach(function (h) { box.appendChild(el("div", "bf-vh", h)); });
    spec.rows.forEach(function (rw) {
      box.appendChild(el("div", "bf-vc", rw[0])); box.appendChild(el("div", "bf-vt", "×2")); box.appendChild(el("div", "bf-vc", rw[1]));
      box.appendChild(el("div", "bf-vc" + (spec.hl === "int" ? " bf-vhl" : ""), rw[2]));
    });
    return box;
  }
  function visX2h(spec, delayBase) {
    var box = el("div", "bf-vis bf-vx2h bf-fade"), L = T.learn.cols, n = spec.rows.length;
    box.style.setProperty("--d", delayBase);
    box.style.gridTemplateColumns = "var(--vlab) repeat(" + n + ", var(--vcw))";
    [[L.frac, 0], [L.x2, 1], [L.int, 2]].forEach(function (pr) {
      box.appendChild(el("div", "bf-vlab", pr[0]));
      spec.rows.forEach(function (rw, ci) { box.appendChild(el("div", "bf-vc" + (pr[1] === 0 && spec.hl.indexOf(ci) >= 0 ? " bf-vhl" : ""), rw[pr[1]])); });
    });
    return box;
  }
  function visual(spec) {
    if (!spec) return null;
    if (spec.type === "tbl") return visTbl(spec, "0.1s");
    if (spec.type === "x2") return visX2(spec, "0.1s");
    return visX2h(spec, "0.1s");
  }
  function renderLearn() {
    var L = T.learn, step = L.steps[learnIdx], card = $("bf-tutorial-card"), body = el("div", "tutorial-content"), txt = el("div", "tutorial-text"), vis, v, i, dots = $("bf-step-indicators");
    card.innerHTML = "";
    txt.appendChild(el("h3", "bf-learn-h", ""));
    richText(txt.firstChild, step.title);
    step.text.forEach(function (t) { var p = el("p", "bf-learn-p"); richText(p, t); txt.appendChild(p); });
    body.appendChild(txt);
    v = visual(step.visual);
    if (v) { vis = el("div", "tutorial-visual"); vis.appendChild(v); body.appendChild(vis); }
    card.appendChild(body);
    $("bf-learn-prev").disabled = learnIdx === 0;
    $("bf-learn-next").textContent = learnIdx === L.steps.length - 1 ? L.done : L.next;
    dots.innerHTML = "";
    for (i = 0; i < L.steps.length; i++) dots.appendChild(el("div", "step-dot" + (i === learnIdx ? " active" : "")));
  }
  function openLearn() { learnIdx = 0; show("bf-learn-screen"); renderLearn(); }
  function learnMove(d) {
    var n = T.learn.steps.length;
    if (d > 0 && learnIdx === n - 1) { renderSubmenu(); show("bf-submenu-screen"); return; }
    learnIdx = Math.max(0, Math.min(n - 1, learnIdx + d)); renderLearn();
  }

  /* ============ 起動 ============ */
  function isActive(id) { var e = $(id); return !!(e && e.classList.contains("active")); }
  function init() {
    // メニューのカード
    $("bf-open-title").textContent = U.menuTitle; $("bf-open-desc").textContent = U.menuDesc;
    $("bf-open-btn").addEventListener("click", function () { renderSubmenu(); show("bf-submenu-screen"); });
    if (SELFTEST) { $("bf-selftest-note").textContent = T.msg.selftestNote; $("bf-selftest-note").hidden = false; }     // 自己検査中は記録が保存されないことを画面の隅に出す
    // サブメニュー
    $("bf-submenu-title").textContent = U.submenuTitle;
    $("bf-action-label").textContent = U.actionLabel; $("bf-level-label").textContent = U.levelLabel; $("bf-level-note").textContent = U.levelNote;
    $("bf-learn-title").textContent = U.learnTitle; $("bf-learn-desc").textContent = U.learnDesc;
    C.KINDS.forEach(function (kind) { $("bf-kind-title-" + kind).textContent = T.kind[kind]; $("bf-kind-desc-" + kind).textContent = U.kindDesc[kind]; });
    $("bf-submenu-back-btn").textContent = U.backToMenu;
    $("bf-submenu-back-btn").addEventListener("click", function () { show("menu-screen"); });
    Array.prototype.forEach.call(document.querySelectorAll(".bf-action-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var a = btn.getAttribute("data-action");
        if (a === "learn") openLearn(); else enterPlay(a);
      });
    });
    // 解説
    $("bf-learn-screen-title").textContent = T.learn.title;
    $("bf-learn-prev").textContent = T.learn.prev; $("bf-learn-close").textContent = T.learn.close;
    $("bf-learn-prev").addEventListener("click", function () { learnMove(-1); });
    $("bf-learn-next").addEventListener("click", function () { learnMove(1); });
    $("bf-learn-close").addEventListener("click", function () { renderSubmenu(); show("bf-submenu-screen"); });
    // 練習
    $("bf-back-btn").textContent = U.backToSubShort; $("bf-back-btn").addEventListener("click", leavePlay);
    $("bf-reset-btn").textContent = U.reset;
    $("bf-defs-sum").textContent = U.words; $("bf-mine-sum").textContent = U.mine;
    var body = $("bf-defs-body"); T.defs.concat(U.wordsExtra).forEach(function (t) { body.appendChild(rich("p", "", t)); });
    wireSheet();
    $("bf-check").addEventListener("click", function () { check(); });
    $("bf-reset-btn").addEventListener("click", openReset);
    $("bf-reset-no").addEventListener("click", function () { closeReset(true); });
    $("bf-reset-yes").addEventListener("click", doReset);
    $("bf-reset-confirm").addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); closeReset(true); } });
    $("bf-reset-ask").textContent = U.resetAsk; $("bf-reset-yes").textContent = U.resetYes; $("bf-reset-no").textContent = U.resetNo;
    document.addEventListener("keydown", function (ev) {
      var tag = ev.target && ev.target.tagName;
      if (isActive("bf-learn-screen")) {                                      // 解説：← → で前後
        if (ev.key === "ArrowRight" && !$("bf-learn-next").disabled) { ev.preventDefault(); $("bf-learn-next").click(); }
        else if (ev.key === "ArrowLeft" && !$("bf-learn-prev").disabled) { ev.preventDefault(); $("bf-learn-prev").click(); }
        return;
      }
      if (!isActive("bf-play-screen")) return;                                 // 解き終わったあとは，どこにいても Enter で次へ
      if (ev.key !== "Enter" || ev.defaultPrevented || ev.repeat || !S || !S.done) return;
      if (tag === "BUTTON" || tag === "SUMMARY" || tag === "A" || tag === "INPUT") return;
      ev.preventDefault(); goNext();
    });
    renderSubmenu(); updateNote();
  }

  init();

  /* ---- 画面の検査（?selftest=1 のとき．DOM のテキストの禁止語・先出し・横スクロール・既存画面に影響しないこと） ---- */
  function domAudit() {
    var out = { combos: 0, problems: 0, states: 0, checked: 0, fail: 0, failures: [], layout: { vw: innerWidth, vh: innerHeight, states: 0, maxDoc: 0, maxBtn: 0, maxSheet: 0, maxPanel: 0, taller: 0, overX: 0, maxShift: 0 } }, seen = {};
    var MINE = "#bf-open-btn, #bf-submenu-screen, #bf-learn-screen, #bf-play-screen";
    function fail(m) { out.fail++; if (out.failures.length < 20) out.failures.push(m); }
    // app.js が DOMContentLoaded で掴む（querySelector／querySelectorAll）クラス・属性。新カテゴリの要素がこれに当たると，app.js の状態が動く
    var APP_SEL = ".category-select-btn, .submenu-action-btn, .modal-diff-tab-btn, .modal-mode-btn, .timer-container, .bit-switch, .weight-tag, .learn-tabs .diff-btn, .diff-btn, [data-diff], [data-mode], [data-tab]";
    function appHits(label) {
      var mine = document.querySelectorAll("#bf-open-btn, #bf-open-btn *, #bf-submenu-screen, #bf-submenu-screen *, #bf-learn-screen, #bf-learn-screen *, #bf-play-screen, #bf-play-screen *"), i, hit = 0;
      for (i = 0; i < mine.length; i++) if (mine[i].matches(APP_SEL)) hit++;
      out.checked++; if (hit) fail(label + "：新カテゴリの要素 " + hit + " 個が既存の app.js の対象（" + APP_SEL + "）に当たる");
    }
    function mineClone(dropDefs) {                       // このカテゴリの画面だけを写す
      var wrap = document.createElement("div"), list = document.querySelectorAll(MINE);
      Array.prototype.forEach.call(list, function (n) { wrap.appendChild(n.cloneNode(true)); });
      Array.prototype.forEach.call(wrap.querySelectorAll("script, style" + (dropDefs ? ", #bf-defs-body" : "")), function (n) { n.parentNode.removeChild(n); });
      return wrap;
    }
    function texts() {                                   // 各要素の文字・aria-label・title・value を集める
      var clone = mineClone(false), list = [], i, e, k, attrs = ["aria-label", "title", "placeholder", "alt"], nodes = clone.querySelectorAll("*");
      function add(x) { if (x && !seen[x]) { seen[x] = 1; list.push(x); } }
      add(clone.textContent);
      for (i = 0; i < nodes.length; i++) {
        e = nodes[i]; add(e.textContent);
        for (k = 0; k < attrs.length; k++) if (e.hasAttribute(attrs[k])) add(e.getAttribute(attrs[k]));
        if (e.tagName === "INPUT") add(e.value);
      }
      return list;
    }
    function leaks() {                                    // 解決前の欄・行に模範の値が出ていないか（文字・値・属性）を返す
      var found = [], p = S.p;
      S.stages.forEach(function (st, si) {
        var mode = stageMode(si);
        S.inputs[si].forEach(function (e, fi) {
          var k, a;
          if (mode === "active" && e.value !== S.vals[fi]) found.push(st.key + " の値が本人の入力と違う");
          if (mode === "future") {
            if (e.value !== "") found.push(st.key + " の未解決の欄に値「" + e.value + "」");
            for (k = 0; k < e.attributes.length; k++) {
              a = e.attributes[k];
              if (/^(class|data-i|type|tabindex|inputmode|autocomplete|autocapitalize|enterkeyhint|spellcheck|maxlength|disabled)$/i.test(a.name)) continue;
              if (a.name === "aria-label" && /未入力$/.test(a.value)) continue;
              found.push(st.key + " の属性 " + a.name + "「" + a.value + "」");
            }
          }
        });
      });
      if (p.kind === "d2b") {
        S.stages.forEach(function (st, si) {              // 前の行が解けるまで，2 行目以降の小数部分は空
          var fr = S.extras.frac && S.extras.frac[si];
          if (fr && st.row > 1 && S.idx <= si - 1 && fr.textContent !== "") found.push(st.key + " の小数部分が先に出ている「" + fr.textContent + "」");
        });
        if (p.lv === 2 && S.idx === 0 && S.extras.lead.textContent !== "") found.push("整数部分の 2 進数が先に出ている");
      } else if (S.idx < 1 && S.extras.expr.textContent !== "") found.push("和の式が先に出ている");
      return found;
    }
    function meas(label) {                                    // 画面の収まり：文書の高さ・「答え合わせ」ボタン・作業用紙・パネルの底（練習画面のとき）
      var L = out.layout, q = function (id) { return $(id).getBoundingClientRect().bottom; }, h = document.documentElement.scrollHeight;
      if (!isActive("bf-play-screen") || $("bf-mine").open || !$("bf-reset-confirm").hidden) return;      // 「きみの記録」を開いた・確認を出した状態は除く
      L.states++; L.maxDoc = Math.max(L.maxDoc, h); L.maxBtn = Math.max(L.maxBtn, q("bf-check")); L.maxSheet = Math.max(L.maxSheet, q("bf-sheet")); L.maxPanel = Math.max(L.maxPanel, q("bf-panel"));
      if (h > innerHeight && innerWidth >= 768 && innerHeight >= 768) fail("スクロールが出る（文書の高さ " + h + "／窓 " + innerHeight + "）：" + label);
      if (h > innerHeight) { L.taller++; (L.tallLabels = L.tallLabels || []).length < 8 && L.tallLabels.push(label + " " + h); }
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) L.overX++;
    }
    function noScrollX(label) {
      var act = document.querySelector(".screen.active"), nodes, i, r, bad = 0, w = document.documentElement.clientWidth;
      out.checked += 2;
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) fail(label + "：横スクロールがある");
      if (!act) return;                                   // style.css の body は overflow-x: hidden なので，はみ出しは scrollWidth に出ない．要素の右端・左端を直接見る
      nodes = act.querySelectorAll("*");
      for (i = 0; i < nodes.length; i++) { r = nodes[i].getBoundingClientRect(); if (r.width > 0 && (r.right > w + 1 || r.left < -1) && !nodes[i].classList.contains("bf-sr") && !nodes[i].closest(".bf-selftest")) bad++; }
      out.layout.clipped = (out.layout.clipped || 0) + (bad ? 1 : 0);
      if (bad && innerWidth >= 768) fail(label + "：画面の幅からはみ出している要素が " + bad + " 個ある");
    }
    function audit1(label) {
      var list = texts(), bad = C.checkTexts(list);
      out.states++; out.checked += list.length + 1;
      bad.forEach(function (b) { fail(label + "：" + b); });
      if (S) { leaks().forEach(function (b) { fail(label + "：答えの先出し " + b); }); out.checked++; }
      noScrollX(label); meas(label);
      out.checked++; if (document.querySelector("#bf-play-screen .timer-container, #bf-play-screen .combo-display, #bf-play-screen .timer-bar, #bf-play-screen [id*=timer]")) fail(label + "：タイマー・コンボの部品がある");
    }
    function lockedMatch() {                              // 解決した欄の表示が模範の値と一致
      S.stages.forEach(function (st, si) {
        S.inputs[si].forEach(function (e, fi) { out.checked++; if (e.value !== st.fields[fi].model) fail("解決した欄が模範の値と違う：" + C.titleOf(S.p) + " " + st.key + " " + fi); });
      });
    }
    function wrongVals(st, kind) {                        // 誤りの入力（欄の種類ごと）
      return st.fields.map(function (f, i) {
        if (f.kind === "bit") return kind === "last" ? (i === st.fields.length - 1 ? (f.model === "0" ? "1" : "0") : f.model) : (f.model === "0" ? "1" : "0");
        if (f.kind === "int") return f.model === "0" ? "1" : "0";
        return i === 0 && kind === "last" ? "9.99" : "7.5";
      });
    }
    function pos() { var g = $("bf-sheet").getBoundingClientRect(), q = $("bf-qtitle").getBoundingClientRect(); return [g.top, g.bottom, q.top, q.bottom]; }
    function checkSteady() {                               // 答え合わせの前後で，作業用紙と題の位置が動かない（上寄せ．作業用紙と手順が左右に並ぶ幅のとき）
      var a = pos(), b, d, k;
      check(); b = pos(); d = 0;
      for (k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[k] - b[k]));
      out.layout.maxShift = Math.max(out.layout.maxShift || 0, d);
      out.checked++; if (d > 2 && innerWidth > 1100) fail("答え合わせの前後で作業用紙・題の位置が " + Math.floor(d) + "px 動く：" + C.titleOf(S.p));
    }
    function typeInto(vals) { S.vals = vals.slice(); refresh(); }
    function runProblem(mode, n) {
      var st = S.stages, si, j, nWrong, kinds = ["all", "last"];
      if (mode === 3) { checkSteady(); audit1("空で答え合わせ"); }
      for (si = 0; si < st.length; si++) {
        nWrong = (mode === 1 && si === n % st.length) ? 1 : (mode === 2 && si === n % st.length) ? 2 : 0;
        for (j = 0; j < nWrong; j++) { typeInto(wrongVals(st[si], kinds[(n + j) % 2])); checkSteady(); audit1("誤り " + C.titleOf(S.p) + " " + st[si].key); }
        if (nWrong < 2) { typeInto(st[si].fields.map(function (f) { return f.model; })); checkSteady(); audit1("正解 " + C.titleOf(S.p) + " " + st[si].key); }
      }
      lockedMatch(); audit1("解き終わり " + C.titleOf(S.p));
      out.problems++;
      S.doneAt = 0; goNext();
    }
    /* 既存の画面に影響しないこと：メニュー・サブメニューの作りと，既存カテゴリの遷移（解説・タイマー・コンボには触れない） */
    (function () {
      var cats = document.querySelectorAll(".category-select-btn"), cards = document.querySelectorAll("#menu-screen .card-btn"), i, ids = ["menu-screen", "submenu-screen", "game-screen", "result-screen", "learn-screen", "settings-modal", "timer-bar", "combo-display", "answer-input", "submit-btn"];
      out.checked += 6 + ids.length;
      if (cats.length !== 3) fail("既存の 3 カテゴリのボタンが " + cats.length + " 個");
      if (cards.length !== 5) fail("メニューのカードが " + cards.length + " 枚（既存 3＋4 つ目 1＋新 1 のはず）");
      if (!$("bc-open-btn") || !$("bf-open-btn")) fail("4 つ目・5 つ目のカードのどちらかが無い");
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
      // 4 つ目のカテゴリ：メニュー → サブメニュー → メニュー（4 つ目の画面が今までどおり開く）
      out.checked += 3;
      $("bc-open-btn").click();
      if (!isActive("bc-submenu-screen") || $("menu-screen").classList.contains("active")) fail("4 つ目のカテゴリ：サブメニューへ進まない");
      if ($("bc-submenu-screen").querySelectorAll(".bc-action-btn").length !== 4) fail("4 つ目のカテゴリのサブメニューのボタンが 4 つでない");
      $("bc-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("bc-submenu-screen")) fail("4 つ目のカテゴリ：メニューへ戻らない");
      // 新カテゴリ：メニュー → サブメニュー → メニュー
      out.checked += 4;
      $("bf-open-btn").click();
      if (!isActive("bf-submenu-screen") || $("menu-screen").classList.contains("active")) fail("新カテゴリ：サブメニューへ進まない");
      if ($("bf-submenu-screen").querySelectorAll(".bf-action-btn").length !== 3) fail("新カテゴリのサブメニューのボタンが 3 つでない");
      if ($("bf-diff").querySelectorAll("button").length !== 2 || $("bf-diff").querySelector("[data-level=hard], [data-bits='16']")) fail("難易度が初級・中級の 2 つだけでない（上級が選べる）");
      if (document.querySelector(".app-container").classList.contains("bc-compact") || document.body.classList.contains("bc-top")) fail("4 つ目の画面のクラスが残っている");
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
        for (i = 0; i < all.length; i++) if (APP_IDS.indexOf(all[i].id) < 0 && /^(menu|submenu|game|result|learn|settings|modal|timer|combo|answer|submit|quit|restart|question|review|tutorial|step)[-_]/.test(all[i].id) && !/^b[cf]-/.test(all[i].id)) fail("既存の命名の id が増えている #" + all[i].id);
        tabs = document.querySelectorAll(".modal-diff-tab-btn");
        before = Array.prototype.map.call(tabs, function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",");
        if (tabs.length !== 3 || before !== "easy:false,medium:true,hard:false") fail("既存の設定モーダルの難易度の初期状態が違う " + before);
        sels = $("bf-diff").querySelectorAll("button"); bad = 0;
        for (k = 0; k < sels.length; k++) { sels[k].click(); if (Array.prototype.map.call(document.querySelectorAll(".modal-diff-tab-btn"), function (t) { return t.dataset.diff + ":" + t.classList.contains("selected"); }).join(",") !== before) bad++; }
        for (k = sels.length - 1; k >= 0; k--) { sels[k].click(); }
        if (bad) fail("新カテゴリの難易度を押すと，既存の設定モーダルの選択が変わる");
        if (document.querySelectorAll(".modal-diff-tab-btn.selected").length !== 1) fail("既存の設定モーダルで選択中の難易度が 1 つでない");
      })();
      $("bf-submenu-back-btn").click();
      if (!$("menu-screen").classList.contains("active") || isActive("bf-submenu-screen")) fail("新カテゴリ：メニューへ戻らない");
      noScrollX("メニュー");
    })();
    /* 解説：全ステップを出して禁止語・横スクロール・収まり */
    (function () {
      var i, n = T.learn.steps.length;
      show("bf-learn-screen");
      for (i = 0; i < n; i++) {
        learnIdx = i; renderLearn(); audit1("解説 " + (i + 1));
        (function () {                                    // 解説：768 以上の高さの画面で，どのステップもスクロールなしに収まり，「次へ」「メニューに戻る」が見える
          var L = out.layout, h = document.documentElement.scrollHeight, nb = $("bf-learn-next").getBoundingClientRect().bottom, cb = $("bf-learn-close").getBoundingClientRect().bottom;
          L.learnSteps = (L.learnSteps || 0) + 1; L.learnMaxClose = Math.max(L.learnMaxClose || 0, cb);
          if (h > innerHeight) L.learnTaller = (L.learnTaller || 0) + 1;
          var ch = $("bf-tutorial-card").getBoundingClientRect().height;      // カードの高さはどのステップでも同じ（ステップを進めるたびにパネルが動かない）
          L.learnCardMin = Math.min(L.learnCardMin || ch, ch); L.learnCardMax = Math.max(L.learnCardMax || 0, ch);
          out.checked++;
          if (innerWidth >= 1024 && Math.abs(L.learnCardMax - L.learnCardMin) > 1) fail("解説 " + (i + 1) + "：カードの高さがそろわない（" + Math.floor(L.learnCardMin) + "〜" + Math.floor(L.learnCardMax) + "px）");
          if (innerWidth >= 768 && innerHeight >= 768 && (h > innerHeight || nb > innerHeight || cb > innerHeight)) fail("解説 " + (i + 1) + "：スクロールが出る（文書の高さ " + h + "／窓 " + innerHeight + "）");
        })();
      }
      out.checked++; if ($("bf-learn-screen").querySelector(".tutorial-visual .bf-vc") === null) fail("解説の絵が出ていない");
      learnIdx = 0;
    })();
    show("bf-play-screen");
    C.KINDS.forEach(function (kind) { C.LEVELS.forEach(function (lv) {
      var n;
      choose(kind, lv); out.combos++;
      for (n = 0; n < 24; n++) runProblem(n % 4, n);
    }); });
    (function () {                                       // 検査自体が働くこと：画面に禁止語を入れると見つかる
      var keep = $("bf-extra").textContent, found;
      $("bf-extra").textContent = "丸め誤差"; found = C.checkTexts(texts()).length > 0; $("bf-extra").textContent = keep;
      out.checked++; if (!found) fail("画面の禁止語の検査が働かない");
    })();
    (function () {                                       // 先出しの検査自体が働くこと：解決前の欄に値を入れると見つかる
      var found = false, e;
      choose("d2b", 1);
      e = S.inputs[S.stages.length - 1][0]; e.value = "1"; found = leaks().length > 0; e.value = "";
      S.extras.frac[1].textContent = "0.25"; found = found && leaks().length > 0; S.extras.frac[1].textContent = "";
      e.setAttribute("title", "1.25"); found = found && leaks().length > 0; e.removeAttribute("title");
      out.checked += 2; if (!found || leaks().length) fail("答えの先出しの検査が働かない");
    })();
    appHits("練習・解説の描画後");
    (function () {                                       // 「記録を消す」のあとも，選んでいた向き・難易度が保たれる
      var combos = [["d2b", 2], ["b2d", 2], ["b2d", 1], ["d2b", 1]], i, kk, ll, c;
      for (i = 0; i < combos.length; i++) {
        kk = combos[i][0]; ll = combos[i][1];
        choose(kk, ll);
        if (S) { S.done = false; }
        $("bf-reset-btn").click(); $("bf-reset-yes").click();
        c = rec.rec[C.comboKey(kk, ll)];
        out.checked += 4;
        if (sel.kind !== kk || sel.lv !== ll) fail("記録を消したあと，選択が " + sel.kind + "/" + sel.lv + " に変わった（" + kk + "/" + ll + " のはず）");
        if (c.tried !== 0 || c.streak !== 0) fail("記録を消したのに記録が残っている");
        if (!S || S.p.kind !== kk || S.p.lv !== ll) fail("記録を消したあとの問題が " + kk + "/" + ll + " でない");
        if (document.querySelector("#bf-lvsw [aria-pressed=true]").getAttribute("data-lv") !== String(ll)) fail("記録を消したあと，難易度のボタンの表示が変わった");
      }
    })();
    $("bf-reset-confirm").hidden = false; audit1("記録を消す確認"); $("bf-reset-confirm").hidden = true;
    $("bf-mine").open = true; audit1("きみの記録"); $("bf-mine").open = false;
    S = null; recent = []; renderSubmenu(); show("menu-screen");
    return out;
  }

  if (SELFTEST) {
    (function () { var st = document.createElement("style"); st.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }"; document.head.appendChild(st); })();   // 寸法を測るので動きを止める
    setTimeout(function () {
      var rep = C.selfTest(3000, 20261022), au = domAudit(), pre = $("bf-selftest");
      rep.extra.domAudit = { combos: au.combos, problems: au.problems, states: au.states, checked: au.checked, fail: au.fail, layout: au.layout };
      rep.totalChecked += au.checked; rep.totalFail += au.fail; rep.failures = rep.failures.concat(au.failures);
      C.setSeed((Math.random() * 4294967296) >>> 0);        // 自己検査のあとは乱数を戻す
      window.__bfSelftestResult = rep;                       // 4 つ目のカテゴリの結果は window.__selftestResult（?selftest=1 で両方が動く）
      pre.textContent = "SELFTEST " + JSON.stringify(rep, null, 1); pre.hidden = false;
      console.log("SELFTEST-BF", rep);
    }, 400);
  }
})();
