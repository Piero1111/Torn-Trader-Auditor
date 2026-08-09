import { CONFIG } from "../config.js";


const INVALID_ITEMS_STORAGE_KEY =
    "tornw3b-invalid-items";


export class Scheduler {

    constructor({
        auditor,
        pricelist,
        storage,
        history,
        concurrency = 1
    }) {

        this.auditor = auditor;
        this.pricelist = pricelist;
        this.storage = storage;
        this.history = history;
        this.concurrency = concurrency;

        this.lastAuditByItem = new Map();

        this.invalidItems = new Map();

        this.queue = [];

        this.running = 0;

        this.initialized = false;

        this.onAuditComplete = null;
        this.onAuditError = null;
    }


    /*
     * Carga desde localStorage los artículos
     * que sabemos que no son auditables.
     */
    loadInvalidItems() {

        try {

            const raw =
                localStorage.getItem(
                    INVALID_ITEMS_STORAGE_KEY
                );

            if (!raw) {
                return;
            }

            const parsed =
                JSON.parse(raw);

            if (!parsed || typeof parsed !== "object") {
                return;
            }

            for (const [itemId, value] of Object.entries(parsed)) {

                this.invalidItems.set(
                    Number(itemId),
                    value
                );
            }

        } catch (error) {

            console.warn(
                "[Scheduler] No se pudo cargar lista de inválidos:",
                error
            );
        }
    }


    saveInvalidItems() {

        try {

            const data =
                Object.fromEntries(
                    this.invalidItems
                );

            localStorage.setItem(
                INVALID_ITEMS_STORAGE_KEY,
                JSON.stringify(data)
            );

        } catch (error) {

            console.warn(
                "[Scheduler] No se pudo guardar lista de inválidos:",
                error
            );
        }
    }


    markInvalid(item, error) {

        this.invalidItems.set(
            Number(item.itemId),
            {
                name: item.name,
                reason: error.message,
                timestamp: Date.now()
            }
        );

        this.saveInvalidItems();
    }


    isInvalid(itemId) {

        return this.invalidItems.has(
            Number(itemId)
        );
    }


    async init() {

        /*
         * Primero recuperamos las auditorías exitosas.
         */
        const audits =
            await this.storage.getAllAudits();

        for (const itemId in audits) {

            const audit =
                audits[itemId];

            if (
                audit &&
                Number.isFinite(
                    Number(audit.timestamp)
                )
            ) {

                this.lastAuditByItem.set(
                    Number(itemId),
                    Number(audit.timestamp)
                );
            }
        }


        /*
         * Luego recuperamos los artículos
         * permanentemente inválidos.
         */
        this.loadInvalidItems();

        this.initialized = true;


        console.log(
            `[Scheduler] ${this.invalidItems.size} artículos descartados cargados`
        );
    }


    needsAudit(itemId) {

        const numericId =
            Number(itemId);


        /*
         * Si ya sabemos que no es un artículo
         * auditable, jamás lo volvemos a meter
         * en la cola automática.
         */
        if (this.isInvalid(numericId)) {
            return false;
        }


        const last =
            this.lastAuditByItem.get(numericId);


        if (!last) {
            return true;
        }


        return (
            Date.now() - last >=
            CONFIG.AUDIT_INTERVAL
        );
    }


    async getOrAudit(item) {

        /*
         * Un artículo inválido no debe generar
         * una petición nuevamente.
         */
        if (this.isInvalid(item.itemId)) {

            return null;
        }


        if (!this.needsAudit(item.itemId)) {

            const cached =
                await this.storage.getAudit(
                    item.itemId
                );

            if (cached) {
                return cached;
            }
        }


        return this.auditPriority(item);
    }


