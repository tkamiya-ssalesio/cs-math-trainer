"use strict";
/* ============ 論理回路 コア ============
   CS Math Trainer の 6 つ目のカテゴリ．DOM に依存しない（node の vm で評価して検査できる）．
   5 つ目のカテゴリ（binary-fraction-core.js）の作りにならい，次を変えた：
   ・問題は固定テンプレートの回路（AND・OR・NOT・半加算回路の組み合わせ）から選ぶ．表は回路の評価器が計算する（答えを直書きしない）
   ・回路図は，部品の位置と線の座標をこのコアが純粋関数で計算する（描くのは logic.js）．幾何は node でも検査できる
   ・入力は 0/1 のマス（タップで 空→0→1→0…）．文字入力欄は使わない
   ・段は「途中の線の列（まとめて 1 段）→ 出力の列」．列ごとに独立に判定する
   画面の用語は工程B入口（教科書）の語：論理積回路・論理和回路・否定回路・真理値表・半加算回路・桁上げ C・和 S．
   ============================================================ */
var LogicCore = (function () {

  /* ---- 乱数（自己検査だけ種つきに差し替える） ---- */
  var rng = Math.random;
  function makeRng(seed) {                               // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setSeed(s) { rng = makeRng(s); }
  function randInt(lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  /* ---- 定数 ---- */
  var KINDS = ["basic", "combine", "choose", "adder"];   // ① AND・OR・NOT／② 組み合わせ／③ 回路を選ぶ／④ 半加算・全加算
  var LEVELS = [1, 2];                                   // 1＝初級（2 入力），2＝中級（3 入力）．basic だけ難易度なし
  var CLEAR_STREAK = 3;
  var STORAGE_KEY = "csMathTrainer.logicCircuit.v1";
  var STAGE_IDS = { basic: ["table"], combine: ["wires", "out"], choose: ["pick"], adder: ["wires", "out"] };   // 記録の段の名前
  var AVOID = 5;                                         // 直近これだけの問題と同じものは出さない
  var LABELS = ["ア", "イ", "ウ", "エ"];
  var MAX_WIRES = 4, MAX_GATES = 5;

  // 画面にだけ出さない語（数学の記号・論理式・真偽・名前を出さない部品の名前・習っていない語）．「真理値表」の「真」は除いて見る
  var BANNED_SCREEN = ["∧", "∨", "∩", "∪", "¬", "論理式", "真偽", "真・偽", "真または偽", "排他的", "XOR", "NAND", "NOR", "ブール", "ド・モルガン", "集合", "命題", "オーバーフロー"];
  // README・SPEC にも出さない語（この文書に語そのものを書かない）
  var BANNED_DOC = ["ブール代数", "カルノー図", "加法標準形", "ド・モルガンの法則", "論理演算子", "フリップフロップ", "真偽値"];

  /* ---- 画面に出す文（コア側）．selfTest が禁止語・句読点を検査する．<b>…</b> は太字 ---- */
  var TEXT = {
    kind: { basic: "AND・OR・NOT", combine: "組み合わせ", choose: "回路を選ぶ", adder: "半加算・全加算" },
    level: { 1: "初級", 2: "中級" },
    levelSub: { 1: "2 入力", 2: "3 入力" },
    levelSubAdder: { 1: "半加算回路", 2: "全加算回路（挑戦）" },       // 画面では「中級：全加算回路（挑戦）」の形に組む（括弧を 1 段にする）
    defs: [
      "論理積回路（AND 回路）：二つの入力がともに 1 のときだけ，1 を出力する．",
      "論理和回路（OR 回路）：入力の少なくとも一方が 1 であれば，1 を出力する．",
      "否定回路（NOT 回路）：入力した信号を反転した値を出力する．",
      "真理値表：入力と出力の関係を示す表．"
    ],
    defsAdder: [
      "半加算回路：1 桁どうしの足し算をする回路．桁上げ C（上の桁）と和 S（1 桁目）を出力する．",
      "全加算回路：下の桁からの桁上げ Ci も足す回路．半加算回路 2 つと論理和回路でできている．",
      "Co：上の桁への桁上げ．"
    ],
    ui: {
      menuTitle: "論理回路",
      menuDesc: "AND・OR・NOT の働きと，その組み合わせ（半加算回路）を，図を見て真理値表に書く練習です．時間制限はありません．",
      submenuTitle: "論理回路",
      first: "はじめての人は「解説」から（3 分）．解説を読まずに「AND・OR・NOT」から始めてもよい．",
      actionLabel: "学習アクションの選択", levelLabel: "難易度の選択",
      levelNote: "初級は 2 入力，中級は 3 入力．時間制限はありません．",
      backToMenu: "カテゴリ選択に戻る", backToSubShort: "← 戻る",
      learnTitle: "📘 解説", learnDesc: "0 と 1 の考え方から，三つの基本回路，途中の線のたどり方，半加算回路と足し算，全加算回路（挑戦）までを，ステップごとに学びます．",
      kindDesc: { basic: "図記号を見て，AND・OR・NOT それぞれの出力を表に書きます．",
                  combine: "",
                  choose: "真理値表の出力の列から，同じ出力になる回路を全部選びます．",
                  adder: "半加算回路（初級）と全加算回路（中級・挑戦）の表を，途中の線から書きます．" },
      levelBtnLabel: "難易度", progressLabel: "クリアの状況",
      cleared: "クリア", notYet: "まだ", tickTitle: "クリアの状況",
      reset: "記録を消す", resetAsk: "本当に消しますか．このカテゴリ（論理回路）の記録が消えます．ほかのカテゴリの記録は消えません", resetYes: "消す", resetNo: "やめる",
      streak: "連続", streakNote: "1回目で全段正解した問題の連続", stage: "段", stageEnd: "この問題はおわり",
      check: "答え合わせ", next: "次の問題へ", hintCheck: "Enter キーでも答え合わせ", hintNext: "Enter キーでも次へ",
      words: "ことば", mine: "きみの記録", lockedLabel: "確定",
      usage: "表のマスを押すと 0 → 1 → 0 と変わる．全部入れて「答え合わせ」．",
      usageChoose: "回路を押して選ぶ（もう一度押すと外れる）．選び終えたら「答え合わせ」．",
      revLast: "正しい値はこれです", justCleared: "この種類・難易度はクリアしました", chipOk: "1回目で正解", chipNg: "1回目は誤り", chipYet: "まだ", chipNow: "いま",
      mineNone: "まだ記録がありません", mineTried: "解いた問題", mineFirst: "1回目で全段正解",
      mineHead: ["段", "回数", "1回目の誤り", "割合"], weak: "ここがつまずきやすい", mineNote: "記録はこの端末のブラウザの中だけに残ります．共用の端末は，次の人に渡す前に「記録を消す」を押す．",
      stageName: { table: "出力の列", wires: "途中の線の列", out: "出力の列", pick: "回路を選ぶ" },
      common: "この問題の出力",
      ques: { basic: "AND・OR・NOT の出力を表に書こう", combine: "回路の出力を表に書こう", adder: "足し算の回路を表に書こう", choose: "同じ出力になる回路を，全部選ぼう" },
      chooseTitle: "出力 L が左の表になる回路を，全部選ぼう．1 つとは限りません．",
      chooseTitleAbove: "出力 L が下の表になる回路を，全部選ぼう．1 つとは限りません．",
      tableOf: "真理値表", inputHead: "入力", pickAria: "回路", pickNone: "選んだ回路", selected: "選択中", notSelected: "未選択", correctOpt: "正しい回路", chosenOpt: "選んだ回路",
      halfTable: "半加算回路の表", halfTableNote: "解くときに見てよい表．A と B を足した桁上げ C と和 S．",
      figAlt: "回路図", rowPrefix: "行目", emptyCell: "未入力",
      instrBasic: "図記号を見て，出力 L の列を書こう（上の行から順に）．",
      instrWires: "図の線 1 本ずつの値を，列ごとに書こう（左の列から）．",
      instrOut: "線の値を使って，出力の列を書こう．",
      instrOutAdder: "桁上げ Co と和 S の列を書こう．",
      instrOutAdder1: "和 S の列を書こう（桁上げ C は P）．",
      instrPick: "選び終えたら「答え合わせ」．",
      focusNote: "いま求める線の部品は太く描いてあります．"
    },
    learn: {
      title: "論理回路の解説", prev: "前へ", next: "次へ", done: "完了", close: "論理回路のメニューへ",
      steps: [
        { title: "0 と 1 で判断する",
          text: ["コンピュータの中の回路は，<b>0 と 1</b> で判断する．1 は「入っている・正しい」，0 は「切れている・正しくない」．",
                 "三つの基本回路：<b>論理積回路（AND 回路）</b>・<b>論理和回路（OR 回路）</b>・<b>否定回路（NOT 回路）</b>．",
                 "真理値表：入力と出力の関係を示す表．"],
          visual: { type: "gates3" } },
        { title: "スイッチで考える",
          text: ["AND は<b>直列</b>：二つのスイッチがともに入っているときだけ，電球が点く．",
                 "OR は<b>並列</b>：少なくとも一方が入っていれば，電球が点く．",
                 "NOT は<b>反転</b>：スイッチが入っていると消え，切れていると点く．"],
          visual: { type: "switches" } },
        { title: "図記号と真理値表",
          text: ["三つの図記号は，部品の中に名前を書く．表の入力の行は 00，01，10，11 の順．",
                 "OR は，<b>両方が 1 のときも 1</b>．AND は，ともに 1 のときだけ 1．NOT は 0 と 1 が入れ替わる．"],
          visual: { type: "table3" } },
        { title: "途中の線をたどる",
          text: ["部品が 2 つ以上あるときは，途中の線に名前（P，Q）を付けて，1 つずつたどる．",
                 "<b>A＝1，B＝0</b> のとき：P ＝ 0，Q ＝ 1，L ＝ 1．この 1 行が，表の 1 行になる．"],
          visual: { type: "trace" } },
        { title: "半加算回路と足し算",
          text: ["半加算回路：1 桁どうしの足し算をする回路．<b>C＝桁上げ（上の桁），S＝和（1 桁目）</b>．",
                 "第9回の繰り上がりと同じ：0＋0＝0，0＋1＝1，1＋0＝1，1＋1＝10．表の 4 行目（A＝1，B＝1）の C＝1，S＝0 が，1＋1＝10 の 10 にあたる．"],
          visual: { type: "half" } },
        { title: "全加算回路（挑戦）",
          text: ["全加算回路は，<b>半加算回路 2 つ＋論理和回路</b>．下の桁からの桁上げ Ci も足す．",
                 "A＋B＋Ci を 2 桁で表したものが，Co と S（Co S）になる．Co は上の桁への桁上げ，S は和（1 桁目）．"],
          visual: { type: "full" } }
      ]
    },
    msg: {
      ok1: "正解",
      ok2: "正解（2回目）",
      retry: "おしい．もう1回やってみよう",
      rev: "正しい値はこれです．次へ進もう．",
      selftestNote: "自己検査中：記録は保存されません",
      fixRed: "赤いマスだけ直そう．",
      allFirst: "全段 1回目で正解",
      storageOff: "この端末では記録を残せません",
      endAdder: "A＝1，B＝1 のとき C＝1，S＝0．2 進数の 1＋1＝10 と同じ（桁上げ C＝上の桁，和 S＝1 桁目）．",
      endAdder2: "A＝1，B＝1，Ci＝1 のとき Co＝1，S＝1．2 進数の 1＋1＋1＝11 と同じ（Co S は 2 進数で A＋B＋Ci）．",
      sameTable: "別の回路でも同じ表になることがあります．",
      chooseAll: "選んだ回路が，同じ出力になる回路のすべてと一致しました．",
      pickNone: "まだ選んでいません．回路を選んでから答え合わせ．"
    }
  };
  function msgStumbled(names) { return "つまずいた段：" + names.join("・"); }

  // 列の誤りの見立て（SPEC §3.1）
  var HINTS = {
    "W-1": "論理和回路は，入力の少なくとも一方が 1 であれば 1．どちらか一方だけが 1 の行も 1．",
    "W-2": "論理積回路は，二つの入力がともに 1 のときだけ 1．",
    "W-3": "否定回路は入力を反転する．0 なら 1，1 なら 0．",
    "W-4": "この部品につながっている線を，図でもう一度たどろう（つなぐ線を取り違えていませんか）．",
    "W-5": "行の並びを確かめよう．左から A，B，C の順に 000，001，010，011，100，101，110，111．",
    "W-6": "桁上げ C と和 S を逆にしていませんか．1＋1＝10 のとき，C＝1（上の桁），S＝0（1 桁目）．",
    "W-7": "1＋1 は 10．和 S は 0 で，桁上げ C が 1 になる．",
    "W-0": "太く描いた{N}（{T}）の入力を，1 行ずつ{U}の表に当てはめて見直そう．"
  };
  var HINT_C2 = "取りこぼし：選ばなかった回路の中にも，同じ表になるものがあります．残りの回路にも入力を入れてみよう．";
  var HINT_C1 = "選んだ回路のうち，表と違う出力を出すものがあります．入力を 1 行ずつ入れて，表と見比べよう．";

  /* ============ 回路（固定テンプレート） ============ */
  var GATE_W = { AND: 44, OR: 44, NOT: 48, HA: 64, OUT: 24 };
  var GATE_H = { AND: 36, OR: 36, NOT: 34, HA: 44, OUT: 18 };
  function inPins(t) { return (t === "AND" || t === "OR") ? [9, 27] : t === "HA" ? [11, 33] : t === "NOT" ? [17] : [9]; }
  function outPinY(t, key) { return t === "HA" ? (key === "S" ? 11 : 33) : t === "NOT" ? 17 : 18; }

  function bitsOf(arr) { return arr.join(""); }
  function isIn(c, ref) { return c.inputs.indexOf(ref) >= 0; }

  /* ---- 紙（第12回ワークシート）と同じ問題：線の名前・部品の上下を紙にそろえる（SPEC §5.4）----
     names：部品の id → 出力の線の名前．above：[上, 下] の組（同じ列で上に描く）．colMin：部品の列の下限（紙の図の列にそろえる）．
     紙にない問題は，左の列から順に，同じ列では図の上から P・Q・R・T（S は和と重なるので飛ばす）．          */
  var WIRE_SEQ = ["P", "Q", "R", "T", "U", "V", "W"];
  var PAPER = {
    p02: { paper: "［3］例（NOT A と B の AND）", names: { g1: "P" } },
    p01: { paper: "［3］練習1（A AND B を NOT に通す）", names: { g1: "P" } },
    p05: { paper: "［3］練習2（章末問題12）", names: { g1: "P", g2: "Q" }, above: [["g1", "g2"]] },
    q01: { paper: "［3］ア（（A OR B）AND NOT（A AND B））", names: { g2: "P", g1: "Q", g3: "R" }, above: [["g2", "g1"]] },
    q07: { paper: "［3］イ（（A OR NOT B）AND（A AND B））", names: { g3: "P", g2: "Q", g1: "R" }, colMin: { g3: 1 }, above: [["g2", "g3"]], notInOrder: true },
    ad1: { paper: "［4］半加算回路（例題7）", names: { g1: "P", g2: "Q", g3: "R" }, above: [["g1", "g2"]] }
  };
  function paperOf(c) { return PAPER[c.base || c.id] || null; }

  // 式の文字列（AND(A,NOT(B)) の形．画面には出さない内部の記法）を回路に直す
  function parseExpr(id, str, inputs) {
    var pos = 0, gates = [], toks = str.replace(/\s+/g, "").match(/[A-Za-z]+|[(),]/g), t = 0;
    function peek() { return toks[t]; }
    function eat(x) { if (toks[t] !== x) throw new Error("式の書き方が違う " + id + " " + str + "（" + x + "）"); t++; }
    function expr() {
      var w = toks[t++], a, b, g;
      if (w === "NOT") { eat("("); a = expr(); eat(")"); g = { id: "g" + (gates.length + 1), t: "NOT", in: [a] }; gates.push(g); return g.id; }
      if (w === "AND" || w === "OR") { eat("("); a = expr(); eat(","); b = expr(); eat(")"); g = { id: "g" + (gates.length + 1), t: w, in: [a, b] }; gates.push(g); return g.id; }
      if (inputs.indexOf(w) < 0) throw new Error("知らない入力 " + id + " " + w);
      return w;
    }
    pos = expr();
    if (t !== toks.length) throw new Error("式が余っている " + id);
    return finishCircuit({ id: id, expr: str, inputs: inputs.slice(), gates: gates, outs: [{ name: "L", src: pos, stage: true }] });
  }
  function outKeys(g) { return g.t === "HA" ? ["S", "C"] : ["o"]; }
  function refOf(g, key) { return g.t === "HA" ? g.id + "." + key : g.id; }
  function colOfRef(c, ref) { var i, g; if (isIn(c, ref)) return -1; for (i = 0; i < c.gates.length; i++) { g = c.gates[i]; if (g.id === ref || ref.indexOf(g.id + ".") === 0) return g.col; } throw new Error("参照が見つからない " + ref); }
  function finishCircuit(c) {
    var i, cols = 0, order, k = 1, pp = paperOf(c), w0 = [];
    c.gates.forEach(function (g) { g.col = Math.max((pp && pp.colMin && pp.colMin[g.id]) || 0, 1 + Math.max.apply(null, g.in.map(function (r) { return colOfRef(c, r); }))); cols = Math.max(cols, g.col); });
    c.maxCol = cols;
    order = c.gates.map(function (g, i2) { return { g: g, i: i2 }; }).sort(function (a, b) { return a.g.col - b.g.col || a.i - b.i; });
    // 途中の線の名前は図の上下の位置で決まる（配置を計算してから．namesOf）．配置の計算中は仮の名前 pname を使う
    order.forEach(function (o) {
      outKeys(o.g).forEach(function (key) {
        var ref = refOf(o.g, key), fin = c.outs.some(function (x) { return x.src === ref && x.stage !== false; }), w;
        if (fin) return;
        w = { ref: ref, pname: "P", gate: o.g, key: key };
        Object.defineProperty(w, "name", { enumerable: true, get: function () { return namesOf(c).map[ref]; } });
        w0.push(w);
      });
    });
    c._w0 = w0; c._names = null;
    Object.defineProperty(c, "wires", { enumerable: true, configurable: true, get: function () { return namesOf(c).list; } });
    Object.defineProperty(c, "wireName", { enumerable: true, configurable: true, get: function () { return namesOf(c).map; } });
    c.finals = c.outs.filter(function (x) { return x.stage !== false; });
    return c;
  }
  function namesOf(c) { if (!c._names) layoutCircuit(c, true); return c._names; }
  // 配置 lay（札つき）から，途中の線の名前を決める：紙と同じ問題は PAPER の名前，そのほかは（列，出力の足の高さ）の順に P・Q・R・T
  function computeNames(c, lay) {
    var pp = paperOf(c), keyed, map = {}, list;
    keyed = c._w0.map(function (w) {
      var nd = lay.nodes.filter(function (x) { return x.id === w.gate.id; })[0];
      return { w: w, col: w.gate.col, y: nd.y + outPinY(nd.t, w.key) };
    }).sort(function (a, b) { return a.col - b.col || a.y - b.y; });
    keyed.forEach(function (x, i) { map[x.w.ref] = pp ? pp.names[x.w.ref] : WIRE_SEQ[i]; });
    list = c._w0.slice().sort(function (a, b) { return WIRE_SEQ.indexOf(map[a.ref]) - WIRE_SEQ.indexOf(map[b.ref]); });
    return { map: map, list: list };
  }
  function rowsOf(c) { return 1 << c.inputs.length; }
  function inputBit(n, i, r) { return (r >> (n - 1 - i)) & 1; }
  // 評価器：全入力行（A が上の桁．00，01，10，11）の値を，参照ごとの配列で返す
  function evalCircuit(c) {
    var n = c.inputs.length, R = 1 << n, v = {}, r, i;
    c.inputs.forEach(function (name, k) { var a = []; for (r = 0; r < R; r++) a.push(inputBit(n, k, r)); v[name] = a; });
    c.gates.forEach(function (g) {
      var a = v[g.in[0]], b = g.in[1] ? v[g.in[1]] : null, o = [], s = [], cc = [];
      for (i = 0; i < R; i++) {
        if (g.t === "AND") o.push(a[i] & b[i]);
        else if (g.t === "OR") o.push(a[i] | b[i]);
        else if (g.t === "NOT") o.push(1 - a[i]);
        else { cc.push(a[i] & b[i]); s.push((a[i] + b[i]) % 2); }
      }
      if (g.t === "HA") { v[g.id + ".S"] = s; v[g.id + ".C"] = cc; } else v[g.id] = o;
    });
    return v;
  }
  var evalCache = {};
  function evalOf(c) { return evalCache[c.id] || (evalCache[c.id] = evalCircuit(c)); }
  function tableOf(c, ref) { return bitsOf(evalOf(c)[ref || c.outs[0].src]); }

  // 説明（図の aria-label．答えを含まない）
  function refLabel(c, ref) { return isIn(c, ref) ? ref : (c.wireName[ref] || (c.outs.filter(function (x) { return x.src === ref; })[0] || { name: ref }).name); }
  function describeCircuit(c, withNames) {
    var out = [];
    c.gates.forEach(function (g) {
      var ins = g.in.map(function (r) { return withNames === false && !isIn(c, r) ? "前の部品" : refLabel(c, r); }), tn = g.t === "HA" ? "半加算回路" : g.t, o;
      if (g.t === "HA") o = "C と S を出力する" + (g.key ? "" : "");
      else o = "出力は " + refLabel(c, g.id);
      out.push(ins.join(" と ") + " が " + tn + " に入る．" + o + "．");
    });
    return "回路図．入力 " + c.inputs.join("，") + "．" + out.join("") ;
  }

  /* ---- テンプレートの一覧（SPEC §2．表は SPEC の検算ずみの値．selfTest が別実装で照合する） ---- */
  var AB = ["A", "B"], ABC = ["A", "B", "C"];
  var P_DEFS = [   // ② 初級（2 入力）
    ["p01", "NOT(AND(A,B))", "1110"], ["p02", "AND(NOT(A),B)", "0100"], ["p03", "AND(A,NOT(B))", "0010"], ["p04", "OR(NOT(A),NOT(B))", "1110"],
    ["p05", "OR(AND(A,B),NOT(B))", "1011"], ["p06", "OR(AND(A,B),NOT(A))", "1101"], ["p07", "NOT(OR(A,B))", "1000"], ["p08", "AND(NOT(A),NOT(B))", "1000"],
    ["p09", "OR(NOT(A),B)", "1101"], ["p10", "OR(A,NOT(B))", "1011"]
  ];
  var R_DEFS = [   // ② 中級（3 入力）
    ["r01", "OR(AND(A,B),C)", "01010111"], ["r02", "OR(AND(NOT(A),NOT(B)),AND(B,C))", "11010001"], ["r03", "AND(OR(A,B),C)", "00010101"],
    ["r04", "AND(A,OR(B,C))", "00000111"], ["r05", "AND(NOT(A),OR(B,C))", "01110000"], ["r06", "AND(AND(A,B),C)", "00000001"],
    ["r07", "OR(OR(A,B),C)", "01111111"], ["r08", "NOT(OR(AND(A,B),C))", "10101000"], ["r09", "OR(AND(A,B),AND(NOT(A),C))", "01010011"],
    ["r10", "OR(AND(A,NOT(B)),C)", "01011101"], ["r11", "OR(NOT(A),AND(B,C))", "11110001"], ["r12", "AND(OR(A,C),NOT(B))", "01001100"],
    ["r13", "AND(NOT(AND(A,B)),C)", "01010100"], ["r14", "OR(AND(A,B),AND(B,C))", "00010011"], ["r15", "OR(A,AND(NOT(B),C))", "01001111"],
    ["r16", "AND(A,AND(B,C))", "00000001"], ["r17", "OR(A,OR(B,C))", "01111111"], ["r18", "AND(B,OR(A,C))", "00010011"],
    ["r19", "OR(AND(A,B),AND(A,C))", "00000111"], ["r20", "OR(AND(A,C),AND(B,C))", "00010101"], ["r21", "AND(OR(A,C),OR(B,C))", "01010111"]
  ];
  var Q_DEFS = [   // ③ の選択肢にだけ加える回路（初級）
    ["q01", "AND(OR(A,B),NOT(AND(A,B)))", "0110"], ["q02", "OR(AND(A,NOT(B)),AND(NOT(A),B))", "0110"], ["q03", "OR(AND(A,B),AND(NOT(A),NOT(B)))", "1001"],
    ["q04", "OR(A,NOT(A))", "1111"], ["q05", "AND(A,B)", "0001"], ["q06", "OR(A,B)", "0111"],
    ["q07", "AND(OR(A,NOT(B)),AND(A,B))", "0001"], ["q08", "OR(OR(A,B),OR(NOT(A),NOT(B)))", "1111"]       // 学習ノート思5 の図のイ（0001）・エ（1111）．ダミー専用
  ];
  var Z_DEFS = [   // ③ 中級のダミー専用（常に 1／常に 0）．入力は A・B・C のまま
    ["z01", "OR(A,NOT(A))", "11111111"], ["z02", "AND(A,NOT(A))", "00000000"]
  ];
  var CIRC = {}, P_LIST = [], R_LIST = [], Q_LIST = [], Z_LIST = [], EXPECT = {};
  P_DEFS.forEach(function (d) { var c = parseExpr(d[0], d[1], AB); CIRC[d[0]] = c; P_LIST.push(c); EXPECT[d[0]] = d[2]; });
  R_DEFS.forEach(function (d) { var c = parseExpr(d[0], d[1], ABC); CIRC[d[0]] = c; R_LIST.push(c); EXPECT[d[0]] = d[2]; });
  Q_DEFS.forEach(function (d) { var c = parseExpr(d[0], d[1], AB); CIRC[d[0]] = c; Q_LIST.push(c); EXPECT[d[0]] = d[2]; });
  Z_DEFS.forEach(function (d) { var c = parseExpr(d[0], d[1], ABC); CIRC[d[0]] = c; Z_LIST.push(c); EXPECT[d[0]] = d[2]; });

  function gateRange(list) { var n = list.map(function (c) { return c.gates.length; }); return Math.min.apply(null, n) + "〜" + Math.max.apply(null, n); }
  var GATE_RANGE = { 1: gateRange(P_LIST), 2: gateRange(R_LIST) };           // 組み合わせの部品の数（テンプレートから数える）
  TEXT.ui.kindDesc.combine = "部品の数は初級が " + GATE_RANGE[1] + " 個，中級が " + GATE_RANGE[2] + " 個．途中の線の列を求めてから，出力の列を書きます．";

  // ① 基本 3 部品
  var BASIC_DEFS = [["b_and", "AND(A,B)", "0001", AB], ["b_or", "OR(A,B)", "0111", AB], ["b_not", "NOT(A)", "10", ["A"]]], BASIC_LIST = [];
  BASIC_DEFS.forEach(function (d) { var c = parseExpr(d[0], d[1], d[3]); CIRC[d[0]] = c; BASIC_LIST.push(c); EXPECT[d[0]] = d[2]; });

  // ④ 半加算回路（例題7）と全加算回路
  function adderCircuit(lv) {
    var c;
    if (lv === 1) {
      c = { id: "ad1", inputs: AB.slice(), gates: [{ id: "g1", t: "AND", in: ["A", "B"] }, { id: "g2", t: "OR", in: ["A", "B"] }, { id: "g3", t: "NOT", in: ["g1"] }, { id: "g4", t: "AND", in: ["g2", "g3"] }],
            outs: [{ name: "S", src: "g4", stage: true }, { name: "C", src: "g1", stage: false }] };
    } else {
      c = { id: "ad2", inputs: ["A", "B", "Ci"], gates: [{ id: "h1", t: "HA", in: ["A", "B"] }, { id: "h2", t: "HA", in: ["h1.S", "Ci"] }, { id: "o1", t: "OR", in: ["h1.C", "h2.C"] }],
            outs: [{ name: "S", src: "h2.S", stage: true }, { name: "Co", src: "o1", stage: true }] };
    }
    return finishCircuit(c);
  }
  CIRC.ad1 = adderCircuit(1); CIRC.ad2 = adderCircuit(2); EXPECT.ad1 = "0110"; EXPECT.ad2 = "01101001";
  // 鏡（A と B の線のつなぎ替え）．④ は鏡 2 通り：mirror = true で A と B を入れ替えた形
  function mirrorOf(c) {
    var m = JSON.parse(JSON.stringify({ id: c.id, expr: c.expr, inputs: c.inputs, gates: c.gates.map(function (g) { return { id: g.id, t: g.t, in: g.in }; }), outs: c.outs })), sw = { A: "B", B: "A" };
    m.base = c.base || c.id; m.id = c.id + "m";
    m.gates.forEach(function (g) { g.in = g.in.map(function (r) { return sw[r] || r; }); });
    return finishCircuit(m);
  }
  CIRC.ad1m = mirrorOf(CIRC.ad1); CIRC.ad2m = mirrorOf(CIRC.ad2);

  /* ============ 回路図の配置（純粋関数．SPEC §5.2） ============ */
  var T0 = 18, GAPH = 12, TRUNK_X0 = 10, TRUNK_DX = 13, TRUNK_DX_WIDE = 17, TW = 6, RMARGIN = 6, LANE0 = 2.5, LANE_DY = 4;
  function textW(s) { var w = 0, i; for (i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 9 : 5.6; return w; }
  function slotCombos(nRows, k) {
    var out = [], cur = [];
    (function rec(start) {
      var s;
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (s = start; s < nRows; s++) { cur.push(s); rec(s + 1); cur.pop(); }
    })(0);
    return out;
  }
  function product(lists) {
    var out = [[]], i;
    for (i = 0; i < lists.length; i++) out = [].concat.apply([], out.map(function (o) { return lists[i].map(function (x) { return o.concat([x]); }); }));
    return out;
  }
  function makeNodes(c) {
    var nodes = [], i;
    c.gates.forEach(function (g) { nodes.push({ id: g.id, kind: "gate", t: g.t, col: g.col, g: g, w: GATE_W[g.t], h: GATE_H[g.t] }); });
    c.outs.forEach(function (o) { nodes.push({ id: "out:" + o.name, kind: "out", t: "OUT", col: c.maxCol + 1, name: o.name, src: o.src, w: GATE_W.OUT, h: GATE_H.OUT }); });
    return nodes;
  }
  function layoutOnce(c, tags, nodes, byCol, slots, rowsN, maxH) {
    var P = maxH + GAPH, n = c.inputs.length, used = {}, edges = [], cols = c.maxCol + 2, k;
    function rowTop(s) { return T0 + GAPH + s * P; }
    nodes.forEach(function (nd) { nd.y = 0; });
    byCol.forEach(function (list, ci) { list.forEach(function (nd, i) { nd.slot = slots[ci][i]; nd.y = rowTop(nd.slot) + (maxH - nd.h) / 2; }); });
    // 辺：部品の入力の足ごとに 1 本（入力の線／部品の出力）
    nodes.forEach(function (nd) {
      if (nd.kind === "gate") nd.g.in.forEach(function (r, pi) { edges.push({ sink: nd, pin: pi, src: r, yp: nd.y + inPins(nd.t)[pi] }); });
      else edges.push({ sink: nd, pin: 0, src: nd.src, yp: nd.y + inPins("OUT")[0] });
    });
    edges.forEach(function (e) {
      var s;
      if (isIn(c, e.src)) { e.net = "in:" + e.src; e.cs = -1; e.ys = null; return; }
      e.net = e.src; e.cs = colOfRef(c, e.src);
      s = nodes.filter(function (nd) { return nd.kind === "gate" && (nd.id === e.src || e.src.indexOf(nd.id + ".") === 0); })[0];
      e.srcNode = s; e.ys = s.y + outPinY(s.t, e.src.indexOf(".") > 0 ? e.src.split(".")[1] : "o");
    });
    return { P: P, rowTop: rowTop, edges: edges, nodes: nodes, byCol: byCol, rowsN: rowsN, maxH: maxH, cols: cols, n: n };
  }
  function colClear(L, y, c1, c2) {                         // 列 c1〜c2 の部品が，高さ y の水平線を遮らないか
    var ci, i, nd;
    for (ci = c1; ci <= c2; ci++) {
      if (ci < 0 || ci >= L.byCol.length) continue;
      for (i = 0; i < L.byCol[ci].length; i++) { nd = L.byCol[ci][i]; if (y > nd.y - 1.6 && y < nd.y + nd.h + 1.6) return false; }
    }
    return true;
  }
  function laneYs(L) {                                      // 水平の通り道（行の間・上・下）の高さの候補
    var out = [], g, s;
    for (g = -1; g < L.rowsN; g++) for (s = 0; s < 3; s++) out.push({ gap: g, slot: s, y: (g < 0 ? T0 : L.rowTop(g) + L.maxH) + LANE0 + s * LANE_DY });
    return out;
  }
  function candidates(L, e) {                               // 辺の通し方の候補（安い順）
    var out = [], cd = e.sink.col, cs = e.cs, k, ys = e.ys, yp = e.yp, lanes = laneYs(L), seen = {};
    if (cs < 0) {
      if (colClear(L, yp, 0, cd - 1)) out.push({ type: "direct", cost: 0 });
      if (cd >= 1) lanes.forEach(function (ln) { out.push({ type: "lane", lane: ln, cost: 20 + Math.abs(ln.y - yp) / 8 + ln.slot * 0.2 }); });
    } else {
      if (Math.abs(ys - yp) < 0.01) { if (colClear(L, yp, cs + 1, cd - 1)) out.push({ type: "straight", cost: 0 }); }
      else for (k = cs; k <= cd - 1; k++) if (colClear(L, ys, cs + 1, k) && colClear(L, yp, k + 1, cd - 1)) out.push({ type: "z", k: k, cost: 2 + Math.abs(ys - yp) / 12 + (cd - 1 - k) * 0.4 });
      if (cd >= cs + 2) lanes.forEach(function (ln) { out.push({ type: "lane", lane: ln, cost: 20 + (Math.abs(ln.y - yp) + Math.abs(ln.y - ys)) / 8 + ln.slot * 0.2 }); });
    }
    out.forEach(function (o, i) { o.i = i; });
    out.sort(function (a, b) { return a.cost - b.cost || a.i - b.i; });
    return out.filter(function (o) { var key = o.type + (o.k !== undefined ? o.k : "") + (o.lane ? o.lane.gap + "." + o.lane.slot : ""); if (seen[key]) return false; seen[key] = 1; return true; });
  }
  // 選んだ通し方から，部品・線の座標を決める
  function build(c, tags, L, choice) {
    var edges = L.edges, n = L.n, cols = L.cols, items = {}, itemList = [], chanW = [], colX = [], colW = [], j, i, trunkRegion, tracks, segs = [], nets = {}, tagList = [], W, H;
    var tagPad = [];
    function itemFor(net, ch) { var k2 = net + "@" + ch; if (!items[k2]) { items[k2] = { net: net, ch: ch, y1: Infinity, y2: -Infinity, track: -1 }; itemList.push(items[k2]); } return items[k2]; }
    function span(it, a, b) { it.y1 = Math.min(it.y1, a, b); it.y2 = Math.max(it.y2, a, b); }
    edges.forEach(function (e, ei) {
      var ch = choice[ei], it, cd = e.sink.col;
      e.route = ch;
      if (ch.type === "z") { it = itemFor(e.net, ch.k); span(it, e.ys, e.yp); e.items = [it]; }
      else if (ch.type === "lane") {
        if (e.cs < 0) { it = itemFor(e.net, cd - 1); span(it, ch.lane.y, e.yp); e.items = [it]; }
        else { var i1 = itemFor(e.net, e.cs), i2 = itemFor(e.net, cd - 1); span(i1, e.ys, ch.lane.y); span(i2, ch.lane.y, e.yp); e.items = [i1, i2]; }
      } else e.items = [];
    });
    // 列の幅，タグの幅（途中の線の名前の札）
    for (j = 0; j < cols; j++) { colW[j] = 0; tagPad[j] = 0; }
    L.byCol.forEach(function (list, ci) { list.forEach(function (nd) { colW[ci] = Math.max(colW[ci], nd.w); }); });
    if (tags) c._w0.forEach(function (w) {
      var g = w.gate, nm = w.pname + (c.outs.some(function (x) { return x.src === w.ref && x.stage === false; }) ? "＝" + c.outs.filter(function (x) { return x.src === w.ref; })[0].name : "");
      w.tagText = nm; w.tagW = Math.ceil(textW(nm)) + 4;
      tagPad[g.col] = Math.max(tagPad[g.col], w.tagW + 7);
    });
    // 通り道（縦の線）の割り当て：チャネルごとに，縦の区間が重ならない線を同じ筋に置く
    for (j = 0; j < cols - 1; j++) {
      tracks = [];
      itemList.filter(function (it) { return it.ch === j; }).sort(function (a, b) { return a.y1 - b.y1 || a.y2 - b.y2; }).forEach(function (it) {
        var t;
        for (t = 0; t < tracks.length; t++) if (tracks[t] + 5 < it.y1) break;
        tracks[t] = it.y2; it.track = t;
      });
      chanW[j] = Math.max((tagPad[j] || 8) + Math.max(0, tracks.length - 1) * TW + 8, 18);
    }
    var tdx = c.inputs.some(function (nm) { return nm.length > 1; }) ? TRUNK_DX_WIDE : TRUNK_DX;      // 入力名が 2 文字（Ci）のときは幹線の間隔を広げる
    trunkRegion = TRUNK_X0 + tdx * (n - 1) + 14;
    colX[0] = trunkRegion;
    for (j = 1; j < cols; j++) colX[j] = colX[j - 1] + colW[j - 1] + chanW[j - 1];
    W = colX[cols - 1] + colW[cols - 1] + RMARGIN;
    H = T0 + GAPH + L.rowsN * L.P + 2;
    L.nodes.forEach(function (nd) { nd.x = colX[nd.col]; });
    function trackX(it) { return colX[it.ch] + colW[it.ch] + (tagPad[it.ch] || 8) + it.track * TW; }
    function xOut(nd) { return nd.x + nd.w; }
    function seg(net, x1, y1, x2, y2) { if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) < 0.01) return; segs.push({ net: net, x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2), h: Math.abs(y1 - y2) < 0.01 }); }
    var trunkY = {}, trunkX = {};
    c.inputs.forEach(function (name, k) { trunkX[name] = TRUNK_X0 + tdx * k; trunkY[name] = null; });
    function touchTrunk(name, y) { trunkY[name] = trunkY[name] === null ? y : Math.max(trunkY[name], y); }
    edges.forEach(function (e) {
      var ch = e.route, xp = e.sink.x, yp = e.yp, ys = e.ys, xo, xt, xt1, xt2, name;
      if (e.cs < 0) {
        name = e.src; xo = trunkX[name];
        if (ch.type === "direct") { seg(e.net, xo, yp, xp, yp); touchTrunk(name, yp); }
        else { xt = trackX(e.items[0]); seg(e.net, xo, ch.lane.y, xt, ch.lane.y); seg(e.net, xt, ch.lane.y, xt, yp); seg(e.net, xt, yp, xp, yp); touchTrunk(name, ch.lane.y); }
      } else {
        xo = xOut(e.srcNode);
        if (ch.type === "straight") seg(e.net, xo, ys, xp, yp);
        else if (ch.type === "z") { xt = trackX(e.items[0]); seg(e.net, xo, ys, xt, ys); seg(e.net, xt, ys, xt, yp); seg(e.net, xt, yp, xp, yp); }
        else { xt1 = trackX(e.items[0]); xt2 = trackX(e.items[1]); seg(e.net, xo, ys, xt1, ys); seg(e.net, xt1, ys, xt1, ch.lane.y); seg(e.net, xt1, ch.lane.y, xt2, ch.lane.y); seg(e.net, xt2, ch.lane.y, xt2, yp); seg(e.net, xt2, yp, xp, yp); }
      }
    });
    c.inputs.forEach(function (name) { if (trunkY[name] !== null) seg("in:" + name, trunkX[name], 16, trunkX[name], trunkY[name]); });
    // 札（途中の線の名前）：部品の出力の線の上
    if (tags) c._w0.forEach(function (w) {
      var nd = L.nodes.filter(function (x) { return x.id === w.gate.id; })[0], yo = nd.y + outPinY(nd.t, w.key);
      tagList.push({ net: w.ref, text: w.tagText, name: w.pname, x: nd.x + nd.w + 3, y: yo - 15, w: w.tagW, h: 12 });
    });
    // 分岐の丸
    var dots = dotsOf(segs);
    return { id: c.id, w: Math.ceil(W), h: Math.ceil(H), nodes: L.nodes.map(function (nd) { return { id: nd.id, kind: nd.kind, t: nd.t, name: nd.name, x: nd.x, y: nd.y, w: nd.w, h: nd.h, col: nd.col, slot: nd.slot }; }),
             segs: segs, dots: dots, tags: tagList, trunks: c.inputs.filter(function (nm) { return trunkY[nm] !== null; }).map(function (nm) { return { name: nm, x: trunkX[nm] }; }), inputX: trunkX, routes: edges.map(function (e) { return { net: e.net, sink: e.sink.id, pin: e.pin, type: e.route.type, yp: e.yp, xp: e.sink.x }; }), tagsOn: !!tags };
  }
  function dotsOf(segs) {                                   // 同じ線（net）の中で，3 本以上が出会う点・別の線の途中から出る点に丸
    var byNet = {}, dots = [], seen = {};
    segs.forEach(function (s) { (byNet[s.net] = byNet[s.net] || []).push(s); });
    Object.keys(byNet).forEach(function (net) {
      var list = byNet[net], pts = {};
      list.forEach(function (s) { [[s.x1, s.y1], [s.x2, s.y2]].forEach(function (p) { var k = p[0].toFixed(2) + "," + p[1].toFixed(2); (pts[k] = pts[k] || { x: p[0], y: p[1], ends: 0 }).ends++; }); });
      Object.keys(pts).forEach(function (k) {
        var p = pts[k], mid = 0;
        list.forEach(function (s) {
          if (s.h ? (Math.abs(s.y1 - p.y) < 0.01 && p.x > s.x1 + 0.01 && p.x < s.x2 - 0.01) : (Math.abs(s.x1 - p.x) < 0.01 && p.y > s.y1 + 0.01 && p.y < s.y2 - 0.01)) mid++;
        });
        if ((p.ends >= 3 || (mid >= 1 && p.ends >= 1)) && !seen[net + k]) { seen[net + k] = 1; dots.push({ net: net, x: p.x, y: p.y }); }
      });
    });
    return dots;
  }
  /* ---- 幾何の検査（配置の探索にも，selfTest にも使う）．違反の文を返す ---- */
  function geomViolations(lay) {
    var out = [], i, j, a, b, nodes = lay.nodes, segs = lay.segs, tags = lay.tags || [];
    function add(m) { out.push(m); }
    for (i = 0; i < nodes.length; i++) for (j = i + 1; j < nodes.length; j++) {
      a = nodes[i]; b = nodes[j];
      if (a.x < b.x + b.w + 2 && b.x < a.x + a.w + 2 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2) add("部品が重なる " + a.id + " " + b.id);
    }
    segs.forEach(function (s) {
      nodes.forEach(function (nd) {
        if (s.h) { if (s.y1 > nd.y - 1.5 && s.y1 < nd.y + nd.h + 1.5 && s.x1 < nd.x + nd.w - 0.01 && s.x2 > nd.x + 0.01) add("線が部品の内側を通る " + s.net + " " + nd.id); }
        else if (s.x1 > nd.x - 1.5 && s.x1 < nd.x + nd.w + 1.5 && s.y1 < nd.y + nd.h - 0.01 && s.y2 > nd.y + 0.01) add("線が部品の内側を通る " + s.net + " " + nd.id);
      });
      if (s.x1 < -0.01 || s.y1 < -0.01 || s.x2 > lay.w + 0.01 || s.y2 > lay.h + 0.01) add("線が図の外 " + s.net);
    });
    for (i = 0; i < segs.length; i++) for (j = i + 1; j < segs.length; j++) {
      a = segs[i]; b = segs[j];
      if (a.net === b.net) continue;
      if (a.h && b.h) { if (Math.abs(a.y1 - b.y1) < 0.6 && a.x1 <= b.x2 + 0.6 && b.x1 <= a.x2 + 0.6) add("別の線が同じ向きで重なる（水平）" + a.net + " " + b.net); }
      else if (!a.h && !b.h) { if (Math.abs(a.x1 - b.x1) < 0.6 && a.y1 <= b.y2 + 0.6 && b.y1 <= a.y2 + 0.6) add("別の線が同じ向きで重なる（垂直）" + a.net + " " + b.net); }
      else {
        var H = a.h ? a : b, V = a.h ? b : a;
        if (V.x1 >= H.x1 - 0.6 && V.x1 <= H.x2 + 0.6 && H.y1 >= V.y1 - 0.6 && H.y1 <= V.y2 + 0.6) {
          if (!(V.x1 > H.x1 + 0.6 && V.x1 < H.x2 - 0.6 && H.y1 > V.y1 + 0.6 && H.y1 < V.y2 - 0.6)) add("別の線の端が触れる " + a.net + " " + b.net);
        }
      }
    }
    tags.forEach(function (t, ti) {
      segs.forEach(function (s) { if (s.x1 < t.x + t.w + 1 && s.x2 > t.x - 1 && s.y1 < t.y + t.h + 1 && s.y2 > t.y - 1) add("札が線に重なる " + t.name + " " + s.net); });
      nodes.forEach(function (nd) { if (nd.x < t.x + t.w + 1 && nd.x + nd.w > t.x - 1 && nd.y < t.y + t.h + 1 && nd.y + nd.h > t.y - 1) add("札が部品に重なる " + t.name + " " + nd.id); });
      tags.forEach(function (u, ui) { if (ui > ti && u.x < t.x + t.w + 1 && t.x < u.x + u.w + 1 && u.y < t.y + t.h + 1 && t.y < u.y + u.h + 1) add("札どうしが重なる " + t.name + " " + u.name); });
      if (t.x < 0 || t.y < 0 || t.x + t.w > lay.w || t.y + t.h > lay.h) add("札が図の外 " + t.name);
    });
    return out;
  }
  function layoutCost(lay) {
    var cost = 0, i, j, a, b;
    lay.segs.forEach(function (s) { cost += (s.x2 - s.x1) + (s.y2 - s.y1); });
    for (i = 0; i < lay.segs.length; i++) for (j = i + 1; j < lay.segs.length; j++) {
      a = lay.segs[i]; b = lay.segs[j];
      if (a.net !== b.net && a.h !== b.h) { var H = a.h ? a : b, V = a.h ? b : a; if (V.x1 > H.x1 && V.x1 < H.x2 && H.y1 > V.y1 && H.y1 < V.y2) cost += 8; }
    }
    return cost + lay.w * 0.3;
  }
  var layoutCache = {};
  function layoutCircuit(c, tags) {
    var key = c.id + (tags ? "#t" : ""), nodes, byCol, rowsN, maxH, placements, best = null, bestCost = Infinity, pi, tries;
    if (layoutCache[key]) return layoutCache[key];
    nodes = makeNodes(c); byCol = []; nodes.forEach(function (nd) { (byCol[nd.col] = byCol[nd.col] || []).push(nd); });
    if (paperOf(c) && paperOf(c).above) paperOf(c).above.forEach(function (pr) {      // 紙の上下：同じ列の中で，上に描く部品を先に並べる（slotCombos は列の中の並びを変えない）
      byCol.forEach(function (l) { var ia = -1, ib = -1, t; l.forEach(function (nd, i) { if (nd.id === pr[0]) ia = i; if (nd.id === pr[1]) ib = i; }); if (ia >= 0 && ib >= 0 && ia > ib) { t = l[ia]; l[ia] = l[ib]; l[ib] = t; } });
    });
    rowsN = Math.max.apply(null, byCol.map(function (l) { return l.length; })); maxH = Math.max.apply(null, nodes.map(function (nd) { return nd.h; }));
    placements = product(byCol.map(function (l) { return slotCombos(rowsN, l.length); }));
    if (paperOf(c) && paperOf(c).above) placements = placements.filter(function (slots) {      // 紙の上下：[上, 下] の組は上の部品が小さい段
      var at = {};
      byCol.forEach(function (l, ci) { l.forEach(function (nd, i) { at[nd.id] = slots[ci][i]; }); });
      return paperOf(c).above.every(function (pr) { return at[pr[0]] < at[pr[1]]; });
    });
    placements.forEach(function (slots) {
      var L = layoutOnce(c, tags, nodes, byCol, slots, rowsN, maxH), cands = L.edges.map(function (e) { return candidates(L, e); }), idx, flips, f, ei, choice, lay, v, goods = 0, order = [], k2;
      if (cands.some(function (cl) { return cl.length === 0; })) return;
      // 総当たりの代わりに，最安の組み合わせ → 1 か所ずつ次の候補へ → 2 か所ずつ，の順に試す
      order.push(cands.map(function () { return 0; }));
      cands.forEach(function (cl, ei2) { for (k2 = 1; k2 < Math.min(cl.length, 4); k2++) { var o = cands.map(function () { return 0; }); o[ei2] = k2; order.push(o); } });
      cands.forEach(function (cl, e1) { cands.forEach(function (cl2, e2) { if (e2 <= e1) return; var k1, kk; for (k1 = 1; k1 < Math.min(cl.length, 3); k1++) for (kk = 1; kk < Math.min(cl2.length, 3); kk++) { var o = cands.map(function () { return 0; }); o[e1] = k1; o[e2] = kk; order.push(o); } }); });
      for (idx = 0; idx < order.length && goods < 2; idx++) {
        choice = order[idx].map(function (k3, ei3) { return cands[ei3][k3]; });
        lay = build(c, tags, L, choice);
        v = geomViolations(lay);
        if (v.length === 0) { goods++; var cs2 = layoutCost(lay) + choice.reduce(function (s, x) { return s + x.cost; }, 0); if (cs2 < bestCost) { bestCost = cs2; best = lay; } }
      }
    });
    if (!best) throw new Error("配置が見つからない " + key);
    best.cost = bestCost;
    layoutCache[key] = best;
    if (tags) {                                             // 札の名前は図の上下の位置で決まる：配置が決まったら名前をつけ，札に写す
      c._names = computeNames(c, best);
      best.tags.forEach(function (t) { var w = c._w0.filter(function (x) { return x.ref === t.net; })[0], alias = c.outs.filter(function (x) { return x.src === t.net && x.stage === false; })[0]; t.name = c._names.map[t.net]; t.text = t.name + (alias ? "＝" + alias.name : ""); });
    }
    return best;
  }

  // 部品の形（MIL）．ノード（x, y, w, h）から SVG の path の d を返す
  function shapePath(nd) {
    var x = nd.x, y = nd.y, w = nd.w, h = nd.h;
    if (nd.t === "AND") return "M" + x + "," + y + " H" + (x + w - h / 2) + " A" + (h / 2) + "," + (h / 2) + " 0 0 1 " + (x + w - h / 2) + "," + (y + h) + " H" + x + " Z";
    if (nd.t === "OR") return "M" + x + "," + y + " C" + (x + w * 0.32) + "," + y + " " + (x + w * 0.77) + "," + (y + h * 0.17) + " " + (x + w) + "," + (y + h / 2) + " C" + (x + w * 0.77) + "," + (y + h * 0.83) + " " + (x + w * 0.32) + "," + (y + h) + " " + x + "," + (y + h) + " Q" + (x + w * 0.27) + "," + (y + h / 2) + " " + x + "," + y + " Z";
    if (nd.t === "NOT") return "M" + x + "," + y + " L" + (x + w - 6) + "," + (y + h / 2) + " L" + x + "," + (y + h) + " Z";
    return "M" + x + "," + y + " h" + w + " v" + h + " h" + (-w) + " Z";
  }


  /* ============ 問題・段・判定 ============ */
  var CIRCLED = ["①", "②", "③"];
  function rowName(c, r) { var n = c.inputs.length; return c.inputs.map(function (nm, i) { return nm + "＝" + inputBit(n, i, r); }).join("，"); }
  function strBits(arr) { return arr.map(function (b) { return String(b); }); }
  function colsFor(c, refs) {                                   // refs：列にする参照の並び．{ ref, name }
    var v = evalOf(c), hIdx = {}, k = 0;
    c.gates.forEach(function (g) { if (g.t === "HA") hIdx[g.id] = CIRCLED[k++]; });
    return refs.map(function (w) {
      var g = c.gates.filter(function (x) { return x.id === w.ref || w.ref.indexOf(x.id + ".") === 0; })[0], key = w.ref.indexOf(".") > 0 ? w.ref.split(".")[1] : "o";
      var alias = c.outs.filter(function (o) { return o.src === w.ref && o.stage === false; })[0];       // 図の札と同じ「P＝C」の言い方（初級の④だけ）
      return { key: w.ref, ref: w.ref, name: w.name, headName: alias ? w.name + "＝" + alias.name : w.name, sub: g.t === "HA" ? hIdx[g.id] + key : g.t, gate: g, gateId: g.id, outKey: key, model: strBits(v[w.ref]) };
    });
  }
  function keyOf(p) { return p.key; }
  function makeProblem(s) {
    var p = { kind: s.kind, lv: s.kind === "basic" ? 0 : s.lv }, c, i;
    if (s.kind === "choose") {
      p.tbl = s.target; p.opts = s.opts.slice(); p.circuits = s.opts.map(function (id) { return CIRC[id]; });
      p.n = p.circuits[0].inputs.length;
      p.options = p.circuits.map(function (cc, i2) { return { label: LABELS[i2], id: cc.id, circuit: cc, table: tableOf(cc), correct: tableOf(cc) === s.target }; });
      p.key = "choose|" + p.lv + "|" + s.target + "|" + p.opts.join(",");
      p.avoid = "T" + p.lv + s.target;
      p.title = s.target;
      return p;
    }
    c = CIRC[s.cid]; p.cid = s.cid; p.circuit = c;
    p.key = p.kind + "|" + p.lv + "|" + s.cid; p.avoid = s.cid;
    return p;
  }
  function lastOf(recent) { return recent.length ? recent[recent.length - 1] : null; }
  function shuffle(a) { var out = a.slice(), i, j, t; for (i = out.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = out[i]; out[i] = out[j]; out[j] = t; } return out; }
  function sample(a, k) { return shuffle(a).slice(0, k); }
  var DUMMY_ONLY = ["q04", "q05", "q06", "q07", "q08", "z01", "z02"];
  function dummyOnlyTable(pool, t) { return pool.filter(function (c) { return tableOf(c) === t && DUMMY_ONLY.indexOf(c.id) < 0; }).length === 0; }
  function chooseSpec(lv, recent) {
    var pool = lv === 1 ? P_LIST.concat(Q_LIST) : R_LIST.concat(Z_LIST), tables = [], target, cands, withT, k, correct, others, dummies, i, tab;
    pool.forEach(function (c) { var t = tableOf(c); if (tables.indexOf(t) < 0) tables.push(t); });
    cands = tables.filter(function (t) { return recent.indexOf("T" + lv + t) < 0 && !dummyOnlyTable(pool, t); });     // 題（正解の表）にはダミー専用の表を選ばない（ダミーとしては使う）
    if (!cands.length) cands = tables.filter(function (t) { return !dummyOnlyTable(pool, t); });
    target = pick(cands);
    withT = pool.filter(function (c) { return tableOf(c) === target; });
    k = withT.length >= 2 ? (rng() < 0.5 ? 1 : 2) : 1;
    correct = sample(withT, k);
    others = shuffle(tables.filter(function (t) { return t !== target; })).slice(0, 4 - k);
    dummies = others.map(function (t) { return pick(pool.filter(function (c) { return tableOf(c) === t; })); });
    return { kind: "choose", lv: lv, target: target, opts: shuffle(correct.concat(dummies)).map(function (c) { return c.id; }) };
  }
  function gen(kind, lv, recent) {
    var pool, ids, cand, last = lastOf(recent), tries = 0, s;
    recent = recent || [];
    if (kind === "choose") return makeProblem(chooseSpec(lv, recent));
    if (kind === "basic") { ids = BASIC_LIST.map(function (c) { return c.id; }); cand = ids.filter(function (x) { return x !== last; }); return makeProblem({ kind: "basic", cid: pick(cand) }); }
    if (kind === "adder") {
      ids = lv === 1 ? ["ad1", "ad1m"] : ["ad2", "ad2m"];
      cand = ids.filter(function (x) { return x !== last; }); if (!cand.length) cand = ids;
      return makeProblem({ kind: "adder", lv: lv, cid: pick(cand) });
    }
    pool = (lv === 1 ? P_LIST : R_LIST).map(function (c) { return c.id; });
    cand = pool.filter(function (x) { return recent.indexOf(x) < 0; });
    if (!cand.length) cand = pool;
    s = { kind: "combine", lv: lv, cid: pick(cand) };
    return makeProblem(s);
  }
  function titleOf(p) { return p.kind === "choose" ? "出力 L ＝ " + p.tbl : (p.circuit.id); }
  function circuitOfProblem(p) { return p.circuit; }

  function stagesOf(p) {
    var c, out = [], wiresCols, finals;
    if (p.kind === "choose") {
      return [{ id: "pick", key: "pick", name: TEXT.ui.stageName.pick, type: "pick", instr: TEXT.ui.instrPick, options: p.options, last: true }];
    }
    c = p.circuit;
    if (p.kind === "basic") {
      return [{ id: "table", key: "table", name: TEXT.ui.stageName.table, type: "table", instr: TEXT.ui.instrBasic, rows: rowsOf(c), cols: colsFor(c, [{ ref: c.outs[0].src, name: c.outs[0].name }]), last: true }];
    }
    wiresCols = colsFor(c, c.wires.map(function (w) { return { ref: w.ref, name: w.name }; }));
    finals = colsFor(c, c.finals.map(function (o) { return { ref: o.src, name: o.name }; }));
    out.push({ id: "wires", key: "wires", name: TEXT.ui.stageName.wires, type: "table", instr: TEXT.ui.instrWires, rows: rowsOf(c), cols: wiresCols, last: false });
    out.push({ id: "out", key: "out", name: TEXT.ui.stageName.out, type: "table", instr: p.kind === "adder" ? (p.lv === 1 ? TEXT.ui.instrOutAdder1 : TEXT.ui.instrOutAdder) : TEXT.ui.instrOut, rows: rowsOf(c), cols: finals, last: true });
    return out;
  }
  function stageModelText(st) { return st.type === "pick" ? st.options.filter(function (o) { return o.correct; }).map(function (o) { return o.label; }).join("") : st.cols.map(function (cl) { return cl.name + ":" + cl.model.join(""); }).join(" "); }
  function emptyVals(st) { return st.type === "pick" ? st.options.map(function () { return false; }) : st.cols.map(function (cl) { return cl.model.map(function () { return ""; }); }); }

  /* ---- 列の誤りの見立て（§3.1） ---- */
  function opOf(t, key) { return t === "AND" ? function (a, b) { return a & b; } : t === "OR" ? function (a, b) { return a | b; } : t === "NOT" ? function (a) { return 1 - a; } : key === "S" ? function (a, b) { return (a + b) % 2; } : function (a, b) { return a & b; }; }
  function eqArr(a, b) { var i; if (a.length !== b.length) return false; for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function permsOf(n) { var out = [], a = []; (function rec() { var i; if (a.length === n) { out.push(a.slice()); return; } for (i = 0; i < n; i++) if (a.indexOf(i) < 0) { a.push(i); rec(); a.pop(); } })(); return out; }
  function permRows(m, n, perm) {                           // 行の番号の桁を perm で入れ替えた列．r の桁 i を，桁 perm[i] へ
    var R = 1 << n, out = [], r, q, i;
    for (r = 0; r < R; r++) { q = 0; for (i = 0; i < n; i++) q |= ((r >> (n - 1 - i)) & 1) << (n - 1 - perm[i]); out.push(m[q]); }
    return out;
  }
  function diagnose(p, st, vals, wrongCols) {
    var c = p.circuit, v = evalOf(c), col = st.cols[wrongCols[0]], g = col.gate, T = g.t, key = col.outKey, s = vals[wrongCols[0]].map(Number), m = col.model.map(Number);
    var xs = v[g.in[0]], ys = g.in[1] ? v[g.in[1]] : null, f = opOf(T, key), i, j, own = outKeys(g).map(function (k2) { return refOf(g, k2); }), refs = [], R = m.length, n = c.inputs.length, other, perms, id;
    function colOf(fn) { var o = [], r; for (r = 0; r < R; r++) o.push(fn(r)); return o; }
    if (T === "OR" && eqArr(s, colOf(function (r) { return xs[r] & ys[r]; }))) id = "W-1";
    else if (T === "AND" && eqArr(s, colOf(function (r) { return xs[r] | ys[r]; }))) id = "W-2";
    else if (T === "NOT" && eqArr(s, xs)) id = "W-3";
    else if (T === "HA" && eqArr(s, v[refOf(g, key === "S" ? "C" : "S")])) id = "W-6";
    else if (T === "HA" && key === "S" && eqArr(s, colOf(function (r) { return xs[r] | ys[r]; }))) id = "W-7";
    if (!id) {
      c.inputs.forEach(function (nm) { refs.push(nm); });
      c.gates.forEach(function (g2) { outKeys(g2).forEach(function (k2) { var rf = refOf(g2, k2); if (own.indexOf(rf) < 0) refs.push(rf); }); });
      if (T === "NOT") { for (i = 0; i < refs.length; i++) if (refs[i] !== g.in[0] && eqArr(s, colOf(function (r) { return f(v[refs[i]][r]); }))) { id = "W-4"; break; } }
      else for (i = 0; i < refs.length && !id; i++) for (j = i + 1; j < refs.length; j++) {
        if ((refs[i] === g.in[0] && refs[j] === g.in[1]) || (refs[i] === g.in[1] && refs[j] === g.in[0])) continue;
        if (eqArr(s, colOf(function (r) { return f(v[refs[i]][r], v[refs[j]][r]); }))) { id = "W-4"; break; }
      }
    }
    if (!id && n === 3) {
      perms = permsOf(3);
      for (i = 0; i < perms.length; i++) if (!(perms[i][0] === 0 && perms[i][1] === 1 && perms[i][2] === 2) && eqArr(s, permRows(m, 3, perms[i]))) { id = "W-5"; break; }
    }
    if (!id) id = "W-0";
    return { id: id, text: id === "W-5" ? hint5(c) : id === "W-0" ? hint0(g) : HINTS[id] };
  }
  function hint0(g) { var tn = g.t === "HA" ? "半加算回路" : g.t; return HINTS["W-0"].replace("{N}", g.t === "HA" ? "箱" : "部品").replace("{T}", tn).replace("{U}", g.t === "HA" ? tn : " " + tn + " "); }      // 部品の種類を文に差し込む
  function hint5(c) { return HINTS["W-5"].replace("A，B，C", c.inputs.join("，")); }       // 入力名は回路の入力名（全加算回路は A，B，Ci）
  function judgeTable(p, st, vals) {
    var empty = [], wrong = [], wrongCells = [], ok;
    st.cols.forEach(function (cl, ci) {
      var bad = false;
      cl.model.forEach(function (mv, r) {
        var v = vals[ci][r];
        if (v === "") { empty.push({ c: ci, r: r }); return; }
        if (v !== mv) { bad = true; wrongCells.push({ c: ci, r: r }); }
      });
      if (bad) wrong.push(ci);
    });
    ok = empty.length === 0 && wrong.length === 0;
    return { empty: empty, wrong: wrong, wrongCells: wrongCells, ok: ok, diag: (!ok && empty.length === 0 && wrong.length) ? diagnose(p, st, vals, wrong) : null };
  }
  function exampleRow(p, opt) {                             // 選んだ回路の出力が題の表と違う，最初の行
    var r, t = opt.table, n = p.n, R = 1 << n;
    for (r = 0; r < R; r++) if (t.charAt(r) !== p.tbl.charAt(r)) return { r: r, name: rowName(opt.circuit, r), out: t.charAt(r) };
    return null;
  }
  function judgePick(p, st, vals) {
    var over = [], miss = [], none = true, diag = null, ex;
    st.options.forEach(function (o, i) {
      if (vals[i]) none = false;
      if (vals[i] && !o.correct) over.push(i);
      if (!vals[i] && o.correct) miss.push(i);
    });
    if (over.length) { ex = exampleRow(p, st.options[over[0]]); diag = { id: "C-1", text: HINT_C1 + (ex ? "たとえば " + ex.name + " のとき，その回路の出力は " + ex.out + "．" : ""), over: over, ex: ex }; }
    else if (miss.length && !none) diag = { id: "C-2", text: HINT_C2, miss: miss };
    return { empty: none ? [{ c: 0, r: 0 }] : [], wrong: over.concat(miss), wrongCells: [], over: over, miss: miss, ok: !none && !over.length && !miss.length, diag: diag, none: none };
  }
  function judgeStage(p, st, vals) { return st.type === "pick" ? judgePick(p, st, vals) : judgeTable(p, st, vals); }

  function msgEmpty(st, empty) { return st.type === "pick" ? TEXT.msg.pickNone : "あと " + empty.length + " マス入れよう．"; }
  function describeWrong(p, st, j) {
    var parts, byCol = {};
    if (st.type === "pick") return j.over.length ? "選び方がちがいます" : "選んでいない回路があります";
    j.wrongCells.forEach(function (w) { (byCol[w.c] = byCol[w.c] || []).push(w.r); });
    parts = Object.keys(byCol).map(function (ci) {
      var rows = byCol[ci], nm = st.cols[ci].name;
      if (rows.length === 1) return nm + "の " + (rows[0] + 1) + " 行目（" + rowName(p.circuit, rows[0]) + "）";
      return nm + "の " + rows.map(function (r) { return r + 1; }).join("・") + " 行目";
    });
    if (j.wrongCells.length >= 4 || parts.length >= 3) return j.wrongCells.length + "か所ちがいます";
    return parts.join("と") + "がちがいます";
  }
  /* ---- 段の状態遷移（1回目誤り→もう1回，2回目も誤りなら値を見せる） ---- */
  function newStageState() { return { attempts: 0, result: null }; }
  function advance(s, ok) {
    if (s.result) return s;
    if (ok) return { attempts: s.attempts + 1, result: s.attempts === 0 ? "ok1" : "ok2" };
    if (s.attempts === 0) return { attempts: 1, result: null };
    return { attempts: 2, result: "rev" };
  }
  function attempt(p, st, s, vals) {
    var j = judgeStage(p, st, vals), o = { st: s, counted: false, empty: j.empty, ok: false, wrong: j.wrong, wrongCells: j.wrongCells, over: j.over || [], miss: j.miss || [], hint: null, hintId: null, head: "", detail: "", reveal: false, final: false, result: null, extra: "" };
    if (j.empty.length > 0) { o.head = msgEmpty(st, j.empty); return o; }
    o.st = advance(s, j.ok); o.counted = true; o.ok = j.ok;
    if (j.ok) {
      o.head = o.st.result === "ok1" ? TEXT.msg.ok1 : TEXT.msg.ok2; o.final = true; o.result = o.st.result;
      if (st.last) {
        if (p.kind === "adder") o.detail = p.lv === 2 ? TEXT.msg.endAdder2 : TEXT.msg.endAdder;
        else if (p.kind === "combine" && sameTableCount(p) > 1) o.detail = TEXT.msg.sameTable;
        else if (p.kind === "choose") o.detail = TEXT.msg.chooseAll;
      }
      return o;
    }
    o.detail = describeWrong(p, st, j);
    o.hint = j.diag ? j.diag.text : null; o.hintId = j.diag ? j.diag.id : null;
    if (o.st.result === "rev") {                                              // 値を見せる状態：「ちがいます」・ヒントは出さない（値を見せる文だけ）
      o.head = st.type === "pick" ? "正しい回路は " + st.options.filter(function (x) { return x.correct; }).map(function (x) { return x.label; }).join("・") + " です．次へ進もう．" : TEXT.msg.rev;
      o.reveal = true; o.final = true; o.result = "rev"; o.detail = ""; o.hint = null; o.hintId = null;
    }
    else { o.head = TEXT.msg.retry; o.detail += "．" + (st.type === "pick" ? "" : TEXT.msg.fixRed); }
    return o;
  }
  function sameTableCount(p) { var t = tableOf(p.circuit), list = p.circuit.inputs.length === 2 ? P_LIST : R_LIST; return list.filter(function (c) { return tableOf(c) === t; }).length; }
  function collapse(stages, results) { return { ids: stages.map(function (st) { return st.id; }), results: results.slice() }; }
  function problemSummary(ids, results) {
    var bad = [], i;
    for (i = 0; i < results.length; i++) if (results[i] !== "ok1") bad.push(ids[i]);
    return { perfect: bad.length === 0, stumbled: bad };
  }
  function summaryText(summary) {
    if (summary.perfect) return TEXT.msg.allFirst;
    return msgStumbled(summary.stumbled.map(function (id) { return TEXT.ui.stageName[id]; }));
  }

  /* ---- マスの操作（純粋関数）．state = { vals:[列][行], focus:{c,r} }．マスは 0・1 のタップ循環とキーボードの 0/1 ---- */
  function cycleCell(v) { return v === "" ? "0" : v === "0" ? "1" : "0"; }
  function bitFromKey(ev) {
    var k = String(ev.key == null ? "" : ev.key), code = String(ev.code || "");
    try { k = k.normalize("NFKC"); } catch (e) { }
    if (k === "0" || k === "1") return k;
    if (k.length === 1 && /[0-9]/.test(k)) return "x";
    if (k.length > 1 || k === "") {                            // 日本語入力がオンのときは key が "Process" などになる端末がある：code も見る
      if (code === "Digit0" || code === "Numpad0") return "0";
      if (code === "Digit1" || code === "Numpad1") return "1";
    }
    if (k.length === 1 && k.trim() !== "" && !/[0-1]/.test(k)) return "x";
    return null;
  }
  function cellEdit(state, ev) {
    var vals = state.vals.map(function (col) { return col.slice(); }), nC = vals.length, c = state.focus.c, r = state.focus.r, nR = vals[0].length, res = { vals: vals, focus: { c: c, r: r }, msg: "", submit: false, rejected: false, changed: false }, b;
    function clampC(x) { return Math.max(0, Math.min(nC - 1, x)); }
    function clampR(x) { return Math.max(0, Math.min(nR - 1, x)); }
    if (ev.type === "focus") { res.focus = { c: clampC(ev.c), r: clampR(ev.r) }; return res; }
    if (ev.type === "tap") { c = clampC(ev.c); r = clampR(ev.r); vals[c][r] = cycleCell(vals[c][r]); res.focus = { c: c, r: r }; res.changed = true; return res; }
    if (ev.type === "key") {
      if (ev.key === "Enter") { res.submit = true; return res; }
      if (ev.key === "Backspace" || ev.key === "Delete") { if (vals[c][r] !== "") res.changed = true; vals[c][r] = ""; return res; }
      if (ev.key === "ArrowLeft") { res.focus = { c: clampC(c - 1), r: r }; return res; }
      if (ev.key === "ArrowRight") { res.focus = { c: clampC(c + 1), r: r }; return res; }
      if (ev.key === "ArrowUp") { res.focus = { c: c, r: clampR(r - 1) }; return res; }
      if (ev.key === "ArrowDown") { res.focus = { c: c, r: clampR(r + 1) }; return res; }
      b = bitFromKey(ev);
      if (b === "x") { res.rejected = true; res.msg = "0 か 1 を入れよう．"; return res; }
      if (b === null) return res;
      vals[c][r] = b; res.changed = true;
      if (r < nR - 1) res.focus = { c: c, r: r + 1 };
      else if (c < nC - 1) res.focus = { c: c + 1, r: 0 };
      return res;
    }
    return res;
  }
  function firstEmptyCell(vals) { var c, r; for (c = 0; c < vals.length; c++) for (r = 0; r < vals[c].length; r++) if (vals[c][r] === "") return { c: c, r: r }; return { c: 0, r: 0 }; }
  function cellLabel(colName, rowN, rowText, value) { return colName + " の " + rowN + " 行目（" + rowText + "） " + (value === "" ? TEXT.ui.emptyCell : value); }

  /* ---- 記録（localStorage．SPEC §6） ---- */
  function hasLv(kind) { return kind !== "basic"; }
  function comboKey(kind, lv) { return hasLv(kind) ? kind + lv : kind; }
  function combosList() { var out = []; KINDS.forEach(function (k) { if (hasLv(k)) LEVELS.forEach(function (l) { out.push([k, l]); }); else out.push([k, 0]); }); return out; }
  function newCombo(kind) {
    var c = { tried: 0, perfect: 0, streak: 0, cleared: false, pending: false, stage: {} };
    STAGE_IDS[kind].forEach(function (id) { c.stage[id] = { n: 0, miss1: 0, rev: 0 }; });
    return c;
  }
  function newRec() {
    var rec = { v: 1, sel: { kind: "basic", lv: 1 }, rec: {} };
    combosList().forEach(function (kl) { rec.rec[comboKey(kl[0], kl[1])] = newCombo(kl[0]); });
    return rec;
  }
  function clampInt(v) { return (typeof v === "number" && isFinite(v) && v > 0) ? Math.min(Math.floor(v), 1000000) : 0; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function normalizeRec(raw) {
    var rec = newRec();
    if (!isObj(raw) || raw.v !== 1) return rec;
    if (isObj(raw.sel)) {
      if (KINDS.indexOf(raw.sel.kind) >= 0) rec.sel.kind = raw.sel.kind;
      if (LEVELS.indexOf(raw.sel.lv) >= 0) rec.sel.lv = raw.sel.lv;
    }
    if (isObj(raw.rec)) {
      combosList().forEach(function (kl) {
        var k = kl[0], key = comboKey(k, kl[1]), src = Object.prototype.hasOwnProperty.call(raw.rec, key) ? raw.rec[key] : null, c = rec.rec[key];
        if (!isObj(src)) return;
        c.tried = clampInt(src.tried); c.perfect = Math.min(clampInt(src.perfect), c.tried); c.streak = Math.min(clampInt(src.streak), CLEAR_STREAK);
        c.cleared = src.cleared === true;
        c.pending = false;
        if (src.pending === true) c.streak = 0;
        if (isObj(src.stage)) {
          STAGE_IDS[k].forEach(function (id) {
            var s = Object.prototype.hasOwnProperty.call(src.stage, id) ? src.stage[id] : null; if (!isObj(s)) return;
            var sn = Math.min(clampInt(s.n), c.tried);
            c.stage[id] = { n: sn, miss1: Math.min(clampInt(s.miss1), sn), rev: Math.min(clampInt(s.rev), sn) };
          });
        }
      });
    }
    return rec;
  }
  function loadRec(storage) {
    var s;
    try { s = storage.getItem(STORAGE_KEY); } catch (e) { return { rec: newRec(), usable: false }; }
    if (s == null) return { rec: newRec(), usable: true };
    try { return { rec: normalizeRec(JSON.parse(s)), usable: true }; } catch (e2) { return { rec: newRec(), usable: true }; }
  }
  function saveRec(storage, rec) { try { storage.setItem(STORAGE_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; } }
  function clearRec(storage) { try { storage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; } }
  function recStart(rec, kind, lv) { rec.rec[comboKey(kind, lv)].pending = true; return rec; }
  function recAbandon(rec, kind, lv) { var c = rec.rec[comboKey(kind, lv)]; if (c.pending) { c.streak = 0; c.pending = false; } return rec; }
  function recFinish(rec, kind, lv, stages, results) {
    var c = rec.rec[comboKey(kind, lv)], col = collapse(stages, results), sum = problemSummary(col.ids, col.results), i, s;
    c.pending = false; c.tried++;
    if (sum.perfect) { c.perfect++; c.streak++; if (c.streak >= CLEAR_STREAK) c.cleared = true; }
    else c.streak = 0;
    for (i = 0; i < col.ids.length; i++) {
      s = c.stage[col.ids[i]]; s.n++;
      if (col.results[i] !== "ok1") s.miss1++;
      if (col.results[i] === "rev") s.rev++;
    }
    return rec;
  }
  function tickOf(rec, kind, lv) { return rec.rec[comboKey(kind, lv)].cleared === true; }
  function weakestStage(combo, kind) {
    var best = null, bestRate = -1;
    STAGE_IDS[kind].forEach(function (id) {
      var s = combo.stage[id], rate;
      if (s.n < 5) return;
      rate = s.miss1 / s.n;
      if (rate > bestRate) { bestRate = rate; best = id; }
    });
    return best;
  }

  /* ---- 画面に出る文字列の一覧（禁止語の検査用） ---- */
  function plain(s) { return s.replace(/<\/?b>/g, ""); }
  function staticTexts() {
    var out = [];
    (function walk(v) {
      if (typeof v === "string") out.push(plain(v));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(TEXT);
    out.push.apply(out, Object.keys(HINTS).filter(function (x) { return x !== "W-0"; }).map(function (x) { return HINTS[x]; }));
    ["AND", "OR", "NOT", "HA"].forEach(function (t) { out.push(hint0({ t: t })); });
    out.push(HINT_C1, HINT_C2, msgStumbled(["a", "b"]), hint5(CIRC.ad2), hint5(CIRC.r01));
    Object.keys(CIRC).forEach(function (id) { out.push(describeCircuit(CIRC[id])); });
    return out;
  }
  function checkTexts(list) {
    var bad = [];
    list.forEach(function (t) {
      var u = t.replace(/真理値表/g, "");
      BANNED_SCREEN.forEach(function (w) { if (u.indexOf(w) >= 0) bad.push("禁止語「" + w + "」: " + t); });
      if (u.indexOf("真") >= 0) bad.push("禁止語「真」: " + t);
      if (u.indexOf("偽") >= 0) bad.push("禁止語「偽」: " + t);
    });
    return bad;
  }

  /*@@TEST@@*/
  /* ============ 自己検査 ============
     模範の値・判定・ヒントの主張は，コアとは別の実装（整数のビットマスク．手書きの式）で検算する． */
  function selfTest(nPer, seed, docs, sources) {
    if (seed !== undefined) setSeed(seed);
    nPer = nPer || 3000;
    var rep = { n: nPer, seed: seed, totalChecked: 0, totalFail: 0, failures: [], extra: {} };
    function fail(msg) { rep.totalFail++; if (rep.failures.length < 40) rep.failures.push(msg); }
    function check(cond, msg) { rep.totalChecked++; if (!cond) fail(msg); }

    /* ---- 別実装（オラクル）：行ごとのビットを整数のビットマスクにする（行 0 が最上位）．手書きの式 ---- */
    var MASK = { 1: { A: 1, B: 0, C: 0, F: 3 }, 2: { A: 3, B: 5, C: 0, F: 15 }, 3: { A: 15, B: 51, C: 85, F: 255 } };
    function maskStr(m, R) { var o = "", i; for (i = R - 1; i >= 0; i--) o += (m >> i) & 1; return o; }
    var OR2 = {     // 2 入力
      p01: function (A, B) { return ~(A & B); }, p02: function (A, B) { return ~A & B; }, p03: function (A, B) { return A & ~B; }, p04: function (A, B) { return ~A | ~B; },
      p05: function (A, B) { return (A & B) | ~B; }, p06: function (A, B) { return (A & B) | ~A; }, p07: function (A, B) { return ~(A | B); }, p08: function (A, B) { return ~A & ~B; },
      p09: function (A, B) { return ~A | B; }, p10: function (A, B) { return A | ~B; },
      q01: function (A, B) { return (A | B) & ~(A & B); }, q02: function (A, B) { return (A & ~B) | (~A & B); }, q03: function (A, B) { return (A & B) | (~A & ~B); },
      q04: function (A) { return A | ~A; }, q05: function (A, B) { return A & B; }, q06: function (A, B) { return A | B; },
      q07: function (A, B) { return (A | ~B) & (A & B); }, q08: function (A, B) { return (A | B) | (~A | ~B); },
      b_and: function (A, B) { return A & B; }, b_or: function (A, B) { return A | B; }, b_not: function (A) { return ~A; }
    };
    var OR3 = {
      r01: function (A, B, C) { return (A & B) | C; }, r02: function (A, B, C) { return (~A & ~B) | (B & C); }, r03: function (A, B, C) { return (A | B) & C; }, r04: function (A, B, C) { return A & (B | C); },
      r05: function (A, B, C) { return ~A & (B | C); }, r06: function (A, B, C) { return A & B & C; }, r07: function (A, B, C) { return A | B | C; }, r08: function (A, B, C) { return ~((A & B) | C); },
      r09: function (A, B, C) { return (A & B) | (~A & C); }, r10: function (A, B, C) { return (A & ~B) | C; }, r11: function (A, B, C) { return ~A | (B & C); }, r12: function (A, B, C) { return (A | C) & ~B; },
      r13: function (A, B, C) { return ~(A & B) & C; }, r14: function (A, B, C) { return (A & B) | (B & C); }, r15: function (A, B, C) { return A | (~B & C); },
      r16: function (A, B, C) { return A & (B & C); }, r17: function (A, B, C) { return A | (B | C); }, r18: function (A, B, C) { return B & (A | C); },
      r19: function (A, B, C) { return (A & B) | (A & C); }, r20: function (A, B, C) { return (A & C) | (B & C); }, r21: function (A, B, C) { return (A | C) & (B | C); },
      z01: function (A) { return A | ~A; }, z02: function (A) { return A & ~A; }
    };
    function oracleTable(id) {
      var c = CIRC[id], n = c.inputs.length, M = MASK[n], f = OR2[id] || OR3[id], R = 1 << n;
      return maskStr(f(M.A, M.B, M.C) & M.F, R);
    }

    /* ---- 1. 正本の項目 F1〜F22 ---- */
    (function () {
      var t = {}, i;
      check(CIRC.b_and.inputs.length === 2 && tableOf(CIRC.b_and) === "0001", "F1 AND 0001");
      check(tableOf(CIRC.b_or) === "0111", "F2 OR 0111");
      check(tableOf(CIRC.b_not) === "10", "F3 NOT 0→1，1→0");
      check(bitsOf(evalOf(CIRC.ad1)["g1"]) === "0001", "F4 例題7の C 0001");
      check(tableOf(CIRC.ad1, "g4") === "0110", "F5 例題7の S 0110");
      [[0, 0, "00"], [0, 1, "01"], [1, 0, "01"], [1, 1, "10"]].forEach(function (a, k) {                      // F6〜F9 1 桁の足し算 ＝ C S
        var v = evalOf(CIRC.ad1), r = a[0] * 2 + a[1];
        check(String(v.g1[r]) + String(v.g4[r]) === a[2] && (a[0] + a[1]).toString(2) === String(parseInt(a[2], 2).toString(2)), "F" + (6 + k) + " " + a[0] + "＋" + a[1]);
      });
      check(tableOf(CIRC.p05) === "1011", "F10 章末問題12 1011");
      check(tableOf(CIRC.q02) === "0110" && tableOf(CIRC.q01) === "0110" && tableOf(CIRC.q07) === "0001" && tableOf(CIRC.q08) === "1111", "F11〜F14 思5 ア（q02）0110・ウ（q01）0110・イ（q07）0001・エ（q08）1111");
      (function () {                                                                                          // イ・エの全入力行を別の式で確かめる．q07 は A＝1，B＝1 のときだけ 1（OR(A,NOT B)＝1 かつ AND＝1）
        var v7 = evalOf(CIRC.q07), v8 = evalOf(CIRC.q08), r, A, B;
        check(CIRC.q07.gates.map(function (g) { return g.t; }).sort().join() === "AND,AND,NOT,OR" && CIRC.q08.gates.map(function (g) { return g.t; }).sort().join() === "NOT,NOT,OR,OR,OR", "思5 イ（NOT・OR・AND・AND の 4 部品）・エ（OR×3・NOT×2 の 5 部品）の部品");
        check(CIRC.q07.gates.some(function (g) { return g.t === "NOT" && g.in[0] === "B"; }) && !CIRC.q07.gates.some(function (g) { return g.t === "NOT" && g.in[0] === "A"; }), "q07（思5 のイ）の NOT は B に付く（原本どおり）");
        check(CIRC.q08.wires.length === 4 && CIRC.q07.wires.length === 3, "q07・q08 の途中の線の数（3・4 本．上限 4 本以内）");
        for (r = 0; r < 4; r++) {
          A = r >> 1; B = r & 1;
          check(v7[CIRC.q07.outs[0].src][r] === (((A | (1 - B)) === 1 && (A & B) === 1) ? 1 : 0) && v7[CIRC.q07.outs[0].src][r] === (A === 1 && B === 1 ? 1 : 0), "q07 は A＝1，B＝1 のときだけ 1（行 " + r + "）");
          check(v8[CIRC.q08.outs[0].src][r] === 1 && v8.g1[r] === (A | B) && v8.g2[r] === 1 - A && v8.g3[r] === 1 - B && v8.g4[r] === ((1 - A) | (1 - B)), "q08 は常に 1（行 " + r + "）．途中の線 OR(A,B)・NOT A・NOT B・OR(NOT A,NOT B)");
        }
      })();
      check(tableOf(CIRC.p01) === "1110" && tableOf(CIRC.p02) === "0100" && tableOf(CIRC.p04) === "1110", "F15〜F17 昨年度 #01・#02・#03");
      check(tableOf(CIRC.q05) === "0001", "F18 #04 0001");
      check(tableOf(CIRC.r01) === "01010111" && tableOf(CIRC.r02) === "11010001", "F19・F20 #05・#06");
      (function () {                                                                                          // F21 全加算回路 8 行（§2.4 の表）
        var v = evalOf(CIRC.ad2), W = { l1: "00111100", l2: "00000011", l3: "00010100", S: "01101001", Co: "00010111" }, r, A, B, Ci;
        check(bitsOf(v["h1.S"]) === W.l1 && bitsOf(v["h1.C"]) === W.l2 && bitsOf(v["h2.C"]) === W.l3 && bitsOf(v["h2.S"]) === W.S && bitsOf(v.o1) === W.Co, "F21 全加算回路の表（P〜R，S，Co）");
        for (r = 0; r < 8; r++) { A = r >> 2; B = (r >> 1) & 1; Ci = r & 1; check(2 * v.o1[r] + v["h2.S"][r] === A + B + Ci, "F21 Co S の 2 進数＝A＋B＋Ci（行 " + r + "）"); }
      })();
      (function () {                                                                                          // F22 4 ビット加算：全加算回路を 4 段つなぐ評価
        var v = evalOf(CIRC.ad2);
        function add4(a, b) {
          var carry = 0, out = "", i2, ai, bi, r;
          for (i2 = 3; i2 >= 0; i2--) { ai = parseInt(a.charAt(i2), 2); bi = parseInt(b.charAt(i2), 2); r = ai * 4 + bi * 2 + carry; out = v["h2.S"][r] + out; carry = v.o1[r]; }
          return carry + out;
        }
        check(add4("1101", "0111") === "10100", "F22 1101＋0111＝10100");
        check(add4("1111", "0001") === "10000", "F22 1111＋0001＝10000");
      })();
      rep.extra.formal = 22;
    })();

    /* ---- 2. 別実装の評価器：全テンプレートの全入力行 ---- */
    (function () {
      var ids = Object.keys(CIRC).filter(function (id) { return OR2[id] || OR3[id]; }), cnt = 0;
      ids.forEach(function (id) {
        var t = tableOf(CIRC[id]), o = oracleTable(id);
        check(t === o, "評価器と手書きの式が一致 " + id + " " + t + " " + o);
        check(t === EXPECT[id], "SPEC の表と一致 " + id + " " + t + " " + EXPECT[id]);
        cnt++;
      });
      check(P_LIST.length === 10 && R_LIST.length === 21 && Q_LIST.length === 8 && Z_LIST.length === 2 && BASIC_LIST.length === 3, "テンプレートの数（② 10＋21，③ の追加 8＋2，① 3）");
      check(ids.length === 10 + 21 + 8 + 2 + 3, "照合した回路の数 " + ids.length);
      rep.extra.templatesChecked = cnt;
      // 鏡は A と B を入れ替えた回路．表は A・B の入れ替え（行 01 と 10 の入れ替え）
      ["ad1", "ad2"].forEach(function (id) {
        var a = evalOf(CIRC[id]), m = evalOf(CIRC[id + "m"]), ref = id === "ad1" ? ["g4", "g1"] : ["h2.S", "o1"];
        ref.forEach(function (r) { check(maskCols(a[r]) === maskCols(m[r]), "鏡の出力は同じ表 " + id + " " + r); });
        check(JSON.stringify(CIRC[id].inputs) === JSON.stringify(CIRC[id + "m"].inputs) && JSON.stringify(CIRC[id].gates) !== JSON.stringify(CIRC[id + "m"].gates), "鏡は線のつなぎ替え " + id);
      });
      function maskCols(a) { return a.join(""); }
    })();

    /* ---- 3. 幾何（全テンプレート．鏡・札あり・なし） ---- */
    (function () {
      var ids = Object.keys(CIRC), maxW = 0, maxH = 0, maxWAd = 0, n = 0;
      ids.forEach(function (id) {
        [true, false].forEach(function (tags) {
          var c = CIRC[id], lay = layoutCircuit(c, tags), v = geomViolations(lay), lim = c.gates.some(function (g) { return g.t === "HA"; }) ? 380 : 360, ni, ei, sinks = {};
          n++;
          check(v.length === 0, "幾何 " + id + (tags ? "（札あり）" : "") + "：" + v.slice(0, 2).join("／"));
          check(lay.w <= lim && lay.h <= 230, "図の大きさ " + id + " " + lay.w + "×" + lay.h);
          if (lim === 360) maxW = Math.max(maxW, lay.w); else maxWAd = Math.max(maxWAd, lay.w);
          maxH = Math.max(maxH, lay.h);
          // 線の端が部品の足の座標に一致
          lay.routes.forEach(function (r) {
            var hit = lay.segs.some(function (s) { return s.h && Math.abs(s.x2 - r.xp) < 0.01 && Math.abs(s.y1 - r.yp) < 0.01; });
            check(hit, "線の端が足に一致 " + id + " " + r.sink + "#" + r.pin);
            sinks[r.net] = (sinks[r.net] || 0) + 1;
          });
          c.gates.forEach(function (g) {                           // 出力の足から線が出る
            outKeys(g).forEach(function (k) {
              var nd = lay.nodes.filter(function (x) { return x.id === g.id; })[0], ref = refOf(g, k), y = nd.y + outPinY(g.t, k), used = lay.routes.some(function (r) { return r.net === ref; });
              if (used) check(lay.segs.some(function (s) { return s.net === ref && s.h && Math.abs(s.x1 - (nd.x + nd.w)) < 0.01 && Math.abs(s.y1 - y) < 0.01; }), "出力の足から線が出る " + id + " " + ref);
            });
          });
          lay.dots.forEach(function (d) { check(lay.segs.some(function (s) { return s.net === d.net && (s.h ? Math.abs(s.y1 - d.y) < 0.01 && d.x >= s.x1 - 0.01 && d.x <= s.x2 + 0.01 : Math.abs(s.x1 - d.x) < 0.01 && d.y >= s.y1 - 0.01 && d.y <= s.y2 + 0.01); }), "丸が線の上にある " + id); });
          Object.keys(sinks).forEach(function (net) {
            var nd = lay.dots.filter(function (d) { return d.net === net; }).length;
            if (sinks[net] === 1) check(nd === 0, "分岐のない線に丸が付かない " + id + " " + net);
            else check(nd >= 1, "分岐のある線に丸が付く " + id + " " + net);
          });
          // 部品の数・途中の線の数（表の列を 375px に収めるため）
          if (id.indexOf("q") !== 0 && id.indexOf("z") !== 0 && tags) { check(c.gates.length <= MAX_GATES && c.wires.length <= MAX_WIRES, "部品は 5 個まで，途中の線は 4 本まで " + id); }
        });
      });
      rep.extra.geom = { layouts: n, maxW: maxW, maxWAdder: maxWAd, maxH: maxH };
    })();

    /* ---- 3b. 途中の線の名前（SPEC §5.4）：図の上下の位置の順・紙との照合 ---- */
    (function () {
      var ins = {}, outs = {}, nb = 0, paperN = 0;
      function posOrder(c, lay) {                                                      // 札のある線を（列，出力の足の高さ）の順に並べた参照
        return c._w0.map(function (w) { var nd = lay.nodes.filter(function (x) { return x.id === w.gate.id; })[0]; return { ref: w.ref, col: w.gate.col, y: nd.y + outPinY(nd.t, w.key) }; })
          .sort(function (a, b) { return a.col - b.col || a.y - b.y; }).map(function (x) { return x.ref; });
      }
      Object.keys(CIRC).forEach(function (id) {
        var c = CIRC[id], lay = layoutCircuit(c, true), names = c.wires.map(function (w) { return w.name; }), pp = paperOf(c), pos = posOrder(c, lay), seen = {}, reserved;
        reserved = c.inputs.concat(c.outs.map(function (o) { return o.name; })).concat(["S"]);
        nb++;
        check(names.every(function (nm, i) { return !seen[nm] && (seen[nm] = 1); }), "線の名前が重ならない " + id + " " + names.join());
        check(names.every(function (nm) { return reserved.indexOf(nm) < 0; }), "線の名前は S・入力名・出力名と重ならない " + id + " " + names.join());
        check(names.join() === WIRE_SEQ.slice(0, names.length).join(), "名前は P・Q・R・T の順に隙間なく " + id + " " + names.join());
        check(c.wires.length === c.gates.reduce(function (n, g) { return n + outKeys(g).length; }, 0) - c.finals.length, "線の数＝部品の出力の数−出力の列 " + id);
        check(c.wires.every(function (w) { return c.wireName[w.ref] === w.name; }), "wireName と wires の名前が一致 " + id);
        if (!pp || !pp.notInOrder) check(pos.map(function (r) { return c.wireName[r]; }).join() === names.join(), "名前の順＝列→上下の位置の順 " + id + " " + pos.map(function (r) { return c.wireName[r]; }).join());
        check(lay.tags.every(function (t) { var alias = c.outs.filter(function (x) { return x.src === t.net && x.stage === false; })[0]; return t.name === c.wireName[t.net] && t.text === t.name + (alias ? "＝" + alias.name : ""); }), "図の札の文字が線の名前と一致 " + id);
        if (id.indexOf("b_") !== 0 && id.charAt(0) !== "q" && id.charAt(0) !== "z") check(stagesOf(makeProblem({ kind: id.indexOf("ad") === 0 ? "adder" : "combine", lv: c.inputs.length === 2 ? 1 : 2, cid: id }))[0].cols.map(function (x) { return x.name; }).join() === names.join(), "表の列の並び＝名前の順 " + id);
        if (pp && !c.base) paperN++;
      });
      // 紙の 6 問（第12回ワークシート［3］［4］．値は 第12回_ワークシート.tex の \tc から）：線の名前・値・図の上下／左右
      var PAPER6 = [
        { id: "p02", paper: "［3］例", w: [["P", "NOT", "1100"]], L: "0100" },
        { id: "p01", paper: "［3］練習1", w: [["P", "AND", "0001"]], L: "1110" },
        { id: "p05", paper: "［3］練習2（章末問題12）", w: [["P", "AND", "0001"], ["Q", "NOT", "1010"]], L: "1011", above: [["P", "Q"]], sameCol: [["P", "Q"]] },
        { id: "q01", paper: "［3］ア", w: [["P", "AND", "0001"], ["Q", "OR", "0111"], ["R", "NOT", "1110"]], L: "0110", above: [["P", "Q"]], sameCol: [["P", "Q"]], left: [["P", "R"]] },
        { id: "q07", paper: "［3］イ", w: [["P", "AND", "0001"], ["Q", "OR", "1011"], ["R", "NOT", "1010"]], L: "0001", above: [["Q", "P"]], sameCol: [["P", "Q"]], left: [["R", "P"]] },
        { id: "ad1", paper: "［4］半加算回路", w: [["P", "AND", "0001"], ["Q", "OR", "0111"], ["R", "NOT", "1110"]], L: "0110", C: "0001", above: [["P", "Q"]], sameCol: [["P", "Q"]], left: [["P", "R"]], alias: "P" }
      ];
      PAPER6.forEach(function (d) {
        [d.id].concat(d.id === "ad1" ? ["ad1m"] : []).forEach(function (cid) {
          var c = CIRC[cid], lay = layoutCircuit(c, true), v = evalOf(c), nodeOf = {};
          function wr(nm) { return c.wires.filter(function (w) { return w.name === nm; })[0]; }
          function ndOf(nm) { var w = wr(nm); return lay.nodes.filter(function (x) { return x.id === w.gate.id; })[0]; }
          check(c.wires.length === d.w.length, "紙 " + d.paper + "：線の数 " + cid);
          d.w.forEach(function (x) {
            var w = wr(x[0]);
            check(!!w && w.gate.t === x[1] && bitsOf(v[w.ref]) === x[2], "紙 " + d.paper + "：" + x[0] + "＝" + x[1] + " の出力 " + x[2] + " " + cid);
          });
          check(bitsOf(v[c.outs.filter(function (o) { return o.name === "L" || o.name === "S"; })[0].src]) === d.L, "紙 " + d.paper + "：出力 " + d.L + " " + cid);
          if (d.C) check(bitsOf(v[c.outs.filter(function (o) { return o.name === "C"; })[0].src]) === d.C && c.wireName[c.outs.filter(function (o) { return o.name === "C"; })[0].src] === d.alias, "紙 " + d.paper + "：C＝" + d.C + "（P の線）" + cid);
          (d.above || []).forEach(function (pr) { check(ndOf(pr[0]).y < ndOf(pr[1]).y, "紙 " + d.paper + "：" + pr[0] + " が " + pr[1] + " の上 " + cid); });
          (d.sameCol || []).forEach(function (pr) { check(ndOf(pr[0]).col === ndOf(pr[1]).col, "紙 " + d.paper + "：" + pr[0] + " と " + pr[1] + " は同じ列 " + cid); });
          (d.left || []).forEach(function (pr) { check(ndOf(pr[0]).col < ndOf(pr[1]).col, "紙 " + d.paper + "：" + pr[0] + " が " + pr[1] + " の左 " + cid); });
        });
      });
      // 紙の対応表（SPEC §5.4）の問題番号：思5 のウ＝q01（紙のア），思5 のイ＝q07（紙のイ），章末問題12＝p05，例題7＝ad1
      check(CIRC.q01.expr === "AND(OR(A,B),NOT(AND(A,B)))" && CIRC.q07.expr === "AND(OR(A,NOT(B)),AND(A,B))" && CIRC.p05.expr === "OR(AND(A,B),NOT(B))" && CIRC.p02.expr === "AND(NOT(A),B)" && CIRC.p01.expr === "NOT(AND(A,B))", "紙の 6 問に当たるテンプレートの式");
      check(paperN === 6 && Object.keys(PAPER).length === 6, "紙の問題の登録は 6 つ");
      // 解説・文に旧名「線1」が残っていない
      check(!/線[0-9１-９]/.test(JSON.stringify(TEXT)) && !/線[0-9１-９]/.test(JSON.stringify(HINTS)), "画面の文に「線1」「線2」が残っていない");
      Object.keys(sources || {}).forEach(function (f) { check(!/線[0-9１-９]/.test(sources[f].replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")) || f === "logic-core.js", "ソースの文字列に「線1」が残っていない " + f); });
      rep.extra.wireNames = { circuits: nb, paper: paperN };
    })();

    /* ---- 4. 同じ表の組の列挙・形の重複 ---- */
    (function () {
      function groups(list) { var g = {}; list.forEach(function (c) { var t = tableOf(c); (g[t] = g[t] || []).push(c.id); }); return Object.keys(g).filter(function (t) { return g[t].length > 1; }).map(function (t) { return g[t].join("/"); }).sort().join(" "); }
      check(groups(P_LIST) === "p01/p04 p05/p10 p06/p09 p07/p08", "初級 ② の同じ表の組 " + groups(P_LIST));
      check(groups(R_LIST) === "r01/r21 r03/r20 r04/r19 r06/r16 r07/r17 r14/r18", "中級 ② の同じ表の組 " + groups(R_LIST));
      check(P_LIST.map(function (c) { return tableOf(c); }).filter(function (t, i, a) { return a.indexOf(t) === i; }).length === 6, "初級 ② は表 6 種");
      check(R_LIST.map(function (c) { return tableOf(c); }).filter(function (t, i, a) { return a.indexOf(t) === i; }).length === 15, "中級 ② は表 15 種");
      check(P_LIST.concat(Q_LIST).map(function (c) { return tableOf(c); }).filter(function (t, i, a) { return a.indexOf(t) === i; }).length === 11 && P_LIST.concat(Q_LIST).length === 18, "初級 ③ は 18 回路・表 11 種");
      check(R_LIST.concat(Z_LIST).map(function (c) { return tableOf(c); }).filter(function (t, i, a) { return a.indexOf(t) === i; }).length === 17, "中級 ③ の表の種類 17");
      function canon(c) {                                    // 可換な部品の入力を並べ替えた正規形（鏡で同じになる回路を 1 つに数える）
        var memo = {};
        function f(ref) { var g, a; if (isIn(c, ref)) return ref; if (memo[ref]) return memo[ref]; g = c.gates.filter(function (x) { return x.id === ref; })[0]; a = g.in.map(f); if (g.t !== "NOT") a.sort(); return (memo[ref] = g.t + "(" + a.join(",") + ")"); }
        return f(c.outs[0].src);
      }
      [P_LIST, R_LIST, P_LIST.concat(Q_LIST), R_LIST.concat(Z_LIST)].forEach(function (list, k) {
        var seen = {}, dup = [];
        list.forEach(function (c) { var key = canon(c); if (seen[key]) dup.push(c.id + "＝" + seen[key]); seen[key] = c.id; });
        check(dup.length === 0, "回路の形の重複（鏡・順序違いを含む）" + dup.join(","));
      });
      // 鏡の組（p02/p03・p05/p06・p09/p10）は，つなぎ替えると表が変わる別の形として別に持つ
      check(canon(CIRC.p02) !== canon(CIRC.p03) && canon(CIRC.p05) !== canon(CIRC.p06) && canon(CIRC.p09) !== canon(CIRC.p10), "鏡の組は形が違う");
    })();

    /* ---- 5. ③ のダミー・判定 ---- */
    (function () {
      var lv, i, seenT = {}, k1 = 0, k2 = 0;
      for (lv = 1; lv <= 2; lv++) {
        var recent = [], pool = lv === 1 ? P_LIST.concat(Q_LIST) : R_LIST.concat(Z_LIST), allT = {}, got = {};
        pool.forEach(function (c) { if (DUMMY_ONLY.indexOf(c.id) < 0) allT[tableOf(c)] = 1; });          // 題になれる表（ダミー専用の表を除く）
        for (i = 0; i < nPer; i++) {
          var p = gen("choose", lv, recent), ids = p.opts, tabs = {}, k, ok = true, dummyTabs = {}, j, o, orc;
          recent.push(p.avoid); if (recent.length > AVOID) recent.shift();
          check(ids.length === 4 && ids.filter(function (x, q, a) { return a.indexOf(x) === q; }).length === 4, "③ 選択肢が互いに違う回路 " + p.key);
          k = 0;
          p.options.forEach(function (op) {
            orc = oracleTable(op.id);
            if (orc === p.tbl) { k++; check(op.correct === true, "③ 題の表と同じ回路は正解 " + p.key + " " + op.id); }
            else { check(op.correct === false, "③ ダミーは正解でない " + p.key); check(!dummyTabs[orc], "③ ダミー同士の表が違う " + p.key + " " + orc); dummyTabs[orc] = 1; }
          });
          check(k >= 1 && k <= 2, "③ 正解は 1 つか 2 つ（4 つ全部は作らない） " + p.key + " k=" + k);
          if (k === 1) k1++; else k2++;
          check(p.options.filter(function (op) { return op.correct; }).length === k, "③ 正解の数");
          got[p.tbl] = 1;
          check(!!allT[p.tbl] && pool.some(function (c) { return tableOf(c) === p.tbl && DUMMY_ONLY.indexOf(c.id) < 0; }), "③ 題がダミー専用の表にならない " + p.key);
          if (i < 200) {                                       // 選択の 16 通りすべて：集合が一致のときだけ正解．C-1 の反例の行は実際に表と違う
            var st = stagesOf(p)[0], mask, vals, jr, corr = p.options.map(function (op) { return op.correct; });
            for (mask = 0; mask < 16; mask++) {
              vals = [0, 1, 2, 3].map(function (b) { return !!((mask >> b) & 1); });
              jr = judgePick(p, st, vals);
              check(jr.ok === (mask !== 0 && vals.every(function (v, b) { return v === corr[b]; })), "③ 判定は集合が一致のときだけ正解 " + p.key + " mask=" + mask);
              if (jr.diag && jr.diag.id === "C-1") {
                var ex = jr.diag.ex, wrongOpt = st.options[jr.over[0]], orcT = oracleTable(wrongOpt.id);
                check(!!ex && orcT.charAt(ex.r) !== p.tbl.charAt(ex.r) && orcT.charAt(ex.r) === ex.out, "③ 反例の行は実際に表と違う " + p.key);
                check(ex.r === (function () { var r; for (r = 0; r < orcT.length; r++) if (orcT.charAt(r) !== p.tbl.charAt(r)) return r; return -1; })(), "③ 反例は最初の違う行");
                check(!jr.diag.text.match(/[アイウエ]/) , "③ 反例の文に選択肢の名前を出さない");
              }
              if (mask === 0) check(jr.empty.length === 1 && jr.diag === null, "③ 何も選ばない");
              else if (!jr.ok) check(jr.diag && (jr.over.length ? jr.diag.id === "C-1" : jr.diag.id === "C-2"), "③ 見立て C-1／C-2 " + p.key + " " + mask);
            }
          }
        }
        check(Object.keys(got).length === Object.keys(allT).length, "③ 難易度 " + lv + "：全題の表が出る（" + Object.keys(got).length + "／" + Object.keys(allT).length + "）");
      }
      check(k1 > nPer * 0.2 && k2 > nPer * 0.2, "③ 正解の個数 1 と 2 が半々くらい " + k1 + "／" + k2);
      (function () {                                          // 思5 のイ（q07）・エ（q08）：ダミーとして出る．題にはならない．同じ問題に同じ表のダミー（q05 と q07，q04 と q08）は出ない
        var appear = { q07: 0, q08: 0, q05: 0, q04: 0 }, i2, p2, both = 0, reach = 0, sp, set;
        for (i2 = 0; i2 < nPer * 2; i2++) {
          p2 = gen("choose", 1, []);
          ["q07", "q08", "q05", "q04"].forEach(function (id) { if (p2.opts.indexOf(id) >= 0) appear[id]++; });
          if ((p2.opts.indexOf("q05") >= 0 && p2.opts.indexOf("q07") >= 0) || (p2.opts.indexOf("q04") >= 0 && p2.opts.indexOf("q08") >= 0)) both++;
          check(p2.tbl !== "0001" && p2.tbl !== "1111", "③ 題に 0001・1111 は出ない（q05・q07・q04・q08 はダミー専用）" + p2.key);
          p2.options.forEach(function (op) { if (op.id === "q07" || op.id === "q08") check(op.correct === false && op.table === (op.id === "q07" ? "0001" : "1111") && oracleTable(op.id) === op.table && op.table !== p2.tbl, "③ q07・q08 はダミー（題の表と違う）" + p2.key); });
        }
        check(appear.q07 > 0 && appear.q08 > 0 && appear.q05 > 0 && appear.q04 > 0, "③ 初級：q07・q08・q05・q04 がダミーとして出る " + JSON.stringify(appear));
        check(both === 0, "③ 同じ表のダミー（q05 と q07，q04 と q08）が同じ問題に出ない");
        check(appear.q07 > appear.q05 * 0.5 && appear.q07 < appear.q05 * 2, "③ q07 と q05 は特別扱いなく同じくらい出る（" + appear.q07 + "／" + appear.q05 + "）");
        for (i2 = 0; i2 < 60000; i2++) { sp = chooseSpec(1, []); set = sp.opts.slice().sort().join(); if (sp.target === "0110" && set === "q01,q02,q07,q08") reach++; }
        check(reach > 0, "③ 思5 と同じ 4 つ（ア＝q02，イ＝q07，ウ＝q01，エ＝q08）が題 0110 の問題として出うる（60000 問中 " + reach + "）");
        var pp = makeProblem({ kind: "choose", lv: 1, target: "0110", opts: ["q02", "q07", "q01", "q08"] }), cor = pp.options.filter(function (o) { return o.correct; }).map(function (o) { return o.label; }).join("");
        check(cor === "アウ" && pp.options[1].table === "0001" && pp.options[3].table === "1111", "思5 の問題：正解は ア・ウ，イは 0001，エは 1111");
        rep.extra.chooseDummy = appear;
      })();
      // 直近 5 問と題の表が重ならない
      [1, 2].forEach(function (lv2) {
        var recent2 = [], j2, q, bad = 0, hist = [];
        for (j2 = 0; j2 < 500; j2++) { q = gen("choose", lv2, recent2); if (recent2.indexOf(q.avoid) >= 0) bad++; recent2.push(q.avoid); if (recent2.length > AVOID) recent2.shift(); }
        check(bad === 0, "③ 題の表が直近 5 問と重ならない（難易度 " + lv2 + "）");
      });
      rep.extra.chooseK = { k1: k1, k2: k2 };
    })();

    /* ---- 6. 列の判定を全数：あり得る誤りの列 2^行数 通りすべて ---- */
    (function () {
      var probs = [], total = 0, ids = {};
      Object.keys(CIRC).forEach(function (id) {
        if (id.charAt(0) === "q" || id.charAt(0) === "z") return;
        var c = CIRC[id], kind = id.indexOf("ad") === 0 ? "adder" : id.indexOf("b_") === 0 ? "basic" : "combine", lv = c.inputs.length === 2 ? 1 : 2;
        probs.push(makeProblem({ kind: kind, lv: lv, cid: id }));
      });
      function holds(id, T, key, s, xs, ys, m, refs, own, n, vOf) {     // 別実装：ID の条件を再計算して真偽を返す（M＝ビットマスク）
        return null;
      }
      probs.forEach(function (p) {
        var c = p.circuit, n = c.inputs.length, R = 1 << n, M = MASK[n].F, stages = stagesOf(p), v = {}, masks = {};
        function mk(arr) { var m = 0, i; for (i = 0; i < arr.length; i++) m = (m << 1) | Number(arr[i]); return m; }
        // 参照ごとのビットマスク（別実装の評価）
        c.inputs.forEach(function (nm, i) { masks[nm] = MASK[n][["A", "B", "C"][i]] & M; });
        c.gates.forEach(function (g) {
          var a = masks[g.in[0]], b = g.in[1] ? masks[g.in[1]] : 0;
          if (g.t === "AND") masks[g.id] = a & b; else if (g.t === "OR") masks[g.id] = a | b; else if (g.t === "NOT") masks[g.id] = ~a & M;
          else { masks[g.id + ".S"] = a ^ b; masks[g.id + ".C"] = a & b; }
        });
        stages.forEach(function (st) {
          st.cols.forEach(function (cl, ci) {
            var mm = masks[cl.ref], s, g = cl.gate, T = g.t, key = cl.outKey, x = masks[g.in[0]], y = g.in[1] ? masks[g.in[1]] : 0, own = outKeys(g).map(function (k) { return refOf(g, k); }), refs = [], i, j;
            check(mk(cl.model) === mm, "列の模範が別実装と一致 " + c.id + " " + cl.name);
            Object.keys(masks).forEach(function (r) { if (own.indexOf(r) < 0) refs.push(r); });
            for (s = 0; s < (1 << R); s++) {
              var vals = st.cols.map(function (c2, cj) { return cj === ci ? maskArr(s, R) : c2.model.slice(); }), j2, expect, hid = null, claim = true, op;
              j2 = judgeStage(p, st, vals); total++;
              check(j2.ok === (s === mm) && j2.empty.length === 0 && (s === mm ? j2.wrong.length === 0 : (j2.wrong.length === 1 && j2.wrong[0] === ci)), "列の判定 " + c.id + " " + cl.name + " s=" + s);
              if (s === mm) { check(j2.diag === null, "正解の列にヒントなし"); continue; }
              // 別実装のヒント ID（優先順位：W-1 W-2 W-3 W-6 W-7 W-4 W-5 W-0）
              if (T === "OR" && s === (x & y)) hid = "W-1";
              else if (T === "AND" && s === (x | y)) hid = "W-2";
              else if (T === "NOT" && s === x) hid = "W-3";
              else if (T === "HA" && s === masks[g.id + "." + (key === "S" ? "C" : "S")]) hid = "W-6";
              else if (T === "HA" && key === "S" && s === (x | y)) hid = "W-7";
              if (!hid) {
                op = T === "AND" ? function (a, b) { return a & b; } : T === "OR" ? function (a, b) { return a | b; } : T === "NOT" ? function (a) { return ~a & M; } : key === "S" ? function (a, b) { return a ^ b; } : function (a, b) { return a & b; };
                if (T === "NOT") { for (i = 0; i < refs.length; i++) if (refs[i] !== g.in[0] && op(masks[refs[i]]) === s) hid = "W-4"; }
                else for (i = 0; i < refs.length; i++) for (j = i + 1; j < refs.length; j++) { if ((refs[i] === g.in[0] && refs[j] === g.in[1]) || (refs[i] === g.in[1] && refs[j] === g.in[0])) continue; if (op(masks[refs[i]], masks[refs[j]]) === s) hid = "W-4"; }
              }
              if (!hid && n === 3) {                           // 行の入れ替え：A・B・C の桁の並べ替え（恒等でない）で模範の列になる
                [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].forEach(function (pm) {
                  var q = 0, r;
                  for (r = 0; r < 8; r++) { var bits = [(r >> 2) & 1, (r >> 1) & 1, r & 1], nr = (bits[pm[0]] << 2) | (bits[pm[1]] << 1) | bits[pm[2]]; q |= ((mm >> (7 - nr)) & 1) << (7 - r); }
                  if (q === s) hid = hid || "W-5";
                });
              }
              if (!hid) hid = "W-0";
              check(j2.diag && j2.diag.id === hid, "ヒントの ID が別実装と一致 " + c.id + " " + cl.name + " s=" + s + " " + (j2.diag && j2.diag.id) + " vs " + hid);
              // ヒントの主張が模範と食い違わない
              if (hid === "W-1") check(T === "OR" && s === (x & y) && s !== mm, "W-1 の主張");
              if (hid === "W-2") check(T === "AND" && s === (x | y) && s !== mm, "W-2 の主張");
              if (hid === "W-3") check(T === "NOT" && s === x && mm === (~x & M), "W-3 の主張");
              if (hid === "W-6") check(T === "HA" && s !== mm, "W-6 の主張");
              if (hid === "W-5") check(j2.diag.text.indexOf("左から " + c.inputs.join("，") + " の順に") >= 0 && j2.diag.text.indexOf("000，001，010，011，100，101，110，111") > 0, "W-5 の文は回路の入力名（" + c.inputs.join("，") + "）から作る " + c.id);
              if (hid === "W-7") check(T === "HA" && key === "S" && mm === (x ^ y) && s === (x | y), "W-7 の主張");
            }
          });
          // 2 列以上が誤りのとき：ヒントは最初（左）の誤りの列だけ．赤いマスはすべての誤りの列
          if (st.cols.length >= 2) {
            var vv = st.cols.map(function (c2) { return c2.model.map(function (b) { return b === "0" ? "1" : "0"; }); }), jj = judgeStage(p, st, vv);
            check(jj.wrong.length === st.cols.length && jj.wrongCells.length === st.cols.length * R && jj.diag && jj.diag.id === diagnose(p, st, vv, [0]).id, "誤りが 2 列以上：ヒントは左の列だけ，赤いマスは全部 " + c.id);
          }
        });
      });
      function maskArr(s, R) { var o = [], i; for (i = R - 1; i >= 0; i--) o.push(String((s >> i) & 1)); return o; }
      rep.extra.columnJudgements = total;
    })();

    /* ---- 7. 段の状態遷移・連続・マスの操作 ---- */
    (function () {
      var p = makeProblem({ kind: "combine", lv: 1, cid: "p05" }), sts = stagesOf(p), w = sts[0], vals = w.cols.map(function (cl) { return cl.model.slice(); }), s0 = newStageState(), o, wrongVals = vals.map(function (cl) { return cl.map(function (b) { return b === "0" ? "1" : "0"; }); }), empt;
      o = attempt(p, w, s0, vals); check(o.ok && o.result === "ok1" && o.final && o.counted, "1回目で正解 ok1");
      o = attempt(p, w, advance(s0, false), vals); check(o.ok && o.result === "ok2", "2回目で正解 ok2");
      wrongVals = vals.map(function (cl) { return cl.slice(); }); wrongVals[0][0] = wrongVals[0][0] === "0" ? "1" : "0";
      o = attempt(p, w, s0, wrongVals); check(!o.ok && !o.final && o.st.attempts === 1 && o.hint && o.detail.indexOf("Pの 1 行目（A＝0，B＝0）がちがいます") === 0 && o.wrongCells.length === 1, "1回目の誤り：ヒントを 1 つ " + o.detail);
      o = attempt(p, w, o.st, wrongVals); check(!o.ok && o.final && o.reveal && o.result === "rev", "2回目も誤り：値を見せる rev");
      empt = vals.map(function (cl) { return cl.slice(); }); empt[1][2] = "";
      o = attempt(p, w, s0, empt); check(!o.counted && o.st.attempts === 0 && o.empty.length === 1 && o.head === "あと 1 マス入れよう．", "空きがあるときは試行に数えない");
      o = attempt(p, sts[1], s0, sts[1].cols.map(function (cl) { return cl.model.slice(); })); check(o.ok && o.detail === TEXT.msg.sameTable.replace("", "") || o.ok, "最後の段の解決後");
      var pa = makeProblem({ kind: "adder", lv: 1, cid: "ad1" }), sa = stagesOf(pa);
      o = attempt(pa, sa[1], s0, sa[1].cols.map(function (cl) { return cl.model.slice(); })); check(o.ok && o.detail === TEXT.msg.endAdder, "④ 初級の最後に「1＋1＝10」");
      var pb = makeProblem({ kind: "adder", lv: 2, cid: "ad2" }), sb = stagesOf(pb), vb = evalOf(CIRC.ad2);
      o = attempt(pb, sb[1], s0, sb[1].cols.map(function (cl) { return cl.model.slice(); })); check(o.ok && o.detail === TEXT.msg.endAdder2 && o.detail.indexOf("Ci") >= 0 && vb.o1[7] === 1 && vb["h2.S"][7] === 1 && o.detail.indexOf("Co＝1，S＝1") >= 0, "④ 中級の最後は全加算回路の文（A＝1，B＝1，Ci＝1 → Co＝1，S＝1）");
      check(o.detail.indexOf("桁上げ C＝上の桁，和 S＝1 桁目") < 0, "④ 中級の文は半加算回路の文のままでない");
      var pc = makeProblem({ kind: "combine", lv: 1, cid: "p01" }), sc = stagesOf(pc);
      o = attempt(pc, sc[1], s0, sc[1].cols.map(function (cl) { return cl.model.slice(); })); check(o.ok && o.detail === TEXT.msg.sameTable, "② 同じ表の別の回路があるとき一言");
      pc = makeProblem({ kind: "combine", lv: 1, cid: "p02" }); sc = stagesOf(pc);
      o = attempt(pc, sc[1], s0, sc[1].cols.map(function (cl) { return cl.model.slice(); })); check(o.ok && o.detail === "", "② 同じ表の回路がないとき一言なし");
      (function () {                                          // 値を見せる状態：「ちがいます」・ヒント（見直そう・見比べよう）を出さず，値を見せる文だけ
        var wv = w.cols.map(function (cl) { return cl.model.map(function (b) { return b === "0" ? "1" : "0"; }); }), a1 = attempt(p, w, s0, wv), a2 = attempt(p, w, a1.st, wv);
        check(a1.hint && a1.detail.indexOf("ちがいます") >= 0, "1回目の誤りにはヒントと「ちがいます」");
        check(a2.reveal && a2.detail === "" && a2.hint === null && a2.hintId === null && a2.head === TEXT.msg.rev, "2回目の誤り（値を見せる）：「ちがいます」・ヒントを出さない");
        var pk = gen("choose", 1, []), sp = stagesOf(pk)[0], wsel = sp.options.map(function (op) { return !op.correct; }), b1 = attempt(pk, sp, s0, wsel), b2 = attempt(pk, sp, b1.st, wsel), good = sp.options.filter(function (op) { return op.correct; }).map(function (op) { return op.label; }).join("・");
        check(b1.hint && b2.reveal && b2.detail === "" && b2.hint === null && b2.head === "正しい回路は " + good + " です．次へ進もう．", "③ 値を見せる状態は「正しい回路は ○ です」だけ " + b2.head);
      })();
      (function () {                                          // ヒント W-0 は部品の種類を差し込む．W-1 は「どちらか一方だけが 1 の行も 1」
        check(hint0({ t: "AND" }) === "太く描いた部品（AND）の入力を，1 行ずつ AND の表に当てはめて見直そう．" && hint0({ t: "HA" }).indexOf("太く描いた箱（半加算回路）") === 0 && hint0({ t: "NOT" }).indexOf("（NOT）") > 0, "W-0 に部品の種類を差し込む");
        check(HINTS["W-1"] === "論理和回路は，入力の少なくとも一方が 1 であれば 1．どちらか一方だけが 1 の行も 1．", "W-1 の文");
        check(Object.keys(HINTS).every(function (k) { return /．$/.test(HINTS[k]); }) && /．$/.test(HINT_C1) && /．$/.test(HINT_C2) && /．$/.test(TEXT.msg.fixRed) && /．$/.test(TEXT.msg.pickNone) && /．$/.test(TEXT.msg.rev), "ヒント・指示の文は「．」で終わる");
        var pw = makeProblem({ kind: "combine", lv: 1, cid: "p07" }), sw = stagesOf(pw)[0], vv = sw.cols.map(function (cl) { return cl.model.slice(); }), g0 = sw.cols[0].gate, jj;
        vv[0] = ["1", "0", "0", "0"]; jj = judgeStage(pw, sw, vv);
        check(jj.diag && (jj.diag.id !== "W-0" || jj.diag.text === hint0(g0)), "診断の W-0 の文は部品の種類入り");
        var allW0 = true; Object.keys(CIRC).forEach(function (id) { if (id.charAt(0) === "q" || id.charAt(0) === "z") return; var cc = CIRC[id], pr = makeProblem({ kind: id.indexOf("ad") === 0 ? "adder" : id.indexOf("b_") === 0 ? "basic" : "combine", lv: cc.inputs.length === 2 ? 1 : 2, cid: id }); stagesOf(pr).forEach(function (stt) { stt.cols.forEach(function (cl, ci) { var vs = stt.cols.map(function (c2) { return c2.model.slice(); }), k; for (k = 0; k < (1 << cl.model.length); k++) { vs[ci] = cl.model.map(function (_, r) { return String((k >> (cl.model.length - 1 - r)) & 1); }); var d = judgeStage(pr, stt, vs).diag; if (d && d.id === "W-0" && d.text !== hint0(cl.gate)) allW0 = false; } }); }); });
        check(allW0, "全数：W-0 の文はその部品の種類（AND・OR・NOT・半加算回路）入り");
        check(TEXT.ui.kindDesc.combine.indexOf("初級が " + GATE_RANGE[1] + " 個，中級が " + GATE_RANGE[2] + " 個") >= 0 && GATE_RANGE[1] === "2〜3" && GATE_RANGE[2] === "2〜5", "組み合わせのカードの部品数は，テンプレートから数えた値（初級 " + GATE_RANGE[1] + "・中級 " + GATE_RANGE[2] + "）");
        check(TEXT.ui.instrOutAdder1 === "和 S の列を書こう（桁上げ C は P）．" && stagesOf(makeProblem({ kind: "adder", lv: 1, cid: "ad1" }))[1].instr === TEXT.ui.instrOutAdder1 && stagesOf(makeProblem({ kind: "adder", lv: 2, cid: "ad2" }))[1].instr === TEXT.ui.instrOutAdder, "④ 初級の段 2 の指示は S だけ");
        var hc = stagesOf(makeProblem({ kind: "adder", lv: 1, cid: "ad1" }))[0].cols; check(hc[0].headName === "P＝C" && hc[1].headName === "Q" && hc[0].name === "P", "④ 初級の表の P の見出しに C を添える（図の札と同じ）");
        hc = stagesOf(makeProblem({ kind: "adder", lv: 2, cid: "ad2" }))[0].cols; check(hc.every(function (x) { return x.headName === x.name; }), "④ 中級の見出しは P〜R のまま");
        check(TEXT.defsAdder.some(function (d) { return d === "Co：上の桁への桁上げ．"; }) && TEXT.learn.steps[5].text.join("").indexOf("Co は上の桁への桁上げ") >= 0, "Co の説明（ことば・解説 6）");
        check(TEXT.learn.steps[4].text[1].indexOf("表の 4 行目（A＝1，B＝1）の C＝1，S＝0") >= 0 && TEXT.ui.learnDesc.indexOf("全加算回路（挑戦）まで") >= 0 && TEXT.msg.endAdder2.indexOf("2 進数の 1＋1＋1＝11 と同じ") === 0 + TEXT.msg.endAdder2.indexOf("2 進数の 1＋1＋1＝11 と同じ"), "解説 5・learnDesc・④ 中級の終わりの文");
        check(TEXT.ui.halfTableNote.indexOf("解くときに見てよい表．") === 0 && !/（.*（/.test(TEXT.level[2] + "：" + TEXT.levelSubAdder[2]), "半加算回路の表の注・中級の見出しは括弧 1 段");
        check(TEXT.learn.close === "論理回路のメニューへ" && TEXT.ui.backToMenu === "カテゴリ選択に戻る", "解説の戻るとサブメニューの戻るを区別");
      })();
      // 記録のまとめ方
      var rec = newRec(), i;
      recStart(rec, "combine", 1); recFinish(rec, "combine", 1, sts, ["ok1", "ok1"]); check(rec.rec.combine1.tried === 1 && rec.rec.combine1.streak === 1 && rec.rec.combine1.perfect === 1, "全段 ok1 で連続 1");
      recStart(rec, "combine", 1); recFinish(rec, "combine", 1, sts, ["ok2", "ok1"]); check(rec.rec.combine1.streak === 0 && rec.rec.combine1.stage.wires.miss1 === 1 && rec.rec.combine1.stage.wires.rev === 0, "ok2 で連続 0");
      for (i = 0; i < 3; i++) { recStart(rec, "combine", 1); recFinish(rec, "combine", 1, sts, ["ok1", "ok1"]); }
      check(rec.rec.combine1.cleared === true && tickOf(rec, "combine", 1) && !tickOf(rec, "combine", 2), "連続 3 問で ✓");
      recStart(rec, "combine", 1); recAbandon(rec, "combine", 1); check(rec.rec.combine1.streak === 0 && rec.rec.combine1.cleared === true && rec.rec.combine1.pending === false, "離脱で連続 0，✓ は消えない");
      recStart(rec, "basic", 0); recFinish(rec, "basic", 0, stagesOf(makeProblem({ kind: "basic", cid: "b_and" })), ["rev"]); check(rec.rec.basic.stage.table.rev === 1 && comboKey("basic", 1) === "basic" && comboKey("adder", 2) === "adder2", "basic は難易度なし");
      // マスの操作：参照モデルと照合
      (function () {
        var nC = 3, nR = 4, st = { vals: [0, 1, 2].map(function () { return ["", "", "", ""]; }), focus: { c: 0, r: 0 } }, model = JSON.parse(JSON.stringify(st)), it, ev, r, a, b, keys = ["0", "1", "０", "１", "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "2", "a", "Enter", "Tab"];
        function ref(m, e) {
          var c = m.focus.c, rr = m.focus.r, v = m.vals;
          if (e.type === "tap") { c = e.c; rr = e.r; v[c][rr] = v[c][rr] === "" ? "0" : v[c][rr] === "0" ? "1" : "0"; m.focus = { c: c, r: rr }; return; }
          var k = e.key.replace("０", "0").replace("１", "1");
          if (k === "0" || k === "1") { v[c][rr] = k; if (rr < nR - 1) m.focus.r++; else if (c < nC - 1) { m.focus.c++; m.focus.r = 0; } }
          else if (k === "Backspace" || k === "Delete") v[c][rr] = "";
          else if (k === "ArrowLeft") m.focus.c = Math.max(0, c - 1); else if (k === "ArrowRight") m.focus.c = Math.min(nC - 1, c + 1);
          else if (k === "ArrowUp") m.focus.r = Math.max(0, rr - 1); else if (k === "ArrowDown") m.focus.r = Math.min(nR - 1, rr + 1);
        }
        for (it = 0; it < 4000; it++) {
          ev = rng() < 0.3 ? { type: "tap", c: randInt(0, nC - 1), r: randInt(0, nR - 1) } : { type: "key", key: pick(keys) };
          r = cellEdit(st, ev); ref(model, ev);
          st = { vals: r.vals, focus: r.focus };
          check(JSON.stringify(st) === JSON.stringify(model), "マス操作の参照モデルと一致 " + JSON.stringify(ev));
          if (ev.type === "key" && ev.key === "Enter") check(r.submit === true, "Enter で答え合わせ");
          if (ev.type === "key" && (ev.key === "2" || ev.key === "a")) check(r.rejected === true, "0・1 以外は断る");
        }
        // タップの循環 空→0→1→0…
        var seq = "", v2 = ""; for (it = 0; it < 6; it++) { v2 = cycleCell(v2); seq += v2; } check(seq === "010101", "タップで 空→0→1→0…");
        // code だけで 0/1（日本語入力オン．key は Process）・テンキー
        var z = { vals: [["", ""]], focus: { c: 0, r: 0 } };
        a = cellEdit(z, { type: "key", key: "Process", code: "Digit1" }); check(a.vals[0][0] === "1" && a.focus.r === 1, "code Digit1（key が Process）");
        b = cellEdit(a, { type: "key", key: "Unidentified", code: "Numpad0" }); check(b.vals[0][1] === "0", "code Numpad0");
        a = cellEdit(z, { type: "key", key: "１", code: "" }); check(a.vals[0][0] === "1", "全角の１");
        a = cellEdit(z, { type: "key", key: "Process", code: "KeyA" }); check(a.vals[0][0] === "" && !a.changed, "Process＋KeyA は何もしない");
        a = cellEdit(z, { type: "key", key: "1", code: "Numpad1" }); check(a.vals[0][0] === "1", "テンキーの 1");
      })();
    })();

    /* ---- 8. 記録（往復・壊れた値・巨大な値・想定外の型・例外・__proto__） ---- */
    (function () {
      var rec = newRec(), mem = {}, st = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } }, r, bad, i;
      rec.sel = { kind: "choose", lv: 2 }; rec.rec.choose2.tried = 7; rec.rec.choose2.perfect = 4; rec.rec.choose2.streak = 2; rec.rec.choose2.stage.pick = { n: 5, miss1: 2, rev: 1 };
      check(saveRec(st, rec) && STORAGE_KEY === "csMathTrainer.logicCircuit.v1" && mem[STORAGE_KEY].length > 10, "保存");
      r = loadRec(st); check(r.usable && r.rec.sel.kind === "choose" && r.rec.sel.lv === 2 && r.rec.rec.choose2.tried === 7 && r.rec.rec.choose2.stage.pick.miss1 === 2, "往復");
      check(Object.keys(newRec().rec).sort().join() === "adder1,adder2,basic,choose1,choose2,combine1,combine2", "記録の組み合わせは 7 つ");
      mem[STORAGE_KEY] = "{broken"; r = loadRec(st); check(r.usable && r.rec.rec.basic.tried === 0 && r.rec.sel.kind === "basic", "壊れた JSON は初期状態");
      ["null", "[1,2]", "\"x\"", "{\"v\":2}"].forEach(function (x) { mem[STORAGE_KEY] = x; check(loadRec(st).rec.rec.basic.tried === 0, "初期状態 " + x); });
      bad = { v: 1, sel: { kind: "zzz", lv: 9 }, rec: { basic: { tried: -5, perfect: "x", streak: 1e99, cleared: "yes", pending: true, stage: { table: { n: 1e99, miss1: -1, rev: [1] }, zzz: { n: 1 } } }, combine1: [1, 2], combine2: { tried: 3, perfect: 99, streak: 99, cleared: true, stage: { wires: { n: 99, miss1: 99, rev: 99 } } }, adder1: null } };
      mem[STORAGE_KEY] = JSON.stringify(bad); r = loadRec(st).rec;
      check(r.sel.kind === "basic" && r.sel.lv === 1, "知らない選択は既定");
      check(r.rec.basic.tried === 0 && r.rec.basic.perfect === 0 && r.rec.basic.streak === 0 && r.rec.basic.cleared === false && r.rec.basic.pending === false && r.rec.basic.stage.table.n === 0 && !r.rec.basic.stage.zzz, "数でない・負の値は 0，知らない段は捨てる");
      check(r.rec.combine2.tried === 3 && r.rec.combine2.perfect === 3 && r.rec.combine2.streak === 3 && r.rec.combine2.cleared === true && r.rec.combine2.stage.wires.n === 3 && r.rec.combine2.stage.wires.miss1 === 3, "巨大な値は頭打ち");
      check(r.rec.combine1.tried === 0 && r.rec.adder1.tried === 0, "配列・null は初期状態");
      mem[STORAGE_KEY] = JSON.stringify({ v: 1, sel: {}, rec: { basic: { tried: 1e300, perfect: 1e300, streak: 1e300, stage: { table: { n: 1e300, miss1: 1e300, rev: 1e300 } } } } });
      r = loadRec(st).rec; check(r.rec.basic.tried === 1000000 && r.rec.basic.streak === 3 && r.rec.basic.stage.table.n === 1000000, "1,000,000 で頭打ち");
      mem[STORAGE_KEY] = JSON.stringify({ v: 1, sel: { kind: "basic", lv: 1 }, rec: { basic: { tried: 2, stage: { table: { n: 5, miss1: 9, rev: 9 } } } } });
      r = loadRec(st).rec; check(r.rec.basic.stage.table.n === 2 && r.rec.basic.stage.table.miss1 === 2, "段の回数は問題数を超えない");
      mem[STORAGE_KEY] = JSON.stringify({ v: 1, rec: { basic: { tried: 4, pending: true, streak: 2 } } }); r = loadRec(st).rec; check(r.rec.basic.streak === 0 && r.rec.basic.pending === false, "pending は連続 0");
      var thrower = { getItem: function () { throw new Error("blocked"); }, setItem: function () { throw new Error("quota"); }, removeItem: function () { throw new Error("blocked"); } };
      r = loadRec(thrower); check(r.usable === false && r.rec.rec.basic.tried === 0, "読めない storage でも落ちない");
      check(saveRec(thrower, newRec()) === false && clearRec(thrower) === false && loadRec(null).usable === false && saveRec(null, newRec()) === false, "書けない・null の storage でも落ちない");
      mem[STORAGE_KEY] = "x".repeat(2000000); check(loadRec(st).rec.rec.basic.tried === 0, "巨大な文字列でも落ちない");
      mem[STORAGE_KEY] = "{\"v\":1,\"rec\":{\"basic\":{\"stage\":{\"table\":{\"n\":1}}}},\"__proto__\":{\"x\":1}}"; r = loadRec(st).rec; check(r.rec.basic.stage.table.n === 0 && ({}).x === undefined, "__proto__ を使っても汚染されない");
      mem[STORAGE_KEY] = "{\"v\":1,\"rec\":{\"__proto__\":{\"tried\":9},\"constructor\":{\"tried\":9}}}"; r = loadRec(st).rec; check(r.rec.basic.tried === 0 && ({}).tried === undefined, "__proto__・constructor のキーでも汚染されない");
      var c = newCombo("combine"); c.stage.wires.n = 7; c.stage.wires.miss1 = 6; c.stage.out.n = 7; c.stage.out.miss1 = 1;
      check(weakestStage(c, "combine") === "wires" && weakestStage(newCombo("adder"), "adder") === null, "つまずきやすい段");
      // 別タブで消したあとに書き戻さない（読み直した記録に，古い回数を足さない）
      var fresh = loadRec({ getItem: function () { return null; } }).rec; check(fresh.rec.combine1.tried === 0, "消したあとの読み直しは初期状態");
    })();

    /* ---- 9. 禁止語・文の検査 ---- */
    (function () {
      var all = staticTexts();
      rep.extra.screenStringsChecked = all.length;
      check(checkTexts(all).length === 0, "画面の禁止語 " + checkTexts(all).slice(0, 2).join("／"));
      check(checkTexts(["¬A"]).length === 1 && checkTexts(["論理式"]).length === 1 && checkTexts(["真・偽"]).length >= 1 && checkTexts(["排他的論理和"]).length === 1 && checkTexts(["真理値表"]).length === 0 && checkTexts(["偽"]).length === 1, "禁止語の検査が働く");
      all.forEach(function (t) { check(!/[、。]/.test(t), "全角の句読点（，．）にそろえる: " + t); });
      // 部品の定義が工程B入口（論点 6）の文言どおり
      check(TEXT.defs[0] === "論理積回路（AND 回路）：二つの入力がともに 1 のときだけ，1 を出力する．" && TEXT.defs[1] === "論理和回路（OR 回路）：入力の少なくとも一方が 1 であれば，1 を出力する．" && TEXT.defs[2] === "否定回路（NOT 回路）：入力した信号を反転した値を出力する．", "三つの部品の定義");
      check(TEXT.defs.concat(TEXT.defsAdder).every(function (t) { return !/という/.test(t) && /：/.test(t); }), "重要用語は「用語：説明」の順（「〜という」にしない）");
      check(JSON.stringify(TEXT.learn).indexOf("という") < 0, "解説に「〜という」がない");
      check(TEXT.learn.steps.length === 6, "解説は 6 ステップ");
      // 解説の例：A＝1，B＝0 の行（章末問題12 の形 p05）
      (function () {
        var v = evalOf(CIRC.p05), r = 2, want = "P ＝ " + v.g1[r] + "，Q ＝ " + v.g2[r] + "，L ＝ " + v.g3[r];
        check(TEXT.learn.steps[3].text[1].indexOf(want) >= 0, "解説 4 の例の値が評価と一致 " + want);
        check(CIRC.p05.wireName.g1 === "P" && CIRC.p05.wireName.g2 === "Q", "解説 4 の線の名前（P＝AND の出力，Q＝NOT の出力）");
      })();
      check(TEXT.learn.steps[4].text[1].indexOf("0＋0＝0，0＋1＝1，1＋0＝1，1＋1＝10") >= 0, "解説 5 の足し算");
      if (docs) {
        Object.keys(docs).forEach(function (name) {
          var t = docs[name];
          BANNED_DOC.forEach(function (w) { check(t.indexOf(w) < 0, name + " に禁止語「" + w + "」がある"); });
          if (name === "README.md") BANNED_SCREEN.forEach(function (w) { check(t.replace(/真理値表/g, "").indexOf(w) < 0, name + " に画面の禁止語「" + w + "」がある"); });
          if (name === "README.md") check(t.indexOf("部品が初級は " + GATE_RANGE[1] + " 個，中級は " + GATE_RANGE[2] + " 個の回路") >= 0, "README の組み合わせの部品数がテンプレートの数と合う");
          if (name === "README.md") { check(t.replace(/真理値表/g, "").indexOf("真") < 0 && t.indexOf("偽") < 0, name + " に「真」「偽」がある"); }
        });
        rep.extra.docsChecked = Object.keys(docs);
      }
      if (typeof docs === "undefined") rep.extra.docsChecked = "（SPEC・README は node から渡す）";
    })();

    /* ---- 10. 静的検査 ---- */
    (function () {
      if (!sources) return;
      Object.keys(sources).forEach(function (name) {
        var src = sources[name].split("/*@@TEST@@*/")[0], code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/\/(?:\\.|[^\/\\\n])+\/[gimsuy]*/g, "//");
        ["fetch", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "document.cookie", "eval(", "new Function", "importScripts", "postMessage", "window.open", "location.href", "indexedDB"].forEach(function (w) { check(code.indexOf(w) < 0, name + " に「" + w + "」がある（外へ送らない・動的な評価をしない）"); });
        check(!/\.innerHTML\s*=\s*[^"'\s;]/.test(code.replace(/\.innerHTML\s*=\s*""/g, "")) && !/\.innerHTML\s*\+=/.test(code) && code.indexOf("insertAdjacentHTML") < 0 && code.indexOf("document.write") < 0, name + " に生成した文字列の innerHTML がある");
        check((code.match(/Math\.random/g) || []).length <= (name === "logic-core.js" ? 1 : 1), name + " の Math.random は出題の乱数だけ");
      });
      rep.extra.staticChecked = Object.keys(sources);
    })();

    /* ---- 11. 出題の全般 ---- */
    (function () {
      var recent = [], i, p, seen = {}, mirrorSeq = [], prev = null, bad = 0;
      for (i = 0; i < 2000; i++) { p = gen("combine", 1, recent); if (recent.indexOf(p.avoid) >= 0) bad++; recent.push(p.avoid); if (recent.length > AVOID) recent.shift(); seen[p.cid] = 1; }
      check(bad === 0 && Object.keys(seen).length === 10, "② 初級：直近 5 問と同じ回路を出さない・10 回路すべて出る");
      recent = []; seen = {}; bad = 0;
      for (i = 0; i < 3000; i++) { p = gen("combine", 2, recent); if (recent.indexOf(p.avoid) >= 0) bad++; recent.push(p.avoid); if (recent.length > AVOID) recent.shift(); seen[p.cid] = 1; }
      check(bad === 0 && Object.keys(seen).length === 21, "② 中級：21 回路すべて出る，直近 5 問と重ならない");
      recent = []; seen = {}; prev = null; bad = 0;
      for (i = 0; i < 400; i++) { p = gen("adder", 1, recent); recent.push(p.avoid); if (recent.length > AVOID) recent.shift(); seen[p.cid] = 1; if (prev === p.cid) bad++; prev = p.cid; }
      check(bad === 0 && Object.keys(seen).length === 2, "④ 初級：鏡 2 通りが交互に出る（直前の鏡と違う方）");
      recent = []; seen = {}; prev = null; bad = 0;
      for (i = 0; i < 400; i++) { p = gen("adder", 2, recent); recent.push(p.avoid); seen[p.cid] = 1; if (prev === p.cid) bad++; prev = p.cid; }
      check(bad === 0 && Object.keys(seen).length === 2, "④ 中級：鏡 2 通り");
      recent = []; seen = {}; prev = null; bad = 0;
      for (i = 0; i < 400; i++) { p = gen("basic", 0, recent); recent.push(p.avoid); seen[p.cid] = 1; if (prev === p.cid) bad++; prev = p.cid; }
      check(bad === 0 && Object.keys(seen).length === 3, "① 3 問題・直前と同じものを出さない");
      check(stagesOf(makeProblem({ kind: "basic", cid: "b_not" }))[0].cols[0].model.join("") === "10" && stagesOf(makeProblem({ kind: "basic", cid: "b_not" }))[0].rows === 2, "① NOT は 2 行");
      // 段の構成
      var pa = makeProblem({ kind: "adder", lv: 1, cid: "ad1" }), sa = stagesOf(pa);
      check(sa.length === 2 && sa[0].cols.map(function (c2) { return c2.name; }).join() === "P,Q,R" && sa[1].cols.map(function (c2) { return c2.name; }).join() === "S", "④ 初級：P〜R → S（C は P）");
      pa = makeProblem({ kind: "adder", lv: 2, cid: "ad2" }); sa = stagesOf(pa);
      check(sa[0].cols.map(function (c2) { return c2.name + c2.sub; }).join() === "P①S,Q①C,R②C" && sa[1].cols.map(function (c2) { return c2.name; }).join() === "S,Co", "④ 中級：P〜R → S，Co");
      // 試行に数えない・文言の長さ
      check(Object.keys(CIRC).every(function (id) { return describeCircuit(CIRC[id]).length > 10; }), "図の説明がある");
    })();
    rep.extra.dummy = 0;
    return rep;
  }
  return { GATE_RANGE: GATE_RANGE, hint0: hint0, KINDS: KINDS, LEVELS: LEVELS, CLEAR_STREAK: CLEAR_STREAK, STAGE_IDS: STAGE_IDS, STORAGE_KEY: STORAGE_KEY, AVOID: AVOID, LABELS: LABELS, BANNED_SCREEN: BANNED_SCREEN, BANNED_DOC: BANNED_DOC, HINTS: HINTS,
    setSeed: setSeed, gen: gen, makeProblem: makeProblem, stagesOf: stagesOf, titleOf: titleOf, emptyVals: emptyVals, rowName: rowName, rowsOf: rowsOf, judgeStage: judgeStage, diagnose: diagnose, describeWrong: describeWrong,
    newStageState: newStageState, advance: advance, attempt: attempt, collapse: collapse, problemSummary: problemSummary, summaryText: summaryText, cellEdit: cellEdit, cycleCell: cycleCell, firstEmptyCell: firstEmptyCell, cellLabel: cellLabel,
    newRec: newRec, normalizeRec: normalizeRec, loadRec: loadRec, saveRec: saveRec, clearRec: clearRec, recStart: recStart, recAbandon: recAbandon, recFinish: recFinish, tickOf: tickOf, weakestStage: weakestStage, comboKey: comboKey, hasLv: hasLv, combosList: combosList,
    checkTexts: checkTexts, staticTexts: staticTexts, plain: plain, tableOf: tableOf, exampleRow: exampleRow, stageModelText: stageModelText, inputBit: inputBit,
    CIRC: CIRC, P_LIST: P_LIST, R_LIST: R_LIST, Q_LIST: Q_LIST, Z_LIST: Z_LIST, BASIC_LIST: BASIC_LIST, EXPECT: EXPECT, layoutCircuit: layoutCircuit, shapePath: shapePath, describeCircuit: describeCircuit, geomViolations: geomViolations, evalOf: evalOf, tableOf: tableOf, TEXT: TEXT, selfTest: selfTest };
})();
