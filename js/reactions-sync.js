(function () {
  function getActiveRoomId() {
    return window.DurakRoom?.getRoomCode?.() || '';
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

    const myTgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const roomReference = window.FirebaseRoomStore.ref(`rooms/${roomId}`).documentReference();
    unsubscribe = roomReference.onSnapshot((doc) => {
      if (!doc.exists) return;
      const reaction = doc.get('lastReaction');
      const ts = Number(reaction?.ts);
      if (typeof reaction?.emoji !== 'string' || reaction.senderId == null ||
          reaction.nonce == null || !Number.isFinite(ts)) return;
      const reactionKey = `${String(reaction.nonce)}:${ts}`;
      if (reactionKey === lastReactionKey) return;
      lastReactionKey = reactionKey;
      if (myTgId == null || String(reaction.senderId) === String(myTgId)) return;
      if (Date.now() - ts > 6000) return;
      window.DurakMultiplayer?.showReaction(String(reaction.senderId), reaction.emoji);
    }, (error) => {
      console.error('Firestore reaction sync failed.', error);
    });
  }, 1500);
})();
