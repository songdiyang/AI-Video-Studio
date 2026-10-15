import React from 'react';

interface ImportInstructionsProps {
  showTips?: boolean;
}

const ImportInstructions: React.FC<ImportInstructionsProps> = ({ showTips = false }) => {
  if (showTips) {
    return (
      <div className="text-xs text-slate-400">
        <p className="font-medium mb-1">提示：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>导入会覆盖当前所有分镜</li>
          <li>每个分镜必须包含 description 或 prompt_template 字段</li>
          <li>系统会自动尝试修复常见的格式错误</li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-300 mb-2">
        粘贴分镜 JSON 数组，支持以下格式：
      </p>
      <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
        <li>纯 JSON 数组</li>
        <li>包含 markdown 代码块的 JSON（```json ... ```）</li>
        <li>会自动修复缺少引号的字段</li>
      </ul>
    </div>
  );
};

export default ImportInstructions;
