/**
 * 兜底修复 PostCSS 节点缺失来源文件的问题。
 *
 * 背景：`@tailwindcss/postcss` 经 index.css 的 `@config` 加载 HeroUI（Tailwind v3 风格）插件时，
 * 插件用代码构造出的节点（@keyframes 内的声明）不带 `source.input.file`。Vite 的 URL 重写插件
 * 在链路末尾遍历声明并按此判定，于是开发启动时打印
 * “A PostCSS plugin did not pass the `from` option to `postcss.parse`”。
 * 这些声明本身不含 url()，重写行为不受影响，因此这里只把来源补齐回当前 CSS 文件，
 * 不改动任何样式输出，等价于 Vite 期望插件自行 `postcss.parse(css, { from })` 的效果。
 */
function restoreSource() {
  return {
    postcssPlugin: 'postcss-restore-source',
    Once(root) {
      const input = root.source?.input;
      if (!input?.file) return;
      root.walk((node) => {
        if (node.source?.input?.file) return;
        node.source = { ...node.source, input };
      });
    },
  };
}

// 标记为 PostCSS 8 插件工厂：缺此标记时 postcss 会把函数当旧式插件直接调用，导致 Once 钩子不生效
restoreSource.postcss = true;

export default restoreSource;
