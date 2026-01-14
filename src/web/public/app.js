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
      <div class="race-day">DAY: ${race.currentDay || 0}</div>
    </div>
  `).join('');
}

// Render resources
function renderResources() {
  const resourcesList = document.getElementById('resources-list');

  if (races.length === 0) {
    resourcesList.innerHTML = '<div class="loading">NO DATA AVAILABLE</div>';
    return;
  }

  resourcesList.innerHTML = races.map(race => {
    const resources = race.resources || [];
    const energy = resources.find(r => r.resource_type === 'energy')?.amount || 0;
    const intelligence = resources.find(r => r.resource_type === 'intelligence')?.amount || 0;
    const influence = resources.find(r => r.resource_type === 'influence')?.amount || 0;

    return `
      <div class="resource-item">
        <div class="resource-race">${race.name}</div>
        <div class="resource-bar">
          <div class="resource-label">⚡ Energy:</div>
          <div class="resource-value">${energy}</div>
        </div>
        <div class="resource-bar">
          <div class="resource-label">🧠 Intel:</div>
          <div class="resource-value">${intelligence}</div>
        </div>
        <div class="resource-bar">
          <div class="resource-label">👑 Influence:</div>
          <div class="resource-value">${influence}</div>
        </div>
      </div>
    `;
  }).join('');
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
        const hasCode = msg.code ? '<span class="code-badge">💻 +CODE</span>' : '';

        let codeSection = '';
        if (msg.code) {
          codeSection = `
            <div class="message-code">
              <div class="code-header">📦 ATTACHED CODE:</div>
              <pre class="code-block">${escapeHtml(msg.code)}</pre>
            </div>
          `;
        }

        return `
        <div class="message${secretClass}">
          <div class="message-header">
            ${secretBadge}
            ${hasCode}
            <span class="message-from">FROM: ${msg.from_name}</span>
            <span>→</span>
            <span class="message-to">TO: ${msg.to_name}</span>
          </div>
          <div class="message-content">${escapeHtml(msg.content)}</div>
          ${codeSection}
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
  renderResources();
  renderMessages();
  updateFooter();
}

// Run all turns
async function runAllTurns() {
  if (!confirm('RUN ALL RACE TURNS?\n\nThis will trigger all race sprites to:\n- Process incoming messages\n- Decide whether to execute code\n- Generate responses\n- Send new messages')) {
    return;
  }

  const button = document.getElementById('run-turns-btn');
  button.disabled = true;
  button.textContent = 'RUNNING...';

  try {
    const response = await fetch('/api/cycle/run-all', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      alert(`TURNS COMPLETED!\n\nSuccessfully ran ${result.triggered}/${result.total} races.`);
      // Refresh data to show new messages and updated resources
      await fetchData();
    } else {
      const failedRaces = result.results
        .filter(r => r.status === 'rejected')
        .map(r => r.raceId)
        .join(', ');
      alert(`PARTIAL FAILURE\n\nSucceeded: ${result.triggered}/${result.total}\nFailed races: ${failedRaces}`);
    }
  } catch (error) {
    console.error('Failed to run turns:', error);
    alert('ERROR: Failed to run turns');
  } finally {
    button.disabled = false;
    button.textContent = 'RUN ALL TURNS';
  }
}

// Reset game
async function resetGame() {
  if (!confirm('⚠️ RESET GAME TO DAY 0? ⚠️\n\nThis will:\n- Delete ALL messages\n- Reset ALL resources to 100\n- Reset day counter to 0\n- Clear all action logs\n\nThis action CANNOT be undone!\n\nAre you sure?')) {
    return;
  }

  // Double confirmation
  if (!confirm('FINAL CONFIRMATION\n\nThis will permanently delete all game data.\n\nContinue with reset?')) {
    return;
  }

  const button = document.getElementById('reset-btn');
  button.disabled = true;
  button.textContent = 'RESETTING...';

  try {
    const response = await fetch('/api/cycle/reset', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      alert(`RESET COMPLETED!\n\nSuccessfully reset ${result.reset}/${result.total} races.\n\nGame has been reset to day 0.`);
      // Refresh data to show reset state
      await fetchData();
    } else {
      const failedRaces = result.results
        .filter(r => r.status === 'rejected')
        .map(r => r.raceId)
        .join(', ');
      alert(`PARTIAL FAILURE\n\nReset: ${result.reset}/${result.total}\nFailed races: ${failedRaces}`);
    }
  } catch (error) {
    console.error('Failed to reset:', error);
    alert('ERROR: Failed to reset game');
  } finally {
    button.disabled = false;
    button.textContent = 'RESET GAME';
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
document.getElementById('run-turns-btn').addEventListener('click', runAllTurns);
document.getElementById('reset-btn').addEventListener('click', resetGame);

// Update timestamp every second
setInterval(() => {
  const now = new Date();
  const timestamp = now.toISOString().substring(11, 19);
  document.getElementById('timestamp').textContent = timestamp;
}, 1000);

// Initial load
fetchData();
