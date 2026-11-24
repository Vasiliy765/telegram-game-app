'use strict';

const crypto = require('node:crypto');

const PERSONALITIES = Object.freeze([
  'aggressive',
  'cautious',
  'gambler',
  'experienced',
  'rookie',
]);

const DEFAULT_TEMPLATES = Object.freeze([
  { name: 'Олексій «Лис»', personality: 'experienced', difficulty: 'hard', avatar: '🦊' },
  { name: 'Марія Вишня', personality: 'cautious', difficulty: 'medium', avatar: '🍒' },
  { name: 'Тарас Козак', personality: 'aggressive', difficulty: 'hard', avatar: '⚔️' },
  { name: 'Софія Мрія', personality: 'rookie', difficulty: 'easy', avatar: '🌙' },
  { name: 'Данило «Ден»', personality: 'gambler', difficulty: 'medium', avatar: '🎲' },
  { name: 'Ірина Сова', personality: 'experienced', difficulty: 'hard', avatar: '🦉' },
  { name: 'Максим Грім', personality: 'aggressive', difficulty: 'medium', avatar: '⚡' },
  { name: 'Анастасія Квітка', personality: 'cautious', difficulty: 'medium', avatar: '🌷' },
  { name: 'Богдан «Бодя»', personality: 'rookie', difficulty: 'easy', avatar: '🐻' },
  { name: 'Катерина Луна', personality: 'experienced', difficulty: 'hard', avatar: '🌕' },
  { name: 'Артем Вовк', personality: 'gambler', difficulty: 'hard', avatar: '🐺' },
  { name: 'Олена Зірка', personality: 'cautious', difficulty: 'easy', avatar: '⭐' },
  { name: 'Михайло «Міша»', personality: 'aggressive', difficulty: 'medium', avatar: '🦁' },
  { name: 'Вікторія Перлина', personality: 'experienced', difficulty: 'hard', avatar: '🦋' },
  { name: 'Роман Шторм', personality: 'gambler', difficulty: 'medium', avatar: '🌊' },
  { name: 'Юлія «Юна»', personality: 'rookie', difficulty: 'easy', avatar: '🐱' },
  { name: 'Назар Тихий', personality: 'cautious', difficulty: 'hard', avatar: '🌿' },
  { name: 'Дарина Сонце', personality: 'experienced', difficulty: 'medium', avatar: '☀️' },
  { name: 'Павло «Панда»', personality: 'gambler', difficulty: 'easy', avatar: '🐼' },
  { name: 'Алла Мавка', personality: 'aggressive', difficulty: 'hard', avatar: '🧚' },
]);

function safeInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

class NpcSystem {
  constructor({ db, users, challenges }) {
    this.db = db;
    this.users = users;
    this.challenges = challenges;
    this.configRef = db.collection('config').doc('npc');
    this.npcs = db.collection('npcs');
    this.matches = db.collection('npcMatches');
  }

