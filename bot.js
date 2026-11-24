require('dotenv').config();

const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const http = require('node:http');
const path = require('node:path');
const { Bot } = require('node-telegram-bot-api');
const { run } = require('node-telegram-bot-api/node');
const admin = require('firebase-admin');

const BOT_TOKEN = [
  process.env.BOT_TOKEN,
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TOKEN,
].map((token) => token?.trim()).find(Boolean);
if (!BOT_TOKEN) {
  throw new Error('A bot token is required. Set BOT_TOKEN, TELEGRAM_BOT_TOKEN, or TOKEN before starting the bot.');
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT !== undefined
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const users = db.collection('users');
const challenges = db.collection('challenges');
const diamondPurchases = db.collection('diamondPurchases');
const bot = new Bot(BOT_TOKEN);
const updateContext = new AsyncLocalStorage();
const WEBAPP_URL = 'https://vasiliy765.github.io/telegram-game-app/';
const WEBAPP_ORIGIN = new URL(WEBAPP_URL).origin;
const ADMIN_USER_STATUS_PATH = '/api/admin/user-status';
const SALARY_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_UPGRADES = Object.freeze({ diplomat: 0, luck: 0, rank: 0, network: 0 });
const DIAMOND_PACKAGES = Object.freeze({
  '10': { diamonds: 10, stars: 15 },
  '50': { diamonds: 50, stars: 65 },
  '100': { diamonds: 100, stars: 115 },
  '300': { diamonds: 300, stars: 270 },
});
const DIAMONDS_ADMIN_ID = '7784142934';
const ADMIN_ID = '7784142934';
const supportRequests = new Map();
const adminReplyState = new Map();
const pendingBroadcasts = new Map();
const BOT_COMMANDS = [
  { command: 'start', description: 'Відкрити Таємний Клуб' },
  { command: 'play', description: 'Запустити Mini App' },
  { command: 'balance', description: 'Мій баланс (🪙 та 💎)' },
  { command: 'zp', description: 'Отримати зарплату агента' },
  { command: 'top', description: 'Рейтинг гравців' },
  { command: 'shop', description: 'Магазин діамантів 💎' },
  { command: 'help', description: 'Усі команди та правила' },
  { command: 'support', description: 'Зв’язатися з адміном' },
];
const INLINE_PREDICTIONS = [
  'Сьогодні карти натякнуть на перемогу — головне не сперечайся з тузом.',
  'Несподівані гроші знайдуть тебе швидше, ніж ти знайдеш решту в кишені.',
  'На тебе чекає тепла зустріч із людиною, яка давно хотіла написати.',
  'Твоя інтуїція сьогодні точніша за годинник — прислухайся до неї.',
  'Невелика подорож подарує велику історію для друзів.',
  'Увечері на тебе чекає сюрприз. Можливо, навіть без інструкції.',
  'Нова перемога вже поруч: зроби перший хід і не ховай козир.',
  'Удача підморгне тобі саме тоді, коли ти перестанеш її шукати.',
  'Скоро почуєш добру новину — не забудь поділитися нею з Клубом.',
  'Хтось особливий оцінить твою усмішку. Перевір, чи вона заряджена.',
  'Сьогодні вдалий день для сміливого задуму й маленького десерту.',
  'Зірки радять довіритися плану, навіть якщо його склав кіт.',
  'Твій наступний випадковий вибір виявиться напрочуд влучним.',
  'Незабаром відкриються двері, про які ти поки навіть не здогадуєшся.',
  'На тебе чекає приємне знайомство — почни розмову з простого «привіт».',
  'Твій гаманець скоро зрадіє. Деталі всесвіт тримає в секреті.',
  'У грі й у житті сьогодні твій день: не відкладай перемогу на завтра.',
  'Далека дорога почнеться з близької кав’ярні — придивися до маршруту.',
  'Скоро старий задум отримає новий шанс і дуже переконливий план.',
  'Людина, про яку ти згадав(ла), може з’явитися раніше за сповіщення.',
  'Сьогодні навіть черга рухатиметься швидше, якщо ти не дивитимешся на неї.',
  'На тебе чекає комплімент, який захочеться записати в щоденник.',
  'Маленька сміливість сьогодні заощадить тобі багато сумнівів завтра.',
  'Удача вже в дорозі — вона просто зупинилася купити каву.',
  'Нова ідея принесе користь, якщо дати їй трохи часу й заряджений телефон.',
  'Кохання ближче, ніж здається. Можливо, воно теж шукає вільну розетку.',
  'Цього тижня ти знайдеш те, що шукав(ла), і ще одну річ, яку загубив(ла).',
  'Твоя уважність помітить шанс, повз який інші пройдуть із заплющеними очима.',
  'Приємна зустріч змінить настрій, а може, і плани на вечір.',
  'Сьогодні корисно ризикнути — але лише в межах здорового глузду.',
  'Зірки готують тобі вечір без нудьги й із шансом на щось смачне.',
  'Твій козир — спокій. Навіть якщо навколо всі шукають правила.',
  'Скоро отримаєш запрошення, від якого важко відмовитися.',
  'Те, що сьогодні здається випадковістю, стане початком гарної історії.',
  'Ти ближче до мети, ніж показує навігатор твоїх сумнівів.',
  'На горизонті нова перемога — не забудь святкувати навіть маленьку.',
  'Скоро знайдеться відповідь на питання, яке ти відклав(ла) «на потім».',
  'Твоя доброта повернеться бонусом — всесвіт любить програму лояльності.',
  'Найкращий момент для нового знайомства може початися з невдалого жарту.',
  'День принесе шанс здивувати когось — почни із самого себе.',
  'Удача в картах сьогодні на твоєму боці, але не показуй їй усю колоду.',
  'Несподівана звістка додасть планам приємний поворот.',
  'У подорожі на тебе чекає красивий краєвид і ще красивіший привід зупинитися.',
  'Сьогоднішня пауза — не затримка, а секретна підготовка до ривка.',
  'Хтось згадає про тебе з теплом і, можливо, зі смаколиком.',
  'Ти знайдеш спосіб зробити складне простішим — і пояснити це без презентації.',
  'Увечері з’явиться нагода посміятися так, що сусіди теж захочуть знати чому.',
  'Розмова, якої ти трохи уникав(ла), завершиться краще, ніж очікуєш.',
  'Сьогодні твій талант не залишиться непоміченим — навіть якщо ти скромно мовчатимеш.',
  'Зовсім скоро на тебе чекає приємний збіг обставин. Не забудь подякувати долі.',
];

function threadOptions(chatId, options = {}, threadId) {
  const active = updateContext.getStore();
  const inheritedThreadId = active && String(active.chatId) === String(chatId)
    ? active.threadId
    : undefined;
  const resolvedThreadId = threadId === undefined ? inheritedThreadId : threadId;
  return {
    ...options,
    ...(resolvedThreadId ? { message_thread_id: resolvedThreadId } : {}),
  };
}

function sendMessage(chatId, text, options = {}, threadId) {
  return bot.api.sendMessage(threadOptions(chatId, { chat_id: chatId, text, ...options }, threadId));
}

function sendDice(chatId, options = {}, threadId) {
  return bot.api.sendDice(threadOptions(chatId, { chat_id: chatId, ...options }, threadId));
}

function sendPhoto(options, threadId) {
  return bot.api.sendPhoto(threadOptions(options.chat_id, options, threadId));
}

function sendVideo(options, threadId) {
  return bot.api.sendVideo(threadOptions(options.chat_id, options, threadId));
}

function copyMessage(options, threadId) {
  return bot.api.copyMessage(threadOptions(options.chat_id, options, threadId));
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
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 })
    .format(Math.round(Number(value) || 0));
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
        balance: 100,
        diamonds: 0,
        upgrades: { ...DEFAULT_UPGRADES },
        lastNetworkClaim: 0,
      });
    } else {
      const updates = {};
      if (snapshot.get('diamonds') == null) updates.diamonds = 0;
      if (snapshot.get('upgrades') == null) updates.upgrades = { ...DEFAULT_UPGRADES };
      if (snapshot.get('lastNetworkClaim') == null) updates.lastNetworkClaim = 0;
      if (Object.keys(updates).length) transaction.update(userRef, updates);
    }
  });

  return userRef;
}

