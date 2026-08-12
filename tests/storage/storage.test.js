
import test from "node:test";
import assert from "node:assert/strict";

import { Storage } from "../../src/data/storage.js";
import { CONFIG } from "../../src/config.js";


/*
 * =========================================================
 * MOCK LOCALSTORAGE
 * =========================================================
 */

function createLocalStorageMock() {

    const data = new Map();

    return {

        getItem(key) {

            return data.has(key)
                ? data.get(key)
                : null;
        },


        setItem(key, value) {

            data.set(
                key,
                String(value)
            );
        },


        removeItem(key) {

            data.delete(key);
        },


        clear() {

            data.clear();
        },


        key(index) {

            return Array.from(
                data.keys()
            )[index] ?? null;
        },


        get length() {

            return data.size;
        }
    };
}


/*
 * =========================================================
 * CONFIGURAR ENTORNO DE PRUEBA
 * =========================================================
 */

globalThis.localStorage =
    createLocalStorageMock();


function createStorage() {

    /*
     * Forzamos el uso de localStorage.
     *
     * No definimos GM_getValue ni GM_setValue
     * para que Storage utilice localStorage.
     */

    return new Storage();
}


/*
 * =========================================================
 * 1. CONFIGURACIÓN
 * =========================================================
 */

test(
    "1. devuelve configuración por defecto",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.getConfig();


        assert.deepEqual(
            result,
            {
                tornApiKey: null,
                w3bApiKey: null,
                w3bUserId: null,
                settings: {}
            }
        );
    }
);


/*
 * =========================================================
 * 2. GUARDAR CONFIGURACIÓN
 * =========================================================
 */

test(
    "2. guarda configuración correctamente",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.saveConfig({

                tornApiKey: "TORN_KEY",

                w3bApiKey: "W3B_KEY",

                w3bUserId: 12345
            });


        assert.equal(
            result.tornApiKey,
            "TORN_KEY"
        );


        assert.equal(
            result.w3bApiKey,
            "W3B_KEY"
        );


        assert.equal(
            result.w3bUserId,
            12345
        );
    }
);


/*
 * =========================================================
 * 3. CONSERVAR CONFIGURACIÓN ANTERIOR
 * =========================================================
 */

test(
    "3. saveConfig conserva configuración anterior",
    async () => {

        const storage =
            createStorage();


        await storage.saveConfig({

            tornApiKey:
                "TORN_KEY",

            w3bApiKey:
                "W3B_KEY",

            w3bUserId:
                12345
        });


        const result =
            await storage.saveConfig({

                w3bApiKey:
                    "NEW_W3B_KEY"
            });


        assert.equal(
            result.tornApiKey,
            "TORN_KEY"
        );


        assert.equal(
            result.w3bApiKey,
            "NEW_W3B_KEY"
        );


        assert.equal(
            result.w3bUserId,
            12345
        );
    }
);


/*
 * =========================================================
 * 4. PRICELIST VACÍA
 * =========================================================
 */

test(
    "4. devuelve Pricelist vacía por defecto",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.getPricelist();


        assert.deepEqual(
            result.items,
            []
        );


        assert.equal(
            result.lastSync,
            null
        );
    }
);


/*
 * =========================================================
 * 5. GUARDAR PRICELIST
 * =========================================================
 */

test(
    "5. guarda Pricelist correctamente",
    async () => {

        const storage =
            createStorage();


        const items = [

            {
                itemId: 1,
                itemName: "Xanax",
                price: 1000
            },

            {
                itemId: 2,
                itemName: "Cannabis",
                price: 500
            }
        ];


        const result =
            await storage.savePricelist(
                items
            );


        assert.deepEqual(
            result.items,
            items
        );


        assert.ok(
            Number.isFinite(
                result.lastSync
            )
        );
    }
);


/*
 * =========================================================
 * 6. PRICELIST INVÁLIDA
 * =========================================================
 */

test(
    "6. convierte una Pricelist inválida en lista vacía",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.savePricelist(
                "invalid"
            );


        assert.deepEqual(
            result.items,
            []
        );
    }
);


/*
 * =========================================================
 * 7. GUARDAR AUDITORÍA
 * =========================================================
 */

test(
    "7. guarda una auditoría correctamente",
    async () => {

        const storage =
            createStorage();


        const audit = {

            itemId: 1,

            itemName:
                "Xanax",

            realMarketValue:
                1000,

            correctBuyPrice:
                800,

            confidence:
                85,

            status:
                "UPDATE_AVAILABLE"
        };


        const result =
            await storage.saveAudit(
                audit
            );


        assert.strictEqual(
            result,
            audit
        );


        const saved =
            await storage.getAudit(1);


        assert.deepEqual(
            saved,
            audit
        );
    }
);


/*
 * =========================================================
 * 8. AUDITORÍAS DIFERENTES
 * =========================================================
 */

