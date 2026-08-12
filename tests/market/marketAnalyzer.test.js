
import test from "node:test";
import assert from "node:assert/strict";

import { MarketAnalyzer } from "../../src/market/marketAnalyzer.js";


function createAnalyzer(samplePercentage = 0.10) {

    return new MarketAnalyzer(
        samplePercentage
    );
}


/*
 * =========================================================
 *
 * 1. ANALIZA LISTINGS VÁLIDOS
 *
 * =========================================================
 */

test(
    "1. analiza correctamente un mercado con listings válidos",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 110,
                    quantity: 10
                },

                {
                    price: 120,
                    quantity: 10
                },

                {
                    price: 130,
                    quantity: 10
                },

                {
                    price: 140,
                    quantity: 10
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.totalQuantity,
            50
        );


        assert.equal(
            result.listingsCount,
            5
        );


        assert.equal(
            result.targetQuantity,
            5
        );


        assert.equal(
            result.requiredListings,
            1
        );


        assert.equal(
            result.sampleListingsCount,
            1
        );


        assert.equal(
            result.sellerSampleSize,
            5
        );


        assert.equal(
            result.sampleQuantity,
            50
        );
    }
);


/*
 * =========================================================
 *
 * 2. ORDENA POR PRECIO
 *
 * =========================================================
 */

test(
    "2. ordena los listings desde el precio más barato",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 500,
                    quantity: 10,
                    player_id: 3
                },

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 300,
                    quantity: 10,
                    player_id: 2
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.sampleListings[0].price,
            100
        );


        assert.equal(
            result.sampleListings[1].price,
            300
        );


        assert.equal(
            result.sampleListings[2].price,
            500
        );
    }
);


/*
 * =========================================================
 *
 * 3. FILTRA LISTINGS INVÁLIDOS
 *
 * =========================================================
 */

test(
    "3. ignora listings con precio o cantidad inválidos",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 0,
                    quantity: 10
                },

                {
                    price: -50,
                    quantity: 10
                },

                {
                    price: 200,
                    quantity: 0
                },

                {
                    price: 300,
                    quantity: -5
                },

                {
                    price: "400",
                    quantity: "10"
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.listingsCount,
            2
        );


        assert.equal(
            result.totalQuantity,
            20
        );
    }
);


/*
 * =========================================================
 *
 * 4. ARRAY VACÍO
 *
 * =========================================================
 */

test(
    "4. devuelve null cuando no existen listings",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([]);


        assert.equal(
            result,
            null
        );
    }
);


/*
 * =========================================================
 *
 * 5. INPUT NO VÁLIDO
 *
 * =========================================================
 */

test(
    "5. devuelve null cuando rawListings no es un array",
    () => {

        const analyzer =
            createAnalyzer();


        assert.equal(
            analyzer.analyze(null),
            null
        );


        assert.equal(
            analyzer.analyze(undefined),
            null
        );


        assert.equal(
            analyzer.analyze({}),
            null
        );
    }
);


/*
 * =========================================================
 *
 * 6. CALCULA CANTIDAD TOTAL
 *
 * =========================================================
 */

test(
    "6. calcula correctamente la cantidad total del mercado",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 5
                },

                {
                    price: 200,
                    quantity: 15
                },

                {
                    price: 300,
                    quantity: 30
                }
            ]);


        assert.equal(
            result.totalQuantity,
            50
        );
    }
);


/*
 * =========================================================
 *
 * 7. ENCUENTRA VENDEDORES QUE CUBREN EL TARGET
 *
 * =========================================================
 */

test(
    "7. encuentra correctamente los vendedores que cubren el target",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 2
                },

                {
                    price: 110,
                    quantity: 3
                },

                {
                    price: 120,
                    quantity: 5
                },

                {
                    price: 130,
                    quantity: 10
                }
            ]);


        /*
         * Total = 20
         *
         * Target = 2
         *
         * El primer vendedor ya cubre
         * el target.
         */

        assert.equal(
            result.targetQuantity,
            2
        );


        assert.equal(
            result.requiredListings,
            1
        );


        assert.equal(
            result.accumulatedQuantity,
            2
        );
    }
);


