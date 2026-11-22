require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const { Bot } = require('node-telegram-bot-api');
const { run } = require('node-telegram-bot-api/node');
const admin = require('firebase-admin');

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required. Set it in .env before starting the bot.');
}

if (!process.env.WEBAPP_URL) {
  throw new Error('WEBAPP_URL is required. Set it in .env before starting the bot.');
}

admin.initializeApp({
  credential: admin.credential.cert(
    require(path.join(__dirname, 'serviceAccountKey.json')),
  ),
});

const db = admin.firestore();
const users = db.collection('users');
const challenges = db.collection('challenges');
const bot = new Bot(process.env.BOT_TOKEN);

function sendMessage(chatId, text, options = {}) {
  return bot.api.sendMessage({ chat_id: chatId, text, ...options });
}

function sendDice(chatId, options) {
  return bot.api.sendDice({ chat_id: chatId, ...options });
}

function answerCallbackQuery(context, options) {
  return context.answerCallbackQuery(options);
}

function editMessageReplyMarkup(context, replyMarkup) {
  const message = context.callbackQuery?.message;
  if (!message) throw new Error('Cannot edit a callback without an attached message.');

  return bot.api.editMessageReplyMarkup({
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: replyMarkup,
  });
}

function telegramId(user) {
  return String(user.id);
}

function displayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ')
    || (user.username ? `@${user.username}` : `Гравець ${user.id}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatCoins(value) {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value);
}

async function ensureUser(user) {
  const id = telegramId(user);
  const userRef = users.doc(id);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      transaction.create(userRef, {
        id: user.id,
        name: displayName(user),
        username: user.username || '',
        balance: 500,
      });
    }
  });

  return userRef;
}

function isGroup(chat) {
  return chat.type === 'group' || chat.type === 'supergroup';
}

async function sendStart(chatId, chatType, user) {
  await ensureUser(user);
  const keyboard = chatType === 'private'
    ? { text: '🎮 Відкрити гру', web_app: { url: process.env.WEBAPP_URL } }
    : { text: '🎮 Відкрити гру', url: process.env.WEBAPP_URL };

  await sendMessage(
    chatId,
    `Привіт, ${escapeHtml(displayName(user))}! Твій профіль створено. Заходь грати!`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[keyboard]] },
    },
  );
}

async function sendBalance(chatId, user) {
  const userRef = await ensureUser(user);
  const snapshot = await userRef.get();
  await sendMessage(
    chatId,
    `🪙 Баланс ${escapeHtml(displayName(user))}: <b>${formatCoins(snapshot.get('balance'))}</b> монет.`,
    { parse_mode: 'HTML' },
  );
}

async function sendTop(chatId) {
  const snapshot = await users.orderBy('balance', 'desc').limit(10).get();
  if (snapshot.empty) {
    await sendMessage(chatId, 'Поки що гравців немає.');
    return;
  }

  const rows = snapshot.docs.map((doc, index) => {
    const player = doc.data();
    return `${index + 1}. ${escapeHtml(player.name || `Гравець ${player.id}`)} — `
      + `<b>${formatCoins(player.balance || 0)} 🪙</b>`;
  });
  await sendMessage(chatId, `<b>🏆 Топ-10 гравців</b>\n${rows.join('\n')}`, {
    parse_mode: 'HTML',
  });
}

function challengeKeyboard(challengeId, isTargeted) {
  const buttons = [
    { text: '✅ Прийняти', callback_data: `accept:${challengeId}` },
  ];
  if (isTargeted) {
    buttons.push({ text: '❌ Відхилити', callback_data: `decline:${challengeId}` });
  }
  return { inline_keyboard: [buttons] };
}

async function createChallenge(message, game, stake) {
  const author = message.from;
  const authorId = telegramId(author);
  const replyUser = message.reply_to_message?.from;
  const targeted = Boolean(replyUser);

  if (author.is_bot || (targeted && (replyUser.is_bot || telegramId(replyUser) === authorId))) {
    return;
  }

  await ensureUser(author);
  if (targeted) await ensureUser(replyUser);

  const challengeId = crypto.randomUUID();
  const challenge = {
    chatId: message.chat.id,
    creatorId: authorId,
    creatorName: displayName(author),
    targetId: targeted ? telegramId(replyUser) : null,
    targetName: targeted ? displayName(replyUser) : null,
    game,
    stake,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await challenges.doc(challengeId).create(challenge);

  const opponentText = targeted
    ? `викликає ${escapeHtml(displayName(replyUser))}`
    : 'шукає суперника';
  const gameName = game === 'coin' ? '🪙 Монетка' : '🎲 Кубик';
  await sendMessage(
    message.chat.id,
    `${gameName}: <b>${escapeHtml(displayName(author))}</b> ${opponentText} `
      + `на <b>${stake} 🪙</b>!`,
    {
      parse_mode: 'HTML',
      reply_markup: challengeKeyboard(challengeId, targeted),
    },
  );
}

async function answerBalanceError(context, text) {
  await answerCallbackQuery(context, { text, show_alert: true });
}

async function declineChallenge(query, challengeId, actorId) {
  const result = await db.runTransaction(async (transaction) => {
    const challengeRef = challenges.doc(challengeId);
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists) return { kind: 'missing' };

    const challenge = snapshot.data();
    if (challenge.status !== 'open') return { kind: 'closed' };
    if (challenge.targetId !== actorId) return { kind: 'unauthorized' };

    transaction.update(challengeRef, { status: 'declined' });
    return { kind: 'declined', challenge };
  });

  if (result.kind === 'unauthorized') {
    await answerBalanceError(query, 'Цей виклик адресовано іншому гравцю!');
    return;
  }
  if (result.kind !== 'declined') {
    await answerBalanceError(query, 'Цей виклик уже недоступний.');
    return;
  }

  await answerCallbackQuery(query, { text: 'Виклик відхилено.' });
  try {
    await editMessageReplyMarkup(query, { inline_keyboard: [] });
  } catch (error) {
    console.error('Failed to remove declined challenge buttons:', error);
  }
  await sendMessage(result.challenge.chatId, '❌ Виклик відхилено.');
}

async function beginChallenge(query, challengeId, actorId) {
  const coinWinner = Math.random() < 0.5 ? 'creator' : 'accepter';

  return db.runTransaction(async (transaction) => {
    const challengeRef = challenges.doc(challengeId);
    const challengeSnapshot = await transaction.get(challengeRef);
    if (!challengeSnapshot.exists) return { kind: 'missing' };

    const challenge = challengeSnapshot.data();
    if (challenge.status !== 'open') return { kind: 'closed' };
    if (challenge.creatorId === actorId) return { kind: 'self' };
    if (challenge.targetId && challenge.targetId !== actorId) {
      return { kind: 'unauthorized' };
    }

    const creatorRef = users.doc(challenge.creatorId);
    const accepterRef = users.doc(actorId);
    const [creatorSnapshot, accepterSnapshot] = await Promise.all([
      transaction.get(creatorRef),
      transaction.get(accepterRef),
    ]);

    if (!creatorSnapshot.exists || !accepterSnapshot.exists) {
      return { kind: 'missing-user' };
    }

    const creatorBalance = Number(creatorSnapshot.get('balance')) || 0;
    const accepterBalance = Number(accepterSnapshot.get('balance')) || 0;
    if (creatorBalance < challenge.stake || accepterBalance < challenge.stake) {
      return { kind: 'insufficient' };
    }

    const accepter = query.from;
    const accepterInfo = {
      accepterId: actorId,
      accepterName: displayName(accepter),
    };

    if (challenge.game === 'coin') {
      const winnerId = coinWinner === 'creator' ? challenge.creatorId : actorId;
      const payout = challenge.stake * 2 * 0.98;
      transaction.update(creatorRef, {
        balance: creatorBalance - challenge.stake
          + (winnerId === challenge.creatorId ? payout : 0),
      });
      transaction.update(accepterRef, {
        balance: accepterBalance - challenge.stake
          + (winnerId === actorId ? payout : 0),
      });
      transaction.update(challengeRef, {
        status: 'completed',
        ...accepterInfo,
        winnerId,
        payout,
      });
      return {
        kind: 'coin',
        challenge,
        accepterName: displayName(accepter),
        winnerId,
        winnerName: winnerId === challenge.creatorId
          ? challenge.creatorName
          : displayName(accepter),
        payout,
      };
    }

    transaction.update(creatorRef, { balance: creatorBalance - challenge.stake });
    transaction.update(accepterRef, { balance: accepterBalance - challenge.stake });
    transaction.update(challengeRef, {
      status: 'playing',
      ...accepterInfo,
    });
    return {
      kind: 'dice',
      challenge,
      accepterName: displayName(accepter),
    };
  });
}

async function settleDice(challengeId, creatorRoll, accepterRoll) {
  return db.runTransaction(async (transaction) => {
    const challengeRef = challenges.doc(challengeId);
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists || snapshot.get('status') !== 'playing') {
      return { kind: 'closed' };
    }

    const challenge = snapshot.data();
    const creatorRef = users.doc(challenge.creatorId);
    const accepterRef = users.doc(challenge.accepterId);
    const [creatorSnapshot, accepterSnapshot] = await Promise.all([
      transaction.get(creatorRef),
      transaction.get(accepterRef),
    ]);
    if (!creatorSnapshot.exists || !accepterSnapshot.exists) {
      throw new Error(`Missing player profile while settling challenge ${challengeId}`);
    }

    if (creatorRoll === accepterRoll) {
      transaction.update(creatorRef, { balance: creatorSnapshot.get('balance') + challenge.stake });
      transaction.update(accepterRef, { balance: accepterSnapshot.get('balance') + challenge.stake });
      transaction.update(challengeRef, { status: 'completed', result: 'draw' });
      return { kind: 'draw', challenge };
    }

    const creatorWon = creatorRoll > accepterRoll;
    const winnerRef = creatorWon ? creatorRef : accepterRef;
    const winnerSnapshot = creatorWon ? creatorSnapshot : accepterSnapshot;
    const payout = challenge.stake * 2 * 0.98;
    transaction.update(winnerRef, {
      balance: winnerSnapshot.get('balance') + payout,
    });
    transaction.update(challengeRef, {
      status: 'completed',
      result: 'win',
      winnerId: creatorWon ? challenge.creatorId : challenge.accepterId,
      payout,
      creatorRoll,
      accepterRoll,
    });
    return {
      kind: 'win',
      challenge,
      creatorWon,
      payout,
      creatorRoll,
      accepterRoll,
    };
  });
}

async function refundFailedDice(challengeId) {
  return db.runTransaction(async (transaction) => {
    const challengeRef = challenges.doc(challengeId);
    const snapshot = await transaction.get(challengeRef);
    if (!snapshot.exists || snapshot.get('status') !== 'playing') return false;

    const challenge = snapshot.data();
    const creatorRef = users.doc(challenge.creatorId);
    const accepterRef = users.doc(challenge.accepterId);
    const [creatorSnapshot, accepterSnapshot] = await Promise.all([
      transaction.get(creatorRef),
      transaction.get(accepterRef),
    ]);
    if (!creatorSnapshot.exists || !accepterSnapshot.exists) {
      throw new Error(`Missing player profile while refunding challenge ${challengeId}`);
    }

    transaction.update(creatorRef, { balance: creatorSnapshot.get('balance') + challenge.stake });
    transaction.update(accepterRef, { balance: accepterSnapshot.get('balance') + challenge.stake });
    transaction.update(challengeRef, { status: 'failed' });
    return true;
  });
}

async function playDice(challengeId, challenge, accepterName) {
  let result;
  try {
    const creatorDice = await sendDice(challenge.chatId, { emoji: '🎲' });
    const accepterDice = await sendDice(challenge.chatId, { emoji: '🎲' });
    await new Promise((resolve) => setTimeout(resolve, 3500));

    result = await settleDice(
      challengeId,
      creatorDice.dice.value,
      accepterDice.dice.value,
    );
  } catch (error) {
    let refunded = false;
    try {
      refunded = await refundFailedDice(challengeId);
    } catch (refundError) {
      console.error('Failed to refund dice challenge:', refundError);
    }
    console.error('Dice challenge failed:', error);
    try {
      await sendMessage(
        challenge.chatId,
        refunded
          ? 'Не вдалося завершити гру в кубик. Ставки обом гравцям повернуто.'
          : 'Не вдалося завершити гру в кубик. Перевірте баланс або зверніться до адміністратора.',
      );
    } catch (notificationError) {
      console.error('Failed to report dice challenge failure:', notificationError);
    }
    return;
  }

  if (result.kind === 'draw') {
    try {
      await sendMessage(
        challenge.chatId,
        `🤝 Нічия! ${escapeHtml(challenge.creatorName)} — ${result.challenge.stake} 🪙 `
          + `і ${escapeHtml(accepterName)} — ${result.challenge.stake} 🪙 повернуто.`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      console.error('Failed to announce dice draw:', error);
    }
    return;
  }

  if (result.kind === 'win') {
    const winnerName = result.creatorWon ? challenge.creatorName : accepterName;
    try {
      await sendMessage(
        challenge.chatId,
        `🎲 ${escapeHtml(challenge.creatorName)}: ${result.creatorRoll} — `
          + `${result.accepterRoll}: ${escapeHtml(accepterName)}\n`
          + `🏆 Переміг <b>${escapeHtml(winnerName)}</b> і отримав `
          + `<b>${formatCoins(result.payout)} 🪙</b>!`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      console.error('Failed to announce dice winner:', error);
    }
  }
}

bot.on('message', async (context) => {
  const message = context.message;
  if (!message.text) return;

  try {
    const command = message.text.trim().match(/^\/(start|balance|top)(?:@\w+)?(?:\s|$)/i);
    if (command) {
      switch (command[1].toLowerCase()) {
        case 'start':
          await sendStart(message.chat.id, message.chat.type, message.from);
          return;
        case 'balance':
          await sendBalance(message.chat.id, message.from);
          return;
        case 'top':
          await sendTop(message.chat.id);
          return;
      }
    }

    if (/^баланс$/i.test(message.text.trim())) {
      await sendBalance(message.chat.id, message.from);
      return;
    }
    if (/^топ$/i.test(message.text.trim())) {
      await sendTop(message.chat.id);
      return;
    }

    if (!isGroup(message.chat)) return;
    const match = message.text.trim().match(/^зіграти в (монетку|кубика)\s+(\d+)$/i);
    if (!match) return;

    const stake = Number(match[2]);
    if (!Number.isInteger(stake) || stake < 10 || stake > 300) {
      await sendMessage(message.chat.id, 'Ставка має бути від 10 до 300 🪙.');
      return;
    }
    await createChallenge(message, match[1].toLowerCase() === 'монетку' ? 'coin' : 'dice', stake);
  } catch (error) {
    console.error('Failed to handle message:', error);
  }
});

bot.on('callback_query', async (context) => {
  const query = context.callbackQuery;
  const [action, challengeId] = (query?.data || '').split(':');
  if (!challengeId || !['accept', 'decline'].includes(action)) return;

  try {
    const actorId = telegramId(context.from);
    if (action === 'decline') {
      await declineChallenge(context, challengeId, actorId);
      return;
    }

    const result = await beginChallenge(context, challengeId, actorId);
    if (result.kind === 'unauthorized') {
      await answerBalanceError(context, 'Цей виклик адресовано іншому гравцю!');
      return;
    }
    if (result.kind !== 'coin' && result.kind !== 'dice') {
      const messages = {
        missing: 'Виклик не знайдено.',
        closed: 'Цей виклик уже недоступний.',
        self: 'Не можна прийняти власний виклик.',
        'missing-user': 'Не вдалося знайти профіль одного з гравців.',
        insufficient: 'У одного з гравців недостатньо монет для ставки.',
      };
      await answerBalanceError(context, messages[result.kind] || 'Не вдалося прийняти виклик.');
      return;
    }

    await answerCallbackQuery(context, { text: 'Виклик прийнято!' });
    try {
      await editMessageReplyMarkup(context, { inline_keyboard: [] });
    } catch (error) {
      console.error('Failed to remove accepted challenge buttons:', error);
    }

    if (result.kind === 'coin') {
      await sendMessage(
        result.challenge.chatId,
        `🪙 Переміг <b>${escapeHtml(result.winnerName)}</b>! `
          + `Виграш: <b>${formatCoins(result.payout)} 🪙</b>.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    void playDice(challengeId, result.challenge, result.accepterName);
  } catch (error) {
    console.error('Failed to handle game callback:', error);
    try {
      await answerCallbackQuery(context, {
        text: 'Сталася помилка. Спробуйте ще раз.',
        show_alert: true,
      });
    } catch (answerError) {
      console.error('Failed to answer callback query:', answerError);
    }
  }
});

bot.catch((error) => {
  console.error('Telegram update failed:', error);
});

async function startBot() {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await bot.init();

  const polling = run(bot, { exitOnError: true });
  console.log('Бот успішно запущений!');
  await polling;
}

startBot().catch((error) => {
  console.error('Telegram bot stopped unexpectedly:', error);
  process.exitCode = 1;
});
