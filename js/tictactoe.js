window.TicTacToe = (() => {
  const WINS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const STAKES = [10, 50, 100, 500];
  let state = {};
  let timer = null;
  let botTimer = null;
  let publicRoomsUnmount = null;

  const root = () => document.getElementById('view-tictactoe');
  const notify = (message) => window.TWA?.toast ? window.TWA.toast(message) : window.alert(message);
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  function playSound(kind = 'move') {
    if (state.sound === false) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'win' ? 660 : 430;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => context.close();
  }

  function firebaseReady() {
    const config = window.FIREBASE_CONFIG;
    return Boolean(window.firebase?.firestore && window.firebase?.auth && window.FirebaseRoomStore && config &&
      ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) =>
        typeof config[key] === 'string' && config[key].trim() && !config[key].includes('YOUR_')));
  }

  async function connectFirebase() {
    if (!firebaseReady()) return null;
    if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const user = await window.getFirebaseUser();
    return { db: window.FirebaseRoomStore, uid: user.uid };
  }

  function beginWager(matchId, stake) {
    if (!window.beginUserWager || window.beginUserWager(matchId, stake)) return true;
    state.fundingError = true;
    if (state.fundingMessageId !== matchId) {
      state.fundingMessageId = matchId;
      notify('Недостатньо монет для ставки 🪙');
    }
    return false;
  }

  function settleWager(matchId, payout) {
    if (matchId && window.settleUserWager) window.settleUserWager(matchId, payout);
  }

  function shell(content) {
    const element = root();
    if (!element) {
      console.error('Tic-tac-toe screen is missing from the page');
      return false;
    }
    element.innerHTML = `<div class="ttt-app">${content}</div>`;
    return true;
  }

  function topbar(label = 'Хрестики-нулики') {
    return `<header class="ttt-topbar">
      <button class="ttt-back" type="button" data-action="back" aria-label="Назад">←</button>
      <strong>${label}</strong>
      <button class="ttt-sound" type="button" data-action="sound" aria-label="Перемкнути звук">${state.sound === false ? '♪' : '🔊'}</button>
    </header>`;
  }

  function renderMenu() {
    state.screen = 'menu';
    publicRoomsUnmount?.();
    if (!shell(`${topbar()}
      <main class="ttt-menu">
        <div><h1 class="ttt-title">Хрестики-нулики</h1><p class="ttt-subtitle">Швидка дуель на полі 3×3</p></div>
        <div class="ttt-mode-list">
          <button class="ttt-mode-card" type="button" data-mode="online"><span class="ttt-mode-icon">♟</span><span class="ttt-mode-copy"><b>Онлайн 1 на 1</b><small>Запроси друга за посиланням</small></span><b>›</b></button>
          <button class="ttt-mode-card" type="button" data-mode="bot"><span class="ttt-mode-icon">⌘</span><span class="ttt-mode-copy"><b>Дуель проти бота</b><small>Розумний ШІ · гра на монети</small></span><b>›</b></button>
          <button class="ttt-mode-card" type="button" data-mode="local"><span class="ttt-mode-icon">▦</span><span class="ttt-mode-copy"><b>На одному екрані</b><small>Двоє гравців ходять по черзі</small></span><b>›</b></button>
        </div>
        <section class="public-rooms-section"><h2>Відкриті столи</h2><div class="public-room-list" id="ttt-open-room-list"><p class="public-room-empty">Завантаження відкритих столів…</p></div></section>
      </main>`)) return;
    publicRoomsUnmount = window.PublicRooms?.mount(
      root().querySelector('#ttt-open-room-list'),
      (game, roomCode) => window.openPublicRoom(game, roomCode),
    ) || null;
    root().querySelector('[data-action="back"]').onclick = leaveToHome;
    root().querySelector('[data-action="sound"]').onclick = toggleSound;
    root().querySelectorAll('[data-mode]').forEach((button) => {
      button.onclick = () => {
        state.mode = button.dataset.mode;
        if (state.mode === 'local') startLocalGame('local', 0);
        else renderStakeScreen();
      };
    });
  }

  function renderStakeScreen() {
    state.screen = 'stake';
    const isOnline = state.mode === 'online';
    if (!shell(`${topbar()}
      <main class="ttt-stake-screen">
        <div><h1 class="ttt-title">${isOnline ? 'Онлайн 1 на 1' : 'Дуель проти бота'}</h1>
          <p class="ttt-subtitle">Обери ставку 🪙</p></div>
        <div class="ttt-stakes">${STAKES.map((stake) =>
          `<button class="ttt-stake${stake === state.stake ? ' active' : ''}" type="button" data-stake="${stake}">🪙 ${stake}</button>`
        ).join('')}</div>
        <button class="ttt-primary" type="button" data-action="continue">${isOnline ? 'Створити кімнату' : 'Почати гру'}</button>
      </main>`)) return;
    root().querySelector('[data-action="back"]').onclick = renderMenu;
    root().querySelector('[data-action="sound"]').onclick = toggleSound;
    root().querySelectorAll('[data-stake]').forEach((button) => {
      button.onclick = () => {
        state.stake = Number(button.dataset.stake);
        root().querySelectorAll('[data-stake]').forEach((item) => item.classList.toggle('active', item === button));
      };
    });
    root().querySelector('[data-action="continue"]').onclick = () => {
      if (isOnline) void createOnlineRoom();
      else startLocalGame('bot', state.stake);
    };
  }

  function makeRoomCode() {
    return `TTT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function roomLink() {
    return window.createRoomInviteUrl(state.online.roomCode);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  async function createOnlineRoom() {
    const roomCode = makeRoomCode();
    let backend = null;
    try {
      backend = await connectFirebase();
    } catch (error) {
      console.error('Unable to connect to Firebase for tic-tac-toe', error);
      notify('Не вдалося підключитися до Firebase. Створюємо тестове лобі.');
    }

    const profile = window.getCurrentPlayerProfile?.() || {
      id: 'local-host', telegramId: '', username: '', name: 'Гравець', photoUrl: '',
    };
    const uid = backend?.uid || profile.id;
    const host = {
      id: uid,
      telegramId: profile.telegramId,
      username: profile.username,
      photoUrl: profile.photoUrl,
      name: profile.name,
      vipUntil: Number(profile.vipUntil) || 0,
      avatar: (profile.name || 'Г').charAt(0).toUpperCase(),
      symbol: 'X',
      ready: true,
      isBot: false,
    };
    const room = {
      meta: {
        stake: state.stake,
        bank: state.stake,
        status: 'waiting',
        hostId: String(uid),
        creatorId: String(profile.telegramId || uid),
        hostName: profile.name,
        isPublic: true,
        createdAt: Date.now(),
      },
      gameRound: 0,
      players: { [uid]: host },
    };
    state.online = {
      roomCode,
      uid,
      isHost: true,
      db: backend?.db || null,
      localTest: !backend,
      roomData: room,
      unsubscribe: null,
    };
    if (backend) {
      try {
        const reference = backend.db.ref(`tictactoeRooms/${roomCode}`);
        await reference.set(room);
        state.online.unsubscribe = reference.on('value', (snapshot) => processRoom(snapshot.val()), (error) => {
          console.error('Tic-tac-toe room listener failed', error);
          notify('Не вдалося отримати оновлення кімнати.');
        });
      } catch (error) {
        console.error('Unable to create tic-tac-toe room', error);
        state.online.db = null;
        state.online.localTest = true;
        notify('Не вдалося створити онлайн-кімнату. Доступне тестове лобі.');
      }
    }
    renderLobby();
  }

  async function joinOnlineRoom(roomCode) {
    if (!/^TTT-[A-Z0-9]{6}$/.test(String(roomCode || '').toUpperCase())) {
      notify('Посилання на кімнату некоректне.');
      return;
    }
    let backend;
    try {
      backend = await connectFirebase();
    } catch (error) {
      console.error('Unable to connect to a tic-tac-toe room', error);
      notify('Не вдалося підключитися до онлайн-кімнати.');
      return;
    }
    if (!backend) {
      notify('Для запрошення друга потрібна налаштована Firebase-конфігурація.');
      return;
    }

    const code = String(roomCode).toUpperCase();
    const reference = backend.db.ref(`tictactoeRooms/${code}`);
    try {
      const snapshot = await reference.once('value');
      const room = snapshot.val();
      if (!room || room.meta?.status !== 'waiting') throw new Error('Кімнату не знайдено або гра вже почалася.');
      const profile = window.getCurrentPlayerProfile?.() || {};
      const existing = Object.values(room.players || {}).find((player) => String(player.id) === String(backend.uid) ||
        (profile.telegramId && player.telegramId === profile.telegramId));
      const uid = existing?.id || backend.uid;
      state.online = {
        roomCode: code,
        uid,
        isHost: String(room.meta?.hostId) === String(uid),
        joinPending: !existing,
        db: backend.db,
        localTest: false,
        roomData: room,
        unsubscribe: reference.on('value', (next) => processRoom(next.val()), (error) => {
          console.error('Tic-tac-toe room listener failed', error);
          notify('Не вдалося синхронізувати кімнату.');
        }),
      };
      processRoom(room);
    } catch (error) {
      console.error('Unable to join tic-tac-toe room', error);
      notify(error.message || 'Не вдалося приєднатися до кімнати.');
      renderMenu();
    }
  }

  function renderLobby() {
    state.screen = 'lobby';
    const room = state.online?.roomData || {};
    const players = Object.values(room.players || {});
    const mine = players.find((player) => String(player.id) === String(state.online.uid));
    const hostPlayer = players.find((player) => String(player.id) === String(room.meta?.hostId));
    const guestPlayer = players.find((player) => String(player.id) !== String(room.meta?.hostId));
    const link = roomLink();
    const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const currentUserId = telegramUser?.id == null ? state.online.uid : telegramUser.id;
    const creatorId = room.meta?.creatorId ??
      (telegramUser?.id == null ? room.meta?.hostId : hostPlayer?.telegramId);
    const isHost = creatorId != null && String(currentUserId) === String(creatorId);
    const isJoined = players.some((player) => telegramUser?.id == null
      ? String(player.id) === String(state.online.uid)
      : String(player.telegramId) === String(telegramUser.id));
    const isJoinPending = !isHost && !isJoined;
    const joinAvailable = players.length < 2 && room.meta?.status === 'waiting';
    const canStart = isHost && canStartOnlineRoom(room);
    state.online.isHost = isHost;
    state.online.joinPending = isJoinPending;
    const notice = state.online.localTest
      ? 'Локальне тестове лобі. Для гри з другом налаштуй Firebase.'
      : 'Поділися посиланням і дочекайся готовності обох гравців.';
    if (!shell(`${topbar()}
      <main class="ttt-lobby-screen">
        <div class="ttt-lobby-card">
          <h1 class="ttt-title">Онлайн 1 на 1</h1>
          <p class="ttt-subtitle">Ставка 🪙 ${Number(room.meta?.stake) || state.stake} · Банк 🪙 ${Number(room.meta?.bank) || (players.length * state.stake)}</p>
          <div class="ttt-lobby-players">
            <div class="ttt-player-card"><span class="ttt-avatar${isHost || hostPlayer?.ready ? ' ready' : ''}">${escapeHtml(hostPlayer?.isBot ? '🤖' : hostPlayer?.name?.[0] || '👑')}</span><b>${escapeHtml(hostPlayer?.name || room.meta?.hostName || 'Господар')} · ✕</b><small>${isHost || hostPlayer?.ready ? '✅ Готовий' : 'Очікує'}</small></div>
            <span>VS</span>
            <div class="ttt-player-card${isJoinPending && joinAvailable ? ' ttt-open-seat' : ''}" ${isJoinPending && joinAvailable ? 'data-action="join-seat" role="button" tabindex="0"' : ''}><span class="ttt-avatar${guestPlayer?.ready ? ' ready' : ''}">${escapeHtml(guestPlayer?.isBot ? '🤖' : guestPlayer?.name?.[0] || '+')}</span><b>${escapeHtml(guestPlayer?.name || '＋ Вільне місце')} · ○</b><small>${guestPlayer?.ready ? '✅ Готовий' : 'Очікуємо друга'}</small></div>
          </div>
          <div class="ttt-lobby-hint">${isJoinPending ? 'Кімната відкрита. Приєднайтеся, щоб зайняти місце.' : !isHost ? 'Очікування початку гри...' : `Код кімнати: <b>${escapeHtml(state.online.roomCode)}</b><br>${notice}<br>Готові: ${players.filter((player) => String(player.id) === String(room.meta?.hostId) || player.ready || player.isBot).length}/2`}</div>
          ${isHost ? '<button class="ttt-lobby-action" type="button" data-action="invite">Надіслати запрошення в чат</button><button class="ttt-lobby-action" type="button" data-action="copy">Скопіювати посилання</button>' : ''}
          ${isHost && players.length < 2 ? '<button class="ttt-lobby-action" type="button" data-action="ai">🤖 + Додати ШІ-бота</button>' : ''}
          ${state.fundingError ? '<p class="ttt-lobby-hint">Недостатньо монет для цієї ставки.</p>' : ''}
          ${isJoinPending ? (joinAvailable ? `<button class="ttt-primary ttt-join-table" type="button" data-action="join">Приєднатися до столу (ставка: ${Number(room.meta?.stake) || state.stake} 🪙)</button>` : '<p class="ttt-lobby-hint">У кімнаті немає вільного місця.</p>') : ''}
          ${!isHost && isJoined ? `<button class="ttt-primary" type="button" data-action="ready">${mine?.ready ? 'Не готовий ❌' : 'Готово ✅'}</button>` : ''}
          ${isHost ? `<button class="${canStart ? 'ttt-primary' : 'ttt-secondary'}" type="button" data-action="start" ${canStart ? '' : 'disabled'}>Почати гру</button>` : ''}
          <button class="ttt-secondary" type="button" data-action="back">${isJoinPending || isHost ? '← Назад' : 'Вийти зі столу'}</button>
        </div>
      </main>`)) return;
    const lobbyAvatars = root().querySelectorAll('.ttt-lobby-players .ttt-avatar');
    window.renderPlayerAvatar?.(lobbyAvatars[0], hostPlayer || { name: 'Господар' }, hostPlayer?.isBot ? '🤖' : '👑');
    window.renderPlayerAvatar?.(lobbyAvatars[1], guestPlayer || { name: 'Вільне місце' }, guestPlayer?.isBot ? '🤖' : '＋');
    root().querySelector('[data-action="sound"]').onclick = toggleSound;
    root().querySelector('[data-action="invite"]')?.addEventListener('click', shareRoom);
    root().querySelector('[data-action="copy"]')?.addEventListener('click', () => { void copyRoom(); });
    root().querySelector('[data-action="ai"]')?.addEventListener('click', () => { void addAiOpponent(); });
    root().querySelector('[data-action="ready"]')?.addEventListener('click', () => { void toggleReady(); });
    root().querySelector('[data-action="start"]')?.addEventListener('click', () => { void startOnlineGame(); });
    root().querySelector('[data-action="join"]')?.addEventListener('click', () => { void acceptRoomInvite(); });
    const openSeat = root().querySelector('[data-action="join-seat"]');
    openSeat?.addEventListener('click', () => { void acceptRoomInvite(); });
    openSeat?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void acceptRoomInvite();
      }
    });
    root().querySelector('[data-action="back"]').onclick = () => { void leaveLobby(); };
  }

  async function acceptRoomInvite() {
    const online = state.online;
    if (!online || online.localTest || !online.joinPending) return;
    const profile = window.getCurrentPlayerProfile?.() || {};
    const player = {
      id: online.uid,
      telegramId: profile.telegramId || '',
      username: profile.username || '',
      photoUrl: profile.photoUrl || '',
      name: profile.name || 'Гравець',
      vipUntil: Number(profile.vipUntil) || 0,
      avatar: (profile.name || 'Г').charAt(0).toUpperCase(),
      symbol: 'O',
      ready: false,
      isBot: false,
    };
    try {
      const result = await window.joinRoomWithStake(`tictactoeRooms/${online.roomCode}`, online.roomCode,
        Number(online.roomData.meta?.stake) || state.stake, (room) => {
          if (!room || room.meta?.status !== 'waiting') return { error: 'Гра вже почалася.' };
          room.players ||= {};
          const existing = Object.values(room.players).find((item) => String(item.id) === String(online.uid) ||
            (profile.telegramId && item.telegramId === profile.telegramId));
          if (existing) return { alreadyJoined: true };
          if (Object.keys(room.players).length >= 2) return { error: 'У кімнаті вже є два гравці.' };
          room.players[online.uid] = player;
          room.meta.bank = (Number(room.meta.bank) || Number(room.meta.stake) || state.stake) + (Number(room.meta.stake) || state.stake);
          return { room };
        });
      const joinedPlayer = Object.values(result.room.players || {}).find((item) => String(item.id) === String(online.uid) ||
        (profile.telegramId && item.telegramId === profile.telegramId));
      if (!joinedPlayer) throw new Error('Не вдалося знайти ваше місце за столом.');
      online.uid = joinedPlayer.id;
      online.joinPending = false;
      online.isHost = String(result.room.meta?.hostId) === String(online.uid);
      processRoom(result.room);
    } catch (error) {
      console.error('Unable to join the invited tic-tac-toe room', error);
      notify(error.message || 'Не вдалося приєднатися до кімнати.');
    }
  }

  async function leaveLobby() {
    const online = state.online;
    if (!online) return;
    if (!online.localTest && online.isHost && online.roomData.meta?.status === 'waiting') {
      try {
        await online.db.ref(`tictactoeRooms/${online.roomCode}`).remove();
      } catch (error) {
        console.error('Unable to close the tic-tac-toe room', error);
        notify('Не вдалося закрити стіл.');
        return;
      }
    } else if (!online.localTest && !online.isHost && !online.joinPending && online.roomData.meta?.status === 'waiting') {
      try {
        await window.leaveRoomWithRefund(`tictactoeRooms/${online.roomCode}`, online.roomCode,
          Number(online.roomData.meta?.stake) || state.stake, (room) => {
            if (!room?.players?.[online.uid]) return;
            delete room.players[online.uid];
            room.meta.bank = Math.max(0, (Number(room.meta.bank) || 0) - (Number(room.meta.stake) || state.stake));
            return { room };
          });
      } catch (error) {
        console.error('Unable to leave the tic-tac-toe room', error);
        notify('Не вдалося вийти зі столу.');
        return;
      }
    }
    disposeOnline();
    renderMenu();
  }

  function shareRoom() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(roomLink())}&text=${encodeURIComponent('Приєднуйся до гри в хрестики-нулики!')}`;
    if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyRoom() {
    try {
      await navigator.clipboard.writeText(roomLink());
      notify('Посилання скопійовано');
    } catch (error) {
      console.error('Unable to copy tic-tac-toe room link', error);
      notify('Не вдалося скопіювати посилання');
    }
  }

  async function addAiOpponent() {
    const online = state.online;
    if (!online || String(online.uid) !== String(online.roomData.meta?.hostId) ||
        Object.keys(online.roomData.players || {}).length >= 2) return;
    const id = `bot-${Date.now()}`;
    const bot = { id, name: 'ШІ-бот', symbol: 'O', ready: true, isBot: true };
    if (online.localTest) {
      online.roomData.players[id] = bot;
      renderLobby();
      notify('ШІ-бот приєднався');
      return;
    }
    try {
      const result = await online.db.ref(`tictactoeRooms/${online.roomCode}`).transaction((room) => {
        if (!room || String(room.meta?.hostId) !== String(online.uid) ||
            room.meta?.status !== 'waiting' || Object.keys(room.players || {}).length >= 2) return;
        room.players[id] = bot;
        room.meta.bank = (Number(room.meta.bank) || Number(room.meta.stake) || state.stake)
          + (Number(room.meta.stake) || state.stake);
        return room;
      });
      if (!result.committed) notify('У кімнаті немає вільного місця.');
    } catch (error) {
      console.error('Unable to add a tic-tac-toe AI opponent', error);
      notify('Не вдалося додати ШІ-бота.');
    }
  }

  function canStartOnlineRoom(room) {
    const players = Object.values(room.players || {});
    return players.length >= 2 && players.every((player) =>
      String(player.id) === String(room.meta?.hostId) || player.ready || player.isBot);
  }

  async function toggleReady() {
    const online = state.online;
    if (!online) return;
    if (online.localTest) {
      online.roomData.players[online.uid].ready = !online.roomData.players[online.uid].ready;
      renderLobby();
      return;
    }

    const reference = online.db.ref(`tictactoeRooms/${online.roomCode}`);
    try {
      await reference.transaction((room) => {
        if (!room || room.meta?.status !== 'waiting' || !room.players?.[online.uid]) return;
        room.players[online.uid].ready = !room.players[online.uid].ready;
        return room;
      });
    } catch (error) {
      console.error('Unable to update tic-tac-toe readiness', error);
      notify('Не вдалося змінити готовність.');
    }
  }

  async function startOnlineGame() {
    const online = state.online;
    if (!online || String(online.uid) !== String(online.roomData.meta?.hostId)) return;
    if (online.localTest) {
      if (canStartOnlineRoom(online.roomData)) startLocalGame('test', state.stake, `${online.roomCode}-1`);
      return;
    }
    try {
      const balance = await window.refreshCurrentUserBalance();
      if (balance < state.stake) {
        notify('Недостатньо монет для ставки 🪙');
        return;
      }
      await online.db.ref(`tictactoeRooms/${online.roomCode}`).transaction((room) => {
        if (!room || String(room.meta?.hostId) !== String(online.uid) ||
            room.meta?.status !== 'waiting' || !canStartOnlineRoom(room)) return;
        const round = (Number(room.gameRound) || 0) + 1;
        room.gameRound = round;
        room.meta.status = 'playing';
        room.game = {
          matchId: `${online.roomCode}-${round}`,
          board: Array(9).fill(null),
          turn: String(room.meta.hostId),
          winner: null,
          line: null,
        };
        return room;
      });
    } catch (error) {
      console.error('Unable to start tic-tac-toe room', error);
      notify('Не вдалося почати гру.');
    }
  }

  function processRoom(room) {
    if (!room || !state.online) return;
    state.online.roomData = room;
    state.stake = Number(room.meta?.stake) || state.stake;
    if (room.meta?.status === 'playing' || room.meta?.status === 'finished') {
      const game = room.game;
      const mine = room.players?.[state.online.uid];
      if (!game || !mine) return;
      state.mode = 'online';
      if (room.meta.status === 'playing') state.rematchWaiting = false;
      state.symbol = mine.symbol;
      state.board = Array.isArray(game.board) ? game.board.slice() : Array(9).fill(null);
      state.onlineTurn = game.turn;
      state.turn = room.players?.[game.turn]?.symbol || 'X';
      state.winnerSymbol = game.winner === 'draw'
        ? 'draw'
        : room.players?.[game.winner]?.symbol || null;
      state.winLine = game.line;
      state.matchId = game.matchId;
      if (!beginWager(state.matchId, state.stake)) {
        renderLobby();
        return;
      }
      state.fundingMessageId = null;
      if (room.meta.status === 'finished') finish(state.winnerSymbol);
      else {
        state.screen = 'game';
        renderGame();
        const currentPlayer = room.players?.[game.turn];
        if (currentPlayer?.isBot && state.online?.isHost) scheduleOnlineBotMove(room);
      }
      return;
    }
    state.fundingError = false;
    renderLobby();
  }

  function startLocalGame(mode, stake, matchId = null) {
    const wagerId = matchId || `ttt-${newId()}`;
    if (!beginWager(wagerId, stake)) {
      if (state.online?.localTest && state.online.roomData.players[state.online.uid]) {
        state.online.roomData.players[state.online.uid].ready = false;
      }
      if (state.mode === 'bot') renderStakeScreen();
      else renderLobby();
      return false;
    }
    state.mode = mode;
    state.stake = stake;
    state.matchId = wagerId;
    state.board = Array(9).fill(null);
    state.turn = 'X';
    state.symbol = 'X';
    state.winnerSymbol = null;
    state.winLine = null;
    state.seconds = 15;
    state.screen = 'game';
    state.fundingError = false;
    state.rematchWaiting = false;
    state.onlineTurn = null;
    if (!renderGame()) return false;
    return true;
  }

  function checkResult(board) {
    for (let index = 0; index < WINS.length; index += 1) {
      const line = WINS[index];
      if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) {
        return { winner: board[line[0]], line: index };
      }
    }
    return board.every(Boolean) ? { winner: 'draw', line: null } : null;
  }

  function emptyCells(board) {
    return board.map((cell, index) => cell === null ? index : -1).filter((index) => index >= 0);
  }

  function minimax(board, turn, depth, isMaximizing) {
    const result = checkResult(board);
    if (result?.winner === 'O') return 10 - depth;
    if (result?.winner === 'X') return depth - 10;
    if (result?.winner === 'draw') return 0;
    const scores = emptyCells(board).map((index) => {
      board[index] = turn;
      const score = minimax(board, turn === 'O' ? 'X' : 'O', depth + 1, !isMaximizing);
      board[index] = null;
      return score;
    });
    return isMaximizing ? Math.max(...scores) : Math.min(...scores);
  }

  function botMove() {
    if (state.screen !== 'game' || state.turn !== 'O' || !['bot', 'test'].includes(state.mode)) return;
    const moves = emptyCells(state.board);
    let best = moves[0];
    let bestScore = -Infinity;
    moves.forEach((index) => {
      state.board[index] = 'O';
      const score = minimax(state.board, 'X', 0, false);
      state.board[index] = null;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best !== undefined) makeLocalMove(best);
  }

  function makeLocalMove(index) {
    state.board[index] = state.turn;
    playSound();
    const result = checkResult(state.board);
    if (result) {
      state.winnerSymbol = result.winner;
      state.winLine = result.line;
      playSound(result.winner === 'draw' ? 'move' : 'win');
      finish(result.winner);
      return;
    }
    state.turn = state.turn === 'X' ? 'O' : 'X';
    renderGame();
    if (state.turn === 'O' && ['bot', 'test'].includes(state.mode)) {
      clearTimeout(botTimer);
      botTimer = setTimeout(botMove, 450);
    }
  }

  async function submitOnlineMove(index) {
    const online = state.online;
    if (!online?.db || String(state.onlineTurn) !== String(online.uid) || state.board[index]) return;
    const reference = online.db.ref(`tictactoeRooms/${online.roomCode}`);
    try {
      await reference.transaction((room) => {
        if (!room || room.meta?.status !== 'playing' || room.game?.turn !== online.uid ||
            room.game.board[index] !== null) return;
        const board = room.game.board.slice();
        board[index] = room.players[online.uid].symbol;
        const result = checkResult(board);
        room.game.board = board;
        room.game.line = result?.line ?? null;
        if (result) {
          room.game.winner = result.winner === 'draw' ? 'draw' : online.uid;
          room.meta.status = 'finished';
        } else {
          const opponent = Object.values(room.players).find((player) => String(player.id) !== String(online.uid));
          room.game.turn = opponent.id;
        }
        return room;
      });
    } catch (error) {
      console.error('Unable to submit tic-tac-toe move', error);
      notify('Не вдалося зробити хід.');
    }
  }

  function chooseBotMove(board, symbol) {
    let best = emptyCells(board)[0];
    let bestScore = symbol === 'O' ? -Infinity : Infinity;
    emptyCells(board).forEach((index) => {
      board[index] = symbol;
      const score = minimax(board, symbol === 'O' ? 'X' : 'O', 0, symbol !== 'O');
      board[index] = null;
      if ((symbol === 'O' && score > bestScore) || (symbol === 'X' && score < bestScore)) {
        bestScore = score;
        best = index;
      }
    });
    return best;
  }

  function scheduleOnlineBotMove(room) {
    const bot = room.players?.[room.game?.turn];
    if (!bot?.isBot || !state.online?.isHost) return;
    const moveKey = `${room.game.matchId}:${room.game.board.join('')}`;
    if (state.onlineBotMoveKey === moveKey) return;
    state.onlineBotMoveKey = moveKey;
    clearTimeout(botTimer);
    botTimer = setTimeout(async () => {
      const online = state.online;
      if (!online?.db) return;
      const index = chooseBotMove(room.game.board.slice(), bot.symbol || 'O');
      if (index == null) return;
      try {
        await online.db.ref(`tictactoeRooms/${online.roomCode}`).transaction((current) => {
          if (!current || current.meta?.status !== 'playing' ||
              String(current.game?.turn) !== String(bot.id) ||
              current.game.board[index] !== null) return;
          const board = current.game.board.slice();
          board[index] = bot.symbol || 'O';
          const result = checkResult(board);
          current.game.board = board;
          current.game.line = result?.line ?? null;
          if (result) {
            current.game.winner = result.winner === 'draw' ? 'draw' : bot.id;
            current.meta.status = 'finished';
          } else {
            current.game.turn = current.meta.hostId;
          }
          return current;
        });
      } catch (error) {
        console.error('Unable to submit a tic-tac-toe AI move', error);
        notify('ШІ-бот не зміг зробити хід.');
      }
    }, 450);
  }

  function renderGame() {
    state.screen = 'game';
    const online = state.mode === 'online';
    const localTurn = online
      ? state.onlineTurn === state.online?.uid
      : state.mode === 'local' || state.turn === 'X';
    const turnSymbol = state.turn;
    const me = online ? state.online?.roomData?.players?.[state.online.uid] : null;
    const opponent = online
      ? Object.values(state.online?.roomData?.players || {}).find((player) => String(player.id) !== String(state.online.uid))
      : null;
    const localProfile = window.getCurrentPlayerProfile?.();
    const firstName = online ? me?.name || 'Ти' : localProfile?.name || (state.mode === 'local' ? 'Гравець 1' : 'Ти');
    const secondName = online ? opponent?.name || 'Суперник' : state.mode === 'local' ? 'Гравець 2' : state.mode === 'test' ? 'ШІ-бот' : 'Розумний бот';
    const currentName = turnSymbol === 'X' ? firstName : secondName;
    const cells = state.board.map((value, index) => {
      const disabled = Boolean(value) || !localTurn;
      return `<button class="ttt-cell${value === 'X' ? ' x' : value === 'O' ? ' o' : ''}" type="button" data-cell="${index}" ${disabled ? 'disabled' : ''} aria-label="Клітинка ${index + 1}">${value === 'X' ? '✕' : value === 'O' ? '○' : ''}</button>`;
    }).join('');
    if (!shell(`${topbar()}
      <main class="ttt-game-screen">
        <span class="ttt-turn-capsule" id="ttt-turn-label">${localTurn ? 'Твій хід' : `Хід ${currentName}`} <span id="ttt-timer">${state.seconds || 15}s</span></span>
        <div class="ttt-players">
          <div class="ttt-player-card${turnSymbol === 'X' ? ' active' : ''}"><span class="ttt-avatar">${escapeHtml(firstName[0] || 'X')}</span><b>${escapeHtml(firstName)}</b><span class="ttt-mark">✕</span></div>
          <span>VS</span>
          <div class="ttt-player-card${turnSymbol === 'O' ? ' active' : ''}"><span class="ttt-avatar">${escapeHtml(secondName[0] || 'O')}</span><b>${escapeHtml(secondName)}</b><span class="ttt-mark">○</span></div>
        </div>
        <div class="ttt-board"${state.winLine == null ? '' : ` data-line="${state.winLine}"`}>${cells}</div>
        <p class="ttt-subtitle">${localTurn ? `Твій символ · ${state.symbol || '✕'}` : 'Дочекайся ходу суперника'}</p>
      </main>`)) return false;
    const playerAvatars = root().querySelectorAll('.ttt-players .ttt-avatar');
    window.renderPlayerAvatar?.(playerAvatars[0], me || localProfile || { name: firstName }, firstName[0] || 'X');
    window.renderPlayerAvatar?.(playerAvatars[1], opponent || { name: secondName }, secondName[0] || 'O');
    root().querySelector('[data-action="back"]').onclick = () => {
      if (confirm('Вийти з партії? Ставка не повертається.')) {
        disposeOnline();
        renderMenu();
      }
    };
    root().querySelector('[data-action="sound"]').onclick = toggleSound;
    root().querySelectorAll('[data-cell]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.dataset.cell);
        if (online) void submitOnlineMove(index);
        else makeLocalMove(index);
      };
    });
    startTurnTimer();
    return true;
  }

  function startTurnTimer() {
    clearInterval(timer);
    state.seconds = 15;
    timer = setInterval(() => {
      state.seconds = Math.max(0, state.seconds - 1);
      const element = document.getElementById('ttt-timer');
      if (element) element.textContent = `${state.seconds}s`;
      if (state.seconds === 0) {
        clearInterval(timer);
        if (state.mode === 'online') {
          if (state.onlineTurn === state.online?.uid) {
            const moves = emptyCells(state.board);
            if (moves.length) void submitOnlineMove(moves[Math.floor(Math.random() * moves.length)]);
          }
        } else if (state.mode === 'local' || state.turn === 'X') {
          const moves = emptyCells(state.board);
          if (moves.length) makeLocalMove(moves[Math.floor(Math.random() * moves.length)]);
        }
      }
    }, 1000);
  }

  function finish(winner) {
    clearInterval(timer);
    clearTimeout(botTimer);
    state.screen = 'final';
    state.winnerSymbol = winner;
    const won = winner !== 'draw' && (state.mode === 'local' || winner === state.symbol);
    const payout = winner === 'draw' ? state.stake : won ? state.stake * 2 : 0;
    settleWager(state.matchId, payout);
    state.payout = payout;
    state.won = won;
    renderFinal(winner);
  }

  function renderFinal(winner) {
    const title = winner === 'draw' ? 'Нічия' : state.won ? 'Перемога' : 'Поразка';
    const change = state.stake === 0
      ? '0 🪙'
      : state.payout > 0 ? `+${state.payout} 🪙` : `-${state.stake} 🪙`;
    if (!shell(`${topbar()}
      <main class="ttt-result-screen">
        <section class="ttt-result-card">
          <div class="ttt-trophy">🏆</div>
          <h2>${title}</h2>
          <p class="ttt-result-change">${change}</p>
          <p class="ttt-subtitle">${state.stake === 0 ? 'Гра без ставки' : winner === 'draw' ? 'Ставку повернуто' : state.won ? 'Виграш зараховано на баланс' : 'Ставку списано з балансу'}</p>
        </section>
        <button class="ttt-secondary" type="button" data-action="rematch">${state.rematchWaiting ? 'Очікуємо суперника…' : 'Реванш'}</button>
        <button class="ttt-primary" type="button" data-action="new">Новий стіл</button>
      </main>`)) return;
    root().querySelector('[data-action="back"]').onclick = () => { disposeOnline(); renderMenu(); };
    root().querySelector('[data-action="sound"]').onclick = toggleSound;
    root().querySelector('[data-action="rematch"]').onclick = () => {
      if (state.mode === 'online' && state.online?.db) void requestOnlineRematch();
      else startLocalGame(state.mode, state.stake);
    };
    root().querySelector('[data-action="new"]').onclick = () => {
      disposeOnline();
      renderMenu();
    };
  }

  async function requestOnlineRematch() {
    const online = state.online;
    const reference = online.db.ref(`tictactoeRooms/${online.roomCode}`);
    try {
      const balance = await window.refreshCurrentUserBalance();
      if (balance < state.stake) {
        notify('Недостатньо монет для реваншу 🪙');
        return;
      }
      await reference.child(`players/${online.uid}/rematchReady`).set(true);
      state.rematchWaiting = true;
      renderFinal(state.winnerSymbol);
      await reference.transaction((room) => {
        if (!room || room.meta?.status !== 'finished') return room;
        const players = Object.values(room.players || {});
        if (players.length !== 2 || !players.every((player) => player.rematchReady)) return room;
        const round = (Number(room.gameRound) || 0) + 1;
        room.gameRound = round;
        room.meta.status = 'playing';
        players.forEach((player) => { player.rematchReady = false; });
        room.game = {
          matchId: `${online.roomCode}-${round}`,
          board: Array(9).fill(null),
          turn: room.meta.hostId,
          winner: null,
          line: null,
        };
        return room;
      });
    } catch (error) {
      console.error('Unable to start tic-tac-toe rematch', error);
      notify('Не вдалося почати реванш.');
    }
  }

  function toggleSound() {
    state.sound = state.sound === false;
    const button = root()?.querySelector('[data-action="sound"]');
    if (button) button.textContent = state.sound ? '🔊' : '♪';
  }

  function disposeOnline() {
    clearInterval(timer);
    clearTimeout(botTimer);
    if (state.online?.db && state.online.unsubscribe) {
      state.online.db.ref(`tictactoeRooms/${state.online.roomCode}`).off('value', state.online.unsubscribe);
    }
    state.online = null;
    state.onlineBotMoveKey = null;
    const url = new URL(location.href);
    url.searchParams.delete('tictactoeRoom');
    url.searchParams.delete('room');
    history.replaceState({}, '', url);
  }

  function leaveToHome() {
    disposeOnline();
    document.body.classList.remove('tictactoe-active');
    if (window.showView) window.showView('home');
  }

  function init() {
    clearInterval(timer);
    clearTimeout(botTimer);
    if (state.online) disposeOnline();
    state = { screen: 'menu', mode: 'bot', stake: 10, sound: true, seconds: 15, rematchWaiting: false };
    document.body.classList.add('tictactoe-active');
    renderMenu();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const invite = window.consumeIncomingRoomInvite?.('tictactoe');
    const roomCode = invite?.roomCode || new URLSearchParams(location.search).get('tictactoeRoom');
    if (!roomCode) return;
    if (window.showView) window.showView('tictactoe');
    void joinOnlineRoom(roomCode);
  });

  return { init, joinRoom: joinOnlineRoom };
})();