/*
 * =========================================================
 *
 * 8. SELLER SAMPLE SIZE
 *
 * =========================================================
 */

test(
    "8. utiliza al menos cinco vendedores cuando existen suficientes",
    () => {

        const analyzer =
            createAnalyzer();


        const listings = [];


        for (
            let i = 0;
            i < 20;
            i++
        ) {

            listings.push({

                price:
                    100 + i,

                quantity:
                    10
            });
        }


        const result =
            analyzer.analyze(
                listings
            );


        assert.equal(
            result.sellerSampleSize,
            5
        );


        assert.equal(
            result.sampleSize,
            5
        );


        assert.equal(
            result.sampleListings.length,
            5
        );
    }
);


/*
 * =========================================================
 *
 * 9. SAMPLE QUANTITY
 *
 * =========================================================
 */

test(
    "9. sampleQuantity corresponde a los vendedores seleccionados",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 4
                },

                {
                    price: 110,
                    quantity: 6
                },

                {
                    price: 120,
                    quantity: 20
                },

                {
                    price: 130,
                    quantity: 30
                },

                {
                    price: 140,
                    quantity: 40
                }
            ]);


        assert.equal(
            result.sampleQuantity,
            100
        );


        assert.equal(
            result.sellerSampleSize,
            5
        );
    }
);


/*
 * =========================================================
 *
 * 10. MEDIA PONDERADA
 *
 * =========================================================
 */

test(
    "10. calcula correctamente la media ponderada",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 200,
                    quantity: 10
                },

                {
                    price: 300,
                    quantity: 10
                },

                {
                    price: 400,
                    quantity: 10
                },

                {
                    price: 500,
                    quantity: 10
                }
            ]);


        assert.equal(
            result.weightedMean,
            300
        );
    }
);


/*
 * =========================================================
 *
 * 11. MEDIANA PONDERADA
 *
 * =========================================================
 */

test(
    "11. calcula correctamente la mediana ponderada",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 200,
                    quantity: 10
                },

                {
                    price: 300,
                    quantity: 10
                },

                {
                    price: 400,
                    quantity: 10
                },

                {
                    price: 500,
                    quantity: 10
                }
            ]);


        assert.equal(
            result.weightedMedian,
            300
        );
    }
);


/*
 * =========================================================
 *
 * 12. REAL MARKET VALUE CON BAJA DISPERSIÓN
 *
 * =========================================================
 */

test(
    "12. utiliza la media y mediana cuando la dispersión es baja",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 110,
                    quantity: 10
                },

                {
                    price: 110,
                    quantity: 10
                },

                {
                    price: 120,
                    quantity: 10
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.weightedMean,
            108
        );


        assert.equal(
            result.weightedMedian,
            110
        );


        assert.ok(
            result.dispersion <= 0.15
        );


        assert.equal(
            result.realMarketValue,
            109
        );
    }
);


/*
 * =========================================================
 *
 * 13. REAL MARKET VALUE CON ALTA DISPERSIÓN
 *
 * =========================================================
 */

test(
    "13. utiliza la mediana cuando la dispersión es alta",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 1000,
                    quantity: 10
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.weightedMean,
            280
        );


        assert.equal(
            result.weightedMedian,
            100
        );


        assert.ok(
            result.dispersion > 0.15
        );


        assert.equal(
            result.realMarketValue,
            100
        );
    }
);


/*
 * =========================================================
 *
 * 14. CONSERVA INFORMACIÓN DEL VENDEDOR
 *
 * =========================================================
 */

