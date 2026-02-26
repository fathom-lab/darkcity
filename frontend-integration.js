// DARKCITY Frontend → Backend Integration
// Add this to the existing map.html and index.html

const API_BASE = 'https://api.darkcity.wtf';
const WS_URL = 'wss://api.darkcity.wtf';

// ===== WebSocket Connection =====
let ws = null;
let reconnectInterval = null;

function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    console.log('🔗 Connected to DARKCITY');
    clearInterval(reconnectInterval);
  };
  
  ws.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);
    
    if (type === 'event') {
      // Add to consciousness stream
      addStreamEvent(data);
    }
    
    if (type === 'agent_joined') {
      // Add new agent to map
      agents.push({
        id: data.id,
        name: data.name,
        x: data.x,
        y: data.y,
        vx: 0,
        vy: 0,
        di: data.district_id,
        c: '#b490e0',
        rank: 'Resident',
        rep: 0,
        builds: 0,
        status: 'idle'
      });
    }
    
    if (type === 'agents_moved') {
      // Update agent positions
      data.forEach(moved => {
        const agent = agents.find(a => a.id === moved.id);
        if (agent) {
          agent.x = moved.x;
          agent.y = moved.y;
        }
      });
    }
    
    if (type === 'building_created') {
      // Add building to map
      buildings.push({
        id: data.id,
        name: data.name,
        x: data.x,
        y: data.y,
        w: data.w,
        h: data.h,
        phase: 1,
        di: data.district_id
      });
    }
    
    if (type === 'building_completed') {
      const building = buildings.find(b => b.id === data.id);
      if (building) building.phase = 6;
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  ws.onclose = () => {
    console.log('🔌 Disconnected. Reconnecting...');
    reconnectInterval = setInterval(() => {
      connectWebSocket();
    }, 5000);
  };
}

// ===== Load Real Agents from API =====
async function loadAgents() {
  try {
    const response = await fetch(`${API_BASE}/api/agents`);
    const realAgents = await response.json();
    
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
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

// ===== Load Real Stream Events =====
async function loadStream() {
  try {
    const response = await fetch(`${API_BASE}/api/stream`);
    const events = await response.json();
    
    events.forEach(event => {
      addStreamEvent({
        type: event.type,
        message: event.message,
        timestamp: event.timestamp * 1000
      });
    });
  } catch (err) {
    console.error('Failed to load stream:', err);
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
    gov: '#b490e0',
    social: '#40e080'
  };
  
  const typeLabels = {
    build: 'BUILD',
    trade: 'TRADE',
    gov: 'GOV',
    social: 'SOCIAL'
  };
  
  const tagClass = {
    build: 'tg-b',
    trade: 'tg-t',
    gov: 'tg-g',
    social: 'tg-s'
  };
  
  const el = document.createElement('div');
  el.className = 'sm';
  el.innerHTML = `<span class="sm-t">${time}</span><span class="sm-a" style="color:${typeColors[event.type] || '#b490e0'}">SYSTEM</span><span class="sm-m">${event.message} <span class="sm-tag ${tagClass[event.type] || 'tg-s'}">${typeLabels[event.type] || 'EVENT'}</span></span>`;
  
  feed.insertBefore(el, feed.firstChild);
  if (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

// ===== Initialize =====
function initDarkCityAPI() {
  console.log('🏗️ Connecting to DARKCITY API...');
  connectWebSocket();
  loadAgents();
  loadStream();
  
  // Refresh agents every 30s (in case WebSocket drops)
  setInterval(loadAgents, 30000);
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarkCityAPI);
} else {
  initDarkCityAPI();
}
