window.DurakRoom = (() => {
  const tg = window.Telegram?.WebApp || {};
  const $ = (id) => document.getElementById(id);
  const defaultSettings = { mode: 'Простий', deck: 36, players: 4, roomType: 'Закрита', stake: 10 };
  const vipReactions = new Set(['😈', '🤓', '🖕', '🤘']);
  const adjectives = ['Сміливий', 'Тихий', 'Веселий', 'Миткий'];
  const nouns = ['Лис', 'Ведмідь', 'Вовк', 'Орел'];
  let publicRoomsUnmount = null;
  let reactionTimer = null;
  let state = {
    roomCode: '',
    settings: { ...defaultSettings },
    slots: [],
    myId: 'me',
    isHost: true,
    joinPending: false,
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
    startingGame: false,
    isMovePending: false,
  };

  function randomBotName() {
    const npc = window.NpcSystem?.randomProfile?.();
    if (npc?.name) return npc.name.replace(/^Агент\s*/, '');
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

  function sameId(left, right) {
    return left != null && right != null && String(left) === String(right);
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

  function setActiveRoomId(roomId) {
    const id = roomId == null ? '' : String(roomId);
    const changed = String(window.activeRoomId || '') !== id;
    window.currentRoomId = id;
    window.activeRoomId = id;
    const gameContainer = $('durak-game');
    if (gameContainer) {
      if (id) gameContainer.dataset.roomId = id;
      else delete gameContainer.dataset.roomId;
    }
    if (changed) {
      window.dispatchEvent(new CustomEvent('activeDurakRoomChange', { detail: { roomId: id } }));
    }
  }

  function resetRoom() {
    clearListeners();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.roomCode = '';
    state.slots = [];
    state.roomMeta = null;
    state.startingGame = false;
    state.db = null;
    state.auth = null;
    state.isOnline = false;
    state.joinPending = false;
    state.roomStarted = false;
    state.roomStatus = 'waiting';
    state.gameAttached = false;
    state.pendingPublicGame = null;
    state.pendingHand = null;
    state.enteredGame = false;
    state.leaving = false;
    state.isMovePending = false;
    setActiveRoomId('');
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

  function roomDocumentReference() {
    return window.FirebaseRoomStore.ref(`rooms/${state.roomCode}`).documentReference();
  }

  function actionFieldPath(playerId, actionId) {
    return new window.firebase.firestore.FieldPath('actions', playerId, actionId);
  }

  async function updateAction(playerId, actionId, action) {
    await roomDocumentReference().update(actionFieldPath(playerId, actionId), action);
  }

  async function removeAction(playerId, actionId) {
    await roomDocumentReference().update(
      actionFieldPath(playerId, actionId),
      window.firebase.firestore.FieldValue.delete(),
    );
  }

  function renderSlots() {
    const container = $('durak-room-slots');
    if (!container) return;
    container.replaceChildren();

    state.slots.forEach((slot) => {
      const element = document.createElement('div');
      element.className = 'room-slot';
      if (slot.isHost) element.classList.add('host');
      if (slot.joined && (slot.isHost || slot.isReady)) element.classList.add('ready');
      if (!slot.joined) element.classList.add('empty');
      if (!slot.joined && state.joinPending) {
        element.classList.add('joinable');
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
        element.setAttribute('aria-label', 'Приєднатися до вільного місця');
        element.onclick = () => { void acceptRoomInvite(); };
        element.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void acceptRoomInvite();
          }
        };
      }

      const avatar = document.createElement('div');
      avatar.className = 'avatar-icon';
      const avatarFallback = slot.isHost ? '👑' : slot.avatar || (slot.isReady ? '✅' : slot.joined ? '👤' : '＋');
      if (window.renderPlayerAvatar) window.renderPlayerAvatar(avatar, slot, avatarFallback);
      else avatar.textContent = avatarFallback;
      const label = document.createElement('span');
      const playerLabel = slot.isHost
        ? slot.name || 'Господар'
        : slot.joined
          ? slot.name || 'Гравець'
          : 'Вільне місце';
      label.textContent = Number(slot.vipUntil || 0) > Date.now()
        ? `👑 ${playerLabel}`
        : playerLabel;
      element.append(avatar, label);
      container.appendChild(element);
    });
  }

  function guests() {
    return state.slots.filter((slot) => !slot.isHost && slot.joined);
  }

  function canStart() {
    const joined = state.slots.filter((slot) => slot.joined);
    return state.isHost && joined.length >= 2 &&
      joined.every((slot) => slot.isHost || slot.isBot || slot.isReady);
  }

  function renderControls() {
    const startButton = $('durak-room-ready');
    const joinButton = $('durak-room-join');
    const addButton = $('durak-room-add-test');
    const inviteButton = $('durak-room-invite');
    const copyButton = $('durak-room-copy');
    const telegramUser = tg.initDataUnsafe?.user;
    const currentUserId = telegramUser?.id == null ? state.myId : telegramUser.id;
    const hostSeat = state.slots.find((slot) =>
      String(slot.id) === String(state.roomMeta?.hostId));
    const creatorId = state.roomMeta?.creatorId ??
      (telegramUser?.id == null ? state.roomMeta?.hostId : hostSeat?.telegramId);
    const isHost = state.isOnline && state.roomMeta
      ? creatorId != null && String(currentUserId) === String(creatorId)
      : state.isHost;
    const isJoined = state.slots.some((slot) => slot.joined &&
      (telegramUser?.id == null
        ? String(slot.id) === String(state.myId)
        : String(slot.telegramId) === String(telegramUser.id)));
    const isJoinPending = state.isOnline && !isHost && !isJoined;
    const ownSeat = state.slots.find((slot) => String(slot.id) === String(state.myId));
    state.isHost = isHost;
    state.joinPending = isJoinPending;
    if (startButton) {
      startButton.textContent = isHost
        ? 'Почати гру'
        : ownSeat?.isReady ? 'Не готовий ❌' : 'Готово ✅';
      const canHostStart = isHost && canStart();
      startButton.disabled = state.roomStarted || (isHost && !canHostStart);
      startButton.classList.toggle('btn-ready', !isHost || canHostStart);
      startButton.classList.toggle('btn-primary', canHostStart);
      startButton.hidden = isJoinPending || (!isHost && !isJoined);
    }
    if (joinButton) {
      const emptySeat = state.slots.some((slot) => !slot.joined && !slot.isHost);
      joinButton.hidden = !isJoinPending;
      joinButton.disabled = state.roomStarted || !emptySeat;
      joinButton.textContent = `Приєднатися до столу (ставка: ${state.settings.stake} 🪙)`;
    }
    if (addButton) {
      const hasEmptySlot = state.slots.some((slot) => !slot.joined && !slot.isHost);
      addButton.disabled = state.roomStarted || !state.isHost || !hasEmptySlot;
      addButton.textContent = hasEmptySlot ? 'Додати суперника' : 'Усі місця зайняті';
      addButton.hidden = !isHost || !hasEmptySlot;
    }
    if (inviteButton) {
      inviteButton.disabled = !state.isOnline || state.roomStarted;
      inviteButton.hidden = !isHost;
    }
    if (copyButton) {
      copyButton.disabled = !state.isOnline || state.roomStarted;
      copyButton.hidden = !isHost;
    }
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
    if (stake) stake.textContent = `🪙 ${Math.round(Number(state.settings.stake) || 0)}`;
    const bank = $('durak-room-bank-value');
    const roomBank = Number(state.roomMeta?.bank);
    if (bank) bank.textContent = Number.isFinite(roomBank)
      ? Math.round(roomBank)
      : Math.round(state.settings.stake * state.slots.filter((slot) => slot.joined).length);
    const type = $('durak-room-badge-type');
    if (type) type.textContent = state.settings.roomType === 'Відкрита' ? '🌐 Відкрита' : '🔒 Закрита';

    renderControls();
    const status = $('durak-room-status');
    if (status) {
      const joined = state.slots.filter((slot) => slot.joined);
      const readyCount = joined.filter((slot) => slot.isHost || slot.isBot || slot.isReady).length;
      status.textContent = state.roomStarted
        ? 'Гра вже почалася'
        : state.joinPending
          ? 'Приєднайтеся, щоб зайняти вільне місце.'
          : !state.isHost
            ? 'Очікування початку гри...'
        : !state.isOnline
          ? 'Локальна кімната · можна додати ботів'
          : canStart()
            ? 'Усі готові — можна починати'
            : `Очікуємо готовності · готові ${readyCount}/${joined.length}`;
    }
    renderSlots();
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
    if (state.isOnline && state.joinPending) {
      const profile = window.getCurrentPlayerProfile?.() || {};
      const ownSeat = slots.find((slot) => slot.joined && (
        sameId(slot.id, state.myId) ||
        (profile.telegramId && sameId(slot.telegramId, profile.telegramId))
      ));
      if (ownSeat) {
        state.myId = ownSeat.id;
        state.joinPending = false;
      }
    }
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
      activeSkin: profile.activeSkin || 'classic-red',
      vipUntil: Number(profile.vipUntil) || 0,
      agentRank: Number(profile.upgrades?.rank) || 0,
    };
  }

  function gameOptions() {
    const currentProfile = window.getCurrentPlayerProfile?.() || {};
    return {
      players: state.slots
        .filter((slot) => slot.joined)
        .map((slot) => {
          const ownProfile = sameId(slot.id, state.myId) ? currentProfile : {};
          return {
            id: slot.id,
            name: slot.name,
            isBot: slot.isBot,
            telegramId: slot.telegramId,
            username: slot.username,
            photoUrl: slot.photoUrl,
            activeSkin: ownProfile.activeSkin || slot.activeSkin || 'classic-red',
            vipUntil: Number(ownProfile.vipUntil ?? slot.vipUntil) || 0,
            agentRank: Number(ownProfile.upgrades?.rank ?? slot.agentRank) || 0,
          };
        }),
      localPlayerId: state.myId,
      deckSize: Number(state.settings.deck),
      mode: state.settings.mode,
      stake: state.settings.stake,
      matchId: `${state.roomCode}-${Date.now()}`,
      isOnline: state.isOnline,
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
      const hands = {};
      hostState.players.forEach((player) => {
        if (!player.isBot) {
          hands[player.id] = player.hand;
        }
      });
      const updates = {
        game: { public: publicGame, hostState, hands },
      };
      if (publicGame.gameOver && state.roomStatus === 'playing') {
        updates['meta.status'] = 'finished';
      }
      await roomDocumentReference().update(updates);
      if (updates['meta.status'] === 'finished') {
        state.roomStatus = 'finished';
      }
      return true;
    } catch (error) {
      console.error('Unable to synchronize the Durak game', error);
      return false;
    }
  }

  async function enqueueAction(action) {
    if (!state.isOnline || state.isMovePending) return false;
    state.isMovePending = true;
    window.DurakMultiplayer.setMovePending(true);
    const reference = roomReference(`actions/${state.myId}`).push();
    const playerId = String(state.myId);
    const actionId = String(reference.key);
    let acknowledgementListener;
    let timeout;
    try {
      const acknowledgement = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Час очікування підтвердження ходу вичерпано.')), 10000);
        acknowledgementListener = (snapshot) => {
          const result = snapshot.val();
          if (result?.processed === true) resolve(Boolean(result.accepted));
        };
        reference.on('value', acknowledgementListener, reject);
      });
      await updateAction(playerId, actionId, { ...action, createdAt: Date.now() });
      const accepted = await acknowledgement;
      return accepted;
    } catch (error) {
      console.error('Unable to send the Durak action', error);
      return false;
    } finally {
      clearTimeout(timeout);
      if (acknowledgementListener) reference.off('value', acknowledgementListener);
      state.isMovePending = false;
      window.DurakMultiplayer.setMovePending(false);
      try {
        await removeAction(playerId, actionId);
      } catch (error) {
        console.error('Unable to remove the processed Durak action', error);
      }
    }
  }

  function subscribeToActions() {
    if (state.actionListener) return;
    const actions = roomReference('actions');
    const callback = async (snapshot) => {
      const action = snapshot.val();
      if (!action) return;
      const playerId = String(snapshot.ref.parent.key);
      const actionId = String(snapshot.key);
      try {
        const accepted = await window.DurakMultiplayer.dispatchAction({
          ...action,
          playerId,
        });
        await updateAction(playerId, actionId, { ...action, processed: true, accepted });
      } catch (error) {
        console.error('Unable to process a Durak action', error);
        try {
          await updateAction(playerId, actionId, { ...action, processed: true, accepted: false });
        } catch (acknowledgementError) {
          console.error('Unable to acknowledge the Durak action', acknowledgementError);
        }
      }
    };
    actions.on('child_added', callback, (error) => {
      console.error('Firebase action listener failed', error);
      notify('Не вдалося отримати ходи гравців. Перевірте правила Firebase.');
    });
    state.actionListener = { off: () => actions.off('child_added', callback) };
  }

  function showLocalReaction(emoji, output) {
    output.textContent = emoji;
    output.classList.remove('visible');
    void output.offsetWidth;
    output.classList.add('visible');
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => {
      output.textContent = '';
      output.classList.remove('visible');
      reactionTimer = null;
    }, 1600);
  }

  function bindReactionControls() {
    const panel = $('durak-mp-reactions');
    const output = $('durak-mp-reaction-output');
    if (!panel || !output || panel.dataset.roomReactionBound) return;

    panel.dataset.roomReactionBound = 'true';
    panel.addEventListener('click', async (event) => {
      const button = event.target.closest?.('[data-emoji]');
      if (!button || !panel.contains(button)) return;
      const emoji = button.dataset.emoji;
      if (vipReactions.has(emoji) &&
          !(Number(window.APP_STATE?.vipUntil || 0) > Date.now())) {
        notify('Доступно лише з 👑 VIP-статусом');
        return;
      }

      const menu = $('durak-mp-reaction-menu');
      if (menu) menu.hidden = true;
      $('durak-mp-reaction-toggle')?.setAttribute('aria-expanded', 'false');

      const roomId = state.isOnline ? String(state.roomCode) : '';
      if (!roomId) {
        showLocalReaction(emoji, output);
        return;
      }
      setActiveRoomId(roomId);
      const currentUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const profile = window.getCurrentPlayerProfile?.() || {};
      const myId = [currentUser?.id, profile.telegramId, state.myId]
        .find((candidate) => candidate != null && String(candidate).trim() !== '');
      const myName = profile.name || currentUser?.first_name || 'Гравець';
      if (myId == null) {
        console.error('Unable to share a Durak reaction without a player ID.');
        notify('Не вдалося визначити ваш ID для реакції.');
        return;
      }
      try {
        const roomRef = window.FirebaseRoomStore.ref(`rooms/${roomId}`).documentReference();
        await roomRef.set({
          lastReaction: {
            emoji,
            senderId: String(myId),
            senderName: String(myName),
            nonce: `${Date.now()}_${Math.random()}`,
            ts: Date.now(),
          },
        }, { merge: true });
        console.log('Sent reaction:', roomId, emoji);
        showLocalReaction(emoji, output);
        window.DurakMultiplayer?.showReaction(String(myId), emoji, String(myName));
      } catch (error) {
        console.error('Unable to share a Durak reaction', error);
        notify('Не вдалося надіслати реакцію.');
      }
    });
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
    const remoteGame = state.pendingPublicGame;
    const tablePairs = remoteGame.tablePairs ?? remoteGame.table ?? remoteGame.tableCards;
    const publicGame = {
      ...remoteGame,
      tablePairs: Array.isArray(tablePairs) ? tablePairs : [],
    };
    const localPlayer = publicGame.players.find((player) =>
      sameId(player.id, state.myId));
    if (!localPlayer || state.pendingHand.length !== Number(localPlayer.cardCount)) return;
    const loaded = window.DurakMultiplayer.loadSnapshot(
      publicGame,
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
      state.settings = {
        ...defaultSettings,
        ...(meta.settings || {}),
        stake: Math.round(Number(meta.settings?.stake) || defaultSettings.stake),
      };
      state.roomMeta = meta;
      state.isHost = String(meta.hostId) === String(state.myId);
      state.roomStatus = meta.status;
      state.roomStarted = meta.status === 'playing' || meta.status === 'started' || meta.status === 'finished';
      state.deadline = Number(meta.deadline) || Date.now() + 30 * 60 * 1000;
      renderRoom();
      if ((state.roomStatus === 'playing' || state.roomStatus === 'started' || state.roomStatus === 'finished') &&
          !state.startingGame) enterOnlineGame();
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

  async function startGame(isRematch = false) {
    if (!canStart() || (state.roomStarted && !isRematch)) return;
    const options = gameOptions();
    try {
      if (state.isOnline) {
        const balance = await window.refreshCurrentUserBalance();
        if (balance < state.settings.stake) {
          notify('Недостатньо монет для ставки 🪙');
          return;
        }
        state.startingGame = true;
        const result = await roomReference().transaction((room) => {
          if (!room || String(room.meta?.hostId) !== String(state.myId) ||
              (room.meta?.status !== 'waiting' && !isRematch)) return;
          const seats = Object.values(room.seats || {}).filter((seat) => seat?.joined);
          if (seats.length < 2 || !seats.every((seat) => seat.isBot || seat.isReady)) return;
          room.meta.status = 'playing';
          return room;
        });
        if (!result.committed) {
          state.startingGame = false;
          notify('Почати можна, коли за столом є щонайменше два готові гравці.');
          return;
        }
        options.onStateChange = persistGameState;
        options.onRematch = () => startGame(true);
        options.hostId = state.myId;
        options.isHost = true;
      }
      window.DurakMultiplayer.startGame(options);
      state.startingGame = false;
      state.roomStarted = true;
      state.roomStatus = 'playing';
      state.gameAttached = true;
      if (state.isOnline) {
        subscribeToActions();
        await persistGameState();
      }
      if (state.timerInterval) clearInterval(state.timerInterval);
      state.timerInterval = null;
      if (window.TWA?.haptic) window.TWA.haptic();
      showGame();
    } catch (error) {
      state.startingGame = false;
      console.error('Unable to start the Durak game', error);
      notify(error.message || 'Не вдалося запустити гру');
    }
  }

  async function init(settings = {}, isHost = true) {
    if (window.isAccountBanned?.()) {
      notify('⛔ Ваш акаунт заблоковано адміністратором');
      return false;
    }
    resetRoom();
    state.settings = {
      ...defaultSettings,
      ...settings,
      deck: Number(settings.deck) || defaultSettings.deck,
      players: Math.min(6, Math.max(2, Number(settings.players) || defaultSettings.players)),
      stake: Math.round(Number(settings.stake) || defaultSettings.stake),
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
          avatar: (playerName()[0] || 'Г').toUpperCase(),
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
      setActiveRoomId(state.roomCode);
      const hostSeat = {
        id: state.myId,
        name: playerName(),
        avatar: (playerName()[0] || 'Г').toUpperCase(),
        ...playerProfileFields(),
        position: 0,
        isHost: true,
        isReady: true,
        isBot: false,
        joined: true,
      };
      const creatorId = hostSeat.telegramId || state.myId;
      await roomReference('meta').set({
        hostId: state.myId,
        creatorId,
        hostName: playerName(),
        members: { [state.myId]: true },
        settings: state.settings,
        status: 'waiting',
        isPublic: state.settings.roomType === 'Відкрита',
        bank: state.settings.stake,
        createdAt: Date.now(),
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
    if (window.isAccountBanned?.()) {
      notify('⛔ Ваш акаунт заблоковано адміністратором');
      return false;
    }
    resetRoom();
    try {
      const backend = await connectFirebase();
      if (!backend) {
        notify('Не вдалося підключитися до онлайн-кімнат. Перевірте з’єднання.');
        return false;
      }
      state.db = backend.db;
      state.auth = backend.auth;
      state.myId = backend.user.uid;
      state.roomCode = roomCode.trim().toUpperCase();
      if (!/^DURAK-[A-Z0-9]{6}$/.test(state.roomCode)) {
        throw new Error('Код кімнати некоректний.');
      }
      setActiveRoomId(state.roomCode);

      const metaSnapshot = await roomReference('meta').once('value');
      const meta = metaSnapshot.val();
      if (!meta) throw new Error('Кімнату не знайдено або її вже закрито.');
      if (meta.status === 'closed') throw new Error('Господар закрив кімнату.');
      state.settings = {
        ...defaultSettings,
        ...(meta.settings || {}),
        stake: Math.round(Number(meta.settings?.stake) || defaultSettings.stake),
      };
      const seatsSnapshot = await roomReference('seats').once('value');
      const currentSeats = seatsSnapshot.val() || {};
      const profile = window.getCurrentPlayerProfile?.() || {};
      let seat = Object.values(currentSeats).find((item) => sameId(item?.id, state.myId) ||
        (profile.telegramId && sameId(item?.telegramId, profile.telegramId)));
      if (seat) state.myId = seat.id;
      state.joinPending = !seat;
      if (!seat) {
        if (meta.status !== 'waiting') throw new Error('Гра вже почалася — приєднатися більше не можна.');
      }
      slotsFromSnapshot(currentSeats);
      state.isOnline = true;
      state.isHost = String(meta.hostId) === String(state.myId);
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

  async function acceptRoomInvite() {
    if (window.isAccountBanned?.()) {
      notify('⛔ Ваш акаунт заблоковано адміністратором');
      return false;
    }
    if (!state.isOnline || !state.joinPending || state.roomStarted) return;
    const profile = window.getCurrentPlayerProfile?.() || {};
    const candidate = {
      id: state.myId,
      telegramId: profile.telegramId || '',
      name: playerName(),
      avatar: (playerName()[0] || 'Г').toUpperCase(),
      ...playerProfileFields(),
      isHost: false,
      isReady: false,
      isBot: false,
      joined: true,
    };
    try {
      const result = await window.joinRoomWithStake(
        `rooms/${state.roomCode}`,
        state.roomCode,
        state.settings.stake,
        (room) => {
          if (!room || room.meta?.status !== 'waiting') {
            return { error: 'Гра вже почалася — приєднатися більше не можна.' };
          }
          room.seats ||= {};
          const existingSeat = Object.values(room.seats).find((seat) => sameId(seat?.id, state.myId) ||
            (profile.telegramId && sameId(seat?.telegramId, profile.telegramId)));
          if (existingSeat) return { alreadyJoined: true };
          for (let position = 1; position < state.settings.players; position += 1) {
            if (room.seats[position]) continue;
            room.seats[position] = { ...candidate, position };
            room.meta.members ||= {};
            room.meta.members[state.myId] = true;
            room.meta.bank = Math.round(
              (Number(room.meta.bank) || state.settings.stake) + state.settings.stake,
            );
            return { room };
          }
          return { error: 'У кімнаті немає вільних місць.' };
        },
      );
      const joinedSeat = Object.values(result.room?.seats || {}).find((seat) =>
        sameId(seat?.id, state.myId) ||
        (profile.telegramId && sameId(seat?.telegramId, profile.telegramId)));
      if (!joinedSeat) throw new Error('Не вдалося знайти ваше місце за столом.');
      state.myId = joinedSeat.id;
      state.joinPending = false;
      slotsFromSnapshot(result.room.seats);
      renderRoom();
      if (window.TWA?.haptic) window.TWA.haptic();
    } catch (error) {
      console.error('Unable to join the invited Durak room', error);
      notify(error.message || 'Не вдалося приєднатися до кімнати.');
    }
  }

  async function addTestPlayer() {
    if (!state.isHost) return;
    const slot = state.slots.find((item) => !item.joined && !item.isHost);
    if (!slot) {
      notify('Вільних місць немає');
      return;
    }
    const profile = window.NpcSystem?.randomProfile?.();
    const botSeat = {
      id: `bot-${state.slots.indexOf(slot)}`,
      name: profile?.name || randomBotName(),
      avatar: profile?.avatar || '',
      position: state.slots.indexOf(slot),
      isHost: false,
      isReady: true,
      isBot: true,
      joined: true,
    };
    if (state.isOnline) {
      try {
        const result = await roomReference().transaction((room) => {
          if (!room || String(room.meta?.hostId) !== String(state.myId) || room.meta?.status !== 'waiting' ||
              room.seats?.[botSeat.position]) return;
          room.seats[botSeat.position] = botSeat;
          room.meta.bank = Math.round(
            (Number(room.meta.bank) || state.settings.stake) + state.settings.stake,
          );
          return room;
        });
        if (!result.committed) notify('Вільних місць немає або стіл уже почався.');
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
    const ownSlot = state.slots.find((slot) => sameId(slot.id, state.myId));
    if (!ownSlot || ownSlot.isBot) return;
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
      if (!state.isHost && (state.roomStatus === 'started' || state.roomStatus === 'playing')) {
        notify('Під час гри вийти з кімнати не можна.');
        return;
      }
      state.leaving = true;
      try {
        if (state.isHost) await roomReference().remove();
        else {
          const position = ownPosition();
          if (Number.isInteger(position)) {
            const removeSeat = (room) => {
              if (!sameId(room?.seats?.[position]?.id, state.myId)) return;
              delete room.seats[position];
              delete room.meta?.members?.[state.myId];
              room.meta.bank = Math.round(
                Math.max(0, (Number(room.meta.bank) || 0) - state.settings.stake),
              );
              return { room };
            };
            if (window.leaveRoomWithRefund) {
              await window.leaveRoomWithRefund(`rooms/${state.roomCode}`, state.roomCode, state.settings.stake, removeSeat);
            } else {
              await roomReference().transaction((room) => removeSeat(room)?.room);
            }
          } else if (!state.joinPending) {
            throw new Error('Вас немає серед гравців кімнати.');
          }
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
    return state.slots.find((slot) => sameId(slot.id, state.myId))?.position;
  }

  window.addEventListener('usershopprofilechange', (event) => {
    if (!state.isOnline || !state.roomCode) return;
    const position = ownPosition();
    const ownSlot = state.slots.find((slot) => sameId(slot.id, state.myId));
    if (!Number.isInteger(position) || !ownSlot) return;
    const { activeSkin, vipUntil } = event.detail;
    if (ownSlot.activeSkin === activeSkin && Number(ownSlot.vipUntil) === Number(vipUntil)) return;
    void roomReference(`seats/${position}`).update({ activeSkin, vipUntil }).catch((error) => {
      console.error('Unable to synchronize the player shop profile to the Durak room.', error);
      notify('Не вдалося оновити скін або VIP за ігровим столом.');
    });

    window.addEventListener('userupgradeschange', (event) => {
      if (!state.isOnline || !state.roomCode) return;
      const position = ownPosition();
      const ownSlot = state.slots.find((slot) => sameId(slot.id, state.myId));
      if (!Number.isInteger(position) || !ownSlot) return;
      const agentRank = Number(event.detail?.upgrades?.rank) || 0;
      if (Number(ownSlot.agentRank) === agentRank) return;
      void roomReference(`seats/${position}`).update({ agentRank }).catch((error) => {
        console.error('Unable to synchronize the player rank to the Durak room.', error);
        notify('Не вдалося оновити звання за ігровим столом.');
      });
    });
  });

  function bindControls() {
    const startButton = $('durak-room-ready');
    const joinButton = $('durak-room-join');
    const addButton = $('durak-room-add-test');
    const inviteButton = $('durak-room-invite');
    const copyButton = $('durak-room-copy');
    const exitButton = $('durak-room-exit');

    if (startButton) {
      startButton.onclick = () => {
        if (state.isHost) void startGame();
        else void toggleReady();
      };
    }
    if (joinButton) joinButton.onclick = () => { void acceptRoomInvite(); };
    if (addButton) addButton.onclick = addTestPlayer;
    if (inviteButton) inviteButton.onclick = openInvite;
    if (copyButton) copyButton.onclick = () => { void copyLink(); };
    if (exitButton) exitButton.onclick = () => { void leaveRoom(); };
  }

  function mountPublicRooms() {
    publicRoomsUnmount?.();
    const container = $('durak-open-room-list');
    if (container && window.PublicRooms) {
      publicRoomsUnmount = window.PublicRooms.mount(container, (game, roomCode, room) =>
        room?.isNpc
          ? window.startNpcRoom(room)
          : window.openPublicRoom(game, roomCode), 'durak');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    mountPublicRooms();
    bindReactionControls();
  });

  return {
    init,
    joinRoom,
    render: renderRoom,
    addTestPlayer,
    acceptRoomInvite,
    mountPublicRooms,
    startGame,
    getRoomCode: () => state.isOnline ? state.roomCode : '',
  };
})();
