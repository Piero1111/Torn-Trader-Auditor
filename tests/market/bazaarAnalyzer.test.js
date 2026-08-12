
import test from "node:test";
import assert from "node:assert/strict";

import { BazaarAnalyzer } from "../../src/market/bazaarAnalyzer.js";


/*
 * =========================================================
 * DATOS BASE
 * =========================================================
 */

function createListings() {

    return [

        {
            price: 790,
            quantity: 10,
            player_id: 1,
            player_name: "TraderA"
        },

        {
            price: 800,
            quantity: 20,
            player_id: 2,
            player_name: "TraderB"
        },

        {
            price: 810,
            quantity: 15,
            player_id: 3,
            player_name: "TraderC"
        },

        {
            price: 820,
            quantity: 5,
            player_id: 2,
            player_name: "TraderB"
        }
    ];
}


/*
 * =========================================================
 * 1. ANÁLISIS BÁSICO
 * =========================================================
 */

test(
    "1. analiza correctamente un bazaar con listings válidos",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze(
                createListings()
            );


        assert.ok(result);


        assert.equal(
            result.totalQuantity,
            50
        );


        assert.equal(
            result.listingsCount,
            4
        );


        assert.equal(
            result.traderCount,
            3
        );


        assert.equal(
            result.minPrice,
            790
        );


        assert.equal(
            result.maxPrice,
            820
        );
    }
);


/*
 * =========================================================
 * 2. CANTIDAD TOTAL
 * =========================================================
 */

test(
    "2. calcula correctamente la cantidad total",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 20,
                    player_id: 2
                },

                {
                    price: 120,
                    quantity: 30,
                    player_id: 3
                }
            ]);


        assert.equal(
            result.totalQuantity,
            60
        );
    }
);


/*
 * =========================================================
 * 3. IGNORAR LISTINGS INVÁLIDOS
 * =========================================================
 */

test(
    "3. ignora listings con precio o cantidad inválidos",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 0,
                    quantity: 20,
                    player_id: 2
                },

                {
                    price: 120,
                    quantity: 0,
                    player_id: 3
                },

                {
                    price: "abc",
                    quantity: 10,
                    player_id: 4
                },

                {
                    price: 130,
                    quantity: 5,
                    player_id: 5
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.totalQuantity,
            15
        );


        assert.equal(
            result.listingsCount,
            2
        );
    }
);


/*
 * =========================================================
 * 4. LISTINGS VACÍOS
 * =========================================================
 */

test(
    "4. devuelve null cuando no existen listings",
    () => {

        const analyzer =
            new BazaarAnalyzer();


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
 * 5. INPUT INVÁLIDO
 * =========================================================
 */

test(
    "5. devuelve null cuando rawListings no es un array",
    () => {

        const analyzer =
            new BazaarAnalyzer();


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
 * 6. MIN / MAX
 * =========================================================
 */

test(
    "6. calcula correctamente el precio mínimo y máximo",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 500,
                    quantity: 5,
                    player_id: 1
                },

                {
                    price: 900,
                    quantity: 5,
                    player_id: 2
                },

                {
                    price: 700,
                    quantity: 5,
                    player_id: 3
                }
            ]);


        assert.equal(
            result.minPrice,
            500
        );


        assert.equal(
            result.maxPrice,
            900
        );
    }
);


/*
 * =========================================================
 * 7. TRADERS
 * =========================================================
 */

test(
    "7. cuenta correctamente los traders únicos",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 120,
                    quantity: 10,
                    player_id: 2
                },

                {
                    price: 130,
                    quantity: 10,
                    player_id: 3
                }
            ]);


        assert.equal(
            result.traderCount,
            3
        );
    }
);


/*
 * =========================================================
 * 8. MEDIA PONDERADA
 * =========================================================
 */

test(
    "8. calcula correctamente la media ponderada",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 200,
                    quantity: 30,
                    player_id: 2
                }
            ]);


        /*
         * (100 × 10 + 200 × 30) / 40
         *
         * = 175
         */

        assert.equal(
            result.weightedMean,
            175
        );
    }
);


/*
 * =========================================================
 * 9. MEDIANA PONDERADA
 * =========================================================
 */

test(
    "9. calcula correctamente la mediana ponderada",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 200,
                    quantity: 30,
                    player_id: 2
                }
            ]);


        assert.equal(
            result.weightedMedian,
            200
        );
    }
);


/*
 * =========================================================
 * 10. DISPERSIÓN
 * =========================================================
 */

test(
    "10. calcula la dispersión entre media y mediana",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 10,
                    player_id: 2
                }
            ]);


        assert.ok(
            Number.isFinite(
                result.dispersion
            )
        );


        assert.ok(
            result.dispersion >= 0
        );
    }
);


