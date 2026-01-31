// State Management
let matches = JSON.parse(localStorage.getItem('matches')) || [];
let tournaments = JSON.parse(localStorage.getItem('tournaments')) || [];
let db = null;
let userId = localStorage.getItem('userId');
let playerName = localStorage.getItem('playerName') || '';
if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userId', userId);
}
document.getElementById('displayUserId').textContent = userId;

let firebaseConfig = null;

// DOM Elements
const matchForm = document.getElementById('matchForm');
const totalMatchesEl = document.getElementById('totalMatches');
const totalGoalsEl = document.getElementById('totalGoals');
const totalSpentEl = document.getElementById('totalSpent');
const sidebarTotalSpentEl = document.getElementById('sidebarTotalSpent');
const historyListEl = document.getElementById('historyList');
const recentMatchesListEl = document.getElementById('recentMatchesList');
const statsChartEl = document.getElementById('statsChart');
const goalsChartEl = document.getElementById('goalsChart');
const createTournamentBtn = document.getElementById('createTournamentBtn');
const tournamentsListEl = document.getElementById('tournamentsList');

// New Cost Elements
const totalCostEl = document.getElementById('totalCost');
const percentageEl = document.getElementById('percentage');
const calculatedShareEl = document.getElementById('calculatedShare');

// Online Elements
const joinTournamentBtn = document.getElementById('joinTournamentBtn');
const joinTournamentCodeInput = document.getElementById('joinTournamentCode');
const joinTournamentNameInput = document.getElementById('joinTournamentName');
const isOnlineTournamentCheckbox = document.getElementById('isOnlineTournament');

// Initialize Firebase if config exists
function initFirebase() {
    // Prioritize global config from config.js
    if (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig) {
        firebaseConfig = window.APP_CONFIG.firebaseConfig;
    } else {
        firebaseConfig = JSON.parse(localStorage.getItem('firebaseConfig')) || null;
    }

    if (firebaseConfig && firebase.apps.length === 0) {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            if (firebase.analytics) {
                firebase.analytics();
            }
            const auth = firebase.auth();
            const handleReady = (u) => {
                if (u) {
                    userId = u.uid;
                    localStorage.setItem('userId', userId);
                    const el = document.getElementById('displayUserId');
                    if (el) el.textContent = userId;
                    // Sync local player name with auth profile
                    const displayName = u.displayName || '';
                    if (displayName) {
                        playerName = displayName;
                        localStorage.setItem('playerName', playerName);
                    }
                    syncMatches();
                    tournaments.forEach(t => {
                        if (t.isOnline && t.code) {
                            subscribeToTournament(t.code);
                        }
                    });
                }
            };
            auth.onAuthStateChanged(handleReady);
            // No autenticación anónima automática
        } catch (e) {
            console.error("Firebase init error:", e);
            Swal.fire('Error', 'Error al conectar con Firebase. Revisa tu configuración.', 'error');
        }
    }
}

function syncMatches() {
    if (!db || !userId) return;
    
    // Listen for my matches
    db.collection('matches').where('userId', '==', userId).onSnapshot((snapshot) => {
        let needsUpdate = false;
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
                // Check if we already have it locally with same data
                const index = matches.findIndex(m => m.id === data.id);
                if (index === -1) {
                    matches.push(data);
                    needsUpdate = true;
                } else if (JSON.stringify(matches[index]) !== JSON.stringify(data)) {
                    matches[index] = data;
                    needsUpdate = true;
                }
            }
            if (change.type === "removed") {
                matches = matches.filter(m => m.id !== data.id);
                needsUpdate = true;
            }
        });
        
        if (needsUpdate) {
            matches.sort((a, b) => new Date(b.date) - new Date(a.date)); // Keep sorted
            localStorage.setItem('matches', JSON.stringify(matches));
            updateUI();
        }
    });
}

function saveMatchToCloud(match) {
    if (!db || !userId) return;
    // Add userId to match data
    const matchData = { ...match, userId: userId, playerName: playerName || null };
    db.collection('matches').doc(String(match.id)).set(matchData)
        .catch(err => console.error("Error saving match to cloud:", err));
}

function deleteMatchFromCloud(id) {
    if (!db) return;
    db.collection('matches').doc(String(id)).delete()
        .catch(err => console.error("Error deleting match from cloud:", err));
}

function subscribeToTournament(code) {
    if (!db) return;
    db.collection('tournaments').doc(code).onSnapshot((doc) => {
        if (doc.exists) {
            const remoteData = doc.data();
            const index = tournaments.findIndex(t => t.code === code);
            if (index !== -1) {
                tournaments[index] = { ...tournaments[index], ...remoteData };
                localStorage.setItem('tournaments', JSON.stringify(tournaments));
                renderTournaments();
                populateTournamentSelect();
            }
        }
    });
}

