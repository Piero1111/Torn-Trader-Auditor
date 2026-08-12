
import test from "node:test";
import assert from "node:assert/strict";
import { Auditor } from "../../src/auditor/auditor.js";


function createHarness(overrides = {}) {

    const calls = {

        getItemArgs: [],
        getItemMarketArgs: [],
        getMarketplaceArgs: [],
        marketAnalyzerArgs: [],
        bazaarAnalyzerArgs: [],
        marketValueAnalyzerArgs: [],
        observedRatioArgs: [],
        updateArgs: [],
        getAuditArgs: [],
        saveAuditArgs: []
    };


    const marketAnalysis =
        overrides.marketAnalysis || {

            totalQuantity: 100,
            listingsCount: 2,
            targetQuantity: 10,
            requiredListings: 2,
            sampleSize: 2,
            sampleQuantity: 8,
            weightedMean: 980,
            weightedMedian: 1000,
            dispersion: 0.02,
            realMarketValue: 1000,
            confidence: 90,
            accumulatedQuantity: 8,
            sampleListingsCount: 2,
            sellerSampleSize: 2
        };


    const bazaarAnalysis =
        overrides.bazaarAnalysis === undefined

            ? {

                totalQuantity: 50,
                listingsCount: 2,
                traderCount: 2,
                minPrice: 790,
                maxPrice: 820,
                weightedMean: 805,
                weightedMedian: 800,
                dispersion: 0.02,
                priceDistribution: [],
                largestTraderQuantity: 30,
                largestTraderShare: 0.6,
                confidence: 70
            }

            : overrides.bazaarAnalysis;


    const marketValueAnalysis =
        overrides.marketValueAnalysis || {

            realMarketValue: 900,
            marketWeight: 0.6,
            bazaarWeight: 0.4,
            confidence: 80,

            signals: {

                marketValue: 1000,
                bazaarValue: 800
            }
        };


    const tornListings =
        overrides.tornListings || [

            { price: 990, amount: 3 },
            { price: 1010, quantity: 5 }
        ];


    const bazaarListings =
        overrides.bazaarListings === undefined

            ? [

                {
                    price: 790,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 820,
                    quantity: 40,
                    player_id: 2
                }
            ]

            : overrides.bazaarListings;


    const tornAPI = {

        async getItem(itemId) {

            calls.getItemArgs.push(
                itemId
            );


            if (overrides.getItemThrows) {

                throw overrides.getItemThrows;
            }


            return overrides.itemResponse || {

                items: [{

                    id: itemId,

                    name: "Item X",

                    value: {

                        market_price: 1000
                    }
                }]
            };
        },


        async getItemMarket(itemId) {

            calls.getItemMarketArgs.push(
                itemId
            );


            if (overrides.getItemMarketThrows) {

                throw overrides.getItemMarketThrows;
            }


            return overrides.marketResponse || {

                itemmarket: {

                    listings:
                        tornListings
                }
            };
        }
    };


    const w3bAPI = {

        async getMarketplace(itemId) {

            calls.getMarketplaceArgs.push(
                itemId
            );


            if (overrides.getMarketplaceThrows) {

                throw overrides.getMarketplaceThrows;
            }


            return overrides.marketplaceResponse || {

                listings:
                    bazaarListings,

                item_name:
                    "Item X",

                market_price:
                    810,

                bazaar_average:
                    805,

                generated_at:
                    123456
            };
        }
    };


    const marketAnalyzer = {

        analyze(listings) {

            calls.marketAnalyzerArgs.push(
                listings
            );


            if (overrides.marketAnalyzerThrows) {

                throw overrides.marketAnalyzerThrows;
            }


            return overrides.marketAnalyzerResult === undefined

                ? marketAnalysis

                : overrides.marketAnalyzerResult;
        }
    };


    const bazaarAnalyzer = {

        analyze(listings) {

            calls.bazaarAnalyzerArgs.push(
                listings
            );


            if (overrides.bazaarAnalyzerThrows) {

                throw overrides.bazaarAnalyzerThrows;
            }


            return bazaarAnalysis;
        }
    };


    const marketValueAnalyzer = {

        analyze(input) {

            calls.marketValueAnalyzerArgs.push(
                input
            );


            if (overrides.marketValueAnalyzerThrows) {

                throw overrides.marketValueAnalyzerThrows;
            }


            return overrides.marketValueAnalyzerResult === undefined

                ? marketValueAnalysis

                : overrides.marketValueAnalyzerResult;
        }
    };


    const ratioLearner = {

        calculateObservedRatio(
            buyPrice,
            itemValue
        ) {

            calls.observedRatioArgs.push([
                buyPrice,
                itemValue
            ]);


            if (
                overrides.observedRatioResult !==
                undefined
            ) {

                return overrides.observedRatioResult;
            }


            return buyPrice / itemValue;
        },


        update(
            previousLearnedRatio,
            observedRatio
        ) {

            calls.updateArgs.push([
                previousLearnedRatio,
                observedRatio
            ]);


            if (
                overrides.learnedRatioResult !==
                undefined
            ) {

                return overrides.learnedRatioResult;
            }


            return 0.8;
        }
    };


    const storage = {

        async getAudit(itemId) {

            calls.getAuditArgs.push(
                itemId
            );


            return overrides.previousAudit ===
                undefined

                ? {
                    learnedRatio: 0.7
                }

                : overrides.previousAudit;
        },


        async saveAudit(result) {

            calls.saveAuditArgs.push(
                result
            );

            return result;
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
            storage
        });


    return {

        auditor,
        calls,

        fixtures: {

            marketAnalysis,
            bazaarAnalysis,
            marketValueAnalysis,
            tornListings,
            bazaarListings
        }
    };
}


