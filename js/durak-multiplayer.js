window.DurakMultiplayer = (() => {
  const C = CARDS;
  const BOT_TURN_DELAY = 1200;
  const $ = (id) => document.getElementById(id);
  let game = null;
  let botTimer = null;
  let timerVersion = 0;
  let audioContext = null;
  let audioUnlocked = false;
  let isSoundEnabled = localStorage.getItem('durak_sound_enabled') !== 'false';

  function updateSoundButton() {
    const sound = $('durak-mp-sound');
    if (!sound) return;
    sound.textContent = isSoundEnabled ? '🔊' : '🔇';
    sound.setAttribute('aria-pressed', String(!isSoundEnabled));
    sound.setAttribute('aria-label', isSoundEnabled ? 'Вимкнути звук' : 'Увімкнути звук');
  }

  function unlockAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') void audioContext.resume();
    audioUnlocked = true;
  }

  function soundContext() {
    return isSoundEnabled && audioUnlocked && audioContext?.state === 'running'
      ? audioContext
      : null;
  }

  function playNoise(duration, { frequency, q, volume, delay = 0 }) {
    const context = soundContext();
    if (!context) return;
    const start = context.currentTime + delay;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.008, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(start);
    source.stop(start + duration);
  }

  function playShuffleSound() {
    const count = 6 + Math.floor(Math.random() * 3);
    for (let index = 0; index < count; index++) {
      playNoise(0.05, {
        frequency: 1250 + Math.random() * 1200,
        q: 0.7,
        volume: 0.08,
        delay: index * 0.085,
      });
    }
  }

  function playCardSound() {
    playNoise(0.055, { frequency: 2100, q: 1.1, volume: 0.14 });
    playNoise(0.035, { frequency: 480, q: 0.9, volume: 0.1, delay: 0.045 });
  }

  function playSweepSound() {
    playNoise(0.18, { frequency: 900, q: 0.45, volume: 0.16 });
  }

  function playEndSound(isWin) {
    const context = soundContext();
    if (!context) return;
    const frequencies = isWin ? [523.25, 659.25, 783.99] : [196];
    frequencies.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.12;
      const duration = isWin ? 0.24 : 0.42;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true });

  function activeIndexes() {
    return game.players.reduce((indexes, player, index) => {
      if (!player.isOut) indexes.push(index);
      return indexes;
    }, []);
  }

  function displayPlayerName(player) {
    const name = player.name || 'Гравець';
    return Number(player.vipUntil || 0) > Date.now() ? `👑 ${name}` : name;
  }

  function appendPlayerName(element, player) {
    const isVip = Number(player.vipUntil || 0) > Date.now();
    element.append(document.createTextNode(`${isVip ? '👑 ' : ''}${player.name || 'Гравець'}`));
    if (isVip) {
      const badge = document.createElement('span');
      badge.className = 'vip-name-badge';
      badge.textContent = 'VIP';
      element.appendChild(badge);
    }
    if (!player.isBot) {
      const rank = document.createElement('small');
      rank.className = 'agent-rank-title';
      rank.textContent = window.getAgentRankTitle?.(player.agentRank) || '';
      element.appendChild(rank);
    }
  }

  function nextActiveIndex(index) {
    const active = activeIndexes();
    if (!active.length) return -1;
    for (let offset = 1; offset <= game.players.length; offset++) {
      const next = (index + offset) % game.players.length;
      if (!game.players[next].isOut) return next;
    }
    return active[0];
  }

  function openPair() {
    return game.tablePairs.find((pair) => !pair.defend) || null;
  }

  function isTransferMode() {
    const mode = String(game?.mode || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return mode.includes('перевід') || mode.includes('перевод') || mode.includes('перекид');
  }

  function transferDefenderIndex(playerIndex, card) {
    if (!isTransferMode() || playerIndex !== game.defenderIndex || game.isTaking ||
        !game.tablePairs.length || game.tablePairs.some((pair) => pair.defend)) return -1;
    if (!game.tablePairs.some((pair) => pair.attack.rank === card.rank)) return -1;
    const nextIndex = nextActiveIndex(playerIndex);
    if (nextIndex === playerIndex || game.players[nextIndex].hand.length < game.tablePairs.length + 1) return -1;
    return nextIndex;
  }

  function transferAttack(playerIndex, cardIndex, nextDefenderIndex) {
    const player = game.players[playerIndex];
    const card = player.hand.splice(cardIndex, 1)[0];
    game.tablePairs.push({
      attack: card,
      defend: null,
      attackerIndex: playerIndex,
      defenderIndex: null,
    });
    game.attackerIndex = playerIndex;
    game.defenderIndex = nextDefenderIndex;
    game.maxAttacks = Math.min(6, game.players[nextDefenderIndex].hand.length);
    game.isTaking = false;
    resetPasses();
    setLastAction(playerIndex, 'перевів атаку', card);
    setMessage('Переведено!');
    playCardSound();
  }

  function allBeaten() {
    return game.tablePairs.length > 0 && game.tablePairs.every((pair) => Boolean(pair.defend));
  }

  function unbeatenAttackCount() {
    return game.tablePairs.filter((pair) => !pair.defend).length;
  }

  function ranksOnTable() {
    const ranks = new Set();
    game.tablePairs.forEach((pair) => {
      ranks.add(pair.attack.rank);
      if (pair.defend) ranks.add(pair.defend.rank);
    });
    return ranks;
  }

  function canPlayerPlay(card, index = game.localPlayerIndex) {
    if (game.gameOver || game.players[index].isOut || game.passedPlayers[index]) return false;
    if (game.tablePairs.length === 0) return index === game.attackerIndex;
    if (index === game.defenderIndex) {
      if (game.isTaking) return false;
      if (transferDefenderIndex(index, card) !== -1) return true;
      const pair = openPair();
      return Boolean(pair && C.beat(pair.attack, card, game.trump.suit));
    }
    return game.tablePairs.length < Math.min(6, game.maxAttacks) &&
      unbeatenAttackCount() < game.players[game.defenderIndex].hand.length &&
      ranksOnTable().has(card.rank);
  }

  function findBotTosserIndex() {
    return game.players.findIndex((player, index) =>
      player.isBot &&
      index !== game.defenderIndex &&
      player.hand.some((card) => canPlayerPlay(card, index))
    );
  }

  function allAttackersPassed() {
    return game.players.every((player, index) =>
      player.isOut || index === game.defenderIndex || Boolean(game.passedPlayers[index])
    );
  }

  function checkRoundCompletion() {
    if (game.isTaking) {
      if (!allAttackersPassed()) return false;
      finishRound(true);
      return true;
    }
    if (!allBeaten()) return false;
    if (!allAttackersPassed()) return false;
    finishRound(false);
    return true;
  }

  function snapshot() {
    if (!game) return null;
    return {
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        telegramId: player.telegramId || '',
        username: player.username || '',
        photoUrl: player.photoUrl || '',
        activeSkin: player.activeSkin || 'classic-red',
        vipUntil: Number(player.vipUntil) || 0,
        agentRank: Number(player.agentRank) || 0,
        isBot: player.isBot,
        isOut: player.isOut,
        status: player.status,
        cardCount: player.hand.length,
        hand: player.id === game.localPlayerId
          ? player.hand.map((card) => ({ ...card }))
          : null,
      })),
      deckCount: game.deck.length,
      trump: { ...game.trump },
      trumpCard: { ...game.trump },
      trumpSuit: game.trump?.suit || '',
      tablePairs: game.tablePairs.map((pair) => ({
        attack: { ...pair.attack },
        defend: pair.defend ? { ...pair.defend } : null,
        attackerIndex: pair.attackerIndex,
        defenderIndex: pair.defenderIndex,
      })),
      attackerIndex: game.attackerIndex,
      defenderIndex: game.defenderIndex,
      passedPlayers: { ...game.passedPlayers },
      isTaking: game.isTaking,
      localPlayerIndex: game.localPlayerIndex,
      maxAttacks: game.maxAttacks,
      roundNumber: game.roundNumber,
      gameOver: game.gameOver,
      loserId: game.loserId,
      message: game.message,
      lastAction: game.lastAction,
      hostId: game.hostId,
      deckSize: game.deckSize,
      mode: game.mode,
      stake: game.stake,
      matchId: game.matchId,
      isOnline: game.isOnline,
    };
  }

  function publicSnapshot() {
    const current = snapshot();
    if (!current) return null;
    current.players.forEach((player) => { player.hand = null; });
    return current;
  }

  function exportState() {
    if (!game) return null;
    const current = snapshot();
    current.players = game.players.map((player) => ({
      id: player.id,
      name: player.name,
      telegramId: player.telegramId || '',
      username: player.username || '',
      photoUrl: player.photoUrl || '',
      activeSkin: player.activeSkin || 'classic-red',
      vipUntil: Number(player.vipUntil) || 0,
      agentRank: Number(player.agentRank) || 0,
      isBot: player.isBot,
      isOut: player.isOut,
      status: player.status,
      cardCount: player.hand.length,
      hand: player.hand.map((card) => ({ ...card })),
    }));
    current.deck = game.deck.map((card) => card ? { ...card } : null);
    current.isTaking = game.isTaking;
    current.hostId = game.hostId;
    current.deckSize = game.deckSize;
    current.mode = game.mode;
    current.stake = game.stake;
    current.matchId = game.matchId;
    return current;
  }

  function loadSnapshot(snapshotData, localPlayerId, hand = [], onAction) {
    if (!snapshotData || !Array.isArray(snapshotData.players)) return false;
    if (snapshotData.matchId && window.beginUserWager &&
        !window.beginUserWager(snapshotData.matchId, Number(snapshotData.stake) || 0)) return false;
    if (botTimer) clearTimeout(botTimer);
    timerVersion += 1;
    const previousGame = game;
    const wasGameOver = Boolean(game?.gameOver);
    const previousSignature = game
      ? game.tablePairs.map((pair) =>
        `${pair.attack.id || `${pair.attack.rank}:${pair.attack.suit}`}/${pair.defend?.id || (pair.defend ? `${pair.defend.rank}:${pair.defend.suit}` : '')}`
      ).join('|')
      : '';
    const players = snapshotData.players.map((player) => ({
      id: player.id,
      name: player.name,
      telegramId: player.telegramId || '',
      username: player.username || '',
      photoUrl: player.photoUrl || '',
      activeSkin: player.activeSkin || 'classic-red',
      vipUntil: Number(player.vipUntil) || 0,
      agentRank: Number(player.agentRank) || 0,
      isBot: Boolean(player.isBot),
      isOut: Boolean(player.isOut),
      status: player.status || '',
      cardCount: Number(player.cardCount) || 0,
      hand: player.id === localPlayerId ? hand.map((card) => ({ ...card })) : [],
    }));
    const localPlayerIndex = players.findIndex((player) => player.id === localPlayerId);
    if (localPlayerIndex === -1) return false;
    const trump = snapshotData.trump || snapshotData.trumpCard;
    game = {
      ...snapshotData,
      players,
      deck: Array(Number(snapshotData.deckCount) || 0).fill(null),
      trump: { ...trump },
      trumpSuit: snapshotData.trumpSuit || trump?.suit || '',
      isOnline: Boolean(snapshotData.isOnline),
      tablePairs: (snapshotData.tablePairs || []).map((pair) => ({
        ...pair,
        attack: { ...pair.attack },
        defend: pair.defend ? { ...pair.defend } : null,
      })),
      passedPlayers: { ...(snapshotData.passedPlayers || {}) },
      localPlayerId,
      localPlayerIndex,
      isTaking: Boolean(snapshotData.isTaking),
      isMovePending: Boolean(previousGame?.isMovePending),
      isHost: false,
      onAction,
      onStateChange: null,
    };
    const signature = game.tablePairs.map((pair) =>
      `${pair.attack.id || `${pair.attack.rank}:${pair.attack.suit}`}/${pair.defend?.id || (pair.defend ? `${pair.defend.rank}:${pair.defend.suit}` : '')}`
    ).join('|');
    if (signature !== previousSignature && signature) playCardSound();
    if (previousGame && previousGame.isTaking !== game.isTaking && game.isTaking) playSweepSound();
    if (previousGame && previousGame.roundNumber !== game.roundNumber &&
        !previousGame.isTaking && !game.isTaking) playSweepSound();
    if (!previousGame || (wasGameOver && !game.gameOver)) playShuffleSound();
    if (game.gameOver && !wasGameOver) playEndSound(game.loserId !== localPlayerId);
    updateStatuses();
    render();
    return true;
  }

  function updateStatuses() {
    game.players.forEach((player, index) => {
      if (player.isOut) {
        player.status = 'Вийшов';
      } else if (index === game.defenderIndex) {
        player.status = game.isTaking ? 'Бере карти' : 'Захищається';
      } else if (game.passedPlayers[index]) {
        player.status = 'Пас';
      } else if (index === game.attackerIndex) {
        player.status = 'Атакує';
      } else {
        player.status = 'Може підкинути';
      }
    });
  }

  function publish() {
    updateStatuses();
    render();
    game.stateChangePromise = Promise.resolve(game.onStateChange?.(snapshot()));
  }

  function bindReactions() {
    const panel = $('durak-mp-reactions');
    if (!panel || panel.dataset.bound) return;

    panel.dataset.bound = 'true';
    panel.addEventListener('click', (event) => {
      const toggle = event.target.closest?.('#durak-mp-reaction-toggle');
      const menu = $('durak-mp-reaction-menu');
      if (toggle && menu) {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
        return;
      }
    });

    const sound = $('durak-mp-sound');
    if (sound && !sound.dataset.bound) {
      sound.dataset.bound = 'true';
      sound.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        localStorage.setItem('durak_sound_enabled', String(isSoundEnabled));
        unlockAudio();
        updateSoundButton();
      });
    }
    updateSoundButton();
  }

  function setMessage(message) {
    game.message = message;
  }

  function createCardFace(card) {
    if (!card) return null;
    const face = document.createElement('span');
    const isRed = C.SUITS[card.suit].color === '#dc2626';
    face.className = `durak-mp-face ${isRed ? 'red' : 'black'}`;

    const rank = document.createElement('span');
    rank.className = 'durak-mp-face-rank';
    rank.textContent = C.rankLabel(card.rank);

    const cornerSuit = document.createElement('span');
    cornerSuit.className = 'durak-mp-face-corner-suit';
    cornerSuit.textContent = C.SUITS[card.suit].sym;

    const centerSuit = document.createElement('span');
    centerSuit.className = 'durak-mp-face-center-suit';
    centerSuit.textContent = C.SUITS[card.suit].sym;

    face.append(rank, cornerSuit, centerSuit);
    return face;
  }

  function renderResult() {
    const overlay = $('durak-result-overlay');
    const title = $('durak-result-title');
    const change = $('durak-result-change');
    const playersEl = $('durak-result-players');
    if (!overlay || !title || !change || !playersEl) return;

    overlay.hidden = !game.gameOver;
    if (!game.gameOver) return;

    const localPlayer = game.players[game.localPlayerIndex];
    const loser = game.players.find((player) => player.id === game.loserId);
    const winners = loser ? game.players.filter((player) => player.id !== loser.id) : [];
    const pot = game.stake * game.players.length;
    const baseShare = winners.length ? Math.floor(pot / winners.length) : 0;
    const remainder = winners.length ? pot % winners.length : 0;
    const localWinnerIndex = winners.findIndex((player) => player.id === localPlayer.id);
    const localChange = loser
      ? localPlayer.id === loser.id
        ? -game.stake
        : baseShare + (localWinnerIndex < remainder ? 1 : 0)
      : game.stake;
    if (game.matchId && window.settleUserWager) {
      window.settleUserWager(game.matchId, Math.max(0, localChange), { online: game.isOnline });
    }

    title.textContent = !loser ? 'Нічия' : localPlayer.id === loser.id ? 'Поразка' : 'Перемога';
    change.textContent = `${localChange > 0 ? '+' : ''}${localChange} 🪙`;
    change.classList.toggle('loss', localChange < 0);
    change.classList.toggle('win', localChange > 0);
    playersEl.replaceChildren();

    const addPlayerRow = (player, winnings) => {
      const row = document.createElement('div');
      row.className = `durak-result-player${player.id === loser?.id ? ' loser' : ' winner'}`;

      const identity = document.createElement('div');
      identity.className = 'durak-result-identity';
      if (player.id === loser?.id) {
        const place = document.createElement('span');
        place.className = 'durak-result-place';
        place.textContent = String(game.players.length);
        identity.appendChild(place);
      } else {
        const trophy = document.createElement('span');
        trophy.className = 'durak-result-trophy';
        trophy.textContent = '🏆';
        trophy.setAttribute('aria-hidden', 'true');
        identity.appendChild(trophy);
      }

      const avatar = document.createElement('span');
      avatar.className = 'durak-result-avatar';
      avatar.textContent = player.name.trim().charAt(0).toUpperCase() || '?';
      avatar.setAttribute('aria-hidden', 'true');
      window.renderPlayerAvatar?.(avatar, player);

      const details = document.createElement('span');
      details.className = 'durak-result-details';
      const name = document.createElement('span');
      name.className = 'durak-result-name';
      appendPlayerName(name, player);
      const description = document.createElement('span');
      description.className = 'durak-result-description';
      description.textContent = player.id === loser?.id ? 'дурень' : 'переможець';
      details.append(name, description);
      identity.append(avatar, details);

      const amount = document.createElement('span');
      amount.className = 'durak-result-amount';
      amount.textContent = player.id === loser?.id
        ? `-${game.stake} 🪙`
        : `+${winnings} 🪙`;
      row.append(identity, amount);
      playersEl.appendChild(row);
    };

    winners.forEach((player, index) => {
      addPlayerRow(player, baseShare + (index < remainder ? 1 : 0));
    });
    if (loser) addPlayerRow(loser, 0);

    $('durak-result-rematch').onclick = () => {
      if (game.onRematch) {
        game.onRematch();
        return;
      }
      if (!game.isHost && game.onAction) {
        game.onAction({ type: 'rematch' });
        return;
      }
      try {
        startGame({
          players: game.players.map(({ id, name, isBot }) => ({ id, name, isBot })),
          localPlayerId: game.localPlayerId,
          deckSize: game.deckSize,
          mode: game.mode,
          stake: game.stake,
          onStateChange: game.onStateChange,
        });
      } catch (error) {
        console.error('Unable to start a Durak rematch', error);
        window.TWA?.toast?.(error.message || 'Не вдалося почати реванш');
      }
    };
    $('durak-result-new-table').onclick = () => window.showView('durak');
  }

  function setLastAction(playerIndex, action, card) {
    const player = game.players[playerIndex];
    game.lastAction = `${player.name} ${action}${card ? ` ${card.rank}${C.SUITS[card.suit].sym}` : ''}`;
  }

  function scheduleBotStep(callback = runBotStep) {
    if (botTimer) clearTimeout(botTimer);
    const version = timerVersion;
    botTimer = setTimeout(() => {
      if (version === timerVersion) callback();
    }, BOT_TURN_DELAY);
  }

  function lowestCard(hand) {
    return hand.reduce((best, card) =>
      !best || C.RANK_VAL[card.rank] < C.RANK_VAL[best.rank] ? card : best,
    null);
  }

  function resetPasses() {
    game.passedPlayers = {};
  }

  function playAttack(playerIndex, cardIndex) {
    const card = game.players[playerIndex].hand.splice(cardIndex, 1)[0];
    game.tablePairs.push({ attack: card, defend: null, attackerIndex: playerIndex, defenderIndex: null });
    playCardSound();
    resetPasses();
    setLastAction(playerIndex, 'кладе', card);
    setMessage(`${game.players[playerIndex].name} підкинув карту.`);
  }

  function markGameOver() {
    const active = activeIndexes();
    if (active.length > 1) return false;
    game.gameOver = true;
    game.loserId = active.length === 1 ? game.players[active[0]].id : null;
    setMessage(game.loserId
      ? `${game.players.find((player) => player.id === game.loserId).name} залишився з картами.`
      : 'Нічия!');
    return true;
  }

  function finishRound(taken) {
    if (botTimer) clearTimeout(botTimer);
    timerVersion += 1;
    const attackerBefore = game.attackerIndex;
    const defenderBefore = game.defenderIndex;
    if (!taken) playSweepSound();

    if (taken) {
      const defender = game.players[defenderBefore];
      game.tablePairs.forEach((pair) => {
        defender.hand.push(pair.attack);
        if (pair.defend) defender.hand.push(pair.defend);
      });
    }

    game.tablePairs = [];
    resetPasses();
    game.isTaking = false;

    const refillOrder = [];
    for (let offset = 0; offset < game.players.length; offset++) {
      const index = (attackerBefore + offset) % game.players.length;
      if (index !== defenderBefore && !game.players[index].isOut) refillOrder.push(index);
    }
    if (!game.players[defenderBefore].isOut) refillOrder.push(defenderBefore);

    refillOrder.forEach((index) => {
      const hand = game.players[index].hand;
      while (!game.players[index].isOut && hand.length < 6 && game.deck.length) {
        hand.push(game.deck.shift());
      }
    });

    if (game.deck.length === 0) {
      game.players.forEach((player) => {
        if (player.hand.length === 0) player.isOut = true;
      });
    }

    const nextAttacker = taken ? nextActiveIndex(defenderBefore) : defenderBefore;
    game.attackerIndex = game.players[nextAttacker]?.isOut ? nextActiveIndex(nextAttacker) : nextAttacker;

    if (game.attackerIndex === -1) {
      game.gameOver = true;
      game.loserId = null;
    } else {
      game.defenderIndex = nextActiveIndex(game.attackerIndex);
    }

    game.roundNumber += 1;
    if (markGameOver()) {
      playEndSound(game.loserId !== game.localPlayerId);
      publish();
      return;
    }

    game.maxAttacks = Math.min(6, game.players[game.defenderIndex].hand.length);
    setMessage(taken ? 'Захисник забрав карти.' : 'Карти відбиті.');
    publish();
    scheduleBotStep();
  }

  function runBotStep() {
    if (!game || game.gameOver) return;

    if (game.tablePairs.length > 0) {
      const tosserIndex = findBotTosserIndex();
      if (tosserIndex !== -1) {
        const tosser = game.players[tosserIndex];
        const cardIndex = tosser.hand.findIndex((card) => canPlayerPlay(card, tosserIndex));
        playAttack(tosserIndex, cardIndex);
        publish();
        scheduleBotStep();
        return;
      }
    }

    if (game.isTaking) {
      const botToPass = game.players.findIndex((player, index) =>
        player.isBot &&
        !player.isOut &&
        index !== game.defenderIndex &&
        !game.passedPlayers[index]
      );
      if (botToPass !== -1) {
        game.passedPlayers[botToPass] = true;
        setMessage(`${game.players[botToPass].name}: Пас.`);
        if (!checkRoundCompletion()) {
          publish();
          scheduleBotStep();
        }
        return;
      }
      checkRoundCompletion();
      return;
    }

    const defender = game.players[game.defenderIndex];
    if (defender.isBot) {
      const cardIndex = defender.hand.findIndex((card) =>
        transferDefenderIndex(game.defenderIndex, card) !== -1
      );
      if (cardIndex !== -1) {
        const nextDefender = transferDefenderIndex(
          game.defenderIndex,
          defender.hand[cardIndex],
        );
        transferAttack(game.defenderIndex, cardIndex, nextDefender);
        publish();
        scheduleBotStep();
        return;
      }
    }

    const pair = openPair();
    if (pair) {
      const defender = game.players[game.defenderIndex];
      if (!defender.isBot) return;

      const card = C.cheapestBeater(pair.attack, defender.hand, game.trump.suit);
      if (!card) {
        game.isTaking = true;
        resetPasses();
        setMessage(`${defender.name} не може побити й бере карти.`);
        playSweepSound();
        publish();
        scheduleBotStep();
        return;
      }

      defender.hand.splice(defender.hand.indexOf(card), 1);
      playCardSound();
      pair.defend = card;
      pair.defenderIndex = game.defenderIndex;
      setLastAction(game.defenderIndex, 'б’є', card);
      setMessage(`${defender.name} побив карту.`);
      publish();
      scheduleBotStep();
      return;
    }

    if (game.tablePairs.length === 0) {
      const attacker = game.players[game.attackerIndex];
      if (!attacker.isBot || attacker.hand.length === 0) return;

      const card = lowestCard(attacker.hand);
      attacker.hand.splice(attacker.hand.indexOf(card), 1);
      game.tablePairs.push({
        attack: card,
        defend: null,
        attackerIndex: game.attackerIndex,
        defenderIndex: null,
      });
      playCardSound();
      game.maxAttacks = Math.min(6, game.players[game.defenderIndex].hand.length);
      resetPasses();
      setLastAction(game.attackerIndex, 'кладе', card);
      setMessage(`${attacker.name} починає атаку.`);
      publish();
      scheduleBotStep();
      return;
    }

    if (!allBeaten()) return;

    const botToPass = game.players.findIndex((player, index) =>
      player.isBot &&
      !player.isOut &&
      index !== game.defenderIndex &&
      !game.passedPlayers[index]
    );

    if (botToPass !== -1) {
      game.passedPlayers[botToPass] = true;
      setMessage(`${game.players[botToPass].name}: Пас.`);
      publish();
      scheduleBotStep();
      return;
    }

    checkRoundCompletion();
  }

  function render() {
    const root = $('durak-mp');
    if (!root || !game) return;
    bindReactions();

    const status = $('durak-mp-status');
    const stock = $('durak-mp-stock-count');
    const trump = $('durak-mp-trump');
    const trumpSuit = $('durak-mp-trump-suit');
    const bank = $('durak-mp-bank');
    const mode = $('durak-mp-mode');
    const lastAction = $('durak-mp-last-action');
    const ownAvatar = $('durak-mp-own-avatar');
    const playersEl = $('durak-mp-players');
    const tableEl = $('durak-mp-table');
    const handEl = $('durak-mp-hand');
    const actionsEl = $('durak-mp-actions');

    const localPlayer = game.players[game.localPlayerIndex];
    if (game.gameOver) {
      status.textContent = game.message;
    } else if (game.localPlayerIndex === game.defenderIndex) {
      status.textContent = game.isTaking ? 'Бере карти' : openPair() ? 'Відбивайся' : 'Захисник';
    } else if (game.passedPlayers[game.localPlayerIndex]) {
      status.textContent = 'Пас прийнято';
    } else if (game.tablePairs.length === 0) {
      const attacker = game.players[game.attackerIndex];
      status.textContent = attacker.isBot ? `Ходить ${attacker.name}` : 'Твій хід';
    } else if (game.isTaking) {
      status.textContent = 'Можеш підкинути або пас';
    } else if (allBeaten()) {
      status.textContent = 'Твій хід';
    } else {
      status.textContent = `Ходить ${game.players[game.defenderIndex].name}`;
    }
    if (lastAction) lastAction.textContent = game.lastAction || '';
    stock.textContent = game.deck.length;
    if (bank) bank.textContent = game.stake * game.players.length;
    if (mode) mode.textContent = `${game.mode} · ${game.deckSize}`;
    if (ownAvatar) {
      ownAvatar.textContent = localPlayer.name.trim().charAt(0).toUpperCase() || '?';
      ownAvatar.dataset.playerId = localPlayer.id;
      ownAvatar.dataset.status = localPlayer.status;
      window.renderPlayerAvatar?.(ownAvatar, localPlayer);
    }
    trump.replaceChildren();
    const stockBack = $('durak-mp-stock-back');
    if (game.trump?.rank && C.SUITS[game.trump.suit]) {
      const suit = C.SUITS[game.trump.suit];
      const hasDeck = game.deck.length > 0;
      const hasClosedCards = game.deck.length > 1;
      const trumpLabel = `${C.rankLabel(game.trump.rank)} ${suit.sym}`;
      trump.classList.toggle('empty', !hasDeck);
      trump.classList.toggle('only-trump', hasDeck && !hasClosedCards);
      trump.setAttribute('aria-label', `Козир ${trumpLabel}`);
      if (stockBack) stockBack.hidden = !hasClosedCards;
      if (trumpSuit) trumpSuit.textContent = suit.sym;
      if (hasDeck) {
        const rank = document.createElement('span');
        rank.className = 'durak-mp-trump-rank';
        rank.textContent = C.rankLabel(game.trump.rank);
        const symbol = document.createElement('span');
        symbol.className = 'durak-mp-trump-symbol';
        symbol.textContent = suit.sym;
        trump.style.setProperty('--trump-suit-color', suit.color);
        trump.append(rank, symbol);
      } else {
        trump.textContent = suit.sym;
        trump.style.setProperty('--trump-suit-color', suit.color);
      }
    } else {
      trump.classList.add('empty');
      trump.classList.remove('only-trump');
      trump.removeAttribute('aria-label');
      if (stockBack) stockBack.hidden = true;
      const suit = C.SUITS[game.trumpSuit];
      if (trumpSuit) trumpSuit.textContent = suit?.sym || '';
      trump.textContent = suit?.sym || '';
      if (suit) trump.style.setProperty('--trump-suit-color', suit.color);
    }

    playersEl.innerHTML = '';
    const handCount = (player) => player.hand.length || player.cardCount || 0;
    const opponents = game.players
      .map((player, index) => ({ player, index }))
      .filter(({ index }) => index !== game.localPlayerIndex);
    opponents.forEach(({ player, index }, seat) => {
      const card = document.createElement('div');
      card.className = 'durak-mp-player' +
        (index === game.attackerIndex || index === game.defenderIndex ? ' active' : '');
      card.style.setProperty(
        '--seat-lift',
        `${Math.max(0, 18 - Math.abs(seat - (opponents.length - 1) / 2) * 13)}px`,
      );

      const fan = document.createElement('div');
      fan.className = 'durak-mp-player-fan';
      for (let backIndex = 0; backIndex < Math.min(handCount(player), 5); backIndex++) {
        const back = document.createElement('span');
        back.className = 'durak-mp-player-back';
        back.style.setProperty('--back-index', backIndex);
        back.style.setProperty('--back-offset', Math.abs(backIndex - 2));
        back.style.backgroundImage = `url("${C.cardBackImg(player.activeSkin, 38)}")`;
        fan.appendChild(back);
      }

      const avatar = document.createElement('div');
      avatar.className = 'durak-mp-avatar';
      avatar.dataset.playerId = String(player.id);
      if (player.telegramId) avatar.dataset.telegramId = String(player.telegramId);
      if (window.renderPlayerAvatar) window.renderPlayerAvatar(avatar, player);
      else avatar.textContent = player.name.trim().charAt(0).toUpperCase() || '?';
      if (index === game.attackerIndex || index === game.defenderIndex) avatar.classList.add('active');

      const name = document.createElement('div');
      name.className = 'durak-mp-name';
      const role = document.createElement('span');
      role.className = 'durak-mp-role';
      role.textContent = index === game.attackerIndex ? '⚔' : index === game.defenderIndex ? '🛡' : '';
      name.appendChild(role);
      appendPlayerName(name, player);

      const info = document.createElement('div');
      info.className = 'durak-mp-player-info';
      info.textContent = `${handCount(player)}`;

      card.append(fan, avatar, info, name);
      if (player.status === 'Пас') {
        const badge = document.createElement('span');
        badge.className = 'durak-mp-badge pass';
        badge.textContent = 'Пас';
        card.appendChild(badge);
      } else if (player.isOut) {
        const badge = document.createElement('span');
        badge.className = 'durak-mp-badge';
        badge.textContent = 'Вийшов';
        card.appendChild(badge);
      } else if (index === game.defenderIndex) {
        const badge = document.createElement('span');
        badge.className = 'durak-mp-badge';
        badge.textContent = 'Захист';
        card.appendChild(badge);
      }
      playersEl.appendChild(card);
    });

    tableEl.innerHTML = '';
    game.tablePairs.forEach((pair) => {
      const pairEl = document.createElement('div');
      pairEl.className = 'durak-mp-pair';
      const makePlayedCard = (played, playerIndex, cardRole) => {
        if (!played) return null;
        const wrapper = document.createElement('div');
        wrapper.className = `durak-mp-played-card ${cardRole}`;
        wrapper.setAttribute('role', 'img');
        wrapper.setAttribute(
          'aria-label',
          `${game.players[playerIndex]?.name || 'Гравець'}: ${C.rankLabel(played.rank)}${C.SUITS[played.suit].sym}`,
        );
        const face = createCardFace(played);
        if (face) wrapper.appendChild(face);
        return wrapper;
      };
      const attackCard = makePlayedCard(pair.attack, pair.attackerIndex, 'attack');
      if (attackCard) pairEl.appendChild(attackCard);
      if (pair.defend) {
        const defendCard = makePlayedCard(pair.defend, pair.defenderIndex, 'defend');
        if (defendCard) pairEl.appendChild(defendCard);
      }
      tableEl.appendChild(pairEl);
    });

    handEl.innerHTML = '';
    localPlayer.hand.forEach((card, index) => {
      if (!card) return;
      const button = document.createElement('button');
      button.className = 'durak-mp-card';
      button.type = 'button';
      button.disabled = game.isMovePending || !canPlayerPlay(card);
      button.style.setProperty('--card-index', index);
      button.style.setProperty('--card-count', localPlayer.hand.length);
      const cardCenter = (localPlayer.hand.length - 1) / 2;
      const cardProgress = localPlayer.hand.length > 1 ? index / (localPlayer.hand.length - 1) : 0.5;
      button.style.setProperty('--card-angle', `${-8 + cardProgress * 16}deg`);
      button.style.setProperty('--card-lift', `${Math.abs(index - cardCenter) * 3}px`);
      button.setAttribute('aria-label', `Зіграти ${C.rankLabel(card.rank)}${C.SUITS[card.suit].sym}`);
      const face = createCardFace(card);
      if (face) button.appendChild(face);
      button.addEventListener('click', () => playCard(index));
      handEl.appendChild(button);
    });

    actionsEl.innerHTML = '';
    if (game.gameOver) {
      renderResult();
      return;
    }
    renderResult();

    const playerIsDefender = game.localPlayerIndex === game.defenderIndex;
    if (playerIsDefender && game.tablePairs.length > 0 && !game.isTaking) {
      const take = document.createElement('button');
      take.className = 'btn take';
      take.textContent = 'Забрати';
      take.disabled = game.isMovePending;
      take.addEventListener('click', () => takeCards());
      actionsEl.appendChild(take);
    } else if (!playerIsDefender && game.tablePairs.length > 0 && !localPlayer.isOut) {
      const vote = document.createElement('button');
      vote.className = 'btn vote';
      vote.textContent = allBeaten() && !game.isTaking ? 'Бито' : 'Пас';
      vote.disabled = game.isMovePending || Boolean(game.passedPlayers[game.localPlayerIndex]);
      vote.addEventListener('click', () => passRound());
      actionsEl.appendChild(vote);
    }
  }

  function playCard(cardIndex, playerIndex = game?.localPlayerIndex) {
    if (!game || game.gameOver || game.isMovePending ||
        !Number.isInteger(playerIndex) || !game.players[playerIndex]) return false;
    const player = game.players[playerIndex];
    const card = player.hand[cardIndex];
    if (!card || !canPlayerPlay(card, playerIndex)) return false;
    if (!game.isHost && game.onAction) {
      game.onAction({ type: 'play', cardId: card.id });
      return true;
    }

    if (playerIndex === game.defenderIndex) {
      const nextDefender = transferDefenderIndex(playerIndex, card);
      if (nextDefender !== -1) {
        transferAttack(playerIndex, cardIndex, nextDefender);
        if (!checkRoundCompletion()) {
          publish();
          scheduleBotStep();
        }
        return true;
      }
    }

    if (playerIndex !== game.defenderIndex) {
      playAttack(playerIndex, cardIndex);
      if (game.tablePairs.length === 1) {
        game.maxAttacks = Math.min(6, game.players[game.defenderIndex].hand.length);
      }
    } else {
      const pair = openPair();
      if (game.isTaking || !pair) return false;
      player.hand.splice(cardIndex, 1);
      pair.defend = card;
      pair.defenderIndex = playerIndex;
      setLastAction(playerIndex, 'б’є', card);
      playCardSound();
      setMessage('Ви побили карту.');
    }

    if (playerIndex !== game.defenderIndex) resetPasses();
    if (!checkRoundCompletion()) {
      publish();
      scheduleBotStep();
    }
    return true;
  }

  function passRound(playerIndex = game?.localPlayerIndex) {
    if (!game || game.gameOver || game.isMovePending ||
        !Number.isInteger(playerIndex) || !game.players[playerIndex]) return false;
    if (playerIndex === game.defenderIndex || game.players[playerIndex].isOut ||
        game.tablePairs.length === 0 || game.passedPlayers[playerIndex]) return false;
    if (!game.isHost && game.onAction) {
      game.onAction({ type: 'pass' });
      return true;
    }

    game.passedPlayers[playerIndex] = true;
    setMessage(`${game.players[playerIndex].name} підтвердив пас.`);
    if (!checkRoundCompletion()) {
      publish();
      scheduleBotStep();
    }
    return true;
  }

  function takeCards(playerIndex = game?.localPlayerIndex) {
    if (!game || game.gameOver || game.isMovePending || !Number.isInteger(playerIndex) ||
        playerIndex !== game.defenderIndex || game.tablePairs.length === 0 || game.isTaking) return false;
    if (!game.isHost && game.onAction) {
      game.onAction({ type: 'take' });
      return true;
    }
    game.isTaking = true;
    resetPasses();
    setMessage(`${game.players[playerIndex].name} бере карти.`);
    playSweepSound();
    publish();
    scheduleBotStep();
    return true;
  }

  async function dispatchAction({ playerId, type, cardId } = {}) {
    if (!game) return false;
    const playerIndex = game.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1 || game.players[playerIndex].isBot) return false;

    if (type === 'rematch') {
      if (playerId !== game.hostId || typeof game.onRematch !== 'function') return false;
      await game.onRematch();
      return true;
    }
    if (game.gameOver) return false;
    game.stateChangePromise = Promise.resolve();
    let accepted;
    if (type === 'pass') accepted = passRound(playerIndex);
    else if (type === 'take') accepted = takeCards(playerIndex);
    if (type === 'play') {
      const cardIndex = game.players[playerIndex].hand.findIndex((card) => card.id === cardId);
      accepted = cardIndex !== -1 && playCard(cardIndex, playerIndex);
    }
    if (!accepted) return false;
    const persisted = await game.stateChangePromise;
    return persisted !== false;
  }

  function setMovePending(isPending) {
    if (!game || game.isHost) return;
    game.isMovePending = Boolean(isPending);
    render();
  }

  function showReaction(senderId, emoji, senderName = 'Гравець') {
    if (senderId == null || typeof emoji !== 'string' || !emoji) return;
    const bubble = document.createElement('div');
    bubble.className = 'durak-mp-reaction-notice';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'durak-mp-reaction-notice-emoji';
    icon.textContent = emoji;
    const name = document.createElement('span');
    name.className = 'durak-mp-reaction-notice-name';
    name.textContent = String(senderName || 'Гравець');
    bubble.append(icon, name);
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2200);
  }

  function startGame({
    players,
    localPlayerId,
    deckSize = 36,
    mode = 'Простий',
    stake = 10,
    matchId = null,
    isOnline = false,
    onStateChange,
    isHost = true,
    hostId = null,
    onAction,
    onRematch,
  } = {}) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 6) {
      throw new Error('Для гри потрібні від 2 до 6 гравців.');
    }
    if (players.some((player) => !player.id) ||
        new Set(players.map((player) => player.id)).size !== players.length) {
      throw new Error('У кожного гравця має бути унікальний ідентифікатор.');
    }
    if (deckSize !== 36 && deckSize !== 52) {
      throw new Error('Підтримуються колоди на 36 або 52 карти.');
    }
    if (!Number.isSafeInteger(Number(stake)) || Number(stake) < 0) {
      throw new Error('Ставка має бути невід’ємним цілим числом.');
    }

    const localPlayerIndex = players.findIndex((player) => player.id === localPlayerId);
    if (localPlayerIndex === -1) throw new Error('Локального гравця немає за столом.');
    const wagerId = matchId || `durak-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (window.beginUserWager && !window.beginUserWager(wagerId, Number(stake))) {
      throw new Error('Недостатньо монет для ставки.');
    }
    if (botTimer) clearTimeout(botTimer);
    timerVersion += 1;

    const deck = C.newDeck(deckSize);
    const trump = deck[deck.length - 1];
    const handSize = Math.min(6, Math.floor((deck.length - 1) / players.length));
    const gamePlayers = players.map((player) => ({
      id: player.id,
      name: player.name || (player.id === localPlayerId ? 'Гравець' : 'Бот'),
      telegramId: player.telegramId || '',
      username: player.username || '',
      photoUrl: player.photoUrl || '',
      activeSkin: player.activeSkin || 'classic-red',
      vipUntil: Number(player.vipUntil) || 0,
      agentRank: Number(player.agentRank) || 0,
      isBot: Boolean(player.isBot),
      isOut: false,
      status: '',
      hand: [],
    }));

    game = {
      players: gamePlayers,
      deck,
      trump,
      tablePairs: [],
      attackerIndex: 0,
      defenderIndex: 1,
      passedPlayers: {},
      isTaking: false,
      localPlayerId,
      localPlayerIndex,
      maxAttacks: 0,
      roundNumber: 1,
      gameOver: false,
      loserId: null,
      message: 'Роздаємо карти...',
      lastAction: 'Роздаємо карти...',
      deckSize,
      mode,
      stake: Number(stake),
      matchId: wagerId,
      isOnline: Boolean(isOnline),
      onStateChange,
      isHost,
      hostId,
      onAction,
      onRematch,
      isMovePending: false,
      stateChangePromise: Promise.resolve(),
    };

    for (let count = 0; count < handSize; count++) {
      game.players.forEach((player) => player.hand.push(game.deck.shift()));
    }

    let lowestTrump = null;
    game.players.forEach((player, index) => {
      const card = player.hand
        .filter((item) => item.suit === game.trump.suit)
        .reduce((lowest, item) =>
          !lowest || C.RANK_VAL[item.rank] < C.RANK_VAL[lowest.rank] ? item : lowest,
        null);
      if (card && (!lowestTrump || C.RANK_VAL[card.rank] < C.RANK_VAL[lowestTrump.card.rank])) {
        lowestTrump = { index, card };
      }
    });

    game.attackerIndex = lowestTrump ? lowestTrump.index : localPlayerIndex;
    game.defenderIndex = nextActiveIndex(game.attackerIndex);
    game.maxAttacks = Math.min(6, game.players[game.defenderIndex].hand.length);
    playShuffleSound();
    setMessage(game.players[game.attackerIndex].isBot
      ? `${game.players[game.attackerIndex].name} ходить першим.`
      : 'Ваш хід — оберіть карту.');
    publish();
    scheduleBotStep();
  }

  function restoreState(savedState, localPlayerId, onStateChange, options = {}) {
    if (!savedState || !Array.isArray(savedState.players)) return false;
    if (savedState.matchId && window.beginUserWager &&
        !window.beginUserWager(savedState.matchId, Number(savedState.stake) || 0)) return false;
    if (botTimer) clearTimeout(botTimer);
    timerVersion += 1;
    const localPlayerIndex = savedState.players.findIndex((player) => player.id === localPlayerId);
    if (localPlayerIndex === -1) return false;
    game = {
      ...savedState,
      players: savedState.players.map((player) => ({
        ...player,
        hand: (player.hand || []).map((card) => ({ ...card })),
      })),
      deck: (savedState.deck || []).map((card) => card ? { ...card } : null),
      trump: { ...(savedState.trump || savedState.trumpCard) },
      trumpSuit: savedState.trumpSuit || savedState.trump?.suit || savedState.trumpCard?.suit || '',
      isOnline: Boolean(savedState.isOnline),
      tablePairs: (savedState.tablePairs || []).map((pair) => ({
        ...pair,
        attack: { ...pair.attack },
        defend: pair.defend ? { ...pair.defend } : null,
      })),
      passedPlayers: { ...(savedState.passedPlayers || {}) },
      localPlayerId,
      localPlayerIndex,
      isHost: true,
      onStateChange,
      onAction: null,
      ...options,
    };
    publish();
    scheduleBotStep();
    return true;
  }

  return {
    startGame,
    playCard,
    pass: passRound,
    take: takeCards,
    dispatchAction,
    render,
    setMovePending,
    showReaction,
    getSnapshot: snapshot,
    getPublicSnapshot: publicSnapshot,
    exportState,
    loadSnapshot,
    restoreState,
    botTurnDelay: BOT_TURN_DELAY,
  };
})();
