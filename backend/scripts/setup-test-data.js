require('dotenv').config();
const { initializeDatabase, closeDatabase } = require('../src/db');
const { execute, queryOne } = require('../src/dbHelper');

async function setupTestData() {
  await initializeDatabase();
  
  const user = await queryOne('SELECT id FROM users WHERE email = ?', ['test_recovery@example.com']);
  if (!user) {
    console.log('测试用户不存在');
    await closeDatabase();
    return;
  }
  
  const snapshot = JSON.stringify({
    stepCounter: { count: 1, lastUpdate: Date.now() },
    runningTaskIds: [],
    savedAt: new Date().toISOString()
  });
  
  const result = await execute(
    'INSERT INTO workflow_jobs (user_id, workflow_type, status, current_step_index, total_steps, input_params, execution_snapshot, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
    [user.id, 'test_service_restart', 'running', 0, 2, JSON.stringify({test: true}), snapshot]
  );
  
  console.log('Created test workflow: jobId=' + result.insertId);
  
  await closeDatabase();
}

setupTestData().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
