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
		AUDIT_BATCH_SIZE: 10,
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
			const url = `${CONFIG.TORN_API_BASE}${path}${separator}key=` + encodeURIComponent(this.apiKey);
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
			if (userId === null || userId === void 0 || String(userId).trim() === "") throw new Error("W3B User ID es obligatorio.");
			const url = `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;
			return new Promise((resolve, reject) => {
				const headers = {};
				if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
				GM_xmlhttpRequest({
					method: "GET",
					url,
					headers,
					onload: (response) => {
						if (response.status < 200 || response.status >= 300) {
							reject(/* @__PURE__ */ new Error(`W3B API HTTP ${response.status}`));
							return;
						}
						let data;
						try {
							data = JSON.parse(response.responseText);
						} catch (error) {
							reject(/* @__PURE__ */ new Error(`Error parseando respuesta W3B: ${error.message}`));
							return;
						}
						if (!Array.isArray(data)) {
							reject(/* @__PURE__ */ new Error("Formato inesperado de pricelist W3B"));
							return;
						}
						resolve(data);
					},
					onerror: () => {
						reject(/* @__PURE__ */ new Error("No se pudo conectar con W3B API"));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con W3B API"));
					},
					onabort: () => {
						reject(/* @__PURE__ */ new Error("Solicitud a W3B API cancelada"));
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
			this.engine = hasGM() ? "gm" : "localStorage";
		}
		async read(key, fallback) {
			try {
				let raw;
				if (this.engine === "gm") raw = await Promise.resolve(GM_getValue(key, null));
				else raw = localStorage.getItem(key);
				if (raw === null || raw === void 0 || raw === "") return fallback;
				if (typeof raw === "object") return raw;
				return JSON.parse(raw);
			} catch (error) {
				console.warn(`[Storage] Error leyendo ${key}:`, error);
				return fallback;
			}
		}
		async write(key, value) {
			try {
				const serialized = JSON.stringify(value);
				if (this.engine === "gm") await Promise.resolve(GM_setValue(key, serialized));
				else localStorage.setItem(key, serialized);
				return true;
			} catch (error) {
				console.error(`[Storage] Error guardando ${key}:`, error);
				throw error;
			}
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
				items: Array.isArray(items) ? items : [],
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
			if (!audit || !Number.isFinite(Number(audit.itemId))) throw new Error("No se puede guardar una auditoría sin itemId válido.");
			const audits = await this.read(this.auditKey, {});
			audits[Number(audit.itemId)] = audit;
			await this.write(this.auditKey, audits);
			return audit;
		}
		async getAudit(itemId) {
			const numericId = Number(itemId);
			if (!Number.isFinite(numericId)) return null;
			return (await this.read(this.auditKey, {}))[numericId] || null;
		}
		async getAllAudits() {
			return this.read(this.auditKey, {});
		}
		async saveHistory(audit) {
			if (!audit || !Number.isFinite(Number(audit.itemId))) throw new Error("No se puede guardar historial sin itemId válido.");
			const history = await this.read(this.historyKey, {});
			const itemId = Number(audit.itemId);
			if (!Array.isArray(history[itemId])) history[itemId] = [];
			history[itemId].push({
				timestamp: Number(audit.timestamp) || Date.now(),
				realMarketValue: Number(audit.realMarketValue) || null,
				correctBuyPrice: Number(audit.correctBuyPrice) || null,
				learnedRatio: Number(audit.learnedRatio) || null,
				observedRatio: Number(audit.observedRatio) || null,
				w3bBuyPrice: Number(audit.w3bBuyPrice) || null,
				itemValue: Number(audit.itemValue) || null,
				confidence: Number(audit.confidence) || 0,
				status: audit.status || null
			});
			history[itemId] = this.pruneHistory(history[itemId]);
			await this.write(this.historyKey, history);
		}
		async getHistory(itemId) {
			const numericId = Number(itemId);
			if (!Number.isFinite(numericId)) return [];
			const history = await this.read(this.historyKey, {});
			return Array.isArray(history[numericId]) ? history[numericId] : [];
		}
		async getRecentlyUpdatedItems(limit = 10) {
			const history = await this.read(this.historyKey, {});
			return Object.entries(history).map(([itemId, snapshots]) => {
				const last = Array.isArray(snapshots) && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
				return {
					itemId,
					lastHistoryUpdate: Number(last?.timestamp) || 0
				};
			}).sort((a, b) => b.lastHistoryUpdate - a.lastHistoryUpdate).slice(0, Math.max(0, Number(limit) || 10));
		}
		pruneHistory(snapshots) {
			if (!Array.isArray(snapshots)) return [];
			const cutoff = Date.now() - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1e3;
			return snapshots.filter((snapshot) => Number(snapshot?.timestamp) >= cutoff);
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
			this.samplePercentage = Number.isFinite(Number(samplePercentage)) && Number(samplePercentage) > 0 && Number(samplePercentage) <= 1 ? Number(samplePercentage) : .1;
		}
		analyze(rawListings) {
			if (!Array.isArray(rawListings)) return null;
			const listings = rawListings.map((listing) => {
				const price = Number(listing?.price);
				const amount = Number(listing?.amount);
				if (!Number.isFinite(price) || !Number.isFinite(amount) || price <= 0 || amount <= 0) return null;
				return {
					price,
					amount
				};
			}).filter(Boolean).sort((a, b) => a.price - b.price);
			if (listings.length === 0) return null;
			const totalQuantity = listings.reduce((sum, listing) => sum + listing.amount, 0);
			if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return null;
			const sampleTarget = totalQuantity * this.samplePercentage;
			const targetQuantity = Math.max(1, Math.ceil(sampleTarget));
			const sample = [];
			let remaining = targetQuantity;
			for (const listing of listings) {
				if (remaining <= 0) break;
				const quantity = Math.min(listing.amount, remaining);
				if (quantity <= 0) continue;
				sample.push({
					price: listing.price,
					amount: quantity
				});
				remaining -= quantity;
			}
			const sampleQuantity = sample.reduce((sum, listing) => sum + listing.amount, 0);
			if (sample.length === 0 || sampleQuantity <= 0) return null;
			const mean = weightedMean(sample);
			const median = weightedMedian(sample);
			if (!Number.isFinite(mean) || !Number.isFinite(median)) return null;
			const dispersion = calculateDispersion(mean, median);
			let realMarketValue;
			if (dispersion !== null && dispersion <= .15) realMarketValue = (mean + median) / 2;
			else realMarketValue = median;
			if (!Number.isFinite(realMarketValue) || realMarketValue <= 0) return null;
			const confidence = this.calculateConfidence({
				totalQuantity,
				sampleQuantity,
				listingsCount: listings.length,
				dispersion
			});
			return {
				totalQuantity,
				sampleQuantity,
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
			if (Number.isFinite(dispersion)) {
				if (dispersion <= .05) score += 15;
				else if (dispersion <= .1) score += 10;
				else if (dispersion <= .2) score += 5;
			}
			return Math.min(100, Math.max(0, score));
		}
	};
	//#endregion
	//#region src/auditor/ratioLearner.js
	var RatioLearner = class {
		calculateObservedRatio(buyPrice, itemValue) {
			const buy = Number(buyPrice);
			const value = Number(itemValue);
			if (!Number.isFinite(buy) || !Number.isFinite(value) || buy <= 0 || value <= 0) return null;
			return buy / value;
		}
		update(previousRatio, observedRatio) {
			const observed = Number(observedRatio);
			const previous = Number(previousRatio);
			if (!Number.isFinite(observed) || observed <= 0) return Number.isFinite(previous) ? previous : null;
			if (!Number.isFinite(previous) || previous <= 0) return observed;
			const alpha = Number(CONFIG.EWMA_ALPHA);
			const safeAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : .2;
			return safeAlpha * observed + (1 - safeAlpha) * previous;
		}
		calculateCorrectBuyPrice(itemValue, learnedRatio) {
			const value = Number(itemValue);
			const ratio = Number(learnedRatio);
			if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(ratio) || ratio <= 0) return null;
			return value * ratio;
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
			if (!item) throw new Error("No se recibió un artículo para auditar.");
			const itemId = Number(item.itemId);
			const buyPrice = Number(item.buyPrice);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("ID de artículo inválido.");
			if (!Number.isFinite(buyPrice) || buyPrice <= 0) throw new Error(`Precio de compra W3B inválido para ${item.name}.`);
			const itemResponse = await this.tornAPI.getItem(itemId);
			const itemValue = this.extractItem(itemResponse).itemValue;
			const observedRatio = this.ratioLearner.calculateObservedRatio(buyPrice, itemValue);
			if (!Number.isFinite(observedRatio)) throw new Error(`No se pudo calcular el porcentaje W3B para ${item.name}.`);
			const previousAudit = await this.storage.getAudit(itemId);
			const learnedRatio = this.ratioLearner.update(previousAudit?.learnedRatio, observedRatio);
			if (!Number.isFinite(learnedRatio)) throw new Error(`No se pudo determinar el porcentaje aprendido para ${item.name}.`);
			const marketResponse = await this.tornAPI.getItemMarket(itemId);
			const listings = marketResponse?.itemmarket?.listings || [];
			const marketAnalysis = this.marketAnalyzer.analyze(listings);
			if (!marketAnalysis) throw new Error(`No hay suficientes datos de mercado para ${item.name}.`);
			const correctBuyPrice = marketAnalysis.realMarketValue * learnedRatio;
			const differencePercent = correctBuyPrice > 0 ? Math.abs(buyPrice - correctBuyPrice) / correctBuyPrice : null;
			const status = this.calculateStatus(differencePercent);
			const result = {
				itemId,
				itemName: item.name,
				itemValue,
				w3bBuyPrice: buyPrice,
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
			if (!item) throw new Error("Torn API no devolvió información del artículo.");
			const itemValue = Number(item.value?.market_price);
			if (!Number.isFinite(itemValue) || itemValue <= 0) throw new Error(`Item Value inválido para ${item.name}.`);
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
			this.concurrency = Math.max(1, Number(concurrency) || 1);
			this.lastAuditByItem = /* @__PURE__ */ new Map();
			this.invalidItems = /* @__PURE__ */ new Map();
			this.queue = [];
			this.queuedItems = /* @__PURE__ */ new Set();
			this.running = 0;
			this.initialized = false;
			this.intervalHandle = null;
			this.onAuditComplete = null;
			this.onAuditError = null;
		}
		loadInvalidItems() {
			try {
				const raw = localStorage.getItem(INVALID_ITEMS_STORAGE_KEY);
				if (!raw) return;
				const parsed = JSON.parse(raw);
				if (!parsed || typeof parsed !== "object") return;
				for (const [itemId, value] of Object.entries(parsed)) {
					const numericId = Number(itemId);
					if (Number.isFinite(numericId) && numericId > 0) this.invalidItems.set(numericId, value);
				}
			} catch (error) {
				console.warn("[Scheduler] No se pudo cargar lista de inválidos:", error);
			}
		}
		saveInvalidItems() {
			try {
				localStorage.setItem(INVALID_ITEMS_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.invalidItems)));
			} catch (error) {
				console.warn("[Scheduler] No se pudo guardar lista de inválidos:", error);
			}
		}
		markInvalid(item, error) {
			const itemId = Number(item?.itemId);
			if (!Number.isFinite(itemId) || itemId <= 0) return;
			this.invalidItems.set(itemId, {
				name: item?.name || "Artículo desconocido",
				reason: error?.message || "Error desconocido",
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
				const timestamp = Number(audit?.timestamp);
				if (Number.isFinite(timestamp) && timestamp > 0) this.lastAuditByItem.set(Number(itemId), timestamp);
			}
			this.loadInvalidItems();
			this.initialized = true;
			console.log(`[Scheduler] Inicializado: ${this.lastAuditByItem.size} auditorías cacheadas, ${this.invalidItems.size} artículos inválidos.`);
		}
		needsAudit(itemId) {
			const numericId = Number(itemId);
			if (!Number.isFinite(numericId) || numericId <= 0) return false;
			if (this.isInvalid(numericId)) return false;
			const last = this.lastAuditByItem.get(numericId);
			if (!last) return true;
			return Date.now() - last >= CONFIG.AUDIT_INTERVAL;
		}
		async getOrAudit(item) {
			if (!item) return null;
			const itemId = Number(item.itemId);
			if (!Number.isFinite(itemId) || itemId <= 0) throw new Error("Artículo sin ID válido");
			if (this.isInvalid(itemId)) return null;
			if (!this.needsAudit(itemId)) {
				const cached = await this.storage.getAudit(itemId);
				if (cached) return cached;
			}
			return this.auditPriority(item);
		}
		auditPriority(item) {
			return new Promise((resolve, reject) => {
				const itemId = Number(item?.itemId);
				if (!Number.isFinite(itemId) || itemId <= 0) {
					reject(/* @__PURE__ */ new Error("Artículo sin ID válido"));
					return;
				}
				if (this.isInvalid(itemId)) {
					resolve(null);
					return;
				}
				const existing = this.queue.find((queued) => Number(queued.item.itemId) === itemId);
				if (existing) {
					existing.priority = true;
					existing.waiters.push({
						resolve,
						reject
					});
					this.promotePriority(existing);
					this.drain();
					return;
				}
				if (this.queuedItems.has(itemId)) {
					this.runningWaiters = this.runningWaiters || /* @__PURE__ */ new Map();
					if (!this.runningWaiters.has(itemId)) this.runningWaiters.set(itemId, []);
					this.runningWaiters.get(itemId).push({
						resolve,
						reject
					});
					return;
				}
				const queued = {
					item,
					priority: true,
					waiters: [{
						resolve,
						reject
					}]
				};
				this.queue.unshift(queued);
				this.queuedItems.add(itemId);
				this.drain();
			});
		}
		promotePriority(queued) {
			const index = this.queue.indexOf(queued);
			if (index > 0) {
				this.queue.splice(index, 1);
				this.queue.unshift(queued);
			}
		}
		async enqueueDueItems() {
			try {
				const items = await this.pricelist.getAll();
				if (!Array.isArray(items) || items.length === 0) return 0;
				const due = [];
				for (const item of items) {
					if (!item) continue;
					const itemId = Number(item.itemId);
					const buyPrice = Number(item.buyPrice);
					if (!Number.isFinite(itemId) || itemId <= 0 || typeof item.name !== "string" || !item.name.trim() || !Number.isFinite(buyPrice) || buyPrice <= 0) continue;
					if (this.isInvalid(itemId)) continue;
					if (this.queuedItems.has(itemId)) continue;
					if (this.needsAudit(itemId)) due.push(item);
				}
				const batch = due.slice(0, 5);
				for (const item of batch) {
					const itemId = Number(item.itemId);
					this.queue.push({
						item,
						priority: false,
						waiters: []
					});
					this.queuedItems.add(itemId);
				}
				if (batch.length > 0) console.log(`[Scheduler] Auditoría pasiva: ${batch.length} añadidos. Pendientes: ${due.length}`);
				this.drain();
				return batch.length;
			} catch (error) {
				console.error("[Scheduler] Error preparando auditoría pasiva:", error);
				return 0;
			}
		}
		drain() {
			while (this.running < this.concurrency && this.queue.length > 0) {
				const queued = this.queue.shift();
				this.runAudit(queued);
			}
		}
		async runAudit(queued) {
			const item = queued.item;
			const itemId = Number(item.itemId);
			this.running++;
			try {
				if (this.isInvalid(itemId)) {
					const error = /* @__PURE__ */ new Error(`Artículo descartado: ${item.name}`);
					this.resolveWaiters(queued, null, error);
					return;
				}
				if (!this.needsAudit(itemId)) {
					const cached = await this.storage.getAudit(itemId);
					if (cached) {
						this.resolveWaiters(queued, cached, null);
						return;
					}
				}
				console.log(`[Scheduler] Auditando ${item.name} (${itemId})`);
				const result = await this.auditor.audit(item);
				if (result && this.history) await this.history.recordSnapshot(result);
				if (result && Number.isFinite(Number(result.timestamp))) this.lastAuditByItem.set(itemId, Number(result.timestamp));
				if (this.onAuditComplete && result) this.onAuditComplete(result);
				this.resolveWaiters(queued, result, null);
				this.resolveRunningWaiters(itemId, result, null);
			} catch (error) {
				if (this.isPermanentError(error)) {
					this.markInvalid(item, error);
					console.warn(`[TornW3B] ${item.name} descartado permanentemente: ${error.message}`);
				} else if (this.onAuditError) this.onAuditError(item, error);
				else console.error(`[Scheduler] Error auditando ${item.name}:`, error);
				this.resolveWaiters(queued, null, error);
				this.resolveRunningWaiters(itemId, null, error);
			} finally {
				this.queuedItems.delete(itemId);
				this.running--;
				this.drain();
			}
		}
		resolveWaiters(queued, result, error) {
			for (const waiter of queued.waiters || []) try {
				if (error) waiter.reject(error);
				else waiter.resolve(result);
			} catch {}
		}
		resolveRunningWaiters(itemId, result, error) {
			if (!this.runningWaiters) return;
			const waiters = this.runningWaiters.get(itemId);
			if (!waiters) return;
			this.runningWaiters.delete(itemId);
			for (const waiter of waiters) try {
				if (error) waiter.reject(error);
				else waiter.resolve(result);
			} catch {}
		}
		isPermanentError(error) {
			const message = String(error?.message || "");
			return error?.code === "INVALID_ID" || message === "Incorrect ID" || message.startsWith("Item Value inválido") || message.startsWith("No se pudo obtener Item Value") || message.startsWith("Artículo sin ID válido");
		}
		start() {
			if (!this.initialized) console.warn("[Scheduler] start() llamado sin init().");
			this.enqueueDueItems();
			this.intervalHandle = setInterval(() => {
				this.enqueueDueItems();
			}, CONFIG.AUDIT_INTERVAL);
			console.log("[Scheduler] Auditoría pasiva iniciada.");
		}
		stop() {
			if (this.intervalHandle) {
				clearInterval(this.intervalHandle);
				this.intervalHandle = null;
			}
			console.log("[Scheduler] Auditoría pasiva detenida.");
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
			const response = await this.tornAPI.getTimestamp();
			const timestamp = Number(response?.timestamp);
			const validTimestamp = Number.isFinite(timestamp) ? timestamp : Math.floor(Date.now() / 1e3);
			return Math.floor(validTimestamp / 86400);
		}
		async init() {
			const history = await this.storage.getAllHistory();
			this.lastDayByItem.clear();
			for (const [itemId, snapshots] of Object.entries(history)) {
				if (!Array.isArray(snapshots) || snapshots.length === 0) continue;
				const last = snapshots[snapshots.length - 1];
				if (!last || !Number.isFinite(Number(last.timestamp))) continue;
				const day = Math.floor(Number(last.timestamp) / 864e5);
				this.lastDayByItem.set(Number(itemId), day);
			}
			this.initialized = true;
		}
		async recordSnapshot(audit) {
			if (!audit || !Number.isFinite(Number(audit.itemId))) return null;
			if (!this.initialized) await this.init();
			const itemId = Number(audit.itemId);
			const tornDay = await this.getTornDay();
			if (this.lastDayByItem.get(itemId) === tornDay) return null;
			const snapshot = {
				...audit,
				timestamp: Number.isFinite(Number(audit.timestamp)) ? Number(audit.timestamp) : Date.now()
			};
			await this.storage.saveHistory(snapshot);
			this.lastDayByItem.set(itemId, tornDay);
			return snapshot;
		}
		async getSeries(itemId) {
			return (await this.storage.getHistory(Number(itemId))).filter((snapshot) => snapshot && Number.isFinite(Number(snapshot.timestamp))).map((snapshot) => ({
				timestamp: Number(snapshot.timestamp),
				realMarketValue: Number(snapshot.realMarketValue),
				correctBuyPrice: Number(snapshot.correctBuyPrice)
			}));
		}
		async getSummary(itemId) {
			const history = await this.storage.getHistory(Number(itemId));
			const now = Date.now();
			const day = 864e5;
			const buckets = {
				yesterday: [],
				last7d: [],
				last30d: [],
				last6m: []
			};
			for (const snapshot of history) {
				if (!snapshot || !Number.isFinite(Number(snapshot.timestamp))) continue;
				const age = now - Number(snapshot.timestamp);
				if (age > day && age <= 2 * day) buckets.yesterday.push(snapshot);
				if (age >= 0 && age <= 7 * day) buckets.last7d.push(snapshot);
				if (age >= 0 && age <= 30 * day) buckets.last30d.push(snapshot);
				if (age >= 0 && age <= 180 * day) buckets.last6m.push(snapshot);
			}
			return {
				yesterday: this.aggregate(buckets.yesterday),
				last7d: this.aggregate(buckets.last7d),
				last30d: this.aggregate(buckets.last30d),
				last6m: this.aggregate(buckets.last6m)
			};
		}
		aggregate(snapshots) {
			if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
			const count = snapshots.length;
			const sum = (key) => snapshots.reduce((total, snapshot) => {
				const value = Number(snapshot?.[key]);
				return total + (Number.isFinite(value) ? value : 0);
			}, 0);
			const latest = snapshots.filter((snapshot) => Number.isFinite(Number(snapshot?.timestamp))).sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).at(-1);
			return {
				avgRealMarketValue: sum("realMarketValue") / count,
				avgCorrectBuyPrice: sum("correctBuyPrice") / count,
				avgLearnedRatio: sum("learnedRatio") / count,
				latestW3bBuyPrice: latest?.w3bBuyPrice ?? null,
				latestConfidence: latest?.confidence ?? null,
				latestStatus: latest?.status ?? null,
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
			this.fab = null;
			this.panel = null;
			this.panelBody = null;
			this.searchInput = null;
			this.iconBar = null;
		}
		mount() {
			injectStyles();
			this.fab = document.createElement("button");
			this.fab.className = "tw3b-fab";
			this.fab.type = "button";
			this.fab.innerHTML = "💰";
			this.fab.setAttribute("aria-label", "Abrir TornW3B Trader");
			this.fab.addEventListener("click", () => this.toggle());
			this.panel = document.createElement("div");
			this.panel.className = "tw3b-panel";
			this.panelBody = document.createElement("div");
			this.panelBody.className = "tw3b-panel-body";
			this.panel.appendChild(this.panelBody);
			document.body.appendChild(this.fab);
			document.body.appendChild(this.panel);
			this.renderMenu();
			this.refreshAlertBadge();
		}
		toggle() {
			if (this.panel.classList.contains("open")) this.close();
			else this.open();
		}
		open() {
			this.panel.classList.add("open");
			if (this.searchInput) setTimeout(() => {
				this.searchInput.focus();
			}, 100);
		}
		close() {
			this.panel.classList.remove("open");
			this.hideSuggestions();
		}
		renderMenu() {
			this.currentView = VIEWS.MENU;
			this.activeViewInstance = null;
			this.panelBody.innerHTML = "";
			const toolbar = document.createElement("div");
			toolbar.className = "tw3b-toolbar";
			const searchWrapper = document.createElement("div");
			searchWrapper.className = "tw3b-search-wrapper";
			this.searchInput = document.createElement("input");
			this.searchInput.className = "tw3b-search";
			this.searchInput.type = "text";
			this.searchInput.placeholder = "🔎 Buscar artículo...";
			this.searchInput.autocomplete = "off";
			this.searchInput.addEventListener("input", (event) => {
				this.handleSearch(event.target.value);
			});
			searchWrapper.appendChild(this.searchInput);
			this.iconBar = document.createElement("div");
			this.iconBar.className = "tw3b-icon-bar";
			this.createIconButton({
				icon: "🛡️",
				title: "Auditoría",
				view: VIEWS.AUDIT,
				badge: true
			});
			this.createIconButton({
				icon: "📜",
				title: "Historial",
				view: VIEWS.HISTORY
			});
			this.createIconButton({
				icon: "⚙️",
				title: "Configuración",
				view: VIEWS.SETTINGS
			});
			toolbar.appendChild(searchWrapper);
			toolbar.appendChild(this.iconBar);
			this.panelBody.appendChild(toolbar);
			this.refreshAlertBadge();
		}
		createIconButton({ icon, title, view, badge = false }) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "tw3b-icon-button";
			button.title = title;
			button.setAttribute("aria-label", title);
			const iconElement = document.createElement("span");
			iconElement.className = "tw3b-icon";
			iconElement.textContent = icon;
			button.appendChild(iconElement);
			if (badge) {
				const badgeElement = document.createElement("span");
				badgeElement.className = "tw3b-icon-badge";
				badgeElement.id = "tw3b-alert-count";
				badgeElement.textContent = "0";
				badgeElement.style.display = "none";
				button.appendChild(badgeElement);
			}
			button.addEventListener("click", () => {
				this.navigate(view);
			});
			this.iconBar.appendChild(button);
			return button;
		}
		handleSearch(query) {
			const searchModule = this.views.search;
			if (!searchModule || typeof searchModule.onQuery !== "function") return;
			searchModule.onQuery(query, this.ctx, async (item) => {
				await this.selectSearchItem(item);
			}, this.searchInput);
		}
		async selectSearchItem(item) {
			if (!item) return;
			this.hideSuggestions();
			if (!this.ctx.scheduler) {
				console.warn("[TornW3B] Scheduler todavía no está disponible.");
				return;
			}
			this.showLoading(item.name);
			try {
				console.log(`[TornW3B] Auditoría prioritaria: ${item.name}`);
				const result = await this.ctx.scheduler.getOrAudit(item);
				if (!result) {
					this.showError(item.name, "Este artículo no puede ser auditado por Torn.");
					return;
				}
				await this.navigate(VIEWS.SALE, {
					item,
					audit: result
				});
			} catch (error) {
				console.error(`[TornW3B] Error procesando ${item.name}:`, error);
				this.showError(item.name, error?.message || "No se pudo auditar el artículo.");
			}
		}
		showLoading(itemName) {
			this.panelBody.innerHTML = `
            <div class="tw3b-loading">

                <div class="tw3b-card-title">
                    ${escapeHtml$4(itemName)}
                </div>

                <div class="tw3b-skeleton"></div>

                <div class="tw3b-loading-text">
                    🔄 Analizando mercado...
                </div>

            </div>
        `;
		}
		showError(itemName, message) {
			this.panelBody.innerHTML = `

            <div class="tw3b-error-view">

                <div class="tw3b-card-title">
                    ${escapeHtml$4(itemName)}
                </div>

                <div class="tw3b-error">
                    ${escapeHtml$4(message)}
                </div>

                <button
                    type="button"
                    class="tw3b-button"
                    data-action="back-menu"
                >
                    ← Volver
                </button>

            </div>

        `;
			const back = this.panelBody.querySelector("[data-action=\"back-menu\"]");
			if (back) back.addEventListener("click", () => this.renderMenu());
		}
		async navigate(viewName, params = {}) {
			if (this.activeViewInstance && typeof this.activeViewInstance.destroy === "function") this.activeViewInstance.destroy();
			this.activeViewInstance = null;
			this.currentView = viewName;
			this.hideSuggestions();
			this.panelBody.innerHTML = "";
			if (viewName === VIEWS.MENU) {
				this.renderMenu();
				return;
			}
			const view = this.views[viewName];
			if (!view || typeof view.render !== "function") {
				this.showError("TornW3B", `Vista "${viewName}" no disponible.`);
				return;
			}
			const back = document.createElement("button");
			back.type = "button";
			back.className = "tw3b-back";
			back.innerHTML = "←";
			back.title = "Volver";
			back.setAttribute("aria-label", "Volver");
			back.addEventListener("click", () => {
				this.navigate(VIEWS.MENU);
			});
			this.panelBody.appendChild(back);
			const container = document.createElement("div");
			container.className = "tw3b-view-container";
			this.panelBody.appendChild(container);
			this.activeViewInstance = await view.render(container, this.ctx, (nextView, nextParams) => {
				this.navigate(nextView, nextParams);
			}, params) || null;
		}
		hideSuggestions() {
			const suggestions = document.getElementById("tw3b-suggestions");
			if (suggestions) suggestions.style.display = "none";
		}
		async refreshAlertBadge() {
			if (!this.ctx.storage) return;
			try {
				const audits = await this.ctx.storage.getAllAudits();
				const alertCount = Object.values(audits).filter((audit) => audit && (audit.status === "RED" || audit.status === "YELLOW")).length;
				const badge = this.panelBody.querySelector("#tw3b-alert-count");
				if (badge) {
					badge.textContent = String(alertCount);
					badge.style.display = alertCount > 0 ? "flex" : "none";
				}
				if (this.fab) this.fab.classList.toggle("has-alerts", alertCount > 0);
			} catch (error) {
				console.warn("[TornW3B] No se pudo actualizar badge:", error);
			}
		}
	};
	function escapeHtml$4(str) {
		const div = document.createElement("div");
		div.textContent = String(str ?? "");
		return div.innerHTML;
	}
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
		if (!items.length) {
			container.style.display = "none";
			return;
		}
		container.style.display = "block";
		for (const item of items) {
			const row = document.createElement("div");
			row.className = "tw3b-suggestion-item";
			row.innerHTML = `
            <span class="tw3b-suggestion-name">
                ${escapeHtml$3(item.name)}
            </span>

            <span class="tw3b-suggestion-price">
                ${formatMoney(item.buyPrice)}
            </span>
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
		div.textContent = String(str ?? "");
		return div.innerHTML;
	}
	var search = { onQuery(query, ctx, onSelect, anchorEl) {
		clearTimeout(debounceHandle);
		const container = getSuggestionsContainer(anchorEl);
		const normalizedQuery = String(query ?? "").trim();
		if (normalizedQuery.length < CONFIG.SEARCH_MIN_LENGTH) {
			container.innerHTML = "";
			container.style.display = "none";
			return;
		}
		if (!ctx?.pricelist || typeof ctx.pricelist.search !== "function") {
			container.innerHTML = `
                <div class="tw3b-card-sub">
                    Cargando pricelist...
                </div>
            `;
			container.style.display = "block";
			return;
		}
		debounceHandle = setTimeout(async () => {
			try {
				if (!ctx?.pricelist || typeof ctx.pricelist.search !== "function") {
					container.style.display = "none";
					return;
				}
				const results = await ctx.pricelist.search(normalizedQuery);
				renderSuggestions(container, results.slice(0, 8), onSelect);
			} catch (error) {
				console.error("[TornW3B] Error buscando artículo:", error);
				container.innerHTML = "";
				container.style.display = "none";
			}
		}, 200);
	} };
	//#endregion
	//#region src/ui/saleView.js
	var saleView = { async render(container, ctx, navigate, params = {}) {
		const item = params.item;
		const audit = params.audit;
		if (!item) {
			container.innerHTML = `
                <div class="tw3b-error">
                    Buscá un artículo desde el menú principal primero.
                </div>
            `;
			return null;
		}
		if (!audit) {
			container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml$2(item.name)}
                </div>

                <div class="tw3b-error">
                    No se recibió información de auditoría.
                </div>
            `;
			return null;
		}
		if (!Number.isFinite(Number(audit.itemValue)) || Number(audit.itemValue) <= 0) {
			container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml$2(item.name)}
                </div>

                <div class="tw3b-error">
                    Torn no devolvió un Item Value válido para este artículo.
                </div>
            `;
			return null;
		}
		const itemValue = Number(audit.itemValue);
		const w3bPercent = Number(item.buyPrice) / itemValue;
		const discountPercent = 1 - w3bPercent;
		const sellDiscount = discountPercent / 2;
		const sellPercent = 1 - sellDiscount;
		const sellPrice = itemValue * sellPercent;
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
                    Item Value
                </span>

                <span>
                    ${formatMoney(itemValue)}
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    W3B %
                </span>

                <span>
                    ${formatPercent(w3bPercent)}
                    (${formatPercent(-discountPercent)})
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell %
                </span>

                <span>
                    ${formatPercent(sellPercent)}
                    (${formatPercent(-sellDiscount)})
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
		if (copyBtn) copyBtn.addEventListener("click", async () => {
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
		div.textContent = String(str ?? "");
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
            <input
                type="text"
                class="tw3b-search"
                id="tw3b-audit-filter"
                placeholder="🔎 Filtrar por nombre..."
            >

            <div id="tw3b-audit-list">

                <div class="tw3b-skeleton"></div>
                <div class="tw3b-skeleton"></div>

            </div>
        `;
			let audits;
			try {
				audits = await ctx.storage.getAllAudits();
			} catch (error) {
				console.error("[TornW3B] Error cargando auditorías:", error);
				container.querySelector("#tw3b-audit-list").innerHTML = `
                <div class="tw3b-error">
                    No se pudieron cargar las auditorías.
                </div>
            `;
				return null;
			}
			const order = {
				RED: 0,
				YELLOW: 1,
				GREEN: 2
			};
			const list = Object.values(audits || {}).filter(Boolean).sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
			const listEl = container.querySelector("#tw3b-audit-list");
			const renderItems = (filterText = "") => {
				const normalizedFilter = String(filterText).trim().toLowerCase();
				const filtered = normalizedFilter ? list.filter((audit) => String(audit?.itemName || "").toLowerCase().includes(normalizedFilter)) : list;
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
					const confidence = Number(audit.confidence);
					const confidenceText = Number.isFinite(confidence) ? `${confidence}%` : "-";
					card.innerHTML = `

                        <div class="tw3b-card-title">

                            ${escapeHtml$1(audit.itemName)}

                            <span class="${statusBadgeClass(audit.status)}">
                                ${escapeHtml$1(audit.status)}
                            </span>

                        </div>


                        <div class="tw3b-card-sub">

                            ${formatMoney(Number(audit.w3bBuyPrice))}

                            →

                            ${formatMoney(Number(audit.correctBuyPrice))}

                            · confianza
                            ${confidenceText}

                        </div>
                    `;
					card.addEventListener("click", () => {
						navigate("audit", { itemId: audit.itemId });
					});
					listEl.appendChild(card);
				}
			};
			renderItems();
			container.querySelector("#tw3b-audit-filter").addEventListener("input", (event) => {
				renderItems(event.target.value);
			});
			return null;
		},
		async renderDetail(container, ctx, navigate, itemId) {
			container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;
			let audit;
			try {
				audit = await ctx.storage.getAudit(itemId);
			} catch (error) {
				console.error("[TornW3B] Error obteniendo auditoría:", error);
				container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar la auditoría.
                </div>
            `;
				return null;
			}
			if (!audit) {
				container.innerHTML = `
                <div class="tw3b-error">
                    No hay datos de auditoría
                    para este artículo.
                </div>
            `;
				return null;
			}
			const confidence = Number(audit.confidence);
			const confidenceText = Number.isFinite(confidence) ? `${confidence}%` : "-";
			container.innerHTML = `

            <div class="tw3b-card-title">
                ${escapeHtml$1(audit.itemName)}
            </div>


            ${row("Item Value", formatMoney(Number(audit.itemValue)))}


            ${row("W3B Buy", formatMoney(Number(audit.w3bBuyPrice)))}


            ${row("Observed W3B", formatPercent(Number(audit.observedRatio)))}


            ${row("Learned W3B", formatPercent(Number(audit.learnedRatio)))}


            ${row("Market Units", formatNumber(audit.totalMarketQuantity))}


            ${row("Sample", formatNumber(audit.sampleQuantity))}


            ${row("Weighted Mean", formatMoney(Number(audit.weightedMean)))}


            ${row("Weighted Median", formatMoney(Number(audit.weightedMedian)))}


            ${row("Real Market Value", formatMoney(Number(audit.realMarketValue)))}


            ${row("Correct Buy", formatMoney(Number(audit.correctBuyPrice)))}


            ${row("Difference", formatPercent(Number(audit.differencePercent)))}


            ${row("Confidence", confidenceText)}


            ${row("Status", `
                    <span class="${statusBadgeClass(audit.status)}">
                        ${escapeHtml$1(audit.status)}
                    </span>
                `)}


            <button
                class="tw3b-button"
                id="tw3b-view-history"
                style="margin-top: 10px;"
            >
                Ver historial
            </button>
        `;
			container.querySelector("#tw3b-view-history").addEventListener("click", () => {
				navigate("history", { itemId: audit.itemId });
			});
			return null;
		}
	};
	function row(label, value) {
		return `
        <div class="tw3b-row">

            <span class="tw3b-row-label">
                ${escapeHtml$1(label)}
            </span>

            <span>
                ${value}
            </span>

        </div>
    `;
	}
	function formatNumber(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return "-";
		return number.toLocaleString("en-US");
	}
	function escapeHtml$1(str) {
		const div = document.createElement("div");
		div.textContent = String(str ?? "");
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
			container.innerHTML = `
            <div class="tw3b-skeleton"></div>
        `;
			let recent;
			try {
				recent = await ctx.history.getRecentlyUpdated(10);
			} catch (error) {
				console.error("[TornW3B] Error cargando historial reciente:", error);
				container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar el historial.
                </div>
            `;
				return null;
			}
			if (!Array.isArray(recent) || recent.length === 0) {
				container.innerHTML = `
                <div class="tw3b-card-sub">
                    Todavía no hay historial registrado.
                </div>
            `;
				return null;
			}
			let audits = {};
			try {
				audits = await ctx.storage.getAllAudits();
			} catch (error) {
				console.warn("[TornW3B] No se pudieron cargar las auditorías:", error);
			}
			container.innerHTML = "";
			for (const entry of recent) {
				if (!entry) continue;
				const itemId = Number(entry.itemId);
				const itemName = (audits?.[entry.itemId] || audits?.[itemId])?.itemName || `Item ${itemId}`;
				const timestamp = Number(entry.lastHistoryUpdate);
				const dateText = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : "-";
				const card = document.createElement("div");
				card.className = "tw3b-card";
				card.innerHTML = `

                <div class="tw3b-card-title">
                    ${escapeHtml(itemName)}
                </div>


                <div class="tw3b-card-sub">
                    Última actualización:
                    ${escapeHtml(dateText)}
                </div>

            `;
				card.addEventListener("click", () => {
					navigate("history", { itemId });
				});
				container.appendChild(card);
			}
			return null;
		},
		async renderDetail(container, ctx, navigate, itemId) {
			container.innerHTML = `

            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>

        `;
			let summary;
			let series;
			let audit;
			try {
				[summary, series, audit] = await Promise.all([
					ctx.history.getSummary(itemId),
					ctx.history.getSeries(itemId),
					ctx.storage.getAudit(itemId)
				]);
			} catch (error) {
				console.error("[TornW3B] Error cargando detalle del historial:", error);
				container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar el historial
                    de este artículo.
                </div>
            `;
				return null;
			}
			if (!Array.isArray(series) || series.length === 0) {
				container.innerHTML = `
                <div class="tw3b-card-sub">
                    No hay historial para este artículo todavía.
                </div>
            `;
				return null;
			}
			container.innerHTML = `

            <div class="tw3b-card-title">
                ${escapeHtml(audit?.itemName || `Item ${itemId}`)}
            </div>


            ${summaryRow("Ayer", summary?.yesterday)}


            ${summaryRow("Últimos 7 días", summary?.last7d)}


            ${summaryRow("Últimos 30 días", summary?.last30d)}


            ${summaryRow("Últimos 6 meses", summary?.last6m)}


            <div
                class="tw3b-card-sub"
                style="margin-top: 10px;"
            >
                Evolución (Real Market Value)
            </div>


            <div id="tw3b-history-series"></div>

        `;
			const seriesEl = container.querySelector("#tw3b-history-series");
			const visibleSeries = series.slice(-15);
			for (const point of visibleSeries) {
				if (!point) continue;
				const timestamp = Number(point.timestamp);
				const dateText = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : "-";
				const row = document.createElement("div");
				row.className = "tw3b-row";
				row.innerHTML = `

                <span class="tw3b-row-label">
                    ${escapeHtml(dateText)}
                </span>


                <span>
                    ${formatMoney(Number(point.realMarketValue))}
                </span>

            `;
				seriesEl.appendChild(row);
			}
			return null;
		}
	};
	function summaryRow(label, data) {
		if (!data) return `

            <div class="tw3b-row">

                <span class="tw3b-row-label">
                    ${escapeHtml(label)}
                </span>

                <span class="tw3b-card-sub">
                    Sin datos
                </span>

            </div>

        `;
		const samples = Number(data.samples);
		const samplesText = Number.isFinite(samples) ? samples : 0;
		return `

        <div class="tw3b-row">

            <span class="tw3b-row-label">
                ${escapeHtml(label)}
            </span>

            <span>
                ${formatMoney(Number(data.avgRealMarketValue))}

                ·

                ${samplesText}
                muestras
            </span>

        </div>

    `;
	}
	function escapeHtml(str) {
		const div = document.createElement("div");
		div.textContent = String(str ?? "");
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
		console.log("[TornW3B] Dependencias inicializadas");
		try {
			const pricelistItems = await pricelist.sync(config.w3bUserId);
			console.log(`[TornW3B] Pricelist sincronizada: ${pricelistItems.items.length} items`);
		} catch (error) {
			console.error("[TornW3B] Error sincronizando pricelist:", error);
			console.warn("[TornW3B] Se utilizará la pricelist cacheada (si existe).");
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
		scheduler.start();
		await app.refreshAlertBadge();
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
		console.log("[TornW3B] Sistema iniciado correctamente");
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
	start().catch((error) => {
		console.error("[TornW3B] Error fatal al iniciar:", error);
	});
	//#endregion
})();
