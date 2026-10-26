# 実ブラウザ（Playwright の Chromium）で，論理回路の全入力経路と，幅ごとの収まりを確かめる．
#   python3 test/logic-e2e.py [種] [URL] [部分]      部分＝solve,storage,links,layout のうち実行するもの（既定は全部）
#   先に別の端末で  python3 -m http.server 8765  をこのフォルダ（cs-math-trainer の直下）で動かしておく（URL の既定は http://localhost:8765/index.html）．
# 確かめること：
#   1. 全種類×難易度（AND・OR・NOT／組み合わせ 初級・中級／回路を選ぶ 初級・中級／半加算・全加算 初級・中級）を，タップ（タッチ有効の 375px）・キーボード（半角・全角・テンキー・日本語入力のときの code だけの keydown）で解く
#      答えは画面の data-circuit（部品と接続．答えを含まない）から，Python の別実装で自分で計算する（アプリの内部は見ない）
#      空きを残して Enter／ボタン→誤り（赤いマスとヒント）→正解（2回目）／2回目も誤りで値を見せる／1回目で正解
#      ③ は，正解の集合・過不足・取りこぼし・何も選ばない
#   2. 記録：保存・再読み込み・壊れた値・巨大な値・「記録を消す」・連続 3 問で ✓・別タブの記録
#   3. 外部と通信しない（同じ場所のファイル以外の要求がない．既存の style.css の Google Fonts の読み込みだけは元のまま）
#   4. 直リンク #logic・#logic-basic・#logic-combine・#logic-choose・#logic-adder
#   5. 幅ごと（1366×768・1280×800・1024×768・768×1024・820×1180・375×812）に，自己検査（?selftest=1）が失敗 0
# 既存の style.css が読む Google Fonts の要求は遮断して動かす．
# 失敗があれば終了コード 1．
import re, sys, json, random
from playwright.sync_api import sync_playwright

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/index.html'
PARTS = (sys.argv[3] if len(sys.argv) > 3 else 'solve,storage,links,layout').split(',')
ORIGIN = re.match(r'^(https?://[^/]+)', URL).group(1)
KEY = 'csMathTrainer.logicCircuit.v1'

fails = []; count = 0
def rec(ok, msg):
    global count; count += 1
    if not ok: fails.append(msg)

