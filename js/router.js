/* ==== Simple view router ==== */
const viewsEl = document.getElementById('views');

// onViewShow[id] = function to run when a view becomes visible
window.onViewShow = window.onViewShow || {};

function showView(id) {
  document.body.classList.toggle('durak-game-active', id === 'durak-table');
  document.body.classList.toggle('tictactoe-active', id === 'tictactoe');
  if (id !== 'battleship') {
    document.body.classList.remove('battleship-active');
  }

  // sections
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === 'view-' + id);
  });
  // bottom nav
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === id);
  });
  // sync header balance if element exists
  const balEl = document.getElementById('balance');
  if (balEl && window.APP_STATE) balEl.textContent = window.APP_STATE.balance;

  if (window.onViewShow[id]) {
    try { window.onViewShow[id](); } catch (e) { console.error('view show error', id, e); }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.remove('battleship-active');
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      window.TWA.haptic();
      const id = b.dataset.view;
      if (id === 'battleship' && window.openBattleshipScreen) {
        window.openBattleshipScreen();
      } else {
        showView(id);
      }
    });
  });
  // default
  showView('home');
});
