/* ══════════════════════════════════════
   FIREBASE INIT
══════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyCkg6v564kQ48Gg18SoSXbLNTw2_f22ow4",
  authDomain: "rpm-crm-ed0ea.firebaseapp.com",
  projectId: "rpm-crm-ed0ea",
  storageBucket: "rpm-crm-ed0ea.firebasestorage.app",
  messagingSenderId: "262270338329",
  appId: "1:262270338329:web:6f9ae75ef2709e54047188"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const leadsCol = db.collection('leads');
// Lightweight collection with ONLY price/owner/close-date info (no contact details,
// no notes) — safe for every team member to read so everyone can see the shared
// team total, plus their own personal total. The full 'leads' collection stays
// privacy-scoped as before.
const revenueCol = db.collection('revenue');
// Support module: one client doc per won deal. Uses the SAME id as the source
// lead when auto-converted (leadId as doc id) so a lead can never spawn two
// client records — re-syncing (e.g. editing the lead again) just updates it.
// Manually-added clients (no source lead) get an auto-generated Firestore id.
const clientsCol = db.collection('clients');
// Tasks belong to a client (clientId field) — fetched on-demand when that
// client's detail drawer is open, not a global always-on listener, since a
// support team could have hundreds of clients and most tasks aren't relevant
// to what's on screen right now.
const tasksCol = db.collection('tasks');
let allTasks = [];              // every task this user can see, across all clients (for the Tasks page)
let unsubscribeAllTasks = null;
// Actual bytes live in Firebase Storage (path: clients/{clientId}/{category}/{filename});
// this collection just holds searchable metadata + the download URL, same
// pattern as everything else in this app (Firestore = source of truth for
// what to show, Storage = where the blob sits).
const filesCol = db.collection('files');
const FILE_CATEGORIES = ['Contracts','Invoices','Logo','Website Files','Reports','Screenshots','Videos','Credentials','Documents'];

// Real-time notifications — one doc per (recipient, event). Any approved user
// can write a notification FOR someone else (e.g. assigning them a task), but
// can only read/manage their own — enforced in Firestore rules, not here.
const notificationsCol = db.collection('notifications');
let notifications = [];
let unsubscribeNotifications = null;

