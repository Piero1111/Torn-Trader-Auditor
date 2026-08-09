export class History {

    constructor({ tornAPI, storage }) {

        this.tornAPI = tornAPI;
        this.storage = storage;

        this.lastDayByItem = new Map();

        this.initialized = false;
    }


    /*
     * =========================================================
     * DÍA DE TORN
     * =========================================================
     *
     * Utilizamos el timestamp del servidor de Torn.
     *
     * Esto evita depender del reloj local del usuario.
     */

    async getTornDay() {

        const response =
            await this.tornAPI.getTimestamp();

        const timestamp =
            Number(response?.timestamp);

        const validTimestamp =
            Number.isFinite(timestamp)
                ? timestamp
                : Math.floor(Date.now() / 1000);

        return Math.floor(
            validTimestamp / 86400
        );
    }


    /*
     * =========================================================
     * INIT
     * =========================================================
     *
     * Reconstruye el último día registrado para cada artículo.
     *
     * No dependemos de getAllAudits(), porque un artículo puede
     * conservar historial aunque su auditoría actual no exista.
     */

    async init() {

        const history =
            await this.storage.getAllHistory();

        this.lastDayByItem.clear();

        for (const [itemId, snapshots] of Object.entries(history)) {

            if (
                !Array.isArray(snapshots) ||
                snapshots.length === 0
            ) {
                continue;
            }

            const last =
                snapshots[snapshots.length - 1];

            if (
                !last ||
                !Number.isFinite(
                    Number(last.timestamp)
                )
            ) {
                continue;
            }

            const day =
                Math.floor(
                    Number(last.timestamp) / 86400000
                );

            this.lastDayByItem.set(
                Number(itemId),
                day
            );
        }

        this.initialized = true;
    }


    /*
     * =========================================================
     * RECORD SNAPSHOT
     * =========================================================
     *
     * Guarda como máximo un snapshot por artículo y por día.
     */

    async recordSnapshot(audit) {

        if (
            !audit ||
            !Number.isFinite(
                Number(audit.itemId)
            )
        ) {
            return null;
        }

        /*
         * Si History todavía no fue inicializado,
         * inicializamos antes de registrar.
         */

        if (!this.initialized) {
            await this.init();
        }

        const itemId =
            Number(audit.itemId);

        const tornDay =
            await this.getTornDay();

        const lastDay =
            this.lastDayByItem.get(itemId);

        /*
         * Ya existe un snapshot correspondiente
         * al día actual.
         */

        if (lastDay === tornDay) {
            return null;
        }

        /*
         * Nos aseguramos de que el timestamp exista.
         */

        const snapshot = {
            ...audit,

            timestamp:
                Number.isFinite(
                    Number(audit.timestamp)
                )
                    ? Number(audit.timestamp)
                    : Date.now()
        };

        await this.storage.saveHistory(
            snapshot
        );

        this.lastDayByItem.set(
            itemId,
            tornDay
        );

        return snapshot;
    }


    /*
     * =========================================================
     * SERIES
     * =========================================================
     *
     * Devuelve solamente los valores necesarios para
     * representar la evolución histórica.
     */

    async getSeries(itemId) {

        const history =
            await this.storage.getHistory(
                Number(itemId)
            );

        return history
            .filter(
                snapshot =>
                    snapshot &&
                    Number.isFinite(
                        Number(snapshot.timestamp)
                    )
            )
            .map(snapshot => ({

                timestamp:
                    Number(snapshot.timestamp),

                realMarketValue:
                    Number(snapshot.realMarketValue),

                correctBuyPrice:
                    Number(snapshot.correctBuyPrice)

            }));
    }


    /*
     * =========================================================
     * SUMMARY
     * =========================================================
     *
     * Ventanas:
     *
     * - ayer
     * - últimos 7 días
     * - últimos 30 días
     * - últimos 6 meses
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


        for (const snapshot of history) {

            if (
                !snapshot ||
                !Number.isFinite(
                    Number(snapshot.timestamp)
                )
            ) {
                continue;
            }

            const timestamp =
                Number(snapshot.timestamp);

            const age =
                now - timestamp;


            /*
             * Ayer:
             *
             * mayor a 24 horas
             * y menor o igual a 48 horas.
             *
             * Los registros de hoy ya NO entran aquí.
             */

            if (
                age > day &&
                age <= 2 * day
            ) {

                buckets.yesterday.push(
                    snapshot
                );
            }


            /*
             * Últimos 7 días.
             */

            if (
                age >= 0 &&
                age <= 7 * day
            ) {

                buckets.last7d.push(
                    snapshot
                );
            }


            /*
             * Últimos 30 días.
             */

            if (
                age >= 0 &&
                age <= 30 * day
            ) {

                buckets.last30d.push(
                    snapshot
                );
            }


            /*
             * Últimos 6 meses.
             */

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
            !Array.isArray(snapshots) ||
            snapshots.length === 0
        ) {
            return null;
        }


        const count =
            snapshots.length;


        const sum =
            (key) =>
                snapshots.reduce(
                    (total, snapshot) => {

                        const value =
                            Number(
                                snapshot?.[key]
                            );

                        return total +
                            (
                                Number.isFinite(value)
                                    ? value
                                    : 0
                            );
                    },
                    0
                );


        const latest =
            snapshots
                .filter(
                    snapshot =>
                        Number.isFinite(
                            Number(snapshot?.timestamp)
                        )
                )
                .sort(
                    (a, b) =>
                        Number(a.timestamp) -
                        Number(b.timestamp)
                )
                .at(-1);


        return {

            avgRealMarketValue:
                sum("realMarketValue") /
                count,

            avgCorrectBuyPrice:
                sum("correctBuyPrice") /
                count,

            avgLearnedRatio:
                sum("learnedRatio") /
                count,

            latestW3bBuyPrice:
                latest?.w3bBuyPrice ?? null,

            latestConfidence:
                latest?.confidence ?? null,

            latestStatus:
                latest?.status ?? null,

            samples:
                count
        };
    }


    /*
     * =========================================================
     * ARTÍCULOS ACTUALIZADOS RECIENTEMENTE
     * =========================================================
     */

    async getRecentlyUpdated(limit = 10) {

        return this.storage.getRecentlyUpdatedItems(
            limit
        );
    }
}