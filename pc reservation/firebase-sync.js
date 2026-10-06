// firebase-sync.js — letak sebelah index.html. Menyediakan window.DB (cache + Firestore masa nyata)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD16cZiQ6cD_PVIwqikVWGIuxOc_j1WMWw",
  authDomain: "adtec-jtm-booking-system.firebaseapp.com",
  projectId: "adtec-jtm-booking-system",
  storageBucket: "adtec-jtm-booking-system.firebasestorage.app",
  messagingSenderId: "1095200099249",
  appId: "1:1095200099249:web:da94801d9000db55f8cb90"
};

const db = getFirestore(initializeApp(firebaseConfig));

// kunci localStorage lama -> koleksi Firestore
const COLS = { lab_pcs_v2: "pcs", lab_bookings_v3: "bookings", lab_reports_v1: "reports", lab_audit_v1: "audit" };
// kunci tunggal -> dokumen settings/<nama>
const DOCS = { lab_slots_v1: "slots", lab_admin_pin_v1: "pin" };
const SORT = {
  lab_pcs_v2: (a, b) => a.row - b.row || a.col - b.col,
  lab_bookings_v3: (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
  lab_reports_v1: (a, b) => (b.ts || 0) - (a.ts || 0),
  lab_audit_v1: (a, b) => (b.ts || 0) - (a.ts || 0),
};

const cache = {};
const clean = o => JSON.parse(JSON.stringify(o));            // buang undefined
const sj = o => JSON.stringify(o, Object.keys(o).sort());    // banding stabil (tertib kunci)
const fire = n => window.dispatchEvent(new Event(n));

const firsts = [];
function onFirst() { let res; firsts.push(new Promise(r => (res = r))); return res; }
function onErr(done) { return e => { console.error("Firestore:", e); fire("dberror"); done(); }; }

Object.entries(COLS).forEach(([key, name]) => {
  const done = onFirst();
  onSnapshot(collection(db, name), snap => {
    cache[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(SORT[key]);
    done(); fire("dbchange");
  }, onErr(done));
});

Object.entries(DOCS).forEach(([key, name]) => {
  const done = onFirst();
  onSnapshot(doc(db, "settings", name), snap => {
    if (snap.exists()) { const d = snap.data(); cache[key] = key === "lab_slots_v1" ? d.list : d; }
    else delete cache[key];
    done(); fire("dbchange");
  }, onErr(done));
});

window.DBREADY = Promise.race([Promise.all(firsts), new Promise(r => setTimeout(r, 8000))]);

window.DB = {
  get: k => cache[k],
  set(k, val) {
    const name = COLS[k];
    if (name) {
      const prev = cache[k] || [];
      const next = val.map(clean);
      const prevMap = new Map(prev.map(o => [o.id, sj(o)]));
      const nextIds = new Set(next.map(o => o.id));
      const batch = writeBatch(db); let n = 0;
      // tulis HANYA dokumen yang berubah / dibuang (elak overwrite data orang lain)
      next.forEach(o => { if (prevMap.get(o.id) !== sj(o)) { batch.set(doc(db, name, o.id), o); n++; } });
      prev.forEach(o => { if (!nextIds.has(o.id)) { batch.delete(doc(db, name, o.id)); n++; } });
      cache[k] = next.sort(SORT[k]);
      if (n) batch.commit().catch(onErr(() => {}));
      return true;
    }
    const dn = DOCS[k];
    if (dn) {
      cache[k] = val;
      setDoc(doc(db, "settings", dn), k === "lab_slots_v1" ? { list: val } : clean(val)).catch(onErr(() => {}));
      return true;
    }
    return false;
  },
};
