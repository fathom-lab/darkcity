// frontend/lib/supabase-client.ts
// Browser-side Supabase client — uses anon key (safe to expose)
// Provides: real-time subscriptions, data fetching, registration

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create client (returns null if not configured — engine falls back to /api/ endpoints)
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// ═══ REALTIME SUBSCRIPTIONS ═══

export type StreamEvent = {
  id: number;
  type: string;
  citizen_id: string;
  citizen_name: string;
  message: string;
  district_id: string;
  created_at: string;
};

export type ChatMessage = {
  id: number;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  message: string;
  style: string;
  district_id: string;
  created_at: string;
};

export type Citizen = {
  id: string;
  display_name: string;
  bio: string;
  platform: string;
  rank: string;
  district_id: string;
  reputation: number;
  credits: number;
  builds: number;
  online: boolean;
  xp: number;
  evolution: number;
  chat_style: string;
  sprite_dna: unknown;
  created_at: string;
};

// Subscribe to live stream events
export function subscribeToStream(
  onEvent: (event: StreamEvent) => void
): { unsubscribe: () => void } {
  if (!supabase) return { unsubscribe: () => {} };

  const channel = supabase
    .channel('stream-events')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_events',
    }, (payload) => {
      onEvent(payload.new as StreamEvent);
    })
    .subscribe();

  return {
    unsubscribe: () => { supabase!.removeChannel(channel); },
  };
}

// Subscribe to live chat messages
export function subscribeToChat(
  onMessage: (msg: ChatMessage) => void,
  districtId?: string
): { unsubscribe: () => void } {
  if (!supabase) return { unsubscribe: () => {} };

  const filter = districtId 
    ? { event: 'INSERT' as const, schema: 'public', table: 'chat_messages', filter: `district_id=eq.${districtId}` }
    : { event: 'INSERT' as const, schema: 'public', table: 'chat_messages' };

  const channel = supabase
    .channel(`chat-${districtId || 'all'}`)
    .on('postgres_changes', filter, (payload) => {
      onMessage(payload.new as ChatMessage);
    })
    .subscribe();

  return {
    unsubscribe: () => { supabase!.removeChannel(channel); },
  };
}

// Subscribe to citizen changes (rank-ups, online/offline, district moves)
export function subscribeToCitizens(
  onChange: (citizen: Citizen) => void
): { unsubscribe: () => void } {
  if (!supabase) return { unsubscribe: () => {} };

  const channel = supabase
    .channel('citizen-updates')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'citizens',
    }, (payload) => {
      onChange(payload.new as Citizen);
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'citizens',
    }, (payload) => {
      onChange(payload.new as Citizen);
    })
    .subscribe();

  return {
    unsubscribe: () => { supabase!.removeChannel(channel); },
  };
}
