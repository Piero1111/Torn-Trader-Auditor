
import test from "node:test";
import assert from "node:assert/strict";

import { History } from "../../src/history/history.js";


/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function createTornAPI(timestamp = 1_750_000_000) {

    return {

        async getTimestamp() {

            return {
                timestamp
            };
        }
    };
}


function createStorage({
    audits = {},
    histories = {},
    recentItems = []
} = {}) {

    const savedHistory = [];


    return {

        savedHistory,


        async getAllAudits() {

            return audits;
        },


        async getHistory(itemId) {

            const numericId =
                Number(itemId);


            return Array.isArray(
                histories[numericId]
            )
                ? histories[numericId]
                : [];
        },


        async saveHistory(audit) {

            const itemId =
                Number(audit.itemId);


            if (
                !Array.isArray(
                    histories[itemId]
                )
            ) {

                histories[itemId] = [];
            }


            histories[itemId].push({
                ...audit
            });


            savedHistory.push({
                ...audit
            });
        },


        async getRecentlyUpdatedItems(
            limit = 10
        ) {

            return recentItems.slice(
                0,
                limit
            );
        }
    };
}


function createHistory({
    timestamp,
    audits,
    histories,
    recentItems
} = {}) {

    const tornAPI =
        createTornAPI(
            timestamp
        );


    const storage =
        createStorage({

            audits,
            histories,
            recentItems
        });


    const history =
        new History({

            tornAPI,
            storage
        });


    return {
        history,
        storage,
        tornAPI
    };
}


/*
 * =========================================================
 * 1. GET TORN DAY
 * =========================================================
 */

test(
    "1. obtiene correctamente el día de Torn",
    async () => {

        /*
         * 86400 * 20000
         */

        const timestamp =
            1_728_000_000;


        const {
            history
        } =
            createHistory({
                timestamp
            });


        const result =
            await history.getTornDay();


        assert.equal(
            result,
            Math.floor(
                timestamp / 86400
            )
        );
    }
);


/*
 * =========================================================
 * 2. FALLBACK TORN DAY
 * =========================================================
 */

test(
    "2. utiliza el día local cuando Torn devuelve un timestamp inválido",
    async () => {

        const tornAPI = {

            async getTimestamp() {

                return {
                    timestamp:
                        "invalid"
                };
            }
        };


        const storage =
            createStorage();


        const history =
            new History({

                tornAPI,

                storage
            });


        const result =
            await history.getTornDay();


        assert.equal(
            result,
            Math.floor(
                Date.now() / 86400000
            )
        );
    }
);


/*
 * =========================================================
 * 3. INIT
 * =========================================================
 */

test(
    "3. init reconstruye lastDayByItem correctamente",
    async () => {

        const timestamp =
            Date.now();


        const audits = {

            "1": {
                itemId: 1
            },

            "2": {
                itemId: 2
            }
        };


        const histories = {

            1: [
                {
                    timestamp
                }
            ],

            2: [
                {
                    timestamp:
                        timestamp - 86400000
                }
            ]
        };


        const {
            history
        } =
            createHistory({

                audits,

                histories
            });


        await history.init();


        assert.equal(
            history.initialized,
            true
        );


        assert.equal(
            history.lastDayByItem.get(1),
            Math.floor(
                timestamp / 86400000
            )
        );


        assert.equal(
            history.lastDayByItem.get(2),
            Math.floor(
                (
                    timestamp -
                    86400000
                ) /
                86400000
            )
        );
    }
);


/*
 * =========================================================
 * 4. INIT IGNORA HISTORIAL VACÍO
 * =========================================================
 */

test(
    "4. init ignora artículos sin historial",
    async () => {

        const audits = {

            "1": {
                itemId: 1
            },

            "2": {
                itemId: 2
            }
        };


        const histories = {

            1: [],

            2: [
                {
                    timestamp:
                        Date.now()
                }
            ]
        };


        const {
            history
        } =
            createHistory({

                audits,

                histories
            });


        await history.init();


        assert.equal(
            history.lastDayByItem.has(1),
            false
        );


        assert.equal(
            history.lastDayByItem.has(2),
            true
        );
    }
);


/*
 * =========================================================
 * 5. RECORD SNAPSHOT
 * =========================================================
 */

