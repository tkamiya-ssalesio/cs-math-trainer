"use strict";
/* ============ 2進数の小数 コア ============
   CS Math Trainer の 5 つ目のカテゴリ．DOM に依存しない（node の vm で評価して検査できる）．
   4 つ目のカテゴリ（binary-calc-core.js）の作りにならい，次を変えた：
   ・問題は「整数部分 I（初級は 0，中級は 1〜15）＋小数部分 k/16（k は 1〜15）」．2 つの向き（10進数→2進数／2進数→10進数）
   ・数の判定は，文字列を正規形（整数部分の先頭の 0 と，小数部分の末尾の 0 を取った文字列）に直して比べる．Number に直さない．Number の小数の計算は，判定にも表示にも使わない
   ・マスの操作は左から右だけ（答えは読む順）
   ・段は問題ごとに数が変わる（×2 の行数）．記録では「×2 の縦計算」を 1 つの段にまとめる
   画面の言い方は，第10回の紙とスライドにそろえた（小数部分・整数・整数部分・×2 の答え・位取り）．
   ============================================================ */
var BinFracCore = (function () {

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

  /* ---- 定数 ---- */
  var KINDS = ["d2b", "b2d"];                             // 10進数→2進数／2進数→10進数
  var LEVELS = [1, 2];                                    // 1＝初級（小数第4位まで），2＝中級（整数部分つき）
  var CLEAR_STREAK = { d2b: 3, b2d: 3 };
  var STORAGE_KEY = "csMathTrainer.binaryFraction.v1";
  var STAGE_IDS = { d2b: ["int", "rows", "bits"], b2d: ["place", "sum"] };   // 記録の段の名前（×2 の行は rows にまとめる．int は中級だけ）
  var AVOID = 5;                                          // 直近これだけの問題と同じものは出さない
  var MAX_NUM = 12;                                       // 数の欄の長さの上限
  var MAX_INT = 2;                                        // 整数の欄の長さの上限
  var MAX_INPUT = 64;                                     // ビット欄の 1 回の入力で読む長さの上限
  var SIXTEENTHS = 16;

  // 画面にも README にも SPEC にも出さない語（第10回の大問4・5 の語ほか．紙の大問2・3 の範囲を超える語）
  var BANNED_ALL = ["固定小数点", "浮動小数点", "丸め誤差", "桁落ち", "オーバーフロー", "アンダーフロー", "桁あふれ", "誤差", "仮数", "符号部", "指数部", "バイアス", "基数", "小数点以下", "有限小数", "無限小数", "近似", "切り捨て", "四捨五入", "すだれ", "べき乗", "指数関数"];
  // 画面にだけ出さない語
  var BANNED_SCREEN = ["負の数の補数", "マイナス", "最大値"];

  /* ---- 画面に出す文（コア側）．selfTest が禁止語を検査する．^{…} は上付き（指数）．<b>…</b> は太字 ---- */
  var TEXT = {
    kind: { d2b: "10進数→2進数", b2d: "2進数→10進数" },
    level: { 1: "初級", 2: "中級" },
    levelSub: { 1: "小数第4位まで", 2: "整数部分つき" },
    // 「ことば」（紙の言い方）
    defs: [
      "10進数の小数を2進数にする考え方：小数部分に2を掛けることをくり返し，整数部分を上から順に並べる．",
      "指数が1つ減ると，値は半分．"
    ],
    ui: {
      menuTitle: "2進数の小数",
      menuDesc: "2進数の小数と10進数の小数を，×2 の縦計算や位取りの表を使って，1段ずつ入力して変換します．時間制限はありません．",
      submenuTitle: "2進数の小数",
      actionLabel: "学習アクションの選択", levelLabel: "難易度の選択",
      levelNote: "初級は小数第4位まで，中級は整数部分つき．時間制限はありません．",
      backToMenu: "カテゴリ選択に戻る", backToSubShort: "← 戻る",
      learnTitle: "📘 解説", learnDesc: "指数が負の数から，2進数の小数の位取り，10進数と2進数の小数の変換までを，ステップごとに学びます．",
      kindDesc: { d2b: "小数部分に2を掛けることをくり返し，整数部分を上から順に並べて，2進数にします．",
                  b2d: "1 になっている位の位取りの値を表に書いて，足して10進数にします．" },
      kindLabel: "向き", levelBtnLabel: "難易度", progressLabel: "クリアの状況",
      cleared: "クリア", notYet: "まだ", tickTitle: "クリアの状況",
      reset: "記録を消す", resetAsk: "本当に消しますか．この端末の記録がすべて消えます", resetYes: "消す", resetNo: "やめる",
      streak: "連続", streakNote: "1回目で全段正解した問題の連続", stage: "段", stageEnd: "この問題はおわり",
      check: "答え合わせ", next: "次の問題へ", hintCheck: "Enter キーでも答え合わせ", hintNext: "Enter キーでも次へ",
      words: "ことば", mine: "きみの記録", lockedLabel: "確定",
      revLast: "正しい値はこれです", justCleared: "この向き・難易度はクリア！（✓）", chipOk: "1回目で正解", chipNg: "1回目は誤り", chipYet: "まだ", chipNow: "いま",
      wordsExtra: [
        "位取り：小数点の右の1桁目が 2^{-1}，2桁目が 2^{-2}，…．小数点の左の1桁目は 2^{0}，2桁目は 2^{1}，….",
        "位取りの値：2^{3}＝8，2^{2}＝4，2^{1}＝2，2^{0}＝1，2^{-1}＝0.5，2^{-2}＝0.25，2^{-3}＝0.125，2^{-4}＝0.0625．",
        "整数：×2 の答えの，小数点より左の数．次の行の小数部分は，×2 の答えから整数を取った残り．"
      ],
      mineNone: "まだ記録がありません", mineTried: "解いた問題", mineFirst: "1回目で全段正解", mineStreak: "連続",
      mineHead: ["段", "回数", "1回目の誤り", "割合"], weak: "ここがつまずきやすい", mineNote: "記録はこの端末のブラウザの中だけに残ります．",
      stageName: { int: "整数部分", rows: "×2 の縦計算", bits: "答え", place: "位取りの値", sum: "和" },
      notes: "ゆっくりでよい．式は紙に書いてもよい．"
    },
    // 作業用紙の見出し
    sheet: {
      intPart: "整数部分", answer: "答え", fracHead: "小数部分", x2Head: "×2 の答え", intHead: "整数",
      place: "位取り", binary: "2進数", decimal: "10進数", sum: "和", rowName: "行目", dash: "—"
    },
    // 解説．visual は画面側が組む絵の指定．
    //   tbl：行ごとに { label, cells }．cells の "." は小数点の列．"—" は足さない位．hl は強調するセルの番号，sep は間に置く記号
    //   x2 ：×2 の縦計算（rows は [小数部分, ×2 の答え, 整数]）．hl は強調する列
    //   x2h：×2 の縦計算を横に（0.1 の 6 行）
    learn: {
      title: "2進数の小数の解説", prev: "前へ", next: "次へ", done: "完了", close: "メニューに戻る",
      cols: { frac: "小数部分", x2: "×2 の答え", int: "整数" },
      steps: [
        { title: "指数が1つ減ると，値は半分",
          text: ["2^{3}＝8，2^{2}＝4，2^{1}＝2，2^{0}＝1．",
                 "指数が1つ減るごとに，値は<b>半分</b>になる（÷2）．2^{1}＝2 から1つ減ると，半分の 1．これが 2^{0}＝1．"],
          visual: { type: "tbl", sep: "÷2", rows: [
            { label: "2の累乗", cells: ["2^{3}", "2^{2}", "2^{1}", "2^{0}"] },
            { label: "値", cells: ["8", "4", "2", "1"] } ] } },
        { title: "指数が負の数",
          text: ["同じ規則が，指数が 0 より小さい数（負の数）になっても続く．",
                 "2^{-1}＝0.5，2^{-2}＝0.25，2^{-3}＝0.125，2^{-4}＝0.0625．"],
          visual: { type: "tbl", rows: [
            { label: "2の累乗", cells: ["2^{3}", "2^{2}", "2^{1}", "2^{0}", "2^{-1}", "2^{-2}", "2^{-3}", "2^{-4}"] },
            { label: "値", cells: ["8", "4", "2", "1", "0.5", "0.25", "0.125", "0.0625"], hl: [4, 5, 6, 7] } ] } },
        { title: "2進数の小数の位取り",
          text: ["小数点の右の1桁目が 2^{-1}，2桁目が 2^{-2}，…の位．",
                 "整数の位（…，8，4，2，1）も右へ1つ進むごとに半分で，小数点の右でも同じ規則が続く．"],
          visual: { type: "tbl", rows: [
            { label: "位取り", cells: ["2^{3}", "2^{2}", "2^{1}", "2^{0}", ".", "2^{-1}", "2^{-2}", "2^{-3}", "2^{-4}"] },
            { label: "10進数", cells: ["8", "4", "2", "1", ".", "0.5", "0.25", "0.125", "0.0625"] } ] } },
        { title: "2進数→10進数（例1）",
          text: ["<b>1 になっている位の値を足す．</b>",
                 "0.111^{(2)} ＝ 0.5＋0.25＋0.125 ＝ 0.875"],
          visual: { type: "tbl", rows: [
            { label: "位取り", cells: ["2^{-1}", "2^{-2}", "2^{-3}"] },
            { label: "0.111^{(2)}", cells: ["1", "1", "1"] },
            { label: "足す値", cells: ["0.5", "0.25", "0.125"], hl: [0, 1, 2] } ] } },
        { title: "2進数→10進数（例2）",
          text: ["0 の位の値は足さない．",
                 "0.0101^{(2)} ＝ 0.25＋0.0625 ＝ 0.3125"],
          visual: { type: "tbl", rows: [
            { label: "位取り", cells: ["2^{-1}", "2^{-2}", "2^{-3}", "2^{-4}"] },
            { label: "0.0101^{(2)}", cells: ["0", "1", "0", "1"] },
            { label: "足す値", cells: ["—", "0.25", "—", "0.0625"], hl: [1, 3] } ] } },
        { title: "整数部分があるとき",
          text: ["小数点の左の位（…，4，2，1）の値も足す．",
                 "100.11^{(2)} ＝ 4＋0.5＋0.25 ＝ 4.75"],
          visual: { type: "tbl", rows: [
            { label: "位取り", cells: ["2^{2}", "2^{1}", "2^{0}", ".", "2^{-1}", "2^{-2}"] },
            { label: "100.11^{(2)}", cells: ["1", "0", "0", ".", "1", "1"] },
            { label: "足す値", cells: ["4", "—", "—", ".", "0.5", "0.25"], hl: [0, 4, 5] } ] } },
        { title: "10進数→2進数の考え方",
          text: ["<b>小数部分に2を掛けることをくり返し，整数部分を上から順に並べる．</b>",
                 "×2 の答えから整数を取った残りが，次の行の小数部分になる．0.625 の例："],
          visual: { type: "x2", rows: [["0.625", "1.25", "1"], ["0.25", "0.5", "0"], ["0.5", "1.0", "1"]] } },
        { title: "例：0.625",
          text: ["整数部分を上から順に並べる．",
                 "0.625 ＝ <b>0.101</b>^{(2)}．確かめ：0.101^{(2)} ＝ 0.5＋0.125 ＝ 0.625"],
          visual: { type: "x2", hl: "int", rows: [["0.625", "1.25", "1"], ["0.25", "0.5", "0"], ["0.5", "1.0", "1"]] } },
        { title: "整数部分があるとき（10進数→2進数）",
          text: ["4.75 の整数部分 4 は，2進数で 100．",
                 "小数部分 0.75 は，2を掛けることをくり返して 0.11．",
                 "合わせて 4.75 ＝ <b>100.11</b>^{(2)}"],
          visual: { type: "x2", hl: "int", rows: [["0.75", "1.5", "1"], ["0.5", "1.0", "1"]] } },
        { title: "終わらない小数",
          text: ["0.1 に2を掛けることをくり返すと，小数部分に 0.2 が2回出る．ここから先は，同じ数がくり返される．",
                 "0.1 ＝ 0.00011001100…^{(2)}．同じ並びがくり返して終わらない小数になる（練習には出ない）．"],
          visual: { type: "x2h", rows: [["0.1", "0.2", "0"], ["0.2", "0.4", "0"], ["0.4", "0.8", "0"], ["0.8", "1.6", "1"], ["0.6", "1.2", "1"], ["0.2", "0.4", "0"]], hl: [1, 5] } }
      ]
    },
    msg: {
      ok1: "正解",
      ok2: "正解（2回目）",
      retry: "おしい．もう1回やってみよう",
      rev: "正しい値はこれです．次へ進もう",
      reject: "0 か 1 を入れよう",
      rejectNum: "数字と「.」だけ入れよう",
      rejectInt: "数字だけ入れよう",
      selftestNote: "自己検査中：記録は保存されません",
      overflow: "入りきらない分は捨てました",
      fixRed: "赤いマスだけ直そう",
      noPaste: "貼り付けはできません",
      allFirst: "全段 1回目で正解",
      storageOff: "この端末では記録を残せません",
      endRows: "小数部分が 0 になったので，ここで終わり．整数を上から順に並べよう"
    }
  };
  function msgStumbled(names) { return "つまずいた段：" + names.join("・"); }

  // 誤りの見立て（SPEC §3.4）
  var HINTS = {
    "X-1": "2 を掛けていない．小数部分に 2 を掛けた答えを書く",
    "X-2": "×2 の答えには，整数部分も残して書く．整数を取るのは，次の行の小数部分を作るとき",
    "X-3": "整数だけになっている．×2 の答えは，小数部分も書く",
    "X-4": "小数部分に 2 を掛ける計算を，もう一度やり直そう",
    "I-1": "×2 の答えが 1 以上のとき，整数は 1",
    "I-2": "×2 の答えが 1 より小さいとき，整数は 0",
    "I-3": "整数は，×2 の答えの小数点より左の数",
    "B-1": "整数を上から順に並べる．下から並べていませんか",
    "B-2": "各行の「整数」を，上から順に見直そう",
    "N-1": "左の桁ほど大きい位．いちばん右が 1 の位",
    "N-2": "整数部分を 8・4・2・1 の和で作ろう．使う位が 1，使わない位が 0",
    "P-a": "赤いマスには，1 や 0 ではなく，その位の値を書く",
    "P-b": "赤いマスは，隣の位の値になっている．右へ1つ進むごとに，値は半分",
    "P-c": "赤いマスを見直そう．指数が1つ減ると，値は半分",
    "S-1": "0 の位の値は足さない．1 になっている位だけ足す",
    "S-2": "整数部分の位の値も足そう",
    "S-3": "小数部分の位の値も足そう",
    "S-5": "10進数で書こう．2進数の数字のままになっている",
    "S-4": "表に書いた値を，全部足しなおそう．小数点の位置をそろえて足し算する"
  };

  /* ---- 数の表し方（整数だけで作る．Number の小数の計算は使わない） ----
     N は 16 分の 1 を単位にした整数（値＝N/16）．10 進の文字列は，N の余りに 625 を掛けた 4 桁の整数から作る */
  function fmt16(N, forceDot) {
    var ip = Math.floor(N / SIXTEENTHS), r = N % SIXTEENTHS, s;
    if (r === 0) return forceDot ? ip + ".0" : String(ip);
    s = String(r * 625); while (s.length < 4) s = "0" + s;
    s = s.replace(/0+$/, "");
    return ip + "." + s;
  }
  function binStr(v) { return v.toString(2); }                                  // 整数 v の 2 進数（上の桁の 0 は付けない）
  function fracBits(k) { var s = binStr(k); while (s.length < 4) s = "0" + s; return s.replace(/0+$/, ""); }   // k/16 の小数部分の 2 進数（末尾の 0 は付けない）

  /* ---- 数の比べ方：文字列を正規形（整数部分の先頭の 0 と，小数部分の末尾の 0 を取った文字列）に直して比べる ----
     Number に直さない．「1.0」「1」「1.00」「01.0」は同じ "1"，「.5」「0.50」「0.5」は同じ "0.5" */
  function qEq(a, b) { return a !== null && b !== null && a === b; }
  function normText(raw) {                                   // 全角→半角（NFKC），日本語入力の「。」は小数点，前後の空白は取る
    var t = String(raw == null ? "" : raw).slice(0, MAX_INPUT);
    try { t = t.normalize("NFKC"); } catch (e) { }
    t = t.replace(/。/g, ".");
    return t.replace(/^\s+|\s+$/g, "");
  }
  function canonInt(ip) { var t = ip.replace(/^0+/, ""); return t === "" ? "0" : t; }
  function parseDec(raw) {                                   // 数の文字列→正規形．書き方が不正なら null
    var t = normText(raw), m, ip, fp;
    if (t.length === 0 || t.length > MAX_NUM) return null;
    m = /^([0-9]*)\.?([0-9]*)$/.exec(t);
    if (!m) return null;
    ip = m[1]; fp = m[2].replace(/0+$/, "");
    if (m[1].length + m[2].length === 0) return null;        // 「.」だけ
    ip = canonInt(ip);
    return fp === "" ? ip : ip + "." + fp;
  }
  function parseIntText(raw) {                               // 整数の文字列→正規形．数字以外があれば null
    var t = normText(raw);
    if (t.length === 0 || t.length > MAX_INT || !/^[0-9]+$/.test(t)) return null;
    return canonInt(t);
  }
  function sanitizeNum(raw) {                                // 数の欄に入れてよい文字だけ残す．{ value, rejected }
    var s = String(raw == null ? "" : raw).slice(0, MAX_INPUT), t, out = "", i, ch, dot = false, rejected = false;
    try { t = s.normalize("NFKC"); } catch (e) { t = s; }
    t = t.replace(/。/g, ".");
    for (i = 0; i < t.length; i++) {
      ch = t.charAt(i);
      if (ch >= "0" && ch <= "9") out += ch;
      else if (ch === "." && !dot) { out += ch; dot = true; }
      else if (/\s/.test(ch)) { /* 空白は飛ばす（警告は出さない） */ }
      else rejected = true;
    }
    if (out.length > MAX_NUM) { out = out.slice(0, MAX_NUM); rejected = true; }
    return { value: out, rejected: rejected };
  }
  function sanitizeInt(raw) {
    var s = String(raw == null ? "" : raw).slice(0, MAX_INPUT), t, out = "", i, ch, rejected = false;
    try { t = s.normalize("NFKC"); } catch (e) { t = s; }
    for (i = 0; i < t.length; i++) {
      ch = t.charAt(i);
      if (ch >= "0" && ch <= "9") out += ch;
      else if (/\s/.test(ch)) { /* 空白は飛ばす */ }
      else rejected = true;
    }
    if (out.length > MAX_INT) { out = out.slice(0, MAX_INT); rejected = true; }
    return { value: out, rejected: rejected };
  }

  /* ---- 上付きの指数（画面の読み上げ・文字だけの場所用） ---- */
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function supText(exp) { var s = String(exp), out = "", i; for (i = 0; i < s.length; i++) out += SUP[s.charAt(i)] || s.charAt(i); return "2" + out; }

  /* ---- 問題 ---- */
  function keyOf(p) { return p.kind + "|" + p.lv + "|" + p.I + "|" + p.k; }
  function makeProblem(s) {
    var p = { kind: s.kind, lv: s.lv, I: s.I | 0, k: s.k | 0 };
    p.N = p.I * SIXTEENTHS + p.k;
    p.ib = p.I > 0 ? binStr(p.I) : "";                       // 整数部分の 2 進数（初級は空）
    p.fb = fracBits(p.k);                                    // 小数部分の 2 進数
    p.key = keyOf(p);
    return p;
  }
  function gen(kind, lv, recent) {                           // 一様に選ぶ．直近 AVOID 問と同じものは引き直す
    var avoid = recent ? recent.slice(-AVOID) : [], p, tries = 0;
    do {
      p = makeProblem({ kind: kind, lv: lv, I: lv === 2 ? randInt(1, 15) : 0, k: randInt(1, 15) });
      tries++;
    } while (avoid.indexOf(p.key) >= 0 && tries < 500);
    return p;
  }

  // 位取りの表の桁（2進数→10進数の表．上の桁の 0 は出さない）．placeN は 16 分の 1 を単位にした値
  function columnsOf(p) {
    var cols = [], i, m, j;
    for (i = 0; i < p.ib.length; i++) {
      m = p.ib.length - 1 - i;
      cols.push({ part: "int", exp: m, bit: p.ib.charAt(i), placeN: SIXTEENTHS << m });
    }
    for (j = 1; j <= p.fb.length; j++) cols.push({ part: "frac", exp: -j, bit: p.fb.charAt(j - 1), placeN: SIXTEENTHS >> j });
    cols.forEach(function (c) { c.val = fmt16(c.placeN); c.name = supText(c.exp); });
    return cols;
  }
  function titleOf(p) {
    if (p.kind === "d2b") return fmt16(p.N);
    return (p.lv === 2 ? p.ib : "0") + "." + p.fb + "(2)";
  }
  function confirmText(p) {                                  // 確かめ：0.101(2) ＝ 0.5＋0.125 ＝ 0.625
    var vals = columnsOf(p).filter(function (c) { return c.bit === "1"; }).map(function (c) { return c.val; });
    return "確かめ：" + (p.lv === 2 ? p.ib : "0") + "." + p.fb + "(2) ＝ " + vals.join("＋") + " ＝ " + fmt16(p.N);
  }
  function expressionOf(p) {                                 // 和の行の式（足す値＝）
    var vals = columnsOf(p).filter(function (c) { return c.bit === "1"; }).map(function (c) { return c.val; });
    return vals.join("＋") + "＝";
  }

  /* ---- 段と模範の値 ----
     stage = { id（記録の段の名前），key（問題の中での名前），name（チップの名前），instr，type（bits／x2／place／sum），fields: [{ kind（bit／dec／int），model，name }], … }
     bits：ビット欄の行（model は 1 文字ずつ）．x2：「×2 の答え」と「整数」．place：1 になっている位の数の欄．sum：和の欄 */
  function fld(kind, model, name, extra) { var f = { kind: kind, model: model, name: name }, k; if (extra) for (k in extra) f[k] = extra[k]; return f; }
  function bitFields(str, prefix) {
    return str.split("").map(function (c, i) { return fld("bit", c, "左から" + (i + 1) + "マス目"); });
  }
  function stagesOf(p) {
    var out = [], c, r, x2, ig, row = 0, ints = "", st;
    if (p.kind === "d2b") {
      if (p.lv === 2) {
        out.push({ id: "int", key: "int", name: "整数部分", type: "bits", isInt: true, instr: "整数部分 " + p.I + " を2進数にしよう．左の桁ほど大きい位", fields: bitFields(p.ib) });
      }
      c = p.k;                                               // 小数部分（16 分の 1 が単位）
      while (c > 0) {
        row++;
        x2 = c * 2; ig = x2 >= SIXTEENTHS ? 1 : 0;
        r = x2 - SIXTEENTHS * ig;                            // 整数を取った残り
        ints += String(ig);
        st = { id: "rows", key: "row" + row, name: row + "行目", type: "x2", row: row, c: c, nextC: r, last: r === 0,
               frac: fmt16(c), nextFrac: null, ig: ig,
               instr: "小数部分 " + fmt16(c) + " に 2 を掛けて，「×2 の答え」と「整数」を書こう",
               fields: [fld("dec", fmt16(x2, true), "×2 の答え"), fld("int", String(ig), "整数")] };
        st.nextFrac = r === 0 ? null : fmt16(r);
        st.q = { frac: parseDec(fmt16(c)), rest: ig === 1 ? parseDec(fmt16(x2 - SIXTEENTHS)) : null, intq: parseDec(String(ig)) };
        out.push(st);
        c = r;
      }
      out.push({ id: "bits", key: "bits", name: "答え", type: "bits", instr: "整数を上から順に並べて，答えを書こう", fields: bitFields(ints) });
    } else {
      var cols = columnsOf(p), placeFields = [];
      cols.forEach(function (col, ci) { if (col.bit === "1") placeFields.push(fld("dec", col.val, col.name, { col: ci })); });
      out.push({ id: "place", key: "place", name: "位取りの値", type: "place", cols: cols, instr: "1 になっている位に，位取りの値を書こう．0 の位は書かない", fields: placeFields });
      out.push({ id: "sum", key: "sum", name: "和", type: "sum", cols: cols, instr: "表に書いた値を足して，10進数にしよう", fields: [fld("dec", fmt16(p.N), "和")] });
    }
    return out;
  }
  function modelAnswerText(st) {                             // 画面読み上げ・検査用：段の模範の値を 1 本の文字列に
    return st.fields.map(function (f) { return f.model; }).join(" ");
  }

  /* ---- 判定 ---- */
  function fieldState(f, raw) {                              // "empty"｜"ok"｜"wrong"
    var t = normText(raw), q, v;
    if (t === "") return "empty";
    if (f.kind === "bit") return t === f.model ? "ok" : "wrong";
    if (f.kind === "int") { v = parseIntText(t); return v !== null && v === String(f.model) ? "ok" : "wrong"; }
    q = parseDec(t);
    return qEq(q, parseDec(f.model)) ? "ok" : "wrong";
  }
  function reverseStr(s) { return s.split("").reverse().join(""); }
  function diagnose(p, st, vals, wrong) {
    var t = st.type, i, q, ans, model, v;
    function H(id) { return { id: id, text: HINTS[id] }; }
    if (!wrong.length) return null;
    if (t === "x2") {
      if (wrong.indexOf(0) >= 0) {
        q = parseDec(vals[0]);
        if (q) {
          if (qEq(q, st.q.frac)) return H("X-1");
          if (st.ig === 1 && qEq(q, st.q.rest)) return H("X-2");
          if (qEq(q, st.q.intq)) return H("X-3");
        }
        return H("X-4");
      }
      v = parseIntText(vals[1]);
      if (st.ig === 1 && v === "0") return H("I-1");
      if (st.ig === 0 && v === "1") return H("I-2");
      return H("I-3");
    }
    if (t === "bits") {
      ans = vals.map(normText).join(""); model = st.fields.map(function (f) { return f.model; }).join("");
      if (ans.length > 1 && reverseStr(model) !== model && ans === reverseStr(model)) return H(st.isInt ? "N-1" : "B-1");
      return H(st.isInt ? "N-2" : "B-2");
    }
    if (t === "place") {
      var allZeroOne = true, allNeighbor = true;
      wrong.forEach(function (wi) {
        var f = st.fields[wi], qq = parseDec(vals[wi]), left = st.cols[f.col - 1], right = st.cols[f.col + 1], nb = false;
        if (!(qq && (qEq(qq, parseDec("0")) || qEq(qq, parseDec("1"))))) allZeroOne = false;
        if (left && qEq(qq, parseDec(left.val))) nb = true;
        if (right && qEq(qq, parseDec(right.val))) nb = true;
        if (!nb) allNeighbor = false;
      });
      if (allZeroOne) return H("P-a");
      if (allNeighbor) return H("P-b");
      return H("P-c");
    }
    if (t === "sum") {
      q = parseDec(vals[0]);
      if (q) {
        var tot = 0, fr = 0, it = 0;
        st.cols.forEach(function (c) { tot += c.placeN; if (c.part === "int") { if (c.bit === "1") it += c.placeN; } else if (c.bit === "1") fr += c.placeN; });
        if (st.cols.some(function (c) { return c.bit === "0"; }) && qEq(q, parseDec(fmt16(tot)))) return H("S-1");
        if (p.lv === 2 && qEq(q, parseDec(fmt16(fr)))) return H("S-2");
        if (p.lv === 2 && qEq(q, parseDec(fmt16(it)))) return H("S-3");
        if (qEq(q, parseDec((p.lv === 2 ? p.ib : "0") + "." + p.fb))) return H("S-5");
      }
      return H("S-4");
    }
    return null;
  }
  // vals: 欄ごとの文字列（空は ""）
  function judgeStage(p, st, vals) {
    var empty = [], wrong = [], i, s;
    for (i = 0; i < st.fields.length; i++) {
      s = fieldState(st.fields[i], vals[i]);
      if (s === "empty") empty.push(i); else if (s === "wrong") wrong.push(i);
    }
    return { empty: empty, wrong: wrong, ok: empty.length === 0 && wrong.length === 0, diag: (empty.length === 0 && wrong.length) ? diagnose(p, st, vals, wrong) : null };
  }
  function msgEmpty(st, empty) {
    var k = empty.length;
    if (st.type === "bits") return "あと" + k + "マス入れよう";
    if (st.type === "x2") return empty.length === 2 ? "「×2 の答え」と「整数」を入れよう" : "「" + st.fields[empty[0]].name + "」も入れよう";
    if (st.type === "place") return "あと" + k + "か所入れよう";
    return "和を入れよう";
  }
  function describeWrong(st, wrong) {
    var names;
    if (st.type === "bits") {
      names = wrong.map(function (i) { return (i + 1) + "マス目"; });
      if (names.length >= 4) return names.length + "か所ちがいます";
      return "左から" + names.join("と") + "がちがいます";
    }
    if (st.type === "place") {
      if (wrong.length >= 4) return wrong.length + "か所ちがいます";
      return wrong.map(function (i) { return st.fields[i].name; }).join("と") + " の位がちがいます";
    }
    return wrong.map(function (i) { return "「" + st.fields[i].name + "」"; }).join("と") + "がちがいます";
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
    var j = judgeStage(p, st, vals), o = { st: s, counted: false, empty: j.empty, ok: false, wrong: j.wrong, hint: null, head: "", detail: "", reveal: false, final: false, result: null };
    if (j.empty.length > 0) { o.head = msgEmpty(st, j.empty); return o; }      // 空の欄は試行に数えない
    o.st = advance(s, j.ok); o.counted = true; o.ok = j.ok;
    if (j.ok) {
      o.head = o.st.result === "ok1" ? TEXT.msg.ok1 : TEXT.msg.ok2; o.final = true; o.result = o.st.result;
      if (st.last) o.detail = TEXT.msg.endRows;
      return o;
    }
    o.detail = describeWrong(st, j.wrong);
    o.hint = j.diag ? j.diag.text : null;
    if (o.st.result === "rev") { o.head = TEXT.msg.rev; o.reveal = true; o.final = true; o.result = "rev"; if (st.last) o.detail += "．" + TEXT.msg.endRows; }
    else { o.head = TEXT.msg.retry; o.detail += "．" + TEXT.msg.fixRed; }
    return o;
  }
  // 記録の段の名前にまとめる（×2 の行は rows に．1 行でも rev なら rev，ok1 でなければ ok2）
  function collapse(stages, results) {
    var ids = [], res = {}, order = { ok1: 0, ok2: 1, rev: 2 };
    stages.forEach(function (st, i) {
      var r = results[i];
      if (!Object.prototype.hasOwnProperty.call(res, st.id)) { ids.push(st.id); res[st.id] = r; }
      else if (order[r] > order[res[st.id]]) res[st.id] = r;
    });
    return { ids: ids, results: ids.map(function (id) { return res[id]; }) };
  }
  function problemSummary(ids, results) {
    var bad = [], i;
    for (i = 0; i < results.length; i++) if (results[i] !== "ok1") bad.push(ids[i]);
    return { perfect: bad.length === 0, stumbled: bad };
  }
  function summaryText(summary) {
    if (summary.perfect) return TEXT.msg.allFirst;
    return msgStumbled(summary.stumbled.map(function (id) { return TEXT.ui.stageName[id]; }));
  }

  /* ---- マスの操作（純粋関数）．row = { cells:[…], focus:i }．cells[0] が左端．マスは 1 ビット（0 か 1）だけ ----
     左から右だけ（答えは読む順）．1 文字入れたら右へ進む（右端では進まず上書き）．
     2 文字以上が一度に来たとき（IME の確定・insertText）：
       ① まとめて来た 0・1 の数が行のマス数以上 → 常に左端から（行全体が置き換わる）
       ② マス数未満で，フォーカスのマス以降に空きがある → フォーカスのマスから（4 桁ずつ 2 回に分けて確定しても続けて入る）
       ③ それ以外 → 左端から
     配ったあとのフォーカスは，配ったすぐ右のマス（全部埋まったら右端） */
  function normStr(s) { var t = String(s == null ? "" : s).slice(0, MAX_INPUT); try { t = t.normalize("NFKC"); } catch (e) { } return t.slice(0, MAX_INPUT); }
  function cellEdit(row, ev) {
    var cells = row.cells.slice(), len = cells.length, f = Math.max(0, Math.min(len - 1, row.focus | 0));
    var r = { cells: cells, focus: f, msg: "", note: "", submit: false, rejected: false }, t, m, e, i, start;
    function clamp(i) { return Math.max(0, Math.min(len - 1, i)); }
    function reject(msg) { r.rejected = true; r.msg = msg; }
    if (ev.type === "focus") { f = clamp(ev.index | 0); }
    else if (ev.type === "paste") { reject(TEXT.msg.noPaste); }
    else if (ev.type === "input") {
      t = normStr(ev.value);
      m = t.replace(/[^01]/g, "");
      if (t === "") { /* 空の入力は何もしない */ }
      else if (m === "") reject(TEXT.msg.reject);
      else if (m.length === 1) {
        cells[f] = m;
        if (f < len - 1) f++;
      }
      else {
        start = 0;
        if (m.length < len) for (i = f; i < len; i++) if (cells[i] === "") { start = f; break; }
        for (i = 0; i < m.length && start + i < len; i++) cells[start + i] = m.charAt(i);
        if (start + m.length > len) r.note = TEXT.msg.overflow;
        f = Math.min(start + m.length, len - 1);
      }
    }
    else if (ev.type === "key") {
      e = ev.key;
      if (e === "Backspace") {
        if (cells[f] !== "") cells[f] = "";
        else if (f > 0) { f--; cells[f] = ""; }
      }
      else if (e === "Delete") { cells[f] = ""; }
      else if (e === "ArrowLeft") { f = clamp(f - 1); }
      else if (e === "ArrowRight") { f = clamp(f + 1); }
      else if (e === "Home") { f = 0; }
      else if (e === "End") { f = len - 1; }
      else if (e === "Enter") { r.submit = true; }
    }
    r.focus = f;
    return r;
  }
  // 空きを残した答え合わせが断られたあとのフォーカス（先頭の空き）．vals は欄ごとの文字列
  function firstEmpty(vals) {
    var i;
    for (i = 0; i < vals.length; i++) if (normText(vals[i]) === "") return i;
    return Math.max(0, vals.length - 1);
  }
  function cellLabel(rowName, name, value) { return rowName + " " + name + " " + (value === "" ? "未入力" : value); }

  /* ---- 記録（localStorage．SPEC §6） ---- */
  function comboKey(kind, lv) { return kind + lv; }
  function newCombo(kind) {
    var c = { tried: 0, perfect: 0, streak: 0, cleared: false, pending: false, stage: {} };
    STAGE_IDS[kind].forEach(function (id) { c.stage[id] = { n: 0, miss1: 0, rev: 0 }; });
    return c;
  }
  function newRec() {
    var rec = { v: 1, sel: { kind: "d2b", lv: 1 }, rec: {} };
    KINDS.forEach(function (k) { LEVELS.forEach(function (l) { rec.rec[comboKey(k, l)] = newCombo(k); }); });
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
      KINDS.forEach(function (k) { LEVELS.forEach(function (l) {
        var key = comboKey(k, l), src = raw.rec[key], c = rec.rec[key];
        if (!isObj(src)) return;
        c.tried = clampInt(src.tried); c.perfect = Math.min(clampInt(src.perfect), c.tried); c.streak = Math.min(clampInt(src.streak), CLEAR_STREAK[k]);   // 巨大な値は ✓ に要る本数で丸める
        c.cleared = src.cleared === true;
        c.pending = false;
        if (src.pending === true) c.streak = 0;                        // 解き終わらずに離れた
        if (isObj(src.stage)) {
          STAGE_IDS[k].forEach(function (id) {
            var s = src.stage[id]; if (!isObj(s)) return;
            var sn = Math.min(clampInt(s.n), c.tried);                    // 段の回数は，解いた問題の数を超えない
            c.stage[id] = { n: sn, miss1: Math.min(clampInt(s.miss1), sn), rev: Math.min(clampInt(s.rev), sn) };   // 誤りの数は回数を超えない
          });
        }
      }); });
    }
    return rec;
  }
  function loadRec(storage) {                                          // { rec, usable }
    var s;
    try { s = storage.getItem(STORAGE_KEY); } catch (e) { return { rec: newRec(), usable: false }; }
    if (s == null) return { rec: newRec(), usable: true };
    try { return { rec: normalizeRec(JSON.parse(s)), usable: true }; } catch (e2) { return { rec: newRec(), usable: true }; }
  }
  function saveRec(storage, rec) { try { storage.setItem(STORAGE_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; } }
  function clearRec(storage) { try { storage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; } }
  function recStart(rec, kind, lv) { rec.rec[comboKey(kind, lv)].pending = true; return rec; }
  function recAbandon(rec, kind, lv) { var c = rec.rec[comboKey(kind, lv)]; if (c.pending) { c.streak = 0; c.pending = false; } return rec; }
  function recFinish(rec, kind, lv, stages, results) {                 // stages＝問題の段，results＝段ごとの結果
    var c = rec.rec[comboKey(kind, lv)], col = collapse(stages, results), sum = problemSummary(col.ids, col.results), i, s;
    c.pending = false; c.tried++;
    if (sum.perfect) { c.perfect++; c.streak++; if (c.streak >= CLEAR_STREAK[kind]) c.cleared = true; }
    else c.streak = 0;
    for (i = 0; i < col.ids.length; i++) {
      s = c.stage[col.ids[i]]; s.n++;
      if (col.results[i] !== "ok1") s.miss1++;
      if (col.results[i] === "rev") s.rev++;
    }
    return rec;
  }
  function tickOf(rec, kind, lv) { return rec.rec[comboKey(kind, lv)].cleared === true; }
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

  /* ---- 画面に出る文字列の一覧（禁止語の検査用） ---- */
  function plain(s) { return s.replace(/<\/?b>/g, "").replace(/\^\{([^}]*)\}/g, "$1"); }
  function staticTexts() {
    var out = [];
    (function walk(v) {
      if (typeof v === "string") out.push(plain(v));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(TEXT);
    out.push.apply(out, Object.keys(HINTS).map(function (x) { return HINTS[x]; }));
    out.push(msgStumbled(["a", "b"]));
    return out;
  }
  function checkTexts(list) {                                          // 禁止語の違反を返す
    var bad = [];
    list.forEach(function (t) {
      BANNED_ALL.concat(BANNED_SCREEN).forEach(function (w) { if (t.indexOf(w) >= 0) bad.push("禁止語「" + w + "」: " + t); });
    });
    return bad;
  }

  /*@@TEST@@*/
  /* ============ 自己検査 ============
     模範の値・判定・ヒントの主張は，コアとは別の実装（BigInt の整数だけ．10 進展開は 10 倍して割る方法，位取りの値は 5 のべき乗）で検算する． */
  function selfTest(nPer, seed, docs, sources) {
    if (seed !== undefined) setSeed(seed);
    nPer = nPer || 3000;
    var rep = { n: nPer, seed: seed, combos: {}, totalChecked: 0, totalFail: 0, failures: [], pools: {}, extra: {} };
    function fail(msg) { rep.totalFail++; if (rep.failures.length < 40) rep.failures.push(msg); }
    function check(cond, msg) { rep.totalChecked++; if (!cond) fail(msg); }
    var B = BigInt, B0 = B(0), B1 = B(1), B2 = B(2), B10 = B(10), B16 = B(16);

    /* ---- 別実装（オラクル） ---- */
    function decOf16(num) {                                    // 16 分の 1 が単位の整数 → 10 進の文字列（10 倍して 16 で割る，筆算の方法）
      var ip = num / B16, r = num % B16, digits = "";
      while (r > B0) { r = r * B10; digits += (r / B16).toString(); r = r % B16; }
      return digits ? ip.toString() + "." + digits : ip.toString();
    }
    function orVal(str) {                                      // 数の欄の文字列 → 10^12 倍した整数（書き方が不正なら null）
      var t, parts, ip, fp;
      try { t = String(str).normalize("NFKC"); } catch (e) { t = String(str); }
      t = t.replace(/。/g, ".").trim();
      if (t.length === 0 || t.length > 12) return null;
      parts = t.split("."); if (parts.length > 2) return null;
      ip = parts[0]; fp = parts.length === 2 ? parts[1] : "";
      if (!/^[0-9]*$/.test(ip) || !/^[0-9]*$/.test(fp)) return null;
      if (ip.length + fp.length === 0) return null;
      while (fp.length < 12) fp += "0";
      return B(ip === "" ? "0" : ip) * B("1000000000000") + B(fp);
    }
    function orInt(str) {
      var t; try { t = String(str).normalize("NFKC"); } catch (e) { t = String(str); }
      t = t.trim();
      return /^[0-9]{1,2}$/.test(t) ? B(t) : null;
    }
    function orEmpty(str) { var t; try { t = String(str).normalize("NFKC"); } catch (e) { t = String(str); } return t.replace(/。/g, ".").trim() === ""; }
    function orChain(k) {                                      // ×2 の縦計算（BigInt）
      var c = B(k), rows = [], ints = "", x2, ig;
      while (c > B0) { x2 = c * B2; ig = x2 >= B16 ? B1 : B0; rows.push({ frac: c, x2: x2, ig: ig }); ints += ig.toString(); c = x2 - ig * B16; }
      return { rows: rows, ints: ints };
    }
    function orIntBits(I) { var v = B(I), s = ""; while (v > B0) { s = (v % B2).toString() + s; v = v / B2; } return s; }
    function orPlaceText(part, exp) {                          // 位取りの値の文字列：2^m は 1 を左へずらす，2^-j は 5^j を j 桁に置く
      var five, s;
      if (part === "int") return (B1 << B(exp)).toString();
      five = B(5) ** B(-exp); s = five.toString(); while (s.length < -exp) s = "0" + s;
      return "0." + s;
    }
    function orSumText(I, k) {                                 // 位取りの値を 10^4 倍して足す
      var bitsI = orIntBits(I), bitsF = orChain(k).ints, tot = B0, i, j, ip, fp;
      for (i = 0; i < bitsI.length; i++) if (bitsI.charAt(i) === "1") tot += (B1 << B(bitsI.length - 1 - i)) * B("10000");
      for (j = 1; j <= bitsF.length; j++) if (bitsF.charAt(j - 1) === "1") tot += (B(5) ** B(j)) * (B10 ** B(4 - j));
      ip = (tot / B("10000")).toString(); fp = (tot % B("10000")).toString(); while (fp.length < 4) fp = "0" + fp;
      fp = fp.replace(/0+$/, "");
      return fp ? ip + "." + fp : ip;
    }
    function tzOf(k) { var t = 0; while (k % 2 === 0) { k /= 2; t++; } return t; }

    var allProblems = [];
    [1, 2].forEach(function (lv) {
      var I, k;
      for (I = (lv === 2 ? 1 : 0); I <= (lv === 2 ? 15 : 0); I++) for (k = 1; k <= 15; k++) allProblems.push({ lv: lv, I: I, k: k });
    });
    rep.pools = { lv1: allProblems.filter(function (x) { return x.lv === 1; }).length, lv2: allProblems.filter(function (x) { return x.lv === 2; }).length };
    check(rep.pools.lv1 === 15 && rep.pools.lv2 === 225, "問題の集合は 15 通りと 225 通り");

    /* ---- 1. 模範の値（別実装との全数照合）と往復 ---- */
    (function () {
      var n = 0;
      allProblems.forEach(function (q) {
        ["d2b", "b2d"].forEach(function (kind) {
          var p = makeProblem({ kind: kind, lv: q.lv, I: q.I, k: q.k }), sts = stagesOf(p), ch = orChain(q.k), ib = q.I > 0 ? orIntBits(q.I) : "", tot = B(q.I * 16 + q.k), tag = kind + q.lv + " I=" + q.I + " k=" + q.k, i, rows;
          n++;
          check(p.N === q.I * 16 + q.k && p.ib === ib && p.fb === ch.ints, "問題の 2 進数 " + tag + " " + p.ib + "." + p.fb + " / " + ib + "." + ch.ints);
          check(titleOf(p) === (kind === "d2b" ? decOf16(tot) : (q.lv === 2 ? ib : "0") + "." + ch.ints + "(2)"), "題 " + tag + " " + titleOf(p));
          // 往復：2 進数の数字を 2 のべきで足し戻すと元の数になる（別実装）
          (function () {
            var s = B0, a;
            for (a = 0; a < ib.length; a++) if (ib.charAt(a) === "1") s += (B1 << B(ib.length - 1 - a)) * B16;
            for (a = 0; a < ch.ints.length; a++) if (ch.ints.charAt(a) === "1") s += B16 >> B(a + 1);
            check(s === tot, "往復 " + tag);
          })();
          check(confirmText(p) === "確かめ：" + (q.lv === 2 ? ib : "0") + "." + ch.ints + "(2) ＝ " + (function () {
            var vals = [], a;
            for (a = 0; a < ib.length; a++) if (ib.charAt(a) === "1") vals.push(orPlaceText("int", ib.length - 1 - a));
            for (a = 0; a < ch.ints.length; a++) if (ch.ints.charAt(a) === "1") vals.push(orPlaceText("frac", -(a + 1)));
            return vals.join("＋");
          })() + " ＝ " + decOf16(tot), "確かめの式 " + tag + " " + confirmText(p));
          if (kind === "d2b") {
            rows = sts.filter(function (st) { return st.type === "x2"; });
            check(rows.length === ch.rows.length && rows.length === 4 - tzOf(q.k), "×2 の行数 " + tag + " " + rows.length);
            check(sts.length === rows.length + 1 + (q.lv === 2 ? 1 : 0), "段の数 " + tag);
            check((q.lv === 2) === (sts[0].id === "int"), "中級だけ最初の段が整数部分 " + tag);
            if (q.lv === 2) check(sts[0].fields.map(function (f) { return f.model; }).join("") === ib && sts[0].fields.length === ib.length, "整数部分の段 " + tag);
            for (i = 0; i < rows.length; i++) {
              check(rows[i].fields[0].model === (function () { var t = decOf16(ch.rows[i].x2); return t.indexOf(".") < 0 ? t + ".0" : t; })() && rows[i].fields[1].model === ch.rows[i].ig.toString(), "行 " + (i + 1) + " の模範 " + tag + " " + rows[i].fields[0].model + "," + rows[i].fields[1].model);
              check(rows[i].frac === decOf16(ch.rows[i].frac) && rows[i].last === (i === rows.length - 1), "行 " + (i + 1) + " の小数部分 " + tag + " " + rows[i].frac);
              if (i + 1 < rows.length) check(rows[i].nextFrac === decOf16(ch.rows[i + 1].frac) && rows[i].nextFrac === rows[i + 1].frac, "次の行の小数部分（整数を取った残り） " + tag + " 行" + (i + 1));
              else check(rows[i].nextFrac === null, "最後の行の次はない " + tag);
              check(rows[i].id === "rows", "行は rows に集計 " + tag);
            }
            check(sts[sts.length - 1].id === "bits" && sts[sts.length - 1].fields.map(function (f) { return f.model; }).join("") === ch.ints, "答えの段 " + tag);
          } else {
            check(sts.length === 2 && sts[0].id === "place" && sts[1].id === "sum", "2進数→10進数の段 " + tag);
            var ones = [], a;
            for (a = 0; a < ib.length; a++) if (ib.charAt(a) === "1") ones.push(orPlaceText("int", ib.length - 1 - a));
            for (a = 0; a < ch.ints.length; a++) if (ch.ints.charAt(a) === "1") ones.push(orPlaceText("frac", -(a + 1)));
            check(sts[0].fields.map(function (f) { return f.model; }).join(",") === ones.join(","), "位取りの値の模範 " + tag + " " + sts[0].fields.map(function (f) { return f.model; }).join(","));
            check(sts[1].fields[0].model === orSumText(q.I, q.k) && sts[1].fields[0].model === decOf16(tot), "和の模範 " + tag + " " + sts[1].fields[0].model);
            check(columnsOf(p).length === ib.length + ch.ints.length, "位取りの表の桁数 " + tag);
            columnsOf(p).forEach(function (col, ci) { check(col.val === orPlaceText(col.part, col.exp) && col.bit === (ib + ch.ints).charAt(ci), "位取りの表の桁 " + tag + " " + ci); });
          }
        });
      });
      rep.extra.modelsChecked = n;
    })();

    /* ---- 2. 模範の全段が自分の判定に通る（書き方の違いを含む） ---- */
    (function () {
      var n = 0;
      function variants(f) {
        var m = f.model, out = [m], t, ip, fp;
        if (f.kind === "bit") return [m, m === "0" ? "０" : "１", " " + m + " "];
        if (f.kind === "int") return [m, "0" + m, m === "0" ? "０" : "１", " " + m];
        out.push(" " + m + " ", m.replace(/[0-9]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0xFEE0); }).replace(".", "．"), m.replace(".", "。"));
        if (m.indexOf(".") >= 0) {
          ip = m.split(".")[0]; fp = m.split(".")[1];
          out.push(m + "0", m + "00");
          if (fp === "0") out.push(ip, ip + ".", ip + ".00");
          if (ip === "0") out.push(m.slice(1));
          out.push("0" + m);
        } else out.push(m + ".0", m + ".", m + ".00", "0" + m);
        return out.filter(function (x) { return x.length <= 12; });
      }
      allProblems.forEach(function (q) {
        ["d2b", "b2d"].forEach(function (kind) {
          var p = makeProblem({ kind: kind, lv: q.lv, I: q.I, k: q.k });
          stagesOf(p).forEach(function (st) {
            st.fields.forEach(function (f, fi) {
              variants(f).forEach(function (v) {
                var vals = st.fields.map(function (g) { return g.model; }); vals[fi] = v; n++;
                check(judgeStage(p, st, vals).ok, "模範の書き方違いが通る " + p.key + " " + st.key + " " + fi + " 「" + v + "」");
              });
            });
            // 全段・全欄の模範が通り，1 マスでも違うと通らない
            check(judgeStage(p, st, st.fields.map(function (f) { return f.model; })).ok, "模範が通る " + p.key + " " + st.key);
            check(attempt(p, st, newStageState(), st.fields.map(function (f) { return f.model; })).result === "ok1", "模範は 1 回目で正解 " + p.key + " " + st.key);
          });
        });
      });
      rep.extra.variantChecks = n;
    })();

    /* ---- 3. 誤った答えを全数で与える：判定がオラクルと一致し，ヒントの主張が模範と食い違わない ---- */
    var hintSeen = {};
    (function () {
      var cand = [], seenC = {}, n = 0;
      function addC(s) { if (!seenC[s]) { seenC[s] = 1; cand.push(s); } }
      var i;
      for (i = 0; i <= 40; i++) { addC(decOf16(B(i))); addC(decOf16(B(i)).indexOf(".") < 0 ? decOf16(B(i)) + ".0" : decOf16(B(i)) + "0"); }
      ["", " ", ".", "..", "abc", "1.2.3", "1,25", "0.30000000000000004", "１．２５", "。5", "5。", "0.1", "0.2", "0.3", "0.4", "0.6", "0.7", "0.9", "3", "4", "-1", "1e1", "0x1", "1/2", "２", "0", "1", "00", "10"].forEach(addC);
      var ints = ["", "0", "1", "2", "5", "10", "００", "１", "a", "-1", "123", "0.5"];

      function orWrong(st, vals) {                                      // 別実装の判定：欄ごとに { empty, wrong }
        var empty = [], wrong = [];
        st.fields.forEach(function (f, i) {
          var v = vals[i], a, b;
          if (orEmpty(v)) { empty.push(i); return; }
          if (f.kind === "bit") { var t; try { t = String(v).normalize("NFKC"); } catch (e) { t = String(v); } t = t.replace(/。/g, ".").trim(); if (t !== f.model) wrong.push(i); }
          else if (f.kind === "int") { a = orInt(v); if (a === null || a !== B(f.model)) wrong.push(i); }
          else { a = orVal(v); b = orVal(f.model); if (a === null || a !== b) wrong.push(i); }
        });
        return { empty: empty, wrong: wrong };
      }
      function sameList(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
      function verify(p, st, vals) {
        var j = judgeStage(p, st, vals), o = orWrong(st, vals), tag = p.key + " " + st.key + " " + JSON.stringify(vals);
        n++;
        check(sameList(j.empty, o.empty) && sameList(j.wrong, o.wrong), "判定がオラクルと一致 " + tag + " → " + JSON.stringify([j.empty, j.wrong]) + " / " + JSON.stringify([o.empty, o.wrong]));
        check(j.ok === (o.empty.length === 0 && o.wrong.length === 0), "ok の判定 " + tag);
        check((j.diag !== null) === (o.empty.length === 0 && o.wrong.length > 0), "ヒントは空がなく誤りがあるときだけ " + tag);
        if (j.diag) { hintSeen[j.diag.id] = (hintSeen[j.diag.id] || 0) + 1; check(HINTS[j.diag.id] === j.diag.text, "ヒント文 " + j.diag.id); claim(j.diag.id, p, st, vals, o.wrong, tag); }
        return j;
      }
      // ヒントの主張（別実装で再計算）
      function eqV(a, b) { var x = orVal(a), y = orVal(b); return x !== null && y !== null && x === y; }
      function claim(id, p, st, vals, wrong, tag) {
        var ch, ig, c, x2, ans, model, rev, ok, ibits;
        if (st.type === "x2") {
          ch = orChain(p.k).rows[st.row - 1]; c = decOf16(ch.frac); ig = ch.ig; x2 = ch.x2;
          var x1 = eqV(vals[0], c), x2c = ig === B1 && eqV(vals[0], decOf16(x2 - B16)), x3 = eqV(vals[0], ig.toString());
          if (id === "X-1") ok = wrong.indexOf(0) >= 0 && x1;
          else if (id === "X-2") ok = wrong.indexOf(0) >= 0 && x2c;
          else if (id === "X-3") ok = wrong.indexOf(0) >= 0 && x3;
          else if (id === "X-4") ok = wrong.indexOf(0) >= 0 && !x1 && !x2c && !x3;
          else if (id === "I-1") ok = wrong.length === 1 && wrong[0] === 1 && ig === B1 && orInt(vals[1]) === B0;
          else if (id === "I-2") ok = wrong.length === 1 && wrong[0] === 1 && ig === B0 && orInt(vals[1]) === B1;
          else if (id === "I-3") ok = wrong.length === 1 && wrong[0] === 1 && !(ig === B1 && orInt(vals[1]) === B0) && !(ig === B0 && orInt(vals[1]) === B1);
          else ok = false;
        } else if (st.type === "bits") {
          ans = vals.map(function (v) { var t; try { t = String(v).normalize("NFKC"); } catch (e) { t = String(v); } return t.trim(); }).join("");
          model = st.fields.map(function (f) { return f.model; }).join("");
          rev = model.split("").reverse().join("");
          if (id === "B-1" || id === "N-1") ok = ans === rev && rev !== model && ans.length > 1 && (id === "N-1") === !!st.isInt;
          else if (id === "B-2" || id === "N-2") ok = ans !== model && !(ans === rev && rev !== model && ans.length > 1) && (id === "N-2") === !!st.isInt;
          else ok = false;
        } else if (st.type === "place") {
          var allP = wrong.every(function (wi) { var v = orVal(vals[wi]); return v !== null && (v === orVal("0") || v === orVal("1")); });
          var allN = wrong.every(function (wi) {
            var f = st.fields[wi], v = orVal(vals[wi]), col = st.cols[f.col], l = st.cols[f.col - 1], r = st.cols[f.col + 1];
            return v !== null && ((l && v === orVal(orPlaceText(l.part, l.exp))) || (r && v === orVal(orPlaceText(r.part, r.exp))));
          });
          if (id === "P-a") ok = wrong.length > 0 && allP;
          else if (id === "P-b") ok = wrong.length > 0 && allN;
          else if (id === "P-c") ok = wrong.length > 0 && !allP && !allN;
          else ok = false;
        } else if (st.type === "sum") {
          var v = orVal(vals[0]), allT = B0, fr = B0, it = B0, cols = st.cols, hasZero = false;
          cols.forEach(function (col) {
            var val = col.part === "int" ? (B1 << B(col.exp)) * B("10000") : (B(5) ** B(-col.exp)) * (B10 ** B(4 + col.exp));
            allT += val; if (col.bit === "0") hasZero = true;
            if (col.bit === "1") { if (col.part === "int") it += val; else fr += val; }
          });
          function s4(t) { var ip = (t / B("10000")).toString(), f4 = (t % B("10000")).toString(); while (f4.length < 4) f4 = "0" + f4; f4 = f4.replace(/0+$/, ""); return f4 ? ip + "." + f4 : ip; }
          var c1 = hasZero && v !== null && v === orVal(s4(allT)), c2 = p.lv === 2 && v !== null && v === orVal(s4(fr)), c3 = p.lv === 2 && v !== null && v === orVal(s4(it));
          var c5 = v !== null && v === orVal((p.lv === 2 ? orIntBits(p.I) : "0") + "." + orChain(p.k).ints);
          if (id === "S-1") ok = c1; else if (id === "S-2") ok = c2; else if (id === "S-3") ok = c3; else if (id === "S-5") ok = c5;
          else if (id === "S-4") ok = !c1 && !c2 && !c3 && !c5;
          else ok = false;
        }
        check(ok === true, "ヒント " + id + " の主張が模範と食い違う " + tag);
      }

      allProblems.forEach(function (q) {
        ["d2b", "b2d"].forEach(function (kind) {
          var p = makeProblem({ kind: kind, lv: q.lv, I: q.I, k: q.k }), sts = stagesOf(p);
          sts.forEach(function (st) {
            var model = st.fields.map(function (f) { return f.model; }), fi, fj, vals, c, d, bi, cs;
            if (st.type === "x2") {
              if (q.lv === 2 && q.I !== 5) return;                    // ×2 の行は小数部分だけで決まる．中級は 1 つの整数部分で足りる
              cand.forEach(function (a) { ints.forEach(function (b) { verify(p, st, [a, b]); }); });
            } else if (st.type === "bits") {
              var L = st.fields.length, mask, s;
              for (mask = 0; mask < (1 << L); mask++) { vals = []; for (bi = 0; bi < L; bi++) vals.push((mask >> (L - 1 - bi)) & 1 ? "1" : "0"); verify(p, st, vals); }
              vals = model.slice(); vals[0] = "x"; verify(p, st, vals); vals = model.slice(); vals[L - 1] = ""; verify(p, st, vals); vals = model.slice(); vals[0] = "2"; verify(p, st, vals);
            } else if (st.type === "place") {
              cs = []; st.cols.forEach(function (col) { cs.push(col.val); }); cs = cs.concat(["0", "1", "2", "0.1", "0.3", "9", "0.75", "", "x"]);
              var uniq = {}; cs = cs.filter(function (z) { if (uniq[z]) return false; uniq[z] = 1; return true; });
              for (fi = 0; fi < st.fields.length; fi++) cs.forEach(function (c1) { vals = model.slice(); vals[fi] = c1; verify(p, st, vals); });
              if (st.fields.length >= 2) {
                var pc = [0, 1].map(String).concat(st.cols.map(function (col) { return col.val; })).slice(0, 7);
                for (fi = 0; fi < st.fields.length; fi++) for (fj = fi + 1; fj < st.fields.length; fj++) pc.forEach(function (c1) { pc.forEach(function (c2) { vals = model.slice(); vals[fi] = c1; vals[fj] = c2; verify(p, st, vals); }); });
              }
              // 全部の欄を，同じ値・1 つ左の位の値・1 つ右の位の値にする
              [function () { return "1"; }, function () { return "0"; }].forEach(function (fn) { verify(p, st, model.map(fn)); });
              verify(p, st, st.fields.map(function (f) { var col = st.cols[f.col - 1]; return col ? col.val : "3"; }));
              verify(p, st, st.fields.map(function (f) { var col = st.cols[f.col + 1]; return col ? col.val : "3"; }));
              verify(p, st, st.fields.map(function (f, i) { return i % 2 ? "1" : "0"; }));
            } else if (st.type === "sum") {
              var sc = [];
              for (c = 0; c <= 260; c++) sc.push(decOf16(B(c)));
              sc = sc.concat(["", ".", "0.5625.", "0.1001", "100.11", "1.1", "0.111", "0.0101", "1111.1111", "x", "0.30000000000000004", "٣"]);
              sc.forEach(function (a) { verify(p, st, [a]); });
              // この問題の「全部足し」「小数だけ」「整数だけ」「2進数のまま」の値は，必ず試す
              var cols = st.cols, aT = B0, aF = B0, aI = B0;
              cols.forEach(function (col) { var val = col.part === "int" ? (B1 << B(col.exp)) * B("10000") : (B(5) ** B(-col.exp)) * (B10 ** B(4 + col.exp)); aT += val; if (col.bit === "1") { if (col.part === "int") aI += val; else aF += val; } });
              [aT, aF, aI].forEach(function (t) { var ip = (t / B("10000")).toString(), f4 = (t % B("10000")).toString(); while (f4.length < 4) f4 = "0" + f4; f4 = f4.replace(/0+$/, ""); verify(p, st, [f4 ? ip + "." + f4 : ip]); });
              verify(p, st, [(q.lv === 2 ? orIntBits(q.I) : "0") + "." + orChain(q.k).ints]);
            }
          });
        });
      });
      rep.extra.wrongAnswersChecked = n;
      rep.extra.hintCoverage = hintSeen;
      Object.keys(HINTS).forEach(function (id) { check(hintSeen[id] > 0, "ヒント " + id + " が一度も出ていない（検査の網羅）"); });
    })();

    /* ---- 4. 段の状態遷移・attempt の流れ ---- */
    (function () {
      var s = newStageState(), p = makeProblem({ kind: "d2b", lv: 1, I: 0, k: 10 }), sts = stagesOf(p), st = sts[0], good = st.fields.map(function (f) { return f.model; }), o, w;
      check(sts.length === 4 - 1 + 1 && st.frac === "0.625" && st.fields[0].model === "1.25", "例 0.625 の 1 行目");
      o = attempt(p, st, s, ["", ""]); check(!o.counted && o.st.attempts === 0 && o.head === "「×2 の答え」と「整数」を入れよう", "空は数えない");
      o = attempt(p, st, s, ["1.25", ""]); check(!o.counted && o.head === "「整数」も入れよう", "整数が空");
      o = attempt(p, st, s, ["", "1"]); check(!o.counted && o.head === "「×2 の答え」も入れよう", "×2 の答えが空");
      w = ["0.25", "1"]; o = attempt(p, st, s, w);
      check(o.counted && !o.ok && o.st.attempts === 1 && o.st.result === null && o.hint === HINTS["X-2"] && o.head === TEXT.msg.retry && /「×2 の答え」がちがいます/.test(o.detail), "1回目の誤り：ヒントと赤い欄");
      o = attempt(p, st, o.st, w); check(o.reveal && o.final && o.result === "rev" && o.head === TEXT.msg.rev, "2回目も誤りなら値を見せる");
      o = attempt(p, st, { attempts: 1, result: null }, good); check(o.result === "ok2" && o.head === TEXT.msg.ok2, "2回目で正解");
      o = attempt(p, st, newStageState(), good); check(o.result === "ok1" && o.final && o.head === TEXT.msg.ok1, "1回目で正解");
      check(advance({ attempts: 2, result: "rev" }, true).result === "rev", "終わった段は変わらない");
      // 最後の行
      var last = sts[2]; o = attempt(p, last, newStageState(), last.fields.map(function (f) { return f.model; }));
      check(last.last && o.detail === TEXT.msg.endRows, "最後の行の終わりの一言");
      check(!sts[0].last && attempt(p, sts[0], newStageState(), good).detail === "", "最後でない行には一言を足さない");
      // 全段を通して記録に入れる
      var rec = newRec(), stages = stagesOf(p), results = stages.map(function () { return "ok1"; });
      recStart(rec, "d2b", 1); recFinish(rec, "d2b", 1, stages, results);
      check(rec.rec.d2b1.tried === 1 && rec.rec.d2b1.perfect === 1 && rec.rec.d2b1.streak === 1 && rec.rec.d2b1.stage.rows.n === 1 && rec.rec.d2b1.stage.bits.n === 1 && rec.rec.d2b1.stage.int.n === 0, "×2 の行は rows に 1 回だけ数える");
      results = stages.map(function (x, i) { return i === 1 ? "rev" : i === 2 ? "ok2" : "ok1"; });
      var col = collapse(stages, results); check(col.ids.join() === "rows,bits" && col.results.join() === "rev,ok1", "行の結果のまとめ方（rev が優先）");
      results = stages.map(function (x, i) { return i === 2 ? "ok2" : "ok1"; }); col = collapse(stages, results); check(col.results.join() === "ok2,ok1", "行の結果のまとめ方（ok2）");
      recFinish(rec, "d2b", 1, stages, stages.map(function () { return "ok1"; })); recFinish(rec, "d2b", 1, stages, stages.map(function () { return "ok1"; }));
      check(rec.rec.d2b1.streak === 3 && rec.rec.d2b1.cleared === true && tickOf(rec, "d2b", 1) && !tickOf(rec, "d2b", 2) && !tickOf(rec, "b2d", 1), "連続 3 で ✓");
      recStart(rec, "b2d", 2); check(rec.rec.b2d2.pending === true, "解き始めたら pending");
      rec.rec.b2d2.streak = 2; recAbandon(rec, "b2d", 2); check(rec.rec.b2d2.streak === 0 && rec.rec.b2d2.pending === false, "離脱で連続は 0");
      recFinish(rec, "d2b", 1, stages, results); check(rec.rec.d2b1.streak === 0 && rec.rec.d2b1.cleared === true, "✓ は消えない");
    })();

    /* ---- 5. 出題：全問題が出る・同じ問題が近くに出ない・一様に近い ---- */
    (function () {
      ["d2b", "b2d"].forEach(function (kind) { [1, 2].forEach(function (lv) {
        var key = kind + lv, seen = {}, cnt = {}, recent = [], i, p, run = 0, prev = null, repeats = 0, near = 0, bad = 0, lo = 1e9, hi = 0, sizeMax = lv === 1 ? 15 : 225;
        for (i = 0; i < nPer; i++) {
          p = gen(kind, lv, recent);
          if (p.kind !== kind || p.lv !== lv || p.k < 1 || p.k > 15 || (lv === 1 ? p.I !== 0 : (p.I < 1 || p.I > 15))) bad++;
          if (prev && prev.key === p.key) repeats++;
          if (recent.slice(-AVOID).indexOf(p.key) >= 0) near++;
          seen[p.key] = 1; cnt[p.key] = (cnt[p.key] || 0) + 1;
          recent.push(p.key); if (recent.length > AVOID) recent.shift(); prev = p;
        }
        Object.keys(cnt).forEach(function (kk) { lo = Math.min(lo, cnt[kk]); hi = Math.max(hi, cnt[kk]); });
        rep.combos[key] = { generated: nPer, distinct: Object.keys(seen).length, min: lo, max: hi, repeats: repeats, near: near, bad: bad };
        check(bad === 0, key + "：範囲外の問題がある");
        check(Object.keys(seen).length === sizeMax, key + "：全 " + sizeMax + " 通りが出る（" + Object.keys(seen).length + "）");
        check(repeats === 0 && near === 0, key + "：直近 " + AVOID + " 問と同じ問題が出た");
        if (lv === 1) check(lo > nPer / 15 * 0.55 && hi < nPer / 15 * 1.45, key + "：偏りが大きい " + lo + "〜" + hi);
        else check(hi < nPer / 225 * 3.5 + 6, key + "：偏りが大きい " + lo + "〜" + hi);
      }); });
      // 直近を避けても，避ける対象が少ないときは引き直しが終わる
      var pp = gen("d2b", 1, ["d2b|1|0|1", "d2b|1|0|2", "d2b|1|0|3", "d2b|1|0|4", "d2b|1|0|5"]); check(!!pp && pp.k > 5, "避けた 5 問以外から選ぶ");
    })();

    /* ---- 6. マスの操作（左から右）：別に書いた参照モデルと照合 ---- */
    (function () {
      function refEdit(cells, focus, ev) {
        var len = cells.length, c = cells.slice(), f = focus, res = { cells: c, focus: f, rejected: false, submit: false, note: false }, t, bits, i, start, hasEmpty;
        if (ev.type === "focus") { res.focus = Math.min(len - 1, Math.max(0, ev.index)); return res; }
        if (ev.type === "paste") { res.rejected = true; return res; }
        if (ev.type === "input") {
          try { t = String(ev.value).normalize("NFKC"); } catch (e) { t = String(ev.value); }
          t = t.slice(0, 64); bits = [];
          for (i = 0; i < t.length; i++) if (t.charAt(i) === "0" || t.charAt(i) === "1") bits.push(t.charAt(i));
          if (t === "") return res;
          if (bits.length === 0) { res.rejected = true; return res; }
          if (bits.length === 1) { c[f] = bits[0]; res.focus = f + 1 < len ? f + 1 : f; return res; }
          start = 0;
          if (bits.length < len) { hasEmpty = false; for (i = f; i < len; i++) if (c[i] === "") hasEmpty = true; if (hasEmpty) start = f; }
          for (i = 0; i < bits.length; i++) if (start + i < len) c[start + i] = bits[i];
          res.note = start + bits.length > len; res.focus = Math.min(start + bits.length, len - 1);
          return res;
        }
        if (ev.key === "Backspace") { if (c[f] !== "") c[f] = ""; else if (f > 0) { res.focus = f - 1; c[f - 1] = ""; } }
        else if (ev.key === "Delete") c[f] = "";
        else if (ev.key === "ArrowLeft") res.focus = Math.max(0, f - 1);
        else if (ev.key === "ArrowRight") res.focus = Math.min(len - 1, f + 1);
        else if (ev.key === "Home") res.focus = 0;
        else if (ev.key === "End") res.focus = len - 1;
        else if (ev.key === "Enter") res.submit = true;
        return res;
      }
      var n = 0, len, f, code, lim, cells, ev, evs, a, b, base;
      for (len = 1; len <= 6; len++) {
        evs = [{ type: "input", value: "0" }, { type: "input", value: "1" }, { type: "input", value: "x" }, { type: "input", value: "" }, { type: "input", value: "０" }, { type: "input", value: "x1" },
               { type: "paste" }, { type: "key", key: "Backspace" }, { type: "key", key: "Delete" }, { type: "key", key: "ArrowLeft" }, { type: "key", key: "ArrowRight" }, { type: "key", key: "Home" }, { type: "key", key: "End" }, { type: "key", key: "Enter" }, { type: "key", key: "a" }];
        for (a = 2; a <= len + 1; a++) { evs.push({ type: "input", value: "1".repeat(a) }); evs.push({ type: "input", value: "10".repeat(a).slice(0, a) }); evs.push({ type: "input", value: ("0" + "x1").repeat(a).slice(0, a + 1) }); evs.push({ type: "input", value: "１０" }); }
        for (b = 0; b < len; b++) evs.push({ type: "focus", index: b });
        evs.push({ type: "focus", index: 99 });
        for (code = 0, lim = 1, a = 0; a < len; a++) lim *= 3;
        for (code = 0; code < lim; code++) {
          cells = []; base = code; for (a = 0; a < len; a++) { cells.push(["", "0", "1"][base % 3]); base = Math.floor(base / 3); }
          for (f = 0; f < len; f++) evs.forEach(function (e2) {
            var got = cellEdit({ cells: cells.slice(), focus: f }, e2), exp = refEdit(cells, f, e2), snapshot = cells.join("|");
            n++;
            if (got.cells.join("|") !== exp.cells.join("|") || got.focus !== exp.focus || got.rejected !== exp.rejected || got.submit !== exp.submit || (got.note !== "") !== exp.note) {
              fail("cellEdit が参照モデルと違う len=" + len + " cells=" + snapshot + " f=" + f + " ev=" + JSON.stringify(e2) + " got=" + JSON.stringify([got.cells, got.focus]) + " exp=" + JSON.stringify([exp.cells, exp.focus]));
            }
          });
        }
      }
      rep.totalChecked += n; rep.extra.cellEditCompared = n;
      // 入力を書き換えない・長い入力に落ちない
      var row = { cells: ["", "", ""], focus: 0 }, snap = JSON.stringify(row), r = cellEdit(row, { type: "input", value: "11" });
      check(JSON.stringify(row) === snap && r.cells.join("") === "11", "cellEdit は row を書き換えない");
      r = cellEdit({ cells: ["", "", ""], focus: 0 }, { type: "input", value: "1".repeat(100000) }); check(r.cells.join("") === "111" && r.note !== "", "10 万文字を渡しても落ちない（先頭 64 文字まで）");
      r = cellEdit({ cells: ["", "", "", ""], focus: 0 }, { type: "input", value: "10" }); r = cellEdit({ cells: r.cells, focus: r.focus }, { type: "input", value: "11" }); check(r.cells.join("") === "1011", "4 桁ずつ 2 回に分けても前の分は消えない（2 + 2）");
      r = cellEdit({ cells: ["", "", "", ""], focus: 0 }, { type: "input", value: "1" }); r = cellEdit({ cells: r.cells, focus: r.focus }, { type: "input", value: "0" }); r = cellEdit({ cells: r.cells, focus: r.focus }, { type: "input", value: "1" }); check(r.cells.join("") === "101" && r.focus === 3, "1 文字ずつは左から右へ進む");
      check(firstEmpty(["1", "", "0", ""]) === 1 && firstEmpty(["", "x"]) === 0 && firstEmpty(["1", "1"]) === 1 && firstEmpty([" ", "1"]) === 0, "先頭の空き");
    })();

    /* ---- 7. 数の欄の書き方・Number の小数の落とし穴 ---- */
    (function () {
      function eq(a, b) { return parseDec(a) !== null && parseDec(a) === parseDec(b); }
      check(eq("1.0", "1") && eq("1.00", "1") && eq(".5", "0.5") && eq("0.50", "0.5") && eq("01.25", "1.25") && eq("5.", "5") && eq("１．２５", "1.25") && eq("1。25", "1.25") && eq(" 0.5 ", "0.5"), "同じ値の書き方は同じ正規形");
      check(!eq("0.5", "0.25") && !eq("1", "10") && !eq("0.5", "5") && !eq("10", "1.0"), "違う値は違う正規形");
      check(parseDec("") === null && parseDec(".") === null && parseDec("..") === null && parseDec("1.2.3") === null && parseDec("abc") === null && parseDec("1,5") === null && parseDec("-1") === null && parseDec("1e3") === null && parseDec(null) === null && parseDec(undefined) === null && parseDec(5) === "5", "不正な書き方は null");
      check(parseDec("0.30000000000000004") === null, "13 文字を超える数は受けない（0.1+0.2 の値を答えにしても通らない）");
      check(parseDec("0.3000000001") === "0.3000000001" && parseDec("0.3000000001") !== parseDec("0.3"), "近い値と取り違えない");
      check(parseDec("0.0625") === parseDec("0.06250") && parseDec("0.0625") !== parseDec("0.062500001") && parseDec("0.0625") !== parseDec("0.0626"), "0.0625 を厳密に比べる");
      check(parseIntText("01") === "1" && parseIntText("１") === "1" && parseIntText("") === null && parseIntText("a") === null && parseIntText("123") === null && parseIntText("0.5") === null && parseIntText("0") === "0", "整数の欄");
      var s1 = sanitizeNum("1,25"); check(s1.value === "125" && s1.rejected, "数の欄：「,」は捨てて知らせる");
      s1 = sanitizeNum("１．２５"); check(s1.value === "1.25" && !s1.rejected, "数の欄：全角は半角に");
      s1 = sanitizeNum("1。25"); check(s1.value === "1.25" && !s1.rejected, "数の欄：「。」は小数点");
      s1 = sanitizeNum("1..2"); check(s1.value === "1.2" && s1.rejected, "数の欄：小数点は 1 つだけ");
      s1 = sanitizeNum("abc"); check(s1.value === "" && s1.rejected, "数の欄：文字は捨てる");
      s1 = sanitizeNum("1234567890123456"); check(s1.value.length === MAX_NUM && s1.rejected, "数の欄：12 文字まで");
      s1 = sanitizeNum("9".repeat(100000)); check(s1.value.length === MAX_NUM, "数の欄：10 万文字を渡しても落ちない");
      s1 = sanitizeInt("１２３"); check(s1.value === "12" && s1.rejected, "整数の欄：2 文字まで");
      s1 = sanitizeInt("a1"); check(s1.value === "1" && s1.rejected, "整数の欄：文字は捨てる");
      s1 = sanitizeNum(null); check(s1.value === "" && !s1.rejected, "数の欄：null");
      // 書式（表示）が Number の小数の計算を通らない：16 分の 1 の表示を別実装と全数照合
      var okFmt = true, i; for (i = 0; i <= 255; i++) if (fmt16(i) !== decOf16(B(i))) okFmt = false;
      check(okFmt, "fmt16 が別実装の 10 進展開と 0〜255 で一致");
      check(fmt16(16, true) === "1.0" && fmt16(20, true) === "1.25" && fmt16(8, true) === "0.5" && fmt16(2) === "0.125" && fmt16(1) === "0.0625" && fmt16(128) === "8" && fmt16(255) === "15.9375", "表示の例");
      check(supText(-1) === "2⁻¹" && supText(3) === "2³" && supText(-4) === "2⁻⁴" && supText(0) === "2⁰", "上付きの指数");
      // Number の小数の落とし穴そのものを答えにする：0.1+0.2 → 0.30000000000000004 は受けず，0.3 は 0.3 と一致する
      check(eq("0.3", "0.30") && !eq("0.3", "0.3125"), "0.3 の比べ方");
      // コードの静的検査（node から渡されたときだけ）
      if (sources) {
        Object.keys(sources).forEach(function (name) {
          var src = sources[name].split("/*@@TEST@@*/")[0], code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/\/(?:\\.|[^\/\\\n])+\/[gimsuy]*/g, "//");
          ["parseFloat", "toFixed", "toPrecision", "Number(", "Math.round", "Math.pow", "Math.sqrt"].forEach(function (w) { check(code.indexOf(w) < 0, name + " に「" + w + "」がある（判定・表示に使わない）"); });
          check(!/(^|[=(,:?&|!<>\[]\s*)\+\s*[A-Za-z_$(]/.test(code.replace(/\n/g, " ")), name + " に単項 + で数に直すコードがある");
          check(!/[0-9]\.[0-9]/.test(code) && !/[^A-Za-z0-9_$\]\)]\.[0-9]/.test(code), name + " のコードに小数のリテラルがある");
        });
        rep.extra.staticChecked = Object.keys(sources);
      }
    })();

    /* ---- 8. 記録：往復・壊れた値・巨大な値・想定外の型・例外 ---- */
    (function () {
      var rec = newRec(), mem = {}, st = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } }, r, bad, i;
      rec.sel = { kind: "b2d", lv: 2 }; rec.rec.b2d2.tried = 7; rec.rec.b2d2.perfect = 4; rec.rec.b2d2.streak = 2; rec.rec.b2d2.stage.sum = { n: 5, miss1: 2, rev: 1 };
      check(saveRec(st, rec) && STORAGE_KEY === "csMathTrainer.binaryFraction.v1" && mem[STORAGE_KEY].length > 10, "保存");
      r = loadRec(st); check(r.usable && r.rec.sel.kind === "b2d" && r.rec.sel.lv === 2 && r.rec.rec.b2d2.tried === 7 && r.rec.rec.b2d2.stage.sum.miss1 === 2, "往復");
      mem[STORAGE_KEY] = "{broken"; r = loadRec(st); check(r.usable && r.rec.rec.d2b1.tried === 0 && r.rec.sel.kind === "d2b", "壊れた JSON は初期状態");
      mem[STORAGE_KEY] = "null"; check(loadRec(st).rec.rec.d2b1.tried === 0, "null");
      mem[STORAGE_KEY] = "[1,2]"; check(loadRec(st).rec.rec.d2b1.tried === 0, "配列");
      mem[STORAGE_KEY] = "\"x\""; check(loadRec(st).rec.rec.d2b1.tried === 0, "文字列");
      mem[STORAGE_KEY] = "{\"v\":2}"; check(loadRec(st).rec.rec.d2b1.tried === 0, "別の版");
      bad = { v: 1, sel: { kind: "zzz", lv: 9 }, rec: { d2b1: { tried: -5, perfect: "x", streak: 1e99, cleared: "yes", pending: true, stage: { rows: { n: 1e99, miss1: -1, rev: [1] }, zzz: { n: 1 } } }, b2d1: [1, 2], d2b2: { tried: 3, perfect: 99, streak: 99, cleared: true, stage: { rows: { n: 99, miss1: 99, rev: 99 } } }, b2d2: null } };
      mem[STORAGE_KEY] = JSON.stringify(bad); r = loadRec(st).rec;
      check(r.sel.kind === "d2b" && r.sel.lv === 1, "知らない選択は既定");
      check(r.rec.d2b1.tried === 0 && r.rec.d2b1.perfect === 0 && r.rec.d2b1.streak === 0 && r.rec.d2b1.cleared === false && r.rec.d2b1.pending === false && r.rec.d2b1.stage.rows.n === 0 && !r.rec.d2b1.stage.zzz, "数でない・負の値は 0，知らない段は捨てる");
      check(r.rec.d2b2.tried === 3 && r.rec.d2b2.perfect === 3 && r.rec.d2b2.streak === 3 && r.rec.d2b2.cleared === true && r.rec.d2b2.stage.rows.n === 3 && r.rec.d2b2.stage.rows.miss1 === 3, "巨大な値は問題数・✓ に要る本数で頭打ち");
      check(r.rec.b2d1.tried === 0 && r.rec.b2d2.tried === 0, "配列・null の記録は初期状態");
      bad = { v: 1, sel: {}, rec: { d2b1: { tried: 1e300, perfect: 1e300, streak: 1e300, stage: { rows: { n: 1e300, miss1: 1e300, rev: 1e300 } } } } };
      mem[STORAGE_KEY] = JSON.stringify(bad); r = loadRec(st).rec; check(r.rec.d2b1.tried === 1000000 && r.rec.d2b1.streak === 3 && r.rec.d2b1.stage.rows.n === 1000000, "巨大な値は 1,000,000 で頭打ち");
      bad = { v: 1, sel: { kind: "d2b", lv: 1 }, rec: { d2b1: { tried: 2, stage: { rows: { n: 5, miss1: 9, rev: 9 } } } } };
      mem[STORAGE_KEY] = JSON.stringify(bad); r = loadRec(st).rec; check(r.rec.d2b1.stage.rows.n === 2 && r.rec.d2b1.stage.rows.miss1 === 2, "段の回数は問題数を超えない");
      var thrower = { getItem: function () { throw new Error("blocked"); }, setItem: function () { throw new Error("quota"); }, removeItem: function () { throw new Error("blocked"); } };
      r = loadRec(thrower); check(r.usable === false && r.rec.rec.d2b1.tried === 0, "読めない storage でも落ちない");
      check(saveRec(thrower, newRec()) === false && clearRec(thrower) === false, "書けない storage でも落ちない");
      check(loadRec(null).usable === false && saveRec(null, newRec()) === false, "storage が null でも落ちない");
      var big = "x".repeat(2000000); mem[STORAGE_KEY] = big; check(loadRec(st).rec.rec.d2b1.tried === 0, "巨大な文字列でも落ちない");
      mem[STORAGE_KEY] = "{\"v\":1,\"rec\":{\"d2b1\":{\"stage\":{\"rows\":{\"n\":1}}}},\"__proto__\":{\"x\":1}}"; r = loadRec(st).rec; check(r.rec.d2b1.stage.rows.n === 0 && ({}).x === undefined, "__proto__ を使っても汚染されない");
      var c = newCombo("d2b"); c.stage.rows.n = 7; c.stage.rows.miss1 = 6; c.stage.bits.n = 7; c.stage.bits.miss1 = 1;
      check(weakestStage(c, "d2b") === "rows" && weakestStage(newCombo("b2d"), "b2d") === null, "つまずきやすい段");
      for (i = 0; i < 3; i++) check(KINDS.every(function (k) { return LEVELS.every(function (l) { return !!newRec().rec[comboKey(k, l)]; }); }), "記録の 4 つの組み合わせ");
    })();

    /* ---- 9. 禁止語・文の検査 ---- */
    (function () {
      var all = staticTexts();
      rep.extra.screenStringsChecked = all.length;
      all.forEach(function (t) { BANNED_ALL.concat(BANNED_SCREEN).forEach(function (w) { check(t.indexOf(w) < 0, "禁止語「" + w + "」: " + t); }); });
      check(checkTexts(["固定小数点"]).length === 1 && checkTexts(["丸め誤差"]).length === 2 && checkTexts(["浮動小数点数"]).length === 1 && checkTexts(["桁落ち"]).length === 1 && checkTexts(["小数点以下"]).length === 1 && checkTexts(["2進数の小数"]).length === 0, "禁止語の検査が働く");
      all.forEach(function (t) { check(!/[、。]/.test(t), "全角の句読点（，．）にそろえる: " + t); });
      // 紙の言い方がそろっている
      check(TEXT.defs[0] === "10進数の小数を2進数にする考え方：小数部分に2を掛けることをくり返し，整数部分を上から順に並べる．", "紙の考え方の文");
      check(TEXT.learn.steps[6].text[0] === "<b>小数部分に2を掛けることをくり返し，整数部分を上から順に並べる．</b>", "解説に紙の文");
      check(TEXT.learn.steps[0].text[1].indexOf("半分") >= 0 && TEXT.learn.steps[0].text[0] === "2^{3}＝8，2^{2}＝4，2^{1}＝2，2^{0}＝1．", "解説の最初は 2³＝8 → … → 2⁰＝1，指数が1つ減ると値は半分");
      // 解説の順序：負の指数（2^{-n}）が出る前に，指数が1つ減ると値は半分を示す
      var firstNeg = -1, firstRule = -1;
      TEXT.learn.steps.forEach(function (stp, i) { var j = JSON.stringify(stp); if (firstNeg < 0 && /\^\{-/.test(j)) firstNeg = i; if (firstRule < 0 && j.indexOf("指数が1つ減る") >= 0) firstRule = i; });
      check(firstRule === 0 && firstNeg >= 1 && firstRule < firstNeg, "負の指数の前に「指数が1つ減ると，値は半分」");
      check(JSON.stringify(TEXT.learn.steps.slice(0, 1)).indexOf("^{-") < 0, "最初のステップに負の指数を出さない");
      check(TEXT.learn.steps.length === 10, "解説は 10 ステップ");
      TEXT.learn.steps.forEach(function (stp, i) {
        var v = stp.visual, w;
        stp.text.concat([stp.title]).forEach(function (t) { check((t.match(/\^\{/g) || []).length === (t.match(/\}/g) || []).length, "解説 " + (i + 1) + "：上付きの括弧が合う"); check((t.match(/<b>/g) || []).length === (t.match(/<\/b>/g) || []).length, "解説 " + (i + 1) + "：太字のタグが合う"); });
        if (v && v.type === "tbl") { w = v.rows[0].cells.length; v.rows.forEach(function (rw) { check(rw.cells.length === w, "解説 " + (i + 1) + "：表の列数がそろう"); }); }
        if (v && (v.type === "x2" || v.type === "x2h")) v.rows.forEach(function (rw) { check(rw.length === 3, "解説 " + (i + 1) + "：×2 の行は 3 つ"); });
      });
      // 解説の数値を別実装で検算：×2 の縦計算の行（0.625，0.75，0.1）
      [[TEXT.learn.steps[6].visual.rows, 10], [TEXT.learn.steps[8].visual.rows, 12]].forEach(function (pr) {
        var rows = pr[0], ch = orChain(pr[1]).rows;
        check(rows.length === ch.length, "解説の ×2 の行数 " + pr[1]);
        rows.forEach(function (rw, i) { check(rw[0] === decOf16(ch[i].frac) && rw[1] === (function () { var t = decOf16(ch[i].x2); return t.indexOf(".") < 0 ? t + ".0" : t; })() && rw[2] === ch[i].ig.toString(), "解説の ×2 の行 " + pr[1] + " 行" + (i + 1) + " " + JSON.stringify(rw)); });
      });
      (function () {                                           // 0.1 の ×2 を 6 行（別実装：分母 10 の分数）
        var rows = TEXT.learn.steps[9].visual.rows, num = 1, i, x, ig;
        for (i = 0; i < 6; i++) { x = num * 2; ig = x >= 10 ? 1 : 0; check(rows[i][2] === String(ig), "0.1 の ×2 の整数 行" + (i + 1)); check(rows[i][0] === "0." + num && rows[i][1] === (x >= 10 ? "1." + (x - 10) : "0." + x), "0.1 の ×2 の行 " + (i + 1) + " " + JSON.stringify(rows[i])); num = x - 10 * ig; }
        check(rows[1][0] === rows[5][0], "0.2 が2回出る");
      })();
      // 解説の位取りの表・例の和（別実装）
      check(orSumText(0, 14) === "0.875" && orSumText(0, 5) === "0.3125" && orSumText(0, 9) === "0.5625" && orSumText(4, 12) === "4.75" && orSumText(15, 15) === "15.9375", "解説・紙の例の和");
      var tbl = TEXT.learn.steps[1].visual.rows[1].cells; check(tbl.join(",") === "8,4,2,1,0.5,0.25,0.125,0.0625", "解説 2 の値の行");
      for (var e = -4; e <= 3; e++) check(tbl[3 - e] === (e >= 0 ? orPlaceText("int", e) : orPlaceText("frac", e)), "解説 2 の 2^" + e + "＝" + tbl[3 - e]);
      if (docs) {
        Object.keys(docs).forEach(function (name) {
          var t = docs[name];
          BANNED_ALL.forEach(function (w) { check(t.indexOf(w) < 0, name + " に禁止語「" + w + "」がある"); });   // README・SPEC には語そのものを出さない
        });
        rep.extra.docsChecked = Object.keys(docs);
      }
      if (typeof docs === "undefined") rep.extra.docsChecked = "（SPEC・README は node から渡す）";
    })();

    /* ---- 10. 紙の例（固定の例） ---- */
    (function () {
      var FIX = [
        ["d2b", "紙 例 0.625", 0, 10, "101", ["1.25", "0.5", "1.0"], "1,0,1"],
        ["d2b", "紙 練習① 0.75", 0, 12, "11", ["1.5", "1.0"], "1,1"],
        ["d2b", "紙 練習② 0.375", 0, 6, "011", ["0.75", "1.5", "1.0"], "0,1,1"],
        ["d2b", "紙 練習③ 0.8125", 0, 13, "1101", ["1.625", "1.25", "0.5", "1.0"], "1,1,0,1"],
        ["d2b", "紙 練習④ 0.6875", 0, 11, "1011", ["1.375", "0.75", "1.5", "1.0"], "1,0,1,1"],
        ["d2b", "4.75（確認問題）", 4, 12, "11", ["1.5", "1.0"], "1,1"]
      ];
      FIX.forEach(function (f) {
        var p = makeProblem({ kind: f[0], lv: f[2] ? 2 : 1, I: f[2], k: f[3] }), sts = stagesOf(p), rows = sts.filter(function (x) { return x.type === "x2"; });
        check(rows.map(function (r) { return r.fields[0].model; }).join() === f[5].join() && rows.map(function (r) { return r.fields[1].model; }).join() === f[6] && sts[sts.length - 1].fields.map(function (x) { return x.model; }).join("") === f[4], "紙の例 " + f[1]);
      });
      var FB = [["0.111", 0, 14, ["0.5", "0.25", "0.125"], "0.875"], ["0.0101", 0, 5, ["0.25", "0.0625"], "0.3125"], ["0.1001", 0, 9, ["0.5", "0.0625"], "0.5625"], ["100.11", 4, 12, ["4", "0.5", "0.25"], "4.75"], ["1111.1111", 15, 15, ["8", "4", "2", "1", "0.5", "0.25", "0.125", "0.0625"], "15.9375"]];
      FB.forEach(function (f) {
        var p = makeProblem({ kind: "b2d", lv: f[1] ? 2 : 1, I: f[1], k: f[2] }), sts = stagesOf(p);
        check(titleOf(p) === f[0] + "(2)" && sts[0].fields.map(function (x) { return x.model; }).join() === f[3].join() && sts[1].fields[0].model === f[4], "紙・教科書の例 " + f[0]);
      });
      rep.extra.fixtures = FIX.length + FB.length;
    })();

    return rep;
  }

  return {
    MAX_INPUT: MAX_INPUT, MAX_NUM: MAX_NUM, MAX_INT: MAX_INT, KINDS: KINDS, LEVELS: LEVELS, CLEAR_STREAK: CLEAR_STREAK, STAGE_IDS: STAGE_IDS, STORAGE_KEY: STORAGE_KEY, AVOID: AVOID,
    BANNED_ALL: BANNED_ALL, BANNED_SCREEN: BANNED_SCREEN, TEXT: TEXT, HINTS: HINTS,
    setSeed: setSeed, gen: gen, makeProblem: makeProblem, stagesOf: stagesOf, columnsOf: columnsOf, titleOf: titleOf, confirmText: confirmText, expressionOf: expressionOf,
    judgeStage: judgeStage, diagnose: diagnose, describeWrong: describeWrong, newStageState: newStageState, advance: advance, attempt: attempt, fieldState: fieldState,
    collapse: collapse, problemSummary: problemSummary, summaryText: summaryText, cellEdit: cellEdit, firstEmpty: firstEmpty, cellLabel: cellLabel,
    sanitizeNum: sanitizeNum, sanitizeInt: sanitizeInt, parseDec: parseDec, parseIntText: parseIntText, supText: supText, fmt16: fmt16, normText: normText,
    newRec: newRec, normalizeRec: normalizeRec, loadRec: loadRec, saveRec: saveRec, clearRec: clearRec, recStart: recStart, recAbandon: recAbandon, recFinish: recFinish,
    tickOf: tickOf, weakestStage: weakestStage, comboKey: comboKey, checkTexts: checkTexts, staticTexts: staticTexts, plain: plain,
    selfTest: selfTest
  };
})();
