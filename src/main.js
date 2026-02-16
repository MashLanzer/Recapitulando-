import './style.css'
import { db, auth } from './firebase.js'
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore'
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import { initCalendar, renderCalendar, openAddToCalendarModal, closeAddToCalendarModal, getSeriesScheduledDay, setCalendarChangeCallback } from './calendar.js'

// --- State Management ---
let series = [];
let currentUser = null;
let currentTab = 'watching';
let currentView = 'list'; // 'list' or 'calendar'

// --- DOM Elements ---
const seriesGrid = document.getElementById('series-grid');
const emptyState = document.getElementById('empty-state');
const addBtn = document.getElementById('add-btn');
const authBtn = document.getElementById('auth-btn');
const userDisplay = document.getElementById('user-display');

const searchModal = document.getElementById('search-modal');
const closeModal = document.getElementById('close-modal');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchLoader = document.getElementById('search-loader');

const trailerModal = document.getElementById('trailer-modal');
const closeTrailer = document.getElementById('close-trailer');
const trailerPlayer = document.getElementById('trailer-player');
const trailerTitle = document.getElementById('trailer-title');

// Stats Elements
const statsTotal = document.getElementById('stats-total');
const statsTime = document.getElementById('stats-time');
const statsFinished = document.getElementById('stats-finished');

// --- Firebase Auth ---
authBtn.addEventListener('click', () => {
  if (currentUser) {
    signOut(auth);
  } else {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => console.error(err));
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    userDisplay.textContent = user.displayName.split(' ')[0];
    authBtn.classList.add('synced');
    syncFromFirestore();
  } else {
    userDisplay.textContent = 'Sincronizar';
    authBtn.classList.remove('synced');
    series = JSON.parse(localStorage.getItem('recap_series')) || [];
    render();
  }
});

// --- Firestore Sync ---
function syncFromFirestore() {
  if (!currentUser) return;
  const q = query(collection(db, 'users', currentUser.uid, 'series'));
  onSnapshot(q, (snapshot) => {
    series = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    localStorage.setItem('recap_series', JSON.stringify(series));
    render();
    initCalendar(currentUser, series); // Initialize calendar with synced data
  }, (error) => {
    console.warn("Error en la sincronización (posiblemente reglas de Firebase):", error);
    authBtn.classList.remove('synced'); // Add this to show error state in UI
    // Fallback: si falla la nube, cargar lo que haya en local
    if (series.length === 0) {
      series = JSON.parse(localStorage.getItem('recap_series')) || [];
      render();
      initCalendar(currentUser, series);
    }
  });
}

async function saveSeriesToCloud(item) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'series', String(item.id)), item);
  } catch (e) {
    console.error("Error saving to cloud: ", e);
  }
}

async function removeSeriesFromCloud(id) {
  if (!currentUser) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, 'series', String(id)));
}

// --- Functions ---

function calculateStats() {
  const total = series.length;
  const finished = series.filter(s => s.statusTab === 'finished').length;

  // Average 40 mins per episode
  let totalMinutes = 0;
  series.forEach(s => {
    const chapters = (s.currentSeason - 1) * 10 + s.currentChapter; // rough estimate
    totalMinutes += chapters * 40;
  });

  const hours = Math.floor(totalMinutes / 60);

  statsTotal.textContent = total;
  statsFinished.textContent = finished;
  statsTime.textContent = `${hours}h`;
}

