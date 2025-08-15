// CardsCalendar v3 — Firebase-ready
import { ENABLED as FB_ENABLED, initFirebaseIfEnabled, onAuth, signInWithGoogle, signOutUser, syncPull, syncPush } from './firebase.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const LS_KEY = 'cardsCalendarStateV1';

const INTERVALS = [
  { days: 0, label: 'Сегодня' },
  { days: 1, label: '1 день' },
  { days: 3, label: '3 дня' },
  { days: 10, label: '10 дней' },
  { days: 30, label: '1 мес' },
  { days: 90, label: '3 мес' },
];

let state = loadState() || initState();
let session = { deckId: null, order: 'ru-first', queue: [], currentIndex: 0, showingFront: true, uid: null };
let pushTimer = null;

function debouncePush() {
  if (!session.uid) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await syncPush(session.uid, state); } catch(e) { console.warn('Cloud push failed', e); }
  }, 500);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 2000);
}

function initState() {
  const today = new Date();
  const decks = {};
  const deckList = [];
  for (let i = 0; i < 100; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const id = 'date-' + iso;
    decks[id] = { id, name: iso, type: 'dated', date: iso, cardIds: [] };
    deckList.push(id);
  }
  return { createdAt: Date.now(), decks, deckOrder: deckList, cards: {} };
}

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) { console.error('Save failed', e); }
  debouncePush();
}

function loadState() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function ensureDateDecksWindow() {
  const today = new Date();
  const needed = new Set();
  for (let i=0;i<100;i++) {
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    needed.add('date-'+d.toISOString().slice(0,10));
  }
  needed.forEach(id => {
    if (!state.decks[id]) {
      const iso = id.replace('date-','');
      state.decks[id] = { id, name: iso, type:'dated', date: iso, cardIds: [] };
      state.deckOrder.push(id);
    }
  });
  saveState();
}

function deckTile(deck) {
  const count = deck.cardIds.length;
  const subtitle = deck.type === 'dated' ? `Дата: ${deck.date}` : 'Обычная';
  return `<div class="deck" data-deck="${deck.id}">
    <strong>${deck.name}</strong>
    <small>${subtitle}</small>
    <small>${count} карт</small>
  </div>`;
}

