// ==========================================
// 0. ENREGISTREMENT DU SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ PWA : Service Worker enregistré !', reg))
      .catch(err => console.error('❌ PWA : Erreur Service Worker :', err));
  });
}

// ==========================================
// 1. CONFIGURATION FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBbU1LtQo01r17yLBoB6oxTW7303bLhQLU",
  authDomain: "registre-eglise.firebaseapp.com",
  projectId: "registre-eglise",
  storageBucket: "registre-eglise.firebasestorage.app",
  messagingSenderId: "832296267584",
  appId: "1:832296267584:web:e92d475bf60914f67e14a5"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// CLÉ MAÎTRE DÉVELOPPEUR (Seul Dev.Assamoi peut modifier le PIN)
const DEV_MASTER_KEY = "DEV2026";

// ÉTATS GLOBAUX
let currentPin = "1234";
let membersData = [];
let transactionsData = [];
let html5QrCode = null;
let currentScannedMember = null;
let selectedAmount = 100;
let isScannerRunning = false;

// Fonctions utilitaires d'affichage sans conflit
function showElement(el, displayType = 'block') {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = displayType;
}

function hideElement(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none';
}

// ==========================================
// 2. INITIALISATION AU CHARGEMENT
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  syncPinCode();
  setupRealtimeSync();

  const pinInput = document.getElementById('pin-input');
  if (pinInput) {
    pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPinCode();
    });
  }
});

// ==========================================
// 3. DÉVERROUILLAGE & GESTION DU CODE PIN
// ==========================================
function syncPinCode() {
  db.collection("config").doc("app_security").onSnapshot((doc) => {
    if (doc.exists && doc.data().pinCode) {
      currentPin = doc.data().pinCode.toString();
    } else {
      db.collection("config").doc("app_security").set({ pinCode: "1234" });
    }
  }, () => {
    console.warn("Mode hors-ligne : PIN local (1234) utilisé");
  });
}

function checkPinCode() {
  const enteredPin = document.getElementById('pin-input').value.trim();
  const errorMsg = document.getElementById('pin-error-msg');
  const pinScreen = document.getElementById('pin-screen');
  const mainApp = document.getElementById('main-app');

  if (enteredPin === currentPin) {
    hideElement(pinScreen);
    hideElement(errorMsg);
    showElement(mainApp, 'block');
    closeAdminModal();
  } else {
    showElement(errorMsg, 'block');
    document.getElementById('pin-input').value = '';
  }
}

// ==========================================
// 4. ESPACE ADMINISTRATION DEV.ASSAMOI
// ==========================================
function openAdminModal() {
  const modal = document.getElementById('admin-modal');
  const authStep = document.getElementById('admin-auth-step');
  const changePinStep = document.getElementById('admin-change-pin-step');

  document.getElementById('dev-master-key').value = '';
  const newPinInput = document.getElementById('new-pin-input');
  if (newPinInput) newPinInput.value = '';

  showElement(authStep, 'block');
  hideElement(changePinStep);
  showElement(modal, 'flex');
}

function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  hideElement(modal);
}

function verifyDevKey() {
  const key = document.getElementById('dev-master-key').value.trim();
  const authStep = document.getElementById('admin-auth-step');
  const changePinStep = document.getElementById('admin-change-pin-step');

  if (key === DEV_MASTER_KEY) {
    hideElement(authStep);
    showElement(changePinStep, 'block');
  } else {
    alert("❌ Clé Maître Dev.Assamoi incorrecte !");
  }
}

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
    alert(`✅ Nouveau code PIN enregistré : ${newPin}`);
    currentPin = newPin;
    closeAdminModal();
  }).catch((err) => {
    alert("Erreur de sauvegarde : " + err.message);
  });
}

