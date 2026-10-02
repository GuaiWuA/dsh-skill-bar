# dsh-client-ui-skill-bar（技能栏）

给 DSH Web GUI 加一条技能栏。当前会话里用户可调用的 skill 会变成卡片，能搜、能收藏，点一下或拖一下就把 `/<name>` 写进输入框。

[English](README.md)

![技能栏展开在输入框上方](docs/screenshot.png)

## 行为

位置：

- 输入框左下工具行：一个带技能数量的「技能栏」按钮，点击开合面板。
- 输入框上方：面板本体——搜索框、`全部 / 收藏 / 最近` 三个视图、卡片网格。

一张卡上有什么：显示名（内置映射或你配置的）、字面量 `/<kebab-name>`、skill 自己的描述、标签（仅用户可调 / 有资源文件）、已发送次数。

几个容易踩到的行为，先说清楚：

**施放只写草稿，不发送。** 点卡片是把 `/技能名 ` 追加到草稿末尾，不覆盖你已经写的内容；拖卡片到输入框效果相同。发送由你按回车。这不是保守设计，而是因为宿主注入 skill 正文靠的就是消息里那段字面量 `/name`，插件替你发送会改变"这一步到底注入了什么"的语义。

**次数只认发送。** 施放后卡片会显示"在输入框里，回车发送后才计数"，等那段字面量真的从草稿里消失（也就是发出去了）才 +1。施放后又删掉的不算。10 分钟没发送的待计数标记会自己丢弃。

**拖动不会刷选文字。** 卡片文字设了不可选中，拖动是自定义指针拖拽：浮标跟着指针走，指针进入输入框区域时输入框会高亮，松手才施放。

**面板打开时焦点在搜索框。** 可以直接打字过滤；施放后焦点交还输入框，方便你直接回车。`Enter` 施放高亮项，`↑`/`↓` 移动，`Esc` 关闭。

收藏、最近、已发送次数存在浏览器 `localStorage`。它们只影响这个面板的排序和显示——插件不写任何 skill 文件，也不改变 agent 看到的内容。

## 兼容性

- 面向 DSH Web 表层（桌面应用、`web` profile）。纯客户端插件。
- 运行期只 require `react` 和 `react/jsx-runtime`。图标是仓库里自绘的内联 SVG，不依赖任何内部 SDK 包；没有 CSS 构建，没有打包器。
- 在 DSH `0.2.0-rc.2` 上验证过（Electron 桌面端与 `dsh web`）。
- 用到的宿主接口：`skills/list` Remote、`conversation.input.left` / `conversation.input.dock` 两个 slot、slot props 里的 `inputActions` 和 `useInput`。这四个名字是它唯一的升级风险点；一旦改名，失败是收敛的——面板里显示目录读取错误，不会让输入框坏掉。

## 安装

插件是普通 npm 包，通过 profile 的 Loader patch 挂载，和 DSH 自带的 UI 插件走同一条路径。

### 1. 取代码

```sh
git clone https://github.com/<you>/dsh-skill-bar.git
```

或者 `npm install dsh-client-ui-skill-bar` 后用包标识符挂载。

### 2. 在 profile 里加一行

编辑 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`（Windows 上是 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`）：

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

`name` 要指向**入口文件**，不能给目录。patch 的 insert 名称会被当作 ES module 直接 import，Node 不接受目录导入（`ERR_UNSUPPORTED_DIR_IMPORT`）。绝对路径会由补丁加载器转成 file URL；包能从 profile 解析到时，写包标识符也可以。

### 3. 重启应用

profile 的补丁层在进程启动时合成，所以要重启一次 DSH 应用（或 `dsh web` 进程）。之后每个会话的输入框上方都有技能栏。

如果重启后没出现，去看 `%DSH_HOME%\logs\startup-*.log`：启动期没激活的插件只报一个状态词，完整原因在那个文件里。

## 配置

全部可选，下面括号里是默认值。

| 字段 | 含义 |
|---|---|
| `label`（跟随界面语言） | 按钮文案 |
| `cooldownMs`（900） | 同名技能二次施放的冷却，毫秒 |
| `maxHeight`（420） | 面板高度上限，像素 |
| `labels`（内置映射） | 按 skill 名覆盖显示名 |
| `descriptions`（skill 自带） | 按 skill 名覆盖描述 |

```yaml
      config:
        labels:
          skill-creator: 创建技能
        descriptions:
          skill-creator: 写新 skill 时用
```

## 技能名为什么是英文的

skill 的 `name` 是调用标识，宿主强制 kebab-case ASCII（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）。直接把技能名改成中文会破坏 `/name` 调用，所以"看不懂"只能在展示层解决，优先级是：

1. 你配置的 `config.labels`；
2. 插件内置的映射；
3. 原名。

搜索会同时匹配显示名、技能名和描述。每张卡都保留原始 `/<name>`，因为那才是宿主解析的东西。