  async getConfig() {
    const config = await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.configRef);
      if (snapshot.exists) return snapshot.data();
      const initial = { enabled: true, count: 20, maxActiveRooms: 2, activeRooms: 0 };
      transaction.create(this.configRef, initial);
      return initial;
    });
    return {
      enabled: config.enabled !== false,
      count: safeInteger(config.count, 20, 0, 50),
      maxActiveRooms: safeInteger(config.maxActiveRooms, 2, 1, 10),
      activeRooms: safeInteger(config.activeRooms, 0, 0, 10),
    };
  }

  async setConfig(patch) {
    const current = await this.getConfig();
    const next = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      count: safeInteger(patch.count, current.count, 0, 50),
      maxActiveRooms: safeInteger(patch.maxActiveRooms, current.maxActiveRooms, 1, 10),
      activeRooms: current.activeRooms,
    };
    await this.configRef.set(next, { merge: true });
    await this.ensureNpcProfiles(next.count);
    return next;
  }

  npcId(index) {
    return `npc_${index + 1}`;
  }

  async ensureNpcProfiles(requestedCount, { regenerate = false } = {}) {
    const count = safeInteger(requestedCount, 20, 0, 50);
    for (let index = 0; index < count; index += 1) {
      const template = DEFAULT_TEMPLATES[index % DEFAULT_TEMPLATES.length];
      const ref = this.npcs.doc(this.npcId(index));
      const snapshot = await ref.get();
      if (snapshot.exists && snapshot.get('deleted') === true && !regenerate) continue;
      if (snapshot.exists && !regenerate) {
        await ref.set({
          name: snapshot.get('name') || template.name,
          avatar: snapshot.get('avatar') || template.avatar,
          isNpc: true,
          personality: snapshot.get('personality') || template.personality,
          difficulty: snapshot.get('difficulty') || template.difficulty,
          enabled: true,
        }, { merge: true });
      } else {
        const npc = {
          id: this.npcId(index),
          name: template.name,
          avatar: template.avatar,
          isNpc: true,
          enabled: true,
          personality: template.personality,
          difficulty: template.difficulty,
          balance: crypto.randomInt(150, 4501),
          wins: 0,
          losses: 0,
          reservedBalance: 0,
          rating: 1000,
        };
        if (snapshot.exists && regenerate) npc.balance = crypto.randomInt(150, 4501);
        await ref.set(npc);
      }
    }
    const snapshot = await this.npcs.get();
    const batch = this.db.batch();
    let updateCount = 0;
    for (const doc of snapshot.docs) {
      const index = Number(doc.id.replace('npc_', '')) - 1;
      if (/^npc_\d+$/.test(doc.id)) {
        const enabled = index < count && doc.get('deleted') !== true;
        if (doc.get('enabled') !== enabled) {
          batch.update(doc.ref, { enabled });
          updateCount += 1;
        }
      }
    }
    if (updateCount) await batch.commit();
  }

  async initialize() {
    const config = await this.getConfig();
    await this.ensureNpcProfiles(config.count);
    await this.cleanupExpiredMatches();
  }

  async cleanupExpiredMatches() {
    const snapshot = await this.matches.where('status', '==', 'active').limit(20).get();
    const expired = snapshot.docs.filter((doc) =>
      Number(doc.get('expiresAt')) > 0 && Number(doc.get('expiresAt')) <= Date.now());
    for (const matchDoc of expired) {
      await this.db.runTransaction(async (transaction) => {
        const matchSnapshot = await transaction.get(matchDoc.ref);
        if (!matchSnapshot.exists || matchSnapshot.get('status') !== 'active') return;
        const match = matchSnapshot.data();
        const npcRef = this.npcs.doc(match.npcId);
        const [npcSnapshot, configSnapshot] = await Promise.all([
          transaction.get(npcRef),
          transaction.get(this.configRef),
        ]);
        if (!npcSnapshot.exists || !configSnapshot.exists) {
          throw new Error(`Missing NPC data while expiring match ${matchDoc.id}.`);
        }
        transaction.update(npcRef, {
          reservedBalance: Math.max(
            0,
            safeInteger(npcSnapshot.get('reservedBalance'), 0, 0, 2_147_483_647) - match.stake,
          ),
        });
        transaction.update(this.configRef, {
          activeRooms: Math.max(0, safeInteger(configSnapshot.get('activeRooms'), 0, 0, 10) - 1),
        });
        transaction.update(matchDoc.ref, { status: 'expired', finishedAt: Date.now() });
      });
    }
  }

  chooseDifficulty(npc, gameContext = {}) {
    const roll = Math.random();
    if (npc.personality === 'rookie' && roll < 0.18) return 'mistake';
    if (npc.personality === 'experienced' && gameContext.safeChoice) return 'safe';
    if (npc.personality === 'cautious' && roll < 0.75) return 'safe';
    if (npc.personality === 'gambler' && roll < 0.7) return 'risk';
    if (npc.personality === 'aggressive' && roll < 0.65) return 'attack';
    if (npc.personality === 'cautious' && roll < 0.8) return 'stable';
    return 'normal';
  }

  stakeForNpc(npc, balance) {
    const choice = this.chooseDifficulty(npc);
    const ratio = choice === 'risk' || choice === 'attack' ? 0.12
      : choice === 'safe' ? 0.04
        : choice === 'stable' ? 0.06 : 0.08;
    return Math.min(300, Math.max(10, Math.floor(Math.min(balance, 1000) * ratio)));
  }

  async runActivity(limit = 3) {
    const config = await this.getConfig();
    if (!config.enabled || limit <= 0) return { kind: 'disabled' };

    const openCoin = await this.challenges
      .where('status', '==', 'open')
      .where('game', '==', 'coin')
      .limit(limit)
      .get();
    if (!openCoin.empty) {
      const challenge = openCoin.docs[Math.floor(Math.random() * openCoin.docs.length)];
      return this.acceptOpenCoinChallenge(challenge.id);
    }
    const openDice = await this.challenges
      .where('status', '==', 'open')
      .where('game', '==', 'dice')
      .limit(limit)
      .get();
    if (!openDice.empty) {
      const challenge = openDice.docs[Math.floor(Math.random() * openDice.docs.length)];
      return this.acceptOpenDiceChallenge(challenge.id);
    }

    const npcs = await this.npcs
      .where('enabled', '==', true)
      .limit(config.count)
      .get();
    if (npcs.empty) return { kind: 'empty' };
    const available = npcs.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
    const creator = available[Math.floor(Math.random() * available.length)];
    const opponents = available.filter((npc) => npc.id !== creator.id);
    if (!opponents.length) return { kind: 'no-opponent' };
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    const stake = this.stakeForNpc(creator, Number(creator.balance) || 0);
    if (stake < 10) return { kind: 'insufficient' };

    return this.playNpcCoin(creator, opponent, stake);
  }

  async playNpcCoin(creator, opponent, stake) {
    return this.db.runTransaction(async (transaction) => {
      const creatorSnapshot = await transaction.get(creator.ref);
      const opponentSnapshot = await transaction.get(opponent.ref);
      if (!creatorSnapshot.exists || !opponentSnapshot.exists) return { kind: 'missing' };
      const creatorBalance = Math.round(Number(creatorSnapshot.get('balance')) || 0);
      const opponentBalance = Math.round(Number(opponentSnapshot.get('balance')) || 0);
      if (creatorBalance < stake || opponentBalance < stake) return { kind: 'insufficient' };

      const creatorWins = this.chooseCoinWinner(creatorSnapshot.data());
      const winnerRef = creatorWins ? creator.ref : opponent.ref;
      const loserRef = creatorWins ? opponent.ref : creator.ref;
      const winnerSnapshot = creatorWins ? creatorSnapshot : opponentSnapshot;
      const loserSnapshot = creatorWins ? opponentSnapshot : creatorSnapshot;
      const totalPot = stake * 2;
      const fee = Math.round(totalPot * 0.02);
      const payout = totalPot - fee;

      const winnerBalance = Math.round(Number(winnerSnapshot.get('balance')) || 0);
      const loserBalance = Math.round(Number(loserSnapshot.get('balance')) || 0);
      transaction.update(winnerRef, {
        balance: winnerBalance - stake + payout,
        wins: Math.round(Number(winnerSnapshot.get('wins')) || 0) + 1,
        rating: Math.round(Number(winnerSnapshot.get('rating')) || 1000) + 12,
        updatedAt: Date.now(),
      });
      transaction.update(loserRef, {
        balance: loserBalance - stake,
        losses: Math.round(Number(loserSnapshot.get('losses')) || 0) + 1,
        rating: Math.max(0, Math.round(Number(loserSnapshot.get('rating')) || 1000) - 8),
        updatedAt: Date.now(),
      });
      return { kind: 'completed', winnerId: winnerRef.id, stake };
    });
  }

  async acceptOpenDiceChallenge(challengeId) {
    const snapshot = await this.challenges.doc(challengeId).get();
    if (!snapshot.exists || snapshot.data().status !== 'open' || snapshot.data().game !== 'dice') {
      return { kind: 'closed' };
    }
    const npcSnapshot = await this.npcs
      .where('enabled', '==', true)
      .limit(10)
      .get();
    if (npcSnapshot.empty) return { kind: 'no-npc' };
    const candidates = npcSnapshot.docs.filter((doc) => doc.id !== snapshot.data().creatorId);
    if (!candidates.length) return { kind: 'no-npc' };
    const npcDoc = candidates[Math.floor(Math.random() * candidates.length)];
    return this.db.runTransaction(async (transaction) => {
      const challenge = snapshot.data();
      const challengeRef = snapshot.ref;
      const challengeSnapshot = await transaction.get(challengeRef);
      if (!challengeSnapshot.exists || challengeSnapshot.get('status') !== 'open') return { kind: 'closed' };
      const creatorRef = this.users.doc(challenge.creatorId);
      const npcRef = npcDoc.ref;
      const [creatorSnapshot, npcSnapshotNow] = await Promise.all([
        transaction.get(creatorRef),
        transaction.get(npcRef),
      ]);
      if (!creatorSnapshot.exists || !npcSnapshotNow.exists) return { kind: 'missing-user' };
      const stake = Number(challenge.stake);
      const creatorBalance = Math.round(Number(creatorSnapshot.get('balance')) || 0);
      const npcBalance = Math.round(Number(npcSnapshotNow.get('balance')) || 0);
      if (creatorBalance < stake || npcBalance < stake) return { kind: 'insufficient' };
      const creatorRoll = Math.floor(Math.random() * 6) + 1;
      const npcRoll = Math.floor(Math.random() * 6) + 1;
      const npcData = npcSnapshotNow.data();
      let creatorWon = creatorRoll > npcRoll;
      if (npcData.personality === 'experienced' || npcData.personality === 'cautious') {
        if (Math.random() < 0.08) creatorWon = !creatorWon;
      }
      if (creatorRoll === npcRoll) {
        transaction.update(creatorRef, {
          balance: creatorBalance,
          draws: Math.round(Number(creatorSnapshot.get('draws')) || 0) + 1,
        });
        transaction.update(npcRef, {
          balance: npcBalance,
          draws: Math.round(Number(npcSnapshotNow.get('draws')) || 0) + 1,
        });
        transaction.update(challengeRef, {
          status: 'completed',
          result: 'draw',
          creatorRoll,
          accepterRoll: npcRoll,
          accepterId: npcDoc.id,
          accepterName: npcData.name,
          npcAcceptedNotified: false,
        });
        return { kind: 'draw', creatorRoll, accepterRoll: npcRoll };
      }

      const winnerRef = creatorWon ? creatorRef : npcRef;
      const loserRef = creatorWon ? npcRef : creatorRef;
      const winnerSnapshot = creatorWon ? creatorSnapshot : npcSnapshotNow;
      const loserSnapshot = creatorWon ? npcSnapshotNow : creatorSnapshot;
      const payout = Math.round(stake * 2 * 0.98);
      transaction.update(winnerRef, {
        balance: Math.round(Number(winnerSnapshot.get('balance')) || 0) - stake + payout,
        wins: Math.round(Number(winnerSnapshot.get('wins')) || 0) + 1,
        rating: Math.round(Number(winnerSnapshot.get('rating')) || 1000) + 12,
      });
      transaction.update(loserRef, {
        balance: Math.round(Number(loserSnapshot.get('balance')) || 0) - stake,
        losses: Math.round(Number(loserSnapshot.get('losses')) || 0) + 1,
        rating: Math.max(0, Math.round(Number(loserSnapshot.get('rating')) || 1000) - 8),
      });
      transaction.update(challengeRef, {
        status: 'completed',
        result: 'win',
        creatorRoll,
        accepterRoll: npcRoll,
        accepterId: npcDoc.id,
        accepterName: npcData.name,
        winnerId: creatorWon ? challenge.creatorId : npcDoc.id,
        payout,
        npcAcceptedNotified: false,
      });
      return { kind: 'completed', winnerId: creatorWon ? challenge.creatorId : npcDoc.id };
    });
  }

  chooseCoinWinner(npc) {
    const personality = npc.personality;
    let probability = 0.5;
    if (personality === 'experienced') probability = 0.56;
    if (personality === 'gambler') probability = 0.52;
    if (personality === 'cautious') probability = 0.48;
    if (personality === 'rookie') probability = 0.43;
    if (personality === 'aggressive') probability = 0.54;
    return Math.random() < probability;
  }

  async acceptOpenCoinChallenge(challengeId) {
    const snapshot = await this.challenges.doc(challengeId).get();
    if (!snapshot.exists || snapshot.data().status !== 'open' || snapshot.data().game !== 'coin') {
      return { kind: 'closed' };
    }
    const npcSnapshot = await this.npcs
      .where('enabled', '==', true)
      .limit(10)
      .get();
    if (npcSnapshot.empty) return { kind: 'no-npc' };
    const candidates = npcSnapshot.docs.filter((doc) => doc.id !== snapshot.data().creatorId);
    if (!candidates.length) return { kind: 'no-npc' };
    const npcDoc = candidates[Math.floor(Math.random() * candidates.length)];
    const npc = { id: npcDoc.id, ref: npcDoc.ref, ...npcDoc.data() };
    return this.acceptCoinAgainstUser(snapshot.data(), snapshot.ref, npc);
  }

  async acceptCoinAgainstUser(challenge, challengeRef, npc) {
    return this.db.runTransaction(async (transaction) => {
      const challengeSnapshot = await transaction.get(challengeRef);
      if (!challengeSnapshot.exists || challengeSnapshot.get('status') !== 'open') return { kind: 'closed' };
      const creatorRef = this.users.doc(challenge.creatorId);
      const npcRef = npc.ref;
      const [creatorSnapshot, npcSnapshot] = await Promise.all([
        transaction.get(creatorRef),
        transaction.get(npcRef),
      ]);
      if (!creatorSnapshot.exists || !npcSnapshot.exists) return { kind: 'missing-user' };
      const stake = Number(challenge.stake);
      const creatorBalance = Math.round(Number(creatorSnapshot.get('balance')) || 0);
      const npcBalance = Math.round(Number(npcSnapshot.get('balance')) || 0);
      if (creatorBalance < stake || npcBalance < stake) return { kind: 'insufficient' };

      const npcWins = this.chooseCoinWinner(npcSnapshot.data());
      const winnerId = npcWins ? npc.id : challenge.creatorId;
      const winnerRef = npcWins ? npcRef : creatorRef;
      const loserRef = npcWins ? creatorRef : npcRef;
      const winnerSnapshot = npcWins ? npcSnapshot : creatorSnapshot;
      const loserSnapshot = npcWins ? creatorSnapshot : npcSnapshot;
      const payout = Math.round(stake * 2 * 0.98);

      transaction.update(winnerRef, {
        balance: Math.round(Number(winnerSnapshot.get('balance')) || 0) - stake + payout,
        wins: Math.round(Number(winnerSnapshot.get('wins')) || 0) + 1,
        rating: Math.round(Number(winnerSnapshot.get('rating')) || 1000) + 12,
      });
      transaction.update(loserRef, {
        balance: Math.round(Number(loserSnapshot.get('balance')) || 0) - stake,
        losses: Math.round(Number(loserSnapshot.get('losses')) || 0) + 1,
        rating: Math.max(0, Math.round(Number(loserSnapshot.get('rating')) || 1000) - 8),
      });
      transaction.update(challengeRef, {
        status: 'completed',
        accepterId: npc.id,
        accepterName: npc.name,
        winnerId,
        payout,
        npcAcceptedNotified: false,
      });
      return { kind: 'completed', winnerId, winnerName: npcWins ? npc.name : challenge.creatorName, payout };
    });
  }

  async listNpcProfiles(limit = 50) {
    const snapshot = await this.npcs.limit(limit).get();
    return snapshot.docs
      .filter((doc) => doc.get('deleted') !== true)
      .map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async beginMatch({ userId, npcId, stake, game }) {
    await this.cleanupExpiredMatches();
    const matchId = crypto.randomUUID();
    const matchRef = this.matches.doc(matchId);
    const npcRef = this.npcs.doc(npcId);
    const result = await this.db.runTransaction(async (transaction) => {
      const [configSnapshot, npcSnapshot] = await Promise.all([
        transaction.get(this.configRef),
        transaction.get(npcRef),
      ]);
      if (!configSnapshot.exists || configSnapshot.get('enabled') !== true) {
        return { kind: 'disabled' };
      }
      if (!npcSnapshot.exists || npcSnapshot.get('enabled') !== true) return { kind: 'missing-npc' };
      const activeRooms = safeInteger(configSnapshot.get('activeRooms'), 0, 0, 10);
      const maxActiveRooms = safeInteger(configSnapshot.get('maxActiveRooms'), 2, 1, 10);
      if (activeRooms >= maxActiveRooms) return { kind: 'busy' };
      const balance = safeInteger(npcSnapshot.get('balance'), 0, 0, 2_147_483_647);
      const reservedBalance = safeInteger(npcSnapshot.get('reservedBalance'), 0, 0, 2_147_483_647);
      if (balance - reservedBalance < stake) return { kind: 'insufficient' };
      transaction.create(matchRef, {
        userId,
        npcId,
        stake,
        game,
        status: 'active',
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      transaction.update(npcRef, { reservedBalance: reservedBalance + stake });
      transaction.update(this.configRef, { activeRooms: activeRooms + 1 });
      return { kind: 'started', matchId };
    });
    if (result.kind !== 'started') return result;
    return { ...result, npc: (await npcRef.get()).data() };
  }

  async finishMatch({ matchId, userId, result }) {
    if (!['win', 'loss', 'draw'].includes(result)) throw new Error('Некоректний результат NPC-партії.');
    const matchRef = this.matches.doc(matchId);
    return this.db.runTransaction(async (transaction) => {
      const matchSnapshot = await transaction.get(matchRef);
      if (!matchSnapshot.exists || matchSnapshot.get('status') !== 'active') {
        return { kind: 'already-settled' };
      }

      const match = matchSnapshot.data();
      if (match.userId !== userId) return { kind: 'unauthorized' };
      const npcRef = this.npcs.doc(match.npcId);
      const [npcSnapshot, configSnapshot] = await Promise.all([
        transaction.get(npcRef),
        transaction.get(this.configRef),
      ]);
      if (!npcSnapshot.exists || !configSnapshot.exists) throw new Error('NPC game data is missing.');
      const balance = safeInteger(npcSnapshot.get('balance'), 0, 0, 2_147_483_647);
      const reservedBalance = safeInteger(npcSnapshot.get('reservedBalance'), 0, 0, 2_147_483_647);
      const configActiveRooms = safeInteger(configSnapshot.get('activeRooms'), 0, 0, 10);
      const balanceDelta = result === 'win' ? -match.stake : result === 'loss' ? match.stake : 0;
      const npcWon = result === 'loss';
      transaction.update(npcRef, {
        balance: Math.max(0, balance + balanceDelta),
        reservedBalance: Math.max(0, reservedBalance - match.stake),
        wins: safeInteger(npcSnapshot.get('wins'), 0, 0, 2_147_483_647) + (npcWon ? 1 : 0),
        losses: safeInteger(npcSnapshot.get('losses'), 0, 0, 2_147_483_647) + (result === 'win' ? 1 : 0),
      });
      transaction.update(this.configRef, { activeRooms: Math.max(0, configActiveRooms - 1) });
      transaction.update(matchRef, { status: result, finishedAt: Date.now() });
      return { kind: 'settled', npcId: match.npcId, result };
    });
  }

  async cancelMatch({ matchId, userId }) {
    const matchRef = this.matches.doc(matchId);
    return this.db.runTransaction(async (transaction) => {
      const matchSnapshot = await transaction.get(matchRef);
      if (!matchSnapshot.exists || matchSnapshot.get('status') !== 'active') {
        return { kind: 'already-settled' };
      }
      const match = matchSnapshot.data();
      if (match.userId !== userId) return { kind: 'unauthorized' };
      const npcRef = this.npcs.doc(match.npcId);
      const [npcSnapshot, configSnapshot] = await Promise.all([
        transaction.get(npcRef),
        transaction.get(this.configRef),
      ]);
      if (!npcSnapshot.exists || !configSnapshot.exists) throw new Error('NPC game data is missing.');
      transaction.update(npcRef, {
        reservedBalance: Math.max(
          0,
          safeInteger(npcSnapshot.get('reservedBalance'), 0, 0, 2_147_483_647) - match.stake,
        ),
      });
      transaction.update(this.configRef, {
        activeRooms: Math.max(0, safeInteger(configSnapshot.get('activeRooms'), 0, 0, 10) - 1),
      });
      transaction.update(matchRef, { status: 'cancelled', finishedAt: Date.now() });
      return { kind: 'cancelled' };
    });
  }

  async upsertNpc(id, patch) {
    if (!id) {
      const config = await this.getConfig();
      if (config.count >= 40) throw new Error('Не можна мати більше ніж 40 NPC.');
      id = this.npcId(config.count);
      await this.configRef.set({ count: config.count + 1 }, { merge: true });
    }
    if (!/^npc_\d+$/.test(id)) throw new Error('Некоректний ID NPC.');
    const ref = this.npcs.doc(id);
    const allowed = {};
    for (const key of ['name', 'avatar', 'personality', 'difficulty', 'enabled', 'balance']) {
      if (patch[key] !== undefined) allowed[key] = patch[key];
    }
    if (typeof allowed.name === 'string') allowed.name = allowed.name.slice(0, 50);
    if (PERSONALITIES.includes(allowed.personality) === false) delete allowed.personality;
    if (allowed.difficulty !== undefined) {
      if (!['easy', 'medium', 'hard'].includes(allowed.difficulty)) delete allowed.difficulty;
    }
    if (typeof allowed.enabled !== 'boolean') delete allowed.enabled;
    if (allowed.balance !== undefined) {
      allowed.balance = safeInteger(allowed.balance, 150, 150, 4500);
    }
    await ref.set({
      id,
      name: 'Новий NPC',
      avatar: '🤖',
      isNpc: true,
      enabled: true,
      deleted: false,
      personality: 'rookie',
      difficulty: 'easy',
      balance: 150,
      wins: 0,
      losses: 0,
      reservedBalance: 0,
      rating: 1000,
      ...allowed,
    }, { merge: true });
    return { id, ...allowed };
  }

  async deleteNpc(id) {
    if (!/^npc_\d+$/.test(id)) throw new Error('Некоректний ID NPC.');
    const ref = this.npcs.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return;
    if (Number(snapshot.get('reservedBalance')) > 0) {
      throw new Error('Не можна видалити NPC, який зараз бере участь у грі.');
    }
    await ref.update({ enabled: false, deleted: true });
  }
}

module.exports = {
  NpcSystem,
  PERSONALITIES,
  DEFAULT_TEMPLATES,
};
