(function () {
  let lastShownTs = 0;

  function getCurrentUserId() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser?.id) return String(tgUser.id);
    const saved = localStorage.getItem('tg_user_id') || localStorage.getItem('playerId');
    return saved ? String(saved) : '';
  }

  function getActiveRoomId() {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (startParam.startsWith('room_')) return startParam.replace('room_', '');
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('room')) return urlParams.get('room');
    if (window.currentRoomId) return String(window.currentRoomId);
    if (window.activeRoomId) return String(window.activeRoomId);
    const codeEl = document.querySelector('#room-invite-code, [data-room-id]');
    if (codeEl) {
      const val = codeEl.dataset?.roomId || codeEl.textContent?.trim();
      if (val && val.length >= 4 && val.length <= 40) return val;
    }
    return '';
  }

  function spawnFloatingEmoji(emoji, isSelf) {
    const bubble = document.createElement('div');
    bubble.textContent = emoji;
    Object.assign(bubble.style, {
      position: 'fixed',
      left: isSelf ? '76px' : '50%',
      bottom: isSelf ? '135px' : 'auto',
      top: isSelf ? 'auto' : '115px',
      transform: isSelf ? 'scale(0.5)' : 'translateX(-50%) scale(0.5)',
      fontSize: '42px',
      zIndex: '99999',
      pointerEvents: 'none',
      background: 'rgba(24, 24, 31, 0.92)',
      border: '2px solid #f43f5e',
      borderRadius: '50%',
      width: '64px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 8px 24px rgba(244, 63, 94, 0.45)',
      transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      opacity: '0'
    });
    document.body.appendChild(bubble);

    requestAnimationFrame(() => {
      bubble.style.opacity = '1';
      bubble.style.transform = isSelf ? 'scale(1) translateY(-10px)' : 'translateX(-50%) scale(1) translateY(10px)';
    });

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = isSelf ? 'scale(0.8) translateY(-35px)' : 'translateX(-50%) scale(0.8) translateY(-15px)';
      setTimeout(() => bubble.remove(), 400);
    }, 2600);
  }

  async function sendReactionToRoom(emoji) {
    const roomId = getActiveRoomId();
    const userId = getCurrentUserId();
    if (!roomId  !userId  !window.firebase?.firestore) return;
    try {
      const db = window.firebase.firestore();
      await db.collection('rooms').doc(roomId).set({
        lastReaction: {
          emoji: emoji,
          senderId: userId,
          ts: Date.now()
        }
      }, { merge: true });
    } catch (e) {
      console.warn('Reaction sync error:', e);
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .emoji-btn, .reaction-item, [data-emoji]');
    if (!target) return;
    const text = (target.dataset?.emoji  target.textContent  '').trim();
    if (/^(\p{Emoji_Presentation}|\p{Extended_Pictographic}){1,2}$/u.test(text)) {
      if (text !== '😊' && text !== '⚙️' && text !== '✕' && text !== '×') {
        sendReactionToRoom(text);
      }
    }
  }, true);

  let watchedRoomId = '';
  let unsubscribe = null;

  setInterval(() => {
    const roomId = getActiveRoomId();
    if (!roomId  roomId === watchedRoomId  !window.firebase?.firestore) return;
    watchedRoomId = roomId;
    if (unsubscribe) unsubscribe();

    const db = window.firebase.firestore();
    unsubscribe = db.collection('rooms').doc(roomId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();
      const r = data?.lastReaction;
      if (!r  !r.emoji  !r.ts) return;
      if (r.ts <= lastShownTs || Date.now() - r.ts > 6000) return;

      lastShownTs = r.ts;
      const myId = getCurrentUserId();
      const isSelf = String(r.senderId) === String(myId);
      if (!isSelf) {
        spawnFloatingEmoji(r.emoji, false);
      }
    });
  }, 1500);
})();
