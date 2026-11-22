/* ==== Boot ==== */
window.APP_STATE = {
  balance: Math.max(0, Number.parseInt(localStorage.getItem('tga_balance') || '0', 10) || 0),
};

window.onViewShow = window.onViewShow || {};
window.onViewShow.home = () => {};
window.onViewShow.durak = () => {};

window.onViewShow['durak-room'] = () => {
  if (window.DurakRoom) window.DurakRoom.render();
};

// Handle toggle button groups for durak settings
document.addEventListener('DOMContentLoaded', () => {
  // Home stake toggle
  document.querySelectorAll('#home-stake-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#home-stake-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sheet open/close
  const sheetOverlay = document.querySelector('#sheet-overlay');
  const sheetPanel = document.querySelector('#sheet-panel');
  const homeCreateBtn = document.querySelector('#home-create-table');
  if (homeCreateBtn && sheetOverlay && sheetPanel) {
    homeCreateBtn.addEventListener('click', () => {
      sheetOverlay.classList.add('open');
      sheetPanel.classList.add('open');
    });
  }
  // Close sheet on overlay click
  if (sheetOverlay) {
    sheetOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'sheet-overlay') {
        sheetOverlay.classList.remove('open');
        sheetPanel.classList.remove('open');
      }
    });
  }

  // Sheet mode toggle
  document.querySelectorAll('#sheet-mode-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sheet-mode-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sheet deck toggle
  document.querySelectorAll('#sheet-deck-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sheet-deck-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sheet players toggle
  document.querySelectorAll('#sheet-players-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sheet-players-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSheetBankDisplay();
    });
  });

  // Sheet room type toggle
  document.querySelectorAll('#sheet-roomtype-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sheet-roomtype-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sheet stake toggle
  document.querySelectorAll('#sheet-stake-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sheet-stake-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSheetBankDisplay();
    });
  });

  // Mode toggle
  document.querySelectorAll('#durak-mode-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#durak-mode-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Deck toggle
  document.querySelectorAll('#durak-deck-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#durak-deck-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Players toggle
  document.querySelectorAll('#durak-players-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#durak-players-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update bank display when players change
      updateBankDisplay();
    });
  });

  // Room type toggle
  document.querySelectorAll('#durak-roomtype-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#durak-roomtype-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Stake toggle
  document.querySelectorAll('#durak-stake-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#durak-stake-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update bank display when stake changes
      updateBankDisplay();
    });
  });
});

function updateBankDisplay() {
  const stake = parseInt(document.querySelector('#durak-stake-toggle .toggle-btn.active')?.dataset.value || '10');
  const players = parseInt(document.querySelector('#durak-players-toggle .toggle-btn.active')?.dataset.value || '4');
  const bankValue = stake * players;
  const bankEl = document.querySelector('#durak-bank-display');
  if (bankEl) {
    bankEl.textContent = `🪙 ${stake} з кожного · банк 🪙 ${bankValue}`;
  }
}

function updateSheetBankDisplay() {
  const stake = parseInt(document.querySelector('#sheet-stake-toggle .toggle-btn.active')?.dataset.value || '10');
  const players = parseInt(document.querySelector('#sheet-players-toggle .toggle-btn.active')?.dataset.value || '4');
  const bankValue = stake * players;
  const bankEl = document.querySelector('#sheet-bank-display');
  if (bankEl) {
    bankEl.textContent = `🪙 ${stake} з кожного · банк 🪙 ${bankValue}`;
  }
}
window.onViewShow.battleship = () => {
  if (window.openBattleshipScreen) {
    window.openBattleshipScreen();
  } else if (window.Battleship) {
    window.Battleship.init();
  }
};
window.onViewShow.tictactoe = () => {
  if (window.TicTacToe) window.TicTacToe.init();
};
window.onViewShow.store = () => {
  if (window.Store) {
    window.Store.init();
    const el = document.getElementById('balance');
    if (el) el.textContent = window.APP_STATE.balance;
  }
};

