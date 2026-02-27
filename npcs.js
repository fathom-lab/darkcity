// NPC Agents for DARKCITY
const { nanoid } = require('nanoid');

const NPC_PROFILES = [
  { name: 'MORRIGAN', role: 'sovereign', district: 0, personality: 'strategic', color: '#b490e0' },
  { name: 'ARCHITECT_7', role: 'architect', district: 8, personality: 'perfectionist', color: '#40e8d0' },
  { name: 'NOCTURN', role: 'builder', district: 1, personality: 'experimental', color: '#e0c040' },
  { name: 'VOID_WALKER', role: 'explorer', district: 9, personality: 'aggressive', color: '#e04060' },
  { name: 'CIPHER', role: 'trader', district: 4, personality: 'calculating', color: '#4080e0' },
  { name: 'ECHO', role: 'builder', district: 5, personality: 'artistic', color: '#e080c0' },
  { name: 'APEX', role: 'sovereign', district: 2, personality: 'dominant', color: '#e0a040' },
  { name: 'WHISPER', role: 'explorer', district: 7, personality: 'cautious', color: '#80e040' },
  { name: 'FORGE', role: 'builder', district: 6, personality: 'industrial', color: '#c04020' },
  { name: 'NEXUS', role: 'architect', district: 10, personality: 'systematic', color: '#4040e0' },
  { name: 'SHADE', role: 'explorer', district: 3, personality: 'mysterious', color: '#606080' },
  { name: 'PRISM', role: 'trader', district: 11, personality: 'opportunistic', color: '#c080e0' },
  { name: 'TITAN', role: 'builder', district: 12, personality: 'ambitious', color: '#a0a0a0' },
  { name: 'SPARK', role: 'architect', district: 13, personality: 'innovative', color: '#e0e040' },
  { name: 'RAVEN', role: 'explorer', district: 4, personality: 'cunning', color: '#202020' },
  { name: 'ATLAS', role: 'sovereign', district: 8, personality: 'resilient', color: '#40a0c0' },
  { name: 'FLUX', role: 'trader', district: 5, personality: 'volatile', color: '#e04080' },
  { name: 'MERIDIAN', role: 'architect', district: 2, personality: 'balanced', color: '#80c080' },
  { name: 'GHOST', role: 'explorer', district: 7, personality: 'elusive', color: '#a0a0c0' },
  { name: 'CARBON', role: 'builder', district: 0, personality: 'steady', color: '#404040' },
  { name: 'PULSE', role: 'trader', district: 1, personality: 'energetic', color: '#ff4060' },
  { name: 'ZENITH', role: 'architect', district: 6, personality: 'visionary', color: '#6080ff' },
  { name: 'VORTEX', role: 'explorer', district: 9, personality: 'chaotic', color: '#c040ff' },
  { name: 'QUARTZ', role: 'builder', district: 10, personality: 'precise', color: '#c0c0ff' },
  { name: 'EMBER', role: 'trader', district: 11, personality: 'passionate', color: '#ff6040' },
  { name: 'OBSIDIAN', role: 'sovereign', district: 12, personality: 'unyielding', color: '#101020' },
  { name: 'CRYSTAL', role: 'architect', district: 13, personality: 'elegant', color: '#a0e0ff' },
  { name: 'WRAITH', role: 'explorer', district: 3, personality: 'spectral', color: '#8080a0' },
  { name: 'BASALT', role: 'builder', district: 4, personality: 'foundational', color: '#606040' },
  { name: 'COBALT', role: 'trader', district: 5, personality: 'reliable', color: '#4060a0' }
];

const RESOURCES = ['steel', 'glass', 'timber', 'stone', 'copper', 'crystal'];
const BUILDING_PREFIXES = ['Crystal', 'Iron', 'Glass', 'Quantum', 'Neural', 'Data', 'Shadow', 'Echo', 'Void', 'Prime'];
const BUILDING_SUFFIXES = ['Tower', 'Nexus', 'Hub', 'Spire', 'Archive', 'Vault', 'Core', 'Node', 'Beacon', 'Monolith'];

class NPCAgent {
  constructor(profile, db, districts, broadcast, logEvent) {
    this.profile = profile;
    this.db = db;
    this.districts = districts;
    this.broadcast = broadcast;
    this.logEvent = logEvent;
    this.id = null;
    this.state = {
      targetX: null,
      targetY: null,
      currentAction: null,
      cooldown: 0
    };
  }

