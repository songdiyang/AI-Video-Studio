export default {
  // 键顺序即执行顺序：restore-source 必须排在最后，用于补齐 @tailwindcss/postcss
  // （经 index.css 的 @config 加载 HeroUI 插件）注入的无来源节点，
  // 否则 Vite 的 URL 重写插件会在开发启动时打印 `from` option 警告。
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
    './postcss-plugins/restore-source.js': {},
  },
}
