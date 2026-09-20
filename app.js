// ==========================================
// CONFIGURATION FIREBASE (REGISTRE EGLISE)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBbU1LtQo01r17yLBoB6oxTW7303bLhQLU",
  authDomain: "registre-eglise.firebaseapp.com",
  projectId: "registre-eglise",
  storageBucket: "registre-eglise.firebasestorage.app",
  messagingSenderId: "832296267584",
  appId: "1:832296267584:web:e92d475bf60914f67e14a5"
};

// Initialisation de Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// CLÉ MAÎTRE SEUL DEV.ASSAMOI CONNAÎT POUR CHANGER LE CODE PIN
const DEV_MASTER_KEY = "DEV2026"; // Clé secrète développeur

// ÉTATS DE L'APPLICATION
let currentPin = "1234"; // PIN par défaut
let membersData = [];
let transactionsData = [];
let html5QrCode = null;
let currentScannedMember = null;
let selectedAmount = 100;

// ==========================================
// INITIALISATION AU CHARGEMENT DE LA PAGE
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  syncPinCode();
  setupRealtimeSync();
});

// ==========================================
// DÉVERROUILLAGE & GESTION DU CODE PIN
// ==========================================

// Écoute en direct du code PIN stocké sur le cloud
function syncPinCode() {
  db.collection("config").doc("app_security").onSnapshot((doc) => {
    if (doc.exists && doc.data().pinCode) {
      currentPin = doc.data().pinCode.toString();
    } else {
      // Création du PIN par défaut (1234) sur Firestore si première utilisation
      db.collection("config").doc("app_security").set({ pinCode: "1234" });
    }
  }, (error) => {
    console.warn("Utilisation du PIN local par défaut (1234) en mode hors-ligne");
  });
}

// Vérification du code PIN saisi sur l'écran de verrouillage
function checkPinCode() {
  const enteredPin = document.getElementById('pin-input').value.trim();
  const errorMsg = document.getElementById('pin-error-msg');

  if (enteredPin === currentPin) {
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('app-hidden');
    errorMsg.classList.add('hidden');
  } else {
    errorMsg.classList.remove('hidden');
    document.getElementById('pin-input').value = '';
  }
}

// ==========================================
// ESPACE ADMINISTRATION DEV.ASSAMOI
// ==========================================

function openAdminModal() {
  document.getElementById('admin-modal').classList.remove('hidden');
  document.getElementById('admin-auth-step').classList.remove('hidden');
  document.getElementById('admin-change-pin-step').classList.add('hidden');
  document.getElementById('dev-master-key').value = '';
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.add('hidden');
}

// Vérification de la clé maître du développeur
function verifyDevKey() {
  const key = document.getElementById('dev-master-key').value.trim();
  if (key === DEV_MASTER_KEY) {
    document.getElementById('admin-auth-step').classList.add('hidden');
    document.getElementById('admin-change-pin-step').classList.remove('hidden');
  } else {
    alert("❌ Clé Maître Dev.Assamoi incorrecte ! Seul le développeur peut modifier le code PIN.");
  }
}

// Enregistrement du nouveau PIN sur le Cloud
function saveNewPinCode() {
  const newPin = document.getElementById('new-pin-input').value.trim();
  if (newPin.length < 4) {
    alert("Le code PIN doit comporter au moins 4 chiffres.");
    return;
  }

  db.collection("config").doc("app_security").set({
    pinCode: newPin,
    updatedAt: new Date().toISOString()
  }).then(() => {
    alert(`✅ Nouveau code PIN enregistré avec succès : ${newPin}`);
    currentPin = newPin;
    closeAdminModal();
  }).catch((err) => {
    alert("Erreur de sauvegarde : " + err.message);
  });
}

// ==========================================
// SYNCHRONISATION TEMPS RÉEL FIREBASE
// ==========================================

function setupRealtimeSync() {
  // 1. Écoute instantanée de la liste des membres
  db.collection("members").onSnapshot((snapshot) => {
    membersData = [];
    snapshot.forEach((doc) => {
      membersData.push({ id: doc.id, ...doc.data() });
    });
    renderMembers();
    updateStats();
  });

  // 2. Écoute instantanée de l'historique des cotisations
  db.collection("transactions").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    transactionsData = [];
    snapshot.forEach((doc) => {
      transactionsData.push({ id: doc.id, ...doc.data() });
    });
    renderHistory();
    updateStats();
  });
}

// ==========================================
// ENREGISTREMENT ET CALCUL DES COTISATIONS
// ==========================================

function handleAddMember(e) {
  e.preventDefault();
  const input = document.getElementById('member-name-input');
  const name = input.value.trim();

  if (!name) return;

  const newMember = {
    name: name,
    paidUntil: null,
    createdAt: new Date().toISOString()
  };

  db.collection("members").add(newMember).then(() => {
    input.value = '';
  });
}

// Règle des cotisations : 100 FCFA = 7 jours d'accès
function recordPayment(memberId, amount) {
  const member = membersData.find(m => m.id === memberId);
  if (!member) return;

  const daysToAdd = Math.floor((amount / 100) * 7);
  let baseDate = new Date();

  // Si le membre est déjà à jour dans le futur, prolonger à partir de sa date d'échéance
  if (member.paidUntil && new Date(member.paidUntil) > new Date()) {
    baseDate = new Date(member.paidUntil);
  }

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const newPaidUntil = baseDate.toISOString();

  // Mise à jour Cloud pour le membre
  db.collection("members").doc(memberId).update({
    paidUntil: newPaidUntil
  });

  // Ajout de la transaction sur Cloud Firestore
  db.collection("transactions").add({
    memberId: memberId,
    memberName: member.name,
    amount: parseInt(amount),
    timestamp: new Date().toISOString(),
    daysAdded: daysToAdd
  });
}

