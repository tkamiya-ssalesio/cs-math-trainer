# 実ブラウザ（Playwright の Chromium）で，2進数の小数の全入力経路と，幅ごとの収まりを確かめる．
#   python3 test/binary-fraction-e2e.py [種] [URL] [部分]      部分＝inputs,storage,layout のうち実行するもの（既定は全部．全部で 10 分前後）
#   先に別の端末で  python3 -m http.server 8765  を cs-math-trainer の直下で動かしておく（URL の既定は http://localhost:8765/index.html）．
# 確かめること：
#   1. 入力の方法（ビット欄）：Chrome 型の IME（compositionend のみ）・Safari 型（compositionend のあと input）・insertText・CDP の IME，それぞれ半角と全角
#      数の欄：1 文字ずつ・insertText・IME の確定・全角・日本語入力の「。」・「1」「1.0」「1.00」「.5」「0.50」の書き方の違い
#   2. 答え合わせ：空きを残して Enter／ボタン（同じ状態）→ 誤り（ヒント）→ 正解（2回目）／2回目も誤りで値を見せる／1回目で正解
#   3. 4 つの組み合わせ（10進数→2進数／2進数→10進数 × 初級／中級）の全段．答えは画面の題から，自分で（fractions で）計算する（アプリの内部は見ない）
#   4. 記録：解いたあと再読み込みしても残る／壊れた値・巨大な値でも落ちない／「記録を消す」／連続 3 問で ✓
#   5. 外部と通信しない（同じ場所のファイル以外の要求がない．既存の style.css の Google Fonts の読み込みだけは元のまま）
#   6. 幅ごと（1366×768・1280×800・1024×768・768×1024・820×1180）に，自己検査（?selftest=1）が失敗 0・スクロールなし・はみ出しなし
#   7. 4 つ目のカテゴリの自己検査（?selftest=1 で一緒に動く）が失敗 0
# 失敗があれば終了コード 1．
import re, sys, json, random
from fractions import Fraction
from decimal import Decimal
from playwright.sync_api import sync_playwright

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/index.html'
PARTS = (sys.argv[3] if len(sys.argv) > 3 else 'inputs,storage,layout').split(',')
ORIGIN = re.match(r'^(https?://[^/]+)', URL).group(1)

fails = []; count = 0
def rec(ok, msg):
    global count; count += 1
    if not ok: fails.append(msg)

def dec(fr):                                    # 分数 → 10 進の文字列（厳密．16 分の 1 の倍数）
    s = '{:f}'.format(Decimal(fr.numerator) / Decimal(fr.denominator))
    return s.rstrip('0').rstrip('.') if '.' in s else s
def dec1(fr):                                   # 紙の ×2 の答えの書き方（整数のときは 1.0）
    s = dec(fr); return s if '.' in s else s + '.0'
def ibits(n): return format(n, 'b')
def fbits(fr):                                  # 小数部分の 2 進数（2 を掛けることをくり返す）
    out = ''
    while fr > 0:
        fr *= 2; d = 1 if fr >= 1 else 0; out += str(d); fr -= d
    return out

def parse_title(t):
    t = t.strip()
    if t.endswith('(2)'):                       # 2進数 → 10進数
        b = t[:-3]; ip, fp = b.split('.')
        return 'b2d', (int(ip, 2) if ip != '0' else 0), sum(Fraction(int(c), 2 ** (i + 1)) for i, c in enumerate(fp)), ip, fp
    v = Fraction(Decimal(t)); I = int(v)
    return 'd2b', I, v - I, None, None

def stage_models(title, lv):
    """段ごとの模範：('bits', 文字列) | ('x2', ×2の答え, 整数, 小数部分) | ('place', [値…]) | ('sum', 値)"""
    kind, I, f, ip, fp = parse_title(title)
    out = []
    if kind == 'd2b':
        if lv == 2: out.append(('bits', ibits(I)))
        c = f; ints = ''
        while c > 0:
            x2 = c * 2; ig = 1 if x2 >= 1 else 0
            out.append(('x2', dec1(x2), str(ig), dec(c))); ints += str(ig); c = x2 - ig
        out.append(('bits', ints))
    else:
        vals = []
        if lv == 2:
            n = len(ip)
            for i, ch in enumerate(ip):
                if ch == '1': vals.append(str(2 ** (n - 1 - i)))
        for j, ch in enumerate(fp):
            if ch == '1': vals.append(dec(Fraction(1, 2 ** (j + 1))))
        out.append(('place', vals)); out.append(('sum', dec(I + f)))
    return kind, out

