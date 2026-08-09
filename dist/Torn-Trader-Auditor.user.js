// ==UserScript==
// @name         Torn Trader Auditor
// @namespace    ShinNamo
// @version      1.0.0
// @description  Auditor y analizador de precios para Torn
// @author       ShinNamo
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @connect      api.torn.com
// ==/UserScript==
(function() {
	//#region src/config.js
	var CONFIG = {
		TORN_API_BASE: "https://api.torn.com/v2",
		W3B_API_BASE: "https://weav3r.dev/api",
		AUDIT_INTERVAL: 36e5,
		SAMPLE_PERCENTAGE: .1,
		EWMA_ALPHA: .2,
		GREEN_THRESHOLD: .03,
		YELLOW_THRESHOLD: .1,
		HISTORY_DAYS: 180,
		SEARCH_MIN_LENGTH: 2
	};
	//#endregion
	//#region src/api/torn.js
	var TornAPI = class {
		constructor(apiKey) {
			this.apiKey = apiKey;
			this.requestQueue = Promise.resolve();
			this.minRequestInterval = 1e3;
			this.lastRequestTime = 0;
			this.maxRetries = 4;
		}
		sleep(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}
		async waitForRateLimit() {
			const elapsed = Date.now() - this.lastRequestTime;
			const remaining = this.minRequestInterval - elapsed;
			if (remaining > 0) await this.sleep(remaining);
			this.lastRequestTime = Date.now();
		}
		enqueueRequest(requestFn) {
			const execute = this.requestQueue.then(requestFn);
			this.requestQueue = execute.catch(() => {});
			return execute;
		}
		async request(path) {
			return this.enqueueRequest(async () => {
				let lastError = null;
				for (let retry = 0; retry <= this.maxRetries; retry++) {
					await this.waitForRateLimit();
					try {
						return await this.performRequest(path);
					} catch (error) {
						lastError = error;
						if (error?.code !== "RATE_LIMIT") throw error;
						if (retry >= this.maxRetries) throw new Error("Too many requests");
						const delay = 1e3 * Math.pow(2, retry);
						console.warn(`[TornAPI] Rate limit. Reintentando en ${delay}ms (intento ${retry + 1}/${this.maxRetries})`);
						await this.sleep(delay);
					}
				}
				throw lastError || /* @__PURE__ */ new Error("Torn API error");
			});
		}
		performRequest(path) {
			const separator = path.includes("?") ? "&" : "?";
			const url = `${CONFIG.TORN_API_BASE}${path}${separator}key=${encodeURIComponent(this.apiKey)}`;
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "GET",
					url,
					timeout: 3e4,
					onload: (response) => {
						let data = null;
						try {
							data = JSON.parse(response.responseText);
						} catch {
							reject(/* @__PURE__ */ new Error("Respuesta inválida de Torn API"));
							return;
						}
						if (data?.error?.error === "Too many requests") {
							const error = /* @__PURE__ */ new Error("Too many requests");
							error.code = "RATE_LIMIT";
							reject(error);
							return;
						}
						if (response.status < 200 || response.status >= 300) {
							reject(/* @__PURE__ */ new Error(`Torn API HTTP ${response.status}`));
							return;
						}
						if (data?.error) {
							const error = new Error(data.error.error || "Torn API error");
							if (data.error.error === "Incorrect ID") error.code = "INVALID_ID";
							reject(error);
							return;
						}
						resolve(data);
					},
					onerror: () => {
						reject(/* @__PURE__ */ new Error("No se pudo conectar con Torn API"));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con Torn API"));
					}
				});
			});
		}
		async getItem(itemId) {
			return this.request(`/torn/${itemId}/items`);
		}
		async getItemMarket(itemId) {
			return this.request(`/market/${itemId}/itemmarket`);
		}
		async getTimestamp() {
			return this.request(`/market/timestamp`);
		}
	};
	//#endregion
	//#region src/api/w3b.js
	var W3BAPI = class {
		constructor(apiKey = null) {
			this.apiKey = apiKey;
		}
		async getPricelist(userId) {
			const url = `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "GET",
					url,
					onload: (response) => {
						if (response.status < 200 || response.status >= 300) {
							reject(/* @__PURE__ */ new Error(`W3B API HTTP ${response.status}`));
							return;
						}
						try {
							const data = JSON.parse(response.responseText);
							if (!Array.isArray(data)) {
								reject(/* @__PURE__ */ new Error("Formato inesperado de pricelist W3B"));
								return;
							}
							resolve(data);
						} catch (error) {
							reject(/* @__PURE__ */ new Error(`Error parseando respuesta W3B: ${error.message}`));
						}
					},
					onerror: () => {
						reject(/* @__PURE__ */ new Error("No se pudo conectar con W3B API"));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con W3B API"));
					}
				});
			});
		}
	};
	//#endregion
	//#region src/data/storage.js
	var PREFIX = "tornw3b_";
	function hasGM() {
		return typeof GM_setValue === "function" && typeof GM_getValue === "function";
	}
	var Storage = class {
		constructor() {
			this.configKey = `${PREFIX}config`;
			this.pricelistKey = `${PREFIX}pricelist`;
			this.auditKey = `${PREFIX}audits`;
			this.historyKey = `${PREFIX}history`;
			this.ratioKey = `${PREFIX}ratios`;
			this.engine = hasGM() ? "gm" : "localStorage";
		}
		async read(key, fallback) {
			try {
				let raw;
				if (this.engine === "gm") raw = await Promise.resolve(GM_getValue(key, null));
				else raw = localStorage.getItem(key);
				return raw ? JSON.parse(raw) : fallback;
			} catch {
				return fallback;
			}
		}
		async write(key, value) {
			const serialized = JSON.stringify(value);
			if (this.engine === "gm") await Promise.resolve(GM_setValue(key, serialized));
			else localStorage.setItem(key, serialized);
		}
		async saveConfig(config) {
			const merged = {
				...await this.getConfig(),
				...config
			};
			await this.write(this.configKey, merged);
			return merged;
		}
		async getConfig() {
			return this.read(this.configKey, {
				tornApiKey: null,
				w3bApiKey: null,
				w3bUserId: null,
				settings: {}
			});
		}
		async savePricelist(items) {
			const normalized = {
				items,
				lastSync: Date.now()
			};
			await this.write(this.pricelistKey, normalized);
			return normalized;
		}
		async getPricelist() {
			return this.read(this.pricelistKey, {
				items: [],
				lastSync: null
			});
		}
		async saveAudit(audit) {
			const audits = await this.read(this.auditKey, {});
			audits[audit.itemId] = audit;
			await this.write(this.auditKey, audits);
		}
		async getAudit(itemId) {
			return (await this.read(this.auditKey, {}))[itemId] || null;
		}
		async getAllAudits() {
			return this.read(this.auditKey, {});
		}
		async saveHistory(audit) {
			const history = await this.read(this.historyKey, {});
			if (!history[audit.itemId]) history[audit.itemId] = [];
			history[audit.itemId].push({
				timestamp: audit.timestamp,
				realMarketValue: audit.realMarketValue,
				correctBuyPrice: audit.correctBuyPrice,
				learnedRatio: audit.learnedRatio,
				w3bBuyPrice: audit.w3bBuyPrice,
				confidence: audit.confidence,
				status: audit.status
			});
			history[audit.itemId] = this.pruneHistory(history[audit.itemId]);
			await this.write(this.historyKey, history);
		}
		async getHistory(itemId) {
			return (await this.read(this.historyKey, {}))[itemId] || [];
		}
		async getRecentlyUpdatedItems(limit = 10) {
			const history = await this.read(this.historyKey, {});
			return Object.entries(history).map(([itemId, snapshots]) => {
				return {
					itemId,
					lastHistoryUpdate: snapshots[snapshots.length - 1]?.timestamp ?? 0
				};
			}).sort((a, b) => b.lastHistoryUpdate - a.lastHistoryUpdate).slice(0, limit);
		}
		pruneHistory(snapshots) {
			const cutoff = Date.now() - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1e3;
			return snapshots.filter((snapshot) => snapshot.timestamp >= cutoff);
		}
	};
	//#endregion
	//#region src/data/pricelist.js
	var Pricelist = class {
		constructor({ w3bAPI, storage }) {
			this.w3bAPI = w3bAPI;
			this.storage = storage;
		}
		async sync(userId) {
			const raw = await this.w3bAPI.getPricelist(userId);
			const items = this.normalize(raw);
			return this.storage.savePricelist(items);
		}
		normalize(rawItems) {
			if (!Array.isArray(rawItems)) return [];
			return rawItems.filter((item) => {
				if (!item) return false;
				const itemId = Number(item.itemId);
				if (!Number.isInteger(itemId) || itemId <= 0) return false;
				if (typeof item.name !== "string" || !item.name.trim()) return false;
				const buyPrice = Number(item.buyPrice);
				if (!Number.isFinite(buyPrice) || buyPrice <= 0) return false;
				return true;
			}).map((item) => ({
				itemId: Number(item.itemId),
				name: item.name.trim(),
				buyPrice: Number(item.buyPrice),
				bulkThreshold: Number(item.bulkThreshold) || 0,
				bulkBuyPrice: Number(item.bulkBuyPrice) || 0
			}));
		}
		async getAll() {
			return (await this.storage.getPricelist()).items || [];
		}
		async getLastSync() {
			return (await this.storage.getPricelist()).lastSync || null;
		}
		async getById(itemId) {
			return (await this.getAll()).find((item) => item.itemId === Number(itemId)) || null;
		}
		async search(query) {
			if (!query || query.length < CONFIG.SEARCH_MIN_LENGTH) return [];
			const items = await this.getAll();
			const normalizedQuery = query.trim().toLowerCase();
			return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
		}
	};
	//#endregion
	//#region src/market/statistics.js
	function weightedMean(listings) {
		let totalQuantity = 0;
		let weightedTotal = 0;
		for (const listing of listings) {
			if (!Number.isFinite(listing.price) || !Number.isFinite(listing.amount) || listing.price <= 0 || listing.amount <= 0) continue;
			totalQuantity += listing.amount;
			weightedTotal += listing.price * listing.amount;
		}
		if (totalQuantity === 0) return null;
		return weightedTotal / totalQuantity;
	}
	function weightedMedian(listings) {
		const valid = listings.filter((l) => Number.isFinite(l.price) && Number.isFinite(l.amount) && l.price > 0 && l.amount > 0).sort((a, b) => a.price - b.price);
		if (valid.length === 0) return null;
		let totalQuantity = 0;
		for (const listing of valid) totalQuantity += listing.amount;
		const target = totalQuantity / 2;
		let accumulated = 0;
		for (const listing of valid) {
			accumulated += listing.amount;
			if (accumulated >= target) return listing.price;
		}
		return valid[valid.length - 1].price;
	}
	function calculateDispersion(mean, median) {
		if (!Number.isFinite(mean) || !Number.isFinite(median) || median === 0) return null;
		return Math.abs(mean - median) / median;
	}
	//#endregion
	//#region src/market/marketAnalyzer.js
	var MarketAnalyzer = class {
		constructor(samplePercentage = .1) {
			this.samplePercentage = samplePercentage;
		}
		analyze(rawListings) {
			const listings = rawListings.filter((listing) => Number.isFinite(listing.price) && Number.isFinite(listing.amount) && listing.price > 0 && listing.amount > 0).map((listing) => ({
				price: Number(listing.price),
				amount: Number(listing.amount)
			})).sort((a, b) => a.price - b.price);
			if (listings.length === 0) return null;
			const totalQuantity = listings.reduce((sum, listing) => sum + listing.amount, 0);
			const sampleTarget = totalQuantity * this.samplePercentage;
			const targetQuantity = Math.max(1, Math.ceil(sampleTarget));
			const sample = [];
			let remaining = targetQuantity;
			for (const listing of listings) {
				if (remaining <= 0) break;
				const quantity = Math.min(listing.amount, remaining);
				sample.push({
					price: listing.price,
					amount: quantity
				});
				remaining -= quantity;
			}
			const mean = weightedMean(sample);
			const median = weightedMedian(sample);
			let realMarketValue;
			if (mean === null || median === null) return null;
			const dispersion = calculateDispersion(mean, median);
			if (dispersion !== null && dispersion <= .15) realMarketValue = (mean + median) / 2;
			else realMarketValue = median;
			const confidence = this.calculateConfidence({
				totalQuantity,
				sampleQuantity: targetQuantity,
				listingsCount: listings.length,
				dispersion
			});
			return {
				totalQuantity,
				sampleQuantity: targetQuantity,
				weightedMean: mean,
				weightedMedian: median,
				dispersion,
				realMarketValue,
				confidence
			};
		}
		calculateConfidence({ totalQuantity, sampleQuantity, listingsCount, dispersion }) {
			let score = 0;
			if (totalQuantity >= 1e4) score += 40;
			else if (totalQuantity >= 1e3) score += 30;
			else if (totalQuantity >= 100) score += 20;
			else if (totalQuantity >= 20) score += 10;
			if (sampleQuantity >= 1e3) score += 30;
			else if (sampleQuantity >= 100) score += 25;
			else if (sampleQuantity >= 20) score += 15;
			else if (sampleQuantity >= 5) score += 8;
			if (listingsCount >= 50) score += 15;
			else if (listingsCount >= 20) score += 10;
			else if (listingsCount >= 5) score += 5;
			if (dispersion !== null) {
				if (dispersion <= .05) score += 15;
				else if (dispersion <= .1) score += 10;
				else if (dispersion <= .2) score += 5;
			}
			return Math.min(100, score);
		}
	};
	//#endregion
	//#region src/auditor/ratioLearner.js
	var RatioLearner = class {
		calculateObservedRatio(buyPrice, itemValue) {
			if (!Number.isFinite(buyPrice) || !Number.isFinite(itemValue) || itemValue <= 0) return null;
			return buyPrice / itemValue;
		}
		update(previousRatio, observedRatio) {
			if (!Number.isFinite(observedRatio)) return previousRatio;
			if (!Number.isFinite(previousRatio)) return observedRatio;
			return CONFIG.EWMA_ALPHA * observedRatio + (1 - CONFIG.EWMA_ALPHA) * previousRatio;
		}
	};
	//#endregion
	//#region src/auditor/auditor.js
	var Auditor = class {
		constructor({ tornAPI, marketAnalyzer, ratioLearner, storage }) {
			this.tornAPI = tornAPI;
			this.marketAnalyzer = marketAnalyzer;
			this.ratioLearner = ratioLearner;
			this.storage = storage;
		}
		async audit(item) {
			const itemId = Number(item.itemId);
			const itemResponse = await this.tornAPI.getItem(itemId);
			const itemData = this.extractItem(itemResponse);
			const marketResponse = await this.tornAPI.getItemMarket(itemId);
			const itemValue = itemData.itemValue;
			const observedRatio = this.ratioLearner.calculateObservedRatio(item.buyPrice, itemValue);
			const previousAudit = await this.storage.getAudit(itemId);
			const learnedRatio = this.ratioLearner.update(previousAudit?.learnedRatio, observedRatio);
			const listings = marketResponse?.itemmarket?.listings || [];
			const marketAnalysis = this.marketAnalyzer.analyze(listings);
			if (!marketAnalysis) throw new Error(`No hay suficientes datos de mercado para ${item.name}`);
			const correctBuyPrice = marketAnalysis.realMarketValue * learnedRatio;
			const differencePercent = correctBuyPrice > 0 ? Math.abs(item.buyPrice - correctBuyPrice) / correctBuyPrice : null;
			const status = this.calculateStatus(differencePercent);
			const result = {
				itemId,
				itemName: item.name,
				itemValue,
				w3bBuyPrice: item.buyPrice,
				observedRatio,
				learnedRatio,
				totalMarketQuantity: marketAnalysis.totalQuantity,
				sampleQuantity: marketAnalysis.sampleQuantity,
				weightedMean: marketAnalysis.weightedMean,
				weightedMedian: marketAnalysis.weightedMedian,
				dispersion: marketAnalysis.dispersion,
				realMarketValue: marketAnalysis.realMarketValue,
				correctBuyPrice,
				differencePercent,
				confidence: marketAnalysis.confidence,
				status,
				marketCacheTimestamp: marketResponse?.itemmarket?.cache_timestamp ?? null,
				marketCacheDelay: marketResponse?.itemmarket?.cache_delay ?? null,
				timestamp: Date.now()
			};
			await this.storage.saveAudit(result);
			return result;
		}
		calculateStatus(difference) {
			if (!Number.isFinite(difference)) return "RED";
			if (difference <= .03) return "GREEN";
			if (difference <= .1) return "YELLOW";
			return "RED";
		}
		extractItem(response) {
			const item = response?.items?.[0];
			if (!item) throw new Error("Torn API no devolvió información del artículo");
			const itemValue = Number(item.value?.market_price);
			if (!Number.isFinite(itemValue) || itemValue <= 0) throw new Error(`Item Value inválido para ${item.name}`);
			return {
				id: Number(item.id),
				name: item.name,
				itemValue
			};
		}
	};
	//#endregion
	//#region src/auditor/scheduler.js
	var INVALID_ITEMS_STORAGE_KEY = "tornw3b-invalid-items";
	var Scheduler = class {
		constructor({ auditor, pricelist, storage, history, concurrency = 1 }) {
			this.auditor = auditor;
			this.pricelist = pricelist;
			this.storage = storage;
			this.history = history;
			this.concurrency = concurrency;
			this.lastAuditByItem = /* @__PURE__ */ new Map();
			this.invalidItems = /* @__PURE__ */ new Map();
			this.queue = [];
			this.running = 0;
			this.initialized = false;
			this.onAuditComplete = null;
			this.onAuditError = null;
		}
		loadInvalidItems() {
			try {
				const raw = localStorage.getItem(INVALID_ITEMS_STORAGE_KEY);
				if (!raw) return;
				const parsed = JSON.parse(raw);
				if (!parsed || typeof parsed !== "object") return;
				for (const [itemId, value] of Object.entries(parsed)) this.invalidItems.set(Number(itemId), value);
			} catch (error) {
				console.warn("[Scheduler] No se pudo cargar lista de inválidos:", error);
			}
		}
		saveInvalidItems() {
			try {
				const data = Object.fromEntries(this.invalidItems);
				localStorage.setItem(INVALID_ITEMS_STORAGE_KEY, JSON.stringify(data));
			} catch (error) {
				console.warn("[Scheduler] No se pudo guardar lista de inválidos:", error);
			}
		}
		markInvalid(item, error) {
			this.invalidItems.set(Number(item.itemId), {
				name: item.name,
				reason: error.message,
				timestamp: Date.now()
			});
			this.saveInvalidItems();
		}
		isInvalid(itemId) {
			return this.invalidItems.has(Number(itemId));
		}
		async init() {
			const audits = await this.storage.getAllAudits();
			for (const itemId in audits) {
				const audit = audits[itemId];
				if (audit && Number.isFinite(Number(audit.timestamp))) this.lastAuditByItem.set(Number(itemId), Number(audit.timestamp));
			}
			this.loadInvalidItems();
			this.initialized = true;
			console.log(`[Scheduler] ${this.invalidItems.size} artículos descartados cargados`);
		}
		needsAudit(itemId) {
			const numericId = Number(itemId);
			if (this.isInvalid(numericId)) return false;
			const last = this.lastAuditByItem.get(numericId);
			if (!last) return true;
			return Date.now() - last >= CONFIG.AUDIT_INTERVAL;
		}
		async getOrAudit(item) {
			if (this.isInvalid(item.itemId)) return null;
			if (!this.needsAudit(item.itemId)) {
				const cached = await this.storage.getAudit(item.itemId);
				if (cached) return cached;
			}
			return this.auditPriority(item);
		}
		auditPriority(item) {
			if (this.isInvalid(item.itemId)) return Promise.reject(/* @__PURE__ */ new Error(`Artículo descartado: ${item.name}`));
			return new Promise((resolve, reject) => {
				this.queue.unshift({
					item,
					priority: true,
					resolve,
					reject
				});
				this.drain();
			});
		}
		async enqueueDueItems() {
			const due = (await this.pricelist.getAll()).filter((item) => {
				if (!item) return false;
				if (!Number.isFinite(Number(item.itemId))) return false;
				if (typeof item.name !== "string" || !item.name.trim()) return false;
				if (!Number.isFinite(Number(item.buyPrice)) || Number(item.buyPrice) <= 0) return false;
				if (this.isInvalid(item.itemId)) return false;
				return this.needsAudit(item.itemId);
			});
			const batch = due.slice(0, 10);
			for (const item of batch) this.queue.push({
				item,
				priority: false
			});
			if (batch.length > 0) console.log(`[Scheduler] ${batch.length} artículos añadidos a la cola (pendientes: ${Math.max(0, due.length - batch.length)})`);
			this.drain();
			return batch.length;
		}
		drain() {
			while (this.running < this.concurrency && this.queue.length > 0) {
				const next = this.queue.shift();
				this.runAudit(next);
			}
		}
		async runAudit(queued) {
			const { item, resolve, reject } = queued;
			this.running++;
			try {
				if (this.isInvalid(item.itemId)) {
					if (reject) reject(/* @__PURE__ */ new Error(`Artículo descartado: ${item.name}`));
					return;
				}
				const result = await this.auditor.audit(item);
				await this.history.recordSnapshot(result);
				this.lastAuditByItem.set(item.itemId, result.timestamp);
				if (this.onAuditComplete) this.onAuditComplete(result);
				if (resolve) resolve(result);
			} catch (error) {
				if (error?.code === "INVALID_ID" || error?.message === "Incorrect ID" || error?.message?.startsWith("Item Value inválido") || error?.message?.startsWith("No se pudo obtener Item Value")) {
					this.markInvalid(item, error);
					console.warn(`[TornW3B] ${item.name} descartado permanentemente: ${error.message}`);
				} else if (this.onAuditError) this.onAuditError(item, error);
				else console.error(`[Scheduler] Error auditando ${item.name}:`, error);
				if (reject) reject(error);
			} finally {
				this.running--;
				this.drain();
			}
		}
		start() {
			if (!this.initialized) console.warn("[Scheduler] start() llamado sin init() previo.");
			this.enqueueDueItems();
			this.intervalHandle = setInterval(() => this.enqueueDueItems(), CONFIG.AUDIT_INTERVAL);
		}
		stop() {
			if (this.intervalHandle) {
				clearInterval(this.intervalHandle);
				this.intervalHandle = null;
			}
		}
	};
	//#endregion
	//#region src/history/history.js
	var History = class {
		constructor({ tornAPI, storage }) {
			this.tornAPI = tornAPI;
			this.storage = storage;
			this.lastDayByItem = /* @__PURE__ */ new Map();
			this.initialized = false;
		}
		async getTornDay() {
			const timestamp = (await this.tornAPI.getTimestamp())?.timestamp ?? Math.floor(Date.now() / 1e3);
			return Math.floor(timestamp / 86400);
		}
		async init() {
			const audits = await this.storage.getAllAudits();
			for (const itemId in audits) {
				const history = await this.storage.getHistory(Number(itemId));
				const last = history[history.length - 1];
				if (last) {
					const day = Math.floor(last.timestamp / 864e5);
					this.lastDayByItem.set(Number(itemId), day);
				}
			}
			this.initialized = true;
		}
		async recordSnapshot(audit) {
			const tornDay = await this.getTornDay();
			if (this.lastDayByItem.get(audit.itemId) === tornDay) return null;
			await this.storage.saveHistory(audit);
			this.lastDayByItem.set(audit.itemId, tornDay);
			return audit;
		}
		async getSeries(itemId) {
			return (await this.storage.getHistory(itemId)).map((snapshot) => ({
				timestamp: snapshot.timestamp,
				realMarketValue: snapshot.realMarketValue,
				correctBuyPrice: snapshot.correctBuyPrice
			}));
		}
		async getSummary(itemId) {
			const history = await this.storage.getHistory(itemId);
			const now = Date.now();
			const day = 864e5;
			const buckets = {
				yesterday: [],
				last7d: [],
				last30d: [],
				last6m: []
			};
			for (const snapshot of history) {
				const age = now - snapshot.timestamp;
				if (age <= day) buckets.yesterday.push(snapshot);
				if (age <= 7 * day) buckets.last7d.push(snapshot);
				if (age <= 30 * day) buckets.last30d.push(snapshot);
				if (age <= 180 * day) buckets.last6m.push(snapshot);
			}
			return {
				yesterday: this.aggregate(buckets.yesterday),
				last7d: this.aggregate(buckets.last7d),
				last30d: this.aggregate(buckets.last30d),
				last6m: this.aggregate(buckets.last6m)
			};
		}
		aggregate(snapshots) {
			if (snapshots.length === 0) return null;
			const count = snapshots.length;
			const sum = (key) => snapshots.reduce((total, s) => total + (s[key] ?? 0), 0);
			const latest = snapshots[snapshots.length - 1];
			return {
				avgRealMarketValue: sum("realMarketValue") / count,
				avgCorrectBuyPrice: sum("correctBuyPrice") / count,
				avgLearnedRatio: sum("learnedRatio") / count,
				latestW3bBuyPrice: latest.w3bBuyPrice,
				latestConfidence: latest.confidence,
				latestStatus: latest.status,
				samples: count
			};
		}
		async getRecentlyUpdated(limit = 10) {
			return this.storage.getRecentlyUpdatedItems(limit);
		}
	};
	//#endregion
	//#region src/ui/styles.js
	var STYLE_ID = "tornw3b-styles";
	function injectStyles() {
		if (document.getElementById("tornw3b-styles")) return;
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.textContent = `
        :root {
            --tw3b-bg: #14161c;
            --tw3b-surface: #1c1f28;
            --tw3b-surface-hover: #242832;
            --tw3b-border: #2c3140;
            --tw3b-text: #e6e8ec;
            --tw3b-text-muted: #8a8f9c;

            --tw3b-green: #2fbf71;
            --tw3b-green-bg: rgba(47, 191, 113, 0.12);
            --tw3b-yellow: #e0b23e;
            --tw3b-yellow-bg: rgba(224, 178, 62, 0.12);
            --tw3b-red: #e0473e;
            --tw3b-red-bg: rgba(224, 71, 62, 0.12);

            --tw3b-accent: #4f8cff;
            --tw3b-radius: 10px;
            --tw3b-radius-sm: 6px;

            --tw3b-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }

        .tw3b-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: var(--tw3b-accent);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            border: none;
            cursor: pointer;
            box-shadow: var(--tw3b-shadow);
            z-index: 99998;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .tw3b-fab:hover {
            transform: scale(1.06);
        }

        .tw3b-fab.has-alerts::after {
            content: "";
            position: absolute;
            top: 4px;
            right: 4px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--tw3b-red);
            border: 2px solid var(--tw3b-bg);
        }

        .tw3b-panel {
            position: fixed;
            bottom: 84px;
            right: 20px;
            width: 340px;
            max-height: 70vh;
            background: var(--tw3b-surface);
            border: 1px solid var(--tw3b-border);
            border-radius: var(--tw3b-radius);
            box-shadow: var(--tw3b-shadow);
            color: var(--tw3b-text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            z-index: 99999;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none;
        }

        .tw3b-panel.open {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        .tw3b-panel-header {
            padding: 14px 16px;
            border-bottom: 1px solid var(--tw3b-border);
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .tw3b-panel-body {
            overflow-y: auto;
            padding: 12px;
            flex: 1;
        }

        .tw3b-search {
            width: 100%;
            box-sizing: border-box;
            background: var(--tw3b-bg);
            border: 1px solid var(--tw3b-border);
            border-radius: var(--tw3b-radius-sm);
            color: var(--tw3b-text);
            padding: 8px 10px;
            font-size: 13px;
            margin-bottom: 10px;
        }

        .tw3b-search:focus {
            outline: none;
            border-color: var(--tw3b-accent);
        }
            .tw3b-suggestions {
            position: absolute;
            width: 100%;
            max-height: 200px;
            overflow-y: auto;
            background: var(--tw3b-surface);
            border: 1px solid var(--tw3b-border);
            border-radius: var(--tw3b-radius-sm);
            margin-top: -8px;
            margin-bottom: 10px;
            z-index: 1;
        }

        .tw3b-suggestion-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 12px;
        }

        .tw3b-suggestion-item:hover {
            background: var(--tw3b-surface-hover);
        }

        .tw3b-menu-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-radius: var(--tw3b-radius-sm);
            cursor: pointer;
            margin-bottom: 6px;
            background: var(--tw3b-bg);
            border: 1px solid transparent;
            transition: background 0.12s ease, border-color 0.12s ease;
        }

        .tw3b-menu-item:hover {
            background: var(--tw3b-surface-hover);
            border-color: var(--tw3b-border);
        }

        .tw3b-badge {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 999px;
        }

        .tw3b-badge-red {
            background: var(--tw3b-red-bg);
            color: var(--tw3b-red);
        }

        .tw3b-badge-yellow {
            background: var(--tw3b-yellow-bg);
            color: var(--tw3b-yellow);
        }

        .tw3b-badge-green {
            background: var(--tw3b-green-bg);
            color: var(--tw3b-green);
        }

        .tw3b-card {
            background: var(--tw3b-bg);
            border: 1px solid var(--tw3b-border);
            border-radius: var(--tw3b-radius-sm);
            padding: 10px 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: border-color 0.12s ease;
        }

        .tw3b-card:hover {
            border-color: var(--tw3b-accent);
        }

        .tw3b-card-title {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .tw3b-card-sub {
            color: var(--tw3b-text-muted);
            font-size: 12px;
        }

        .tw3b-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid var(--tw3b-border);
            font-size: 12px;
        }

        .tw3b-row:last-child {
            border-bottom: none;
        }

        .tw3b-row-label {
            color: var(--tw3b-text-muted);
        }

        .tw3b-button {
            background: var(--tw3b-accent);
            color: #fff;
            border: none;
            border-radius: var(--tw3b-radius-sm);
            padding: 8px 12px;
            font-size: 13px;
            cursor: pointer;
            width: 100%;
            transition: opacity 0.12s ease;
        }

        .tw3b-button:hover {
            opacity: 0.9;
        }

        .tw3b-button-secondary {
            background: transparent;
            color: var(--tw3b-text-muted);
            border: 1px solid var(--tw3b-border);
        }

        .tw3b-error {
            background: var(--tw3b-red-bg);
            color: var(--tw3b-red);
            padding: 8px 10px;
            border-radius: var(--tw3b-radius-sm);
            font-size: 12px;
            margin-bottom: 8px;
        }

        .tw3b-skeleton {
            background: linear-gradient(
                90deg,
                var(--tw3b-bg) 25%,
                var(--tw3b-surface-hover) 37%,
                var(--tw3b-bg) 63%
            );
            background-size: 400% 100%;
            animation: tw3b-shimmer 1.4s ease infinite;
            border-radius: var(--tw3b-radius-sm);
            height: 14px;
            margin-bottom: 6px;
        }

        @keyframes tw3b-shimmer {
            0% { background-position: 100% 50%; }
            100% { background-position: 0 50%; }
        }

        .tw3b-back {
            color: var(--tw3b-accent);
            cursor: pointer;
            font-size: 12px;
            margin-bottom: 10px;
            display: inline-block;
        }
    `;
		document.head.appendChild(style);
	}
	function statusBadgeClass(status) {
		switch (status) {
			case "RED": return "tw3b-badge tw3b-badge-red";
			case "YELLOW": return "tw3b-badge tw3b-badge-yellow";
			case "GREEN": return "tw3b-badge tw3b-badge-green";
			default: return "tw3b-badge";
		}
	}
	function formatMoney(value) {
		if (!Number.isFinite(value)) return "-";
		return "$" + Math.round(value).toLocaleString("en-US");
	}
	function formatPercent(value) {
		if (!Number.isFinite(value)) return "-";
		return (value * 100).toFixed(1) + "%";
	}
	//#endregion
	//#region src/ui/app.js
	var VIEWS = {
		MENU: "menu",
		SALE: "sale",
		AUDIT: "audit",
		HISTORY: "history",
		SETTINGS: "settings"
	};
	var App = class {
		constructor(ctx, views = {}) {
			this.ctx = ctx;
			this.views = views;
			this.currentView = VIEWS.MENU;
			this.activeViewInstance = null;
			this.root = null;
			this.panel = null;
			this.panelBody = null;
			this.fab = null;
		}
		mount() {
			injectStyles();
			this.fab = document.createElement("button");
			this.fab.className = "tw3b-fab";
			this.fab.textContent = "💰";
			this.fab.addEventListener("click", () => this.toggle());
			this.panel = document.createElement("div");
			this.panel.className = "tw3b-panel";
			const header = document.createElement("div");
			header.className = "tw3b-panel-header";
			header.innerHTML = `<span>TornW3B Trader</span>`;
			const closeBtn = document.createElement("span");
			closeBtn.textContent = "✕";
			closeBtn.style.cursor = "pointer";
			closeBtn.addEventListener("click", () => this.close());
			header.appendChild(closeBtn);
			this.panelBody = document.createElement("div");
			this.panelBody.className = "tw3b-panel-body";
			this.panel.appendChild(header);
			this.panel.appendChild(this.panelBody);
			document.body.appendChild(this.fab);
			document.body.appendChild(this.panel);
			this.navigate(VIEWS.MENU);
			this.refreshAlertBadge();
		}
		toggle() {
			if (this.panel.classList.contains("open")) this.close();
			else this.open();
		}
		open() {
			this.panel.classList.add("open");
		}
		close() {
			this.panel.classList.remove("open");
		}
		async navigate(viewName, params = {}) {
			if (this.activeViewInstance && typeof this.activeViewInstance.destroy === "function") this.activeViewInstance.destroy();
			this.currentView = viewName;
			this.panelBody.innerHTML = "";
			if (viewName === VIEWS.MENU) {
				this.renderMenu();
				return;
			}
			const view = this.views[viewName];
			if (!view || typeof view.render !== "function") {
				this.panelBody.innerHTML = `
                <div class="tw3b-error">
                    Vista "${viewName}" no disponible todavía.
                </div>
                <span class="tw3b-back" data-action="back">← Volver</span>
            `;
				this.bindBack();
				return;
			}
			const back = document.createElement("span");
			back.className = "tw3b-back";
			back.textContent = "← Volver";
			back.addEventListener("click", () => this.navigate(VIEWS.MENU));
			this.panelBody.appendChild(back);
			const container = document.createElement("div");
			this.panelBody.appendChild(container);
			this.activeViewInstance = await view.render(container, this.ctx, (nextView, nextParams) => this.navigate(nextView, nextParams), params) || null;
		}
		bindBack() {
			const back = this.panelBody.querySelector("[data-action=\"back\"]");
			if (back) back.addEventListener("click", () => this.navigate(VIEWS.MENU));
		}
		renderMenu() {
			const searchInput = document.createElement("input");
			searchInput.className = "tw3b-search";
			searchInput.type = "text";
			searchInput.placeholder = "🔎 Buscar artículo...";
			searchInput.addEventListener("input", (e) => {
				const query = e.target.value;
				if (this.views.search && this.views.search.onQuery) this.views.search.onQuery(query, this.ctx, (item) => {
					this.navigate(VIEWS.SALE, { item });
				}, searchInput);
			});
			this.panelBody.appendChild(searchInput);
			const items = [
				{
					label: "Venta",
					view: VIEWS.SALE
				},
				{
					label: "Auditoría",
					view: VIEWS.AUDIT,
					badge: true
				},
				{
					label: "Historial",
					view: VIEWS.HISTORY
				},
				{
					label: "Configuración",
					view: VIEWS.SETTINGS
				}
			];
			for (const item of items) {
				const el = document.createElement("div");
				el.className = "tw3b-menu-item";
				const label = document.createElement("span");
				label.textContent = item.label;
				el.appendChild(label);
				if (item.badge) {
					const badge = document.createElement("span");
					badge.className = "tw3b-badge tw3b-badge-red";
					badge.id = "tw3b-alert-count";
					badge.textContent = "0";
					badge.style.display = "none";
					el.appendChild(badge);
				}
				el.addEventListener("click", () => this.navigate(item.view));
				this.panelBody.appendChild(el);
			}
		}
		async refreshAlertBadge() {
			const audits = await this.ctx.storage.getAllAudits();
			const alertCount = Object.values(audits).filter((a) => a.status === "RED" || a.status === "YELLOW").length;
			const badge = this.panelBody.querySelector("#tw3b-alert-count");
			if (badge) {
				badge.textContent = String(alertCount);
				badge.style.display = alertCount > 0 ? "inline-block" : "none";
			}
			this.fab.classList.toggle("has-alerts", alertCount > 0);
		}
	};
	//#endregion
	//#region src/ui/search.js
	var SUGGESTIONS_ID = "tw3b-suggestions";
	var debounceHandle = null;
	function getSuggestionsContainer(anchorEl) {
		let el = document.getElementById(SUGGESTIONS_ID);
		if (!el) {
			el = document.createElement("div");
			el.id = SUGGESTIONS_ID;
			el.className = "tw3b-suggestions";
			anchorEl.insertAdjacentElement("afterend", el);
		}
		return el;
	}
	function renderSuggestions(container, items, onSelect) {
		container.innerHTML = "";
		if (items.length === 0) {
			container.style.display = "none";
			return;
		}
		container.style.display = "block";
		for (const item of items) {
			const row = document.createElement("div");
			row.className = "tw3b-suggestion-item";
			row.innerHTML = `
            <span class="tw3b-suggestion-name">${escapeHtml$3(item.name)}</span>
            <span class="tw3b-suggestion-price">${formatMoney(item.buyPrice)}</span>
        `;
			row.addEventListener("click", () => {
				container.style.display = "none";
				onSelect(item);
			});
			container.appendChild(row);
		}
	}
	function escapeHtml$3(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}
	var search = { onQuery(query, ctx, onSelect, anchorEl) {
		clearTimeout(debounceHandle);
		const container = getSuggestionsContainer(anchorEl);
		if (!query || query.length < CONFIG.SEARCH_MIN_LENGTH) {
			container.style.display = "none";
			return;
		}
		debounceHandle = setTimeout(async () => {
			const results = await ctx.pricelist.search(query);
			renderSuggestions(container, results.slice(0, 8), onSelect);
		}, 200);
	} };
	//#endregion
	//#region src/ui/saleView.js
	var saleView = { async render(container, ctx, navigate, params = {}) {
		const item = params.item;
		if (!item) {
			container.innerHTML = `
                <div class="tw3b-error">
                    Buscá un artículo desde el menú principal primero.
                </div>
            `;
			return null;
		}
		container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;
		const audit = await ctx.storage.getAudit(item.itemId);
		if (!audit) {
			container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml$2(item.name)}
                </div>

                <div class="tw3b-error">
                    Este artículo todavía no fue auditado — no se puede
                    calcular el % W3B sin el Item Value de Torn.
                </div>
            `;
			return null;
		}
		const w3bPercent = item.buyPrice / audit.itemValue;
		const w3bDiscount = 1 - w3bPercent;
		const sellDiscount = w3bDiscount / 2;
		const sellPercent = 1 - sellDiscount;
		const sellPrice = audit.itemValue * sellPercent;
		container.innerHTML = `
            <div class="tw3b-card-title">
                ${escapeHtml$2(item.name)}
            </div>

            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    W3B Buy Price
                </span>
                <span>
                    ${formatMoney(item.buyPrice)}
                </span>
            </div>

            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    W3B %
                </span>
                <span>
                    ${formatPercent(w3bPercent)}
                    (-${formatPercent(w3bDiscount)})
                </span>
            </div>

            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell %
                </span>
                <span>
                    ${formatPercent(sellPercent)}
                    (-${formatPercent(sellDiscount)})
                </span>
            </div>

            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell Price
                </span>
                <span>
                    ${formatMoney(sellPrice)}
                </span>
            </div>

            <button
                class="tw3b-button"
                id="tw3b-copy-sell"
                style="margin-top: 10px;"
            >
                Copiar precio de venta
            </button>
        `;
		const copyBtn = container.querySelector("#tw3b-copy-sell");
		copyBtn.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(String(Math.round(sellPrice)));
				copyBtn.textContent = "Copiado ✓";
			} catch {
				copyBtn.textContent = "Error al copiar";
			}
			setTimeout(() => {
				copyBtn.textContent = "Copiar precio de venta";
			}, 1500);
		});
		return null;
	} };
	function escapeHtml$2(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}
	//#endregion
	//#region src/ui/auditView.js
	var auditView = {
		async render(container, ctx, navigate, params = {}) {
			if (params.itemId) return this.renderDetail(container, ctx, navigate, params.itemId);
			return this.renderList(container, ctx, navigate);
		},
		async renderList(container, ctx, navigate) {
			container.innerHTML = `
            <input type="text" class="tw3b-search" id="tw3b-audit-filter"
                placeholder="🔎 Filtrar por nombre...">
            <div id="tw3b-audit-list">
                <div class="tw3b-skeleton"></div>
                <div class="tw3b-skeleton"></div>
            </div>
        `;
			const audits = await ctx.storage.getAllAudits();
			const order = {
				RED: 0,
				YELLOW: 1,
				GREEN: 2
			};
			const list = Object.values(audits).sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
			const listEl = container.querySelector("#tw3b-audit-list");
			const renderItems = (filterText = "") => {
				const filtered = filterText ? list.filter((a) => a.itemName.toLowerCase().includes(filterText.toLowerCase())) : list;
				if (filtered.length === 0) {
					listEl.innerHTML = `
                    <div class="tw3b-card-sub">
                        No hay artículos auditados todavía.
                    </div>
                `;
					return;
				}
				listEl.innerHTML = "";
				for (const audit of filtered) {
					const card = document.createElement("div");
					card.className = "tw3b-card";
					card.innerHTML = `
                    <div class="tw3b-card-title">
                        ${escapeHtml$1(audit.itemName)}
                        <span class="${statusBadgeClass(audit.status)}">
                            ${audit.status}
                        </span>
                    </div>
                    <div class="tw3b-card-sub">
                        ${formatMoney(audit.w3bBuyPrice)} → ${formatMoney(audit.correctBuyPrice)}
                        · confianza ${audit.confidence}%
                    </div>
                `;
					card.addEventListener("click", () => navigate("audit", { itemId: audit.itemId }));
					listEl.appendChild(card);
				}
			};
			renderItems();
			container.querySelector("#tw3b-audit-filter").addEventListener("input", (e) => renderItems(e.target.value));
			return null;
		},
		async renderDetail(container, ctx, navigate, itemId) {
			container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;
			const audit = await ctx.storage.getAudit(itemId);
			if (!audit) {
				container.innerHTML = `
                <div class="tw3b-error">
                    No hay datos de auditoría para este artículo.
                </div>
            `;
				return null;
			}
			container.innerHTML = `
            <div class="tw3b-card-title">${escapeHtml$1(audit.itemName)}</div>

            ${row("Item Value", formatMoney(audit.itemValue))}
            ${row("W3B Buy", formatMoney(audit.w3bBuyPrice))}
            ${row("Observed W3B", formatPercent(audit.observedRatio))}
            ${row("Learned W3B", formatPercent(audit.learnedRatio))}
            ${row("Market Units", audit.totalMarketQuantity)}
            ${row("Sample", audit.sampleQuantity)}
            ${row("Weighted Mean", formatMoney(audit.weightedMean))}
            ${row("Weighted Median", formatMoney(audit.weightedMedian))}
            ${row("Real Market Value", formatMoney(audit.realMarketValue))}
            ${row("Correct Buy", formatMoney(audit.correctBuyPrice))}
            ${row("Difference", formatPercent(audit.differencePercent))}
            ${row("Confidence", audit.confidence + "%")}
            ${row("Status", `<span class="${statusBadgeClass(audit.status)}">${audit.status}</span>`)}

            <button class="tw3b-button" id="tw3b-view-history" style="margin-top: 10px;">
                Ver historial
            </button>
        `;
			container.querySelector("#tw3b-view-history").addEventListener("click", () => navigate("history", { itemId: audit.itemId }));
			return null;
		}
	};
	function row(label, value) {
		return `
        <div class="tw3b-row">
            <span class="tw3b-row-label">${label}</span>
            <span>${value}</span>
        </div>
    `;
	}
	function escapeHtml$1(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}
	//#endregion
	//#region src/ui/historyView.js
	var historyView = {
		async render(container, ctx, navigate, params = {}) {
			if (params.itemId) return this.renderDetail(container, ctx, navigate, params.itemId);
			return this.renderRecent(container, ctx, navigate);
		},
		async renderRecent(container, ctx, navigate) {
			container.innerHTML = `<div class="tw3b-skeleton"></div>`;
			const recent = await ctx.history.getRecentlyUpdated(10);
			if (recent.length === 0) {
				container.innerHTML = `
                <div class="tw3b-card-sub">
                    Todavía no hay historial registrado.
                </div>
            `;
				return null;
			}
			const audits = await ctx.storage.getAllAudits();
			container.innerHTML = "";
			for (const entry of recent) {
				const audit = audits[entry.itemId];
				const card = document.createElement("div");
				card.className = "tw3b-card";
				card.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml(audit?.itemName ?? `Item ${entry.itemId}`)}
                </div>
                <div class="tw3b-card-sub">
                    Última actualización:
                    ${new Date(entry.lastHistoryUpdate).toLocaleDateString()}
                </div>
            `;
				card.addEventListener("click", () => navigate("history", { itemId: entry.itemId }));
				container.appendChild(card);
			}
			return null;
		},
		async renderDetail(container, ctx, navigate, itemId) {
			container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;
			const [summary, series] = await Promise.all([ctx.history.getSummary(itemId), ctx.history.getSeries(itemId)]);
			const audit = await ctx.storage.getAudit(itemId);
			if (series.length === 0) {
				container.innerHTML = `
                <div class="tw3b-card-sub">
                    No hay historial para este artículo todavía.
                </div>
            `;
				return null;
			}
			container.innerHTML = `
            <div class="tw3b-card-title">
                ${escapeHtml(audit?.itemName ?? `Item ${itemId}`)}
            </div>

            ${summaryRow("Ayer", summary.yesterday)}
            ${summaryRow("Últimos 7 días", summary.last7d)}
            ${summaryRow("Últimos 30 días", summary.last30d)}
            ${summaryRow("Últimos 6 meses", summary.last6m)}

            <div class="tw3b-card-sub" style="margin-top: 10px;">
                Evolución (Real Market Value)
            </div>
            <div id="tw3b-history-series"></div>
        `;
			const seriesEl = container.querySelector("#tw3b-history-series");
			for (const point of series.slice(-15)) {
				const r = document.createElement("div");
				r.className = "tw3b-row";
				r.innerHTML = `
                <span class="tw3b-row-label">
                    ${new Date(point.timestamp).toLocaleDateString()}
                </span>
                <span>${formatMoney(point.realMarketValue)}</span>
            `;
				seriesEl.appendChild(r);
			}
			return null;
		}
	};
	function summaryRow(label, data) {
		if (!data) return `
            <div class="tw3b-row">
                <span class="tw3b-row-label">${label}</span>
                <span class="tw3b-card-sub">Sin datos</span>
            </div>
        `;
		return `
        <div class="tw3b-row">
            <span class="tw3b-row-label">${label}</span>
            <span>${formatMoney(data.avgRealMarketValue)} · ${data.samples} muestras</span>
        </div>
    `;
	}
	function escapeHtml(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}
	//#endregion
	//#region src/ui/settingsView.js
	var settingsView = {
		async render(container, ctx, navigate) {
			const config = await ctx.storage.getConfig();
			container.innerHTML = `
            <div class="tw3b-row-label" style="margin-bottom: 4px;">Torn API Key</div>
            <input type="password" class="tw3b-search" id="tw3b-torn-key"
                value="${config.tornApiKey ?? ""}" placeholder="•••••••••••••••">

            <div class="tw3b-row-label" style="margin: 10px 0 4px;">TornW3B API Key</div>
            <input type="password" class="tw3b-search" id="tw3b-w3b-key"
                value="${config.w3bApiKey ?? ""}" placeholder="•••••••••••••••">

            <div class="tw3b-row-label" style="margin: 10px 0 4px;">TornW3B User ID</div>
            <input type="text" class="tw3b-search" id="tw3b-w3b-userid"
                value="${config.w3bUserId ?? ""}" placeholder="123456">

            <button class="tw3b-button" id="tw3b-save-config" style="margin-top: 6px;">
                Guardar
            </button>

            <div id="tw3b-config-status" style="margin-top: 10px;"></div>
        `;
			const statusEl = container.querySelector("#tw3b-config-status");
			container.querySelector("#tw3b-save-config").addEventListener("click", () => this.handleSave(container, ctx, statusEl));
			return null;
		},
		async handleSave(container, ctx, statusEl) {
			const tornApiKey = container.querySelector("#tw3b-torn-key").value.trim();
			const w3bApiKey = container.querySelector("#tw3b-w3b-key").value.trim();
			const w3bUserId = container.querySelector("#tw3b-w3b-userid").value.trim();
			if (!tornApiKey || !/^[a-zA-Z0-9]{16}$/.test(tornApiKey)) {
				statusEl.innerHTML = `
                <div class="tw3b-error">
                    Torn API Key con formato inválido (16 caracteres alfanuméricos).
                </div>
            `;
				return;
			}
			if (!w3bUserId || !/^\d+$/.test(w3bUserId)) {
				statusEl.innerHTML = `
                <div class="tw3b-error">
                    TornW3B User ID debe ser numérico.
                </div>
            `;
				return;
			}
			statusEl.innerHTML = `<div class="tw3b-skeleton"></div>`;
			await ctx.storage.saveConfig({
				tornApiKey,
				w3bApiKey: w3bApiKey || null,
				w3bUserId
			});
			statusEl.innerHTML = `
            <div class="tw3b-card-sub">
                ✓ Configuración guardada. Recargá la página para aplicar las nuevas claves.
            </div>
        `;
		}
	};
	//#endregion
	//#region src/main.js
	async function start() {
		const storage = new Storage();
		const config = await storage.getConfig();
		const app = buildApp(storage, config);
		app.mount();
		if (!config.tornApiKey || !config.w3bUserId) {
			console.warn("[TornW3B] Faltan credenciales — abrí Configuración desde el menú para ingresarlas.");
			return;
		}
		const tornAPI = new TornAPI(config.tornApiKey);
		const w3bAPI = new W3BAPI(config.w3bApiKey);
		const pricelist = new Pricelist({
			w3bAPI,
			storage
		});
		const marketAnalyzer = new MarketAnalyzer(CONFIG.SAMPLE_PERCENTAGE);
		const ratioLearner = new RatioLearner();
		const auditor = new Auditor({
			tornAPI,
			marketAnalyzer,
			ratioLearner,
			storage
		});
		const history = new History({
			tornAPI,
			storage
		});
		const scheduler = new Scheduler({
			auditor,
			pricelist,
			storage,
			history,
			concurrency: 1
		});
		console.log("[TornW3B] Sistema iniciado");
		try {
			const pricelistItems = await pricelist.sync(config.w3bUserId);
			console.log(`[TornW3B] Pricelist sincronizada: ${pricelistItems.items.length} items`);
		} catch (error) {
			console.error("[TornW3B] Error sincronizando pricelist:", error);
			console.warn("[TornW3B] Se usará la pricelist cacheada (si existe).");
		}
		await history.init();
		await scheduler.init();
		scheduler.onAuditComplete = (result) => {
			console.log(`[TornW3B] Auditoría completa: ${result.itemName} → ${result.status}`);
			app.refreshAlertBadge();
		};
		scheduler.onAuditError = (item, error) => {
			console.error(`[TornW3B] Error auditando ${item.name}:`, error);
		};
		scheduler.start();
		Object.assign(app.ctx, {
			tornAPI,
			w3bAPI,
			pricelist,
			marketAnalyzer,
			ratioLearner,
			auditor,
			history,
			scheduler
		});
		window.TornW3B = {
			tornAPI,
			w3bAPI,
			storage,
			pricelist,
			marketAnalyzer,
			ratioLearner,
			auditor,
			history,
			scheduler,
			app
		};
	}
	function buildApp(storage, config) {
		return new App({
			storage,
			config
		}, {
			search,
			sale: saleView,
			audit: auditView,
			history: historyView,
			settings: settingsView
		});
	}
	start();
	//#endregion
})();
