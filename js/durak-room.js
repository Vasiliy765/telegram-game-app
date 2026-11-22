window.DurakRoom = (() => {
  const tg = window.Telegram?.WebApp || {};
  const $ = (id) => document.getElementById(id);
  const defaultSettings = { mode: 'Простий', deck: 36, players: 4, roomType: 'Закрита', stake: 10 };
  const adjectives = ['Сміливий', 'Тихий', 'Веселий', 'Миткий'];
  const nouns = ['Лис', 'Ведмідь', 'Вовк', 'Орел'];
  let state = {
    roomCode: '',
    settings: { ...defaultSettings },
    slots: [],
    myId: 'me',
    isHost: true,
    isOnline: false,
    roomStarted: false,
    roomStatus: 'waiting',
    gameAttached: false,
    timerInterval: null,
    deadline: 0,
    db: null,
    auth: null,
    listeners: [],
    pendingPublicGame: null,
    pendingHand: null,
    enteredGame: false,
    actionListener: null,
    leaving: false,
  };

  function randomBotName() {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective} ${noun}`;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function notify(message) {
    if (window.TWA?.toast) window.TWA.toast(message);
    else console.info(message);
  }

  function firebaseConfigIsReady() {
    const config = window.FIREBASE_CONFIG;
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    return Boolean(config && required.every((key) =>
      typeof config[key] === 'string' &&
      config[key].trim() &&
      !config[key].includes('YOUR_')
    ));
  }

  async function connectFirebase() {
    if (!firebaseConfigIsReady()) return null;
    if (!window.firebase?.initializeApp || !window.firebase.firestore || !window.firebase.auth ||
        !window.FirebaseRoomStore) {
      throw new Error('Firebase Firestore SDK не завантажився. Перевірте підключення до мережі.');
    }

    if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = window.firebase.auth();
    const user = await window.getFirebaseUser();
    return { auth, user, db: window.FirebaseRoomStore };
  }

  function clearListeners() {
    state.listeners.forEach(({ reference, event, callback }) => reference.off(event, callback));
    state.listeners = [];
    if (state.actionListener) {
      state.actionListener.off();
      state.actionListener = null;
    }
  }

  function resetRoom() {
    clearListeners();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.roomCode = '';
    state.slots = [];
    state.db = null;
    state.auth = null;
    state.isOnline = false;
    state.roomStarted = false;
    state.roomStatus = 'waiting';
    state.gameAttached = false;
    state.pendingPublicGame = null;
    state.pendingHand = null;
    state.enteredGame = false;
    state.leaving = false;
  }

  function listen(reference, event, callback) {
    const failed = (error) => {
      console.error(`Firebase ${event} listener failed`, error);
      notify('Не вдалося отримати оновлення кімнати. Перевірте доступ Firebase.');
    };
    reference.on(event, callback, failed);
    state.listeners.push({ reference, event, callback });
  }

  function roomReference(path = '') {
    return state.db.ref(`rooms/${state.roomCode}${path ? `/${path}` : ''}`);
  }

  function renderSlots() {
    const container = $('durak-room-slots');
    if (!container) return;
    container.replaceChildren();

    state.slots.forEach((slot) => {
      const element = document.createElement('div');
      element.className = 'room-slot';
      if (slot.isHost) element.classList.add('host');
      if (slot.joined && slot.isReady) element.classList.add('ready');
      if (!slot.joined) element.classList.add('empty');

      const avatar = document.createElement('div');
      avatar.className = 'avatar-icon';
      const avatarFallback = slot.isHost ? '👑' : slot.isBot ? '🤖' : slot.joined ? '✅' : '＋';
      if (window.renderPlayerAvatar) window.renderPlayerAvatar(avatar, slot, avatarFallback);
      else avatar.textContent = avatarFallback;
      const label = document.createElement('span');
      label.textContent = slot.isHost
        ? slot.name || 'Господар'
        : slot.joined
          ? slot.name || 'Гравець'
          : 'Вільне місце';
      element.append(avatar, label);
      container.appendChild(element);
    });
  }

  function guests() {
    return state.slots.filter((slot) => !slot.isHost && slot.joined);
  }

  function canStart() {
    const joined = guests();
    return state.isHost && joined.length > 0 &&
      joined.every((slot) => slot.isBot || slot.isReady);
  }

  function renderControls() {
    const startButton = $('durak-room-ready');
    const addButton = $('durak-room-add-test');
    const inviteButton = $('durak-room-invite');
    const copyButton = $('durak-room-copy');
    if (startButton) {
      startButton.textContent = state.isHost ? 'Почати гру' : 'Готовий';
      startButton.disabled = state.roomStarted || (state.isHost && !canStart());
      startButton.classList.toggle('btn-primary', state.isHost);
    }
    if (addButton) {
      const hasEmptySlot = state.slots.some((slot) => !slot.joined && !slot.isHost);
      addButton.disabled = state.roomStarted || !state.isHost || !hasEmptySlot;
      addButton.textContent = hasEmptySlot ? '+ Додати тест-гравця' : 'Усі місця зайняті';
    }
    if (inviteButton) inviteButton.disabled = !state.isOnline || state.roomStarted;
    if (copyButton) copyButton.disabled = !state.isOnline || state.roomStarted;
  }

  function renderRoom() {
    const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    const timer = $('durak-room-badge-timer');
    if (timer) {
      timer.textContent = remaining > 0
        ? `Кімната активна ще ${formatTime(remaining)}`
        : 'Час кімнати вичерпано';
    }
    if (remaining === 0 && state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    const count = $('durak-room-count');
    if (count) count.textContent = `${state.slots.filter((slot) => slot.joined).length}/${state.settings.players}`;
    const mode = $('durak-room-mode');
    if (mode) mode.textContent = `${state.settings.mode} · ${state.settings.deck}`;
    const stake = $('durak-room-stake');
    if (stake) stake.textContent = `🪙 ${state.settings.stake}`;
    const bank = $('durak-room-bank-value');
    if (bank) bank.textContent = state.settings.stake * state.settings.players;
    const type = $('durak-room-badge-type');
    if (type) type.textContent = state.settings.roomType === 'Відкрита' ? '🌐 Відкрита' : '🔒 Закрита';

    const status = $('durak-room-status');
    if (status) {
      const readyCount = guests().filter((slot) => slot.isBot || slot.isReady).length;
      status.textContent = state.roomStarted
        ? 'Гра вже почалася'
        : !state.isOnline
          ? 'Локальна кімната · можна додати ботів'
          : canStart()
            ? 'Усі готові — можна починати'
            : `Очікуємо гравців · готові ${readyCount}/${guests().length || 1}`;
    }
    renderSlots();
    renderControls();
  }

  function roomLink() {
    return window.createRoomInviteUrl(state.roomCode);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(roomLink());
      notify('Посилання скопійовано!');
    } catch (error) {
      console.error('Unable to copy the room link', error);
      notify('Не вдалося скопіювати посилання');
    }
  }

  function openInvite() {
    const link = roomLink();
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Приєднуйся до гри в Дурак!')}`;
    if (typeof tg.openTelegramLink === 'function') {
      try {
        tg.openTelegramLink(shareUrl);
      } catch (error) {
        console.error('Unable to open the Telegram share link', error);
        void copyLink();
      }
    } else {
      void copyLink();
    }
  }

  function slotsFromSnapshot(value) {
    const slots = Array(state.settings.players).fill(null).map((_, position) => ({
      id: `empty-${position}`,
      name: '',
      position,
      isHost: false,
      isReady: false,
      isBot: false,
      joined: false,
    }));
    Object.entries(value || {}).forEach(([key, seat]) => {
      const position = Number(key);
      if (!seat || !Number.isInteger(position) || position < 0 || position >= slots.length) return;
      slots[position] = { ...seat, position, joined: true };
    });
    state.slots = slots;
  }

  function playerName() {
    return window.getCurrentPlayerProfile?.().name || tg.initDataUnsafe?.user?.first_name || 'Гравець';
  }

  function playerProfileFields() {
    const profile = window.getCurrentPlayerProfile?.() || {};
    return {
      telegramId: profile.telegramId || '',
      username: profile.username || '',
      photoUrl: profile.photoUrl || '',
    };
  }

  function gameOptions() {
    return {
      players: state.slots
        .filter((slot) => slot.joined)
        .map(({ id, name, isBot, telegramId, username, photoUrl }) => ({
          id, name, isBot, telegramId, username, photoUrl,
        })),
      localPlayerId: state.myId,
      deckSize: Number(state.settings.deck),
      mode: state.settings.mode,
      stake: state.settings.stake,
    };
  }

  function showGame() {
    if (!state.enteredGame) {
      state.enteredGame = true;
      showView('durak-table');
    }
  }

  async function persistGameState() {
    if (!state.isOnline || !state.isHost || !state.db) return;
    const publicGame = window.DurakMultiplayer.getPublicSnapshot();
    const hostState = window.DurakMultiplayer.exportState();
    if (!publicGame || !hostState) return;

    try {
      const updates = [
        roomReference('game/public').set(publicGame),
        roomReference('game/hostState').set(hostState),
      ];
      hostState.players.forEach((player) => {
        if (!player.isBot) {
          updates.push(roomReference(`game/hands/${player.id}`).set(player.hand));
        }
      });
      await Promise.all(updates);
      if (publicGame.gameOver && state.roomStatus === 'started') {
        await roomReference('meta/status').set('finished');
        state.roomStatus = 'finished';
      }
    } catch (error) {
      console.error('Unable to synchronize the Durak game', error);
      notify('Не вдалося синхронізувати гру. Перевірте правила Firebase та з’єднання.');
    }
  }

  function enqueueAction(action) {
    const reference = roomReference(`actions/${state.myId}`).push();
    reference.set({ ...action, createdAt: Date.now() }).catch((error) => {
      console.error('Unable to send the Durak action', error);
      notify('Не вдалося надіслати хід. Перевірте з’єднання.');
    });
  }

  function subscribeToActions() {
    if (state.actionListener) return;
    const actions = roomReference('actions');
    const callback = (snapshot) => {
      const action = snapshot.val();
      if (!action) return;
      const accepted = window.DurakMultiplayer.dispatchAction({
        ...action,
        playerId: snapshot.ref.parent.key,
      });
      if (!accepted) notify('Хід відхилено: стан гри вже змінився.');
      snapshot.ref.remove().catch((error) => {
        console.error('Unable to clear a processed Durak action', error);
      });
    };
    actions.on('child_added', callback, (error) => {
      console.error('Firebase action listener failed', error);
      notify('Не вдалося отримати ходи гравців. Перевірте правила Firebase.');
    });
    state.actionListener = { off: () => actions.off('child_added', callback) };
  }

  function enterOnlineGame() {
    if (state.gameAttached || !state.roomStarted) return;
    state.gameAttached = true;
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;

    if (state.isHost) {
      roomReference('game/hostState').once('value').then((snapshot) => {
        const saved = snapshot.val();
        const options = {
          onRematch: () => startGame(true),
        };
        if (saved && window.DurakMultiplayer.restoreState(saved, state.myId, persistGameState, options)) {
          subscribeToActions();
          showGame();
        } else {
          state.gameAttached = false;
          notify('Не вдалося відновити гру на хост-пристрої.');
        }
      }).catch((error) => {
        console.error('Unable to restore the host game', error);
        state.gameAttached = false;
        notify('Не вдалося відновити гру. Перевірте налаштування Firebase.');
      });
      return;
    }

    listen(roomReference('game/public'), 'value', (snapshot) => {
      const nextGame = snapshot.val();
      if (state.pendingPublicGame?.gameOver && nextGame && !nextGame.gameOver) {
        state.enteredGame = false;
      }
      state.pendingPublicGame = nextGame;
      applyRemoteGame();
    });
    listen(roomReference(`game/hands/${state.myId}`), 'value', (snapshot) => {
      state.pendingHand = snapshot.val() || [];
      applyRemoteGame();
    });
  }

  function applyRemoteGame() {
    if (!state.pendingPublicGame || !Array.isArray(state.pendingHand)) return;
    const localPlayer = state.pendingPublicGame.players.find((player) => player.id === state.myId);
    if (!localPlayer || state.pendingHand.length !== Number(localPlayer.cardCount)) return;
    const loaded = window.DurakMultiplayer.loadSnapshot(
      state.pendingPublicGame,
      state.myId,
      state.pendingHand,
      enqueueAction,
    );
    if (!loaded) {
      notify('Не вдалося завантажити гру. Перевір баланс монет для ставки.');
      return;
    }
    showGame();
  }

  function attachRoomListeners() {
    listen(roomReference('meta'), 'value', (snapshot) => {
      const meta = snapshot.val();
      if (!meta) {
        if (state.leaving) return;
        notify('Кімнату не знайдено або її вже закрито.');
        resetRoom();
        showView('durak');
        return;
      }
      if (meta.status === 'closed') {
        notify('Господар закрив кімнату.');
        resetRoom();
        showView('durak');
        return;
      }
      state.settings = { ...defaultSettings, ...(meta.settings || {}) };
      state.isHost = meta.hostId === state.myId;
      state.roomStatus = meta.status;
      state.roomStarted = meta.status !== 'waiting';
      state.deadline = Number(meta.deadline) || Date.now() + 30 * 60 * 1000;
      renderRoom();
      if (state.roomStatus === 'started' || state.roomStatus === 'finished') enterOnlineGame();
    });
    listen(roomReference('seats'), 'value', (snapshot) => {
      slotsFromSnapshot(snapshot.val());
      renderRoom();
    });
  }

  function randomRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const values = new Uint32Array(6);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
    else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 0xffffffff); });
    return `DURAK-${Array.from(values, (value) => alphabet[value % alphabet.length]).join('')}`;
  }

  function startGame(isRematch = false) {
    if (!canStart() || (state.roomStarted && !isRematch)) return;
    const options = gameOptions();
    try {
      if (state.isOnline) {
        options.onStateChange = persistGameState;
        options.onRematch = () => startGame(true);
        options.hostId = state.myId;
        options.isHost = true;
      }
      window.DurakMultiplayer.startGame(options);
      state.roomStarted = true;
      state.roomStatus = 'started';
      state.gameAttached = true;
      if (state.isOnline) {
        subscribeToActions();
        roomReference('meta/status').set('started').catch((error) => {
          console.error('Unable to start the Firebase room', error);
          notify('Не вдалося запустити кімнату.');
        });
      }
      if (state.timerInterval) clearInterval(state.timerInterval);
      state.timerInterval = null;
      if (window.TWA?.haptic) window.TWA.haptic();
      showGame();
    } catch (error) {
      console.error('Unable to start the Durak game', error);
      notify(error.message || 'Не вдалося запустити гру');
    }
  }

  async function init(settings = {}, isHost = true) {
    resetRoom();
    state.settings = {
      ...defaultSettings,
      ...settings,
      deck: Number(settings.deck) || defaultSettings.deck,
      players: Math.min(6, Math.max(2, Number(settings.players) || defaultSettings.players)),
      stake: Number(settings.stake) || defaultSettings.stake,
    };
    state.isHost = isHost;
    state.myId = 'me';
    state.roomCode = randomRoomCode();
    state.deadline = Date.now() + 30 * 60 * 1000;

    try {
      const backend = await connectFirebase();
      if (!backend) {
        state.slots = [{
          id: state.myId,
          name: playerName(),
          ...playerProfileFields(),
          isHost: true,
          isReady: true,
          isBot: false,
          joined: true,
        }];
        for (let index = 1; index < state.settings.players; index++) {
          state.slots.push({
            id: `player-${index}`,
            name: '',
            isHost: false,
            isReady: false,
            isBot: false,
            joined: false,
          });
        }
        bindControls();
        renderRoom();
        state.timerInterval = setInterval(renderRoom, 1000);
        return;
      }

      state.isOnline = true;
      state.db = backend.db;
      state.auth = backend.auth;
      state.myId = backend.user.uid;
      const hostSeat = {
        id: state.myId,
        name: playerName(),
        ...playerProfileFields(),
        position: 0,
        isHost: true,
        isReady: true,
        isBot: false,
        joined: true,
      };
      await roomReference('meta').set({
        hostId: state.myId,
        members: { [state.myId]: true },
        settings: state.settings,
        status: 'waiting',
        deadline: state.deadline,
      });
      await roomReference('seats/0').set(hostSeat);
      attachRoomListeners();
      bindControls();
      state.timerInterval = setInterval(renderRoom, 1000);
    } catch (error) {
      console.error('Unable to initialize the Durak room', error);
      resetRoom();
      throw error;
    }
  }

  async function joinRoom(roomCode) {
    resetRoom();
    try {
      const backend = await connectFirebase();
      if (!backend) {
        notify('Онлайн-кімнати потребують налаштованого Firebase. Швидка гра з ботами доступна локально.');
        return false;
      }
      state.db = backend.db;
      state.auth = backend.auth;
      state.myId = backend.user.uid;
      state.roomCode = roomCode.trim().toUpperCase();
      if (!/^DURAK-[A-Z0-9]{6}$/.test(state.roomCode)) {
        throw new Error('Код кімнати некоректний.');
      }

      const metaSnapshot = await roomReference('meta').once('value');
      const meta = metaSnapshot.val();
      if (!meta) throw new Error('Кімнату не знайдено або її вже закрито.');
      if (meta.status === 'closed') throw new Error('Господар закрив кімнату.');
      state.settings = { ...defaultSettings, ...(meta.settings || {}) };
      const seatsSnapshot = await roomReference('seats').once('value');
      const currentSeats = seatsSnapshot.val() || {};
      let seat = Object.values(currentSeats).find((item) => item?.id === state.myId);
      if (!seat) {
        if (meta.status !== 'waiting') throw new Error('Гра вже почалася — приєднатися більше не можна.');
        let assignedPosition = -1;
        const candidate = {
          id: state.myId,
          name: playerName(),
          ...playerProfileFields(),
          isHost: false,
          isReady: false,
          isBot: false,
          joined: true,
        };
        const result = await roomReference().transaction((room) => {
          assignedPosition = -1;
          if (!room || room.meta?.status !== 'waiting') return;
          room.seats ||= {};
          for (let position = 1; position < state.settings.players; position += 1) {
            if (room.seats[position]) continue;
            assignedPosition = position;
            room.seats[position] = { ...candidate, position };
            room.meta.members ||= {};
            room.meta.members[state.myId] = true;
            return room;
          }
        });
        if (result.committed && assignedPosition >= 0) {
          seat = result.snapshot.val()?.seats?.[assignedPosition];
        }
        if (!seat) throw new Error('У кімнаті немає вільних місць.');
      }
      state.isOnline = true;
      state.isHost = meta.hostId === state.myId;
      state.roomStatus = meta.status;
      state.roomStarted = meta.status !== 'waiting';
      state.deadline = Number(meta.deadline) || Date.now() + 30 * 60 * 1000;
      attachRoomListeners();
      bindControls();
      if (meta.status === 'started' || meta.status === 'finished') enterOnlineGame();
      else {
        state.timerInterval = setInterval(renderRoom, 1000);
        showView('durak-room');
      }
      return true;
    } catch (error) {
      console.error('Unable to join the Durak room', error);
      resetRoom();
      notify(error.message || 'Не вдалося приєднатися до кімнати');
      return false;
    }
  }

  async function addTestPlayer() {
    if (!state.isHost) return;
    const slot = state.slots.find((item) => !item.joined && !item.isHost);
    if (!slot) {
      notify('Вільних місць немає');
      return;
    }
    const botSeat = {
      id: `bot-${state.slots.indexOf(slot)}`,
      name: randomBotName(),
      position: state.slots.indexOf(slot),
      isHost: false,
      isReady: true,
      isBot: true,
      joined: true,
    };
    if (state.isOnline) {
      try {
        await roomReference(`seats/${botSeat.position}`).set(botSeat);
      } catch (error) {
        console.error('Unable to add a bot to the Firebase room', error);
        notify('Не вдалося додати бота.');
      }
      return;
    }
    Object.assign(slot, botSeat);
    if (window.TWA?.haptic) window.TWA.haptic();
    renderRoom();
  }

  async function toggleReady() {
    const ownSlot = state.slots.find((slot) => slot.id === state.myId);
    if (!ownSlot || ownSlot.isHost || ownSlot.isBot) return;
    const updated = { ...ownSlot, isReady: !ownSlot.isReady };
    if (state.isOnline) {
      try {
        await roomReference(`seats/${ownSlot.position}`).set(updated);
      } catch (error) {
        console.error('Unable to update room readiness', error);
        notify('Не вдалося оновити готовність.');
      }
      return;
    }
    Object.assign(ownSlot, updated);
    renderRoom();
  }

  async function leaveRoom() {
    if (state.isOnline && state.db) {
      if (!state.isHost && state.roomStatus === 'started') {
        notify('Під час гри вийти з кімнати не можна.');
        return;
      }
      state.leaving = true;
      try {
        if (state.isHost) await roomReference().remove();
        else {
          const position = ownPosition();
          if (!Number.isInteger(position)) throw new Error('Вас немає серед гравців кімнати.');
          await roomReference().transaction((room) => {
            if (room?.seats?.[position]?.id !== state.myId) return;
            delete room.seats[position];
            delete room.meta?.members?.[state.myId];
            return room;
          });
        }
      } catch (error) {
        state.leaving = false;
        console.error('Unable to leave the Durak room', error);
        notify('Не вдалося вийти з кімнати.');
        return;
      }
    }
    resetRoom();
    showView('durak');
  }

  function ownPosition() {
    return state.slots.find((slot) => slot.id === state.myId)?.position;
  }

  function bindControls() {
    const startButton = $('durak-room-ready');
    const addButton = $('durak-room-add-test');
    const inviteButton = $('durak-room-invite');
    const copyButton = $('durak-room-copy');
    const exitButton = $('durak-room-exit');

    if (startButton) startButton.onclick = state.isHost ? startGame : toggleReady;
    if (addButton) addButton.onclick = addTestPlayer;
    if (inviteButton) inviteButton.onclick = openInvite;
    if (copyButton) copyButton.onclick = () => { void copyLink(); };
    if (exitButton) exitButton.onclick = () => { void leaveRoom(); };
  }

  return {
    init,
    joinRoom,
    render: renderRoom,
    addTestPlayer,
    startGame,
    getRoomCode: () => state.roomCode,
  };
})();
