"use strict";
/* ============ 2進数の計算（足し算・補数）コア ============
   CS Math Trainer の 4 つ目のカテゴリ．DOM に依存しない（node の vm で評価して検査できる）．
   binary-calc-drill（HEAD 9795fa7）のコアを移し，次を変えた：
   ・記録のキーを csMathTrainer.binaryCalc.v1 に（CS Math Trainer 全体と衝突しない）
   ・補数の定義を紙（本番版）の文に．③ の語順を「① 補数を足す → はみ出した桁を無視 → ② 10進数で確かめる」に
   ・Minor-C：赤いマスの模範が 1 と 0 で混ざるときの繰り上がりのヒントを、規則を言う文に（A-c3）
   ・まとめて入力（2 文字以上）は左端のマスから右へ配る
   ・「全部クリア」の判定と seenDef を持たない
   ============================================================ */
var BinCalcCore = (function () {

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
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  /* ---- 定数 ---- */
  var KINDS = ["calc", "comp", "viacomp"];                // ①足し算／②補数を求める／③補数で引き算
  var BITS = [4, 8];
  var CLEAR_STREAK = { calc: 3, comp: 3, viacomp: 2 };    // 博士の決定 2026-10-16
  var STORAGE_KEY = "csMathTrainer.binaryCalc.v1";
  var STAGE_IDS = {
    calc: ["carry", "add_ans"],
    comp: ["invert", "plus1"],
    viacomp: ["invert", "plus1", "sum", "ignore"]
  };
  // 型の割合（SPEC §1.2）．②は x，③は b の型
  var WEIGHTS = {
    calc: [["A0", 0.25], ["A1", 0.40], ["A2", 0.35]],
    comp: [["Ba", 0.25], ["Bb", 0.25], ["Bc", 0.30], ["Bd", 0.20]],
    viacomp: [["Ca", 0.40], ["Cb", 0.30], ["Cc", 0.30]]
  };
  // 全数列挙で確かめたプールの大きさ（SPEC §1.2 の表）．selfTest が数え直して照合する
  var EXPECTED_POOLS = {
    4: { A0: 50, A1: 28, A2: 27, Ba: 6, Bb: 3, Bc: 2, Bd: 3, Ca: 56, Cb: 28, Cc: 14 },
    8: { A0: 6050, A1: 6409, A2: 19926, Ba: 120, Bb: 60, Bc: 59, Bd: 15, Ca: 16256, Cb: 8128, Cc: 7874 }
  };

  // 画面にも READMEにも SPEC にも出さない語（第10回の語．教科書 p.93 の太字ほか）
  var BANNED_ALL = ["固定小数点", "浮動小数点", "丸め誤差", "桁落ち", "オーバーフロー", "アンダーフロー", "桁あふれ", "誤差", "2進数のある数に対し"];
  // 画面にだけ出さない語（符号・負の数・補数の別義など）
  var BANNED_SCREEN = ["符号", "負の数", "負数", "マイナス", "−8〜7", "-8~7", "−8～7", "補数の別義", "最大値", "1の補数", "2の補数", "一の補数", "二の補数"];
  // 定義文のほかには出さない語（定義文の中だけ教科書どおり）
  var DEF_ONLY_TERMS = ["桁上がり", "桁上げ", "繰り上げ"];   // 加算の定義文（「加算は繰り上げ（桁上げ）をする．」の1文）のほかには出さない（画面にも README・SPEC にも）
  // 画面のどこにも出さない語（引き算の筆算を外したので，定義文にも出ない．紙も 31c1107 で加算だけになった）
  var BANNED_BORROW = ["桁借り", "繰り下げ", "繰り下がり", "借り"];

  /* ---- 画面に出す文（コア側）．selfTest が禁止語を検査する ---- */
  var TEXT = {
    kind: { calc: "足し算の筆算", comp: "補数を求める", viacomp: "補数を使った引き算" },
    bits: { 4: "4ビット", 8: "8ビット" },
    level: { 4: "初級", 8: "中級" },
    // 定義文（補数は紙の本番版の文．加算の文は教科書の表記で，ここだけに「繰り上げ（桁上げ）」が出る）
    defs: [
      "補数：ある数に対し，足すと1桁増える最も小さな数．",
      "加算は繰り上げ（桁上げ）をする．"
    ],
    stage: {
      calc: {
        carry:   { name: "繰り上がり",   instr: "下の桁から繰り上がってくる桁の上に 1 を書こう．繰り上がってこない桁は 0" },
        add_ans: { name: "答え",         instr: "答えを書こう" }
      },
      comp: {
        invert:  { name: "反転",         instr: "0 と 1 を入れかえよう（先頭の 0 も）" },
        plus1:   { name: "1を足す（補数）", instr: "反転した数に 1 を足そう" }
      },
      viacomp: {
        invert:  { name: "反転",         instr: "引く数 b の補数を作る．まず，0 と 1 を入れかえよう" },
        plus1:   { name: "1を足す（補数）", instr: "1 を足して，b の補数を作ろう" },
        sum:     { name: "補数を足す",   instr: "① 引かれる数 a に，引く数の補数を足そう．1 桁増える" },
        ignore:  { name: "はみ出した桁を無視", instr: "① はみ出した桁を無視した答えを書こう" }
      }
    },
    row: { carry: "繰り上がり", answer: "答え",
           x: "もとの数", invert: "反転", plus1: "1を足す＝補数", b: "引く数 b", a: "引かれる数 a", cmp: "補数", sum: "和",
           vx: "もとの数", vcomp: "補数", vsum: "和" },
    // 画面の固定の文（UI）．selfTest が禁止語を検査する
    ui: {
      menuTitle: "2進数の計算（足し算・補数）",
      menuDesc: "2進数の足し算の筆算と，補数を使った引き算を，1段ずつ入力して練習します．時間制限はありません．",
      submenuTitle: "2進数の計算（足し算・補数）",
      actionLabel: "学習アクションの選択", levelLabel: "難易度の選択",
      levelNote: "初級は 4 ビット，中級は 8 ビット．時間制限はありません．",
      backToMenu: "カテゴリ選択に戻る", backToSub: "メニューに戻る", backToSubShort: "← 戻る",
      learnTitle: "📘 解説", learnDesc: "補数とは何か，補数を使うと引き算がどうなるかを，ステップごとに学びます．",
      kindDesc: { calc: "繰り上がりを書いてから答えを書く，2進数の足し算を1段ずつ練習します．",
                  comp: "0 と 1 を反転して 1 を足し，補数を求めます．最後に検算で確かめます．",
                  viacomp: "引く数の補数を足して，はみ出した桁を無視する引き算を練習します．" },
      kindLabel: "種類", bitsLabel: "難易度", progressLabel: "クリアの状況",
      cleared: "クリア", notYet: "まだ", tickTitle: "クリアの状況",
      reset: "記録を消す", resetAsk: "本当に消しますか．この端末の記録がすべて消えます", resetYes: "消す", resetNo: "やめる",
      streak: "連続", streakNote: "1回目で全段正解した問題の連続", stage: "段", stageEnd: "この問題はおわり",
      check: "答え合わせ", next: "次の問題へ", hintCheck: "Enter キーでも答え合わせ", hintNext: "Enter キーでも次へ",
      words: "ことば", mine: "きみの記録", lockedLabel: "確定", overLabel: "はみ出す桁",
      revLast: "正しい値はこれです", justCleared: "この種類・難易度はクリア！（✓）", chipOk: "1回目で正解", chipNg: "1回目は誤り", chipYet: "まだ", chipNow: "いま",
      wordsExtra: [
        "反転：0 を 1 に，1 を 0 に入れかえること．先頭の 0 も入れかえる．",
        "補数の求め方：反転して，1 を足す．",
        "はみ出した桁：補数を足したときに，左端にふえた 1 桁．引き算の答えでは無視する．"
      ],
      mineNone: "まだ記録がありません", mineTried: "解いた問題", mineFirst: "1回目で全段正解", mineStreak: "連続",
      mineHead: ["段", "回数", "1回目の誤り", "割合"], weak: "ここがつまずきやすい", mineNote: "記録はこの端末のブラウザの中だけに残ります．",
      stageName: { carry: "繰り上がり", add_ans: "答え",
                   invert: "反転", plus1: "1を足す（補数）", sum: "補数を足す", ignore: "はみ出した桁を無視" },
      notes: "ゆっくりでよい．式は紙に書いてもよい．"
    },
    // 解説（4 つの話：補数の定義 → 10進数の補数のイメージ → 2進数の補数の求め方 → 補数を使った引き算の考え方）
    // visual は画面側が組む絵の指定．rows の d は桁の文字列（空白は空き），hl は丸で囲む桁，slash は斜線を引く桁
    learn: {
      title: "2進数の計算の解説", prev: "前へ", next: "次へ", done: "完了", close: "メニューに戻る",
      steps: [
        { title: "補数とは",
          text: ["<b>補数</b>：ある数に対し，足すと1桁増える最も小さな数．",
                 "10進数でも，同じ考え方ができる．10進数の補数は，10進数で，足すと1桁増える最も小さな数．"],
          visual: null },
        { title: "10進数の補数のイメージ（問い）",
          text: ["74 に何を足すと，1桁増えて 100 になるか．"],
          visual: { type: "grid", cols: 3, rows: [
            { label: "", d: " 74" }, { label: "", d: " ？？", op: "＋" }, { label: "", d: "100", ruled: true, note: "1桁増えた数" } ] } },
        { title: "10進数の補数のイメージ（答え）",
          text: ["74 に 26 を足すと，100 になる．74＋26＝100．", "この 26 が，<b>74 の補数</b>．"],
          visual: { type: "grid", cols: 3, rows: [
            { label: "", d: " 74" }, { label: "", d: " 26", op: "＋", hl: [1, 2], note: "74 の補数" }, { label: "", d: "100", ruled: true, note: "1桁増えた数" } ] } },
        { title: "2進数の補数の求め方",
          text: ["<b>各桁の 0 と 1 を反転し，1 を足す．</b>",
                 "例：0100 の補数．0100＋1011＝1111（反転した数を足すと，繰り上がらず，いつも 1111）．",
                 "1111 に 0001（1）を足すと，1桁増えて 10000 になる．だから，反転して 1 を足す．"],
          visual: { type: "grid", cols: 4, rows: [
            { label: "もとの数", d: "0100" }, { label: "反転", d: "1011" }, { label: "1を足す＝補数", d: "1100", hl: [0, 1, 2, 3] } ] } },
        { title: "検算",
          text: ["もとの数に補数を足すと，<b>10…0</b>（1桁増えた形）になる．", "0100＋1100＝10000．"],
          visual: { type: "grid", cols: 5, rows: [
            { label: "もとの数", d: " 0100" }, { label: "補数", d: " 1100", op: "＋" }, { label: "和", d: "10000", ruled: true, note: "1桁増えた" } ] } },
        { title: "補数を使った引き算の考え方（走行距離計）",
          text: ["3桁の走行距離計（実物はもっと桁が多い．図は想定）．進むだけで，戻れない．999 の次は 000．",
                 "今は 100 km．999 を足すと，100＋999＝1099．左端の 1 は窓に出ないので，表示は 099．",
                 "100 km が 099 km になった．999 を足すと，距離が <b>1 km 減る</b>．"],
          visual: { type: "odo", from: "100", add: "999", to: "099", sum: "1099" } },
        { title: "37 km 減らすには",
          text: ["37 km 減らすときは，037 の10進数の補数 963 を足す．",
                 "100＋963＝1063．はみ出した 1 を無視して，表示は 063．引き算の 100−37＝63 と一致する．"],
          visual: { type: "grid", cols: 4, rows: [
            { label: "今の距離", d: " 100" }, { label: "037 の補数", d: " 963", op: "＋" }, { label: "和", d: "1063", ruled: true, slash: [0], note: "はみ出した桁" } ] } },
        { title: "補数を使った引き算の考え方",
          text: ["<b>引く数の補数を加算し，はみ出した桁を無視する．</b>",
                 "例：0111−0100 ⇒ 0111＋（0100 の補数 1100）．",
                 "① 引く数の補数を足す → はみ出した桁を無視 → ② 10進数で確かめる（7−4＝3）．"],
          visual: { type: "grid", cols: 5, rows: [
            { label: "引かれる数 a", d: " 0111" }, { label: "補数", d: " 1100", op: "＋" }, { label: "和", d: "10011", ruled: true, slash: [0], note: "はみ出した桁" }, { label: "答え", d: " 0011", hl: [1, 2, 3, 4] } ] } }
      ]
    },
    msg: {
      ok1: "正解",
      ok2: "正解（2回目）",
      retry: "おしい．もう1回やってみよう",
      rev: "正しい値はこれです．次へ進もう",
      reject: "0 か 1 を入れよう",
      overflow: "入りきらない分は捨てました",
      fixRed: "赤いマスだけ直そう",
      noPaste: "貼り付けはできません",
      allFirst: "全段 1回目で正解",
      storageOff: "この端末では記録を残せません",
      verify: "もとの数＋補数＝10…0 になった．足すと1桁増える最も小さな数＝補数"
    }
  };
  function msgEmpty(k) { return "あと" + k + "マス入れよう"; }
  function msgStumbled(names) { return "つまずいた段：" + names.join("・"); }

  // 誤りの見立て（SPEC §2.3）
  var HINTS = {
    "A-c1": "ここには 1 が入る．すぐ右の桁の和（繰り上がりも足す）が 2 以上なので，繰り上がってくる",
    "A-c2": "ここは 0．すぐ右の桁の和（繰り上がりも足す）が 1 以下なので，繰り上がってこない",
    "A-c3": "赤いマスを見直そう．すぐ右の桁の和（繰り上がりも足す）が 2 以上なら 1，1 以下なら 0",
    "A-a1": "繰り上がりを足し忘れていませんか",
    "A-a2": "1＋1 は 10．0 を書いて，1 は左の桁へ繰り上がる",
    "X-i1": "反転していない．0 は 1 に，1 は 0 に",
    "X-i2": "先頭の 0 も反転する．桁数をそろえて反転",
    "X-p1": "1 を足し忘れていませんか",
    "X-p2": "1＋1 は 10．繰り上がりを左の桁へ続ける",
    "C-s1": "足すと 1 桁増える．左端に 1 が出る",
    "C-s2": "繰り上がりを足し忘れていませんか",
    "C-z1": "無視するのは左端の 1．残りの桁が答え",
    "C-z2": "答えは足した結果から，左端の1を除いた桁"
  };

  /* ---- ビット操作（桁ごとの手順．教科書どおり．LSB 先頭の配列） ---- */
  function maxV(n) { return (1 << n) - 1; }
  function digitsLSB(v, n) { var d = [], i; for (i = 0; i < n; i++) d.push((v >> i) & 1); return d; }
  function strMSB(d) { return d.slice().reverse().join(""); }
  function toBits(v, n) { var s = v.toString(2); while (s.length < n) s = "0" + s; return s; }
  function tz(v) { var t = 0; while (v > 0 && (v & 1) === 0) { t++; v >>= 1; } return t; }
  function bitLen(v) { var k = 0; while (v > 0) { k++; v >>= 1; } return k; }
  function valOf(ans) { return parseInt(ans.join(""), 2); }

  function addLSB(A, B, n) {          // 桁ごとの足し算．co[i]＝桁 i から上の桁への繰り上がり．s は n+1 桁
    var co = [], s = [], c = 0, i, t;
    for (i = 0; i < n; i++) { t = A[i] + B[i] + c; s.push(t % 2); c = t >= 2 ? 1 : 0; co.push(c); }
    s.push(c);
    return { co: co, s: s };
  }
  function invLSB(A) { return A.map(function (x) { return 1 - x; }); }
  function plus1LSB(A) { var out = [], c = 1, i, t; for (i = 0; i < A.length; i++) { t = A[i] + c; out.push(t % 2); c = t > 1 ? 1 : 0; } return out; }

  /* ---- 問題の型・キー・プール ---- */
  function classifyCalc(a, b, n) {
    var A = digitsLSB(a, n), B = digitsLSB(b, n), f = addLSB(A, B, n).co;
    var any = false, adj = false, i;
    for (i = 0; i < n; i++) if (f[i]) { any = true; if (i + 1 < n && f[i + 1]) adj = true; }
    return "A" + (adj ? 2 : any ? 1 : 0);
  }
  function classifyComp(x, n) {
    if (x < (1 << Math.floor(n / 2))) return "Bd";
    var t = tz(x); return t === 0 ? "Ba" : t === 1 ? "Bb" : "Bc";
  }
  function classifyVia(b) { var t = tz(b); return t === 0 ? "Ca" : t === 1 ? "Cb" : "Cc"; }

  function keyOf(p) {
    return p.kind === "comp" ? "comp|" + p.bits + "|" + p.x
      : p.kind + "|" + p.bits + "|" + p.a + "|" + p.b;
  }
  // 値から問題を作る（fixtures・自己検査用．画面の出題はここを通らず gen が作る）
  function makeProblem(s) {
    var p = { kind: s.kind, bits: s.bits, a: s.a == null ? null : s.a, b: s.b == null ? null : s.b, x: s.x == null ? null : s.x };
    p.type = p.kind === "calc" ? classifyCalc(p.a, p.b, p.bits) : p.kind === "comp" ? classifyComp(p.x, p.bits) : classifyVia(p.b);
    p.key = keyOf(p);
    return p;
  }

  var EXCLUDE_PAPER = [];             // 紙の数値の除外（既定は空．SPEC §1.3）
  var excluded = {};
  var poolCache = {};
  function setExcludePaper(on) {
    EXCLUDE_PAPER = []; excluded = {}; poolCache = {};
    if (!on) return;
    FIXTURES.forEach(function (f) {
      if (f.bits !== 4) return;
      var p = f.kind === "comp" ? makeProblem({ kind: "comp", bits: 4, x: parseInt(f.x, 2) })
        : makeProblem({ kind: f.kind, bits: 4, a: parseInt(f.a, 2), b: parseInt(f.b, 2) });
      EXCLUDE_PAPER.push(p.key); excluded[p.key] = true;
    });
  }
  function calcPool(n) {
    var ck = "calc" + n, t = { A0: [], A1: [], A2: [] }, max = maxV(n), a, b, ty;
    if (poolCache[ck]) return poolCache[ck];
    for (a = 1; a <= max; a++) {
      for (b = 1; b <= max; b++) {
        if (a + b > max) continue;
        if (EXCLUDE_PAPER.length && excluded["calc|" + n + "|" + a + "|" + b]) continue;
        ty = classifyCalc(a, b, n); t[ty].push(a * 65536 + b);
      }
    }
    poolCache[ck] = t; return t;
  }
  function compPool(n) {
    var ck = "comp" + n, t = { Ba: [], Bb: [], Bc: [], Bd: [] }, max = maxV(n), x;
    if (poolCache[ck]) return poolCache[ck];
    for (x = 1; x <= max; x++) {
      if (x === (1 << (n - 1))) continue;
      if (EXCLUDE_PAPER.length && excluded["comp|" + n + "|" + x]) continue;
      t[classifyComp(x, n)].push(x);
    }
    poolCache[ck] = t; return t;
  }
  function viaPool(n) {               // 型ごとに { b, as: [b より大きい a …] } の一覧（a の候補がない b は入れない）
    var ck = "via" + n, t = { Ca: [], Cb: [], Cc: [] }, max = maxV(n), a, b, as;
    if (poolCache[ck]) return poolCache[ck];
    for (b = 1; b < max; b++) {
      if (b === (1 << (n - 1))) continue;
      as = [];
      for (a = b + 1; a <= max; a++) if (!(EXCLUDE_PAPER.length && excluded["viacomp|" + n + "|" + a + "|" + b])) as.push(a);
      if (as.length) t[classifyVia(b)].push({ b: b, as: as });
    }
    poolCache[ck] = t; return t;
  }
  function poolSizes(n) {             // 型ごとの問題数（③は (a,b) の組の数）
    var out = {}, c, m, v;
    c = calcPool(n); Object.keys(c).forEach(function (k) { out[k] = c[k].length; });
    m = compPool(n); Object.keys(m).forEach(function (k) { out[k] = m[k].length; });
    v = viaPool(n); Object.keys(v).forEach(function (k) { out[k] = v[k].reduce(function (s, e) { return s + e.as.length; }, 0); });
    return out;
  }

  function pickType(list) {
    var r = rng(), acc = 0, i;
    for (i = 0; i < list.length; i++) { acc += list[i][1]; if (r < acc) return list[i][0]; }
    return list[list.length - 1][0];
  }
  // 出題：型を割合で決め，その型の中から一様に選ぶ．直前と同じ問題なら同じ型の中で引き直す
  function gen(kind, bits, prev) {
    var n = bits, type, p, tries = 0, size, pool, e, a, b;
    if (kind === "calc") { type = pickType(WEIGHTS.calc); pool = calcPool(n)[type]; size = pool.length; }
    else if (kind === "comp") { type = pickType(WEIGHTS.comp); pool = compPool(n)[type]; size = pool.length; }
    else { type = pickType(WEIGHTS.viacomp); pool = viaPool(n)[type]; size = viaPool(n)[type].reduce(function (s0, q) { return s0 + q.as.length; }, 0); }
    do {
      if (kind === "calc") { e = pick(pool); p = makeProblem({ kind: "calc", bits: n, a: Math.floor(e / 65536), b: e % 65536 }); }
      else if (kind === "comp") { p = makeProblem({ kind: "comp", bits: n, x: pick(pool) }); }
      else { e = pick(pool); a = pick(e.as); b = e.b; p = makeProblem({ kind: "viacomp", bits: n, a: a, b: b }); }
      tries++;
    } while (prev && prev.key === p.key && size > 1 && tries < 500);
    return p;
  }

  /* ---- 段と模範の値 ---- */
  function mkStage(p, id, cellType, len, lo, model, extra) {
    var info = TEXT.stage[p.kind][id], st = { id: id, name: info.name, instr: info.instr, cellType: cellType, len: len, lo: lo, model: model };
    if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
    return st;
  }
  function chars(s) { return s.split(""); }
  function baseOf(p) { return p.kind === "comp" ? p.x : p.b; }

  function stagesOf(p) {
    var n = p.bits, out = [], A, B, r, i, cm;
    if (p.kind === "calc") {
      A = digitsLSB(p.a, n); B = digitsLSB(p.b, n); r = addLSB(A, B, n); cm = [];
      for (i = n - 1; i >= 1; i--) cm.push(String(r.co[i - 1]));          // 桁 i へ入る繰り上がり
      out.push(mkStage(p, "carry", "bit", n - 1, 1, cm));
      out.push(mkStage(p, "add_ans", "bit", n, 0, chars(strMSB(r.s.slice(0, n)))));
    } else if (p.kind === "comp") {
      A = digitsLSB(p.x, n); r = invLSB(A);
      out.push(mkStage(p, "invert", "bit", n, 0, chars(strMSB(r))));
      out.push(mkStage(p, "plus1", "bit", n, 0, chars(strMSB(plus1LSB(r)))));
    } else {
      A = digitsLSB(p.a, n); B = digitsLSB(p.b, n); r = invLSB(B); var cmp = plus1LSB(r), sm = addLSB(A, cmp, n);
      out.push(mkStage(p, "invert", "bit", n, 0, chars(strMSB(r))));
      out.push(mkStage(p, "plus1", "bit", n, 0, chars(strMSB(cmp))));
      out.push(mkStage(p, "sum", "bit", n + 1, 0, chars(strMSB(sm.s))));
      out.push(mkStage(p, "ignore", "bit", n, 0, chars(strMSB(sm.s.slice(0, n)))));
    }
    return out;
  }
  // 検算（②③）：x＋補数＝10…0．表示用の3行と式
  function verifyOf(p) {
    var n = p.bits, X = digitsLSB(baseOf(p), n), cmp = plus1LSB(invLSB(X)), s = addLSB(X, cmp, n).s;
    var xs = strMSB(X), cs = strMSB(cmp), ss = strMSB(s);
    return { x: xs, comp: cs, sum: ss, text: xs + "＋" + cs + "＝" + ss };
  }
  function decimalText(p) {                                          // ② 10進数で確かめる（紙の語順：① 補数を足す → はみ出した桁を無視 → ② 10進数で確かめる）
    return "② 10進数で確かめると " + p.a + "−" + p.b + "＝" + (p.a - p.b) + "．答えの " + toBits(p.a - p.b, p.bits) + " は10進数の " + (p.a - p.b);
  }
  function titleOf(p) {
    if (p.kind === "calc") return toBits(p.a, p.bits) + "＋" + toBits(p.b, p.bits);
    if (p.kind === "comp") return toBits(p.x, p.bits) + " の補数";
    return toBits(p.a, p.bits) + "−" + toBits(p.b, p.bits) + "（補数を使う）";
  }

  /* ---- 判定と誤りの見立て ---- */
  function diagnose(p, st, ans) {
    var n = p.bits, id = st.id, i, v, m, alt, base, inv, k, low, mask, diag = null;
    if (id === "carry") {
      // 赤いマスの模範が 1 だけなら「ここには 1」，0 だけなら「ここは 0」．1 と 0 が混ざるときは断定せず，規則を言う（A-c3．保留だった Minor-C の既定）
      var r1 = false, r0 = false;
      for (i = 0; i < ans.length; i++) {
        if (st.model[i] === "1" && ans[i] === "0") r1 = true;
        else if (st.model[i] === "0" && ans[i] === "1") r0 = true;
      }
      if (r1 && r0) return { id: "A-c3", text: HINTS["A-c3"] };
      if (r1) return { id: "A-c1", text: HINTS["A-c1"] };
      if (r0) return { id: "A-c2", text: HINTS["A-c2"] };
      return null;
    }
    v = valOf(ans); m = valOf(st.model); mask = maxV(n);
    if (id === "add_ans") {
      if (v === ((p.a ^ p.b) & mask) && v !== m) return { id: "A-a1", text: HINTS["A-a1"] };
      if (v === ((p.a | p.b) & mask) && v !== m) return { id: "A-a2", text: HINTS["A-a2"] };
    } else if (id === "invert") {
      base = baseOf(p);
      if (v === base && v !== m) return { id: "X-i1", text: HINTS["X-i1"] };
      k = bitLen(base); low = (~base) & ((1 << k) - 1);               // 先頭の 0 を反転しない誤り
      if (v === low && v !== m) return { id: "X-i2", text: HINTS["X-i2"] };
    } else if (id === "plus1") {
      inv = mask - baseOf(p);
      if (v === inv) return { id: "X-p1", text: HINTS["X-p1"] };
      if ((inv & 1) === 1 && v === inv - 1) return { id: "X-p2", text: HINTS["X-p2"] };
    } else if (id === "sum") {
      var lowN = v & mask, cmp = (mask + 1 - p.b) & mask;
      if (ans[0] === "0" && lowN === (m & mask)) return { id: "C-s1", text: HINTS["C-s1"] };
      if (ans[0] === "0" && lowN === ((p.a ^ cmp) & mask)) return { id: "C-s2", text: HINTS["C-s2"] };
    } else if (id === "ignore") {
      var sumV = ((mask + 1) + p.a - p.b) + 0, cmp2 = (mask + 1 - p.b) & mask;
      if (v === (sumV >> 1) && v !== m) return { id: "C-z1", text: HINTS["C-z1"] };
      if (v === cmp2 && v !== m) return { id: "C-z2", text: HINTS["C-z2"] };
    }
    return diag;
  }
  // ans: 左から並べた文字の配列（空は ""）
  function judgeStage(p, st, ans) {
    var empty = 0, wrong = [], i;
    for (i = 0; i < st.len; i++) {
      if (ans[i] === "" || ans[i] == null) empty++;
      else if (ans[i] !== st.model[i]) wrong.push(i);
    }
    return { empty: empty, wrong: wrong, ok: empty === 0 && wrong.length === 0, diag: (empty === 0 && wrong.length) ? diagnose(p, st, ans) : null };
  }
  function digitNo(st, idx) { return st.lo + (st.len - 1 - idx) + 1; }   // 右から何桁目か（1 から）
  function describeWrong(st, wrong) {
    var nos = wrong.map(function (i) { return digitNo(st, i); }).sort(function (a, b) { return a - b; });
    if (nos.length >= 4) return nos.length + "か所ちがいます";
    return "右から" + nos.map(function (k) { return k + "桁目"; }).join("と") + "がちがいます";
  }

  /* ---- 段の状態遷移（1回目誤り→もう1回，2回目も誤りなら値を見せる） ---- */
  function newStageState() { return { attempts: 0, result: null }; }
  function advance(s, ok) {
    if (s.result) return s;
    if (ok) return { attempts: s.attempts + 1, result: s.attempts === 0 ? "ok1" : "ok2" };
    if (s.attempts === 0) return { attempts: 1, result: null };
    return { attempts: 2, result: "rev" };
  }
  function attempt(p, st, s, ans) {
    var j = judgeStage(p, st, ans), o = { st: s, counted: false, empty: j.empty, ok: false, wrong: j.wrong, hint: null, head: "", detail: "", reveal: false, final: false, result: null };
    if (j.empty > 0) { o.head = msgEmpty(j.empty); return o; }      // 空のマスは試行に数えない
    o.st = advance(s, j.ok); o.counted = true; o.ok = j.ok;
    if (j.ok) { o.head = o.st.result === "ok1" ? TEXT.msg.ok1 : TEXT.msg.ok2; o.final = true; o.result = o.st.result; return o; }
    o.detail = describeWrong(st, j.wrong);
    o.hint = j.diag ? j.diag.text : null;
    if (o.st.result === "rev") { o.head = TEXT.msg.rev; o.reveal = true; o.final = true; o.result = "rev"; }
    else { o.head = TEXT.msg.retry; o.detail += "．" + TEXT.msg.fixRed; }    // 1回目の誤り：赤いマスだけ直す（行全体を打ち直すと桁がずれる）
    return o;
  }
  function problemSummary(ids, results) {   // 最後の段が終わったあとの結果文
    var bad = [], i;
    for (i = 0; i < results.length; i++) if (results[i] !== "ok1") bad.push(ids[i]);
    return { perfect: bad.length === 0, stumbled: bad };
  }
  function summaryText(kind, summary) {
    if (summary.perfect) return TEXT.msg.allFirst;
    return msgStumbled(summary.stumbled.map(function (id) { return TEXT.stage[kind][id].name; }));
  }

  /* ---- マスの操作（純粋関数）．row = { cells:[…], focus:i }．cells[0] が左端．マスは 1 ビット（0 か 1）だけ ---- */
  function normStr(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFKC"); } catch (e) { } return t; }
  function cellEdit(row, ev) {
    var cells = row.cells.slice(), len = cells.length, f = Math.max(0, Math.min(len - 1, row.focus | 0));
    var r = { cells: cells, focus: f, msg: "", note: "", submit: false, rejected: false, counted: true }, t, m, e, i;
    function clamp(i) { return Math.max(0, Math.min(len - 1, i)); }
    function reject(msg) { r.rejected = true; r.msg = msg; r.counted = false; }
    if (ev.type === "focus") { f = clamp(ev.index | 0); }
    else if (ev.type === "paste") { reject(TEXT.msg.noPaste); }
    else if (ev.type === "input") {
      t = normStr(ev.value);
      m = t.replace(/[^01]/g, "");
      if (t === "") { /* 空の入力は何もしない */ }
      else if (m === "") reject(TEXT.msg.reject);
      else if (m.length === 1) {                                  // 1 文字ずつ打つとき：フォーカスのマスに入れて左へ進む（左端では進まず上書き）
        cells[f] = m;
        if (f > 0) f--;
      }
      else {                                                      // 2 文字以上が一度に来たとき（IME の確定・insertText）：読む順に，行の左端のマスから右へ順に配る
        for (i = 0; i < m.length && i < len; i++) cells[i] = m.charAt(i);
        if (m.length > len) r.note = TEXT.msg.overflow;           // 行の長さを超える分は捨てて知らせる
        f = Math.min(m.length, len - 1);                          // 続きを打つマス：配ったすぐ右（全部埋まったら右端）
      }
    }
    else if (ev.type === "key") {
      e = ev.key;
      if (e === "Backspace") { if (cells[f] !== "") cells[f] = ""; else if (f < len - 1) { f++; cells[f] = ""; } }
      else if (e === "Delete") { cells[f] = ""; }
      else if (e === "ArrowLeft") { f = clamp(f - 1); }
      else if (e === "ArrowRight") { f = clamp(f + 1); }
      else if (e === "Home") { f = 0; }
      else if (e === "End") { f = len - 1; }
      else if (e === "Enter") {
        var emp = 0; for (i = 0; i < len; i++) if (cells[i] === "") emp++;
        if (emp > 0) { r.msg = msgEmpty(emp); r.counted = false; } else r.submit = true;
      }
    }
    r.focus = f;
    return r;
  }
  function cellLabel(rowName, digitFromRight, value) {                 // 画面読み上げ用（aria-label）
    return "右から" + digitFromRight + "桁目の" + rowName + " " + (value === "" ? "未入力" : value);
  }

  /* ---- 記録（localStorage．SPEC §5） ---- */
  function comboKey(kind, bits) { return kind + bits; }
  function newCombo(kind) {
    var c = { tried: 0, perfect: 0, streak: 0, cleared: false, pending: false, stage: {} };
    STAGE_IDS[kind].forEach(function (id) { c.stage[id] = { n: 0, miss1: 0, rev: 0 }; });
    return c;
  }
  function newRec() {
    var rec = { v: 1, sel: { kind: "calc", bits: 4 }, rec: {} };
    KINDS.forEach(function (k) { BITS.forEach(function (b) { rec.rec[comboKey(k, b)] = newCombo(k); }); });
    return rec;
  }
  function clampInt(v) { return (typeof v === "number" && isFinite(v) && v > 0) ? Math.min(Math.floor(v), 1000000) : 0; }
  function normalizeRec(raw) {
    var rec = newRec();
    if (!raw || typeof raw !== "object" || raw.v !== 1) return rec;
    if (raw.sel && typeof raw.sel === "object") {
      if (KINDS.indexOf(raw.sel.kind) >= 0) rec.sel.kind = raw.sel.kind;
      if (BITS.indexOf(raw.sel.bits) >= 0) rec.sel.bits = raw.sel.bits;
    }
    if (raw.rec && typeof raw.rec === "object") {
      KINDS.forEach(function (k) { BITS.forEach(function (b) {
        var key = comboKey(k, b), src = raw.rec[key], c = rec.rec[key];
        if (!src || typeof src !== "object") return;
        c.tried = clampInt(src.tried); c.perfect = Math.min(clampInt(src.perfect), c.tried); c.streak = Math.min(clampInt(src.streak), CLEAR_STREAK[k]);   // 巨大な値は ✓ に要る本数で丸める
        c.cleared = src.cleared === true;
        c.pending = false;
        if (src.pending === true) c.streak = 0;                        // 解き終わらずに離れた
        if (src.stage && typeof src.stage === "object") {
          STAGE_IDS[k].forEach(function (id) {
            var s = src.stage[id]; if (!s || typeof s !== "object") return;
            var sn = clampInt(s.n);
            c.stage[id] = { n: sn, miss1: Math.min(clampInt(s.miss1), sn), rev: Math.min(clampInt(s.rev), sn) };   // 誤りの数は回数を超えない
          });
        }
      }); });
    }
    return rec;
  }
  function loadRec(storage) {                                          // { rec, usable }
    var s, usable = true;
    try { s = storage.getItem(STORAGE_KEY); } catch (e) { return { rec: newRec(), usable: false }; }
    if (s == null) return { rec: newRec(), usable: usable };
    try { return { rec: normalizeRec(JSON.parse(s)), usable: usable }; } catch (e2) { return { rec: newRec(), usable: usable }; }
  }
  function saveRec(storage, rec) { try { storage.setItem(STORAGE_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; } }
  function clearRec(storage) { try { storage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; } }
  function recStart(rec, kind, bits) { rec.rec[comboKey(kind, bits)].pending = true; return rec; }
  function recAbandon(rec, kind, bits) { var c = rec.rec[comboKey(kind, bits)]; if (c.pending) { c.streak = 0; c.pending = false; } return rec; }
  function recFinish(rec, kind, bits, ids, results) {
    var c = rec.rec[comboKey(kind, bits)], sum = problemSummary(ids, results), i, s;
    c.pending = false; c.tried++;
    if (sum.perfect) { c.perfect++; c.streak++; if (c.streak >= CLEAR_STREAK[kind]) c.cleared = true; }
    else c.streak = 0;
    for (i = 0; i < ids.length; i++) {
      s = c.stage[ids[i]]; s.n++;
      if (results[i] !== "ok1") s.miss1++;
      if (results[i] === "rev") s.rev++;
    }
    return rec;
  }
  function tickOf(rec, kind, bits) { return rec.rec[comboKey(kind, bits)].cleared === true; }   // サブメニューのカードの ✓（難易度ごと）
  function weakestStage(combo, kind) {                                 // 回数が 5 以上で，1回目の誤りの割合が最も高い段
    var best = null, bestRate = -1;
    STAGE_IDS[kind].forEach(function (id) {
      var s = combo.stage[id], rate;
      if (s.n < 5) return;
      rate = s.miss1 / s.n;
      if (rate > bestRate) { bestRate = rate; best = id; }
    });
    return best;
  }

  /* ---- 固定の例（紙・教科書・追加練習．SPEC §7 の表と 1 対 1．各行の src は工程B入口 §0.2・§0.3 の問題名） ---- */
  var FIXTURES = [
    {src:"例題2(1)",kind:"calc",bits:4,a:"0010",b:"1011",carry:"0,1,0",ans:"1101"},
    {src:"確認問題2(1)",kind:"calc",bits:4,a:"0011",b:"1001",carry:"0,1,1",ans:"1100"},
    {src:"確認問題2(2)",kind:"calc",bits:4,a:"0111",b:"0001",carry:"1,1,1",ans:"1000"},
    {src:"Bプリント確認1(5)",kind:"calc",bits:4,a:"1100",b:"0011",carry:"0,0,0",ans:"1111"},
    {src:"Bプリント確認1(6)",kind:"calc",bits:4,a:"1010",b:"0101",carry:"0,0,0",ans:"1111"},
    {src:"学習ノート24 知2①",kind:"calc",bits:4,a:"0101",b:"0110",carry:"1,0,0",ans:"1011"},
    {src:"学習ノート24 知2②",kind:"calc",bits:4,a:"1011",b:"0011",carry:"0,1,1",ans:"1110"},
    {src:"例題3",kind:"comp",bits:4,x:"0100",inv:"1011",ans:"1100",sum:"10000"},
    {src:"確認問題3(1)",kind:"comp",bits:4,x:"1101",inv:"0010",ans:"0011",sum:"10000"},
    {src:"確認問題3(2)",kind:"comp",bits:5,x:"10001",inv:"01110",ans:"01111",sum:"100000"},
    {src:"確認問題3(3)",kind:"comp",bits:7,x:"0000111",inv:"1111000",ans:"1111001",sum:"10000000"},
    {src:"確認問題3(4)",kind:"comp",bits:6,x:"001100",inv:"110011",ans:"110100",sum:"1000000"},
    {src:"学習ノート24 知3①",kind:"comp",bits:4,x:"1011",inv:"0100",ans:"0101",sum:"10000"},
    {src:"学習ノート24 知3②",kind:"comp",bits:8,x:"01001100",inv:"10110011",ans:"10110100",sum:"100000000"},
    {src:"例題4",kind:"viacomp",bits:4,a:"0111",b:"0100",inv:"1011",comp:"1100",sum:"10011",ans:"0011",dec:"7−4＝3"},
    {src:"確認問題4(1)",kind:"viacomp",bits:4,a:"1010",b:"0010",inv:"1101",comp:"1110",sum:"11000",ans:"1000",dec:"10−2＝8"},
    {src:"確認問題4(2)",kind:"viacomp",bits:4,a:"1100",b:"0011",inv:"1100",comp:"1101",sum:"11001",ans:"1001",dec:"12−3＝9"},
    {src:"学習ノート24 思4①",kind:"viacomp",bits:4,a:"1101",b:"1011",inv:"0100",comp:"0101",sum:"10010",ans:"0010",dec:"13−11＝2"},
    {src:"学習ノート24 思4②",kind:"viacomp",bits:4,a:"1100",b:"1010",inv:"0101",comp:"0110",sum:"10010",ans:"0010",dec:"12−10＝2"},
    {src:"第9回 今日のまとめ(1)",kind:"viacomp",bits:4,a:"0111",b:"0101",inv:"1010",comp:"1011",sum:"10010",ans:"0010",dec:"7−5＝2"}
  ];
  function problemOfFixture(f) {
    return f.kind === "comp" ? makeProblem({ kind: "comp", bits: f.bits, x: parseInt(f.x, 2) })
      : makeProblem({ kind: f.kind, bits: f.bits, a: parseInt(f.a, 2), b: parseInt(f.b, 2) });
  }

  /* ---- 画面に出る文字列の一覧（禁止語の検査用） ---- */
  function staticTexts() {
    var out = [];
    (function walk(v) {
      if (typeof v === "string") out.push(v.replace(/<\/?b>/g, ""));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(TEXT);
    out.push.apply(out, Object.keys(HINTS).map(function (x) { return HINTS[x]; }));
    out.push(msgEmpty(3), msgStumbled(["a", "b"]));
    return out;
  }
  function checkTexts(list, defsExempt) {                              // 禁止語の違反を返す
    var bad = [];
    list.forEach(function (t) {
      BANNED_ALL.concat(BANNED_SCREEN, BANNED_BORROW).forEach(function (w) { if (t.indexOf(w) >= 0) bad.push("禁止語「" + w + "」: " + t); });
      if (defsExempt.indexOf(t) < 0) DEF_ONLY_TERMS.forEach(function (w) { if (t.indexOf(w) >= 0) bad.push("定義文以外の語「" + w + "」: " + t); });
    });
    return bad;
  }

  /* ============ 自己検査 ============ */
  function selfTest(nPer, seed, docs) {
    if (seed !== undefined) setSeed(seed);
    nPer = nPer || 3000;
    var rep = { n: nPer, seed: seed, combos: {}, totalChecked: 0, totalFail: 0, failures: [], pools: {}, fixtures: {}, extra: {} };
    function fail(msg) { rep.totalFail++; if (rep.failures.length < 40) rep.failures.push(msg); }
    function check(cond, msg) { rep.totalChecked++; if (!cond) fail(msg); }
    var BI = function (v) { return BigInt(v); };
    var two = function (k) { return BI(1) << BI(k); };
    var modk = function (x, k) { return BI(x) % two(k); };
    var pad = function (x, n) { var s = x.toString(2); while (s.length < n) s = "0" + s; return s; };
    var excl = ["calc|4", "comp|4"];
    var saveExclude = EXCLUDE_PAPER.length > 0;

    /* 独立な計算（BigInt）：模範の値 */
    function refModels(p) {
      var n = p.bits, o = {}, j, a, b, x, s;
      if (p.kind === "calc") {
        a = BI(p.a); b = BI(p.b); s = [];
        for (j = n - 1; j >= 1; j--) s.push((modk(a, j) + modk(b, j)) >= two(j) ? "1" : "0");
        o.carry = s; o.add_ans = pad(a + b, n).split("");
      } else if (p.kind === "comp") {
        x = BI(p.x); o.invert = pad(two(n) - BI(1) - x, n).split(""); o.plus1 = pad(two(n) - x, n).split("");
      } else {
        a = BI(p.a); b = BI(p.b);
        o.invert = pad(two(n) - BI(1) - b, n).split(""); o.plus1 = pad(two(n) - b, n).split("");
        o.sum = pad(a + two(n) - b, n + 1).split(""); o.ignore = pad(a - b, n).split("");
      }
      return o;
    }
    function refType(p) {                                          // 独立な型の分類（BigInt と文字列）
      var n = p.bits, f = [], i, any = false, adj = false, s, zl, tzs;
      if (p.kind === "calc") {
        for (i = 0; i < n; i++) f.push((modk(p.a, i + 1) + modk(p.b, i + 1)) >= two(i + 1) ? 1 : 0);
        for (i = 0; i < n; i++) if (f[i]) { any = true; if (i + 1 < n && f[i + 1]) adj = true; }
        return "A" + (adj ? 2 : any ? 1 : 0);
      }
      if (p.kind === "comp") {
        s = pad(BI(p.x), n); zl = s.match(/^0*/)[0].length; tzs = s.match(/0*$/)[0].length;
        if (zl >= n / 2) return "Bd";
        return tzs === 0 ? "Ba" : tzs === 1 ? "Bb" : "Bc";
      }
      s = pad(BI(p.b), n); tzs = s.match(/0*$/)[0].length;
      return tzs === 0 ? "Ca" : tzs === 1 ? "Cb" : "Cc";
    }
    function refValid(p) {                                         // 範囲と除外（SPEC §1.1）
      var n = p.bits, max = Math.pow(2, n) - 1, half = Math.pow(2, n - 1);
      if (p.kind === "calc") return p.a >= 1 && p.b >= 1 && p.a + p.b <= max;
      if (p.kind === "comp") return p.x >= 1 && p.x <= max && p.x !== half;
      return p.b >= 1 && p.b <= max && p.b !== half && p.a > p.b && p.a <= max;
    }

    /* 独立な見立て（モデルの値から作る誤答と，期待する ID） */
    function sameArr(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
    function bitsArr(v, len) { return pad(BI(v), len).split(""); }
    function designed(p, st) {                                      // [{ ans, id }]．id は期待する見立て（null＝見立てなし）
      var n = p.bits, mask = Math.pow(2, n) - 1, out = [], m = st.model, id = st.id, i, a, base, inv, k, low, alt, lowN;
      function add(ans, expect) { if (!sameArr(ans, m)) out.push({ ans: ans, id: expect }); }
      if (id === "carry") {
        for (i = 0; i < m.length; i++) { a = m.slice(); a[i] = m[i] === "1" ? "0" : "1"; add(a, m[i] === "1" ? "A-c1" : "A-c2"); }
      } else if (id === "add_ans") {
        add(bitsArr((p.a ^ p.b) & mask, n), "A-a1");
        if (((p.a | p.b) & mask) !== ((p.a ^ p.b) & mask)) add(bitsArr((p.a | p.b) & mask, n), "A-a2");
      } else if (id === "invert") {
        base = baseOf(p); add(bitsArr(base, n), "X-i1");
        k = pad(BI(base), n).replace(/^0+/, "").length;                // 先頭の 0 を除いた桁数
        low = pad(BI(base), n).slice(n - k).split("").map(function (c) { return c === "1" ? "0" : "1"; }).join("");
        alt = ("0".repeat(n - k) + low).split(""); add(alt, "X-i2");
      } else if (id === "plus1") {
        inv = mask - baseOf(p); add(bitsArr(inv, n), "X-p1");
        if (inv % 2 === 1) add(bitsArr(inv - 1, n), "X-p2");
      } else if (id === "sum") {
        lowN = m.slice(1); add(["0"].concat(lowN), "C-s1");
        var cm = Math.pow(2, n) - p.b; add(["0"].concat(bitsArr(p.a ^ cm, n)), "C-s2");
      } else if (id === "ignore") {
        var sumV = p.a + Math.pow(2, n) - p.b, cmp = Math.pow(2, n) - p.b;
        add(bitsArr(Math.floor(sumV / 2), n), "C-z1"); add(bitsArr(cmp, n), "C-z2");
      }
      return out;
    }
    // designed で作った誤答の期待 ID と，先頭一致の規則（同じ値なら一覧の前の ID）を突き合わせる
    function expectedFor(list, i) {                                 // list[i] と同じ誤答が前にあれば，その前の ID
      for (var q = 0; q < i; q++) if (sameArr(list[q].ans, list[i].ans)) return list[q].id;
      return list[i].id;
    }

    var screenSamples = [];
    var CHECKS_STATE = { ok: true };

    /* ---- 1〜10：組み合わせごとの生成検査 ---- */
    KINDS.forEach(function (kind) { BITS.forEach(function (n) {
      var key = comboKey(kind, n), prev = null, counts = {}, i, p, ref, ss, sh, jj, vr, tx;
      var comboFail0 = rep.totalFail;
      for (i = 0; i < nPer; i++) {
        p = gen(kind, n, prev);
        // 1 範囲，6 除外
        check(refValid(p), key + " 範囲・除外に違反 " + p.key);
        // 7 連続しない
        if (prev) check(prev.key !== p.key, key + " 同じ問題が連続 " + p.key);
        // 8 型（独立な分類と一致）
        check(refType(p) === p.type, key + " 型の分類が不一致 " + p.key + " core=" + p.type + " ref=" + refType(p));
        counts[p.type] = (counts[p.type] || 0) + 1;
        // 2 模範の値（桁ごとの手順と BigInt の独立な計算）
        ss = stagesOf(p); ref = refModels(p);
        ss.forEach(function (st1) { check(sameArr(st1.model, ref[st1.id]), key + " 模範の値が不一致 " + p.key + " " + st1.id + " core=" + st1.model.join("") + " ref=" + ref[st1.id].join("")); });
        check(ss.length === STAGE_IDS[kind].length, key + " 段の数");
        // 3 補数の検算
        if (kind !== "calc") {
          vr = verifyOf(p);
          tx = vr.text.replace(/＋/g, "+").replace(/＝/g, "=").split(/[+=]/);
          check(BI("0b" + tx[0]) + BI("0b" + tx[1]) === BI("0b" + tx[2]) && BI("0b" + tx[2]) === two(n) && tx[2].length === n + 1, key + " 検算の式が不成立 " + vr.text);
          check(BI(baseOf(p)) + BI("0b" + vr.comp) === two(n), key + " x＋補数≠2ⁿ " + p.key);
        }
        // 4 ③の和
        if (kind === "viacomp") {
          sh = ss[2].model;
          check(sh.length === n + 1 && sh[0] === "1" && BI("0b" + sh.slice(1).join("")) === BI(p.a) - BI(p.b), key + " 和の先頭・下の n 桁 " + p.key);
          check(decimalText(p) === "② 10進数で確かめると " + p.a + "−" + p.b + "＝" + (p.a - p.b) + "．答えの " + pad(p.a - p.b, n) + " は10進数の " + (p.a - p.b), key + " 10進数の確認の式");
        }
        // 5 ①は足し算だけ：引き算の段・マス・型が一度も出ない
        if (kind === "calc") {
          check(p.type.charAt(0) === "A" && p.op === undefined, key + " ①に足し算以外の型 " + p.key);
          check(ss.map(function (x) { return x.id; }).join(",") === "carry,add_ans" && ss.every(function (x) { return x.cellType === "bit"; }), key + " ①の段が足し算の 2 段でない " + p.key);
          check(titleOf(p) === pad(p.a, n) + "＋" + pad(p.b, n) && titleOf(p).indexOf("−") < 0, key + " ①の題が足し算でない " + titleOf(p));
        }
        // 10 誤りの見立て
        ss.forEach(function (st1) {
          var ds = designed(p, st1), t0, c0;
          ds.forEach(function (d, di) {
            var exp = expectedFor(ds, di), got = diagnose(p, st1, d.ans);
            check((got ? got.id : null) === exp, key + " 見立て " + p.key + " " + st1.id + " ans=" + d.ans.join(",") + " 期待=" + exp + " 実際=" + (got ? got.id : null));
          });
          // 1桁だけ違う誤答：設計した誤答と一致しなければ見立てなし，赤は正しい桁
          if (st1.cellType === "bit") {
            c0 = Math.floor(rng() * st1.len); t0 = st1.model.slice(); t0[c0] = t0[c0] === "1" ? "0" : "1";
            var named = ds.some(function (d) { return sameArr(d.ans, t0); });
            jj = judgeStage(p, st1, t0);
            check(jj.wrong.length === 1 && jj.wrong[0] === c0 && jj.empty === 0, key + " 赤のマス " + p.key + " " + st1.id);
            if (!named) check(jj.diag === null, key + " 1桁違いに見立てが付いた " + p.key + " " + st1.id + " " + (jj.diag && jj.diag.id));
          }
        });
        if (i < 6) {                                               // 画面に出る生成文（指示文・結果文・ヒント）を収集
          screenSamples.push(titleOf(p));
          if (kind !== "calc") screenSamples.push(verifyOf(p).text);
          if (kind === "viacomp") screenSamples.push(decimalText(p));
          ss.forEach(function (st1) {
            screenSamples.push(st1.name, st1.instr);
            var wrongAns = st1.model.map(function (w) { return w === "1" ? "0" : "1"; });
            var s0 = newStageState(), o1 = attempt(p, st1, s0, wrongAns), o2 = attempt(p, st1, o1.st, wrongAns);
            screenSamples.push(o1.head, o1.detail, o1.hint || "", o2.head, o2.detail, o2.hint || "", attempt(p, st1, s0, st1.model.map(function () { return ""; })).head);
          });
          screenSamples.push(summaryText(kind, problemSummary(["x"].concat([]), ["ok1"])), summaryText(kind, { perfect: false, stumbled: [STAGE_IDS[kind][0]] }));
        }
        prev = p;
      }
      // 8 型の出方
      // SPEC §1.2 の割合（コアの WEIGHTS とは別に書き写した値）
      var SPEC_W = { A0: 0.25, A1: 0.40, A2: 0.35, Ba: 0.25, Bb: 0.25, Bc: 0.30, Bd: 0.20, Ca: 0.40, Cb: 0.30, Cc: 0.30 };
      var expectW = SPEC_W, list = WEIGHTS[kind], ratios = [], info = {}, tot = 0;
      Object.keys(counts).forEach(function (t) { tot += counts[t]; });
      list.forEach(function (e) {
        var t = e[0], base = tot, share = (counts[t] || 0) / base, ex = expectW[t];
        info[t] = { count: counts[t] || 0, share: Math.round(share * 1000) / 1000, expect: ex };
        check(Math.abs(share - ex) <= 0.05, key + " 型の割合が±5ポイントを超えた " + t + " " + share + " vs " + ex);
        if (counts[t]) ratios.push(share / ex);
        if (n === 4) check((counts[t] || 0) > 0, key + " 型が一度も出ない " + t);
      });
      var ratio = Math.max.apply(null, ratios) / Math.min.apply(null, ratios);
      rep.combos[key] = { generated: tot, failures: rep.totalFail - comboFail0, types: info, maxMinRatio: Math.round(ratio * 1000) / 1000 };
    }); });

    /* ---- 8（続き）：プールの大きさ，4ビットで全問題が出る ---- */
    BITS.forEach(function (n) {
      var sizes = poolSizes(n);
      rep.pools[n] = sizes;
      Object.keys(EXPECTED_POOLS[n]).forEach(function (t) { check(sizes[t] === EXPECTED_POOLS[n][t], "プールの大きさ " + n + "ビット " + t + " " + sizes[t] + " vs " + EXPECTED_POOLS[n][t]); });
    });
    (function () {                                                 // 4ビットは全問題が出る（②は14通り）
      var seen = {}, i, p, prev = null, total = 0;
      for (i = 0; i < 6000; i++) { p = gen("comp", 4, prev); seen[p.x] = true; prev = p; }
      var xs = []; for (i = 1; i < 16; i++) if (i !== 8) xs.push(i);
      check(xs.length === 14 && xs.every(function (x) { return seen[x]; }), "4ビットの②で出ない x がある");
      seen = {}; prev = null;
      for (i = 0; i < 20000; i++) { p = gen("calc", 4, prev); seen[p.key] = true; prev = p; total++; }
      var miss = 0, a, b, ok, extra = 0;
      for (a = 1; a < 16; a++) for (b = 1; b < 16; b++) {
        if (a + b <= 15) { ok = seen["calc|4|" + a + "|" + b]; if (!ok) miss++; }
      }
      Object.keys(seen).forEach(function (k) { var q = k.split("|"); if (+q[2] + +q[3] > 15) extra++; });   // 足し算でない（答えが 4 ビットを超える）問題が出ていない
      check(extra === 0, "4ビットの①に範囲外の問題が " + extra + " 個");
      check(miss === 0, "4ビットの①で出ない問題が " + miss + " 個");
      seen = {}; prev = null;
      for (i = 0; i < 20000; i++) { p = gen("viacomp", 4, prev); seen[p.key] = true; prev = p; }
      miss = 0;
      for (b = 1; b < 16; b++) { if (b === 8) continue; for (a = b + 1; a < 16; a++) if (!seen["viacomp|4|" + a + "|" + b]) miss++; }
      check(miss === 0, "4ビットの③で出ない問題が " + miss + " 個");
    })();

    /* ---- 6（続き）：紙の数値の除外 ---- */
    (function () {
      setExcludePaper(true);
      var i, p, prev = null, bad = 0, keys = {}, kinds = ["calc", "comp", "viacomp"];
      EXCLUDE_PAPER.forEach(function (k) { keys[k] = true; });
      rep.extra.excludePaperCount = EXCLUDE_PAPER.length;
      kinds.forEach(function (kd) {
        prev = null;
        for (i = 0; i < 3000; i++) { p = gen(kd, 4, prev); if (keys[p.key]) bad++; check(refValid(p), "除外時の範囲 " + p.key); prev = p; }
      });
      check(bad === 0, "EXCLUDE_PAPER を入れても紙の数値が出た " + bad);
      check(EXCLUDE_PAPER.length === 16, "EXCLUDE_PAPER の件数（4 ビットの足し算 7・補数 3・補数で引き算 6）" + EXCLUDE_PAPER.length);
      setExcludePaper(false);
      check(EXCLUDE_PAPER.length === 0, "EXCLUDE_PAPER の既定は空");
    })();

    /* ---- 11：段の状態遷移・記録 ---- */
    (function () {
      var s = newStageState();
      s = advance(s, false); check(s.result === null && s.attempts === 1, "誤り1回目の状態");
      s = advance(s, false); check(s.result === "rev", "誤り→誤りは rev");
      s = newStageState(); s = advance(s, false); s = advance(s, true); check(s.result === "ok2", "誤り→正解は ok2");
      s = newStageState(); s = advance(s, true); check(s.result === "ok1", "正解は ok1");
      check(advance(s, false) === s, "解決後は変わらない");
      var rec = newRec(), ids = STAGE_IDS.viacomp, k;
      var oks = ids.map(function () { return "ok1"; });
      recStart(rec, "viacomp", 4); check(rec.rec.viacomp4.pending === true, "pending を立てる");
      recFinish(rec, "viacomp", 4, ids, oks); check(rec.rec.viacomp4.streak === 1 && !rec.rec.viacomp4.cleared && !rec.rec.viacomp4.pending, "③は1問ではクリアしない");
      recFinish(rec, "viacomp", 4, ids, oks); check(rec.rec.viacomp4.streak === 2 && rec.rec.viacomp4.cleared, "③は2問でクリア");
      recFinish(rec, "viacomp", 4, ids, ["ok1", "ok2", "ok1", "ok1"]); check(rec.rec.viacomp4.streak === 0 && rec.rec.viacomp4.cleared, "ok2 で連続 0・クリアは消えない");
      recFinish(rec, "viacomp", 4, ids, ["ok1", "ok1", "ok1", "rev"]); check(rec.rec.viacomp4.streak === 0, "rev で連続 0");
      check(rec.rec.viacomp4.stage.ignore.rev === 1 && rec.rec.viacomp4.stage.plus1.miss1 === 1 && rec.rec.viacomp4.stage.invert.n === 4, "段ごとの数え方");
      recFinish(rec, "viacomp", 4, ids, oks); recStart(rec, "viacomp", 4); recAbandon(rec, "viacomp", 4);
      check(rec.rec.viacomp4.streak === 0 && !rec.rec.viacomp4.pending, "離脱で連続 0");
      [["calc", 3], ["comp", 3]].forEach(function (e) {
        var r2 = newRec(), idsK = STAGE_IDS[e[0]], ok = idsK.map(function () { return "ok1"; }), c = 0;
        for (c = 0; c < e[1] - 1; c++) recFinish(r2, e[0], 8, idsK, ok);
        check(!r2.rec[e[0] + "8"].cleared, e[0] + " は " + (e[1] - 1) + " 問ではクリアしない");
        recFinish(r2, e[0], 8, idsK, ok); check(r2.rec[e[0] + "8"].cleared, e[0] + " は " + e[1] + " 問でクリア");
      });
      var r3 = newRec(); check(KINDS.every(function (kd) { return BITS.every(function (b) { return !tickOf(r3, kd, b); }); }), "✓ の初期は全部なし");
      r3.rec.comp8.cleared = true; check(tickOf(r3, "comp", 8) && !tickOf(r3, "comp", 4) && !tickOf(r3, "calc", 8), "✓ は種類×難易度ごと（このカテゴリは「全部クリア」の判定を持たない）");
      check(typeof allClear === "undefined", "全部クリアの判定は持たない");
      // ランダムな列と素朴なモデルの突き合わせ
      var st = 0, cl = false, r4 = newRec(), idsC = STAGE_IDS.calc, t, res;
      for (t = 0; t < 2000; t++) {
        var act = rng();
        if (act < 0.1) { recStart(r4, "calc", 4); recAbandon(r4, "calc", 4); st = 0; }
        else { res = idsC.map(function () { return rng() < 0.85 ? "ok1" : (rng() < 0.5 ? "ok2" : "rev"); });
          recStart(r4, "calc", 4); recFinish(r4, "calc", 4, idsC, res);
          if (res.every(function (x) { return x === "ok1"; })) { st++; if (st >= 3) cl = true; } else st = 0; }
        if (r4.rec.calc4.streak !== st || r4.rec.calc4.cleared !== cl) { fail("連続のモデルと不一致 t=" + t); break; }
      }
      rep.totalChecked++;
      check(weakestStage(r4.rec.calc4, "calc") !== undefined, "weakestStage");
      var w = newCombo("calc"); w.stage.carry.n = 5; w.stage.carry.miss1 = 1; w.stage.add_ans.n = 5; w.stage.add_ans.miss1 = 3;
      check(weakestStage(w, "calc") === "add_ans", "ここがつまずきやすい（回数 5 以上で割合が最も高い段）");
      check(weakestStage(newCombo("calc"), "calc") === null, "回数が少ないときは出さない");
    })();

    /* ---- 12：マスの操作 ---- */
    (function () {
      var row = { cells: ["", "", "", ""], focus: 3 }, r;
      r = cellEdit(row, { type: "input", value: "1" }); check(r.cells.join("") === "".concat("", "", "", "1") && r.focus === 2, "右端に入力→左へ");
      row = { cells: ["", "", "", ""], focus: 3 };
      r = cellEdit(row, { type: "input", value: "1" }); row = { cells: r.cells, focus: r.focus };
      r = cellEdit(row, { type: "input", value: "0" }); row = { cells: r.cells, focus: r.focus };
      check(row.cells.join("") === "01" && row.focus === 1, "続けて入力");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "１" }); check(r.cells[3] === "1" && r.focus === 2, "全角の１");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "０" }); check(r.cells[3] === "0", "全角の０");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "2" }); check(r.cells[3] === "" && r.rejected && r.msg === TEXT.msg.reject && !r.counted && r.focus === 3, "0/1 以外は捨てる");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "あ" }); check(r.rejected, "かなは捨てる");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "a1" }); check(r.cells[3] === "1", "混ざった入力の 1 は受ける");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 0 }, { type: "input", value: "0" }); check(r.cells[0] === "0" && r.focus === 0, "左端では進まず上書き");
      // 2 文字以上が一度に来たとき（IME の確定・insertText）：読む順（左から右）に，行の左端のマスから右へ順に配る．1 文字ずつ打つときは右端から左へ進む（上のとおり）
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "１０１１" }); check(r.cells.join("") === "1011" && r.focus === 3 && r.note === "" && !r.rejected && r.counted, "全角で4桁の確定→左端から右へ読む順に配る " + r.cells.join(""));
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "111" }); check(r.cells.join("|") === "1|1|1|" && r.focus === 3 && r.note === "", "insertText の「111」は左の3マス");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "10110" }); check(r.cells.join("") === "1011" && r.note === TEXT.msg.overflow && r.focus === 3 && !r.rejected && r.counted, "行の幅を超える分は捨てて知らせる");
      r = cellEdit({ cells: ["", "", "", ""], focus: 1 }, { type: "input", value: "101" }); check(r.cells.join("|") === "1|0|1|" && r.note === "" && r.focus === 3, "フォーカスの位置によらず左端から配る");
      r = cellEdit({ cells: ["", "", "", ""], focus: 0 }, { type: "input", value: "0110" }); check(r.cells.join("") === "0110" && r.note === "", "左端にいても同じ");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "1 0 x1" }); check(r.cells.join("|") === "1|0|1|" && r.note === "", "0/1 以外は飛ばして配る");
      r = cellEdit({ cells: ["1", "1", "1", "1"], focus: 3 }, { type: "input", value: "00" }); check(r.cells.join("") === "0011" && r.focus === 2, "既にある値は上書き（左端から）");
      r = cellEdit({ cells: ["", "", ""], focus: 2 }, { type: "input", value: "10" }); check(r.cells.join("|") === "1|0|" && r.focus === 2 && r.note === "", "2 文字は左の 2 マス");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "x1" }); check(r.cells.join("|") === "|||1" && r.focus === 2, "0/1 が 1 文字だけなら 1 文字ずつ打つのと同じ（右端から）");
      r = cellEdit({ cells: ["", "", "", ""], focus: 3 }, { type: "input", value: "1" }); check(r.note === "", "1 文字なら知らせない");
      r = cellEdit({ cells: ["", "", "", "", ""], focus: 4 }, { type: "input", value: "１１００００" }); check(r.cells.join("") === "11000" && r.note === TEXT.msg.overflow && r.focus === 4, "5 マスの行（和の行）でも同じ");
      {
        var one = { cells: ["", "", "", ""], focus: 3 }, seqS = ["1", "0", "1", "1"], si;
        for (si = 0; si < 4; si++) { var rr1 = cellEdit(one, { type: "input", value: seqS[si] }); one = { cells: rr1.cells, focus: rr1.focus }; }
        check(one.cells.join("") === "1101" && one.focus === 0, "1 文字ずつ打つ：右端から入って左へ進む（これまでどおり）");
      }
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 2 }, { type: "key", key: "Backspace" }); check(r.cells[2] === "" && r.focus === 2, "Backspace（値あり）");
      r = cellEdit({ cells: ["1", "0", "", "1"], focus: 2 }, { type: "key", key: "Backspace" }); check(r.cells[3] === "" && r.focus === 3 && r.cells[0] === "1", "Backspace（空）は右のマスを消す");
      r = cellEdit({ cells: ["1", "0", "", ""], focus: 3 }, { type: "key", key: "Backspace" }); check(r.focus === 3, "右端の空で Backspace");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "Delete" }); check(r.cells[1] === "" && r.focus === 1, "Delete");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 2 }, { type: "key", key: "ArrowLeft" }); check(r.focus === 1, "←");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 0 }, { type: "key", key: "ArrowLeft" }); check(r.focus === 0, "左端で←");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 3 }, { type: "key", key: "ArrowRight" }); check(r.focus === 3, "右端で→");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "ArrowRight" }); check(r.focus === 2, "→");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "Home" }); check(r.focus === 0, "Home");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "End" }); check(r.focus === 3, "End");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "ArrowUp" }); check(r.focus === 1 && r.cells.join("") === "1011", "↑は使わない");
      r = cellEdit({ cells: ["1", "", "1", "1"], focus: 1 }, { type: "key", key: "Enter" }); check(!r.submit && r.msg === msgEmpty(1) && !r.counted, "空があれば答え合わせしない");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "Enter" }); check(r.submit, "Enter＝答え合わせ（どのマスでも）");
      r = cellEdit({ cells: ["", "", "", ""], focus: 2 }, { type: "paste" }); check(r.rejected && r.cells.join("") === "", "貼り付けは受けない");
      r = cellEdit({ cells: ["1", "0", "1", "1"], focus: 1 }, { type: "key", key: "0" }); check(r.cells.join("") === "1011", "keydown の 0/1 では変えない（input で正規化）");
      // 引き算の筆算を外した：マスは 0 か 1 だけ．切り替え（toggle）・Space・11 の入力は受けない
      r = cellEdit({ cells: ["", "", ""], focus: 2 }, { type: "toggle", index: 2 }); check(r.cells.join("|") === "||" && r.focus === 2 && !r.submit, "タップの切り替えは無い（未知のイベントは何もしない）");
      r = cellEdit({ cells: ["", "", ""], focus: 2 }, { type: "key", key: " " }); check(r.cells.join("|") === "||", "Space でマスは変わらない");
      r = cellEdit({ cells: ["", "", ""], focus: 2 }, { type: "input", value: "11" }); check(r.cells.join("|") === "1|1|" && r.focus === 2, "「11」の入力は 1 と 1 の 2 マス（11 を 1 つのマスに入れられない）");
      r = cellEdit({ cells: ["", "", ""], focus: 2 }, { type: "input", value: "2" }); check(r.rejected && r.cells.join("|") === "||", "0/1 以外は捨てる（2）");
      check(cellLabel("繰り上がり", 2, "0") === "右から2桁目の繰り上がり 0" && cellLabel("繰り上がり", 3, "") === "右から3桁目の繰り上がり 未入力" && cellLabel("繰り上がり", 1, "1") === "右から1桁目の繰り上がり 1", "読み上げ文（aria-label）");
      // 純粋性：入力の row を書き換えない
      var rr = { cells: ["", "", "", ""], focus: 3 }; cellEdit(rr, { type: "input", value: "1" }); check(rr.cells.join("") === "" && rr.focus === 3, "row を書き換えない");
    })();

    /* ---- 13：記録 ---- */
    (function () {
      var store = {}, ms = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
      var rec = newRec();
      recStart(rec, "comp", 8); recFinish(rec, "comp", 8, STAGE_IDS.comp, ["ok1", "ok2"]); rec.sel = { kind: "viacomp", bits: 8 };
      check(saveRec(ms, rec) === true, "保存");
      var l = loadRec(ms); check(l.usable && JSON.stringify(l.rec) === JSON.stringify(rec), "保存→読み込みの往復が一致");
      store[STORAGE_KEY] = "{broken"; l = loadRec(ms); check(JSON.stringify(l.rec) === JSON.stringify(newRec()) && l.usable, "壊れた JSON は初期状態");
      store[STORAGE_KEY] = JSON.stringify({ v: 2, rec: {} }); l = loadRec(ms); check(JSON.stringify(l.rec) === JSON.stringify(newRec()), "版違いは読まない");
      store[STORAGE_KEY] = "null"; l = loadRec(ms); check(JSON.stringify(l.rec) === JSON.stringify(newRec()), "null");
      store[STORAGE_KEY] = JSON.stringify({ v: 1, unknown: 5, sel: { kind: "zzz", bits: 3 }, rec: { calc4: { tried: -5, perfect: "x", streak: 1e12, cleared: "yes", foo: 1, stage: { carry: { n: -1, miss1: 2.9, rev: null }, nonsense: { n: 3 } } }, extra9: { tried: 3 } } });
      l = loadRec(ms); var c4 = l.rec.rec.calc4;
      check(c4.tried === 0 && c4.perfect === 0 && c4.streak === CLEAR_STREAK.calc && c4.cleared === false && c4.stage.carry.n === 0 && c4.stage.carry.miss1 === 0 && c4.stage.carry.rev === 0 && !("nonsense" in c4.stage) && !("extra9" in l.rec.rec) && l.rec.sel.kind === "calc" && l.rec.sel.bits === 4, "負の数・巨大な数・知らない項目の丸め");
      store[STORAGE_KEY] = JSON.stringify({ v: 1, rec: { viacomp4: { streak: 99, cleared: true }, comp8: { streak: 2 }, calc4: { streak: 1e300 } } });
      l = loadRec(ms); check(l.rec.rec.viacomp4.streak === CLEAR_STREAK.viacomp && l.rec.rec.comp8.streak === 2 && l.rec.rec.calc4.streak === CLEAR_STREAK.calc && l.rec.rec.viacomp4.cleared === true, "連続の巨大な値は ✓ に要る本数で丸める（クリアは残る）");
      store[STORAGE_KEY] = JSON.stringify({ v: 1, rec: { calc4: { stage: { carry: { n: 5, miss1: 9, rev: 7 }, add_ans: { n: 5, miss1: 2, rev: 1 } } } } });
      l = loadRec(ms); check(l.rec.rec.calc4.stage.carry.miss1 === 5 && l.rec.rec.calc4.stage.carry.rev === 5 && l.rec.rec.calc4.stage.add_ans.miss1 === 2 && l.rec.rec.calc4.stage.add_ans.rev === 1, "誤りの数は回数を超えない");
      // 壊れた値・配列・文字列・巨大な値・入れ子：落ちない
      ["[]", "\"str\"", "123", "true", "{\"v\":1,\"rec\":[]}", "{\"v\":1,\"rec\":{\"calc4\":[]}}", "{\"v\":1,\"rec\":{\"calc4\":{\"stage\":[]}}}", "{\"v\":1,\"sel\":[]}",
       "{\"v\":1,\"rec\":{\"calc4\":{\"tried\":1e308,\"perfect\":1e308,\"stage\":{\"carry\":{\"n\":1e308,\"miss1\":1e308,\"rev\":1e308}}}}}", "{\"v\":1,\"rec\":{\"__proto__\":{\"calc4\":1},\"constructor\":1}}"].forEach(function (txt, qi) {
        var okq = true, lq;
        try { store[STORAGE_KEY] = txt; lq = loadRec(ms); okq = lq.usable && lq.rec.v === 1 && KINDS.every(function (kd) { return BITS.every(function (b) { var cc = lq.rec.rec[comboKey(kd, b)]; return cc && cc.tried >= 0 && cc.tried <= 1000000 && cc.streak <= CLEAR_STREAK[kd]; }); }); } catch (eq) { okq = false; }
        check(okq, "壊れた記録 #" + qi + " で落ちない・範囲に丸める");
      });
      store[STORAGE_KEY] = JSON.stringify({ v: 1, sel: { kind: "viacomp", bits: 8 }, rec: { calc4: { tried: 12, perfect: 7, streak: 2, cleared: true, stage: { carry: { n: 12, miss1: 3, rev: 1 }, add_ans: { n: 12, miss1: 2, rev: 0 }, other: { n: 9, miss1: 5, rev: 2 } } } } });
      l = loadRec(ms); var o4 = l.rec.rec.calc4;
      check(o4.tried === 12 && o4.perfect === 7 && o4.streak === 2 && o4.cleared === true && Object.keys(o4.stage).join(",") === "carry,add_ans" && o4.stage.carry.miss1 === 3 && l.rec.sel.kind === "viacomp" && l.rec.sel.bits === 8 && !("seenDef" in l.rec), "知らない段は捨てて，ほかの値と選択は保たれる");
      var r5 = newRec(); r5.rec.calc4.streak = 2; r5.rec.calc4.pending = true; r5.rec.comp4.streak = 2; store[STORAGE_KEY] = JSON.stringify(r5);
      l = loadRec(ms); check(l.rec.rec.calc4.streak === 0 && l.rec.rec.calc4.pending === false && l.rec.rec.comp4.streak === 2, "pending=true は連続を 0 にする");
      check(clearRec(ms) === true && !(STORAGE_KEY in store), "記録を消す");
      var thrower = { getItem: function () { throw new Error("blocked"); }, setItem: function () { throw new Error("blocked"); }, removeItem: function () { throw new Error("blocked"); } };
      l = loadRec(thrower); check(l.usable === false && JSON.stringify(l.rec) === JSON.stringify(newRec()), "localStorage が例外でも初期状態で動く");
      check(saveRec(thrower, rec) === false && clearRec(thrower) === false, "保存・削除の例外を握りつぶす");
      l = loadRec(null); check(l.usable === false, "storage が null");
      check(STORAGE_KEY === "csMathTrainer.binaryCalc.v1", "キー名（CS Math Trainer 全体と衝突しない新しいキー）");
      check(["bin-dec", "bin-hex", "dec-hex", "csMathTrainer", "binaryCalcDrill.v1"].every(function (k) { return k !== STORAGE_KEY; }), "ほかのキーと別");
    })();

    /* ---- 14：固定の例（紙・教科書の答えと一致） ---- */
    (function () {
      var cnt = { calc: 0, comp: 0, viacomp: 0 };
      FIXTURES.forEach(function (f) {
        var p = problemOfFixture(f), ss = stagesOf(p), ref = refModels(p), by = {}, tag = f.src + " ";
        cnt[f.kind]++;
        ss.forEach(function (s) { by[s.id] = s; });
        if (f.kind === "calc") {
          check(by.carry.model.join(",") === f.carry, tag + "繰り上がりのマス " + by.carry.model.join(","));
          check(by.add_ans.model.join("") === f.ans, tag + "答え");
          check(parseInt(f.ans, 2) === parseInt(f.a, 2) + parseInt(f.b, 2), tag + "10進の足し算");
        } else if (f.kind === "comp") {
          check(by.invert.model.join("") === f.inv && by.plus1.model.join("") === f.ans, tag + "反転・補数");
          check(verifyOf(p).sum === f.sum && verifyOf(p).text === f.x + "＋" + f.ans + "＝" + f.sum, tag + "検算 " + verifyOf(p).text);
        } else {
          check(by.invert.model.join("") === f.inv && by.plus1.model.join("") === f.comp && by.sum.model.join("") === f.sum && by.ignore.model.join("") === f.ans, tag + "反転・補数・和・答え");
          check(decimalText(p).replace("② 10進数で確かめると ", "").split("．")[0] === f.dec, tag + "10進の確認 " + decimalText(p));
        }
        ["carry", "add_ans", "invert", "plus1", "sum", "ignore"].forEach(function (id) { if (by[id]) check(sameArr(by[id].model, ref[id]), tag + id + " が独立な計算と不一致"); });
        check(f.bits >= 2 && f.bits <= 16, tag + "ビット数");
      });
      rep.fixtures = { total: FIXTURES.length, calc: cnt.calc, comp: cnt.comp, viacomp: cnt.viacomp };
      check(FIXTURES.length === 20 && cnt.calc === 7 && cnt.comp === 7 && cnt.viacomp === 6, "fixtures の件数 " + FIXTURES.length);
      // 2〜16 ビットの任意の幅で動く（確認問題3 の 5・6・7 ビットを含む）
      var nb, okAll = true;
      for (nb = 2; nb <= 16; nb++) { var px = makeProblem({ kind: "comp", bits: nb, x: 1 }); var ssx = stagesOf(px); if (ssx[1].model.join("") !== pad(two(nb) - BI(1), nb)) okAll = false; }
      check(okAll, "2〜16 ビットで補数が求まる");
    })();


    /* ---- 15：見立ての断定が正しいか（全数）．赤いマスの模範が 1 と 0 で混ざるとき，「ここには 1」と断定しない（Minor-C） ---- */
    (function () {
      // ヒントごとの主張（赤いマスの模範の値について）．A-c1＝全部 1，A-c2＝全部 0，A-c3＝1 と 0 が混ざる．ほかの見立ては行全体の型についての文で，マス単位の主張をしない
      var claims = { "A-c1": function (m, red) { return red.every(function (i) { return m[i] === "1"; }); },
                     "A-c2": function (m, red) { return red.every(function (i) { return m[i] === "0"; }); },
                     "A-c3": function (m, red) { return red.some(function (i) { return m[i] === "1"; }) && red.some(function (i) { return m[i] === "0"; }); } };
      var perCell = {};                                          // マス単位の断定を含む文（「ここ」「このマス」）は A-c* だけ
      Object.keys(HINTS).forEach(function (id) { perCell[id] = /ここ[はに]|このマス/.test(HINTS[id]); });
      check(Object.keys(perCell).every(function (id) { return perCell[id] === (id === "A-c1" || id === "A-c2"); }), "マス単位の断定ヒントは A-c1・A-c2 だけ（同型は全部同じ扱い）");
      check(HINTS["A-c3"].indexOf("ここ") < 0 && /2 以上なら 1/.test(HINTS["A-c3"]) && /1 以下なら 0/.test(HINTS["A-c3"]), "A-c3 は断定せず規則を言う");
      var nAns = 0, nMixed = 0, nBad = 0, kinds4 = {};
      function allAnswers(len, cb) { var v, i, a; for (v = 0; v < (1 << len); v++) { a = []; for (i = len - 1; i >= 0; i--) a.push(((v >> i) & 1) ? "1" : "0"); cb(a); } }
      function oneProblem(p, full) {
        stagesOf(p).forEach(function (st) {
          var trials = [];
          if (st.len <= 9 && (full || st.len <= 5)) allAnswers(st.len, function (a) { trials.push(a); });
          else for (var q = 0; q < 300; q++) { var a2 = []; for (var z = 0; z < st.len; z++) a2.push(rng() < 0.5 ? "1" : "0"); trials.push(a2); }
          trials.forEach(function (a) {
            var j = judgeStage(p, st, a), id = j.diag && j.diag.id, red = j.wrong, m = st.model, hasOne, hasZero;
            if (!j.wrong.length) { check(!j.diag, "正解に見立てが付いた"); return; }
            nAns++;
            if (st.id === "carry") {
              hasOne = red.some(function (i) { return m[i] === "1"; }); hasZero = red.some(function (i) { return m[i] === "0"; });
              if (hasOne && hasZero) nMixed++;
              var want = hasOne && hasZero ? "A-c3" : hasOne ? "A-c1" : "A-c2";
              if (id !== want) { nBad++; fail("繰り上がりのヒント " + p.key + " 答え=" + a.join("") + " 赤=" + red.join(",") + " 期待=" + want + " 実際=" + id); }
            }
            if (id && claims[id] && !claims[id](m, red)) { nBad++; fail("ヒントの断定が赤いマスと合わない " + id + " " + p.key + " " + st.id + " 答え=" + a.join("")); }
            if (id) kinds4[id] = 1;
          });
          rep.totalChecked++;
        });
      }
      // 4 ビットは全問題×全ての答え．8 ビットは繰り上がりの段を全数（2^7）で標本の問題に
      ["calc", "comp", "viacomp"].forEach(function (kd) {
        var pool = [], a, b, x;
        if (kd === "calc") { for (a = 1; a < 16; a++) for (b = 1; a + b < 16; b++) pool.push(makeProblem({ kind: kd, bits: 4, a: a, b: b })); }
        else if (kd === "comp") { for (x = 1; x < 16; x++) if (x !== 8) pool.push(makeProblem({ kind: kd, bits: 4, x: x })); }
        else { for (b = 1; b < 15; b++) if (b !== 8) for (a = b + 1; a < 16; a++) pool.push(makeProblem({ kind: kd, bits: 4, a: a, b: b })); }
        pool.forEach(function (p) { oneProblem(p, true); });
      });
      var prev8 = null, ip;
      for (ip = 0; ip < 60; ip++) { prev8 = gen("calc", 8, prev8); oneProblem(prev8, true); }
      for (ip = 0; ip < 20; ip++) { prev8 = gen("viacomp", 8, prev8); oneProblem(prev8, false); }
      check(nBad === 0, "見立ての断定に違反 " + nBad + " 件");
      check(nMixed > 100 && kinds4["A-c3"] === 1 && kinds4["A-c1"] === 1 && kinds4["A-c2"] === 1, "混ざる誤答が実際に出て，A-c1・A-c2・A-c3 がそろって出る（混ざる誤答 " + nMixed + "）");
      rep.extra.hintsChecked = { answers: nAns, mixedCarry: nMixed, violations: nBad };
    })();

    /* ---- 16：解説の文（紙の語・順序）---- */
    (function () {
      var steps = TEXT.learn.steps, flat = steps.map(function (st) { return st.title + " " + st.text.join(" "); }).join("\n").replace(/<\/?b>/g, "");
      check(steps.length >= 6, "解説のステップ数");
      check(flat.indexOf(TEXT.defs[0].replace("補数：", "")) >= 0, "解説に補数の定義（紙の文）がある");
      var order = ["補数とは", "10進数の補数のイメージ", "2進数の補数の求め方", "補数を使った引き算の考え方"], pos = order.map(function (t) { return steps.map(function (st) { return st.title; }).join("\n").indexOf(t); });
      check(pos.every(function (v, i) { return v >= 0 && (i === 0 || v > pos[i - 1]); }), "解説の順：補数の定義 → 10進数のイメージ → 2進数の求め方 → 補数を使った引き算の考え方");
      check(flat.indexOf("74＋26＝100") >= 0 && flat.indexOf("74 の補数") >= 0, "10進数の補数のイメージ（74＋26＝100）");
      check(flat.indexOf("① 引く数の補数を足す → はみ出した桁を無視 → ② 10進数で確かめる") >= 0, "③ の順（① 補数を足す → はみ出した桁を無視 → ② 10進数で確かめる）");
      check(TEXT.stage.viacomp.sum.instr.indexOf("①") === 0 && TEXT.stage.viacomp.ignore.instr.indexOf("①") === 0 && decimalText(makeProblem({ kind: "viacomp", bits: 4, a: 7, b: 4 })).indexOf("② 10進数で確かめると 7−4＝3") === 0, "③ の段の文が ① → ② の順");
      check(TEXT.defs[0] === "補数：ある数に対し，足すと1桁増える最も小さな数．", "補数の定義は紙の本番版の文");
      check(TEXT.defs.length === 2 && TEXT.defs[1] === "加算は繰り上げ（桁上げ）をする．", "加算の定義文は 1 文だけ");
      check(steps.every(function (st) { return st.visual === null || ["grid", "odo"].indexOf(st.visual.type) >= 0; }), "絵の種類");
      check(steps.every(function (st) { return !st.visual || st.visual.type !== "grid" || st.visual.rows.every(function (r) { return r.d.length === st.visual.cols; }); }), "絵の桁数がそろっている");
    })();

    /* ---- 9：禁止語・用語表記 ---- */
    (function () {
      var all = staticTexts().concat(screenSamples).concat(TEXT.defs);
      var bad = checkTexts(all, TEXT.defs);
      bad.forEach(function (b) { fail("禁止語: " + b); }); rep.totalChecked += all.length;
      rep.extra.screenStringsChecked = all.length;
      check(TEXT.defs.some(function (d) { return d.indexOf("桁上げ") >= 0; }), "定義文は教科書どおりの表記");
      check(BANNED_BORROW.every(function (w) { return all.every(function (t) { return t.indexOf(w) < 0; }); }), "繰り下げ・桁借り・繰り下がり・借りが画面（定義文を含む）に1つもない");
      // 検査自体が働くこと
      check(checkTexts(["繰り下がりの行"], TEXT.defs).length === 1 && checkTexts(["借りたあとの形"], TEXT.defs).length === 1 && checkTexts(["桁借りをする"], TEXT.defs).length === 2 && checkTexts(["繰り下げ"], ["繰り下げ"]).length === 1 && checkTexts(["繰り上げ"], TEXT.defs).length === 1 && checkTexts(TEXT.defs, TEXT.defs).length === 0 && checkTexts(["負の数"], TEXT.defs).length === 1 && checkTexts(["オーバーフロー"], TEXT.defs).length === 1, "禁止語の検査が働く");
      if (docs) {
        Object.keys(docs).forEach(function (name) {
          var t = docs[name];
          BANNED_ALL.concat(BANNED_SCREEN, BANNED_BORROW, DEF_ONLY_TERMS).forEach(function (w) { check(t.indexOf(w) < 0, name + " に禁止語「" + w + "」がある"); });   // README・SPEC には定義文の 1 文も書かない（語そのものを出さない）
        });
        rep.extra.docsChecked = Object.keys(docs);
      }
      if (typeof docs === "undefined") rep.extra.docsChecked = "（SPEC・README は node から渡す）";
    })();

    setExcludePaper(saveExclude);
    return rep;
  }

  return {
    KINDS: KINDS, BITS: BITS, CLEAR_STREAK: CLEAR_STREAK, STAGE_IDS: STAGE_IDS, STORAGE_KEY: STORAGE_KEY,
    BANNED_ALL: BANNED_ALL, BANNED_SCREEN: BANNED_SCREEN, DEF_ONLY_TERMS: DEF_ONLY_TERMS, BANNED_BORROW: BANNED_BORROW, TEXT: TEXT, HINTS: HINTS, FIXTURES: FIXTURES, EXPECTED_POOLS: EXPECTED_POOLS,
    setSeed: setSeed, gen: gen, makeProblem: makeProblem, problemOfFixture: problemOfFixture, stagesOf: stagesOf, verifyOf: verifyOf, decimalText: decimalText, titleOf: titleOf,
    judgeStage: judgeStage, diagnose: diagnose, describeWrong: describeWrong, newStageState: newStageState, advance: advance, attempt: attempt,
    problemSummary: problemSummary, summaryText: summaryText, cellEdit: cellEdit, cellLabel: cellLabel,
    newRec: newRec, normalizeRec: normalizeRec, loadRec: loadRec, saveRec: saveRec, clearRec: clearRec, recStart: recStart, recAbandon: recAbandon, recFinish: recFinish,
    tickOf: tickOf, weakestStage: weakestStage, comboKey: comboKey, setExcludePaper: setExcludePaper, poolSizes: poolSizes, checkTexts: checkTexts, staticTexts: staticTexts,
    selfTest: selfTest
  };
})();