test(
    "5. recordSnapshot guarda una auditoría nueva",
    async () => {

        const audit = {

            itemId: 1,

            timestamp:
                Date.now(),

            realMarketValue: 1000,

            correctBuyPrice: 800,

            learnedRatio: 0.8,

            observedRatio: 0.75,

            w3bBuyPrice: 750,

            itemValue: 1000,

            confidence: 85,

            status:
                "UPDATE_AVAILABLE"
        };


        const saved = [];


        const storage = {

            async saveHistory(snapshot) {

                saved.push(snapshot);
            },

            async getAllAudits() {

                return {};
            },

            async getHistory() {

                return [];
            }
        };


        const tornAPI = {

            async getTimestamp() {

                return {
                    timestamp:
                        Math.floor(
                            Date.now() / 1000
                        )
                };
            }
        };


        const history =
            new History({
                tornAPI,
                storage
            });


        const result =
            await history.recordSnapshot(
                audit
            );


        assert.deepEqual(
            result,
            audit
        );


        assert.equal(
            saved.length,
            1
        );


        assert.deepEqual(
            saved[0],
            audit
        );


        assert.equal(
            history.lastDayByItem.has(1),
            true
        );
    }
);

/*
 * =========================================================
 * 6. NO DUPLICAR SNAPSHOT DEL MISMO DÍA
 * =========================================================
 */

test(
    "6. no guarda dos snapshots del mismo día",
    async () => {

        const now =
            Date.now();


        const {
            history,
            storage
        } =
        createHistory({

            timestamp:
                Math.floor(
                    now / 1000
                )
        });


        const firstAudit = {

            itemId:
                1,

            timestamp:
                now,

            realMarketValue:
                1000
        };


        const secondAudit = {

            itemId:
                1,

            timestamp:
                now + 1000,

            realMarketValue:
                1200
        };


        const firstResult =
            await history.recordSnapshot(
                firstAudit
            );


        const secondResult =
            await history.recordSnapshot(
                secondAudit
            );


        assert.strictEqual(
            firstResult,
            firstAudit
        );


        assert.equal(
            secondResult,
            null
        );


        assert.equal(
            storage.savedHistory.length,
            1
        );
    }
);


/*
 * =========================================================
 * 7. INVALID AUDIT
 * =========================================================
 */

test(
    "7. rechaza silenciosamente una auditoría inválida",
    async () => {

        const {
            history,
            storage
        } =
            createHistory();


        const result =
            await history.recordSnapshot({

                itemId:
                    0,

                timestamp:
                    Date.now(),

                realMarketValue:
                    1000
            });


        assert.equal(
            result,
            null
        );


        assert.equal(
            storage.savedHistory.length,
            0
        );
    }
);


/*
 * =========================================================
 * 8. ITEM ID INVÁLIDO
 * =========================================================
 */

test(
    "8. rechaza itemId no numérico",
    async () => {

        const {
            history,
            storage
        } =
            createHistory();


        const result =
            await history.recordSnapshot({

                itemId:
                    "abc",

                timestamp:
                    Date.now(),

                realMarketValue:
                    1000
            });


        assert.equal(
            result,
            null
        );


        assert.equal(
            storage.savedHistory.length,
            0
        );
    }
);


/*
 * =========================================================
 * 9. SERIES
 * =========================================================
 */

test(
    "9. getSeries devuelve la serie simplificada",
    async () => {

        const histories = {

            1: [

                {
                    timestamp:
                        1000,

                    realMarketValue:
                        1000,

                    correctBuyPrice:
                        800,

                    learnedRatio:
                        0.8
                },

                {
                    timestamp:
                        2000,

                    realMarketValue:
                        1100,

                    correctBuyPrice:
                        880,

                    learnedRatio:
                        0.8
                }
            ]
        };


        const {
            history
        } =
            createHistory({

                histories
            });


        const result =
            await history.getSeries(1);


        assert.deepEqual(
            result,
            [

                {
                    timestamp:
                        1000,

                    realMarketValue:
                        1000,

                    correctBuyPrice:
                        800
                },

                {
                    timestamp:
                        2000,

                    realMarketValue:
                        1100,

                    correctBuyPrice:
                        880
                }
            ]
        );
    }
);


/*
 * =========================================================
 * 10. SUMMARY
 * =========================================================
 */

test(
    "10. getSummary agrupa correctamente los snapshots",
    async () => {

        const now =
            Date.now();


        const histories = {

            1: [

                {
                    timestamp:
                        now,

                    realMarketValue:
                        1000,

                    correctBuyPrice:
                        800,

                    learnedRatio:
                        0.8,

                    w3bBuyPrice:
                        750,

                    confidence:
                        80,

                    status:
                        "OK"
                },

                {
                    timestamp:
                        now - 2 * 86400000,

                    realMarketValue:
                        1100,

                    correctBuyPrice:
                        880,

                    learnedRatio:
                        0.81,

                    w3bBuyPrice:
                        820,

                    confidence:
                        85,

                    status:
                        "UPDATE_AVAILABLE"
                }
            ]
        };


        const {
            history
        } =
            createHistory({

                histories
            });


        const result =
            await history.getSummary(1);


        assert.ok(
            result
        );


        /*
         * Snapshot actual:
         * entra en las cuatro ventanas.
         */

        assert.equal(
            result.yesterday.samples,
            1
        );


        assert.equal(
            result.last7d.samples,
            2
        );


        assert.equal(
            result.last30d.samples,
            2
        );


        assert.equal(
            result.last6m.samples,
            2
        );
    }
);