ACTIVE = '#bf-sheet input:not([disabled])'
JS_STATE = '''()=>{const a=document.activeElement;const cs=[...document.querySelectorAll('#bf-sheet input:not([disabled])')];
 return {vals:cs.map(c=>c.value), idx:cs.indexOf(a), fb:(document.querySelector('#bf-feedback .bf-fh')||{}).textContent||'', fd:(document.querySelector('#bf-feedback .bf-fd')||{}).textContent||'',
  hint:(document.querySelector('#bf-feedback .bf-fhint')||{}).textContent||'', cm:document.getElementById('bf-cellmsg').textContent,
  head:document.getElementById('bf-stagehead').textContent, bad:cs.map(c=>c.classList.contains('bf-bad')),
  chips:[...document.querySelectorAll('#bf-chips .bf-chip')].map(c=>c.className.replace(/bf-chip |bf-cur/g,'').trim()), btn:document.getElementById('bf-check').textContent,
  title:document.getElementById('bf-qtitle').innerText, extra:document.getElementById('bf-extra').textContent}}'''

def selall(pg): pg.evaluate('document.activeElement.select()')

def fw(t): return ''.join(chr(ord(c) + 0xFEE0) if c.isdigit() else ('．' if c == '.' else c) for c in t)

class Env:
    def __init__(s, pg, cdp): s.pg = pg; s.cdp = cdp
    def st(s): return s.pg.evaluate(JS_STATE)
    def comp(s, method, text):                  # フォーカス中の欄に，IME・insertText で入れる
        pg = s.pg
        if method == 'chrome': pg.evaluate('''t=>{const e=document.activeElement;e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));e.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:t}));e.value=t;e.dispatchEvent(new InputEvent('input',{bubbles:true,data:t,inputType:'insertCompositionText',isComposing:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:t}));}''', text)
        elif method == 'safari': pg.evaluate('''t=>{const e=document.activeElement;e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));e.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:t}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:t}));e.value=t;e.dispatchEvent(new InputEvent('input',{bubbles:true,data:t,inputType:'insertFromComposition',isComposing:false}));}''', text)
        elif method == 'insert': pg.keyboard.insert_text(text)
        elif method == 'cdp-ime':
            s.cdp.send('Input.imeSetComposition', {'text': text, 'selectionStart': len(text), 'selectionEnd': len(text)})
            s.cdp.send('Input.insertText', {'text': text})
        else: raise Exception(method)
    def bulk(s, method, text):                  # ビット欄用（全角は method の末尾 -fw）
        if method.endswith('-fw'): s.comp(method[:-3], fw(text))
        else: s.comp(method, text)
    def check(s, route):
        if route == 'enter': s.pg.keyboard.press('Enter')
        else: s.pg.click('#bf-check')
    def focus_field(s, i):
        s.pg.evaluate("i=>{const cs=document.querySelectorAll('#bf-sheet input:not([disabled])');cs[i].focus()}", i)
    def fill_stage(s, m, method='insert', variant=0):
        """段の模範 m を入れる（欄ごとに選んで入れる）"""
        if m[0] == 'bits':
            s.focus_field(0); s.bulk(method, m[1])
        elif m[0] == 'x2':
            s.focus_field(0); selall(s.pg); s.comp(method, vary(m[1], variant)); s.focus_field(1); selall(s.pg); s.comp(method, m[2])
        elif m[0] == 'place':
            for i, v in enumerate(m[1]):
                s.focus_field(i); selall(s.pg); s.comp(method, vary(v, variant))
        else:
            s.focus_field(0); selall(s.pg); s.comp(method, vary(m[1], variant))
    def to_stage(s, models, k):                 # k 段目の手前まで正解で進める
        for i in range(k):
            s.fill_stage(models[i]); s.check('enter')
    def new_problem(s, kind, lv):
        pg = s.pg
        pg.click('.bf-kbtn[data-kind=%s]' % ('b2d' if kind == 'd2b' else 'd2b')); pg.click('.bf-lbtn[data-lv="%d"]' % lv)
        pg.click('.bf-kbtn[data-kind=%s]' % kind)
        # 同じ組み合わせで新しい問題：別の種類を経由した

