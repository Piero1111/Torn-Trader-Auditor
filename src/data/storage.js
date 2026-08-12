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
        this.auditHistoryKey =
            `${PREFIX}audit_history`;

        this.internalPriceKey =
            `${PREFIX}internal_prices`;

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

        const itemId =
            Number(audit?.itemId);


        /*
         * Un itemId válido debe ser:
         *
         * - entero
         * - mayor que 0
         */

        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
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


        audits[itemId] =
            audit;


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
            !Number.isInteger(numericId) ||
            numericId <= 0
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

        const itemId =
            Number(audit?.itemId);


        /*
         * Un itemId válido debe ser:
         *
         * - entero
         * - mayor que 0
         */

        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
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
            !Number.isInteger(numericId) ||
            numericId <= 0
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
    /*
     * =========================================================
     * HISTORIAL CRUDO POR AUDITORÍA (INTRADÍA)
     * =========================================================
     *
     * A diferencia de saveHistory() (máximo 1 snapshot/día),
     * este guarda TODAS las auditorías, sin deduplicar.
     *
     * Solo se conserva una ventana corta (AUDIT_HISTORY_HOURS)
     * para no acumular datos indefinidamente: sirve
     * exclusivamente para graficar variación intradía.
     */

    async saveAuditHistory(audit) {

        const itemId =
            Number(audit?.itemId);


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "No se puede guardar historial de auditoría sin itemId válido."
            );
        }


        const store =
            await this.read(
                this.auditHistoryKey,
                {}
            );


        if (
            !Array.isArray(
                store[itemId]
            )
        ) {

            store[itemId] = [];
        }


        store[itemId].push({

            timestamp:
                Number(audit.timestamp) ||
                Date.now(),

            realMarketValue:
                Number(audit.realMarketValue) ||
                null,

            correctBuyPrice:
                Number(audit.correctBuyPrice) ||
                null,

            w3bBuyPrice:
                Number(audit.w3bBuyPrice) ||
                null,

            learnedRatio:
                Number(audit.learnedRatio) ||
                null,

            observedRatio:
                Number(audit.observedRatio) ||
                null,

            confidence:
                Number(audit.confidence) ||
                0,

            status:
                audit.status || null
        });


        store[itemId] =
            this.pruneAuditHistory(
                store[itemId]
            );


        await this.write(
            this.auditHistoryKey,
            store
        );
    }


    async getAuditHistory(itemId) {

        const numericId =
            Number(itemId);


        if (
            !Number.isInteger(numericId) ||
            numericId <= 0
        ) {

            return [];
        }


        const store =
            await this.read(
                this.auditHistoryKey,
                {}
            );


        return Array.isArray(
            store[numericId]
        )
            ? store[numericId]
            : [];
    }


    /*
     * =========================================================
     * PRECIO INTERNO (InternalPriceList)
     * =========================================================
     *
     * Persistencia del "learning" del sistema: el valor de
     * referencia interno que InternalPriceList.get()/save()/
     * initialize()/update() leen y escriben.
     */

    async saveInternalPrice(priceData) {

        const itemId =
            Number(priceData?.itemId);


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "No se puede guardar el precio interno sin itemId válido."
            );
        }


        const prices =
            await this.read(
                this.internalPriceKey,
                {}
            );


        prices[itemId] =
            priceData;


        await this.write(
            this.internalPriceKey,
            prices
        );


        return priceData;
    }


    async getInternalPrice(itemId) {

        const numericId =
            Number(itemId);


        if (
            !Number.isInteger(numericId) ||
            numericId <= 0
        ) {

            return null;
        }


        const prices =
            await this.read(
                this.internalPriceKey,
                {}
            );


        return (
            prices[numericId] ||
            null
        );
    }


    pruneAuditHistory(entries) {

        if (
            !Array.isArray(entries)
        ) {

            return [];
        }


        const cutoff =
            Date.now() -
            CONFIG.AUDIT_HISTORY_HOURS *
            60 *
            60 *
            1000;


        return entries.filter(
            entry =>
                Number(
                    entry?.timestamp
                ) >= cutoff
        );
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
    /*
     * =========================================================
     * RESET TOTAL DEL SISTEMA
     * =========================================================
     *
     * Borra TODO lo persistido por TornW3B: configuración
     * (credenciales), pricelist cacheada, auditorías, historial
     * agregado, historial crudo intradía y precios internos
     * aprendidos.
     *
     * Motivo: auditorías o precios internos generados por
     * versiones anteriores con bugs (ej. Market Value mal
     * calculado) pueden quedar "ancladas" — en particular
     * InternalPriceList solo fija su valor inicial UNA VEZ por
     * artículo (ver internalPriceList.js → initialize()), y
     * el ratio aprendido (EWMA) se arrastra desde la auditoría
     * anterior (ver ratioLearner.js → update()). Sin un reset,
     * esos datos corruptos pueden seguir influyendo en cálculos
     * futuros aunque el bug ya esté corregido.
     *
     * También limpia la lista de "artículos inválidos" del
     * Scheduler, que vive en su propia clave de localStorage
     * fuera de esta clase (ver scheduler.js →
     * INVALID_ITEMS_STORAGE_KEY).
     */

    async resetAll() {

        const keys = [

            this.configKey,

            this.pricelistKey,

            this.auditKey,

            this.historyKey,

            this.auditHistoryKey,

            this.internalPriceKey
        ];


        for (const key of keys) {

            try {

                if (this.engine === "gm") {

                    if (
                        typeof GM_deleteValue === "function"
                    ) {

                        await Promise.resolve(
                            GM_deleteValue(key)
                        );

                    } else {

                        /*
                         * Fallback si el gestor de userscripts
                         * no expone GM_deleteValue: sobrescribir
                         * con un valor vacío es suficiente para
                         * que read() devuelva el fallback.
                         */

                        await Promise.resolve(
                            GM_setValue(key, "")
                        );
                    }

                } else {

                    localStorage.removeItem(key);
                }

            } catch (error) {

                console.warn(
                    `[Storage] Error borrando ${key}:`,
                    error
                );
            }
        }


        /*
         * Lista de artículos inválidos del Scheduler
         * (clave independiente, siempre en localStorage).
         */

        try {

            localStorage.removeItem(
                "tornw3b-invalid-items"
            );

        } catch (error) {

            console.warn(
                "[Storage] Error borrando lista de artículos inválidos:",
                error
            );
        }


        return true;
    }
}