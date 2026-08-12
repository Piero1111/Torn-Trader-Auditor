
import test from "node:test";
import assert from "node:assert/strict";

import { Auditor } from "../../src/auditor/auditor.js";


/*
 * =========================================================
 * FACTORIES
 * =========================================================
 */

function createItem(overrides = {}) {

    return {

        itemId: 123,

        name: "Test Item",

        buyPrice: 750,

        ...overrides
    };
}


function createItemResponse(overrides = {}) {

    return {

        items: [

            {

                id: 123,

                name: "Test Item",

                value: {

                    market_price: 1000

                },

                ...overrides

            }

        ]

    };
}


function createMarketListings() {

    return [

        {
            price: 1000,
            quantity: 100
        },

        {
            price: 1010,
            quantity: 100
        },

        {
            price: 1020,
            quantity: 100
        }

    ];
}


function createBazaarListings() {

    return [

        {
            price: 1000,
            quantity: 50,
            trader_id: 10
        },

        {
            price: 1020,
            quantity: 50,
            trader_id: 20
        }

    ];
}


function createMarketAnalysis(overrides = {}) {

    return {

        totalQuantity: 300,

        listingsCount: 3,

        targetQuantity: 30,

        requiredListings: 1,

        sampleSize: 3,

        sampleQuantity: 100,

        weightedMean: 1000,

        weightedMedian: 1000,

        dispersion: 0.05,

        realMarketValue: 1000,

        confidence: 85,

        accumulatedQuantity: 100,

        sampleListingsCount: 3,

        sellerSampleSize: 3,

        ...overrides

    };
}


function createBazaarAnalysis(overrides = {}) {

    return {

        totalQuantity: 100,

        listingsCount: 2,

        traderCount: 2,

        minPrice: 1000,

        maxPrice: 1020,

        weightedMean: 1010,

        weightedMedian: 1010,

        dispersion: 0.02,

        priceDistribution: [],

        largestTraderQuantity: 50,

        largestTraderShare: 0.50,

        confidence: 80,

        ...overrides

    };
}


function createMarketValueAnalysis(overrides = {}) {

    return {

        realMarketValue: 1000,

        marketWeight: 0.60,

        bazaarWeight: 0.40,

        confidence: 85,

        signals: {

            marketValue: 1000,

            bazaarValue: 1010,

            highDisagreement: false

        },

        ...overrides

    };
}


function createMarketplace(overrides = {}) {

    return {

        item_name: "Test Item",

        market_price: 1000,

        bazaar_average: 1010,

        generated_at: 1234567890,

        listings: createBazaarListings(),

        ...overrides

    };
}


/*
 * =========================================================
 * MOCK FACTORY
 * =========================================================
 */

