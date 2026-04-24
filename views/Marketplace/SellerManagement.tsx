import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tabs, Tab, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea, Select, SelectItem, Switch } from '@heroui/react';
import {
  Package, Plus, ArrowUpFromLine, ArrowDownToLine, Trash2,
  Coins, Gift, TrendingUp, Eye, Heart, BarChart3, ShoppingBag, Edit3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import {
  MarketplaceTemplate,
  RecipeType,
  ListingStatus,
  fetchMyTemplates,
  fetchMyPurchases,
  fetchEarnings,
  listTemplate,
  delistTemplate,
  deleteMarketplaceTemplate,
  PurchaseRecord,
  EarningsStats,
  RecentSale,
  SellerTemplateStat,
} from '../../services/marketplace';
import Skeleton from '../../components/Skeleton';

const SellerManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'my-templates' | 'purchases' | 'earnings'>('my-templates');
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [templatePage, setTemplatePage] = useState(1);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasePage, setPurchasePage] = useState(1);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const [earningsStats, setEarningsStats] = useState<EarningsStats>({ totalEarnings: 0, totalSalesCount: 0 });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [templateStats, setTemplateStats] = useState<SellerTemplateStat[]>([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // 加载我的模板
  const loadMyTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const result = await fetchMyTemplates({ page: templatePage, limit: 20 });
      setTemplates(result.templates);
      setTemplatesTotal(result.pagination.total);
    } catch (error) {
      showToast('加载我的模板失败', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  }, [templatePage, showToast]);

  // 加载购买记录
  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      const result = await fetchMyPurchases({ page: purchasePage, limit: 20 });
      setPurchases(result.purchases);
      setPurchasesTotal(result.pagination.total);
    } catch (error) {
      showToast('加载购买记录失败', 'error');
    } finally {
      setLoadingPurchases(false);
    }
  }, [purchasePage, showToast]);

  // 加载收入统计
  const loadEarnings = useCallback(async () => {
    setLoadingEarnings(true);
    try {
      const data = await fetchEarnings();
      setEarningsStats(data.stats);
      setRecentSales(data.recentSales);
      setTemplateStats(data.templateStats);
    } catch (error) {
      showToast('加载收入统计失败', 'error');
    } finally {
      setLoadingEarnings(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === 'my-templates') loadMyTemplates();
  }, [activeTab, loadMyTemplates]);

  useEffect(() => {
    if (activeTab === 'purchases') loadPurchases();
  }, [activeTab, loadPurchases]);

  useEffect(() => {
    if (activeTab === 'earnings') loadEarnings();
  }, [activeTab, loadEarnings]);

  // 上架
  const handleList = async (id: number) => {
    setActionLoading(id);
    try {
      await listTemplate(id);
      showToast('上架成功', 'success');
      await loadMyTemplates();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '上架失败', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 下架
  const handleDelist = async (id: number) => {
    setActionLoading(id);
    try {
      await delistTemplate(id);
      showToast('下架成功', 'success');
      await loadMyTemplates();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '下架失败', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMarketplaceTemplate(deleteId);
      showToast('删除成功', 'success');
      setDeleteId(null);
      await loadMyTemplates();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  // 配方类型标签
  const getRecipeTypeLabel = (rt: RecipeType) => {
    const mp: Record<RecipeType, string> = { character: '角色', scene: '场景', script: '剧本' };
    return mp[rt] || rt;
  };

  // 状态标签颜色
  const getStatusChip = (status: ListingStatus) => {
    switch (status) {
      case 'listed': return <Chip size="sm" color="success" variant="flat">上架中</Chip>;
      case 'delisted': return <Chip size="sm" color="warning" variant="flat">已下架</Chip>;
      case 'draft': return <Chip size="sm" color="default" variant="flat">草稿</Chip>;
      default: return <Chip size="sm" variant="flat">{status}</Chip>;
    }
  };

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/30 rounded-xl border border-violet-500/30">
                <Package className="w-6 h-6 text-violet-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">卖家管理</h1>
              <p className="text-sm text-[var(--text-muted)]">管理你的配方、查看收入和购买记录</p>
            </div>
          </div>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => navigate('/marketplace/create')}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"
          >
            发布配方
          </Button>
        </div>

        {/* 统计概览 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-1">
              <Package className="w-4 h-4" /> 配方总数
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{templatesTotal}</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-1">
              <Coins className="w-4 h-4" /> 累计收入
            </div>
            <div className="text-2xl font-bold text-violet-400">{earningsStats.totalEarnings} 积分</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-1">
              <ShoppingBag className="w-4 h-4" /> 总销量
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{earningsStats.totalSalesCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-1">
              <Gift className="w-4 h-4" /> 已购买
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{purchasesTotal}</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as any)}
          classNames={{
            tabList: "bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-1",
            tab: "text-[var(--text-muted)] data-[selected=true]:text-violet-400 font-medium px-6",
            cursor: "bg-violet-500/15 rounded-lg",
          }}
        >
          <Tab key="my-templates" title={<div className="flex items-center gap-2"><Package className="w-4 h-4" />我的配方</div>} />
          <Tab key="purchases" title={<div className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" />购买记录</div>} />
          <Tab key="earnings" title={<div className="flex items-center gap-2"><BarChart3 className="w-4 h-4" />收入统计</div>} />
        </Tabs>

        {/* 我的配方 */}
        {activeTab === 'my-templates' && (
          <div className="space-y-3">
            {loadingTemplates ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-[var(--text-muted)]">还没有发布配方</p>
                <Button className="mt-4" color="primary" onPress={() => navigate('/marketplace/create')}>
                  发布第一个配方
                </Button>
              </div>
            ) : (
              templates.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-violet-500/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* 缩略图 */}
                    <div
                      className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 flex-shrink-0 cursor-pointer"
                      onClick={() => navigate(`/marketplace/template/${template.id}`)}
                    >
                      {template.thumbnailUrl ? (
                        <img src={template.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-[var(--text-muted)]/30" />
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{template.name}</h3>
                        {getStatusChip(template.listingStatus || 'draft')}
                        <Chip size="sm" variant="flat" className="bg-violet-500/10 text-violet-400">
                          {getRecipeTypeLabel(template.recipeType)}
                        </Chip>
                        {template.isFree && (
                          <Chip size="sm" variant="flat" color="success" startContent={<Gift className="w-3 h-3" />}>免费</Chip>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {template.likeCount}</span>
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {template.purchaseCount} 购买</span>
                        <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> 收入 {template.totalRevenue || 0}</span>
                        {!template.isFree && <span>价格: {template.price} 积分</span>}
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-2">
                      {template.listingStatus === 'draft' || template.listingStatus === 'delisted' ? (
                        <Button
                          size="sm"
                          color="success"
                          variant="flat"
                          startContent={<ArrowUpFromLine className="w-3.5 h-3.5" />}
                          isLoading={actionLoading === template.id}
                          onPress={() => handleList(template.id)}
                        >
                          上架
                        </Button>
                      ) : template.listingStatus === 'listed' ? (
                        <Button
                          size="sm"
                          color="warning"
                          variant="flat"
                          startContent={<ArrowDownToLine className="w-3.5 h-3.5" />}
                          isLoading={actionLoading === template.id}
                          onPress={() => handleDelist(template.id)}
                        >
                          下架
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="light"
                        isIconOnly
                        className="text-[var(--text-muted)] hover:text-red-400"
                        onPress={() => setDeleteId(template.id)}
                        isDisabled={template.listingStatus === 'listed'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* 购买记录 */}
        {activeTab === 'purchases' && (
          <div className="space-y-3">
            {loadingPurchases ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-[var(--text-muted)]">还没有购买记录</p>
              </div>
            ) : (
              purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-violet-500/20 transition-colors cursor-pointer"
                  onClick={() => navigate(`/marketplace/template/${purchase.templateId}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 flex-shrink-0">
                      {purchase.thumbnailUrl ? (
                        <img src={purchase.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-[var(--text-muted)]/30" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{purchase.templateName}</h3>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1">
                        <span>卖家: {purchase.sellerName || '匿名'}</span>
                        <span>价格: {purchase.price} 积分</span>
                        <span>{new Date(purchase.purchasedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Chip size="sm" variant="flat" color="success">已解锁</Chip>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 收入统计 */}
        {activeTab === 'earnings' && (
          <div className="space-y-6">
            {loadingEarnings ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-40 rounded-xl" />
              </div>
            ) : (
              <>
                {/* 最近交易 */}
                <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-violet-400" /> 最近交易
                  </h3>
                  {recentSales.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm text-center py-4">暂无交易记录</p>
                  ) : (
                    <div className="space-y-2">
                      {recentSales.map((sale, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border-color)] last:border-0">
                          <div>
                            <span className="text-sm text-[var(--text-primary)]">{sale.templateName}</span>
                            <span className="text-xs text-[var(--text-muted)] ml-2">{sale.buyerEmail}</span>
                          </div>
                          <div className="text-sm font-medium text-emerald-400">+{sale.sellerRevenue} 积分</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 配方排行 */}
                <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-400" /> 配方排行
                  </h3>
                  {templateStats.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm text-center py-4">暂无数据</p>
                  ) : (
                    <div className="space-y-2">
                      {templateStats.map((stat) => (
                        <div key={stat.id} className="flex items-center justify-between py-2 border-b border-[var(--border-color)] last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-[var(--text-primary)]">{stat.name}</span>
                            <Chip size="sm" variant="flat" className="bg-violet-500/10 text-violet-400 text-xs">
                              {getRecipeTypeLabel(stat.recipeType)}
                            </Chip>
                            {stat.isFree && <Chip size="sm" variant="flat" color="success" className="text-xs">免费</Chip>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                            <span>{stat.purchaseCount} 购买</span>
                            <span>{stat.likeCount} 点赞</span>
                            <span className="text-emerald-400 font-medium">{stat.totalRevenue} 收入</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)}>
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p className="text-[var(--text-secondary)]">确定要删除此配方吗？此操作不可撤销。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteId(null)}>取消</Button>
            <Button color="danger" onPress={handleDelete}>确认删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SellerManagement;