window.saveFirebaseConfig = function() {
    const input = document.getElementById('firebaseConfigInput').value;
    try {
        const config = JSON.parse(input);
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        firebaseConfig = config;
        Swal.fire('¡Éxito!', 'Configuración guardada. Reiniciando...', 'success').then(() => {
            location.reload();
        });
    } catch (e) {
        Swal.fire('Error', 'Formato JSON inválido', 'error');
    }
};

// Chart Instances
let myChart = null;
let goalsChart = null;

function populateTournamentSelect() {
    const select = document.getElementById('matchTournament');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="none">Ninguno</option>';
    tournaments.forEach(t => {
        const value = t.code ? t.code : ('local-' + t.id);
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = t.name + (t.isOnline ? ' (Online)' : '');
        select.appendChild(opt);
    });
    if (current) {
        select.value = current;
    }
}
// Initialize
function computeStandings(list) {
    const byPlayer = {};
    list.sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
        return da - db;
    });
    list.forEach(m => {
        const name = (m.playerName && m.playerName.trim()) ? m.playerName.trim() : 'Jugador';
        if (!byPlayer[name]) {
            byPlayer[name] = { name, matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, points: 0, spent: 0, results: [] };
        }
        const r = byPlayer[name];
        r.matches += 1;
        r.goals += parseInt(m.goals || 0);
        r.spent += parseFloat(m.cost || 0);
        if (m.result === 'win') { r.wins += 1; r.points += 3; r.results.push('W'); }
        else if (m.result === 'draw') { r.draws += 1; r.points += 1; r.results.push('D'); }
        else { r.losses += 1; r.results.push('L'); }
    });
    const arr = Object.values(byPlayer).map(p => ({
        ...p,
        last5: p.results.slice(-5).join(' ')
    }));
    arr.sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
    return arr;
}