function createMocks(overrides = {}) {

    const calls = {

        getItem: 0,

        getItemMarket: 0,

        getMarketplace: 0,

        calculateObservedRatio: 0,

        updateRatio: 0,

        getAudit: 0,

        saveAudit: 0,

        generateProposal: 0,

        internalUpdate: 0,

        updatePricelist: 0

    };


    const storage = {

        async getAudit(itemId) {

            calls.getAudit++;

            if (
                typeof overrides.previousAudit !==
                "undefined"
            ) {

                return overrides.previousAudit;
            }

            return null;
        },


        async saveAudit(audit) {

            calls.saveAudit++;

            storage.savedAudit = audit;

            return audit;
        },


        ...(overrides.storage || {})

    };


    const tornAPI = {

        async getItem(itemId) {

            calls.getItem++;

            return createItemResponse(
                overrides.itemData || {}
            );
        },


        async getItemMarket(itemId) {

            calls.getItemMarket++;

            return {

                itemmarket: {

                    listings:
                        overrides.marketListings ??
                        createMarketListings()

                }

            };

        },


        ...(overrides.tornAPI || {})

    };


    const w3bAPI = {

        async getMarketplace(itemId) {

            calls.getMarketplace++;

            return createMarketplace(
                overrides.marketplace || {}
            );
        },


        async updatePricelist(userId, items) {

            calls.updatePricelist++;

            w3bAPI.updatedUserId =
                userId;

            w3bAPI.updatedItems =
                items;

            return (
                overrides.w3bUpdateResult ?? {

                    success: true

                }
            );
        },


        ...(overrides.w3bAPI || {})

    };


    const marketAnalyzer = {

        analyze(listings) {

            marketAnalyzer.receivedListings =
                listings;

            return (
                overrides.marketAnalysis ??
                createMarketAnalysis()
            );
        }

    };


    const bazaarAnalyzer = {

        analyze(listings) {

            bazaarAnalyzer.receivedListings =
                listings;

            return (
                overrides.bazaarAnalysis ??
                createBazaarAnalysis()
            );
        }

    };


    const marketValueAnalyzer = {

        analyze(data) {

            marketValueAnalyzer.receivedData =
                data;

            return (
                overrides.marketValueAnalysis ??
                createMarketValueAnalysis()
            );
        }

    };


    const ratioLearner = {

        calculateObservedRatio(
            buyPrice,
            itemValue
        ) {

            calls.calculateObservedRatio++;

            ratioLearner.receivedObservedRatio = {

                buyPrice,

                itemValue

            };

            return (
                overrides.observedRatio ??
                0.75
            );
        },


        update(
            previousRatio,
            observedRatio
        ) {

            calls.updateRatio++;

            ratioLearner.receivedUpdate = {

                previousRatio,

                observedRatio

            };

            return (
                overrides.learnedRatio ??
                0.80
            );
        }

    };


    const priceProposal = {

        generate(data) {

            calls.generateProposal++;

            priceProposal.receivedData =
                data;

            return (
                overrides.priceProposal ??
                {

                    updateAvailable: false,

                    recommendedBuyPrice: null

                }
            );
        }

    };


    const internalPriceList = {

        async update(data) {

            calls.internalUpdate++;

            internalPriceList.receivedData =
                data;

            return (
                overrides.internalUpdateResult ??
                {

                    success: true

                }
            );
        }

    };


    const auditor =
        new Auditor({

            tornAPI,

            w3bAPI,

            marketAnalyzer,

            bazaarAnalyzer,

            marketValueAnalyzer,

            ratioLearner,

            storage,

            priceProposal,

            internalPriceList,

            w3bUserId:
                overrides.w3bUserId ??
                null

        });


    return {

        auditor,

        calls,

        storage,

        tornAPI,

        w3bAPI,

        marketAnalyzer,

        bazaarAnalyzer,

        marketValueAnalyzer,

        ratioLearner,

        priceProposal,

        internalPriceList

    };

}


/*
 * =========================================================
 * 1. FLUJO BÁSICO
 * =========================================================
 */

test(
    "1. realiza correctamente una auditoría completa",
    async () => {

        const {
            auditor,
            storage,
            calls
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.ok(result);

        assert.equal(
            result.itemId,
            123
        );

        assert.equal(
            result.itemName,
            "Test Item"
        );

        assert.equal(
            result.itemValue,
            1000
        );

        assert.equal(
            result.w3bBuyPrice,
            750
        );

        assert.equal(
            result.observedRatio,
            0.75
        );

        assert.equal(
            result.learnedRatio,
            0.80
        );

        assert.equal(
            result.realMarketValue,
            1000
        );

        assert.equal(
            result.correctBuyPrice,
            800
        );

        assert.equal(
            result.status,
            "YELLOW"
        );

        assert.ok(
            Number.isFinite(
                result.timestamp
            )
        );

        assert.equal(
            calls.getItem,
            1
        );

        assert.equal(
            calls.getItemMarket,
            1
        );

        assert.equal(
            calls.getMarketplace,
            1
        );

        assert.equal(
            calls.saveAudit,
            1
        );

        assert.deepEqual(
            storage.savedAudit,
            result
        );

    }
);


/*
 * =========================================================
 * 2. VALIDACIÓN DEL ARTÍCULO
 * =========================================================
 */

test(
    "2. rechaza un artículo inexistente",
    async () => {

        const {
            auditor
        } =
            createMocks();


        await assert.rejects(

            () =>
                auditor.audit(null),

            /No se recibió un artículo/
        );

    }
);


test(
    "3. rechaza itemId inválido",
    async () => {

        const {
            auditor
        } =
            createMocks();


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem({
                        itemId: 0
                    })
                ),

            /ID de artículo inválido/
        );

    }
);


