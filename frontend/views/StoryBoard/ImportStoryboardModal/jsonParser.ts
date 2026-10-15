/**
 * JSON 解析和修复工具
 * 与后端工作流使用相同的逻辑
 */

export const parseAndFixJSON = (jsonStr: string): any[] => {
  console.log('[ImportStoryboard] 开始解析，原始长度:', jsonStr.length);
  
  // 1. 移除 <think> 标签
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  // 2. 处理 markdown 代码块包裹
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
    console.log('[ImportStoryboard] 提取 markdown 代码块');
  }
  
  // 3. 移除前导/尾随空白
  jsonStr = jsonStr.trim();
  
  // 4. 先尝试直接解析
  try {
    const result = JSON.parse(jsonStr);
    console.log('[ImportStoryboard] 直接解析成功');
    return result;
  } catch (e: any) {
    console.log('[ImportStoryboard] 直接解析失败:', e.message);
    console.log('[ImportStoryboard] 尝试修复格式错误...');
  }
  
  // 5. 修复缺少引号的字段值
  let fixedStr = jsonStr;
  
  // 修复模式：查找 "key": value 其中 value 不是以引号开头的情况
  fixedStr = fixedStr.replace(
    /"(\w+)":\s+([^"\d\[\{tfn\s][^,\}]*?)([,\}])/g,
    (match, key, value, end) => {
      const trimmedValue = value.trim();
      // 排除 true/false/null
      if (trimmedValue !== 'true' && 
          trimmedValue !== 'false' && 
          trimmedValue !== 'null' &&
          trimmedValue.length > 0) {
        console.log('[ImportStoryboard] 修复字段:', key, '→', trimmedValue.substring(0, 30) + '...');
        return `"${key}": "${trimmedValue}"${end}`;
      }
      return match;
    }
  );
  
  // 6. 再次尝试解析
  try {
    const result = JSON.parse(fixedStr);
    console.log('[ImportStoryboard] 修复后解析成功，共', result.length, '个分镜');
    return result;
  } catch (e: any) {
    console.error('[ImportStoryboard] 修复后仍然失败:', e.message);
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
};