/*
 * =========================================================
 * VALIDACIÓN
 * =========================================================
 */

test(
    "1. item inexistente",
    async () => {

        const { auditor } =
            createHarness();


        await assert.rejects(

            auditor.audit(null),

            /No se recibió un artículo/
        );
    }
);


test(
    "1. itemId inválido",
    async () => {

        const { auditor } =
            createHarness();


        await assert.rejects(

            auditor.audit({

                itemId: "abc",
                name: "Item X",
                buyPrice: 100
            }),

            /ID de artículo inválido/
        );
    }
);


test(
    "1. buyPrice inválido",
    async () => {

        const { auditor } =
            createHarness();


        await assert.rejects(

            auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 0
            }),

            /Precio de compra W3B inválido/
        );
    }
);


/*
 * =========================================================
 * RATIO
 * =========================================================
 */

test(
    "2. Torn Item: item value + observedRatio + learnedRatio",
    async () => {

        const {
            auditor,
            calls
        } =
            createHarness();


        await auditor.audit({

            itemId: 10,
            name: "Item X",
            buyPrice: 800
        });


        assert.deepEqual(

            calls.observedRatioArgs[0],

            [800, 1000]
        );


        assert.deepEqual(

            calls.getAuditArgs,

            [10]
        );


        assert.deepEqual(

            calls.updateArgs[0],

            [0.7, 0.8]
        );
    }
);


/*
 * =========================================================
 * TORN ITEM MARKET
 * =========================================================
 */

test(
    "3. Torn Item Market: llamado con itemId",
    async () => {

        const {
            auditor,
            calls
        } =
            createHarness();


        await auditor.audit({

            itemId: 77,
            name: "Item X",
            buyPrice: 800
        });


        assert.deepEqual(

            calls.getItemMarketArgs,

            [77]
        );
    }
);


test(
    "3. Torn Item Market: normaliza quantity y amount",
    async () => {

        const {
            auditor,
            calls
        } =
            createHarness({

                tornListings: [

                    {
                        price: 1000,
                        quantity: 4
                    },

                    {
                        price: 1010,
                        amount: 6
                    }
                ]
            });


        await auditor.audit({

            itemId: 1,
            name: "Item X",
            buyPrice: 800
        });


        const normalized =
            calls.marketAnalyzerArgs[0];


        assert.equal(
            normalized[0].quantity,
            4
        );


        assert.equal(
            normalized[1].quantity,
            6
        );
    }
);


test(
    "3. Torn Item Market: mercado vacío rechaza",
    async () => {

        const { auditor } =
            createHarness({

                marketResponse: {

                    itemmarket: {

                        listings: []
                    }
                }
            });


        await assert.rejects(

            auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            }),

            /No hay vendedores disponibles en el Item Market de Torn/
        );
    }
);


/*
 * =========================================================
 * MARKET ANALYZER
 * =========================================================
 */

test(
    "4. MarketAnalyzer: recibe listings y persiste result.market",
    async () => {

        const {
            auditor,
            calls,
            fixtures
        } =
            createHarness();


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.equal(
            calls.marketAnalyzerArgs.length,
            1
        );


        assert.deepEqual(

            result.market.realMarketValue,

            fixtures.marketAnalysis.realMarketValue
        );
    }
);


/*
 * =========================================================
 * W3B MARKETPLACE
 * =========================================================
 */

test(
    "5. W3B Marketplace: llamado con itemId y listings obtenidos",
    async () => {

        const {
            auditor,
            calls,
            fixtures
        } =
            createHarness();


        await auditor.audit({

            itemId: 90,
            name: "Item X",
            buyPrice: 800
        });


        assert.deepEqual(

            calls.getMarketplaceArgs,

            [90]
        );


        assert.strictEqual(

            calls.bazaarAnalyzerArgs[0],

            fixtures.bazaarListings
        );
    }
);


