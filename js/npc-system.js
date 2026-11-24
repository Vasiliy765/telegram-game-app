(function () {
  const API_URL = 'https://telegram-game-app.onrender.com/api/admin/npc';
  const PERSONALITIES = {
    aggressive: 'Агресивний',
    cautious: 'Обережний',
    gambler: 'Азартний',
    experienced: 'Досвідчений',
    rookie: 'Новачок',
  };
  let firestore = null;
  let profiles = [];
  let config = { enabled: false, count: 20, maxActiveRooms: 2, activeRooms: 0 };
  let unsubscribeProfiles = null;
  let unsubscribeConfig = null;

  function notifyChange() {
    window.dispatchEvent(new CustomEvent('npcdatachange', {
      detail: { profiles: profiles.slice(), config: { ...config } },
    }));
  }

  async function load() {
    const firebase = window.firebase;
    const firebaseConfig = window.FIREBASE_CONFIG;
    if (!firebase?.firestore || !firebaseConfig?.projectId) return;
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    await window.getFirebaseUser();
    firestore = firebase.firestore();
    unsubscribeProfiles?.();
    unsubscribeConfig?.();
    unsubscribeConfig = firestore.collection('config').doc('npc').onSnapshot((snapshot) => {
      if (snapshot.exists) {
        config = {
          ...config,
          ...snapshot.data(),
          enabled: snapshot.get('enabled') === true,
        };
        notifyChange();
      }
    }, (error) => console.error('Unable to listen for NPC configuration.', error));
    unsubscribeProfiles = firestore.collection('npcs')
      .where('isNpc', '==', true)
      .onSnapshot((snapshot) => {
        profiles = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter((npc) => npc.enabled !== false);
        notifyChange();
      }, (error) => console.error('Unable to listen for NPC profiles.', error));
  }

  function randomProfile() {
    if (!profiles.length) return null;
    return profiles[Math.floor(Math.random() * profiles.length)];
  }

  function virtualRooms(game) {
    if (!config.enabled || !profiles.length) return [];
    const count = Math.min(2, config.maxActiveRooms - (config.activeRooms || 0), profiles.length);
    if (count < 1) return [];
    const candidates = profiles.slice().sort(() => Math.random() - 0.5).slice(0, count);
    return candidates.map((npc, index) => ({
      game,
      roomCode: `npc:${npc.id}:${game}:${Date.now()}:${index}`,
      isNpc: true,
      npc,
      hostName: npc.name,
      mode: 'Швидка гра 1 на 1',
      stake: Math.random() < 0.5 ? 10 : 25,
      playerCount: 1,
      capacity: 2,
      createdAt: Date.now(),
    }));
  }

  async function request(action, extra = {}) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) throw new Error('Відкрийте гру через Telegram, щоб знайти суперника.');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, action, ...extra }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не вдалося виконати дію.');
    return result;
  }

  async function beginMatch(room) {
    if (!room?.npc?.id || !['durak', 'battleship', 'tictactoe'].includes(room.game)) {
      throw new Error('Некоректний ігровий стіл.');
    }
    return request('begin-match', {
      npcId: room.npc.id,
      game: room.game,
      stake: room.stake,
    });
  }

  async function finishMatch(matchId, result) {
    if (!matchId) return;
    return request('finish-match', { matchId, result });
  }

  async function cancelMatch(matchId) {
    if (!matchId) return;
    return request('cancel-match', { matchId });
  }

  function reportResult(matchId, result) {
    void finishMatch(matchId, result).then(() => load()).catch((error) => {
      console.error('Unable to settle NPC game statistics.', error);
      window.TWA?.toast?.('Не вдалося зберегти результат партії.');
    });
  }

  window.NpcSystem = {
    load,
    get profiles() { return profiles.slice(); },
    get config() { return { ...config }; },
    randomProfile,
    virtualRooms,
    beginMatch,
    finishMatch,
    cancelMatch,
    reportResult,
    personalityLabel: (value) => PERSONALITIES[value] || 'Спокійний',
  };

  document.addEventListener('DOMContentLoaded', () => {
    void load().catch((error) => console.error('Unable to initialize NPC profiles.', error));
  });
})();
