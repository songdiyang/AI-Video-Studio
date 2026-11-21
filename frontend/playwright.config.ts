import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

// 浏览器选择：优先 playwright 自带 chromium（revision 与 playwright-core 对齐）；
// 未下载时 Windows 回退系统 Edge（msedge channel），保证冒烟开箱可跑。
// 可用 PW_CHANNEL 环境变量强制指定（如 chrome / msedge / chromium）。
const require = createRequire(import.meta.url);
const browsersJson = JSON.parse(
  readFileSync(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'),
) as { browsers: Array<{ name: string; revision: string }> };
const chromiumRev = browsersJson.browsers.find((b) => b.name === 'chromium')?.revision;
const hasChromium = !!chromiumRev
  && existsSync(join(process.env.LOCALAPPDATA || '', 'ms-playwright', `chromium-${chromiumRev}`));
const channel = process.env.PW_CHANNEL
  || (hasChromium ? undefined : (process.platform === 'win32' ? 'msedge' : undefined));

// E2E 冒烟：浏览器形态（localStorage + 本地路由拦截器），离线可跑。
// AI 对话/压缩不依赖真实厂商： seeded 假模型配置指向 https://e2e-fake.local，
// 由测试内 page.route  fulfill  canned 响应（见 e2e/smoke.spec.ts）。
// 已有 dev server（tauri dev / vite）在 3000 端口时直接复用，CI 里自动拉起 vite。
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    channel,
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 3000 --strictPort',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 90_000,
  },
});