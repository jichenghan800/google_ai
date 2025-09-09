import React, { useState, useEffect } from 'react';
import { ImageEditWorkflow } from './ImageEditWorkflow';
import { ImageEditResult } from '../types/index';

// 这是一个使用示例，展示如何在主应用中集成图片编辑功能
export const ImageEditExample: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<ImageEditResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 初始化会话
  useEffect(() => {
    const initSession = async () => {
      try {
        const response = await fetch('/api/sessions/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setSessionId(data.data.sessionId);
        }
      } catch (error) {
        console.error('创建会话失败:', error);
      }
    };

    initSession();
  }, []);

  // 加载编辑历史
  useEffect(() => {
    if (sessionId) {
      loadEditHistory();
    }
  }, [sessionId]);

  const loadEditHistory = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/edit/history/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setEditHistory(data.data || []);
      }
    } catch (error) {
      console.error('加载编辑历史失败:', error);
    }
  };

  // 处理编辑完成
  const handleProcessComplete = (result: ImageEditResult) => {
    setEditHistory(prev => [result, ...prev]);
    setIsProcessing(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 图片编辑</h1>
          <p className="text-gray-600">
            上传图片并描述你想要的修改，AI 将帮你完成图片编辑
          </p>
        </div>

        <ImageEditWorkflow
          sessionId={sessionId}
          onProcessComplete={handleProcessComplete}
          isProcessing={isProcessing}
          editHistory={editHistory}
        />
      </div>
    </div>
  );
};