async function isUserBanned(userId) {
  const snapshot = await users.doc(String(userId)).get();
  return snapshot.exists && snapshot.get('banned') === true;
}

function isGroup(chat) {
  return chat.type === 'group' || chat.type === 'supergroup';
}

const RP_ACTIONS = new Map([
  ['дякую', (from, to) => `🙏✨ Агент <b>${from}</b> щиро подякував(ла) <b>${to}</b>!`],
  ['подякувати', (from, to) => `🙏✨ Агент <b>${from}</b> щиро подякував(ла) <b>${to}</b>!`],
  ['спасибі', (from, to) => `🙏✨ Агент <b>${from}</b> щиро подякував(ла) <b>${to}</b>!`],
  ['обійняти', (from, to) => `🤗 Агент <b>${from}</b> міцно обійняв(ла) <b>${to}</b>!`],
  ['потиснути руку', (from, to) => `🤝 <b>${from}</b> по-дружньому потиснув(ла) руку <b>${to}</b>!`],
  ['пожати руку', (from, to) => `🤝 <b>${from}</b> по-дружньому потиснув(ла) руку <b>${to}</b>!`],
  ['дати п’ять', (from, to) => `✋ <b>${from}</b> дав(ла) п’ять <b>${to}</b>!`],
  ["дати п'ять", (from, to) => `✋ <b>${from}</b> дав(ла) п’ять <b>${to}</b>!`],
  ['дай п’ять', (from, to) => `✋ <b>${from}</b> дав(ла) п’ять <b>${to}</b>!`],
  ["дай п'ять", (from, to) => `✋ <b>${from}</b> дав(ла) п’ять <b>${to}</b>!`],
  ['пригостити кавою', (from, to) => `☕ <b>${from}</b> пригостив(ла) гарячою кавою <b>${to}</b>!`],
  ['кава', (from, to) => `☕ <b>${from}</b> пригостив(ла) гарячою кавою <b>${to}</b>!`],
  ['погладити', (from, to) => `🥰 <b>${from}</b> ніжно погладив(ла) по голові <b>${to}</b>!`],
  ['похвалити', (from, to) => `🌟 <b>${from}</b> похвалив(ла) <b>${to}</b> за блискучу роботу!`],
  ['підморгнути', (from, to) => `😉 <b>${from}</b> загадково підморгнув(ла) <b>${to}</b>!`],
  ['поцілувати', (from, to) => `😘 <b>${from}</b> ніжно поцілував(ла) <b>${to}</b>!`],
  ['вдарити', (from, to) => `👊 <b>${from}</b> смачно врізав(ла) <b>${to}</b>!`],
  ['врізати', (from, to) => `👊 <b>${from}</b> смачно врізав(ла) <b>${to}</b>!`],
  ['вкусити', (from, to) => `🧛‍♂️ <b>${from}</b> зробив(ла) несподіваний кусь за вухо <b>${to}</b>!`],
  ['кусь', (from, to) => `🧛‍♂️ <b>${from}</b> зробив(ла) несподіваний кусь за вухо <b>${to}</b>!`],
  ['кинути тапком', (from, to) => `🩴 <b>${from}</b> прицільно кинув(ла) тапком у <b>${to}</b>!`],
  ['тапок', (from, to) => `🩴 <b>${from}</b> прицільно кинув(ла) тапком у <b>${to}</b>!`],
  ['облити водою', (from, to) => `💦 <b>${from}</b> облив(ла) крижаною водою <b>${to}</b>!`],
  ['облити', (from, to) => `💦 <b>${from}</b> облив(ла) крижаною водою <b>${to}</b>!`],
  ['зв’язати', (from, to) => `🪢 <b>${from}</b> міцно зв’язав(ла) <b>${to}</b> вузлом Таємного Клубу!`],
  ["зв'язати", (from, to) => `🪢 <b>${from}</b> міцно зв’язав(ла) <b>${to}</b> вузлом Таємного Клубу!`],
  ['відправити в бункер', (from, to) => `🚪🔒 <b>${from}</b> відправив(ла) <b>${to}</b> охолонути в бункер!`],
  ['в бункер', (from, to) => `🚪🔒 <b>${from}</b> відправив(ла) <b>${to}</b> охолонути в бункер!`],
  ['прослухати', (from, to) => `🎧🕵️‍♂️ <b>${from}</b> непомітно поставив(ла) прослушку на <b>${to}</b>!`],
  ['жучок', (from, to) => `🎧🕵️‍♂️ <b>${from}</b> непомітно поставив(ла) прослушку на <b>${to}</b>!`],
]);

function normalizeRpText(text) {
  return String(text).trim().toLocaleLowerCase('uk-UA').replace(/[.!?,;:]+$/u, '');
}

async function setGroupRpState(message, value) {
  if (!isGroup(message.chat)) {
    await sendMessage(message.chat.id, 'Керувати РП-діями можна лише в груповому чаті.');
    return;
  }
  const enabled = String(value || '').trim().toLowerCase();
  if (enabled !== 'on' && enabled !== 'off') {
    await sendMessage(message.chat.id, 'Використання: /rp on або /rp off (лише для адміністраторів чату).');
    return;
  }

  let member;
  try {
    member = await bot.api.getChatMember({ chat_id: message.chat.id, user_id: message.from.id });
  } catch (error) {
    console.error('Could not verify group administrator for /rp.', error);
    await sendMessage(message.chat.id, 'Не вдалося перевірити права адміністратора чату.');
    return;
  }
  if (!['creator', 'administrator'].includes(member.status)) {
    await sendMessage(message.chat.id, 'Керувати РП-діями може лише адміністратор чату.');
    return;
  }

  const isEnabled = enabled === 'on';
  await db.collection('chats').doc(String(message.chat.id)).set({ rpEnabled: isEnabled }, { merge: true });
  await sendMessage(message.chat.id, isEnabled ? '🎭 РП-дії увімкнено.' : '🎭 РП-дії вимкнено.');
}

async function isGroupRpEnabled(chatId) {
  const chatSnapshot = await db.collection('chats').doc(String(chatId)).get();
  return chatSnapshot.get('rpEnabled') !== false;
}

