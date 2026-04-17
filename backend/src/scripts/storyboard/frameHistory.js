const { queryAll, queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

/**
 * 将原始帧历史记录分组为版本列表
 * 优先按 batch_id 分组，无 batch_id 的老数据按 version_number 配对
 */
function groupHistoryToVersions(records) {
  const batchGroups = new Map();
  const noBatchRecords = [];

  for (const r of records) {
    if (r.batch_id) {
      if (!batchGroups.has(r.batch_id)) {
        batchGroups.set(r.batch_id, []);
      }
      batchGroups.get(r.batch_id).push(r);
    } else {
      noBatchRecords.push(r);
    }
  }

  const versions = [];

  // 处理有 batch_id 的记录
  for (const [batchId, group] of batchGroups) {
    const firstFrame = group.find(r => r.frame_type === 'first') || null;
    const lastFrame = group.find(r => r.frame_type === 'last') || null;
    const videoUrl = firstFrame?.video_url || lastFrame?.video_url || null;
    const isCurrent = group.some(r => r.is_current);
    const createdAt = firstFrame?.created_at || lastFrame?.created_at;
    const prompt = firstFrame?.generation_prompt || lastFrame?.generation_prompt || '';
    const versionNumber = firstFrame?.version_number || lastFrame?.version_number || 0;

    versions.push({
      batchId,
      versionNumber,
      firstFrame: firstFrame ? { id: firstFrame.id, frame_url: firstFrame.frame_url, version_number: firstFrame.version_number } : null,
      lastFrame: lastFrame ? { id: lastFrame.id, frame_url: lastFrame.frame_url, version_number: lastFrame.version_number } : null,
      videoUrl,
      isCurrent,
      createdAt,
      prompt
    });
  }

  // 处理无 batch_id 的老数据：按 version_number 配对
  const versionMap = new Map();
  for (const r of noBatchRecords) {
    const key = r.version_number;
    if (!versionMap.has(key)) {
      versionMap.set(key, { first: null, last: null });
    }
    if (r.frame_type === 'first') versionMap.get(key).first = r;
    else versionMap.get(key).last = r;
  }

  for (const [vNum, pair] of versionMap) {
    const firstFrame = pair.first;
    const lastFrame = pair.last;
    const videoUrl = firstFrame?.video_url || lastFrame?.video_url || null;
    const isCurrent = (firstFrame?.is_current || false) || (lastFrame?.is_current || false);
    const createdAt = firstFrame?.created_at || lastFrame?.created_at;
    const prompt = firstFrame?.generation_prompt || lastFrame?.generation_prompt || '';

    versions.push({
      batchId: null,
      versionNumber: vNum,
      firstFrame: firstFrame ? { id: firstFrame.id, frame_url: firstFrame.frame_url, version_number: firstFrame.version_number } : null,
      lastFrame: lastFrame ? { id: lastFrame.id, frame_url: lastFrame.frame_url, version_number: lastFrame.version_number } : null,
      videoUrl,
      isCurrent,
      createdAt,
      prompt
    });
  }

  // 按创建时间倒序，当前版本置顶
  versions.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return versions;
}

// GET /:storyboardId/frame-history - 获取分镜的帧历史版本（统一视图）
module.exports = (router) => {
  router.get('/:storyboardId/frame-history', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;

    try {
      const history = await queryAll(
        `SELECT h.*, IFNULL(NULLIF(u.nickname, ''), u.email) as created_by_name
         FROM storyboard_frame_history h
         LEFT JOIN users u ON h.created_by = u.id
         WHERE h.storyboard_id = ?
         ORDER BY h.created_at DESC`,
        [storyboardId]
      );

      const versions = groupHistoryToVersions(history);
      res.json({ versions });
    } catch (error) {
      console.error('[Frame History]', error);
      res.status(500).json({ message: '获取帧历史失败' });
    }
  });

  // PUT /:storyboardId/frame-history/restore - 恢复历史版本（按批次或单条记录）
  router.put('/:storyboardId/frame-history/restore', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;
    const { batchId, historyId } = req.body;

    try {
      let records;
      if (batchId) {
        records = await queryAll(
          'SELECT * FROM storyboard_frame_history WHERE storyboard_id = ? AND batch_id = ?',
          [storyboardId, batchId]
        );
      } else if (historyId) {
        const single = await queryOne(
          'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
          [historyId, storyboardId]
        );
        records = single ? [single] : [];
      } else {
        return res.status(400).json({ message: '需要 batchId 或 historyId' });
      }

      if (records.length === 0) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      // 将所有帧类型的当前版本设为非当前
      const frameTypes = [...new Set(records.map(r => r.frame_type))];
      for (const ft of frameTypes) {
        await execute(
          'UPDATE storyboard_frame_history SET is_current = FALSE WHERE storyboard_id = ? AND frame_type = ?',
          [storyboardId, ft]
        );
      }

      // 将恢复的记录设为当前
      const ids = records.map(r => r.id);
      await execute(
        `UPDATE storyboard_frame_history SET is_current = TRUE WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      // 更新 storyboards 表
      const firstRecord = records.find(r => r.frame_type === 'first');
      const lastRecord = records.find(r => r.frame_type === 'last');
      const videoUrl = firstRecord?.video_url || lastRecord?.video_url || null;

      const updateFields = [];
      const updateParams = [];

      if (firstRecord) {
        updateFields.push('first_frame_url = ?');
        updateParams.push(firstRecord.frame_url);
      }
      if (lastRecord) {
        updateFields.push('last_frame_url = ?');
        updateParams.push(lastRecord.frame_url);
      }
      // 恢复视频（可以为 null，表示该版本无视频）
      updateFields.push('video_url = ?');
      updateParams.push(videoUrl);

      if (updateFields.length > 0) {
        updateParams.push(storyboardId);
        await execute(
          `UPDATE storyboards SET ${updateFields.join(', ')} WHERE id = ?`,
          updateParams
        );
      }

      console.log(`[Frame History] 恢复版本：storyboardId=${storyboardId}, batchId=${batchId || 'N/A'}, records=${ids.length}`);
      res.json({ message: '版本已恢复', restoredFirstFrame: firstRecord?.frame_url, restoredLastFrame: lastRecord?.frame_url, restoredVideoUrl: videoUrl });
    } catch (error) {
      console.error('[Frame History Restore]', error);
      res.status(500).json({ message: '恢复版本失败' });
    }
  });

  // DELETE /:storyboardId/frame-history - 删除历史版本（按批次或单条记录）
  router.delete('/:storyboardId/frame-history', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;
    const { batchId, historyId } = req.body;

    try {
      let records;
      if (batchId) {
        records = await queryAll(
          'SELECT * FROM storyboard_frame_history WHERE storyboard_id = ? AND batch_id = ?',
          [storyboardId, batchId]
        );
      } else if (historyId) {
        const single = await queryOne(
          'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
          [historyId, storyboardId]
        );
        records = single ? [single] : [];
      } else {
        return res.status(400).json({ message: '需要 batchId 或 historyId' });
      }

      if (records.length === 0) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      // 不能删除当前版本
      if (records.some(r => r.is_current)) {
        return res.status(400).json({ message: '不能删除当前使用的版本' });
      }

      const ids = records.map(r => r.id);
      await execute(
        `DELETE FROM storyboard_frame_history WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );

      console.log(`[Frame History] 删除版本：storyboardId=${storyboardId}, batchId=${batchId || 'N/A'}, deleted=${ids.length}`);
      res.json({ message: '版本已删除' });
    } catch (error) {
      console.error('[Frame History Delete]', error);
      res.status(500).json({ message: '删除版本失败' });
    }
  });

  // 保留旧的 PUT /:storyboardId/frame-history/:historyId/restore 接口兼容
  router.put('/:storyboardId/frame-history/:historyId/restore', authMiddleware, async (req, res) => {
    const { storyboardId, historyId } = req.params;

    try {
      const history = await queryOne(
        'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
        [historyId, storyboardId]
      );
      if (!history) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      await execute(
        'UPDATE storyboard_frame_history SET is_current = FALSE WHERE storyboard_id = ? AND frame_type = ?',
        [storyboardId, history.frame_type]
      );

      await execute(
        'UPDATE storyboard_frame_history SET is_current = TRUE WHERE id = ?',
        [historyId]
      );

      const fieldName = history.frame_type === 'first' ? 'first_frame_url' : 'last_frame_url';
      await execute(
        `UPDATE storyboards SET ${fieldName} = ? WHERE id = ?`,
        [history.frame_url, storyboardId]
      );

      res.json({ message: '版本已恢复' });
    } catch (error) {
      console.error('[Frame History Restore Legacy]', error);
      res.status(500).json({ message: '恢复版本失败' });
    }
  });

  // 保留旧的 DELETE /:storyboardId/frame-history/:historyId 接口兼容
  router.delete('/:storyboardId/frame-history/:historyId', authMiddleware, async (req, res) => {
    const { storyboardId, historyId } = req.params;

    try {
      const history = await queryOne(
        'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
        [historyId, storyboardId]
      );
      if (!history) {
        return res.status(404).json({ message: '历史记录不存在' });
      }
      if (history.is_current) {
        return res.status(400).json({ message: '不能删除当前使用的版本' });
      }

      await execute('DELETE FROM storyboard_frame_history WHERE id = ?', [historyId]);
      res.json({ message: '版本已删除' });
    } catch (error) {
      console.error('[Frame History Delete Legacy]', error);
      res.status(500).json({ message: '删除版本失败' });
    }
  });
};
