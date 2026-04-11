import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // TicketHub Brand
        accent: {
          DEFAULT: '#F97316',
          hover: '#EA6C0A',
          muted: '#FED7AA',
        },
        // Backgrounds (dark theme)
        th: {
          base: '#0a0f1a',
          surface: '#0d1526',
          elevated: '#1e293b',
          border: '#1e3a5f',
        },
        // Status colors
        status: {
          new: '#3B82F6',
          open: '#2563EB',
          inProgress: '#F59E0B',
          waiting: '#8B5CF6',
          resolved: '#10B981',
          closed: '#6B7280',
          cancelled: '#374151',
        },
        // Priority colors
        priority: {
          urgent: '#EF4444',
          high: '#F97316',
          medium: '#3B82F6',
          low: '#6B7280',
        },
        // SLA health
        sla: {
          ok: '#10B981',
          warning: '#F59E0B',
          critical: '#EF4444',
          paused: '#6B7280',
        },
      },
      fontFamily: {
        mono: ['DM Mono', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        // 8px base grid
        '18': '4.5rem',
        '22': '5.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
