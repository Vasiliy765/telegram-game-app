/* ==== Магазин: Telegram Stars, обмін валют, скіни й VIP ==== */
window.Store = (() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_SKIN = 'classic-red';
  const EXCHANGES = [
    { diamonds: 10, coins: 150 },
    { diamonds: 50, coins: 850, bonus: '+13%' },
    { diamonds: 100, coins: 2000, bonus: '+33%' },
  ];
  const SKINS = [
    { key: DEFAULT_SKIN, name: 'Класичний червоний', desc: 'Безкоштовна класика', cost: 0 },
    { key: 'neon', name: 'Кіберпанк Неон', desc: 'Енергія нічного міста', cost: 200, currency: 'balance' },
    { key: 'gold', name: 'Золотий Злиток', desc: 'Золото завжди перемагає', cost: 15, currency: 'diamonds' },
    { key: 'spy', name: 'Тінь Шпигуна', desc: 'Загадковий агентський стиль', cost: 35, currency: 'diamonds' },
    { key: 'emerald', name: 'Королівський Смарагд', desc: 'Смарагдова колода королів', cost: 50, currency: 'diamonds' },
  ];
  const VIP_COST = 40;
  const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
  let state = {
    balance: 0,
    diamonds: 0,
    ownedSkins: [DEFAULT_SKIN],
    activeSkin: DEFAULT_SKIN,
    vipUntil: 0,
  };
  let busy = false;
  let actionStatus = '';

  function syncFromAppState() {
    const appState = window.APP_STATE || {};
    state = {
      balance: Math.round(Number(appState.balance) || 0),
      diamonds: Number(appState.diamonds) || 0,
      ownedSkins: Array.isArray(appState.ownedSkins) ? appState.ownedSkins : [DEFAULT_SKIN],
      activeSkin: appState.activeSkin || DEFAULT_SKIN,
      vipUntil: Number(appState.vipUntil) || 0,
    };
  }

  function toast(message) {
    window.TWA?.toast?.(message);
  }

  function setActionStatus(message, target = 'store-exchange-status') {
    if (target === 'store-exchange-status') actionStatus = message;
    const status = $(target);
    if (status) status.textContent = message;
  }

  async function runUserTransaction(callback) {
    if (typeof window.getCurrentUserDocumentRef !== 'function' || !window.firebase?.firestore) {
      throw new Error('Профіль Firestore ще не готовий. Спробуйте ще раз.');
    }
    const userRef = await window.getCurrentUserDocumentRef();
    const firestore = window.firebase.firestore();
    return firestore.runTransaction((transaction) => callback(transaction, userRef));
  }

  function readBalance(snapshot, field) {
    const value = window.parseNum(snapshot.get(field));
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER ||
        (field === 'diamonds' && !Number.isSafeInteger(value))) {
      throw new Error(`Некоректний баланс ${field} у Firestore.`);
    }
    return field === 'balance' ? Math.round(value) : value;
  }

  function applyPurchaseResult(result) {
    Object.assign(state, result);
    if (typeof window.applyRemoteUserStoreState === 'function') {
      window.applyRemoteUserStoreState(result, 'store-purchase');
    } else {
      Object.assign(window.APP_STATE, result);
      window.dispatchEvent(new CustomEvent('usershopprofilechange', { detail: result }));
    }
    renderSkins();
    renderVip();
  }

  async function exchangeDiamonds(diamondAmount) {
    if (busy) return;
    const offer = EXCHANGES.find((item) => item.diamonds === diamondAmount);
    if (!offer) return;
    busy = true;
    setActionStatus('Перевіряємо баланс у Firestore…');
    renderExchangeButtons();
    try {
      const result = await runUserTransaction(async (transaction, userRef) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists) throw new Error('Профіль Firestore не знайдено.');
        const diamonds = readBalance(snapshot, 'diamonds');
        const balance = readBalance(snapshot, 'balance');
        if (diamonds < offer.diamonds) throw new Error('Недостатньо діамантів для обміну.');
        if (balance + offer.coins > Number.MAX_SAFE_INTEGER) {
          throw new Error('Баланс монет перевищить допустиме значення.');
        }
        const newBalance = Math.round(balance + offer.coins);
        const newDiamonds = diamonds - offer.diamonds;
        transaction.update(userRef, {
          diamonds: newDiamonds,
          balance: newBalance,
        });
        return {
          diamonds: newDiamonds,
          balance: newBalance,
          ownedSkins: Array.isArray(snapshot.get('ownedSkins'))
            ? snapshot.get('ownedSkins')
            : [DEFAULT_SKIN],
          activeSkin: snapshot.get('activeSkin') || DEFAULT_SKIN,
          vipUntil: Number(snapshot.get('vipUntil')) || 0,
        };
      });
      applyPurchaseResult(result);
      setActionStatus(`Успішно обміняно ${offer.diamonds} 💎 на ${offer.coins} 🪙.`);
      toast(`Обмін успішний: +${offer.coins} 🪙`);
    } catch (error) {
      console.error('Unable to exchange diamonds for coins.', error);
      setActionStatus(error.message || 'Не вдалося виконати обмін.');
      toast(error.message || 'Не вдалося виконати обмін.');
    } finally {
      busy = false;
      renderExchangeButtons();
      renderSkins();
      renderVip();
    }
  }

  async function buyOrSelectSkin(key) {
    if (busy) return;
    const skin = SKINS.find((item) => item.key === key);
    if (!skin || !window.CARDS?.CARD_SKIN_KEYS.includes(key)) return;
    busy = true;
    setActionStatus(`Оновлюємо скін «${skin.name}»…`, 'store-skins-status');
    renderSkins();
    try {
      const result = await runUserTransaction(async (transaction, userRef) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists) throw new Error('Профіль Firestore не знайдено.');
        const ownedSkins = Array.isArray(snapshot.get('ownedSkins'))
          ? snapshot.get('ownedSkins')
          : [DEFAULT_SKIN];
        const alreadyOwned = ownedSkins.includes(key);
        if (!alreadyOwned && skin.cost > 0) {
          const currentBalance = readBalance(snapshot, skin.currency);
          if (currentBalance < skin.cost) {
            throw new Error(`Недостатньо ${skin.currency === 'diamonds' ? '💎' : '🪙'} для покупки.`);
          }
          const newBalance = skin.currency === 'balance'
            ? Math.round(currentBalance - skin.cost)
            : Math.round(readBalance(snapshot, 'balance'));
          const newDiamonds = skin.currency === 'diamonds'
            ? currentBalance - skin.cost
            : readBalance(snapshot, 'diamonds');
          const newOwnedSkins = [...new Set([...ownedSkins, key])];
          transaction.update(userRef, {
            balance: newBalance,
            diamonds: newDiamonds,
            ownedSkins: newOwnedSkins,
            activeSkin: key,
          });
          return {
            balance: newBalance,
            diamonds: newDiamonds,
            ownedSkins: newOwnedSkins,
            activeSkin: key,
            vipUntil: Number(snapshot.get('vipUntil')) || 0,
            newlyPurchased: true,
          };
        }
        let newOwnedSkins = ownedSkins;
        if (!alreadyOwned) {
          newOwnedSkins = [...new Set([...ownedSkins, key])];
          transaction.update(userRef, { ownedSkins: newOwnedSkins, activeSkin: key });
        } else {
          transaction.update(userRef, { activeSkin: key });
        }
        return {
          balance: readBalance(snapshot, 'balance'),
          diamonds: readBalance(snapshot, 'diamonds'),
          ownedSkins: newOwnedSkins,
          activeSkin: key,
          vipUntil: Number(snapshot.get('vipUntil')) || 0,
          newlyPurchased: false,
        };
      });
      const newlyPurchased = result.newlyPurchased;
      delete result.newlyPurchased;
      applyPurchaseResult(result);
      setActionStatus(`Скін «${skin.name}» активовано.`, 'store-skins-status');
      toast(newlyPurchased ? `Скін «${skin.name}» куплено!` : 'Скін застосовано!');
    } catch (error) {
      console.error('Unable to purchase or select a card skin.', error);
      setActionStatus(error.message || 'Не вдалося оновити скін.', 'store-skins-status');
      toast(error.message || 'Не вдалося оновити скін.');
    } finally {
      busy = false;
      renderSkins();
      renderVip();
    }
  }

  async function buyVip() {
    if (busy) return;
    busy = true;
    setActionStatus('Перевіряємо баланс діамантів…', 'store-vip-action-status');
    renderVip();
    try {
      const result = await runUserTransaction(async (transaction, userRef) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists) throw new Error('Профіль Firestore не знайдено.');
        const diamonds = readBalance(snapshot, 'diamonds');
        const balance = readBalance(snapshot, 'balance');
        if (diamonds < VIP_COST) throw new Error('Для VIP потрібно 40 💎.');
        const vipUntil = Date.now() + VIP_DURATION_MS;
        const newDiamonds = diamonds - VIP_COST;
        const newBalance = Math.round(balance);
        transaction.update(userRef, {
          diamonds: newDiamonds,
          balance: newBalance,
          vipUntil,
        });
        return {
          balance: newBalance,
          diamonds: newDiamonds,
          ownedSkins: Array.isArray(snapshot.get('ownedSkins'))
            ? snapshot.get('ownedSkins')
            : [DEFAULT_SKIN],
          activeSkin: snapshot.get('activeSkin') || DEFAULT_SKIN,
          vipUntil,
        };
      });
      applyPurchaseResult(result);
      setActionStatus('VIP-статус Агента активовано на 30 днів.', 'store-vip-action-status');
      toast('👑 VIP активовано на 30 днів!');
    } catch (error) {
      console.error('Unable to purchase VIP status.', error);
      setActionStatus(error.message || 'Не вдалося активувати VIP.', 'store-vip-action-status');
      toast(error.message || 'Не вдалося активувати VIP.');
    } finally {
      busy = false;
      renderExchangeButtons();
      renderSkins();
      renderVip();
    }
  }

  function renderExchangeButtons() {
    document.querySelectorAll('[data-diamond-exchange]').forEach((button) => {
      button.disabled = busy;
    });
    const status = $('store-exchange-status');
    if (status) status.textContent = actionStatus;
  }

  function renderSkins() {
    const element = $('store-skins');
    if (!element || !window.CARDS) return;
    element.replaceChildren();
    SKINS.forEach((skin) => {
      const owned = state.ownedSkins.includes(skin.key);
      const active = state.activeSkin === skin.key;
      const card = document.createElement('article');
      card.className = `skin-card${active ? ' active' : ''}`;
      const preview = document.createElement('div');
      preview.className = 'skin-preview';
      preview.style.backgroundImage = `url("${window.CARDS.cardBackImg(skin.key, 44)}")`;
      const info = document.createElement('div');
      info.className = 'skin-info';
      const name = document.createElement('h4');
      name.textContent = skin.name;
      const description = document.createElement('p');
      description.textContent = active
        ? `${skin.desc} · активне`
        : owned ? `${skin.desc} · куплено` : skin.desc;
      info.append(name, description);
      const button = document.createElement('button');
      button.className = 'skin-btn';
      button.type = 'button';
      button.disabled = busy || active;
      button.textContent = active
        ? 'Активне'
        : owned
          ? 'Обрати'
          : skin.cost === 0
            ? 'Отримати'
            : `${skin.cost} ${skin.currency === 'diamonds' ? '💎' : '🪙'}`;
      button.addEventListener('click', () => { void buyOrSelectSkin(skin.key); });
      card.append(preview, info, button);
      element.appendChild(card);
    });
  }

  function renderVip() {
    const status = $('store-vip-status');
    const button = $('store-vip-buy');
    if (!button) return;
    const isVip = Number(state.vipUntil || 0) > Date.now();
    button.disabled = busy;
    button.textContent = isVip ? 'Продовжити · 40 💎' : '40 💎';
    if (status) {
      status.textContent = isVip
        ? `VIP активний до ${new Date(state.vipUntil).toLocaleDateString('uk-UA')}.`
        : 'Статус не активний.';
    }
  }

  function init() {
    syncFromAppState();
    renderExchangeButtons();
    renderSkins();
    renderVip();
  }

  document.querySelectorAll('[data-diamond-exchange]').forEach((button) => {
    button.addEventListener('click', () => {
      void exchangeDiamonds(Number(button.dataset.diamondExchange));
    });
  });
  $('store-vip-buy')?.addEventListener('click', () => { void buyVip(); });
  window.addEventListener('userbalancechange', (event) => {
    state.balance = Math.round(Number(event.detail.balance) || 0);
    renderSkins();
  });
  window.addEventListener('userdiamondschange', (event) => {
    state.diamonds = event.detail.diamonds;
    renderSkins();
  });
  window.addEventListener('usershopprofilechange', (event) => {
    state.ownedSkins = event.detail.ownedSkins;
    state.activeSkin = event.detail.activeSkin;
    state.vipUntil = event.detail.vipUntil;
    renderSkins();
    renderVip();
  });

  return { init, exchangeDiamonds, buyOrSelectSkin, buyVip };
})();
