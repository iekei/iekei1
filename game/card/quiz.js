(function() {
  'use strict';

  // ===== Coin System =====
  var COIN_KEY = 'card_coins';

  function getCoins() {
    return parseInt(localStorage.getItem(COIN_KEY) || '0', 10);
  }
  function setCoins(val) {
    localStorage.setItem(COIN_KEY, String(val));
    updateCoinDisplay();
  }
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

  // ===== Quiz State =====
  var quizState = null;

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
  function startQuiz(card, mode) {
    var cid = card.id;
    if (!cid) { alert('このカードにはクイズがありません'); return; }
    fetch('data/json/' + cid + '.json')
      .then(function(res) { if (!res.ok) throw new Error('NF'); return res.json(); })
      .then(function(data) {
        if (!data.questions || !data.questions.length) { alert('問題データがありません'); return; }
        quizState = {
          card: card, mode: mode,
          questions: data.questions.sort(function(a, b) { return a.year - b.year; }),
          currentIndex: 0, correctCount: 0, answered: false
        };
        showQuizModal();
      })
      .catch(function() { alert('このキャラクターのクイズデータは準備中です'); });
  }

  function showQuizModal() {
    var modal = document.getElementById('quiz-modal');
    if (!modal) return;
    var body = modal.querySelector('.quiz-body');
    var result = modal.querySelector('.quiz-result');
    if (body) body.style.display = 'flex';
    if (result) result.style.display = 'none';
    var ci = modal.querySelector('.quiz-character-info');
    if (ci) ci.textContent = quizState.card.name;

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

  function showQuestion() {
    var modal = document.getElementById('quiz-modal');
    var q = quizState.questions[quizState.currentIndex];
    var total = quizState.questions.length;
    var progress = total > 1 ? quizState.currentIndex / (total - 1) : 0;

    updateBackground(progress);
    updateDepthGauge(quizState.currentIndex);

    var yearEl = modal.querySelector('.quiz-year');
    if (yearEl) yearEl.textContent = q.yearDisplay;
    var textEl = modal.querySelector('.quiz-text');
    if (textEl) textEl.textContent = q.text;

    var answerArea = modal.querySelector('.quiz-answer-area');
    if (answerArea) answerArea.innerHTML = '';
    var feedback = modal.querySelector('.quiz-feedback');
    if (feedback) { feedback.textContent = ''; feedback.className = 'quiz-feedback'; }

    if (quizState.mode === 'easy') {
      var options = (q.options || []).slice();
      // shuffle
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
        if (e.key === 'Enter') handleAnswer(input, input.value.trim() === q.blankWord);
      });
      answerArea.appendChild(input);
      answerArea.appendChild(submitBtn);
      setTimeout(function() { input.focus(); }, 100);
    }
  }

  function handleAnswer(element, isCorrect) {
    if (quizState.answered) return;
    quizState.answered = true;
    if (isCorrect) quizState.correctCount++;
    if (element) element.classList.add(isCorrect ? 'correct' : 'incorrect');

    var fb = document.querySelector('.quiz-feedback');
    if (fb) {
      fb.textContent = isCorrect ? '正解！' : '不正解...';
      fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'incorrect');
    }
    var btns = document.querySelectorAll('.quiz-option-btn, .quiz-submit-btn');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

    setTimeout(function() {
      quizState.answered = false;
      quizState.currentIndex++;
      if (quizState.currentIndex < quizState.questions.length) showQuestion();
      else showQuizResult();
    }, 1500);
  }

  function showQuizResult() {
    var modal = document.getElementById('quiz-modal');
    var body = modal.querySelector('.quiz-body');
    var result = modal.querySelector('.quiz-result');
    if (body) body.style.display = 'none';
    if (result) {
      result.style.display = 'flex';
      var scoreEl = result.querySelector('.result-score');
      if (scoreEl) scoreEl.textContent = quizState.correctCount + ' / ' + quizState.questions.length + ' 正解';
      var reward = quizState.mode === 'hard' ? 150 : 50;
      addCoins(reward);
      var rewardEl = result.querySelector('.coin-reward');
      if (rewardEl) rewardEl.textContent = '+' + reward + ' コイン獲得！';
      var closeBtn = result.querySelector('.quiz-close-result-btn');
      if (closeBtn) closeBtn.onclick = closeQuiz;
    }
  }

  function closeQuiz() {
    var modal = document.getElementById('quiz-modal');
    if (modal) modal.style.display = 'none';
    quizState = null;
  }

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
      { r: 100, g: 200, b: 230 },
      { r: 30, g: 120, b: 180 },
      { r: 15, g: 50, b: 100 },
      { r: 5, g: 10, b: 30 }
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
