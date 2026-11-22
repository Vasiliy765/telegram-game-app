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
    if (roomId === watchedRoomId || !window.firebase?.firestore) return;
    watchedRoomId = roomId;
    lastReactionKey = '';
    if (unsubscribe) unsubscribe();

    const db = window.firebase.firestore();
    unsubscribe = db.collection('durakRooms').doc(roomId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const reaction = doc.get('lastReaction');
      const ts = Number(reaction?.ts);
      if (typeof reaction?.emoji !== 'string' || reaction.senderId == null ||
          reaction.nonce == null || !Number.isFinite(ts)) return;
      const reactionKey = `${String(reaction.nonce)}:${ts}`;
      if (reactionKey === lastReactionKey) return;
      lastReactionKey = reactionKey;
      if (Date.now() - ts > 6000) return;
      window.DurakMultiplayer?.showReaction(String(reaction.senderId), reaction.emoji);
    }, (error) => {
      console.error('Firestore reaction sync failed.', error);
    });
  }, 1500);
})();