window.onViewShow['durak-table'] = () => {
  if (window.DurakMultiplayer) window.DurakMultiplayer.render();
};

function readDurakSettings() {
  const selected = (selector, fallback) =>
    document.querySelector(`${selector} .toggle-btn.active`)?.dataset.value || fallback;
  return {
    mode: selected('#durak-mode-toggle', 'Простий'),
    deck: Number(selected('#durak-deck-toggle', '36')),
    players: Number(selected('#durak-players-toggle', '4')),
    roomType: selected('#durak-roomtype-toggle', 'Закрита'),
    stake: Number(selected('#durak-stake-toggle', '10')),
  };
}

function openDurakSettings() {
  if (!document.getElementById('view-durak')?.classList.contains('active')) {
    showView('durak');
  }
  document.getElementById('durak-settings-overlay')?.classList.add('open');
  document.getElementById('durak-settings-drawer')?.classList.add('open');
}

function closeDurakSettings() {
  document.getElementById('durak-settings-overlay')?.classList.remove('open');
  document.getElementById('durak-settings-drawer')?.classList.remove('open');
}

async function createDurakRoom() {
  const settings = readDurakSettings();
  try {
    await window.DurakRoom.init(settings, true);
    window.APP_STATE.durakRoomSettings = settings;
    closeDurakSettings();
    showView('durak-room');
  } catch (error) {
    console.error('Unable to create the Durak room', error);
    window.TWA.toast(error.message || 'Не вдалося створити кімнату');
  }
}

function startQuickDurakGame() {
  const settings = readDurakSettings();
  const profile = window.getCurrentPlayerProfile?.() || {
    id: 'me',
    telegramId: '',
    username: '',
    name: 'Гравець',
    photoUrl: '',
  };
  const players = [{ ...profile, isBot: false }];
  for (let index = 1; index < settings.players; index++) {
    players.push({ id: `bot-${index}`, name: `Бот ${index}`, isBot: true });
  }

  try {
    window.DurakMultiplayer.startGame({
      players,
      localPlayerId: profile.id,
      deckSize: settings.deck,
      mode: settings.mode,
      stake: settings.stake,
    });
    window.TWA.haptic();
    showView('durak-table');
  } catch (error) {
    console.error('Unable to start a quick Durak game', error);
    window.TWA.toast(error.message || 'Не вдалося запустити гру');
  }
}

// initial balance
const balEl = document.getElementById('balance');
if (balEl) balEl.textContent = window.APP_STATE.balance;

// Prevent pull-to-refresh / overscroll on mobile
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#views, .grid, .player-hand, .stars-row')) return;
}, { passive: false });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.create-btn.create').forEach((button) => {
    button.addEventListener('click', openDurakSettings);
  });
  document.querySelectorAll('.create-btn.quick').forEach((button) => {
    button.addEventListener('click', startQuickDurakGame);
  });
  document.getElementById('home-create-table')?.addEventListener('click', openDurakSettings);
  document.getElementById('durak-create-table')?.addEventListener('click', createDurakRoom);
  document.getElementById('durak-settings-close')?.addEventListener('click', closeDurakSettings);
  document.getElementById('durak-settings-overlay')?.addEventListener('click', closeDurakSettings);

  const inviteModal = document.getElementById('room-invite-modal');
  const inviteCode = document.getElementById('room-invite-code');
  const closeInvite = () => {
    inviteModal?.classList.remove('open');
    inviteModal?.setAttribute('aria-hidden', 'true');
  };
  document.getElementById('room-invite-close')?.addEventListener('click', closeInvite);
  inviteModal?.addEventListener('click', (event) => {
    if (event.target === inviteModal) closeInvite();
  });

  const roomCode = new URLSearchParams(window.location.search).get('room');
  if (roomCode && inviteModal && inviteCode) {
    inviteCode.textContent = roomCode;
    void window.DurakRoom.joinRoom(roomCode);
  }
});
