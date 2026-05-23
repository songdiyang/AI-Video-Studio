/**
 * 火山引擎知识库（RAG）服务
 * 
 * 提供剧本的切分、向量化存储、语义检索能力
 * 
 * 使用方式：
 * 1. 剧本创建/更新时调用 indexScript() 建立索引
 * 2. 剧本删除时调用 deleteScriptIndex() 清理索引
 * 3. AI 助手提问时调用 search() 检索相关内容
 */

const fetch = require('node-fetch');

// ─── 配置 ──────────────────────────────────────────────────────────
const API_KEY = process.env.VOLCENGINE_RAG_API_KEY;
const ENDPOINT = process.env.VOLCENGINE_RAG_ENDPOINT || 'https://api-knowledgebase.mlp.cn-beijing.volces.com';

// 知识库项目/空间名称（从环境变量获取）
const PROJECT_NAME = process.env.VOLCENGINE_RAG_PROJECT_NAME || 'default';

// 知识库集合名称（从环境变量获取）
let COLLECTION_NAME = process.env.VOLCENGINE_RAG_COLLECTION_NAME;

// Embedding 模型（火山引擎支持的文本向量化模型）
const EMBEDDING_MODEL = 'bge-large-zh'; // 或 'bge-m3' 支持多语言

// 剧本切分配置
const CHUNK_CONFIG = {
  // 场景切分：按 ## 标题分割
  sceneDelimiter: /##\s+/,
  // 最大 chunk 长度（字符数）
  maxChunkLength: 2000,
  // 相邻 chunk 重叠长度
  overlapLength: 200,
};

// ─── 工具函数 ──────────────────────────────────────────────────────

/**
 * 检查服务是否可用
 */
function isAvailable() {
  return !!API_KEY;
}

/**
 * 获取知识库集合名称
 */
async function getCollectionName() {
  if (COLLECTION_NAME) return COLLECTION_NAME;
  throw new Error('VOLCENGINE_RAG_COLLECTION_NAME 未配置，请先在火山引擎控制台创建知识库并配置名称');
}

/**
 * 调用 VikingDB 知识库 API（Bearer Token 鉴权）
 */
