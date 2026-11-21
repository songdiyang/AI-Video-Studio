/**
 * E2E 冒烟（离线可跑）：新建工程 → 设置快照区 → AI 对话 → 压缩 → 重开持久化 + 中断告知。
 *
 * 离线策略：浏览器形态的 /api 由本地路由拦截器接管，AI 请求最终直连厂商 URL；
 * 这里 seeded 一个指向 https://e2e-fake.local 的假模型配置，再用 page.route
 * fulfill canned 响应——对话/压缩走的是真实管线（路由→localAI→fetch），只是传输层被替身接管。
 */
import { test, expect, type Page } from '@playwright/test';

const FAKE_BASE = 'https://e2e-fake.local/v1';
const FAKE_REPLY = '你好！我是 E2E 离线假模型，用于冒烟验证。';
const FAKE_SUMMARY = '【已确定】\n- E2E 冒烟对话已完成\n【进行中】\n- 无\n【待办】\n- 无';

/** 每个测试独立上下文：跳过新手引导 + seeded 假模型配置 */
async function seedInit(page: Page) {
  await page.addInitScript(([base]) => {
    localStorage.setItem('nanostory-onboarding-complete', 'true');
    // 新上下文默认跟随浏览器语言（英文），冒烟选择器基于中文文案，固定 zh-CN
    localStorage.setItem('nanostory-language', 'zh-CN');
    localStorage.setItem('ai_model_configs', JSON.stringify([{
      provider: 'openai',
      // AI 助手只收 MULTIMODAL 模型：名字带 -vl 才会被 inferCategory 判为多模态
      model_name: 'e2e-fake-vl',
      api_key: 'e2e-fake-key',
      api_base: base,
      enabled: true,
    }]));
  }, [FAKE_BASE]);
}

/** 替身传输层：stream 走 SSE 帧，非 stream 走 OpenAI JSON；压缩请求返回摘要 */
async function fakeVendor(page: Page) {
  await page.route(`${FAKE_BASE}/**`, async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const isCompress = JSON.stringify(body.messages || []).includes('对话压缩器');
    const reply = isCompress ? FAKE_SUMMARY : FAKE_REPLY;
    if (body.stream) {
      const frames =
        `data: ${JSON.stringify({ delta: reply.slice(0, 12) })}\n\n` +
        `data: ${JSON.stringify({ delta: reply.slice(12) })}\n\n` +
        'data: [DONE]\n\n';
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }),
      });
    }
  });
}

/** 欢迎页 → 新建工程对话框 → 创建并进入工作台 */
async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建工程' }).first().click();
  await page.getByPlaceholder('例如：我的第一部漫剧').fill(name);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.locator('body')).toContainText(name, { timeout: 20_000 });
}

async function openAIPanel(page: Page) {
  await page.locator('button[title*="右侧栏"], button[aria-label*="右侧栏"]').first().click();
  await expect(page.getByPlaceholder(/规划与创作/)).toBeVisible();
}

test('冒烟1：新建工程 → 工作台渲染且工程落盘', async ({ page }, testInfo) => {
  await seedInit(page);
  await createProject(page, 'E2E 冒烟工程');
  const projects = await page.evaluate(() => localStorage.getItem('local_projects') || '');
  expect(projects).toContain('E2E 冒烟工程');
  await page.screenshot({ path: testInfo.outputPath('e2e-01-new-project.png') });
});

test('冒烟2：设置 › 工程设置 › 快照与恢复区渲染（P0 后悔药入口）', async ({ page }, testInfo) => {
  await seedInit(page);
  await createProject(page, 'E2E 快照工程');
  // 直达工程设置分区（避免侧栏同名文本选择器歧义）
  await page.evaluate(() => {
    localStorage.setItem('settings_active_section', 'project');
    localStorage.setItem('pending_open_settings', '1');
  });
  await page.locator('button[title="设置"], button[aria-label="设置"]').first().click();
  await expect(page.getByText('快照与恢复')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: '立即备份' })).toBeVisible();
  await expect(page.locator('body')).toContainText('保留最近 10 份');
  await page.screenshot({ path: testInfo.outputPath('e2e-02-snapshot-section.png') });
});

test('冒烟3：AI 对话走真实管线（假传输层）→ 回复上屏', async ({ page }, testInfo) => {
  await seedInit(page);
  await fakeVendor(page);
  await createProject(page, 'E2E 对话工程');
  await openAIPanel(page);
  await page.getByPlaceholder(/规划与创作/).fill('你好，请介绍一下你自己');
  await page.getByPlaceholder(/规划与创作/).press('Enter');
  await expect(page.locator('body')).toContainText('E2E 离线假模型', { timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath('e2e-03-chat-reply.png') });
});

