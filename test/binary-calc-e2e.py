# 実ブラウザ（Playwright の Chromium）で，まとめて入力と答え合わせの全経路を確かめる．
#   python3 test/binary-calc-e2e.py [種] [URL] [幅] [高さ]
#   先に別の端末で  python3 -m http.server 8765  を cs-math-trainer の直下で動かしておく（URL の既定は http://localhost:8765/index.html）．
# 入力の方法：Chrome 型の IME（compositionend のみ）・Safari 型（compositionend のあと input が二重に来る）・insertText・CDP の IME，それぞれ半角と全角．
# 経路：空きを残して Enter／「答え合わせ」ボタン → 全桁を一括 → 正解／途中まで一括 → 全桁を一括／誤り → 打ち直し（正解（2回目））／1 文字ずつ／フォーカス位置／Backspace．
# 4・8 ビットの 補数を求める・足し算・補数を使った引き算（③ の各段）．答えは画面の題から自分で計算する（アプリの内部は見ない）．失敗があれば終了コード 1．
import re, sys, json, random
from playwright.sync_api import sync_playwright

random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 1)
URL=sys.argv[2] if len(sys.argv)>2 else 'http://localhost:8765/index.html'
SIZE=(int(sys.argv[3]) if len(sys.argv)>3 else 1366, int(sys.argv[4]) if len(sys.argv)>4 else 768)

def models(kind, title, n):
    nums=re.findall(r'[01]{%d}'%n, title)
    inv=lambda s:''.join('1' if c=='0' else '0' for c in s)
    add1=lambda s:format((int(s,2)+1)%(1<<n),'0%db'%n)
    if kind=='calc':
        a,b=nums[0],nums[1]; A=int(a,2); B=int(b,2)
        # carries into columns n-1..1 (left to right)
        cm=[]; c=0; co=[]
        for j in range(n):
            s=((A>>j)&1)+((B>>j)&1)+c; c=s>>1; co.append(c)
        cm=''.join(str(co[i-1]) for i in range(n-1,0,-1))
        return [cm, format(A+B,'0%db'%n)]
    if kind=='comp':
        x=nums[0]; i=inv(x); return [i, add1(i)]
    a,b=nums[0],nums[1]; i=inv(b); cp=add1(i); sm=format(int(a,2)+int(cp,2),'0%db'%(n+1))
    return [i,cp,sm,sm[1:]]

JS_ACTIVE='''()=>{const a=document.activeElement;const cs=[...document.querySelectorAll('#bc-grid .bc-row.bc-active input.bc-in')];
 return {vals:cs.map(c=>c.value), idx:cs.indexOf(a), fb:(document.querySelector('#bc-feedback .bc-fh')||{}).textContent||'', cm:document.getElementById('bc-cellmsg').textContent,
  head:document.getElementById('bc-stagehead').textContent, chips:[...document.querySelectorAll('#bc-chips .bc-chip')].map(c=>c.className.replace(/bc-chip |bc-cur/g,'').trim())}}'''

def fw(t): return t.replace('0','０').replace('1','１')

