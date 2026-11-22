(function () {
  const ADMIN_ID = '7784142934';
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

  function init() {
    if (!isAdmin() || document.getElementById('sa-adm-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'sa-adm-btn';
    btn.textContent = '🛡️ Адмін-панель';
    btn.style.cssText = 'position:fixed;bottom:78px;right:14px;z-index:99990;background:#dc2626;color:#fff;border:none;border-radius:99px;padding:13px 18px;font-size:15px;font-weight:800;box-shadow:0 6px 20px rgba(220,38,38,.45);cursor:pointer';
    document.body.appendChild(btn);
    const profileBtn = document.getElementById('sa-profile-adm-btn');
    if (profileBtn) profileBtn.hidden = false;

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,14,.88);display:none;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="width:100%;max-width:390px;background:#18181f;border:1px solid #333;border-radius:18px;padding:18px;color:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:17px">🛡️ Адмін-панель</b><button id="sa-x" style="background:#27272a;border:none;color:#fff;width:30px;height:30px;border-radius:50%">✕</button></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px"><input id="sa-q" placeholder="@username або ID" style="flex:1;background:#0f0f13;border:1px solid #333;border-radius:10px;padding:10px;color:#fff"><button id="sa-s" style="background:#f43f5e;border:none;border-radius:10px;padding:0 14px;color:#fff;font-weight:700">Знайти</button></div>' +
      '<div id="sa-chips" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap"></div>' +
      '<div id="sa-st" style="font-size:12px;color:#a1a1aa;margin-bottom:10px">Введіть @username або ID</div>' +
      '<div id="sa-card" style="display:none;background:#0f0f13;border:1px solid #27272a;border-radius:12px;padding:12px">' +
      '<b id="sa-un" style="font-size:15px"></b><div id="sa-um" style="font-size:12px;color:#a1a1aa;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px"><div style="flex:1;background:#18181f;padding:8px;border-radius:8px;text-align:center"><b id="sa-uc" style="color:#fbbf24"></b></div><div style="flex:1;background:#18181f;padding:8px;border-radius:8px;text-align:center"><b id="sa-ud" style="color:#38bdf8"></b></div></div>' +
      '<input id="sa-amt" type="number" placeholder="Сума (напр. 100 або -50)" style="width:100%;box-sizing:border-box;background:#18181f;border:1px solid #333;border-radius:8px;padding:10px;color:#fff;margin-bottom:8px">' +
      '<div style="display:flex;gap:8px"><button id="sa-bc" style="flex:1;background:#eab308;color:#000;border:none;border-radius:8px;padding:10px;font-weight:800">Змінити 🪙</button><button id="sa-bd" style="flex:1;background:#0284c7;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800">Змінити 💎</button></div></div></div>';
    document.body.appendChild(ov);

    let sel = null;
    const st = ov.querySelector('#sa-st'), card = ov.querySelector('#sa-card');
    const draw = () => {
      card.style.display = sel ? 'block' : 'none';
      if (!sel) return;
      ov.querySelector('#sa-un').textContent = sel.name || 'Гравець';
      ov.querySelector('#sa-um').textContent = (sel.username ? '@' + sel.username.replace(/^@/, '') : 'без username') + ' • ID: ' + sel.id;
      ov.querySelector('#sa-uc').textContent = (sel.balance || 0) + ' 🪙';
      ov.querySelector('#sa-ud').textContent = (sel.diamonds || 0) + ' 💎';
    };

    async function chips() {
      const db = window.firebase?.firestore?.();
      if (!db) {
        st.textContent = 'Firestore недоступний.';
        return;
      }
      const w = ov.querySelector('#sa-chips'); w.innerHTML = '';
      try {
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
      const raw = ov.querySelector('#sa-q').value.trim(), db = window.firebase?.firestore?.();
      if (!raw) {
        st.textContent = 'Введіть @username або ID';
        sel = null;
        draw();
        return;
      }
      if (!db) {
        st.textContent = 'Firestore недоступний.';
        return;
      }
      sel = null;
      st.textContent = 'Пошук...';
      try {
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
      const db = window.firebase?.firestore?.(), val = Number(ov.querySelector('#sa-amt').value);
      if (!sel) {
        st.textContent = 'Спочатку знайдіть гравця.';
        return;
      }
      if (!db) {
        st.textContent = 'Firestore недоступний.';
        return;
      }
      if (!Number.isSafeInteger(val) || val === 0) {
        st.textContent = 'Введіть ненульове ціле число.';
        return;
      }
      const next = Math.max(0, Number(sel[field] || 0) + val);
      try {
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

    const openPanel = () => { ov.style.display = 'flex'; void chips(); };
    btn.onclick = openPanel;
    if (profileBtn) profileBtn.onclick = openPanel;
    ov.querySelector('#sa-x').onclick = () => ov.style.display = 'none';
    ov.querySelector('#sa-s').onclick = find;
    ov.querySelector('#sa-bc').onclick = () => apply('balance', '🪙');
    ov.querySelector('#sa-bd').onclick = () => apply('diamonds', '💎');
  }

  const t = setInterval(() => {
    if (isAdmin()) {
      init();
      clearInterval(t);
    }
  }, 600);
})();