test('冒烟4：上下文压缩 → 摘要替换历史并落盘', async ({ page }, testInfo) => {
  await seedInit(page);
  await fakeVendor(page);
  await createProject(page, 'E2E 压缩工程');
  await openAIPanel(page);
  // 上下文占用 ≥50%（200k window 的半额=400k 字符）才允许压缩：发一条长消息
  await page.getByPlaceholder(/规划与创作/).fill('长文本素材。'.repeat(70_000));
  await page.getByPlaceholder(/规划与创作/).press('Enter');
  await expect(page.locator('body')).toContainText('E2E 离线假模型', { timeout: 20_000 });
  const compress = page.getByRole('button', { name: '压缩上下文' });
  await expect(compress).toBeEnabled();
  await compress.click();
  // 摘要消息是持久产物（toast 瞬态不作为断言依据；条数随实际消息数变化）
  await expect(page.locator('body')).toContainText(/已压缩前 \d+ 条对话为摘要/, { timeout: 20_000 });
  await expect(page.locator('body')).toContainText('【已确定】');
  // 压缩落盘的权威证据：会话归档已被整段替换为摘要（不依赖 UI 水合时序）
  const archived = await page.evaluate(async () => {
    const pid = localStorage.getItem('nanostory_last_project_id');
    const sid = localStorage.getItem(`ai_active_session_${pid}`);
    const res = await fetch(`/api/ai-assistant/sessions/${sid}/messages`);
    const data = await res.json();
    return (data.messages || []).map((m: any) => m.content).join('\n');
  });
  expect(archived).toMatch(/已压缩前 \d+ 条对话为摘要/);
  expect(archived).not.toContain('长文本素材。长文本素材。长文本素材。长文本素材。长文本素材。');
  await page.screenshot({ path: testInfo.outputPath('e2e-04-compressed.png') });
});

test('冒烟6：顶栏「视频合成」入口 → 工具标签可达（导出/配音所在页）', async ({ page }, testInfo) => {
  await seedInit(page);
  await createProject(page, 'E2E 合成工程');
  // P1-6 曾因 VideoComposition 只挂在死代码 ComicDramaWorkbench 而不可达；此用例守住入口
  await page.locator('button[title="视频合成"], button[aria-label="视频合成"]').first().click();
  await expect(page.getByText('视频合成', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /导出合成视频/ })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath('e2e-06-composition.png') });
});

test('冒烟5：重开工程对话持久化 + 循环中断如实告知与续跑入口', async ({ page }, testInfo) => {
  await seedInit(page);
  await fakeVendor(page);
  await createProject(page, 'E2E 重开工程');
  await openAIPanel(page);
  await page.getByPlaceholder(/规划与创作/).fill('第一条消息');
  await page.getByPlaceholder(/规划与创作/).press('Enter');
  await expect(page.locator('body')).toContainText('E2E 离线假模型', { timeout: 20_000 });

  // 模拟「应用退出时多步任务仍在进行」：写入 running checkpoint 后重载
  const seeded = await page.evaluate(() => {
    const pid = localStorage.getItem('nanostory_last_project_id');
    const sid = localStorage.getItem(`ai_active_session_${pid}`);
    if (!pid || !sid) return null;
    localStorage.setItem(`ai_agent_loop_${pid}_${sid}`, JSON.stringify({
      status: 'running',
      round: 1,
      userText: '拆分剧本并生成首帧',
      history: [{ role: 'user', content: '拆分剧本并生成首帧' }],
      executedLog: ['✓ 分镜拆分'],
      roundReply: '先拆分剧本',
      manualNotified: false,
      intentVerified: false,
      imageBudgetLeft: 6,
      pendingConfirm: [],
      updatedAt: Date.now(),
    }));
    return { pid, sid };
  });
  expect(seeded).not.toBeNull();
  await page.reload();
  await openAIPanel(page);
  // 重开后旧对话仍在（持久化）
  await expect(page.locator('body')).toContainText('E2E 离线假模型', { timeout: 20_000 });
  // 中断告知：如实说明中断轮次与已执行动作 + 续跑按钮（轮次/清单随 checkpoint 内容变化）
  await expect(page.locator('body')).toContainText(/上次的多步任务在第 \d+ 轮规划时中断/);
  await expect(page.locator('body')).toContainText('尚未完成');
  await expect(page.getByRole('button', { name: '继续未完成任务' })).toBeVisible();
  // 告知只出现一次：再重开一次，通知不重复（行为断言，不依赖内部标记时序）
  await page.reload();
  await openAIPanel(page);
  await expect(page.locator('body')).toContainText('继续未完成任务', { timeout: 20_000 });
  const noticeCount = await page.evaluate(() => {
    const t = document.body.innerText;
    return (t.match(/上次的多步任务在第/g) || []).length;
  });
  expect(noticeCount).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('e2e-05-reopen-interruption.png') });
});