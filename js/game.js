(() => {
  const telegramWebApp = window.Telegram?.WebApp;
  telegramWebApp?.ready?.();
  telegramWebApp?.expand?.();

  const BALANCE_KEY = 'tga_balance';
  const DIAMONDS_API_URL = 'https://telegram-game-app.onrender.com';
  const readBalance = () => {
    const value = Number.parseInt(localStorage.getItem(BALANCE_KEY) || '0', 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  let anonymousAuthPromise = null;
  let playerDocumentRef = null;
  let pendingBalanceDelta = 0;

  window.APP_STATE = window.APP_STATE || {};
  window.APP_STATE.balance = readBalance();
  window.APP_STATE.diamonds = 0;

  let roomInviteResolved = false;
  let roomInvite = null;

  function resolveRoomInvite() {
    if (roomInviteResolved) return roomInvite;
    roomInviteResolved = true;

    const params = new URLSearchParams(window.location.search);
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    let roomCode = '';
    let preferredGame = '';
    if (typeof startParam === 'string' && startParam.startsWith('room_')) {
      roomCode = startParam.slice('room_'.length);
    } else if (params.has('room')) {
      roomCode = params.get('room') || '';
    } else if (params.has('battleshipRoom')) {
      roomCode = params.get('battleshipRoom') || '';
      preferredGame = 'battleship';
    } else if (params.has('tictactoeRoom')) {
      roomCode = params.get('tictactoeRoom') || '';
      preferredGame = 'tictactoe';
    }

    roomCode = roomCode.trim().toUpperCase();
    if (!roomCode) return null;
    const game = /^DURAK-[A-Z0-9]{6}$/.test(roomCode) ? 'durak'
      : /^BS-[A-Z0-9]{6}$/.test(roomCode) ? 'battleship'
        : /^TTT-[A-Z0-9]{6}$/.test(roomCode) ? 'tictactoe'
          : preferredGame || (params.has('room') ? 'durak' : '');
    roomInvite = game ? { game, roomCode } : null;
    return roomInvite;
  }

  window.hasIncomingRoomInvite = function hasIncomingRoomInvite(game) {
    return !window.APP_STATE.roomInviteHandled && resolveRoomInvite()?.game === game;
  };

  window.consumeIncomingRoomInvite = function consumeIncomingRoomInvite(game) {
    if (!window.hasIncomingRoomInvite(game)) return null;
    window.APP_STATE.roomInviteHandled = true;
    return { ...resolveRoomInvite() };
  };

  window.createRoomInviteUrl = function createRoomInviteUrl(roomCode) {
    if (typeof roomCode !== 'string' || !roomCode.trim()) {
      throw new TypeError('A room code is required to create an invite link.');
    }
    return `https://t.me/SecretAgentGame646Bot?startapp=room_${encodeURIComponent(roomCode.trim())}`;
  };

  function getCurrentPlayerProfile() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const username = typeof user?.username === 'string' ? user.username.replace(/^@/, '') : '';
    const firstName = typeof user?.first_name === 'string' ? user.first_name.trim() : '';
    const lastName = typeof user?.last_name === 'string' ? user.last_name.trim() : '';
    const telegramId = user?.id == null ? '' : String(user.id);
    return {
      id: telegramId || 'local-player',
      telegramId,
      name: [firstName, lastName].filter(Boolean).join(' ')
        || (username ? `@${username}` : `Гравець ${telegramId || ''}`.trim()),
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

    entries.forEach((player, index) => {
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

  function firestoreProfileFields() {
    const profile = getCurrentPlayerProfile();
    return {
      telegramId: profile.telegramId,
      username: profile.username.replace(/^@/, ''),
      name: profile.name,
      photoUrl: profile.photoUrl,
      updatedAt: Date.now(),
    };
  }

  function syncUserBalance(delta) {
    if (!playerDocumentRef) {
      pendingBalanceDelta += delta;
      return;
    }

    playerDocumentRef.update({
      ...firestoreProfileFields(),
      balance: window.firebase.firestore.FieldValue.increment(delta),
    }).catch(async (error) => {
      console.error('Unable to update the Firestore user balance.', error);
      try {
        const snapshot = await playerDocumentRef.get();
        const savedBalance = snapshot.get('balance');
        if (snapshot.exists && Number.isSafeInteger(savedBalance) && savedBalance >= 0) {
          applyRemoteBalance(savedBalance, 'firestore-recovery');
        }
      } catch (recoveryError) {
        console.error('Unable to reload the Firestore user balance.', recoveryError);
      }
      window.TWA?.toast('Не вдалося синхронізувати баланс');
    });
  }

  async function initializeLeaderboard() {
    if (!firebaseConfigIsReady()) {
      setLeaderboardMessage('Рейтинг за балансом потребує налаштованого Firebase.');
      return;
    }
    if (!window.firebase?.firestore) {
      throw new Error('Firebase SDK для рейтингу не завантажився.');
    }

    const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (telegramUser?.id == null) {
      setLeaderboardMessage('Увійдіть у гру через Telegram, щоб синхронізувати баланс.');
      return;
    }

    if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const firestore = window.firebase.firestore();
    const userId = String(telegramUser.id);
    const userDocumentRef = firestore.collection('users').doc(userId);
    userDocumentRef.onSnapshot((snapshot) => {
      if (!snapshot.exists) return;
      const savedBalance = snapshot.get('balance');
      if (!Number.isSafeInteger(savedBalance) || savedBalance < 0) {
        console.error(`Invalid balance in Firestore user document ${userId}.`);
      } else {
        applyRemoteBalance(savedBalance, 'firestore');
      }

      const savedDiamonds = snapshot.get('diamonds');
      if (savedDiamonds == null) {
        applyRemoteDiamonds(0);
      } else if (Number.isSafeInteger(savedDiamonds) && savedDiamonds >= 0) {
        applyRemoteDiamonds(savedDiamonds);
      } else {
        console.error(`Invalid diamonds balance in Firestore user document ${userId}.`);
      }
    }, (error) => {
      console.error('Unable to listen for Firestore user balance changes.', error);
      setLeaderboardMessage('Не вдалося підключити синхронізацію балансу.');
    });

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userDocumentRef);
      if (!snapshot.exists) {
        transaction.set(userDocumentRef, {
          id: telegramUser.id,
          ...firestoreProfileFields(),
          balance: 100,
          diamonds: 0,
        });
      } else {
        const profileFields = firestoreProfileFields();
        if (snapshot.get('diamonds') == null) profileFields.diamonds = 0;
        transaction.set(userDocumentRef, profileFields, { merge: true });
      }
    });
    playerDocumentRef = userDocumentRef;

    if (pendingBalanceDelta !== 0) {
      const delta = pendingBalanceDelta;
      pendingBalanceDelta = 0;
      syncUserBalance(delta);
    }

    firestore.collection('users')
      .orderBy('balance', 'desc')
      .onSnapshot(renderLeaderboard, (error) => {
        console.error('Unable to load the Firestore user leaderboard.', error);
        setLeaderboardMessage('Не вдалося завантажити рейтинг.');
      });
  }

  function renderBalance() {
    const balance = String(window.APP_STATE.balance);
    ['balance', 'store-balance', 'profile-balance', 'durak-balance'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = balance;
    });
    const diamonds = String(window.APP_STATE.diamonds);
    ['header-diamonds', 'profile-diamonds'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = diamonds;
    });
  }

  function applyRemoteBalance(balance, source) {
    window.APP_STATE.balance = balance;
    localStorage.setItem(BALANCE_KEY, String(balance));
    renderBalance();
    window.dispatchEvent(new CustomEvent('userbalancechange', {
      detail: { balance, delta: 0, source },
    }));
  }

  function applyRemoteDiamonds(diamonds) {
    window.APP_STATE.diamonds = diamonds;
    renderBalance();
    window.dispatchEvent(new CustomEvent('userdiamondschange', {
      detail: { diamonds, source: 'firestore' },
    }));
  }

  function bindDiamondsShop() {
    const modal = document.getElementById('diamonds-shop-modal');
    const status = document.getElementById('diamonds-shop-status');
    if (!modal || !status) return;

    function closeShop() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('[data-open-diamonds-shop]').forEach((button) => {
      button.addEventListener('click', () => {
        status.textContent = '';
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        modal.querySelector('[data-close-diamonds-shop]')?.focus();
      });
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-diamonds-shop]')) {
        closeShop();
        return;
      }

      const button = event.target.closest('[data-diamond-package]');
      if (!button || button.disabled) return;
      void purchaseDiamonds(button.dataset.diamondPackage, modal, status);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeShop();
    });
  }

  async function purchaseDiamonds(packageId, modal, status) {
    const buttons = [...modal.querySelectorAll('[data-diamond-package]')];
    const telegramUser = telegramWebApp?.initDataUnsafe?.user;
    const initData = telegramWebApp?.initData;
    if (!telegramUser?.id || !initData) {
      status.textContent = 'Відкрийте магазин у Telegram, щоб купити діаманти.';
      return;
    }
    if (typeof telegramWebApp.openInvoice !== 'function') {
      status.textContent = 'Оплата Telegram Stars не підтримується цією версією Telegram.';
      return;
    }

    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = 'Створюємо захищений рахунок…';
    try {
      const response = await fetch(`${DIAMONDS_API_URL}/api/create-diamonds-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: String(telegramUser.id),
          packageId,
          initData,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Не вдалося створити рахунок.');
      }
      if (typeof result.invoiceUrl !== 'string' || !result.invoiceUrl.startsWith('https://')) {
        throw new Error('Сервер повернув некоректне посилання на оплату.');
      }

      status.textContent = 'Відкриваємо оплату Telegram Stars…';
      telegramWebApp.openInvoice(result.invoiceUrl, (invoiceStatus) => {
        if (invoiceStatus === 'paid') {
          status.textContent = 'Оплату прийнято. Баланс діамантів оновиться автоматично.';
          window.TWA?.toast('Оплату прийнято!');
        } else if (invoiceStatus === 'cancelled') {
          status.textContent = 'Оплату скасовано.';
        } else if (invoiceStatus === 'failed') {
          status.textContent = 'Оплата не пройшла. Спробуйте ще раз.';
        } else if (invoiceStatus === 'pending') {
          status.textContent = 'Платіж обробляється. Діаманти нарахуються після підтвердження.';
        }
      });
    } catch (error) {
      console.error('Unable to start a diamonds purchase.', error);
      status.textContent = error.message || 'Не вдалося розпочати оплату.';
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
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
    syncUserBalance(delta);
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
    bindDiamondsShop();
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