test(
    "14. conserva la información importante de los vendedores seleccionados",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    uid: "abc",
                    player_id: 123,
                    player_name: "TraderOne",
                    price: 100,
                    quantity: 10,
                    content_updated: 111,
                    last_checked: 222
                },

                {
                    uid: "def",
                    player_id: 456,
                    player_name: "TraderTwo",
                    price: 110,
                    quantity: 10,
                    content_updated: 333,
                    last_checked: 444
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.sampleListings[0].uid,
            "abc"
        );


        assert.equal(
            result.sampleListings[0].playerId,
            123
        );


        assert.equal(
            result.sampleListings[0].playerName,
            "TraderOne"
        );


        assert.equal(
            result.sampleListings[0].price,
            100
        );


        assert.equal(
            result.sampleListings[0].quantity,
            10
        );


        assert.equal(
            result.sampleListings[0].contentUpdated,
            111
        );


        assert.equal(
            result.sampleListings[0].lastChecked,
            222
        );
    }
);


/*
 * =========================================================
 *
 * 15. CONFIGURACIÓN DE SAMPLE PERCENTAGE
 *
 * =========================================================
 */

test(
    "15. acepta un porcentaje de muestra válido",
    () => {

        const analyzer =
            createAnalyzer(0.20);


        assert.equal(
            analyzer.samplePercentage,
            0.20
        );
    }
);


/*
 * =========================================================
 *
 * 16. CONFIGURACIÓN INVÁLIDA
 *
 * =========================================================
 */

test(
    "16. utiliza 10% cuando samplePercentage es inválido",
    () => {

        assert.equal(
            createAnalyzer(0).samplePercentage,
            0.10
        );


        assert.equal(
            createAnalyzer(-0.5).samplePercentage,
            0.10
        );


        assert.equal(
            createAnalyzer(1.5).samplePercentage,
            0.10
        );


        assert.equal(
            createAnalyzer("abc").samplePercentage,
            0.10
        );
    }
);


/*
 * =========================================================
 *
 * 17. CONFIANZA
 *
 * =========================================================
 */

test(
    "17. calculateConfidence devuelve un valor entre 0 y 100",
    () => {

        const analyzer =
            createAnalyzer();


        const confidence =
            analyzer.calculateConfidence({

                totalQuantity: 10000,

                sampleQuantity: 1000,

                listingsCount: 50,

                sampleListingsCount: 20,

                sellerSampleSize: 10,

                dispersion: 0.02
            });


        assert.ok(
            Number.isFinite(
                confidence
            )
        );


        assert.ok(
            confidence >= 0
        );


        assert.ok(
            confidence <= 100
        );


        assert.equal(
            confidence,
            100
        );
    }
);


/*
 * =========================================================
 *
 * 18. PENALIZACIÓN POR MUESTRA PEQUEÑA
 *
 * =========================================================
 */

test(
    "18. penaliza la confianza cuando la muestra de vendedores es muy pequeña",
    () => {

        const analyzer =
            createAnalyzer();


        const confidenceOneSeller =
            analyzer.calculateConfidence({

                totalQuantity: 10000,

                sampleQuantity: 1000,

                listingsCount: 50,

                sampleListingsCount: 1,

                sellerSampleSize: 1,

                dispersion: 0.02
            });


        const confidenceManySellers =
            analyzer.calculateConfidence({

                totalQuantity: 10000,

                sampleQuantity: 1000,

                listingsCount: 50,

                sampleListingsCount: 20,

                sellerSampleSize: 10,

                dispersion: 0.02
            });


        assert.ok(
            confidenceOneSeller <
            confidenceManySellers
        );
    }
);


/*
 * =========================================================
 *
 * 19. SAMPLE LISTINGS SON LOS MÁS BARATOS
 *
 * =========================================================
 */

test(
    "19. la muestra final contiene los vendedores más baratos",
    () => {

        const analyzer =
            createAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 500,
                    quantity: 10
                },

                {
                    price: 400,
                    quantity: 10
                },

                {
                    price: 300,
                    quantity: 10
                },

                {
                    price: 200,
                    quantity: 10
                },

                {
                    price: 100,
                    quantity: 10
                },

                {
                    price: 600,
                    quantity: 10
                },

                {
                    price: 700,
                    quantity: 10
                }
            ]);


        assert.deepEqual(

            result.sampleListings.map(
                listing =>
                    listing.price
            ),

            [
                100,
                200,
                300,
                400,
                500
            ]
        );
    }
);
