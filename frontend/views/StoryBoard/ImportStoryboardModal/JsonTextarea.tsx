import React from 'react';
import { Textarea } from '@heroui/react';

interface JsonTextareaProps {
  value: string;
  onChange: (value: string) => void;
}

const JsonTextarea: React.FC<JsonTextareaProps> = ({ value, onChange }) => {
  return (
    <Textarea
      value={value}
      onValueChange={onChange}
      placeholder='粘贴 JSON 内容，例如：
[
  {
    "order": 1,
    "shotType": "远景",
    "description": "场景描述...",
    "hasAction": false,
    "dialogue": "",
    "duration": 3,
    "characters": [],
    "location": "场景地点",
    "emotion": "情绪"
  }
]'
      minRows={12}
      maxRows={20}
      className="font-mono text-sm"
    />
  );
};

export default JsonTextarea;
