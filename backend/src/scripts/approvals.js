const { queryAll, queryOne, execute } = require('../dbHelper');
const { authMiddleware } = require('../middleware');

// GET /api/approvals/:projectId - 获取项目的审批流程
module.exports = (router) => {
  router.get('/approvals/:projectId', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    const { status = 'all' } = req.query;

    try {
      let sql = `
        SELECT a.*, 
               IFNULL(NULLIF(u1.nickname, ''), u1.email) as created_by_name,
               IFNULL(NULLIF(u2.nickname, ''), u2.email) as current_reviewer_name,
               IFNULL(NULLIF(u3.nickname, ''), u3.email) as final_approved_by_name
        FROM workflow_approvals a
        LEFT JOIN users u1 ON a.created_by = u1.id
        LEFT JOIN users u2 ON a.current_reviewer_id = u2.id
        LEFT JOIN users u3 ON a.final_approved_by = u3.id
        WHERE a.project_id = ?
      `;
      const params = [projectId];

      if (status && status !== 'all') {
        sql += ' AND a.approval_stage = ?';
        params.push(status);
      }

      sql += ' ORDER BY a.created_at DESC';

      const approvals = await queryAll(sql, params);

      res.json({ approvals });
    } catch (error) {
      console.error('[Approvals]', error);
      res.status(500).json({ message: '获取审批流程失败' });
    }
  });

  // GET /api/approval/:storyboardId - 获取分镜的审批状态
  router.get('/approval/:storyboardId', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;

    try {
      const approval = await queryOne(
        `SELECT a.*, 
                IFNULL(NULLIF(u1.nickname, ''), u1.email) as created_by_name,
                IFNULL(NULLIF(u2.nickname, ''), u2.email) as current_reviewer_name,
                IFNULL(NULLIF(u3.nickname, ''), u3.email) as final_approved_by_name
         FROM workflow_approvals a
         LEFT JOIN users u1 ON a.created_by = u1.id
         LEFT JOIN users u2 ON a.current_reviewer_id = u2.id
         LEFT JOIN users u3 ON a.final_approved_by = u3.id
         WHERE a.storyboard_id = ?`,
        [storyboardId]
      );

      if (approval) {
        approval.approval_comments = JSON.parse(approval.approval_comments || '{}');
        approval.approval_flow = JSON.parse(approval.approval_flow || '{}');
      }

      res.json({ approval });
    } catch (error) {
      console.error('[Approval]', error);
      res.status(500).json({ message: '获取审批状态失败' });
    }
  });

  // POST /api/approval/create - 创建审批流程
  router.post('/approval/create', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId, storyboardId, approvalFlow } = req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'projectId 是必需的' });
    }

    try {
      // 获取第一个审核人
      const firstReviewer = approvalFlow?.stages?.[0]?.reviewers?.[0];

      const result = await execute(
        `INSERT INTO workflow_approvals 
         (project_id, storyboard_id, approval_stage, current_reviewer_id, approval_flow, created_by)
         VALUES (?, ?, 'draft', ?, ?, ?)`,
        [projectId, storyboardId, firstReviewer, JSON.stringify(approvalFlow), userId]
      );

      console.log(`[Approval] 创建审批流程：${result.insertId}`);

      res.json({
        message: '审批流程创建成功',
        approvalId: result.insertId
      });
    } catch (error) {
      console.error('[Approval Create]', error);
      res.status(500).json({ message: '创建审批流程失败' });
    }
  });

  // PUT /api/approval/:approvalId/submit - 提交审批
  router.put('/approval/:approvalId/submit', authMiddleware, async (req, res) => {
    const { approvalId } = req.params;

    try {
      const approval = await queryOne(
        'SELECT * FROM workflow_approvals WHERE id = ?',
        [approvalId]
      );

      if (!approval) {
        return res.status(404).json({ message: '审批流程不存在' });
      }

      // 获取审批流程配置
      const flow = JSON.parse(approval.approval_flow || '{}');
      const firstStage = flow.stages?.[0];
      const firstReviewer = firstStage?.reviewers?.[0];

      // 更新状态为待审核
      await execute(
        `UPDATE workflow_approvals 
         SET approval_stage = 'review', 
             current_reviewer_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [firstReviewer, approvalId]
      );

      console.log(`[Approval] 提交审批：${approvalId}`);

      res.json({ message: '审批已提交' });
    } catch (error) {
      console.error('[Approval Submit]', error);
      res.status(500).json({ message: '提交审批失败' });
    }
  });

  // PUT /api/approval/:approvalId/review - 审核
  router.put('/approval/:approvalId/review', authMiddleware, async (req, res) => {
    const { approvalId } = req.params;
    const { approved, comments, reviewerId } = req.body;

    if (reviewerId === undefined) {
      return res.status(400).json({ message: 'reviewerId 是必需的' });
    }

    try {
      const approval = await queryOne(
        'SELECT * FROM workflow_approvals WHERE id = ?',
        [approvalId]
      );

      if (!approval) {
        return res.status(404).json({ message: '审批流程不存在' });
      }

      // 验证当前审核人
      if (approval.current_reviewer_id !== reviewerId) {
        return res.status(403).json({ message: '无权限审核' });
      }

      // 获取审批意见
      const existingComments = JSON.parse(approval.approval_comments || '{}');
      const newComments = {
        ...existingComments,
        [reviewerId]: {
          decision: approved ? 'approved' : 'rejected',
          comments,
          timestamp: new Date().toISOString()
        }
      };

      if (approved) {
        // 获取审批流程配置
        const flow = JSON.parse(approval.approval_flow || '{}');
        const currentStageIndex = flow.stages?.findIndex(s => 
          s.reviewers?.includes(reviewerId)
        );

        if (currentStageIndex !== undefined && currentStageIndex >= 0) {
          const nextStage = flow.stages[currentStageIndex + 1];
          
          if (nextStage) {
            // 进入下一阶段
            const nextReviewer = nextStage.reviewers?.[0];
            await execute(
              `UPDATE workflow_approvals 
               SET current_reviewer_id = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [nextReviewer, approvalId]
            );
          } else {
            // 最终批准
            await execute(
              `UPDATE workflow_approvals 
               SET approval_stage = 'approved',
                   final_approved_by = ?,
                   final_approved_at = CURRENT_TIMESTAMP,
                   current_reviewer_id = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [reviewerId, approvalId]
            );
          }
        }
      } else {
        // 拒绝
        await execute(
          `UPDATE workflow_approvals 
           SET approval_stage = 'rejected',
               current_reviewer_id = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [approvalId]
        );
      }

      // 保存审批意见
      await execute(
        'UPDATE workflow_approvals SET approval_comments = ? WHERE id = ?',
        [JSON.stringify(newComments), approvalId]
      );

      console.log(`[Approval] 审核完成：${approvalId}, 结果：${approved ? '通过' : '拒绝'}`);

      res.json({ message: `审核已${approved ? '通过' : '拒绝'}` });
    } catch (error) {
      console.error('[Approval Review]', error);
      res.status(500).json({ message: '审核失败' });
    }
  });

  // PUT /api/approval/:approvalId/reject - 驳回
  router.put('/approval/:approvalId/reject', authMiddleware, async (req, res) => {
    const { approvalId } = req.params;
    const { reason, reviewerId } = req.body;

    try {
      await execute(
        `UPDATE workflow_approvals 
         SET approval_stage = 'rejected',
             current_reviewer_id = NULL,
             approval_comments = JSON_SET(
               COALESCE(approval_comments, '{}'),
               '$.rejection_reason', ?,
               '$.rejected_by', ?,
               '$.rejected_at', ?
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, reviewerId, new Date().toISOString(), approvalId]
      );

      console.log(`[Approval] 驳回审批：${approvalId}, 原因：${reason}`);

      res.json({ message: '审批已驳回' });
    } catch (error) {
      console.error('[Approval Reject]', error);
      res.status(500).json({ message: '驳回审批失败' });
    }
  });

  // GET /api/approvals/pending/:userId - 获取待审核列表
  router.get('/approvals/pending/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;

    try {
      const approvals = await queryAll(
        `SELECT a.*, 
                IFNULL(NULLIF(u1.nickname, ''), u1.email) as created_by_name,
                p.name as project_name
         FROM workflow_approvals a
         LEFT JOIN users u1 ON a.created_by = u1.id
         LEFT JOIN projects p ON a.project_id = p.id
         WHERE a.approval_stage = 'review' AND a.current_reviewer_id = ?
         ORDER BY a.created_at DESC`,
        [userId]
      );

      res.json({ approvals });
    } catch (error) {
      console.error('[Pending Approvals]', error);
      res.status(500).json({ message: '获取待审核列表失败' });
    }
  });
};