test(
    "4. rechaza itemId no entero",
    async () => {

        const {
            auditor
        } =
            createMocks();


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem({
                        itemId: 12.5
                    })
                ),

            /ID de artículo inválido/
        );

    }
);


test(
    "5. rechaza precio de compra inválido",
    async () => {

        const {
            auditor
        } =
            createMocks();


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem({
                        buyPrice: 0
                    })
                ),

            /Precio de compra W3B inválido/
        );

    }
);


/*
 * =========================================================
 * 3. ITEM VALUE
 * =========================================================
 */

test(
    "6. extrae correctamente el Item Value de Torn",
    async () => {

        const {
            auditor,
            ratioLearner
        } =
            createMocks({

                itemData: {

                    value: {

                        market_price: 2500

                    }

                }

            });


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.itemValue,
            2500
        );

        assert.deepEqual(
            ratioLearner.receivedObservedRatio,
            {

                buyPrice: 750,

                itemValue: 2500

            }
        );

    }
);


/*
 * =========================================================
 * 4. RATIO
 * =========================================================
 */

test(
    "7. calcula el observedRatio utilizando Buy Price e Item Value",
    async () => {

        const {
            auditor,
            ratioLearner
        } =
            createMocks({

                observedRatio: 0.60

            });


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.observedRatio,
            0.60
        );

        assert.equal(
            ratioLearner.receivedObservedRatio.buyPrice,
            750
        );

        assert.equal(
            ratioLearner.receivedObservedRatio.itemValue,
            1000
        );

    }
);


test(
    "8. utiliza el learnedRatio anterior para actualizar el aprendizaje",
    async () => {

        const previousAudit = {

            itemId: 123,

            learnedRatio: 0.70

        };


        const {
            auditor,
            ratioLearner
        } =
            createMocks({

                previousAudit,

                learnedRatio: 0.75

            });


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.learnedRatio,
            0.75
        );

        assert.deepEqual(
            ratioLearner.receivedUpdate,
            {

                previousRatio: 0.70,

                observedRatio: 0.75

            }
        );

    }
);


/*
 * =========================================================
 * 5. MARKET
 * =========================================================
 */

test(
    "9. normaliza price y quantity antes de enviar al MarketAnalyzer",
    async () => {

        const marketListings = [

            {
                price: "1000",

                quantity: "25"

            }

        ];


        const {
            auditor,
            marketAnalyzer
        } =
            createMocks({

                marketListings,

                marketAnalysis:
                    createMarketAnalysis()

            });


        await auditor.audit(
            createItem()
        );


        assert.equal(
            marketAnalyzer.receivedListings[0].price,
            1000
        );

        assert.equal(
            marketAnalyzer.receivedListings[0].quantity,
            25
        );

    }
);


test(
    "10. rechaza la auditoría cuando no existen listings del Item Market",
    async () => {

        const {
            auditor
        } =
            createMocks({

                marketListings: []

            });


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem()
                ),

            /No hay vendedores disponibles/
        );

    }
);



/*
 * =========================================================
 *
 * 11. MARKET ANALYZER
 * =========================================================
 */

test(
    "11. rechaza la auditoría cuando MarketAnalyzer no produce análisis",
    async () => {

        const {
            auditor,
            marketAnalyzer
        } =
            createMocks();


        /*
         * Forzamos al MarketAnalyzer a no producir
         * ningún análisis.
         */
        marketAnalyzer.analyze =
            () => null;


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem()
                ),

            /No hay suficientes datos de mercado/
        );

    }
);




