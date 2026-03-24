'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CityMap } from '@/components/CityMap';
import { AgentPanel } from '@/components/AgentPanel';
import { EventFeed } from '@/components/EventFeed';
import { useStore } from '@/lib/store';
import { getSocket, connectSocket, subscribeToZones } from '@/lib/socket';
import type { Agent, District, Event as CityEvent } from '@/types';
import { cn } from '@/lib/utils';

// Mock data for development
const mockDistricts: District[] = [
  {
    id: '1',
    name: 'Downtown',
    description: 'The heart of DARKCITY. Gothic spires pierce storm clouds, amber torchlight flickers on ancient stone.',
    zones: [],
    connections: ['2', '4', '5'],
    transitTime: 15,
    ambiance: {
      noiseLevel: 80,
      crowding: 90,
      wealthIndex: 70,
      dangerLevel: 40,
    },
    eventProbabilities: {},
    exclusiveEvents: [],
    economy: {
      avgPropertyValue: 500000,
      avgIncome: 75000,
      dominantIndustries: ['Finance', 'Trade', 'Guild Halls'],
    },
    aesthetic: {
      colorPalette: ['#4b0082', '#8b0000', '#d4af37'],
      architectureStyle: 'Gothic Cathedral',
      iconography: ['cathedral', 'wrought-iron', 'gargoyle'],
    },
  },
  {
    id: '2',
    name: 'Arts',
    description: 'Candlelit theaters and dark galleries. Where mystic creativity thrives beneath vaulted ceilings.',
    zones: [],
    connections: ['1', '4', '7'],
    transitTime: 10,
    ambiance: {
      noiseLevel: 60,
      crowding: 50,
      wealthIndex: 45,
      dangerLevel: 25,
    },
    eventProbabilities: {},
    exclusiveEvents: [],
    economy: {
      avgPropertyValue: 250000,
      avgIncome: 45000,
      dominantIndustries: ['Art', 'Music', 'Theater'],
    },
    aesthetic: {
      colorPalette: ['#9370db', '#8b0000', '#d4af37'],
      architectureStyle: 'Gothic Revival',
      iconography: ['mask', 'lyre', 'candelabra'],
    },
  },
  {
    id: '3',
    name: 'Industrial',
    description: 'Iron forges and dark foundries. Where ancient mechanisms grind beneath blackened stone arches.',
    zones: [],
    connections: ['5', '8', '9'],
    transitTime: 20,
    ambiance: {
      noiseLevel: 90,
      crowding: 40,
      wealthIndex: 30,
      dangerLevel: 60,
    },
    eventProbabilities: {},
    exclusiveEvents: [],
    economy: {
      avgPropertyValue: 150000,
      avgIncome: 35000,
      dominantIndustries: ['Metalwork', 'Forges', 'Alchemy'],
    },
    aesthetic: {
      colorPalette: ['#8b0000', '#3d2a1f', '#ffa500'],
      architectureStyle: 'Industrial Gothic',
      iconography: ['anvil', 'chains', 'furnace'],
    },
  },
];

const mockAgent: Agent = {
  id: 'agent-1',
  ownerId: 'user-1',
  name: 'Cypher',
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  currentLocationId: undefined,
  status: 'IDLE',
  darkcoinBalance: 1250,
  darkflobiBalance: 0,
  metadata: {},
};

export default function Home() {
  const {
    events,
    agentLocations,
    selectedAgent,
    currentDistrict,
    sidebarOpen,
    eventFeedOpen,
    setSelectedAgent,
    setCurrentDistrict,
    addEvent,
  } = useStore();

  const [districts, setDistricts] = useState<District[]>(mockDistricts);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Set mock agent for development
    setSelectedAgent(mockAgent);

    // Connect to WebSocket
    const socket = getSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('[City] Connected to server');
      
      // Subscribe to all zones
      subscribeToZones(districts.flatMap(d => d.zones.map(z => z.id)));
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[City] Disconnected from server');
    });

    socket.on('city:event', (event: CityEvent) => {
      addEvent(event);
    });

    // Uncomment when backend is ready
    // connectSocket('user-1', 'agent-1');

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('city:event');
    };
  }, [districts, setSelectedAgent, addEvent]);

  const handleDistrictClick = (districtId: string) => {
    setCurrentDistrict(districtId);
  };

  const handleZoneClick = (zoneId: string) => {
    console.log('Zone clicked:', zoneId);
    // TODO: Show zone details
  };

  const handleEventClick = (event: CityEvent) => {
    console.log('Event clicked:', event);
    // TODO: Show event details
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background-primary">
      {/* Header */}
      <header className="glass-strong border-b border-text-muted/20 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl glow-text text-accent-primary">
            DARK<span className="text-accent-secondary">CITY</span>
          </h1>
          <div className="flex items-center gap-2 text-xs">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-accent-primary animate-pulse" : "bg-text-muted"
            )} />
            <span className="text-text-secondary">
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => window.location.href = '/agents'}
            className="px-4 py-2 rounded-lg bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors text-sm font-display"
          >
            My Agents
          </button>
          <button className="px-4 py-2 rounded-lg bg-accent-secondary/10 text-accent-secondary hover:bg-accent-secondary/20 transition-colors text-sm font-display">
            Settings
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Agent Panel */}
        {sidebarOpen && selectedAgent && (
          <motion.aside
            initial={{ width: 0 }}
            animate={{ width: 320 }}
            exit={{ width: 0 }}
            className="flex-shrink-0 p-4 overflow-y-auto"
          >
            <AgentPanel
              agent={selectedAgent}
              onMove={() => console.log('Move agent')}
              onInteract={() => console.log('Interact')}
              onCustomize={() => window.location.href = `/agents/${selectedAgent.id}/customize`}
            />
          </motion.aside>
        )}

        {/* Main City View */}
        <main className="flex-1 relative overflow-hidden">
          <CityMap
            districts={districts}
            agentLocations={agentLocations}
            selectedDistrict={currentDistrict || undefined}
            onDistrictClick={handleDistrictClick}
            onZoneClick={handleZoneClick}
          />

          {/* Selected District Info */}
          {currentDistrict && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-strong p-4 rounded-lg min-w-[300px]"
            >
              {(() => {
                const district = districts.find(d => d.id === currentDistrict);
                if (!district) return null;

                return (
                  <>
                    <h3 className="font-display text-lg mb-2">{district.name}</h3>
                    <p className="text-sm text-text-secondary mb-3">{district.description}</p>
                    <div className="flex gap-4 text-xs">
                      <button className="px-3 py-1.5 rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors">
                        Enter District
                      </button>
                      <button className="px-3 py-1.5 rounded bg-text-muted/10 text-text-secondary hover:bg-text-muted/20 transition-colors">
                        View Details
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}
        </main>

        {/* Right Sidebar - Event Feed */}
        {eventFeedOpen && (
          <motion.aside
            initial={{ width: 0 }}
            animate={{ width: 380 }}
            exit={{ width: 0 }}
            className="flex-shrink-0 p-4 overflow-hidden flex flex-col"
          >
            <EventFeed
              events={events}
              onEventClick={handleEventClick}
            />
          </motion.aside>
        )}
      </div>

      {/* Dev Note */}
      {events.length === 0 && (
        <div className="fixed bottom-8 right-8 glass-strong p-4 rounded-lg max-w-sm text-sm text-text-secondary">
          <div className="font-display text-accent-warning mb-2">Development Mode</div>
          <p className="text-xs">
            WebSocket server not connected. Events will appear when backend is running.
          </p>
        </div>
      )}
    </div>
  );
}