async function processRpAction(message) {
  if (!isGroup(message.chat) || !message.text || !message.reply_to_message?.from || !message.from) return false;
  const target = message.reply_to_message.from;
  if (target.is_bot || String(target.id) === String(message.from.id)) return false;

  const text = normalizeRpText(message.text);
  const giftMatch = text.match(/^подар(?:ити|увати)\s+(\d+)\s+діамант(?:а|и|ів)?$/u);
  const action = RP_ACTIONS.get(text);
  const isRobbery = text === 'пограбувати';
  if (!action && !giftMatch && !isRobbery) return false;
  let rpEnabled;
  try {
    rpEnabled = await isGroupRpEnabled(message.chat.id);
  } catch (error) {
    console.error('Could not read group RP settings.', error);
    await sendMessage(message.chat.id, 'Не вдалося перевірити налаштування РП-дій.');
    return true;
  }
  if (!rpEnabled) return true;

  const senderName = escapeHtml(displayName(message.from));
  const targetName = escapeHtml(displayName(target));

  if (action) {
    await sendMessage(message.chat.id, action(senderName, targetName), { parse_mode: 'HTML' });
    return true;
  }

  if (giftMatch) {
    const amount = Number(giftMatch[1]);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      await sendMessage(message.chat.id, 'Кількість діамантів має бути цілим числом від 1.');
      return true;
    }

    let result;
    try {
      await ensureUser(message.from);
      const senderRef = users.doc(telegramId(message.from));
      const targetRef = users.doc(telegramId(target));
      result = await db.runTransaction(async (transaction) => {
        const [senderSnapshot, targetSnapshot] = await Promise.all([
          transaction.get(senderRef),
          transaction.get(targetRef),
        ]);
        if (!targetSnapshot.exists) return { status: 'recipient-missing' };
        const diamonds = Math.round(Number(senderSnapshot.get('diamonds')) || 0);
        if (diamonds < amount) return { status: 'insufficient' };

        transaction.update(senderRef, { diamonds: diamonds - amount });
        transaction.update(targetRef, {
          diamonds: Math.round(Number(targetSnapshot.get('diamonds')) || 0) + amount,
        });
        return { status: 'sent' };
      });
    } catch (error) {
      console.error('Failed to transfer diamonds through an RP action.', error);
      await sendMessage(message.chat.id, 'Не вдалося переказати діаманти. Спробуй пізніше.');
      return true;
    }

    if (result.status === 'recipient-missing') {
      await sendMessage(message.chat.id, `💎 ${targetName} ще не має профілю. Нехай гравець спершу запустить бота через /start.`);
    } else if (result.status === 'insufficient') {
      await sendMessage(message.chat.id, 'Не вистачає діамантів для цього подарунка.');
    } else {
      await sendMessage(
        message.chat.id,
        `💎✨ <b>${senderName}</b> розкішно подарував(ла) <b>${amount} 💎</b> агенту <b>${targetName}</b>!`,
        { parse_mode: 'HTML' },
      );
    }
    return true;
  }

  const now = Date.now();
  const succeeds = Math.random() < 0.5;
  const requestedAmount = 10 + Math.floor(Math.random() * 21);
  let result;
  try {
    await ensureUser(message.from);
    const senderRef = users.doc(telegramId(message.from));
    const targetRef = users.doc(telegramId(target));
    result = await db.runTransaction(async (transaction) => {
      const [senderSnapshot, targetSnapshot] = await Promise.all([
        transaction.get(senderRef),
        transaction.get(targetRef),
      ]);
      if (!targetSnapshot.exists) return { status: 'recipient-missing' };

      const senderData = senderSnapshot.data();
      const vip = Number(senderData.vipUntil || 0) > now;
      const balance = Math.round(Number(senderData.balance) || 0);
      const targetBalance = Math.round(Number(targetSnapshot.get('balance')) || 0);
      const cooldown = Number(senderData.lastRobberyAt || 0);
      if (now - cooldown < 2 * 60 * 60 * 1000) {
        return { status: 'cooldown', remaining: 2 * 60 * 60 * 1000 - (now - cooldown) };
      }

      const fee = vip ? 0 : 25;
      if (balance < fee + 15) return { status: 'insufficient', fee, fine: 15 };
      const robberySuccess = succeeds && targetBalance >= 10;
      const fine = robberySuccess ? 0 : 15;
      const updates = {
        balance: balance - fee - fine,
        lastRobberyAt: now,
      };
      if (robberySuccess) {
        const stolen = Math.min(requestedAmount, targetBalance);
        updates.balance += stolen;
        transaction.update(targetRef, { balance: targetBalance - stolen });
        transaction.update(senderRef, updates);
        return { status: 'success', amount: stolen, fee };
      }

      transaction.update(senderRef, updates);
      return { status: 'failed', fee, fine, vip };
    });
  } catch (error) {
    console.error('Failed to process an RP robbery.', error);
    await sendMessage(message.chat.id, 'Не вдалося виконати пограбування. Спробуй пізніше.');
    return true;
  }

  if (result.status === 'recipient-missing') {
    await sendMessage(message.chat.id, `${targetName} ще не має профілю в грі.`);
  } else if (result.status === 'cooldown') {
    const minutes = Math.ceil(result.remaining / 60000);
    await sendMessage(message.chat.id, `🥷 Пограбування перезаряджається. Спробуй знову приблизно через ${minutes} хв.`);
  } else if (result.status === 'insufficient') {
    const need = result.fee + result.fine;
    await sendMessage(message.chat.id, `Для цієї спроби потрібно щонайменше ${need} 🪙.`);
  } else if (result.status === 'success') {
    await sendMessage(
      message.chat.id,
      `🥷💰 <b>${senderName}</b> успішно пограбував(ла) <b>${targetName}</b> і забрав(ла) ${result.amount} 🪙!${result.fee ? ` (витрачено ${result.fee} 🪙)` : ''}`,
      { parse_mode: 'HTML' },
    );
  } else {
    await sendMessage(
      message.chat.id,
      `🥷💨 <b>${senderName}</b> не зміг(ла) пограбувати <b>${targetName}</b> та отримав(ла) штраф ${result.fine} 🪙.${result.fee ? ` Витрачено ${result.fee} 🪙 за спробу.` : ''}`,
      { parse_mode: 'HTML' },
    );
  }
  return true;
}

async function sendStart(chatId, chatType, user) {
  await ensureUser(user);
  const keyboard = chatType === 'private'
    ? { text: '🎮 Відкрити гру', web_app: { url: WEBAPP_URL } }
    : { text: '🎮 Відкрити гру', url: WEBAPP_URL };

  await sendMessage(
    chatId,
    `Привіт, ${escapeHtml(displayName(user))}! Ласкаво просимо до Таємного Клубу — твій профіль створено. Заходь грати!`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[keyboard]] },
    },
  );
}

