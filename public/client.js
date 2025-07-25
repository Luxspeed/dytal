// public/client.js
const socket = io();

// Client-side storage of certificates (in a real app, this would be secure)
const certificates = {
    'EMP101': 'CERT-EMP101-a4b8c7e2f3g4h5i6',
    'EMP102': 'CERT-EMP102-j7k8l9m0n1o2p3q4',
    'EMP103': 'CERT-EMP103-r5s6t7u8v9w0x1y2',
    'EMP201': 'CERT-EMP201-z3a4b5c6d7e8f9g0',
    'EMP202': 'CERT-EMP202-h1i2j3k4l5m6n7o8',
    'EMP301': 'CERT-EMP301-p9q0r1s2t3u4v5w6',

    'EMP104': 'CERT-EMP104-b1c2d3e4f5g6h7i8',
    'EMP105': 'CERT-EMP105-k9l8m7n6o5p4q3r2',
    'EMP106': 'CERT-EMP106-s1t2u3v4w5x6y7z8',
    'EMP107': 'CERT-EMP107-a9b8c7d6e5f4g3h2',
};

// --- DOM Elements ---
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const employeeSelect = document.getElementById('employee-select');
const loginButton = document.getElementById('login-button');
const loginStatus = document.getElementById('login-status');
const currentUserElem = document.getElementById('current-user-id');
const currentUserRoleElem = document.getElementById('current-user-role');
const certStatusElem = document.getElementById('cert-status');
const presenceList = document.getElementById('presence-list');
const ledgerLog = document.getElementById('ledger-log');
const aegisLog = document.getElementById('aegis-log');
const transactionTracker = document.getElementById('transaction-tracker');
const resourceSelect = document.getElementById('resource-select');
const requestAccessButton = document.getElementById('request-access-button');
const maliciousButton = document.getElementById('malicious-button');
const shtpTimeElem = document.getElementById('shtp-time');
const expiredShtpCheck = document.getElementById('expired-shtp-check');

let currentEmployeeId = null;

// --- Helper Functions ---
function createLogEntry(logEntry) {
    const entryDiv = document.createElement('div');
    if (logEntry.type === 'ACE') {
        entryDiv.className = `log-entry status-${logEntry.status}`;
        const { timeDiff } = logEntry.timeValidation;
        const timeDiffClass = timeDiff > 5000 ? 'fail' : 'ok';
        entryDiv.innerHTML = `
            <div class="log-details">[${logEntry.timestamp}] <strong>${logEntry.employeeId}</strong> requests <strong>${logEntry.resourceName}</strong></div>
            <div class="log-status"><strong>${logEntry.status}</strong></div>
            <div class="log-reason">(${logEntry.reason})</div>
            <div class="shtp-validation ${timeDiffClass}">[SHTP Δ: ${timeDiff}ms]</div>
        `;
    } else {
        entryDiv.className = 'log-entry type-SYSTEM';
        entryDiv.innerHTML = `[${new Date().toLocaleTimeString()}] ${logEntry.message}`;
    }
    return entryDiv;
}

function sendAccessRequest() {
    const resourceId = resourceSelect.value;
    if (currentEmployeeId && resourceId) {
        let shtp = Date.now();
        if (expiredShtpCheck.checked) {
            shtp -= 10000;
        }
        socket.emit('requestAccess', { employeeId: currentEmployeeId, resourceId, shtp: shtp.toString(16) });
    }
}

// --- Event Listeners ---
loginButton.addEventListener('click', () => {
    const selectedId = employeeSelect.value;
    if (selectedId) {
        loginStatus.textContent = 'Verifying certificate...';
        loginStatus.className = 'status-message';
        socket.emit('login', { employeeId: selectedId, certificate: certificates[selectedId] });
    }
});

requestAccessButton.addEventListener('click', sendAccessRequest);
maliciousButton.addEventListener('click', () => {
    for (let i = 0; i < 7; i++) {
        setTimeout(sendAccessRequest, i * 100);
    }
});

setInterval(() => {
    shtpTimeElem.textContent = Date.now().toString(16).toUpperCase();
}, 1000);

// --- Socket.IO Event Handlers ---

socket.on('loginSuccess', ({ employeeId, role }) => {
    currentEmployeeId = employeeId;
    loginContainer.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    currentUserElem.textContent = employeeId;
    currentUserRoleElem.textContent = role;
    certStatusElem.textContent = '✅';
    certStatusElem.title = "Certificate Validated";
});

socket.on('loginFailure', (message) => {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message error';
});

socket.on('updatePresence', ({ employees, aegisGuardRoom }) => {
    presenceList.innerHTML = '';
    const flaggedUsers = new Set(aegisGuardRoom);
    for (const id in employees) {
        const item = document.createElement('div');
        item.className = 'presence-item';
        if (flaggedUsers.has(id)) item.classList.add('flagged');
        item.innerHTML = `
            <span><strong>${id}</strong> (${employees[id].role})</span>
            <span><span class="status-indicator ${employees[id].presence.toLowerCase()}"></span> ${employees[id].presence}</span>
        `;
        presenceList.appendChild(item);
    }
});

socket.on('updateLedger', (logEntry) => ledgerLog.prepend(createLogEntry(logEntry)));
socket.on('updateAegisLedger', (logEntry) => aegisLog.prepend(createLogEntry(logEntry)));

socket.on('enterAegis', (flaggedEmployeeId) => {
    document.querySelectorAll('.presence-item').forEach(item => {
        if (item.textContent.includes(flaggedEmployeeId)) item.classList.add('flagged');
    });
    const msg = { message: `ANOMALY DETECTED: ${flaggedEmployeeId} moved to Aegis Guard Room.`, type: 'SYSTEM' };
    ledgerLog.prepend(createLogEntry(msg));
});

socket.on('transactionUpdate', ({ txId, status, resourceName, progress }) => {
    let card = document.getElementById(txId);
    if (!card) {
        const placeholder = transactionTracker.querySelector('.placeholder');
        if (placeholder) placeholder.remove();
        card = document.createElement('div');
        card.id = txId;
        card.className = 'transaction-card';
        card.innerHTML = `
            <div class="title">${resourceName}</div>
            <div class="status">${status}</div>
            <div class="progress-bar"><div class="progress-bar-inner"></div></div>
        `;
        transactionTracker.prepend(card);
    }
    card.querySelector('.status').textContent = status;
    card.querySelector('.progress-bar-inner').style.width = `${progress}%`;
    if (status === 'COMPLETED') {
        card.classList.add('completed');
    }
});