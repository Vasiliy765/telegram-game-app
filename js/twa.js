/* ==== Telegram Web App helpers ==== */
const tg = window.Telegram?.WebApp || {
  ready() {},
  expand() {},
  enableHapticFeedback() {},
  close() {},
  showAlert() {},
  showConfirm(_message, onOk) { onOk?.(true); },
  showPopup() {},
  hapticFeedback: null,
  MainButton: {
    setText() {},
    onClick() {},
    show() {},
    hide() {},
  },
};

tg.ready();
tg.expand();
tg.enableHapticFeedback && tg.enableHapticFeedback();

const theme = tg.themeParams || {};
function cssVar(name, fallback) {
  return theme[name] || fallback;
}
const APP_BG = cssVar('bg_color', '#0f172a');
const APP_TEXT = cssVar('text_color', '#e2e8f0');
const APP_HINT = cssVar('hint_color', '#94a3b8');
const APP_BTN = cssVar('button_color', '#22c55e');
const APP_BTN_TEXT = cssVar('button_text_color', '#ffffff');

// Apply theme to body / header if available
document.documentElement.style.setProperty('--twa-bg', APP_BG);
document.documentElement.style.setProperty('--twa-text', APP_TEXT);
document.documentElement.style.setProperty('--twa-hint', APP_HINT);
document.body.style.background = APP_BG;
document.body.style.color = APP_TEXT;

window.TWA = {
  tg,
  showAlert(message) { tg.showAlert(message); },
  showConfirm(message, onOk) {
    tg.showConfirm(message, (confirmed) => { if (confirmed) onOk(); });
    return true;
  },
  toast(message) {
    tg.showPopup ? tg.showPopup({ message, buttons: [{ type: 'ok' }] }) : tg.showAlert(message);
  },
  haptic(type = 'impact') {
    if (tg.hapticFeedback) {
      try { tg.hapticFeedback[type === 'impact' ? 'impactOccurred' : 'notificationOccurred'](type === 'impact' ? 'medium' : 'success'); } catch (e) {}
    }
  },
  setMainButton(text, onClick, visible = true) {
    tg.MainButton.setText(text);
    tg.MainButton.onClick(onClick);
    visible ? tg.MainButton.show() : tg.MainButton.hide();
  },
  hideMainButton() { tg.MainButton.hide(); },
  // Send invoice for Telegram Stars (XTR). Requires a bot with payments configured.
  sendStarsInvoice(amountStars, label = 'Поповнення балансу') {
    return new Promise((resolve, reject) => {
      if (!tg.sendInvoice) {
        reject(new Error('sendInvoice не підтримується цим клієнтом Telegram'));
        return;
      }
      const payload = `stars_${amountStars}_${Date.now()}`;
      tg.sendInvoice({
        label,
        description: `${amountStars} ⭐ на ігровий баланс (demo)`,
        payload,
        provider_token: '', // empty for Stars
        currency: 'XTR',
        prices: [{ label: 'Звёзды', amount: amountStars }],
        start_parameter: 'stars-purchase',
      }, (status) => {
        if (status === 'paid') {
          resolve({ status: 'paid', payload, amount: amountStars });
        } else {
          reject(new Error('Оплата не завершена або скасована: ' + status));
        }
      });
    });
  },
  readTextFromClipboard(cb) {
    if (tg.readTextFromClipboard) tg.readTextFromClipboard(cb);
  },
  close() { tg.close(); },
  expand() { tg.expand(); },
};