    auditPriority(item) {

        /*
         * Evita duplicar el mismo artículo
         * en la cola.
         */
        if (this.isInvalid(item.itemId)) {

            return Promise.reject(
                new Error(
                    `Artículo descartado: ${item.name}`
                )
            );
        }


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

        const items =
            await this.pricelist.getAll();


        /*
         * Solo artículos:
         *
         * - con ID numérico
         * - con nombre
         * - con precio de compra válido
         * - que no estén descartados
         * - que necesiten auditoría
         */
        const due =
            items.filter(item => {

                if (!item) {
                    return false;
                }

                if (
                    !Number.isFinite(
                        Number(item.itemId)
                    )
                ) {
                    return false;
                }

                if (
                    typeof item.name !== "string" ||
                    !item.name.trim()
                ) {
                    return false;
                }

                if (
                    !Number.isFinite(
                        Number(item.buyPrice)
                    ) ||
                    Number(item.buyPrice) <= 0
                ) {
                    return false;
                }

                if (
                    this.isInvalid(item.itemId)
                ) {
                    return false;
                }

                return this.needsAudit(
                    item.itemId
                );
            });


        /*
         * IMPORTANTE:
         *
         * No metemos los 1060 artículos
         * de golpe en la cola.
         *
         * Procesamos progresivamente.
         */
        const INITIAL_BATCH_SIZE = 10;

        const batch =
            due.slice(
                0,
                INITIAL_BATCH_SIZE
            );


        for (const item of batch) {

            this.queue.push({
                item,
                priority: false
            });
        }


        if (batch.length > 0) {

            console.log(
                `[Scheduler] ${batch.length} artículos añadidos a la cola ` +
                `(pendientes: ${Math.max(0, due.length - batch.length)})`
            );
        }


        this.drain();

        return batch.length;
    }


    drain() {

        while (
            this.running <
            this.concurrency &&
            this.queue.length > 0
        ) {

            const next =
                this.queue.shift();

            this.runAudit(next);
        }
    }


    async runAudit(queued) {

        const {
            item,
            resolve,
            reject
        } = queued;


        this.running++;


        try {

            /*
             * Protección adicional:
             * por si fue invalidado mientras
             * esperaba en la cola.
             */
            if (this.isInvalid(item.itemId)) {

                if (reject) {
                    reject(
                        new Error(
                            `Artículo descartado: ${item.name}`
                        )
                    );
                }

                return;
            }


            const result =
                await this.auditor.audit(item);


            await this.history.recordSnapshot(
                result
            );


            this.lastAuditByItem.set(
                item.itemId,
                result.timestamp
            );


            if (this.onAuditComplete) {

                this.onAuditComplete(
                    result
                );
            }


            if (resolve) {
                resolve(result);
            }


        } catch (error) {

            /*
             * Errores permanentes.
             *
             * Estos NO deben volver a intentarse
             * automáticamente después de recargar.
             */
            if (
                error?.code === "INVALID_ID" ||
                error?.message === "Incorrect ID" ||
                error?.message?.startsWith(
                    "Item Value inválido"
                ) ||
                error?.message?.startsWith(
                    "No se pudo obtener Item Value"
                )
            ) {

                this.markInvalid(
                    item,
                    error
                );

                console.warn(
                    `[TornW3B] ${item.name} descartado permanentemente: ${error.message}`
                );

            } else {

                /*
                 * Errores temporales:
                 * NO los marcamos como inválidos.
                 *
                 * Podrán reintentarse en otro ciclo.
                 */
                if (this.onAuditError) {

                    this.onAuditError(
                        item,
                        error
                    );

                } else {

                    console.error(
                        `[Scheduler] Error auditando ${item.name}:`,
                        error
                    );
                }
            }


            if (reject) {
                reject(error);
            }

        } finally {

            this.running--;

            /*
             * Continuar procesando la cola.
             */
            this.drain();
        }
    }


    start() {

        if (!this.initialized) {

            console.warn(
                "[Scheduler] start() llamado sin init() previo."
            );
        }


        /*
         * Primera tanda.
         */
        this.enqueueDueItems();


        /*
         * Cada hora solamente se añade
         * otra pequeña tanda.
         */
        this.intervalHandle =
            setInterval(
                () => this.enqueueDueItems(),
                CONFIG.AUDIT_INTERVAL
            );
    }


    stop() {

        if (this.intervalHandle) {

            clearInterval(
                this.intervalHandle
            );

            this.intervalHandle = null;
        }
    }
}