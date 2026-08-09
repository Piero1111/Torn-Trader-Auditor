
export class History {

    constructor({ tornAPI, storage }) {
        this.tornAPI = tornAPI;
        this.storage = storage;

        this.lastDayByItem = new Map();
        this.initialized = false;
    }


    /*
     * =========================================================
     * TORN DAY
     * =========================================================
     *
     * Obtiene el día actual utilizando el timestamp
     * del servidor de Torn.
     */

    async getTornDay() {

        const response =
            await this.tornAPI.getTimestamp();

        const timestamp =
            Number(
                response?.timestamp
            );

        if (
            !Number.isFinite(timestamp) ||
            timestamp <= 0
        ) {
            return Math.floor(
                Date.now() / 86400000
            );
        }

        return Math.floor(
            timestamp / 86400
        );
    }


    /*
     * =========================================================
     * INIT
     * =========================================================
     *
     * Reconstruye lastDayByItem utilizando las
     * auditorías existentes.
     *
     * No necesitamos getAllHistory().
     */

    async init() {

        const audits =
            await this.storage.getAllAudits();


        for (
            const itemId in audits
        ) {

            const numericItemId =
                Number(itemId);


            if (
                !Number.isFinite(
                    numericItemId
                )
            ) {
                continue;
            }


            const history =
                await this.storage.getHistory(
                    numericItemId
                );


            if (
                !Array.isArray(history) ||
                history.length === 0
            ) {
                continue;
            }


            const last =
                history[
                    history.length - 1
                ];


            if (!last) {
                continue;
            }


            /*
             * Los snapshots guardan timestamp
             * Unix en milisegundos.
             */
            const timestamp =
                Number(
                    last.timestamp
                );


            if (
                !Number.isFinite(timestamp) ||
                timestamp <= 0
            ) {
                continue;
            }


            /*
             * Aquí usamos el mismo sistema de
             * días basado en Unix timestamp.
             *
             * El timestamp de los snapshots es
             * generado por Date.now().
             */
            const day =
                Math.floor(
                    timestamp / 86400000
                );


            this.lastDayByItem.set(
                numericItemId,
                day
            );
        }


        this.initialized = true;


        console.log(
            `[History] Inicializado: ` +
            `${this.lastDayByItem.size} artículos con historial.`
        );
    }


    /*
     * =========================================================
     * RECORD SNAPSHOT
     * =========================================================
     *
     * Guarda como máximo un snapshot por día.
     */

    async recordSnapshot(audit) {

        if (!audit) {
            return null;
        }


        const itemId =
            Number(
                audit.itemId
            );


        if (
            !Number.isFinite(itemId) ||
            itemId <= 0
        ) {
            return null;
        }


        const tornDay =
            await this.getTornDay();


        /*
         * IMPORTANTE:
         *
         * lastDayByItem está almacenando ahora
         * el día calculado con timestamp local.
         *
         * Para evitar depender de una diferencia
         * entre ambos relojes, calculamos también
         * el día del snapshot según el timestamp
         * del audit.
         */
        const auditDay =
            Math.floor(
                Number(audit.timestamp) /
                86400000
            );


        const lastDay =
            this.lastDayByItem.get(
                itemId
            );


        /*
         * Si ya tenemos snapshot del día,
         * no guardamos otro.
         *
         * En condiciones normales auditDay y
         * tornDay representan el mismo día.
         */
        if (
            lastDay === auditDay ||
            lastDay === tornDay
        ) {
            return null;
        }


        await this.storage.saveHistory(
            audit
        );


        this.lastDayByItem.set(
            itemId,
            auditDay
        );


        return audit;
    }


    /*
     * =========================================================
     * SERIES
     * =========================================================
     */

    async getSeries(itemId) {

        const history =
            await this.storage.getHistory(
                Number(itemId)
            );


        return history.map(
            snapshot => ({
                timestamp:
                    snapshot.timestamp,

                realMarketValue:
                    snapshot.realMarketValue,

                correctBuyPrice:
                    snapshot.correctBuyPrice
            })
        );
    }


    /*
     * =========================================================
     * SUMMARY
     * =========================================================
     */

    async getSummary(itemId) {

        const history =
            await this.storage.getHistory(
                Number(itemId)
            );


        const now =
            Date.now();

        const day =
            24 * 60 * 60 * 1000;


        const buckets = {

            yesterday: [],

            last7d: [],

            last30d: [],

            last6m: []
        };


        for (
            const snapshot of history
        ) {

            const timestamp =
                Number(
                    snapshot.timestamp
                );


            if (
                !Number.isFinite(timestamp)
            ) {
                continue;
            }


            const age =
                now - timestamp;


            /*
             * Ventana de ayer:
             *
             * Se conserva la lógica original
             * de "últimas 24 horas".
             */
            if (
                age >= 0 &&
                age <= day
            ) {

                buckets.yesterday.push(
                    snapshot
                );
            }


            if (
                age >= 0 &&
                age <= 7 * day
            ) {

                buckets.last7d.push(
                    snapshot
                );
            }


            if (
                age >= 0 &&
                age <= 30 * day
            ) {

                buckets.last30d.push(
                    snapshot
                );
            }


            if (
                age >= 0 &&
                age <= 180 * day
            ) {

                buckets.last6m.push(
                    snapshot
                );
            }
        }


        return {

            yesterday:
                this.aggregate(
                    buckets.yesterday
                ),

            last7d:
                this.aggregate(
                    buckets.last7d
                ),

            last30d:
                this.aggregate(
                    buckets.last30d
                ),

            last6m:
                this.aggregate(
                    buckets.last6m
                )
        };
    }


    /*
     * =========================================================
     * AGGREGATE
     * =========================================================
     */

    aggregate(snapshots) {

        if (
            !snapshots ||
            snapshots.length === 0
        ) {
            return null;
        }


        const count =
            snapshots.length;


        const sum = key =>
            snapshots.reduce(
                (total, snapshot) =>
                    total +
                    (
                        Number(
                            snapshot[key]
                        ) || 0
                    ),
                0
            );


        const latest =
            snapshots[
                snapshots.length - 1
            ];


        return {

            avgRealMarketValue:
                sum(
                    "realMarketValue"
                ) / count,

            avgCorrectBuyPrice:
                sum(
                    "correctBuyPrice"
                ) / count,

            avgLearnedRatio:
                sum(
                    "learnedRatio"
                ) / count,

            latestW3bBuyPrice:
                latest.w3bBuyPrice,

            latestConfidence:
                latest.confidence,

            latestStatus:
                latest.status,

            samples:
                count
        };
    }


    /*
     * =========================================================
     * RECENTLY UPDATED
     * =========================================================
     */

    async getRecentlyUpdated(limit = 10) {

        return this.storage.getRecentlyUpdatedItems(
            limit
        );
    }
}
