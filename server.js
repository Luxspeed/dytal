// server.js

// --- 1. SETUP ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// --- 2. CORE DyTAL DATA & LOGIC (WITH CERTIFICATES) ---

// Each employee now has a unique "digital certificate"
const employees = {
    'EMP101': { role: 'Trader', presence: 'Offline', certificate: 'CERT-EMP101-a4b8c7e2f3g4h5i6' },
    'EMP102': { role: 'Trader', presence: 'Offline', certificate: 'CERT-EMP102-j7k8l9m0n1o2p3q4' },
    'EMP103': { role: 'Analyst', presence: 'Offline', certificate: 'CERT-EMP103-r5s6t7u8v9w0x1y2' },
    'EMP201': { role: 'Compliance', presence: 'Offline', certificate: 'CERT-EMP201-z3a4b5c6d7e8f9g0' },
    'EMP202': { role: 'Compliance', presence: 'Offline', certificate: 'CERT-EMP202-h1i2j3k4l5m6n7o8' },
    'EMP301': { role: 'IT Admin', presence: 'Offline', certificate: 'CERT-EMP301-p9q0r1s2t3u4v5w6' },
    
    'EMP104': { role: 'Trader', presence: 'Offline', certificate: 'CERT-EMP104-b1c2d3e4f5g6h7i8' },
    'EMP105': { role: 'Analyst', presence: 'Offline', certificate: 'CERT-EMP105-k9l8m7n6o5p4q3r2' },
    'EMP106': { role: 'Analyst', presence: 'Offline', certificate: 'CERT-EMP106-s1t2u3v4w5x6y7z8' },
    'EMP107': { role: 'Trader', presence: 'Offline', certificate: 'CERT-EMP107-a9b8c7d6e5f4g3h2' },
    // ...continue this pattern for all 15 users
    
};

const resources = {
    'RES-DB-CUST': { name: 'Customer Database', risk: 'Medium' },
    'RES-API-TRADE': { name: 'Trade Execution API', risk: 'High' },
    'RES-RPT-QTR': { name: 'Quarterly Report', risk: 'Low' },
    'RES-SYS-LOGS': { name: 'System Logs', risk: 'High' },
};

let dytalLedger = [];
let aegisLedger = [];
const requestHistory = {};
const aegisGuardRoom = new Set();
const SHTP_VALIDITY_PERIOD = 5000;
const ANOMALY_THRESHOLD_COUNT = 5;
const ANOMALY_THRESHOLD_TIME = 10000;

function anomalyDetectionEngine(employeeId) {
    const now = Date.now();
    if (!requestHistory[employeeId]) requestHistory[employeeId] = [];
    requestHistory[employeeId].push(now);
    requestHistory[employeeId] = requestHistory[employeeId].filter(ts => now - ts < ANOMALY_THRESHOLD_TIME);
    if (requestHistory[employeeId].length > ANOMALY_THRESHOLD_COUNT && !aegisGuardRoom.has(employeeId)) {
        aegisGuardRoom.add(employeeId);
        io.emit('enterAegis', employeeId);
        return true;
    }
    return false;
}

// checkAccess now returns detailed time info
function checkAccess(employeeId, resourceId, shtp) {
    const clientTime = parseInt(shtp, 16);
    const serverTime = Date.now();
    const timeDiff = Math.abs(serverTime - clientTime);
    
    const timeValidation = { clientTime, serverTime, timeDiff };

    if (isNaN(clientTime) || timeDiff > SHTP_VALIDITY_PERIOD) {
        return { granted: false, reason: "Invalid or expired SHTP timestamp.", timeValidation };
    }

    const resource = resources[resourceId];
    if (!resource) return { granted: false, reason: "Resource not found.", timeValidation };

    const requiredQuorum = { 'Low': 1, 'Medium': 2, 'High': 3 };
    const neededRole = { 'Low': ['Analyst', 'Trader', 'Compliance'], 'Medium': ['Trader', 'Compliance'], 'High': ['Trader', 'IT Admin'] }[resource.risk];
    
    let onlinePeers = 0;
    for (const id in employees) {
        if (employees[id].presence === 'Online' && neededRole.includes(employees[id].role)) onlinePeers++;
    }

    if (onlinePeers >= requiredQuorum[resource.risk]) {
        return { granted: true, reason: `Quorum of ${onlinePeers} met.`, timeValidation };
    } else {
        return { granted: false, reason: `Insufficient Quorum. Required: ${requiredQuorum[resource.risk]}, Online: ${onlinePeers}.`, timeValidation };
    }
}

// --- 3. REAL-TIME COMMUNICATION LOGIC ---

io.on('connection', (socket) => {
    let currentEmployeeId = null;

    // Login now requires and validates a certificate
    socket.on('login', ({ employeeId, certificate }) => {
        if (employees[employeeId] && employees[employeeId].certificate === certificate) {
            currentEmployeeId = employeeId;
            employees[currentEmployeeId].presence = 'Online';
            socket.emit('loginSuccess', { employeeId, role: employees[employeeId].role });
            
            io.emit('updatePresence', { employees, aegisGuardRoom: Array.from(aegisGuardRoom) });
            io.emit('updateLedger', { message: `${currentEmployeeId} came online (Certificate Validated).`, type: 'SYSTEM' });
        } else {
            socket.emit('loginFailure', 'Invalid Employee ID or Certificate.');
        }
    });

    // requestAccess now handles the low-risk transaction simulation
    socket.on('requestAccess', ({ employeeId, resourceId, shtp }) => {
        if (!employees[employeeId] || employees[employeeId].presence === 'Offline') return;
        anomalyDetectionEngine(employeeId);
        const result = checkAccess(employeeId, resourceId, shtp);
        const resource = resources[resourceId];
        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            employeeId: employeeId,
            role: employees[employeeId].role,
            resourceName: resource ? resource.name : "Unknown",
            status: result.granted ? 'GRANTED' : 'DENIED',
            reason: result.reason,
            timeValidation: result.timeValidation, // Include time details in the log
            type: 'ACE'
        };

        if (aegisGuardRoom.has(employeeId)) {
            aegisLedger.unshift(logEntry);
            io.emit('updateAegisLedger', logEntry);
        } else {
            dytalLedger.unshift(logEntry);
            io.emit('updateLedger', logEntry);

            // If access is granted for a low-risk resource, start the transaction simulation
            if (result.granted && resource && resource.risk === 'Low') {
                const txId = `TX-${Date.now()}`;
                socket.emit('transactionUpdate', { txId, status: 'INITIATED', resourceName: resource.name, progress: 25 });
                setTimeout(() => {
                    socket.emit('transactionUpdate', { txId, status: 'PROCESSING', progress: 75 });
                }, 1500);
                setTimeout(() => {
                    socket.emit('transactionUpdate', { txId, status: 'COMPLETED', progress: 100 });
                }, 3000);
            }
        }
    });

    socket.on('disconnect', () => {
        if (currentEmployeeId) {
            employees[currentEmployeeId].presence = 'Offline';
            delete requestHistory[currentEmployeeId];
            io.emit('updatePresence', { employees, aegisGuardRoom: Array.from(aegisGuardRoom) });
            io.emit('updateLedger', { message: `${currentEmployeeId} went offline.`, type: 'SYSTEM' });
        }
    });
});

// --- 4. START THE SERVER ---
const PORT = 3000;
server.listen(PORT, () => console.log(`DyTAL v2.0 server (Complete) running on https://localhost:${PORT}`));
