
export class AuditHistory {

    constructor(storage) {

        this.storage = storage;
    }


    /*
     * =========================================================
     * GUARDAR OBSERVACIÓN
     * =========================================================
     *
     * Cada auditoría genera un registro independiente.
     */

    async record(result) {

        if (!result) {

            throw new Error(
                "No se recibió una auditoría para guardar."
            );
        }

        const itemId =
            Number(result.itemId);

        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        /*
         * =====================================================
         * TIMESTAMP
         * =====================================================
         *
         * Si la auditoría ya tiene un timestamp válido,
         * conservamos exactamente el mismo objeto.
         *
         * Si no tiene timestamp válido, creamos una copia
         * agregando uno nuevo.
         */

        const hasValidTimestamp =
            Number.isFinite(
                Number(result.timestamp)
            );


        const audit =
            hasValidTimestamp
                ? result
                : {
                    ...result,

                    timestamp:
                        Date.now()
                };


        /*
         * =====================================================
         * GUARDAR
         * =====================================================
         */

        return await this.storage.saveAuditHistory(
            audit
        );
    }


    /*
     * =========================================================
     * OBTENER ÚLTIMA AUDITORÍA
     * =========================================================
     */

    async getLatest(itemId) {

        const id =
            Number(itemId);

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }

        return await this.storage.getAudit(
            id
        );
    }


    /*
     * =========================================================
     * OBTENER HISTORIAL
     * =========================================================
     */

    async getAll(itemId) {

        const id =
            Number(itemId);

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }

        if (
            typeof this.storage.getAuditHistory !==
            "function"
        ) {

            return [];
        }

        return await this.storage.getAuditHistory(
            id
        );
    }
}
