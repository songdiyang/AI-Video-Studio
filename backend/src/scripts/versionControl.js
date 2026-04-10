const { queryAll, queryOne, execute } = require('../dbHelper');
const { authMiddleware } = require('../middleware');

// GET /api/version/history/:resourceType/:resourceId - 获取资源的版本历史
module.exports = (router) => {
  router.get('/version/history/:resourceType/:resourceId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { resourceType, resourceId } = req.params;
    const { branch = 'main' } = req.query;

    try {
      const versions = await queryAll(
        `SELECT v.*, u.username as created_by_name, 
                (SELECT COUNT(*) FROM version_history WHERE resource_type = ? AND resource_id = ?) as total_versions
         FROM version_history v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.resource_type = ? AND v.resource_id = ? AND v.branch_name = ?
         ORDER BY v.version_number DESC`,
        [resourceType, resourceId, resourceType, resourceId, branch]
      );

      res.json({ versions });
    } catch (error) {
      console.error('[Version History]', error);
      res.status(500).json({ message: '获取版本历史失败' });
    }
  });

  // POST /api/version/create - 创建新版本
  router.post('/version/create', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { 
      projectId, 
      resourceType, 
      resourceId, 
      versionLabel, 
      changeSummary, 
      changeDetails, 
      snapshotData,
      parentVersionId,
      branchName = 'main'
    } = req.body;

    if (!projectId || !resourceType || !resourceId) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    try {
      // 获取当前最大版本号
      const maxVersion = await queryOne(
        `SELECT MAX(version_number) as max_ver FROM version_history 
         WHERE resource_type = ? AND resource_id = ? AND branch_name = ?`,
        [resourceType, resourceId, branchName]
      );
      const newVersionNumber = (maxVersion?.max_ver || 0) + 1;

      // 将旧版本设置为非当前
      await execute(
        `UPDATE version_history SET is_current = 0 
         WHERE resource_type = ? AND resource_id = ? AND branch_name = ?`,
        [resourceType, resourceId, branchName]
      );

      // 插入新版本
      const result = await execute(
        `INSERT INTO version_history 
         (project_id, resource_type, resource_id, version_number, parent_version_id, branch_name, 
          version_label, change_summary, change_details, snapshot_data, created_by, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [projectId, resourceType, resourceId, newVersionNumber, parentVersionId, branchName,
         versionLabel, changeSummary, JSON.stringify(changeDetails), JSON.stringify(snapshotData), userId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (project_id, user_id, action_type, resource_type, resource_id, action_description)
         VALUES (?, ?, 'version.create', ?, ?, ?)`,
        [projectId, userId, resourceType, resourceId, `创建新版本 v${newVersionNumber}`]
      );

      console.log(`[Version] 创建新版本：${resourceType}#${resourceId} v${newVersionNumber}`);

      res.json({
        message: '版本创建成功',
        versionId: result.insertId,
        versionNumber: newVersionNumber
      });
    } catch (error) {
      console.error('[Version Create]', error);
      res.status(500).json({ message: '创建版本失败' });
    }
  });

  // PUT /api/version/restore/:versionId - 恢复到指定版本
  router.put('/version/restore/:versionId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { versionId } = req.params;
    const { restoreType = 'single' } = req.query; // single | create_new

    try {
      const version = await queryOne(
        'SELECT * FROM version_history WHERE id = ?',
        [versionId]
      );

      if (!version) {
        return res.status(404).json({ message: '版本不存在' });
      }

      if (restoreType === 'create_new') {
        // 创建新版本（基于历史版本）
        const maxVersion = await queryOne(
          `SELECT MAX(version_number) as max_ver FROM version_history 
           WHERE resource_type = ? AND resource_id = ? AND branch_name = ?`,
          [version.resource_type, version.resource_id, version.branch_name]
        );
        const newVersionNumber = (maxVersion?.max_ver || 0) + 1;

        await execute(
          `UPDATE version_history SET is_current = 0 
           WHERE resource_type = ? AND resource_id = ? AND branch_name = ?`,
          [version.resource_type, version.resource_id, version.branch_name]
        );

        await execute(
          `INSERT INTO version_history 
           (project_id, resource_type, resource_id, version_number, parent_version_id, branch_name,
            version_label, change_summary, snapshot_data, created_by, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [version.project_id, version.resource_type, version.resource_id, newVersionNumber, 
           versionId, version.branch_name, `恢复到 v${version.version_number}`, 
           `从版本 v${version.version_number} 恢复`, version.snapshot_data, userId]
        );
      } else {
        // 直接恢复（更新当前版本指针）
        await execute(
          `UPDATE version_history SET is_current = 0 
           WHERE resource_type = ? AND resource_id = ?`,
          [version.resource_type, version.resource_id]
        );

        await execute(
          'UPDATE version_history SET is_current = 1 WHERE id = ?',
          [versionId]
        );
      }

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (project_id, user_id, action_type, resource_type, resource_id, action_description)
         VALUES (?, ?, 'version.restore', ?, ?, ?)`,
        [version.project_id, userId, version.resource_type, version.resource_id, `恢复到版本 v${version.version_number}`]
      );

      console.log(`[Version] 恢复版本：${versionId}`);

      res.json({ message: '版本恢复成功' });
    } catch (error) {
      console.error('[Version Restore]', error);
      res.status(500).json({ message: '恢复版本失败' });
    }
  });

  // DELETE /api/version/delete/:versionId - 删除版本（非当前版本）
  router.delete('/version/delete/:versionId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { versionId } = req.params;

    try {
      const version = await queryOne(
        'SELECT * FROM version_history WHERE id = ?',
        [versionId]
      );

      if (!version) {
        return res.status(404).json({ message: '版本不存在' });
      }

      if (version.is_current) {
        return res.status(400).json({ message: '不能删除当前版本' });
      }

      await execute('DELETE FROM version_history WHERE id = ?', [versionId]);

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, action_description)
         VALUES (?, 'version.delete', ?, ?, ?)`,
        [userId, version.resource_type, version.resource_id, `删除版本 v${version.version_number}`]
      );

      console.log(`[Version] 删除版本：${versionId}`);

      res.json({ message: '版本删除成功' });
    } catch (error) {
      console.error('[Version Delete]', error);
      res.status(500).json({ message: '删除版本失败' });
    }
  });

  // GET /api/version/compare/:versionId1/:versionId2 - 对比两个版本
  router.get('/version/compare/:versionId1/:versionId2', authMiddleware, async (req, res) => {
    const { versionId1, versionId2 } = req.params;

    try {
      const version1 = await queryOne(
        'SELECT * FROM version_history WHERE id = ?',
        [versionId1]
      );
      const version2 = await queryOne(
        'SELECT * FROM version_history WHERE id = ?',
        [versionId2]
      );

      if (!version1 || !version2) {
        return res.status(404).json({ message: '版本不存在' });
      }

      // 返回两个版本的详细数据供前端对比
      res.json({
        version1: {
          ...version1,
          change_details: JSON.parse(version1.change_details || '{}'),
          snapshot_data: JSON.parse(version1.snapshot_data || '{}')
        },
        version2: {
          ...version2,
          change_details: JSON.parse(version2.change_details || '{}'),
          snapshot_data: JSON.parse(version2.snapshot_data || '{}')
        }
      });
    } catch (error) {
      console.error('[Version Compare]', error);
      res.status(500).json({ message: '对比版本失败' });
    }
  });
};
