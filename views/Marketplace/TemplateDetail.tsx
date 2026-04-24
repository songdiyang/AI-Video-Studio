import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Textarea, Divider, Chip } from '@heroui/react';
import {
  ArrowLeft, Heart, MessageCircle, ShoppingBag, Gift, Eye,
  Sparkles, Send, Trash2, UserPlus, UserCheck, Lock, Unlock, Coins
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { usePoints } from '../../contexts/PointsContext';
import {
  TemplateDetail,
  TemplateComment,
  fetchTemplateDetail,
  purchaseTemplate,
  toggleTemplateLike,
  fetchTemplateComments,
  createTemplateComment,
  deleteTemplateComment,
  toggleFollow,
} from '../../services/marketplace';
import Skeleton from '../../components/Skeleton';

const TemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { balance, refreshBalance } = usePoints();

  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [comments, setComments] = useState<TemplateComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(1);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [liking, setLiking] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [activePreview, setActivePreview] = useState(0);

  const templateId = id ? parseInt(id, 10) : null;

  // 加载详情
  const loadDetail = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const data = await fetchTemplateDetail(templateId);
      setDetail(data);
      setFollowing(false); // follow state comes from shop API
    } catch (error) {
      console.error('加载详情失败:', error);
      showToast('加载配方详情失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [templateId, showToast]);

  // 加载评论
  const loadComments = useCallback(async () => {
    if (!templateId) return;
    try {
      const data = await fetchTemplateComments(templateId, { page: commentPage, limit: 20 });
      setComments(data.comments);
      setCommentsTotal(data.pagination.total);
    } catch (error) {
      console.error('加载评论失败:', error);
    }
  }, [templateId, commentPage]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // 购买
  const handlePurchase = async () => {
    if (!detail) return;
    setPurchasing(true);
    try {
      const result = await purchaseTemplate(detail.id);
      showToast(result.message || '购买成功', 'success');
      refreshBalance();
      // 重新加载详情获取完整配方
      await loadDetail();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '购买失败';
      showToast(msg, 'error');
    } finally {
      setPurchasing(false);
    }
  };

  // 点赞
  const handleLike = async () => {
    if (!detail) return;
    setLiking(true);
    try {
      const result = await toggleTemplateLike(detail.id);
      setDetail(prev => prev ? { ...prev, hasLiked: result.liked, likeCount: result.likeCount } : prev);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '点赞失败', 'error');
    } finally {
      setLiking(false);
    }
  };

  // 关注
  const handleFollow = async () => {
    if (!detail) return;
    setFollowLoading(true);
    try {
      const result = await toggleFollow(detail.sellerId);
      setFollowing(result.following);
      showToast(result.following ? '关注成功' : '已取消关注', 'success');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  // 发表评论
  const handleSubmitComment = async () => {
    if (!templateId || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await createTemplateComment(templateId, { content: newComment.trim() });
      setNewComment('');
      showToast('评论成功', 'success');
      await loadComments();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '评论失败', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  // 删除评论
  const handleDeleteComment = async (commentId: number) => {
    try {
      await deleteTemplateComment(commentId);
      showToast('评论已删除', 'success');
      await loadComments();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  // 配方类型标签
  const getRecipeTypeLabel = (rt: string) => {
    const mp: Record<string, string> = { character: '角色', scene: '场景', script: '剧本' };
    return mp[rt] || rt;
  };

  if (loading) {
    return (
      <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="aspect-[4/3] rounded-2xl" />
            <div className="space-y-4"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20 w-full" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
        <div className="max-w-5xl mx-auto text-center py-20">
          <ShoppingBag className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">配方不存在或已下架</p>
          <Button className="mt-4" onPress={() => navigate('/marketplace')}>返回市场</Button>
        </div>
      </div>
    );
  }

  const previewImages = [
    ...(detail.thumbnailUrl ? [detail.thumbnailUrl] : []),
    ...(detail.previewUrls || []),
  ];

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* 返回 */}
        <Button
          variant="light"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => navigate(-1)}
          className="text-[var(--text-secondary)]"
        >
          返回
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左侧：图片预览 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-3"
          >
            {/* 主图 */}
            <div className="relative rounded-2xl overflow-hidden border border-[var(--border-color)] bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
              {previewImages.length > 0 ? (
                <img
                  src={previewImages[activePreview] || previewImages[0]}
                  alt={detail.name}
                  className="w-full aspect-[4/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[4/3] flex items-center justify-center">
                  <Sparkles className="w-16 h-16 text-[var(--text-muted)]/30" />
                </div>
              )}

              {/* 免费标签 */}
              {detail.isFree && (
                <div className="absolute top-3 left-3">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/90 text-white text-sm font-bold shadow-lg">
                    <Gift className="w-4 h-4" />
                    免费
                  </div>
                </div>
              )}
            </div>

            {/* 预览缩略图列表 */}
            {previewImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previewImages.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePreview(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      activePreview === idx ? 'border-violet-500 shadow-md' : 'border-[var(--border-color)] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* 右侧：信息区 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-5"
          >
            {/* 标题+类型 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Chip size="sm" variant="flat" className="bg-violet-500/10 text-violet-400">
                  {getRecipeTypeLabel(detail.recipeType)}
                </Chip>
                {detail.isOfficial && (
                  <Chip size="sm" variant="flat" color="warning" startContent={<Sparkles className="w-3 h-3" />}>
                    官方
                  </Chip>
                )}
              </div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{detail.name}</h1>
            </div>

            {/* 卖家信息 */}
            <div
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] cursor-pointer hover:border-violet-500/30 transition-colors"
              onClick={() => navigate(`/marketplace/shop/${detail.sellerId}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center text-sm font-bold text-violet-400 border border-violet-500/20 overflow-hidden">
                  {detail.sellerAvatar ? (
                    <img src={detail.sellerAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    detail.sellerName?.[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {detail.sellerName || '匿名卖家'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {detail.sellerFollowerCount !== undefined ? `${detail.sellerFollowerCount} 粉丝` : ''}
                    {detail.sellerTotalSales !== undefined ? ` · ${detail.sellerTotalSales} 销售` : ''}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant={following ? 'flat' : 'solid'}
                color={following ? 'default' : 'secondary'}
                startContent={following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                isLoading={followLoading}
                onClick={(e) => { e.stopPropagation(); handleFollow(); }}
                className={following ? '' : 'bg-violet-500 text-white'}
              >
                {following ? '已关注' : '关注'}
              </Button>
            </div>

            {/* 描述 */}
            {detail.description && (
              <div>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-1">简介</h3>
                <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{detail.description}</p>
              </div>
            )}

            {/* 配方预览 */}
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2 mb-3">
                {detail.hasPurchased ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  {detail.hasPurchased ? '配方内容（已解锁）' : '配方预览（购买后解锁完整内容）'}
                </h3>
              </div>
              {detail.recipeData?.prompts ? (
                <div className="space-y-2">
                  {Object.entries(detail.recipeData.prompts).map(([key, value]: [string, any]) => (
                    <div key={key} className="text-xs">
                      <span className="text-violet-400 font-medium">{key}:</span>{' '}
                      <span className="text-[var(--text-muted)]">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">暂无配方预览</p>
              )}
            </div>

            {/* 统计 */}
            <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
              <div className="flex items-center gap-1.5">
                <Heart className="w-4 h-4" />
                <span>{detail.likeCount} 点赞</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span>{detail.purchaseCount} 购买</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                <span>{detail.commentCount} 评论</span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <Button
                isIconOnly
                variant="light"
                isLoading={liking}
                onPress={handleLike}
                className={`rounded-full ${detail.hasLiked ? 'text-pink-500 bg-pink-500/10' : 'text-[var(--text-muted)] hover:text-pink-500'}`}
              >
                <Heart className={`w-5 h-5 ${detail.hasLiked ? 'fill-current' : ''}`} />
              </Button>

              {detail.hasPurchased ? (
                <div className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-center text-sm font-medium">
                  <Unlock className="w-4 h-4 inline mr-1.5" />
                  已购买 · 配方已解锁
                </div>
              ) : detail.isFree ? (
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium shadow-lg shadow-emerald-500/25"
                  isLoading={purchasing}
                  onPress={handlePurchase}
                  startContent={<Gift className="w-4 h-4" />}
                >
                  免费获取配方
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-medium shadow-lg shadow-violet-500/25"
                  isLoading={purchasing}
                  onPress={handlePurchase}
                  startContent={<Coins className="w-4 h-4" />}
                >
                  {detail.price} 积分购买配方
                </Button>
              )}
            </div>

            {/* 余额提示 */}
            {!detail.hasPurchased && !detail.isFree && detail.price > 0 && (
              <div className="text-xs text-[var(--text-muted)] text-center">
                当前余额：<span className={balance < detail.price ? 'text-red-400' : 'text-emerald-400'}>{balance} 积分</span>
                {balance < detail.price && <span className="text-red-400 ml-1">（余额不足）</span>}
              </div>
            )}
          </motion.div>
        </div>

        <Divider className="bg-[var(--border-color)]" />

        {/* 评论区 */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-violet-400" />
            评论 ({commentsTotal})
          </h3>

          {/* 发表评论 */}
          <div className="flex gap-3">
            <Textarea
              placeholder="写下你的评论..."
              value={newComment}
              onValueChange={setNewComment}
              maxLength={500}
              minRows={2}
              classNames={{
                inputWrapper: "bg-[var(--bg-card)] border border-[var(--border-color)]",
              }}
              className="flex-1"
            />
            <Button
              isIconOnly
              color="secondary"
              isLoading={submittingComment}
              isDisabled={!newComment.trim()}
              onPress={handleSubmitComment}
              className="bg-violet-500 text-white self-end"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* 评论列表 */}
          {comments.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-8">暂无评论，快来发表第一条吧</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center text-xs font-medium text-violet-400 overflow-hidden">
                        {comment.userAvatar ? (
                          <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          comment.userName?.[0]?.toUpperCase() || 'U'
                        )}
                      </div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {comment.userName || '匿名用户'}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="text-[var(--text-muted)] hover:text-red-400"
                      onPress={() => handleDeleteComment(comment.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateDetailPage;
