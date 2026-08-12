
import test from "node:test";
import assert from "node:assert/strict";
import { Auditor } from "../../src/auditor/auditor.js";


test(
    "Auditor utiliza marketValueAnalysis para calcular correctBuyPrice",
    async () => {

        const marketAnalysis = {

            totalQuantity: 100,
            listingsCount: 2,
            targetQuantity: 10,
            requiredListings: 2,
            sampleSize: 2,
            sampleQuantity: 5,
            weightedMean: 950,
            weightedMedian: 900,
            dispersion: 0.05,
            realMarketValue: 500,
            confidence: 85,
            accumulatedQuantity: 5,
            sampleListingsCount: 2,
            sellerSampleSize: 2
        };


        const bazaarAnalysis = {

            totalQuantity: 40,
            listingsCount: 2,
            traderCount: 2,
            minPrice: 480,
            maxPrice: 520,
            weightedMean: 510,
            weightedMedian: 500,
            dispersion: 0.02,
            priceDistribution: [],
            largestTraderQuantity: 25,
            largestTraderShare: 0.625,
            confidence: 60
        };


        const calls = {

            marketValueInput:
                null
        };


        const auditor =
            new Auditor({

                tornAPI: {

                    async getItem() {

                        return {

                            items: [{

                                id: 1,

                                name:
                                    "Item",

                                value: {

                                    market_price:
                                        1000
                                }
                            }]
                        };
                    },


                    async getItemMarket() {

                        return {

                            itemmarket: {

                                listings: [

                                    {
                                        price: 900,
                                        amount: 2
                                    },

                                    {
                                        price: 950,
                                        amount: 3
                                    }
                                ]
                            }
                        };
                    }
                },


                w3bAPI: {

                    async getMarketplace() {

                        return {

                            listings: [

                                {
                                    price: 500,
                                    quantity: 10,
                                    player_id: 1
                                },

                                {
                                    price: 520,
                                    quantity: 30,
                                    player_id: 2
                                }
                            ],

                            item_name:
                                "Item",

                            market_price:
                                505,

                            bazaar_average:
                                510,

                            generated_at:
                                123
                        };
                    }
                },


                marketAnalyzer: {

                    analyze() {

                        return marketAnalysis;
                    }
                },


                bazaarAnalyzer: {

                    analyze() {

                        return bazaarAnalysis;
                    }
                },


                marketValueAnalyzer: {

                    analyze(input) {

                        calls.marketValueInput =
                            input;


                        return {

                            realMarketValue:
                                505,

                            marketWeight:
                                0.55,

                            bazaarWeight:
                                0.45,

                            confidence:
                                77,

                            signals: {

                                marketValue:
                                    500,

                                bazaarValue:
                                    510
                            }
                        };
                    }
                },


                ratioLearner: {

                    calculateObservedRatio() {

                        return 0.8;
                    },


                    update() {

                        return 0.8;
                    }
                },


                storage: {

                    async getAudit() {

                        return {

                            learnedRatio:
                                0.7
                        };
                    },


                    async saveAudit(result) {

                        return result;
                    }
                }
            });


        const result =
            await auditor.audit({

                itemId: 1,
                name: "Item",
                buyPrice: 800
            });


        /*
         * =====================================================
         * VERIFICAR INPUT DEL MARKET VALUE ANALYZER
         * =====================================================
         */

        assert.deepEqual(

            calls.marketValueInput,

            {

                market:
                    marketAnalysis,

                bazaars:
                    bazaarAnalysis
            }
        );


        /*
         * =====================================================
         * VERIFICAR RESULTADO
         * =====================================================
         */

        assert.ok(
            result.marketValueAnalysis
        );


        assert.equal(

            result.marketValueAnalysis
                .realMarketValue,

            505
        );


        /*
         * =====================================================
         * VERIFICAR NUEVO PRECIO CORRECTO
         * =====================================================
         *
         * Market Value real = 505
         * Learned Ratio     = 0.8
         *
         * Correct Buy Price =
         *
         *     505 × 0.8
         *     = 404
         */

        assert.equal(

            result.correctBuyPrice,

            404
        );
    }
);
