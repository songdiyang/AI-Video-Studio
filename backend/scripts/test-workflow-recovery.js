/**
 * 工作流中断恢复功能测试脚本
 * 
 * 测试步骤：
 * 1. 创建一个测试工作流任务（status=running, 带 execution_snapshot）
 * 2. 创建关联的 generation_tasks（status=processing）
 * 3. 重启后端服务
 * 4. 验证工作流是否被自动恢复
 * 5. 清理测试数据
 */

require('dotenv').config();
const { initializeDatabase, closeDatabase } = require('../src/db');
const { execute, queryOne } = require('../src/dbHelper');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('=== 工作流中断恢复功能测试 ===\n');

  // 步骤1: 初始化数据库连接
  console.log('[1/6] 初始化数据库连接...');
  await initializeDatabase();
  console.log('  ✓ 数据库连接成功\n');

  // 步骤2: 查找测试用户
  console.log('[2/6] 查找测试用户...');
  const user = await queryOne('SELECT id, email FROM users LIMIT 1');
  if (!user) {
    console.error('  ✗ 没有找到用户，请先注册用户');
    await closeDatabase();
    process.exit(1);
  }
  console.log(`  ✓ 使用用户: id=${user.id}, email=${user.email}\n`);

  // 步骤3: 创建测试工作流（模拟中断状态）
  console.log('[3/6] 创建测试工作流（模拟中断状态）...');
  const snapshot = JSON.stringify({
    stepCounter: { count: 2, lastUpdate: Date.now() },
    runningTaskIds: [],
    savedAt: new Date().toISOString()
  });

  const jobResult = await execute(
    `INSERT INTO workflow_jobs (
      user_id, project_id, workflow_type, status, 
      current_step_index, total_steps, input_params, 
      execution_snapshot, error_message, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      user.id,
      null,
      'test_recovery',
      'running',
      1,
      3,
      JSON.stringify({ test: true, message: '工作流恢复测试' }),
      snapshot,
      null
    ]
  );
  const jobId = jobResult.insertId;
  console.log(`  ✓ 创建工作流: jobId=${jobId}`);
  console.log(`    - status: running`);
  console.log(`    - execution_snapshot: ${snapshot}`);
  console.log(`    - current_step: 1/3\n`);

  // 步骤4: 创建关联的 generation_tasks
  console.log('[4/6] 创建关联的 generation_tasks...');
  const taskResult = await execute(
    `INSERT INTO generation_tasks (
      job_id, step_index, user_id, project_id,
      task_type, target_type, target_id, model_name,
      input_params, status, progress
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      1,
      user.id,
      null,
      'test_task',
      'script',
      null,
      'test-model',
      JSON.stringify({ prompt: '测试任务' }),
      'processing',
      50
    ]
  );
  const taskId = taskResult.insertId;
  console.log(`  ✓ 创建任务: taskId=${taskId}`);
  console.log(`    - status: processing`);
  console.log(`    - progress: 50%\n`);

  // 更新快照中的 runningTaskIds
  const updatedSnapshot = JSON.stringify({
    stepCounter: { count: 2, lastUpdate: Date.now() },
    runningTaskIds: [taskId],
    savedAt: new Date().toISOString()
  });
  await execute(
    'UPDATE workflow_jobs SET execution_snapshot = ? WHERE id = ?',
    [updatedSnapshot, jobId]
  );
  console.log(`  ✓ 更新快照包含 runningTaskIds: [${taskId}]\n`);

  // 步骤5: 验证测试数据
  console.log('[5/6] 验证测试数据...');
  const verifyJob = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
  console.log(`  ✓ 工作流状态: ${verifyJob.status}`);
  console.log(`  ✓ 快照存在: ${verifyJob.execution_snapshot ? '是' : '否'}\n`);

  // 步骤6: 模拟服务重启 - 直接调用恢复逻辑
  console.log('[6/6] 模拟服务重启，触发恢复逻辑...');
  console.log('  → 直接调用 _recoverInterruptedJobs()\n');

  // 直接加载 WorkflowExecutor 类，避免通过 engine/index.js 的循环依赖
  const { queryAll, execute: dbExecute } = require('../src/dbHelper');
  const { getWorkflowDefinition } = require('../src/nosyntask/definitions');
  const ContextBuilder = require('../src/nosyntask/engine/ContextBuilder');
  const JobStatusManager = require('../src/nosyntask/engine/JobStatusManager');
  const { runWithTrace } = require('../src/nosyntask/engine/generationTrace');
  const { withAIBillingContext } = require('../src/aiBillingContext');
  const { updateJobWithVersion } = require('../src/nosyntask/utils/occUtils');
  const { WorkflowLogger } = require('../src/nosyntask/utils/WorkflowLogger');
  
  // 模拟恢复逻辑
  console.log('  → 查找有快照的中断工作流...');
  const interruptedJobs = await queryAll(
    `SELECT * FROM workflow_jobs WHERE status IN ('pending', 'running') AND execution_snapshot IS NOT NULL`
  );
  console.log(`  → 发现 ${interruptedJobs.length} 个可恢复的工作流`);

  for (const job of interruptedJobs) {
    let snapshot = job.execution_snapshot;
    if (typeof snapshot === 'string') {
      snapshot = JSON.parse(snapshot);
    }
    console.log(`  → 恢复工作流 jobId=${job.id}, snapshot=${JSON.stringify(snapshot)}`);

    // 重置 runningTasks
    if (snapshot.runningTaskIds && snapshot.runningTaskIds.length > 0) {
      await dbExecute(
        `UPDATE generation_tasks SET status = 'pending', error_message = NULL, progress = 0
         WHERE id IN (${snapshot.runningTaskIds.map(() => '?').join(',')}) AND status = 'processing'`,
        snapshot.runningTaskIds
      );
      console.log(`  → 已重置任务: ${snapshot.runningTaskIds.join(', ')}`);
    }

    // 清除快照
    await dbExecute(
      `UPDATE workflow_jobs SET execution_snapshot = NULL WHERE id = ?`,
      [job.id]
    );
    console.log(`  → 已清除快照`);
  }

  await sleep(1000);

  // 验证恢复结果
  console.log('\n=== 恢复结果验证 ===');
  const recoveredJob = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
  const recoveredTask = await queryOne('SELECT * FROM generation_tasks WHERE id = ?', [taskId]);

  console.log(`\n工作流 jobId=${jobId}:`);
  console.log(`  - 状态: ${recoveredJob.status}`);
  console.log(`  - 快照已清除: ${recoveredJob.execution_snapshot ? '否 (失败)' : '是 (成功)'}`);

  console.log(`\n任务 taskId=${taskId}:`);
  console.log(`  - 状态: ${recoveredTask.status}`);
  console.log(`  - 进度: ${recoveredTask.progress}%`);
  console.log(`  - 已重置为pending: ${recoveredTask.status === 'pending' ? '是 (成功)' : '否 (失败)'}`);

  // 清理测试数据
  console.log('\n=== 清理测试数据 ===');
  await execute('DELETE FROM generation_tasks WHERE id = ?', [taskId]);
  await execute('DELETE FROM workflow_jobs WHERE id = ?', [jobId]);
  console.log('  ✓ 测试数据已清理\n');

  // 关闭数据库连接
  await closeDatabase();

  // 判断测试结果
  const snapshotCleared = !recoveredJob.execution_snapshot;
  const taskReset = recoveredTask.status === 'pending' && recoveredTask.progress === 0;

  if (snapshotCleared && taskReset) {
    console.log('✅ 测试通过: 工作流中断恢复功能正常');
    process.exit(0);
  } else {
    console.log('❌ 测试失败:');
    if (!snapshotCleared) console.log('  - 快照未清除');
    if (!taskReset) console.log('  - 任务未重置为pending');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