async function openTournamentTable(value) {
    const modal = document.getElementById('tournamentTableModal');
    const titleEl = document.getElementById('tournamentTableTitle');
    const statusEl = document.getElementById('tournamentTableStatus');
    const bodyEl = document.getElementById('tournamentTableBody');
    const sortEl = document.getElementById('tournamentSortSelect');
    const prizeInfoEl = document.getElementById('tournamentPrizeInfo');
    if (!modal || !bodyEl) return;
    modal.classList.remove('hidden');
    statusEl.textContent = 'Cargando...';
    bodyEl.innerHTML = '';
    let tournament = null;
    if (value && value.startsWith('local-')) {
        const localId = parseInt(value.replace('local-', ''), 10);
        tournament = tournaments.find(t => t.id === localId);
    } else {
        tournament = tournaments.find(t => t.code === value);
    }
    const name = tournament ? tournament.name : 'Torneo';
    titleEl.textContent = `Tabla de Posiciones — ${name}`;
    if (prizeInfoEl) {
        if (tournament && tournament.prizePool && Number(tournament.prizePool) > 0) {
            prizeInfoEl.textContent = `Premio: $${Number(tournament.prizePool).toFixed(2)} al más ganador`;
        } else {
            prizeInfoEl.textContent = '';
        }
    }
    try {
        let sourceMatches = [];
        if (value && value.startsWith('local-')) {
            sourceMatches = matches.filter(m => m.tournamentLocalId && ('local-' + m.tournamentLocalId) === value);
        } else if (db) {
            const snap = await db.collection('matches').where('tournamentCode', '==', value).get();
            sourceMatches = snap.docs.map(d => d.data());
        } else {
            sourceMatches = matches.filter(m => m.tournamentCode === value);
        }
        let standings = computeStandings(sourceMatches);
        if (standings.length === 0) {
            statusEl.textContent = 'No hay partidos registrados para este torneo.';
            return;
        }
        statusEl.textContent = '';
        const renderRows = (key) => {
            const arr = [...standings];
            if (key === 'wins') arr.sort((a, b) => b.wins - a.wins || b.goals - a.goals || a.name.localeCompare(b.name));
            else if (key === 'goals') arr.sort((a, b) => b.goals - a.goals || b.points - a.points || a.name.localeCompare(b.name));
            else if (key === 'spent') arr.sort((a, b) => b.spent - a.spent || b.points - a.points || a.name.localeCompare(b.name));
            else arr.sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
            bodyEl.innerHTML = arr.map(s => `
                <tr>
                    <td class="px-6 py-3 font-medium">${s.name}</td>
                    <td class="px-6 py-3 text-center">${s.matches}</td>
                    <td class="px-6 py-3 text-center">${s.wins}</td>
                    <td class="px-6 py-3 text-center">${s.draws}</td>
                    <td class="px-6 py-3 text-center">${s.losses}</td>
                    <td class="px-6 py-3 text-center">${s.goals}</td>
                    <td class="px-6 py-3 text-right">$${Number(s.spent || 0).toFixed(2)}</td>
                    <td class="px-6 py-3 text-center">${s.points}</td>
                    <td class="px-6 py-3 text-center">
                        ${s.last5.split(' ').map(r => {
                            const cls = r === 'W' ? 'bg-emerald-100 text-emerald-700' : (r === 'D' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700');
                            return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls} mr-1">${r}</span>`;
                        }).join('')}
                    </td>
                </tr>
            `).join('');
        };
        const defaultKey = sortEl ? sortEl.value : 'points';
        renderRows(defaultKey);
        if (sortEl) {
            const oldSort = sortEl;
            const newSort = oldSort.cloneNode(true);
            oldSort.parentNode.replaceChild(newSort, oldSort);
            newSort.addEventListener('change', () => renderRows(newSort.value));
        }
    } catch (e) {
        statusEl.textContent = 'Error cargando datos del torneo.';
        console.error(e);
    }
}
// Initialize
function setupAuthHandlers() {
    const modal = document.getElementById('authModal');
    const emailEl = document.getElementById('authEmail');
    const passEl = document.getElementById('authPassword');
    const nameEl = document.getElementById('authName');
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnLogout = document.getElementById('btnLogout');
    const auth = firebase.auth();
    if (!auth) return;
    try {
        if (auth.setPersistence) {
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        }
    } catch {}
    if (btnRegister) {
        btnRegister.addEventListener('click', async () => {
            const email = emailEl.value.trim();
            const pass = passEl.value.trim();
            const name = nameEl.value.trim();
            if (!email || !pass) {
                Swal.fire('Error', 'Email y contraseña son obligatorios.', 'error');
                return;
            }
            try {
                if (auth.setPersistence) {
                    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                }
                await auth.createUserWithEmailAndPassword(email, pass);
                if (auth.currentUser && name) {
                    await auth.currentUser.updateProfile({ displayName: name });
                }
                try {
                    await firebase.firestore().collection('users').doc(auth.currentUser.uid).set({
                        email,
                        displayName: name || null,
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                } catch {}
                playerName = name || playerName || '';
                localStorage.setItem('playerName', playerName);
                if (modal) modal.classList.add('hidden');
                Swal.fire('Listo', 'Cuenta creada e iniciada.', 'success');
            } catch (e) {
                let msg = 'No se pudo crear la cuenta.';
                if (e.code === 'auth/email-already-in-use') msg = 'Ese email ya está en uso.';
                else if (e.code === 'auth/invalid-email') msg = 'Email inválido.';
                else if (e.code === 'auth/weak-password') msg = 'Contraseña muy débil (mínimo 6 caracteres).';
                else if (e.code === 'auth/operation-not-allowed') msg = 'Método Email/Password deshabilitado en Firebase.';
                Swal.fire('Error', msg, 'error');
            }
        });
    }
    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = emailEl.value.trim();
            const pass = passEl.value.trim();
            const name = nameEl.value.trim();
            if (!email || !pass) {
                Swal.fire('Error', 'Email y contraseña son obligatorios.', 'error');
                return;
            }
            try {
                if (auth.setPersistence) {
                    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                }
                await auth.signInWithEmailAndPassword(email, pass);
                if (auth.currentUser && name) {
                    await auth.currentUser.updateProfile({ displayName: name });
                }
                playerName = name || (auth.currentUser && auth.currentUser.displayName) || playerName || '';
                localStorage.setItem('playerName', playerName);
                if (modal) modal.classList.add('hidden');
                Swal.fire('Bienvenido', 'Sesión iniciada.', 'success');
            } catch (e) {
                let msg = 'No se pudo iniciar sesión.';
                if (e.code === 'auth/user-not-found') msg = 'Usuario no encontrado.';
                else if (e.code === 'auth/wrong-password') msg = 'Contraseña incorrecta.';
                else if (e.code === 'auth/invalid-email') msg = 'Email inválido.';
                Swal.fire('Error', msg, 'error');
            }
        });
    }
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await auth.signOut();
                Swal.fire('Sesión cerrada', 'Has cerrado sesión.', 'success');
            } catch {
                Swal.fire('Error', 'No se pudo cerrar sesión.', 'error');
            }
        });
    }
}
// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    if (firebaseConfig) {
        document.getElementById('firebaseConfigInput').value = JSON.stringify(firebaseConfig, null, 2);
    }
    setupAuthHandlers();
    const t = localStorage.getItem('theme');
    if (t) {
        document.body.classList.add(`theme-${t}`);
    }
    // Navigation Handling
    const links = document.querySelectorAll('nav a, nav button'); // Include the sync button
    const sections = document.querySelectorAll('.section-view');

    function switchView(targetId) {
        if (!targetId || targetId === 'undefined') return;
        
        sections.forEach(s => s.classList.add('hidden'));
        const target = document.querySelector(targetId);
        if (target) target.classList.remove('hidden');
        
        // Update Active Link
        links.forEach(l => {
            l.classList.remove('bg-brand-600', 'text-white', 'shadow-lg');
            l.classList.add('text-slate-400');
            if(l.getAttribute('href') === targetId) {
                l.classList.remove('text-slate-400');
                l.classList.add('bg-brand-600', 'text-white', 'shadow-lg');
            }
        });
    }

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
                e.preventDefault();
                switchView(targetId);
            }
        });
    });

    // Default View
    switchView('#dashboard');
    updateUI();
    setupTournamentHandlers();
});

// Live Cost Calculation
function calculateShare() {
    const total = parseFloat(totalCostEl.value) || 0;
    const pct = parseFloat(percentageEl.value) || 0;
    const share = (total * pct) / 100;
    calculatedShareEl.textContent = `$${share.toFixed(2)}`;
    return share;
}

if(totalCostEl) totalCostEl.addEventListener('input', calculateShare);
if(percentageEl) percentageEl.addEventListener('input', calculateShare);

// Helper for percentage buttons
window.setPercentage = function(pct) {
    if(percentageEl) {
        percentageEl.value = pct;
        calculateShare();
    }
}

// Match Form Handler
if(matchForm) {
    matchForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const date = document.getElementById('date').value;
        const location = document.getElementById('location').value;
        const goals = parseInt(document.getElementById('goals').value);
        
        // Get radio value
        const result = document.querySelector('input[name="result"]:checked').value;
        
        // Get cost values
        const totalCost = parseFloat(totalCostEl.value) || 0;
        const percentage = parseFloat(percentageEl.value) || 0;
        const cost = calculateShare(); // Get the calculated value
        const tournamentSelect = document.getElementById('matchTournament');
        const tournamentValue = tournamentSelect ? tournamentSelect.value : 'none';
        let tournamentCode = null;
        let tournamentLocalId = null;
        let tournamentName = null;
        if (tournamentValue && tournamentValue !== 'none') {
            const t = tournaments.find(tt => (tt.code && tt.code === tournamentValue) || ('local-' + tt.id) === tournamentValue);
            if (t) {
                tournamentName = t.name;
                if (t.code) tournamentCode = t.code;
                else tournamentLocalId = t.id;
            }
        }
        // Ensure player name is set from auth profile if available
        const auth = firebase.auth();
        if ((!playerName || playerName.trim() === '') && auth && auth.currentUser && auth.currentUser.displayName) {
            playerName = auth.currentUser.displayName;
            localStorage.setItem('playerName', playerName);
        }

        const newMatch = {
            id: Date.now(),
            date,
            location,
            goals,
            result,
            totalCost,
            percentage,
            cost,
            tournamentCode,
            tournamentLocalId,
            tournamentName,
            playerName: playerName || null
        };

        matches.unshift(newMatch); // Add to beginning
        saveMatches();
        saveMatchToCloud(newMatch); // Save to cloud
        updateUI();
        matchForm.reset();
        
        // Reset defaults
        document.getElementById('date').valueAsDate = new Date();
        percentageEl.value = 100;
        calculateShare();
        
        // Redirect to dashboard
        document.querySelector('a[href="#dashboard"]').click();

        // Show success animation
        Swal.fire({
            icon: 'success',
            title: '¡Partido Guardado!',
            showConfirmButton: false,
            timer: 1500
        });
    });
}



// Functions
function saveMatches() {
    localStorage.setItem('matches', JSON.stringify(matches));
}

function saveTournaments() {
    localStorage.setItem('tournaments', JSON.stringify(tournaments));
}

function updateUI() {
    renderStats();
    renderHistory();
    renderChart();
    renderTournaments();
    populateTournamentSelect();
}

function renderStats() {
    if(totalMatchesEl) totalMatchesEl.textContent = matches.length;
    
    const totalGoals = matches.reduce((acc, m) => acc + m.goals, 0);
    if(totalGoalsEl) totalGoalsEl.textContent = totalGoals;

    const totalSpent = matches.reduce((acc, m) => acc + m.cost, 0);
    const formattedSpent = `$${totalSpent.toFixed(2)}`;
    
    if(totalSpentEl) totalSpentEl.textContent = formattedSpent;
    if(sidebarTotalSpentEl) sidebarTotalSpentEl.textContent = formattedSpent;
}

function renderHistory() {
    // Helper to create row HTML
    const createRow = (match) => {
        let resultBadge = '';
        let resultIcon = '';
        
        if (match.result === 'win') {
            resultBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Victoria</span>';
            resultIcon = '🏆';
        } else if (match.result === 'draw') {
            resultBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Empate</span>';
            resultIcon = '🤝';
        } else {
            resultBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Derrota</span>';
            resultIcon = '❌';
        }

        let costDisplay = `<span class="font-bold text-slate-700">$${match.cost.toFixed(2)}</span>`;
        if (match.percentage && match.percentage !== 100) {
            costDisplay += ` <span class="text-xs text-slate-400 ml-1">(${match.percentage}%)</span>`;
        }

        return `
            <td class="px-6 py-4 whitespace-nowrap text-slate-500">${match.date}</td>
            <td class="px-6 py-4 whitespace-nowrap font-medium text-slate-800">${match.location || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-bold text-slate-700">${match.goals}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">${resultBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right">${costDisplay}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button onclick="openEditMatch(${match.id})" class="text-slate-400 hover:text-blue-600 transition-colors mr-3" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="deleteMatch(${match.id})" class="text-slate-400 hover:text-red-600 transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
    };

    // Full History
    if(historyListEl) {
        historyListEl.innerHTML = '';
        if (matches.length === 0) {
            historyListEl.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">No hay partidos registrados aún.</td></tr>`;
        } else {
            matches.forEach(match => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0';
                row.innerHTML = createRow(match);
                historyListEl.appendChild(row);
            });
        }
    }

    // Recent Matches (Top 5)
    if(recentMatchesListEl) {
        recentMatchesListEl.innerHTML = '';
        if (matches.length === 0) {
            recentMatchesListEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">No hay actividad reciente.</td></tr>`;
        } else {
            matches.slice(0, 5).forEach(match => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-50 transition-colors';
                // Remove actions column for dashboard view
                const fullRow = createRow(match);
                // Simple hack to remove the last td (actions)
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fullRow;
                tempDiv.removeChild(tempDiv.lastElementChild); // Remove action button
                row.innerHTML = tempDiv.innerHTML;
                recentMatchesListEl.appendChild(row);
            });
        }
    }
}