function renderHome(highlightDeckId=null) {
  $('#home').classList.remove('hidden');
  $('#viewer').classList.add('hidden');
  ensureDateDecksWindow();

  const reg = Object.values(state.decks).filter(d => d.type === 'regular')
    .sort((a,b)=>a.name.localeCompare(b.name));
  $('#regularDecks').innerHTML = reg.length ? reg.map(d => deckTile(d)).join('') : '<div class="muted">Нет обычных колод</div>';

  const dated = Object.values(state.decks).filter(d => d.type === 'dated')
    .sort((a,b)=> (a.date||'').localeCompare(b.date||'')); 
  $('#datedDecks').innerHTML = dated.map(d => deckTile(d)).join('');

  const today = new Date();
  const end = new Date(today); end.setDate(today.getDate()+99);
  $('#rangeInfo').textContent = `${today.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`;

  if (highlightDeckId) {
    const tile = document.querySelector(`[data-deck="${highlightDeckId}"]`);
    if (tile) {
      tile.classList.add('highlight');
      setTimeout(()=> tile.classList.remove('highlight'), 1500);
      tile.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }
}

function openDeck(deckId) {
  session.deckId = deckId;
  session.order = 'ru-first';
  const deck = state.decks[deckId];
  const ids = deck.cardIds.slice();
  session.queue = shuffle(ids);
  session.currentIndex = 0;
  session.showingFront = true;
  $('#deckTitle').textContent = `Колода: ${deck.name}`;
  $('#orderLabel').textContent = 'Рус → Нид';
  $('#home').classList.add('hidden');
  $('#viewer').classList.remove('hidden');
  showCurrentCard();
}

function showCurrentCard() {
  const deck = state.decks[session.deckId];
  if (!deck || session.currentIndex >= session.queue.length) {
    $('#flipCard').textContent = '(в этой колоде карт нет)';
    $('#repeatCount').textContent = '0';
    $('#intervalHistory').textContent = '—';
    return;
  }
  const cardId = session.queue[session.currentIndex];
  const card = state.cards[cardId];
  $('#repeatCount').textContent = String(card.repeatCount || 0);
  $('#intervalHistory').innerHTML = intervalHistoryText(card);
  renderCardFace(card);
}

function renderCardFace(card) {
  const face = session.showingFront ? (session.order==='ru-first' ? card.front_ru : card.back_nl)
                                    : (session.order==='ru-first' ? card.back_nl : card.front_ru);
  $('#flipCard').textContent = face;
}

function intervalHistoryText(card) {
  const stats = card.intervalStats || {};
  return INTERVALS.map(iv => `<span class="pill">${iv.label}: ${stats[String(iv.days)]||0}</span>`).join(' ');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i++) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
function stripBOM(text) {
  if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
  return text;
}

function scheduleCard(cardId, days) {
  const iso = addDays(new Date(), days);
  const deckId = 'date-' + iso;
  if (!state.decks[deckId]) {
    state.decks[deckId] = { id: deckId, name: iso, type: 'dated', date: iso, cardIds: [] };
    state.deckOrder.push(deckId);
  }
  const deck = state.decks[deckId];
  if (!deck.cardIds.includes(cardId)) {
    deck.cardIds.push(cardId);
    const card = state.cards[cardId];
    card.repeatCount = (card.repeatCount||0) + 1;
    if (!card.intervalStats) card.intervalStats = {};
    card.intervalStats[String(days)] = (card.intervalStats[String(days)] || 0) + 1;
  }
  saveState();
  showCurrentCard();
}

async function importTxtToNewDeck(file, name) {
  try {
    const textRaw = await file.text();
    const text = stripBOM(textRaw);
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

    let createdCount = 0;
    const id = 'reg-' + Math.random().toString(36).slice(2);
    const deckName = name || ('Импорт '+new Date().toISOString().slice(0,10));
    state.decks[id] = { id, name: deckName, type:'regular', cardIds: [] };

    for (const line of lines) {
      const parts = line.split(';');
      if (parts.length < 2) continue;
      const ru = (parts[0]||'').trim();
      const nl = (parts[1]||'').trim();
      if (!ru || !nl) continue;
      const cid = 'c-' + Math.random().toString(36).slice(2);
      state.cards[cid] = { id: cid, front_ru: ru, back_nl: nl, repeatCount: 0, learned: false, intervalStats: {} };
      state.decks[id].cardIds.push(cid);
      createdCount++;
    }

    if (createdCount === 0) {
      delete state.decks[id];
      toast('Не найдено карточек в файле. Формат: "русский;нидерландский"');
      return null;
    }

    saveState();
    renderHome(id);
    toast('Импортировано карточек: ' + createdCount);
    return id;
  } catch (e) {
    console.error('Import failed', e);
    toast('Ошибка импорта файла');
    return null;
  }
}

// Events
$('#regularDecks').addEventListener('click', (e) => {
  const tile = e.target.closest('.deck'); if (!tile) return;
  openDeck(tile.dataset.deck);
});
$('#datedDecks').addEventListener('click', (e) => {
  const tile = e.target.closest('.deck'); if (!tile) return;
  openDeck(tile.dataset.deck);
});
$('#backBtn').onclick = () => renderHome();
$('#shuffleBtn').onclick = () => {
  session.queue = shuffle(session.queue);
  session.currentIndex = 0;
  session.showingFront = true;
  showCurrentCard();
};
$('#toggleOrderBtn').onclick = () => {
  session.order = session.order === 'ru-first' ? 'nl-first' : 'ru-first';
  $('#orderLabel').textContent = session.order==='ru-first' ? 'Рус → Нид' : 'Нид → Рус';
  session.showingFront = true;
  showCurrentCard();
};
$('#flipCard').onclick = () => {
  session.showingFront = !session.showingFront;
  showCurrentCard();
};

$$('.repeat-grid button').forEach(btn => {
  btn.addEventListener('click', () => {
    const deck = state.decks[session.deckId];
    if (!deck || session.currentIndex >= session.queue.length) return;
    const cardId = session.queue[session.currentIndex];
    const days = Number(btn.dataset.int);
    scheduleCard(cardId, days);
  });
});

document.addEventListener('keydown', (e) => {
  if ($('#viewer').classList.contains('hidden')) return;
  if (e.key === ' ') { e.preventDefault(); $('#flipCard').click(); }
  if (e.key === 'ArrowRight') nextCard();
  if (e.key === 'ArrowLeft') prevCard();
});

function nextCard() {
  if (session.currentIndex < session.queue.length - 1) {
    session.currentIndex++;
    session.showingFront = true;
    showCurrentCard();
  }
}
function prevCard() {
  if (session.currentIndex > 0) {
    session.currentIndex--;
    session.showingFront = true;
    showCurrentCard();
  }
}

$('#createDeckBtn').onclick = () => {
  const name = $('#deckName').value.trim() || ('Колода '+new Date().toISOString().slice(0,10));
  const id = 'reg-' + Math.random().toString(36).slice(2);
  state.decks[id] = { id, name, type:'regular', cardIds: [] };
  saveState();
  renderHome(id);
};
$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const name = $('#deckName').value.trim();
  const newId = await importTxtToNewDeck(file, name);
  e.target.value = '';
  if (newId) console.log('Imported deck', newId);
});

// ---- Firebase auth / cloud ----
(async function initCloud() {
  const enabled = await initFirebaseIfEnabled();
  const signInBtn = $('#signInBtn');
  const signOutBtn = $('#signOutBtn');
  const userLabel = $('#userLabel');

  if (!enabled) {
    signInBtn.classList.add('hidden');
    signOutBtn.classList.add('hidden');
    userLabel.classList.add('hidden');
    renderHome();
    return;
  }

  signInBtn.classList.remove('hidden');
  signOutBtn.classList.remove('hidden');
  userLabel.classList.remove('hidden');

  signInBtn.onclick = async () => {
    try { await signInWithGoogle(); } catch (e) { toast('Ошибка входа'); }
  };
  signOutBtn.onclick = async () => { await signOutUser(); };

  onAuth(async (user) => {
    if (user) {
      session.uid = user.uid;
      userLabel.textContent = user.displayName || user.email || user.uid;
      try {
        const cloud = await syncPull(user.uid);
        if (cloud && cloud.decks && cloud.cards) {
          state = cloud;
          saveState();
          toast('Загружено из облака');
        } else {
          await syncPush(user.uid, state);
          toast('Облако инициализировано');
        }
      } catch (e) { console.warn('Cloud sync error', e); }
    } else {
      session.uid = null;
      userLabel.textContent = '';
    }
    renderHome();
  });
})();

if (!FB_ENABLED) renderHome();
