import test from "node:test";
import assert from "node:assert/strict";

import { Auditor } from "../../src/auditor/auditor.js";

test(
"Auditor integra PriceProposal con los datos de la auditoría",
async () => {


    const calls = {
        priceProposalArgs: null
    };


    const marketAnalysis = {

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

        confidence: 85,

        accumulatedQuantity: 8,

        sampleListingsCount: 2,

        sellerSampleSize: 2
    };


    const bazaarAnalysis = {

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
    };


    const marketValueAnalysis = {

        realMarketValue: 700,

        marketWeight: 0.6,

        bazaarWeight: 0.4,

        confidence: 85,

        signals: {

            marketValue: 1000,

            bazaarValue: 800
        }
    };


    const internalPrice = {

        itemId: 1,

        itemName: "Xanax",

        internalMarketValue: 1000,

        recommendedBuyPrice: 800,

        learnedRatio: 0.8,

        confidence: 80,

        observations: 5
    };


    const tornAPI = {

        async getItem(itemId) {

            return {

                items: [{

                    id: itemId,

                    name: "Xanax",

                    value: {

                        market_price: 1000
                    }
                }]
            };
        },


        async getItemMarket() {

            return {

                itemmarket: {

                    listings: [

                        {
                            price: 990,
                            amount: 3
                        },

                        {
                            price: 1010,
                            quantity: 5
                        }
                    ]
                }
            };
        }
    };


    const w3bAPI = {

        async getMarketplace() {

            return {

                listings: [

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
                ],

                item_name: "Xanax",

                market_price: 810,

                bazaar_average: 805,

                generated_at: 123456
            };
        }
    };


    const marketAnalyzer = {

        analyze() {

            return marketAnalysis;
        }
    };


    const bazaarAnalyzer = {

        analyze() {

            return bazaarAnalysis;
        }
    };


    const marketValueAnalyzer = {

        analyze(input) {

            assert.deepEqual(
                input,
                {
                    market:
                        marketAnalysis,

                    bazaars:
                        bazaarAnalysis
                }
            );

            return marketValueAnalysis;
        }
    };


    const ratioLearner = {

        calculateObservedRatio(
            buyPrice,
            itemValue
        ) {

            return (
                buyPrice /
                itemValue
            );
        },


        update(
            previousLearnedRatio,
            observedRatio
        ) {

            return 0.8;
        }
    };


    const storage = {

        async getAudit() {

            return {

                learnedRatio: 0.8
            };
        },


        async saveAudit(result) {

            return result;
        },


        async getInternalPrice() {

            return internalPrice;
        },


        async saveInternalPrice(result) {

            return result;
        }
    };


    /*
     * =====================================================
     * PRICE PROPOSAL
     * =====================================================
     *
     * Todavía no usamos la implementación real aquí.
     *
     * El test define el contrato que Auditor deberá cumplir.
     */

    const priceProposal = {

        generate(input) {

            calls.priceProposalArgs =
                input;


            return {

                itemId:
                    input.itemId,

                itemName:
                    input.itemName,

                currentInternalPrice:
                    input.internalMarketValue,

                observedMarketValue:
                    input.realMarketValue,

                difference:
                    input.realMarketValue -
                    input.internalMarketValue,

                differencePercent:
                    (
                        input.realMarketValue -
                        input.internalMarketValue
                    ) /
                    input.internalMarketValue,

                recommendedBuyPrice:
                    Math.round(
                        input.realMarketValue *
                        input.learnedRatio
                    ),

                confidence:
                    input.confidence,

                updateAvailable:
                    true,

                status:
                    "UPDATE_AVAILABLE"
            };
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

            priceProposal
        });


    const result =
        await auditor.audit({

            itemId: 1,

            name: "Xanax",

            buyPrice: 800
        });


    /*
     * =====================================================
     * 1. PRICE PROPOSAL RECIBIÓ LOS DATOS CORRECTOS
     * =====================================================
     */

    assert.deepEqual(

        calls.priceProposalArgs,

        {

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue:
                internalPrice.internalMarketValue,

            realMarketValue:
                marketValueAnalysis.realMarketValue,

            learnedRatio: 0.8,

            confidence:
                marketValueAnalysis.confidence
        }
    );


    /*
     * =====================================================
     * 2. RESULTADO CONTIENE PRICE PROPOSAL
     * =====================================================
     */

    assert.ok(
        result.priceProposal
    );


    /*
     * =====================================================
     * 3. VALORES DE LA PROPUESTA
     * =====================================================
     */

    assert.equal(

        result.priceProposal.currentInternalPrice,

        1000
    );


    assert.equal(

        result.priceProposal.observedMarketValue,

        700
    );


    assert.equal(

        result.priceProposal.difference,

        -300
    );


    assert.equal(

        result.priceProposal.differencePercent,

        -0.3
    );


    assert.equal(

        result.priceProposal.recommendedBuyPrice,

        560
    );


    assert.equal(

        result.priceProposal.confidence,

        85
    );


    assert.equal(

        result.priceProposal.updateAvailable,

        true
    );


    assert.equal(

        result.priceProposal.status,

        "UPDATE_AVAILABLE"
    );
}


);