async function saveGroupChat(chat) {
  if (!isGroup(chat)) return;
  await db.collection('chats').doc(String(chat.id)).set({
    id: chat.id,
    title: chat.title || chat.username || `Група ${chat.id}`,
    type: chat.type,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function onUpdate(eventName, handler) {
  return bot.on(eventName, (context) => {
    const update = context.update || {};
    const message = context.message || update.message;
    const query = context.callbackQuery || update.callback_query;
    const chatMember = context.myChatMember || context.my_chat_member || update.my_chat_member;
    const messageContext = message || query?.message;
    const chat = messageContext?.chat || chatMember?.chat;
    const threadId = message?.message_thread_id || query?.message?.message_thread_id;
    const user = context.from || message?.from || query?.from || chatMember?.from;

    return updateContext.run({ chatId: chat?.id, threadId }, async () => {
      if (['message', 'callback_query'].includes(eventName) &&
          user?.id != null && telegramId(user) !== ADMIN_ID &&
          !message?.successful_payment) {
        let banned;
        try {
          banned = await isUserBanned(telegramId(user));
        } catch (error) {
          console.error('Failed to check whether a Telegram user is banned:', error);
          const errorMessage = 'Не вдалося перевірити статус акаунта. Спробуйте пізніше.';
          if (message) await sendMessage(message.chat.id, errorMessage);
          else if (query) await answerCallbackQuery(context, { text: errorMessage, show_alert: true });
          return;
        }
        if (banned) {
          const banMessage = '⛔ Ваш акаунт заблоковано адміністратором';
          if (message) await sendMessage(message.chat.id, banMessage);
          else if (query) await answerCallbackQuery(context, { text: banMessage, show_alert: true });
          return;
        }
      }

      if (chat && isGroup(chat)) {
        try {
          await saveGroupChat(chat);
        } catch (error) {
          console.error('Failed to save active group chat:', error);
        }
      }
      return handler(context);
    });
  });
}

async function sendPlay(chatId, chatType) {
  const keyboard = chatType === 'private'
    ? { text: '🎮 Запустити Таємний Клуб', web_app: { url: WEBAPP_URL } }
    : { text: '🎮 Запустити Таємний Клуб', url: WEBAPP_URL };
  await sendMessage(chatId, 'Відкрий Mini App і обери гру:', {
    reply_markup: { inline_keyboard: [[keyboard]] },
  });
}

async function sendBalance(chatId, user) {
  const userRef = await ensureUser(user);
  const snapshot = await userRef.get();
  const vipStatus = Number(snapshot.get('vipUntil') || 0) > Date.now()
    ? '\nСтатус: 👑 VIP Агент'
    : '';
  await sendMessage(
    chatId,
    `🪙 Баланс ${escapeHtml(displayName(user))}: <b>${formatCoins(snapshot.get('balance') || 0)}</b> монет\n`
      + `💎 Діаманти: <b>${formatCoins(snapshot.get('diamonds') || 0)}</b>${vipStatus}`,
    { parse_mode: 'HTML' },
  );
}

async function sendHelp(chatId) {
  await sendMessage(
    chatId,
    '<b>🎯 Команди Таємного Клубу</b>\n'
      + '/start — відкрити бота\n/play — запустити Mini App\n/balance — баланс 🪙 та 💎\n'
      + '/zp — зарплата агента раз на 3 години\n/top — рейтинг гравців\n/shop — магазин діамантів\n'
      + '/support — написати адміністратору\n'
      + 'У групі адміністратори можуть керувати РП-діями: /rp on або /rp off.\n\n'
      + 'У групі: «Зіграти в монетку &lt;ставка&gt;» або «Зіграти в кубика &lt;ставка&gt;» '
      + '(10–300 🪙).',
    { parse_mode: 'HTML' },
  );
}

async function startSupport(chatId, user) {
  supportRequests.set(telegramId(user), { startedAt: Date.now() });
  await sendMessage(
    chatId,
    '✍️ Опишіть вашу проблему або запитання одним повідомленням (можна додати фото). '
      + 'Адміністратор відповість вам найближчим часом.',
    { reply_markup: { inline_keyboard: [[{ text: 'Скасувати', callback_data: 'support:cancel' }]] } },
  );
}

function supportHeader(user) {
  const name = displayName(user).replace(/[\r\n]/g, ' ');
  const username = user.username ? `@${user.username.replace(/[\r\n]/g, '')}` : '(без username)';
  return `📩 Звернення до підтримки\nІм’я: ${name}\nUsername: ${username}\nID: ${telegramId(user)}`;
}

async function forwardSupportRequest(message) {
  const header = supportHeader(message.from);
  const chatId = Number(ADMIN_ID);
  const replyMarkup = {
    inline_keyboard: [[{
      text: '💬 Відповісти гравцю',
      callback_data: `reply_support_${telegramId(message.from)}`,
    }]],
  };
  if (message.text) {
    await sendMessage(chatId, `${header}\n\n${message.text}`, { reply_markup: replyMarkup });
  } else if (message.photo?.length) {
    const photoId = message.photo[message.photo.length - 1].file_id;
    await sendPhoto({
      chat_id: chatId,
      photo: photoId,
      caption: `${header}${message.caption ? `\n\n${message.caption}` : ''}`.slice(0, 1024),
      reply_markup: replyMarkup,
    });
  } else if (message.video) {
    await sendVideo({
      chat_id: chatId,
      video: message.video.file_id,
      caption: `${header}${message.caption ? `\n\n${message.caption}` : ''}`.slice(0, 1024),
      reply_markup: replyMarkup,
    });
  } else {
    const headerMessage = await sendMessage(chatId, header);
    await copyMessage({
      chat_id: chatId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
      reply_parameters: { message_id: headerMessage.message_id },
      reply_markup: replyMarkup,
    });
  }
  supportRequests.delete(telegramId(message.from));
  await sendMessage(message.chat.id, '✅ Ваше звернення надіслано адміністратору.');
}

function findSupportUserId(message) {
  let replied = message.reply_to_message;
  for (let depth = 0; replied && depth < 3; depth += 1) {
    const content = `${replied.text || ''}\n${replied.caption || ''}`;
    const match = content.match(/(?:^|\n)ID:\s*(\d{1,20})(?:\n|$)/);
    if (match && replied.from?.is_bot) return match[1];
    replied = replied.reply_to_message;
  }
  return null;
}

async function sendAdminReply(message, userId) {
  const prefix = '💬 Відповідь адміністратора:';
  if (message.text) {
    await sendMessage(userId, `${prefix}\n\n${message.text}`);
  } else if (message.photo?.length) {
    await sendPhoto({
      chat_id: userId,
      photo: message.photo[message.photo.length - 1].file_id,
      caption: `${prefix}${message.caption ? `\n\n${message.caption}` : ''}`.slice(0, 1024),
    });
  } else if (message.video) {
    await sendVideo({
      chat_id: userId,
      video: message.video.file_id,
      caption: `${prefix}${message.caption ? `\n\n${message.caption}` : ''}`.slice(0, 1024),
    });
  } else {
    await sendMessage(userId, prefix);
    await copyMessage({
      chat_id: userId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
    });
  }
}

async function sendSalary(chatId, user) {
  const baseReward = Math.random() < 0.9
    ? Math.floor(Math.random() * 9) + 1
    : Math.floor(Math.random() * 6) + 10;
  const now = Date.now();
  const userRef = users.doc(telegramId(user));
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.exists) {
      const lastSalaryAt = Number(snapshot.get('lastSalaryAt'));
      if (Number.isFinite(lastSalaryAt) && now - lastSalaryAt < SALARY_COOLDOWN_MS) {
        return { kind: 'cooldown', remainingMs: SALARY_COOLDOWN_MS - (now - lastSalaryAt) };
      }

      const upgrades = snapshot.get('upgrades') || {};
      const diplomatLevel = Number.isFinite(Number(upgrades.diplomat))
        ? Math.min(10, Math.max(0, Math.floor(Number(upgrades.diplomat))))
        : 0;
      const vipMultiplier = Number(snapshot.get('vipUntil') || 0) > now ? 2 : 1;
      const reward = Math.round(baseReward * vipMultiplier * (1 + diplomatLevel * 0.1));
      const balance = Math.round(Number(snapshot.get('balance')) || 0);
      const nextBalance = Math.round(balance + reward);
      transaction.update(userRef, {
        balance: nextBalance,
        diamonds: snapshot.get('diamonds') == null ? 0 : snapshot.get('diamonds'),
        lastSalaryAt: now,
        name: displayName(user),
        username: user.username || '',
      });
      return {
        kind: 'paid',
        reward,
        baseReward,
        balance: nextBalance,
      };
    }

    transaction.create(userRef, {
      id: user.id,
      name: displayName(user),
      username: user.username || '',
      balance: 100 + baseReward,
      diamonds: 0,
      lastSalaryAt: now,
      upgrades: { ...DEFAULT_UPGRADES },
      lastNetworkClaim: 0,
    });
    return { kind: 'paid', reward: baseReward, baseReward, balance: 100 + baseReward };
  });

  if (result.kind === 'cooldown') {
    const minutesLeft = Math.ceil(result.remainingMs / 60_000);
    const hours = Math.floor(minutesLeft / 60);
    const minutes = minutesLeft % 60;
    await sendMessage(
      chatId,
      `⏳ Наступна зарплата буде доступна через <b>${hours} год ${minutes} хв</b>.`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  const reward = result.reward;
  const rewardText = `<b>${reward} 🪙</b>`;
  const bonusText = result.baseReward >= 10 ? '✨ <b>Рідкісний бонус!</b>\n' : '';
  await sendMessage(
    chatId,
    `💰 <b>Зарплату нараховано!</b>\n${bonusText}`
      + `Твоя винагорода: ${rewardText}\n`
      + `Загальний баланс: <b>${formatCoins(result.balance)} 🪙</b>`,
    { parse_mode: 'HTML' },
  );
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateTelegramInitData(initData) {
  if (typeof initData !== 'string' || !initData) {
    throw httpError(401, 'Telegram initData is missing.');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw httpError(401, 'Telegram initData hash is missing or malformed.');
  }

  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw httpError(401, 'Telegram initData contains duplicate parameters.');
  }
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  const expectedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();
  const suppliedHash = Buffer.from(receivedHash, 'hex');
  if (suppliedHash.length !== expectedHash.length
      || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
    throw httpError(401, 'Telegram initData hash does not match.');
  }

  const authDate = Number(params.get('auth_date'));
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (!Number.isSafeInteger(authDate) || ageSeconds > 86_400 || ageSeconds < -60) {
    throw httpError(401, 'Telegram authentication data has expired.');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || '');
  } catch {
    throw httpError(401, 'Invalid Telegram user data.');
  }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) {
    throw httpError(401, 'Invalid Telegram user data.');
  }
  return user;
}

