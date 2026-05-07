/**
 * 任务处理器统一导出
 * 每个处理器是一个纯函数：接收 input_params，调用 AI，返回 result_data
 */

const handleScriptGeneration = require('./StoryStudio/scriptGeneration');
const handleScriptSplit = require('./StoryStudio/scriptSplit');
const handleCharacterExtraction = require('./StoryBoard/characterExtraction');
const handleImageGeneration = require('./base/imageGeneration');
const handleVideoGeneration = require('./videoGeneration');
const handleSmartParse = require('./admin/smartParse');
const handleFrameGeneration = require('./StoryBoard/frameGeneration');
const handleSingleFrameGeneration = require('./StoryBoard/singleFrameGeneration');
const handleSceneVideoGeneration = require('./StoryBoard/sceneVideoGeneration');
const handleStoryboardGeneration = require('./StoryBoard/storyboardGeneration');
const handleCharacterViewsGeneration = require('./StoryBoard/characterViewsGeneration');
const handleCostumeViewsGeneration = require('./StoryBoard/costumeViewsGeneration');
const handleSceneImageGeneration = require('./StoryBoard/sceneImageGeneration');
const handleSceneElementsExtraction = require('./StoryBoard/sceneElementsExtraction');
const handleSceneElementGeneration = require('./StoryBoard/sceneElementGeneration');
const handleBaseTextModelCall = require('./base/baseTextModelCall');
const handleBatchFrameGeneration = require('./StoryBoard/batchFrameGeneration');
const handleBatchSceneVideoGeneration = require('./StoryBoard/batchSceneVideoGeneration');
const handleSceneStyleAnalysis = require('./StoryBoard/sceneStyleAnalysis');
const handleBaseVideoModelCall = require('./base/baseVideoModelCall');
const handleCameraRunGeneration = require('./StoryBoard/cameraRunGeneration');
const handleSceneStateAnalysis_env = require('./StoryBoard/sceneStateAnalysis');
const handleSaveStoryboards = require('./StoryBoard/saveStoryboards');
const handleSceneStoryboardGeneration = require('./StoryBoard/sceneStoryboardGeneration');
const handleBatchStoryboardGeneration = require('./StoryBoard/batchStoryboardGeneration');
const handleBatchSceneStep = require('./StoryBoard/batchSceneStepHandler');
const handleBatchSaveStoryboards = require('./StoryBoard/batchSaveStoryboards');
const handleSketchPreprocess = require('./StoryBoard/sketchPreprocess');
const handleSketchToImage = require('./StoryBoard/sketchToImage');
const handleBatchSketchFrameGeneration = require('./StoryBoard/batchSketchFrameGeneration');
const { handlePropViewsGeneration, handlePropPromptGeneration, handlePropImageGeneration } = require('./StoryBoard/propGeneration');
const handleConceptBreakdownGeneration = require('./StoryBoard/conceptBreakdownGeneration');
const handleCameraFrameGeneration = require('./StoryBoard/cameraFrameGeneration');
const handleMagicPaintGeneration = require('./StoryBoard/magicPaintGeneration');
const handleHdRepairGeneration = require('./StoryBoard/hdRepairGeneration');
const handleBatchCharacterViewsGeneration = require('./StoryBoard/batchCharacterViewsGeneration');
const handleBatchPromptOptimization = require('./StoryBoard/batchPromptOptimization');
const handleSinglePromptOptimization = require('./StoryBoard/singlePromptOptimization');
const handleStudioComponentsCompose = require('./Studio/studioComponentsCompose');
const handleEnvironmentImageGeneration = require('./Studio/environmentImageGeneration');
const handleBuildingImageGeneration = require('./Studio/buildingImageGeneration');

// AI 助手长任务：规划/执行/观察
const handleAIAssistantPlanner = require('./AIAssistant/planner');
const handleAIAssistantExecutor = require('./AIAssistant/executor');
const handleAIAssistantObserver = require('./AIAssistant/observer');

// 项目管理
const handleCreateProject = require('./Project/createProject');

module.exports = {
  handleScriptGeneration,
  handleScriptSplit,
  handleCharacterExtraction,
  handleImageGeneration,
  handleVideoGeneration,
  handleSmartParse,
  handleFrameGeneration,
  handleSingleFrameGeneration,
  handleSceneVideoGeneration,
  handleStoryboardGeneration,
  handleCharacterViewsGeneration,
  handleCostumeViewsGeneration,
  handleSceneImageGeneration,
  handleSceneElementsExtraction,
  handleSceneElementGeneration,
  handleBaseTextModelCall,
  handleBatchFrameGeneration,
  handleBatchSceneVideoGeneration,
  handleBaseVideoModelCall,
  handleSceneStyleAnalysis,
  handleCameraRunGeneration,
  handleSceneStateAnalysis: handleSceneStateAnalysis_env,
  handleSaveStoryboards,
  handleSceneStoryboardGeneration,
  handleBatchStoryboardGeneration,
  handleBatchSceneStep,
  handleBatchSaveStoryboards,
  handleSketchPreprocess,
  handleSketchToImage,
  handleBatchSketchFrameGeneration,
  handlePropViewsGeneration,
  handlePropPromptGeneration,
  handlePropImageGeneration,
  handleConceptBreakdownGeneration,
  handleCameraFrameGeneration,
  handleMagicPaintGeneration,
  handleHdRepairGeneration,
  handleBatchCharacterViewsGeneration,
  handleBatchPromptOptimization,
  handleSinglePromptOptimization,
  handleStudioComponentsCompose,
  handleEnvironmentImageGeneration,
  handleBuildingImageGeneration,
  handleAIAssistantPlanner,
  handleAIAssistantExecutor,
  handleAIAssistantObserver,
  handleCreateProject
};
