import { CONFIG } from "../config.js";

const INVALID_ITEMS_STORAGE_KEY =
    "tornw3b-invalid-items";


export class Scheduler {

    constructor({
        auditor,
        pricelist,
        storage,
        history,
        auditHistory,
        concurrency = 1
    }) {

        this.auditor = auditor;
        this.pricelist = pricelist;
        this.storage = storage;
        this.history = history;
        this.auditHistory = auditHistory;

        this.concurrency =
            Math.max(
                1,
                Number(concurrency) || 1
            );


        /*
         * =====================================================
         * CACHE DE AUDITORÍAS
         * =====================================================
         */

        this.lastAuditByItem =
            new Map();


        /*
         * =====================================================
         * ARTÍCULOS INVÁLIDOS
         * =====================================================
         */

        this.invalidItems =
            new Map();


        /*
         * =====================================================
         * COLA
         * =====================================================
         */

        this.queue = [];

        this.queuedItems =
            new Set();

        this.running =
            0;


        /*
         * =====================================================
         * WAITERS
         * =====================================================
         */

        this.runningWaiters =
            new Map();


        /*
         * =====================================================
         * ESTADO
         * =====================================================
         */

        this.initialized =
            false;

        this.started =
            false;


        /*
         * =====================================================
         * CICLO PASIVO
         * =====================================================
         */

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


        /*
         * =====================================================
         * TIMER
         * =====================================================
         */

        this.intervalHandle =
            null;


        /*
         * =====================================================
         * CALLBACKS
         * =====================================================
         */

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


        if (
            this.isInvalid(itemId)
        ) {

            return null;
        }


        /*
         * Cache todavía válida.
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
                 * Ya existe en la cola.
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


                    this.promotePriority(
                        existing
                    );


                    this.drain();

                    return;
                }


                /*
                 * Ya está siendo auditado.
                 */

                if (
                    this.queuedItems.has(itemId)
                ) {

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

                    passive: false,

                    waiters: [
                        {
                            resolve,
                            reject
                        }
                    ]
                };


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
     * =========================================================
     * PROMOTE PRIORITY
     * =========================================================
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
     * START PASSIVE CYCLE
     * =========================================================
     */

    async startPassiveCycle() {

        if (
            !this.started
        ) {

            return;
        }


        /*
         * Si ya hay un ciclo activo,
         * NO lo destruimos.
         */

        if (
            this.passiveCycle.active
        ) {

            console.warn(
                "[Scheduler] El ciclo pasivo anterior todavía está activo. " +
                "No se iniciará otro ciclo encima."
            );

            return;
        }


        const cycleId =
            ++this.passiveCycle.id;


        console.log(
            "[Scheduler] Preparando nuevo ciclo de auditoría pasiva..."
        );


        try {

            const items =
                await this.pricelist.getAll();


            /*
             * Se inició otro ciclo mientras
             * esperábamos la pricelist.
             */

            if (
                cycleId !==
                this.passiveCycle.id
            ) {

                return;
            }


            if (
                !Array.isArray(items)
            ) {

                console.warn(
                    "[Scheduler] Pricelist inválida."
                );

                return;
            }


            const due = [];


            for (
                const item
                of items
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
                 * Artículos permanentemente inválidos.
                 */

                if (
                    this.isInvalid(itemId)
                ) {

                    continue;
                }


                /*
                 * Ya está en ejecución
                 * o esperando en cola.
                 */

                if (
                    this.queuedItems.has(itemId)
                ) {

                    continue;
                }


                /*
                 * Solo artículos que
                 * necesitan auditoría.
                 */

                if (
                    this.needsAudit(itemId)
                ) {

                    due.push(item);
                }
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


            console.log(
                `[Scheduler] Nuevo ciclo preparado: ` +
                `${due.length} artículos pendientes.`
            );


            /*
             * Comenzar inmediatamente.
             */

            this.fillPassiveQueue();


        } catch (error) {

            console.error(
                "[Scheduler] Error preparando ciclo pasivo:",
                error
            );
        }
    }


    /*
     * =========================================================
     * FILL PASSIVE QUEUE
     * =========================================================
     */

    fillPassiveQueue() {

        if (
            !this.passiveCycle.active
        ) {

            return;
        }


        /*
         * Mantener una pequeña reserva.
         *
         * No cargamos cientos de artículos
         * simultáneamente.
         */

        const PASSIVE_QUEUE_SIZE =
            Math.max(
                5,
                this.concurrency * 5
            );


        while (
            this.passiveCycle.index <
                this.passiveCycle.total &&

            this.getPassiveQueuedCount() <
                PASSIVE_QUEUE_SIZE
        ) {

            const item =
                this.passiveCycle.items[
                    this.passiveCycle.index
                ];


            this.passiveCycle.index++;


            if (!item) {

                this.passiveCycle.completed++;

                continue;
            }


            const itemId =
                Number(item.itemId);


            /*
             * Puede haber sido auditado
             * por una búsqueda manual.
             */

            if (
                !this.needsAudit(itemId)
            ) {

                this.passiveCycle.completed++;

                continue;
            }


            /*
             * Puede estar siendo procesado.
             */

            if (
                this.queuedItems.has(itemId)
            ) {

                continue;
            }


            this.queue.push({

                item,

                priority: false,

                passive: true,

                waiters: []
            });


            this.queuedItems.add(
                itemId
            );
        }


        this.drain();


        this.checkPassiveCycleComplete();
    }


    /*
     * =========================================================
     * CONTAR PASIVAS
     * =========================================================
     */

    getPassiveQueuedCount() {

        return this.queue.filter(
            queued =>
                queued &&
                queued.passive === true
        ).length;
    }


    /*
     * =========================================================
     * CONTINUAR CICLO
     * =========================================================
     */

    continuePassiveCycle() {

        if (
            !this.passiveCycle.active
        ) {

            return;
        }


        /*
         * Añadir inmediatamente
         * nuevos artículos.
         */

        this.fillPassiveQueue();


        /*
         * Ejecutar lo disponible.
         */

        this.drain();
    }


    /*
     * =========================================================
     * CICLO COMPLETADO
     * =========================================================
     */

    checkPassiveCycleComplete() {

        if (
            !this.passiveCycle.active
        ) {

            return;
        }


        const finished =

            this.passiveCycle.index >=
                this.passiveCycle.total &&

            this.passiveCycle.completed >=
                this.passiveCycle.total &&

            this.getPassiveQueuedCount() ===
                0;


        if (!finished) {
            return;
        }


        const elapsed =
            Date.now() -
            this.passiveCycle.startedAt;


        console.log(
            `[Scheduler] Ciclo pasivo completado: ` +
            `${this.passiveCycle.total} artículos ` +
            `en ${Math.round(elapsed / 1000)} segundos.`
        );


        this.passiveCycle.active =
            false;
    }


    /*
     * =========================================================
     * DRAIN
     * =========================================================
     */

    drain() {

        while (
            this.running <
                this.concurrency &&

            this.queue.length > 0
        ) {

            /*
             * Siempre sale primero
             * una prioridad si existe.
             */

            const queued =
                this.queue.shift();


            if (!queued) {
                continue;
            }


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
             * Artículo invalidado mientras
             * esperaba.
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
             * Otra auditoría pudo haberlo
             * actualizado mientras esperaba.
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
                `[Scheduler] Auditando ${item.name} (${itemId})` +
                (
                    queued.priority
                        ? " [PRIORIDAD]"
                        : " [PASIVA]"
                )
            );


            /*
             * =================================================
             * AUDITORÍA REAL
             * =================================================
             */

            const result =
                await this.auditor.audit(
                    item
                );


            /*
             * Historial.
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
             * Historial (agregado diario).
             */

            if (
                result &&
                this.history
            ) {

                await this.history.recordSnapshot(result);
            }


            /*
             * Historial crudo por auditoría (intradía).
             *
             * No debe interrumpir la auditoría si falla:
             * es un dato secundario para graficar.
             */

            if (
                result &&
                this.auditHistory
            ) {

                try {

                    await this.auditHistory.record(
                        result
                    );

                } catch (error) {

                    console.warn(
                        `[Scheduler] Error guardando historial de auditoría para ${item.name}:`,
                        error
                    );
                }
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
             * Callback.
             */

            if (
                this.onAuditComplete &&
                result
            ) {

                this.onAuditComplete(
                    result
                );
            }


            /*
             * Resolver búsqueda.
             */

            this.resolveWaiters(
                queued,
                result,
                null
            );


            /*
             * Resolver otros waiters
             * del mismo artículo.
             */

            this.resolveRunningWaiters(
                itemId,
                result,
                null
            );


        } catch (error) {

            /*
             * Error permanente.
             */

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

            /*
             * Ya terminó este artículo.
             */

            this.queuedItems.delete(
                itemId
            );


            this.running--;


            /*
             * Las pasivas avanzan aunque
             * haya ocurrido un error.
             */

            if (
                queued.passive
            ) {

                this.passiveCycle.completed++;


                /*
                 * Los errores no permanentes
                 * se contabilizan aparte.
                 */

                if (
                    !this.needsAudit(itemId) &&
                    !this.isInvalid(itemId)
                ) {

                    // Auditoría completada correctamente.
                } else {

                    /*
                     * Si falló pero no fue
                     * marcado como inválido,
                     * se considera fallo del ciclo.
                     */

                    this.passiveCycle.failed++;
                }
            }


            /*
             * PRIMERO ejecutar prioridades.
             */

            this.drain();


            /*
             * DESPUÉS continuar pasiva.
             */

            this.continuePassiveCycle();


            /*
             * Comprobar si el ciclo terminó.
             */

            this.checkPassiveCycleComplete();
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
                // Ignorar errores externos.
            }
        }
    }


    resolveRunningWaiters(
        itemId,
        result,
        error
    ) {

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
            const waiter
            of waiters
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
     * START
     * =========================================================
     */

    start() {

        if (
            this.started
        ) {

            console.warn(
                "[Scheduler] start() ya fue llamado."
            );

            return;
        }


        if (
            !this.initialized
        ) {

            console.warn(
                "[Scheduler] start() llamado antes de init()."
            );
        }


        this.started =
            true;


        /*
         * Primer ciclo inmediatamente.
         */

        this.startPassiveCycle();


        /*
         * Cada hora comprobamos
         * si el ciclo anterior terminó.
         *
         * Nunca destruimos un ciclo activo.
         */

        this.intervalHandle =
            setInterval(
                () => {

                    if (
                        this.passiveCycle.active
                    ) {

                        console.warn(
                            "[Scheduler] El ciclo anterior todavía está activo. " +
                            "No se iniciará otro."
                        );

                        return;
                    }


                    console.log(
                        "[Scheduler] Iniciando nuevo ciclo horario."
                    );


                    this.startPassiveCycle();

                },
                CONFIG.AUDIT_INTERVAL
            );


        console.log(
            "[Scheduler] Auditoría pasiva iniciada."
        );
    }


    /*
     * =========================================================
     * STOP
     * =========================================================
     */

    stop() {

        this.started =
            false;


        if (
            this.intervalHandle
        ) {

            clearInterval(
                this.intervalHandle
            );


            this.intervalHandle =
                null;
        }


        /*
         * Invalidar el ciclo actual.
         */

        this.passiveCycle.id++;


        this.passiveCycle.active =
            false;


        console.log(
            "[Scheduler] Auditoría pasiva detenida."
        );
    }
}