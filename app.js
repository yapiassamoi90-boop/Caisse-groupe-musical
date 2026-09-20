// --- INITIALISATION DES DONNÉES EN STORAGE ---
let members = JSON.parse(localStorage.getItem('cm_members')) || [];
let transactions = JSON.parse(localStorage.getItem('cm_transactions')) || [];
let activeScannedMemberId = null;
let html5QrcodeScanner = null;

// --- DÉMARRAGE DE L'APPLICATION ---
document.addEventListener("DOMContentLoaded", () => {
  renderStats();
  renderMembers();
  renderHistory();
  initScanner();
  registerServiceWorker();
});

// --- UTILITAIRES DE DATE (Temps local) ---
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function addDaysToDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  
  const resYear = date.getFullYear();
  const resMonth = String(date.getMonth() + 1).padStart(2, '0');
  const resDay = String(date.getDate()).padStart(2, '0');
  return `${resYear}-${resMonth}-${resDay}`;
}

// --- NAVIGATION D'ONGLETS ---
function switchTab(tabId, evt) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
}

// --- TABLEAU DE BORD ET STATISTIQUES ---
function renderStats() {
  const totalAmount = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalElem = document.getElementById('stat-total');
  if (totalElem) totalElem.innerText = `${totalAmount.toLocaleString('fr-FR')} F`;

  const todayStr = getTodayString();
  let paidCount = 0;
  let pendingCount = 0;

  members.forEach(m => {
    if (m.paidUntil && m.paidUntil >= todayStr) {
      paidCount++;
    } else {
      pendingCount++;
    }
  });

  const paidElem = document.getElementById('stat-paid-count');
  const pendingElem = document.getElementById('stat-pending-count');
  if (paidElem) paidElem.innerText = paidCount;
  if (pendingElem) pendingElem.innerText = pendingCount;
}

// --- GESTION DES MEMBRES ---
function handleAddMember(e) {
  if (e && e.preventDefault) e.preventDefault();

  const input = document.getElementById('member-name-input');
  if (!input) return;

  const name = input.value.trim();
  if (!name) return;

  const newMember = {
    id: 'MBR-' + Date.now(),
    name: name,
    paidUntil: '2000-01-01' // Date passée par défaut (non payé)
  };

  members.push(newMember);
  saveData();
  input.value = '';
  renderMembers();
  renderStats();
  showQrModal(newMember.id, newMember.name);
}

