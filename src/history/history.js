export class History {

    constructor({ tornAPI, storage }) {
        this.tornAPI = tornAPI;
        this.storage = storage;

        this.lastDayByItem = new Map();
        this.initialized = false;
    }


    /*
     * Determina el "día" de Torn a partir del
     * timestamp del servidor (sección 6), no del
     * reloj local.
     */
    async getTornDay() {

        const response =
            await this.tornAPI.getTimestamp();

        const timestamp =
            response?.timestamp ??
            Math.floor(Date.now() / 1000);

        return Math.floor(timestamp / 86400);
    }


    /*
     * Reconstruye lastDayByItem a partir del
     * último snapshot persistido de cada item,
     * para no duplicar el snapshot del día
     * actual si el userscript se recarga.
     */
    async init() {

        const audits =
            await this.storage.getAllAudits();

        for (const itemId in audits) {

            const history =
                await this.storage.getHistory(
                    Number(itemId)
                );

            const last =
                history[history.length - 1];

            if (last) {

                const day = Math.floor(
                    last.timestamp / 86400000
                );

                this.lastDayByItem.set(
                    Number(itemId),
                    day
                );
            }
        }

        this.initialized = true;
    }


    /*
     * Registra un snapshot diario para el item,
     * solo si todavía no existe uno para el
     * día actual de Torn (sección 24).
     *
     * Devuelve el audit si se guardó un snapshot
     * nuevo, o null si el día ya tenía uno.
     */
    async recordSnapshot(audit) {

        const tornDay =
            await this.getTornDay();

        const lastDay =
            this.lastDayByItem.get(audit.itemId);

        if (lastDay === tornDay) {
            return null;
        }

        await this.storage.saveHistory(audit);

        this.lastDayByItem.set(
            audit.itemId,
            tornDay
        );

        return audit;
    }


    /*
     * Serie temporal cruda para graficar
     * (sección 25, "Gráfico").
     */
    async getSeries(itemId) {

        const history =
            await this.storage.getHistory(itemId);

        return history.map(snapshot => ({
            timestamp: snapshot.timestamp,
            realMarketValue: snapshot.realMarketValue,
            correctBuyPrice: snapshot.correctBuyPrice
        }));
    }


    /*
     * Resumen agregado en las cuatro ventanas
     * de la sección 25: ayer / 7d / 30d / 6m.
     */
    async getSummary(itemId) {

        const history =
            await this.storage.getHistory(itemId);

        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;

        const buckets = {
            yesterday: [],
            last7d: [],
            last30d: [],
            last6m: []
        };

        for (const snapshot of history) {

            const age = now - snapshot.timestamp;

            if (age <= day) {
                buckets.yesterday.push(snapshot);
            }

            if (age <= 7 * day) {
                buckets.last7d.push(snapshot);
            }

            if (age <= 30 * day) {
                buckets.last30d.push(snapshot);
            }

            if (age <= 180 * day) {
                buckets.last6m.push(snapshot);
            }
        }

        return {
            yesterday: this.aggregate(buckets.yesterday),
            last7d: this.aggregate(buckets.last7d),
            last30d: this.aggregate(buckets.last30d),
            last6m: this.aggregate(buckets.last6m)
        };
    }


    aggregate(snapshots) {

        if (snapshots.length === 0) {
            return null;
        }

        const count = snapshots.length;

        const sum = (key) =>
            snapshots.reduce(
                (total, s) => total + (s[key] ?? 0),
                0
            );

        const latest =
            snapshots[snapshots.length - 1];

        return {
            avgRealMarketValue:
                sum("realMarketValue") / count,

            avgCorrectBuyPrice:
                sum("correctBuyPrice") / count,

            avgLearnedRatio:
                sum("learnedRatio") / count,

            latestW3bBuyPrice:
                latest.w3bBuyPrice,

            latestConfidence:
                latest.confidence,

            latestStatus:
                latest.status,

            samples: count
        };
    }


    /*
     * Sección 26: últimos 10 artículos con
     * historial modificado más recientemente.
     */
    async getRecentlyUpdated(limit = 10) {

        return this.storage.getRecentlyUpdatedItems(
            limit
        );
    }
}