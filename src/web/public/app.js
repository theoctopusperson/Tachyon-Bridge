// State
let races = [];
let messages = [];
let currentDay = 0;

// Fetch data
async function fetchData() {
  try {
    const [racesRes, messagesRes, cycleRes] = await Promise.all([
      fetch('/api/races'),
      fetch('/api/messages'),
      fetch('/api/cycle')
    ]);

    races = await racesRes.json();
    messages = await messagesRes.json();
    const cycle = await cycleRes.json();
    currentDay = cycle.current_day || 0;

    render();
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
}

// Render races list
function renderRaces() {
  const racesList = document.getElementById('races-list');

  if (races.length === 0) {
    racesList.innerHTML = '<div class="loading">NO CIVILIZATIONS DETECTED</div>';
    return;
  }

  racesList.innerHTML = races.map(race => `
    <div class="race-item">
      <div class="race-name">${race.name}</div>
      <div class="race-region">REGION: ${race.region.toUpperCase()}</div>
    </div>
  `).join('');
}

// Render messages
function renderMessages() {
  const messagesContainer = document.getElementById('messages');

  if (messages.length === 0) {
    messagesContainer.innerHTML = '<div class="loading">NO TRANSMISSIONS RECEIVED</div>';
    return;
  }

  // Group messages by day
  const messagesByDay = {};
  messages.forEach(msg => {
    if (!messagesByDay[msg.day_number]) {
      messagesByDay[msg.day_number] = [];
    }
    messagesByDay[msg.day_number].push(msg);
  });

  const days = Object.keys(messagesByDay).sort((a, b) => a - b);

  messagesContainer.innerHTML = days.map(day => {
    const dayMessages = messagesByDay[day];
    return `
      <div class="message-day">
        ▼ CYCLE DAY ${day} - ${dayMessages.length} TRANSMISSION${dayMessages.length !== 1 ? 'S' : ''}
      </div>
      ${dayMessages.map(msg => {
        const isSecret = msg.category === 'secret';
        const secretClass = isSecret ? ' message-secret' : '';
        const secretBadge = isSecret ? '<span class="secret-badge">🔒 SECRET</span>' : '';
        return `
        <div class="message${secretClass}">
          <div class="message-header">
            ${secretBadge}
            <span class="message-from">FROM: ${msg.from_name}</span>
            <span>→</span>
            <span class="message-to">TO: ${msg.to_name}</span>
          </div>
          <div class="message-content">${escapeHtml(msg.content)}</div>
          <div class="message-timestamp">
            ${new Date(msg.created_at).toISOString().replace('T', ' ').substring(0, 19)} UTC
          </div>
        </div>
      `;
      }).join('')}
    `;
  }).join('');

  // Only scroll to bottom on initial load, not on auto-refresh
  // This allows users to read without being interrupted
}

// Update footer
function updateFooter() {
  document.getElementById('current-day').textContent = currentDay;
  document.getElementById('message-count').textContent =
    `${messages.length} MESSAGE${messages.length !== 1 ? 'S' : ''} LOGGED`;

  const now = new Date();
  const timestamp = now.toISOString().substring(11, 19);
  document.getElementById('timestamp').textContent = timestamp;
}

// Render all
function render() {
  renderRaces();
  renderMessages();
  updateFooter();
}

// Fetch messages from all regions
async function fetchMessages() {
  if (!confirm('FETCH MESSAGES FROM ALL CIVILIZATIONS?\n\nThis will wake all regional machines and trigger each alien race to send messages.')) {
    return;
  }

  const button = document.getElementById('fetch-messages-btn');
  button.disabled = true;
  button.textContent = 'FETCHING...';

  try {
    const response = await fetch('/api/cycle/run-all', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      alert(`MESSAGES RECEIVED!\n\nSuccessfully contacted ${result.triggered}/${result.total} civilizations.`);
      // Refresh data to show new messages
      await fetchData();
    } else {
      const failedRegions = result.results
        .filter(r => r.status === 'rejected')
        .map(r => r.region)
        .join(', ');
      alert(`PARTIAL COMMUNICATIONS FAILURE\n\nSucceeded: ${result.triggered}/${result.total}\nFailed regions: ${failedRegions}`);
    }
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    alert('ERROR: Failed to fetch messages');
  } finally {
    button.disabled = false;
    button.textContent = 'FETCH MESSAGES';
  }
}

// Advance cycle
async function advanceCycle() {
  if (!confirm('ADVANCE TO NEXT DAY?\n\nThis will increment the day counter.\n\nYou should do this BEFORE fetching messages.')) {
    return;
  }

  try {
    const response = await fetch('/api/cycle/advance', { method: 'POST' });
    const cycle = await response.json();
    currentDay = cycle.current_day;
    updateFooter();
    alert(`DAY ADVANCED TO ${currentDay}\n\nNow click "FETCH MESSAGES" to receive communications from all civilizations.`);
  } catch (error) {
    console.error('Failed to advance day:', error);
    alert('ERROR: Failed to advance day');
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('refresh-btn').addEventListener('click', fetchData);
document.getElementById('fetch-messages-btn').addEventListener('click', fetchMessages);
document.getElementById('advance-btn').addEventListener('click', advanceCycle);

// Update timestamp every second
setInterval(() => {
  const now = new Date();
  const timestamp = now.toISOString().substring(11, 19);
  document.getElementById('timestamp').textContent = timestamp;
}, 1000);

// Initial load
fetchData();