def vary(v, variant):
    """数の欄の書き方の違い（同じ値）"""
    if variant == 0: return v
    forms = [v]
    if '.' in v:
        ip, fp = v.split('.')
        forms += [v + '0', v + '00', '0' + v, fw(v), v.replace('.', '。'), ' ' + v + ' ']
        if ip == '0': forms.append(v[1:])
        if fp == '0': forms += [ip, ip + '.']
    else:
        forms += [v + '.0', v + '.00', '0' + v, fw(v), v + '.', ' ' + v]
    return forms[variant % len(forms)]

def wrong_of(m):
    if m[0] == 'bits': return m[1][:-1] + ('1' if m[1][-1] == '0' else '0')
    if m[0] == 'x2': return ('9.5', m[2])
    if m[0] == 'place': return ['7'] * len(m[1])
    return '99'

def enter_wrong(env, m, method='insert'):
    if m[0] == 'bits': env.focus_field(0); env.bulk(method, wrong_of(m))
    elif m[0] == 'x2': env.focus_field(0); selall(env.pg); env.comp(method, '9.5'); env.focus_field(1); selall(env.pg); env.comp(method, m[2])
    elif m[0] == 'place':
        for i in range(len(m[1])): env.focus_field(i); selall(env.pg); env.comp(method, '7')
    else: env.focus_field(0); selall(env.pg); env.comp(method, '99')

NMETH = ['chrome', 'safari', 'insert', 'cdp-ime']
BMETH = ['chrome', 'chrome-fw', 'safari', 'safari-fw', 'insert', 'insert-fw', 'cdp-ime']

