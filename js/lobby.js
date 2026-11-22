/* ==== ЛОБІ СТОЛУ (кімната очікування) ==== */
window.Lobby = (() => {
  const tg = window.Telegram.WebApp;
  const $ = (id) => document.getElementById(id);
  const C = {
    ADJECTIVES: ['Сміливий', 'Тихий', 'Злий', 'Веселий', 'Миткий'],
    NOUNS: ['Лис', 'Ведмідь', 'Вовк', 'Орел', 'Тигр'],
  };

  let state = {
    roomCode: '',
    settings: { mode: 'Дурак', deck: 36, players: 4, roomType: 'Приватна', stake: 10 },
    slots: [],
    myId: 'me',
    isHost: false,
    fromLink: false,
    linkData: null,
  };

  function randName() {
    const a = C.ADJECTIVES[Math.floor(Math.random() * C.ADJECTIVES.length)];
    const n = C.NOUNS[Math.floor(Math.random() * C.NOUNS.length)];
    return `${a} ${n}`;
  }
  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
  function inviteLink() {
    const bot = tg.bot_username || 'your_game_bot';
    return `https://t.me/${bot}?start=${state.roomCode}`;
  }
  function toastCopy() {
    try {
      navigator.clipboard.writeText(inviteLink());
      window.TWA.toast('Посилання скопійовано!');
    } catch (e) {
      window.TWA.toast('Не вдалося скопіювати');
    }
  }
  function sendInvite() {
    const text = `Приєднуйся до моєї гри в Ігровому центрі!\nКод:${state.roomCode}\n${inviteLink()}`;
    const link = `https://t.me/share/url?url=${encodeURIComponent(inviteLink())}&text=${encodeURIComponent(text)}`;
    if (tg.openTelegramLink) { try { tg.openTelegramLink(link); return; } catch (e) {} }
    if (tg.openLink) { tg.openLink(link); return; }
    window.TWA.toast('Не вдалося відкрити чат');
  }
    function render() {
    $('#lobby-room-code').textContent = state.roomCode;
    $('#lobby-invite-link').textContent = inviteLink();
    const grid = $('#lobby-slots-grid');
    grid.innerHTML = '';
    state.slots.forEach((slot) => {
      const div = document.createElement('div');
      div.className = 'slot' + (slot.isHost ? ' host' : '');
      let statusHtml = '';
      if (slot.isHost) {
        statusHtml = '<span class="slot-status status-host">Господар</span>';
      } else if (!slot.joined) {
        statusHtml = '<span class="slot-status status-empty">Очікування гравця...</span>';
      } else if (slot.isReady) {
        statusHtml = '<span class="slot-status status-ready">Готово ✅</span>';
      } else {
        statusHtml = '<span class="slot-status status-notready">Не готовий ⏳</span>';
      }
      const crown = slot.isHost ? '<span class="slot-crown">👑</span>' : '';
      const name = slot.isHost ? 'Господар столу (ти)' : (slot.joined ? slot.name : '—');
      div.innerHTML = `${crown}<div class="slot-body"><div class="slot-name">${name}</div>${statusHtml}</div>`;
      grid.appendChild(div);
    });
    renderFooter();
  }
  function allGuestsReady() {
    const guests = state.slots.filter((s) => !s.isHost && s.joined);
    return guests.length > 0 && guests.every((s) => s.isBot || s.isReady);
  }
  function renderFooter() {
    const f = $('#lobby-footer');
    f.innerHTML = '';
    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.textContent = label;
      b.disabled = cls.includes('disabled');
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    const mySlot = state.slots.find((s) => s.id === state.myId);
    const amGuest = mySlot && !mySlot.isHost && mySlot.joined;
    if (state.isHost) {
      const hasEmpty = state.slots.some((s) => !s.joined && !s.isHost);
      f.appendChild(btn(hasEmpty ? '+ Додати бота-гравця' : 'Слоти заповнені', hasEmpty ? '' : 'disabled', addBot));
      f.appendChild(document.createElement('hr'));
      const canStart = allGuestsReady();
      f.appendChild(btn('Почати гру', canStart ? 'primary' : 'primary disabled', startGame));
      if (!canStart) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:#888;text-align:center;margin-top:6px;';
        hint.textContent = 'Очікуйте готовності усіх гостей ⏳';
        f.appendChild(hint);
      }
    } else if (amGuest) {
      f.appendChild(btn(mySlot.isReady ? 'Скасувати готовність' : 'Готово', mySlot.isReady ? 'primary' : '', toggleMyReady));
    }
    f.appendChild(btn('Вийти з кімнати', '', () => { showView('home'); }));
  }
  function toggleMyReady() {
    const slot = state.slots.find((s) => s.id === state.myId);
    if (!slot || slot.isHost || !slot.joined) return;
    slot.isReady = !slot.isReady;
    window.TWA.haptic();
    render();
  }
  function addBot() {
    const empty = state.slots.findIndex((s) => !s.isHost && !s.joined);
    if (empty === -1) return;
    state.slots[empty] = { id: 'bot-' + empty, name: randName(), isHost: false, isReady: true, isBot: true, joined: true };
    window.TWA.haptic();
    render();
  }
  function startGame() {
    if (!allGuestsReady()) return;
    const players = state.slots
      .filter((slot) => slot.joined)
      .map((slot) => ({
        id: slot.id,
        name: slot.name || 'Гравець',
        isBot: Boolean(slot.isBot),
      }));
    if (players.length < 2) {
      window.TWA.toast('Для гри потрібен ще хоча б один гравець або бот');
      return;
    }
    if (players.some((player) => !player.isBot && player.id !== state.myId)) {
      window.TWA.toast('Локальна гра зараз доступна з ботами; онлайн-режим буде підключено окремо');
      return;
    }

    window.TWA.haptic();
    try {
      window.DurakMultiplayer.startGame({
        players,
        localPlayerId: state.myId,
        deckSize: Number(state.settings.deck) || 36,
        mode: state.settings.mode,
        stake: state.settings.stake,
      });
      showView('durak-table');
    } catch (error) {
      console.error('Unable to start Durak game', error);
      window.TWA.toast(error.message);
    }
  }
    function showJoinModal(data) {
    state.linkData = data;
    const body = $('#lobby-join-body');
    const stakeSpan = $('#lobby-join-stake');
    stakeSpan.textContent = (data && data.stake) || state.settings.stake;
    body.innerHTML = `
      <div class="kv"><span class="k">Режим</span><span class="v">${(data && data.mode) || state.settings.mode}</span></div>
      <div class="kv"><span class="k">Колода</span><span class="v">${(data && data.deck) || state.settings.deck}</span></div>
      <div class="kv"><span class="k">Гравців</span><span class="v">${(data && data.players) || state.settings.players}</span></div>
      <div class="kv"><span class="k">Тип кімнати</span><span class="v">${(data && data.roomType) || state.settings.roomType}</span></div>
      <div class="kv"><span class="k">Ставка</span><span class="v">${(data && data.stake) || state.settings.stake} 🪙</span></div>
    `;
    $('#lobby-join-modal').classList.add('open');
  }
  function hideJoinModal() { $('#lobby-join-modal').classList.remove('open'); }
  function confirmJoin() {
    if (!state.linkData) { hideJoinModal(); return; }
    const settings = state.linkData;
    const empty = state.slots.findIndex((s) => !s.isHost && !s.joined);
    if (empty === -1) {
      window.TWA.toast('Стол заповнений');
      hideJoinModal();
      return;
    }
    const guestId = 'guest-' + Date.now();
    state.slots[empty] = { id: guestId, name: randName(), isHost: false, isReady: false, isBot: false, joined: true };
    state.myId = guestId;
    state.isHost = false;
    hideJoinModal();
    window.TWA.toast('Ви приєдналися до столу');
    render();
  }
    function init(settings, fromLinkParam, linkData) {
    state.settings = settings || { mode: 'Дурак', deck: 36, players: 4, roomType: 'Приватна', stake: 10 };
    state.roomCode = generateCode();
    state.fromLink = !!fromLinkParam;
    state.linkData = linkData || null;
    const n = Math.min(Math.max(state.settings.players || 4, 2), 6);
    state.slots = [];
    state.slots.push({ id: state.myId, name: 'Господар столу (ти)', isHost: true, isReady: true, isBot: false, joined: true });
    for (let i = 1; i < n; i++) state.slots.push({ id: null, name: '', isHost: false, isReady: false, isBot: false, joined: false });
    state.isHost = !state.fromLink;
    render();
    if (state.fromLink && state.linkData) {
      setTimeout(() => showJoinModal(state.linkData), 300);
    }
    $('#lobby-copy-link').addEventListener('click', (e) => { e.stopPropagation(); toastCopy(); });
    $('#lobby-send-invite').addEventListener('click', (e) => { e.stopPropagation(); sendInvite(); });
    $('#lobby-join-cancel').addEventListener('click', (e) => { e.stopPropagation(); hideJoinModal(); });
    $('#lobby-join-confirm').addEventListener('click', (e) => { e.stopPropagation(); confirmJoin(); });
    $('#lobby-join-modal').addEventListener('click', (e) => { if (e.target.id === 'lobby-join-modal') hideJoinModal(); });
  }
  return { init, render, toggleMyReady, addBot, startGame, showJoinModal, hideJoinModal, confirmJoin, hasRoom: () => Boolean(state.roomCode) };
})();