class Env:
    def __init__(s,pg,cdp): s.pg=pg; s.cdp=cdp
    def st(s): return s.pg.evaluate(JS_ACTIVE)
    def bulk(s,method,text):
        pg=s.pg
        t=text
        if method=='chrome': pg.evaluate('''t=>{const e=document.activeElement;e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));e.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:t}));e.value=t;e.dispatchEvent(new InputEvent('input',{bubbles:true,data:t,inputType:'insertCompositionText',isComposing:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:t}));}''',t)
        elif method=='chrome-fw': s.bulk('chrome',fw(text))
        elif method=='safari': pg.evaluate('''t=>{const e=document.activeElement;e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));e.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:t}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:t}));e.value=t;e.dispatchEvent(new InputEvent('input',{bubbles:true,data:t,inputType:'insertFromComposition',isComposing:false}));}''',t)
        elif method=='safari-fw': s.bulk('safari',fw(text))
        elif method=='insert': pg.keyboard.insert_text(t)
        elif method=='insert-fw': pg.keyboard.insert_text(fw(t))
        elif method=='cdp-ime':
            s.cdp.send('Input.imeSetComposition',{'text':fw(t),'selectionStart':len(t),'selectionEnd':len(t)})
            s.cdp.send('Input.insertText',{'text':fw(t)})
        else: raise Exception(method)
    def check(s,route):
        if route=='enter': s.pg.keyboard.press('Enter')
        else: s.pg.click('#bc-check')
    def choose(s,kind,bits):
        other='calc' if kind!='calc' else 'comp'
        s.pg.click('.bc-kbtn[data-kind=%s]'%other); s.pg.click('.bc-bbtn[data-bits="%d"]'%bits)
        s.pg.click('.bc-kbtn[data-kind=%s]'%kind)   # 別の種類を経由して新しい問題
    def solve_prior(s,ms,k):
        for i in range(k):
            s.bulk('insert',ms[i]); s.check('enter')
    def focus_last(s):
        s.pg.evaluate("()=>{const cs=document.querySelectorAll('#bc-grid .bc-row.bc-active input.bc-in');cs[cs.length-1].focus()}")

METHODS=['chrome','chrome-fw','safari','safari-fw','insert','insert-fw','cdp-ime']
fails=[]; count=0; equiv={}
def rec(ok,msg):
    global count; count+=1
    if not ok: fails.append(msg)