test(
    "8. conserva auditorías de diferentes artículos",
    async () => {

        const storage =
            createStorage();


        await storage.saveAudit({

            itemId: 1,

            itemName:
                "Xanax"
        });


        await storage.saveAudit({

            itemId: 2,

            itemName:
                "Cannabis"
        });


        const first =
            await storage.getAudit(1);


        const second =
            await storage.getAudit(2);


        assert.equal(
            first.itemName,
            "Xanax"
        );


        assert.equal(
            second.itemName,
            "Cannabis"
        );
    }
);


/*
 * =========================================================
 * 9. AUDITORÍA INEXISTENTE
 * =========================================================
 */

test(
    "9. devuelve null cuando la auditoría no existe",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.getAudit(999);


        assert.equal(
            result,
            null
        );
    }
);


/*
 * =========================================================
 * 10. ITEM ID INVÁLIDO EN AUDITORÍA
 * =========================================================
 */

test(
    "10. rechaza auditoría sin itemId válido",
    async () => {

        const storage =
            createStorage();


        await assert.rejects(

            storage.saveAudit({

                itemName:
                    "Xanax"
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveAudit({

                itemId: 0,

                itemName:
                    "Xanax"
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveAudit({

                itemId: -1,

                itemName:
                    "Xanax"
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveAudit({

                itemId:
                    "abc",

                itemName:
                    "Xanax"
            }),

            /itemId válido/
        );
    }
);


/*
 * =========================================================
 * 11. TODAS LAS AUDITORÍAS
 * =========================================================
 */

test(
    "11. devuelve todas las auditorías",
    async () => {

        const storage =
            createStorage();


        await storage.saveAudit({

            itemId: 1,

            itemName:
                "Xanax"
        });


        await storage.saveAudit({

            itemId: 2,

            itemName:
                "Cannabis"
        });


        const result =
            await storage.getAllAudits();


        assert.equal(
            Object.keys(result).length,
            2
        );


        assert.equal(
            result[1].itemName,
            "Xanax"
        );


        assert.equal(
            result[2].itemName,
            "Cannabis"
        );
    }
);

/*
 * =========================================================
 * 12. GUARDAR HISTORIAL
 * =========================================================
 */

test(
    "12. guarda una entrada de historial",
    async () => {

        const storage =
            createStorage();


        /*
         * Utilizamos un timestamp reciente para
         * evitar que pruneHistory() elimine
         * inmediatamente la entrada.
         */

        const now =
            Date.now();


        await storage.saveHistory({

            itemId: 1,

            timestamp:
                now,

            realMarketValue:
                1000,

            correctBuyPrice:
                800,

            learnedRatio:
                0.8,

            observedRatio:
                0.75,

            w3bBuyPrice:
                750,

            itemValue:
                1000,

            confidence:
                85,

            status:
                "UPDATE_AVAILABLE"
        });


        const result =
            await storage.getHistory(1);


        assert.equal(
            result.length,
            1
        );


        assert.equal(
            result[0].timestamp,
            now
        );


        assert.equal(
            result[0].realMarketValue,
            1000
        );


        assert.equal(
            result[0].correctBuyPrice,
            800
        );


        assert.equal(
            result[0].learnedRatio,
            0.8
        );


        assert.equal(
            result[0].observedRatio,
            0.75
        );


        assert.equal(
            result[0].w3bBuyPrice,
            750
        );


        assert.equal(
            result[0].itemValue,
            1000
        );


        assert.equal(
            result[0].confidence,
            85
        );


        assert.equal(
            result[0].status,
            "UPDATE_AVAILABLE"
        );
    }
);


/*
 * =========================================================
 * 13. MÚLTIPLES ENTRADAS
 * =========================================================
 */

test(
    "13. conserva múltiples entradas del mismo artículo",
    async () => {

        const storage =
            createStorage();


        const now =
            Date.now();


        /*
         * Ambas entradas son recientes.
         *
         * La primera ocurrió hace 1 segundo.
         * La segunda ocurre ahora.
         */

        await storage.saveHistory({

            itemId: 2,

            timestamp:
                now - 1000,

            realMarketValue:
                1000
        });


        await storage.saveHistory({

            itemId: 2,

            timestamp:
                now,

            realMarketValue:
                1100
        });


        const result =
            await storage.getHistory(2);


        assert.equal(
            result.length,
            2
        );


        assert.equal(
            result[0].timestamp,
            now - 1000
        );


        assert.equal(
            result[1].timestamp,
            now
        );


        assert.equal(
            result[0].realMarketValue,
            1000
        );


        assert.equal(
            result[1].realMarketValue,
            1100
        );
    }
);



/*
 * =========================================================
 * 14. HISTORIAL INEXISTENTE
 * =========================================================
 */

test(
    "14. devuelve array vacío cuando no existe historial",
    async () => {

        const storage =
            createStorage();


        const result =
            await storage.getHistory(999);


        assert.deepEqual(
            result,
            []
        );
    }
);


/*
 * =========================================================
 * 15. ITEM ID INVÁLIDO EN HISTORIAL
 * =========================================================
 */

test(
    "15. rechaza historial sin itemId válido",
    async () => {

        const storage =
            createStorage();


        await assert.rejects(

            storage.saveHistory({

                realMarketValue:
                    1000
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveHistory({

                itemId: 0,

                realMarketValue:
                    1000
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveHistory({

                itemId: -1,

                realMarketValue:
                    1000
            }),

            /itemId válido/
        );


        await assert.rejects(

            storage.saveHistory({

                itemId:
                    "abc",

                realMarketValue:
                    1000
            }),

            /itemId válido/
        );
    }
);


/*
 * =========================================================
 * 16. ARTÍCULOS RECIENTEMENTE ACTUALIZADOS
 * =========================================================
 */

test(
    "16. obtiene artículos ordenados por última actualización",
    async () => {

        const storage =
            createStorage();


        /*
         * Usamos timestamps suficientemente recientes
         * para que no sean eliminados por pruneHistory().
         */

        const now =
            Date.now();


        await storage.saveHistory({

            itemId: 1,

            timestamp:
                now - 3000,

            realMarketValue:
                1000
        });


        await storage.saveHistory({

            itemId: 2,

            timestamp:
                now - 1000,

            realMarketValue:
                2000
        });


        await storage.saveHistory({

            itemId: 3,

            timestamp:
                now - 5000,

            realMarketValue:
                3000
        });


        const result =
            await storage.getRecentlyUpdatedItems(
                10
            );


        assert.equal(
            result.length,
            3
        );


        assert.equal(
            Number(result[0].itemId),
            2
        );


        assert.equal(
            Number(result[1].itemId),
            1
        );


        assert.equal(
            Number(result[2].itemId),
            3
        );


        assert.ok(
            result[0].lastHistoryUpdate >
            result[1].lastHistoryUpdate
        );


        assert.ok(
            result[1].lastHistoryUpdate >
            result[2].lastHistoryUpdate
        );
    }
);


/*
 * =========================================================
 * 17. LÍMITE DE ARTÍCULOS RECIENTES
 * =========================================================
 */

test(
    "17. respeta el límite de artículos recientes",
    async () => {

        const storage =
            createStorage();


        const now =
            Date.now();


        for (
            let i = 1;
            i <= 5;
            i++
        ) {

            await storage.saveHistory({

                itemId: i,

                timestamp:
                    now - i * 1000,

                realMarketValue:
                    1000 + i
            });
        }


        const result =
            await storage.getRecentlyUpdatedItems(
                3
            );


        assert.equal(
            result.length,
            3
        );


        /*
         * El más reciente es el item 1.
         */

        assert.equal(
            Number(result[0].itemId),
            1
        );


        assert.equal(
            Number(result[1].itemId),
            2
        );


        assert.equal(
            Number(result[2].itemId),
            3
        );
    }
);


/*
 * =========================================================
 * 18. ELIMINAR HISTORIAL ANTIGUO
 * =========================================================
 */

test(
    "18. elimina entradas antiguas del historial",
    async () => {

        const storage =
            createStorage();


        const now =
            Date.now();


        const history =
            [

                {
                    timestamp:
                        now -
                        (
                            CONFIG.HISTORY_DAYS *
                            24 *
                            60 *
                            60 *
                            1000
                        ) -
                        1000,

                    realMarketValue:
                        500
                },


                {
                    timestamp:
                        now -
                        (
                            CONFIG.HISTORY_DAYS *
                            24 *
                            60 *
                            60 *
                            1000
                        ) +
                        1000,

                    realMarketValue:
                        600
                },


                {
                    timestamp:
                        now - 1000,

                    realMarketValue:
                        700
                }
            ];


        const result =
            storage.pruneHistory(
                history
            );


        /*
         * La primera entrada está fuera
         * del período permitido.
         *
         * Las otras dos permanecen.
         */

        assert.equal(
            result.length,
            2
        );


        assert.equal(
            result[0].realMarketValue,
            600
        );


        assert.equal(
            result[1].realMarketValue,
            700
        );
    }
);


/*
 * =========================================================
 * 19. READ FALLBACK
 * =========================================================
 */

test(
    "19. read devuelve fallback cuando no existe información",
    async () => {

        const storage =
            createStorage();


        const fallback = {

            test:
                true
        };


        const result =
            await storage.read(
                "missing-key",
                fallback
            );


        assert.strictEqual(
            result,
            fallback
        );
    }
);


/*
 * =========================================================
 * 20. WRITE + READ
 * =========================================================
 */

test(
    "20. write y read conservan objetos correctamente",
    async () => {

        const storage =
            createStorage();


        const data = {

            name:
                "Torn Trader Auditor",

            version:
                1,

            enabled:
                true,

            items:
                [
                    1,
                    2,
                    3
                ]
        };


        await storage.write(
            "test-key",
            data
        );


        const result =
            await storage.read(
                "test-key",
                null
            );


        assert.deepEqual(
            result,
            data
        );
    }
);
