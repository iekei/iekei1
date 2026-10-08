(function () {
  'use strict';

  var IDEOLOGY_COLORS = {
    communism: '#d62828',
    fascism: '#25834a',
    capitalism: '#2878c7'
  };
  var CATEGORY_LABELS = {
    army: '陸',
    politics: '政',
    navy: '海',
    air: '空'
  };

  function categoryOf(card) {
    if (CATEGORY_LABELS[card.category]) return card.category;
    if (card.type === 'navy' || card.type === 'air') return card.type;
    return card.type === 'general' ? 'army' : 'politics';
  }

  function colorOf(card) {
    var ideology = card.ideology || document.body.dataset.ideology;
    return IDEOLOGY_COLORS[ideology] || IDEOLOGY_COLORS.capitalism;
  }

  function draw(ctx, card) {
    var color = colorOf(card);
    var label = CATEGORY_LABELS[categoryOf(card)];
    var width = ctx.canvas.width;
    var height = ctx.canvas.height;

    ctx.strokeStyle = color;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.roundRect(12, 12, width - 24, height - 24, 28);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(65, 65, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 65, 65);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(width - 126, 34, 92, 48, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText(card.rank, width - 80, 58);
  }

  function decorateZukan(element, card) {
    element.style.setProperty('--card-frame-color', colorOf(card));
    var badge = document.createElement('span');
    badge.className = 'zukan-type-badge';
    badge.textContent = CATEGORY_LABELS[categoryOf(card)];
    badge.setAttribute('aria-label', {
      army: '陸軍',
      politics: '政治',
      navy: '海軍',
      air: '空軍'
    }[categoryOf(card)]);
    element.appendChild(badge);
  }

  var style = document.createElement('style');
  style.textContent =
    '.zukan-card{border-color:var(--card-frame-color)!important}' +
    '.zukan-card .zukan-type-badge{position:absolute;top:5px;left:5px;width:32px;height:32px;' +
    'display:flex;align-items:center;justify-content:center;border:2px solid #fff;border-radius:50%;' +
    'background:var(--card-frame-color);color:#fff;font-size:15px;font-weight:900;z-index:2;' +
    'box-shadow:0 2px 6px #0008}' +
    '.zukan-card.locked .zukan-type-badge{opacity:.85}';
  document.head.appendChild(style);

  window.CardFrames = {
    colorOf: colorOf,
    categoryOf: categoryOf,
    draw: draw,
    decorateZukan: decorateZukan,
    labelOf: function (card) { return CATEGORY_LABELS[categoryOf(card)]; }
  };
})();
