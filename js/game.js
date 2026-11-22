(() => {
  const telegramWebApp = window.Telegram?.WebApp;
  telegramWebApp?.ready?.();
  telegramWebApp?.expand?.();

  const BALANCE_KEY = 'tga_balance';
  const readBalance = () => {
    const value = Number.parseInt(localStorage.getItem(BALANCE_KEY) || '0', 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  let anonymousAuthPromise = null;
  let playerDocumentRef = null;

  window.APP_STATE = window.APP_STATE || {};
  window.APP_STATE.balance = readBalance();

  function getCurrentPlayerProfile() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const username = typeof user?.username === 'string' ? user.username.replace(/^@/, '') : '';
    const firstName = typeof user?.first_name === 'string' ? user.first_name.trim() : '';
    const telegramId = user?.id == null ? '' : String(user.id);
    return {
      id: telegramId || 'local-player',
      telegramId,
      name: firstName || (username ? `@${username}` : 'Гравець'),
      username: username ? `@${username}` : '',
      photoUrl: typeof user?.photo_url === 'string' ? user.photo_url : '',
    };
  }

  window.getCurrentPlayerProfile = getCurrentPlayerProfile;

  async function getFirebaseUser() {
    const auth = window.firebase.auth();
    if (typeof auth.authStateReady === 'function') await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
    if (!anonymousAuthPromise) {
      anonymousAuthPromise = auth.signInAnonymously()
        .then((credential) => credential.user)
        .finally(() => { anonymousAuthPromise = null; });
    }
    return anonymousAuthPromise;
  }

  window.getFirebaseUser = getFirebaseUser;

  window.renderPlayerAvatar = function renderPlayerAvatar(element, player, fallback = '') {
    if (!element) return;
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    const initial = fallback || name.charAt(0).toUpperCase() || '👤';
    const photoUrl = typeof player?.photoUrl === 'string'
      ? player.photoUrl
      : typeof player?.photo_url === 'string' ? player.photo_url : '';
    element.textContent = initial;
    if (player?.telegramId) element.dataset.telegramId = String(player.telegramId);
    else delete element.dataset.telegramId;
    if (!photoUrl) return;

    let safePhotoUrl = '';
    try {
      const parsed = new URL(photoUrl, window.location.href);
      if (parsed.protocol === 'https:') safePhotoUrl = parsed.href;
    } catch (error) {
      console.warn('Ignoring an invalid Telegram profile photo URL.', error);
    }
    if (!safePhotoUrl) return;

    const image = document.createElement('img');
    image.className = 'player-avatar-image';
    image.src = safePhotoUrl;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => {
      image.remove();
      element.textContent = initial;
    };
    element.replaceChildren(image);
  };

  function renderTelegramProfile() {
    const profile = getCurrentPlayerProfile();
    const name = document.getElementById('profile-name');
    const username = document.getElementById('profile-username');
    const id = document.getElementById('profile-user-id');
    if (name) name.textContent = profile.name;
    if (username) {
      username.textContent = profile.username;
      username.hidden = !profile.username;
    }
    if (id) id.textContent = profile.telegramId || '—';
    window.renderPlayerAvatar(document.getElementById('profile-avatar'), profile);
    window.renderPlayerAvatar(document.getElementById('header-avatar'), profile);
  }

  function firebaseConfigIsReady() {
    const config = window.FIREBASE_CONFIG;
    return Boolean(config &&
      ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) =>
        typeof config[key] === 'string' &&
        config[key].trim() &&
        !config[key].includes('YOUR_')));
  }

  function renderLeaderboard(snapshot) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    const entries = snapshot.docs
      .map((document) => {
        const player = document.data();
        if (!player || !Number.isSafeInteger(Number(player.balance)) || Number(player.balance) < 0) return null;
        return { ...player, firebaseId: document.id, balance: Number(player.balance) };
      })
      .filter(Boolean);
    entries.sort((a, b) => b.balance - a.balance);
    list.replaceChildren();

    if (!entries.length) {
      const message = document.createElement('p');
      message.className = 'leaderboard-message';
      message.textContent = 'Поки що немає гравців у рейтингу.';
      list.appendChild(message);
      return;
    }

    entries.slice(0, 10).forEach((player, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-player';
      const place = document.createElement('span');
      place.className = 'leaderboard-place';
      place.textContent = String(index + 1);
      const avatar = document.createElement('span');
      avatar.className = 'leaderboard-avatar';
      const details = document.createElement('span');
      details.className = 'leaderboard-details';
      const name = document.createElement('strong');
      name.textContent = player.name || 'Гравець';
      const identifier = document.createElement('small');
      identifier.textContent = [
        player.username,
        player.telegramId ? `ID ${player.telegramId}` : '',
      ].filter(Boolean).join(' · ');
      if (player.telegramId) row.dataset.telegramId = String(player.telegramId);
      details.append(name, identifier);
      const balance = document.createElement('strong');
      balance.className = 'leaderboard-balance';
      balance.textContent = `🪙 ${player.balance}`;
      row.append(place, avatar, details, balance);
      list.appendChild(row);
      window.renderPlayerAvatar(avatar, player);
    });
  }

  function setLeaderboardMessage(message) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    const element = document.createElement('p');
    element.className = 'leaderboard-message';
    element.textContent = message;
    list.replaceChildren(element);
  }

  function syncLeaderboardProfile(balance = window.APP_STATE.balance) {
    if (!playerDocumentRef) return Promise.resolve(false);
    const profile = getCurrentPlayerProfile();
    return playerDocumentRef.set({
      telegramId: profile.telegramId,
      username: profile.username,
      name: profile.name,
      photoUrl: profile.photoUrl,
      balance,
      updatedAt: Date.now(),
    }, { merge: true }).then(() => true).catch((error) => {
      console.error('Unable to update the Firestore player profile.', error);
      return false;
    });
  }

  async function initializeLeaderboard() {
    if (!firebaseConfigIsReady()) {
      setLeaderboardMessage('Рейтинг за балансом потребує налаштованого Firebase.');
      return;
    }
    if (!window.firebase?.firestore || !window.firebase?.auth) {
      throw new Error('Firebase SDK для рейтингу не завантажився.');
    }

    if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const user = await getFirebaseUser();
    const firestore = window.firebase.firestore();
    playerDocumentRef = firestore.collection('players').doc(user.uid);
    const playerDocument = await playerDocumentRef.get();
    const savedBalance = playerDocument.data()?.balance;
    if (playerDocument.exists && Number.isSafeInteger(savedBalance) && savedBalance >= 0) {
      window.APP_STATE.balance = savedBalance;
      localStorage.setItem(BALANCE_KEY, String(savedBalance));
      renderBalance();
      window.dispatchEvent(new CustomEvent('userbalancechange', {
        detail: { balance: savedBalance, delta: 0, source: 'firestore' },
      }));
    }

    firestore.collection('players')
      .orderBy('balance', 'desc')
      .limit(10)
      .onSnapshot(renderLeaderboard, (error) => {
        console.error('Unable to load the Firestore leaderboard.', error);
        setLeaderboardMessage('Не вдалося завантажити рейтинг.');
      });
    await syncLeaderboardProfile();
  }

  function renderBalance() {
    const balance = String(window.APP_STATE.balance);
    ['balance', 'store-balance', 'profile-balance', 'durak-balance'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = balance;
    });
  }

  window.updateUserBalance = function updateUserBalance(delta) {
    if (!Number.isSafeInteger(delta)) {
      throw new TypeError('Balance change must be a safe integer.');
    }

    const balance = Number(window.APP_STATE?.balance);
    const nextBalance = balance + delta;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) return false;

    localStorage.setItem(BALANCE_KEY, String(nextBalance));
    window.APP_STATE.balance = nextBalance;
    renderBalance();
    syncLeaderboardProfile(nextBalance);
    window.dispatchEvent(new CustomEvent('userbalancechange', {
      detail: { balance: nextBalance, delta },
    }));
    return true;
  };

  window.beginUserWager = function beginUserWager(matchId, stake) {
    if (!matchId || !Number.isSafeInteger(stake) || stake < 0) {
      throw new TypeError('A match id and non-negative integer stake are required.');
    }
    const key = `tga_wager_${encodeURIComponent(matchId)}`;
    const existing = JSON.parse(localStorage.getItem(key) || 'null');
    if (existing?.charged) return true;
    if (!window.updateUserBalance(-stake)) {
      return false;
    }
    localStorage.setItem(key, JSON.stringify({ stake, charged: true, settled: false }));
    return true;
  };

  window.settleUserWager = function settleUserWager(matchId, payout = 0) {
    if (!matchId || !Number.isSafeInteger(payout) || payout < 0) {
      throw new TypeError('A match id and non-negative integer payout are required.');
    }
    const key = `tga_wager_${encodeURIComponent(matchId)}`;
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    if (!record?.charged) return false;
    if (record.settled) return true;
    if (payout > 0 && !window.updateUserBalance(payout)) return false;
    record.settled = true;
    record.payout = payout;
    localStorage.setItem(key, JSON.stringify(record));
    return true;
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderBalance();
    renderTelegramProfile();
    initializeLeaderboard().catch((error) => {
      console.error('Unable to initialize the Firestore leaderboard.', error);
      setLeaderboardMessage('Не вдалося підключити рейтинг.');
    });
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  const catalog = document.getElementById('chat-games-catalog');
  if (!catalog) return;

  const commandPhrases = {
    coin: 'Зіграти в монетку',
    dice: 'Зіграти в кубика',
  };

  function updateCommandPreview(input) {
    const game = input.dataset.chatGameStake;
    const preview = catalog.querySelector(`[data-command-preview="${game}"]`);
    if (!preview || !commandPhrases[game]) return;

    const amount = Number(input.value);
    const valid = Number.isSafeInteger(amount) && amount >= 10 && amount <= 300;
    input.setCustomValidity(valid ? '' : 'Введи ціле число від 10 до 300.');
    input.setAttribute('aria-invalid', String(!valid));
    preview.textContent = valid
      ? `${commandPhrases[game]} ${amount}`
      : `${commandPhrases[game]} [10–300]`;
  }

  async function copyCommand(command) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(command);
        return;
      } catch (error) {
        console.warn('Clipboard API failed; trying the compatibility fallback.', error);
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = command;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied;
    try {
      copied = document.execCommand('copy');
    } finally {
      textarea.remove();
    }
    if (!copied) throw new Error('Clipboard copy was not available.');
  }

  catalog.querySelectorAll('[data-chat-game-stake]').forEach(updateCommandPreview);
  catalog.addEventListener('input', (event) => {
    const input = event.target.closest('[data-chat-game-stake]');
    if (input) updateCommandPreview(input);
  });
  catalog.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-chat-command]');
    if (!button) return;

    const game = button.dataset.copyChatCommand;
    const input = catalog.querySelector(`[data-chat-game-stake="${game}"]`);
    if (!input || !commandPhrases[game]) return;
    updateCommandPreview(input);
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }

    const command = `${commandPhrases[game]} ${Number(input.value)}`;
    try {
      await copyCommand(command);
      if (window.TWA?.toast) window.TWA.toast('Команду скопійовано');
      else window.alert('Команду скопійовано');
    } catch (error) {
      console.error('Could not copy the chat game command.', error);
      if (window.TWA?.toast) window.TWA.toast('Не вдалося скопіювати команду');
      else window.alert('Не вдалося скопіювати команду');
    }
  });
});

window.openBattleshipScreen = function openBattleshipScreen() {
  document.body.classList.remove('tictactoe-active');
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.remove('active');
  });

  const view = document.getElementById('view-battleship');
  const screen = document.getElementById('screen-battleship');
  if (view) {
    view.classList.add('active');
    view.style.display = 'block';
  }
  if (screen) {
    screen.style.display = 'block';
  }

  document.body.classList.add('battleship-active');
  if (window.Battleship) {
    window.Battleship.init();
  } else {
    console.error('Battleship module is not loaded');
  }
};

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
