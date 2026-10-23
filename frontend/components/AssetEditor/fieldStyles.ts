/**
 * 资源编辑器表单字段的统一外观。
 * 直接通过 HeroUI classNames 注入，避免默认 bordered 变体在暗色主题下出现白色边框/焦点环。
 */
export const ASSET_FIELD_CLASS_NAMES = {
  inputWrapper: 'content-editor-hero-field',
  input: 'content-editor-hero-input',
  label: 'content-editor-hero-label',
} as const;

export const ASSET_SELECT_CLASS_NAMES = {
  trigger: 'content-editor-hero-trigger',
  value: 'content-editor-hero-input',
  label: 'content-editor-hero-label',
} as const;
