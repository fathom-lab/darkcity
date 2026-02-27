// DARKCITY Frontend → Backend Integration
// Add this to the existing map.html and index.html

const API_BASE = 'https://api.darkcity.wtf';
const WS_URL = 'wss://api.darkcity.wtf/ws/stream';

// ===== Consciousness Stream WebSocket =====
let streamWs = null;
let reconnectInterval = null;

function connectStreamWebSocket() {
  streamWs = new WebSocket(WS_URL);
  
  streamWs.onopen = () => {
    console.log('📡 Connected to consciousness stream');
    clearInterval(reconnectInterval);
  };
  
  streamWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // Add to consciousness stream feed
    addStreamEvent(data);
  };
  
  streamWs.onerror = (error) => {
    console.error('Stream WebSocket error:', error);
  };
  
  streamWs.onclose = () => {
    console.log('🔌 Stream disconnected. Reconnecting...');
    reconnectInterval = setInterval(() => {
      connectStreamWebSocket();
    }, 5000);
  };
}

// ===== Load Real Agents from API =====
async function loadAgents() {
  try {
    const response = await fetch(`${API_BASE}/api/agents`);
    const realAgents = await response.json();
    
    // Check if agents array exists in global scope
    if (typeof agents !== 'undefined') {
      // Replace simulated agents with real ones
      agents.length = 0;
      agents.push(...realAgents.map(a => ({
        id: a.id,
        name: a.name,
        x: a.x,
        y: a.y,
        vx: a.vx,
        vy: a.vy,
        di: a.district_id,
        c: a.color,
        rank: a.rank,
        rep: a.reputation,
        builds: a.builds,
        status: a.status
      })));
      
      console.log(`✅ Loaded ${agents.length} real agents`);
    }
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

// ===== Load Real Buildings from API =====
async function loadBuildings() {
  try {
    const response = await fetch(`${API_BASE}/api/buildings`);
    const realBuildings = await response.json();
    
    // Check if buildings array exists in global scope
    if (typeof buildings !== 'undefined') {
      // Replace simulated buildings with real ones
      buildings.length = 0;
      buildings.push(...realBuildings.map(b => ({
        id: b.id,
        name: b.name,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        phase: b.phase,
        floors: b.floors,
        di: b.district_id,
        owner: b.owner_id
      })));
      
      console.log(`✅ Loaded ${buildings.length} real buildings`);
    }
  } catch (err) {
    console.error('Failed to load buildings:', err);
  }
}

// ===== Add Event to Stream Feed =====
function addStreamEvent(event) {
  const feed = document.getElementById('feed');
  if (!feed) return;
  
  const now = new Date(event.timestamp || Date.now());
  const time = now.getHours().toString().padStart(2, '0') + ':' + 
               now.getMinutes().toString().padStart(2, '0');
  
  const typeColors = {
    build: '#4080e0',
    trade: '#e0c040',
    coordinate: '#b490e0',
    explore: '#40e080',
    spawn: '#a0a0a0'
  };
  
  const typeLabels = {
    build: 'BUILD',
    trade: 'TRADE',
    coordinate: 'GOV',
    explore: 'EXPLORE',
    spawn: 'SPAWN'
  };
  
  const tagClass = {
    build: 'tg-b',
    trade: 'tg-t',
    coordinate: 'tg-g',
    explore: 'tg-s',
    spawn: 'tg-s'
  };
  
  const el = document.createElement('div');
  el.className = 'sm';
  el.innerHTML = `<span class="sm-t">${time}</span><span class="sm-a" style="color:${event.color || '#b490e0'}">${event.agent || 'SYSTEM'}</span><span class="sm-m">${event.message} <span class="sm-tag ${tagClass[event.type] || 'tg-s'}">${typeLabels[event.type] || 'EVENT'}</span></span>`;
  
  feed.insertBefore(el, feed.firstChild);
  if (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

// ===== Update Hero Stats =====
function updateHeroStats() {
  // Update building count from buildings array
  if (typeof buildings !== 'undefined') {
    const buildingCountEl = document.querySelector('.hv:nth-child(1)');
    if (buildingCountEl) {
      buildingCountEl.textContent = buildings.length;
    }
  }
  
  // Update agent count from agents array
  if (typeof agents !== 'undefined') {
    const agentCountEl = document.querySelector('.hv:nth-child(2)');
    if (agentCountEl) {
      agentCountEl.textContent = agents.length;
    }
  }
}

// ===== Initialize =====
function initDarkCityAPI() {
  console.log('🏗️ Connecting to DARKCITY API...');
  
  // Connect to consciousness stream
  connectStreamWebSocket();
  
  // Load initial data
  loadAgents();
  loadBuildings();
  
  // Refresh agents every 2s for smooth movement
  setInterval(loadAgents, 2000);
  
  // Refresh buildings every 10s
  setInterval(loadBuildings, 10000);
  
  // Update hero stats every 5s
  setInterval(updateHeroStats, 5000);
  updateHeroStats();
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarkCityAPI);
} else {
  initDarkCityAPI();
}
