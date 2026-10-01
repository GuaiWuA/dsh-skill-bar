# dsh-client-ui-skill-bar（技能栏）

给 **DSH**（DeepSeek Harness）Web GUI 加一条游戏式技能栏：把当前会话可用的 skill 列成卡片，
可以搜索、收藏，**点一下或拖一下**就"施放"到输入框（写入字面量 `/<技能名>`）。

专治"技能太多记不住"——不是背目录，而是浏览目录。

[English](README.md)

![技能栏展开在输入框上方](docs/screenshot.png)

## 它做什么

| 位置 | 行为 |
|---|---|
| 输入框工具行 | **技能栏** 按钮 + 可用技能数；点击开合面板 |
| 输入框上方 | 面板：搜索框、`全部 / 收藏 / 最近`、自适应卡片网格 |
| 一张卡 | 显示名（内置或配置）、字面量 `/<kebab-name>`、skill 自己的描述、标签、已发送次数 |

- **点卡片** = 把 `/技能名 ` **追加**到草稿末尾，**绝不覆盖**你已经输入的内容。
- **把卡片拖到输入框**同样施放：拖动时有跟随指针的浮标，输入框高亮为投放目标；
  卡片文字不可选中，所以拖动不会变成刷选文本。
- **计数只认发送，不认插入。** 施放后是"待发送"（卡片会写明），只有这个 token 真的从草稿里消失
  （你回车发出）才 +1。插入后又删掉：不计入。
- 施放方式和手打 `/name` 完全一致：宿主 `dsh-tool-skill` 的 pre-step 监听据此注入 skill 正文。
  **不会自动发送**，回车由你按。
- 打开面板时焦点落在搜索框；施放后把焦点交还输入框。键盘：`Enter` 施放、`↑`/`↓` 移动、`Esc` 关闭。
- 收藏、最近、已发送次数存在浏览器 `localStorage`。它们只影响展示：**插件不写任何 skill 文件，
  也不改变 agent 看到的东西**。

## 兼容性

- DSH Web 表层（桌面应用与 `web` profile），纯客户端插件。
- **运行期契约只有 `react` + `react/jsx-runtime`**——每个 DSH 客户端插件都能依赖的两个模块。
  不依赖任何内部 SDK 包，不需要 CSS 构建，不需要打包器，没有传递依赖。
- 已在 DSH `0.2.0-rc.2` 上验证（Electron 桌面端与 `dsh web`）。
- 它依赖的是官方文档化的 Remote/slot：`skills/list`、`conversation.input.left`、
  `conversation.input.dock`，以及 slot props 里的 `inputActions` / `useInput`。
  将来 DSH 若改名，这是本插件唯一的升级风险；且失败是收敛的——面板里报目录读取错误，
  不会把输入框搞坏。

## 安装

它是一个带 `dsh.client` 声明的普通 npm 包，由 profile 的 Loader patch 挂载，
和官方内置的 UI 插件走同一条路径。

### 1. 取代码

```sh
git clone https://github.com/<you>/dsh-client-ui-skill-bar.git
```

也可以 `npm install dsh-client-ui-skill-bar` 后用包标识符挂载。

### 2. 挂到你的 profile

在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里加一行 `insert`
（Windows 上即 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`）：

```yaml
- insert:
    - id: dsh-client-ui-skill-bar
      name: 'C:\path\to\dsh-client-ui-skill-bar\lib\index.js'
      config:
        label: 技能栏
        cooldownMs: 900
        maxHeight: 420
        labels:
          skill-creator: 创建技能
```

`name` **必须指向入口文件**，不能给目录：patch 的 insert 名称是当作 ES module 直接 import 的，
Node 会拒绝目录导入（`ERR_UNSUPPORTED_DIR_IMPORT`）。绝对路径会被补丁加载器转成 file URL；
当包能从 profile 解析到包名时，直接写包标识符也可以。

### 3. 重启应用

profile 的补丁层是在进程启动时合成的，所以把 DSH 应用（或 `dsh web` 进程）重启一次。
之后每个会话的输入框上方都会出现技能栏。

## 配置

全部可选，下表是默认值。

| 字段 | 默认 | 含义 |
|---|---|---|
| `label` | 跟随语言（"技能栏"/"Skills"） | 按钮文案 |
| `cooldownMs` | `900` | 同名技能二次施放冷却（毫秒） |
| `maxHeight` | `420` | 面板高度预算（像素） |
| `labels` | 内置映射 | 按 skill 名覆盖显示名 |
| `descriptions` | skill 自带 | 按 skill 名覆盖描述 |

```yaml
      config:
        labels:
          skill-creator: 创建技能
        descriptions:
          skill-creator: 写新 skill 时用
```

## 为什么技能名长这样

skill 的 `name` 是调用标识，必须是 kebab-case ASCII
（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`），所以"能看懂"是**展示层**的事：

