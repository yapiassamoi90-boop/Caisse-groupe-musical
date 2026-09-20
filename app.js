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

// --- NAVIGATION D'ONCLETS ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

// --- TABLEAU DE BORD ET STATISTIQUES ---
function renderStats() {
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('stat-total').innerText = `${totalAmount.toLocaleString()} F`;

  const todayStr = new Date().toISOString().split('T')[0];
  
  let paidCount = 0;
  let pendingCount = 0;

  members.forEach(m => {
    if (m.paidUntil >= todayStr) {
      paidCount++;
    } else {
      pendingCount++;
    }
  });

  document.getElementById('stat-paid-count').innerText = paidCount;
  document.getElementById('stat-pending-count').innerText = pendingCount;
}

// --- GESTION DES MEMBRES ---
function handleAddMember(e) {
  e.preventDefault();
  const input = document.getElementById('member-name-input');
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
  const search = document.getElementById('search-member').value.toLowerCase();
  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = '';

  const filtered = members.filter(m => m.name.toLowerCase().includes(search));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-msg">Aucun membre trouvé.</p>';
    return;
  }

  filtered.forEach(m => {
    const isPaid = m.paidUntil >= todayStr;
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
        <button class="btn-primary btn-sm" style="background:#059669" onclick="showQrModal('${m.id}', '${m.name}')">📱 QR</button>
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
  if (amount && parseInt(amount) >= 100) {
    processPayment(member.id, parseInt(amount));
  }
}

function processPayment(memberId, amount) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;

  // Calcul du nombre de dimanches (100 F = 7 jours)
  const weeksPaid = Math.floor(amount / 100);
  const daysToAdd = weeksPaid * 7;

  let baseDate = new Date();
  const todayStr = baseDate.toISOString().split('T')[0];

  // Si le membre était déjà à jour dans le futur, on prolonge à partir de son échéance
  if (member.paidUntil && member.paidUntil > todayStr) {
    baseDate = new Date(member.paidUntil);
  }

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const newPaidUntil = baseDate.toISOString().split('T')[0];

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

  alert(`Paiement de ${amount} F validé pour ${member.name} ! \nÀ jour jusqu'au : ${formatDate(newPaidUntil)}`);
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
            <small style="color:var(--text-muted)">${t.date}</small>
          </div>
          <strong style="color:var(--secondary)">+${t.amount} FCFA</strong>
        </div>
      `).join('');

  if (recentList) recentList.innerHTML = transactions.slice(0, 3).map(t => `
    <div class="transaction-item">
      <div><strong>${t.memberName}</strong></div>
      <strong style="color:var(--secondary)">+${t.amount} F</strong>
    </div>
  `).join('') || '<p class="empty-msg">Aucun paiement récent.</p>';

  if (fullList) fullList.innerHTML = html;
}

// --- SCANNER QR CODE ---
function initScanner() {
  html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 });
  html5QrcodeScanner.render(onScanSuccess);
}

function onScanSuccess(decodedText) {
  const member = members.find(m => m.id === decodedText);
  if (member) {
    activeScannedMemberId = member.id;
    document.getElementById('scanned-member-name').innerText = member.name;
    const todayStr = new Date().toISOString().split('T')[0];
    const isPaid = member.paidUntil >= todayStr;

    const statusBadge = document.getElementById('scanned-member-status');
    statusBadge.innerText = isPaid ? `À jour jusqu'au ${formatDate(member.paidUntil)}` : 'Non à jour';
    statusBadge.className = `badge ${isPaid ? 'success' : 'warning'}`;

    document.getElementById('scan-result-card').classList.remove('hidden');
  } else {
    alert("QR Code non reconnu dans la base du groupe.");
  }
}

function setAmount(val) {
  document.getElementById('custom-amount').value = val;
  document.querySelectorAll('.btn-amount').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}

function confirmScannedPayment() {
  const amount = parseInt(document.getElementById('custom-amount').value);
  if (activeScannedMemberId && amount >= 100) {
    processPayment(activeScannedMemberId, amount);
    document.getElementById('scan-result-card').classList.add('hidden');
    activeScannedMemberId = null;
  }
}

// --- MODAL QR CODE ---
function showQrModal(id, name) {
  document.getElementById('modal-member-name').innerText = name;
  const container = document.getElementById('qrcode-container');
  container.innerHTML = '';
  
  new QRCode(container, {
    text: id,
    width: 180,
    height: 180,
    colorDark: "#db2777",
    colorLight: "#ffffff"
  });

  document.getElementById('qr-modal').classList.remove('hidden');
}

function closeQrModal() {
  document.getElementById('qr-modal').classList.add('hidden');
}

// --- UTILITAIRES ---
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function saveData() {
  localStorage.setItem('cm_members', JSON.stringify(members));
  localStorage.setItem('cm_transactions', JSON.stringify(transactions));
}

// --- SERVICE WORKER ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker enregistré.'))
      .catch(err => console.log('Erreur SW:', err));
  }
}
