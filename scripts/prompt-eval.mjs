#!/usr/bin/env node
/**
 * 提示词 golden set 回归评测（离线、确定性）
 *
 * 背景：这几批修的核心问题之一是「提示词与代码漂移」（动作清单散落多份、
 * 写手/风格/记忆注入规则改动后无从验证）。动态生成清单消灭了部分漂移，
 * 但改提示词后模型行为变好还是变坏仍没量化手段。
 *
 * 本 harness 用 esbuild 打包真实 buildSystemPrompt，对 golden set 里每条
 * 行为约束（必须出现的规则 / 不得泄漏的占位符）做断言并打分：
 *   - 全部通过退出码 0；任一失败退出码 1（可挂 CI）。
 *   - 上下文注入类断言直接证明「数据源 → 提示词」链路没被改断。
 *
 * 用法：node scripts/prompt-eval.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '../frontend');
const require = createRequire(path.join(frontendDir, 'package.json'));
const esbuild = require('esbuild');

const bundle = await esbuild.build({
  entryPoints: [path.join(frontendDir, 'services/localAiChatPayload.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text, 'utf8').toString('base64'));
const { buildSystemPrompt } = mod;

const golden = JSON.parse(readFileSync(path.join(here, 'golden/agent-prompts.json'), 'utf8'));
const results = [];
let failed = 0;

for (const c of golden.cases) {
  const prompt = buildSystemPrompt(c.context || {});
  const missing = (c.mustContain || []).filter((needle) => !prompt.includes(needle));
  const leaked = (c.mustNotContain || []).filter((needle) => new RegExp(needle).test(prompt));
  const ok = missing.length === 0 && leaked.length === 0;
  if (!ok) failed += 1;
  results.push({ id: c.id, ok, missing, leaked, promptChars: prompt.length });
  console.log(`${ok ? '✓' : '✗'} ${c.id}  (${c.description})`);
  if (missing.length) console.log(`    缺少: ${missing.join(' / ')}`);
  if (leaked.length) console.log(`    泄漏: ${leaked.join(' / ')}`);
}

const total = results.length;
const passed = total - failed;
console.log(`\n提示词 golden set: ${passed}/${total} 通过${failed ? `，${failed} 条回归失败` : '，无回归'}`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ total, passed, results }, null, 2));
process.exit(failed ? 1 : 0);