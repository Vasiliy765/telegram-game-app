/* ==== МАГАЗИН / ДОНАТ (Stars + скіни карт) ==== */
window.Store = (() => {
  const $ = (id) => document.getElementById(id);
  let balance = Number(window.APP_STATE?.balance) || 0;

  const SKINS = [
    { key: 'default', name: 'Класична', cost: 0, desc: 'Стандартна рубашка' },
    { key: 'wood', name: 'Дерев’яна', cost: 25, desc: 'Тепла текстура' },
    { key: 'neon', name: 'Неон', cost: 50, desc: 'Світлий кіберстиль' },
    { key: 'gold', name: 'Золота', cost: 100, desc: 'Преміум вигляд' },
  ];

  let owned = JSON.parse(localStorage.getItem('tga_owned') || '["default"]');
  let selected = localStorage.getItem('tga_skin') || 'default';

  function save() {
    localStorage.setItem('tga_owned', JSON.stringify(owned));
    localStorage.setItem('tga_skin', selected);
  }
  function setBalance(v) {
    const next = Number(v);
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new TypeError('Balance must be a non-negative safe integer.');
    }
    const current = Number(window.APP_STATE?.balance) || 0;
    if (!window.updateUserBalance(next - current)) {
      window.TWA.toast('Недостатньо 🪙');
      return false;
    }
    balance = next;
    save();
    return true;
  }
  function addStars(n) { setBalance(balance + n); window.TWA.toast('Нараховано ' + n + ' 🪙'); }

  function renderStars() {
    const el = $('#store-stars');
    el.innerHTML = '';
    const packs = [
      { n: 50, label: '50 ⭐' },
      { n: 200, label: '200 ⭐', primary: true },
      { n: 500, label: '500 ⭐' },
      { n: 1000, label: '1000 ⭐' },
    ];
    packs.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'star-pack' + (p.primary ? ' primary' : '');
      div.innerHTML = `<span class="pack-amount">${p.label}</span><span class="pack-label"> Stars</span>`;
      div.addEventListener('click', () => { window.TWA.haptic(); buyStars(p.n); });
      el.appendChild(div);
    });
  }

  async function buyStars(n) {
    try {
      const res = await window.TWA.sendStarsInvoice(n, 'Поповнення ігрового балансу');
      if (res.status === 'paid') addStars(n);
    } catch (e) {
      window.TWA.toast(e.message || 'Оплата скасована або не підтримується');
    }
  }

  function renderSkins() {
    const el = $('#store-skins');
    el.innerHTML = '';
    SKINS.forEach((s) => {
      const isOwned = owned.includes(s.key);
      const isSel = selected === s.key;
      const div = document.createElement('div');
      div.className = 'skin-card' + (isSel ? ' active' : '');
      div.innerHTML = `
        <div class="skin-preview" style="background:url('${CARDS.cardBackImg(s.key, 44)}') center/cover no-repeat, #0f172a;"></div>
        <div class="skin-info">
          <h4>${s.name}</h4>
          <p>${s.desc}${isOwned ? ' · куплено' : ''}${isSel ? ' · активне' : ''}</p>
        </div>
        <button class="skin-btn" ${isSel ? 'disabled' : ''} ${!isOwned ? `onclick="Store.buySkin('${s.key}',${s.cost})"` : ''}>
          ${isSel ? 'Активне' : (isOwned ? 'Обрати' : s.cost + ' 🪙')}
        </button>
      `;
      el.appendChild(div);
    });
  }

  async function buySkin(key, cost) {
    if (owned.includes(key)) {
      selected = key; save(); renderSkins(); applySkin(); return;
    }
    if (balance < cost) { window.TWA.toast('Недостатньо 🪙'); return; }
    if (!setBalance(balance - cost)) return;
    owned.push(key);
    selected = key;
    save();
    renderSkins();
    applySkin();
    window.TWA.toast('Скін куплено!');
  }

  function applySkin() {
    localStorage.setItem('tga_skin', selected);
    if (window.Durak && typeof window.Durak.render === 'function') window.Durak.render();
  }

  window.addEventListener('userbalancechange', (event) => {
    balance = event.detail.balance;
  });

  return {
    init() { balance = Number(window.APP_STATE?.balance) || 0; renderStars(); renderSkins(); setBalance(balance); },
    buyStars, buySkin, renderSkins, renderStars, setBalance, addStars,
  };
})();
