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
        // Deep Charcoal Gray 色板（近中性，极低饱和度）
        // 参考 VS Code Dark+ / JetBrains Darcula
        slate: {
          50: '#f5f5f7',
          100: '#e8e8ec',
          200: '#d4d4dc',
          300: '#b0b0ba',
          400: '#9898a4',
          500: '#64646e',
          600: '#44444c',
          700: '#32323a',
          800: '#26262c',
          850: '#1e1e23',
          900: '#1a1a1e',
          950: '#111113',
        },
        // 科技蓝强调色（深炭灰底上适当提亮）
        accent: {
          50: '#eef4ff',
          100: '#dce8fe',
          200: '#c0d6fd',
          300: '#93b9fb',
          400: '#6ea4fa',
          500: '#4e8ef7',
          600: '#2f6fe0',
          700: '#1e5cc8',
          800: '#1a4da6',
          900: '#1a4285',
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
