// frontend/app/map/page.tsx
// Full-screen interactive map page — NanoBanana Falsprite Engine + SeedDance Animation
'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with canvas
const DarkCityEngine = dynamic(
  () => import('../../components/DarkCityEngine'),
  { 
    ssr: false,
    loading: () => (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#06050b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        fontFamily: "'Courier New', monospace",
        color: '#8a85a0',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 8, marginBottom: 8, color: '#302c44' }}>
          NANOBANANA FALSPRITE ENGINE · SEEDDANCE ANIMATION SYSTEM
        </div>
        <div style={{ 
          fontSize: 28, 
          fontWeight: 900, 
          letterSpacing: 18, 
          color: '#e8e0d0',
          textShadow: '0 0 60px #9b59b630, 0 0 120px #e74c3c10',
        }}>
          D A R K C I T Y
        </div>
        <div style={{ fontSize: 10, color: '#302c44', marginTop: 12, letterSpacing: 3 }}>
          INITIALIZING CITY SYSTEMS...
        </div>
        <div style={{
          marginTop: 20,
          width: 200,
          height: 3,
          background: '#151322',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: '60%',
            background: 'linear-gradient(90deg, #9b59b6, #e74c3c)',
            borderRadius: 2,
            animation: 'loadPulse 1.5s ease-in-out infinite',
          }} />
        </div>
        <style>{`
          @keyframes loadPulse {
            0%, 100% { width: 30%; opacity: 0.5; }
            50% { width: 80%; opacity: 1; }
          }
        `}</style>
      </div>
    ),
  }
);

export default function MapPage() {
  return <DarkCityEngine />;
}