function renderChart() {
    const wins = matches.filter(m => m.result === 'win').length;
    const draws = matches.filter(m => m.result === 'draw').length;
    const losses = matches.filter(m => m.result === 'loss').length;

    // Chart 1: Win/Draw/Loss
    if (statsChartEl) {
        if (myChart) myChart.destroy();
        
        const ctx = statsChartEl.getContext('2d');
        
        // Config options
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: "'Inter', sans-serif" }
                    }
                }
            },
            cutout: '70%'
        };

        if (matches.length === 0) {
            // Empty state chart
             myChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sin Datos'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#e2e8f0'],
                        borderWidth: 0
                    }]
                },
                options: { ...chartOptions, plugins: { legend: { display: false } } }
            });
        } else {
            myChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Victorias', 'Empates', 'Derrotas'],
                    datasets: [{
                        data: [wins, draws, losses],
                        backgroundColor: [
                            '#10b981', // emerald-500
                            '#f59e0b', // amber-500
                            '#ef4444'  // red-500
                        ],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: chartOptions
            });
        }
    }

    // Chart 2: Goals History (Line Chart)
    if (goalsChartEl) {
        if (goalsChart) goalsChart.destroy();

        const ctxGoals = goalsChartEl.getContext('2d');
        
        // Reverse matches for chronological order in chart
        const chronoMatches = [...matches].reverse().slice(-10); // Last 10 matches
        
        const labels = chronoMatches.map(m => {
            const d = new Date(m.date);
            return `${d.getDate()}/${d.getMonth()+1}`;
        });
        const data = chronoMatches.map(m => m.goals);

        goalsChart = new Chart(ctxGoals, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Goles',
                    data: data,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#3b82f6',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { borderDash: [2, 4], color: '#f1f5f9' },
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

function renderTournaments() {
    if(!tournamentsListEl) return;
    
    tournamentsListEl.innerHTML = '';

    if (tournaments.length === 0) {
        tournamentsListEl.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-12 text-slate-400">
                <i class="fa-solid fa-trophy text-4xl mb-3 opacity-20"></i>
                <p>No hay torneos activos.</p>
            </div>
        `;
        return;
    }

    tournaments.forEach(t => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group';
        
        const friendsList = t.friends.length > 0 
            ? t.friends.map(f => `<span class="inline-block bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full mr-1 mb-1">${f}</span>`).join('') 
            : '<span class="text-slate-400 text-sm italic">Sin participantes</span>';

        // Online Badge and Code
        let onlineBadge = '';
        let codeSection = '';
        let prizeSection = '';
        
        if (t.isOnline) {
            onlineBadge = `<span class="absolute top-4 right-12 bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"><i class="fa-solid fa-cloud mr-1"></i>Online</span>`;
            codeSection = `
                <div class="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between group/code cursor-pointer" onclick="copyToClipboard('${t.code}')">
                    <div>
                        <p class="text-[10px] text-slate-400 uppercase font-bold">Código de Invitación</p>
                        <p class="text-sm font-mono font-bold text-slate-700 tracking-wider">${t.code}</p>
                    </div>
                    <i class="fa-regular fa-copy text-slate-400 group-hover/code:text-blue-500 transition-colors"></i>
                </div>
            `;
        }
        if (t.prizePool && Number(t.prizePool) > 0) {
            prizeSection = `
                <div class="mt-3">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <i class="fa-solid fa-award mr-1"></i> Premio: $${Number(t.prizePool).toFixed(2)} (al más ganador)
                    </span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                 <button onclick="deleteTournament(${t.id})" class="text-slate-400 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button>
            </div>
            ${onlineBadge}
            <div class="flex items-center gap-3 mb-4 mt-2">
                <div class="w-10 h-10 rounded-lg ${t.isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'} flex items-center justify-center">
                    <i class="fa-solid fa-trophy"></i>
                </div>
                <div>
                    <h5 class="font-heading font-bold text-lg text-slate-800 leading-tight">${t.name}</h5>
                    <p class="text-xs text-slate-400">Creado el ${t.dateCreated}</p>
                </div>
            </div>
            
            <div class="mb-4">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Participantes</p>
                <div class="flex flex-wrap">
                    ${friendsList}
                </div>
            </div>

            ${codeSection}
            ${prizeSection}
            
            <button onclick="openTournamentTable('${t.code ? t.code : 'local-'+t.id}')" class="w-full mt-4 py-2 text-sm font-medium ${t.isOnline ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'} rounded-lg transition-colors">
                Ver Tabla de Posiciones
            </button>
        `;
        tournamentsListEl.appendChild(card);
    });
}

// Global scope functions for onclick events
window.deleteMatch = function(id) {
    Swal.fire({
        title: '¿Eliminar partido?',
        text: "No podrás revertir esto.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
        if (result.isConfirmed) {
            matches = matches.filter(m => m.id !== id);
            saveMatches();
            deleteMatchFromCloud(id);
            updateUI();
            Swal.fire('Eliminado', 'El partido ha sido eliminado.', 'success');
        }
    });
};

// Edit match
window.openEditMatch = function(id) {
    const m = matches.find(x => x.id === id);
    if (!m) return;
    document.getElementById('editMatchId').value = m.id;
    document.getElementById('editDate').value = m.date;
    document.getElementById('editLocation').value = m.location || '';
    document.getElementById('editGoals').value = m.goals || 0;
    document.getElementById('editResult').value = m.result || 'win';
    document.getElementById('editTotalCost').value = m.totalCost || 0;
    document.getElementById('editPercentage').value = m.percentage || 100;
    // Populate tournament select
    const select = document.getElementById('editMatchTournament');
    if (select) {
        select.innerHTML = '<option value="none">Ninguno</option>';
        tournaments.forEach(t => {
            const value = t.code ? t.code : ('local-' + t.id);
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = t.name + (t.isOnline ? ' (Online)' : '');
            select.appendChild(opt);
        });
        if (m.tournamentCode) select.value = m.tournamentCode;
        else if (m.tournamentLocalId) select.value = 'local-' + m.tournamentLocalId;
        else select.value = 'none';
    }
    calculateEditShare();
    document.getElementById('editMatchModal').classList.remove('hidden');
};

function calculateEditShare() {
    const total = parseFloat(document.getElementById('editTotalCost').value) || 0;
    const pct = parseFloat(document.getElementById('editPercentage').value) || 0;
    const share = (total * pct) / 100;
    document.getElementById('editCalculatedShare').textContent = `$${share.toFixed(2)}`;
    return share;
}
function setEditPercentage(p) {
    document.getElementById('editPercentage').value = p;
    calculateEditShare();
}
['editTotalCost','editPercentage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateEditShare);
});

window.saveEditedMatch = function() {
    const id = parseInt(document.getElementById('editMatchId').value, 10);
    const idx = matches.findIndex(x => x.id === id);
    if (idx === -1) return;
    const date = document.getElementById('editDate').value;
    const location = document.getElementById('editLocation').value;
    const goals = parseInt(document.getElementById('editGoals').value) || 0;
    const result = document.getElementById('editResult').value;
    const totalCost = parseFloat(document.getElementById('editTotalCost').value) || 0;
    const percentage = parseFloat(document.getElementById('editPercentage').value) || 0;
    const cost = (totalCost * percentage) / 100;
    const tournamentValue = document.getElementById('editMatchTournament').value;
    let tournamentCode = null, tournamentLocalId = null, tournamentName = null;
    if (tournamentValue && tournamentValue !== 'none') {
        const t = tournaments.find(tt => (tt.code && tt.code === tournamentValue) || ('local-' + tt.id) === tournamentValue);
        if (t) {
            tournamentName = t.name;
            if (t.code) tournamentCode = t.code;
            else tournamentLocalId = t.id;
        }
    }
    matches[idx] = {
        ...matches[idx],
        date, location, goals, result,
        totalCost, percentage, cost,
        tournamentCode, tournamentLocalId, tournamentName
    };
    saveMatches();
    saveMatchToCloud(matches[idx]);
    updateUI();
    document.getElementById('editMatchModal').classList.add('hidden');
    Swal.fire('Actualizado', 'El partido fue editado correctamente.', 'success');
};
window.deleteTournament = function(id) {
    Swal.fire({
        title: '¿Eliminar torneo?',
        text: "No podrás revertir esto.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
        if (result.isConfirmed) {
            tournaments = tournaments.filter(t => t.id !== id);
            saveTournaments();
            renderTournaments();
            Swal.fire('Eliminado', 'El torneo ha sido eliminado.', 'success');
        }
    })
};

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });
        Toast.fire({ icon: 'success', title: 'Código copiado al portapapeles' });
    });
};

function setupTournamentHandlers() {
    if (createTournamentBtn) {
        // Remove existing listeners to avoid duplicates (clone node trick)
        const oldBtn = document.getElementById('createTournamentBtn');
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        
        newBtn.addEventListener('click', async () => {
            const name = document.getElementById('tournamentName').value;
            const friendsStr = document.getElementById('tournamentFriends').value;
            // Re-fetch element to be safe
            const isOnlineCheckbox = document.getElementById('isOnlineTournament');
            const isOnline = isOnlineCheckbox ? isOnlineCheckbox.checked : false;
            const prizeEl = document.getElementById('tournamentPrizePool');
            const prizePool = prizeEl ? parseFloat(prizeEl.value) || 0 : 0;

            if (!name) {
                Swal.fire('Error', 'El nombre del torneo es obligatorio', 'error');
                return;
            }

            const friends = friendsStr.split(',').map(s => s.trim()).filter(s => s);

            const newTournament = {
                id: Date.now(),
                name,
                friends,
                dateCreated: new Date().toLocaleDateString(),
                isOnline: isOnline,
                code: isOnline ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
                prizePool: prizePool > 0 ? prizePool : null,
                prizeCriteria: 'wins'
            };

            if (isOnline) {
                if (!db) {
                    Swal.fire('Configuración Requerida', 'Para crear un torneo online necesitas configurar Firebase primero en la sección de Sincronización.', 'warning');
                    return;
                }
                const auth = firebase.auth();
                if (!auth.currentUser) {
                    document.getElementById('authModal').classList.remove('hidden');
                    Swal.fire('Inicio requerido', 'Inicia sesión para crear torneos online.', 'info');
                    return;
                }
                try {
                    newBtn.disabled = true;
                    newBtn.textContent = 'Creando...';
                    
                    // Timeout promise (10 seconds)
                    const timeout = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('timeout')), 10000);
                    });

                    // Race between creation and timeout
                    await Promise.race([
                        db.collection('tournaments').doc(newTournament.code).set(newTournament),
                        timeout
                    ]);
                    
                    // Subscribe immediately
                    subscribeToTournament(newTournament.code);
                } catch (e) {
                    console.error("Error creating tournament:", e);
                    let errorMsg = 'No se pudo crear el torneo en la nube.';
                    
                    if (e.message === 'timeout') {
                        errorMsg = 'La conexión está tardando demasiado. Verifica tu internet o si la base de datos Firestore está habilitada en la consola de Firebase.';
                    } else if (e.code === 'permission-denied') {
                        errorMsg = 'Permiso denegado. Verifica las reglas de seguridad de Firestore en la consola de Firebase.';
                    } else if (e.code === 'unavailable') {
                        errorMsg = 'Servicio no disponible o sin conexión.';
                    }

                    Swal.fire('Error', errorMsg, 'error');
                    newBtn.disabled = false;
                    newBtn.textContent = 'Crear Torneo';
                    return;
                }
            }

            tournaments.push(newTournament);
            saveTournaments();
            renderTournaments();
            
            document.getElementById('createTournamentModal').classList.add('hidden');
            document.getElementById('tournamentName').value = '';
            document.getElementById('tournamentFriends').value = '';
            newBtn.disabled = false;
            newBtn.textContent = 'Crear Torneo';
            
            if (isOnline) {
                 Swal.fire({
                    title: '¡Torneo Online Creado!',
                    html: `Comparte este código con tus amigos:<br><strong class="text-2xl">${newTournament.code}</strong>`,
                    icon: 'success'
                });
            }
        });
    }

    if (joinTournamentBtn) {
        // Remove existing listeners
        const oldJoinBtn = document.getElementById('joinTournamentBtn');
        const newJoinBtn = oldJoinBtn.cloneNode(true);
        oldJoinBtn.parentNode.replaceChild(newJoinBtn, oldJoinBtn);

        newJoinBtn.addEventListener('click', async () => {
            const joinInput = document.getElementById('joinTournamentCode');
            const code = joinInput ? joinInput.value.trim().toUpperCase() : '';
            const nameInput = document.getElementById('joinTournamentName');
            const name = nameInput ? nameInput.value.trim() : '';
            
            if (!code) {
                Swal.fire('Error', 'Ingresa el código del torneo.', 'error');
                return;
            }
            if (!name) {
                Swal.fire('Error', 'Ingresa tu nombre para unirte.', 'error');
                return;
            }

            if (!db) {
                Swal.fire('Configuración Requerida', 'Necesitas configurar Firebase para unirte a torneos online.', 'warning');
                return;
            }
            const auth = firebase.auth();
            if (!auth.currentUser) {
                document.getElementById('authModal').classList.remove('hidden');
                Swal.fire('Inicio requerido', 'Inicia sesión para unirte a torneos online.', 'info');
                return;
            }

            // Check if already joined
            if (tournaments.some(t => t.code === code)) {
                Swal.fire('Info', 'Ya estás unido a este torneo.', 'info');
                return;
            }

            try {
                newJoinBtn.disabled = true;
                newJoinBtn.textContent = 'Buscando...';
                
                const doc = await db.collection('tournaments').doc(code).get();
                
                if (doc.exists) {
                    const tournamentData = doc.data();
                    // Persist player name locally
                    playerName = name;
                    localStorage.setItem('playerName', playerName);

                    // Add to remote participants list using arrayUnion
                    try {
                        await db.collection('tournaments').doc(code).update({
                            friends: firebase.firestore.FieldValue.arrayUnion(playerName)
                        });
                        // Also reflect locally if not present
                        if (Array.isArray(tournamentData.friends) && !tournamentData.friends.includes(playerName)) {
                            tournamentData.friends.push(playerName);
                        }
                    } catch (e) {
                        // If update fails due to missing field, set it
                        if (e.code === 'not-found') {
                            await db.collection('tournaments').doc(code).set({
                                ...tournamentData,
                                friends: Array.isArray(tournamentData.friends) ? tournamentData.friends : [],
                            }, { merge: true });
                        }
                    }

                    tournaments.push(tournamentData);
                    saveTournaments();
                    subscribeToTournament(code);
                    renderTournaments();
                    
                    document.getElementById('joinTournamentModal').classList.add('hidden');
                    if(joinInput) joinInput.value = '';
                    if(nameInput) nameInput.value = '';
                    Swal.fire('¡Unido!', `Te has unido a "${tournamentData.name}"`, 'success');
                } else {
                    Swal.fire('Error', 'No se encontró ningún torneo con ese código.', 'error');
                }
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'Error de conexión.', 'error');
            } finally {
                newJoinBtn.disabled = false;
                newJoinBtn.textContent = 'Buscar y Unirse';
            }
        });
    }
}