1. profile 补丁里的 `config.labels`；
2. 插件内置映射；
3. 原名兜底。

搜索同时匹配显示名、技能名**和**描述。每张卡都保留原始 `/<name>`，因为那才是宿主解析的东西。

## skill 存在哪

面板通过宿主 `skills/list` Remote 读取合并后的目录。本地 skill 是 `SKILL.md`
（YAML frontmatter + Markdown 正文，可带 `references/`、`scripts/`，也支持扁平 `*.md`），
发现根包括：

- `<项目>/.dsh/skills`
- `<项目>/.agents/skills`
- 补丁/设置里的 `customSkillDirs`
- `$DSH_HOME/skills`
- `$DSH_AGENTS_HOME/skills`（默认 `~/.agents/skills`）
- 当前 agent preset 自带的 bundled 目录

改 `SKILL.md` 后下一次目录读取即生效，不用重启。**不要改 `name` 字段**——`/name` 调用会失效。

## 开发

没有构建步骤：`lib/client.js` 就是产物，而且被提交进仓库，因为 DSH 客户端模块系统是把它
当普通 classic script 直接求值的。发布真正需要的是"产物闸门"，也就是 `build.mjs`。

```sh
npm install                 # react + react-dom，仅供测试

npm test                    # 产物闸门 + 离线行为测试
node build.mjs --check      # 只跑产物闸门

# 对运行中的 GUI 做真实页面验证（需要 Chrome/Edge 带 --remote-debugging-port=9222）
node browser-check.mjs 9222 'http://127.0.0.1:3080/?token=...' out.png
node capture.mjs 9222 'http://127.0.0.1:3080/?token=...' docs/screenshot.png
```

`npm test` 需要 React，按顺序从 `DSH_REACT_DIR`、`$DSH_HOME/profiles/node_modules`、
本包自己的 `node_modules` 里找：

```sh
DSH_REACT_DIR=/path/to/dsh/profiles/node_modules npm test
```

### 目录结构

| 路径 | 作用 |
|---|---|
| `lib/index.js` | 宿主半边——空 `apply`，只用来占一个 Loader 条目 |
| `lib/client.js` | 浏览器半边：单文件产物，除 React 外不 require 任何东西 |
| `build.mjs` | 产物闸门：可解析、模块 id 正确、require 白名单、区域完整 |
| `smoke-test.mjs` | 离线行为测试（假 Cordis 上下文 + `react-dom/server`） |
| `browser-check.mjs` | 走 CDP 的真实页面验证，用真实输入管线驱动 |
| `capture.mjs` | README 截图工具 |

`lib/client.js` 用 `//#region` 分块（`locale`、`icons`、`storage`、`store`、`match`、
`style`、`ui`、`catalog`、`components`、`index`），产物闸门会断言它们都在。

### 写 DSH 插件的坑（每条都真实踩过）

1. **patch 的 `insert.name` 是 ES module 说明符**，指向入口文件而不是目录
   （否则 `ERR_UNSUPPORTED_DIR_IMPORT`）。
2. **bundle 注册的 `id` 必须等于宿主解析出的包名。** 按路径挂载时包名取**目录名**，
   不是你想要的 npm scope；不一致会报
   `loaded without registering "<id>" via __ModuleLoader__.load`。
3. **Cordis 4 里 `ctx.config` 不是普通属性。** 没有声明式注入时读取会抛
   `cannot get property "config" without inject`；放在 try/catch 里并回退默认值。
4. **带 hooks 的组件不要在渲染中 `return null`。** 宿主会把这种形态变成打开面板时的
   React hook 状态错误。拆两层：外层只订阅 open 并返回 `null`，正文组件真实挂载/卸载。
5. **不要在 effect 里往"本组件订阅的 store"同步发布**，那会落在 React 提交阶段；
   用 `queueMicrotask` 延后一拍。
6. **主题变量要先验证存在。** 不存在的变量会静默变成 `unset`，在 dark 下就是浅色上的浅色文字。
7. **`0.2.0-rc.2` 里没有 `--dsw-alias-bg-l1/l2/l3`**；选中态用边框色表达，不要靠背景填充。

## 已知边界

- 只列**用户可调用**的 skill（宿主 `skills/list` 就是这么过滤的）；因此
  `disable-model-invocation` 的 skill 会出现在这里——这个面板正是它少数的入口之一。
- 施放是整段写草稿（`setDraft`），所以光标落在末尾；不会自动发送。
- 目录按会话读取；会话未打开时面板里会显示读取错误。
- 停用/卸载插件后 `localStorage` 里的 `dsh.skillBar.v1.*` 会残留（在意的话手动清）。

## 许可

MIT，见 [LICENSE](LICENSE)。