/*
 * =========================================================
 * 11. DISTRIBUCIÓN DE PRECIOS
 * =========================================================
 */

test(
    "11. genera la distribución de precios",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze(
                createListings()
            );


        assert.ok(
            Array.isArray(
                result.priceDistribution
            )
        );


        assert.ok(
            result.priceDistribution.length > 0
        );
    }
);


/*
 * =========================================================
 * 12. MAYOR TRADER
 * =========================================================
 */

test(
    "12. identifica correctamente al trader con mayor cantidad",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 40,
                    player_id: 2
                },

                {
                    price: 120,
                    quantity: 20,
                    player_id: 3
                }
            ]);


        assert.equal(
            result.largestTraderQuantity,
            40
        );
    }
);


/*
 * =========================================================
 * 13. PARTICIPACIÓN DEL MAYOR TRADER
 * =========================================================
 */

test(
    "13. calcula correctamente la participación del mayor trader",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 30,
                    player_id: 2
                },

                {
                    price: 120,
                    quantity: 20,
                    player_id: 3
                }
            ]);


        /*
         * Mayor trader = 30
         * Total = 60
         *
         * Share = 0.5
         */

        assert.equal(
            result.largestTraderShare,
            0.5
        );
    }
);


/*
 * =========================================================
 * 14. CONFIANZA
 * =========================================================
 */

test(
    "14. confidence devuelve un valor entre 0 y 100",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze(
                createListings()
            );


        assert.ok(
            Number.isFinite(
                result.confidence
            )
        );


        assert.ok(
            result.confidence >= 0
        );


        assert.ok(
            result.confidence <= 100
        );
    }
);


/*
 * =========================================================
 * 15. BAZAAR CON UN SOLO TRADER
 * =========================================================
 */

test(
    "15. detecta correctamente un bazaar dominado por un solo trader",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 90,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 10,
                    player_id: 1
                }
            ]);


        assert.equal(
            result.traderCount,
            1
        );


        assert.equal(
            result.largestTraderQuantity,
            100
        );


        assert.equal(
            result.largestTraderShare,
            1
        );
    }
);


/*
 * =========================================================
 * 16. NORMALIZACIÓN NUMÉRICA
 * =========================================================
 */

test(
    "16. acepta price y quantity como strings numéricos",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: "100",
                    quantity: "10",
                    player_id: 1
                },

                {
                    price: "200",
                    quantity: "20",
                    player_id: 2
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.totalQuantity,
            30
        );


        assert.equal(
            result.minPrice,
            100
        );


        assert.equal(
            result.maxPrice,
            200
        );
    }
);


/*
 * =========================================================
 * 17. CANTIDAD DEL MAYOR TRADER
 * =========================================================
 */

test(
    "17. agrupa correctamente cantidades del mismo trader",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: 100,
                    quantity: 15,
                    player_id: 1
                },

                {
                    price: 110,
                    quantity: 25,
                    player_id: 1
                },

                {
                    price: 120,
                    quantity: 10,
                    player_id: 2
                }
            ]);


        /*
         * Trader 1:
         *
         * 15 + 25 = 40
         */

        assert.equal(
            result.largestTraderQuantity,
            40
        );


        assert.equal(
            result.largestTraderShare,
            40 / 50
        );
    }
);


/*
 * =========================================================
 * 18. RESULTADO CONSISTENTE
 * =========================================================
 */

test(
    "18. devuelve todos los campos principales del análisis",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze(
                createListings()
            );


        const requiredFields = [

            "totalQuantity",

            "listingsCount",

            "traderCount",

            "minPrice",

            "maxPrice",

            "weightedMean",

            "weightedMedian",

            "dispersion",

            "priceDistribution",

            "largestTraderQuantity",

            "largestTraderShare",

            "confidence"
        ];


        for (
            const field
            of requiredFields
        ) {

            assert.ok(
                Object.prototype.hasOwnProperty.call(
                    result,
                    field
                ),
                `Falta el campo ${field}`
            );
        }
    }
);


/*
 * =========================================================
 * 19. PRECIOS POSITIVOS
 * =========================================================
 */

test(
    "19. no acepta cantidades o precios negativos",
    () => {

        const analyzer =
            new BazaarAnalyzer();


        const result =
            analyzer.analyze([

                {
                    price: -100,
                    quantity: 10,
                    player_id: 1
                },

                {
                    price: 100,
                    quantity: -20,
                    player_id: 2
                },

                {
                    price: 200,
                    quantity: 5,
                    player_id: 3
                }
            ]);


        assert.ok(result);


        assert.equal(
            result.totalQuantity,
            5
        );


        assert.equal(
            result.listingsCount,
            1
        );
    }
);
