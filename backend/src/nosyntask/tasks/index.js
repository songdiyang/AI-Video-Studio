/**
 * 任务处理器统一导出
 * 每个处理器是一个纯函数：接收 input_params，调用 AI，返回 result_data
 */

const handleScriptGeneration = require('./StoryStudio/scriptGeneration');
const handleScriptSplit = require('./StoryStudio/scriptSplit');
const handleCharacterExtraction = require('./StoryBoard/characterExtraction');
const handleSceneExtraction = require('./StoryBoard/sceneExtraction');
const handleImageGeneration = require('./base/imageGeneration');
const handleVideoGeneration = require('./videoGeneration');
const handleSmartParse = require('./admin/smartParse');
const handleFrameGeneration = require('./StoryBoard/frameGeneration');
const handleSingleFrameGeneration = require('./StoryBoard/singleFrameGeneration');
const handleSceneVideoGeneration = require('./StoryBoard/sceneVideoGeneration');
const handleStoryboardGeneration = require('./StoryBoard/storyboardGeneration');
const handleCharacterViewsGeneration = require('./StoryBoard/characterViewsGeneration');
const handleSceneImageGeneration = require('./StoryBoard/sceneImageGeneration');
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
const { handlePropPromptGeneration, handlePropImageGeneration } = require('./StoryBoard/propGeneration');
const handleConceptBreakdownGeneration = require('./StoryBoard/conceptBreakdownGeneration');
const handleCameraFrameGeneration = require('./StoryBoard/cameraFrameGeneration');
const handleMagicPaintGeneration = require('./StoryBoard/magicPaintGeneration');
const handleBatchPromptOptimization = require('./StoryBoard/batchPromptOptimization');
const handleSinglePromptOptimization = require('./StoryBoard/singlePromptOptimization');

module.exports = {
  handleScriptGeneration,
  handleScriptSplit,
  handleCharacterExtraction,
  handleSceneExtraction,
  handleImageGeneration,
  handleVideoGeneration,
  handleSmartParse,
  handleFrameGeneration,
  handleSingleFrameGeneration,
  handleSceneVideoGeneration,
  handleStoryboardGeneration,
  handleCharacterViewsGeneration,
  handleSceneImageGeneration,
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
  handlePropPromptGeneration,
  handlePropImageGeneration,
  handleConceptBreakdownGeneration,
  handleCameraFrameGeneration,
  handleMagicPaintGeneration,
  handleBatchPromptOptimization,
  handleSinglePromptOptimization
};
