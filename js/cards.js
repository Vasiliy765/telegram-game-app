/* ==== Cards: SVG renderer, deck, skins ==== */
window.CARDS = (() => {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RANK_VAL = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, '10': 8, J: 9, Q: 10, K: 11, A: 12 };

  const SUITS = {
    spades:   { sym: '♠', color: '#18181b', order: 0 },
    hearts:   { sym: '♥', color: '#dc2626', order: 1 },
    diamonds: { sym: '♦', color: '#dc2626', order: 2 },
    clubs:    { sym: '♣', color: '#18181b', order: 3 },
  };
  const RANK_LABELS = { J: 'В', Q: 'Д', K: 'К', A: 'Т' };
  const CARD_SKIN_KEYS = ['classic-red', 'neon', 'gold', 'spy', 'emerald'];

  function rankLabel(rank) {
    return RANK_LABELS[rank] || rank;
  }

  function newDeck(size = 36) {
    const deck = [];
    const ranks = size === 52 ? RANKS : RANKS.slice(4);
    for (const s in SUITS) {
      for (const r of ranks) {
        deck.push({ rank: r, suit: s, id: r + '_' + s });
      }
    }
    return shuffle(deck);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // SVG for a card face
  function cardSvg(rank, suit, { size = 72 } = {}) {
    const info = SUITS[suit];
    const w = size, h = size * (98 / 68);
    const scale = size / 68;
    const rx = 6 * scale;
    const c = info.color;
    const label = rankLabel(rank);
    const labelSize = label === '10' ? 13 : 17;
    const figureArt = {
      J: `<path d="M34 33 47 38v11c0 9-5 15-13 20-8-5-13-11-13-20V38z" fill="none" stroke="${c}" stroke-width="2.5"/>
        <path d="m22 65 21-27m-3-4 7 7m-28 18 5 5" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`,
      Q: `<path d="m19 54-4-20 13 10 6-16 7 16 13-10-4 20z" fill="${c}"/>
        <path d="M19 59h31" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="15" cy="31" r="3" fill="${c}"/><circle cx="34" cy="25" r="3" fill="${c}"/><circle cx="53" cy="31" r="3" fill="${c}"/>`,
      K: `<path d="m16 54-5-24 15 13 8-20 9 20 15-13-5 24z" fill="${c}"/>
        <path d="M16 60h44" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="11" cy="27" r="3.5" fill="${c}"/><circle cx="34" cy="19" r="3.5" fill="${c}"/><circle cx="58" cy="27" r="3.5" fill="${c}"/>`,
      A: `<text x="34" y="61" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="${c}" text-anchor="middle">Т</text>
        <text x="34" y="75" font-family="Arial, sans-serif" font-size="15" fill="${c}" text-anchor="middle">${info.sym}</text>`,
    };
    const center = figureArt[rank] ||
      `<text x="34" y="61" font-family="Arial, sans-serif" font-size="43" fill="${c}" text-anchor="middle">${info.sym}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx}" fill="#fff" stroke="#d4d4d8" stroke-width="${scale * 1.5}"/>
      <g transform="scale(${scale})">
        <text x="7" y="21" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="800" fill="${c}">${label}</text>
        <text x="8" y="36" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${c}">${info.sym}</text>
        ${center}
        <g transform="rotate(180 34 49)">
          <text x="7" y="21" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="800" fill="${c}">${label}</text>
          <text x="8" y="36" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${c}">${info.sym}</text>
        </g>
      </g>
    </svg>`;
  }

  function cardBackSvg({ skin = 'default', size = 34 } = {}) {
    const w = size, h = size * (48 / 34);
    const rx = 7 * (size / 34);
    const palettes = {
      'classic-red': { start: '#991b1b', end: '#dc2626', foreground: '#fee2e2', border: '#fecaca', symbol: '✦' },
      neon: { start: '#111827', end: '#312e81', foreground: '#67e8f9', border: '#22d3ee', symbol: '⚡' },
      gold: { start: '#78350f', end: '#d97706', foreground: '#fef3c7', border: '#fbbf24', symbol: '◆' },
      spy: { start: '#111827', end: '#312e3d', foreground: '#ddd6fe', border: '#a78bfa', symbol: '◈' },
      emerald: { start: '#064e3b', end: '#047857', foreground: '#d1fae5', border: '#6ee7b7', symbol: '♛' },
    };
    const palette = Object.hasOwn(palettes, skin) ? palettes[skin] : palettes['classic-red'];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.start}"/><stop offset="100%" stop-color="${palette.end}"/>
      </linearGradient></defs>
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx}" fill="url(#back)" stroke="${palette.border}" stroke-width="1.5"/>
      <text x="${w / 2}" y="${h / 2 + 6}" font-family="Arial, sans-serif" font-size="${10 * (size / 34)}" font-weight="bold" fill="${palette.foreground}" text-anchor="middle" opacity="0.78">${palette.symbol}</text>
      <path d="M ${w * 0.22} ${h * 0.28} L ${w * 0.78} ${h * 0.28} L ${w / 2} ${h * 0.72} Z" fill="none" stroke="${palette.foreground}" stroke-width="1.4" opacity="0.72"/>
    </svg>`;
  }

  function svgDataUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function cardFaceImg(rank, suit, size) {
    return svgDataUrl(cardSvg(rank, suit, { size }));
  }
  function cardBackImg(skin, size) {
    return svgDataUrl(cardBackSvg({ skin, size }));
  }

  function beat(attacking, defending, trump) {
    // returns true if `defending` beats `attacking`
    const a = SUITS[attacking.suit];
    const d = SUITS[defending.suit];
    const av = RANK_VAL[attacking.rank];
    const dv = RANK_VAL[defending.rank];
    if (defending.suit === trump && attacking.suit !== trump) return true; // any trump beats non-trump
    if (defending.suit === attacking.suit && defending.suit === trump) return dv > av; // trump vs trump
    if (defending.suit === attacking.suit && attacking.suit !== trump) return dv > av; // same suit
    return false;
  }

  function canBeat(attacking, hand, trump) {
    return hand.some((c) => beat(attacking, c, trump));
  }

  function cheapestBeater(attacking, hand, trump) {
    let best = null;
    for (const c of hand) {
      if (beat(attacking, c, trump)) {
        if (!best || RANK_VAL[c.rank] < RANK_VAL[best.rank] ||
            (RANK_VAL[c.rank] === RANK_VAL[best.rank] && SUITS[c.suit].order < SUITS[best.suit].order)) {
          best = c;
        }
      }
    }
    return best;
  }

  return { RANKS, RANK_VAL, RANK_LABELS, CARD_SKIN_KEYS, rankLabel, SUITS, newDeck, shuffle, cardSvg, cardBackSvg, cardFaceImg, cardBackImg, beat, canBeat, cheapestBeater };
})();