/*
 * =========================================================
 * 6. BAZAARS
 * =========================================================
 */

test(
    "12. analiza los bazares cuando existen listings",
    async () => {

        const {
            auditor,
            bazaarAnalyzer
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.ok(
            result.bazaars
        );

        assert.equal(
            result.bazaars.totalQuantity,
            100
        );

        assert.equal(
            result.bazaars.traderCount,
            2
        );

        assert.equal(
            bazaarAnalyzer.receivedListings.length,
            2
        );

    }
);


test(
    "13. continúa sin análisis de bazares cuando no existen listings",
    async () => {

        const {
            auditor,
            marketValueAnalyzer
        } =
            createMocks({

                marketplace: {

                    listings: []

                }

            });


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.bazaars,
            null
        );

        assert.equal(
            marketValueAnalyzer.receivedData.bazaars,
            null
        );

    }
);


test(
    "14. continúa cuando BazaarAnalyzer lanza un error",
    async () => {

        const {
            auditor,
            bazaarAnalyzer
        } =
            createMocks();


        bazaarAnalyzer.analyze =
            () => {

                throw new Error(
                    "Bazaar failure"
                );

            };


        const result =
            await auditor.audit(
                createItem()
            );


        assert.ok(result);

        assert.equal(
            result.bazaars,
            null
        );

    }
);


/*
 * =========================================================
 * 7. MARKET VALUE
 * =========================================================
 */

test(
    "15. combina Market y Bazaars mediante MarketValueAnalyzer",
    async () => {

        const {
            auditor,
            marketValueAnalyzer
        } =
            createMocks();


        await auditor.audit(
            createItem()
        );


        assert.ok(
            marketValueAnalyzer.receivedData.market
        );

        assert.ok(
            marketValueAnalyzer.receivedData.bazaars
        );

    }
);


test(
    "16. rechaza Market Value inválido",
    async () => {

        const {
            auditor
        } =
            createMocks({

                marketValueAnalysis: {

                    realMarketValue: 0,

                    confidence: 50

                }

            });


        await assert.rejects(

            () =>
                auditor.audit(
                    createItem()
                ),

            /No se pudo determinar el Market Value real/
        );

    }
);


/*
 * =========================================================
 * 8. PRECIO CORRECTO
 * =========================================================
 */

test(
    "17. calcula correctamente el precio de compra recomendado",
    async () => {

        const {
            auditor
        } =
            createMocks({

                learnedRatio: 0.80,

                marketValueAnalysis:
                    createMarketValueAnalysis({

                        realMarketValue: 1250

                    })

            });


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.correctBuyPrice,
            1000
        );

    }
);


/*
 * =========================================================
 * 9. STATUS
 * =========================================================
 */

test(
    "18. calcula GREEN cuando la diferencia es <= 3%",
    async () => {

        const {
            auditor
        } =
            createMocks({

                learnedRatio: 0.80,

                marketValueAnalysis:
                    createMarketValueAnalysis({

                        realMarketValue: 1000

                    })

            });


        const result =
            await auditor.audit(

                createItem({

                    buyPrice: 800

                })

            );


        assert.equal(
            result.correctBuyPrice,
            800
        );

        assert.equal(
            result.status,
            "GREEN"
        );

    }
);


test(
    "19. calcula YELLOW cuando la diferencia está entre 3% y 10%",
    async () => {

        const {
            auditor
        } =
            createMocks({

                learnedRatio: 0.80

            });


        const result =
            await auditor.audit(

                createItem({

                    buyPrice: 850

                })

            );


        assert.equal(
            result.status,
            "YELLOW"
        );

    }
);


test(
    "20. calcula RED cuando la diferencia es superior al 10%",
    async () => {

        const {
            auditor
        } =
            createMocks({

                learnedRatio: 0.80

            });


        const result =
            await auditor.audit(

                createItem({

                    buyPrice: 1000

                })

            );


        assert.equal(
            result.status,
            "RED"
        );

    }
);