RF = []; REQS = []
def new_ctx(b, w=1366, h=768, **kw):
    ctx = b.new_context(viewport={'width': w, 'height': h}, **kw)
    ctx.route(re.compile(r'https?://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())
    ctx.on('requestfailed', lambda r: RF.append(r.url) if 'fonts.' not in r.url else None)
    ctx.on('request', lambda r: REQS.append(r.url))
    return ctx

def goto_ok(pg, url):
    # python3 -m http.server は，要求が重なるとまれに接続を切る．スクリプトが欠けたまま動くと検査が不安定になるので，読み込みに失敗したら読み直す
    for _ in range(8):
        del RF[:]; pg.goto(url)
        if not RF: return
        pg.wait_for_timeout(200)
    raise Exception('読み込みに失敗した要求が残る %s' % RF[:3])
def reload_ok(pg):
    for _ in range(8):
        del RF[:]; pg.reload()
        if not RF: return
        pg.wait_for_timeout(200)
    raise Exception('読み込みに失敗した要求が残る %s' % RF[:3])

# ---------------- 別実装の評価器（data-circuit から） ----------------
def circ_eval(c):
    names = c['inputs']; n = len(names); R = 1 << n
    v = {nm: [(r >> (n - 1 - i)) & 1 for r in range(R)] for i, nm in enumerate(names)}
    for g in c['gates']:
        a = v[g['in'][0]]; b = v[g['in'][1]] if len(g['in']) > 1 else None
        if g['t'] == 'AND': v[g['id']] = [x & y for x, y in zip(a, b)]
        elif g['t'] == 'OR': v[g['id']] = [x | y for x, y in zip(a, b)]
        elif g['t'] == 'NOT': v[g['id']] = [1 - x for x in a]
        else:
            v[g['id'] + '.S'] = [(x + y) % 2 for x, y in zip(a, b)]
            v[g['id'] + '.C'] = [x & y for x, y in zip(a, b)]
    return v
def stage_models(c, kind):
    v = circ_eval(c)
    outs = [[str(x) for x in v[o['src']]] for o in c['outs'] if o['stage']]
    if kind == 'basic': return [outs]
    return [[[str(x) for x in v[w['ref']]] for w in c['wires']], outs]

JS_STATE = '''()=>{const cs=[...document.querySelectorAll('.lg-cell.lg-active')];
 return {n:cs.length, si:cs.length?cs[0].dataset.si:null, vals:cs.map(c=>c.textContent), bad:cs.filter(c=>c.classList.contains('lg-bad')).length,
  fh:(document.querySelector('#lg-feedback .lg-fh')||{}).textContent||'', fd:(document.querySelector('#lg-feedback .lg-fd')||{}).textContent||'',
  hint:(document.querySelector('#lg-feedback .lg-fhint')||{}).textContent||'', head:document.getElementById('lg-stagehead').textContent,
  chips:[...document.querySelectorAll('#lg-chips .lg-chip')].map(c=>c.className.replace(/lg-chip|lg-cur|lg-/g,'').trim()), btn:document.getElementById('lg-check').textContent,
  kind:document.getElementById('lg-panel').dataset.kind, cellmsg:document.getElementById('lg-cellmsg').textContent}}'''
def st(pg): return pg.evaluate(JS_STATE)
def circuit(pg): return json.loads(pg.get_attribute('#lg-fig svg', 'data-circuit'))
def cell_sel(si, c, r): return '.lg-cell[data-si="%s"][data-c="%d"][data-r="%d"]' % (si, c, r)
def cell_text(pg, si, c, r): return pg.inner_text(cell_sel(si, c, r)).strip()

def tap_cell(pg, si, c, r, want, touch):
    cur = cell_text(pg, si, c, r)
    seq = {'': ['0', '1'], '0': ['1', '0'], '1': ['0', '1']}[cur]
    for t in (seq if want != cur else []):
        (pg.tap if touch else pg.click)(cell_sel(si, c, r))
        if cell_text(pg, si, c, r) == want: return
    rec(cell_text(pg, si, c, r) == want, 'タップで %s に出来ない（%s,%d,%d）' % (want, si, c, r))
def fill_taps(pg, si, model, touch, flips=()):
    for c, col in enumerate(model):
        for r, v in enumerate(col):
            if (c, r) in flips: v = '1' if v == '0' else '0'
            tap_cell(pg, si, c, r, v, touch)
FW = {'0': '０', '1': '１'}
def key_one(pg, v, style):
    if style == 'half': pg.keyboard.press(v)
    elif style == 'numpad': pg.keyboard.press('Numpad' + v)
    elif style == 'full': pg.evaluate("k=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))", FW[v])
    elif style == 'code':                                           # 日本語入力オン：key が Process になる端末（code だけ見る）
        pg.evaluate("c=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',code:c,keyCode:229,bubbles:true,cancelable:true}))", 'Digit' + v)
    else: raise Exception(style)
def fill_keys(pg, si, model, style, flips=()):
    pg.focus(cell_sel(si, 0, 0))
    for c, col in enumerate(model):
        for r, v in enumerate(col):
            if (c, r) in flips: v = '1' if v == '0' else '0'
            key_one(pg, v, style)
    vals = pg.evaluate("si=>[...document.querySelectorAll('.lg-cell[data-si=\"'+si+'\"]')].map(c=>[+c.dataset.c,+c.dataset.r,c.textContent])", si)
    ok = all(t == (('1' if model[c][r] == '0' else '0') if (c, r) in flips else model[c][r]) for c, r, t in vals)
    rec(ok, 'キーボード（%s）で入れた値が違う %s' % (style, vals[:6]))
def submit(pg, route):
    if route == 'enter': pg.keyboard.press('Enter')
    else: pg.click('#lg-check')

def pick_state(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('.lg-opt')].map(b=>({on:b.getAttribute('aria-pressed')==='true',bad:b.classList.contains('lg-bad'),label:b.dataset.label,dis:b.disabled}))")
def choose_truth(pg):
    """③：題の表（画面から読む）と，各選択肢の回路（data-circuit）から，正解の選択肢を計算する"""
    given = pg.evaluate("()=>[...document.querySelectorAll('#lg-sheet .lg-given')].map(e=>e.textContent)")
    opts = pg.evaluate("()=>[...document.querySelectorAll('.lg-opt')].map(b=>b.querySelector('svg').getAttribute('data-circuit'))")
    res = []
    for o in opts:
        c = json.loads(o); v = circ_eval(c)
        out = [str(x) for x in v[c['outs'][0]['src']]]
        res.append(out == given)
    return res, given

def solve_problem(pg, mode, touch, route='button', style='half'):
    """1 問を解く．mode：perfect／empty／one／two．戻り値：全段 ok1 だったか"""
    kind = st(pg)['kind']
    perfect = True
    if kind == 'choose':
        truth, given = choose_truth(pg)
        rec(any(truth) and not all(truth), '③ 正解の個数が 1〜3 %s' % truth)
        k = sum(truth)
        def click_opts(idx):
            for i in idx: pg.click('.lg-opt[data-i="%d"]' % i)
        right = [i for i in range(4) if truth[i]]; wrong = [i for i in range(4) if not truth[i]]
        if mode == 'perfect':
            click_opts(right); submit(pg, route); s = st(pg); rec(s['fh'] == '正解', '③ 正解 %r' % s['fh'])
        elif mode == 'empty':
            submit(pg, route); s = st(pg); rec('選んでいません' in s['fh'] and s['chips'] == ['yet'], '③ 何も選ばないで答え合わせ→試行に数えない %r %s' % (s['fh'], s['chips']))
            click_opts(right); submit(pg, route); s = st(pg); rec(s['fh'] == '正解', '③ 空のあとの正解は 1 回目 %r' % s['fh'])
        elif mode == 'one':
            perfect = False
            click_opts(right + [wrong[0]]); submit(pg, route); s = st(pg)                              # 過不足：誤って選んだ
            ps = pick_state(pg)
            rec(s['fh'].startswith('おしい') and s['hint'] != '' and sum(1 for p in ps if p['bad']) == 1 and ps[wrong[0]]['bad'], '③ 誤って選んだ：赤は 1 つ・ヒントあり %r %s' % (s['fh'], s['hint'][:30]))
            rec('A＝' in s['hint'] or 'A＝' in s['fd'] or 'のとき' in s['hint'], '③ 反例の行が出る %r' % s['hint'])
            pg.click('.lg-opt[data-i="%d"]' % wrong[0]); submit(pg, route); s = st(pg); rec(s['fh'] == '正解（2回目）', '③ 直して 2 回目で正解 %r' % s['fh'])
        else:
            perfect = False
            wsel = wrong[:1]
            click_opts(wsel); submit(pg, route); s = st(pg); rec(s['fh'].startswith('おしい'), '③ 1回目の誤り %r' % s['fh'])
            submit(pg, route); s = st(pg); rec(s['fh'].startswith('正しい値はこれです'), '③ 2回目も誤りで値を見せる %r' % s['fh'])
            outs = pg.evaluate("()=>[...document.querySelectorAll('.lg-optout')].map(e=>e.textContent)")
            rec(all(o.startswith('出力 L：') for o in outs), '③ 値を見せたとき各選択肢の出力の列が並ぶ %s' % outs)
            ps = pick_state(pg); rec([p['on'] for p in ps] == truth, '③ 値を見せたとき正解の選択肢が選ばれて見える')
        return perfect
    c = circuit(pg); models = stage_models(c, kind)
    for si_idx, model in enumerate(models):
        s0 = st(pg); si = s0['si']
        m = mode
        if m == 'perfect':
            (fill_taps(pg, si, model, touch) if style == 'tap' else fill_keys(pg, si, model, style)); submit(pg, route)
            s = st(pg); rec(s['fh'] in ('正解',), 'perfect：1回目で正解 %r（%s）' % (s['fh'], si_idx))
        elif m == 'empty':
            # 空きを残して答え合わせ：試行に数えず，あと N マス．先頭の空きへ戻る
            skip = (len(model) - 1, len(model[0]) - 1)
            # 最後のマスだけ空のまま：先頭から 1 つ手前までを入れる
            for c_i, col in enumerate(model):
                for r_i, v in enumerate(col):
                    if (c_i, r_i) != skip: tap_cell(pg, si, c_i, r_i, v, touch)
            submit(pg, route); s = st(pg)
            rec(s['fh'] == 'あと 1 マス入れよう' and s['chips'][si_idx] != 'ng' and s['si'] == si, 'empty：空きがあるときは数えない %r %s' % (s['fh'], s['chips']))
            tap_cell(pg, si, skip[0], skip[1], model[skip[0]][skip[1]], touch); submit(pg, route); s = st(pg)
            rec(s['fh'] == '正解', 'empty のあとは 1 回目で正解 %r' % s['fh'])
        elif m == 'one':
            perfect = False
            fill_taps(pg, si, model, touch, flips=((0, 0),)); submit(pg, route); s = st(pg)
            rec(s['fh'].startswith('おしい') and s['bad'] == 1 and s['hint'] != '' and '行目' in s['fd'], 'one：1回目の誤り（赤 1・ヒント・文） %r %s %r' % (s['fh'], s['bad'], s['fd']))
            rec(s['chips'][si_idx] == 'ng', 'one：チップが × になる %s' % s['chips'])
            tap_cell(pg, si, 0, 0, model[0][0], touch); submit(pg, route); s = st(pg)
            rec(s['fh'] == '正解（2回目）', 'one：2回目で正解 %r' % s['fh'])
        else:
            perfect = False
            fill_taps(pg, si, model, touch, flips=tuple((c_i, r_i) for c_i in range(len(model)) for r_i in range(len(model[0]))))
            submit(pg, route); s = st(pg); rec(s['fh'].startswith('おしい') and s['bad'] == len(model) * len(model[0]), 'two：1回目の誤り %r %s' % (s['fh'], s['bad']))
            submit(pg, route); s = st(pg)
            rec(s['fh'].startswith('正しい値はこれです'), 'two：2回目も誤りで値を見せる %r' % s['fh'])
        # 解決した段の値は模範（確定）
        locked = pg.evaluate("si=>[...document.querySelectorAll('.lg-cell[data-si=\"'+si+'\"]')].map(c=>[+c.dataset.c,+c.dataset.r,c.textContent,c.classList.contains('lg-locked')])", si)
        rec(all(l and t == model[c_i][r_i] for c_i, r_i, t, l in locked), '解決した段の値が模範（確定）になる（%s）' % si)
    s = st(pg); rec(s['btn'] == '次の問題へ', '解き終わると「次の問題へ」 %r' % s['btn'])
    return perfect

def go_next(pg, route):
    pg.wait_for_timeout(450)
    if route == 'enter': pg.keyboard.press('Enter')
    else: pg.click('#lg-check')
    pg.wait_for_timeout(60)

def open_kind(pg, kind, lv):
    goto_ok(pg, URL + '#logic-' + kind)
    pg.wait_for_selector('#lg-play-screen.active')
    if kind != 'basic':
        pg.click('.lg-lbtn[data-lv="%d"]' % lv)

COMBOS = [('basic', 1), ('combine', 1), ('combine', 2), ('choose', 1), ('choose', 2), ('adder', 1), ('adder', 2)]
def run_solve(b):
    # 1) タッチ（375×812）：全種類×難易度を，タップで 4 通りのやり方で解く
    ctx = new_ctx(b, 375, 812, has_touch=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    goto_ok(pg, URL); pg.evaluate('localStorage.clear()')
    for kind, lv in COMBOS:
        open_kind(pg, kind, lv)
        n_tried = 0; n_perfect = 0
        modes = ['perfect', 'empty', 'one', 'two'] + ['perfect'] * 2
        for i, mode in enumerate(modes):
            p = solve_problem(pg, mode, True, 'button', 'tap'); n_tried += 1; n_perfect += 1 if p else 0
            go_next(pg, 'button')
        data = json.loads(pg.evaluate("localStorage.getItem('%s')" % KEY) or 'null')
        key = kind if kind == 'basic' else kind + str(lv)
        rec(data is not None and data['rec'][key]['tried'] == n_tried and data['rec'][key]['perfect'] == n_perfect, 'タップで %s：記録の問題数 %s（期待 %d／%d）' % (key, data and (data['rec'][key]['tried'], data['rec'][key]['perfect']), n_tried, n_perfect))
        # 解き終わり→次の問題で，位置が動かない・図に答えがない
        c = pg.get_attribute('#lg-fig svg', 'data-circuit') if kind != 'choose' else ''
        rec(c == '' or ('"table"' not in c and '"model"' not in c), 'data-circuit に答えがない')
    rec(not errs, 'タップの検査でエラー %s' % errs[:3])
    ctx.close()
    # 2) キーボード（1366×768）：半角・全角・テンキー・code だけ．Enter と答え合わせボタンの両方
    ctx = new_ctx(b, 1366, 768); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    goto_ok(pg, URL); pg.evaluate('localStorage.clear()')
    for kind, lv in [('basic', 1), ('combine', 1), ('combine', 2), ('adder', 1), ('adder', 2)]:
        open_kind(pg, kind, lv)
        for style in ('half', 'full', 'numpad', 'code'):
            for route in ('enter', 'button'):
                solve_problem(pg, 'perfect', False, route, style)
                go_next(pg, route)
    # キーの操作：矢印で移動・Backspace で空に・0/1 以外は断る・Tab は表全体で 1 つの停止位置
    open_kind(pg, 'combine', 2)
    for _ in range(40):                                              # 途中の線が 2 本以上の回路を出す（矢印で右の列へ移れる）
        if len(circuit(pg)['wires']) >= 2: break
        pg.click('.lg-lbtn[data-lv="1"]'); pg.click('.lg-lbtn[data-lv="2"]')
    s0 = st(pg); si = s0['si']
    pg.focus(cell_sel(si, 0, 0)); pg.keyboard.press('1'); pg.keyboard.press('ArrowRight')
    foc = pg.evaluate("document.activeElement.dataset.c+','+document.activeElement.dataset.r"); rec(foc == '1,1', '矢印で右の列へ移る %s（si=%s・列 %d）' % (foc, si, len(s0['chips'])))
    pg.keyboard.press('ArrowLeft'); pg.keyboard.press('Backspace')
    rec(cell_text(pg, si, 0, 1) == '', 'Backspace でそのマスを空にする')
    pg.keyboard.press('2'); rec('0 か 1 を入れよう' in pg.inner_text('#lg-cellmsg'), '0・1 以外は断る')
    tabs = pg.evaluate("document.querySelectorAll('.lg-cell[tabindex=\"0\"]').length"); rec(tabs == 1, 'Tab の停止位置は表全体で 1 つ（%d）' % tabs)
    # 空きを残して Enter とボタンは同じ状態
    pg.keyboard.press('Enter'); a = st(pg)['fh']; pg.click('#lg-check'); b2 = st(pg)['fh']
    rec(a == b2 and a.startswith('あと '), 'Enter と答え合わせボタンは同じ（空きを残すと断る）%r %r' % (a, b2))
    rec(not errs, 'キーボードの検査でエラー %s' % errs[:3])
    ctx.close()

def run_storage(b):
    ctx = new_ctx(b, 1366, 768); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    goto_ok(pg, URL); pg.evaluate('localStorage.clear()'); reload_ok(pg)
    open_kind(pg, 'combine', 1)
    for i in range(3):
        solve_problem(pg, 'perfect', False, 'enter', 'half'); go_next(pg, 'enter')
    saved = pg.evaluate("localStorage.getItem('%s')" % KEY); rec(saved is not None and '"combine1"' in saved, '記録が localStorage に書かれる')
    pg.click('#lg-back-btn'); tick = pg.inner_text('.lg-ticks[data-kind=combine]').replace('\n', ' ')
    rec('初級 ✓' in tick, '3 問連続で初級に ✓ %r' % tick)
    reload_ok(pg); goto_ok(pg, URL + '#logic'); pg.wait_for_selector('#lg-submenu-screen.active')
    tick = pg.inner_text('.lg-ticks[data-kind=combine]').replace('\n', ' '); rec('初級 ✓' in tick, '再読み込みしても ✓ が残る %r' % tick)
    pg.click('.lg-action-btn[data-action=combine]'); pg.click('#lg-mine-sum'); txt = pg.inner_text('#lg-mine-body'); rec('解いた問題 3 問' in txt, '「きみの記録」に 3 問 %r' % txt[:80]); pg.click('#lg-mine-sum')
    # 解き終わらずに離れる：連続は 0
    solve_problem(pg, 'perfect', False, 'enter', 'half'); go_next(pg, 'enter')
    pg.click('#lg-back-btn'); d = json.loads(pg.evaluate("localStorage.getItem('%s')" % KEY)); rec(d['rec']['combine1']['streak'] == 0 and d['rec']['combine1']['cleared'] is True, '解き終わらずに戻ると連続 0・✓ は残る %s' % d['rec']['combine1'])
    # 記録を消す（選んでいた種類・難易度は保つ）
    pg.click('.lg-action-btn[data-action=adder]'); pg.click('.lg-lbtn[data-lv="2"]'); pg.click('#lg-reset-btn'); rec(pg.is_visible('#lg-reset-confirm'), '記録を消す：確認が出る')
    rec(pg.evaluate("document.activeElement.id") == 'lg-reset-no', '確認の最初のフォーカスは「やめる」')
    ask = pg.inner_text('#lg-reset-ask'); rec('このカテゴリ（論理回路）の記録が消えます' in ask and 'ほかのカテゴリの記録は消えません' in ask and 'この端末の記録がすべて' not in ask, '確認の文は，このカテゴリの記録だけが消えると言う %r' % ask)
    pg.keyboard.press('Escape'); rec(not pg.is_visible('#lg-reset-confirm'), 'Esc で確認を閉じる')
    pg.click('#lg-reset-btn'); pg.click('#lg-reset-yes')
    after = json.loads(pg.evaluate("localStorage.getItem('%s') || 'null'" % KEY) or 'null')
    rec(after is None or all(c['tried'] == 0 and c['streak'] == 0 and not c['cleared'] for c in after['rec'].values()), '記録を消すと初期状態 %s' % (str(after)[:80],))
    rec(pg.get_attribute('.lg-kbtn[data-kind=adder]', 'aria-pressed') == 'true' and pg.get_attribute('.lg-lbtn[data-lv="2"]', 'aria-pressed') == 'true', '消したあとも種類・難易度が保たれる')
    # 壊れた値・巨大な値・想定外の型
    bads = ['{broken', 'null', '[1,2,3]', '"x"', '123', '{"v":1,"sel":{"kind":"zzz","lv":99},"rec":{"basic":{"tried":-1,"perfect":"a","streak":1e999,"stage":{"table":{"n":1e300}}},"combine1":[1],"adder2":null}}',
            '{"v":1,"rec":{"basic":{"tried":1e300,"perfect":1e300,"streak":1e300,"cleared":true,"stage":{"table":{"n":1e300,"miss1":1e300,"rev":1e300}}}}}', '{"v":1,"__proto__":{"x":1},"rec":{"__proto__":{"tried":5}}}', 'x' * 3000000]
    for sv in bads:
        pg.evaluate("v=>localStorage.setItem('%s', v)" % KEY, sv)
        reload_ok(pg); goto_ok(pg, URL + '#logic-combine'); pg.wait_for_selector('#lg-play-screen.active')
        rec(pg.inner_text('#lg-qtitle') != '', '壊れた記録でも開く %r' % sv[:30])
        pg.click('#lg-mine-sum'); txt = pg.inner_text('#lg-mine-body'); rec('NaN' not in txt and 'undefined' not in txt, '壊れた記録の表示 %r' % txt[:80]); pg.click('#lg-mine-sum')
    # localStorage が使えない・書けない端末
    ctx2 = new_ctx(b, 1366, 768); p2 = ctx2.new_page(); e2 = []
    p2.on('pageerror', lambda e: e2.append(str(e)))
    p2.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
    goto_ok(p2, URL + '#logic-combine'); p2.wait_for_selector('#lg-play-screen.active')
    solve_problem(p2, 'perfect', False, 'enter', 'half')
    rec(p2.is_visible('#lg-storage-note') and 'この端末では記録を残せません' in p2.inner_text('#lg-storage-note'), 'localStorage が使えないと小さく知らせる')
    rec('次の問題へ' in p2.inner_text('#lg-check'), 'localStorage が使えなくてもその場限りで動く')
    rec(not e2, 'localStorage が使えない端末でエラー %s' % e2[:2])
    ctx2.close()
    ctx3 = new_ctx(b, 1366, 768); p3 = ctx3.new_page(); e3 = []
    p3.on('pageerror', lambda e: e3.append(str(e)))
    p3.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}")
    goto_ok(p3, URL + '#logic-adder'); p3.wait_for_selector('#lg-play-screen.active')
    solve_problem(p3, 'perfect', False, 'enter', 'half')
    rec(not e3 and '次の問題へ' in p3.inner_text('#lg-check'), '書き込みが容量超過でも落ちない %s' % e3[:2])
    ctx3.close()
    rec(not errs, '記録の検査でエラー %s' % errs[:3])
    # 別タブ：B で記録を消すと A も読み直し，消す前の回数を書き戻さない
    ctx4 = new_ctx(b, 1366, 768); A = ctx4.new_page(); B = ctx4.new_page(); e4 = []
    A.on('pageerror', lambda e: e4.append(str(e))); B.on('pageerror', lambda e: e4.append(str(e)))
    goto_ok(A, URL); A.evaluate('localStorage.clear()'); goto_ok(A, URL + '#logic-combine'); A.wait_for_selector('#lg-play-screen.active')
    solve_problem(A, 'perfect', False, 'enter', 'half'); go_next(A, 'enter')
    goto_ok(B, URL + '#logic-combine'); B.wait_for_selector('#lg-play-screen.active')
    B.click('#lg-reset-btn'); B.click('#lg-reset-yes'); A.wait_for_timeout(300)
    A.click('#lg-mine-sum'); txt = A.inner_text('#lg-mine-body'); rec('解いた問題 0 問' in txt, '別タブ：A の「きみの記録」も 0 問に読み直す %r' % txt[:60]); A.click('#lg-mine-sum')
    solve_problem(A, 'perfect', False, 'enter', 'half')
    d = json.loads(A.evaluate("localStorage.getItem('%s')" % KEY)); rec(d['rec']['combine1']['tried'] == 1, '別タブ：消したあとに古い回数を書き戻さない tried=%s' % d['rec']['combine1']['tried'])
    rec(not e4, '別タブの検査でエラー %s' % e4[:2])
    ctx4.close()
    ctx.close()

def run_links(b):
    ctx = new_ctx(b, 1366, 768); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    goto_ok(pg, URL); pg.evaluate('localStorage.clear()')
    goto_ok(pg, URL + '#logic'); pg.wait_for_selector('#lg-submenu-screen.active')
    rec(pg.is_visible('#lg-submenu-screen') and not pg.is_visible('#menu-screen'), '#logic でサブメニューが開く')
    rec('はじめての人は「解説」から（3 分）' in pg.inner_text('#lg-first'), 'サブメニューの上部に導線の 1 行')
    rec(len(pg.query_selector_all('.lg-action-btn')) == 5, 'サブメニューのカードは 5 つ（解説＋4 種類）')
    for kind in ('basic', 'combine', 'choose', 'adder'):
        goto_ok(pg, URL + '#logic-' + kind); pg.wait_for_selector('#lg-play-screen.active')
        s = st(pg)
        rec(pg.get_attribute('.lg-kbtn[data-kind=%s]' % kind, 'aria-pressed') == 'true', '#logic-%s で練習へ直行する' % kind)
        rec(len(pg.query_selector_all('.lg-cell.lg-locked')) == 0 and len(pg.query_selector_all('.lg-optout:not(:empty)')) == 0, '#logic-%s：答えが出ていない' % kind)
        rec('表のマスを押すと 0 → 1 → 0 と変わる' in pg.inner_text('#lg-usage') or kind == 'choose', '練習画面に 1 行のつかい方 %s' % kind)
        rec(pg.is_visible('#lg-lvsw') == (kind != 'basic'), '難易度ボタンは AND・OR・NOT だけ出さない（%s）' % kind)
    goto_ok(pg, URL + '#logic-answer'); reload_ok(pg); rec(pg.is_visible('#menu-screen'), '知らない指定ではメニューのまま')
    # メニューのカード（幅 900px 以上は 2 列）
    goto_ok(pg, URL); n = pg.evaluate("document.querySelectorAll('#menu-screen .mode-grid > .card-btn').length"); rec(n == 6, 'メニューのカードは 6 枚')
    cols = pg.evaluate("getComputedStyle(document.querySelector('#menu-screen .mode-grid')).gridTemplateColumns.split(' ').length"); rec(cols == 2, '幅 1366 のメニューは 2 列 %d' % cols)
    pg.click('#lg-open-btn'); rec(pg.is_visible('#lg-submenu-screen'), 'メニューの 6 つ目のカードで開く')
    # 解説：6 ステップ（← → で進む）
    pg.click('.lg-action-btn[data-action=learn]'); rec(pg.is_visible('#lg-learn-screen'), '解説が開く')
    for i in range(5): pg.keyboard.press('ArrowRight')
    rec('全加算回路' in pg.inner_text('#lg-tutorial-card'), '解説の 6 ステップ目は全加算回路 %r' % pg.inner_text('#lg-tutorial-card')[:30])
    rec(len(pg.query_selector_all('#lg-step-indicators .step-dot')) == 6, '解説のインジケーターは 6 つ')
    pg.click('#lg-learn-next'); rec(pg.is_visible('#lg-submenu-screen'), '最後の「完了」でサブメニューへ戻る')
    pg.click('#lg-submenu-back-btn'); rec(pg.is_visible('#menu-screen'), 'カテゴリ選択に戻る')
    # 既存の 5 カテゴリのカードが開く
    for sel_, sub in (('[data-category="bin-dec"]', '#submenu-screen'), ('#bc-open-btn', '#bc-submenu-screen'), ('#bf-open-btn', '#bf-submenu-screen')):
        pg.click(sel_); rec(pg.is_visible(sub), '既存のカード %s が開く' % sel_)
        pg.click(sub + ' .btn-secondary:last-of-type') if sub == '#submenu-screen' else pg.click('#%s-submenu-back-btn' % sub[1:3])
        rec(pg.is_visible('#menu-screen'), '既存のカードから戻れる %s' % sel_)
    rec(not errs, '直リンクの検査でエラー %s' % errs[:3])
    ctx.close()

def run_net(b):
    """外部と通信しない：同じ場所のファイル以外の要求がない（Google Fonts の読み込みは既存のまま遮断）"""
    ctx = new_ctx(b, 1366, 768); pg = ctx.new_page()
    del REQS[:]
    goto_ok(pg, URL + '#logic-combine'); pg.wait_for_selector('#lg-play-screen.active')
    solve_problem(pg, 'perfect', False, 'enter', 'half'); go_next(pg, 'enter')
    open_kind(pg, 'choose', 2); solve_problem(pg, 'perfect', False, 'button', 'half')
    ext = [u for u in REQS if not u.startswith(ORIGIN) and 'fonts.googleapis.com' not in u and 'fonts.gstatic.com' not in u and not u.startswith('data:')]
    rec(not ext, '外部への要求がある %s' % ext[:3])
    ctx.close()

SIZES = [(1366, 768), (1280, 800), (1024, 768), (768, 1024), (820, 1180), (375, 812), (360, 740)]
def run_layout(b):
    out = []
    for (w, h) in SIZES:
        ctx = new_ctx(b, w, h); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL + ('&' if '?' in URL else '?') + 'selftest=1', wait_until='commit', timeout=120000)
        pg.wait_for_function('window.__lgSelftestResult !== undefined', timeout=300000)
        r = pg.evaluate('window.__lgSelftestResult'); r4 = pg.evaluate('window.__selftestResult'); r5 = pg.evaluate('window.__bfSelftestResult')
        L = r['extra']['domAudit']['layout']
        rec(r['totalFail'] == 0, '%dx%d 論理回路の自己検査 失敗 %d %s' % (w, h, r['totalFail'], r['failures'][:3]))
        rec(r4['totalFail'] == 0 and r5['totalFail'] == 0, '%dx%d 4 つ目・5 つ目の自己検査 失敗 %d／%d %s' % (w, h, r4['totalFail'], r5['totalFail'], (r4['failures'] + r5['failures'])[:3]))
        rec(L['overX'] == 0 and L.get('clipped', 0) == 0, '%dx%d 横スクロール・はみ出し 0 %s' % (w, h, {k: L.get(k) for k in ('overX', 'clipped', 'clipSample')}))
        if w >= 768 and h >= 768: rec(L['taller'] == 0 and L.get('learnTaller', 0) == 0, '%dx%d スクロールなし %s' % (w, h, {k: L.get(k) for k in ('taller', 'learnTaller', 'tallLabels')}))
        rec(L.get('overlap', 0) == 0 and L.get('cut', 0) == 0 and L.get('exProblems', 0) >= 60 and L.get('geomStates', 0) > 700, '%dx%d 要素の重なり・文字の切れ 0・全問題を測った %s' % (w, h, {k: L.get(k) for k in ('overlap', 'cut', 'exProblems', 'exStates', 'geomStates')}))
        if w <= 420: rec(L['minTap'] >= 44 and L['tapChecked'] > 1000, '%dx%d タップ領域 44px 以上（最小 %s・%s 個を測った）' % (w, h, L['minTap'], L['tapChecked']))
        rec(L['menuDoc'] <= h or w < 500, '%dx%d メニューが窓に収まる 文書 %s 枠の底 %s' % (w, h, L['menuDoc'], L['menuBottom']))
        print('   %dx%d: 練習 %d 状態（全問題 %d 問・%d 状態を含む）・重なり %s・切れ %s・縦スクロール %s・はみ出し %s・文書の最大高 %s・メニュー %s（枠の底 %s）・図の最大 %sx%s・最小タップ %s' % (w, h, L['states'], L['exProblems'], L['exStates'], L.get('overlap', 0), L.get('cut', 0), L['taller'], L.get('clipped', 0), L['maxDoc'], L['menuDoc'], L['menuBottom'], L.get('maxFigW'), L.get('maxFigH'), L['minTap']), flush=True)
        rec(not errs, '%dx%d エラー %s' % (w, h, errs[:2]))
        out.append((w, h, r['totalChecked'], r['totalFail'], r4['totalFail'], r5['totalFail'], L['states'], L['taller'], L['maxDoc']))
        ctx.close()
    return out

with sync_playwright() as p:
    b = p.chromium.launch()
    if 'solve' in PARTS: print('  solve', flush=True); run_solve(b)
    if 'storage' in PARTS: print('  storage', flush=True); run_storage(b)
    if 'links' in PARTS: print('  links', flush=True); run_links(b); run_net(b)
    lay = []
    if 'layout' in PARTS: print('  layout', flush=True); lay = run_layout(b)
    print('checks', count, 'fail', len(fails))
    for (w, h, c, f, f4, f5, stt, tl, md) in lay:
        print('  %dx%d  論理回路: 検査 %d 失敗 %d／4つ目 失敗 %d／5つ目 失敗 %d／練習の状態 %d・縦スクロール %d・文書の最大高 %d' % (w, h, c, f, f4, f5, stt, tl, md))
    for f in fails[:30]: print(' FAIL', f)
    b.close()
sys.exit(1 if fails else 0)
