// 临时调试脚本，插入到 App.tsx 的 handleTaskCompleted 函数中

const handleTaskCompleted = (task: GenerationTask) => {
  console.log('🎯 handleTaskCompleted called with task:', task);
  console.log('📋 Task result:', task.result);
  console.log('📂 Current sessionData:', sessionData);
  console.log('📚 Current generationHistory length:', sessionData?.generationHistory.length || 0);

  toast.success('图片生成完成！');
  setIsGenerating(false);
  
  if (task.result && sessionData) {
    console.log('✅ Adding to history...');
    
    // Debug: Log the exact object being added
    console.log('🖼️ Image object to add:', JSON.stringify(task.result, null, 2));
    
    // Add to history
    addToHistory(task.result);
    
    // Debug: Log after adding
    setTimeout(() => {
      console.log('📚 After addToHistory, generationHistory length:', sessionData.generationHistory.length);
    }, 100);
    
    // Remove from queued tasks
    const updatedTasks = sessionData.queuedTasks.filter(t => t.taskId !== task.taskId);
    updateQueuedTasks(updatedTasks);
    
    console.log('✅ Task completed processing finished');
  } else {
    console.log('❌ Missing task.result or sessionData');
    console.log('task.result:', task.result);
    console.log('sessionData:', !!sessionData);
  }
};