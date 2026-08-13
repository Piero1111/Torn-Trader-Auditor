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
		AUDIT_HISTORY_HOURS: 48,
		SEARCH_MIN_LENGTH: 2
	};
	//#endregion
	//#region src/api/torn.js
	var TornAPI = class {
		constructor(apiKey) {
			console.log("[TornPDA] PDA_httpGet:", typeof PDA_httpGet);
			if (typeof PDA_httpGet === "function") PDA_httpGet("https://api.torn.com/v2/torn/12/items?key=" + encodeURIComponent(apiKey)).then((response) => {
				console.log("[TornPDA TEST] response:", response);
				console.log("[TornPDA TEST] typeof:", typeof response);
				console.log("[TornPDA TEST] keys:", Object.keys(response || {}));
				console.log("[TornPDA TEST] JSON:", JSON.stringify(response));
			}).catch((error) => {
				console.error("[TornPDA TEST] PDA_httpGet error:", error);
			});
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
			if (typeof PDA_httpGet === "function") return PDA_httpGet(url).then((response) => {
				console.log("[TornAPI] PDA:", path, "STATUS:", response?.status);
				let data;
				try {
					data = JSON.parse(response.responseText);
				} catch {
					throw new Error("Respuesta inválida de Torn API");
				}
				return this.processResponse(data, response.status);
			});
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "GET",
					url,
					timeout: 3e4,
					onload: (response) => {
						console.log("[TornAPI] GM:", path, "STATUS:", response?.status);
						let data;
						try {
							data = JSON.parse(response.responseText);
						} catch {
							reject(/* @__PURE__ */ new Error("Respuesta inválida de Torn API"));
							return;
						}
						try {
							resolve(this.processResponse(data, response.status));
						} catch (error) {
							reject(error);
						}
					},
					onerror: (error) => {
						console.error("[TornAPI] GM ONERROR:", path, error);
						reject(/* @__PURE__ */ new Error(`No se pudo conectar con Torn API: ${path}`));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con Torn API"));
					}
				});
			});
		}
		processResponse(data, status) {
			if (data?.error?.error === "Too many requests") {
				const error = /* @__PURE__ */ new Error("Too many requests");
				error.code = "RATE_LIMIT";
				throw error;
			}
			if (status < 200 || status >= 300) throw new Error(`Torn API HTTP ${status}`);
			if (data?.error) {
				const error = new Error(data.error.error || "Torn API error");
				if (data.error.error === "Incorrect ID") error.code = "INVALID_ID";
				throw error;
			}
			return data;
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
		getHeaders() {
			const headers = {};
			if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
			return headers;
		}
		async getPricelist(userId) {
			if (userId === null || userId === void 0 || String(userId).trim() === "") throw new Error("W3B User ID es obligatorio.");
			const url = `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "GET",
					url,
					headers: this.getHeaders(),
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
		async updatePricelist(userId, items) {
			if (userId === null || userId === void 0 || String(userId).trim() === "") throw new Error("W3B User ID es obligatorio.");
			if (!Array.isArray(items) || items.length === 0) throw new Error("Debe proporcionarse al menos un artículo para actualizar.");
			const normalizedItems = items.map((item) => {
				if (!item) throw new Error("Artículo inválido para actualizar Pricelist W3B.");
				const itemID = Number(item.itemID);
				if (!Number.isInteger(itemID) || itemID <= 0) throw new Error("Item ID inválido para actualizar Pricelist W3B.");
				if (item.pricingType !== "fixed") throw new Error(`Pricing type inválido para el artículo ${itemID}.`);
				const pricingValue = Number(item.pricingValue);
				if (!Number.isFinite(pricingValue) || pricingValue <= 0) throw new Error(`Precio inválido para el artículo ${itemID}.`);
				return {
					itemID,
					pricingType: "fixed",
					pricingValue: Math.round(pricingValue)
				};
			});
			const url = `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;
			const body = { items: normalizedItems };
			const headers = { "Content-Type": "application/json" };
			if (this.apiKey) headers["X-API-Key"] = this.apiKey;
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "PUT",
					url,
					headers,
					data: JSON.stringify(body),
					onload: (response) => {
						if (response.status < 200 || response.status >= 300) {
							reject(/* @__PURE__ */ new Error(`W3B Pricelist API HTTP ${response.status}`));
							return;
						}
						if (!response.responseText) {
							resolve(null);
							return;
						}
						let data;
						try {
							data = JSON.parse(response.responseText);
						} catch (error) {
							reject(/* @__PURE__ */ new Error(`Error parseando respuesta Pricelist W3B: ${error.message}`));
							return;
						}
						resolve(data);
					},
					onerror: () => {
						reject(/* @__PURE__ */ new Error("No se pudo conectar con W3B Pricelist API"));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con W3B Pricelist API"));
					},
					onabort: () => {
						reject(/* @__PURE__ */ new Error("Solicitud de actualización de Pricelist W3B cancelada"));
					}
				});
			});
		}
		async getMarketplace(itemId) {
			if (itemId === null || itemId === void 0 || String(itemId).trim() === "") throw new Error("Item ID es obligatorio.");
			const url = `${CONFIG.W3B_API_BASE}/marketplace/${encodeURIComponent(itemId)}`;
			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method: "GET",
					url,
					headers: this.getHeaders(),
					onload: (response) => {
						if (response.status < 200 || response.status >= 300) {
							reject(/* @__PURE__ */ new Error(`W3B Marketplace API HTTP ${response.status}`));
							return;
						}
						let data;
						try {
							data = JSON.parse(response.responseText);
						} catch (error) {
							reject(/* @__PURE__ */ new Error(`Error parseando respuesta Marketplace W3B: ${error.message}`));
							return;
						}
						if (!data || typeof data !== "object" || !Array.isArray(data.listings)) {
							reject(/* @__PURE__ */ new Error("Formato inesperado de Marketplace W3B"));
							return;
						}
						resolve({
							...data,
							item_id: Number(data.item_id),
							market_price: Number(data.market_price),
							bazaar_average: Number(data.bazaar_average),
							generated_at: Number(data.generated_at),
							listings: data.listings.map((listing) => ({
								...listing,
								item_id: Number(listing.item_id),
								player_id: Number(listing.player_id),
								quantity: Number(listing.quantity),
								price: Number(listing.price),
								content_updated: Number(listing.content_updated),
								last_checked: Number(listing.last_checked)
							})).filter((listing) => Number.isFinite(listing.price) && Number.isFinite(listing.quantity) && listing.quantity > 0)
						});
					},
					onerror: () => {
						reject(/* @__PURE__ */ new Error("No se pudo conectar con W3B Marketplace API"));
					},
					ontimeout: () => {
						reject(/* @__PURE__ */ new Error("Timeout conectando con W3B Marketplace API"));
					},
					onabort: () => {
						reject(/* @__PURE__ */ new Error("Solicitud a W3B Marketplace API cancelada"));
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
			this.auditHistoryKey = `${PREFIX}audit_history`;
			this.internalPriceKey = `${PREFIX}internal_prices`;
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
			const itemId = Number(audit?.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("No se puede guardar una auditoría sin itemId válido.");
			const audits = await this.read(this.auditKey, {});
			audits[itemId] = audit;
			await this.write(this.auditKey, audits);
			return audit;
		}
		async getAudit(itemId) {
			const numericId = Number(itemId);
			if (!Number.isInteger(numericId) || numericId <= 0) return null;
			return (await this.read(this.auditKey, {}))[numericId] || null;
		}
		async getAllAudits() {
			return this.read(this.auditKey, {});
		}
		async saveHistory(audit) {
			const itemId = Number(audit?.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("No se puede guardar historial sin itemId válido.");
			const history = await this.read(this.historyKey, {});
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
			if (!Number.isInteger(numericId) || numericId <= 0) return [];
			const history = await this.read(this.historyKey, {});
			return Array.isArray(history[numericId]) ? history[numericId] : [];
		}
		async saveAuditHistory(audit) {
			const itemId = Number(audit?.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("No se puede guardar historial de auditoría sin itemId válido.");
			const store = await this.read(this.auditHistoryKey, {});
			if (!Array.isArray(store[itemId])) store[itemId] = [];
			store[itemId].push({
				timestamp: Number(audit.timestamp) || Date.now(),
				realMarketValue: Number(audit.realMarketValue) || null,
				correctBuyPrice: Number(audit.correctBuyPrice) || null,
				w3bBuyPrice: Number(audit.w3bBuyPrice) || null,
				learnedRatio: Number(audit.learnedRatio) || null,
				observedRatio: Number(audit.observedRatio) || null,
				confidence: Number(audit.confidence) || 0,
				status: audit.status || null
			});
			store[itemId] = this.pruneAuditHistory(store[itemId]);
			await this.write(this.auditHistoryKey, store);
		}
		async getAuditHistory(itemId) {
			const numericId = Number(itemId);
			if (!Number.isInteger(numericId) || numericId <= 0) return [];
			const store = await this.read(this.auditHistoryKey, {});
			return Array.isArray(store[numericId]) ? store[numericId] : [];
		}
		async saveInternalPrice(priceData) {
			const itemId = Number(priceData?.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("No se puede guardar el precio interno sin itemId válido.");
			const prices = await this.read(this.internalPriceKey, {});
			prices[itemId] = priceData;
			await this.write(this.internalPriceKey, prices);
			return priceData;
		}
		async getInternalPrice(itemId) {
			const numericId = Number(itemId);
			if (!Number.isInteger(numericId) || numericId <= 0) return null;
			return (await this.read(this.internalPriceKey, {}))[numericId] || null;
		}
		pruneAuditHistory(entries) {
			if (!Array.isArray(entries)) return [];
			const cutoff = Date.now() - CONFIG.AUDIT_HISTORY_HOURS * 60 * 60 * 1e3;
			return entries.filter((entry) => Number(entry?.timestamp) >= cutoff);
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
		async resetAll() {
			const keys = [
				this.configKey,
				this.pricelistKey,
				this.auditKey,
				this.historyKey,
				this.auditHistoryKey,
				this.internalPriceKey
			];
			for (const key of keys) try {
				if (this.engine === "gm") {
					if (typeof GM_deleteValue === "function") await Promise.resolve(GM_deleteValue(key));
					else await Promise.resolve(GM_setValue(key, ""));
				} else localStorage.removeItem(key);
			} catch (error) {
				console.warn(`[Storage] Error borrando ${key}:`, error);
			}
			try {
				localStorage.removeItem("tornw3b-invalid-items");
			} catch (error) {
				console.warn("[Storage] Error borrando lista de artículos inválidos:", error);
			}
			return true;
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
			console.log("[TornW3B] W3B raw:", raw);
			console.log(`[TornW3B] W3B devolvió ${Array.isArray(raw) ? raw.length : 0} items`);
			const items = this.normalize(raw);
			console.log(`[TornW3B] Después de normalizar: ${items.length} items`);
			const discarded = (Array.isArray(raw) ? raw.length : 0) - items.length;
			console.log(`[TornW3B] Descartados: ${discarded}`);
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
		async updatePrice(userId, itemId, buyPrice) {
			const id = Number(itemId);
			if (!Number.isInteger(id) || id <= 0) throw new Error("ID de artículo inválido.");
			const price = Number(buyPrice);
			if (!Number.isFinite(price) || price <= 0) throw new Error(`Precio inválido para el artículo ${id}.`);
			const fixedPrice = Math.round(price);
			const response = await this.w3bAPI.updatePricelist(userId, [{
				itemID: id,
				pricingValue: fixedPrice
			}]);
			const updatedItems = (await this.getAll()).map((item) => {
				if (item.itemId !== id) return item;
				return {
					...item,
					buyPrice: fixedPrice
				};
			});
			await this.storage.savePricelist(updatedItems);
			return {
				itemId: id,
				buyPrice: fixedPrice,
				w3b: response
			};
		}
	};
	//#endregion
	//#region src/data/internalPriceList.js
	var InternalPriceList = class {
		constructor(storage) {
			this.storage = storage;
		}
		async get(itemId) {
			const id = Number(itemId);
			if (!Number.isInteger(id) || id <= 0) throw new Error("ID de artículo inválido.");
			return await this.storage.getInternalPrice(id);
		}
		async save(priceData) {
			if (!priceData) throw new Error("No se recibió información de precio interno.");
			const itemId = Number(priceData.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("ID de artículo inválido.");
			const internalPrice = {
				...priceData,
				itemId,
				updatedAt: Date.now()
			};
			await this.storage.saveInternalPrice(internalPrice);
			return internalPrice;
		}
		async initialize({ itemId, itemName, realMarketValue, learnedRatio, confidence, w3bBuyPrice }) {
			const existing = await this.get(itemId);
			if (existing) return existing;
			const marketValue = Number(realMarketValue);
			const ratio = Number(learnedRatio);
			if (!Number.isFinite(marketValue) || marketValue <= 0) throw new Error(`Real Market Value inválido para ${itemName}.`);
			if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Learned Ratio inválido para ${itemName}.`);
			const recommendedBuyPrice = Math.round(marketValue * ratio);
			const initialW3bPrice = Number(w3bBuyPrice);
			return await this.save({
				itemId,
				itemName,
				internalMarketValue: Math.round(marketValue),
				recommendedBuyPrice,
				learnedRatio: ratio,
				confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
				observations: 1,
				initialInternalMarketValue: Math.round(marketValue),
				initialRecommendedBuyPrice: recommendedBuyPrice,
				initialW3bBuyPrice: Number.isFinite(initialW3bPrice) && initialW3bPrice > 0 ? Math.round(initialW3bPrice) : null
			});
		}
		async update({ itemId, itemName, realMarketValue, learnedRatio, confidence, w3bBuyPrice }) {
			const previous = await this.get(itemId);
			if (!previous) return await this.initialize({
				itemId,
				itemName,
				realMarketValue,
				learnedRatio,
				confidence,
				w3bBDuyPrice
			});
			const observations = Number(previous.observations) || 0;
			const previousValue = Number(previous.internalMarketValue);
			const newValue = Number(realMarketValue);
			if (!Number.isFinite(previousValue) || previousValue <= 0) throw new Error(`Precio interno anterior inválido para ${itemName}.`);
			if (!Number.isFinite(newValue) || newValue <= 0) throw new Error(`Real Market Value inválido para ${itemName}.`);
			const newObservationCount = observations + 1;
			const updatedMarketValue = Math.round((previousValue * observations + newValue) / newObservationCount);
			const previousRatio = Number(previous.learnedRatio);
			const updatedRatio = Number.isFinite(Number(learnedRatio)) && Number(learnedRatio) > 0 ? Number(learnedRatio) : previousRatio;
			if (!Number.isFinite(updatedRatio) || updatedRatio <= 0) throw new Error(`Learned Ratio inválido para ${itemName}.`);
			const recommendedBuyPrice = Math.round(updatedMarketValue * updatedRatio);
			const previousConfidence = Number(previous.confidence);
			const updatedConfidence = Number.isFinite(Number(confidence)) ? Number(confidence) : Number.isFinite(previousConfidence) ? previousConfidence : 0;
			return await this.save({
				...previous,
				itemId,
				itemName: itemName ?? previous.itemName,
				internalMarketValue: updatedMarketValue,
				recommendedBuyPrice,
				learnedRatio: updatedRatio,
				confidence: updatedConfidence,
				observations: newObservationCount
			});
		}
	};
	//#endregion
	//#region src/data/priceProposal.js
	var PriceProposal = class {
		constructor({ differenceThreshold = .1, minimumConfidence = 70 } = {}) {
			this.differenceThreshold = differenceThreshold;
			this.minimumConfidence = minimumConfidence;
		}
		generate({ itemId, itemName, internalMarketValue, realMarketValue, learnedRatio, confidence, currentBuyPrice }) {
			const id = Number(itemId);
			if (!Number.isInteger(id) || id <= 0) throw new Error("ID de artículo inválido.");
			const internalValue = Number(internalMarketValue);
			if (!Number.isFinite(internalValue) || internalValue <= 0) throw new Error(`Precio interno inválido para ${itemName}.`);
			const observedValue = Number(realMarketValue);
			if (!Number.isFinite(observedValue) || observedValue <= 0) throw new Error(`Real Market Value inválido para ${itemName}.`);
			const ratio = Number(learnedRatio);
			if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Learned Ratio inválido para ${itemName}.`);
			const currentConfidence = Number(confidence);
			const validConfidence = Number.isFinite(currentConfidence) ? currentConfidence : 0;
			const recommendedBuyPrice = Math.round(observedValue * ratio);
			const price = Number(currentBuyPrice);
			const referencePrice = Number.isFinite(price) && price > 0 ? price : internalValue;
			const difference = recommendedBuyPrice - referencePrice;
			const differencePercent = difference / referencePrice;
			const updateAvailable = Math.abs(differencePercent) > this.differenceThreshold;
			return {
				itemId: id,
				itemName,
				currentInternalPrice: Math.round(internalValue),
				observedMarketValue: Math.round(observedValue),
				difference: Math.round(difference),
				differencePercent,
				recommendedBuyPrice,
				confidence: validConfidence,
				updateAvailable,
				status: updateAvailable ? "UPDATE_AVAILABLE" : "NO_UPDATE"
			};
		}
	};
	//#endregion
	//#region src/data/priceUpdateService.js
	var PriceUpdateService = class {
		constructor({ internalPriceList }) {
			this.internalPriceList = internalPriceList;
		}
		async accept(proposal) {
			if (!proposal) throw new Error("No se recibió una propuesta de precio.");
			if (proposal.updateAvailable !== true) throw new Error("La propuesta no está disponible para actualización.");
			if (!this.internalPriceList || typeof this.internalPriceList.update !== "function") throw new Error("InternalPriceList no está disponible.");
			const itemId = Number(proposal.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("ID de artículo inválido.");
			const updated = await this.internalPriceList.update({
				itemId,
				itemName: proposal.itemName,
				realMarketValue: Number(proposal.observedMarketValue),
				learnedRatio: Number(proposal.learnedRatio),
				confidence: Number(proposal.confidence)
			});
			return {
				updated: true,
				itemId,
				itemName: proposal.itemName,
				previousInternalMarketValue: Number(proposal.currentInternalPrice),
				observedMarketValue: Number(proposal.observedMarketValue),
				newInternalMarketValue: updated.internalMarketValue,
				recommendedBuyPrice: updated.recommendedBuyPrice,
				learnedRatio: updated.learnedRatio,
				confidence: updated.confidence,
				observations: updated.observations,
				updatedAt: updated.updatedAt
			};
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
			if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 864e5);
			return Math.floor(timestamp / 86400);
		}
		async init() {
			const audits = await this.storage.getAllAudits();
			for (const itemId in audits) {
				const numericItemId = Number(itemId);
				if (!Number.isFinite(numericItemId)) continue;
				const history = await this.storage.getHistory(numericItemId);
				if (!Array.isArray(history) || history.length === 0) continue;
				const last = history[history.length - 1];
				if (!last) continue;
				const timestamp = Number(last.timestamp);
				if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
				const day = Math.floor(timestamp / 864e5);
				this.lastDayByItem.set(numericItemId, day);
			}
			this.initialized = true;
			console.log(`[History] Inicializado: ${this.lastDayByItem.size} artículos con historial.`);
		}
		async recordSnapshot(audit) {
			if (!audit) return null;
			const itemId = Number(audit.itemId);
			if (!Number.isFinite(itemId) || itemId <= 0) return null;
			const tornDay = await this.getTornDay();
			const auditDay = Math.floor(Number(audit.timestamp) / 864e5);
			const lastDay = this.lastDayByItem.get(itemId);
			if (lastDay === auditDay || lastDay === tornDay) return null;
			await this.storage.saveHistory(audit);
			this.lastDayByItem.set(itemId, auditDay);
			return audit;
		}
		async getSeries(itemId) {
			return (await this.storage.getHistory(Number(itemId))).map((snapshot) => ({
				timestamp: snapshot.timestamp,
				realMarketValue: snapshot.realMarketValue,
				correctBuyPrice: snapshot.correctBuyPrice
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
				const timestamp = Number(snapshot.timestamp);
				if (!Number.isFinite(timestamp)) continue;
				const age = now - timestamp;
				if (age >= 0 && age <= day) buckets.yesterday.push(snapshot);
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
			if (!snapshots || snapshots.length === 0) return null;
			const count = snapshots.length;
			const sum = (key) => snapshots.reduce((total, snapshot) => total + (Number(snapshot[key]) || 0), 0);
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
	//#region src/auditor/auditHistory.js
	var AuditHistory = class {
		constructor(storage) {
			this.storage = storage;
		}
		async record(result) {
			if (!result) throw new Error("No se recibió una auditoría para guardar.");
			const itemId = Number(result.itemId);
			if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("ID de artículo inválido.");
			const audit = Number.isFinite(Number(result.timestamp)) ? result : {
				...result,
				timestamp: Date.now()
			};
			return await this.storage.saveAuditHistory(audit);
		}
		async getLatest(itemId) {
			const id = Number(itemId);
			if (!Number.isInteger(id) || id <= 0) throw new Error("ID de artículo inválido.");
			return await this.storage.getAudit(id);
		}
		async getAll(itemId) {
			const id = Number(itemId);
			if (!Number.isInteger(id) || id <= 0) throw new Error("ID de artículo inválido.");
			if (typeof this.storage.getAuditHistory !== "function") return [];
			return await this.storage.getAuditHistory(id);
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
			if (!Number.isFinite(observed) || observed <= 0) return Number.isFinite(previous) && previous > 0 ? previous : null;
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
		calculateSellRatio(buyRatio) {
			const ratio = Number(buyRatio);
			if (!Number.isFinite(ratio) || ratio <= 0) return null;
			return (1 + ratio) / 2;
		}
		calculateRecommendedSellPrice(itemValue, buyRatio) {
			const value = Number(itemValue);
			const sellRatio = this.calculateSellRatio(buyRatio);
			if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(sellRatio)) return null;
			return value * sellRatio;
		}
	};
	//#endregion
	//#region src/auditor/auditor.js
	var Auditor = class {
		constructor({ tornAPI, w3bAPI, marketAnalyzer, bazaarAnalyzer, marketValueAnalyzer, ratioLearner, storage, priceProposal, internalPriceList, w3bUserId }) {
			this.tornAPI = tornAPI;
			this.w3bAPI = w3bAPI;
			this.marketAnalyzer = marketAnalyzer;
			this.bazaarAnalyzer = bazaarAnalyzer;
			this.marketValueAnalyzer = marketValueAnalyzer;
			this.ratioLearner = ratioLearner;
			this.storage = storage;
			this.priceProposal = priceProposal;
			this.internalPriceList = internalPriceList;
			this.w3bUserId = w3bUserId;
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
			if (!this.tornAPI || typeof this.tornAPI.getItemMarket !== "function") throw new Error("Torn Item Market API no está disponible.");
			const marketListings = (await this.tornAPI.getItemMarket(itemId))?.itemmarket?.listings || [];
			if (!Array.isArray(marketListings) || marketListings.length === 0) throw new Error(`No hay vendedores disponibles en el Item Market de Torn para ${item.name}.`);
			const normalizedMarketListings = marketListings.map((listing) => ({
				...listing,
				quantity: Number(listing?.quantity ?? listing?.amount),
				price: Number(listing?.price)
			}));
			const marketAnalysis = this.marketAnalyzer?.analyze(normalizedMarketListings) ?? null;
			if (!marketAnalysis) throw new Error(`No hay suficientes datos de mercado para ${item.name}.`);
			if (!this.w3bAPI || typeof this.w3bAPI.getMarketplace !== "function") throw new Error("W3B Marketplace API no está disponible.");
			const marketplace = await this.w3bAPI.getMarketplace(itemId);
			const bazaarListings = marketplace?.listings || [];
			let bazaarAnalysis = null;
			let marketValueAnalysis = null;
			if (Array.isArray(bazaarListings) && bazaarListings.length > 0 && this.bazaarAnalyzer && typeof this.bazaarAnalyzer.analyze === "function") try {
				bazaarAnalysis = this.bazaarAnalyzer.analyze(bazaarListings);
			} catch (error) {
				console.warn(`[Auditor] Error analizando bazares para ${item.name}:`, error);
			}
			if (this.marketValueAnalyzer && typeof this.marketValueAnalyzer.analyze === "function") try {
				marketValueAnalysis = this.marketValueAnalyzer.analyze({
					market: marketAnalysis,
					bazaars: bazaarAnalysis
				});
			} catch (error) {
				console.warn(`[Auditor] Error combinando señales de mercado para ${item.name}:`, error);
			}
			if (!marketValueAnalysis || !Number.isFinite(Number(marketValueAnalysis.realMarketValue)) || Number(marketValueAnalysis.realMarketValue) <= 0) throw new Error(`No se pudo determinar el Market Value real para ${item.name}.`);
			let internalPrice = null;
			if (this.internalPriceList) {
				internalPrice = await this.internalPriceList.get(itemId);
				if (!internalPrice) internalPrice = await this.internalPriceList.initialize({
					itemId,
					itemName: item.name,
					realMarketValue: marketValueAnalysis.realMarketValue,
					learnedRatio,
					confidence: marketValueAnalysis.confidence,
					w3bBuyPrice: buyPrice
				});
			}
			let priceProposalResult = null;
			if (this.priceProposal && typeof this.priceProposal.generate === "function" && internalPrice) priceProposalResult = this.priceProposal.generate({
				itemId,
				itemName: item.name,
				internalMarketValue: internalPrice.internalMarketValue,
				realMarketValue: marketValueAnalysis.realMarketValue,
				learnedRatio,
				confidence: marketValueAnalysis.confidence,
				currentBuyPrice: buyPrice
			});
			const priceUpdate = null;
			const correctBuyPrice = Math.round(Number(marketValueAnalysis.realMarketValue) * learnedRatio);
			if (!Number.isFinite(correctBuyPrice) || correctBuyPrice <= 0) throw new Error(`No se pudo calcular el precio correcto de compra para ${item.name}.`);
			const sellRatio = this.ratioLearner.calculateSellRatio(learnedRatio);
			const recommendedSellPrice = this.ratioLearner.calculateRecommendedSellPrice(itemValue, learnedRatio);
			const auditRecommendedSellPrice = this.ratioLearner.calculateRecommendedSellPrice(marketValueAnalysis.realMarketValue, learnedRatio);
			const differencePercent = correctBuyPrice > 0 ? Math.abs(buyPrice - correctBuyPrice) / correctBuyPrice : null;
			const status = this.calculateStatus(differencePercent);
			const result = {
				itemId,
				itemName: item.name,
				itemValue,
				w3bBuyPrice: buyPrice,
				observedRatio,
				learnedRatio,
				market: {
					totalQuantity: marketAnalysis.totalQuantity,
					listingsCount: marketAnalysis.listingsCount,
					targetQuantity: marketAnalysis.targetQuantity,
					requiredListings: marketAnalysis.requiredListings,
					sampleSize: marketAnalysis.sampleSize,
					sampleQuantity: marketAnalysis.sampleQuantity,
					weightedMean: marketAnalysis.weightedMean,
					weightedMedian: marketAnalysis.weightedMedian,
					dispersion: marketAnalysis.dispersion,
					realMarketValue: marketAnalysis.realMarketValue,
					confidence: marketAnalysis.confidence,
					sampleListings: marketAnalysis.sampleListings
				},
				bazaars: bazaarAnalysis ? {
					totalQuantity: bazaarAnalysis.totalQuantity,
					listingsCount: bazaarAnalysis.listingsCount,
					traderCount: bazaarAnalysis.traderCount,
					minPrice: bazaarAnalysis.minPrice,
					maxPrice: bazaarAnalysis.maxPrice,
					weightedMean: bazaarAnalysis.weightedMean,
					weightedMedian: bazaarAnalysis.weightedMedian,
					dispersion: bazaarAnalysis.dispersion,
					priceDistribution: bazaarAnalysis.priceDistribution,
					largestTraderQuantity: bazaarAnalysis.largestTraderQuantity,
					largestTraderShare: bazaarAnalysis.largestTraderShare,
					topTraders: bazaarAnalysis.topTraders,
					confidence: bazaarAnalysis.confidence
				} : null,
				marketValueAnalysis,
				priceProposal: priceProposalResult,
				priceUpdate,
				totalMarketQuantity: marketAnalysis.totalQuantity,
				listingsCount: marketAnalysis.listingsCount,
				targetQuantity: marketAnalysis.targetQuantity,
				accumulatedQuantity: marketAnalysis.accumulatedQuantity,
				sampleListingsCount: marketAnalysis.sampleListingsCount,
				sellerSampleSize: marketAnalysis.sellerSampleSize,
				sampleQuantity: marketAnalysis.sampleQuantity,
				weightedMean: marketAnalysis.weightedMean,
				weightedMedian: marketAnalysis.weightedMedian,
				dispersion: marketAnalysis.dispersion,
				realMarketValue: marketValueAnalysis.realMarketValue,
				correctBuyPrice,
				sellRatio,
				recommendedSellPrice,
				auditRecommendedSellPrice,
				differencePercent,
				confidence: marketValueAnalysis.confidence,
				status,
				marketplaceItemName: marketplace?.item_name ?? null,
				marketplacePrice: Number.isFinite(Number(marketplace?.market_price)) ? Number(marketplace.market_price) : null,
				bazaarAverage: Number.isFinite(Number(marketplace?.bazaar_average)) ? Number(marketplace.bazaar_average) : null,
				marketplaceGeneratedAt: marketplace?.generated_at ?? null,
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
		constructor({ auditor, pricelist, storage, history, auditHistory, concurrency = 1 }) {
			this.auditor = auditor;
			this.pricelist = pricelist;
			this.storage = storage;
			this.history = history;
			this.auditHistory = auditHistory;
			this.concurrency = Math.max(1, Number(concurrency) || 1);
			this.lastAuditByItem = /* @__PURE__ */ new Map();
			this.invalidItems = /* @__PURE__ */ new Map();
			this.queue = [];
			this.queuedItems = /* @__PURE__ */ new Set();
			this.running = 0;
			this.runningWaiters = /* @__PURE__ */ new Map();
			this.initialized = false;
			this.started = false;
			this.passiveCycle = {
				id: 0,
				active: false,
				items: [],
				index: 0,
				total: 0,
				completed: 0,
				failed: 0,
				startedAt: 0
			};
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
					passive: false,
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
		async startPassiveCycle() {
			if (!this.started) return;
			if (this.passiveCycle.active) {
				console.warn("[Scheduler] El ciclo pasivo anterior todavía está activo. No se iniciará otro ciclo encima.");
				return;
			}
			const cycleId = ++this.passiveCycle.id;
			console.log("[Scheduler] Preparando nuevo ciclo de auditoría pasiva...");
			try {
				const items = await this.pricelist.getAll();
				if (cycleId !== this.passiveCycle.id) return;
				if (!Array.isArray(items)) {
					console.warn("[Scheduler] Pricelist inválida.");
					return;
				}
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
				this.passiveCycle = {
					id: cycleId,
					active: true,
					items: due,
					index: 0,
					total: due.length,
					completed: 0,
					failed: 0,
					startedAt: Date.now()
				};
				console.log(`[Scheduler] Nuevo ciclo preparado: ${due.length} artículos pendientes.`);
				this.fillPassiveQueue();
			} catch (error) {
				console.error("[Scheduler] Error preparando ciclo pasivo:", error);
			}
		}
		fillPassiveQueue() {
			if (!this.passiveCycle.active) return;
			const PASSIVE_QUEUE_SIZE = Math.max(5, this.concurrency * 5);
			while (this.passiveCycle.index < this.passiveCycle.total && this.getPassiveQueuedCount() < PASSIVE_QUEUE_SIZE) {
				const item = this.passiveCycle.items[this.passiveCycle.index];
				this.passiveCycle.index++;
				if (!item) {
					this.passiveCycle.completed++;
					continue;
				}
				const itemId = Number(item.itemId);
				if (!this.needsAudit(itemId)) {
					this.passiveCycle.completed++;
					continue;
				}
				if (this.queuedItems.has(itemId)) continue;
				this.queue.push({
					item,
					priority: false,
					passive: true,
					waiters: []
				});
				this.queuedItems.add(itemId);
			}
			this.drain();
			this.checkPassiveCycleComplete();
		}
		getPassiveQueuedCount() {
			return this.queue.filter((queued) => queued && queued.passive === true).length;
		}
		continuePassiveCycle() {
			if (!this.passiveCycle.active) return;
			this.fillPassiveQueue();
			this.drain();
		}
		checkPassiveCycleComplete() {
			if (!this.passiveCycle.active) return;
			if (!(this.passiveCycle.index >= this.passiveCycle.total && this.passiveCycle.completed >= this.passiveCycle.total && this.getPassiveQueuedCount() === 0)) return;
			const elapsed = Date.now() - this.passiveCycle.startedAt;
			console.log(`[Scheduler] Ciclo pasivo completado: ${this.passiveCycle.total} artículos en ${Math.round(elapsed / 1e3)} segundos.`);
			this.passiveCycle.active = false;
		}
		drain() {
			while (this.running < this.concurrency && this.queue.length > 0) {
				const queued = this.queue.shift();
				if (!queued) continue;
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
				console.log(`[Scheduler] Auditando ${item.name} (${itemId})` + (queued.priority ? " [PRIORIDAD]" : " [PASIVA]"));
				const result = await this.auditor.audit(item);
				if (result && this.history) await this.history.recordSnapshot(result);
				if (result && this.history) await this.history.recordSnapshot(result);
				if (result && this.auditHistory) try {
					await this.auditHistory.record(result);
				} catch (error) {
					console.warn(`[Scheduler] Error guardando historial de auditoría para ${item.name}:`, error);
				}
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
				if (queued.passive) {
					this.passiveCycle.completed++;
					if (!this.needsAudit(itemId) && !this.isInvalid(itemId)) {} else this.passiveCycle.failed++;
				}
				this.drain();
				this.continuePassiveCycle();
				this.checkPassiveCycleComplete();
			}
		}
		resolveWaiters(queued, result, error) {
			for (const waiter of queued.waiters || []) try {
				if (error) waiter.reject(error);
				else waiter.resolve(result);
			} catch {}
		}
		resolveRunningWaiters(itemId, result, error) {
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
			if (this.started) {
				console.warn("[Scheduler] start() ya fue llamado.");
				return;
			}
			if (!this.initialized) console.warn("[Scheduler] start() llamado antes de init().");
			this.started = true;
			this.startPassiveCycle();
			this.intervalHandle = setInterval(() => {
				if (this.passiveCycle.active) {
					console.warn("[Scheduler] El ciclo anterior todavía está activo. No se iniciará otro.");
					return;
				}
				console.log("[Scheduler] Iniciando nuevo ciclo horario.");
				this.startPassiveCycle();
			}, CONFIG.AUDIT_INTERVAL);
			console.log("[Scheduler] Auditoría pasiva iniciada.");
		}
		stop() {
			this.started = false;
			if (this.intervalHandle) {
				clearInterval(this.intervalHandle);
				this.intervalHandle = null;
			}
			this.passiveCycle.id++;
			this.passiveCycle.active = false;
			console.log("[Scheduler] Auditoría pasiva detenida.");
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
	function filterPriceOutliers(listings, { multiplier = 6, minSampleSize = 3 } = {}) {
		if (!Array.isArray(listings) || listings.length < minSampleSize) return listings;
		const prices = listings.map((listing) => Number(listing.price)).filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
		if (prices.length < minSampleSize) return listings;
		const mid = Math.floor(prices.length / 2);
		const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
		if (!Number.isFinite(median) || median <= 0) return listings;
		const upperBound = median * multiplier;
		const lowerBound = median / multiplier;
		const filtered = listings.filter((listing) => {
			const price = Number(listing.price);
			return Number.isFinite(price) && price >= lowerBound && price <= upperBound;
		});
		if (filtered.length === 0) return listings;
		return filtered;
	}
	//#endregion
	//#region src/market/marketAnalyzer.js
	var MarketAnalyzer = class {
		constructor(samplePercentage = .1) {
			this.samplePercentage = Number.isFinite(Number(samplePercentage)) && Number(samplePercentage) > 0 && Number(samplePercentage) <= 1 ? Number(samplePercentage) : .1;
		}
		analyze(rawListings) {
			if (!Array.isArray(rawListings)) return null;
			let listings = rawListings.map((listing, index) => {
				const price = Number(listing?.price);
				const quantity = Number(listing?.quantity);
				if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) return null;
				return {
					...listing,
					price,
					quantity,
					originalIndex: index
				};
			}).filter(Boolean);
			if (listings.length === 0) return null;
			listings = filterPriceOutliers(listings);
			listings = listings.sort((a, b) => a.price - b.price);
			const totalQuantity = listings.reduce((sum, listing) => sum + listing.quantity, 0);
			if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return null;
			const targetQuantity = totalQuantity * .1;
			let accumulatedQuantity = 0;
			let requiredListings = 0;
			for (const listing of listings) {
				accumulatedQuantity += listing.quantity;
				requiredListings += 1;
				if (accumulatedQuantity >= targetQuantity) break;
			}
			if (requiredListings <= 0) return null;
			const sampleListingsCount = requiredListings;
			const sellerSampleSize = Math.min(listings.length, Math.max(Math.ceil(sampleListingsCount * .1), 5));
			const selectedListings = listings.slice(0, sellerSampleSize);
			if (selectedListings.length === 0) return null;
			const sampleQuantity = selectedListings.reduce((sum, listing) => sum + listing.quantity, 0);
			if (!Number.isFinite(sampleQuantity) || sampleQuantity <= 0) return null;
			const statisticalSample = selectedListings.map((listing) => ({
				price: listing.price,
				amount: listing.quantity
			}));
			const mean = weightedMean(statisticalSample);
			const median = weightedMedian(statisticalSample);
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
				sampleListingsCount,
				sellerSampleSize,
				dispersion
			});
			return {
				totalQuantity,
				listingsCount: listings.length,
				targetQuantity,
				requiredListings: sampleListingsCount,
				accumulatedQuantity,
				sampleListingsCount,
				sellerSampleSize,
				sampleSize: sellerSampleSize,
				sampleQuantity,
				weightedMean: mean,
				weightedMedian: median,
				dispersion,
				realMarketValue,
				confidence,
				sampleListings: selectedListings.map((listing) => ({
					uid: listing.uid ?? null,
					playerId: listing.player_id ?? null,
					playerName: listing.player_name ?? null,
					price: listing.price,
					quantity: listing.quantity,
					contentUpdated: listing.content_updated ?? null,
					lastChecked: listing.last_checked ?? null
				}))
			};
		}
		calculateConfidence({ totalQuantity, sampleQuantity, listingsCount, sampleListingsCount, sellerSampleSize, dispersion }) {
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
			if (sellerSampleSize >= 10) score += 10;
			else if (sellerSampleSize >= 5) score += 7;
			else if (sellerSampleSize >= 3) score += 5;
			else if (sellerSampleSize >= 2) score += 3;
			if (Number.isFinite(dispersion)) {
				if (dispersion <= .05) score += 15;
				else if (dispersion <= .1) score += 10;
				else if (dispersion <= .2) score += 5;
			}
			if (sampleListingsCount <= 1) score *= .65;
			else if (sampleListingsCount <= 2) score *= .8;
			return Math.min(100, Math.max(0, Math.round(score)));
		}
	};
	//#endregion
	//#region src/market/bazaarAnalyzer.js
	var BazaarAnalyzer = class {
		analyze(rawListings) {
			if (!Array.isArray(rawListings)) return null;
			let listings = rawListings.map((listing, index) => {
				if (!listing || typeof listing !== "object") return null;
				const price = Number(listing.price);
				const quantity = Number(listing.quantity);
				if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) return null;
				return {
					...listing,
					price,
					quantity,
					originalIndex: index
				};
			}).filter(Boolean);
			if (listings.length === 0) return null;
			listings = filterPriceOutliers(listings);
			const listingsCount = listings.length;
			const totalQuantity = listings.reduce((sum, listing) => sum + listing.quantity, 0);
			if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) return null;
			const minPrice = Math.min(...listings.map((listing) => listing.price));
			const maxPrice = Math.max(...listings.map((listing) => listing.price));
			const statisticalListings = listings.map((listing) => ({
				price: listing.price,
				amount: listing.quantity
			}));
			const mean = weightedMean(statisticalListings);
			const median = weightedMedian(statisticalListings);
			if (!Number.isFinite(mean) || !Number.isFinite(median)) return null;
			const dispersion = calculateDispersion(mean, median);
			const priceDistribution = this.buildPriceDistribution(listings);
			const { traderCount, largestTraderQuantity, largestTraderShare, topTraders } = this.calculateTraderConcentration({
				listings,
				totalQuantity
			});
			return {
				totalQuantity,
				listingsCount,
				traderCount,
				minPrice,
				maxPrice,
				weightedMean: mean,
				weightedMedian: median,
				dispersion,
				priceDistribution,
				largestTraderQuantity,
				largestTraderShare,
				topTraders,
				confidence: this.calculateConfidence({
					totalQuantity,
					listingsCount,
					traderCount,
					dispersion
				})
			};
		}
		buildPriceDistribution(listings) {
			const distribution = /* @__PURE__ */ new Map();
			for (const listing of listings) {
				const bucket = distribution.get(listing.price) || {
					price: listing.price,
					quantity: 0,
					listingsCount: 0
				};
				bucket.quantity += listing.quantity;
				bucket.listingsCount += 1;
				distribution.set(listing.price, bucket);
			}
			return Array.from(distribution.values()).sort((a, b) => a.price - b.price);
		}
		calculateTraderConcentration({ listings, totalQuantity }) {
			const traderData = /* @__PURE__ */ new Map();
			for (const listing of listings) {
				const traderKey = this.getTraderKey(listing);
				if (!traderKey) continue;
				const existing = traderData.get(traderKey) || {
					playerId: Number.isFinite(Number(listing.player_id)) ? Number(listing.player_id) : null,
					playerName: typeof listing.player_name === "string" ? listing.player_name.trim() : null,
					quantity: 0,
					weightedPriceTotal: 0
				};
				existing.quantity += listing.quantity;
				existing.weightedPriceTotal += listing.price * listing.quantity;
				traderData.set(traderKey, existing);
			}
			const traderCount = traderData.size;
			let largestTraderQuantity = 0;
			for (const data of traderData.values()) if (data.quantity > largestTraderQuantity) largestTraderQuantity = data.quantity;
			const largestTraderShare = totalQuantity > 0 ? largestTraderQuantity / totalQuantity : 0;
			const topTraders = Array.from(traderData.entries()).map(([traderKey, data]) => ({
				traderKey,
				playerId: data.playerId,
				playerName: data.playerName,
				quantity: data.quantity,
				averagePrice: data.quantity > 0 ? data.weightedPriceTotal / data.quantity : null
			})).sort((a, b) => b.quantity - a.quantity);
			return {
				traderCount,
				largestTraderQuantity,
				largestTraderShare,
				topTraders
			};
		}
		getTraderKey(listing) {
			const playerId = Number(listing.player_id);
			if (Number.isFinite(playerId) && playerId > 0) return `id:${playerId}`;
			const playerName = typeof listing.player_name === "string" ? listing.player_name.trim() : "";
			if (playerName) return `name:${playerName.toLowerCase()}`;
			return null;
		}
		calculateConfidence({ totalQuantity, listingsCount, traderCount, dispersion }) {
			let score = 0;
			if (totalQuantity >= 1e4) score += 30;
			else if (totalQuantity >= 1e3) score += 22;
			else if (totalQuantity >= 100) score += 15;
			else if (totalQuantity >= 20) score += 9;
			else score += 4;
			if (listingsCount >= 100) score += 20;
			else if (listingsCount >= 30) score += 15;
			else if (listingsCount >= 10) score += 10;
			else if (listingsCount >= 3) score += 6;
			else score += 3;
			if (traderCount >= 50) score += 20;
			else if (traderCount >= 20) score += 15;
			else if (traderCount >= 5) score += 10;
			else if (traderCount >= 2) score += 6;
			else if (traderCount === 1) score += 3;
			if (Number.isFinite(dispersion)) {
				if (dispersion <= .05) score += 30;
				else if (dispersion <= .1) score += 24;
				else if (dispersion <= .2) score += 16;
				else if (dispersion <= .35) score += 10;
				else score += 5;
			}
			return Math.min(100, Math.max(0, Math.round(score)));
		}
	};
	//#endregion
	//#region src/market/marketValueAnalyzer.js
	var MarketValueAnalyzer = class {
		analyze({ market, bazaars }) {
			const marketValue = this.extractMarketValue(market);
			const bazaarValue = this.extractBazaarReferenceValue(bazaars);
			if (marketValue === null && bazaarValue === null) return null;
			const marketQuality = marketValue === null ? 0 : this.calculateMarketQuality(market);
			const bazaarQuality = bazaarValue === null ? 0 : this.calculateBazaarQuality(bazaars);
			let marketWeight = marketValue === null ? 0 : marketQuality;
			let bazaarWeight = bazaarValue === null ? 0 : bazaarQuality;
			if (marketValue !== null && bazaarValue !== null) {
				const totalRawWeight = marketWeight + bazaarWeight;
				if (totalRawWeight > 0) {
					marketWeight = marketWeight / totalRawWeight;
					bazaarWeight = bazaarWeight / totalRawWeight;
				} else {
					marketWeight = .5;
					bazaarWeight = .5;
				}
			} else if (marketValue !== null) {
				marketWeight = 1;
				bazaarWeight = 0;
			} else {
				marketWeight = 0;
				bazaarWeight = 1;
			}
			const realMarketValue = this.calculateCombinedValue({
				marketValue,
				bazaarValue,
				marketWeight,
				bazaarWeight
			});
			if (!Number.isFinite(realMarketValue) || realMarketValue <= 0) return null;
			const marketVsBazaarDifference = this.calculateRelativeDifference(marketValue, bazaarValue);
			const confidence = this.calculateCombinedConfidence({
				market,
				bazaars,
				marketWeight,
				bazaarWeight,
				marketQuality,
				bazaarQuality,
				marketVsBazaarDifference
			});
			return {
				realMarketValue,
				marketWeight,
				bazaarWeight,
				confidence,
				signals: {
					marketValue,
					bazaarValue,
					marketWeight,
					bazaarWeight,
					marketVsBazaarDifference,
					marketQuality,
					bazaarQuality,
					marketDominant: marketWeight > bazaarWeight,
					bazaarDominant: bazaarWeight > marketWeight,
					highDisagreement: Number.isFinite(marketVsBazaarDifference) && marketVsBazaarDifference >= .3,
					lowMarketConfidence: Number(market?.confidence) < 45,
					lowBazaarConfidence: Number(bazaars?.confidence) < 45
				}
			};
		}
		extractMarketValue(market) {
			const realMarketValue = Number(market?.realMarketValue);
			return Number.isFinite(realMarketValue) && realMarketValue > 0 ? realMarketValue : null;
		}
		extractBazaarReferenceValue(bazaars) {
			const mean = Number(bazaars?.weightedMean);
			const median = Number(bazaars?.weightedMedian);
			const dispersion = Number(bazaars?.dispersion);
			if (!Number.isFinite(mean) && !Number.isFinite(median)) return null;
			if (Number.isFinite(mean) && !Number.isFinite(median)) return mean > 0 ? mean : null;
			if (Number.isFinite(median) && !Number.isFinite(mean)) return median > 0 ? median : null;
			if (mean <= 0 || median <= 0) return null;
			if (Number.isFinite(dispersion) && dispersion <= .08) return (mean + median) / 2;
			if (Number.isFinite(dispersion) && dispersion <= .2) return mean * .35 + median * .65;
			return median;
		}
		calculateMarketQuality(market) {
			const confidenceFactor = this.normalizePercent(market?.confidence);
			const sampleQuantityFactor = this.normalizeByThreshold(market?.sampleQuantity, 250);
			const sampleListingsFactor = this.normalizeByThreshold(market?.sampleListingsCount, 20);
			const dispersionFactor = this.inverseDispersionFactor(market?.dispersion);
			return this.clamp01(confidenceFactor * .45 + sampleQuantityFactor * .2 + sampleListingsFactor * .2 + dispersionFactor * .15);
		}
		calculateBazaarQuality(bazaars) {
			const confidenceFactor = this.normalizePercent(bazaars?.confidence);
			const traderFactor = this.normalizeByThreshold(bazaars?.traderCount, 30);
			const quantityFactor = this.normalizeByThreshold(bazaars?.totalQuantity, 1e3);
			const dispersionFactor = this.inverseDispersionFactor(bazaars?.dispersion);
			const concentrationFactor = this.inverseConcentrationFactor(bazaars?.largestTraderShare);
			return this.clamp01(confidenceFactor * .35 + traderFactor * .2 + quantityFactor * .15 + dispersionFactor * .15 + concentrationFactor * .15);
		}
		inverseDispersionFactor(dispersion) {
			const value = Number(dispersion);
			if (!Number.isFinite(value)) return .5;
			if (value <= .05) return 1;
			if (value >= .6) return 0;
			return this.clamp01(1 - value / .6);
		}
		inverseConcentrationFactor(share) {
			const value = Number(share);
			if (!Number.isFinite(value)) return .5;
			return this.clamp01(1 - value);
		}
		normalizePercent(value) {
			const numeric = Number(value);
			if (!Number.isFinite(numeric)) return 0;
			return this.clamp01(numeric / 100);
		}
		normalizeByThreshold(value, threshold) {
			const numeric = Number(value);
			if (!Number.isFinite(numeric) || numeric <= 0) return 0;
			return this.clamp01(numeric / threshold);
		}
		calculateCombinedValue({ marketValue, bazaarValue, marketWeight, bazaarWeight }) {
			if (marketValue !== null && bazaarValue === null) return marketValue;
			if (bazaarValue !== null && marketValue === null) return bazaarValue;
			return marketValue * marketWeight + bazaarValue * bazaarWeight;
		}
		calculateRelativeDifference(marketValue, bazaarValue) {
			if (!Number.isFinite(marketValue) || !Number.isFinite(bazaarValue) || marketValue <= 0 || bazaarValue <= 0) return null;
			return Math.abs(marketValue - bazaarValue) / Math.max(marketValue, bazaarValue);
		}
		calculateCombinedConfidence({ market, bazaars, marketWeight, bazaarWeight, marketQuality, bazaarQuality, marketVsBazaarDifference }) {
			if (marketWeight === 1 && bazaarWeight === 0) return this.clampPercent(Number(market?.confidence) || 0);
			if (marketWeight === 0 && bazaarWeight === 1) return this.clampPercent(Number(bazaars?.confidence) || 0);
			const confidenceBlend = this.clampPercent(Number(market?.confidence) || 0) * marketWeight + this.clampPercent(Number(bazaars?.confidence) || 0) * bazaarWeight;
			const qualityBlend = (marketQuality * marketWeight + bazaarQuality * bazaarWeight) * 100;
			let disagreementPenalty = 0;
			if (Number.isFinite(marketVsBazaarDifference)) disagreementPenalty = this.clampPercent(marketVsBazaarDifference / .6 * 35);
			return this.clampPercent(confidenceBlend * .6 + qualityBlend * .4 - disagreementPenalty);
		}
		clamp01(value) {
			if (!Number.isFinite(value)) return 0;
			return Math.min(1, Math.max(0, value));
		}
		clampPercent(value) {
			if (!Number.isFinite(value)) return 0;
			return Math.min(100, Math.max(0, Math.round(value)));
		}
	};
	//#endregion
	//#region src/ui/styles.js
	var COLORS = {
		background: "#12141a",
		surface: "#1c1f27",
		surfaceAlt: "#242833",
		border: "#2e323d",
		textPrimary: "#f5f6f8",
		textSecondary: "#9aa0ac",
		textMuted: "#6b7280",
		accent: "#4dabf7",
		accentStrong: "#1c7ed6",
		green: "#37b24d",
		yellow: "#f2c94c",
		red: "#e64953",
		greenBg: "rgba(55, 178, 77, 0.12)",
		yellowBg: "rgba(242, 201, 76, 0.12)",
		redBg: "rgba(230, 73, 83, 0.12)"
	};
	var SPACING = {
		xs: "4px",
		sm: "8px",
		md: "12px",
		lg: "16px",
		xl: "24px"
	};
	var RADIUS = {
		sm: "8px",
		md: "12px",
		lg: "16px",
		pill: "999px"
	};
	var stylesInjected = false;
	function injectStyles() {
		if (stylesInjected) return;
		stylesInjected = true;
		const style = document.createElement("style");
		style.id = "tw3b-styles";
		style.textContent = `

        .tw3b-root {
            font-family: -apple-system, BlinkMacSystemFont,
                "Segoe UI", Roboto, sans-serif;
            color: ${COLORS.textPrimary};
            box-sizing: border-box;
        }

        .tw3b-root * {
            box-sizing: border-box;
        }

        /* -----------------------------------------------------
         * PANTALLA
         * ----------------------------------------------------- */

        .tw3b-screen {
            display: flex;
            flex-direction: column;
            width: 100%;
            min-height: 0;
            background: ${COLORS.background};
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        /* -----------------------------------------------------
         * HEADER
         * ----------------------------------------------------- */

        .tw3b-header {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.md} ${SPACING.lg};
            background: ${COLORS.surface};
            border-bottom: 1px solid ${COLORS.border};
            position: sticky;
            top: 0;
            z-index: 5;
        }

        .tw3b-header-back {
            background: none;
            border: none;
            color: ${COLORS.accent};
            font-size: 18px;
            padding: 4px 6px;
            cursor: pointer;
            line-height: 1;
        }

        .tw3b-header-title {
            font-size: 16px;
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* -----------------------------------------------------
         * CONTENIDO
         * ----------------------------------------------------- */

        .tw3b-content {
            padding: ${SPACING.lg};
            display: flex;
            flex-direction: column;
            gap: ${SPACING.sm};
        }

        /* -----------------------------------------------------
         * FILAS (label / valor)
         * ----------------------------------------------------- */

        .tw3b-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: ${SPACING.sm};
            padding: 6px 0;
        }

        .tw3b-row-label {
            font-size: 13px;
            color: ${COLORS.textSecondary};
        }

        .tw3b-row-value {
            font-size: 15px;
            font-weight: 600;
            text-align: right;
        }

        .tw3b-row-value.tw3b-emph {
            font-size: 20px;
        }

        /* -----------------------------------------------------
         * DIVIDER
         * ----------------------------------------------------- */

        .tw3b-divider {
            height: 1px;
            background: ${COLORS.border};
            margin: ${SPACING.sm} 0;
            border: none;
        }

        /* -----------------------------------------------------
         * SECTION TITLE
         * ----------------------------------------------------- */

        .tw3b-section-title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.04em;
            color: ${COLORS.textMuted};
            text-transform: uppercase;
            margin: ${SPACING.sm} 0 2px 0;
        }

        /* -----------------------------------------------------
         * TARJETAS DE NAVEGACIÓN (MERCADO / COMPETENCIA / ...)
         * ----------------------------------------------------- */

        .tw3b-card {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.md};
            padding: ${SPACING.md} ${SPACING.lg};
            cursor: pointer;
            transition: background 0.15s ease;
        }

        .tw3b-card:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-card-icon {
            font-size: 18px;
        }

        .tw3b-card-label {
            flex: 1;
            font-size: 14px;
            font-weight: 600;
        }

        .tw3b-card-value {
            font-size: 13px;
            color: ${COLORS.textSecondary};
        }

        .tw3b-card-chevron {
            color: ${COLORS.textMuted};
            font-size: 14px;
        }

        /* -----------------------------------------------------
         * LISTA (auditor / historial / búsqueda)
         * ----------------------------------------------------- */

        .tw3b-list-item {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.md} 0;
            border-bottom: 1px solid ${COLORS.border};
            cursor: pointer;
        }

        .tw3b-list-item:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-list-item-name {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tw3b-list-item-chevron {
            color: ${COLORS.textMuted};
        }

        /* -----------------------------------------------------
         * BOTONES
         * ----------------------------------------------------- */

        .tw3b-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 12px ${SPACING.lg};
            border-radius: ${RADIUS.md};
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.02em;
            border: none;
            cursor: pointer;
            text-transform: uppercase;
        }

        .tw3b-btn-primary {
            background: ${COLORS.accent};
            color: #0a1620;
        }

        .tw3b-btn-primary:active {
            background: ${COLORS.accentStrong};
        }

        .tw3b-btn-secondary {
            background: ${COLORS.surface};
            color: ${COLORS.textPrimary};
            border: 1px solid ${COLORS.border};
        }

        .tw3b-btn-secondary:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-btn:disabled {
            opacity: 0.5;
            cursor: default;
        }

        /* -----------------------------------------------------
         * BADGES DE ESTADO
         * ----------------------------------------------------- */

        .tw3b-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px ${SPACING.md};
            border-radius: ${RADIUS.pill};
            font-size: 13px;
            font-weight: 700;
            width: fit-content;
        }

        .tw3b-badge-green {
            background: ${COLORS.greenBg};
            color: ${COLORS.green};
        }

        .tw3b-badge-yellow {
            background: ${COLORS.yellowBg};
            color: ${COLORS.yellow};
        }

        .tw3b-badge-red {
            background: ${COLORS.redBg};
            color: ${COLORS.red};
        }

        /* -----------------------------------------------------
         * BÚSQUEDA
         * ----------------------------------------------------- */

        .tw3b-search-wrap {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.pill};
            padding: 10px ${SPACING.lg};
        }

        .tw3b-search-input {
            flex: 1;
            background: none;
            border: none;
            outline: none;
            color: ${COLORS.textPrimary};
            font-size: 14px;
        }

        .tw3b-search-input::placeholder {
            color: ${COLORS.textMuted};
        }

        /* -----------------------------------------------------
         * ESTADO VACÍO
         * ----------------------------------------------------- */

        .tw3b-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.xl};
            color: ${COLORS.textMuted};
            font-size: 13px;
            text-align: center;
        }
        /* -----------------------------------------------------
         * QUICKBAR (menú principal flotante, sigue al FAB)
         * ----------------------------------------------------- */

        .tw3b-quickbar {
            position: fixed;
            z-index: 999998;
        }

        .tw3b-quickbar-bar {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            width: 100%;
            padding: 8px ${SPACING.md};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.pill};
            box-shadow: 0 4px 16px rgba(0,0,0,0.45);
        }

        .tw3b-quickbar-dropdown {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            right: 0;
            max-height: 260px;
            overflow-y: auto;
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.md};
            box-shadow: 0 4px 16px rgba(0,0,0,0.45);
            padding: 4px 12px;
        }

        /* -----------------------------------------------------
         * FAB
         * ----------------------------------------------------- */

        .tw3b-fab {
            position: fixed;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${COLORS.accentStrong};
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            z-index: 999999;
            cursor: pointer;
            user-select: none;
            touch-action: none;
        }

        .tw3b-overlay {
            position: fixed;
            inset: 0;
            z-index: 999998;
            background: rgba(0, 0, 0, 0.35);
        }

        .tw3b-panel {
            position: fixed;
            width: 100%;
            max-width: 440px;
            max-height: 80vh;
            background: ${COLORS.background};
            border-radius: ${RADIUS.lg};
            box-shadow: 0 8px 28px rgba(0,0,0,0.5);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* -----------------------------------------------------
         * TABLA DE DISTRIBUCIÓN
         * ----------------------------------------------------- */

        .tw3b-dist-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            padding: 4px 0;
            color: ${COLORS.textSecondary};
        }

        .tw3b-dist-row.tw3b-dist-included {
            color: ${COLORS.textPrimary};
            font-weight: 600;
        }
    `;
		document.head.appendChild(style);
	}
	function formatMoney(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return "—";
		return "$" + Math.round(numeric).toLocaleString("en-US");
	}
	function formatPercent(value, { signed = false } = {}) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return "—";
		const percent = numeric * 100;
		return `${signed && percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
	}
	function formatCompactNumber(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return "—";
		return Math.round(numeric).toLocaleString("en-US");
	}
	function statusEmoji(status) {
		switch (status) {
			case "GREEN": return "🟢";
			case "YELLOW": return "🟡";
			case "RED": return "🔴";
			default: return "⚪";
		}
	}
	function statusBadgeClass(status) {
		switch (status) {
			case "GREEN": return "tw3b-badge-green";
			case "YELLOW": return "tw3b-badge-yellow";
			case "RED": return "tw3b-badge-red";
			default: return "tw3b-badge-yellow";
		}
	}
	function statusLabel(status) {
		switch (status) {
			case "GREEN": return "PRECIO CORRECTO";
			case "YELLOW": return "REVISAR PRECIO";
			case "RED": return "COMPRA RECOMENDADA";
			default: return "SIN DATOS";
		}
	}
	function el(tag, props = {}, children = []) {
		const node = document.createElement(tag);
		const { className, text, html, style, attrs, on } = props;
		if (className) node.className = className;
		if (text !== void 0) node.textContent = text;
		if (html !== void 0) node.innerHTML = html;
		if (style) Object.assign(node.style, style);
		if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
		if (on) for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
		const list = Array.isArray(children) ? children : [children];
		for (const child of list) {
			if (!child) continue;
			node.appendChild(child);
		}
		return node;
	}
	function createHeader({ title, onBack }) {
		return el("div", { className: "tw3b-header" }, [onBack ? el("button", {
			className: "tw3b-header-back",
			text: "←",
			on: { click: onBack }
		}) : null, el("div", {
			className: "tw3b-header-title",
			text: title
		})]);
	}
	function createRow({ label, value, emphasis = false, valueColor = null }) {
		const valueNode = el("div", {
			className: "tw3b-row-value" + (emphasis ? " tw3b-emph" : ""),
			text: value
		});
		if (valueColor) valueNode.style.color = valueColor;
		return el("div", { className: "tw3b-row" }, [el("div", {
			className: "tw3b-row-label",
			text: label
		}), valueNode]);
	}
	function createSectionTitle(text) {
		return el("div", {
			className: "tw3b-section-title",
			text
		});
	}
	function createDivider() {
		return el("hr", { className: "tw3b-divider" });
	}
	function createCard({ icon, label, value = null, onClick }) {
		return el("div", {
			className: "tw3b-card",
			attrs: { role: "button" },
			on: { click: onClick }
		}, [
			el("span", {
				className: "tw3b-card-icon",
				text: icon
			}),
			el("div", {
				className: "tw3b-card-label",
				text: label
			}),
			value ? el("div", {
				className: "tw3b-card-value",
				text: value
			}) : null,
			el("span", {
				className: "tw3b-card-chevron",
				text: "›"
			})
		]);
	}
	function createButton({ label, onClick, variant = "primary", disabled = false }) {
		return el("button", {
			className: "tw3b-btn " + (variant === "primary" ? "tw3b-btn-primary" : "tw3b-btn-secondary"),
			text: label,
			attrs: disabled ? { disabled: "true" } : {},
			on: { click: onClick }
		});
	}
	function createStatusBadge(status) {
		return el("div", {
			className: "tw3b-badge " + statusBadgeClass(status),
			text: `${statusEmoji(status)} ${statusLabel(status)}`
		});
	}
	function createEmptyState(message) {
		return el("div", {
			className: "tw3b-empty",
			text: message
		});
	}
	function createScreen(children = []) {
		return el("div", { className: "tw3b-root tw3b-screen" }, children);
	}
	function createContent(children = []) {
		return el("div", { className: "tw3b-content" }, children);
	}
	//#endregion
	//#region src/ui/search.js
	function createSearchBar({ placeholder = "Buscar artículo...", onSearch, autofocus = false }) {
		let debounceHandle = null;
		const input = el("input", {
			className: "tw3b-search-input",
			attrs: {
				type: "text",
				placeholder,
				autocomplete: "off",
				autocapitalize: "off",
				spellcheck: "false"
			}
		});
		const handleInput = () => {
			const query = input.value.trim();
			if (debounceHandle) clearTimeout(debounceHandle);
			if (query.length === 0) {
				if (typeof onSearch === "function") onSearch("");
				return;
			}
			if (query.length < CONFIG.SEARCH_MIN_LENGTH) return;
			debounceHandle = setTimeout(() => {
				if (typeof onSearch === "function") onSearch(query);
			}, 150);
		};
		input.addEventListener("input", handleInput);
		const icon = el("span", {
			text: "🔎",
			style: {
				fontSize: "14px",
				opacity: "0.7"
			}
		});
		const clearButton = el("span", {
			text: "✕",
			style: {
				fontSize: "13px",
				color: "#6b7280",
				cursor: "pointer",
				display: "none",
				padding: "2px 4px"
			},
			on: { click: () => {
				input.value = "";
				clearButton.style.display = "none";
				handleInput();
				input.focus();
			} }
		});
		input.addEventListener("input", () => {
			clearButton.style.display = input.value.length > 0 ? "flex" : "none";
		});
		const wrap = el("div", { className: "tw3b-search-wrap" }, [
			icon,
			input,
			clearButton
		]);
		if (autofocus) setTimeout(() => {
			try {
				input.focus();
			} catch {}
		}, 0);
		return {
			node: wrap,
			clear() {
				input.value = "";
				clearButton.style.display = "none";
			},
			focus() {
				input.focus();
			},
			destroy() {
				if (debounceHandle) clearTimeout(debounceHandle);
				input.removeEventListener("input", handleInput);
			}
		};
	}
	function renderSearchResults({ items, onSelect, getPrefix = null }) {
		const container = el("div", { style: {
			display: "flex",
			flexDirection: "column"
		} });
		if (!Array.isArray(items) || items.length === 0) return container;
		for (const item of items) {
			const prefix = typeof getPrefix === "function" ? getPrefix(item) : null;
			const row = el("div", {
				className: "tw3b-list-item",
				attrs: { role: "button" },
				on: { click: () => {
					if (typeof onSelect === "function") onSelect(item);
				} }
			}, [
				prefix ? el("span", { text: prefix }) : null,
				el("div", {
					className: "tw3b-list-item-name",
					text: item.name
				}),
				el("span", {
					className: "tw3b-list-item-chevron",
					text: "›"
				})
			]);
			container.appendChild(row);
		}
		return container;
	}
	//#endregion
	//#region src/ui/mainView.js
	function renderMainView({ pricelist, onNavigate }) {
		let searchBarRef = null;
		const resultsDropdown = el("div", {
			className: "tw3b-quickbar-dropdown",
			style: { display: "none" }
		});
		function clearResults() {
			resultsDropdown.innerHTML = "";
			resultsDropdown.style.display = "none";
		}
		async function handleSearch(query) {
			if (!query) {
				clearResults();
				return;
			}
			let matches = [];
			try {
				matches = await pricelist.search(query);
			} catch (error) {
				console.error("[MainView] Error buscando artículos:", error);
				resultsDropdown.innerHTML = "";
				resultsDropdown.appendChild(createEmptyState("Ocurrió un error al buscar."));
				resultsDropdown.style.display = "block";
				return;
			}
			resultsDropdown.innerHTML = "";
			if (!Array.isArray(matches) || matches.length === 0) {
				resultsDropdown.appendChild(createEmptyState("Sin resultados."));
				resultsDropdown.style.display = "block";
				return;
			}
			resultsDropdown.appendChild(renderSearchResults({
				items: matches,
				onSelect: (item) => {
					clearResults();
					onNavigate("sale", { item });
				}
			}));
			resultsDropdown.style.display = "block";
		}
		searchBarRef = createSearchBar({
			placeholder: "Buscar artículo...",
			onSearch: handleSearch
		});
		const shortcuts = el("div", { style: {
			display: "flex",
			alignItems: "center",
			gap: "4px"
		} }, [
			createShortcutButton({
				icon: "📊",
				label: "Auditor",
				onClick: () => onNavigate("audit")
			}),
			createShortcutButton({
				icon: "🕘",
				label: "Historial",
				onClick: () => onNavigate("history")
			}),
			createShortcutButton({
				icon: "⚙",
				label: "Configuración",
				onClick: () => onNavigate("settings")
			})
		]);
		return {
			node: el("div", {
				className: "tw3b-root",
				style: {
					width: "100%",
					position: "relative"
				}
			}, [el("div", { className: "tw3b-quickbar-bar" }, [el("div", { style: { flex: "1" } }, [searchBarRef.node]), shortcuts]), resultsDropdown]),
			destroy() {
				if (searchBarRef) searchBarRef.destroy();
			}
		};
	}
	function createShortcutButton({ icon, label, onClick }) {
		return el("button", {
			text: icon,
			attrs: {
				"aria-label": label,
				title: label
			},
			style: {
				width: "36px",
				height: "36px",
				minWidth: "36px",
				borderRadius: "50%",
				border: "1px solid #2e323d",
				background: "#242833",
				color: "#f5f6f8",
				fontSize: "16px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				cursor: "pointer"
			},
			on: { click: onClick }
		});
	}
	//#endregion
	//#region src/ui/saleView.js
	function renderSaleView({ item, audit, onNavigate }) {
		let copyTimeoutHandle = null;
		if (!item) return renderMessage({
			title: "Venta",
			message: "No se seleccionó ningún artículo.",
			onNavigate
		});
		if (!audit) return renderMessage({
			title: item.name,
			message: "No se recibió información de auditoría.",
			onNavigate
		});
		const buyPrice = Number(item.buyPrice ?? audit.w3bBuyPrice);
		const itemValue = Number(audit.itemValue);
		let buyRatio = Number(audit.learnedRatio ?? audit.observedRatio);
		if (!Number.isFinite(buyRatio) && Number.isFinite(buyPrice) && buyPrice > 0 && Number.isFinite(itemValue) && itemValue > 0) buyRatio = buyPrice / itemValue;
		let sellRatio = Number(audit.sellRatio);
		if (!Number.isFinite(sellRatio) && Number.isFinite(buyRatio) && buyRatio > 0) sellRatio = (1 + buyRatio) / 2;
		let sellPrice = Number(audit.recommendedSellPrice);
		if (!Number.isFinite(sellPrice) && Number.isFinite(itemValue) && itemValue > 0 && Number.isFinite(sellRatio) && sellRatio > 0) sellPrice = itemValue * sellRatio;
		const header = createHeader({
			title: item.name,
			onBack: () => {
				if (typeof onNavigate === "function") onNavigate("main", {}, { replace: true });
			}
		});
		if (!Number.isFinite(sellPrice) || sellPrice <= 0) return {
			node: createScreen([header, createContent([createEmptyState("No se pudo determinar un precio de venta.")])]),
			destroy() {}
		};
		const buyRow = createSaleRow({
			label: "Compra",
			price: Number.isFinite(buyPrice) ? formatMoney(buyPrice) : "—",
			percent: Number.isFinite(buyRatio) ? formatPercent(buyRatio) : "—"
		});
		const copyButton = el("button", {
			text: "⧉",
			attrs: {
				"aria-label": "Copiar precio de venta",
				title: "Copiar precio de venta"
			},
			style: {
				width: "36px",
				height: "36px",
				minWidth: "36px",
				borderRadius: "50%",
				border: "1px solid #2e323d",
				background: "#242833",
				color: "#f5f6f8",
				fontSize: "16px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				cursor: "pointer"
			}
		});
		const sellRow = createSaleRow({
			label: "Venta",
			price: formatMoney(sellPrice),
			percent: Number.isFinite(sellRatio) ? formatPercent(sellRatio) : "—",
			trailing: copyButton
		});
		async function handleCopy(event) {
			event.stopPropagation();
			const price = String(Math.round(sellPrice));
			const markCopied = () => {
				copyButton.textContent = "✓";
				if (copyTimeoutHandle) clearTimeout(copyTimeoutHandle);
				copyTimeoutHandle = setTimeout(() => {
					if (copyButton.isConnected) copyButton.textContent = "⧉";
				}, 1200);
			};
			try {
				await navigator.clipboard.writeText(price);
				markCopied();
			} catch (error) {
				console.warn("[SaleView] No se pudo copiar con Clipboard API:", error);
				try {
					const textarea = document.createElement("textarea");
					textarea.value = price;
					textarea.style.position = "fixed";
					textarea.style.opacity = "0";
					document.body.appendChild(textarea);
					textarea.select();
					document.execCommand("copy");
					textarea.remove();
					markCopied();
				} catch (fallbackError) {
					console.warn("[SaleView] Error en fallback de copiado:", fallbackError);
					copyButton.textContent = "×";
				}
			}
		}
		copyButton.addEventListener("click", handleCopy);
		return {
			node: createScreen([header, createContent([buyRow, sellRow])]),
			destroy() {
				if (copyTimeoutHandle) clearTimeout(copyTimeoutHandle);
				copyButton.removeEventListener("click", handleCopy);
			}
		};
	}
	function createSaleRow({ label, price, percent, trailing = null }) {
		return el("div", {
			className: "tw3b-row",
			style: { alignItems: "center" }
		}, [el("div", {
			className: "tw3b-row-label",
			text: label
		}), el("div", { style: {
			display: "flex",
			alignItems: "center",
			gap: "10px"
		} }, [el("div", { style: {
			display: "flex",
			alignItems: "baseline",
			gap: "6px"
		} }, [el("span", {
			className: "tw3b-row-value tw3b-emph",
			text: price
		}), el("span", {
			style: {
				fontSize: "13px",
				color: "#9aa0ac"
			},
			text: `(${percent})`
		})]), trailing])]);
	}
	function renderMessage({ title, message, onNavigate }) {
		return {
			node: createScreen([createHeader({
				title,
				onBack: () => {
					if (typeof onNavigate === "function") onNavigate("main", {}, { replace: true });
				}
			}), createContent([createEmptyState(message)])]),
			destroy() {}
		};
	}
	//#endregion
	//#region src/ui/auditView.js
	async function renderAuditView({ pricelist, storage, scheduler, onNavigate, onBack }) {
		let searchBarRef = null;
		let destroyed = false;
		const header = createHeader({
			title: "Auditor",
			onBack
		});
		const resultsContainer = el("div", { style: {
			display: "flex",
			flexDirection: "column"
		} });
		function createProductRow({ item, prefix }) {
			const nameNode = el("div", {
				className: "tw3b-list-item-name",
				text: item.name
			});
			const chevron = el("span", {
				className: "tw3b-list-item-chevron",
				text: "›"
			});
			const row = el("div", {
				className: "tw3b-list-item",
				attrs: { role: "button" },
				on: { click: async () => {
					if (row.dataset.loading === "true") return;
					row.dataset.loading = "true";
					nameNode.textContent = "Auditando...";
					chevron.style.visibility = "hidden";
					try {
						const audit = await scheduler.getOrAudit(item);
						if (destroyed) return;
						if (!audit) throw new Error("Artículo descartado o sin datos.");
						onNavigate("auditProduct", {
							item,
							audit
						});
					} catch (error) {
						console.error("[AuditView] Error auditando artículo:", error);
						if (destroyed) return;
						nameNode.textContent = item.name;
						chevron.style.visibility = "visible";
						row.dataset.loading = "false";
						showTransientError(error?.message || "No se pudo auditar el artículo.");
					}
				} }
			}, [
				el("span", { text: prefix }),
				nameNode,
				chevron
			]);
			return row;
		}
		const errorBanner = el("div", { style: {
			fontSize: "12px",
			color: "#e64953",
			textAlign: "center",
			padding: "6px 0",
			display: "none"
		} });
		let errorTimeoutHandle = null;
		function showTransientError(message) {
			errorBanner.textContent = message;
			errorBanner.style.display = "block";
			if (errorTimeoutHandle) clearTimeout(errorTimeoutHandle);
			errorTimeoutHandle = setTimeout(() => {
				if (!destroyed) errorBanner.style.display = "none";
			}, 3e3);
		}
		const STATUS_PRIORITY = {
			RED: 0,
			YELLOW: 1
		};
		async function loadAlertEntries() {
			const items = await pricelist.getAll();
			const audits = await storage.getAllAudits();
			const entries = [];
			for (const item of items) {
				const audit = audits[item.itemId];
				if (!audit) continue;
				if (audit.status !== "RED" && audit.status !== "YELLOW") continue;
				entries.push({
					item,
					audit
				});
			}
			entries.sort((a, b) => {
				const priorityA = STATUS_PRIORITY[a.audit.status] ?? 99;
				const priorityB = STATUS_PRIORITY[b.audit.status] ?? 99;
				if (priorityA !== priorityB) return priorityA - priorityB;
				const diffA = Math.abs(Number(a.audit.differencePercent) || 0);
				return Math.abs(Number(b.audit.differencePercent) || 0) - diffA;
			});
			return entries;
		}
		async function renderAlertList() {
			resultsContainer.innerHTML = "";
			let entries = [];
			try {
				entries = await loadAlertEntries();
			} catch (error) {
				console.error("[AuditView] Error cargando alertas:", error);
				resultsContainer.appendChild(createEmptyState("Ocurrió un error al cargar las alertas."));
				return;
			}
			if (destroyed) return;
			if (entries.length === 0) {
				resultsContainer.appendChild(createEmptyState("No hay alertas pendientes. Todos los artículos auditados están dentro del margen."));
				return;
			}
			for (const entry of entries) resultsContainer.appendChild(createProductRow({
				item: entry.item,
				prefix: statusEmoji(entry.audit.status)
			}));
		}
		async function renderSearchList(query) {
			resultsContainer.innerHTML = "";
			let matches = [];
			try {
				matches = await pricelist.search(query);
			} catch (error) {
				console.error("[AuditView] Error buscando artículos:", error);
				resultsContainer.appendChild(createEmptyState("Ocurrió un error al buscar."));
				return;
			}
			if (destroyed) return;
			if (!Array.isArray(matches) || matches.length === 0) {
				resultsContainer.appendChild(createEmptyState("Sin resultados."));
				return;
			}
			for (const item of matches) {
				let cachedAudit = null;
				try {
					cachedAudit = await storage.getAudit(item.itemId);
				} catch {
					cachedAudit = null;
				}
				if (destroyed) return;
				resultsContainer.appendChild(createProductRow({
					item,
					prefix: cachedAudit ? statusEmoji(cachedAudit.status) : "⚪"
				}));
			}
		}
		searchBarRef = createSearchBar({
			placeholder: "Buscar artículo...",
			onSearch: (query) => {
				if (!query) renderAlertList();
				else renderSearchList(query);
			}
		});
		const searchWrap = el("div", { style: {
			padding: "12px 16px",
			background: "#1c1f27",
			borderBottom: "1px solid #2e323d"
		} }, [searchBarRef.node]);
		await renderAlertList();
		return {
			node: createScreen([
				header,
				searchWrap,
				errorBanner,
				createContent([resultsContainer])
			]),
			destroy() {
				destroyed = true;
				if (errorTimeoutHandle) clearTimeout(errorTimeoutHandle);
				if (searchBarRef) searchBarRef.destroy();
			}
		};
	}
	//#endregion
	//#region src/ui/auditProductView.js
	function renderAuditProductView({ item, audit, w3bUserId, priceUpdateService, pricelist, onNavigate, onBack, onAuditUpdated }) {
		const header = createHeader({
			title: item?.name || "Producto",
			onBack
		});
		if (!item || !audit) return {
			node: createScreen([header, createContent([createEmptyState("No hay información de auditoría disponible.")])]),
			destroy() {}
		};
		const itemValue = Number(audit.itemValue);
		const w3bBuyPrice = Number(audit.w3bBuyPrice);
		const realMarketValue = Number(audit.realMarketValue);
		const correctBuyPrice = Number(audit.correctBuyPrice);
		let recommendedSellPrice = Number(audit.auditRecommendedSellPrice);
		if (!Number.isFinite(recommendedSellPrice) && Number.isFinite(realMarketValue) && realMarketValue > 0 && Number.isFinite(audit.learnedRatio) && audit.learnedRatio > 0) {
			const fallbackSellRatio = (1 + Number(audit.learnedRatio)) / 2;
			recommendedSellPrice = Math.round(realMarketValue * fallbackSellRatio);
		}
		const differencePercent = Number(audit.differencePercent);
		const confidence = Number(audit.confidence);
		const status = audit.status || null;
		const baseSection = [createRow({
			label: "Valor Torn",
			value: Number.isFinite(itemValue) ? formatMoney(itemValue) : "—"
		}), createRow({
			label: "Precio actual W3B",
			value: Number.isFinite(w3bBuyPrice) ? formatMoney(w3bBuyPrice) : "—"
		})];
		const resultSection = [
			createSectionTitle("📊 Resultado"),
			createRow({
				label: "Mercado real",
				value: Number.isFinite(realMarketValue) ? formatMoney(realMarketValue) : "—"
			}),
			createRow({
				label: "Compra recomendada",
				value: Number.isFinite(correctBuyPrice) ? formatMoney(correctBuyPrice) : "—",
				emphasis: true
			}),
			createRow({
				label: "Precio de venta",
				value: Number.isFinite(recommendedSellPrice) ? formatMoney(recommendedSellPrice) : "—"
			}),
			createRow({
				label: "Diferencia",
				value: Number.isFinite(differencePercent) ? formatPercent(differencePercent, { signed: true }) : "—"
			}),
			createRow({
				label: "Confianza",
				value: Number.isFinite(confidence) ? `${Math.round(confidence)}%` : "—"
			})
		];
		const statusBadge = status ? createStatusBadge(status) : null;
		const proposal = audit.priceProposal || null;
		const canApply = proposal?.updateAvailable === true;
		let applyButton = null;
		let applyStatusText = null;
		if (canApply) {
			applyStatusText = el("div", {
				style: {
					fontSize: "12px",
					color: "#9aa0ac",
					textAlign: "center",
					minHeight: "16px"
				},
				text: ""
			});
			applyButton = createButton({
				label: "Aplicar cambio",
				variant: "primary",
				onClick: handleApplyClick
			});
		}
		async function handleApplyClick() {
			if (!applyButton) return;
			applyButton.disabled = true;
			applyButton.textContent = "Aplicando...";
			applyStatusText.textContent = "";
			applyStatusText.style.color = "#9aa0ac";
			try {
				if (!(w3bUserId !== null && w3bUserId !== void 0 && String(w3bUserId).trim() !== "")) throw new Error("No se configuró un W3B User ID. Revisa Configuración.");
				if (!priceUpdateService || typeof priceUpdateService.accept !== "function") throw new Error("PriceUpdateService no está disponible.");
				if (!pricelist || typeof pricelist.updatePrice !== "function") throw new Error("Pricelist no está disponible.");
				const updateResult = await priceUpdateService.accept(proposal);
				await pricelist.updatePrice(w3bUserId, item.itemId, updateResult.recommendedBuyPrice);
				applyButton.textContent = "✓ Aplicado";
				applyStatusText.style.color = "#37b24d";
				applyStatusText.textContent = `Nuevo precio: ${formatMoney(updateResult.recommendedBuyPrice)}`;
				if (typeof onAuditUpdated === "function") onAuditUpdated(item.itemId);
			} catch (error) {
				console.error("[AuditProductView] Error aplicando cambio:", error);
				applyButton.disabled = false;
				applyButton.textContent = "Aplicar cambio";
				applyStatusText.style.color = "#e64953";
				applyStatusText.textContent = error?.message || "Ocurrió un error al aplicar el cambio.";
			}
		}
		const navCards = [
			createCard({
				icon: "📊",
				label: "Mercado",
				onClick: () => {
					onNavigate("market", {
						item,
						audit
					});
				}
			}),
			createCard({
				icon: "🏪",
				label: "Competencia",
				onClick: () => {
					onNavigate("competition", {
						item,
						audit
					});
				}
			}),
			createCard({
				icon: "📚",
				label: "Aprendizaje",
				onClick: () => {
					onNavigate("learning", {
						item,
						audit
					});
				}
			}),
			createCard({
				icon: "🕘",
				label: "Historial",
				onClick: () => {
					onNavigate("historyProduct", { item });
				}
			})
		];
		return {
			node: createScreen([header, createContent([
				...baseSection,
				createDivider(),
				...resultSection,
				statusBadge,
				applyButton,
				applyStatusText,
				createDivider(),
				...navCards
			])]),
			destroy() {}
		};
	}
	//#endregion
	//#region src/ui/marketView.js
	function renderMarketView({ item, audit, onNavigate, onBack }) {
		const header = createHeader({
			title: "Análisis del mercado",
			onBack
		});
		const market = audit?.market || null;
		if (!market) return {
			node: createScreen([header, createContent([createEmptyState("No hay datos de mercado disponibles para este artículo.")])]),
			destroy() {}
		};
		const totalQuantity = Number(market.totalQuantity);
		const targetQuantity = Number(market.targetQuantity);
		const requiredListings = Number(market.requiredListings);
		const sampleSize = Number(market.sampleSize);
		let effectiveSamplePercent = null;
		if (Number.isFinite(sampleSize) && Number.isFinite(requiredListings) && requiredListings > 0) effectiveSamplePercent = sampleSize / requiredListings;
		const supplySection = [
			createSectionTitle("📦 Oferta"),
			createRow({
				label: "Unidades totales",
				value: Number.isFinite(totalQuantity) ? formatCompactNumber(totalQuantity) : "—"
			}),
			createRow({
				label: "Muestra",
				value: Number.isFinite(targetQuantity) ? formatCompactNumber(targetQuantity) : "—"
			}),
			createRow({
				label: "Vendedores analizados",
				value: Number.isFinite(requiredListings) ? formatCompactNumber(requiredListings) : "—"
			}),
			createRow({
				label: "Muestra efectiva",
				value: Number.isFinite(effectiveSamplePercent) ? formatPercent(effectiveSamplePercent) : "—"
			})
		];
		const weightedMean = Number(market.weightedMean);
		const weightedMedian = Number(market.weightedMedian);
		const realMarketValue = Number(market.realMarketValue);
		const correctBuyPrice = Number(audit.correctBuyPrice);
		const confidence = Number(market.confidence);
		const pricesSection = [
			createSectionTitle("💰 Precios"),
			createRow({
				label: "Promedio ponderado",
				value: Number.isFinite(weightedMean) ? formatMoney(weightedMean) : "—"
			}),
			createRow({
				label: "Mediana ponderada",
				value: Number.isFinite(weightedMedian) ? formatMoney(weightedMedian) : "—"
			}),
			createRow({
				label: "Mercado estimado",
				value: Number.isFinite(realMarketValue) ? formatMoney(realMarketValue) : "—",
				emphasis: true
			}),
			createRow({
				label: "Compra calculada",
				value: Number.isFinite(correctBuyPrice) ? formatMoney(correctBuyPrice) : "—"
			}),
			createRow({
				label: "Confianza",
				value: Number.isFinite(confidence) ? `${Math.round(confidence)}%` : "—"
			})
		];
		const distributionCard = createCard({
			icon: "📊",
			label: "Ver distribución",
			onClick: () => {
				if (typeof onNavigate === "function") onNavigate("distribution", {
					item,
					audit
				});
			}
		});
		return {
			node: createScreen([header, createContent([
				...supplySection,
				createDivider(),
				...pricesSection,
				distributionCard
			])]),
			destroy() {}
		};
	}
	//#endregion
	//#region src/ui/distributionView.js
	function renderDistributionView({ audit, onBack }) {
		const header = createHeader({
			title: "Distribución",
			onBack
		});
		const market = audit?.market || null;
		const sampleListings = Array.isArray(market?.sampleListings) ? market.sampleListings : [];
		if (!market || sampleListings.length === 0) return {
			node: createScreen([header, createContent([createEmptyState("No hay datos de distribución disponibles para este artículo.")])]),
			destroy() {}
		};
		const totalQuantity = Number(market.totalQuantity);
		const targetQuantity = Number(market.targetQuantity);
		const requiredListings = Number(market.requiredListings);
		const sampleSize = Number(market.sampleSize);
		const summarySection = [
			createRow({
				label: "Mercado",
				value: Number.isFinite(totalQuantity) ? `${formatCompactNumber(totalQuantity)} unidades` : "—"
			}),
			createRow({
				label: "Muestra objetivo",
				value: Number.isFinite(targetQuantity) ? formatCompactNumber(targetQuantity) : "—"
			}),
			createRow({
				label: "Vendedores encontrados",
				value: Number.isFinite(requiredListings) ? formatCompactNumber(requiredListings) : "—"
			})
		];
		let effectiveSamplePercent = null;
		if (Number.isFinite(sampleSize) && Number.isFinite(requiredListings) && requiredListings > 0) effectiveSamplePercent = sampleSize / requiredListings;
		const included = Number.isFinite(sampleSize) ? sampleSize : sampleListings.length;
		const excluded = Number.isFinite(requiredListings) ? Math.max(0, requiredListings - included) : null;
		const sampleSection = [
			createRow({
				label: "Muestra final",
				value: Number.isFinite(effectiveSamplePercent) ? formatPercent(effectiveSamplePercent) : "—"
			}),
			createRow({
				label: "Incluidos",
				value: String(included)
			}),
			createRow({
				label: "Excluidos",
				value: excluded !== null ? String(excluded) : "—"
			})
		];
		const distributionRows = groupListingsByPrice(sampleListings).map((group) => el("div", {
			className: "tw3b-dist-row tw3b-dist-included",
			text: `${formatMoney(group.price)} × ${group.quantity}`
		}));
		return {
			node: createScreen([header, createContent([
				...summarySection,
				createDivider(),
				...sampleSection,
				createDivider(),
				...distributionRows
			])]),
			destroy() {}
		};
	}
	function groupListingsByPrice(listings) {
		const groups = /* @__PURE__ */ new Map();
		for (const listing of listings) {
			const price = Number(listing?.price);
			const quantity = Number(listing?.quantity);
			if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) continue;
			const existing = groups.get(price) || 0;
			groups.set(price, existing + quantity);
		}
		return Array.from(groups.entries()).map(([price, quantity]) => ({
			price,
			quantity
		})).sort((a, b) => a.price - b.price);
	}
	//#endregion
	//#region src/ui/competitionView.js
	var TOP_TRADERS_PREVIEW_COUNT = 6;
	function renderCompetitionView({ audit, onBack }) {
		const header = createHeader({
			title: "Competencia",
			onBack
		});
		const bazaars = audit?.bazaars || null;
		if (!bazaars) return {
			node: createScreen([header, createContent([createEmptyState("No hay datos de bazares disponibles para este artículo.")])]),
			destroy() {}
		};
		const weightedMean = Number(bazaars.weightedMean);
		const weightedMedian = Number(bazaars.weightedMedian);
		const summarySection = [
			createSectionTitle("🏪 Bazares"),
			createRow({
				label: "Precio promedio",
				value: Number.isFinite(weightedMean) ? formatMoney(weightedMean) : "—"
			}),
			createRow({
				label: "Precio volumen",
				value: Number.isFinite(weightedMedian) ? formatMoney(weightedMedian) : "—"
			})
		];
		const topTraders = Array.isArray(bazaars.topTraders) ? bazaars.topTraders : [];
		const rankingTitle = createSectionTitle("Mayor volumen");
		const rankingContainer = el("div", { style: {
			display: "flex",
			flexDirection: "column"
		} });
		let expanded = false;
		const seeAllButton = el("div", {
			className: "tw3b-card",
			attrs: { role: "button" },
			style: {
				justifyContent: "center",
				marginTop: "6px"
			},
			on: { click: () => {
				expanded = !expanded;
				renderRanking();
			} }
		}, [el("span", {
			className: "tw3b-card-label",
			style: { textAlign: "center" },
			text: expanded ? "Ver menos" : "Ver todos"
		})]);
		function renderRanking() {
			rankingContainer.innerHTML = "";
			if (topTraders.length === 0) {
				rankingContainer.appendChild(createEmptyState("No hay vendedores registrados en bazares."));
				seeAllButton.style.display = "none";
				return;
			}
			const visibleTraders = expanded ? topTraders : topTraders.slice(0, TOP_TRADERS_PREVIEW_COUNT);
			for (const trader of visibleTraders) rankingContainer.appendChild(createTraderRow(trader));
			seeAllButton.style.display = topTraders.length > TOP_TRADERS_PREVIEW_COUNT ? "flex" : "none";
			seeAllButton.querySelector(".tw3b-card-label").textContent = expanded ? "Ver menos" : "Ver todos";
		}
		renderRanking();
		return {
			node: createScreen([header, createContent([
				...summarySection,
				createDivider(),
				rankingTitle,
				rankingContainer,
				seeAllButton
			])]),
			destroy() {}
		};
	}
	function createTraderRow(trader) {
		const name = trader.playerName || (trader.playerId ? `Jugador #${trader.playerId}` : "Desconocido");
		const price = Number(trader.averagePrice);
		const quantity = Number(trader.quantity);
		return el("div", { className: "tw3b-row" }, [el("div", {
			className: "tw3b-row-label",
			style: {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				maxWidth: "55%"
			},
			text: name
		}), el("div", {
			className: "tw3b-row-value",
			text: `${Number.isFinite(price) ? formatMoney(price) : "—"} ×${Number.isFinite(quantity) ? formatCompactNumber(quantity) : "—"}`
		})]);
	}
	//#endregion
	//#region src/ui/learningView.js
	function renderLearningView({ audit, internalPrice, onBack }) {
		const header = createHeader({
			title: "Aprendizaje",
			onBack
		});
		if (!internalPrice) return {
			node: createScreen([header, createContent([createEmptyState("Este artículo todavía no generó una actualización de precio interno. El aprendizaje aparece aquí una vez que ocurre la primera actualización.")])]),
			destroy() {}
		};
		const initialValue = Number(internalPrice.initialInternalMarketValue);
		const learnedValue = Number(internalPrice.internalMarketValue);
		const buyRatio = Number(internalPrice.learnedRatio);
		const sellRatio = Number.isFinite(buyRatio) && buyRatio > 0 ? (1 + buyRatio) / 2 : null;
		const buyMargin = Number.isFinite(buyRatio) ? 1 - buyRatio : null;
		const sellMargin = Number.isFinite(sellRatio) ? 1 - sellRatio : null;
		const initialBuyPrice = Number(internalPrice.initialRecommendedBuyPrice);
		const currentBuyPrice = Number(internalPrice.recommendedBuyPrice);
		const currentSellPrice = Number.isFinite(learnedValue) && Number.isFinite(sellRatio) ? Math.round(learnedValue * sellRatio) : null;
		const internalSection = [
			createSectionTitle("📚 Referencia interna"),
			createRow({
				label: "Valor inicial",
				value: Number.isFinite(initialValue) ? formatMoney(initialValue) : "—"
			}),
			createRow({
				label: "Valor aprendido",
				value: Number.isFinite(learnedValue) ? formatMoney(learnedValue) : "—",
				emphasis: true
			}),
			createRow({
				label: "Margen compra",
				value: buyMargin !== null ? formatPercent(buyMargin) : "—"
			}),
			createRow({
				label: "Margen venta",
				value: sellMargin !== null ? formatPercent(sellMargin) : "—"
			}),
			createRow({
				label: "Compra inicial",
				value: Number.isFinite(initialBuyPrice) ? formatMoney(initialBuyPrice) : "—"
			}),
			createRow({
				label: "Compra actual",
				value: Number.isFinite(currentBuyPrice) ? formatMoney(currentBuyPrice) : "—"
			}),
			createRow({
				label: "Venta actual",
				value: currentSellPrice !== null ? formatMoney(currentSellPrice) : "—"
			})
		];
		const initialW3bPrice = Number(internalPrice.initialW3bBuyPrice);
		const currentW3bPrice = Number(audit?.w3bBuyPrice);
		const w3bSection = [createRow({
			label: "W3B original",
			value: Number.isFinite(initialW3bPrice) ? formatMoney(initialW3bPrice) : "—"
		}), createRow({
			label: "W3B actual",
			value: Number.isFinite(currentW3bPrice) ? formatMoney(currentW3bPrice) : "—"
		})];
		const caption = createEmptyState("El valor interno se aprende mediante auditorías.");
		return {
			node: createScreen([header, createContent([
				...internalSection,
				createDivider(),
				...w3bSection,
				caption
			])]),
			destroy() {}
		};
	}
	//#endregion
	//#region src/ui/historyView.js
	var HISTORY_PERIODS = [
		{
			key: "yesterday",
			label: "Último día",
			icon: "📅"
		},
		{
			key: "last7d",
			label: "Última semana",
			icon: "📅"
		},
		{
			key: "last30d",
			label: "Último mes",
			icon: "📅"
		},
		{
			key: "last6m",
			label: "Últimos 6 meses",
			icon: "📅"
		}
	];
	var WEEKDAY_LETTERS = [
		"D",
		"L",
		"M",
		"X",
		"J",
		"V",
		"S"
	];
	var MONTH_LABELS = [
		"ENE",
		"FEB",
		"MAR",
		"ABR",
		"MAY",
		"JUN",
		"JUL",
		"AGO",
		"SEP",
		"OCT",
		"NOV",
		"DIC"
	];
	async function renderHistoryGeneralView({ history, pricelist, onNavigate, onBack }) {
		let searchBarRef = null;
		const header = createHeader({
			title: "Historial",
			onBack
		});
		const resultsContainer = el("div", { style: {
			display: "flex",
			flexDirection: "column"
		} });
		async function handleSearch(query) {
			resultsContainer.innerHTML = "";
			if (!query) {
				renderRecentSection();
				return;
			}
			let matches = [];
			try {
				matches = await pricelist.search(query);
			} catch (error) {
				console.error("[HistoryView] Error buscando artículos:", error);
				resultsContainer.appendChild(createEmptyState("Ocurrió un error al buscar."));
				return;
			}
			if (!Array.isArray(matches) || matches.length === 0) {
				resultsContainer.appendChild(createEmptyState("Sin resultados."));
				return;
			}
			resultsContainer.appendChild(renderSearchResults({
				items: matches,
				onSelect: (item) => {
					onNavigate("historyProduct", { item });
				}
			}));
		}
		searchBarRef = createSearchBar({
			placeholder: "Buscar artículo...",
			onSearch: handleSearch
		});
		const recentSection = el("div", { style: {
			display: "flex",
			flexDirection: "column"
		} });
		function renderRecentSection() {
			resultsContainer.innerHTML = "";
			resultsContainer.appendChild(recentSection);
		}
		let recentEntries = [];
		try {
			recentEntries = await history.getRecentlyUpdated(10);
		} catch (error) {
			console.error("[HistoryView] Error obteniendo artículos recientes:", error);
		}
		recentSection.innerHTML = "";
		if (!Array.isArray(recentEntries) || recentEntries.length === 0) recentSection.appendChild(createEmptyState("Todavía no hay artículos con historial registrado."));
		else {
			recentSection.appendChild(createSectionTitle("Actualizados recientemente"));
			for (const entry of recentEntries) {
				const item = await pricelist.getById(entry.itemId);
				if (!item) continue;
				recentSection.appendChild(el("div", {
					className: "tw3b-list-item",
					attrs: { role: "button" },
					on: { click: () => {
						onNavigate("historyProduct", { item });
					} }
				}, [el("div", {
					className: "tw3b-list-item-name",
					text: item.name
				}), el("span", {
					className: "tw3b-list-item-chevron",
					text: "›"
				})]));
			}
		}
		renderRecentSection();
		return {
			node: createScreen([
				header,
				el("div", { style: {
					padding: "12px 16px",
					background: "#1c1f27",
					borderBottom: "1px solid #2e323d"
				} }, [searchBarRef.node]),
				createContent([resultsContainer])
			]),
			destroy() {
				if (searchBarRef) searchBarRef.destroy();
			}
		};
	}
	async function renderHistoryProductView({ item, history, onNavigate, onBack }) {
		const header = createHeader({
			title: "Historial",
			onBack
		});
		if (!item) return {
			node: createScreen([header, createContent([createEmptyState("No se seleccionó ningún artículo.")])]),
			destroy() {}
		};
		let summary = null;
		try {
			summary = await history.getSummary(item.itemId);
		} catch (error) {
			console.error("[HistoryView] Error obteniendo resumen de historial:", error);
		}
		const cards = HISTORY_PERIODS.map((period) => {
			const aggregate = summary?.[period.key] || null;
			const price = aggregate && Number.isFinite(Number(aggregate.avgCorrectBuyPrice)) ? formatMoney(aggregate.avgCorrectBuyPrice) : "Sin datos";
			return createCard({
				icon: period.icon,
				label: period.label.toUpperCase(),
				value: price,
				onClick: () => {
					onNavigate("historyPeriod", {
						item,
						period: period.key
					});
				}
			});
		});
		return {
			node: createScreen([header, createContent([el("div", {
				style: {
					fontSize: "15px",
					fontWeight: "600",
					marginBottom: "4px"
				},
				text: item.name
			}), ...cards])]),
			destroy() {}
		};
	}
	async function renderHistoryPeriodView({ item, period, history, auditHistory, onBack }) {
		const header = createHeader({
			title: (HISTORY_PERIODS.find((p) => p.key === period) || HISTORY_PERIODS[0]).label,
			onBack
		});
		if (!item) return {
			node: createScreen([header, createContent([createEmptyState("No se seleccionó ningún artículo.")])]),
			destroy() {}
		};
		let chartData = null;
		try {
			chartData = await buildPeriodChartData({
				itemId: item.itemId,
				period,
				history,
				auditHistory
			});
		} catch (error) {
			console.error("[HistoryView] Error construyendo datos del período:", error);
		}
		if (!chartData || chartData.points.length === 0) return {
			node: createScreen([header, createContent([el("div", {
				style: {
					fontSize: "15px",
					fontWeight: "600"
				},
				text: item.name
			}), createEmptyState("No hay suficientes datos para este período todavía.")])]),
			destroy() {}
		};
		const chartTitle = createSectionTitle(chartData.chartTitle);
		const chartSvg = buildLineChart({
			values: chartData.points.map((p) => p.value),
			labels: chartData.points.map((p) => p.label)
		});
		const summaryValue = Number.isFinite(chartData.averageValue) ? formatMoney(chartData.averageValue) : "—";
		return {
			node: createScreen([header, createContent([
				el("div", {
					style: {
						fontSize: "15px",
						fontWeight: "600"
					},
					text: item.name
				}),
				chartTitle,
				chartSvg,
				createDivider(),
				el("div", {
					style: {
						fontSize: "13px",
						color: "#9aa0ac",
						textAlign: "center"
					},
					text: chartData.priceLabel
				}),
				el("div", {
					style: {
						fontSize: "28px",
						fontWeight: "700",
						textAlign: "center",
						margin: "4px 0 12px 0"
					},
					text: summaryValue
				}),
				el("div", { className: "tw3b-row" }, [el("div", {
					className: "tw3b-row-label",
					text: chartData.countLabel
				}), el("div", {
					className: "tw3b-row-value",
					text: String(chartData.points.length)
				})])
			])]),
			destroy() {}
		};
	}
	async function buildPeriodChartData({ itemId, period, history, auditHistory }) {
		if (period === "yesterday") {
			const rawEntries = auditHistory ? await auditHistory.getAll(itemId) : [];
			const now = Date.now();
			const day = 864e5;
			const points = (Array.isArray(rawEntries) ? rawEntries : []).filter((entry) => {
				const timestamp = Number(entry?.timestamp);
				if (!Number.isFinite(timestamp)) return false;
				const age = now - timestamp;
				return age >= 0 && age <= day;
			}).sort((a, b) => a.timestamp - b.timestamp).filter((entry) => Number.isFinite(Number(entry.correctBuyPrice))).map((entry) => ({
				value: Number(entry.correctBuyPrice),
				label: formatHourLabel(entry.timestamp),
				timestamp: entry.timestamp
			}));
			return {
				points,
				averageValue: average(points.map((p) => p.value)),
				chartTitle: "Precio durante el día",
				priceLabel: "Precio del día",
				countLabel: "Auditorías realizadas"
			};
		}
		if (period === "last7d" || period === "last30d") {
			const rangeDays = period === "last7d" ? 7 : 30;
			const series = history ? await history.getSeries(itemId) : [];
			const now = Date.now();
			const dayMs = 864e5;
			const points = (Array.isArray(series) ? series : []).filter((snapshot) => {
				const timestamp = Number(snapshot?.timestamp);
				if (!Number.isFinite(timestamp)) return false;
				const age = now - timestamp;
				return age >= 0 && age <= rangeDays * dayMs;
			}).sort((a, b) => a.timestamp - b.timestamp).filter((snapshot) => Number.isFinite(Number(snapshot.correctBuyPrice))).map((snapshot) => ({
				value: Number(snapshot.correctBuyPrice),
				label: period === "last7d" ? formatWeekdayLabel(snapshot.timestamp) : formatDayOfMonthLabel(snapshot.timestamp),
				timestamp: snapshot.timestamp
			}));
			return {
				points,
				averageValue: average(points.map((p) => p.value)),
				chartTitle: "Precio por día",
				priceLabel: period === "last7d" ? "Precio de la semana" : "Precio del mes",
				countLabel: "Días disponibles"
			};
		}
		if (period === "last6m") {
			const series = history ? await history.getSeries(itemId) : [];
			const now = Date.now();
			const dayMs = 864e5;
			const filtered = (Array.isArray(series) ? series : []).filter((snapshot) => {
				const timestamp = Number(snapshot?.timestamp);
				if (!Number.isFinite(timestamp)) return false;
				const age = now - timestamp;
				return age >= 0 && age <= 180 * dayMs;
			});
			const monthBuckets = /* @__PURE__ */ new Map();
			for (const snapshot of filtered) {
				const price = Number(snapshot.correctBuyPrice);
				if (!Number.isFinite(price)) continue;
				const date = new Date(Number(snapshot.timestamp));
				const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
				const bucket = monthBuckets.get(monthKey) || {
					sum: 0,
					count: 0,
					timestamp: snapshot.timestamp
				};
				bucket.sum += price;
				bucket.count += 1;
				monthBuckets.set(monthKey, bucket);
			}
			const points = Array.from(monthBuckets.entries()).map(([monthKey, bucket]) => ({
				value: bucket.sum / bucket.count,
				label: formatMonthLabel(bucket.timestamp),
				timestamp: bucket.timestamp
			})).sort((a, b) => a.timestamp - b.timestamp);
			return {
				points,
				averageValue: average(points.map((p) => p.value)),
				chartTitle: "Precio por mes",
				priceLabel: "Precio 6 meses",
				countLabel: "Meses disponibles"
			};
		}
		return {
			points: [],
			averageValue: null,
			chartTitle: "",
			priceLabel: "",
			countLabel: ""
		};
	}
	function formatHourLabel(timestamp) {
		const date = new Date(Number(timestamp));
		return `${String(date.getHours()).padStart(2, "0")}h`;
	}
	function formatWeekdayLabel(timestamp) {
		return WEEKDAY_LETTERS[new Date(Number(timestamp)).getDay()];
	}
	function formatDayOfMonthLabel(timestamp) {
		const date = new Date(Number(timestamp));
		return String(date.getDate());
	}
	function formatMonthLabel(timestamp) {
		return MONTH_LABELS[new Date(Number(timestamp)).getMonth()];
	}
	function average(values) {
		const valid = values.filter((value) => Number.isFinite(value));
		if (valid.length === 0) return null;
		return valid.reduce((total, value) => total + value, 0) / valid.length;
	}
	var CHART_WIDTH = 280;
	var CHART_PADDING = 24;
	function buildLineChart({ values, labels }) {
		const validValues = values.filter((value) => Number.isFinite(value));
		if (validValues.length === 0) return createEmptyState("Sin datos suficientes para graficar.");
		const minValue = Math.min(...validValues);
		const maxValue = Math.max(...validValues);
		const range = maxValue - minValue || 1;
		const usableWidth = 232;
		const usableHeight = 72;
		const stepX = values.length > 1 ? usableWidth / (values.length - 1) : 0;
		const coords = values.map((value, index) => {
			return {
				x: CHART_PADDING + stepX * index,
				y: 96 - (value - minValue) / range * usableHeight
			};
		});
		const pointsAttr = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");
		const svg = svgEl("svg", {
			viewBox: `0 0 ${CHART_WIDTH} 140`,
			width: "100%",
			height: `140`,
			style: "display:block;"
		});
		svg.appendChild(svgEl("polyline", {
			points: pointsAttr,
			fill: "none",
			stroke: "#4dabf7",
			"stroke-width": "2",
			"stroke-linejoin": "round",
			"stroke-linecap": "round"
		}));
		for (const coord of coords) svg.appendChild(svgEl("circle", {
			cx: coord.x,
			cy: coord.y,
			r: "2.5",
			fill: "#4dabf7"
		}));
		svg.appendChild(svgEl("text", {
			x: 2,
			y: CHART_PADDING,
			fill: "#9aa0ac",
			"font-size": "9"
		}, formatMoney(maxValue)));
		svg.appendChild(svgEl("text", {
			x: 2,
			y: 96,
			fill: "#9aa0ac",
			"font-size": "9"
		}, formatMoney(minValue)));
		const labelIndexes = pickLabelIndexes(labels.length, 5);
		for (const index of labelIndexes) {
			const coord = coords[index];
			if (!coord) continue;
			svg.appendChild(svgEl("text", {
				x: coord.x,
				y: 134,
				fill: "#6b7280",
				"font-size": "9",
				"text-anchor": "middle"
			}, labels[index]));
		}
		return svg;
	}
	function pickLabelIndexes(total, max) {
		if (total <= max) return Array.from({ length: total }, (_, i) => i);
		const indexes = [];
		const step = (total - 1) / (max - 1);
		for (let i = 0; i < max; i++) indexes.push(Math.round(step * i));
		return Array.from(new Set(indexes));
	}
	function svgEl(tag, attrs = {}, textContent = null) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
		if (textContent !== null) node.textContent = textContent;
		return node;
	}
	//#endregion
	//#region src/ui/settingsView.js
	async function renderSettingsView({ storage, tornAPI, w3bAPI, pricelist, scheduler, onBack, onCredentialsSaved }) {
		const header = createHeader({
			title: "Configuración",
			onBack
		});
		let currentConfig = {
			tornApiKey: null,
			w3bApiKey: null,
			w3bUserId: null,
			settings: {}
		};
		try {
			currentConfig = await storage.getConfig();
		} catch (error) {
			console.error("[SettingsView] Error cargando configuración:", error);
		}
		const tornApiKeyInput = createFieldInput({
			type: "password",
			value: currentConfig?.tornApiKey || "",
			placeholder: "Torn API Key"
		});
		const w3bUserIdInput = createFieldInput({
			type: "text",
			value: currentConfig?.w3bUserId || "",
			placeholder: "123456"
		});
		const w3bApiKeyInput = createFieldInput({
			type: "password",
			value: currentConfig?.w3bApiKey || "",
			placeholder: "W3B API Key"
		});
		const credentialsSection = [
			createSectionTitle("🔑 Credenciales"),
			createFieldGroup({
				label: "Torn API Key",
				input: tornApiKeyInput
			}),
			createFieldGroup({
				label: "W3B User ID",
				input: w3bUserIdInput
			}),
			createFieldGroup({
				label: "W3B API Key",
				input: w3bApiKeyInput
			})
		];
		const statusLine = el("div", {
			style: {
				fontSize: "13px",
				color: "#9aa0ac",
				textAlign: "center",
				marginTop: "8px"
			},
			text: describeInitialStatus(currentConfig)
		});
		const saveButton = createButton({
			label: "Guardar y sincronizar",
			variant: "primary",
			onClick: handleSave
		});
		async function handleSave() {
			saveButton.disabled = true;
			saveButton.textContent = "Sincronizando...";
			statusLine.style.color = "#9aa0ac";
			statusLine.textContent = "Conectando...";
			const tornApiKey = tornApiKeyInput.value.trim();
			const w3bUserId = w3bUserIdInput.value.trim();
			const w3bApiKey = w3bApiKeyInput.value.trim();
			try {
				if (!tornApiKey) throw new Error("La Torn API Key es obligatoria.");
				if (!w3bUserId) throw new Error("El W3B User ID es obligatorio.");
				await storage.saveConfig({
					tornApiKey,
					w3bUserId,
					w3bApiKey: w3bApiKey || null
				});
				if (tornAPI) tornAPI.apiKey = tornApiKey;
				if (w3bAPI) w3bAPI.apiKey = w3bApiKey || null;
				if (!pricelist || typeof pricelist.sync !== "function") throw new Error("Pricelist no está disponible.");
				const result = await pricelist.sync(w3bUserId);
				const itemCount = Array.isArray(result?.items) ? result.items.length : 0;
				statusLine.style.color = "#37b24d";
				statusLine.textContent = `🟢 Conectado — ${itemCount} artículos sincronizados`;
				saveButton.textContent = "✓ Guardado";
				if (typeof onCredentialsSaved === "function") onCredentialsSaved();
			} catch (error) {
				console.error("[SettingsView] Error guardando configuración:", error);
				statusLine.style.color = "#e64953";
				statusLine.textContent = `🔴 ${error?.message || "No se pudo conectar."}`;
				saveButton.textContent = "Guardar y sincronizar";
			} finally {
				saveButton.disabled = false;
				setTimeout(() => {
					if (saveButton.isConnected && saveButton.textContent === "✓ Guardado") saveButton.textContent = "Guardar y sincronizar";
				}, 2e3);
			}
		}
		const resetStatusLine = el("div", {
			style: {
				fontSize: "12px",
				color: "#9aa0ac",
				textAlign: "center",
				marginTop: "8px",
				minHeight: "16px"
			},
			text: ""
		});
		const resetButton = createButton({
			label: "Borrar todos los datos",
			variant: "secondary",
			onClick: handleResetAll
		});
		async function handleResetAll() {
			if (!window.confirm("¿Seguro que quieres borrar TODOS los datos de TornW3B?\n\nEsto incluye credenciales, pricelist, auditorías, historial y precios internos aprendidos.\n\nÚsalo si sospechas que auditorías de una versión anterior con errores están afectando los resultados actuales.")) return;
			if (!window.confirm("Esta acción NO se puede deshacer. Tendrás que volver a configurar tus API Keys. ¿Continuar?")) return;
			resetButton.disabled = true;
			resetButton.textContent = "Borrando...";
			resetStatusLine.style.color = "#9aa0ac";
			resetStatusLine.textContent = "Borrando datos...";
			try {
				if (scheduler && typeof scheduler.stop === "function") scheduler.stop();
				if (!storage || typeof storage.resetAll !== "function") throw new Error("Storage.resetAll no está disponible.");
				await storage.resetAll();
				resetStatusLine.style.color = "#37b24d";
				resetStatusLine.textContent = "🟢 Datos borrados. Recargando...";
				setTimeout(() => {
					window.location.reload();
				}, 800);
			} catch (error) {
				console.error("[SettingsView] Error borrando datos:", error);
				resetButton.disabled = false;
				resetButton.textContent = "Borrar todos los datos";
				resetStatusLine.style.color = "#e64953";
				resetStatusLine.textContent = `🔴 ${error?.message || "No se pudieron borrar los datos."}`;
			}
		}
		const maintenanceSection = [
			createSectionTitle("🗑 Mantenimiento"),
			resetButton,
			resetStatusLine
		];
		return {
			node: createScreen([header, createContent([
				...credentialsSection,
				saveButton,
				statusLine,
				...maintenanceSection
			])]),
			destroy() {}
		};
	}
	function describeInitialStatus(config) {
		const hasTornKey = Boolean(config?.tornApiKey);
		const hasUserId = Boolean(config?.w3bUserId);
		if (hasTornKey && hasUserId) return "Credenciales guardadas. Toca el botón para re-sincronizar.";
		return "Aún no se configuraron credenciales.";
	}
	function createFieldInput({ type, value, placeholder }) {
		return el("input", {
			style: {
				width: "100%",
				background: "#1c1f27",
				border: "1px solid #2e323d",
				borderRadius: "8px",
				padding: "10px 12px",
				color: "#f5f6f8",
				fontSize: "14px",
				outline: "none"
			},
			attrs: {
				type,
				value: value || "",
				placeholder,
				autocomplete: "off",
				autocapitalize: "off",
				spellcheck: "false"
			}
		});
	}
	function createFieldGroup({ label, input }) {
		return el("div", { style: {
			display: "flex",
			flexDirection: "column",
			gap: "4px",
			marginBottom: "10px"
		} }, [el("label", {
			style: {
				fontSize: "12px",
				color: "#9aa0ac"
			},
			text: label
		}), input]);
	}
	//#endregion
	//#region src/ui/app.js
	var FAB_POSITION_KEY = "tw3b_fab_position";
	var routes = {
		async sale(params, ctx) {
			const item = params.item;
			let audit = params.audit || null;
			if (!audit && item && ctx.scheduler) try {
				audit = await ctx.scheduler.getOrAudit(item);
			} catch (error) {
				console.error("[App] Error obteniendo auditoría para Venta:", error);
			}
			return renderSaleView({
				item,
				audit,
				onNavigate: ctx.navigate
			});
		},
		async audit(params, ctx) {
			return renderAuditView({
				pricelist: ctx.pricelist,
				storage: ctx.storage,
				scheduler: ctx.scheduler,
				onNavigate: ctx.navigate,
				onBack: ctx.back
			});
		},
		async auditProduct(params, ctx) {
			let w3bUserId = null;
			try {
				w3bUserId = (await ctx.storage.getConfig())?.w3bUserId || null;
			} catch (error) {
				console.error("[App] Error obteniendo configuración:", error);
			}
			return renderAuditProductView({
				item: params.item,
				audit: params.audit,
				w3bUserId,
				priceUpdateService: ctx.priceUpdateService,
				pricelist: ctx.pricelist,
				onNavigate: ctx.navigate,
				onBack: ctx.back,
				onAuditUpdated: ctx.handleAuditUpdated
			});
		},
		async market(params, ctx) {
			return renderMarketView({
				item: params.item,
				audit: params.audit,
				onNavigate: ctx.navigate,
				onBack: ctx.back
			});
		},
		async distribution(params, ctx) {
			return renderDistributionView({
				audit: params.audit,
				onBack: ctx.back
			});
		},
		async competition(params, ctx) {
			return renderCompetitionView({
				audit: params.audit,
				onBack: ctx.back
			});
		},
		async learning(params, ctx) {
			let internalPrice = null;
			if (params.item && ctx.storage) try {
				internalPrice = await ctx.storage.getInternalPrice(params.item.itemId);
			} catch (error) {
				console.error("[App] Error obteniendo precio interno:", error);
			}
			return renderLearningView({
				audit: params.audit,
				internalPrice,
				onBack: ctx.back
			});
		},
		async history(params, ctx) {
			return renderHistoryGeneralView({
				history: ctx.history,
				pricelist: ctx.pricelist,
				onNavigate: ctx.navigate,
				onBack: ctx.back
			});
		},
		async historyProduct(params, ctx) {
			return renderHistoryProductView({
				item: params.item,
				history: ctx.history,
				onNavigate: ctx.navigate,
				onBack: ctx.back
			});
		},
		async historyPeriod(params, ctx) {
			return renderHistoryPeriodView({
				item: params.item,
				period: params.period,
				history: ctx.history,
				auditHistory: ctx.auditHistory,
				onBack: ctx.back
			});
		},
		async settings(params, ctx) {
			return renderSettingsView({
				storage: ctx.storage,
				tornAPI: ctx.tornAPI,
				w3bAPI: ctx.w3bAPI,
				pricelist: ctx.pricelist,
				scheduler: ctx.scheduler,
				onBack: ctx.back,
				onCredentialsSaved: ctx.handleCredentialsSaved
			});
		}
	};
	function createApp(deps) {
		injectStyles();
		const stack = [];
		let currentView = null;
		let isOpen = false;
		let isQuickBarOpen = false;
		let quickBarView = null;
		let navigationToken = 0;
		const ctx = {
			...deps,
			navigate,
			back,
			handleAuditUpdated,
			handleCredentialsSaved
		};
		const fab = el("div", {
			className: "tw3b-fab",
			text: "TW",
			attrs: {
				role: "button",
				"aria-label": "Abrir TornW3B"
			}
		});
		const panelContent = el("div", { style: {
			width: "100%",
			height: "100%",
			overflow: "hidden",
			display: "flex",
			flexDirection: "column"
		} });
		const panel = el("div", { className: "tw3b-panel" }, [panelContent]);
		const overlay = el("div", {
			className: "tw3b-overlay",
			style: { display: "none" },
			on: { click: (event) => {
				if (event.target === overlay) closePanel();
			} }
		}, [panel]);
		const quickBarContent = el("div", { style: { width: "100%" } });
		const quickBar = el("div", {
			className: "tw3b-quickbar",
			style: { display: "none" }
		}, [quickBarContent]);
		fab.addEventListener("click", (event) => {
			if (fab.dataset.dragged === "true") {
				fab.dataset.dragged = "false";
				return;
			}
			togglePanel();
		});
		setupFabDrag(fab);
		document.body.appendChild(fab);
		document.body.appendChild(overlay);
		document.body.appendChild(quickBar);
		window.addEventListener("resize", () => {
			if (isQuickBarOpen) positionQuickBar();
			if (isOpen) positionPanel();
		});
		function openPanel() {
			isOpen = true;
			overlay.style.display = "block";
			renderCurrentScreen();
			positionPanel();
		}
		function closePanel() {
			isOpen = false;
			overlay.style.display = "none";
		}
		function positionPanel() {
			const fabRect = fab.getBoundingClientRect();
			const margin = 12;
			const panelWidth = Math.min(440, window.innerWidth - 24);
			panel.style.width = `${panelWidth}px`;
			let left = fabRect.right - panelWidth;
			left = clamp(left, margin, window.innerWidth - panelWidth - margin);
			const panelHeight = panel.offsetHeight || 300;
			let top = fabRect.top - panelHeight - 12;
			if (top < margin) top = fabRect.bottom + 12;
			top = clamp(top, margin, window.innerHeight - panelHeight - margin);
			panel.style.left = `${left}px`;
			panel.style.top = `${top}px`;
		}
		function positionQuickBar() {
			const fabRect = fab.getBoundingClientRect();
			const margin = 12;
			const barWidth = Math.min(320, window.innerWidth - 24);
			quickBar.style.width = `${barWidth}px`;
			let left = fabRect.right - barWidth;
			left = clamp(left, margin, window.innerWidth - barWidth - margin);
			const barHeight = quickBar.offsetHeight || 52;
			let top = fabRect.top - barHeight - 12;
			if (top < margin) top = fabRect.bottom + 12;
			top = clamp(top, margin, window.innerHeight - barHeight - margin);
			quickBar.style.left = `${left}px`;
			quickBar.style.top = `${top}px`;
		}
		function handleOutsideQuickBarClick(event) {
			if (quickBar.contains(event.target) || fab.contains(event.target)) return;
			closeQuickBar();
		}
		function openQuickBar() {
			isQuickBarOpen = true;
			quickBarView = renderMainView({
				pricelist: deps.pricelist,
				onNavigate: navigate
			});
			quickBarContent.innerHTML = "";
			quickBarContent.appendChild(quickBarView.node);
			quickBar.style.display = "flex";
			positionQuickBar();
			document.addEventListener("pointerdown", handleOutsideQuickBarClick, true);
		}
		function closeQuickBar() {
			if (!isQuickBarOpen) return;
			isQuickBarOpen = false;
			quickBar.style.display = "none";
			document.removeEventListener("pointerdown", handleOutsideQuickBarClick, true);
			if (quickBarView && typeof quickBarView.destroy === "function") try {
				quickBarView.destroy();
			} catch {}
			quickBarView = null;
			quickBarContent.innerHTML = "";
		}
		function togglePanel() {
			if (isOpen) {
				closePanel();
				return;
			}
			if (isQuickBarOpen) closeQuickBar();
			else openQuickBar();
		}
		function navigate(screen, params = {}, options = {}) {
			if (screen === "main") {
				stack.length = 0;
				closeQuickBar();
				closePanel();
				return;
			}
			if (!routes[screen]) {
				console.error(`[App] Pantalla desconocida: "${screen}"`);
				return;
			}
			if (options.replace) stack.pop();
			stack.push({
				screen,
				params
			});
			closeQuickBar();
			if (!isOpen) openPanel();
			else renderCurrentScreen();
		}
		function back() {
			if (stack.length <= 1) {
				closePanel();
				return;
			}
			stack.pop();
			renderCurrentScreen();
		}
		async function renderCurrentScreen() {
			const token = ++navigationToken;
			const top = stack[stack.length - 1];
			const routeFn = routes[top.screen];
			showLoading();
			let result = null;
			try {
				result = await routeFn(top.params || {}, ctx);
			} catch (error) {
				console.error(`[App] Error renderizando "${top.screen}":`, error);
				if (token !== navigationToken) return;
				showError(error?.message || "Ocurrió un error inesperado.");
				return;
			}
			if (token !== navigationToken) {
				try {
					result?.destroy?.();
				} catch {}
				return;
			}
			mountView(result);
		}
		function mountView(result) {
			if (currentView && typeof currentView.destroy === "function") try {
				currentView.destroy();
			} catch (error) {
				console.warn("[App] Error destruyendo vista anterior:", error);
			}
			currentView = result;
			panelContent.innerHTML = "";
			if (result?.node) panelContent.appendChild(result.node);
			if (isOpen) positionPanel();
		}
		function showLoading() {
			panelContent.innerHTML = "";
			panelContent.appendChild(el("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					color: "#9aa0ac",
					fontSize: "13px"
				},
				text: "Cargando..."
			}));
			if (isOpen) positionPanel();
		}
		function showError(message) {
			panelContent.innerHTML = "";
			panelContent.appendChild(el("div", { style: {
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				height: "100%",
				gap: "12px",
				padding: "24px",
				textAlign: "center"
			} }, [el("div", {
				style: {
					color: "#e64953",
					fontSize: "13px"
				},
				text: message
			}), el("button", {
				className: "tw3b-btn tw3b-btn-secondary",
				style: {
					width: "auto",
					padding: "8px 20px"
				},
				text: "Volver al inicio",
				on: { click: () => {
					stack.length = 0;
					stack.push({
						screen: "main",
						params: {}
					});
					renderCurrentScreen();
				} }
			})]));
			if (isOpen) positionPanel();
		}
		function handleAuditUpdated(itemId) {
			const numericId = Number(itemId);
			if (deps.scheduler && deps.scheduler.lastAuditByItem && typeof deps.scheduler.lastAuditByItem.delete === "function") deps.scheduler.lastAuditByItem.delete(numericId);
		}
		function handleCredentialsSaved() {
			if (deps.scheduler && typeof deps.scheduler.start === "function" && !deps.scheduler.started) deps.scheduler.start();
		}
		function setupFabDrag(node) {
			restoreFabPosition(node);
			let dragging = false;
			let startX = 0;
			let startY = 0;
			let originLeft = 0;
			let originTop = 0;
			node.addEventListener("pointerdown", (event) => {
				dragging = true;
				node.dataset.dragged = "false";
				startX = event.clientX;
				startY = event.clientY;
				const rect = node.getBoundingClientRect();
				originLeft = rect.left;
				originTop = rect.top;
				node.setPointerCapture?.(event.pointerId);
			});
			node.addEventListener("pointermove", (event) => {
				if (!dragging) return;
				const deltaX = event.clientX - startX;
				const deltaY = event.clientY - startY;
				if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) node.dataset.dragged = "true";
				const nextLeft = clamp(originLeft + deltaX, 0, window.innerWidth - node.offsetWidth);
				const nextTop = clamp(originTop + deltaY, 0, window.innerHeight - node.offsetHeight);
				node.style.left = `${nextLeft}px`;
				node.style.top = `${nextTop}px`;
				node.style.right = "auto";
				node.style.bottom = "auto";
				if (isQuickBarOpen) positionQuickBar();
				if (isOpen) positionPanel();
			});
			const endDrag = () => {
				if (!dragging) return;
				dragging = false;
				saveFabPosition(node);
				if (isQuickBarOpen) positionQuickBar();
				if (isOpen) positionPanel();
			};
			node.addEventListener("pointerup", endDrag);
			node.addEventListener("pointercancel", endDrag);
		}
		function restoreFabPosition(node) {
			let saved = null;
			try {
				const raw = localStorage.getItem(FAB_POSITION_KEY);
				saved = raw ? JSON.parse(raw) : null;
			} catch {
				saved = null;
			}
			if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
				node.style.left = `${saved.left}px`;
				node.style.top = `${saved.top}px`;
				node.style.right = "auto";
				node.style.bottom = "auto";
			} else {
				node.style.right = "16px";
				node.style.bottom = "80px";
			}
		}
		function saveFabPosition(node) {
			try {
				const rect = node.getBoundingClientRect();
				localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({
					left: rect.left,
					top: rect.top
				}));
			} catch (error) {
				console.warn("[App] No se pudo guardar la posición del FAB:", error);
			}
		}
		function clamp(value, min, max) {
			return Math.min(Math.max(value, min), max);
		}
		return {
			openPanel,
			closePanel,
			togglePanel,
			destroy() {
				if (currentView && typeof currentView.destroy === "function") try {
					currentView.destroy();
				} catch {}
				closeQuickBar();
				fab.remove();
				overlay.remove();
				quickBar.remove();
			}
		};
	}
	//#endregion
	//#region src/main.js
	if (window.__TW3B_BOOTED__) console.warn("[TornW3B] main.js ya fue ejecutado en esta página. Se ignora esta segunda ejecución.");
	else {
		window.__TW3B_BOOTED__ = true;
		boot().catch((error) => {
			console.error("[TornW3B] Error fatal iniciando la aplicación:", error);
		});
	}
	async function boot() {
		await waitForBody();
		const storage = new Storage();
		const savedConfig = await storage.getConfig();
		const tornApiKey = savedConfig?.tornApiKey || null;
		const w3bApiKey = savedConfig?.w3bApiKey || null;
		const w3bUserId = savedConfig?.w3bUserId || null;
		const tornAPI = new TornAPI(tornApiKey);
		const w3bAPI = new W3BAPI(w3bApiKey);
		const pricelist = new Pricelist({
			w3bAPI,
			storage
		});
		const internalPriceList = new InternalPriceList(storage);
		const priceProposal = new PriceProposal();
		const priceUpdateService = new PriceUpdateService({ internalPriceList });
		const history = new History({
			tornAPI,
			storage
		});
		const auditHistory = new AuditHistory(storage);
		const scheduler = new Scheduler({
			auditor: new Auditor({
				tornAPI,
				w3bAPI,
				marketAnalyzer: new MarketAnalyzer(CONFIG.SAMPLE_PERCENTAGE),
				bazaarAnalyzer: new BazaarAnalyzer(),
				marketValueAnalyzer: new MarketValueAnalyzer(),
				ratioLearner: new RatioLearner(),
				storage,
				priceProposal,
				internalPriceList,
				w3bUserId
			}),
			pricelist,
			storage,
			history,
			auditHistory
		});
		await Promise.all([scheduler.init(), history.init()]);
		if (Boolean(tornApiKey) && Boolean(w3bUserId)) scheduler.start();
		else console.log("[TornW3B] Sin credenciales guardadas todavía. El ciclo pasivo se iniciará al guardar la configuración por primera vez.");
		const app = createApp({
			pricelist,
			storage,
			scheduler,
			history,
			auditHistory,
			tornAPI,
			w3bAPI,
			priceUpdateService
		});
		window.__TW3B__ = {
			app,
			storage,
			scheduler,
			history,
			pricelist
		};
		console.log("[TornW3B] Aplicación iniciada correctamente.");
	}
	function waitForBody() {
		return new Promise((resolve) => {
			if (document.body) {
				resolve();
				return;
			}
			document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
		});
	}
	//#endregion
})();