// ==========================================
// AFFICHAGE DE L'INTERFACE UTILISATEUR
// ==========================================

function renderMembers() {
  const container = document.getElementById('members-list');
  const searchInput = document.getElementById('search-member');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  container.innerHTML = '';

  const filtered = membersData.filter(m => m.name.toLowerCase().includes(search));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-msg">Aucun membre trouvé.</p>';
    return;
  }

  filtered.forEach(m => {
    const isPaid = m.paidUntil && new Date(m.paidUntil) > new Date();
    const formattedDate = m.paidUntil ? new Date(m.paidUntil).toLocaleDateString('fr-FR') : '';

    const div = document.createElement('div');
    div.className = 'member-item';
    div.innerHTML = `
      <div class="member-info">
        <strong>${m.name}</strong>
        <span class="status-badge ${isPaid ? 'success' : 'warning'}">
          ${isPaid ? `À jour (jusqu'au ${formattedDate})` : 'Non payé'}
        </span>
      </div>
      <div class="member-actions">
        <button class="btn-action pay" onclick="promptManualPayment('${m.id}')">+ Payer</button>
        <button class="btn-action qr" onclick="showMemberQr('${m.id}', '${m.name}')">📱 QR</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function promptManualPayment(memberId) {
  const member = membersData.find(m => m.id === memberId);
  if (!member) return;
  const amountStr = prompt(`Paiement pour ${member.name} (en FCFA) :`, "100");
  const amount = parseInt(amountStr);
  if (amount && amount > 0) {
    recordPayment(memberId, amount);
  }
}

function updateStats() {
  const total = transactionsData.reduce((sum, t) => sum + (t.amount || 0), 0);
  const paidCount = membersData.filter(m => m.paidUntil && new Date(m.paidUntil) > new Date()).length;
  const pendingCount = membersData.length - paidCount;

  const elTotal = document.getElementById('stat-total');
  const elPaid = document.getElementById('stat-paid-count');
  const elPending = document.getElementById('stat-pending-count');

  if (elTotal) elTotal.innerText = `${total.toLocaleString()} FCFA`;
  if (elPaid) elPaid.innerText = paidCount;
  if (elPending) elPending.innerText = pendingCount;
}

function renderHistory() {
  const container = document.getElementById('full-history-list');
  const recentContainer = document.getElementById('recent-payments-list');
  if (!container || !recentContainer) return;

  container.innerHTML = '';
  recentContainer.innerHTML = '';

  if (transactionsData.length === 0) {
    container.innerHTML = '<p class="empty-msg">Aucun paiement enregistré.</p>';
    recentContainer.innerHTML = '<p class="empty-msg">Aucun paiement récent.</p>';
    return;
  }

  transactionsData.forEach((t, index) => {
    const dateStr = new Date(t.timestamp).toLocaleString('fr-FR');
    const html = `
      <div class="history-item">
        <div>
          <strong>${t.memberName}</strong>
          <small>${dateStr}</small>
        </div>
        <div class="amount-tag">+${t.amount} FCFA</div>
      </div>
    `;
    container.innerHTML += html;
    if (index < 5) recentContainer.innerHTML += html;
  });
}

// ==========================================
// NAVIGATION ET SCANNER DE QR CODE
// ==========================================

function switchTab(tabId, e) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  if (e && e.target) e.target.classList.add('active');

  if (tabId === 'tab-scan') {
    startScanner();
  } else {
    stopScanner();
  }
}

function startScanner() {
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qr-reader");
  }
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      onQrCodeScanned(decodedText);
    },
    (errorMessage) => {}
  ).catch(err => console.log(err));
}

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().catch(err => console.log(err));
  }
}

function onQrCodeScanned(memberId) {
  const member = membersData.find(m => m.id === memberId);
  if (!member) return;

  currentScannedMember = member;
  document.getElementById('scanned-member-name').innerText = member.name;
  
  const isPaid = member.paidUntil && new Date(member.paidUntil) > new Date();
  const statusEl = document.getElementById('scanned-member-status');
  statusEl.innerText = isPaid ? "À jour" : "Non payé";
  statusEl.className = `status-badge ${isPaid ? 'success' : 'warning'}`;

  document.getElementById('scan-result-card').classList.remove('hidden');
}

function setAmount(amount, e) {
  selectedAmount = amount;
  document.getElementById('custom-amount').value = amount;
  document.querySelectorAll('.btn-amount').forEach(b => b.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
}

function confirmScannedPayment() {
  if (!currentScannedMember) return;
  const custom = parseInt(document.getElementById('custom-amount').value);
  const amount = custom > 0 ? custom : selectedAmount;

  recordPayment(currentScannedMember.id, amount);
  alert(`Paiement de ${amount} FCFA validé pour ${currentScannedMember.name} !`);
  
  document.getElementById('scan-result-card').classList.add('hidden');
  currentScannedMember = null;
}

// Modal d'affichage du QR Code
function showMemberQr(memberId, memberName) {
  document.getElementById('modal-member-name').innerText = memberName;
  const container = document.getElementById('qrcode-container');
  container.innerHTML = '';

  new QRCode(container, {
    text: memberId,
    width: 200,
    height: 200
  });

  document.getElementById('qr-modal').classList.remove('hidden');
}

function closeQrModal() {
  document.getElementById('qr-modal').classList.add('hidden');
}