function render() {
  // Toggle view visibility
  const mainView = document.getElementById('series-view');
  const calendarView = document.getElementById('calendar-view');

  if (currentView === 'calendar') {
    mainView.classList.add('hidden');
    calendarView.classList.remove('hidden');
    initCalendar(currentUser, series);
    return;
  } else {
    mainView.classList.remove('hidden');
    calendarView.classList.add('hidden');
  }

  const filteredSeries = series.filter(s => s.statusTab === currentTab);
  calculateStats();

  // Reset grid
  seriesGrid.innerHTML = '';

  if (filteredSeries.length === 0) {
    // Show empty state
    emptyState.classList.remove('hidden');

    if (series.length === 0) {
      emptyState.querySelector('h2').textContent = '¡Tu lista está vacía!';
      emptyState.querySelector('p').textContent = 'Busca una serie para empezar tu aventura.';
    } else {
      const tabNames = { 'watching': 'en curso', 'pending': 'pendientes', 'finished': 'terminadas' };
      emptyState.querySelector('h2').textContent = 'Sección vacía';
      emptyState.querySelector('p').textContent = `No tienes series marcadas como "${tabNames[currentTab]}".`;
    }
  } else {
    // Hide empty state and show grid
    emptyState.classList.add('hidden');
    seriesGrid.innerHTML = filteredSeries.map((s, index) => {
      const scheduledDay = getSeriesScheduledDay(s.id);
      return `
            <div class="series-card" style="animation-delay: ${index * 0.1}s">
                <div class="status-badge">${s.status}</div>
                ${scheduledDay ? `<div class="calendar-day-badge">📅 ${scheduledDay}</div>` : ''}
                <div class="poster-container">
                    <img src="${s.image || 'https://via.placeholder.com/200x300?text=No+Image'}" alt="${s.name}">
                    <div class="card-overlay"></div>
                </div>
                <div class="card-content">
                    <h3 class="series-title">${s.name}</h3>
                    
                    <select class="status-select" onchange="updateStatusTab(${s.id}, this.value)">
                        <option value="watching" ${s.statusTab === 'watching' ? 'selected' : ''}>Viendo</option>
                        <option value="pending" ${s.statusTab === 'pending' ? 'selected' : ''}>Pendiente</option>
                        <option value="finished" ${s.statusTab === 'finished' ? 'selected' : ''}>Terminada</option>
                    </select>

                    <div class="counters-wrapper">
                        <div class="counter-container">
                            <span class="count-label">Temporada</span>
                            <div class="controls">
                                <button class="control-btn" onclick="updateSeasonInUI(${s.id}, -1)">-</button>
                                <span class="count-num">${s.currentSeason || 1}</span>
                                <button class="control-btn" onclick="updateSeasonInUI(${s.id}, 1)">+</button>
                            </div>
                        </div>
                        <div class="counter-container">
                            <span class="count-label">Capítulo</span>
                            <div class="controls">
                                <button class="control-btn" onclick="updateChapterInUI(${s.id}, -1)">-</button>
                                <span class="count-num">${s.currentChapter}</span>
                                <button class="control-btn" onclick="updateChapterInUI(${s.id}, 1)">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="card-actions">
                        <button class="action-btn trailer-btn" onclick="openTrailer('${s.name}', '${s.year || ''}')">Tráiler</button>
                        <button class="action-btn delete-btn" onclick="handleRemove(${s.id})">Eliminar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
  }
}

// --- Event Listeners for Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentTab = e.target.dataset.tab;
    render();
  });
});

// --- Search & Trailer Logic ---

async function searchTVMaze(query) {
  if (!query) return;
  searchLoader.classList.remove('hidden');
  try {
    const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    displaySearchResults(data);
  } catch (error) {
    console.error('Error searching series:', error);
  } finally {
    searchLoader.classList.add('hidden');
  }
}

function displaySearchResults(results) {
  searchResults.innerHTML = results.map(item => `
        <div class="result-item" onclick="addSeriesToList(${JSON.stringify(item.show).replace(/"/g, '&quot;')})">
            <img class="result-poster" src="${item.show.image?.medium || 'https://via.placeholder.com/60x90?text=?'}" alt="${item.show.name}">
            <div class="result-info">
                <h3>${item.show.name}</h3>
                <p>${item.show.network?.name || item.show.webChannel?.name || 'Unknown'} (${item.show.premiered?.split('-')[0] || 'N/A'})</p>
            </div>
        </div>
    `).join('');
}

// --- Trailer Handler ---
const trailerLoaderElement = document.getElementById('trailer-loader');

window.openTrailer = (name, year) => {
  trailerModal.classList.remove('hidden');
  trailerTitle.textContent = `Tráiler: ${name}`;
  trailerLoaderElement.classList.remove('hidden');

  // Búsqueda más precisa con el año
  const queryStr = `${name} ${year} official series trailer`;
  const searchQuery = encodeURIComponent(queryStr);

  // Usamos el dominio estándar de youtube para mayor compatibilidad con trailers oficiales
  trailerPlayer.src = `https://www.youtube.com/embed?listType=search&list=${searchQuery}&autoplay=1&rel=0`;

  const timeout = setTimeout(() => {
    trailerLoaderElement.classList.add('hidden');
  }, 6000);

  trailerPlayer.onload = () => {
    clearTimeout(timeout);
    trailerLoaderElement.classList.add('hidden');
  };

  window.currentTrailerSearch = `https://www.youtube.com/results?search_query=${searchQuery}`;
};

