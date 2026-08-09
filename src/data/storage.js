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

        this.configKey =
            `${PREFIX}config`;

        this.pricelistKey =
            `${PREFIX}pricelist`;

        this.auditKey =
            `${PREFIX}audits`;

        this.historyKey =
            `${PREFIX}history`;

        this.engine =
            hasGM()
                ? "gm"
                : "localStorage";
    }


    /*
     * =========================================================
     * GENERIC READ / WRITE
     * =========================================================
     */

    async read(key, fallback) {

        try {

            let raw;


            if (
                this.engine === "gm"
            ) {

                raw =
                    await Promise.resolve(
                        GM_getValue(
                            key,
                            null
                        )
                    );

            } else {

                raw =
                    localStorage.getItem(
                        key
                    );
            }


            if (
                raw === null ||
                raw === undefined ||
                raw === ""
            ) {

                return fallback;
            }


            /*
             * GM_getValue puede devolver
             * directamente un objeto dependiendo
             * del entorno.
             */

            if (
                typeof raw === "object"
            ) {

                return raw;
            }


            return JSON.parse(raw);


        } catch (error) {

            console.warn(
                `[Storage] Error leyendo ${key}:`,
                error
            );

            return fallback;
        }
    }


    async write(key, value) {

        try {

            const serialized =
                JSON.stringify(value);


            if (
                this.engine === "gm"
            ) {

                await Promise.resolve(
                    GM_setValue(
                        key,
                        serialized
                    )
                );

            } else {

                localStorage.setItem(
                    key,
                    serialized
                );
            }


            return true;


        } catch (error) {

            console.error(
                `[Storage] Error guardando ${key}:`,
                error
            );

            throw error;
        }
    }


    /*
     * =========================================================
     * CONFIGURACIÓN
     * =========================================================
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

        return this.read(
            this.configKey,
            {
                tornApiKey: null,
                w3bApiKey: null,
                w3bUserId: null,
                settings: {}
            }
        );
    }


    /*
     * =========================================================
     * PRICELIST
     * =========================================================
     */

    async savePricelist(items) {

        const normalized = {

            items:
                Array.isArray(items)
                    ? items
                    : [],

            lastSync:
                Date.now()
        };


        await this.write(
            this.pricelistKey,
            normalized
        );


        return normalized;
    }


    async getPricelist() {

        return this.read(
            this.pricelistKey,
            {
                items: [],
                lastSync: null
            }
        );
    }


    /*
     * =========================================================
     * AUDITORÍAS
     * =========================================================
     */

    async saveAudit(audit) {

        if (
            !audit ||
            !Number.isFinite(
                Number(audit.itemId)
            )
        ) {

            throw new Error(
                "No se puede guardar una auditoría sin itemId válido."
            );
        }


        const audits =
            await this.read(
                this.auditKey,
                {}
            );


        audits[
            Number(audit.itemId)
        ] = audit;


        await this.write(
            this.auditKey,
            audits
        );


        return audit;
    }


    async getAudit(itemId) {

        const numericId =
            Number(itemId);


        if (
            !Number.isFinite(numericId)
        ) {

            return null;
        }


        const audits =
            await this.read(
                this.auditKey,
                {}
            );


        return (
            audits[numericId] ||
            null
        );
    }


    async getAllAudits() {

        return this.read(
            this.auditKey,
            {}
        );
    }


    /*
     * =========================================================
     * HISTORIAL
     * =========================================================
     *
     * Estos métodos permanecen disponibles para
     * History, aunque la clase History sea la que
     * gestione la lógica de historial.
     */

    async saveHistory(audit) {

        if (
            !audit ||
            !Number.isFinite(
                Number(audit.itemId)
            )
        ) {

            throw new Error(
                "No se puede guardar historial sin itemId válido."
            );
        }


        const history =
            await this.read(
                this.historyKey,
                {}
            );


        const itemId =
            Number(audit.itemId);


        if (
            !Array.isArray(
                history[itemId]
            )
        ) {

            history[itemId] = [];
        }


        history[itemId].push({

            timestamp:
                Number(audit.timestamp) ||
                Date.now(),

            realMarketValue:
                Number(audit.realMarketValue) ||
                null,

            correctBuyPrice:
                Number(audit.correctBuyPrice) ||
                null,

            learnedRatio:
                Number(audit.learnedRatio) ||
                null,

            observedRatio:
                Number(audit.observedRatio) ||
                null,

            w3bBuyPrice:
                Number(audit.w3bBuyPrice) ||
                null,

            itemValue:
                Number(audit.itemValue) ||
                null,

            confidence:
                Number(audit.confidence) ||
                0,

            status:
                audit.status || null
        });


        history[itemId] =
            this.pruneHistory(
                history[itemId]
            );


        await this.write(
            this.historyKey,
            history
        );
    }


    async getHistory(itemId) {

        const numericId =
            Number(itemId);


        if (
            !Number.isFinite(numericId)
        ) {

            return [];
        }


        const history =
            await this.read(
                this.historyKey,
                {}
            );


        return Array.isArray(
            history[numericId]
        )
            ? history[numericId]
            : [];
    }


    async getRecentlyUpdatedItems(
        limit = 10
    ) {

        const history =
            await this.read(
                this.historyKey,
                {}
            );


        const entries =
            Object.entries(history)

                .map(
                    ([itemId, snapshots]) => {

                        const last =
                            Array.isArray(
                                snapshots
                            ) &&
                            snapshots.length > 0
                                ? snapshots[
                                    snapshots.length - 1
                                ]
                                : null;


                        return {

                            itemId,

                            lastHistoryUpdate:
                                Number(
                                    last?.timestamp
                                ) || 0
                        };
                    }
                )

                .sort(
                    (a, b) =>
                        b.lastHistoryUpdate -
                        a.lastHistoryUpdate
                );


        return entries.slice(
            0,
            Math.max(
                0,
                Number(limit) || 10
            )
        );
    }


    /*
     * =========================================================
     * HISTORY CLEANUP
     * =========================================================
     */

    pruneHistory(snapshots) {

        if (
            !Array.isArray(snapshots)
        ) {

            return [];
        }


        const cutoff =
            Date.now() -
            CONFIG.HISTORY_DAYS *
            24 *
            60 *
            60 *
            1000;


        return snapshots.filter(
            snapshot =>
                Number(
                    snapshot?.timestamp
                ) >= cutoff
        );
    }
}