def run_inputs(b, p):
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []; reqs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: reqs.append(r.url))
    cdp = ctx.new_cdp_session(pg)
    pg.goto(URL); pg.click('#bf-open-btn'); E = Env(pg, cdp)
    for kind in ('d2b', 'b2d'):
        for lv in (1, 2):
            if pg.is_visible('#bf-back-btn'): pg.click('#bf-back-btn')
            pg.click('#bf-submenu-screen .bf-diff-btn[data-lv="%d"]' % lv)
            pg.click('.bf-action-btn[data-action=%s]' % kind)
            tag0 = '%s%d' % (kind, lv)
            print('  inputs', tag0, flush=True)
            maxst = 2 if kind == 'b2d' else (5 if lv == 1 else 6)
            def fresh(want=None):                # 新しい問題（条件に合う題が出るまで）
                for _ in range(60):
                    E.new_problem(kind, lv)
                    t = pg.inner_text('#bf-qtitle')
                    k2, ms = stage_models(t, lv)
                    if want is None or want(ms): return t, ms
                return t, ms
            # 最後まで通して解く（書き方の違い・入力の方法を変えながら）
            for n in range(12):
                t, ms = fresh()
                meth = (NMETH if True else BMETH)[n % len(NMETH)]
                for si, m in enumerate(ms):
                    st0 = E.st()
                    rec(('段 %d／%d' % (si + 1, len(ms))) in st0['head'] and all(v == '' for v in st0['vals']) and st0['idx'] == 0, '%s %s 段%d の始まり（空・先頭にフォーカス）%s' % (tag0, t, si, st0))
                    method = (BMETH if m[0] == 'bits' else NMETH)[(n + si) % (len(BMETH) if m[0] == 'bits' else len(NMETH))]
                    E.fill_stage(m, method, variant=n + si)
                    E.check(random.choice(['enter', 'button']))
                    st1 = E.st()
                    last = si == len(ms) - 1
                    if not last: rec(('段 %d／%d' % (si + 2, len(ms))) in st1['head'] and st1['fb'] == '正解', '%s %s 段%d 正解 → fb=%r head=%r method=%s vals=%s' % (tag0, t, si, st1['fb'], st1['head'], method, st1['vals']))
                    else: rec('おわり' in st1['head'] and st1['btn'] == '次の問題へ', '%s %s 最後の段 fb=%r head=%r' % (tag0, t, st1['fb'], st1['head']))
                st = E.st()
                rec(st['chips'].count('bf-ok') == len(ms) and ('全段 1回目で正解' in pg.inner_text('#bf-feedback')), '%s %s 全段 1回目で正解 chips=%s' % (tag0, t, st['chips']))
                if kind == 'd2b': rec(st['extra'].startswith('確かめ：'), '%s 確かめの式 %r' % (tag0, st['extra']))
                pg.keyboard.press('Enter'); pg.wait_for_timeout(450); pg.keyboard.press('Enter')    # 解き終わり後の Enter は次の問題へ（0.4 秒は受けない）
                st = E.st(); rec(st['btn'] == '答え合わせ' and all(v == '' for v in st['vals']), '%s Enter で次の問題へ btn=%r' % (tag0, st['btn']))
            # 空きを残して Enter／ボタン（同じ状態）
            for si in range(min(3, maxst)):
                for route in ('enter', 'button'):
                    t, ms = fresh(lambda ms: len(ms) > si)
                    E.to_stage(ms, si); m = ms[si]
                    if m[0] == 'x2':
                        E.focus_field(0); E.comp('insert', m[1]); E.check(route); s1 = E.st()      # 整数が空
                        rec('整数' in s1['fb'] and s1['idx'] == 1 and ('段 %d／' % (si + 1)) in s1['head'], '%s 空きを残して %s（整数）%s' % (tag0, route, s1))
                        E.comp('insert', m[2]); E.check(route); s2 = E.st(); rec(s2['fb'] == '正解' or s2['fb'].startswith('正解'), '%s 空き→入力→正解 %s' % (tag0, s2))
                    elif m[0] == 'bits' and len(m[1]) == 1:
                        E.check(route); s1 = E.st(); rec(s1['fb'] == 'あと1マス入れよう' and s1['idx'] == 0, '%s 空のまま %s（1 マス）%s' % (tag0, route, s1))
                    elif m[0] == 'bits':
                        E.focus_field(0); E.bulk('insert', m[1][:-1]); E.check(route); s1 = E.st()
                        rec(s1['fb'] == 'あと1マス入れよう' and s1['idx'] == len(m[1]) - 1 and s1['chips'][si] == 'bf-yet', '%s 空きを残して %s（ビット）%s' % (tag0, route, s1))
                        E.comp('insert', m[1][-1]); E.check(route); s2 = E.st(); rec(s2['fb'].startswith('正解'), '%s 残りを入れて %s %s' % (tag0, route, s2))
                    elif m[0] == 'place':
                        E.focus_field(0); E.comp('insert', m[1][0]); E.check(route); s1 = E.st()
                        if len(m[1]) >= 2: rec(s1['fb'].startswith('あと') and s1['idx'] == 1, '%s 空きを残して %s（位取り）%s' % (tag0, route, s1))
                    else:
                        E.check(route); s1 = E.st(); rec(s1['fb'] == '和を入れよう' and s1['idx'] == 0, '%s 空で %s（和）%s' % (tag0, route, s1))
            # 誤り → ヒント → 正解（2回目）／2回目も誤りで値を見せる
            for si in range(maxst):
                for mode in ('ok2', 'rev'):
                    t, ms = fresh(lambda ms: len(ms) > si)
                    E.to_stage(ms, si); m = ms[si]
                    enter_wrong(E, m); E.check('enter'); s1 = E.st()
                    rec(s1['fb'].startswith('おしい') and s1['hint'] != '' and ('段 %d／' % (si + 1)) in s1['head'] and s1['chips'][si] == 'bf-ng' and any(s1['bad']), '%s %s 誤り(段%d) → fb=%r hint=%r bad=%s' % (tag0, t, si, s1['fb'], s1['hint'], s1['bad']))
                    rec(s1['idx'] == s1['bad'].index(True), '%s 誤りのあと，最初の赤い欄にフォーカス idx=%s bad=%s' % (tag0, s1['idx'], s1['bad']))
                    if mode == 'ok2':
                        E.fill_stage(m); E.check('button'); s2 = E.st()
                        rec(s2['fb'] == '正解（2回目）' or (si == len(ms) - 1 and s2['fb'].startswith('正解（2回目）')), '%s 2回目で正解 fb=%r' % (tag0, s2['fb']))
                    else:
                        enter_wrong(E, m); E.check('enter'); s2 = E.st()
                        last = si == len(ms) - 1
                        rec(('正しい値はこれです' in s2['fb']) and (last or ('段 %d／' % (si + 2)) in s2['head']), '%s 2回目も誤り → 値を見せる fb=%r head=%r' % (tag0, s2['fb'], s2['head']))
                        if not last:
                            # 次の段は模範の値の上から始まる（前の段の欄は模範の値で固定）
                            vals = pg.evaluate("()=>[...document.querySelectorAll('#bf-sheet input[disabled]')].map(e=>e.value).filter(v=>v!=='')")
                            rec(len(vals) > 0, '%s 値を見せた段が模範の値で固定される %s' % (tag0, vals))
            if kind == 'd2b':
                # ビット欄：1 文字ずつ・Backspace・矢印・Home/End・途中まで一括→全桁一括・誤り→まとめて打ち直し
                for _ in range(3):
                    t, ms = fresh(lambda ms: any(x[0] == 'bits' and len(x[1]) >= 3 for x in ms))
                    si = [i for i, x in enumerate(ms) if x[0] == 'bits' and len(x[1]) >= 3][-1]
                    E.to_stage(ms, si); m = ms[si]; L = len(m[1])
                    E.focus_field(0)
                    for ch in m[1]: pg.keyboard.type(ch)
                    st = E.st(); rec(''.join(st['vals']) == m[1] and st['idx'] == L - 1, '%s ビット欄を 1 文字ずつ（左から右）vals=%s idx=%s' % (tag0, st['vals'], st['idx']))
                    pg.keyboard.press('Backspace'); st = E.st(); rec(st['vals'][-1] == '' and st['idx'] == L - 1, '%s Backspace で今のマスを消す %s' % (tag0, st))
                    pg.keyboard.press('Backspace'); st = E.st(); rec(st['vals'][L - 2] == '' and st['idx'] == L - 2, '%s もう 1 回 Backspace で左のマスを消す %s' % (tag0, st))
                    pg.keyboard.press('Home'); st = E.st(); rec(st['idx'] == 0, '%s Home' % tag0)
                    pg.keyboard.press('End'); st = E.st(); rec(st['idx'] == L - 1, '%s End' % tag0)
                    pg.keyboard.press('ArrowLeft'); st = E.st(); rec(st['idx'] == L - 2, '%s ←' % tag0)
                    pg.keyboard.type('x'); st = E.st(); rec('0 か 1' in st['cm'], '%s 0・1 以外は断る %s' % (tag0, st['cm']))
                    E.focus_field(0)
                    for method in BMETH:
                        for k in sorted(set([2, max(2, L // 2)])):
                            if k >= L: continue
                            E.focus_field(0); E.bulk(method, m[1][:k]); E.bulk(method, m[1]); st = E.st()
                            rec(''.join(st['vals']) == m[1], '%s 途中まで一括→全桁一括 %s k=%d vals=%s' % (tag0, method, k, st['vals']))
                    # 誤り→全桁一括で正解（2回目）
                    E.focus_field(0); E.bulk('insert', wrong_of(m)); E.check('enter'); st = E.st(); rec(st['fb'].startswith('おしい'), '%s ビット欄の誤り %s' % (tag0, st))
                    E.bulk('insert-fw', m[1]); st = E.st(); rec(''.join(st['vals']) == m[1], '%s 誤り→全角で全桁打ち直し vals=%s' % (tag0, st['vals']))
                    E.check('button'); st = E.st(); rec(st['fb'].startswith('正解（2回目）'), '%s 打ち直して正解（2回目）%s' % (tag0, st['fb']))
            # 数の欄：数字と「.」以外は断る・全角・「。」・長さの上限
            t, ms = fresh(lambda ms: any(x[0] in ('x2', 'place', 'sum') for x in ms))
            si = [i for i, x in enumerate(ms) if x[0] in ('x2', 'place', 'sum')][0]
            E.to_stage(ms, si); E.focus_field(0)
            pg.keyboard.type('a'); st = E.st(); rec(st['vals'][0] == '' and '数字と' in st['cm'], '%s 数の欄は文字を断る %s' % (tag0, st))
            pg.keyboard.type('1,'); st = E.st(); rec(st['vals'][0] == '1' and '数字と' in st['cm'], '%s 「,」は捨てる %s' % (tag0, st['vals'])); pg.keyboard.type('5'); st = E.st(); rec(st['vals'][0] == '15', '%s 「,」を捨てたあと続けて打てる %s' % (tag0, st['vals']))
            E.focus_field(0); selall(pg); pg.keyboard.type('1..2'); st = E.st(); rec(st['vals'][0] == '1.2', '%s 小数点は 1 つだけ %s' % (tag0, st['vals']))
            E.focus_field(0); selall(pg); E.comp('insert', '９' * 100); st = E.st(); rec(len(st['vals'][0]) <= 12, '%s 数の欄は 12 文字まで %s' % (tag0, len(st['vals'][0])))
            E.focus_field(0); selall(pg); E.comp('insert', '１．２'); st = E.st(); rec(st['vals'][0] == '1.2', '%s 全角の数字とピリオド %s' % (tag0, st['vals']))
            E.focus_field(0); selall(pg); E.comp('chrome', '1。5'); st = E.st(); rec(st['vals'][0] == '1.5', '%s 日本語入力のピリオド「。」 %s' % (tag0, st['vals']))
            if ms[si][0] == 'x2':
                E.focus_field(1); E.comp('insert', 'ab'); st = E.st(); rec(st['vals'][1] == '' and '数字だけ' in st['cm'], '%s 整数の欄は数字だけ %s' % (tag0, st))
                E.focus_field(1); E.comp('insert', '１２３'); st = E.st(); rec(len(st['vals'][1]) <= 2, '%s 整数の欄は 2 文字まで %s' % (tag0, st['vals']))
            if kind == 'd2b':
                # 貼り付けはビット欄だけ断る
                t, ms = fresh(lambda ms: any(x[0] == 'bits' for x in ms))
                si = [i for i, x in enumerate(ms) if x[0] == 'bits'][0]
                E.to_stage(ms, si); E.focus_field(0)
                pg.evaluate("()=>{const e=document.activeElement;const dt=new DataTransfer();dt.setData('text','11');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));}")
                st = E.st(); rec(all(v == '' for v in st['vals']) and '貼り付け' in st['cm'], '%s ビット欄は貼り付けない %s' % (tag0, st))
    rec(not errs, 'コンソールのエラー %s' % errs[:3])
    # 外部と通信しない：同じ場所のファイルと，既存の style.css が読み込む Google Fonts 以外の要求がない
    bad = [u for u in reqs if not u.startswith(ORIGIN) and not u.startswith('data:') and 'fonts.googleapis.com' not in u and 'fonts.gstatic.com' not in u]
    rec(not bad, '外部への要求 %s' % bad[:5])
    own = [u for u in reqs if 'binary-fraction' in u]
    rec(all(u.startswith(ORIGIN) for u in own) and len(own) >= 3, '新しいファイルの要求は同じ場所だけ %s' % own)
    ctx.close()

def run_gate(b):
    # ?selftest=10 などでは自己検査が動かない（値がちょうど 1 のときだけ）
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page()
    for q in ('?selftest=10', '?selftest=', '?x=selftest=1', '?selftest=0'):
        pg.goto(URL + q); pg.wait_for_timeout(1500)
        rec(pg.evaluate("typeof window.__bfSelftestResult") == 'undefined' and not pg.is_visible('#bf-selftest-note'), '%s では自己検査が動かない' % q)
    pg.goto(URL + '?selftest=1&z=1'); pg.wait_for_function('window.__bfSelftestResult !== undefined', timeout=120000)
    rec(pg.is_visible('#bf-selftest-note') and '記録は保存されません' in pg.inner_text('#bf-selftest-note'), '自己検査中は画面の隅に知らせる')
    ctx.close()

def run_storage(b):
    # 記録：解いたあと再読み込みしても残る・連続 3 問で ✓・記録を消す・壊れた値・巨大な値
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    cdp = ctx.new_cdp_session(pg); E = Env(pg, cdp)
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload()
    pg.click('#bf-open-btn'); pg.click('#bf-submenu-screen .bf-diff-btn[data-lv="1"]'); pg.click('.bf-action-btn[data-action=d2b]')
    def solve_perfect():
        t = pg.inner_text('#bf-qtitle'); kind, ms = stage_models(t, 1)
        for m in ms: E.fill_stage(m); E.check('enter')
        pg.wait_for_timeout(450); pg.keyboard.press('Enter')
    for i in range(3):
        solve_perfect()
    pg.click('#bf-back-btn')
    tick = pg.inner_text('.bf-ticks[data-kind=d2b]'); rec('初級 ✓' in tick.replace('\n', ' '), '3 問連続で初級に ✓ %r' % tick)
    saved = pg.evaluate("localStorage.getItem('csMathTrainer.binaryFraction.v1')"); rec(saved is not None and '"d2b1"' in saved, '記録が localStorage に書かれる')
    pg.reload(); pg.click('#bf-open-btn'); tick = pg.inner_text('.bf-ticks[data-kind=d2b]'); rec('初級 ✓' in tick.replace('\n', ' '), '再読み込みしても ✓ が残る %r' % tick)
    pg.click('.bf-action-btn[data-action=d2b]'); pg.click('#bf-mine-sum'); txt = pg.inner_text('#bf-mine-body'); rec('解いた問題 3 問' in txt, '「きみの記録」に 3 問 %r' % txt[:80])
    pg.click('#bf-mine-sum')
    # 記録を消す（選んでいた向き・難易度は保つ）
    pg.click('.bf-kbtn[data-kind=b2d]'); pg.click('.bf-lbtn[data-lv="2"]'); pg.click('#bf-reset-btn'); rec(pg.is_visible('#bf-reset-confirm'), '記録を消す：確認が出る')
    rec(pg.evaluate("document.activeElement.id") == 'bf-reset-no', '確認の最初のフォーカスは「やめる」')
    pg.click('#bf-reset-yes')
    after = json.loads(pg.evaluate("localStorage.getItem('csMathTrainer.binaryFraction.v1') || 'null'") or 'null')
    rec(after is None or all(c['tried'] == 0 and c['streak'] == 0 and not c['cleared'] for c in after['rec'].values()), '記録を消すと記録が初期状態になる %s' % (str(after)[:80],))
    rec(pg.get_attribute('.bf-kbtn[data-kind=b2d]', 'aria-pressed') == 'true' and pg.get_attribute('.bf-lbtn[data-lv="2"]', 'aria-pressed') == 'true', '消したあとも向き・難易度が保たれる')
    # 壊れた値・巨大な値・想定外の型
    bads = ['{broken', 'null', '[1,2,3]', '"x"', '123', '{"v":1,"sel":{"kind":"zzz","lv":99},"rec":{"d2b1":{"tried":-1,"perfect":"a","streak":1e999,"stage":{"rows":{"n":1e300}}},"b2d2":[1],"d2b2":null}}',
            '{"v":1,"rec":{"d2b1":{"tried":1e300,"perfect":1e300,"streak":1e300,"cleared":true,"stage":{"rows":{"n":1e300,"miss1":1e300,"rev":1e300}}}}}', 'x' * 3000000]
    for sv in bads:
        pg.evaluate("v=>localStorage.setItem('csMathTrainer.binaryFraction.v1', v)", sv)
        pg.reload(); pg.click('#bf-open-btn'); pg.click('.bf-action-btn[data-action=d2b]')
        t = pg.inner_text('#bf-qtitle'); rec(t != '', '壊れた記録でも開く %r' % sv[:30])
        pg.click('#bf-mine-sum'); txt = pg.inner_text('#bf-mine-body'); rec('NaN' not in txt and 'undefined' not in txt, '壊れた記録の表示 %r' % txt[:80]); pg.click('#bf-mine-sum')
    # localStorage が使えない・書けない端末
    ctx2 = b.new_context(viewport={'width': 1366, 'height': 768}); p2 = ctx2.new_page(); e2 = []
    p2.on('pageerror', lambda e: e2.append(str(e)))
    p2.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
    p2.goto(URL); p2.click('#bf-open-btn'); p2.click('.bf-action-btn[data-action=b2d]'); E2 = Env(p2, ctx2.new_cdp_session(p2))
    t = p2.inner_text('#bf-qtitle'); kind, ms = stage_models(t, 1)
    for m in ms: E2.fill_stage(m); E2.check('enter')
    rec(p2.is_visible('#bf-storage-note') and 'この端末では記録を残せません' in p2.inner_text('#bf-storage-note'), 'localStorage が使えないと小さく知らせる')
    rec('おわり' in p2.inner_text('#bf-stagehead'), 'localStorage が使えなくてもその場限りで動く')
    rec(not e2, 'localStorage が使えない端末でエラー %s' % e2[:2])
    ctx2.close()
    # 容量超過（setItem が投げる）
    ctx3 = b.new_context(viewport={'width': 1366, 'height': 768}); p3 = ctx3.new_page(); e3 = []
    p3.on('pageerror', lambda e: e3.append(str(e)))
    p3.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}")
    p3.goto(URL); p3.click('#bf-open-btn'); p3.click('.bf-action-btn[data-action=d2b]')
    E3 = Env(p3, ctx3.new_cdp_session(p3)); t = p3.inner_text('#bf-qtitle'); kind, ms = stage_models(t, 1)
    for m in ms: E3.fill_stage(m); E3.check('enter')
    rec(not e3 and 'おわり' in p3.inner_text('#bf-stagehead'), '書き込みが容量超過でも落ちない %s' % e3[:2])
    ctx3.close()
    rec(not errs, '記録の検査でエラー %s' % errs[:3])
    ctx.close()

SIZES = [(1366, 768), (1280, 800), (1024, 768), (768, 1024), (820, 1180)]
def run_layout(b):
    out = []
    for (w, h) in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL + ('&' if '?' in URL else '?') + 'selftest=1')
        pg.wait_for_function('window.__bfSelftestResult !== undefined && window.__selftestResult !== undefined', timeout=300000)
        r = pg.evaluate('window.__bfSelftestResult'); r4 = pg.evaluate('window.__selftestResult')
        L = r['extra']['domAudit']['layout']
        rec(r['totalFail'] == 0, '%dx%d 2進数の小数の自己検査 失敗 %d %s' % (w, h, r['totalFail'], r['failures'][:3]))
        rec(r4['totalFail'] == 0, '%dx%d 4 つ目のカテゴリの自己検査 失敗 %d %s' % (w, h, r4['totalFail'], r4['failures'][:3]))
        rec(L['taller'] == 0 and L.get('learnTaller', 0) == 0 and L['overX'] == 0 and L.get('clipped', 0) == 0, '%dx%d スクロールなし・はみ出しなし %s' % (w, h, L))
        rec(not errs, '%dx%d エラー %s' % (w, h, errs[:2]))
        out.append((w, h, r['totalChecked'], r['totalFail'], r4['totalChecked'], r4['totalFail'], L['states'], L['taller'], L['maxDoc'], L.get('learnTaller', 0), L.get('clipped', 0)))
        ctx.close()
    return out

with sync_playwright() as p:
    b = p.chromium.launch()
    if 'inputs' in PARTS: run_inputs(b, p)
    if 'storage' in PARTS: print('  storage', flush=True); run_gate(b); run_storage(b)
    print('  layout', flush=True)
    lay = run_layout(b) if 'layout' in PARTS else []
    print('checks', count, 'fail', len(fails))
    for (w, h, c, f, c4, f4, st, tl, md, lt, cl) in lay:
        print('  %dx%d  新: 検査 %d 失敗 %d／4つ目: 検査 %d 失敗 %d／練習の状態 %d・縦スクロール %d・文書の最大高 %d・解説の縦スクロール %d・はみ出し %d' % (w, h, c, f, c4, f4, st, tl, md, lt, cl))
    for f in fails[:30]: print(' FAIL', f)
    b.close()
sys.exit(1 if fails else 0)