window.closeTrailerModal = () => {
  trailerModal.classList.add('hidden');
  trailerPlayer.src = '';
};

closeTrailer.addEventListener('click', window.closeTrailerModal);

// --- Global Actions (attached to window) ---

window.addSeriesToList = (show) => {
  const newItem = {
    id: show.id,
    name: show.name,
    year: show.premiered?.split('-')[0] || '',
    image: show.image?.original || show.image?.medium,
    network: show.network?.name || show.webChannel?.name,
    status: show.status,
    currentSeason: 1,
    currentChapter: 1,
    statusTab: 'watching'
  };

  if (!series.some(s => s.id === newItem.id)) {
    if (currentUser) {
      saveSeriesToCloud(newItem);
    } else {
      series.push(newItem);
      localStorage.setItem('recap_series', JSON.stringify(series));
      render();
    }
  }
  closeSearchModal();
};

window.updateSeasonInUI = (id, delta) => {
  const item = series.find(s => s.id === id);
  if (item) {
    item.currentSeason = Math.max(1, (item.currentSeason || 1) + delta);
    if (currentUser) saveSeriesToCloud(item);
    else {
      localStorage.setItem('recap_series', JSON.stringify(series));
      render();
    }
  }
};

window.updateChapterInUI = (id, delta) => {
  const item = series.find(s => s.id === id);
  if (item) {
    item.currentChapter = Math.max(1, item.currentChapter + delta);
    if (currentUser) saveSeriesToCloud(item);
    else {
      localStorage.setItem('recap_series', JSON.stringify(series));
      render();
    }
  }
};

window.updateStatusTab = (id, newTab) => {
  const item = series.find(s => s.id === id);
  if (item) {
    item.statusTab = newTab;
    if (currentUser) saveSeriesToCloud(item);
    else {
      localStorage.setItem('recap_series', JSON.stringify(series));
      render();
    }
  }
};

window.handleRemove = (id) => {
  if (confirm('¿Eliminar esta serie?')) {
    if (currentUser) {
      removeSeriesFromCloud(id);
    } else {
      series = series.filter(s => s.id !== id);
      localStorage.setItem('recap_series', JSON.stringify(series));
      render();
    }
  }
};

// --- Modal Handlers ---
function openSearchModal() {
  searchModal.classList.remove('hidden');
  searchInput.focus();
}

function closeSearchModal() {
  searchModal.classList.add('hidden');
  searchInput.value = '';
  searchResults.innerHTML = '';
}

addBtn.addEventListener('click', openSearchModal);
closeModal.addEventListener('click', closeSearchModal);

let debounceTimer;
searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchTVMaze(e.target.value), 500);
});

searchModal.addEventListener('click', (e) => {
  if (e.target === searchModal) closeSearchModal();
});

trailerModal.addEventListener('click', (e) => {
  if (e.target === trailerModal) window.closeTrailerModal();
});

// View Switching
window.switchView = (view) => {
  currentView = view;

  // Update nav buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  render();
};

// Calendar functions
window.openAddToCalendarModal = openAddToCalendarModal;
window.closeAddToCalendarModal = closeAddToCalendarModal;

// Set callback to re-render when calendar changes
setCalendarChangeCallback(() => {
  if (currentView === 'list') {
    render();
  }
});

// Initial Render from LocalStorage first
series = JSON.parse(localStorage.getItem('recap_series')) || [];
render();
initCalendar(null, series);
