(function () {
  function getActiveRoomId() {
    const containerRoomId = document.getElementById('durak-game')?.dataset.roomId;
    const roomId = window.activeRoomId || window.currentRoomId || containerRoomId ||
      window.DurakRoom?.getRoomCode?.();
    return roomId == null ? '' : String(roomId);
  }

  function getCurrentUserId() {
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const profile = window.getCurrentPlayerProfile?.();
    const profileId = profile?.telegramId;
    const firebaseUid = window.firebase?.auth?.()?.currentUser?.uid;
    return telegramId ?? profileId ?? firebaseUid ?? '';
  }

  let watchedRoomId = '';
  let lastReactionKey = '';
  let unsubscribe = null;

  setInterval(() => {
    const roomId = getActiveRoomId();
    if (!roomId) {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      watchedRoomId = '';
      lastReactionKey = '';
      return;
    }
    if (roomId === watchedRoomId || !window.FirebaseRoomStore) return;
    watchedRoomId = roomId;
    lastReactionKey = '';
    if (unsubscribe) unsubscribe();

    const roomReference = window.FirebaseRoomStore.ref(`rooms/${roomId}`).documentReference();
    unsubscribe = roomReference.onSnapshot((doc) => {
      if (!doc.exists) return;
      const reaction = doc.get('lastReaction');
      const ts = Number(reaction?.ts);
      if (typeof reaction?.emoji !== 'string' || reaction.senderId == null ||
          reaction.nonce == null || !Number.isFinite(ts)) return;
      const reactionKey = String(reaction.nonce);
      if (reactionKey === lastReactionKey) return;
      lastReactionKey = reactionKey;
      if (Date.now() - ts > 6000) return;
      const senderId = String(reaction.senderId);
      if (senderId !== String(getCurrentUserId())) {
        window.DurakMultiplayer?.showReaction(senderId, reaction.emoji);
      }
    }, (error) => {
      console.error('Firestore reaction sync failed.', error);
    });
  }, 1500);
})();
