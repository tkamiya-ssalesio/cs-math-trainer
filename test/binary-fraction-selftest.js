// 2進数の小数の自己検査を node で動かす．
//   node test/binary-fraction-selftest.js [問題数] [種]
// binary-fraction-core.js を vm で評価して BinFracCore.selfTest(n, seed, docs, sources) を呼ぶ（DOM は使わない）．
// README.md と docs/binary-fraction-SPEC.md に禁止語がないこと，コードが Number の小数の計算（parseFloat・toFixed など）を使っていないことも見る．
// 失敗があれば終了コード 1．
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const n = parseInt(process.argv[2] || "3000", 10);
const seed = parseInt(process.argv[3] || "20261022", 10);

const ctx = { console: console };
vm.createContext(ctx);
const coreSrc = fs.readFileSync(path.join(root, "binary-fraction-core.js"), "utf8");
vm.runInContext(coreSrc, ctx, { filename: "binary-fraction-core.js" });

const docs = {};
["README.md", "docs/binary-fraction-SPEC.md"].forEach(function (f) {
  const full = path.join(root, f);
  if (fs.existsSync(full)) docs[f] = fs.readFileSync(full, "utf8");
});
const sources = { "binary-fraction-core.js": coreSrc };
const uiPath = path.join(root, "binary-fraction.js");
if (fs.existsSync(uiPath)) sources["binary-fraction.js"] = fs.readFileSync(uiPath, "utf8");
ctx.__docs = docs;
ctx.__sources = sources;
const rep = vm.runInContext("BinFracCore.selfTest(" + n + ", " + seed + ", __docs, __sources)", ctx);
console.log(JSON.stringify({ n: rep.n, seed: rep.seed, checked: rep.totalChecked, fail: rep.totalFail, failures: rep.failures, combos: rep.combos, pools: rep.pools, extra: rep.extra }, null, 1));
process.exit(rep.totalFail === 0 ? 0 : 1);
