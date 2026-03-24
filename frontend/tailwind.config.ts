import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0a0a14',        // Deep purple-black
          secondary: '#12091a',       // Darker purple-black
          elevated: '#2d1b4e',        // Dark royal purple
          overlay: 'rgba(18, 9, 26, 0.95)',
        },
        accent: {
          primary: '#8b0000',         // Deep crimson/blood red
          secondary: '#d4af37',       // Antique gold
          gold: '#d4af37',           // Antique gold
          purple: '#2d1b4e',         // Dark royal purple
          amber: '#ffa500',          // Torch amber
          crimson: '#8b0000',        // Blood red
        },
        text: {
          primary: '#e8dcc4',         // Aged parchment
          secondary: '#c4b5a0',       // Faded parchment
          muted: '#8b7e6a',          // Old paper
        },
        border: '#3d2a1f',           // Aged iron
        district: {
          downtown: '#4b0082',       // Deep indigo (royal)
          industrial: '#8b0000',     // Crimson (blood)
          arts: '#9370db',           // Medium purple (mystical)
          residential: '#2f4f4f',    // Dark slate (somber)
          underground: '#800020',    // Burgundy (shadows)
          uptown: '#d4af37',         // Gold (wealthy)
          eastgate: '#4682b4',       // Steel blue (cold)
          midtown: '#663399',        // Rebecca purple (noble)
          westside: '#b8860b',       // Dark goldenrod (aged)
          docks: '#2c4f54',          // Dark cyan (waterfront)
        }
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],              // Gothic headers
        body: ['EB Garamond', 'serif'],           // Body text
        accent: ['Crimson Text', 'serif'],         // Special text
        mono: ['Courier', 'monospace'],            // Addresses/numbers
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(139, 0, 0, 0.4), 0 0 40px rgba(139, 0, 0, 0.2)',
        'glow-secondary': '0 0 20px rgba(212, 175, 55, 0.4), 0 0 40px rgba(212, 175, 55, 0.2)',
        'glow-amber': '0 0 20px rgba(255, 165, 0, 0.5), 0 0 40px rgba(255, 165, 0, 0.25)',
        'torch': '0 0 30px rgba(255, 165, 0, 0.6), 0 0 60px rgba(255, 165, 0, 0.3)',
        'candlelight': '0 8px 32px rgba(255, 165, 0, 0.2), 0 0 16px rgba(255, 165, 0, 0.1)',
        'stone': '0 8px 0 rgba(0, 0, 0, 0.4), 0 12px 24px rgba(0, 0, 0, 0.3)',
        'embossed': 'inset 0 2px 0 rgba(212, 175, 55, 0.2), inset 0 -2px 0 rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 3s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.5s ease-out',
        'torch-flicker': 'torch-flicker 2s ease-in-out infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '25%': { opacity: '0.9', filter: 'brightness(0.95)' },
          '50%': { opacity: '1', filter: 'brightness(1.05)' },
          '75%': { opacity: '0.95', filter: 'brightness(0.98)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'torch-flicker': {
          '0%, 100%': { 
            filter: 'brightness(1) drop-shadow(0 0 20px rgba(255, 165, 0, 0.6))',
          },
          '50%': { 
            filter: 'brightness(1.1) drop-shadow(0 0 30px rgba(255, 165, 0, 0.8))',
          },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'stone-texture': "linear-gradient(135deg, #0a0a14 0%, #12091a 50%, #0a0a14 100%), url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E\")",
        'parchment-texture': "linear-gradient(to bottom, rgba(232, 220, 196, 0.95) 0%, rgba(218, 200, 170, 0.95) 100%), url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='parchmentNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23parchmentNoise)' opacity='0.05'/%3E%3C/svg%3E\")",
        'iron-texture': "linear-gradient(145deg, rgba(61, 42, 31, 0.9) 0%, rgba(45, 27, 78, 0.9) 100%)",
        'gothic-gradient': "linear-gradient(135deg, rgba(139, 0, 0, 0.3) 0%, rgba(45, 27, 78, 0.5) 50%, rgba(139, 0, 0, 0.3) 100%)",
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
