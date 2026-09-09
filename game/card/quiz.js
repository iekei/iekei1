(function() {
  'use strict';

  // ===== Coin System =====
  var COIN_KEY = 'card_coins';
  function getCoins() { return parseInt(localStorage.getItem(COIN_KEY) || '0', 10); }
  function setCoins(val) { localStorage.setItem(COIN_KEY, String(val)); updateCoinDisplay(); }
  function addCoins(amount) { setCoins(getCoins() + amount); }
  function spendCoins(amount) {
    if (getCoins() >= amount) { setCoins(getCoins() - amount); return true; }
    return false;
  }
  function updateCoinDisplay() {
    var els = document.querySelectorAll('.coin-amount');
    for (var i = 0; i < els.length; i++) els[i].textContent = getCoins();
    var btn = document.getElementById('purchase-btn');
    if (btn) btn.disabled = getCoins() < 100;
  }
  window.CardShop = { getCoins: getCoins, addCoins: addCoins, spendCoins: spendCoins, updateCoinDisplay: updateCoinDisplay };

  // ===== Debug Console =====
  function isInputFocused() {
    var el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  function debugLog(msg) {
    var log = document.querySelector('.debug-log');
    if (!log) return;
    var div = document.createElement('div');
    div.textContent = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function executeDebugCommand(cmd) {
    var parts = cmd.trim().split(/\s+/);
    var command = parts[0];
    if (command === '/coin') {
      var amount = parseInt(parts[1], 10) || 0;
      addCoins(amount);
      debugLog('🪙 +' + amount + ' コイン追加 (所持: ' + getCoins() + ')');
    } else if (command === '/reset') {
      localStorage.removeItem(COIN_KEY);
      localStorage.removeItem('ger_unlocked_cards');
      localStorage.removeItem('jap_unlocked_cards');
      localStorage.removeItem('sov_unlocked_cards');
      updateCoinDisplay();
      debugLog('🗑️ 全データをリセットしました');
    } else if (command === '/all') {
      var nation = document.body.dataset.nation;
      var key = nation ? nation.toLowerCase() + '_unlocked_cards' : null;
      if (key && typeof leaders !== 'undefined') {
        var allIds = leaders.map(function(l) { return l.id; }).filter(Boolean);
        localStorage.setItem(key, JSON.stringify(allIds));
        debugLog('🔓 全カードを解放しました (' + allIds.length + '枚)');
      } else {
        debugLog('❌ カードデータが取得できません');
      }
    } else if (command === '/aikey') {
      if (parts[1]) {
        localStorage.setItem('ai_api_key', parts[1]);
        debugLog('🤖 AI APIキーを設定しました');
      } else {
        localStorage.removeItem('ai_api_key');
        debugLog('🤖 AI APIキーを削除しました');
      }
    } else {
      debugLog('❓ 不明: ' + cmd);
      debugLog('cmds: /coin <n> /reset /all /aikey <key>');
    }
  }

  function initDebugConsole() {
    var dc = document.getElementById('debug-console');
    if (!dc) return;
    var input = dc.querySelector('.debug-input');
    var closeBtn = dc.querySelector('.debug-close');

    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        dc.style.display = dc.style.display === 'flex' ? 'none' : 'flex';
        if (dc.style.display === 'flex') input.focus();
      }
      if (e.key === 'Escape') dc.style.display = 'none';
    });

    closeBtn.addEventListener('click', function() { dc.style.display = 'none'; });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        executeDebugCommand(input.value);
        input.value = '';
      }
    });
  }

  // ===== AI Quiz Generation =====
  async function generateQuizWithAI(characterName, yearRange) {
    var apiKey = localStorage.getItem('ai_api_key');
    if (!apiKey) return null;

    var prompt =
      '以下の歴史人物に関する穴埋め漢字クイズを15問生成してください。\n' +
      '人物名: ' + characterName + '\n' +
      '年代範囲: ' + (yearRange || '1930年代〜1940年代') + '\n' +
      '条件:\n' +
      '1. JSON形式: {"questions":[{"id":1,"year":1936,"yearDisplay":"1936年","text":"【 桶狭間 】の戦いで…","blankWord":"桶狭間","options":["桶狭間","長篠","関ヶ原"]}]}\n' +
      '2. text内の正解単語を【 】で囲む\n' +
      '3. optionsは3つの選択肢（正解を含む）\n' +
      '4. 年代順（古い順）に並べる\n' +
      '5. 高校歴史で重要な語句を使用\n' +
      '6. 15問すべて異なる内容にする';

    try {
      var response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      if (!response.ok) throw new Error('API error: ' + response.status);
      var data = await response.json();
      var content = data.choices[0].message.content;
      var parsed = JSON.parse(content);
      return parsed.questions || parsed;
    } catch (e) {
      console.error('AI quiz generation failed:', e);
      return null;
    }
  }

  // ===== Quiz State =====
  var quizState = null;
  var timerInterval = null;

  // ===== Card Detail Modal =====
  function openCardDetail(card) {
    var modal = document.getElementById('card-detail-modal');
    if (!modal) return;
    var img = modal.querySelector('.card-detail-img');
    var name = modal.querySelector('.card-detail-name');
    var desc = modal.querySelector('.card-detail-desc');
    var easyBtn = modal.querySelector('.quiz-easy-btn');
    var hardBtn = modal.querySelector('.quiz-hard-btn');

    img.src = card.imgUrl || '';
    img.style.display = card.imgUrl ? 'block' : 'none';
    img.onerror = function() { img.style.display = 'none'; };
    name.textContent = card.rank + ' ' + card.name;
    name.style.color = card.color || '#fff';
    desc.textContent = card.desc || '';

    easyBtn.onclick = function() {
      modal.style.display = 'none';
      var z = document.getElementById('zukan-modal');
      if (z) z.style.display = 'none';
      startQuiz(card, 'easy');
    };
    hardBtn.onclick = function() {
      modal.style.display = 'none';
      var z = document.getElementById('zukan-modal');
      if (z) z.style.display = 'none';
      startQuiz(card, 'hard');
    };
    modal.style.display = 'flex';
  }

  // ===== Quiz System =====
  async function startQuiz(card, mode) {
    var cid = card.id;
    if (!cid) { alert('このカードにはクイズがありません'); return; }

    // Try AI generation first
    var questions = null;
    try { questions = await generateQuizWithAI(card.name); } catch (e) { questions = null; }

    // Fall back to JSON
    if (!questions || !questions.length) {
      try {
        var response = await fetch('data/json/' + cid + '.json');
        if (!response.ok) throw new Error('NF');
        var data = await response.json();
        questions = data.questions;
      } catch (e) {
        alert('このキャラクターのクイズデータは準備中です');
        return;
      }
    }

    if (!questions || !questions.length) { alert('問題データがありません'); return; }

    questions.sort(function(a, b) { return a.year - b.year; });

    quizState = {
      card: card, mode: mode, questions: questions,
      currentIndex: 0, correctCount: 0, answered: false, lives: 3
    };

    showQuizModal();
  }

  function showQuizModal() {
    var modal = document.getElementById('quiz-modal');
    if (!modal) return;
    var content = modal.querySelector('.quiz-content');
    var result = modal.querySelector('.quiz-result');
    if (content) content.style.display = 'flex';
    if (result) result.style.display = 'none';

    var ci = modal.querySelector('.quiz-character-info');
    if (ci) ci.textContent = quizState.card.name;

    // Card image
    var cardImg = modal.querySelector('.quiz-card-img');
    if (cardImg) {
      cardImg.src = quizState.card.imgUrl || '';
      cardImg.style.display = quizState.card.imgUrl ? 'block' : 'none';
      cardImg.onerror = function() { cardImg.style.display = 'none'; };
    }

    // Lives
    updateLivesDisplay();

    // Build depth gauge
    var gauge = modal.querySelector('.depth-gauge');
    if (gauge) {
      gauge.innerHTML = '';
      for (var i = 0; i < quizState.questions.length; i++) {
        var mark = document.createElement('div');
        mark.className = 'gauge-mark';
        var ys = document.createElement('span');
        ys.className = 'gauge-year';
        ys.textContent = quizState.questions[i].yearDisplay;
        mark.appendChild(ys);
        gauge.appendChild(mark);
      }
    }
    updateBackground(0);
    modal.style.display = 'flex';
    showQuestion();
  }

  function hideAnswer(text, blankWord) {
    var circles = '';
    for (var i = 0; i < blankWord.length; i++) circles += '○';
    return text.replace(/【\s*[^】]+\s*】/, '【' + circles + '】');
  }

  function showQuestion() {
    var modal = document.getElementById('quiz-modal');
    var q = quizState.questions[quizState.currentIndex];
    var total = quizState.questions.length;
    var progress = total > 1 ? quizState.currentIndex / (total - 1) : 0;

    updateBackground(progress);
    updateDepthGauge(quizState.currentIndex);

    var progressEl = modal.querySelector('.quiz-progress');
    if (progressEl) progressEl.textContent = '問 ' + (quizState.currentIndex + 1) + ' / ' + total;

    var yearEl = modal.querySelector('.quiz-year');
    if (yearEl) yearEl.textContent = q.yearDisplay;

    var textEl = modal.querySelector('.quiz-text');
    if (textEl) textEl.textContent = hideAnswer(q.text, q.blankWord);

    var answerArea = modal.querySelector('.quiz-answer-area');
    if (answerArea) answerArea.innerHTML = '';
    var feedback = modal.querySelector('.quiz-feedback');
    if (feedback) { feedback.textContent = ''; feedback.className = 'quiz-feedback'; }

    if (quizState.mode === 'easy') {
      var options = (q.options || []).slice();
      for (var i = options.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
      }
      options.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        btn.textContent = opt;
        btn.onclick = function() { handleAnswer(btn, opt === q.blankWord); };
        answerArea.appendChild(btn);
      });
    } else {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'quiz-input';
      input.placeholder = '答えを入力...';
      var submitBtn = document.createElement('button');
      submitBtn.className = 'quiz-submit-btn';
      submitBtn.textContent = '回答';
      submitBtn.onclick = function() { handleAnswer(input, input.value.trim() === q.blankWord); };
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); handleAnswer(input, input.value.trim() === q.blankWord); }
      });
      answerArea.appendChild(input);
      answerArea.appendChild(submitBtn);
      setTimeout(function() { input.focus(); }, 100);
    }

    startTimer();
  }

  // ===== Timer =====
  function startTimer() {
    stopTimer();
    var timeLeft = 10;
    var timerText = document.querySelector('.quiz-timer-text');
    var timerFill = document.querySelector('.quiz-timer-fill');

    if (timerText) timerText.textContent = timeLeft;
    if (timerFill) {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      void timerFill.offsetWidth;
      timerFill.style.transition = 'width 10s linear';
      timerFill.style.width = '0%';
    }

    timerInterval = setInterval(function() {
      timeLeft--;
      if (timerText) timerText.textContent = timeLeft;
      if (timeLeft <= 0) {
        stopTimer();
        onTimeout();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    var timerFill = document.querySelector('.quiz-timer-fill');
    if (timerFill) {
      var w = window.getComputedStyle(timerFill).width;
      timerFill.style.transition = 'none';
      timerFill.style.width = w;
    }
  }

  function onTimeout() {
    if (!quizState || quizState.answered) return;
    handleAnswer(null, false);
  }

  // ===== Lives =====
  function updateLivesDisplay() {
    var livesEl = document.querySelector('.quiz-lives');
    if (!livesEl || !quizState) return;
    var hearts = '';
    for (var i = 0; i < quizState.lives; i++) hearts += '❤️';
    for (var i = quizState.lives; i < 3; i++) hearts += '🖤';
    livesEl.textContent = hearts;
  }

  function shakeCard() {
    var card = document.querySelector('.quiz-card-display');
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    var img = document.querySelector('.quiz-card-img');
    if (img) { img.classList.remove('hit-flash'); void img.offsetWidth; img.classList.add('hit-flash'); }
  }

  // ===== Answer Handling =====
  function handleAnswer(element, isCorrect) {
    if (!quizState || quizState.answered) return;
    quizState.answered = true;
    stopTimer();

    if (isCorrect) {
      quizState.correctCount++;
      if (element) element.classList.add('correct');
    } else {
      if (element) element.classList.add('incorrect');
      shakeCard();
      quizState.lives--;
      updateLivesDisplay();
    }

    var fb = document.querySelector('.quiz-feedback');
    if (fb) {
      fb.textContent = isCorrect ? '正解！' : '不正解...';
      fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'incorrect');
    }
    var btns = document.querySelectorAll('.quiz-option-btn, .quiz-submit-btn');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

    var gameOver = quizState.lives <= 0;

    setTimeout(function() {
      quizState.answered = false;
      if (gameOver) { showQuizResult(true); return; }
      quizState.currentIndex++;
      if (quizState.currentIndex < quizState.questions.length) showQuestion();
      else showQuizResult(false);
    }, 1500);
  }

  function skipQuestion() {
    if (!quizState || quizState.answered) return;
    stopTimer();
    quizState.answered = true;

    var fb = document.querySelector('.quiz-feedback');
    if (fb) { fb.textContent = 'スキップ'; fb.className = 'quiz-feedback incorrect'; }
    var btns = document.querySelectorAll('.quiz-option-btn, .quiz-submit-btn');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

    shakeCard();
    quizState.lives--;
    updateLivesDisplay();
    var gameOver = quizState.lives <= 0;

    setTimeout(function() {
      quizState.answered = false;
      if (gameOver) { showQuizResult(true); return; }
      quizState.currentIndex++;
      if (quizState.currentIndex < quizState.questions.length) showQuestion();
      else showQuizResult(false);
    }, 1000);
  }

  // ===== Result =====
  function showQuizResult(isGameOver) {
    stopTimer();
    var modal = document.getElementById('quiz-modal');
    var content = modal.querySelector('.quiz-content');
    var result = modal.querySelector('.quiz-result');
    if (content) content.style.display = 'none';
    if (result) {
      result.style.display = 'flex';
      var titleEl = result.querySelector('.result-title');
      var scoreEl = result.querySelector('.result-score');
      var rewardEl = result.querySelector('.coin-reward');

      if (isGameOver) {
        if (titleEl) titleEl.textContent = 'ゲームオーバー';
        if (scoreEl) scoreEl.textContent = quizState.correctCount + ' / ' + quizState.questions.length + ' 正解';
        if (rewardEl) { rewardEl.textContent = '報酬なし'; rewardEl.style.color = '#ef5350'; }
      } else {
        if (titleEl) titleEl.textContent = 'クイズ完了！';
        if (scoreEl) scoreEl.textContent = quizState.correctCount + ' / ' + quizState.questions.length + ' 正解';
        var reward = quizState.mode === 'hard' ? 150 : 50;
        addCoins(reward);
        if (rewardEl) { rewardEl.textContent = '+' + reward + ' コイン獲得！'; rewardEl.style.color = '#ffd700'; }
      }
      var closeBtn = result.querySelector('.quiz-close-result-btn');
      if (closeBtn) closeBtn.onclick = closeQuiz;
    }
  }

  function closeQuiz() {
    stopTimer();
    var modal = document.getElementById('quiz-modal');
    if (modal) modal.style.display = 'none';
    quizState = null;
  }

  // ===== Depth Gauge & Background =====
  function updateDepthGauge(idx) {
    var marks = document.querySelectorAll('.gauge-mark');
    for (var i = 0; i < marks.length; i++) {
      marks[i].classList.remove('active', 'completed');
      if (i < idx) marks[i].classList.add('completed');
      if (i === idx) marks[i].classList.add('active');
    }
    var marker = document.querySelector('.depth-marker');
    if (marker && quizState) {
      var total = quizState.questions.length;
      var pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
      marker.style.top = 'calc(' + pct + '% - 12px)';
    }
  }

  function updateBackground(progress) {
    var modal = document.getElementById('quiz-modal');
    if (!modal) return;
    var colors = [
      { r: 100, g: 200, b: 230 }, { r: 30, g: 120, b: 180 },
      { r: 15, g: 50, b: 100 }, { r: 5, g: 10, b: 30 }
    ];
    var seg = colors.length - 1;
    var si = Math.min(Math.floor(progress * seg), seg - 1);
    var sp = (progress * seg) - si;
    var c1 = colors[si], c2 = colors[si + 1];
    var r = Math.round(c1.r + (c2.r - c1.r) * sp);
    var g = Math.round(c1.g + (c2.g - c1.g) * sp);
    var b = Math.round(c1.b + (c2.b - c1.b) * sp);
    modal.style.background = 'radial-gradient(ellipse at center, rgb(' + r + ',' + g + ',' + b + ') 0%, rgb(' + Math.max(0, r - 20) + ',' + Math.max(0, g - 20) + ',' + Math.max(0, b - 20) + ') 100%)';
  }

  // ===== Init =====
  function init() {
    updateCoinDisplay();
    initDebugConsole();

    // Purchase button
    var pb = document.getElementById('purchase-btn');
    if (pb) pb.addEventListener('click', function() {
      if (typeof window.openPack === 'function') window.openPack(1);
    });

    // Zukan grid click delegation
    var zg = document.getElementById('zukan-grid');
    if (zg) zg.addEventListener('click', function(e) {
      var cardEl = e.target.closest('.zukan-card.unlocked');
      if (!cardEl) return;
      var idx = Array.prototype.indexOf.call(zg.children, cardEl);
      if (typeof leaders !== 'undefined' && leaders[idx]) openCardDetail(leaders[idx]);
    });

    // Card detail close
    var dm = document.getElementById('card-detail-modal');
    if (dm) {
      var dcb = dm.querySelector('.card-detail-close');
      if (dcb) dcb.addEventListener('click', function() { dm.style.display = 'none'; });
    }

    // Quiz close
    var qm = document.getElementById('quiz-modal');
    if (qm) {
      var qcb = qm.querySelector('.quiz-close-btn');
      if (qcb) qcb.addEventListener('click', closeQuiz);
    }

    // Skip with Space key
    document.addEventListener('keydown', function(e) {
      if (e.key === ' ' && quizState && !quizState.answered) {
        var modal = document.getElementById('quiz-modal');
        if (modal && modal.style.display === 'flex' && !isInputFocused()) {
          e.preventDefault();
          skipQuestion();
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
