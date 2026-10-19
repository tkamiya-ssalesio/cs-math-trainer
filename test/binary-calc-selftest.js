// 2進数の計算（足し算・補数）の自己検査を node で動かす．
//   node test/binary-calc-selftest.js [問題数] [種]
// binary-calc-core.js を vm で評価して BinCalcCore.selfTest(n, seed, docs) を呼ぶ（DOM は使わない）．
// README.md と docs/binary-calc-SPEC.md に禁止語がないことも見る．失敗があれば終了コード 1．
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const n = parseInt(process.argv[2] || "3000", 10);
const seed = parseInt(process.argv[3] || "20261019", 10);

const ctx = { console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "binary-calc-core.js"), "utf8"), ctx, { filename: "binary-calc-core.js" });

const docs = {};
["README.md", "docs/binary-calc-SPEC.md"].forEach(function (f) {
  const full = path.join(root, f);
  if (fs.existsSync(full)) docs[f] = fs.readFileSync(full, "utf8");
});
ctx.__docs = docs;
const rep = vm.runInContext("BinCalcCore.selfTest(" + n + ", " + seed + ", __docs)", ctx);
console.log(JSON.stringify({ n: rep.n, seed: rep.seed, checked: rep.totalChecked, fail: rep.totalFail, failures: rep.failures, combos: rep.combos, pools: rep.pools, fixtures: rep.fixtures, extra: rep.extra }, null, 1));
process.exit(rep.totalFail === 0 ? 0 : 1);
