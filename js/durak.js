/* ==== ДУРАК (перекидной, против бота) ==== */
window.Durak = (() => {
  const C = CARDS;
  const $ = (id) => document.getElementById(id);
  let state = {
    deck: [], trump: null, player: [], bot: [],
    table: [],        // [{a:card, d:card|null}]
    attacker: 'player',
    defender: 'bot',
    mode: 'Простий',
    stake: 10,
    wagerId: null,
    phase: 'play',    // play|result|gameover
    selected: null,
    msg: 'Роздача...',
    gameOver: false, winner: null,
  };
  let skin = 'default';
  let botTimer = null;
  const BOT_TURN_DELAY = 1200;

  function finishGame(winner, message) {
    state.gameOver = true;
    state.winner = winner;
    state.phase = 'gameover';
    const payout = winner === 'player' ? state.stake * 2 : winner === null ? state.stake : 0;
    if (state.wagerId && window.settleUserWager) {
      window.settleUserWager(state.wagerId, payout);
    }
    const change = winner === 'player' ? payout : winner === null ? state.stake : -state.stake;
    setMsg(`${message} ${change > 0 ? '+' : ''}${change} 🪙`);
  }

  function ranksOnTable() {
    const s = new Set();
    state.table.forEach((r) => { s.add(r.a.rank); if (r.d) s.add(r.d.rank); });
    return s;
  }
  function lastOpenRow() {
    for (let i = state.table.length - 1; i >= 0; i--) if (!state.table[i].d) return state.table[i];
    return null;
  }
  function allBeaten() { return state.table.every((r) => !!r.d); }
  function isTransferMode() {
    const mode = String(state.mode || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return mode.includes('перевід') || mode.includes('перевод') || mode.includes('перекид');
  }
  function canTransferToBot(card) {
    return isTransferMode() &&
      state.phase === 'defend_player' &&
      state.table.length > 0 &&
      state.table.every((row) => !row.d) &&
      state.table.some((row) => row.a.rank === card.rank) &&
      state.bot.length >= state.table.length + 1;
  }
  function lowestTrump(hand) {
    let best = null;
    for (const c of hand) {
      if (c.suit === state.trump.suit && (!best || C.RANK_VAL[c.rank] < C.RANK_VAL[best.rank])) best = c;
    }
    return best;
  }
  function setMsg(m) { state.msg = m; $('#durak-status').textContent = m; $('#durak-msg').textContent = m; }
  function refill() {
    const first = state.attacker === 'player' ? state.player : state.bot;
    const second = state.attacker === 'player' ? state.bot : state.player;
    [first, second].forEach((hand) => {
      while (hand.length < 6 && state.deck.length > 0) hand.push(state.deck.pop());
    });
    $('#durak-deck-count').textContent = state.deck.length;
  }
  function gameOverCheck() {
    if (state.player.length === 0 && state.bot.length === 0 && state.deck.length === 0) {
      finishGame(null, 'Нічия!'); return true;
    }
    if (state.player.length === 0) { finishGame('player', 'Ви виграли!'); return true; }
    if (state.bot.length === 0) { finishGame('bot', 'Бот виграв!'); return true; }
    return false;
  }
    function nextAttack() {
    if (gameOverCheck()) { render(); return; }
    render();
    if (state.gameOver) return;
    if (state.attacker === 'player') {
      setMsg('Ваш хід — оберіть карту дляходу.');
      state.phase = 'attack_player'; state.selected = null;
    } else {
      setMsg('Бот ходить...');
      state.phase = 'bot_attack';
      botTimer = setTimeout(botAttack, BOT_TURN_DELAY);
    }
  }
  function botAttack() {
    if (state.gameOver) return;
    const nonTrump = state.bot.filter((c) => c.suit !== state.trump.suit);
    const pool = nonTrump.length ? nonTrump : state.bot;
    pool.sort((a, b) => C.RANK_VAL[a.rank] - C.RANK_VAL[b.rank] || C.SUITS[a.suit].order - C.SUITS[b.suit].order);
    const card = pool[0];
    state.bot.splice(state.bot.indexOf(card), 1);
    state.table.push({ a: card, d: null });
    setMsg('Бот ходить ' + card.rank + C.SUITS[card.suit].sym + '. Вам бити.');
    state.phase = 'defend_player';
    render();
  }
  function selectPlayerCard(idx) {
    if (state.gameOver) return;
    if (state.phase === 'attack_player') {
      const card = state.player[idx];
      if (state.table.length > 0 && !ranksOnTable().has(card.rank)) {
        setMsg('Подкидати можна тільки достоїнством, яке вже на столі.');
        return;
      }
      state.table.push({ a: card, d: null });
      state.player.splice(idx, 1);
      setMsg('Ви ходите. Бот бить...');
      state.phase = 'bot_defend';
      render();
      botTimer = setTimeout(botDefend, BOT_TURN_DELAY);
    } else if (state.phase === 'defend_player') {
      if (canTransferToBot(state.player[idx])) {
        const card = state.player.splice(idx, 1)[0];
        state.table.push({ a: card, d: null });
        state.attacker = 'player';
        state.defender = 'bot';
        setMsg('Переведено!');
        state.phase = 'bot_defend';
        render();
        botTimer = setTimeout(botDefend, BOT_TURN_DELAY);
        return;
      }
      const row = lastOpenRow();
      if (!row) return;
      const card = state.player[idx];
      if (!C.beat(row.a, card, state.trump.suit)) {
        setMsg('Ця карта не бьеться. Оберіть іншу або натисніть "Брати".');
        return;
      }
      state.player.splice(idx, 1);
      row.d = card;
      setMsg('Ви побили. Можна подкидати або завершити хід.');
      state.phase = 'add_player';
      render();
      if (allBeaten()) botTimer = setTimeout(botAddOrFinish, BOT_TURN_DELAY);
    } else if (state.phase === 'add_player') {
      const card = state.player[idx];
      if (!ranksOnTable().has(card.rank)) { setMsg('Недостойне для подкидання.'); return; }
      state.table.push({ a: card, d: null });
      state.player.splice(idx, 1);
      setMsg('Ви подкинули. Бот бить...');
      state.phase = 'bot_defend';
      render();
      botTimer = setTimeout(botDefend, BOT_TURN_DELAY);
    }
    render();
  }
  function takeCards() {
    if (state.gameOver || state.phase !== 'defend_player') return;
    const hand = state.player;
    state.table.forEach((r) => { hand.push(r.a); if (r.d) hand.push(r.d); });
    state.table = [];
    refill();
    setMsg('Ви взяли карти. Хід залишається за вами.');
    state.attacker = 'player'; state.defender = 'bot';
    state.phase = 'attack_player';
    render();
    gameOverCheck();
  }
  function finishAttack() {
    if (state.gameOver || state.phase !== 'add_player' || !allBeaten()) return;
    state.table = [];
    refill();
    const tmp = state.attacker; state.attacker = state.defender; state.defender = tmp;
    setMsg(state.attacker === 'player' ? 'Ваш хід.' : 'Бот ходить...');
    state.phase = state.attacker === 'player' ? 'attack_player' : 'bot_attack';
    render();
    if (state.gameOver) return;
    if (state.attacker === 'bot') botTimer = setTimeout(botAttack, BOT_TURN_DELAY);
  }
  function botDefend() {
    if (state.gameOver) return;
    if (isTransferMode() && state.table.length > 0 && state.table.every((row) => !row.d) &&
        state.player.length >= state.table.length + 1) {
      const ranks = new Set(state.table.map((row) => row.a.rank));
      const card = state.bot.find((item) => ranks.has(item.rank));
      if (card) {
        state.bot.splice(state.bot.indexOf(card), 1);
        state.table.push({ a: card, d: null });
        state.attacker = 'bot';
        state.defender = 'player';
        setMsg('Бот перевів атаку!');
        state.phase = 'defend_player';
        render();
        return;
      }
    }
    const row = lastOpenRow();
    if (!row) return;
    const beater = C.cheapestBeater(row.a, state.bot, state.trump.suit);
    if (beater) {
      state.bot.splice(state.bot.indexOf(beater), 1);
      row.d = beater;
      setMsg('Бот відбив ' + beater.rank + C.SUITS[beater.suit].sym + '. Можна подкидати.');
      state.phase = 'add_player';
      render();
      botTimer = setTimeout(botAddOrFinish, BOT_TURN_DELAY);
    } else {
      takeCardsBot();
    }
  }
  function takeCardsBot() {
    state.table.forEach((r) => { state.bot.push(r.a); if (r.d) state.bot.push(r.d); });
    state.table = [];
    refill();
    setMsg('Бот не вибив і взяв карти. Ваш хід.');
    state.attacker = 'player'; state.defender = 'bot';
    state.phase = 'attack_player';
    render();
    gameOverCheck();
  }
  function botAddOrFinish() {
    if (state.gameOver) return;
    if (!allBeaten()) return;
    const ranks = ranksOnTable();
    const addable = state.bot.filter((c) => ranks.has(c.rank));
    let added = false;
    if (addable.length && state.table.length < 4) {
      addable.sort((a, b) => C.RANK_VAL[a.rank] - C.RANK_VAL[b.rank]);
      const c = addable[0];
      if (c.suit !== state.trump.suit || state.bot.length > 4) {
        state.bot.splice(state.bot.indexOf(c), 1);
        state.table.push({ a: c, d: null });
        setMsg('Бот подкинув ' + c.rank + C.SUITS[c.suit].sym + '. Вам бити.');
        state.phase = 'defend_player';
        render();
        added = true;
        return;
      }
    }
    if (!added) {
      state.table = [];
      refill();
      const tmp = state.attacker; state.attacker = state.defender; state.defender = tmp;
      setMsg(state.attacker === 'player' ? 'Ваш хід.' : 'Бот ходить...');
      state.phase = state.attacker === 'player' ? 'attack_player' : 'bot_attack';
      render();
      if (state.gameOver) return;
      if (state.attacker === 'bot') botTimer = setTimeout(botAttack, BOT_TURN_DELAY);
    }
  }
  function render() {
    skin = window.APP_STATE?.activeSkin || 'classic-red';
    const t = state.trump;
    $('#durak-trump').innerHTML = `<img src="${C.cardFaceImg(t.rank, t.suit, 54)}">`;
    $('#durak-trump-suit').textContent = t.suit.charAt(0).toUpperCase() + t.suit.slice(1) + ' ' + C.SUITS[t.suit].sym;
    $('#durak-bot-hand').innerHTML = state.bot
      .map(() => `<div class="card-back" style="background-image:url('${C.cardBackImg(skin, 38)}')"></div>`)
      .join('');
    const tableEl = $('#durak-table');
    tableEl.innerHTML = '';
    state.table.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'table-row';
      div.innerHTML = `
        <div class="played-card"><img src="${C.cardFaceImg(r.a.rank, r.a.suit, 42)}"></div>
        <div class="arrow-beat">${r.d ? '✔' : '→'}</div>
        <div class="played-card">${r.d ? `<img src="${C.cardFaceImg(r.d.rank, r.d.suit, 42)}">` : ''}</div>
      `;
      tableEl.appendChild(div);
    });
    const ranks = ranksOnTable();
    $('#durak-player-hand').innerHTML = state.player.map((card, idx) => {
      let enabled = true;
      if (state.phase === 'defend_player') {
        const row = lastOpenRow();
        enabled = canTransferToBot(card) || (row ? C.beat(row.a, card, state.trump.suit) : false);
      } else if (state.phase === 'add_player') {
        enabled = ranks.has(card.rank);
      } else if (state.phase === 'attack_player') {
        enabled = state.table.length === 0 || ranks.has(card.rank);
      }
      return `<div class="hand-card ${state.selected===idx?'selected':''} ${enabled?'':'disabled'}" data-idx="${idx}" onclick="Durak.tap(${idx})">${C.cardFaceImg(card.rank, card.suit, 44)}</div>`;
    }).join('');
    renderFooter();
    $('#durak-deck-count').textContent = state.deck.length;
  }
  function renderFooter() {
    const f = $('#durak-footer');
    f.innerHTML = '';
    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    if (state.gameOver) {
      f.appendChild(btn('Нова гра', 'primary', () => startNewGame()));
      return;
    }
    if (state.phase === 'defend_player') {
      f.appendChild(btn('Брати', '', takeCards));
    } else if (state.phase === 'add_player') {
      f.appendChild(btn('Завершити хід', 'primary', finishAttack));
    }
  }
  function swapAndNext() {
    if (state.table.length !== 0) return;
    const tmp = state.attacker; state.attacker = state.defender; state.defender = tmp;
    state.phase = state.attacker === 'player' ? 'attack_player' : 'bot_attack';
    setMsg(state.attacker === 'player' ? 'Ваш хід.' : 'Бот ходить...');
    render();
    if (state.attacker === 'bot') botTimer = setTimeout(botAttack, BOT_TURN_DELAY);
  }
  function startNewGame(mode = state.mode || 'Простий', stake = state.stake || 10) {
    if (botTimer) clearTimeout(botTimer);
    if (!Number.isSafeInteger(Number(stake)) || Number(stake) < 0) {
      throw new Error('Ставка має бути невід’ємним цілим числом.');
    }
    const wagerId = `durak-classic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (window.beginUserWager && !window.beginUserWager(wagerId, Number(stake))) {
      window.TWA?.toast?.('Недостатньо монет для ставки 🪙');
      return;
    }
    state.wagerId = wagerId;
    state.stake = Number(stake);
    state.mode = typeof mode === 'string' ? mode : state.mode;
    const deck = C.newDeck();
    state.trump = deck.pop();
    state.deck = deck;
    state.player = deck.splice(0, 6);
    state.bot = deck.splice(0, 6);
    state.table = [];
    state.attacker = 'player'; state.defender = 'bot';
    const pt = lowestTrump(state.player), bt = lowestTrump(state.bot);
    if (pt && bt) {
      state.attacker = C.RANK_VAL[pt.rank] <= C.RANK_VAL[bt.rank] ? 'player' : 'bot';
    } else {
      state.attacker = pt ? 'player' : bt ? 'bot' : 'player';
    }
    state.defender = state.attacker === 'player' ? 'bot' : 'player';
    state.phase = 'play'; state.selected = null; state.msg = '';
    state.gameOver = false; state.winner = null;
    setMsg(state.attacker === 'player' ? 'Ваш хід — оберіть карту.' : 'Бот ходить першим.');
    render();
    if (state.attacker === 'bot') botTimer = setTimeout(botAttack, BOT_TURN_DELAY);
  }
  return { init: startNewGame, tap: selectPlayerCard, take: takeCards, finish: finishAttack, render };
})();
