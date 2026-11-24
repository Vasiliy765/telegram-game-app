(function () {
  const ADMIN_ID = '7784142934';
  const ADMIN_API_URL = 'https://telegram-game-app.onrender.com/api/admin/user-status';
  const ADMIN_SHOP_PRICING_API_URL = 'https://telegram-game-app.onrender.com/api/admin/shop-pricing';
  const ADMIN_NPC_API_URL = 'https://telegram-game-app.onrender.com/api/admin/npc';
  const DEFAULT_SHOP_PRICING = window.DEFAULT_SHOP_PRICING;
  const SHOP_PRICING_FIELDS = [
    { key: 'stars10', label: '10 💎 =', currency: '⭐' },
    { key: 'stars50', label: '50 💎 =', currency: '⭐' },
    { key: 'stars100', label: '100 💎 =', currency: '⭐' },
    { key: 'stars300', label: '300 💎 =', currency: '⭐' },
    { key: 'vipPrice', label: '👑 VIP (30 днів) =', currency: '💎' },
  ];
  const isAdmin = () => {
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (telegramId != null) return String(telegramId) === ADMIN_ID;
    const profile = window.getCurrentPlayerProfile?.() || {};
    const displayedId = document.getElementById('profile-user-id')?.textContent?.trim();
    return [
      profile.telegramId,
      profile.id,
      window.currentUser?.id,
      window.APP_STATE?.telegramId,
      displayedId,
    ].some((id) => id != null && String(id).trim() === ADMIN_ID);
  };

  function getFirestore() {
    const firebase = window.firebase;
    const config = window.FIREBASE_CONFIG;
    if (!firebase?.firestore || !config?.projectId) return null;

    const app = firebase.apps.find(({ name }) => name === '[DEFAULT]')
      || firebase.initializeApp(config);
    if (app.options.projectId !== config.projectId) {
      throw new Error('Firebase is initialized for a different project.');
    }
    return app.firestore();
  }

  function init() {
    if (!isAdmin()) return;
    const profileBtn = document.getElementById('sa-profile-adm-btn');
    if (!profileBtn || profileBtn.dataset.adminPanelBound === 'true') return;
    if (profileBtn) profileBtn.hidden = false;
    profileBtn.dataset.adminPanelBound = 'true';

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,14,.88);display:none;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="width:100%;max-width:390px;max-height:calc(100dvh - 32px);overflow-y:auto;background:#18181f;border:1px solid #333;border-radius:18px;padding:18px;color:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:17px">🛡️ Адмін-панель</b><button id="sa-x" style="background:#27272a;border:none;color:#fff;width:30px;height:30px;border-radius:50%">✕</button></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px"><input id="sa-q" placeholder="@username або ID" style="flex:1;background:#0f0f13;border:1px solid #333;border-radius:10px;padding:10px;color:#fff"><button id="sa-s" style="background:#f43f5e;border:none;border-radius:10px;padding:0 14px;color:#fff;font-weight:700">Знайти</button></div>' +
      '<div id="sa-chips" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap"></div>' +
      '<div id="sa-st" style="font-size:12px;color:#a1a1aa;margin-bottom:10px">Введіть @username або ID</div>' +
      '<div id="sa-card" style="display:none;background:#0f0f13;border:1px solid #27272a;border-radius:12px;padding:12px">' +
      '<b id="sa-un" style="font-size:15px"></b><div id="sa-um" style="font-size:12px;color:#a1a1aa;margin-bottom:6px"></div><div id="sa-us" style="font-size:12px;color:#f5d477;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px"><div style="flex:1;background:#18181f;padding:8px;border-radius:8px;text-align:center"><b id="sa-uc" style="color:#fbbf24"></b></div><div style="flex:1;background:#18181f;padding:8px;border-radius:8px;text-align:center"><b id="sa-ud" style="color:#38bdf8"></b></div></div>' +
      '<input id="sa-amt" type="number" placeholder="Сума (напр. 100 або -50)" style="width:100%;box-sizing:border-box;background:#18181f;border:1px solid #333;border-radius:8px;padding:10px;color:#fff;margin-bottom:8px">' +
      '<div style="display:flex;gap:8px;margin-bottom:8px"><button id="sa-bc" style="flex:1;background:#eab308;color:#000;border:none;border-radius:8px;padding:10px;font-weight:800">Змінити 🪙</button><button id="sa-bd" style="flex:1;background:#0284c7;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800">Змінити 💎</button></div>' +
      '<div style="display:grid;gap:8px"><button id="sa-vip" style="background:#a16207;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800">👑 Видати / Зняти VIP</button><button id="sa-ban" style="background:#b91c1c;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800">🚫 Заблокувати / Розблокувати</button></div></div>' +
      '<section style="margin-top:16px;padding-top:14px;border-top:1px solid #333"><b style="display:block;margin-bottom:10px">⚙️ Ціни донату та VIP</b>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      SHOP_PRICING_FIELDS.map(({ key, label, currency }) =>
        `<label style="display:grid;gap:5px;font-size:12px;color:#d4d4d8">${label}<span style="display:flex;align-items:center;gap:6px"><input id="sa-price-${key}" type="number" min="1" step="1" inputmode="numeric" style="width:100%;box-sizing:border-box;background:#0f0f13;border:1px solid #333;border-radius:8px;padding:9px;color:#fff"><span>${currency}</span></span></label>`
      ).join('') +
      '</div><button id="sa-save-prices" type="button" style="width:100%;margin-top:10px;background:#16a34a;color:#fff;border:none;border-radius:9px;padding:11px;font-weight:800">💾 Зберегти ціни</button>' +
      '<div id="sa-pricing-status" role="status" aria-live="polite" style="min-height:16px;margin-top:8px;font-size:12px;color:#a1a1aa"></div></section>' +
      '<section style="margin-top:16px;padding-top:14px;border-top:1px solid #333"><b style="display:block;margin-bottom:10px">🤖 Віртуальні гравці (NPC)</b>' +
      '<label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:12px"><span>🤖 NPC увімкнено / вимкнено</span><input id="sa-npc-enabled" type="checkbox"></label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<label style="display:grid;gap:5px;font-size:12px">Кількість NPC<input id="sa-npc-count" type="number" min="5" max="40" style="background:#0f0f13;border:1px solid #333;border-radius:8px;padding:9px;color:#fff"></label>' +
      '<label style="display:grid;gap:5px;font-size:12px">Макс. активних столів<input id="sa-npc-rooms" type="number" min="1" max="10" style="background:#0f0f13;border:1px solid #333;border-radius:8px;padding:9px;color:#fff"></label>' +
      '</div><button id="sa-save-npc" type="button" style="width:100%;margin-top:10px;background:#7c3aed;color:#fff;border:none;border-radius:9px;padding:11px;font-weight:800">Зберегти налаштування NPC</button>' +
      '<button id="sa-generate-npc" type="button" style="width:100%;margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:9px;padding:10px;font-weight:800">🔄 Перегенерувати / Оновити NPC</button>' +
      '<button id="sa-add-npc" type="button" style="width:100%;margin-top:8px;background:#16a34a;color:#fff;border:none;border-radius:9px;padding:10px;font-weight:800">Додати NPC</button>' +
      '<div id="sa-npc-status" role="status" aria-live="polite" style="min-height:16px;margin-top:8px;font-size:12px;color:#a1a1aa"></div>' +
      '<div id="sa-npc-list" style="display:grid;gap:6px;margin-top:8px"></div></section></div>';
    document.body.appendChild(ov);

    let sel = null;
    const st = ov.querySelector('#sa-st'), card = ov.querySelector('#sa-card');
    const pricingStatus = ov.querySelector('#sa-pricing-status');
    const pricingSaveButton = ov.querySelector('#sa-save-prices');
    let pricingDirty = false;
    function setPricingInputs(pricing = window.APP_STATE?.shopPricing || DEFAULT_SHOP_PRICING) {
      SHOP_PRICING_FIELDS.forEach(({ key }) => {
        ov.querySelector(`#sa-price-${key}`).value = String(pricing[key] ?? DEFAULT_SHOP_PRICING[key]);
      });
    }

    window.addEventListener('shoppricingchange', (event) => {
      if (!pricingDirty) setPricingInputs(event.detail);
    });
    SHOP_PRICING_FIELDS.forEach(({ key }) => {
      ov.querySelector(`#sa-price-${key}`).addEventListener('input', () => {
        pricingDirty = true;
        pricingStatus.textContent = '';
      });
    });

    async function saveShopPricing() {
      const prices = {};
      for (const { key } of SHOP_PRICING_FIELDS) {
        const value = Number(ov.querySelector(`#sa-price-${key}`).value);
        if (!Number.isSafeInteger(value) || value < 1 ||
            (key.startsWith('stars') && value > 2_147_483_647)) {
          pricingStatus.textContent = 'Усі ціни мають бути додатними цілими числами.';
          return;
        }
        prices[key] = value;
      }

      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        pricingStatus.textContent = 'Не вдалося перевірити Telegram-акаунт адміністратора.';
        return;
      }

      pricingSaveButton.disabled = true;
      SHOP_PRICING_FIELDS.forEach(({ key }) => {
        ov.querySelector(`#sa-price-${key}`).disabled = true;
      });
      pricingStatus.textContent = 'Зберігаємо ціни…';
      try {
        const response = await fetch(ADMIN_SHOP_PRICING_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, prices }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Не вдалося зберегти ціни.');
        if (!result.prices || typeof result.prices !== 'object') {
          throw new Error('Сервер повернув некоректну конфігурацію цін.');
        }
        window.applyShopPricing?.(result.prices);
        pricingDirty = false;
        setPricingInputs(result.prices);
        pricingStatus.textContent = '✅ Ціни оновлено!';
      } catch (error) {
        console.error('Unable to update shop pricing from the admin panel.', error);
        pricingStatus.textContent = error.message || 'Не вдалося зберегти ціни.';
      } finally {
        pricingSaveButton.disabled = false;
        SHOP_PRICING_FIELDS.forEach(({ key }) => {
          ov.querySelector(`#sa-price-${key}`).disabled = false;
        });
      }
    }

    pricingSaveButton.addEventListener('click', () => { void saveShopPricing(); });
    const npcStatus = ov.querySelector('#sa-npc-status');
    const npcList = ov.querySelector('#sa-npc-list');

    async function npcRequest(action, extra = {}) {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) throw new Error('Не вдалося перевірити Telegram-акаунт адміністратора.');
      const response = await fetch(ADMIN_NPC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, action, ...extra }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не вдалося виконати дію NPC.');
      return result;
    }

    async function loadNpcs() {
      npcStatus.textContent = 'Завантаження NPC…';
      try {
        const result = await npcRequest('get');
        ov.querySelector('#sa-npc-enabled').checked = result.config.enabled;
        ov.querySelector('#sa-npc-count').value = String(result.config.count);
        ov.querySelector('#sa-npc-rooms').value = String(result.config.maxActiveRooms);
        npcList.replaceChildren();
        for (const npc of result.npcs) {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;background:#0f0f13;border-radius:8px;padding:8px';
          const info = document.createElement('span');
          info.textContent = `${npc.avatar || '🤖'} ${npc.name || npc.id} · ${npc.personality || 'rookie'} · ${npc.difficulty || 'easy'} · ${npc.balance || 0} 🪙`;
          const edit = document.createElement('button');
          edit.textContent = 'Змінити';
          edit.style.cssText = 'border:none;border-radius:7px;padding:7px;background:#27272a;color:#fff';
          edit.addEventListener('click', async () => {
            const name = window.prompt('Ім’я NPC', npc.name || '');
            if (name == null) return;
            const avatar = window.prompt('Аватарка (emoji або URL)', npc.avatar || '🤖');
            if (avatar == null) return;
            const personality = window.prompt('Характер: aggressive, cautious, gambler, experienced, rookie', npc.personality || 'rookie');
            if (personality == null) return;
            const difficulty = window.prompt('Складність: easy, medium, hard', npc.difficulty || 'easy');
            if (difficulty == null) return;
            const balanceInput = window.prompt('Баланс NPC (ціле число)', String(npc.balance || 150));
            if (balanceInput == null) return;
            const balance = Number(balanceInput);
            if (!Number.isSafeInteger(balance) || balance < 150 || balance > 4500) {
              npcStatus.textContent = 'Баланс NPC має бути цілим числом від 150 до 4500.';
              return;
            }
            try {
              await npcRequest('upsert', { id: npc.id, npc: { name, avatar, personality, difficulty, balance } });
              npcStatus.textContent = '✅ NPC оновлено.';
              await loadNpcs();
            } catch (error) {
              npcStatus.textContent = error.message;
            }
          });
          const remove = document.createElement('button');
          remove.textContent = 'Видалити';
          remove.style.cssText = 'border:none;border-radius:7px;padding:7px;background:#7f1d1d;color:#fff';
          remove.addEventListener('click', async () => {
            if (!window.confirm(`Видалити ${npc.name || npc.id}?`)) return;
            try {
              await npcRequest('delete', { id: npc.id });
              npcStatus.textContent = '✅ NPC видалено.';
              await loadNpcs();
            } catch (error) {
              npcStatus.textContent = error.message;
            }
          });
          row.append(info, edit, remove);
          npcList.appendChild(row);
        }
        npcStatus.textContent = `NPC завантажено: ${result.npcs.length}`;
      } catch (error) {
        npcStatus.textContent = error.message;
      }
    }

    ov.querySelector('#sa-save-npc').addEventListener('click', async () => {
      try {
        const result = await npcRequest('config', {
          config: {
            enabled: ov.querySelector('#sa-npc-enabled').checked,
            count: Number(ov.querySelector('#sa-npc-count').value),
            maxActiveRooms: Number(ov.querySelector('#sa-npc-rooms').value),
          },
        });
        npcStatus.textContent = '✅ Налаштування NPC збережено.';
        await loadNpcs();
      } catch (error) {
        npcStatus.textContent = error.message;
      }
    });
    ov.querySelector('#sa-generate-npc').addEventListener('click', async () => {
      const count = Number(ov.querySelector('#sa-npc-count').value);
      if (!Number.isSafeInteger(count) || count < 5 || count > 40) {
        npcStatus.textContent = 'Кількість NPC має бути від 5 до 40.';
        return;
      }
      if (!window.confirm(`Перегенерувати ${count} NPC? Поточні профілі та статистика будуть замінені.`)) return;
      try {
        await npcRequest('generate', { count });
        npcStatus.textContent = '✅ NPC перегенеровано.';
        await loadNpcs();
      } catch (error) {
        npcStatus.textContent = error.message;
      }
    });
    ov.querySelector('#sa-add-npc').addEventListener('click', async () => {
      const name = window.prompt('Ім’я нового NPC', 'Агент Новий');
      if (!name) return;
      const avatar = window.prompt('Аватарка (emoji або URL)', '🤖') || '🤖';
      const personality = window.prompt(
        'Характер: aggressive, cautious, gambler, experienced, rookie',
        'rookie',
      ) || 'rookie';
      try {
        await npcRequest('upsert', { npc: { name, avatar, personality } });
        npcStatus.textContent = '✅ NPC додано.';
        await loadNpcs();
      } catch (error) {
        npcStatus.textContent = error.message;
      }
    });
    const draw = () => {
      card.style.display = sel ? 'block' : 'none';
      if (!sel) return;
      ov.querySelector('#sa-un').textContent = sel.name || 'Гравець';
      ov.querySelector('#sa-um').textContent = (sel.username ? '@' + sel.username.replace(/^@/, '') : 'без username') + ' • ID: ' + sel.id;
      ov.querySelector('#sa-uc').textContent = `${Math.round(Number(sel.balance) || 0)} 🪙`;
      ov.querySelector('#sa-ud').textContent = `${Math.round(Number(sel.diamonds) || 0)} 💎`;
      const isVip = Number(sel.vipUntil || 0) > Date.now();
      const isBanned = sel.banned === true;
      ov.querySelector('#sa-us').textContent = `VIP: ${isVip ? 'активний' : 'неактивний'} · Блокування: ${isBanned ? 'заблоковано' : 'ні'}`;
      ov.querySelector('#sa-vip').textContent = isVip ? '👑 Зняти VIP' : '👑 Видати VIP';
      ov.querySelector('#sa-ban').textContent = isBanned ? '🔓 Розблокувати' : '🚫 Заблокувати';
    };

    async function chips() {
      const w = ov.querySelector('#sa-chips'); w.innerHTML = '';
      try {
        const db = getFirestore();
        if (!db) {
          st.textContent = 'Firestore недоступний.';
          return;
        }
        const snap = await db.collection('users').limit(6).get();
        snap.forEach(d => {
          const u = d.data(), c = document.createElement('button');
          c.textContent = u.username ? '@' + u.username.replace(/^@/, '') : (u.name || d.id);
          c.style.cssText = 'background:#27272a;border:none;color:#fff;border-radius:6px;padding:4px 8px;font-size:11px';
          c.onclick = () => { sel = { id: d.id, ...u }; st.textContent = 'Обрано'; draw(); };
          w.appendChild(c);
        });
      } catch (error) {
        console.error('Unable to load admin-panel player suggestions.', error);
        st.textContent = 'Не вдалося завантажити гравців.';
      }
    }

    async function find() {
      const raw = ov.querySelector('#sa-q').value.trim();
      if (!raw) {
        st.textContent = 'Введіть @username або ID';
        sel = null;
        draw();
        return;
      }
      sel = null;
      st.textContent = 'Пошук...';
      try {
        const db = getFirestore();
        if (!db) {
          st.textContent = 'Firestore недоступний.';
          return;
        }
        if (/^\d+$/.test(raw)) {
          const d = await db.collection('users').doc(raw).get();
          if (d.exists) {
            sel = { id: d.id, ...d.data() };
          } else {
            for (const field of ['telegramId', 'id']) {
              const matches = await db.collection('users').where(field, '==', raw).limit(1).get();
              if (!matches.empty) {
                const match = matches.docs[0];
                sel = { id: match.id, ...match.data() };
                break;
              }
            }
          }
        }
        if (!sel) {
          const clean = raw.replace(/^@/, '').toLowerCase();
          const snap = await db.collection('users').get();
          snap.forEach(d => {
            const u = d.data();
            if (!sel && (u.username || '').replace(/^@/, '').toLowerCase() === clean) {
              sel = { id: d.id, ...u };
            }
          });
        }
        st.textContent = sel ? 'Знайдено' : 'Не знайдено';
        draw();
      } catch (error) {
        console.error('Unable to find a Firestore user from the admin panel.', error);
        st.textContent = 'Помилка пошуку гравця.';
        draw();
      }
    }

    async function apply(field, icon) {
      const val = Number(ov.querySelector('#sa-amt').value);
      if (!sel) {
        st.textContent = 'Спочатку знайдіть гравця.';
        return;
      }
      if (!Number.isSafeInteger(val) || val === 0) {
        st.textContent = 'Введіть ненульове ціле число.';
        return;
      }
      const next = Math.max(0, Math.round(Number(sel[field]) || 0) + val);
      try {
        const db = getFirestore();
        if (!db) {
          st.textContent = 'Firestore недоступний.';
          return;
        }
        await db.collection('users').doc(String(sel.id)).set({ [field]: next }, { merge: true });
        sel[field] = next;
        ov.querySelector('#sa-amt').value = '';
        st.textContent = 'Готово: ' + (val > 0 ? '+' + val : val) + ' ' + icon;
        draw();
      } catch (error) {
        console.error(`Unable to update a user's ${field} from the admin panel.`, error);
        st.textContent = 'Не вдалося змінити баланс.';
      }
    }

    async function toggleUserStatus(action) {
      if (!sel) {
        st.textContent = 'Спочатку знайдіть гравця.';
        return;
      }
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        st.textContent = 'Не вдалося перевірити Telegram-акаунт адміністратора.';
        return;
      }
      const enabled = action === 'set-vip'
        ? !(Number(sel.vipUntil || 0) > Date.now())
        : sel.banned !== true;
      try {
        const response = await fetch(ADMIN_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, userId: String(sel.id), action, enabled }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Не вдалося змінити статус гравця.');
        sel.vipUntil = result.vipUntil;
        sel.banned = result.banned;
        st.textContent = action === 'set-vip'
          ? (Number(result.vipUntil || 0) > Date.now() ? 'VIP активовано на 30 днів.' : 'VIP-статус знято.')
          : (result.banned ? 'Гравця заблоковано.' : 'Гравця розблоковано.');
        draw();
      } catch (error) {
        console.error(`Unable to update a user's ${action} status from the admin panel.`, error);
        st.textContent = error.message || 'Не вдалося змінити статус гравця.';
      }
    }

    const openPanel = () => {
      ov.style.display = 'flex';
      if (!pricingDirty) setPricingInputs();
      void chips();
      void loadNpcs();
    };
    profileBtn.onclick = openPanel;
    ov.querySelector('#sa-x').onclick = () => ov.style.display = 'none';
    ov.querySelector('#sa-s').onclick = find;
    ov.querySelector('#sa-bc').onclick = () => apply('balance', '🪙');
    ov.querySelector('#sa-bd').onclick = () => apply('diamonds', '💎');
    ov.querySelector('#sa-vip').onclick = () => toggleUserStatus('set-vip');
    ov.querySelector('#sa-ban').onclick = () => toggleUserStatus('set-ban');
  }

  const t = setInterval(() => {
    if (isAdmin()) {
      init();
      clearInterval(t);
    }
  }, 600);
})();