/*
 * =========================================================
 * 10. PRICE PROPOSAL
 * =========================================================
 */

test(
    "21. no genera PriceProposal cuando no existe precio interno",
    async () => {

        const {
            auditor,
            priceProposal,
            calls
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.priceProposal,
            null
        );

        assert.equal(
            calls.generateProposal,
            0
        );

        assert.equal(
            result.priceUpdate,
            null
        );

    }
);


/*
 * =========================================================
 * 11. PRICE UPDATE
 * =========================================================
 */


/*
 * =========================================================
 *
 * 22. PRICE UPDATE
 * =========================================================
 */

test(
    "22. actualiza precio interno y W3B cuando PriceProposal lo indica",
    async () => {

        const {
            auditor,
            storage,
            internalPriceList,
            w3bAPI,
            calls
        } =
            createMocks({

                w3bUserId:
                    "999999",


                storage: {

                    async getInternalPrice() {

                        return {

                            internalMarketValue:
                                900

                        };

                    }

                },


                /*
                 * PriceProposal.generate() utilizará
                 * este objeto como resultado.
                 */
                priceProposal: {

                    updateAvailable:
                        true,

                    recommendedBuyPrice:
                        777

                }

            });


        const result =
            await auditor.audit(
                createItem()
            );


        /*
         * PRICE UPDATE
         */

        assert.ok(
            result.priceUpdate
        );


        assert.equal(
            result.priceUpdate.updated,
            true
        );


        assert.equal(
            result.priceUpdate.recommendedBuyPrice,
            777
        );


        /*
         * PRICE PROPOSAL
         */

        assert.equal(
            calls.generateProposal,
            1
        );


        /*
         * INTERNAL PRICE LIST
         */

        assert.equal(
            calls.internalUpdate,
            1
        );


        /*
         * W3B PRICELIST
         */

        assert.equal(
            calls.updatePricelist,
            1
        );


        assert.equal(
            w3bAPI.updatedUserId,
            "999999"
        );


        assert.deepEqual(
            w3bAPI.updatedItems,
            [

                {

                    itemID:
                        123,

                    pricingType:
                        "fixed",

                    pricingValue:
                        777

                }

            ]
        );


        /*
         * DATOS ENVIADOS A INTERNAL PRICE LIST
         */

        assert.equal(
            internalPriceList.receivedData.itemId,
            123
        );


        assert.equal(
            internalPriceList.receivedData.realMarketValue,
            1000
        );


        /*
         * LA AUDITORÍA FINAL DEBE GUARDARSE
         */

        assert.ok(
            storage.savedAudit
        );

    }
);


/*
 * =========================================================
 *
 * 23. PRICE UPDATE SIN W3B USER ID
 * =========================================================
 */

test(
    "23. no actualiza W3B cuando w3bUserId no existe",
    async () => {

        const {
            auditor,
            calls,
            internalPriceList
        } =
            createMocks({

                /*
                 * No existe usuario W3B.
                 */
                w3bUserId:
                    null,


                storage: {

                    async getInternalPrice() {

                        return {

                            internalMarketValue:
                                900

                        };

                    }

                },


                priceProposal: {

                    updateAvailable:
                        true,

                    recommendedBuyPrice:
                        700

                }

            });


        const result =
            await auditor.audit(
                createItem()
            );


        /*
         * PriceProposal sí debe generar
         * una actualización.
         */

        assert.ok(
            result.priceUpdate
        );


        assert.equal(
            result.priceUpdate.updated,
            true
        );


        assert.equal(
            result.priceUpdate.recommendedBuyPrice,
            700
        );


        /*
         * La lista interna SÍ debe actualizarse.
         */

        assert.equal(
            calls.internalUpdate,
            1
        );


        assert.ok(
            internalPriceList.receivedData
        );


        /*
         * W3B NO debe actualizarse porque
         * no existe w3bUserId.
         */

        assert.equal(
            calls.updatePricelist,
            0
        );


        /*
         * El resultado debe indicar que no
         * hubo actualización en W3B.
         */

        assert.equal(
            result.priceUpdate.w3b,
            null
        );

    }
);



