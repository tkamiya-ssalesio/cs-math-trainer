// 論理回路の自己検査を node で動かす．
//   node test/logic-selftest.js [問題数] [種]
// logic-core.js を vm で評価して LogicCore.selfTest(n, seed, docs, sources) を呼ぶ（DOM は使わない）．
// README.md と docs/logic-circuit-SPEC.md の禁止語，コードが外へ送る API を使っていないことも見る．
// 失敗があれば終了コード 1．
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const n = parseInt(process.argv[2] || "3000", 10);
const seed = parseInt(process.argv[3] || "20261027", 10);

const ctx = { console: console };
vm.createContext(ctx);
const coreSrc = fs.readFileSync(path.join(root, "logic-core.js"), "utf8");
vm.runInContext(coreSrc, ctx, { filename: "logic-core.js" });

const docs = {};
["README.md", "docs/logic-circuit-SPEC.md"].forEach(function (f) {
  const full = path.join(root, f);
  if (fs.existsSync(full)) docs[f] = fs.readFileSync(full, "utf8");
});
const sources = { "logic-core.js": coreSrc };
["logic.js", "logic.css"].forEach(function (f) {
  const full = path.join(root, f);
  if (fs.existsSync(full) && f.endsWith(".js")) sources[f] = fs.readFileSync(full, "utf8");
});
ctx.__docs = docs;
ctx.__sources = sources;
const rep = vm.runInContext("LogicCore.selfTest(" + n + ", " + seed + ", __docs, __sources)", ctx);
console.log(JSON.stringify({ n: rep.n, seed: rep.seed, checked: rep.totalChecked, fail: rep.totalFail, failures: rep.failures, extra: rep.extra }, null, 1));
process.exit(rep.totalFail === 0 ? 0 : 1);
