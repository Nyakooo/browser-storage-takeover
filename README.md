# Browser Storage Inspector

用于检查和编辑当前网站浏览器数据的 Chrome 扩展。

## 功能

- 查看、编辑、添加和删除 Local Storage 与 Session Storage 键值。
- 查看当前页面脚本可访问的 Cookie，并新增、覆盖或删除根路径 Cookie。
- 按数据库和对象仓库浏览 IndexedDB 记录，编辑 JSON 值并保存覆盖。
- 对可解析为 JSON 的 Storage 值提供独立格式化预览。格式化视图只读；切换视图不会改写原始数据。
- 搜索键名、Cookie 名称和 IndexedDB 主键。

Cookie 功能运行在页面上下文中，因此无法查看 HttpOnly Cookie，也无法管理其他 Path 范围的 Cookie。IndexedDB 列表一次显示最多 500 条记录。编辑 IndexedDB 值时使用 JSON 格式；非 JSON 的特殊结构化克隆值不适合通过文本编辑器往返保存。

## 开发与构建

需要 Node.js 20.19 或更新版本，以及 pnpm 12。

```sh
pnpm install
pnpm dev
pnpm build
```

构建完成后，在 Chrome 扩展管理页启用开发者模式，并加载 `packages/shell-chrome/build`。