async function callRAGAPI(path, options = {}) {
  const url = `${ENDPOINT}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`RAG API 错误 (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ─── 剧本切分 ──────────────────────────────────────────────────────

/**
 * 将剧本内容切分为语义 chunk
 * 
 * 切分策略：
 * 1. 按场景（## 标题）切分
 * 2. 每个场景内如果过长，再按段落切分
 * 3. 保留角色、场景编号等元数据
 */
function splitScript(script) {
  const { id, project_id, episode_number, title, content } = script;
  
  if (!content || content.trim().length === 0) {
    return [];
  }

  const chunks = [];
  
  // 1. 提取剧本全局元数据 chunk
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim() || '';
  
  // 剧本开头通常是标题或简介，作为 metadata chunk
  if (firstLine && !firstLine.startsWith('##')) {
    chunks.push({
      type: 'metadata',
      index: 0,
      content: `《${title || `第${episode_number}集`}》\n${firstLine}`,
      metadata: {
        script_id: id,
        project_id,
        episode_number,
        chunk_type: 'metadata',
      },
    });
  }

  // 2. 按场景切分
  const sceneRegex = /##\s*(.+?)(?=\n|$)([\s\S]*?)(?=##\s*|$)/g;
  let match;
  let sceneIndex = 0;

  while ((match = sceneRegex.exec(content)) !== null) {
    sceneIndex++;
    const sceneTitle = match[1].trim();
    const sceneContent = match[2].trim();
    
    // 提取场景中的角色
    const characterRegex = /\*\*(.+?)\*\*：/g;
    const characters = [...sceneContent.matchAll(characterRegex)].map(m => m[1]);
    const uniqueCharacters = [...new Set(characters)];

    // 如果场景内容过长，进一步切分
    if (sceneContent.length > CHUNK_CONFIG.maxChunkLength) {
      const subChunks = splitLongScene(sceneContent, CHUNK_CONFIG.maxChunkLength, CHUNK_CONFIG.overlapLength);
      subChunks.forEach((subContent, subIndex) => {
        chunks.push({
          type: 'scene',
          index: `${sceneIndex}.${subIndex}`,
          content: `场景${sceneIndex}：${sceneTitle}\n${subContent}`,
          metadata: {
            script_id: id,
            project_id,
            episode_number,
            scene_number: sceneIndex,
            scene_title: sceneTitle,
            characters: uniqueCharacters,
            chunk_type: 'scene',
            sub_index: subIndex,
          },
        });
      });
    } else {
      chunks.push({
        type: 'scene',
        index: sceneIndex,
        content: `场景${sceneIndex}：${sceneTitle}\n${sceneContent}`,
        metadata: {
          script_id: id,
          project_id,
          episode_number,
          scene_number: sceneIndex,
          scene_title: sceneTitle,
          characters: uniqueCharacters,
          chunk_type: 'scene',
        },
      });
    }
  }

  // 3. 如果没有按 ## 切分出场景，则按段落切分
  if (chunks.length === 0 || (chunks.length === 1 && chunks[0].type === 'metadata')) {
    const paragraphChunks = splitByParagraphs(content, CHUNK_CONFIG.maxChunkLength);
    paragraphChunks.forEach((paraContent, index) => {
      chunks.push({
        type: 'paragraph',
        index: index + 1,
        content: `《${title || `第${episode_number}集`}》\n${paraContent}`,
        metadata: {
          script_id: id,
          project_id,
          episode_number,
          chunk_type: 'paragraph',
        },
      });
    });
  }

  return chunks;
}

/**
 * 切分长场景内容
 */
function splitLongScene(content, maxLength, overlap) {
  const chunks = [];
  let start = 0;
  
  while (start < content.length) {
    const end = Math.min(start + maxLength, content.length);
    chunks.push(content.slice(start, end));
    start = end - overlap;
    if (start >= end) break; // 防止无限循环
  }
  
  return chunks;
}

/**
 * 按段落切分
 */
function splitByParagraphs(content, maxLength) {
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  const chunks = [];
  let currentChunk = '';
  
  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += '\n\n' + para;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// ─── 向量化与存储 ──────────────────────────────────────────────────

/**
 * 为剧本建立向量索引
 * 
 * @param {Object} script - 剧本对象 {id, project_id, episode_number, title, content}
 * @returns {Promise<{success: boolean, chunksCount: number, message: string}>}
 */
async function indexScript(script) {
  if (!isAvailable()) {
    return { success: false, chunksCount: 0, message: 'RAG 服务未配置' };
  }

  try {
    // 1. 先删除旧索引（如果存在）
    await deleteScriptIndex(script.id);

    // 2. 切分剧本
    const chunks = splitScript(script);
    if (chunks.length === 0) {
      return { success: true, chunksCount: 0, message: '剧本内容为空，无需索引' };
    }

    // 3. 逐个上传 chunk
    const collectionName = await getCollectionName();
    
    for (const chunk of chunks) {
      await uploadChunk(chunk, collectionName);
    }

    return { 
      success: true, 
      chunksCount: chunks.length, 
      message: `成功索引 ${chunks.length} 个片段` 
    };
  } catch (error) {
    console.error('[RAG] 索引剧本失败:', error);
    return { 
      success: false, 
      chunksCount: 0, 
      message: error.message 
    };
  }
}

/**
 * 上传单个 chunk 到知识库
 */
async function uploadChunk(chunk, collectionName) {
  const docId = `script_${chunk.metadata.script_id}_${chunk.type}_${chunk.index}`;
  
  await callRAGAPI('/api/knowledge/doc/add', {
    method: 'POST',
    body: JSON.stringify({
      collection_name: collectionName,
      project: PROJECT_NAME,
      add_type: 'string',
      doc_id: docId,
      doc_name: docId,
      content: chunk.content,
      meta: Object.entries(chunk.metadata).map(([k, v]) => ({
        field_name: k,
        field_type: typeof v === 'number' ? 'int64' : 'string',
        field_value: String(v),
      })),
    }),
  });
}

/**
 * 删除剧本的所有索引
 */
async function deleteScriptIndex(scriptId) {
  if (!isAvailable()) return;

  try {
    const collectionName = await getCollectionName();
    const docIdPrefix = `script_${scriptId}_`;
    
    // 调用删除接口（通过 doc_id 前缀匹配）
    await callRAGAPI('/api/knowledge/doc/del', {
      method: 'POST',
      body: JSON.stringify({
        collection_name: collectionName,
        project: PROJECT_NAME,
        doc_ids: [docIdPrefix],
      }),
    });
  } catch (error) {
    console.error('[RAG] 删除索引失败:', error);
    // 删除失败不抛错，继续执行
  }
}

// ─── 检索 ──────────────────────────────────────────────────────────

/**
 * 语义检索剧本内容
 * 
 * @param {string} query - 用户查询
 * @param {number} projectId - 项目 ID（用于隔离）
 * @param {Object} options - 可选参数
 * @param {number} options.topK - 返回结果数量（默认 3）
 * @param {number} options.episodeNumber - 限定集数（可选）
 * @returns {Promise<Array<{content: string, score: number, metadata: Object}>>}
 */
async function search(query, projectId, options = {}) {
  if (!isAvailable()) {
    return [];
  }

  try {
    const collectionName = await getCollectionName();
    const topK = options.topK || 3;

    const result = await callRAGAPI('/api/knowledge/collection/search_knowledge', {
      method: 'POST',
      body: JSON.stringify({
        name: collectionName,
        project: PROJECT_NAME,
        query,
        limit: topK,
        query_param: {
          doc_filter: {
            op: 'must',
            field: 'project_id',
            conds: [String(projectId)],
          },
        },
      }),
    });

    // VikingDB 返回格式: result.data.count + result.data.token_usage
    // 实际检索结果在 data 中，但文档未明确说明具体字段
    // 根据返回结构适配
    const responseData = result.data || {};
    const chunks = responseData.chunks || responseData.results || responseData.documents || [];
    
    return chunks.map(doc => ({
      content: doc.content || doc.text || doc.chunk || '',
      score: doc.score || doc.similarity || doc.distance || 0,
      metadata: doc.metadata || doc.meta || {},
    }));
  } catch (error) {
    console.error('[RAG] 检索失败:', error);
    return [];
  }
}

/**
 * 批量检索（用于需要更多上下文的场景）
 */
async function searchWithContext(query, projectId, options = {}) {
  const results = await search(query, projectId, {
    topK: options.topK || 5,
    episodeNumber: options.episodeNumber,
  });

  if (results.length === 0) {
    return '';
  }

  // 按场景分组组装上下文
  const grouped = {};
  for (const result of results) {
    const ep = result.metadata.episode_number || 'unknown';
    const scene = result.metadata.scene_number || 'unknown';
    const key = `第${ep}集-场景${scene}`;
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(result.content);
  }

  // 组装成文本
  const parts = [];
  for (const [key, contents] of Object.entries(grouped)) {
    parts.push(`【${key}】\n${contents.join('\n')}`);
  }

  return parts.join('\n\n---\n\n');
}

// ─── 状态查询 ──────────────────────────────────────────────────────

/**
 * 获取知识库状态（用于后台监控）
 */
async function getStatus() {
  if (!isAvailable()) {
    return { available: false, message: 'RAG 服务未配置' };
  }

  try {
    const collectionName = await getCollectionName();
    
    // 调用搜索接口测试连通性（搜索空字符串）
    const result = await callRAGAPI('/api/knowledge/collection/search_knowledge', {
      method: 'POST',
      body: JSON.stringify({
        name: collectionName,
        project: PROJECT_NAME,
        query: 'test',
        limit: 1,
      }),
    });
    
    return {
      available: true,
      projectId: collectionName,
      projectName: PROJECT_NAME,
      message: '服务正常',
      responseCode: result.code,
    };
  } catch (error) {
    return { 
      available: false, 
      message: error.message 
    };
  }
}

// ─── 导出 ──────────────────────────────────────────────────────────

module.exports = {
  isAvailable,
  indexScript,
  deleteScriptIndex,
  search,
  searchWithContext,
  getStatus,
  splitScript,
};
