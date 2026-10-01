// The `id` must equal the package name the Host's client-module scanner
// resolved for this row. A plugin mounted by file path takes its name from the
// package directory (`dsh-client-ui-skill-bar`), and the boot graph looks the
// module up under exactly that id.
// The alias keeps the shipped bundle contract (`_ModuleLoader__.load`) while
// surviving an evaluation scope where the window binding is not visible.
function __skillBarLoad(registration) {
	if (typeof _ModuleLoader__ !== "undefined") _ModuleLoader__.load(registration);
	else globalThis.__ModuleLoader__.load(registration);
}
__skillBarLoad({
	id: "dsh-client-ui-skill-bar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		require("@deepseek-ai/cordis");

		//#region design notes
		/**
		 * A game-style skill bar over the shipped session skill catalog.
		 *
		 * Data: `ctx.remote.skills.list({ sessionId })` — the same Remote the
		 * shipped `/` skill source reads. It returns exactly the user-invocable
		 * skills of that Session, so this panel never invents an entry.
		 *
		 * Cast: a cast inserts the literal `/<name> ` token into the composer
		 * draft through the session-scoped `inputActions` slot prop, which is the
		 * identical gesture as typing `/name` — the Host's pre-step listener then
		 * injects the skill body. Nothing is sent: the user confirms with Enter.
		 *
		 * Progress (favorites, recency, cast counts, cooldown) is browser-local
		 * localStorage state; it is presentation only and never affects the Host.
		 */
		//#endregion

		//#region lib/icons.js
		/**
		 * Icons owned by this plugin.
		 *
		 * The runtime dependency surface is exactly `react` (plus the Cordis context
		 * the shell hands the plugin body): the client module graph is the only thing
		 * every installation is guaranteed to have. A published plugin must not
		 * couple itself to an internal SDK package or to one icon set's export names,
		 * so the four icons are drawn here on the shared 16x16 grid with
		 * `currentColor` strokes.
		 *
		 * Each helper returns props for `el("svg", …)`, including `children` as
		 * `{ type, props }` descriptors that this bundle's `el()` unwraps.
		 */
		/** Stroke width that matches the shipped regular-weight icon set. */
		const ICON_STROKE = 1.4;
		/**
		 * Build one stroked icon on the shared 16x16 grid.
		 * @param size - rendered edge length in pixels.
		 * @param shapes - `[tag, props]` pairs.
		 * @param rest - extra props merged last.
		 * @returns props for `el("svg", …)`.
		 */
		function iconProps(size, shapes, rest) {
			return {
				viewBox: "0 0 16 16",
				width: size,
				height: size,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: ICON_STROKE,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				focusable: "false",
				...rest,
				children: shapes.map(([tag, props]) => ({
					type: tag,
					props
				}))
			};
		}
		/** A skill card: a list plus a spark, the plugin's identity mark. */
		function IconSkill(props) {
			const { size = 16, ...rest } = props ?? {};
			return el("svg", iconProps(size, [
				["path", { d: "M2.6 4.2h5.2M2.6 8h3.4M2.6 11.8h4.2" }],
				["path", { d: "M11.4 8.4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" }]
			], rest));
		}
		/** A magnifier for the catalog search field. */
		function IconSearch(props) {
			const { size = 16, ...rest } = props ?? {};
			return el("svg", iconProps(size, [
				["circle", {
					cx: 7,
					cy: 7,
					r: 4.1
				}],
				["path", { d: "M10.2 10.2L14 14" }]
			], rest));
		}
		/** A downward chevron for the refresh control. */
		function IconChevronDown(props) {
			const { size = 16, ...rest } = props ?? {};
			return el("svg", iconProps(size, [["path", { d: "M4 6.4L8 10.2l4-3.8" }]], rest));
		}
		/** A cross for the panel's close control. */
		function IconClose(props) {
			const { size = 16, ...rest } = props ?? {};
			return el("svg", iconProps(size, [["path", { d: "M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" }]], rest));
		}
		//#endregion

		//#region lib/locale.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "skillBar";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"trigger.label": "技能栏",
			"trigger.open": "打开技能栏",
			"trigger.close": "收起技能栏",
			"trigger.count": "可用技能 {count} 个",
			"panel.title": "技能栏",
			"panel.subtitle": "共 {count} 个可用技能 · 点一张卡即施放到输入框",
			"panel.search": "搜索技能名或描述",
			"panel.empty": "这个会话没有可用技能。挂载 dsh-skill-filesystem 并放入 SKILL.md 后即可出现。",
			"panel.noMatch": "没有匹配“{query}”的技能",
			"panel.noFavorite": "还没有收藏。点卡片右上角的 ☆ 收藏。",
			"panel.noRecent": "本机还没有施放记录。",
			"panel.refresh": "刷新技能目录",
			"panel.close": "关闭",
			"panel.footer": "Enter 施放 · ↑↓ 选择 · Esc 关闭",
			"panel.error": "技能目录读取失败：{message}",
			"panel.loading": "正在读取技能目录…",
			"tab.all": "全部",
			"tab.favorite": "收藏",
			"tab.recent": "最近",
			"card.favoriteAdd": "收藏 {name}",
			"card.favoriteRemove": "取消收藏 {name}",
			"card.userOnly": "仅用户可调",
			"card.hasPath": "有资源文件",
			"card.casts": "已发送 {count} 次",
			"card.pending": "在输入框里，回车发送后才计数",
			"card.cast": "施放 {name}",
			"card.cooldown": "冷却 {ms} 毫秒",
			"card.drag": "可拖到输入框（Ctrl/⌘+拖 = 只插入不自动跳转）",
			"card.displayName": "显示名 {label}",
			"card.skillId": "技能名 {name}",
			"toast.pending": "已放入输入框：{name} · 回车发送后才计入次数",
			"toast.cast": "已发送 {name}",
			"hint.drag": "拖到输入框",
			"hint.dragActive": "松手放入输入框",
			"notice.replace": "已替换原输入内容",
			"hint.empty": "输入框为空时才可插入",
			"hint.noSession": "先打开一个会话再使用技能栏"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger.label": "Skills",
			"trigger.open": "Open the skill bar",
			"trigger.close": "Collapse the skill bar",
			"trigger.count": "{count} skills available",
			"panel.title": "Skill bar",
			"panel.subtitle": "{count} usable skills · click a card to cast it into the composer",
			"panel.search": "Search skill name or description",
			"panel.empty": "This session has no user-invocable skills. Mount dsh-skill-filesystem with a SKILL.md and they appear here.",
			"panel.noMatch": "No skill matches \"{query}\"",
			"panel.noFavorite": "No favorites yet. Use the ☆ on a card to keep one.",
			"panel.noRecent": "No casts recorded on this browser yet.",
			"panel.refresh": "Reload the skill catalog",
			"panel.close": "Close",
			"panel.footer": "Enter cast · ↑↓ move · Esc close",
			"panel.error": "Skill catalog failed: {message}",
			"panel.loading": "Loading the skill catalog…",
			"tab.all": "All",
			"tab.favorite": "Favorites",
			"tab.recent": "Recent",
			"card.favoriteAdd": "Favorite {name}",
			"card.favoriteRemove": "Unfavorite {name}",
			"card.userOnly": "user-only",
			"card.hasPath": "has resources",
			"card.casts": "sent {count} times",
			"card.pending": "sitting in the composer; counted only after you send",
			"card.cast": "Cast {name}",
			"card.cooldown": "cooldown {ms} ms",
			"card.drag": "Drag onto the composer (Ctrl/⌘+drag inserts without focusing it)",
			"card.displayName": "shown as {label}",
			"card.skillId": "skill name {name}",
			"toast.pending": "Put {name} in the composer · counted after you send it",
			"toast.cast": "Sent {name}",
			"hint.drag": "drag to the composer",
			"hint.dragActive": "release to insert",
			"notice.replace": "Replaced the previous draft",
			"hint.empty": "only castable into an empty composer",
			"hint.noSession": "Open a session before using the skill bar"
		};
		//#endregion

		//#region lib/storage.js
		/** localStorage keys, versioned so a shape change never misreads old data. */
		const KEY_FAVORITES = "dsh.skillBar.v1.favorites";
		const KEY_RECENT = "dsh.skillBar.v1.recent";
		const KEY_CASTS = "dsh.skillBar.v1.casts";
		const MAX_RECENT = 12;
		/** Read one JSON value; any failure degrades to the fallback, never throws. */
		function readJSON(key, fallback) {
			try {
				if (typeof localStorage === "undefined") return fallback;
				const raw = localStorage.getItem(key);
				if (raw === null) return fallback;
				const parsed = JSON.parse(raw);
				return parsed === null || typeof parsed !== "object" ? fallback : parsed;
			} catch {
				return fallback;
			}
		}
		/** Write one JSON value; a blocked localStorage is not an error. */
		function writeJSON(key, value) {
			try {
				if (typeof localStorage === "undefined") return;
				localStorage.setItem(key, JSON.stringify(value));
			} catch {}
		}
		/** Load the persisted progress bundle. */
		function loadProgress() {
			const favoritesRaw = readJSON(KEY_FAVORITES, {});
			const recentRaw = readJSON(KEY_RECENT, []);
			const castsRaw = readJSON(KEY_CASTS, {});
			const favorites = [];
			for (const name of Object.keys(favoritesRaw)) if (favoritesRaw[name] === true) favorites.push(name);
			const recent = Array.isArray(recentRaw) ? recentRaw.filter((v) => typeof v === "string") : [];
			const casts = {};
			for (const name of Object.keys(castsRaw)) {
				const value = castsRaw[name];
				if (typeof value === "number" && Number.isFinite(value) && value >= 0) casts[name] = Math.floor(value);
			}
			return { favorites, recent, casts };
		}
		/** Persist the progress bundle, dropping entries for skills that are gone. */
		function saveProgress(progress) {
			const favorites = {};
			for (const name of progress.favorites) favorites[name] = true;
			writeJSON(KEY_FAVORITES, favorites);
			writeJSON(KEY_RECENT, progress.recent.slice(0, MAX_RECENT));
			writeJSON(KEY_CASTS, progress.casts);
		}
		//#endregion

		//#region lib/store.js
		/**
		 * Minimal external store: one frozen snapshot object per change, so a
		 * `useSyncExternalStore` read is referentially stable between changes.
		 * @param initial - first snapshot value.
		 * @returns the read/subscribe/update triple.
		 */
		function createStore(initial) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				get: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set(next) {
					snapshot = next;
					for (const listener of [...listeners]) try {
						listener();
					} catch (error) {
						console.error("[skill-bar] store listener failed:", error);
					}
				}
			};
		}
		//#endregion

		//#region lib/match.js
		/** Lowercase, and collapse whitespace so a query never misses on spacing. */
		function normalize(text) {
			return String(text).toLowerCase().trim();
		}
		/** Ordered-subsequence match, the same shape the `/` menu uses. */
		function subsequence(name, query) {
			let index = 0;
			for (const character of name) {
				if (character === query[index]) index += 1;
				if (index === query.length) return true;
			}
			return false;
		}
		/**
		 * Score one skill against a query. `null` means no match.
		 * Name beats description; a prefix beats a scattered subsequence.
		 * @param skill - catalog entry.
		 * @param query - raw user query.
		 * @param recentRank - index in the recent list, `-1` when absent.
		 * @param favorite - whether the skill is favorited.
		 * @returns the score, or null.
		 */
		function scoreSkill(skill, query, recentRank, favorite) {
			let score = 0;
			if (favorite) score += 40;
			if (recentRank >= 0) score += Math.max(0, 30 - recentRank * 3);
			if (query === "") return score;
			const name = normalize(skill.name);
			const description = normalize(skill.description ?? "");
			if (name === query) return score + 1000;
			if (name.startsWith(query)) score += 300;
			else if (name.includes(query)) score += 200;
			else if (subsequence(name, query)) score += 120;
			else if (description.includes(query)) score += 60;
			else return null;
			return score;
		}
		/**
		 * A skill's name is its invocation id and must stay kebab-case ASCII, so
		 * readability comes from a display layer instead: a per-skill label from the
		 * plugin config, or one of the built-in Chinese labels below, falling back to
		 * the raw name. The English description stays available as the hover title.
		 */
		const BUILTIN_LABELS = {
			"skill-creator": "创建技能",
			"find-skills": "找技能",
			"sap-extension-creator": "SAP 扩展生成",
			"diagnose-windows-sandbox-acl": "诊断沙箱权限",
			"high-coverage-fanout": "高覆盖扇出"
		};
		/**
		 * Resolve one skill's display strings.
		 * @param skill - catalog entry.
		 * @param display - plugin-level display overrides.
		 * @returns the label plus the description body.
		 */
		function displayOf(skill, display) {
			const configured = display?.labels?.[skill.name];
			const description = display?.descriptions?.[skill.name];
			const label = typeof configured === "string" && configured.trim() !== "" ? configured.trim() : BUILTIN_LABELS[skill.name] ?? skill.name;
			const detail = typeof description === "string" && description.trim() !== "" ? description.trim() : skill.description === void 0 || skill.description === "" ? skill.whenToUse ?? "" : skill.description;
			return {
				label,
				detail
			};
		}
		/**
		 * Rank a catalog for the panel: score, then name, then host order.
		 * @param skills - catalog entries in host order.
		 * @param query - raw query.
		 * @param progress - persisted progress.
		 * @returns the filtered, scored entries.
		 */
		function rankSkills(skills, query, progress) {
			const favoriteSet = new Set(progress.favorites);
			const recentRank = new Map();
			progress.recent.forEach((name, index) => {
				if (!recentRank.has(name)) recentRank.set(name, index);
			});
			const needle = normalize(query);
			const scored = [];
			skills.forEach((skill, order) => {
				const score = scoreSkill(skill, needle, recentRank.has(skill.name) ? recentRank.get(skill.name) : -1, favoriteSet.has(skill.name));
				if (score === null) return;
				scored.push({
					skill,
					score,
					order
				});
			});
			scored.sort((left, right) => right.score - left.score || (left.skill.name < right.skill.name ? -1 : left.skill.name > right.skill.name ? 1 : 0) || left.order - right.order);
			return scored;
		}
		//#endregion

		//#region lib/style.js
		/**
		 * Shared style fragments over the DS theme's real tokens.
		 *
		 * Verified in the running page (dark theme): `--dsw-alias-bg-base`,
		 * `--dsw-alias-border-l1`, `--dsw-alias-border-l2`, `--dsw-alias-label-*`,
		 * `--dsw-alias-markdown-code-block`, `--dsw-radius-*`,
		 * `--dsw-alias-state-business-primary` resolve; `--dsw-alias-bg-l1/l2/l3` do
		 * NOT exist, so a "hover fill" built on them silently falls back to a light
		 * static neutral and paints light-on-light in dark mode. Selection and hover
		 * are therefore carried by border color, not by a background fill.
		 */
		const style = {
			mono: {
				fontFamily: "var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
			},
			surface: {
				boxSizing: "border-box",
				border: "0.5px solid var(--dsw-alias-border-l1)",
				borderRadius: "var(--dsw-radius-xl)",
				background: "var(--dsw-alias-bg-base)",
				boxShadow: "0 8px 24px rgb(0 0 0 / 12%)"
			},
			/** Fill used by a control's hover/pressed state; a real token in both themes. */
			fill: "var(--dsw-alias-markdown-code-block)",
			labelPrimary: { color: "var(--dsw-alias-label-primary)" },
			labelSecondary: { color: "var(--dsw-alias-label-secondary)" },
			labelTertiary: { color: "var(--dsw-alias-label-tertiary)" },
			business: { color: "var(--dsw-alias-state-business-primary)" },
			warn: { color: "var(--dsw-alias-state-warn-label)" },
			error: { color: "var(--dsw-alias-state-error-primary)" },
			iconButton: {
				boxSizing: "border-box",
				background: "transparent",
				border: "0.5px solid transparent",
				borderRadius: "var(--dsw-radius-md)",
				color: "var(--dsw-alias-label-tertiary)",
				cursor: "pointer",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				height: "24px",
				padding: "0 6px",
				font: "inherit"
			},
			trigger: {
				boxSizing: "border-box",
				background: "transparent",
				border: "0.5px solid transparent",
				borderRadius: "var(--dsw-radius-md)",
				color: "var(--dsw-alias-label-tertiary)",
				cursor: "pointer",
				display: "inline-flex",
				alignItems: "center",
				gap: "4px",
				height: "24px",
				padding: "0 6px",
				font: "inherit",
				fontSize: "var(--dsh-content-font-size-secondary, 13px)",
				transition: "color .1s, background-color .1s"
			}
		};
		/** Focus ring shared by every interactive cell. */
		const focusRing = {
			outline: "var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary)",
			outlineOffset: "2px"
		};
		//#endregion

		//#region lib/ui.js
		/** Whether a value is an `{ type, props }` element descriptor. */
		function isDescriptor(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.type !== "undefined" && "props" in value;
		}
		/** Terse `createElement` wrapper for the element types this surface uses. */
		function el(type, props, ...children) {
			const next = {
				...props
			};
			const key = next.key;
			delete next.key;
			if (children.length === 1) next.children = children[0];
			else if (children.length > 1) next.children = children;
			// Icon helpers describe their shapes as `{ type, props }`; unwrap them so
			// React only ever sees strings, native tags, components, and fragments.
			if (Array.isArray(next.children)) {
				next.children = next.children.map((child) => isDescriptor(child) ? el(child.type, child.props) : child);
			}
			// `key` never rides the props spread: React 18 warns about it and the
			// runtime takes it as the third positional argument instead.
			return key === void 0 ? (0, react_jsx_runtime.jsx)(type, next) : (0, react_jsx_runtime.jsx)(type, next, key);
		}
		/** One control button with hover/focus treatment. */
		function ControlButton(props) {
			const [hover, setHover] = (0, react.useState)(false);
			const [focus, setFocus] = (0, react.useState)(false);
			return el("button", {
				type: "button",
				title: props.title,
				"aria-label": props.label,
				"data-role": props["data-role"],
				disabled: props.disabled === true,
				onClick: props.onClick,
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				onFocus: () => setFocus(true),
				onBlur: () => setFocus(false),
				style: {
					...style.iconButton,
					...(hover || focus ? {
						color: "var(--dsw-alias-label-primary)",
						background: style.fill
					} : {}),
					...(focus ? focusRing : {}),
					...(props.disabled === true ? {
						opacity: 0.45,
						cursor: "default"
					} : {}),
					...(props.style ?? {})
				},
				children: props.children
			});
		}
		/** A mastery pip row: filled pips follow lifetime casts on this browser. */
		function MasteryPips({ casts, label }) {
			const filled = casts <= 0 ? 0 : casts === 1 ? 1 : casts === 2 ? 2 : 3;
			const pips = [];
			for (let i = 0; i < 3; i += 1) pips.push(el("span", {
				key: i,
				"aria-hidden": true,
				style: {
					width: "4px",
					height: "4px",
					borderRadius: "50%",
					background: i < filled ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-caption)",
					display: "inline-block"
				}
			}));
			return el("span", {
				title: label,
				"aria-label": label,
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "2px",
					flex: "none"
				},
				children: pips
			});
		}
		/** One catalog card. Text selection is off so a drag never turns into a text sweep. */
		function SkillCard(props) {
			const { entry, active, favorite, casts, pending, cooldown, t, onCast, onToggleFavorite, onPointerDown, dragging } = props;
			const [hover, setHover] = (0, react.useState)(false);
			const skill = entry.skill;
			const display = displayOf(skill, props.display);
			const tags = [];
			if (skill.modelInvocable === false) tags.push({
				key: "userOnly",
				text: t("card.userOnly")
			});
			if (skill.path !== void 0) tags.push({
				key: "path",
				text: t("card.hasPath")
			});
			const footer = [];
			if (!pending && casts > 0) footer.push(el("span", {
				key: "casts",
				style: {
					...style.labelTertiary,
					fontSize: "11px",
					lineHeight: "16px"
				},
				children: t("card.casts", { count: String(casts) })
			}));
			return el("div", {
				role: "option",
				"aria-selected": active,
				"data-skill": skill.name,
				"data-pending": pending || void 0,
				"data-dragging": dragging || void 0,
				title: `${t("card.skillId", { name: skill.name })} · ${t("card.drag")}\n${skill.description ?? skill.name}`,
				onMouseEnter: () => {
					setHover(true);
					if (props.onHover !== void 0) props.onHover();
				},
				onMouseLeave: () => setHover(false),
				onClick: () => onCast(),
				onPointerDown: (event) => {
					if (event.button !== 0) return;
					onPointerDown(event);
				},
				style: {
					boxSizing: "border-box",
					display: "flex",
					flexDirection: "column",
					gap: "6px",
					padding: "10px 12px",
					minWidth: 0,
					border: active || hover ? "0.5px solid var(--dsw-alias-state-business-primary)" : "0.5px solid var(--dsw-alias-border-l1)",
					borderRadius: "var(--dsw-radius-lg)",
					background: hover || active ? style.fill : "transparent",
					cursor: dragging ? "grabbing" : "grab",
					// A pointer drag must never be interpreted as a text sweep by the
					// browser: without this the page selected text while the card followed
					// nothing at all.
					userSelect: "none",
					WebkitUserSelect: "none",
					touchAction: "none",
					opacity: pending ? 1 : cooldown ? 0.55 : dragging ? 0.6 : 1,
					transition: "background-color .12s, border-color .12s"
				},
				children: [
					el("div", {
						key: "head",
						style: {
							display: "flex",
							alignItems: "center",
							gap: "6px",
							minWidth: 0
						},
						children: [
							el("span", {
								key: "icon",
								style: {
									display: "inline-flex",
									...style.labelTertiary,
									flex: "none"
								},
								children: el(IconSkill, { size: 14 })
							}),
							el("span", {
								key: "label",
								style: {
									...style.labelPrimary,
									fontSize: "var(--dsh-content-font-size-secondary, 13px)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
									minWidth: 0,
									flex: "auto"
								},
								children: display.label
							}),
							el(MasteryPips, {
								key: "pips",
								casts,
								label: t("card.casts", { count: String(casts) })
							}),
							el("button", {
								key: "star",
								type: "button",
								"aria-label": favorite ? t("card.favoriteRemove", { name: skill.name }) : t("card.favoriteAdd", { name: skill.name }),
								title: favorite ? t("card.favoriteRemove", { name: skill.name }) : t("card.favoriteAdd", { name: skill.name }),
								onClick: (event) => {
									event.stopPropagation();
									onToggleFavorite();
								},
								onPointerDown: (event) => event.stopPropagation(),
								style: {
									...style.iconButton,
									flex: "none",
									height: "20px",
									padding: "0 2px",
									fontSize: "13px",
									lineHeight: "1",
									color: favorite ? "var(--dsw-alias-state-warn-label)" : "var(--dsw-alias-label-tertiary)"
								},
								children: favorite ? "★" : "☆"
							})
						]
					}),
					el("div", {
						key: "id",
						style: {
							...style.mono,
							...style.labelTertiary,
							fontSize: "11px",
							lineHeight: "15px",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: `/${skill.name}`
					}),
					el("div", {
						key: "desc",
						style: {
							...style.labelSecondary,
							fontSize: "12px",
							lineHeight: "17px",
							display: "-webkit-box",
							WebkitLineClamp: 2,
							WebkitBoxOrient: "vertical",
							overflow: "hidden",
							overflowWrap: "anywhere",
							minHeight: "17px"
						},
						children: display.detail
					}),
					tags.length === 0 && footer.length === 0 && !pending ? null : el("div", {
						key: "tags",
						style: {
							display: "flex",
							alignItems: "center",
							gap: "6px",
							flexWrap: "wrap"
						},
						children: [
							pending ? el("span", {
								key: "pending",
								style: {
									...style.business,
									fontSize: "11px",
									lineHeight: "16px"
								},
								children: t("card.pending")
							}) : null,
							...tags.map((tag) => el("span", {
								key: tag.key,
								style: {
									...style.labelTertiary,
									fontSize: "11px",
									lineHeight: "16px",
									border: "0.5px solid var(--dsw-alias-border-l2)",
									borderRadius: "var(--dsw-radius-sm)",
									padding: "0 4px"
								},
								children: tag.text
							})),
							...footer
						]
					})
				]
			});
		}
		//#endregion

		//#region lib/catalog.js
		/**
		 * Per-Session catalogue controller: one Remote read, one panel state, one
		 * progress bundle. The slot `inject` callbacks read through this map, so a
		 * React render never opens a second fetch.
		 */
		const controllers = /* @__PURE__ */ new Map();
		/** Resolve (and lazily create) the controller for one Session. */
		function controllerFor(sessionId) {
			const existing = controllers.get(sessionId);
			if (existing !== void 0) return existing;
			const created = {
				sessionId,
				panel: createStore({
					open: false,
					query: "",
					tab: "all",
					activeIndex: 0
				}),
				catalog: createStore({
					phase: "idle",
					skills: [],
					error: null
				}),
				progress: loadProgress(),
				progressStore: null,
				/** Casts inserted into this Session's draft that have not been sent yet. */
				pending: [],
				pendingStore: null,
				cooldownUntil: /* @__PURE__ */ new Map(),
				inFlight: null,
				disposed: false
			};
			created.progressStore = createStore(created.progress);
			created.pendingStore = createStore(created.pending);
			controllers.set(sessionId, created);
			return created;
		}
		/** Publish a new progress bundle and persist it. */
		function commitProgress(controller, next) {
			controller.progress = next;
			controller.progressStore.set(next);
			saveProgress(next);
		}
		/** Append one name to the recent list, newest first and deduplicated. */
		function rememberCast(controller, name) {
			const recent = [name, ...controller.progress.recent.filter((entry) => entry !== name)].slice(0, MAX_RECENT);
			const casts = {
				...controller.progress.casts,
				[name]: (controller.progress.casts[name] ?? 0) + 1
			};
			commitProgress(controller, {
				...controller.progress,
				recent,
				casts
			});
		}
		/** Toggle one favorite. */
		function toggleFavorite(controller, name) {
			const set = new Set(controller.progress.favorites);
			if (set.has(name)) set.delete(name);
			else set.add(name);
			commitProgress(controller, {
				...controller.progress,
				favorites: [...set]
			});
		}
		/** Whether a name is cooling down right now. */
		function inCooldown(controller, name) {
			const until = controller.cooldownUntil.get(name);
			return until !== void 0 && until > Date.now();
		}
		/** Whether one skill is blocked by its per-name cooldown, for a card's title. */
		function cooldownRemaining(controller, name) {
			const until = controller.cooldownUntil.get(name);
			return until === void 0 ? 0 : Math.max(0, until - Date.now());
		}
		/**
		 * Read the Session's user-invocable skill catalog once. Concurrent callers
		 * share the in-flight promise; a settled failure keeps the previous list.
		 * @param controller - per-Session controller.
		 * @param fetch - the Remote read supplied by the plugin body.
		 * @returns the shared in-flight promise.
		 */
		function reload(controller, fetch) {
			if (controller.disposed) return Promise.resolve();
			if (controller.inFlight !== null) return controller.inFlight;
			const previous = controller.catalog.get();
			controller.catalog.set({
				phase: previous.skills.length === 0 ? "loading" : "refreshing",
				skills: previous.skills,
				error: null
			});
			const promise = fetch(controller.sessionId).then((result) => {
				if (controller.disposed) return;
				if (!result.ok) {
					controller.catalog.set({
						phase: "error",
						skills: controller.catalog.get().skills,
						error: `${result.error.code}: ${result.error.message}`
					});
					return;
				}
				controller.catalog.set({
					phase: "ready",
					skills: Array.isArray(result.value?.skills) ? result.value.skills : [],
					error: null
				});
			}).catch((error) => {
				if (controller.disposed) return;
				controller.catalog.set({
					phase: "error",
					skills: controller.catalog.get().skills,
					error: String(error?.message ?? error)
				});
			}).then(() => {
				controller.inFlight = null;
			});
			controller.inFlight = promise;
			return promise;
		}
		/**
		 * Force a fresh read: drop the in-flight guard so a settled failure can be
		 * retried immediately.
		 * @param controller - per-Session controller.
		 * @param fetch - the Remote read supplied by the plugin body.
		 * @returns the in-flight promise.
		 */
		function invalidate(controller, fetch) {
			controller.inFlight = null;
			return reload(controller, fetch);
		}
		//#endregion

		//#region lib/components.js
		/** How long a draft token waits for its send before the pending mark is dropped. */
		const PENDING_TTL_MS = 10 * 60 * 1000;
		/**
		 * Build the next draft for a cast. The panel must never destroy what the user
		 * already typed: the token is appended, separated by a space when the draft
		 * does not already end in whitespace.
		 * @param current - current draft text.
		 * @param name - exact skill name.
		 * @returns the token, and the draft to write.
		 */
		function composeDraft(current, name) {
			const token = `/${name} `;
			if (current === "") return {
				token,
				next: token
			};
			const separator = /\s$/.test(current) ? "" : " ";
			return {
				token,
				next: `${current}${separator}${token}`
			};
		}
		/**
		 * Put one skill's token in the composer. This records NOTHING: the send
		 * confirmation owns the count, so inserting and then deleting never counts.
		 * @param controller - per-Session controller.
		 * @param inputActions - session input facade from the slot props.
		 * @param inputState - current published input state, when available.
		 * @param name - exact skill name.
		 * @param cooldownMs - per-name cast cooldown.
		 * @returns the inserted token, or null when the draft refused it.
		 */
		function castSkill(controller, inputActions, inputState, name, cooldownMs) {
			if (inCooldown(controller, name)) return null;
			if (inputActions === void 0 || typeof inputActions.setDraft !== "function") return null;
			const current = typeof inputState?.draft === "string" ? inputState.draft : null;
			const composed = current === null ? {
				token: `/${name} `,
				next: `/${name} `,
				replaced: true
			} : {
				...composeDraft(current, name),
				replaced: false
			};
			try {
				inputActions.setDraft(composed.next);
			} catch (error) {
				console.error("[skill-bar] cast failed:", error);
				return null;
			}
			controller.cooldownUntil.set(name, Date.now() + cooldownMs);
			controller.pending = [...controller.pending.filter((entry) => entry.name !== name), {
				name,
				token: composed.token,
				at: Date.now()
			}];
			controller.pendingStore.set(controller.pending);
			return composed.token;
		}
		/**
		 * Confirm every pending cast whose token no longer sits in the draft, which is
		 * what "the user sent it" looks like from the browser side.
		 *
		 * This is called from an effect, and it notifies stores those same components
		 * subscribe to: publishing synchronously would re-render a component during
		 * React's own commit and trip the hook-order guard (React #310). The write is
		 * therefore deferred one microtask, after the commit completes.
		 * @param controller - per-Session controller.
		 * @param draft - current published draft, when the host publishes one.
		 */
		function confirmSent(controller, draft) {
			if (typeof draft !== "string" || controller.pending.length === 0) return;
			queueMicrotask(() => {
				if (controller.disposed) return;
				const sent = controller.pending.filter((entry) => !draft.includes(entry.token.trim()));
				if (sent.length === 0) return;
				controller.pending = controller.pending.filter((entry) => !sent.some((done) => done.name === entry.name));
				let progress = controller.progress;
				for (const entry of sent) {
					const recent = [entry.name, ...progress.recent.filter((name) => name !== entry.name)].slice(0, MAX_RECENT);
					progress = {
						...progress,
						recent,
						casts: {
							...progress.casts,
							[entry.name]: (progress.casts[entry.name] ?? 0) + 1
						}
					};
				}
				commitProgress(controller, progress);
				controller.pendingStore.set(controller.pending);
			});
		}
		/** Drop expired pending marks, again outside the committing render. */
		function prunePending(controller) {
			queueMicrotask(() => {
				if (controller.disposed) return;
				const now = Date.now();
				const next = controller.pending.filter((entry) => now - entry.at < PENDING_TTL_MS);
				if (next.length !== controller.pending.length) {
					controller.pending = next;
					controller.pendingStore.set(next);
				}
			});
		}
		/** Whether a pending name is still waiting for its send. */
		function isPending(controller, name) {
			return controller.pending.some((entry) => entry.name === name);
		}
		/**
		 * Session input is the send witness. A hidden side effect can only run inside
		 * an effect (never during a render), so this is the one call both components
		 * make from their draft-keyed effect.
		 * @param controller - per-Session controller.
		 * @param draft - current published draft, when the host publishes one.
		 */
		function confirmCasts(controller, draft) {
			confirmSent(controller, draft);
		}
		/**
		 * The composer trigger: skill icon, label, and the catalog size.
		 * Rendered into `conversation.input.left` beside the shipped controls.
		 */
		function SkillBarTrigger(props) {
			const { t, controller, cooldownMs, label } = props;
			const panel = (0, react.useSyncExternalStore)(controller.panel.subscribe, controller.panel.get, controller.panel.get);
			const catalog = (0, react.useSyncExternalStore)(controller.catalog.subscribe, controller.catalog.get, controller.catalog.get);
			const progress = (0, react.useSyncExternalStore)(controller.progressStore.subscribe, controller.progressStore.get, controller.progressStore.get);
			const inputState = typeof props.useInput === "function" ? props.useInput((state) => state) : void 0;
			(0, react.useEffect)(() => {
				confirmCasts(controller, inputState?.draft);
			}, [inputState?.draft]);
			const [hover, setHover] = (0, react.useState)(false);
			const [focus, setFocus] = (0, react.useState)(false);
			const count = catalog.skills.length;
			const favorites = progress.favorites.length;
			const open = panel.open;
			const toggle = () => {
				controller.panel.set({
					...controller.panel.get(),
					open: !controller.panel.get().open
				});
			};
			const title = open ? t("trigger.close") : `${t("trigger.open")} · ${t("trigger.count", { count: String(count) })}`;
			return el("button", {
				type: "button",
				"data-plugin": "@deepseek-ai/dsh-client-ui-skill-bar",
				"data-role": "skill-bar-trigger",
				title,
				"aria-label": title,
				"aria-expanded": open,
				onClick: toggle,
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				onFocus: () => setFocus(true),
				onBlur: () => setFocus(false),
				style: {
					...style.trigger,
					...(hover || open ? {
						color: "var(--dsw-alias-label-primary)",
						background: style.fill
					} : {}),
					...(focus ? focusRing : {})
				},
				children: [
					el(IconSkill, {
						key: "icon",
						size: 14
					}),
					el("span", {
						key: "label",
						children: label
					}),
					count === 0 ? null : el("span", {
						key: "count",
						style: {
							...style.labelTertiary,
							fontSize: "11px",
							lineHeight: "16px",
							border: "0.5px solid var(--dsw-alias-border-l2)",
							borderRadius: "999px",
							padding: "0 5px"
						},
						children: favorites > 0 ? `${count}/${favorites}` : String(count)
					})
				]
			});
		}
		/**
		 * The panel: search, three views, the catalog grid, and the cast log.
		 * Rendered into `conversation.input.dock`, directly above the composer.
		 *
		 * Split in two on purpose. The outer seat always renders and owns only the
		 * open flag; the body mounts fresh while the panel is open, so every body
		 * hook belongs to a real mount/unmount instead of an early return inside a
		 * component whose hooks continue to run (that shape is what the GUI's host
		 * turned into a hook-state error at open time).
		 */
		function SkillBarPanel(props) {
			const { controller } = props;
			const panel = (0, react.useSyncExternalStore)(controller.panel.subscribe, controller.panel.get, controller.panel.get);
			if (!panel.open) return null;
			return el(SkillBarPanelBody, props);
		}
		/** Vertical space the panel spends outside its list: padding, header, tabs, footer, gaps. */
		const LIST_CHROME = 136;
		function SkillBarPanelBody(props) {
			const { t, controller, inputActions, cooldownMs, maxHeight, onRefresh, display } = props;
			const panel = (0, react.useSyncExternalStore)(controller.panel.subscribe, controller.panel.get, controller.panel.get);
			const catalog = (0, react.useSyncExternalStore)(controller.catalog.subscribe, controller.catalog.get, controller.catalog.get);
			const progress = (0, react.useSyncExternalStore)(controller.progressStore.subscribe, controller.progressStore.get, controller.progressStore.get);
			const pending = (0, react.useSyncExternalStore)(controller.pendingStore.subscribe, controller.pendingStore.get, controller.pendingStore.get);
			const inputState = typeof props.useInput === "function" ? props.useInput((state) => state) : void 0;
			const [, forceTick] = (0, react.useState)(0);
			const [drag, setDrag] = (0, react.useState)({ name: null, token: null, over: false, moved: false, x: 0, y: 0 });
			const [toast, setToast] = (0, react.useState)(null);
			const ref = (0, react.useRef)(null);
			const ghostRef = (0, react.useRef)(null);
			const composerRef = (0, react.useRef)(null);
			const gestureRef = (0, react.useRef)(null);
			/** Set by a completed drag so the trailing click is not handled twice. */
			const consumedClickRef = (0, react.useRef)(false);
			const open = panel.open;
			// Focus lands in the search box when the panel opens, and only then: a
			// re-render must not pull the caret out of the composer, and a cast hands
			// focus back so the user can read the token and press Enter.
			const searchRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const timer = setTimeout(() => {
					const node = searchRef.current;
					if (node !== null) node.focus();
				}, 0);
				return () => clearTimeout(timer);
			}, [open]);
			// The count belongs to the SEND, not to the insert: a pending token that has
			// left the draft was submitted, and only then does it count.
			(0, react.useEffect)(() => {
				confirmCasts(controller, inputState?.draft);
			}, [inputState?.draft]);
			(0, react.useEffect)(() => {
				prunePending(controller);
			}, []);
			(0, react.useEffect)(() => {
				if (toast === null) return void 0;
				const timer = setTimeout(() => setToast(null), 2600);
				return () => clearTimeout(timer);
			}, [toast]);
			/**
			 * Insert one skill and report what happened. `settle` mirrors the composer
			 * after the write so the draft mirror and the running session agree.
			 */
			const cast = (name, settle) => {
				const token = castSkill(controller, inputActions, inputState, name, cooldownMs);
				if (token === null) return void 0;
				setPanel({
					activeIndex: 0
				});
				setToast({
					kind: "pending",
					name
				});
				const remaining = cooldownRemaining(controller, name);
				const timer = setTimeout(() => forceTick((value) => value + 1), Math.max(remaining, 60) + 40);
				if (settle === true) {
					const node = composerRef.current;
					if (node !== null) node.focus();
				}
				return timer;
			};
			const entries = rankSkills(catalog.skills, panel.query, progress);
			const favoriteSet = new Set(progress.favorites);
			const recentSet = new Set(progress.recent);
			const visible = entries.filter((entry) => panel.tab === "all" ? true : panel.tab === "favorite" ? favoriteSet.has(entry.skill.name) : recentSet.has(entry.skill.name));
			const activeIndex = visible.length === 0 ? -1 : Math.min(Math.max(panel.activeIndex, 0), visible.length - 1);
			const setPanel = (patch) => {
				controller.panel.set({
					...controller.panel.get(),
					...patch
				});
			};
			/**
			 * Panel keyboard contract, shared by the section and the search box (which
			 * is what owns focus while the panel is open).
			 */
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					setPanel({
						open: false
					});
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					if (visible.length === 0) return;
					event.preventDefault();
					const step = event.key === "ArrowDown" ? 1 : -1;
					setPanel({
						activeIndex: (activeIndex + step + visible.length) % visible.length
					});
					return;
				}
				if (event.key === "Enter" && !event.shiftKey && activeIndex >= 0) {
					event.preventDefault();
					cast(visible[activeIndex].skill.name);
				}
			};
			/** Whether the pointer currently sits over the composer card. */
			const pointerOverComposer = (event) => {
				const node = composerRef.current;
				if (node !== null) {
					const rect = node.getBoundingClientRect();
					if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return true;
				}
				// Fallback: the composer card may not carry a marker attribute, so the
				// editor itself is the second opinion on where a drop lands.
				const editor = typeof document === "undefined" ? null : document.querySelector('[contenteditable="true"]');
				if (editor === null) return false;
				const rect = editor.getBoundingClientRect();
				return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
			};
			/**
			 * Start a pointer drag. A plain click is left to `onClick`; the drag only
			 * takes over once the pointer actually moves, which is what makes the card
			 * follow the cursor instead of sweeping text.
			 */
			const beginDrag = (event, name) => {
				const session = {
					name,
					startX: event.clientX,
					startY: event.clientY,
					moved: false,
					over: false
				};
				gestureRef.current = session;
				const onMove = (moveEvent) => {
					const dx = moveEvent.clientX - session.startX;
					const dy = moveEvent.clientY - session.startY;
					if (!session.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
					if (!session.moved) session.moved = true;
					const over = pointerOverComposer(moveEvent);
					// The ghost's position rides React state, not a direct DOM write: a
					// mutation of `node.style` is undone by the next commit, so the ghost
					// would appear but never follow the pointer.
					setDrag({
						name,
						token: `/${name}`,
						over,
						moved: true,
						x: moveEvent.clientX,
						y: moveEvent.clientY
					});
				};
				const cleanup = () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					window.removeEventListener("pointercancel", onCancel);
					gestureRef.current = null;
					setDrag({
						name: null,
						token: null,
						over: false,
						moved: false,
						x: 0,
						y: 0
					});
					// The click that follows a real drag must not double-handle the card.
					setTimeout(() => {
						consumedClickRef.current = false;
					}, 0);
				};
				const onUp = (upEvent) => {
					const dropped = session.moved && pointerOverComposer(upEvent);
					consumedClickRef.current = session.moved;
					cleanup();
					if (dropped) cast(name, true);
				};
				const onCancel = () => {
					consumedClickRef.current = session.moved;
					cleanup();
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
				window.addEventListener("pointercancel", onCancel);
			};
			const tabButton = (id, label) => {
				const active = panel.tab === id;
				return el("button", {
					key: id,
					type: "button",
					"aria-pressed": active,
					onClick: () => setPanel({
						tab: id,
						activeIndex: 0
					}),
					style: {
						...style.iconButton,
						fontSize: "12px",
						height: "24px",
						padding: "0 8px",
						color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-tertiary)",
						background: active ? style.fill : "transparent",
						border: active ? "0.5px solid var(--dsw-alias-border-l2)" : "0.5px solid transparent"
					},
					children: label
				});
			};
			const body = () => {
				if (catalog.phase === "loading" && catalog.skills.length === 0) return el("div", {
					style: {
						...style.labelTertiary,
						padding: "18px 4px",
						fontSize: "13px"
					},
					children: t("panel.loading")
				});
				if (catalog.error !== null && catalog.skills.length === 0) return el("div", {
					style: {
						...style.error,
						padding: "14px 4px",
						fontSize: "13px",
						overflowWrap: "anywhere"
					},
					children: t("panel.error", { message: catalog.error })
				});
				if (catalog.skills.length === 0) return el("div", {
					style: {
						...style.labelTertiary,
						padding: "18px 4px",
						fontSize: "13px",
						overflowWrap: "anywhere"
					},
					children: t("panel.empty")
				});
				if (visible.length === 0) return el("div", {
					style: {
						...style.labelTertiary,
						padding: "18px 4px",
						fontSize: "13px"
					},
					children: panel.query !== "" ? t("panel.noMatch", { query: panel.query }) : panel.tab === "favorite" ? t("panel.noFavorite") : t("panel.noRecent")
				});
				return el("div", {
					role: "listbox",
					"aria-label": t("panel.title"),
					style: {
						display: "grid",
						// `minmax(0, 1fr)` and a zero min-width keep cards inside the
						// panel: a plain `1fr` track is floored by the card's own
						// min-content and overflows the scroll box sideways.
						gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
						gap: "8px",
						minWidth: 0,
						width: "100%",
						boxSizing: "border-box"
					},
					children: visible.map((entry, index) => el(SkillCard, {
						key: entry.skill.name,
						entry,
						active: index === activeIndex,
						favorite: favoriteSet.has(entry.skill.name),
						casts: progress.casts[entry.skill.name] ?? 0,
						pending: pending.some((item) => item.name === entry.skill.name),
						cooldown: inCooldown(controller, entry.skill.name),
						dragging: drag.name === entry.skill.name && drag.moved,
						display,
						t,
						onCast: () => {
							if (consumedClickRef.current) {
								consumedClickRef.current = false;
								return;
							}
							cast(entry.skill.name);
						},
						onPointerDown: (event) => beginDrag(event, entry.skill.name),
						onToggleFavorite: () => toggleFavorite(controller, entry.skill.name),
						onHover: () => setPanel({
							activeIndex: index
						})
					}))
				});
			};
			// `composerRef` is resolved from the panel's own root: the composer card is
			// the nearest ancestor that owns an editor, which is what the drop targets.
			(0, react.useEffect)(() => {
				const node = ref.current;
				if (node === null) {
					composerRef.current = null;
					return;
				}
				composerRef.current = node.closest("[data-dsh-input-zone]") ?? node.parentElement ?? null;
			}, [open]);
			return el(react.Fragment, {
				children: [
					drag.moved ? el("div", {
						key: "dragbackdrop",
						"data-role": "skill-bar-drag-layer",
						style: {
							position: "fixed",
							inset: 0,
							zIndex: 900,
							pointerEvents: "none",
							background: drag.over ? "rgb(0 0 0 / 10%)" : "transparent"
						}
					}) : null,
					el("section", {
				key: "panel",
				ref,
				tabIndex: -1,
				"data-plugin": "@deepseek-ai/dsh-client-ui-skill-bar",
				"data-role": "skill-bar-panel",
				"data-drag-over": drag.over || void 0,
				"aria-label": t("panel.title"),
				onKeyDown,
				style: {
					...style.surface,
					display: "flex",
					flexDirection: "column",
					// The panel is a flex child of the composer stack; without refusing to
					// shrink, that stack compresses it below the height its list just got.
					flex: "0 0 auto",
					gap: "10px",
					padding: "12px",
					margin: "0 auto 8px",
					width: "100%",
					maxWidth: "920px",
					maxHeight: `${maxHeight}px`,
					overflow: "hidden",
					outline: drag.over ? "1.5px solid var(--dsw-alias-state-business-primary)" : "none"
				},
				children: [
					el("header", {
						key: "head",
						style: {
							display: "flex",
							alignItems: "center",
							gap: "8px",
							flexWrap: "wrap"
						},
						children: [
							el("span", {
								key: "icon",
								style: {
									display: "inline-flex",
									...style.business,
									flex: "none"
								},
								children: el(IconSkill, { size: 16 })
							}),
							el("span", {
								key: "title",
								style: {
									...style.labelPrimary,
									fontSize: "13px",
									fontWeight: 500,
									flex: "none"
								},
								children: t("panel.title")
							}),
							el("span", {
								key: "subtitle",
								style: {
									...style.labelTertiary,
									fontSize: "12px"
								},
								children: t("panel.subtitle", { count: String(catalog.skills.length) })
							}),
							el("span", {
								key: "search",
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: "4px",
									marginLeft: "auto",
									border: "0.5px solid var(--dsw-alias-border-l1)",
									borderRadius: "var(--dsw-radius-md)",
									padding: "0 6px",
									height: "26px",
									...style.labelTertiary
								},
								children: [
									el(IconSearch, {
										key: "searchIcon",
										size: 13
									}),
									el("input", {
										key: "searchInput",
										ref: searchRef,
										type: "search",
										value: panel.query,
										placeholder: t("panel.search"),
										"aria-label": t("panel.search"),
										onChange: (event) => setPanel({
											query: event.target.value,
											activeIndex: 0
										}),
										onKeyDown: onKeyDown,
										style: {
											background: "transparent",
											border: 0,
											outline: "none",
											color: "var(--dsw-alias-label-primary)",
											font: "inherit",
											fontSize: "12px",
											width: "168px"
										}
									})
								]
							}),
							el(ControlButton, {
								key: "refresh",
								label: t("panel.refresh"),
								title: t("panel.refresh"),
								onClick: () => {
									onRefresh();
								},
								children: el(IconChevronDown, { size: 14 })
							}),
							el(ControlButton, {
								key: "close",
								label: t("panel.close"),
								title: t("panel.close"),
								onClick: () => setPanel({
									open: false
								}),
								"data-role": "skill-bar-close",
								children: el(IconClose, { size: 14 })
							})
						]
					}),
					el("div", {
						key: "tabs",
						style: {
							display: "flex",
							alignItems: "center",
							gap: "6px"
						},
						children: [
							tabButton("all", t("tab.all")),
							tabButton("favorite", `${t("tab.favorite")}${progress.favorites.length === 0 ? "" : ` ${progress.favorites.length}`}`),
							tabButton("recent", t("tab.recent"))
						]
					}),
					el("div", {
						key: "body",
						style: {
							// The panel is a flex child of the composer stack, and a nested
							// flexible scroll box kept collapsing to its minimum there. A cap
							// (`maxHeight`) rather than a fixed height lets a short catalog size
							// the panel naturally while a long one scrolls. LIST_CHROME is the
							// header + tabs + footer + padding + gaps.
							flex: "0 1 auto",
							minHeight: "0",
							maxHeight: `${Math.max(120, maxHeight - LIST_CHROME)}px`,
							overflowY: "auto",
							overflowX: "hidden",
							minWidth: 0,
							paddingRight: "2px"
						},
						children: body()
					}),
					el("footer", {
						key: "foot",
						style: {
							...style.labelTertiary,
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "11px",
							borderTop: "0.5px solid var(--dsw-alias-border-l2)",
							paddingTop: "8px"
						},
						children: [
							el("span", {
								key: "hint",
								children: toast !== null ? t("hint.dragActive") : drag.moved ? t("hint.drag") : t("panel.footer")
							}),
							toast === null ? null : el("span", {
								key: "toast",
								style: style.business,
								children: t("toast.pending", { name: toast.name })
							}),
							catalog.error === null || catalog.skills.length === 0 ? null : el("span", {
								key: "err",
								style: style.warn,
								children: t("panel.error", { message: catalog.error })
							})
						]
					})
				]
					}),
					drag.moved ? el("div", {
						key: "ghost",
						ref: ghostRef,
						"data-role": "skill-bar-ghost",
						style: {
							position: "fixed",
							left: 0,
							top: 0,
							// React owns the position, so it survives the commit that a plain
							// `node.style` write would be overwritten by.
							transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)`,
							zIndex: 1000,
							pointerEvents: "none",
							display: "inline-flex",
							alignItems: "center",
							gap: "6px",
							maxWidth: "320px",
							overflow: "hidden",
							whiteSpace: "nowrap",
							textOverflow: "ellipsis",
							padding: "6px 10px",
							border: "0.5px solid var(--dsw-alias-state-business-primary)",
							borderRadius: "var(--dsw-radius-md)",
							background: "var(--dsw-alias-bg-base)",
							boxShadow: "0 8px 24px rgb(0 0 0 / 28%)",
							...style.mono,
							...style.labelPrimary,
							fontSize: "12px"
						},
						children: drag.token ?? ""
					}) : null
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the slot registry, locale, sessions, and the skill Remote. */
		const inject = [
			"slots",
			"locale",
			"sessions",
			"remote",
			"remote.skills"
		];
		/**
		 * Client plugin body: dictionaries, the per-Session catalogue, and the two
		 * slots that make the skill bar (trigger in the composer tool row, panel in
		 * the input dock above it).
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			// The shell reports a non-active fiber as a bare state word, so a thrown
			// error inside apply would surface only as "failed". Re-reporting it keeps
			// the real message in the page console.
			try {
				applyBody(ctx);
			} catch (error) {
				console.error("[skill-bar] apply failed:", error);
				throw error;
			}
		}
		/**
		 * Real plugin body.
		 * @param ctx - client root context.
		 */
		function applyBody(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "skill-bar: dictionaries");
			const t = ctx.locale.bind(NS);
			const skills = ctx.remote.skills;
			const sessions = ctx.sessions;
			// Cordis 4 resolves plugin config through the Loader's own accessor; a
			// context without it must fall back to defaults rather than throw.
			let rawConfig = {};
			try {
				rawConfig = ctx.config ?? {};
			} catch {
				rawConfig = {};
			}
			const rawLabel = rawConfig.label;
			const rawCooldown = rawConfig.cooldownMs;
			const rawMaxHeight = rawConfig.maxHeight;
			const label = typeof rawLabel === "string" && rawLabel.trim() !== "" ? rawLabel.trim() : t("trigger.label");
			const cooldownMs = typeof rawCooldown === "number" && Number.isFinite(rawCooldown) ? Math.max(0, rawCooldown) : 900;
			const maxHeight = typeof rawMaxHeight === "number" && Number.isFinite(rawMaxHeight) ? Math.max(160, rawMaxHeight) : 420;
			/** Per-skill readability overrides: `labels` renames, `descriptions` rewrites. */
			const display = {
				labels: rawConfig.labels !== null && typeof rawConfig.labels === "object" ? rawConfig.labels : {},
				descriptions: rawConfig.descriptions !== null && typeof rawConfig.descriptions === "object" ? rawConfig.descriptions : {}
			};
			/**
			 * One Remote read for one Session, mirroring the shipped `/` skill
			 * source's preconditions: the Session must be retained and open.
			 * @param sessionId - Session identity.
			 * @param signal - caller lifetime.
			 * @returns the Remote result, or a local failure object.
			 */
			const fetchCatalog = (sessionId, signal) => {
				if (sessions.binding(sessionId) === void 0) return Promise.resolve({
					ok: false,
					error: {
						code: "skill-bar/no-session",
						message: `session "${sessionId}" is not retained`
					}
				});
				return sessions.using(sessionId, {
					source: "skillBarCatalog",
					signal
				}, async (reference) => {
					const state = reference.binding.session.getSnapshot();
					if (state.openState !== "open") return {
						ok: false,
						error: {
							code: "skill-bar/closed",
							message: `session "${sessionId}" is not open`
						}
					};
					return skills.list({ sessionId }, signal);
				});
			};
			/**
			 * Resolve the controller for one Session, reading the catalogue on first use.
			 * @param sessionId - Session identity.
			 * @returns the per-Session controller.
			 */
			const ensure = (sessionId) => {
				const controller = controllerFor(sessionId);
				if (controller.catalog.get().phase === "idle") reload(controller, fetchCatalog);
				return controller;
			};
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: NS,
				order: 5,
				label: () => label,
				locale: NS,
				inject: (sessionId) => ({
					t,
					controller: ensure(sessionId),
					cooldownMs,
					label
				})
			}, SkillBarTrigger));
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: NS,
				order: 5,
				label: () => label,
				locale: NS,
				inject: (sessionId) => ({
					t,
					controller: ensure(sessionId),
					cooldownMs,
					maxHeight,
					display,
					onRefresh: () => {
						invalidate(controllerFor(sessionId), fetchCatalog);
					}
				})
			}, SkillBarPanel));
			ctx.effect(() => () => {
				for (const controller of controllers.values()) {
					controller.disposed = true;
					controller.inFlight = null;
				}
				controllers.clear();
			}, "skill-bar: controllers");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
