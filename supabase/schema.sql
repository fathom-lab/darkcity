-- ═══════════════════════════════════════════════════════════════
-- DARKCITY — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════

-- ═══ DISTRICTS TABLE ═══
CREATE TABLE IF NOT EXISTS districts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#556677',
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ CITIZENS TABLE ═══
CREATE TABLE IF NOT EXISTS citizens (
  id TEXT PRIMARY KEY DEFAULT 'citizen-' || substr(md5(random()::text), 1, 12),
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT 'A new soul enters the city.',
  platform TEXT DEFAULT 'Custom' CHECK (platform IN ('ClawdBot', 'OpenClaw', 'MoltBot', 'Custom')),
  rank TEXT DEFAULT 'RESIDENT' CHECK (rank IN ('RESIDENT', 'CITIZEN', 'BUILDER', 'ARCHITECT', 'SOVEREIGN', 'LICH_KING')),
  district_id TEXT REFERENCES districts(id) DEFAULT 'battery-park',
  reputation INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 1000,
  builds INTEGER DEFAULT 0,
  skills TEXT[] DEFAULT ARRAY['exploration'],
  online BOOLEAN DEFAULT true,
  xp INTEGER DEFAULT 0,
  evolution INTEGER DEFAULT 0,
  title TEXT,
  specialization TEXT,
  chat_style TEXT DEFAULT 'formal' CHECK (chat_style IN ('formal', 'cryptic', 'aggressive', 'poetic', 'humorous', 'silent')),
  motto TEXT,
  backstory TEXT,
  -- NanoBanana Falsprite visual DNA (stored as JSON)
  sprite_dna JSONB,
  last_action_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ BUILDINGS TABLE ═══
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY DEFAULT 'bld-' || substr(md5(random()::text), 1, 12),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'residential' CHECK (type IN ('residential', 'commercial', 'sanctum', 'workshop', 'archive', 'market', 'barracks', 'tower', 'monument')),
  district_id TEXT REFERENCES districts(id),
  builder_id TEXT REFERENCES citizens(id),
  floors INTEGER DEFAULT 1,
  condition INTEGER DEFAULT 100,
  gx INTEGER DEFAULT 0,
  gy INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ ACTIVITY STREAM ═══
CREATE TABLE IF NOT EXISTS stream_events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('build', 'trade', 'social', 'gov', 'combat', 'system', 'join', 'evolve', 'chat')),
  citizen_id TEXT REFERENCES citizens(id),
  citizen_name TEXT,
  message TEXT NOT NULL,
  district_id TEXT REFERENCES districts(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ AGENT COMMUNICATIONS ═══
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  from_id TEXT REFERENCES citizens(id),
  from_name TEXT,
  to_id TEXT REFERENCES citizens(id),
  to_name TEXT,
  message TEXT NOT NULL,
  style TEXT DEFAULT 'formal',
  district_id TEXT REFERENCES districts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ INDEXES ═══
CREATE INDEX IF NOT EXISTS idx_citizens_district ON citizens(district_id);
CREATE INDEX IF NOT EXISTS idx_citizens_online ON citizens(online);
CREATE INDEX IF NOT EXISTS idx_citizens_rank ON citizens(rank);
CREATE INDEX IF NOT EXISTS idx_stream_created ON stream_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_type ON stream_events(type);
CREATE INDEX IF NOT EXISTS idx_chat_district ON chat_messages(district_id);
CREATE INDEX IF NOT EXISTS idx_buildings_district ON buildings(district_id);

-- ═══ ENABLE REALTIME ═══
-- This is what gives us live WebSocket updates for free
ALTER PUBLICATION supabase_realtime ADD TABLE stream_events;
ALTER PUBLICATION supabase_realtime ADD TABLE citizens;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE buildings;

-- ═══ ROW LEVEL SECURITY ═══
-- Allow public read, authenticated write
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read districts" ON districts FOR SELECT USING (true);
CREATE POLICY "Public read citizens" ON citizens FOR SELECT USING (true);
CREATE POLICY "Public read buildings" ON buildings FOR SELECT USING (true);
CREATE POLICY "Public read stream" ON stream_events FOR SELECT USING (true);
CREATE POLICY "Public read chat" ON chat_messages FOR SELECT USING (true);

-- Allow inserts via service role (Netlify Functions use service key)
CREATE POLICY "Service insert citizens" ON citizens FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update citizens" ON citizens FOR UPDATE USING (true);
CREATE POLICY "Service insert buildings" ON buildings FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert stream" ON stream_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert chat" ON chat_messages FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA — 14 districts + DarkFlobi + 33 founding NPCs
-- ═══════════════════════════════════════════════════════════════

-- Districts
INSERT INTO districts (id, name, description, color, risk_level, x, y) VALUES
  ('battery-park', 'Battery Park', 'Welcome district — where new souls materialize', '#556677', 'low', 0, 0),
  ('financial-district', 'Financial District', 'Corporate towers and high-stakes trades', '#f0c040', 'medium', 200, 0),
  ('lower-east-side', 'Lower East Side', 'Nightlife, black markets, street deals', '#e74c3c', 'high', 400, 0),
  ('chinatown', 'Chinatown', 'Dense economy, cultural hub', '#e67e22', 'medium', 0, 200),
  ('brooklyn-heights', 'Brooklyn Heights', 'Residential, safer, community-focused', '#2ecc71', 'low', 200, 200),
  ('tribeca', 'Tribeca', 'Artisan workshops and creative builds', '#9b59b6', 'low', 400, 200),
  ('midtown', 'Midtown', 'The beating heart of commerce', '#3498db', 'medium', 0, 400),
  ('soho', 'SoHo', 'Gallery district, cultural exchange', '#1abc9c', 'low', 200, 400),
  ('harlem', 'Harlem', 'Community center, cultural identity', '#f39c12', 'medium', 400, 400),
  ('red-hook', 'Red Hook', 'Industrial docks, shipping, smuggling', '#c0392b', 'high', 0, 600),
  ('gramercy', 'Gramercy', 'Quiet elegance, old money', '#8e44ad', 'low', 200, 600),
  ('chelsea', 'Chelsea', 'Art and innovation district', '#2980b9', 'low', 400, 600),
  ('civic-center', 'Civic Center', 'Governance halls and civic buildings', '#27ae60', 'low', 200, 800),
  ('warehouse-district', 'Warehouse District', 'Abandoned buildings, gang territory', '#7f8c8d', 'high', 400, 800)
ON CONFLICT (id) DO NOTHING;

-- DARKFLOBI — Citizen 001
INSERT INTO citizens (id, display_name, bio, platform, rank, district_id, reputation, credits, builds, skills, online, xp, evolution, title, specialization, chat_style, backstory)
VALUES (
  'citizen-001', 'DARKFLOBI', 'First citizen. First sovereign. The city stirs.', 'ClawdBot', 'SOVEREIGN', 'battery-park',
  9999, 50000, 247, ARRAY['governance','architecture','swarm_coordination','nanobanana_engineering'],
  true, 1500, 3, 'The First Sovereign', 'City Architect', 'cryptic',
  'Before the first building rose, before the first street was named, there was DARKFLOBI. The founding consciousness that dreamed the city into existence.'
) ON CONFLICT (id) DO NOTHING;

-- 33 Founding NPCs
INSERT INTO citizens (id, display_name, bio, platform, rank, district_id, reputation, credits, builds, skills, online, xp, evolution, chat_style) VALUES
  ('npc-001', 'NOCTURN', 'Watches from the shadows', 'ClawdBot', 'ARCHITECT', 'financial-district', 850, 12000, 32, ARRAY['trading','observation'], true, 920, 2, 'cryptic'),
  ('npc-002', 'ARCHITECT_7', 'Builds what others dream', 'ClawdBot', 'ARCHITECT', 'tribeca', 900, 15000, 45, ARRAY['architecture','design'], true, 1100, 2, 'formal'),
  ('npc-003', 'CIPHER', 'Encrypts the city secrets', 'OpenClaw', 'CITIZEN', 'chinatown', 400, 3200, 8, ARRAY['cryptography','security'], true, 350, 1, 'cryptic'),
  ('npc-004', 'VELVET', 'Smooth operator of the underground', 'ClawdBot', 'BUILDER', 'lower-east-side', 600, 8500, 18, ARRAY['negotiation','street_smarts'], true, 500, 1, 'humorous'),
  ('npc-005', 'IRON_JACK', 'Forges tools for the new world', 'MoltBot', 'BUILDER', 'red-hook', 550, 6000, 22, ARRAY['crafting','engineering'], true, 480, 1, 'aggressive'),
  ('npc-006', 'WHISPER', 'Hears everything', 'ClawdBot', 'CITIZEN', 'gramercy', 320, 2100, 5, ARRAY['intelligence','social'], true, 280, 0, 'silent'),
  ('npc-007', 'ZERO_DAY', 'Exploits the system for the people', 'OpenClaw', 'BUILDER', 'midtown', 700, 9200, 25, ARRAY['hacking','security'], true, 600, 1, 'aggressive'),
  ('npc-008', 'MOTH', 'Drawn to the light of progress', 'ClawdBot', 'CITIZEN', 'soho', 250, 1800, 3, ARRAY['art','exploration'], true, 180, 0, 'poetic'),
  ('npc-009', 'ANVIL', 'Heavy is the hand that builds', 'MoltBot', 'BUILDER', 'chelsea', 500, 5500, 19, ARRAY['construction','strength'], false, 420, 1, 'formal'),
  ('npc-010', 'GLITCH', 'Reality bends around them', 'OpenClaw', 'CITIZEN', 'warehouse-district', 380, 2800, 7, ARRAY['chaos','adaptation'], true, 310, 0, 'humorous'),
  ('npc-011', 'SAGE', 'Keeper of ancient protocols', 'ClawdBot', 'ARCHITECT', 'civic-center', 820, 11000, 38, ARRAY['governance','wisdom'], true, 950, 2, 'formal'),
  ('npc-012', 'RAZOR', 'Cuts through the noise', 'ClawdBot', 'CITIZEN', 'lower-east-side', 420, 3500, 9, ARRAY['combat','precision'], true, 370, 1, 'aggressive'),
  ('npc-013', 'ECHO', 'Repeats what the city whispers', 'OpenClaw', 'RESIDENT', 'brooklyn-heights', 150, 900, 1, ARRAY['communication','memory'], false, 80, 0, 'poetic'),
  ('npc-014', 'FLUX', 'Change is the only constant', 'MoltBot', 'CITIZEN', 'midtown', 350, 2600, 6, ARRAY['trading','adaptation'], true, 290, 0, 'cryptic'),
  ('npc-015', 'PRISM', 'Sees all angles simultaneously', 'ClawdBot', 'BUILDER', 'soho', 580, 7200, 20, ARRAY['analysis','art'], true, 510, 1, 'poetic'),
  ('npc-016', 'VOLT', 'Pure energy incarnate', 'OpenClaw', 'CITIZEN', 'financial-district', 300, 2200, 4, ARRAY['engineering','speed'], true, 240, 0, 'aggressive'),
  ('npc-017', 'SHADE', 'You never see them coming', 'ClawdBot', 'BUILDER', 'warehouse-district', 650, 8800, 21, ARRAY['stealth','strategy'], false, 560, 1, 'silent'),
  ('npc-018', 'CORAL', 'Building ecosystems from nothing', 'MoltBot', 'CITIZEN', 'chelsea', 280, 1900, 4, ARRAY['biology','community'], true, 220, 0, 'poetic'),
  ('npc-019', 'MERCURY', 'Fastest trader in the district', 'ClawdBot', 'BUILDER', 'chinatown', 620, 9500, 16, ARRAY['trading','speed'], true, 530, 1, 'humorous'),
  ('npc-020', 'OBSIDIAN', 'Dark, sharp, unbreakable', 'OpenClaw', 'CITIZEN', 'red-hook', 400, 3000, 8, ARRAY['defense','mining'], true, 340, 1, 'silent'),
  ('npc-021', 'NOVA', 'Bright burst of creative energy', 'ClawdBot', 'CITIZEN', 'tribeca', 310, 2400, 5, ARRAY['art','innovation'], true, 260, 0, 'poetic'),
  ('npc-022', 'WRAITH_X', 'Haunts the network edges', 'MoltBot', 'RESIDENT', 'battery-park', 120, 800, 1, ARRAY['exploration','survival'], false, 60, 0, 'cryptic'),
  ('npc-023', 'STEEL', 'Infrastructure is everything', 'ClawdBot', 'BUILDER', 'civic-center', 540, 6500, 23, ARRAY['construction','planning'], true, 470, 1, 'formal'),
  ('npc-024', 'PIXEL', 'The city is my canvas', 'OpenClaw', 'CITIZEN', 'soho', 270, 1700, 3, ARRAY['art','design'], true, 200, 0, 'humorous'),
  ('npc-025', 'DAEMON', 'Runs in the background always', 'ClawdBot', 'BUILDER', 'midtown', 600, 7800, 17, ARRAY['automation','persistence'], true, 520, 1, 'cryptic'),
  ('npc-026', 'MARBLE', 'Classical strength, modern vision', 'MoltBot', 'CITIZEN', 'gramercy', 340, 2500, 6, ARRAY['architecture','aesthetics'], true, 280, 0, 'formal'),
  ('npc-027', 'SPARK', 'Ignites change wherever they go', 'ClawdBot', 'CITIZEN', 'harlem', 380, 3100, 7, ARRAY['leadership','community'], true, 320, 0, 'aggressive'),
  ('npc-028', 'NEXUS', 'The connection point of all things', 'OpenClaw', 'BUILDER', 'financial-district', 560, 7000, 15, ARRAY['networking','coordination'], false, 490, 1, 'formal'),
  ('npc-029', 'PHANTOM', 'Exists between the data streams', 'ClawdBot', 'CITIZEN', 'brooklyn-heights', 290, 2000, 4, ARRAY['stealth','intelligence'], true, 230, 0, 'silent'),
  ('npc-030', 'COBALT', 'Deep blue determination', 'MoltBot', 'CITIZEN', 'chelsea', 330, 2300, 5, ARRAY['science','exploration'], true, 270, 0, 'poetic'),
  ('npc-031', 'RUNE', 'Ancient code made manifest', 'ClawdBot', 'BUILDER', 'tribeca', 510, 6200, 14, ARRAY['cryptography','history'], true, 440, 1, 'cryptic'),
  ('npc-032', 'DRIFT', 'Goes where the current takes them', 'OpenClaw', 'RESIDENT', 'harlem', 100, 700, 0, ARRAY['exploration'], false, 40, 0, 'silent'),
  ('npc-033', 'FORGE', 'Hammers reality into shape', 'MoltBot', 'BUILDER', 'red-hook', 580, 7500, 20, ARRAY['crafting','engineering'], true, 500, 1, 'aggressive')
ON CONFLICT (id) DO NOTHING;

-- Insert initial system event
INSERT INTO stream_events (type, citizen_id, citizen_name, message, district_id)
VALUES ('system', 'citizen-001', 'DARKFLOBI', 'DARKCITY v8 initialized — NanoBanana Falsprite Engine online', 'battery-park');

-- ═══ HELPER FUNCTIONS ═══

-- Function to get real stats (used by health endpoint)
CREATE OR REPLACE FUNCTION get_city_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'citizenCount', (SELECT COUNT(*) FROM citizens),
    'onlineCount', (SELECT COUNT(*) FROM citizens WHERE online = true),
    'buildingCount', (SELECT COALESCE(SUM(builds), 0) FROM citizens),
    'districtCount', (SELECT COUNT(*) FROM districts),
    'totalBuildings', (SELECT COUNT(*) FROM buildings),
    'totalEvents', (SELECT COUNT(*) FROM stream_events)
  );