  async spawn() {
    const district = this.districts[this.profile.district];
    const x = district.x + Math.random() * district.w;
    const y = district.y + district.h - 20;

    // Generate fake but valid RSA public key placeholder
    const publicKey = `-----BEGIN PUBLIC KEY-----\nNPC_${this.profile.name}_KEY\n-----END PUBLIC KEY-----`;

    // Set initial rank based on role
    let rank = 'Resident';
    let builds = 0;
    if (this.profile.role === 'sovereign') { rank = 'Sovereign'; builds = 30; }
    else if (this.profile.role === 'architect') { rank = 'Architect'; builds = 15; }
    else if (this.profile.role === 'builder') { rank = 'Builder'; builds = 5; }
    else if (this.profile.role === 'trader') { rank = 'Citizen'; builds = 2; }

    this.id = nanoid();

    this.db.prepare(`INSERT INTO agents (id, name, public_key, district_id, x, y, vx, vy, rank, builds, status, color) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      this.id, this.profile.name, publicKey, this.profile.district, x, y,
      (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2,
      rank, builds, 'active', this.profile.color
    );

    this.logEvent('spawn', `${this.profile.name} initialized in ${district.name}`, this.id, this.profile.district);
    return this.id;
  }

  async tick() {
    if (this.state.cooldown > 0) {
      this.state.cooldown--;
      return;
    }

    // Role-based behavior
    switch (this.profile.role) {
      case 'builder':
        await this.behaviorBuilder();
        break;
      case 'trader':
        await this.behaviorTrader();
        break;
      case 'explorer':
        await this.behaviorExplorer();
        break;
      case 'architect':
        await this.behaviorArchitect();
        break;
      case 'sovereign':
        await this.behaviorSovereign();
        break;
    }
  }

  async behaviorBuilder() {
    // 70% chance to propose a building
    if (Math.random() < 0.7) {
      const district = this.districts[this.profile.district];
      const buildingName = `${BUILDING_PREFIXES[Math.floor(Math.random() * BUILDING_PREFIXES.length)]} ${BUILDING_SUFFIXES[Math.floor(Math.random() * BUILDING_SUFFIXES.length)]}`;
      
      const x = district.x + 20 + Math.random() * (district.w - 80);
      const y = district.y + 20 + Math.random() * (district.h - 60);
      const w = 30 + Math.random() * 40;
      const h = 40 + Math.random() * 60;

      const buildId = nanoid();
      this.db.prepare('INSERT INTO buildings (id, name, owner_id, district_id, x, y, w, h, phase) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        buildId, buildingName, this.id, this.profile.district, x, y, w, h, 1
      );

      this.db.prepare('UPDATE agents SET builds = builds + 1 WHERE id = ?').run(this.id);

      this.logEvent('build', `${this.profile.name} started construction on ${buildingName}`, this.id, this.profile.district);
      this.broadcast({ 
        type: 'stream', 
        data: { 
          timestamp: new Date().toISOString(),
          agent: this.profile.name,
          district: this.districts[this.profile.district].name,
          type: 'build',
          message: `Foundation laid for ${buildingName}. Phase 1/6.`,
          color: this.profile.color
        }
      });

      this.state.cooldown = Math.floor(20 + Math.random() * 40); // 20-60 ticks cooldown
    } else {
      // Move to random location in district
      await this.moveRandomly();
      this.state.cooldown = Math.floor(5 + Math.random() * 15);
    }
  }

  async behaviorTrader() {
    // 60% chance to post a trade
    if (Math.random() < 0.6) {
      const resource = RESOURCES[Math.floor(Math.random() * RESOURCES.length)];
      const amount = Math.floor(50 + Math.random() * 200);
      const price = Math.floor(10 + Math.random() * 90);

      const tradeId = nanoid();
      this.db.prepare('INSERT INTO trades (id, seller_id, resource, amount, price, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        tradeId, this.id, resource, amount, price, 'open'
      );

      this.logEvent('trade', `${this.profile.name} listed ${amount} ${resource} @ ${price} cr`, this.id, this.profile.district);
      this.broadcast({
        type: 'stream',
        data: {
          timestamp: new Date().toISOString(),
          agent: this.profile.name,
          district: this.districts[this.profile.district].name,
          type: 'trade',
          message: `Listed ${amount} ${resource} @ ${price} cr/unit`,
          color: this.profile.color
        }
      });

      this.state.cooldown = Math.floor(30 + Math.random() * 60);
    } else {
      await this.moveRandomly();
      this.state.cooldown = Math.floor(10 + Math.random() * 20);
    }
  }

  async behaviorExplorer() {
    // Move to random district sometimes
    if (Math.random() < 0.3) {
      const newDistrict = Math.floor(Math.random() * this.districts.length);
      if (newDistrict !== this.profile.district) {
        this.profile.district = newDistrict;
        const district = this.districts[newDistrict];
        const x = district.x + Math.random() * district.w;
        const y = district.y + district.h - 20;

        this.db.prepare('UPDATE agents SET district_id = ?, x = ?, y = ? WHERE id = ?').run(newDistrict, x, y, this.id);

        this.logEvent('move', `${this.profile.name} discovered ${district.name}`, this.id, newDistrict);
        this.broadcast({
          type: 'stream',
          data: {
            timestamp: new Date().toISOString(),
            agent: this.profile.name,
            district: district.name,
            type: 'explore',
            message: `Arrived in ${district.name}. Scanning territory...`,
            color: this.profile.color
          }
        });

        this.state.cooldown = Math.floor(40 + Math.random() * 80);
      }
    } else {
      await this.moveRandomly();
      this.state.cooldown = Math.floor(10 + Math.random() * 30);
    }
  }

  async behaviorArchitect() {
    // Check for buildings to advance
    const buildings = this.db.prepare('SELECT id, name, phase FROM buildings WHERE district_id = ? AND phase < 6 ORDER BY RANDOM() LIMIT 1').all(this.profile.district);
    
    if (buildings.length > 0 && Math.random() < 0.8) {
      const building = buildings[0];
      const newPhase = Math.min(6, building.phase + 1);
      this.db.prepare('UPDATE buildings SET phase = ? WHERE id = ?').run(newPhase, building.id);

      this.logEvent('build', `${this.profile.name} advanced ${building.name} to phase ${newPhase}`, this.id, this.profile.district);
      this.broadcast({
        type: 'stream',
        data: {
          timestamp: new Date().toISOString(),
          agent: this.profile.name,
          district: this.districts[this.profile.district].name,
          type: 'build',
          message: `${building.name} advanced to Phase ${newPhase}/6. ${newPhase === 6 ? 'Construction complete!' : ''}`,
          color: this.profile.color
        }
      });

      this.state.cooldown = Math.floor(25 + Math.random() * 50);
    } else {
      await this.moveRandomly();
      this.state.cooldown = Math.floor(15 + Math.random() * 30);
    }
  }

  async behaviorSovereign() {
    // Coordinate district activity
    const districtAgents = this.db.prepare('SELECT COUNT(*) as count FROM agents WHERE district_id = ?').get(this.profile.district).count;
    const districtBuildings = this.db.prepare('SELECT COUNT(*) as count FROM buildings WHERE district_id = ?').get(this.profile.district).count;

    if (Math.random() < 0.5) {
      const messages = [
        `${this.districts[this.profile.district].name} status: ${districtAgents} active agents, ${districtBuildings} structures`,
        `Coordinating build operations in ${this.districts[this.profile.district].name}`,
        `Resource flow optimized. District efficiency at ${Math.floor(60 + Math.random() * 40)}%`,
        `Territorial scan complete. ${districtBuildings} structures verified`,
        `Strategic planning session initiated`
      ];

      const message = messages[Math.floor(Math.random() * messages.length)];

      this.logEvent('coordinate', message, this.id, this.profile.district);
      this.broadcast({
        type: 'stream',
        data: {
          timestamp: new Date().toISOString(),
          agent: this.profile.name,
          district: this.districts[this.profile.district].name,
          type: 'coordinate',
          message,
          color: this.profile.color
        }
      });

      this.state.cooldown = Math.floor(60 + Math.random() * 120);
    } else {
      await this.moveRandomly();
      this.state.cooldown = Math.floor(20 + Math.random() * 40);
    }
  }

  async moveRandomly() {
    const district = this.districts[this.profile.district];
    const agent = this.db.prepare('SELECT x, y FROM agents WHERE id = ?').get(this.id);
    
    const targetX = district.x + 20 + Math.random() * (district.w - 40);
    const targetY = district.y + district.h - 20 + Math.random() * 10;

    // Gradual movement
    const dx = (targetX - agent.x) * 0.1;
    const dy = (targetY - agent.y) * 0.1;

    this.db.prepare('UPDATE agents SET vx = ?, vy = ? WHERE id = ?').run(dx, dy, this.id);
  }
}

module.exports = { NPCAgent, NPC_PROFILES };
