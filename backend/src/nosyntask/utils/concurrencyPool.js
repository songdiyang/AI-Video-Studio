/**
 * 并发池工具模块 — Node.js 异步任务并发控制器
 *
 * 同时运行最多 limit 个 async 任务，每完成一个自动启动下一个。
 * 已在 4 个批量处理器中统一复用，消除单个文件内重复定义。
 *
 * @param {Array<() => Promise>} tasks  - 返回 Promise 的工厂函数数组
 * @param {number}                limit  - 最大并发数
 * @param {(done: number, total: number) => void} [onTaskDone] - 每完成一个任务时的回调
 * @returns {Promise<Array>} results，第 i 项为 task[i] 的 resolve 值 或 Error
 */
async function runPool(tasks, limit, onTaskDone) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let doneCount = 0;

  return new Promise((resolve) => {
    function runNext() {
      if (doneCount === tasks.length) {
        return resolve(results);
      }
      while (nextIndex < tasks.length && (nextIndex - doneCount) < limit) {
        const idx = nextIndex++;
        tasks[idx]()
          .then(res => { results[idx] = res; })
          .catch(err => { results[idx] = err; })
          .finally(() => {
            doneCount++;
            if (onTaskDone) onTaskDone(doneCount, tasks.length);
            runNext();
          });
      }
    }
    runNext();
  });
}

module.exports = { runPool };