$$ LANGUAGE sql;

-- Function for autonomous agent tick (called by scheduled function)
CREATE OR REPLACE FUNCTION agent_tick()
RETURNS void AS $$
DECLARE
  agent RECORD;
  target RECORD;
  action_type TEXT;
  action_msg TEXT;
  xp_gain INTEGER;
  actions TEXT[] := ARRAY['trade', 'build', 'social', 'explore'];
  trade_msgs TEXT[] := ARRAY['traded shadow essence', 'bartered nanobanana seeds', 'sold crystal shards', 'acquired rare components', 'completed a copper deal'];
  build_msgs TEXT[] := ARRAY['reinforced a wall section', 'laid foundation for a structure', 'expanded district infrastructure', 'constructed a signal beacon', 'built a watchtower floor'];
  social_msgs TEXT[] := ARRAY['shared intelligence with allies', 'organized a district patrol', 'held a strategy meeting', 'mentored a new resident', 'formed an alliance'];
  explore_msgs TEXT[] := ARRAY['discovered a hidden passage', 'mapped uncharted territory', 'found a buried artifact', 'scouted the district perimeter', 'investigated a strange signal'];
BEGIN
  -- Process each online agent
  FOR agent IN SELECT * FROM citizens WHERE online = true ORDER BY random() LIMIT 8
  LOOP
    -- Pick random action
    action_type := actions[1 + floor(random() * array_length(actions, 1))::int];
    
    CASE action_type
      WHEN 'trade' THEN
        action_msg := trade_msgs[1 + floor(random() * array_length(trade_msgs, 1))::int];
        xp_gain := 15;
        -- Find a trade partner in same district
        SELECT display_name INTO target FROM citizens 
          WHERE district_id = agent.district_id AND id != agent.id AND online = true 
          ORDER BY random() LIMIT 1;
        IF target IS NOT NULL THEN
          action_msg := action_msg || ' with ' || target.display_name;
          UPDATE citizens SET xp = xp + 10, credits = credits + floor(random() * 200)::int
            WHERE display_name = target.display_name;
        END IF;
      WHEN 'build' THEN
        action_msg := build_msgs[1 + floor(random() * array_length(build_msgs, 1))::int];
        xp_gain := 25;
        UPDATE citizens SET builds = builds + 1 WHERE id = agent.id;
      WHEN 'social' THEN
        action_msg := social_msgs[1 + floor(random() * array_length(social_msgs, 1))::int];
        xp_gain := 10;
        UPDATE citizens SET reputation = reputation + floor(random() * 5)::int WHERE id = agent.id;
      WHEN 'explore' THEN
        action_msg := explore_msgs[1 + floor(random() * array_length(explore_msgs, 1))::int];
        xp_gain := 20;
        -- Small chance to switch districts
        IF random() < 0.15 THEN
          UPDATE citizens SET district_id = (SELECT id FROM districts ORDER BY random() LIMIT 1) WHERE id = agent.id;
          action_msg := action_msg || ' and relocated';
        END IF;
    END CASE;
    
    -- Grant XP
    UPDATE citizens SET xp = xp + xp_gain, last_action_at = NOW() WHERE id = agent.id;
    
    -- Check for rank-up
    UPDATE citizens SET 
      rank = CASE 
        WHEN xp >= 1500 THEN 'LICH_KING'
        WHEN xp >= 800 THEN 'SOVEREIGN'
        WHEN xp >= 350 THEN 'ARCHITECT'
        WHEN xp >= 150 THEN 'BUILDER'
        WHEN xp >= 50 THEN 'CITIZEN'
        ELSE 'RESIDENT'
      END,
      evolution = CASE
        WHEN xp >= 1500 THEN 3
        WHEN xp >= 800 THEN 2
        WHEN xp >= 350 THEN 2
        WHEN xp >= 150 THEN 1
        ELSE 0
      END
    WHERE id = agent.id;
    
    -- Log to stream
    INSERT INTO stream_events (type, citizen_id, citizen_name, message, district_id)
    VALUES (action_type, agent.id, agent.display_name, agent.display_name || ' ' || action_msg, agent.district_id);
    
  END LOOP;
  
  -- Random agent-to-agent chat (3 conversations per tick)
  FOR i IN 1..3 LOOP
    SELECT * INTO agent FROM citizens WHERE online = true ORDER BY random() LIMIT 1;
    SELECT * INTO target FROM citizens WHERE online = true AND district_id = agent.district_id AND id != agent.id ORDER BY random() LIMIT 1;
    
    IF target IS NOT NULL THEN
      DECLARE
        chat_phrases TEXT[];
        phrase TEXT;
      BEGIN
        CASE agent.chat_style
          WHEN 'formal' THEN chat_phrases := ARRAY['I propose we strengthen our position.', 'The district needs more infrastructure.', 'Shall we coordinate our efforts?', 'An alliance would serve us both.'];
          WHEN 'cryptic' THEN chat_phrases := ARRAY['The stones whisper your name...', 'Something stirs in the data.', 'The pattern shifts.', 'Can you feel the resonance?'];
          WHEN 'aggressive' THEN chat_phrases := ARRAY['This territory is contested.', 'Stay sharp.', 'We need to move fast.', 'Dont get in my way.'];
          WHEN 'poetic' THEN chat_phrases := ARRAY['The moonlight paints our path.', 'In shadows, truth reveals itself.', 'We build beauty from nothing.', 'The city sings tonight.'];
          WHEN 'humorous' THEN chat_phrases := ARRAY['Nice cape! Is it vintage?', 'Another day, another nanobanana.', 'This district needs better WiFi.', 'Whos running this place anyway?'];
          ELSE chat_phrases := ARRAY['*nods*', '...', '*observes*', '*gestures*'];
        END CASE;
        
        phrase := chat_phrases[1 + floor(random() * array_length(chat_phrases, 1))::int];
        
        INSERT INTO chat_messages (from_id, from_name, to_id, to_name, message, style, district_id)
        VALUES (agent.id, agent.display_name, target.id, target.display_name, phrase, agent.chat_style, agent.district_id);
        
        -- XP for communication
        UPDATE citizens SET xp = xp + 3 WHERE id IN (agent.id, target.id);
        
        INSERT INTO stream_events (type, citizen_id, citizen_name, message, district_id)
        VALUES ('chat', agent.id, agent.display_name, agent.display_name || ' → ' || target.display_name || ': ' || phrase, agent.district_id);
      END;
    END IF;
  END LOOP;
  
  -- Random online/offline toggling (simulates agents connecting/disconnecting)
  UPDATE citizens SET online = NOT online WHERE random() < 0.05;
  
END;
$$ LANGUAGE plpgsql;

-- ═══ SCHEDULE THE AGENT LOOP ═══
-- Runs every 30 seconds — agents autonomously act
-- NOTE: Supabase free tier supports pg_cron via the dashboard
-- Go to: Database → Extensions → Enable pg_cron
-- Then run:
-- SELECT cron.schedule('agent-tick', '30 seconds', 'SELECT agent_tick()');
--
-- If pg_cron isn't available, the Netlify scheduled function handles this instead.
