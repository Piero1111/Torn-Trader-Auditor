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

        this.concurrency =
            Math.max(
                1,
                Number(concurrency) || 1
            );

        /*
         * itemId → timestamp
         */
        this.lastAuditByItem =
            new Map();

        /*
         * itemId → información del error
         */
        this.invalidItems =
            new Map();

        /*
         * Cola:
         *
         * [ PRIORIDAD, PRIORIDAD, PASIVA, PASIVA... ]
         */
        this.queue = [];

        /*
         * Artículos que están:
         *
         * - en cola
         * - siendo auditados
         */
        this.queuedItems =
            new Set();

        this.running = 0;

        this.initialized =
            false;

        this.intervalHandle =
            null;

        this.onAuditComplete =
            null;

        this.onAuditError =
            null;
    }


    /*
     * =========================================================
     * INVALID ITEMS
     * =========================================================
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

            if (
                !parsed ||
                typeof parsed !== "object"
            ) {
                return;
            }

            for (
                const [itemId, value]
                of Object.entries(parsed)
            ) {

                const numericId =
                    Number(itemId);

                if (
                    Number.isFinite(numericId) &&
                    numericId > 0
                ) {

                    this.invalidItems.set(
                        numericId,
                        value
                    );
                }
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

            localStorage.setItem(
                INVALID_ITEMS_STORAGE_KEY,
                JSON.stringify(
                    Object.fromEntries(
                        this.invalidItems
                    )
                )
            );

        } catch (error) {

            console.warn(
                "[Scheduler] No se pudo guardar lista de inválidos:",
                error
            );
        }
    }


    markInvalid(item, error) {

        const itemId =
            Number(item?.itemId);

        if (
            !Number.isFinite(itemId) ||
            itemId <= 0
        ) {
            return;
        }

        this.invalidItems.set(
            itemId,
            {
                name:
                    item?.name ||
                    "Artículo desconocido",

                reason:
                    error?.message ||
                    "Error desconocido",

                timestamp:
                    Date.now()
            }
        );

        this.saveInvalidItems();
    }


    isInvalid(itemId) {

        return this.invalidItems.has(
            Number(itemId)
        );
    }


    /*
     * =========================================================
     * INIT
     * =========================================================
     */

    async init() {

        const audits =
            await this.storage.getAllAudits();

        for (
            const itemId in audits
        ) {

            const audit =
                audits[itemId];

            const timestamp =
                Number(
                    audit?.timestamp
                );

            if (
                Number.isFinite(timestamp) &&
                timestamp > 0
            ) {

                this.lastAuditByItem.set(
                    Number(itemId),
                    timestamp
                );
            }
        }


        this.loadInvalidItems();

        this.initialized =
            true;


        console.log(
            `[Scheduler] Inicializado: ` +
            `${this.lastAuditByItem.size} auditorías cacheadas, ` +
            `${this.invalidItems.size} artículos inválidos.`
        );
    }


    /*
     * =========================================================
     * NEEDS AUDIT
     * =========================================================
     */

    needsAudit(itemId) {

        const numericId =
            Number(itemId);

        if (
            !Number.isFinite(numericId) ||
            numericId <= 0
        ) {
            return false;
        }

        if (
            this.isInvalid(numericId)
        ) {
            return false;
        }

        const last =
            this.lastAuditByItem.get(
                numericId
            );

        /*
         * Nunca auditado.
         */
        if (!last) {
            return true;
        }

        /*
         * Ya pasó el intervalo.
         */
        return (
            Date.now() - last >=
            CONFIG.AUDIT_INTERVAL
        );
    }


    /*
     * =========================================================
     * SEARCH → CACHE OR PRIORITY AUDIT
     * =========================================================
     */

    async getOrAudit(item) {

        if (!item) {
            return null;
        }

        const itemId =
            Number(item.itemId);

        if (
            !Number.isFinite(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "Artículo sin ID válido"
            );
        }


        /*
         * Nunca volver a consultar
         * artículos descartados.
         */
        if (
            this.isInvalid(itemId)
        ) {

            return null;
        }


        /*
         * Primero intentamos cache.
         */
        if (
            !this.needsAudit(itemId)
        ) {

            const cached =
                await this.storage.getAudit(
                    itemId
                );

            if (cached) {
                return cached;
            }
        }


        /*
         * Necesita auditoría.
         *
         * Se coloca como PRIORIDAD.
         */
        return this.auditPriority(
            item
        );
    }


    /*
     * =========================================================
     * PRIORITY AUDIT
     * =========================================================
     */

    auditPriority(item) {

        return new Promise(
            (resolve, reject) => {

                const itemId =
                    Number(item?.itemId);


                if (
                    !Number.isFinite(itemId) ||
                    itemId <= 0
                ) {

                    reject(
                        new Error(
                            "Artículo sin ID válido"
                        )
                    );

                    return;
                }


                if (
                    this.isInvalid(itemId)
                ) {

                    resolve(null);
                    return;
                }


                /*
                 * Si ya está siendo procesado,
                 * simplemente nos agregamos como
                 * otro waiter.
                 */
                const existing =
                    this.queue.find(
                        queued =>
                            Number(
                                queued.item.itemId
                            ) === itemId
                    );


                if (existing) {

                    existing.priority =
                        true;

                    existing.waiters.push({
                        resolve,
                        reject
                    });


                    /*
                     * Reordenamos para que
                     * quede antes que las pasivas.
                     */
                    this.promotePriority(
                        existing
                    );

                    this.drain();

                    return;
                }


                /*
                 * Puede estar ejecutándose.
                 *
                 * En ese caso queuedItems ya
                 * contiene el ID, pero no existe
                 * en queue.
                 *
                 * Buscamos la ejecución actual.
                 */
                if (
                    this.queuedItems.has(itemId)
                ) {

                    /*
                     * La auditoría ya está en
                     * progreso. Esperamos a que
                     * termine mediante una entrada
                     * especial de espera.
                     */

                    const runningEntry = {
                        item,
                        priority: true,
                        waiters: [
                            {
                                resolve,
                                reject
                            }
                        ],
                        running: true
                    };

                    /*
                     * No añadimos otra auditoría.
                     * Simplemente esperamos.
                     */
                    this.runningWaiters =
                        this.runningWaiters ||
                        new Map();

                    if (
                        !this.runningWaiters.has(
                            itemId
                        )
                    ) {

                        this.runningWaiters.set(
                            itemId,
                            []
                        );
                    }

                    this.runningWaiters
                        .get(itemId)
                        .push({
                            resolve,
                            reject
                        });

                    return;
                }


                /*
                 * Nueva auditoría prioritaria.
                 */
                const queued = {

                    item,

                    priority: true,

                    waiters: [
                        {
                            resolve,
                            reject
                        }
                    ]
                };


                /*
                 * SIEMPRE al frente.
                 */
                this.queue.unshift(
                    queued
                );

                this.queuedItems.add(
                    itemId
                );

                this.drain();
            }
        );
    }


    /*
     * Promueve una tarea existente
     * al frente de la cola.
     */

    promotePriority(queued) {

        const index =
            this.queue.indexOf(
                queued
            );

        if (index > 0) {

            this.queue.splice(
                index,
                1
            );

            this.queue.unshift(
                queued
            );
        }
    }


    /*
     * =========================================================
     * PASSIVE AUDIT
     * =========================================================
     */

    async enqueueDueItems() {

        try {

            const items =
                await this.pricelist.getAll();


            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {

                return 0;
            }


            const due = [];


            for (
                const item of items
            ) {

                if (!item) {
                    continue;
                }


                const itemId =
                    Number(item.itemId);

                const buyPrice =
                    Number(item.buyPrice);


                /*
                 * Datos inválidos.
                 */
                if (
                    !Number.isFinite(itemId) ||
                    itemId <= 0 ||
                    typeof item.name !== "string" ||
                    !item.name.trim() ||
                    !Number.isFinite(buyPrice) ||
                    buyPrice <= 0
                ) {
                    continue;
                }


                /*
                 * Nunca tocar inválidos.
                 */
                if (
                    this.isInvalid(itemId)
                ) {
                    continue;
                }


                /*
                 * Evitar duplicados.
                 */
                if (
                    this.queuedItems.has(itemId)
                ) {
                    continue;
                }


                if (
                    this.needsAudit(itemId)
                ) {

                    due.push(item);
                }
            }


            /*
             * Solo unos pocos por ciclo.
             */
            const PASSIVE_BATCH_SIZE =
                5;


            const batch =
                due.slice(
                    0,
                    PASSIVE_BATCH_SIZE
                );


            for (
                const item of batch
            ) {

                const itemId =
                    Number(item.itemId);


                this.queue.push({

                    item,

                    priority: false,

                    waiters: []
                });


                this.queuedItems.add(
                    itemId
                );
            }


            if (
                batch.length > 0
            ) {

                console.log(
                    `[Scheduler] Auditoría pasiva: ` +
                    `${batch.length} añadidos. ` +
                    `Pendientes: ${due.length}`
                );
            }


            this.drain();

            return batch.length;

        } catch (error) {

            console.error(
                "[Scheduler] Error preparando auditoría pasiva:",
                error
            );

            return 0;
        }
    }


    /*
     * =========================================================
     * QUEUE
     * =========================================================
     */

    drain() {

        while (
            this.running <
                this.concurrency &&
            this.queue.length > 0
        ) {

            /*
             * Como las prioridades están
             * al frente, siempre salen primero.
             */
            const queued =
                this.queue.shift();


            this.runAudit(
                queued
            );
        }
    }


    /*
     * =========================================================
     * RUN AUDIT
     * =========================================================
     */

    async runAudit(queued) {

        const item =
            queued.item;

        const itemId =
            Number(item.itemId);


        this.running++;


        try {

            /*
             * Si fue marcado inválido
             * mientras esperaba.
             */
            if (
                this.isInvalid(itemId)
            ) {

                const error =
                    new Error(
                        `Artículo descartado: ${item.name}`
                    );

                this.resolveWaiters(
                    queued,
                    null,
                    error
                );

                return;
            }


            /*
             * Puede haber sido auditado
             * mientras esperaba.
             */
            if (
                !this.needsAudit(itemId)
            ) {

                const cached =
                    await this.storage.getAudit(
                        itemId
                    );


                if (cached) {

                    this.resolveWaiters(
                        queued,
                        cached,
                        null
                    );

                    return;
                }
            }


            console.log(
                `[Scheduler] Auditando ${item.name} (${itemId})`
            );


            const result =
                await this.auditor.audit(
                    item
                );


            /*
             * Guardar historial.
             */
            if (
                result &&
                this.history
            ) {

                await this.history.recordSnapshot(
                    result
                );
            }


            /*
             * Actualizar timestamp.
             */
            if (
                result &&
                Number.isFinite(
                    Number(result.timestamp)
                )
            ) {

                this.lastAuditByItem.set(
                    itemId,
                    Number(result.timestamp)
                );
            }


            /*
             * Avisar a App.
             */
            if (
                this.onAuditComplete &&
                result
            ) {

                this.onAuditComplete(
                    result
                );
            }


            this.resolveWaiters(
                queued,
                result,
                null
            );


            /*
             * Resolver también cualquier
             * búsqueda que se hubiera unido
             * mientras estaba ejecutándose.
             */
            this.resolveRunningWaiters(
                itemId,
                result,
                null
            );


        } catch (error) {

            if (
                this.isPermanentError(
                    error
                )
            ) {

                this.markInvalid(
                    item,
                    error
                );


                console.warn(
                    `[TornW3B] ${item.name} ` +
                    `descartado permanentemente: ` +
                    `${error.message}`
                );

            } else {

                if (
                    this.onAuditError
                ) {

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


            this.resolveWaiters(
                queued,
                null,
                error
            );


            this.resolveRunningWaiters(
                itemId,
                null,
                error
            );


        } finally {

            this.queuedItems.delete(
                itemId
            );

            this.running--;

            this.drain();
        }
    }


    /*
     * =========================================================
     * WAITERS
     * =========================================================
     */

    resolveWaiters(
        queued,
        result,
        error
    ) {

        for (
            const waiter
            of queued.waiters || []
        ) {

            try {

                if (error) {

                    waiter.reject(
                        error
                    );

                } else {

                    waiter.resolve(
                        result
                    );
                }

            } catch {
                // No permitir que un waiter
                // rompa el Scheduler.
            }
        }
    }


    resolveRunningWaiters(
        itemId,
        result,
        error
    ) {

        if (
            !this.runningWaiters
        ) {
            return;
        }


        const waiters =
            this.runningWaiters.get(
                itemId
            );


        if (!waiters) {
            return;
        }


        this.runningWaiters.delete(
            itemId
        );


        for (
            const waiter of waiters
        ) {

            try {

                if (error) {

                    waiter.reject(
                        error
                    );

                } else {

                    waiter.resolve(
                        result
                    );
                }

            } catch {
                // Ignorar errores externos.
            }
        }
    }


    /*
     * =========================================================
     * PERMANENT ERRORS
     * =========================================================
     */

    isPermanentError(error) {

        const message =
            String(
                error?.message || ""
            );


        return (
            error?.code ===
                "INVALID_ID" ||

            message ===
                "Incorrect ID" ||

            message.startsWith(
                "Item Value inválido"
            ) ||

            message.startsWith(
                "No se pudo obtener Item Value"
            ) ||

            message.startsWith(
                "Artículo sin ID válido"
            )
        );
    }


    /*
     * =========================================================
     * START / STOP
     * =========================================================
     */

    start() {

        if (
            !this.initialized
        ) {

            console.warn(
                "[Scheduler] start() llamado sin init()."
            );
        }


        /*
         * Auditoría pasiva inicial.
         *
         * No bloquea la interfaz.
         */
        this.enqueueDueItems();


        /*
         * Cada hora se busca otra
         * pequeña tanda de artículos
         * que hayan vencido.
         */
        this.intervalHandle =
            setInterval(
                () => {

                    this.enqueueDueItems();

                },
                CONFIG.AUDIT_INTERVAL
            );


        console.log(
            "[Scheduler] Auditoría pasiva iniciada."
        );
    }


    stop() {

        if (
            this.intervalHandle
        ) {

            clearInterval(
                this.intervalHandle
            );

            this.intervalHandle =
                null;
        }


        console.log(
            "[Scheduler] Auditoría pasiva detenida."
        );
    }
}