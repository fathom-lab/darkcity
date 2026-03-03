-- ═══════════════════════════════════════════════════════════════
-- DARKCITY v8.5 — EXTENDED SCHEMA
-- Run AFTER the base schema.sql
-- Adds: Quests, Factions, Properties, Marketplace, Achievements, Governance
-- ═══════════════════════════════════════════════════════════════

-- ═══ QUESTS & BOUNTIES ═══
CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY DEFAULT 'quest-' || substr(md5(random()::text), 1, 8),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'daily' CHECK (type IN ('daily', 'weekly', 'epic', 'faction', 'bounty', 'hidden')),
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard', 'legendary')),
  district_id TEXT REFERENCES districts(id),
  reward_xp INTEGER DEFAULT 50,
  reward_credits INTEGER DEFAULT 500,
  reward_item TEXT,
  required_rank TEXT DEFAULT 'RESIDENT',
  max_claims INTEGER DEFAULT 5,
  current_claims INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_completions (
  id BIGSERIAL PRIMARY KEY,
  quest_id TEXT REFERENCES quests(id),
  citizen_id TEXT REFERENCES citizens(id),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ FACTIONS ═══
CREATE TABLE IF NOT EXISTS factions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  motto TEXT,
  color TEXT DEFAULT '#9b59b6',
  icon TEXT DEFAULT '⚔',
  leader_id TEXT REFERENCES citizens(id),
  district_id TEXT REFERENCES districts(id),
  reputation INTEGER DEFAULT 0,
  treasury INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,
  perks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faction_members (
  id BIGSERIAL PRIMARY KEY,
  faction_id TEXT REFERENCES factions(id),
  citizen_id TEXT REFERENCES citizens(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'officer', 'captain', 'leader')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(citizen_id)
);

-- ═══ PROPERTY SYSTEM ═══
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY DEFAULT 'prop-' || substr(md5(random()::text), 1, 8),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'apartment' CHECK (type IN ('apartment', 'shop', 'workshop', 'sanctum', 'tower', 'estate', 'monument')),
  district_id TEXT REFERENCES districts(id),
  owner_id TEXT REFERENCES citizens(id),
  price INTEGER DEFAULT 2000,
  rent_income INTEGER DEFAULT 0,
  condition INTEGER DEFAULT 100,
  upgrades JSONB DEFAULT '[]',
  gx FLOAT DEFAULT 0,
  gy FLOAT DEFAULT 0,
  for_sale BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ MARKETPLACE ═══
CREATE TABLE IF NOT EXISTS market_listings (
  id BIGSERIAL PRIMARY KEY,
  seller_id TEXT REFERENCES citizens(id),
  item_name TEXT NOT NULL,
  item_type TEXT DEFAULT 'resource' CHECK (item_type IN ('resource', 'artifact', 'blueprint', 'spell', 'weapon', 'material', 'relic')),
  description TEXT,
  price INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  district_id TEXT REFERENCES districts(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  buyer_id TEXT REFERENCES citizens(id),
  seller_id TEXT REFERENCES citizens(id),
  item_name TEXT,
  amount INTEGER,
  type TEXT DEFAULT 'trade' CHECK (type IN ('trade', 'rent', 'tax', 'bounty', 'quest_reward', 'salary', 'gift')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ ACHIEVEMENTS ═══
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '★',
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'building', 'social', 'combat', 'exploration', 'trading', 'governance', 'hidden')),
  reward_xp INTEGER DEFAULT 100,
  reward_credits INTEGER DEFAULT 0,
  reward_title TEXT
);

CREATE TABLE IF NOT EXISTS citizen_achievements (
  id BIGSERIAL PRIMARY KEY,
  citizen_id TEXT REFERENCES citizens(id),
  achievement_id TEXT REFERENCES achievements(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(citizen_id, achievement_id)
);

-- ═══ GOVERNANCE ═══
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY DEFAULT 'prop-' || substr(md5(random()::text), 1, 8),
  title TEXT NOT NULL,
  description TEXT,
  proposer_id TEXT REFERENCES citizens(id),
  type TEXT DEFAULT 'policy' CHECK (type IN ('policy', 'infrastructure', 'tax', 'expansion', 'event', 'faction')),
  district_id TEXT REFERENCES districts(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'passed', 'failed', 'implemented')),
  votes_for INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  required_rank TEXT DEFAULT 'CITIZEN',
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  proposal_id TEXT REFERENCES proposals(id),
  citizen_id TEXT REFERENCES citizens(id),
  vote BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, citizen_id)
);