test(
    "5. W3B Marketplace: sin bazares continúa con market",
    async () => {

        const { auditor } =
            createHarness({

                marketplaceResponse: {

                    listings: [],

                    item_name:
                        "Item X",

                    market_price:
                        810,

                    bazaar_average:
                        805,

                    generated_at:
                        123456
                }
            });


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.ok(
            result.market
        );


        assert.equal(
            result.bazaars,
            null
        );
    }
);


test(
    "6. BazaarAnalyzer opcional: error no destruye auditoría",
    async () => {

        const { auditor } =
            createHarness({

                bazaarAnalyzerThrows:
                    new Error(
                        "bazaar exploded"
                    )
            });


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.ok(
            result.market
        );


        assert.equal(
            result.bazaars,
            null
        );
    }
);


/*
 * =========================================================
 * MARKET VALUE ANALYZER
 * =========================================================
 */

test(
    "7. MarketValueAnalyzer: input exacto y salida persistida",
    async () => {

        const {
            auditor,
            calls,
            fixtures
        } =
            createHarness();


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.deepEqual(

            calls.marketValueAnalyzerArgs[0],

            {

                market:
                    fixtures.marketAnalysis,

                bazaars:
                    fixtures.bazaarAnalysis
            }
        );


        assert.deepEqual(

            result.marketValueAnalysis,

            fixtures.marketValueAnalysis
        );
    }
);


/*
 * =========================================================
 * CRITICAL PRICE TEST
 * =========================================================
 */

test(
    "8. CRÍTICA: correctBuyPrice usa marketValueAnalysis.realMarketValue",
    async () => {

        const {
            auditor
        } =
            createHarness({

                marketAnalysis: {

                    totalQuantity: 100,
                    listingsCount: 2,
                    targetQuantity: 10,
                    requiredListings: 2,
                    sampleSize: 2,
                    sampleQuantity: 8,
                    weightedMean: 980,
                    weightedMedian: 1000,
                    dispersion: 0.02,
                    realMarketValue: 1000,
                    confidence: 90,
                    accumulatedQuantity: 8,
                    sampleListingsCount: 2,
                    sellerSampleSize: 2
                },


                marketValueAnalysis: {

                    realMarketValue: 800,

                    marketWeight:
                        0.5,

                    bazaarWeight:
                        0.5,

                    confidence:
                        80,

                    signals: {}
                },


                learnedRatioResult:
                    0.8
            });


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.equal(

            result.correctBuyPrice,

            640
        );
    }
);


/*
 * =========================================================
 * DIFFERENCE / STATUS
 * =========================================================
 *
 * IMPORTANTE:
 *
 * MarketValueAnalysis = 1000
 * Learned Ratio       = 0.8
 * Correct Buy Price   = 800
 * Buy Price           = 800
 *
 * Por lo tanto:
 *
 * Difference = 0
 * Status     = GREEN
 */

test(
    "9-10. difference/status/confidence/timestamp/saveAudit exacto",
    async () => {

        const {
            auditor,
            calls,
            fixtures
        } =
            createHarness({

                marketAnalysis: {

                    totalQuantity: 100,
                    listingsCount: 2,
                    targetQuantity: 10,
                    requiredListings: 2,
                    sampleSize: 2,
                    sampleQuantity: 8,
                    weightedMean: 980,
                    weightedMedian: 1000,
                    dispersion: 0.02,
                    realMarketValue: 1000,
                    confidence: 73,
                    accumulatedQuantity: 8,
                    sampleListingsCount: 2,
                    sellerSampleSize: 2
                },


                /*
                 * NUEVO:
                 *
                 * El precio correcto ahora depende de
                 * MarketValueAnalyzer.
                 */

                marketValueAnalysis: {

                    realMarketValue: 1000,

                    marketWeight:
                        0.6,

                    bazaarWeight:
                        0.4,

                    confidence:
                        80,

                    signals: {

                        marketValue:
                            1000,

                        bazaarValue:
                            1000
                    }
                },


                learnedRatioResult:
                    0.8
            });


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item X",
                buyPrice: 800
            });


        assert.equal(

            result.correctBuyPrice,

            800
        );


        assert.equal(

            result.differencePercent,

            0
        );


        assert.equal(

            result.status,

            "GREEN"
        );


        assert.equal(

            result.confidence,

            fixtures.marketAnalysis.confidence
        );


        assert.ok(

            Number.isFinite(
                result.timestamp
            )
        );


        assert.equal(

            calls.saveAuditArgs.length,

            1
        );


        assert.strictEqual(

            calls.saveAuditArgs[0],

            result
        );
    }
);