with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':SIZE[0],'height':SIZE[1]}); pg=ctx.new_page(); errs=[]
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append(str(e)))
    cdp=ctx.new_cdp_session(pg)
    pg.goto(URL); pg.click('#bc-open-btn'); pg.click('#bc-submenu-screen [data-action=calc]')
    E=Env(pg,cdp)
    for bits in (4,8):
      for kind in ('comp','calc','viacomp'):
        nst={'comp':2,'calc':2,'viacomp':4}[kind]
        for stage in range(nst):
          def fresh():
              E.choose(kind,bits)
              title=pg.inner_text('#bc-qtitle'); ms=models(kind,title,bits)
              E.solve_prior(ms,stage)
              return ms
          def tag(s): return '%s%d s%d %s'%(kind,bits,stage,s)
          def adv_ok(label,ms,expect_head):
              st=E.st()
              nxt=('段 %d／'%(stage+2)) in st['head'] or 'おわり' in st['head']
              rec(st['fb'].startswith(expect_head) and nxt, tag(label)+' → fb=%r head=%r vals=%s'%(st['fb'],st['head'],st['vals']))
          # A: 空きを残して Enter/ボタン → 全桁一括 → 正解
          for m in METHODS:
              for r1,r2 in (('enter','enter'),('button','button'),('enter','button'),('button','enter')):
                  if m!='chrome' and r1!=r2: continue
                  ms=fresh(); L=len(ms[stage]); drop=L//2 if L>2 else 0
                  part=ms[stage][:drop]+ms[stage][drop+1:]
                  E.bulk(m,part); E.check(r1)
                  st=E.st()
                  rec(st['fb']=='あと1マス入れよう' and 'おわり' not in st['head'] and ('段 %d／'%(stage+1)) in st['head'], tag('A %s %s refuse'%(m,r1))+' fb=%r vals=%s'%(st['fb'],st['vals']))
                  E.bulk(m,ms[stage]); E.check(r2); adv_ok('A %s %s/%s'%(m,r1,r2),ms,'正解')
              # 等価性：Enter とボタンの断られたあとの状態（パターン・フォーカス・文）と，その後の 2 桁一括の結果
              snap={}
              for r in ('enter','button'):
                  ms=fresh(); L=len(ms[stage]); k=max(1,L-3)
                  E.bulk(m,ms[stage][:k] if L>3 else ms[stage][:1]+'1'); E.check(r); s1=E.st()
                  E.bulk(m,'10'); s2=E.st()
                  pat=lambda v:''.join('x' if c else '_' for c in v)
                  snap[r]=(pat(s1['vals']),s1['idx'],s1['fb'],pat(s2['vals']),s2['idx'])
              rec(snap['enter']==snap['button'], tag('Enter とボタンの状態が違う %s'%m)+' %s'%snap)
          # B: 途中まで一括 → 全桁一括
          for m in METHODS:
              ms=fresh(); L=len(ms[stage])
              for k in sorted(set([2,max(2,L//2),L-1])):
                  if k<2 or k>=L: continue
                  E.bulk(m,ms[stage][:k]); E.bulk(m,ms[stage]); st=E.st()
                  rec(''.join(st['vals'])==ms[stage], tag('B %s k=%d'%(m,k))+' vals=%s want=%s'%(''.join(st['vals']),ms[stage]))
              E.check(random.choice(['enter','button'])); adv_ok('B %s'%m,ms,'正解')
          # C: 誤り→全桁一括で正解（2回目）
          for m in ('chrome','insert-fw','safari'):
              for r in ('enter','button'):
                  ms=fresh(); w=ms[stage]; w=w[:-1]+('1' if w[-1]=='0' else '0')
                  E.bulk(m,w); E.check(r); st=E.st()
                  rec(st['fb'].startswith('おしい') and ('段 %d／'%(stage+1)) in st['head'], tag('C %s wrong'%m)+' fb=%r head=%r'%(st['fb'],st['head']))
                  E.bulk(m,ms[stage]); st=E.st()
                  rec(''.join(st['vals'])==ms[stage], tag('C %s %s retype'%(m,r))+' vals=%s want=%s'%(''.join(st['vals']),ms[stage]))
                  E.check(r)
                  st=E.st(); rec(st['fb']=='正解（2回目）', tag('C %s %s'%(m,r))+' fb=%r'%st['fb'])
          # D: 1 文字ずつ（右端から左へ）
          ms=fresh(); L=len(ms[stage])
          for ch in reversed(ms[stage]): pg.keyboard.type(ch)
          st=E.st(); rec(''.join(st['vals'])==ms[stage], tag('D one-by-one')+' vals=%s'%st['vals'])
          E.check('enter'); adv_ok('D',ms,'正解')
          # E: フォーカス位置（クリック＝rtl・矢印＝向きそのまま）→ 全桁一括
          for fpos in (0,'mid','last'):
              for m in ('chrome','insert','safari-fw'):
                  ms=fresh(); L=len(ms[stage]); idx=0 if fpos==0 else L//2 if fpos=='mid' else L-1
                  # 先に途中まで入れて（ltr）から，フォーカスを動かして全桁
                  E.bulk(m,ms[stage][:max(2,L//2)] if L>2 else '10')
                  pg.keyboard.press('Home' if idx==0 else 'End')
                  for _ in range(abs(idx-(0 if idx==0 else L-1)) if idx not in (0,L-1) else 0): pg.keyboard.press('ArrowLeft')
                  E.bulk(m,ms[stage]); st=E.st()
                  rec(''.join(st['vals'])==ms[stage], tag('E %s f=%s'%(m,fpos))+' vals=%s'%st['vals'])
                  # ltr のまま（矢印だけで動かす）
                  ms=fresh(); E.bulk(m,ms[stage][:max(2,L//2)] if L>2 else '10')
                  pg.keyboard.press('ArrowLeft')
                  E.bulk(m,ms[stage]); st=E.st()
                  rec(''.join(st['vals'])==ms[stage], tag('E-ltr %s'%m)+' vals=%s'%st['vals'])
          # F: Backspace で空に戻る→1 文字は右端から
          ms=fresh(); L=len(ms[stage])
          E.bulk('chrome',ms[stage][:2])
          pg.keyboard.press('Backspace'); pg.keyboard.press('Backspace'); st=E.st()
          rec(all(v=='' for v in st['vals']) and st['idx']==L-1, tag('F backspace→空・右端')+' %s'%st)
          pg.keyboard.type(ms[stage][-1]); st=E.st(); rec(len(st['vals'])>0 and st['vals'][-1]==ms[stage][-1], tag('F 戻ったあとの1文字は右端')+' %s'%st['vals'])
    print('checks',count,'fail',len(fails),'consoleErr',errs[:3])
    for f in fails[:25]: print(' FAIL',f)
    b.close()
sys.exit(1 if fails else 0)
