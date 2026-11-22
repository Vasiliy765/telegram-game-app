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

  // SVG for card back (pattern)
  function cardBackSvg({ skin = 'default', size = 34 } = {}) {
    const w = size, h = size * (48 / 34);
    const rx = 7 * (size / 34);
    let grad, fg, border, shadow;
    if (skin === 'wood') {
      grad = 'linear-gradient(135deg, #8b5a2b 0%, #a67c52 100%)';
      fg = '#fdf0d1'; border = '#5d3a1a';
    } else if (skin === 'neon') {
      grad = 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)';
      fg = '#22d3ee'; border = '#22d3ee';
    } else if (skin === 'gold') {
      grad = 'linear-gradient(135deg, #b45309 0%, #d97706 100%)';
      fg = '#fef3c7'; border = '#fbbf24';
    } else {
      grad = 'linear-gradient(135deg, #475569 0%, #334155 100%)';
      fg = '#cbd5e1'; border = 'rgba(255,255,255,0.2)';
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx}" fill="${grad}" stroke="${border}" stroke-width="1.5"/>
      <text x="${w/2}" y="${h/2 + 6}" font-family="Arial, sans-serif" font-size="${10 * (size/34)}" font-weight="bold" fill="${fg}" text-anchor="middle" opacity="0.35">★</text>
      <path d="M ${w*0.22} ${h*0.28} L ${w*0.78} ${h*0.28} L ${w/2} ${h*0.72} Z" fill="none" stroke="${fg}" stroke-width="1.4" opacity="0.5"/>
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

  return { RANKS, RANK_VAL, RANK_LABELS, rankLabel, SUITS, newDeck, shuffle, cardSvg, cardBackSvg, cardFaceImg, cardBackImg, beat, canBeat, cheapestBeater };
})();
