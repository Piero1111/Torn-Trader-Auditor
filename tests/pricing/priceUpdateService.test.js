
import test from "node:test";
import assert from "node:assert/strict";

import {
    PriceUpdateService
} from "../../src/data/priceUpdateService.js";


test(
    "1. acepta propuesta y actualiza precio interno",
    async () => {

        const calls = {
            update: null
        };


        const internalPriceList = {

            async update(input) {

                calls.update =
                    input;

                return {

                    itemId:
                        input.itemId,

                    itemName:
                        input.itemName,

                    internalMarketValue:
                        900,

                    recommendedBuyPrice:
                        720,

                    learnedRatio:
                        0.8,

                    confidence:
                        85,

                    observations:
                        6,

                    updatedAt:
                        123456
                };
            }
        };


        const service =
            new PriceUpdateService({

                internalPriceList
            });


        const proposal = {

            itemId: 1,

            itemName: "Xanax",

            currentInternalPrice:
                1000,

            observedMarketValue:
                700,

            difference:
                -300,

            differencePercent:
                -0.3,

            recommendedBuyPrice:
                560,

            learnedRatio:
                0.8,

            confidence:
                85,

            updateAvailable:
                true,

            status:
                "UPDATE_AVAILABLE"
        };


        const result =
            await service.accept(
                proposal
            );


        assert.deepEqual(
            calls.update,
            {

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 700,

                learnedRatio: 0.8,

                confidence: 85
            }
        );


        assert.equal(
            result.updated,
            true
        );


        assert.equal(
            result.itemId,
            1
        );


        assert.equal(
            result.itemName,
            "Xanax"
        );


        assert.equal(
            result.previousInternalMarketValue,
            1000
        );


        assert.equal(
            result.observedMarketValue,
            700
        );


        assert.equal(
            result.newInternalMarketValue,
            900
        );


        assert.equal(
            result.recommendedBuyPrice,
            720
        );


        assert.equal(
            result.learnedRatio,
            0.8
        );


        assert.equal(
            result.confidence,
            85
        );


        assert.equal(
            result.observations,
            6
        );


        assert.equal(
            result.updatedAt,
            123456
        );
    }
);


test(
    "2. rechaza propuesta sin updateAvailable",
    async () => {

        const internalPriceList = {

            async update() {

                throw new Error(
                    "No debería ejecutarse."
                );
            }
        };


        const service =
            new PriceUpdateService({

                internalPriceList
            });


        const proposal = {

            itemId: 1,

            itemName: "Xanax",

            currentInternalPrice:
                1000,

            observedMarketValue:
                1050,

            learnedRatio:
                0.8,

            confidence:
                85,

            updateAvailable:
                false,

            status:
                "NO_UPDATE"
        };


        await assert.rejects(

            () =>
                service.accept(
                    proposal
                ),

            {
                message:
                    "La propuesta no está disponible para actualización."
            }
        );
    }
);


test(
    "3. rechaza propuesta inexistente",
    async () => {

        const service =
            new PriceUpdateService({

                internalPriceList: {

                    async update() {

                        return {};
                    }
                }
            });


        await assert.rejects(

            () =>
                service.accept(
                    null
                ),

            {
                message:
                    "No se recibió una propuesta de precio."
            }
        );
    }
);


test(
    "4. rechaza itemId inválido",
    async () => {

        const service =
            new PriceUpdateService({

                internalPriceList: {

                    async update() {

                        return {};
                    }
                }
            });


        const proposal = {

            itemId: 0,

            itemName: "Xanax",

            observedMarketValue:
                700,

            learnedRatio:
                0.8,

            confidence:
                85,

            currentInternalPrice:
                1000,

            updateAvailable:
                true
        };


        await assert.rejects(

            () =>
                service.accept(
                    proposal
                ),

            {
                message:
                    "ID de artículo inválido."
            }
        );
    }
);


test(
    "5. rechaza InternalPriceList no disponible",
    async () => {

        const service =
            new PriceUpdateService({});


        const proposal = {

            itemId: 1,

            itemName: "Xanax",

            observedMarketValue:
                700,

            learnedRatio:
                0.8,

            confidence:
                85,

            updateAvailable:
                true
        };


        await assert.rejects(

            () =>
                service.accept(
                    proposal
                ),

            {
                message:
                    "InternalPriceList no está disponible."
            }
        );
    }
);
