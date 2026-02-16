import { db, auth } from './firebase.js'
import { collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore'

// State
let currentUser = null;
let calendarData = {}; // { 'monday': [seriesId1, seriesId2], 'tuesday': [...] }
let series = [];

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayNames = {
    monday: 'Lunes',
    tuesday: 'Martes',
    wednesday: 'Miércoles',
    thursday: 'Jueves',
    friday: 'Viernes',
    saturday: 'Sábado',
    sunday: 'Domingo'
};

// Initialize Calendar
export function initCalendar(user, userSeries) {
    currentUser = user;
    series = userSeries;

    if (currentUser) {
        syncCalendarFromFirestore();
    } else {
        calendarData = JSON.parse(localStorage.getItem('recap_calendar')) || {};
        renderCalendar();
    }
}

// Sync from Firestore
function syncCalendarFromFirestore() {
    if (!currentUser) return;

    const calendarRef = doc(db, 'users', currentUser.uid, 'calendar', 'weekly');
    onSnapshot(calendarRef, (docSnap) => {
        if (docSnap.exists()) {
            calendarData = docSnap.data();
        } else {
            calendarData = {};
        }
        localStorage.setItem('recap_calendar', JSON.stringify(calendarData));
        renderCalendar();
    }, (error) => {
        console.warn("Error syncing calendar:", error);
        calendarData = JSON.parse(localStorage.getItem('recap_calendar')) || {};
        renderCalendar();
    });
}

// Save to Firestore
async function saveCalendarToCloud() {
    if (!currentUser) {
        localStorage.setItem('recap_calendar', JSON.stringify(calendarData));
        return;
    }

    try {
        await setDoc(doc(db, 'users', currentUser.uid, 'calendar', 'weekly'), calendarData);
    } catch (e) {
        console.error("Error saving calendar:", e);
        localStorage.setItem('recap_calendar', JSON.stringify(calendarData));
    }
}

// Render Calendar
export function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = days.map(day => {
        const seriesForDay = (calendarData[day] || [])
            .map(id => series.find(s => s.id === id))
            .filter(s => s); // filter out nulls if series was deleted

        return `
      <div class="calendar-day glass" data-day="${day}">
        <div class="day-header">
          <h3 class="day-name">${dayNames[day]}</h3>
          <span class="series-count">${seriesForDay.length} serie${seriesForDay.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="day-content" data-day-drop="${day}">
          ${seriesForDay.length === 0 ? `
            <div class="empty-day">
              <span class="emoji">📅</span>
              <p>Arrastra una serie aquí</p>
            </div>
          ` : ''}
          <div class="day-series-list">
            ${seriesForDay.map(serie => `
              <div class="calendar-series-card" draggable="true" data-series-id="${serie.id}">
                <img src="${serie.image || 'https://via.placeholder.com/50x75?text=?'}" alt="${serie.name}">
                <div class="calendar-card-info">
                  <h4>${serie.name}</h4>
                  <p>T${serie.currentSeason} - E${serie.currentChapter}</p>
                </div>
                <button class="remove-from-day" data-series-id="${serie.id}" data-day="${day}">×</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    }).join('');

    setupDragAndDrop();
    setupRemoveButtons();
}

// Drag and Drop
function setupDragAndDrop() {
    const draggables = document.querySelectorAll('.calendar-series-card');
    const dropZones = document.querySelectorAll('.day-content');

    draggables.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.innerHTML);
            e.dataTransfer.setData('seriesId', e.target.dataset.seriesId);
            e.target.classList.add('dragging');
        });

        card.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
    });

    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (e) => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');

            const seriesId = parseInt(e.dataTransfer.getData('seriesId'));
            const targetDay = zone.dataset.dayDrop;

            // Remove from all days first
            days.forEach(day => {
                if (calendarData[day]) {
                    calendarData[day] = calendarData[day].filter(id => id !== seriesId);
                }
            });

            // Add to target day
            if (!calendarData[targetDay]) {
                calendarData[targetDay] = [];
            }
            if (!calendarData[targetDay].includes(seriesId)) {
                calendarData[targetDay].push(seriesId);
            }

            saveCalendarToCloud();
            renderCalendar();
        });
    });
}

// Remove from day
function setupRemoveButtons() {
    const removeButtons = document.querySelectorAll('.remove-from-day');

    removeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const seriesId = parseInt(btn.dataset.seriesId);
            const day = btn.dataset.day;

            if (calendarData[day]) {
                calendarData[day] = calendarData[day].filter(id => id !== seriesId);
                saveCalendarToCloud();
                renderCalendar();
            }
        });
    });
}

// Add Series to Calendar Modal
export function openAddToCalendarModal() {
    const modal = document.getElementById('add-to-calendar-modal');
    const seriesList = document.getElementById('calendar-series-list');

    // Filter series that are currently watching
    const watchingSeries = series.filter(s => s.statusTab === 'watching');

    seriesList.innerHTML = watchingSeries.map(serie => `
    <div class="calendar-add-series-item" data-series-id="${serie.id}">
      <img src="${serie.image || 'https://via.placeholder.com/50x75?text=?'}" alt="${serie.name}">
      <div class="series-info">
        <h4>${serie.name}</h4>
        <p>T${serie.currentSeason} - E${serie.currentChapter}</p>
      </div>
      <select class="day-selector" data-series-id="${serie.id}">
        <option value="">Seleccionar día</option>
        ${days.map(day => `
          <option value="${day}" ${calendarData[day]?.includes(serie.id) ? 'selected' : ''}>
            ${dayNames[day]}
          </option>
        `).join('')}
      </select>
    </div>
  `).join('');

    // Setup change listeners
    document.querySelectorAll('.day-selector').forEach(select => {
        select.addEventListener('change', (e) => {
            const seriesId = parseInt(select.dataset.seriesId);
            const selectedDay = e.target.value;

            // Remove from all days
            days.forEach(day => {
                if (calendarData[day]) {
                    calendarData[day] = calendarData[day].filter(id => id !== seriesId);
                }
            });

            // Add to selected day
            if (selectedDay) {
                if (!calendarData[selectedDay]) {
                    calendarData[selectedDay] = [];
                }
                calendarData[selectedDay].push(seriesId);
            }

            saveCalendarToCloud();
            renderCalendar();
        });
    });

    modal.classList.remove('hidden');
}

export function closeAddToCalendarModal() {
    document.getElementById('add-to-calendar-modal').classList.add('hidden');
}