function renderMembers() {
  const container = document.getElementById('members-list');
  if (!container) return;

  const searchInput = document.getElementById('search-member');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const todayStr = getTodayString();

  container.innerHTML = '';

  const filtered = members.filter(m => m.name.toLowerCase().includes(search));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-msg">Aucun membre trouvé.</p>';
    return;
  }

  filtered.forEach(m => {
    const isPaid = m.paidUntil && m.paidUntil >= todayStr;
    const safeName = m.name.replace(/'/g, "\\'");
    const div = document.createElement('div');
    div.className = 'member-item';
    div.innerHTML = `
      <div>
        <strong>${m.name}</strong><br>
        <span class="badge ${isPaid ? 'success' : 'warning'}">
          ${isPaid ? 'À jour (jusqu\'au ' + formatDate(m.paidUntil) + ')' : 'Non payé'}
        </span>
      </div>
      <div>
        <button class="btn-primary btn-sm" onclick="quickPay('${m.id}')">➕ Payer</button>
        <button class="btn-primary btn-sm" style="background:#059669" onclick="showQrModal('${m.id}', '${safeName}')">📱 QR</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// --- PAIEMENT ET CALCULS DES AVANCES ---
function quickPay(memberId) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;

  const amount = prompt(`Encaisser pour ${member.name} (en FCFA):`, 100);
  if (amount && parseInt(amount, 10) >= 100) {
    processPayment(member.id, parseInt(amount, 10));
  }
}

function processPayment(memberId, amount) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;

  // Calcul du nombre de jours (100 F = 7 jours)
  const weeksPaid = Math.floor(amount / 100);
  const daysToAdd = weeksPaid * 7;

  const todayStr = getTodayString();

  // Si le membre est déjà à jour dans le futur, on prolonge à partir de son échéance
  let baseDateStr = (member.paidUntil && member.paidUntil > todayStr) ? member.paidUntil : todayStr;
  const newPaidUntil = addDaysToDate(baseDateStr, daysToAdd);

  member.paidUntil = newPaidUntil;

  // Enregistrer la transaction
  transactions.unshift({
    id: 'TR-' + Date.now(),
    memberName: member.name,
    amount: amount,
    date: new Date().toLocaleString('fr-FR')
  });

  saveData();
  renderStats();
  renderMembers();
  renderHistory();

  alert(`Paiement de ${amount} F validé pour ${member.name} !\nÀ jour jusqu'au : ${formatDate(newPaidUntil)}`);
}

// --- HISTORIQUE ---
function renderHistory() {
  const recentList = document.getElementById('recent-payments-list');
  const fullList = document.getElementById('full-history-list');

  const html = transactions.length === 0 
    ? '<p class="empty-msg">Aucune transaction.</p>' 
    : transactions.map(t => `
        <div class="transaction-item">
          <div>
            <strong>${t.memberName}</strong><br>
            <small style="color:var(--text-muted, #666)">${t.date}</small>
          </div>
          <strong style="color:var(--secondary, #059669)">+${t.amount} FCFA</strong>
        </div>
      `).join('');

  if (recentList) {
    recentList.innerHTML = transactions.length === 0
      ? '<p class="empty-msg">Aucun paiement récent.</p>'
      : transactions.slice(0, 3).map(t => `
          <div class="transaction-item">
            <div><strong>${t.memberName}</strong></div>
            <strong style="color:var(--secondary, #059669)">+${t.amount} F</strong>
          </div>
        `).join('');
  }

  if (fullList) fullList.innerHTML = html;
}

// --- SCANNER QR CODE ---
function initScanner() {
  const readerElem = document.getElementById("qr-reader");
  if (!readerElem || typeof Html5QrcodeScanner === 'undefined') return;

  try {
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
  } catch (err) {
    console.error("Erreur d'initialisation du scanner :", err);
  }
}

function onScanSuccess(decodedText) {
  const member = members.find(m => m.id === decodedText);
  if (member) {
    activeScannedMemberId = member.id;

    const nameElem = document.getElementById('scanned-member-name');
    if (nameElem) nameElem.innerText = member.name;

    const todayStr = getTodayString();
    const isPaid = member.paidUntil && member.paidUntil >= todayStr;

    const statusBadge = document.getElementById('scanned-member-status');
    if (statusBadge) {
      statusBadge.innerText = isPaid ? `À jour jusqu'au ${formatDate(member.paidUntil)}` : 'Non à jour';
      statusBadge.className = `badge ${isPaid ? 'success' : 'warning'}`;
    }

    const resultCard = document.getElementById('scan-result-card');
    if (resultCard) resultCard.classList.remove('hidden');
  } else {
    alert("QR Code non reconnu dans la base du groupe.");
  }
}

function setAmount(val, evt) {
  const input = document.getElementById('custom-amount');
  if (input) input.value = val;

  document.querySelectorAll('.btn-amount').forEach(btn => btn.classList.remove('active'));
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
}

function confirmScannedPayment() {
  const amountInput = document.getElementById('custom-amount');
  const amount = amountInput ? parseInt(amountInput.value, 10) : 0;

  if (activeScannedMemberId && amount >= 100) {
    processPayment(activeScannedMemberId, amount);
    const resultCard = document.getElementById('scan-result-card');
    if (resultCard) resultCard.classList.add('hidden');
    activeScannedMemberId = null;
  }
}

// --- MODAL QR CODE ---
function showQrModal(id, name) {
  const nameElem = document.getElementById('modal-member-name');
  if (nameElem) nameElem.innerText = name;

  const container = document.getElementById('qrcode-container');
  if (!container) return;

  container.innerHTML = '';
  
  if (typeof QRCode !== 'undefined') {
    new QRCode(container, {
      text: id,
      width: 180,
      height: 180,
      colorDark: "#db2777",
      colorLight: "#ffffff"
    });
  }

  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.add('hidden');
}

// --- UTILITAIRES DE STOCKAGE ---
function saveData() {
  localStorage.setItem('cm_members', JSON.stringify(members));
  localStorage.setItem('cm_transactions', JSON.stringify(transactions));
}

// --- SERVICE WORKER ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker enregistré.'))
      .catch(err => console.error('Erreur SW:', err));
  }
}
