/**
 * CS Math Trainer - メインアプリケーションロジック
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- ゲーム状態変数 ---
  let currentMode = 'bin-to-dec';
  let currentDifficulty = 'medium';
  let gameMode = 'normal'; // 'normal' | 'survival' | 'timeattack'
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let questionIndex = 1;
  let totalQuestions = 10;
  let currentQuestion = null;
  let timerInterval = null;
  let timeLeft = 15; // 1問あたりの時間制限 (秒)
  const maxTime = 15;
  let survivalTime = 30.0; // サバイバルモード用残り時間
  let elapsedTime = 0.0; // タイムアタック用経過時間
  let results = []; // 間違えた問題の履歴: { question, userAnswer, correctAnswer, mode }
  let correctCount = 0;
  let currentCategory = 'bin-dec';
  let pendingMode = ''; // モーダルで選択中のモード
  let requiredLength = 8; // 必要とされる2進数の文字数（4, 8, 16）

  // --- DOM要素の取得 ---
  const screens = {
    menu: document.getElementById('menu-screen'),
    submenu: document.getElementById('submenu-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen')
  };

  const submitBtn = document.getElementById('submit-btn');
  const quitBtn = document.getElementById('quit-btn');
  const restartBtn = document.getElementById('restart-btn');
  const backToMenuBtn = document.getElementById('back-to-menu-btn');

  // カテゴリ選択 & サブメニューのアクションボタン
  const categoryButtons = document.querySelectorAll('.category-select-btn');
  const submenuTitle = document.getElementById('submenu-title');
  const playATitle = document.getElementById('play-a-title');
  const playBTitle = document.getElementById('play-b-title');
  const submenuBackBtn = document.getElementById('submenu-back-btn');
  const submenuActionButtons = document.querySelectorAll('.submenu-action-btn');

  // 設定モーダル
  const settingsModal = document.getElementById('settings-modal');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalStartBtn = document.getElementById('modal-start-btn');
  const modalDiffTabButtons = document.querySelectorAll('.modal-diff-tab-btn');
  const modalModeButtons = document.querySelectorAll('.modal-mode-btn');

  const questionText = document.getElementById('question-text');
  const questionModeLabel = document.getElementById('question-mode-label');
  const questionProgress = document.getElementById('question-progress');
  const gameProgressLabel = document.getElementById('game-progress-label');
  const gameScoreLabel = document.getElementById('game-score-label');
  const gameScore = document.getElementById('game-score');
  const timerContainer = document.querySelector('.timer-container');
  const timerBar = document.getElementById('timer-bar');
  const answerInput = document.getElementById('answer-input');
  const comboDisplay = document.getElementById('combo-display');
  const questionCard = document.getElementById('question-card');

  const bitInputArea = document.getElementById('bit-input-area');
  const textInputArea = document.getElementById('text-input-area');
  const binaryInputTip = document.getElementById('binary-input-tip');
  const charCounter = document.getElementById('char-counter');

  const resultScore = document.getElementById('result-score');
  const resultRank = document.getElementById('result-rank');
  const resultAccuracy = document.getElementById('result-accuracy');
  const resultMaxCombo = document.getElementById('result-max-combo');
  const reviewList = document.getElementById('review-list');

  // --- 画面遷移関数 ---
  function showScreen(screenId) {
    Object.keys(screens).forEach(key => {
      if (key === screenId) {
        screens[key].classList.add('active');
      } else {
        screens[key].classList.remove('active');
      }
    });
  }

  // --- 大カテゴリ選択イベント ---
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      
      // サブメニューのテキストを書き換える
      if (currentCategory === 'bin-dec') {
        submenuTitle.textContent = '2進法 ⇔ 10進法';
        playATitle.textContent = '⚡️ 2進数 → 10進数';
        playBTitle.textContent = '⚡️ 10進数 → 2進数';
      } else if (currentCategory === 'bin-hex') {
        submenuTitle.textContent = '2進法 ⇔ 16進法';
        playATitle.textContent = '⚡️ 2進数 → 16進数';
        playBTitle.textContent = '⚡️ 16進数 → 2進数';
      } else if (currentCategory === 'dec-hex') {
        submenuTitle.textContent = '10進法 ⇔ 16進法';
        playATitle.textContent = '⚡️ 10進数 → 16進数';
        playBTitle.textContent = '⚡️ 16進数 → 10進数';
      }
      
      showScreen('submenu');
    });
  });

  // サブメニューの戻るボタン
  submenuBackBtn.addEventListener('click', () => {
    showScreen('menu');
  });

  // --- サブメニューのアクションボタンイベント ---
  submenuActionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      
      if (action === 'learn') {
        currentTutorialTab = currentCategory;
        
        // 解説のタブ（diff-btn）の active クラスも連動させる
        const tabs = document.querySelectorAll('.learn-tabs .diff-btn');
        tabs.forEach(t => {
          if (t.dataset.tab === currentTutorialTab) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });
        
        showTutorial();
      } else if (action === 'play-a') {
        if (currentCategory === 'bin-dec') pendingMode = 'bin-to-dec';
        else if (currentCategory === 'bin-hex') pendingMode = 'bin-to-hex';
        else if (currentCategory === 'dec-hex') pendingMode = 'dec-to-hex';
        
        openSettingsModal();
      } else if (action === 'play-b') {
        if (currentCategory === 'bin-dec') pendingMode = 'dec-to-bin';
        else if (currentCategory === 'bin-hex') pendingMode = 'hex-to-bin';
        else if (currentCategory === 'dec-hex') pendingMode = 'hex-to-dec';
        
        openSettingsModal();
      }
    });
  });

  // 設定モーダルの表示と内部状態の同期
  function openSettingsModal() {
    // 現在の難易度設定に合わせて選択状態を同期
    modalDiffTabButtons.forEach(btn => {
      if (btn.dataset.diff === currentDifficulty) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // 現在のゲームモード設定に合わせて選択状態を同期
    modalModeButtons.forEach(btn => {
      if (btn.dataset.mode === gameMode) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    settingsModal.classList.add('active');
  }

  // --- モーダル内の設定切り替えイベント ---
  modalDiffTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modalDiffTabButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentDifficulty = btn.dataset.diff;
    });
  });

  modalModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modalModeButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      gameMode = btn.dataset.mode;
    });
  });

  // モーダルのキャンセルボタン
  modalCancelBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });

  // モーダルのスタートボタン
  modalStartBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
    currentMode = pendingMode;
    startGame();
  });

  // --- ゲーム制御ロジック ---

  function startGame() {
    score = 0;
    combo = 0;
    maxCombo = 0;
    questionIndex = 1;
    correctCount = 0;
    results = [];
    
    if (gameMode === 'normal') {
      gameProgressLabel.textContent = '問題:';
      gameScoreLabel.textContent = 'スコア:';
      gameScore.textContent = '0';
      questionProgress.textContent = `1 / ${totalQuestions}`;
      timerContainer.style.display = 'none'; // タイマーバー非表示
    } else if (gameMode === 'survival') {
      gameProgressLabel.textContent = '正解数:';
      gameScoreLabel.textContent = '残り時間:';
      gameScore.textContent = '30.0s';
      questionProgress.textContent = '0';
      survivalTime = 30.0;
      timerContainer.style.display = 'block'; // タイマーバー表示
    } else if (gameMode === 'timeattack') {
      gameProgressLabel.textContent = '問題:';
      gameScoreLabel.textContent = 'タイム:';
      gameScore.textContent = '0.0s';
      questionProgress.textContent = `1 / ${totalQuestions}`;
      elapsedTime = 0.0;
      timerContainer.style.display = 'none'; // タイマーバー非表示
    }
    
    showScreen('game');
    nextQuestion();
  }

  // 2. 次の問題を提示
  function nextQuestion() {
    if (gameMode !== 'survival' && questionIndex > totalQuestions) {
      endGame();
      return;
    }

    // UI初期化
    if (gameMode === 'normal' || gameMode === 'timeattack') {
      questionProgress.textContent = `${questionIndex} / ${totalQuestions}`;
    } else if (gameMode === 'survival') {
      questionProgress.textContent = `${correctCount}`;
    }

    answerInput.value = '';
    answerInput.placeholder = '回答を入力...';
    questionCard.className = 'question-card';
    comboDisplay.classList.remove('active');

    // 問題生成
    currentQuestion = generateQuestion(currentMode, currentDifficulty);
    if (!currentQuestion) return;

    questionText.textContent = currentQuestion.question;
    questionModeLabel.textContent = currentQuestion.displayMeta;
    answerInput.placeholder = currentQuestion.placeholder;

    // 入力エリアの切り替え (10進数→2進数のみ、トグルスイッチUIを表示)
    if (currentQuestion.inputType === 'binary') {
      setupBitSwitches(currentQuestion.bits);
      bitInputArea.style.display = 'flex';
      answerInput.readOnly = true;
      binaryInputTip.style.display = 'none';
    } else {
      bitInputArea.style.display = 'none';
      answerInput.readOnly = false;
      
      // スマホなどで開くキーボードの最適化
      if (currentMode === 'dec-to-hex' || currentMode === 'bin-to-hex') {
        answerInput.setAttribute('inputmode', 'text');
        binaryInputTip.style.display = 'none';
      } else {
        answerInput.setAttribute('inputmode', 'numeric');
        
        // 2進数のテキスト入力時のヒントとカウンタ制御
        if (currentMode === 'dec-to-bin' || currentMode === 'hex-to-bin') {
          requiredLength = currentDifficulty === 'easy' ? 4 : (currentDifficulty === 'medium' ? 8 : 16);
          binaryInputTip.style.display = 'flex';
          charCounter.textContent = `0 / ${requiredLength} 文字`;
          charCounter.className = 'char-counter error';
          
          // 例の提示
          const exampleBits = requiredLength === 4 ? '0101' : (requiredLength === 8 ? '00110101' : '0000000000110101');
          answerInput.placeholder = `例: ${exampleBits} (${requiredLength}-bitに揃える)`;
        } else {
          binaryInputTip.style.display = 'none';
        }
      }
    }

    // フォーカス
    if (currentQuestion.inputType !== 'binary') {
      setTimeout(() => answerInput.focus(), 50);
    }

    // タイマー開始
    resetTimer();
  }

  // 2進数入力用のトグルスイッチUI生成
  function setupBitSwitches(numBits) {
    bitInputArea.innerHTML = '';
    
    // MSB (最上位ビット) から LSB (最下位ビット) へ降順でループ
    for (let i = numBits - 1; i >= 0; i--) {
      const weight = Math.pow(2, i);
      
      const column = document.createElement('div');
      column.className = 'bit-column';

      // 重みのラベル (4ビット以下の場合は表示、16ビット以上は省略してすっきりさせる)
      const weightLabel = document.createElement('span');
      weightLabel.className = 'bit-weight';
      weightLabel.textContent = weight;
      
      const switchBtn = document.createElement('button');
      switchBtn.className = 'bit-switch';
      switchBtn.textContent = '0';
      switchBtn.dataset.bitIndex = i;
      
      switchBtn.addEventListener('click', () => {
        switchBtn.classList.toggle('active');
        switchBtn.textContent = switchBtn.classList.contains('active') ? '1' : '0';
        updateBinaryInputFromSwitches(numBits);
      });

      column.appendChild(weightLabel);
      column.appendChild(switchBtn);
      bitInputArea.appendChild(column);
    }
  }

  // スイッチの状態から2進数文字列を作成してテキストボックスに格納
  function updateBinaryInputFromSwitches(numBits) {
    let binaryStr = '';
    const switches = Array.from(bitInputArea.querySelectorAll('.bit-switch'));
    
    // 左（MSB）から順に結合
    switches.forEach(sw => {
      binaryStr += sw.classList.contains('active') ? '1' : '0';
    });
    
    answerInput.value = binaryStr;
  }

  // 3. タイマー処理
  function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = maxTime;
    
    if (gameMode === 'normal') {
      // 10問チャレンジ（ノーマルモード）は制限時間なし
    } else if (gameMode === 'survival') {
      timerBar.classList.remove('warning');
      timerInterval = setInterval(() => {
        survivalTime -= 0.1;
        if (survivalTime <= 0) {
          survivalTime = 0;
          gameScore.textContent = '0.0s';
          timerBar.style.width = '0%';
          clearInterval(timerInterval);
          endGame();
        } else {
          gameScore.textContent = `${survivalTime.toFixed(1)}s`;
          const percentage = (survivalTime / 30.0) * 100;
          timerBar.style.width = `${Math.min(100, percentage)}%`;
          
          if (survivalTime <= 8.0) {
            timerBar.classList.add('warning');
          } else {
            timerBar.classList.remove('warning');
          }
        }
      }, 100);
    } else if (gameMode === 'timeattack') {
      timerBar.style.width = '100%';
      timerBar.classList.remove('warning');
      timerInterval = setInterval(() => {
        elapsedTime += 0.1;
        gameScore.textContent = `${elapsedTime.toFixed(1)}s`;
      }, 100);
    }
  }

  function updateTimerBar() {
    const percentage = (timeLeft / maxTime) * 100;
    timerBar.style.width = `${percentage}%`;
    
    if (timeLeft <= 4) {
      timerBar.classList.add('warning');
    } else {
      timerBar.classList.remove('warning');
    }
  }

  // 入力時の全角→半角の自動変換および不正文字のフィルタリング
  answerInput.addEventListener('input', () => {
    let value = answerInput.value;
    
    // 全角英数字を半角に変換
    value = value.replace(/[０-９ａ-ｚＡ-Ｚ]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });

    // モードごとの入力制御
    if (currentMode === 'dec-to-bin' || currentMode === 'hex-to-bin') {
      // 2進数入力: 0と1のみ
      value = value.replace(/[^01]/g, '');
    } else if (currentMode === 'bin-to-dec' || currentMode === 'hex-to-dec') {
      // 10進数入力: 0-9のみ
      value = value.replace(/[^0-9]/g, '');
    } else if (currentMode === 'dec-to-hex' || currentMode === 'bin-to-hex') {
      // 16進数入力: 0-9, a-f, A-F のみ。かつ大文字に自動変換
      value = value.replace(/[^0-9a-fA-F]/g, '');
      value = value.toUpperCase();
    }

    answerInput.value = value;

    // 2進数入力時の文字数カウンタ連動
    if (currentMode === 'dec-to-bin' || currentMode === 'hex-to-bin') {
      charCounter.textContent = `${value.length} / ${requiredLength} 文字`;
      if (value.length === requiredLength) {
        charCounter.className = 'char-counter match';
      } else {
        charCounter.className = 'char-counter error';
      }
    }
  });

  // 4. 解答提出
  submitBtn.addEventListener('click', () => submitAnswer(false));
  
  // Enterキーでの決定
  answerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitAnswer(false);
    }
  });

  function submitAnswer(isTimeout = false) {
    clearInterval(timerInterval);
    
    let userAnswer = answerInput.value.trim();
    const correctAnswer = currentQuestion.answer;
    let isCorrect = false;

    if (currentMode === 'dec-to-hex' || currentMode === 'bin-to-hex') {
      isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();
    } else {
      isCorrect = userAnswer === correctAnswer;
    }

    if (isTimeout) {
      userAnswer = '（時間切れ）';
      isCorrect = false;
    }

    // 正誤に応じた演出とステータス更新
    if (isCorrect) {
      correctCount++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      
      if (gameMode === 'normal') {
        const comboBonus = Math.min((combo - 1) * 10, 100);
        const pointsGained = 100 + comboBonus;
        score += pointsGained;
        gameScore.textContent = score;
      } else if (gameMode === 'survival') {
        const recoverTime = 3 + Math.min(combo * 0.5, 5);
        survivalTime = Math.min(30.0, survivalTime + recoverTime);
        gameScore.textContent = `${survivalTime.toFixed(1)}s`;
      }

      // 演出
      questionCard.classList.add('correct');
      if (combo >= 2) {
        comboDisplay.textContent = `COMBO x${combo}`;
        comboDisplay.classList.add('active');
      }
    } else {
      combo = 0;
      comboDisplay.classList.remove('active');
      questionCard.classList.add('incorrect');
      
      if (gameMode === 'survival') {
        survivalTime = Math.max(0, survivalTime - 5.0);
        gameScore.textContent = `${survivalTime.toFixed(1)}s`;
      } else if (gameMode === 'timeattack') {
        elapsedTime += 3.0;
        gameScore.textContent = `${elapsedTime.toFixed(1)}s`;
        
        // 赤く光らせるペナルティ演出
        gameScore.style.color = '#ff3366';
        setTimeout(() => {
          gameScore.style.color = '';
        }, 800);
      }

      // 間違えた問題を結果用に記録
      results.push({
        question: currentQuestion.question,
        userAnswer: userAnswer || '（未入力）',
        correctAnswer: correctAnswer,
        displayMeta: currentQuestion.displayMeta
      });
    }

    // 入力・決定を無効化して一時停止（演出を見せるため）
    submitBtn.disabled = true;
    answerInput.disabled = true;
    if (currentQuestion.inputType === 'binary') {
      bitInputArea.querySelectorAll('.bit-switch').forEach(sw => sw.disabled = true);
    }

    setTimeout(() => {
      submitBtn.disabled = false;
      answerInput.disabled = false;
      questionIndex++;
      nextQuestion();
    }, 900);
  }

  // 5. ゲーム終了 (リザルト表示)
  const resultTitle = document.getElementById('result-title');
  const resultMeta = document.getElementById('result-meta');

  function endGame() {
    clearInterval(timerInterval);
    showScreen('result');

    let diffJA = '中級';
    if (currentDifficulty === 'easy') diffJA = '初級';
    else if (currentDifficulty === 'hard') diffJA = '上級';

    if (gameMode === 'normal') {
      resultTitle.textContent = 'TRAINING COMPLETED';
      resultScore.textContent = score.toLocaleString();
      resultMeta.textContent = `難易度: ${diffJA} / ルール: 10問チャレンジ`;
      
      const accuracy = Math.round((correctCount / totalQuestions) * 100);
      resultAccuracy.textContent = `${accuracy}%`;
      
      let rankText = '';
      if (accuracy === 100) {
        rankText = '🎉 パーフェクト！あなたこそデジタルマスターです！';
      } else if (accuracy >= 80) {
        rankText = '✨ 素晴らしい！計算のコツを完全に掴んでいますね。';
      } else if (accuracy >= 50) {
        rankText = '👍 あと少し！繰り返し練習してスピードアップを目指そう。';
      } else {
        rankText = '📚 まずは初級からじっくり基礎を復習してみましょう！';
      }
      resultRank.textContent = rankText;
      
    } else if (gameMode === 'survival') {
      resultTitle.textContent = 'SURVIVAL OVER';
      resultScore.textContent = `${correctCount} 問`;
      resultMeta.textContent = `難易度: ${diffJA} / ルール: エンドレス・サバイバル`;
      
      const totalAttempted = correctCount + results.length;
      const accuracy = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;
      resultAccuracy.textContent = `${accuracy}%`;

      let rankText = '';
      if (correctCount >= 30) {
        rankText = '👑 異次元の集中力！あなたは伝説のサバイバーです！';
      } else if (correctCount >= 15) {
        rankText = '🔥 素晴らしい耐久力！高精度な進数計算を維持できています。';
      } else if (correctCount >= 7) {
        rankText = '👍 健闘！ミスを減らすと、さらに長く生き残れますよ。';
      } else {
        rankText = '📚 焦らず正確に解くことから始めてみましょう！';
      }
      resultRank.textContent = rankText;
      
    } else if (gameMode === 'timeattack') {
      resultTitle.textContent = 'TIME ATTACK COMPLETED';
      resultScore.textContent = `${elapsedTime.toFixed(1)} 秒`;
      resultMeta.textContent = `難易度: ${diffJA} / ルール: タイムアタック (ミス +3秒)`;
      
      const accuracy = Math.round((correctCount / totalQuestions) * 100);
      resultAccuracy.textContent = `${accuracy}%`;

      let rankText = '';
      if (elapsedTime <= 25.0 && accuracy === 100) {
        rankText = '⚡️ 光速クリア！計算速度も精度も完璧で文句なしです！';
      } else if (elapsedTime <= 45.0) {
        rankText = '✨ とてもスピーディー！脳内変換がかなりスムーズです。';
      } else if (elapsedTime <= 80.0) {
        rankText = '👍 ナイスファイト！タイピングと暗算の速度アップを目指そう。';
      } else {
        rankText = '📚 正確に答えられるとペナルティ秒数を防いで早くなりますよ！';
      }
      resultRank.textContent = rankText;
    }
    
    resultMaxCombo.textContent = maxCombo;

    // 復習リストの表示
    reviewList.innerHTML = '';
    if (results.length === 0) {
      const cleanItem = document.createElement('div');
      cleanItem.className = 'review-item';
      cleanItem.style.justifyContent = 'center';
      cleanItem.style.color = 'var(--accent-green)';
      cleanItem.textContent = '全問正解です！間違えた問題はありません。';
      reviewList.appendChild(cleanItem);
    } else {
      results.forEach(res => {
        const item = document.createElement('div');
        item.className = 'review-item';
        
        const qSpan = document.createElement('span');
        qSpan.innerHTML = `<strong>${res.displayMeta}</strong>: ${res.question}`;
        
        const ansSpan = document.createElement('span');
        ansSpan.innerHTML = `<span class="review-wrong">${res.userAnswer}</span> ➔ 正解: <span class="review-correct">${res.correctAnswer}</span>`;
        
        item.appendChild(qSpan);
        item.appendChild(ansSpan);
        reviewList.appendChild(item);
      });
    }
  }

  // 6. ゲーム中断・戻る
  quitBtn.addEventListener('click', () => {
    if (confirm('ゲームを途中で終了してメニューに戻りますか？')) {
      clearInterval(timerInterval);
      showScreen('submenu');
    }
  });

  restartBtn.addEventListener('click', startGame);
  backToMenuBtn.addEventListener('click', () => showScreen('submenu'));

  // ================== 解説画面 (Learn Screen) の制御 ==================
  
  // DOM要素の追加取得
  const learnCloseBtn = document.getElementById('learn-close-btn');
  const learnPrevBtn = document.getElementById('learn-prev-btn');
  const learnNextBtn = document.getElementById('learn-next-btn');
  const learnTabs = document.querySelectorAll('.learn-tabs .diff-btn');
  const tutorialCard = document.getElementById('tutorial-card');
  const stepIndicators = document.getElementById('step-indicators');
  
  screens.learn = document.getElementById('learn-screen');
  
  let currentTutorialTab = 'bin-dec';
  let currentTutorialStep = 0;

  // 解説コンテンツの定義
  const tutorials = {
    'bin-dec': [
      {
        text: '<strong>10進数 ➔ 2進数への変換（すだれ算）</strong><br>日常使う10進数（0〜9）に対して、コンピュータ内部では0と1だけの「2進数」が使われます。<br>まずは10進数から2進数へ変換する方法を学びましょう。商が0になるまで**2で割り続け、余りを記録**します。<br>例として、10進数の <strong>155</strong> を変換してみましょう。',
        render: () => `
          <div class="sudare-container" id="sudare-box">
            <div class="sudare-line" style="animation-delay: 0.1s;"><span class="sudare-op">2 )</span><span class="sudare-num">155</span><span class="sudare-rem"></span></div>
          </div>
        `,
        action: () => {}
      },
      {
        text: '<strong>2で割り続け、余りを並べる</strong><br>155を2で割った余りは1、商は77。<br>その77をさらに2で割り続け、商がなくなるまで繰り返します。<br>スライドと同様に筆算を組み立てていきます。',
        render: () => `
          <div class="sudare-container" id="sudare-box">
            <div class="sudare-line" style="animation-delay: 0.1s;"><span class="sudare-op">2 )</span><span class="sudare-num">155</span><span class="sudare-rem"></span></div>
            <div class="sudare-line" style="animation-delay: 0.3s;"><span class="sudare-op">2 )</span><span class="sudare-num">77</span><span class="sudare-rem">... 1</span></div>
            <div class="sudare-line" style="animation-delay: 0.5s;"><span class="sudare-op">2 )</span><span class="sudare-num">38</span><span class="sudare-rem">... 1</span></div>
            <div class="sudare-line" style="animation-delay: 0.7s;"><span class="sudare-op">2 )</span><span class="sudare-num">19</span><span class="sudare-rem">... 0</span></div>
            <div class="sudare-line" style="animation-delay: 0.9s;"><span class="sudare-op">2 )</span><span class="sudare-num">9</span><span class="sudare-rem">... 1</span></div>
            <div class="sudare-line" style="animation-delay: 1.1s;"><span class="sudare-op">2 )</span><span class="sudare-num">4</span><span class="sudare-rem">... 1</span></div>
            <div class="sudare-line" style="animation-delay: 1.3s;"><span class="sudare-op">2 )</span><span class="sudare-num">2</span><span class="sudare-rem">... 0</span></div>
            <div class="sudare-line" style="animation-delay: 1.5s;"><span class="sudare-last-num">1</span><span class="sudare-rem">... 0</span></div>
          </div>
        `,
        action: () => {}
      },
      {
        text: '<strong>下から上に向かって余りを読む</strong><br>最後の商「1」からスタートして、**下から順に余り（0と1）を並べます**。<br>並べると <strong>10011011</strong> となります。<br>よって、155<sub>(10)</sub> は <strong>10011011<sub>(2)</sub></strong> です。',
        render: () => `
          <div class="sudare-container" id="sudare-box" style="position: relative;">
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">155</span><span class="sudare-rem" id="r6"></span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">77</span><span class="sudare-rem" id="r5">... 1</span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">38</span><span class="sudare-rem" id="r4">... 1</span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">19</span><span class="sudare-rem" id="r3">... 0</span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">9</span><span class="sudare-rem" id="r2">... 1</span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">4</span><span class="sudare-rem" id="r1">... 1</span></div>
            <div class="sudare-line" style="opacity: 1;"><span class="sudare-op">2 )</span><span class="sudare-num">2</span><span class="sudare-rem" id="r0">... 0</span></div>
            <div class="sudare-line" style="opacity: 1;" id="rl"><span class="sudare-last-num">1</span><span class="sudare-rem">... 0</span></div>
            
            <svg class="sudare-arrow-svg" id="arrow-svg" viewBox="0 0 40 140">
              <path d="M 30 130 L 10 130 L 10 10 L 30 10" />
              <path d="M 20 15 L 30 10 L 20 5" />
            </svg>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            document.getElementById('arrow-svg').classList.add('draw');
          }, 100);
          
          // 下から順番に数字をハイライトする演出
          const rows = ['rl', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
          rows.forEach((id, idx) => {
            setTimeout(() => {
              const el = document.getElementById(id);
              if (el) el.classList.add('highlight');
            }, 600 + idx * 200);
          });
        }
      },
      {
        text: '<strong>2進数 ➔ 10進数への変換</strong><br>次に、2進数から10進数へ戻す方法を学びましょう。<br>スライド資料の例題に沿って、2進数の <strong>11101</strong> を10進数に変換してみます。',
        render: () => `
          <div class="bit-calc-container">
            <div class="bit-row">
              <div class="bit-box"><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="bit-value">0</span></div>
              <div class="bit-box"><span class="bit-value active">1</span></div>
            </div>
            <div class="calc-formula-line show">対象の2進数: 11101<sub>(2)</sub></div>
          </div>
        `,
        action: () => {}
      },
      {
        text: '<strong>重み（2の累乗）を割り当てる</strong><br>2進数の各桁には、右から順に <strong>2<sup>0</sup> (1), 2<sup>1</sup> (2), 2<sup>2</sup> (4), 2<sup>3</sup> (8), 2<sup>4</sup> (16)</strong> の「重み」があります。',
        render: () => `
          <div class="bit-calc-container">
            <div class="bit-row">
              <div class="bit-box"><span class="weight-tag" id="w4">16</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag" id="w3">8</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag" id="w2">4</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag" id="w1">2</span><span class="bit-value">0</span></div>
              <div class="bit-box"><span class="weight-tag" id="w0">1</span><span class="bit-value active">1</span></div>
            </div>
            <div class="calc-formula-line show" style="color: var(--accent-blue);">各ビットの重みを計算します</div>
          </div>
        `,
        action: () => {
          // 重みタグをフェードイン
          setTimeout(() => {
            document.querySelectorAll('.weight-tag').forEach(tag => tag.classList.add('show'));
          }, 100);
        }
      },
      {
        text: '<strong>重みの掛け算</strong><br>ビットが <strong>1</strong> になっている桁の重みだけを掛け算します（0の桁は0になります）。<br>スライド資料の式：<br><strong>(1×16) ＋ (1×8) ＋ (1×4) ＋ (0×2) ＋ (1×1)</strong>',
        render: () => `
          <div class="bit-calc-container">
            <div class="bit-row">
              <div class="bit-box"><span class="weight-tag show" id="w4">16</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag show" id="w3">8</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag show" id="w2">4</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag show" id="w1" style="color: var(--text-secondary);">0</span><span class="bit-value">0</span></div>
              <div class="bit-box"><span class="weight-tag show" id="w0">1</span><span class="bit-value active">1</span></div>
            </div>
            <div class="calc-formula-line" id="formula-line">16 ＋ 8 ＋ 4 ＋ 0 ＋ 1</div>
          </div>
        `,
        action: () => {
          // 重みが下に落ちてくる演出
          setTimeout(() => {
            document.getElementById('w4').classList.add('dropped');
            document.getElementById('w3').classList.add('dropped');
            document.getElementById('w2').classList.add('dropped');
            document.getElementById('w1').style.opacity = '0.3';
            document.getElementById('w0').classList.add('dropped');
          }, 100);
          setTimeout(() => {
            document.getElementById('formula-line').classList.add('show');
          }, 600);
        }
      },
      {
        text: '<strong>合計を算出する</strong><br>掛け算して残った数値をすべて足し合わせます。<br><strong>16 ＋ 8 ＋ 4 ＋ 1 ＝ 29</strong><br>よって、2進数の <strong>11101<sub>(2)</sub></strong> は、10進数で <strong>29<sub>(10)</sub></strong> となります。',
        render: () => `
          <div class="bit-calc-container">
            <div class="bit-row">
              <div class="bit-box"><span class="weight-tag show dropped">16</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag show dropped">8</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag show dropped">4</span><span class="bit-value active">1</span></div>
              <div class="bit-box"><span class="weight-tag" style="opacity: 0;">0</span><span class="bit-value">0</span></div>
              <div class="bit-box"><span class="weight-tag show dropped">1</span><span class="bit-value active">1</span></div>
            </div>
            <div class="calc-formula-line show">16 ＋ 8 ＋ 4 ＋ 1 ＝ <strong id="result-num">29</strong></div>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            const res = document.getElementById('result-num');
            res.style.textShadow = '0 0 15px var(--accent-green)';
            res.style.color = 'var(--accent-green)';
          }, 300);
        }
      }
    ],
    'bin-hex': [
      {
        text: '<strong>2進数 ⇔ 16進数の変換（4ビット区切り）</strong><br>2進数の「4ビット（0000〜1111＝0〜15）」は、16進数の「ちょうど1桁（0〜F）」に対応します。<br>この性質を利用して、**2進数を右から4ビットずつに区切って変換する**と簡単に相互変換できます。',
        render: () => `
          <div class="split-bin-container">
            <div class="bin-grouped" id="bin-source">00011101</div>
            <div class="split-arrows" id="bin-source-arrows">↓ ↓</div>
          </div>
        `,
        action: () => {}
      },
      {
        text: '<strong>4ビットずつに区切って変換</strong><br>2進数 <strong>00011101</strong> を右から4桁で区切り、<strong>0001</strong> と <strong>1101</strong> の2グループにします。<br>それぞれを独立して16進数に変換します。<br>・<strong>0001<sub>(2)</sub></strong> ➔ <strong>1<sub>(16)</sub></strong><br>・<strong>1101<sub>(2)</sub></strong> ➔ 13 ➔ <strong>D<sub>(16)</sub></strong>',
        render: () => `
          <div class="split-bin-container">
            <div class="bin-grouped">
              <span class="bin-part left" id="bp-l">0001</span>
              <span class="bin-part right" id="bp-r">1101</span>
            </div>
            <div class="split-arrows show">↓ &nbsp; &nbsp; &nbsp; &nbsp; ↓</div>
            <div class="hex-result-row" id="hex-res-row">
              <span class="hex-digit left">1</span>
              <span class="hex-digit right">D</span>
            </div>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            document.getElementById('bp-l').style.boxShadow = '0 0 10px rgba(79, 172, 254, 0.3)';
            document.getElementById('bp-r').style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.3)';
          }, 100);
          setTimeout(() => {
            document.getElementById('hex-res-row').classList.add('show');
          }, 600);
        }
      },
      {
        text: '<strong>変換結果を結合する</strong><br>それぞれの変換結果 <strong>1</strong> と <strong>D</strong> をそのまま並べて結合します。<br><strong>1D<sub>(16)</sub></strong> となります。<br>スライド資料に示されている通り、2進数 <strong>00011101<sub>(2)</sub></strong> は16進数で <strong>1D<sub>(16)</sub></strong> であることが確かめられました！',
        render: () => `
          <div class="split-bin-container">
            <div class="hex-result-row show" style="gap: 1.5rem;">
              <span class="hex-digit left" id="final-l">1</span>
              <span class="hex-digit right" id="final-r">D</span>
            </div>
            <div class="hex-final" id="final-combine">1D<sub>(16)</sub></div>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            document.getElementById('final-l').style.transform = 'translateX(12px)';
            document.getElementById('final-r').style.transform = 'translateX(-12px)';
            document.getElementById('final-l').style.transition = 'all 0.5s ease';
            document.getElementById('final-r').style.transition = 'all 0.5s ease';
          }, 200);
          setTimeout(() => {
            document.getElementById('final-combine').classList.add('show');
          }, 700);
        }
      }
    ],
    'dec-hex': [
      {
        text: '<strong>10進数 ⇔ 16進数の基本</strong><br>16進数は、<strong>0〜9</strong>の数字の次に、10〜15を表す文字として <strong>A, B, C, D, E, F</strong> を用いる表現方法です。<br>1バイト（8ビット）を簡潔に表すのによく使われます。',
        render: () => `
          <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.9rem;">
            <tr style="border-bottom: 1px solid var(--panel-border); color: var(--accent-blue);">
              <th>10進数</th><td>9</td><td>10</td><td>11</td><td>12</td><td>13</td><td>14</td><td>15</td>
            </tr>
            <tr style="color: var(--accent-cyan); font-weight: bold;">
              <th>16進数</th><td>9</td><td>A</td><td>B</td><td>C</td><td>D</td><td>E</td><td>F</td>
            </tr>
          </table>
        `,
        action: () => {}
      },
      {
        text: '<strong>10進数 ➔ 16進数の変換（例: 29）</strong><br>10進数を16進数にするには、商がなくなるまで**16で割り続け、その余りを記録**します。<br><strong>29 ÷ 16 ＝ 1 余り 13</strong><br>13は16進数で <strong>D</strong> なので、商の <strong>1</strong> と余りの <strong>D</strong> を順に並べて <strong>1D<sub>(16)</sub></strong> となります。',
        render: () => `
          <div class="bit-calc-container" style="gap: 1rem;">
            <div style="font-size: 1.3rem;">29 ÷ 16 ＝ 1 余り <span style="color: var(--accent-red); font-weight: bold;">13</span></div>
            <div style="font-size: 1.3rem; opacity: 0; transform: translateY(5px);" id="hex-convert-step">
              余り 13 ➔ 16進数では <strong style="color: var(--accent-cyan);">D</strong>
            </div>
            <div class="hex-final" id="hex-final-res" style="margin-top: 1rem;">答え: 1D<sub>(16)</sub></div>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            document.getElementById('hex-convert-step').style.opacity = '1';
            document.getElementById('hex-convert-step').style.transform = 'translateY(0)';
            document.getElementById('hex-convert-step').style.transition = 'var(--transition-smooth)';
          }, 400);
          setTimeout(() => {
            document.getElementById('hex-final-res').classList.add('show');
          }, 900);
        }
      },
      {
        text: '<strong>16進数 ➔ 10進数の変換（例: 1D）</strong><br>16進数を10進数に戻すには、各桁の値に <strong>16<sup>n</sup></strong> を掛け算して足し合わせます。<br>右から0桁目（16<sup>0</sup> = 1）、1桁目（16<sup>1</sup> = 16）の重みがあります。<br>式： <strong>(1 × 16<sup>1</sup>) ＋ (D(13) × 16<sup>0</sup>)</strong>',
        render: () => `
          <div class="bit-calc-container">
            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 5px;">
              <span id="h-digit-1" style="color: var(--accent-blue);">1</span><span id="h-digit-2" style="color: var(--accent-cyan);">D</span><sub>(16)</sub>
            </div>
            <div class="calc-formula-line" id="hex-formula" style="margin-top: 1rem;">
              (1 × 16) ＋ (13 × 1)
            </div>
          </div>
        `,
        action: () => {
          setTimeout(() => {
            document.getElementById('h-digit-1').style.textShadow = 'var(--shadow-neon)';
            document.getElementById('h-digit-2').style.textShadow = '0 0 15px rgba(0, 242, 254, 0.4)';
          }, 200);
          setTimeout(() => {
            document.getElementById('hex-formula').classList.add('show');
          }, 600);
        }
      },
      {
        text: '<strong>合計を計算する</strong><br>数式を計算して足します。<br><strong>16 ＋ 13 ＝ 29</strong><br>よって、16進数の <strong>1D<sub>(16)</sub></strong> は、10進数で <strong>29<sub>(10)</sub></strong> となります。',
        render: () => `
          <div class="bit-calc-container">
            <div style="font-size: 1.5rem; color: var(--text-secondary);">1D<sub>(16)</sub> ➔ (16 × 1) ＋ 13</div>
            <div class="hex-final show" style="margin-top: 1rem; color: var(--accent-green);">16 ＋ 13 ＝ 29</div>
          </div>
        `,
        action: () => {}
      }
    ]
  };

  // 解説画面を表示する関数
  function showTutorial() {
    currentTutorialStep = 0;
    showScreen('learn');
    updateTutorial();
  }

  // 表示の更新
  function updateTutorial() {
    const currentList = tutorials[currentTutorialTab];
    const stepData = currentList[currentTutorialStep];

    // ドキュメントテキストとビジュアルの挿入
    tutorialCard.innerHTML = `
      <div class="tutorial-content">
        <div class="tutorial-text">${stepData.text}</div>
        <div class="tutorial-visual">
          ${stepData.render()}
        </div>
      </div>
    `;

    // アニメーション等のアクション発火
    stepData.action();

    // 戻る/進むボタンの無効化・有効化
    learnPrevBtn.disabled = currentTutorialStep === 0;
    if (currentTutorialStep === currentList.length - 1) {
      learnNextBtn.textContent = '完了';
    } else {
      learnNextBtn.textContent = '次へ';
    }

    // インジケータードットの描画
    updateIndicators(currentList.length);
  }

  // ステップドットインジケーターの更新
  function updateIndicators(totalSteps) {
    stepIndicators.innerHTML = '';
    for (let i = 0; i < totalSteps; i++) {
      const dot = document.createElement('div');
      dot.className = `step-dot ${i === currentTutorialStep ? 'active' : ''}`;
      stepIndicators.appendChild(dot);
    }
  }

  // タブ切り替えイベント
  learnTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      learnTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTutorialTab = tab.dataset.tab;
      currentTutorialStep = 0;
      updateTutorial();
    });
  });

  // 進む・戻るボタンイベント
  learnNextBtn.addEventListener('click', () => {
    const currentList = tutorials[currentTutorialTab];
    if (currentTutorialStep < currentList.length - 1) {
      currentTutorialStep++;
      updateTutorial();
    } else {
      // 完了したらメニューに戻る
      showScreen('submenu');
    }
  });

  learnPrevBtn.addEventListener('click', () => {
    if (currentTutorialStep > 0) {
      currentTutorialStep--;
      updateTutorial();
    }
  });

  // ボタンイベントの紐付け
  learnCloseBtn.addEventListener('click', () => showScreen('submenu'));

  // キーボードの左右キーによるスライド切り替え
  document.addEventListener('keydown', (e) => {
    // 解説画面がアクティブな場合のみ反応させる
    if (screens.learn && screens.learn.classList.contains('active')) {
      if (e.key === 'ArrowRight') {
        // 次へ
        if (!learnNextBtn.disabled) {
          learnNextBtn.click();
        }
      } else if (e.key === 'ArrowLeft') {
        // 前へ
        if (!learnPrevBtn.disabled) {
          learnPrevBtn.click();
        }
      }
    }
  });
});