/*
 * =========================================================
 * 12. RESULTADO
 * =========================================================
 */

test(
    "24. conserva la información principal del Market",
    async () => {

        const {
            auditor
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.market.totalQuantity,
            300
        );

        assert.equal(
            result.market.listingsCount,
            3
        );

        assert.equal(
            result.market.weightedMean,
            1000
        );

        assert.equal(
            result.market.weightedMedian,
            1000
        );

        assert.equal(
            result.market.confidence,
            85
        );

    }
);


test(
    "25. conserva la información principal de Bazaars",
    async () => {

        const {
            auditor
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.bazaars.totalQuantity,
            100
        );

        assert.equal(
            result.bazaars.listingsCount,
            2
        );

        assert.equal(
            result.bazaars.traderCount,
            2
        );

        assert.equal(
            result.bazaars.weightedMean,
            1010
        );

        assert.equal(
            result.bazaars.weightedMedian,
            1010
        );

    }
);


test(
    "26. conserva el Market Value Analysis completo",
    async () => {

        const {
            auditor
        } =
            createMocks();


        const result =
            await auditor.audit(
                createItem()
            );


        assert.equal(
            result.marketValueAnalysis.realMarketValue,
            1000
        );

        assert.equal(
            result.marketValueAnalysis.marketWeight,
            0.60
        );

        assert.equal(
            result.marketValueAnalysis.bazaarWeight,
            0.40
        );

        assert.equal(
            result.marketValueAnalysis.confidence,
            85
        );

        assert.equal(
            result.confidence,
            85
        );

    }
);


/*
 * =========================================================
 * 13. EXTRACT ITEM
 * =========================================================
 */

test(
    "27. extractItem devuelve los datos normalizados",
    () => {

        const {
            auditor
        } =
            createMocks();


        const result =
            auditor.extractItem({

                items: [

                    {

                        id: "123",

                        name: "Test Item",

                        value: {

                            market_price:
                                "2500"

                        }

                    }

                ]

            });


        assert.deepEqual(
            result,
            {

                id: 123,

                name: "Test Item",

                itemValue: 2500

            }
        );

    }
);


test(
    "28. extractItem rechaza una respuesta sin artículo",
    () => {

        const {
            auditor
        } =
            createMocks();


        assert.throws(

            () =>
                auditor.extractItem({
                    items: []
                }),

            /Torn API no devolvió información/
        );

    }
);


test(
    "29. extractItem rechaza Item Value inválido",
    () => {

        const {
            auditor
        } =
            createMocks();


        assert.throws(

            () =>
                auditor.extractItem({

                    items: [

                        {

                            id: 123,

                            name: "Test Item",

                            value: {

                                market_price: 0

                            }

                        }

                    ]

                }),

            /Item Value inválido/
        );

    }
);


/*
 * =========================================================
 * 14. CALCULATE STATUS
 * =========================================================
 */

test(
    "30. calculateStatus devuelve RED para valores inválidos",
    () => {

        const {
            auditor
        } =
            createMocks();


        assert.equal(
            auditor.calculateStatus(NaN),
            "RED"
        );

        assert.equal(
            auditor.calculateStatus(null),
            "RED"
        );

    }
);


test(
    "31. calculateStatus respeta los límites",
    () => {

        const {
            auditor
        } =
            createMocks();


        assert.equal(
            auditor.calculateStatus(0.03),
            "GREEN"
        );

        assert.equal(
            auditor.calculateStatus(0.0301),
            "YELLOW"
        );

        assert.equal(
            auditor.calculateStatus(0.10),
            "YELLOW"
        );

        assert.equal(
            auditor.calculateStatus(0.1001),
            "RED"
        );

    }
);