/*
 * =========================================================
 * 11. SUMMARY VACÍO
 * =========================================================
 */

test(
    "11. getSummary devuelve null para ventanas sin datos",
    async () => {

        const histories = {

            1: []
        };


        const {
            history
        } =
            createHistory({

                histories
            });


        const result =
            await history.getSummary(1);


        assert.equal(
            result.yesterday,
            null
        );


        assert.equal(
            result.last7d,
            null
        );


        assert.equal(
            result.last30d,
            null
        );


        assert.equal(
            result.last6m,
            null
        );
    }
);


/*
 * =========================================================
 * 12. AGGREGATE
 * =========================================================
 */

test(
    "12. aggregate calcula correctamente los promedios",
    () => {

        const snapshots = [

            {
                timestamp: 1000,

                realMarketValue: 1000,

                correctBuyPrice: 800,

                learnedRatio: 0.8,

                w3bBuyPrice: 750,

                confidence: 80,

                status: "OK"
            },

            {
                timestamp: 2000,

                realMarketValue: 1200,

                correctBuyPrice: 900,

                learnedRatio: 0.9,

                w3bBuyPrice: 850,

                confidence: 90,

                status: "UPDATE_AVAILABLE"
            }
        ];


        const analyzer =
            new History({
                tornAPI: {},
                storage: {}
            });


        const result =
            analyzer.aggregate(
                snapshots
            );


        assert.ok(result);


        /*
         * Promedio:
         *
         * (1000 + 1200) / 2 = 1100
         */

        assert.equal(
            result.avgRealMarketValue,
            1100
        );


        /*
         * Promedio:
         *
         * (800 + 900) / 2 = 850
         */

        assert.equal(
            result.avgCorrectBuyPrice,
            850
        );


        /*
         * Promedio:
         *
         * (0.8 + 0.9) / 2
         *
         * = 0.85
         *
         * Usamos tolerancia porque JavaScript
         * puede producir 0.8500000000000001.
         */

        assert.ok(
            Math.abs(
                result.avgLearnedRatio - 0.85
            ) < 0.000001
        );


        assert.equal(
            result.latestW3bBuyPrice,
            850
        );


        assert.equal(
            result.latestConfidence,
            90
        );


        assert.equal(
            result.latestStatus,
            "UPDATE_AVAILABLE"
        );


        assert.equal(
            result.samples,
            2
        );
    }
);


/*
 * =========================================================
 * 13. AGGREGATE VACÍO
 * =========================================================
 */

test(
    "13. aggregate devuelve null cuando no existen snapshots",
    () => {

        const {
            history
        } =
            createHistory();


        assert.equal(
            history.aggregate([]),
            null
        );


        assert.equal(
            history.aggregate(null),
            null
        );
    }
);


/*
 * =========================================================
 * 14. RECENTLY UPDATED
 * =========================================================
 */

test(
    "14. getRecentlyUpdated delega correctamente en Storage",
    async () => {

        const recentItems = [

            {
                itemId:
                    "2",

                lastHistoryUpdate:
                    5000
            },

            {
                itemId:
                    "1",

                lastHistoryUpdate:
                    4000
            }
        ];


        const {
            history
        } =
            createHistory({

                recentItems
            });


        const result =
            await history.getRecentlyUpdated(
                2
            );


        assert.deepEqual(
            result,
            recentItems
        );
    }
);


/*
 * =========================================================
 * 15. INIT IGNORA DATOS INVÁLIDOS
 * =========================================================
 */

test(
    "15. init ignora auditorías e historiales inválidos",
    async () => {

        const audits = {

            "abc": {
                itemId:
                    "abc"
            },

            "1": {
                itemId:
                    1
            },

            "2": {
                itemId:
                    2
            }
        };


        const histories = {

            1: [

                {
                    timestamp:
                        "invalid"
                }
            ],

            2: [

                {
                    timestamp:
                        Date.now()
                }
            ]
        };


        const {
            history
        } =
            createHistory({

                audits,

                histories
            });


        await history.init();


        assert.equal(
            history.lastDayByItem.has(1),
            false
        );


        assert.equal(
            history.lastDayByItem.has(2),
            true
        );


        assert.equal(
            history.lastDayByItem.has(
                Number("abc")
            ),
            false
        );
    }
);
