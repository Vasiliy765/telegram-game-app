function checkRoundCompletion() {
  const g = appState.game;
  const allDefended = g.tablePairs.length > 0 && g.tablePairs.every(pair => pair.defend);
  const allPassed = g.players.every((player, index) =>
    player.isOut || index === g.defenderIndex || Boolean(g.passedPlayers?.[index])
  );

  if (!allDefended || !allPassed) return false;
  endAttackRound(false);
  return true;
}

function handlePrimaryAction() {
  const g = appState.game;

  if (g.defenderIndex === 0 && !g.tablePairs.every(pair => pair.defend)) {
    alert('Не всі карти побиті!');
    return;
  }

  g.passedPlayers ||= {};
  g.passedPlayers[0] = true;
  updateGameTurnStatuses();
  renderGameTable();

  if (!checkRoundCompletion()) runBotAISequence();
}

function handleSecondaryAction() {
  const g = appState.game;
  if (g.defenderIndex === 0) endAttackRound(true);
}

function updateGameTurnStatuses() {
  const g = appState.game;
  g.players.forEach((player, index) => {
    if (player.isOut) {
      player.status = 'Вийшов ✅';
    } else if (index === g.defenderIndex) {
      player.status = 'Захищається 🛡️';
    } else if (g.passedPlayers?.[index]) {
      player.status = 'Пас 🛑';
    } else if (index === g.attackerIndex) {
      player.status = 'Атакує ⚔️';
    } else {
      player.status = 'Гравець 👤';
    }
  });
}

function runBotAISequence() {
  const g = appState.game;
  const openPair = g.tablePairs.find(pair => !pair.defend);
  const defender = g.players[g.defenderIndex];

  if (openPair) {
    if (!defender.isBot) return;

    const botIndex = defender.hand.findIndex(card => canBeat(openPair.attack, card, g.trumpSuit));
    if (botIndex === -1) {
      setTimeout(() => endAttackRound(true), 1200);
      return;
    }

    openPair.defend = defender.hand.splice(botIndex, 1)[0];
    renderGameTable();
    setTimeout(runBotAISequence, 1200);
    return;
  }

  if (g.tablePairs.length === 0) {
    const attacker = g.players[g.attackerIndex];
    if (!attacker.isBot || attacker.hand.length === 0) return;

    g.tablePairs.push({ attack: attacker.hand.pop(), defend: null });
    g.passedPlayers = {};
    updateGameTurnStatuses();
    renderGameTable();
    setTimeout(runBotAISequence, 1200);
    return;
  }

  const tableRanks = new Set();
  g.tablePairs.forEach(pair => {
    tableRanks.add(pair.attack.rank);
    if (pair.defend) tableRanks.add(pair.defend.rank);
  });

  const tosser = g.players.find((player, index) =>
    player.isBot &&
    !player.isOut &&
    index !== g.defenderIndex &&
    player.hand.some(card => tableRanks.has(card.rank)) &&
    g.tablePairs.length < 6
  );

  if (tosser) {
    const cardIndex = tosser.hand.findIndex(card => tableRanks.has(card.rank));
    g.tablePairs.push({ attack: tosser.hand.splice(cardIndex, 1)[0], defend: null });
    g.passedPlayers = {};
    updateGameTurnStatuses();
    renderGameTable();
    setTimeout(runBotAISequence, 1200);
    return;
  }

  const botToPass = g.players.findIndex((player, index) =>
    player.isBot &&
    !player.isOut &&
    index !== g.defenderIndex &&
    !g.passedPlayers?.[index]
  );

  if (botToPass !== -1) {
    g.passedPlayers ||= {};
    g.passedPlayers[botToPass] = true;
    updateGameTurnStatuses();
    renderGameTable();
    setTimeout(runBotAISequence, 1200);
    return;
  }

  checkRoundCompletion();
}