// ==========================================
// 5. SYNCHRONISATION FIREBASE EN TEMPS RÉEL
// ==========================================
function setupRealtimeSync() {
  db.collection("members").onSnapshot((snapshot) => {
    membersData = [];
    snapshot.forEach((doc) => {
      membersData.push({ id: doc.id, ...doc.data() });
    });
    renderMembers();
    updateStats();
  });

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
// 6. GESTION DES COTISATIONS ET PAIEMENTS
// ==========================================
function handleAddMember(e) {
  e.preventDefault();
  const input = document.getElementById('member-name-input');
  const name = input.value.trim();
  if (!name) return;

  db.collection("members").add({
    name: name,
    paidUntil: null,
    createdAt: new Date().toISOString()
  }).then(() => {
    input.value = '';
  });
}

function recordPayment(memberId, amount) {
  const member = membersData.find(m => m.id === memberId);
  if (!member) return;

  const daysToAdd = Math.floor((amount / 100) * 7);
  let baseDate = new Date();

  // Vérification sécurisée de la date courante
  if (member.paidUntil) {
    const existingDate = new Date(member.paidUntil);
    if (!isNaN(existingDate.getTime()) && existingDate > baseDate) {
      baseDate = existingDate;
    }
  }

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const newPaidUntil = baseDate.toISOString();

  db.collection("members").doc(memberId).update({ paidUntil: newPaidUntil });

  db.collection("transactions").add({
    memberId: memberId,
    memberName: member.name,
    amount: parseInt(amount),
    timestamp: new Date().toISOString(),
    daysAdded: daysToAdd
  });
}

// ==========================================
// 7. AFFICHAGE DES MEMBRES ET STATISTIQUES
// ==========================================
function renderMembers() {
  const container = document.getElementById('members-list');
  const searchInput = document.getElementById('search-member');
  if (!container) return;

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
        <strong>${m.name}</strong><br>
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
          <strong>${t.memberName}</strong><br>
          <small style="color:#777; font-size:11px;">${dateStr}</small>
        </div>
        <div class="amount-tag">+${t.amount} FCFA</div>
      </div>
    `;
    container.innerHTML += html;
    if (index < 5) recentContainer.innerHTML += html;
  });
}

// ==========================================
// 8. NAVIGATION ET SCANNER DE QR CODE
// ==========================================
function switchTab(tabId, e) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.classList.add('active');

  if (e && e.currentTarget) e.currentTarget.classList.add('active');

  if (tabId === 'tab-scan') {
    startScanner();
  } else {
    stopScanner();
  }
}

async function startScanner() {
  if (isScannerRunning) return;

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qr-reader");
  }

  try {
    isScannerRunning = true;
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        onQrCodeScanned(decodedText);
      },
      () => {}
    );
  } catch (err) {
    console.error("Erreur de démarrage du scanner :", err);
    isScannerRunning = false;
  }
}

async function stopScanner() {
  if (html5QrCode && isScannerRunning) {
    try {
      await html5QrCode.stop();
      isScannerRunning = false;
    } catch (err) {
      console.warn("Erreur lors de l'arrêt du scanner :", err);
      isScannerRunning = false;
    }
  }
}

function onQrCodeScanned(memberId) {
  // Arrêt temporaire de la lecture pour éviter la boucle infinie
  stopScanner();

  const member = membersData.find(m => m.id === memberId);
  if (!member) {
    alert("❌ QR Code invalide ou membre introuvable.");
    startScanner(); // Relance si non trouvé
    return;
  }

  currentScannedMember = member;
  document.getElementById('scanned-member-name').innerText = member.name;

  const isPaid = member.paidUntil && new Date(member.paidUntil) > new Date();
  const statusEl = document.getElementById('scanned-member-status');
  statusEl.innerText = isPaid ? "À jour" : "Non payé";
  statusEl.className = `status-badge ${isPaid ? 'success' : 'warning'}`;

  showElement(document.getElementById('scan-result-card'), 'block');
}

function setAmount(amount, e) {
  selectedAmount = amount;
  document.getElementById('custom-amount').value = amount;
  document.querySelectorAll('.btn-amount').forEach(b => b.classList.remove('active'));
  if (e && e.currentTarget) e.currentTarget.classList.add('active');
}

function confirmScannedPayment() {
  if (!currentScannedMember) return;
  const custom = parseInt(document.getElementById('custom-amount').value);
  const amount = custom > 0 ? custom : selectedAmount;

  recordPayment(currentScannedMember.id, amount);
  alert(`✅ Paiement de ${amount} FCFA validé pour ${currentScannedMember.name} !`);

  hideElement(document.getElementById('scan-result-card'));
  currentScannedMember = null;
  
  // Relance du scanner pour le prochain encaissement
  startScanner();
}

// Modal QR Code Membre
function showMemberQr(memberId, memberName) {
  document.getElementById('modal-member-name').innerText = memberName;
  const container = document.getElementById('qrcode-container');
  container.innerHTML = '';

  new QRCode(container, {
    text: memberId,
    width: 200,
    height: 200
  });

  showElement(document.getElementById('qr-modal'), 'flex');
}

function closeQrModal() {
  hideElement(document.getElementById('qr-modal'));
}
