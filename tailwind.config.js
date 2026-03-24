import { heroui } from "@heroui/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 专业影视制作软件风格配色
        slate: {
          50: '#f5f5f8',
          100: '#eaeaef',
          200: '#e0e0e8',
          300: '#c8c8d4',
          400: '#8890a0',
          500: '#5a6070',
          600: '#404050',
          700: '#303040',
          800: '#252538',
          850: '#1e1e2e',
          900: '#1a1a2e',
          950: '#0f0f1a',
        },
        // 科技蓝强调色
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      zIndex: {
        'content': 'var(--z-content)',    // z-content
        'float': 'var(--z-float)',        // z-float  
        'overlay': 'var(--z-overlay)',    // z-overlay
        'backdrop': 'var(--z-backdrop)',  // z-backdrop
        'modal': 'var(--z-modal)',        // z-modal
        'popup': 'var(--z-popup)',        // z-popup
        'toast': 'var(--z-toast)',        // z-toast
        'nav': 'var(--z-nav)',            // z-nav
        'fullscreen': 'var(--z-fullscreen)', // z-fullscreen
      },
      screens: {
        'xs': '480px',
        // sm/md/lg/xl/2xl 使用 Tailwind 默认值，无需重新声明
      }
    },
  },
  plugins: [heroui({
    themes: {
      dark: {
        colors: {
          background: "#1e1e2e",
          foreground: "#e0e0e8",
          primary: {
            DEFAULT: "#3b82f6",
            foreground: "#FFFFFF",
          },
          secondary: {
            DEFAULT: "#06b6d4",
            foreground: "#FFFFFF",
          },
          content1: "#1a1a2e",
          content2: "#252538",
          content3: "#303040",
          content4: "#404050",
          focus: "#3b82f6",
        }
      },
      light: {
        colors: {
          background: "#f5f5f8",
          foreground: "#1e293b",
          primary: {
            DEFAULT: "#2563eb",
            foreground: "#FFFFFF",
          },
          secondary: {
            DEFAULT: "#0891b2",
            foreground: "#FFFFFF",
          },
          content1: "#ffffff",
          content2: "#f5f5f8",
          content3: "#eaeaef",
          content4: "#e0e0e8",
          focus: "#2563eb",
        }
      }
    }
  })],
}
