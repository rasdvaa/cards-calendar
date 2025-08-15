// Firebase cloud sync scaffolding
// 1) Вставь свои ключи в firebaseConfig.
// 2) Поставь ENABLED=true.
// 3) Закоммить — появятся кнопки Войти/Выйти и облачная синхронизация.

export let ENABLED = false; // ← сменить на true после вставки ключей

export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// Если оставишь "...", облако автоматически будет выключено
for (const k of Object.keys(firebaseConfig)) {
  if (!firebaseConfig[k] || firebaseConfig[k] === "...") { ENABLED = false; }
}

let app, auth, provider, db;

export async function initFirebaseIfEnabled() {
  if (!ENABLED) return false;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } =
    await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const { getFirestore, doc, getDoc, setDoc } =
    await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  db = getFirestore(app);

  initFirebaseIfEnabled.onAuthStateChanged = (cb) => onAuthStateChanged(auth, cb);
  initFirebaseIfEnabled.signIn = () => signInWithPopup(auth, provider);
  initFirebaseIfEnabled.signOut = () => signOut(auth);
  initFirebaseIfEnabled.getDoc = getDoc;
  initFirebaseIfEnabled.setDoc = setDoc;
  initFirebaseIfEnabled.doc = (p1, p2) => doc(db, p1, p2);

  return true;
}

export async function syncPull(uid) {
  if (!ENABLED) return null;
  const ref = initFirebaseIfEnabled.doc('cardsCalendar', uid);
  const snap = await initFirebaseIfEnabled.getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function syncPush(uid, state) {
  if (!ENABLED) return false;
  const ref = initFirebaseIfEnabled.doc('cardsCalendar', uid);
  await initFirebaseIfEnabled.setDoc(ref, state, { merge: true });
  return true;
}

export function onAuth(cb) {
  if (!ENABLED) return () => {};
  return initFirebaseIfEnabled.onAuthStateChanged(cb);
}

export async function signInWithGoogle() {
  if (!ENABLED) return null;
  return initFirebaseIfEnabled.signIn();
}

export async function signOutUser() {
  if (!ENABLED) return null;
  return initFirebaseIfEnabled.signOut();
}
