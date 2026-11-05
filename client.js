/**
 * Client half of the USD token-cost bundle.
 *
 * The composer's `usage` statistics control is a replaceable
 * `conversation.composer.dock` cell: registering the shipped id and order with a
 * lower priority replaces the shipped pill and its dialog. This module renders
 * that same pill and, inside the dialog, the shipped token rows plus a USD
 * estimate for each billed bucket and the whole log.
 *
 * Tokens come from the `tokenUsage` session projection (provider-reported, the
 * complete durable log) and the priced route from `modelSelection`. Rates are
 * the published DeepSeek prices, priced at the off-peak tier (`TIER`).
 */
window.__ModuleLoader__.load({
	id: '@local/dsh-usd-usage',
	factory(require) {
		const React = require('react');
		const ReactDOM = require('react-dom');
		const h = React.createElement;

		const NS = 'usd-usage';
		const PER_MILLION = 1000000;
		const STYLE_ID = 'dsh-usd-usage/styles';
		const PANEL_GAP = 8;
		const PANEL_MARGIN = 12;
		const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

		/**
		 * DeepSeek rates in USD per 1M tokens, from
		 * https://api-docs.deepseek.com/quick_start/pricing, in both billing tiers.
		 * Off-peak bills at half of peak and covers every hour outside 01:00-04:00
		 * and 06:00-10:00 UTC on weekdays, including whole weekends and Chinese
		 * public holidays. `cacheWrite` follows the cache-miss rate: DeepSeek caches
		 * automatically, so an uncached write is billed as a miss.
		 */
		const RATES = {
			'deepseek-flash': {
				peak: { cacheHit: 0.006, cacheMiss: 0.3, cacheWrite: 0.3, output: 1.2 },
				offPeak: { cacheHit: 0.003, cacheMiss: 0.15, cacheWrite: 0.15, output: 0.6 }
			},
			'deepseek-v4-flash': {
				peak: { cacheHit: 0.006, cacheMiss: 0.3, cacheWrite: 0.3, output: 1.2 },
				offPeak: { cacheHit: 0.003, cacheMiss: 0.15, cacheWrite: 0.15, output: 0.6 }
			},
			'deepseek-v4-flash-vision-exp': {
				peak: { cacheHit: 0.006, cacheMiss: 0.3, cacheWrite: 0.3, output: 1.2 },
				offPeak: { cacheHit: 0.003, cacheMiss: 0.15, cacheWrite: 0.15, output: 0.6 }
			},
			'deepseek-v4-pro': {
				peak: { cacheHit: 0.044, cacheMiss: 1.32, cacheWrite: 1.32, output: 3.96 },
				offPeak: { cacheHit: 0.022, cacheMiss: 0.66, cacheWrite: 0.66, output: 1.98 }
			}
		};
		/** The billing tier every bucket is priced at: 'offPeak' or 'peak'. */
		const TIER = 'offPeak';
		const DEFAULT_MODEL = 'deepseek-flash';

		/** @returns the rate row used for one model id at the active tier, falling back to the default model. */
		function ratesFor(model) {
			return ((model !== null && RATES[model]) || RATES[DEFAULT_MODEL])[TIER];
		}

		/** @returns the model id the caption names for one priced rate row. */
		function pricedModel(model) {
			return model !== null && RATES[model] ? model : DEFAULT_MODEL;
		}

		/** @returns prompt-side billed input tokens: the three disjoint buckets. */
		function billedInput(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}

		/**
		 * Whole-log cache-hit share of prompt-side input.
		 * @returns integer text below 100, one decimal when integer rounding would
		 * read 100, exactly 100 for a full hit, and null when no input was billed.
		 */
		function cacheHitPercent(usage) {
			const denominator = billedInput(usage);
			if (denominator === 0) return null;
			if (usage.cacheReadTokens >= denominator) return '100';
			const percent = (usage.cacheReadTokens / denominator) * 100;
			const rounded = Math.round(percent);
			if (rounded < 100) return String(rounded);
			return String(Math.min(Math.floor(percent * 10) / 10, 99.9));
		}

		/** @returns a non-negative integer token count with locale-owned digit grouping. */
		function group(value) {
			return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		}

		/** @returns a compact token count for the pill, mirroring the shipped formatter. */
		function compact(value) {
			const scaled = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10));
			if (value < 1000) return String(value);
			if (value < PER_MILLION) return scaled(value / 1000) + 'K';
			return scaled(value / PER_MILLION) + 'M';
		}

		/** USD text with one uniform precision per panel. */
		function usdText(value, decimals) {
			return '$' + value.toFixed(decimals);
		}

		/** @returns the USD cost of one bucket. */
		function bucketCost(tokens, rate) {
			return (tokens * rate) / PER_MILLION;
		}

		function DatabaseIcon() {
			return h('svg', {
				viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
				strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true, focusable: 'false'
			},
			h('ellipse', { cx: 8, cy: 3.6, rx: 5.2, ry: 2.1 }),
			h('path', { d: 'M2.8 3.6v8.8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1V3.6' }),
			h('path', { d: 'M2.8 8c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1' }));
		}

		/**
		 * The composer's usage control: shipped pill label plus the same dialog rows,
		 * each priced, closed by the shipped Escape / outside-pointer rules.
		 */
		function UsageCostPill(props) {
			const useProjection = props.useProjection;
			const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
			const usage = useProjection('tokenUsage');
			const selection = useProjection('modelSelection');
			const [open, setOpen] = React.useState(false);
			const [pos, setPos] = React.useState(null);
			const rootRef = React.useRef(null);
			const panelRef = React.useRef(null);

			React.useEffect(() => {
				if (!open) return undefined;
				const close = () => setOpen(false);
				const onKeyDown = (event) => {
					if (event.key === 'Escape') setOpen(false);
				};
				const onPointer = (event) => {
					const target = event.target;
					if (target instanceof Node && (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true)) return;
					setOpen(false);
				};
				document.addEventListener('keydown', onKeyDown);
				document.addEventListener('pointerdown', onPointer, true);
				document.addEventListener('click', onPointer, true);
				return () => {
					document.removeEventListener('keydown', onKeyDown);
					document.removeEventListener('pointerdown', onPointer, true);
					document.removeEventListener('click', onPointer, true);
				};
			}, [open]);

			React.useLayoutEffect(() => {
				if (!open) {
					setPos(null);
					return undefined;
				}
				const place = () => {
					const anchor = rootRef.current?.getBoundingClientRect();
					if (anchor === undefined) return;
					const panel = panelRef.current?.getBoundingClientRect();
					const width = panel?.width ?? 360;
					const height = panel?.height ?? 220;
					const left = Math.max(PANEL_MARGIN, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - PANEL_MARGIN - width));
					let top = anchor.top - PANEL_GAP - height;
					if (top < PANEL_MARGIN) top = Math.min(anchor.bottom + PANEL_GAP, window.innerHeight - PANEL_MARGIN - height);
					setPos({ left: Math.round(left), top: Math.round(top) });
				};
				place();
				const observed = typeof ResizeObserver === 'function' && panelRef.current !== null
					? new ResizeObserver(place)
					: null;
				if (observed !== null && panelRef.current !== null) observed.observe(panelRef.current);
				window.addEventListener('resize', place);
				window.addEventListener('scroll', place, true);
				return () => {
					if (observed !== null) observed.disconnect();
					window.removeEventListener('resize', place);
					window.removeEventListener('scroll', place, true);
				};
			}, [open]);

			if (usage === undefined || usage === null) return null;
			if (billedInput(usage) === 0 && usage.outputTokens === 0) return null;

			const model = selection?.next?.model ?? selection?.lastUsed?.model ?? null;
			const rates = ratesFor(model);
			const total = billedInput(usage) + usage.outputTokens;
			const hit = cacheHitPercent(usage);

			const buckets = [
				{ key: 'uncached', label: t('usage.uncachedInput'), tokens: usage.uncachedInputTokens, cost: bucketCost(usage.uncachedInputTokens, rates.cacheMiss) },
				{ key: 'cached', label: t('usage.cachedInput'), tokens: usage.cacheReadTokens, cost: bucketCost(usage.cacheReadTokens, rates.cacheHit) }
			];
			if (usage.cacheWriteTokens !== 0) {
				buckets.push({ key: 'write', label: t('usage.cacheWrite'), tokens: usage.cacheWriteTokens, cost: bucketCost(usage.cacheWriteTokens, rates.cacheWrite) });
			}
			buckets.push({ key: 'output', label: t('usage.output'), tokens: usage.outputTokens, cost: bucketCost(usage.outputTokens, rates.output) });

			// The total is the sum of the shown rows, so the visible figures add up.
			const rawCost = buckets.reduce((sum, bucket) => sum + bucket.cost, 0);
			const decimals = rawCost > 0 && rawCost < 1 ? 4 : 2;
			const shownCosts = buckets.map((bucket) => Number(bucket.cost.toFixed(decimals)));
			const totalCost = shownCosts.reduce((sum, value) => sum + value, 0);

			const totalText = t('usage.count', { count: compact(total) });
			const hitText = hit === null ? null : t('usage.percent', { percent: hit });
			const ariaLabel = t('usage.aria', { total: totalText, hit: hitText ?? '', cost: usdText(totalCost, decimals) });

			const cells = [];
			if (hit !== null) {
				cells.push(h('dt', { key: 'hit.label' }, t('usage.cacheHit')));
				cells.push(h('dd', { key: 'hit.value' }, t('usage.percent', { percent: hit })));
			}
			buckets.forEach((bucket, index) => {
				cells.push(h('dt', { key: bucket.key + '.label' }, bucket.label));
				cells.push(h('dd', { key: bucket.key + '.tokens', 'data-usd-tokens': bucket.key }, t('usage.count', { count: group(bucket.tokens) })));
				cells.push(h('dd', { key: bucket.key + '.cost', className: 'usdu_money', 'data-usd-cost': bucket.key }, usdText(shownCosts[index], decimals)));
			});

			const panel = h('div', {
				ref: panelRef,
				className: 'usdu_panel',
				role: 'dialog',
				'aria-label': t('usage.title'),
				'data-usd-usage': true,
				style: pos ?? MEASURE_STYLE
			},
			h('div', { className: 'usdu_title' },
				h('span', { className: 'usdu_titleLabel' }, h(DatabaseIcon, null), t('usage.title')),
				h('span', { className: 'usdu_titleValue' }, t('usage.count', { count: group(total) }))),
			h('div', { className: 'usdu_rule', 'aria-hidden': true }),
			h('dl', { className: 'usdu_details', 'data-usd-usage-rows': true }, cells),
			h('div', { className: 'usdu_rule', 'aria-hidden': true }),
			h('dl', { className: 'usdu_total' },
				h('dt', null, t('usage.estimatedCost')),
				h('dd', { 'data-usd-usage-total': true }, usdText(totalCost, decimals))),
			h('p', { className: 'usdu_rates' }, t(TIER === 'offPeak' ? 'usage.rates.offPeak' : 'usage.rates.peak', { model: pricedModel(model) })));

			return h('span', { ref: rootRef, className: 'usdu_anchor', 'data-composer-stat': 'usage' },
				h('button', {
					type: 'button',
					className: 'usdu_pill',
					'aria-haspopup': 'dialog',
					'aria-expanded': open,
					'aria-label': ariaLabel,
					onClick: () => setOpen(!open)
				},
				h(DatabaseIcon, null),
				h('span', { className: 'usdu_label' },
					totalText,
					hitText === null ? null : h('span', { className: 'usdu_sep', 'aria-hidden': true }, '·'),
					hitText === null ? null : hitText)),
				open ? ReactDOM.createPortal(panel, document.body) : null);
		}

		const zh = {
			'usage.title': 'Token 用量',
			'usage.cacheHit': '缓存命中',
			'usage.uncachedInput': '未缓存输入',
			'usage.cachedInput': '缓存读取',
			'usage.cacheWrite': '缓存写入',
			'usage.output': '输出',
			'usage.estimatedCost': '预估费用',
			'usage.rates.peak': '按 {model} 峰值价格计算',
			'usage.rates.offPeak': '按 {model} 低谷价格计算',
			'usage.percent': '{percent}%',
			'usage.count': '{count} tok',
			'usage.aria': '{total} · 缓存命中 {hit} · 预估费用 {cost}'
		};

		const en = {
			'usage.title': 'Token usage',
			'usage.cacheHit': 'Cache hit',
			'usage.uncachedInput': 'Uncached input',
			'usage.cachedInput': 'Cached input',
			'usage.cacheWrite': 'Cache write',
			'usage.output': 'Output',
			'usage.estimatedCost': 'Estimated cost',
			'usage.rates.peak': 'Priced at {model} peak rates',
			'usage.rates.offPeak': 'Priced at {model} off-peak rates',
			'usage.percent': '{percent}%',
			'usage.count': '{count} tok',
			'usage.aria': '{total} · {hit} cache hit · {cost} estimated'
		};

		/** Translate without the framework seat, so a missing dictionary cannot blank the pill. */
		function fallbackTranslate(key, params) {
			let text = en[key] ?? key;
			if (params !== undefined && params !== null) {
				for (const name of Object.keys(params)) text = text.split('{' + name + '}').join(String(params[name]));
			}
			return text;
		}

		const STYLES = [
			'.usdu_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}',
			'.usdu_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}',
			'.usdu_pill svg{flex:none;width:14px;height:14px}',
			'.usdu_pill:hover,.usdu_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
			'.usdu_label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
			'.usdu_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}',
			'.usdu_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(340px,100vw - 24px);max-width:min(460px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}',
			'.usdu_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
			'.usdu_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
			'.usdu_titleLabel svg{flex:none;width:14px;height:14px}',
			'.usdu_titleValue{font-variant-numeric:tabular-nums}',
			'.usdu_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
			'.usdu_details{color:var(--dsw-alias-label-tertiary);display:grid;grid-template-columns:minmax(84px,auto) minmax(0,1fr) minmax(58px,auto);gap:6px 14px;margin:0}',
			'.usdu_details dt{grid-column:1;min-width:0;margin:0}',
			'.usdu_details dd{min-width:0;margin:0;text-align:right;font-variant-numeric:tabular-nums}',
			'.usdu_details .usdu_money{color:var(--dsw-alias-label-secondary)}',
			'.usdu_total{color:var(--dsw-alias-label-primary);display:grid;grid-template-columns:minmax(0,1fr) minmax(58px,auto);gap:6px 14px;margin:0 0 2px;font-weight:500}',
			'.usdu_total dt,.usdu_total dd{min-width:0;margin:0}',
			'.usdu_total dd{text-align:right;font-variant-numeric:tabular-nums}',
			'.usdu_rates{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:8px 0 0}'
		].join('\n');

		/** Mount the plugin stylesheet once for the life of this plugin entry. */
		function installStyles() {
			if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return () => {};
			const tag = document.createElement('style');
			tag.dataset.plugin = '@local/dsh-usd-usage';
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = STYLES;
			document.head.appendChild(tag);
			return () => tag.remove();
		}

		return {
			inject: ['locale', 'slots'],
			/** Exposed for the bundle's own logic check; the Client loader reads only `inject` and `apply`. */
			__internals: { ratesFor, pricedModel, billedInput, cacheHitPercent, group, compact, usdText, bucketCost, dicts: { en, zh }, Component: UsageCostPill },
			apply(ctx) {
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usd-usage: dictionaries');
				ctx.effect(() => installStyles(), 'usd-usage: styles');
				ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
					name: 'conversation.composer.dock',
					id: 'usage',
					order: 1,
					priority: -1,
					locale: NS
				}, UsageCostPill));
			}
		};
	}
});