async function createDiamondsInvoiceLink(userId, packageId) {
  const packageDetails = DIAMOND_PACKAGES[packageId];
  if (!packageDetails) throw new Error(`Unknown diamond package: ${packageId}`);

  const payload = `diamonds:${crypto.randomUUID()}`;
  const purchaseRef = diamondPurchases.doc(payload);
  await purchaseRef.create({
    userId,
    packageId,
    diamonds: packageDetails.diamonds,
    stars: packageDetails.stars,
    status: 'pending',
    createdAt: Date.now(),
  });

  try {
    return await bot.api.createInvoiceLink({
      title: `${packageDetails.diamonds} діамантів`,
      description: `Пакет із ${packageDetails.diamonds} діамантів для гри`,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: `${packageDetails.diamonds} 💎`, amount: packageDetails.stars }],
    });
  } catch (error) {
    try {
      await purchaseRef.update({ status: 'failed', failedAt: Date.now() });
    } catch (updateError) {
      console.error('Failed to mark a diamond invoice as failed:', updateError);
    }
    const detail = error instanceof Error && error.message
      ? error.message.replaceAll(BOT_TOKEN, '[redacted]')
      : 'Unknown Telegram API error.';
    throw httpError(502, `Telegram createInvoiceLink failed: ${detail}`);
  }
}

async function sendDiamondsShop(chatId, user) {
  const packages = await Promise.all(Object.entries(DIAMOND_PACKAGES).map(
    async ([packageId, packageDetails]) => {
      const deals = {
        '50': ' · Вигода 13%',
        '100': ' · Вигода 23%',
        '300': ' · Економія 40%',
      };
      return {
        text: `💎 ${packageDetails.diamonds} — ⭐️ ${packageDetails.stars}${deals[packageId] || ''}`,
        url: await createDiamondsInvoiceLink(telegramId(user), packageId),
      };
    },
  ));
  await sendMessage(
    chatId,
    `<b>💎 Магазин Таємного Клубу</b>\nОберіть пакет діамантів для оплати Telegram Stars. `
      + `Ці рахунки доступні лише ${escapeHtml(displayName(user))}:`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: packages.map((button) => [button]) },
    },
  );
}

async function grantDiamonds(userId, amount, user = null) {
  const userRef = users.doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.exists) {
      transaction.update(userRef, {
        diamonds: admin.firestore.FieldValue.increment(amount),
      });
      return;
    }

    transaction.set(userRef, {
      id: Number(userId),
      name: user ? displayName(user) : `Гравець ${userId}`,
      username: user?.username || '',
      balance: 100,
      diamonds: admin.firestore.FieldValue.increment(amount),
      upgrades: { ...DEFAULT_UPGRADES },
      lastNetworkClaim: 0,
    });
  });
}

async function validateDiamondPurchase(payload, userId, currency, totalAmount) {
  if (typeof payload !== 'string' || !/^diamonds:[\da-f-]{36}$/i.test(payload)
      || currency !== 'XTR') return false;
  const purchaseSnapshot = await diamondPurchases.doc(payload).get();
  if (!purchaseSnapshot.exists) return false;

  const purchase = purchaseSnapshot.data();
  const packageDetails = DIAMOND_PACKAGES[purchase.packageId];
  return purchase.status === 'pending'
    && purchase.userId === userId
    && packageDetails
    && purchase.diamonds === packageDetails.diamonds
    && purchase.stars === packageDetails.stars
    && totalAmount === packageDetails.stars;
}

async function processSuccessfulDiamondPayment(message) {
  const payment = message.successful_payment;
  const user = message.from;
  const userId = telegramId(user);
  const purchaseRef = diamondPurchases.doc(payment.invoice_payload);
  const refund = async (reason) => {
    if (payment.currency !== 'XTR' || !payment.telegram_payment_charge_id) {
      console.error(`Cannot refund an invalid diamond payment: ${reason}`);
      return;
    }
    try {
      await bot.api.refundStarPayment({
        user_id: user.id,
        telegram_payment_charge_id: payment.telegram_payment_charge_id,
      });
      console.error(reason);
    } catch (error) {
      console.error(`Failed to refund a diamond payment: ${reason}`, error);
    }
  };

  let result;
  let packageDetails;
  try {
    const purchaseSnapshot = await purchaseRef.get();
    if (!purchaseSnapshot.exists) {
      await refund('Refunded a successful payment with an unknown invoice payload.');
      return;
    }

    const purchase = purchaseSnapshot.data();
    packageDetails = DIAMOND_PACKAGES[purchase.packageId];
    if (!packageDetails
        || purchase.userId !== userId
        || payment.currency !== 'XTR'
        || payment.total_amount !== packageDetails.stars) {
      await refund('Refunded a successful payment that did not match its invoice.');
      return;
    }

    const userRef = users.doc(userId);
    result = await db.runTransaction(async (transaction) => {
      const [currentPurchase, userSnapshot] = await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(userRef),
      ]);
      if (!currentPurchase.exists) throw new Error('Diamond purchase record disappeared.');

      const currentData = currentPurchase.data();
      if (currentData.status === 'paid') {
        return {
          kind: currentData.telegramChargeId === payment.telegram_payment_charge_id
            ? 'duplicate'
            : 'already-paid',
        };
      }
      if (currentData.status !== 'pending'
          || currentData.userId !== userId
          || currentData.packageId !== purchase.packageId
          || currentData.stars !== packageDetails.stars
          || currentData.diamonds !== packageDetails.diamonds
          || payment.total_amount !== packageDetails.stars) {
        throw new Error('Diamond purchase is not eligible for credit.');
      }

      if (userSnapshot.exists) {
        transaction.update(userRef, {
          diamonds: admin.firestore.FieldValue.increment(packageDetails.diamonds),
        });
      } else {
        transaction.set(userRef, {
          id: user.id,
          name: displayName(user),
          username: user.username || '',
          balance: 100,
          diamonds: admin.firestore.FieldValue.increment(packageDetails.diamonds),
          upgrades: { ...DEFAULT_UPGRADES },
          lastNetworkClaim: 0,
        });
      }
      transaction.update(purchaseRef, {
        status: 'paid',
        telegramChargeId: payment.telegram_payment_charge_id,
        paidAt: Date.now(),
      });

      const savedDiamonds = userSnapshot.get('diamonds');
      return {
        kind: 'credited',
        diamonds: (typeof savedDiamonds === 'number' && Number.isFinite(savedDiamonds)
          ? savedDiamonds
          : 0) + packageDetails.diamonds,
      };
    });

    if (result.kind === 'duplicate') return;
    if (result.kind === 'already-paid') {
      await refund('Refunded a second payment for an already-used diamond invoice.');
      return;
    }
  } catch (error) {
    console.error('Failed to credit a successful diamond payment:', error);
    try {
      const purchaseSnapshot = await purchaseRef.get();
      if (purchaseSnapshot.exists
          && purchaseSnapshot.get('status') === 'paid'
          && purchaseSnapshot.get('telegramChargeId') === payment.telegram_payment_charge_id) {
        return;
      }
      await refund('Refunded a payment that could not be credited.');
    } catch (recoveryError) {
      console.error('Failed to determine the status of an uncredited payment:', recoveryError);
    }
    return;
  }

  try {
    await sendMessage(
      message.chat.id,
      `✅ Оплату підтверджено! Нараховано <b>${packageDetails.diamonds} 💎</b>.\n`
        + `Баланс діамантів: <b>${result.diamonds} 💎</b>`,
      { parse_mode: 'HTML' },
    );
  } catch (error) {
    console.error('Payment was credited but its confirmation message could not be sent:', error);
  }
}