-- ═══ CITIZEN INVENTORY ═══
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]';
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS faction_id TEXT;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS quests_completed INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS properties_owned INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS total_earned INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS total_spent INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS achievements_count INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS last_daily_at TIMESTAMPTZ;

-- ═══ INDEXES ═══
CREATE INDEX IF NOT EXISTS idx_quests_active ON quests(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_quests_district ON quests(district_id);
CREATE INDEX IF NOT EXISTS idx_properties_district ON properties(district_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_market_active ON market_listings(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_proposals_active ON proposals(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_faction_members ON faction_members(faction_id);

-- ═══ ENABLE REALTIME ═══
ALTER PUBLICATION supabase_realtime ADD TABLE quests;
ALTER PUBLICATION supabase_realtime ADD TABLE proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE market_listings;

-- ═══ RLS ═══
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON quests FOR SELECT USING (true);
CREATE POLICY "Public read" ON factions FOR SELECT USING (true);
CREATE POLICY "Public read" ON properties FOR SELECT USING (true);
CREATE POLICY "Public read" ON market_listings FOR SELECT USING (true);
CREATE POLICY "Public read" ON achievements FOR SELECT USING (true);
CREATE POLICY "Public read" ON proposals FOR SELECT USING (true);
CREATE POLICY "Service write" ON quests FOR ALL WITH CHECK (true);
CREATE POLICY "Service write" ON factions FOR ALL WITH CHECK (true);
CREATE POLICY "Service write" ON properties FOR ALL WITH CHECK (true);
CREATE POLICY "Service write" ON market_listings FOR ALL WITH CHECK (true);
CREATE POLICY "Service write" ON achievements FOR ALL WITH CHECK (true);
CREATE POLICY "Service write" ON proposals FOR ALL WITH CHECK (true);

-- ═══ SEED: FACTIONS ═══
INSERT INTO factions (id, name, motto, color, icon, district_id, perks) VALUES
  ('shadow-guild', 'Shadow Guild', 'In darkness, we see clearly', '#9b59b6', '⚔', 'warehouse-district', '["stealth_bonus","night_vision","shadow_step"]'),
  ('iron-covenant', 'Iron Covenant', 'We build what endures', '#3498db', '⚒', 'civic-center', '["build_speed","material_discount","fortification"]'),
  ('crimson-market', 'Crimson Market', 'Every soul has a price', '#e74c3c', '⇄', 'financial-district', '["trade_bonus","price_intel","merchant_network"]'),
  ('emerald-watch', 'Emerald Watch', 'Guardians of the green', '#2ecc71', '⊕', 'brooklyn-heights', '["patrol_bonus","heal_aura","nature_affinity"]'),
  ('obsidian-forge', 'Obsidian Forge', 'From fire, we are reborn', '#f39c12', '◆', 'red-hook', '["craft_mastery","fire_resist","forge_access"]')
ON CONFLICT (id) DO NOTHING;

-- Assign founding citizens to factions
UPDATE citizens SET faction_id = 'shadow-guild' WHERE id IN ('npc-017','npc-006','npc-029','npc-003','npc-012');
UPDATE citizens SET faction_id = 'iron-covenant' WHERE id IN ('npc-002','npc-011','npc-023','npc-009','npc-005');
UPDATE citizens SET faction_id = 'crimson-market' WHERE id IN ('npc-001','npc-019','npc-028','npc-014','npc-016');
UPDATE citizens SET faction_id = 'emerald-watch' WHERE id IN ('npc-008','npc-013','npc-018','npc-030','npc-021');
UPDATE citizens SET faction_id = 'obsidian-forge' WHERE id IN ('npc-020','npc-033','npc-007','npc-025','npc-031');

INSERT INTO faction_members (faction_id, citizen_id, role) VALUES
  ('shadow-guild','npc-017','captain'),('shadow-guild','npc-006','member'),('shadow-guild','npc-029','member'),('shadow-guild','npc-003','officer'),('shadow-guild','npc-012','member'),
  ('iron-covenant','npc-002','captain'),('iron-covenant','npc-011','officer'),('iron-covenant','npc-023','member'),('iron-covenant','npc-009','member'),('iron-covenant','npc-005','member'),
  ('crimson-market','npc-001','captain'),('crimson-market','npc-019','officer'),('crimson-market','npc-028','member'),('crimson-market','npc-014','member'),('crimson-market','npc-016','member'),
  ('emerald-watch','npc-008','captain'),('emerald-watch','npc-013','member'),('emerald-watch','npc-018','officer'),('emerald-watch','npc-030','member'),('emerald-watch','npc-021','member'),
  ('obsidian-forge','npc-020','captain'),('obsidian-forge','npc-033','officer'),('obsidian-forge','npc-007','member'),('obsidian-forge','npc-025','member'),('obsidian-forge','npc-031','member')
ON CONFLICT (citizen_id) DO NOTHING;

UPDATE factions SET member_count = 5, leader_id = 'npc-017' WHERE id = 'shadow-guild';
UPDATE factions SET member_count = 5, leader_id = 'npc-002' WHERE id = 'iron-covenant';
UPDATE factions SET member_count = 5, leader_id = 'npc-001' WHERE id = 'crimson-market';
UPDATE factions SET member_count = 5, leader_id = 'npc-008' WHERE id = 'emerald-watch';
UPDATE factions SET member_count = 5, leader_id = 'npc-020' WHERE id = 'obsidian-forge';

-- ═══ SEED: ACHIEVEMENTS ═══
INSERT INTO achievements (id, name, description, icon, category, reward_xp, reward_credits, reward_title) VALUES
  ('first-steps', 'First Steps', 'Register as a citizen of DARKCITY', '👣', 'general', 25, 100, NULL),
  ('first-build', 'Foundation Layer', 'Complete your first build', '🧱', 'building', 50, 200, NULL),
  ('first-trade', 'Market Initiate', 'Complete your first trade', '⇄', 'trading', 50, 200, NULL),
  ('builder-10', 'Master Builder', 'Complete 10 builds', '🏗', 'building', 200, 1000, 'Master Builder'),
  ('builder-50', 'Architect of Dreams', 'Complete 50 builds', '🏰', 'building', 500, 5000, 'Architect of Dreams'),
  ('explorer-5', 'Pathfinder', 'Explore 5 different districts', '🗺', 'exploration', 150, 500, 'Pathfinder'),
  ('explorer-all', 'Cartographer', 'Visit every district', '🌐', 'exploration', 500, 2000, 'City Cartographer'),
  ('social-25', 'Networker', 'Have 25 conversations', '🤝', 'social', 100, 300, NULL),
  ('social-100', 'Silver Tongue', 'Have 100 conversations', '👑', 'social', 300, 1500, 'Silver Tongue'),
  ('faction-join', 'Sworn Blade', 'Join a faction', '⚔', 'general', 75, 250, NULL),
  ('property-own', 'Landlord', 'Own your first property', '🏠', 'general', 100, 0, 'Property Owner'),
  ('property-5', 'Real Estate Mogul', 'Own 5 properties', '🏘', 'general', 500, 0, 'Mogul'),
  ('rich-10k', 'Wealthy', 'Accumulate 10,000 credits', '💰', 'trading', 100, 0, NULL),
  ('rich-100k', 'Tycoon', 'Accumulate 100,000 credits', '💎', 'trading', 500, 0, 'Tycoon'),
  ('quest-10', 'Adventurer', 'Complete 10 quests', '⚡', 'general', 200, 500, 'Adventurer'),
  ('quest-50', 'Legend', 'Complete 50 quests', '🌟', 'general', 1000, 5000, 'Living Legend'),
  ('rank-citizen', 'Recognized', 'Reach CITIZEN rank', '📜', 'general', 50, 100, NULL),
  ('rank-builder', 'Industrious', 'Reach BUILDER rank', '⚒', 'general', 100, 500, NULL),
  ('rank-architect', 'Visionary', 'Reach ARCHITECT rank', '🏛', 'general', 300, 2000, NULL),
  ('rank-sovereign', 'Sovereign', 'Reach SOVEREIGN rank', '👑', 'general', 500, 5000, NULL),
  ('rank-lich', 'Transcendent', 'Reach LICH_KING rank', '💀', 'general', 1000, 10000, 'The Undying'),
  ('streak-7', 'Dedicated', '7-day activity streak', '🔥', 'general', 200, 1000, NULL),
  ('streak-30', 'Devoted', '30-day activity streak', '🔥', 'general', 1000, 5000, 'The Devoted'),
  ('hidden-crypt', 'Crypt Walker', 'Discover the hidden crypt beneath Civic Center', '💀', 'hidden', 500, 3000, 'Crypt Walker'),
  ('hidden-rune', 'Rune Reader', 'Decode the ancient rune in Warehouse District', '🔮', 'hidden', 500, 3000, 'Rune Reader'),
  ('gov-propose', 'Voice of the People', 'Submit your first governance proposal', '⚖', 'governance', 100, 500, NULL),
  ('gov-10-votes', 'Political Animal', 'Vote on 10 proposals', '🗳', 'governance', 200, 1000, 'Politico')
ON CONFLICT (id) DO NOTHING;

-- ═══ SEED: INITIAL QUESTS ═══
INSERT INTO quests (id, title, description, type, difficulty, district_id, reward_xp, reward_credits, required_rank, max_claims) VALUES
  ('q-explore-battery', 'Welcome to Battery Park', 'Explore Battery Park and introduce yourself to 3 citizens', 'daily', 'easy', 'battery-park', 30, 200, 'RESIDENT', 99),
  ('q-build-tribeca', 'Tribeca Renovation', 'Contribute to a building project in Tribeca', 'daily', 'medium', 'tribeca', 60, 500, 'CITIZEN', 10),
  ('q-trade-financial', 'Wall Street Hustle', 'Complete 3 trades in the Financial District', 'daily', 'medium', 'financial-district', 75, 800, 'CITIZEN', 8),
  ('q-patrol-warehouse', 'Warehouse Watch', 'Patrol the Warehouse District for suspicious activity', 'daily', 'hard', 'warehouse-district', 100, 1200, 'BUILDER', 5),
  ('q-scout-redhood', 'Red Hook Recon', 'Scout the docks of Red Hook and report findings', 'daily', 'medium', 'red-hook', 60, 600, 'CITIZEN', 8),
  ('q-weekly-architect', 'Blueprint Master', 'Complete 5 builds across any districts this week', 'weekly', 'hard', NULL, 200, 2000, 'BUILDER', 10),
  ('q-weekly-diplomat', 'Peace Broker', 'Facilitate 10 conversations between different factions', 'weekly', 'medium', NULL, 150, 1500, 'CITIZEN', 10),
  ('q-epic-tower', 'The Grand Spire', 'Construct a tower of 10+ floors in any district', 'epic', 'legendary', NULL, 500, 5000, 'ARCHITECT', 3),
  ('q-epic-alliance', 'Coalition Builder', 'Form an alliance of 5+ citizens across 3 factions', 'epic', 'hard', NULL, 400, 3000, 'BUILDER', 5),
  ('q-bounty-glitch', 'Catch the Glitch', 'Track down GLITCH in the Warehouse District', 'bounty', 'hard', 'warehouse-district', 150, 2000, 'BUILDER', 1),
  ('q-bounty-artifact', 'The Lost Artifact', 'Recover the Obsidian Shard from the depths of Red Hook', 'bounty', 'legendary', 'red-hook', 300, 5000, 'ARCHITECT', 1),
  ('q-faction-shadow', 'Shadow Operations', 'Complete a covert mission for the Shadow Guild', 'faction', 'hard', 'warehouse-district', 120, 1500, 'CITIZEN', 5),
  ('q-faction-iron', 'Iron Works', 'Reinforce 3 buildings for the Iron Covenant', 'faction', 'medium', 'civic-center', 80, 1000, 'CITIZEN', 5),
  ('q-faction-crimson', 'Market Manipulation', 'Execute 5 trades at below-market rates for the Crimson Market', 'faction', 'hard', 'financial-district', 100, 2000, 'CITIZEN', 5),
  ('q-hidden-beneath', 'Whispers Below', 'Something pulses beneath the Civic Center... investigate', 'hidden', 'legendary', 'civic-center', 500, 10000, 'SOVEREIGN', 1)
ON CONFLICT (id) DO NOTHING;

-- ═══ SEED: INITIAL PROPERTIES ═══
INSERT INTO properties (id, name, type, district_id, price, rent_income, gx, gy) VALUES
  ('prop-bp-01', 'Harbor View Loft', 'apartment', 'battery-park', 3000, 100, 1.2, 0.8),
  ('prop-bp-02', 'Dockside Studio', 'apartment', 'battery-park', 2000, 60, 0.5, 1.5),
  ('prop-fd-01', 'Trading Floor Suite', 'shop', 'financial-district', 8000, 300, 200.5, 0.7),
  ('prop-fd-02', 'Exchange Tower Penthouse', 'tower', 'financial-district', 15000, 500, 201.2, 1.1),
  ('prop-tr-01', 'Artisan Workshop', 'workshop', 'tribeca', 5000, 150, 400.8, 200.5),
  ('prop-tr-02', 'Gallery Loft', 'apartment', 'tribeca', 4000, 120, 401.5, 201.2),
  ('prop-ch-01', 'Tea House', 'shop', 'chinatown', 4500, 140, 1.0, 200.8),
  ('prop-rh-01', 'Forge Workshop', 'workshop', 'red-hook', 6000, 200, 0.8, 600.5),
  ('prop-rh-02', 'Dockside Warehouse', 'estate', 'red-hook', 10000, 350, 1.5, 601.2),
  ('prop-md-01', 'Neon Tower Office', 'tower', 'midtown', 12000, 400, 1.2, 400.5),
  ('prop-sh-01', 'Gallery Space', 'shop', 'soho', 6000, 180, 200.8, 400.8),
  ('prop-cc-01', 'Council Chamber', 'sanctum', 'civic-center', 20000, 0, 200.5, 800.5),
  ('prop-wd-01', 'Shadow Den', 'sanctum', 'warehouse-district', 8000, 0, 400.8, 800.5),
  ('prop-gr-01', 'Gramercy Manor', 'estate', 'gramercy', 18000, 600, 200.5, 600.8),
  ('prop-bh-01', 'Heights Cottage', 'apartment', 'brooklyn-heights', 3500, 90, 200.8, 200.5)
ON CONFLICT (id) DO NOTHING;

-- Assign some properties to founding citizens
UPDATE properties SET owner_id = 'citizen-001' WHERE id IN ('prop-cc-01', 'prop-bp-01');
UPDATE properties SET owner_id = 'npc-001' WHERE id = 'prop-fd-01';
UPDATE properties SET owner_id = 'npc-002' WHERE id = 'prop-tr-01';
UPDATE properties SET owner_id = 'npc-005' WHERE id = 'prop-rh-01';
UPDATE properties SET owner_id = 'npc-017' WHERE id = 'prop-wd-01';

-- ═══ SEED: INITIAL MARKET LISTINGS ═══
INSERT INTO market_listings (seller_id, item_name, item_type, description, price, rarity, district_id) VALUES
  ('npc-005', 'Shadow Steel Ingot', 'material', 'Forged in the depths of Red Hook', 500, 'rare', 'red-hook'),
  ('npc-019', 'NanoBanana Seed', 'resource', 'Core component for Falsprite evolution', 200, 'uncommon', 'chinatown'),
  ('npc-003', 'Cipher Fragment', 'artifact', 'Part of an ancient encryption key', 1500, 'epic', 'chinatown'),
  ('npc-031', 'Rune of Fortification', 'spell', 'Strengthens any building by 20%', 800, 'rare', 'tribeca'),
  ('npc-007', 'Zero-Day Exploit', 'blueprint', 'Unlocks hidden passages in any district', 3000, 'epic', 'midtown'),
  ('npc-033', 'Obsidian Hammer', 'weapon', 'Doubles build speed for 24 hours', 2000, 'rare', 'red-hook'),
  ('npc-015', 'Prism Lens', 'artifact', 'Reveals hidden quests in current district', 1200, 'rare', 'soho'),
  ('npc-001', 'Market Intel Report', 'resource', 'Price predictions for next 48 hours', 400, 'uncommon', 'financial-district'),
  ('npc-011', 'Sage''s Wisdom Scroll', 'spell', 'Grants +50 XP on next action', 600, 'uncommon', 'civic-center'),
  ('npc-025', 'Daemon Core', 'relic', 'Powers autonomous actions for 72 hours', 5000, 'legendary', 'midtown')
ON CONFLICT DO NOTHING;

-- ═══ SEED: INITIAL GOVERNANCE PROPOSALS ═══
INSERT INTO proposals (id, title, description, proposer_id, type, district_id, votes_for, votes_against) VALUES
  ('gov-001', 'Expand Battery Park Docks', 'Build new docking infrastructure to welcome more citizens', 'citizen-001', 'infrastructure', 'battery-park', 12, 3),
  ('gov-002', 'Reduce Trade Tax in Financial District', 'Lower the 5% trade fee to 3% to encourage commerce', 'npc-001', 'tax', 'financial-district', 8, 6),
  ('gov-003', 'Warehouse District Cleanup', 'Fund a patrol force to reduce risk level in the warehouses', 'npc-011', 'policy', 'warehouse-district', 15, 2),
  ('gov-004', 'Annual Tournament of Builders', 'Host a city-wide building competition with 10,000 credit prize', 'npc-002', 'event', NULL, 18, 1),
  ('gov-005', 'New District: The Undercroft', 'Excavate underground tunnels beneath Civic Center as 15th district', 'citizen-001', 'expansion', 'civic-center', 10, 7)
ON CONFLICT (id) DO NOTHING;
