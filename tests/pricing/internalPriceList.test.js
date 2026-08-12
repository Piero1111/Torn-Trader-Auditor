
import test from "node:test";
import assert from "node:assert/strict";

import { InternalPriceList } from "../../src/data/internalPriceList.js";


function createStorage(initialPrice = null) {

    let internalPrice =
        initialPrice;

    const calls = {
        getInternalPrice: [],
        saveInternalPrice: []
    };


    const storage = {

        async getInternalPrice(itemId) {

            calls.getInternalPrice.push(
                itemId
            );

            return internalPrice;
        },


        async saveInternalPrice(price) {

            calls.saveInternalPrice.push(
                price
            );

            internalPrice =
                price;

            return price;
        }
    };


    return {
        storage,
        calls
    };
}


/*
 * =========================================================
 * 1. OBTENER PRECIO EXISTENTE
 * =========================================================
 */

test(
    "1. obtiene precio interno existente",
    async () => {

        const existing = {

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            recommendedBuyPrice: 800,

            learnedRatio: 0.8,

            confidence: 85,

            observations: 5
        };


        const { storage, calls } =
            createStorage(existing);


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.get(1);


        assert.strictEqual(
            result,
            existing
        );


        assert.deepEqual(
            calls.getInternalPrice,
            [1]
        );
    }
);


/*
 * =========================================================
 * 2. ITEM ID INVÁLIDO
 * =========================================================
 */

test(
    "2. rechaza itemId inválido",
    async () => {

        const { storage } =
            createStorage();


        const priceList =
            new InternalPriceList(
                storage
            );


        await assert.rejects(

            priceList.get("abc"),

            /ID de artículo inválido/
        );
    }
);


/*
 * =========================================================
 * 3. CREAR PRECIO INICIAL
 * =========================================================
 */

test(
    "3. crea precio interno inicial",
    async () => {

        const { storage, calls } =
            createStorage();


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.initialize({

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 1000,

                learnedRatio: 0.8,

                confidence: 85
            });


        assert.equal(
            result.itemId,
            1
        );


        assert.equal(
            result.itemName,
            "Xanax"
        );


        assert.equal(
            result.internalMarketValue,
            1000
        );


        assert.equal(
            result.recommendedBuyPrice,
            800
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
            1
        );


        assert.ok(
            Number.isFinite(
                result.updatedAt
            )
        );


        assert.equal(
            calls.saveInternalPrice.length,
            1
        );
    }
);


/*
 * =========================================================
 * 4. NO REINICIALIZAR
 * =========================================================
 */

test(
    "4. initialize no sobrescribe precio existente",
    async () => {

        const existing = {

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            recommendedBuyPrice: 800,

            learnedRatio: 0.8,

            confidence: 85,

            observations: 5,

            updatedAt: 123
        };


        const { storage, calls } =
            createStorage(existing);


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.initialize({

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 2000,

                learnedRatio: 0.5,

                confidence: 20
            });


        assert.strictEqual(
            result,
            existing
        );


        assert.equal(
            calls.saveInternalPrice.length,
            0
        );
    }
);


/*
 * =========================================================
 * 5. ACTUALIZAR PRECIO
 * =========================================================
 */

test(
    "5. update combina precio anterior con nueva observación",
    async () => {

        const existing = {

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            recommendedBuyPrice: 800,

            learnedRatio: 0.8,

            confidence: 80,

            observations: 1,

            updatedAt: 123
        };


        const { storage } =
            createStorage(existing);


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.update({

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 1100,

                learnedRatio: 0.75,

                confidence: 90
            });


        /*
         * Promedio:
         *
         * (1000 × 1 + 1100) / 2
         *
         * = 1050
         */

        assert.equal(
            result.internalMarketValue,
            1050
        );


        assert.equal(
            result.recommendedBuyPrice,
            788
        );


        assert.equal(
            result.learnedRatio,
            0.75
        );


        assert.equal(
            result.confidence,
            90
        );


        assert.equal(
            result.observations,
            2
        );
    }
);


/*
 * =========================================================
 * 6. NUEVO ITEM MEDIANTE UPDATE
 * =========================================================
 */

test(
    "6. update inicializa artículo inexistente",
    async () => {

        const { storage } =
            createStorage();


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.update({

                itemId: 10,

                itemName: "Item X",

                realMarketValue: 500,

                learnedRatio: 0.8,

                confidence: 70
            });


        assert.equal(
            result.itemId,
            10
        );


        assert.equal(
            result.internalMarketValue,
            500
        );


        assert.equal(
            result.recommendedBuyPrice,
            400
        );


        assert.equal(
            result.observations,
            1
        );
    }
);


/*
 * =========================================================
 * 7. RATIO FALTANTE
 * =========================================================
 */

test(
    "7. conserva ratio anterior si nueva observación no tiene ratio",
    async () => {

        const existing = {

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            recommendedBuyPrice: 800,

            learnedRatio: 0.8,

            confidence: 80,

            observations: 2,

            updatedAt: 123
        };


        const { storage } =
            createStorage(existing);


        const priceList =
            new InternalPriceList(
                storage
            );


        const result =
            await priceList.update({

                itemId: 1,

                itemName: "Xanax",

                realMarketValue: 1200,

                learnedRatio: NaN,

                confidence: 85
            });


        assert.equal(
            result.learnedRatio,
            0.8
        );


        assert.equal(
            result.internalMarketValue,
            1067
        );


        assert.equal(
            result.recommendedBuyPrice,
            854
        );
    }
);