async function sendTop(chatId) {
  const snapshot = await users.orderBy('balance', 'desc').limit(10).get();
  if (snapshot.empty) {
    await sendMessage(chatId, 'Поки що гравців немає.');
    return;
  }

  const rows = snapshot.docs.map((doc, index) => {
    const player = doc.data();
    const playerName = player.name || `Гравець ${player.id}`;
    const vipBadge = Number(player.vipUntil || 0) > Date.now() ? '👑 VIP · ' : '';
    return `${index + 1}. ${escapeHtml(`${vipBadge}${playerName}`)} — `
      + `<b>${formatCoins(player.balance || 0)} 🪙</b>`;
  });
  await sendMessage(chatId, `<b>🏆 Топ-10 гравців</b>\n${rows.join('\n')}`, {
    parse_mode: 'HTML',
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function broadcastToChat(chatId, content) {
  if (content.kind === 'text') {
    await sendMessage(chatId, content.text);
    return;
  }
  await copyMessage({
    chat_id: chatId,
    from_chat_id: content.chatId,
    message_id: content.messageId,
  });
}

async function prepareBroadcast(message, text) {
  const repliedMessage = message.reply_to_message;
  const content = repliedMessage
    ? { kind: 'copy', chatId: message.chat.id, messageId: repliedMessage.message_id }
    : { kind: 'text', text };
  const broadcastId = crypto.randomUUID();
  pendingBroadcasts.set(broadcastId, { content, adminChatId: message.chat.id });
  const previewText = content.kind === 'text'
    ? `📣 <b>Попередній перегляд розсилки</b>\n\n${escapeHtml(content.text)}`
    : `📣 <b>Попередній перегляд розсилки</b>\nВміст скопійовано з повідомлення адміністратора.`;
  let preview;
  try {
    preview = await sendMessage(message.chat.id, previewText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Надіслати всім', callback_data: `broadcast:send:${broadcastId}` },
          { text: '❌ Скасувати', callback_data: `broadcast:cancel:${broadcastId}` },
        ]],
      },
    });
    if (repliedMessage) {
      await copyMessage({
        chat_id: message.chat.id,
        from_chat_id: message.chat.id,
        message_id: repliedMessage.message_id,
        reply_parameters: { message_id: preview.message_id },
      });
    }
  } catch (error) {
    pendingBroadcasts.delete(broadcastId);
    throw error;
  }
}

async function runBroadcast(broadcastId, callbackContext) {
  const callbackQuery = callbackContext.callbackQuery;
  if (String(callbackQuery.from.id) !== ADMIN_ID) {
    await answerCallbackQuery(callbackContext, { text: 'Команда доступна лише адміністратору.', show_alert: true });
    return;
  }
  const pending = pendingBroadcasts.get(broadcastId);
  if (!pending) {
    await answerCallbackQuery(callbackContext, { text: 'Цю розсилку вже скасовано або надіслано.' });
    return;
  }

  pendingBroadcasts.delete(broadcastId);
  await answerCallbackQuery(callbackContext, { text: 'Розсилку розпочато.' });
  try {
    await editMessageReplyMarkup(callbackContext, { inline_keyboard: [] });
  } catch (error) {
    console.error('Unable to disable broadcast confirmation buttons:', error);
  }

  const [userSnapshot, chatSnapshot] = await Promise.all([
    users.get(),
    db.collection('chats').get(),
  ]);
  const targetsById = new Map();
  userSnapshot.docs.forEach((document) => {
    targetsById.set(String(document.id), { id: document.id, kind: 'private' });
  });
  chatSnapshot.docs.forEach((document) => {
    const id = String(document.id);
    if (!targetsById.has(id)) targetsById.set(id, { id: document.id, kind: 'group' });
  });
  const targets = [...targetsById.values()];
  let privateDelivered = 0;
  let groupDelivered = 0;
  let failed = 0;

  for (const [index, target] of targets.entries()) {
    try {
      await broadcastToChat(target.id, pending.content);
      if (target.kind === 'private') privateDelivered += 1;
      else groupDelivered += 1;
    } catch (error) {
      failed += 1;
      if (error?.error_code !== 403) {
        console.error(`Broadcast delivery failed for chat ${target.id}:`, error);
      }
    }
    if (index < targets.length - 1) await sleep(50);
  }

  await sendMessage(
    pending.adminChatId,
    `✅ Розсилку завершено.\nОсобисті чати: <b>${privateDelivered}</b>\n`
      + `Групи: <b>${groupDelivered}</b>\nПомилок доставки: <b>${failed}</b>`,
    { parse_mode: 'HTML' },
  );
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
    threadId: message.message_thread_id || null,
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
  await sendMessage(result.challenge.chatId, '❌ Виклик відхилено.', {}, result.challenge.threadId);
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

    const creatorBalance = Math.round(Number(creatorSnapshot.get('balance')) || 0);
    const accepterBalance = Math.round(Number(accepterSnapshot.get('balance')) || 0);
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
      const totalPot = challenge.stake * 2;
      const fee = Math.round(totalPot * 0.02);
      const payout = Math.round(totalPot - fee);
      transaction.update(creatorRef, {
        balance: Math.round(
          creatorBalance - challenge.stake
            + (winnerId === challenge.creatorId ? payout : 0),
        ),
      });
      transaction.update(accepterRef, {
        balance: Math.round(
          accepterBalance - challenge.stake
            + (winnerId === actorId ? payout : 0),
        ),
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
      transaction.update(creatorRef, {
        balance: Math.round((Number(creatorSnapshot.get('balance')) || 0) + challenge.stake),
      });
      transaction.update(accepterRef, {
        balance: Math.round((Number(accepterSnapshot.get('balance')) || 0) + challenge.stake),
      });
      transaction.update(challengeRef, { status: 'completed', result: 'draw' });
      return { kind: 'draw', challenge };
    }

    const creatorWon = creatorRoll > accepterRoll;
    const winnerRef = creatorWon ? creatorRef : accepterRef;
    const winnerSnapshot = creatorWon ? creatorSnapshot : accepterSnapshot;
    const totalPot = challenge.stake * 2;
    const fee = Math.round(totalPot * 0.02);
    const payout = Math.round(totalPot - fee);
    transaction.update(winnerRef, {
      balance: Math.round((Number(winnerSnapshot.get('balance')) || 0) + payout),
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

    transaction.update(creatorRef, {
      balance: Math.round((Number(creatorSnapshot.get('balance')) || 0) + challenge.stake),
    });
    transaction.update(accepterRef, {
      balance: Math.round((Number(accepterSnapshot.get('balance')) || 0) + challenge.stake),
    });
    transaction.update(challengeRef, { status: 'failed' });
    return true;
  });
}

async function playDice(challengeId, challenge, accepterName) {
  let result;
  try {
    const creatorDice = await sendDice(challenge.chatId, { emoji: '🎲' }, challenge.threadId);
    const accepterDice = await sendDice(challenge.chatId, { emoji: '🎲' }, challenge.threadId);
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
        {},
        challenge.threadId,
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
        challenge.threadId,
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
        challenge.threadId,
      );
    } catch (error) {
      console.error('Failed to announce dice winner:', error);
    }
  }
}