## skill 存在哪

面板通过宿主 `skills/list` 读取合并后的目录。本地 skill 是 `SKILL.md`（YAML frontmatter + Markdown 正文，可带 `references/`、`scripts/`，也支持根目录下的扁平 `*.md`），发现根包括：

- `<项目>/.dsh/skills`
- `<项目>/.agents/skills`
- 补丁或设置里的 `customSkillDirs`
- `$DSH_HOME/skills`
- `$DSH_AGENTS_HOME/skills`（默认 `~/.agents/skills`）
- 当前 agent preset 自带的 bundled 目录

改 `SKILL.md` 后下一次目录读取即生效，不用重启。**不要改 `name` 字段**，改了 `/name` 就不再解析。

## 开发

没有构建步骤。DSH 客户端模块系统是把 bundle 当普通 classic script 直接求值的，所以 `lib/client.js` 就是产物，而且提交进仓库。发布需要保证的是这个产物仍然可加载、仍然自包含，这部分做成了显式检查（`build.mjs`）。

```sh
npm install                 # 只为测试装 react / react-dom

npm test                    # 产物检查 + 离线行为测试
node build.mjs --check      # 只跑产物检查

# 对运行中的 GUI 做真实页面验证（Chrome/Edge 需带 --remote-debugging-port=9222）
node browser-check.mjs 9222 'http://127.0.0.1:3080/?token=...' out.png
node capture.mjs 9222 'http://127.0.0.1:3080/?token=...' docs/screenshot.png
```

`npm test` 需要 React，按 `DSH_REACT_DIR` → `$DSH_HOME/profiles/node_modules` → 本包 `node_modules` 的顺序找：

```sh
DSH_REACT_DIR=/path/to/dsh/profiles/node_modules npm test
```

各文件的分工：

| 路径 | 作用 |
|---|---|
| `lib/index.js` | 宿主半边，空 `apply`，只用来占一个 Loader 条目 |
| `lib/client.js` | 浏览器半边，单文件产物，除 React 外不 require 任何东西 |
| `build.mjs` | 产物检查：可解析、模块 id 等于包名、require 白名单、`//#region` 区域完整、`files` 里的文件都在、bundle 已提交 |
| `smoke-test.mjs` | 离线行为测试：假 Cordis 上下文 + `react-dom/server` |
| `browser-check.mjs` | 真实页面验证：CDP 驱动真实输入管线，25 项断言 |
| `capture.mjs` | README 截图 |

`lib/client.js` 内部按 `//#region` 分块（`locale`、`icons`、`storage`、`store`、`match`、`style`、`ui`、`catalog`、`components`、`index`），产物检查会断言这些区域都在。

## 写 DSH 插件时踩过的坑

这些每一条都真实花过时间，写下来省得下一个人再踩。

1. **patch 的 `insert.name` 是 ES module 说明符**，指向入口文件而不是目录，否则 `ERR_UNSUPPORTED_DIR_IMPORT`。
2. **bundle 注册的 `id` 必须等于宿主解析出的包名**。按路径挂载时这个包名取**目录名**，不是你想要的 npm scope；不一致会报 `loaded without registering "<id>" via __ModuleLoader__.load`。
3. **Cordis 4 里 `ctx.config` 不是普通属性**。没有声明式注入时读它会抛 `cannot get property "config" without inject`，要放在 try/catch 里并回退默认值。
4. **带 hooks 的组件不要在渲染中 `return null`**。宿主会把这种形态变成打开面板时的 React hook 状态错误（#310）。拆两层：外层只订阅 open 标志并返回 `null`，正文组件真实挂载和卸载。
5. **不要在 effect 里往本组件订阅的 store 同步发布**，那会落在 React 提交阶段。用 `queueMicrotask` 延后一拍。
6. **用直接写 DOM 的方式做跟随效果会被 React 覆盖**。拖动浮标最初用 `node.style.transform` 改位置，下一次提交就把它抹掉了，表现为浮标出现但不跟手。位置交给 state。
7. **主题变量要先确认存在**。不存在的变量会静默解析成 `unset`，在深色主题下就是浅色背景上的浅色文字。`0.2.0-rc.2` 里没有 `--dsw-alias-bg-l1/l2/l3`，选中态用边框色表达更稳。

## 已知限制

- 只列**用户可调用**的 skill（宿主 `skills/list` 就是这么过滤的），所以 `disable-model-invocation` 的 skill 会出现在这里——这个面板是它少数的入口之一。
- 施放走 `setDraft`，写的是整段草稿，光标落在末尾。
- 目录按会话读取；会话没打开时面板里会显示读取错误。
- 停用或卸载插件后，`localStorage` 里的 `dsh.skillBar.v1.*` 会残留，在意的话手动清。

## 许可

MIT，见 [LICENSE](LICENSE)。
