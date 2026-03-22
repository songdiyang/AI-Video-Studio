const express = require('express');
const { authMiddleware } = require('./middleware');
const { getBillingSummary, listBillingRecords, getBillingStatsByPeriod, getBillingStatsByModel } = require('./aiBillingService');
const modelStatsRoutes = require('./billingHandlers/modelStats');

const router = express.Router();

// 注册模型统计路由
modelStatsRoutes(router);

router.get('/summary', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const summary = await getBillingSummary(userId);
    return res.json(summary);
  } catch (err) {
    console.error('DB error in billing summary:', err);
    return res.status(500).json({ message: 'Failed to fetch billing summary' });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await listBillingRecords(userId, {
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
      chargeStatus: req.query.chargeStatus || null,
      modelCategory: req.query.modelCategory || null,
      sourceType: req.query.sourceType || null
    });

    return res.json(result.records);
  } catch (err) {
    console.error('DB error in billing history:', err);
    return res.status(500).json({ message: 'Failed to fetch billing history' });
  }
});

// 按时间段统计
router.get('/stats/period', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const period = req.query.period || 'day';
  const limit = parseInt(req.query.limit, 10) || 30;

  // 校验 period 参数
  if (!['day', 'week', 'month'].includes(period)) {
    return res.status(400).json({ message: 'Invalid period. Must be day, week, or month.' });
  }

  try {
    const stats = await getBillingStatsByPeriod(userId, { period, limit });
    return res.json({ stats, period, limit });
  } catch (err) {
    console.error('DB error in billing stats by period:', err);
    return res.status(500).json({ message: 'Failed to fetch billing stats' });
  }
});

// 按模型统计
router.get('/stats/model', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const stats = await getBillingStatsByModel(userId);
    return res.json({ stats });
  } catch (err) {
    console.error('DB error in billing stats by model:', err);
    return res.status(500).json({ message: 'Failed to fetch billing model stats' });
  }
});

module.exports = router;
