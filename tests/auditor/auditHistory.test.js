
import test from "node:test";
import assert from "node:assert/strict";

import { AuditHistory } from "../../src/auditor/auditHistory.js";


function createStorage() {

    const calls = {

        saveAudit: [],

        getAudit: [],

        getAuditHistory: []
    };


    const storage = {

        async saveAudit(audit) {

            calls.saveAudit.push(
                audit
            );

            return audit;
        },


        async getAudit(itemId) {

            calls.getAudit.push(
                itemId
            );

            return {
                itemId,

                itemName: "Xanax",

                realMarketValue: 1000,

                timestamp: 123
            };
        },


        async getAuditHistory(itemId) {

            calls.getAuditHistory.push(
                itemId
            );

            return [
                {
                    itemId,

                    realMarketValue: 1000,

                    timestamp: 123
                },

                {
                    itemId,

                    realMarketValue: 1050,

                    timestamp: 456
                }
            ];
        }
    };


    return {
        storage,
        calls
    };
}


/*
 * =========================================================
 * 1. GUARDAR AUDITORÍA
 * =========================================================
 */

test(
    "1. guarda una auditoría",
    async () => {

        const { storage, calls } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        const audit = {

            itemId: 1,

            itemName: "Xanax",

            realMarketValue: 1000,

            timestamp: 123
        };


        const result =
            await history.record(
                audit
            );


        assert.strictEqual(
            result,
            audit
        );


        assert.equal(
            calls.saveAudit.length,
            1
        );


        assert.strictEqual(
            calls.saveAudit[0],
            audit
        );
    }
);


/*
 * =========================================================
 * 2. GENERAR TIMESTAMP
 * =========================================================
 */

test(
    "2. genera timestamp si no existe",
    async () => {

        const { storage } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        const before =
            Date.now();


        const result =
            await history.record({

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 1000
            });


        const after =
            Date.now();


        assert.ok(
            Number.isFinite(
                result.timestamp
            )
        );


        assert.ok(
            result.timestamp >= before
        );


        assert.ok(
            result.timestamp <= after
        );
    }
);


/*
 * =========================================================
 * 3. RECHAZAR AUDITORÍA INVÁLIDA
 * =========================================================
 */

test(
    "3. rechaza auditoría inexistente",
    async () => {

        const { storage } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        await assert.rejects(

            history.record(null),

            /No se recibió una auditoría/
        );
    }
);


/*
 * =========================================================
 * 4. ITEM ID INVÁLIDO
 * =========================================================
 */

test(
    "4. rechaza itemId inválido",
    async () => {

        const { storage } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        await assert.rejects(

            history.record({

                itemId: "abc",

                itemName: "Xanax",

                realMarketValue: 1000
            }),

            /ID de artículo inválido/
        );
    }
);


/*
 * =========================================================
 * 5. OBTENER ÚLTIMA AUDITORÍA
 * =========================================================
 */

test(
    "5. obtiene última auditoría",
    async () => {

        const { storage, calls } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        const result =
            await history.getLatest(1);


        assert.equal(
            result.itemId,
            1
        );


        assert.deepEqual(
            calls.getAudit,
            [1]
        );
    }
);


/*
 * =========================================================
 * 6. OBTENER HISTORIAL
 * =========================================================
 */

test(
    "6. obtiene historial completo",
    async () => {

        const { storage, calls } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        const result =
            await history.getAll(1);


        assert.equal(
            result.length,
            2
        );


        assert.equal(
            result[0].realMarketValue,
            1000
        );


        assert.equal(
            result[1].realMarketValue,
            1050
        );


        assert.deepEqual(
            calls.getAuditHistory,
            [1]
        );
    }
);


/*
 * =========================================================
 * 7. ITEM ID INVÁLIDO EN GET
 * =========================================================
 */

test(
    "7. getLatest rechaza itemId inválido",
    async () => {

        const { storage } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        await assert.rejects(

            history.getLatest(0),

            /ID de artículo inválido/
        );
    }
);


/*
 * =========================================================
 * 8. ITEM ID INVÁLIDO EN HISTORIAL
 * =========================================================
 */

test(
    "8. getAll rechaza itemId inválido",
    async () => {

        const { storage } =
            createStorage();


        const history =
            new AuditHistory(
                storage
            );


        await assert.rejects(

            history.getAll("abc"),

            /ID de artículo inválido/
        );
    }
);
