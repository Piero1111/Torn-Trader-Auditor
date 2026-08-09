import { CONFIG } from "../config.js";

const PREFIX = "tornw3b_";

function hasGM() {
    return (
        typeof GM_setValue === "function" &&
        typeof GM_getValue === "function"
    );
}

export class Storage {

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

            if (this.engine === "gm") {
                raw = await Promise.resolve(
                    GM_getValue(key, null)
                );
            } else {
                raw = localStorage.getItem(key);
            }

            return raw
                ? JSON.parse(raw)
                : fallback;

        } catch {
            return fallback;
        }
    }


    async write(key, value) {

        const serialized = JSON.stringify(value);

        if (this.engine === "gm") {
            await Promise.resolve(
                GM_setValue(key, serialized)
            );
        } else {
            localStorage.setItem(key, serialized);
        }
    }


    /*
     * =========================
     * Configuración
     * =========================
     */

    async saveConfig(config) {

        const current =
            await this.getConfig();

        const merged = {
            ...current,
            ...config
        };

        await this.write(
            this.configKey,
            merged
        );

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


    /*
     * =========================
     * Pricelist cache
     * =========================
     */

    async savePricelist(items) {

        const normalized = {
            items,
            lastSync: Date.now()
        };

        await this.write(
            this.pricelistKey,
            normalized
        );

        return normalized;
    }


    async getPricelist() {

        return this.read(this.pricelistKey, {
            items: [],
            lastSync: null
        });
    }


    /*
     * =========================
     * Auditoría
     * =========================
     */

    async saveAudit(audit) {

        const audits =
            await this.read(this.auditKey, {});

        audits[audit.itemId] = audit;

        await this.write(
            this.auditKey,
            audits
        );
    }


    async getAudit(itemId) {

        const audits =
            await this.read(this.auditKey, {});

        return audits[itemId] || null;
    }


    async getAllAudits() {

        return this.read(this.auditKey, {});
    }


    /*
     * =========================
     * Historial
     * =========================
     */

    async saveHistory(audit) {

        const history =
            await this.read(this.historyKey, {});

        if (!history[audit.itemId]) {
            history[audit.itemId] = [];
        }

        history[audit.itemId].push({
            timestamp: audit.timestamp,
            realMarketValue: audit.realMarketValue,
            correctBuyPrice: audit.correctBuyPrice,
            learnedRatio: audit.learnedRatio,
            w3bBuyPrice: audit.w3bBuyPrice,
            confidence: audit.confidence,
            status: audit.status
        });

        history[audit.itemId] =
            this.pruneHistory(history[audit.itemId]);

        await this.write(
            this.historyKey,
            history
        );
    }


    async getHistory(itemId) {

        const history =
            await this.read(this.historyKey, {});

        return history[itemId] || [];
    }


    async getRecentlyUpdatedItems(limit = 10) {

        const history =
            await this.read(this.historyKey, {});

        const entries = Object.entries(history)
            .map(([itemId, snapshots]) => {

                const last =
                    snapshots[snapshots.length - 1];

                return {
                    itemId,
                    lastHistoryUpdate:
                        last?.timestamp ?? 0
                };
            })
            .sort((a, b) =>
                b.lastHistoryUpdate - a.lastHistoryUpdate
            );

        return entries.slice(0, limit);
    }


    /*
     * Elimina entradas más viejas que
     * CONFIG.HISTORY_DAYS para no acumular
     * datos indefinidamente.
     */
    pruneHistory(snapshots) {

        const cutoff =
            Date.now() -
            CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1000;

        return snapshots.filter(
            snapshot => snapshot.timestamp >= cutoff
        );
    }
}