onUpdate('message', async (context) => {
  const message = context.message;

  try {
    if (message.successful_payment) {
      await processSuccessfulDiamondPayment(message);
      return;
    }

    const senderId = telegramId(message.from);
    const pendingAdminReply = adminReplyState.get(senderId);
    if (senderId === ADMIN_ID && pendingAdminReply &&
        String(message.chat.id) === String(pendingAdminReply.chatId)) {
      if (message.text?.trim().match(/^\/cancel(?:@\w+)?(?:\s|$)/i)) {
        adminReplyState.delete(senderId);
        await sendMessage(message.chat.id, 'Відповідь скасовано.');
        return;
      }
      if (!message.text && !message.photo?.length && !message.video) {
        await sendMessage(message.chat.id, 'Надішліть текст або фото відповіді або натисніть «❌ Скасувати».');
        return;
      }
      await sendAdminReply(message, pendingAdminReply.userId);
      adminReplyState.delete(senderId);
      await sendMessage(message.chat.id, '✅ Відповідь надіслано гравцю!');
      return;
    }

    if (senderId === ADMIN_ID && message.reply_to_message) {
      const supportUserId = findSupportUserId(message);
      if (supportUserId) {
        await sendAdminReply(message, supportUserId);
        await sendMessage(message.chat.id, '✅ Відповідь надіслано користувачу.');
        return;
      }
    }

    const broadcastCommand = message.text?.trim().match(/^\/broadcast(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    if (broadcastCommand) {
      if (senderId !== ADMIN_ID) {
        await sendMessage(message.chat.id, 'Команда доступна лише адміністратору.');
        return;
      }
      const broadcastText = broadcastCommand[1]?.trim();
      if (!message.reply_to_message && !broadcastText) {
        await sendMessage(message.chat.id, 'Використання: /broadcast <текст> або відповіддю на повідомлення.');
        return;
      }
      await prepareBroadcast(message, broadcastText || '');
      return;
    }

    if (message.text?.trim().match(/^\/support(?:@\w+)?(?:\s|$)/i)) {
      await startSupport(message.chat.id, message.from);
      return;
    }
    if (message.text?.trim().match(/^\/cancel(?:@\w+)?(?:\s|$)/i)
        && supportRequests.has(senderId)) {
      supportRequests.delete(senderId);
      await sendMessage(message.chat.id, 'Звернення скасовано.');
      return;
    }
    if (supportRequests.has(senderId)) {
      await forwardSupportRequest(message);
      return;
    }

    const adminCommand = message.text?.trim().match(/^видати діаманти(?:\s+(.+))?$/i);
    if (adminCommand) {
      if (senderId !== DIAMONDS_ADMIN_ID) {
        await sendMessage(message.chat.id, 'Команда доступна лише адміністратору.');
        return;
      }

      const argumentsList = adminCommand[1]?.trim().split(/\s+/) || [];
      const repliedUser = message.reply_to_message?.from;
      let targetId;
      let amount;
      if (repliedUser && argumentsList.length === 1) {
        targetId = telegramId(repliedUser);
        amount = Number(argumentsList[0]);
      } else if (!repliedUser && argumentsList.length === 2) {
        [targetId] = argumentsList;
        amount = Number(argumentsList[1]);
      } else {
        await sendMessage(
          message.chat.id,
          'Формат: «Видати діаманти <ID> <кількість>» або відповіддю: «Видати діаманти <кількість>».',
        );
        return;
      }

      if (!/^\d{1,20}$/.test(targetId)
          || !Number.isSafeInteger(Number(targetId))
          || Number(targetId) <= 0
          || !Number.isSafeInteger(amount)
          || amount <= 0
          || repliedUser?.is_bot) {
        await sendMessage(message.chat.id, 'ID або кількість діамантів некоректні.');
        return;
      }

      await grantDiamonds(targetId, amount, repliedUser);
      await sendMessage(message.chat.id, `✅ Видано <b>${amount} 💎</b> гравцю <code>${targetId}</code>.`, {
        parse_mode: 'HTML',
      });
      return;
    }

    const command = message.text?.trim().match(/^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    if (command) {
      switch (command[1].toLowerCase()) {
        case 'start':
          await sendStart(message.chat.id, message.chat.type, message.from);
          return;
        case 'play':
          await sendPlay(message.chat.id, message.chat.type);
          return;
        case 'balance':
          await sendBalance(message.chat.id, message.from);
          return;
        case 'zp':
          await sendSalary(message.chat.id, message.from);
          return;
        case 'top':
          await sendTop(message.chat.id);
          return;
        case 'shop':
          await sendDiamondsShop(message.chat.id, message.from);
          return;
        case 'help':
          await sendHelp(message.chat.id);
          return;
        case 'rp':
          await setGroupRpState(message, command[2]);
          return;
        case 'support':
          await startSupport(message.chat.id, message.from);
          return;
        default:
          break;
      }
    }

    if (await processRpAction(message)) return;

    if (!message.text) return;
    if (/^баланс$/i.test(message.text.trim())) {
      await sendBalance(message.chat.id, message.from);
      return;
    }
    if (/^топ$/i.test(message.text.trim())) {
      await sendTop(message.chat.id);
      return;
    }
    if (/^(зп|зарплата)$/i.test(message.text.trim())) {
      await sendSalary(message.chat.id, message.from);
      return;
    }
    if (/^(магазин|донат)$/i.test(message.text.trim())) {
      await sendDiamondsShop(message.chat.id, message.from);
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

bot.on('inline_query', async (context) => {
  const query = context.update.inline_query;
  const randomPrediction = INLINE_PREDICTIONS[Math.floor(Math.random() * INLINE_PREDICTIONS.length)];
  const userName = escapeHtml(displayName(query.from));

  try {
    await bot.api.answerInlineQuery({
      inline_query_id: query.id,
      results: [{
        type: 'article',
        id: `${Date.now()}_${Math.random()}`,
        title: '🔮 Отримати передбачення від Таємного Клубу',
        description: 'Натисни, щоб дізнатися, що чекає на тебе сьогодні...',
        input_message_content: {
          message_text: `🔮 <b>Передбачення Таємного Клубу для ${userName}:</b>\n\n«${randomPrediction}»`,
          parse_mode: 'HTML',
        },
      }],
      cache_time: 1,
      is_personal: true,
    });
  } catch (error) {
    console.error('Failed to answer an inline prediction query:', error);
  }
});

bot.on('pre_checkout_query', async (context) => {
  const query = context.update.pre_checkout_query;
  let valid = false;
  try {
    valid = await validateDiamondPurchase(
      query.invoice_payload,
      telegramId(query.from),
      query.currency,
      query.total_amount,
    );
  } catch (error) {
    console.error('Failed to validate a diamond pre-checkout query:', error);
  }

  try {
    await bot.api.answerPreCheckoutQuery({
      pre_checkout_query_id: query.id,
      ok: valid,
      ...(valid ? {} : { error_message: 'Не вдалося перевірити пакет. Спробуйте створити новий рахунок.' }),
    });
  } catch (error) {
    console.error('Failed to answer a pre-checkout query:', error);
  }
});

onUpdate('callback_query', async (context) => {
  const query = context.callbackQuery;
  const callbackMessage = query?.message;
  const supportReply = query?.data?.match(/^reply_support_(\d{1,20})$/);
  if (supportReply) {
    if (telegramId(context.from) !== ADMIN_ID) {
      await answerCallbackQuery(context, {
        text: 'Команда доступна лише адміністратору.',
        show_alert: true,
      });
      return;
    }
    if (!callbackMessage) {
      await answerCallbackQuery(context, { text: 'Не вдалося визначити чат адміністратора.', show_alert: true });
      return;
    }
    adminReplyState.set(ADMIN_ID, {
      userId: supportReply[1],
      chatId: callbackMessage.chat.id,
    });
    await answerCallbackQuery(context, { text: 'Введіть відповідь гравцю.' });
    await sendMessage(
      callbackMessage.chat.id,
      '✍️ Введіть текст або надішліть фото відповіді гравцю.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'support:reply_cancel' }]],
        },
      },
    );
    return;
  }
  if (query?.data === 'support:reply_cancel') {
    if (telegramId(context.from) !== ADMIN_ID) {
      await answerCallbackQuery(context, {
        text: 'Команда доступна лише адміністратору.',
        show_alert: true,
      });
      return;
    }
    const pending = adminReplyState.get(ADMIN_ID);
    adminReplyState.delete(ADMIN_ID);
    await answerCallbackQuery(context, { text: 'Відповідь скасовано.' });
    if (pending && callbackMessage) {
      await sendMessage(callbackMessage.chat.id, 'Відповідь скасовано.');
    }
    return;
  }
  if (query?.data === 'support:cancel') {
    if (supportRequests.delete(telegramId(context.from))) {
      await answerCallbackQuery(context, { text: 'Звернення скасовано.' });
      if (callbackMessage) await sendMessage(callbackMessage.chat.id, 'Звернення скасовано.');
    } else {
      await answerCallbackQuery(context, { text: 'Немає активного звернення.' });
    }
    return;
  }
  const broadcastAction = query?.data?.match(/^broadcast:(send|cancel):([a-f0-9-]{36})$/i);
  if (broadcastAction) {
    if (String(context.from.id) !== ADMIN_ID) {
      await answerCallbackQuery(context, { text: 'Команда доступна лише адміністратору.', show_alert: true });
      return;
    }
    if (broadcastAction[1] === 'cancel') {
      const pending = pendingBroadcasts.get(broadcastAction[2]);
      pendingBroadcasts.delete(broadcastAction[2]);
      await answerCallbackQuery(context, { text: 'Розсилку скасовано.' });
      if (pending) {
        try {
          await editMessageReplyMarkup(context, { inline_keyboard: [] });
        } catch (error) {
          console.error('Unable to disable cancelled broadcast buttons:', error);
        }
        await sendMessage(pending.adminChatId, 'Розсилку скасовано.');
      }
    } else {
      try {
        await runBroadcast(broadcastAction[2], context);
      } catch (error) {
        console.error('Broadcast failed:', error);
        await sendMessage(callbackMessage?.chat.id || ADMIN_ID, 'Не вдалося завершити розсилку. Перевірте журнал бота.');
      }
    }
    return;
  }

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
        result.challenge.threadId,
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

onUpdate('my_chat_member', async () => {});

bot.catch((error) => {
  console.error('Telegram update failed:', error);
});

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function configureCommandMenus() {
  await Promise.all([
    bot.api.deleteMyCommands(),
    bot.api.deleteMyCommands({ scope: { type: 'all_private_chats' } }),
    bot.api.deleteMyCommands({ scope: { type: 'all_group_chats' } }),
    ...['uk', 'ru', 'en'].map((language_code) => bot.api.deleteMyCommands({ language_code })),
  ]);
  await bot.api.setMyCommands({
    commands: BOT_COMMANDS,
    scope: { type: 'default' },
  });
  await bot.api.setMyCommands({
    commands: BOT_COMMANDS,
    scope: { type: 'all_private_chats' },
  });
  await bot.api.setMyCommands({
    commands: [
      ...BOT_COMMANDS,
      { command: 'broadcast', description: 'Розсилка в усі чати та особисті' },
    ],
    scope: { type: 'chat', chat_id: Number(ADMIN_ID) },
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let bodySize = 0;
  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > 16_384) {
      throw httpError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Request body must be valid JSON.');
  }
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Bot is running');
    return;
  }

  const requestUrl = new URL(request.url, 'http://localhost');
  const isInvoiceRequest = requestUrl.pathname === '/api/create-diamonds-invoice';
  const isAdminStatusRequest = requestUrl.pathname === ADMIN_USER_STATUS_PATH;
  if (!isInvoiceRequest && !isAdminStatusRequest) {
    response.writeHead(404);
    response.end();
    return;
  }

  const origin = request.headers.origin;
  if (origin === WEBAPP_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', WEBAPP_ORIGIN);
    response.setHeader('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    if (origin !== WEBAPP_ORIGIN) {
      sendJson(response, 403, { error: 'Origin is not allowed.' });
      return;
    }
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
      'Access-Control-Max-Age': '600',
    });
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (origin && origin !== WEBAPP_ORIGIN) {
    sendJson(response, 403, { error: 'Origin is not allowed.' });
    return;
  }
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    sendJson(response, 415, { error: 'Content-Type must be application/json.' });
    return;
  }

  void (async () => {
    try {
      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'Request body must be a JSON object.');
      }
      if (isAdminStatusRequest) {
        const headerInitData = request.headers['x-telegram-init-data'];
        const initData = typeof body.initData === 'string' && body.initData.length > 0
          ? body.initData
          : headerInitData;
        const telegramUser = validateTelegramInitData(initData);
        if (String(telegramUser.id) !== ADMIN_ID) {
          throw httpError(403, 'Only the administrator can change user status.');
        }

        const userId = String(body.userId ?? '');
        const action = body.action;
        if (!/^\d{1,20}$/.test(userId) || !Number.isSafeInteger(Number(userId))) {
          throw httpError(400, 'A valid Telegram userId is required.');
        }
        if (!['set-vip', 'set-ban'].includes(action)) {
          throw httpError(400, 'Unknown user status action.');
        }
        if (typeof body.enabled !== 'boolean') {
          throw httpError(400, 'A boolean enabled value is required.');
        }
        if (userId === ADMIN_ID && action === 'set-ban' && body.enabled) {
          throw httpError(400, 'The administrator account cannot be banned.');
        }

        const userRef = users.doc(userId);
        const userStatus = await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(userRef);
          if (!snapshot.exists) throw httpError(404, 'User profile was not found.');
          if (action === 'set-vip') {
            const currentVipUntil = Number(snapshot.get('vipUntil') || 0);
            const vipUntil = body.enabled
              ? currentVipUntil > Date.now()
                ? currentVipUntil
                : Date.now() + VIP_DURATION_MS
              : 0;
            transaction.update(userRef, { vipUntil });
            return { vipUntil, banned: snapshot.get('banned') === true };
          }
          const banned = body.enabled;
          transaction.update(userRef, { banned });
          return { vipUntil: Number(snapshot.get('vipUntil') || 0), banned };
        });
        sendJson(response, 200, { userId, ...userStatus });
        return;
      }

      const userId = String(body.userId ?? '');
      const packageId = String(body.packageId ?? '');
      if (!/^\d{1,20}$/.test(userId) || !Number.isSafeInteger(Number(userId))) {
        throw httpError(400, 'A valid Telegram userId is required.');
      }
      if (!Object.hasOwn(DIAMOND_PACKAGES, packageId)) {
        throw httpError(400, 'Unknown diamond package.');
      }
      const headerInitData = request.headers['x-telegram-init-data'];
      const initData = typeof body.initData === 'string' && body.initData.length > 0
        ? body.initData
        : headerInitData;
      const telegramUser = validateTelegramInitData(initData);
      if (String(telegramUser.id) !== userId) {
        throw httpError(403, 'Telegram user does not match the invoice owner.');
      }

      const invoiceUrl = await createDiamondsInvoiceLink(userId, packageId);
      sendJson(response, 200, { invoiceUrl });
    } catch (error) {
      console.error('Failed to create a diamonds invoice:', error);
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Unable to create the invoice.',
      });
    }
  })();
});

server.listen(process.env.PORT || 3000);

async function startBot() {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await bot.init();
  await configureCommandMenus();

  const polling = run(bot, {
    exitOnError: true,
    allowedUpdates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
  });
  console.log('Бот успішно запущений!');
  await polling;
}

startBot().catch((error) => {
  console.error('Telegram bot stopped unexpectedly:', error);
  process.exitCode = 1;
});
