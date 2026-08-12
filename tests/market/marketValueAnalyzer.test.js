
import test from "node:test";
import assert from "node:assert/strict";

import {
    MarketValueAnalyzer
} from "../../src/market/marketValueAnalyzer.js";


/*
 * =========================================================
 * ANALYZER
 * =========================================================
 */

const analyzer =
    new MarketValueAnalyzer();


/*
 * =========================================================
 * DATOS BASE
 * =========================================================
 */

function baseMarket(overrides = {}) {

    return {

        sampleQuantity: 120,

        sampleListingsCount: 12,

        dispersion: 0.08,

        confidence: 80,

        realMarketValue: 1000,

        ...overrides
    };
}


function baseBazaars(overrides = {}) {

    return {

        totalQuantity: 1200,

        traderCount: 30,

        listingsCount: 40,

        weightedMean: 1020,

        weightedMedian: 1010,

        dispersion: 0.08,

        largestTraderShare: 0.20,

        confidence: 78,

        ...overrides
    };
}


/*
 * =========================================================
 * 1. SOLO MARKET
 * =========================================================
 */

test(
    "CASO 1: solo market",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        realMarketValue:
                            1234
                    }),

                bazaars:
                    null
            });


        assert.ok(result);


        assert.equal(
            result.realMarketValue,
            1234
        );


        assert.equal(
            result.marketWeight,
            1
        );


        assert.equal(
            result.bazaarWeight,
            0
        );
    }
);


/*
 * =========================================================
 * 2. SOLO BAZAARS
 * =========================================================
 */

test(
    "CASO 2: solo bazaars",
    () => {

        const result =
            analyzer.analyze({

                market:
                    null,

                bazaars:
                    baseBazaars()
            });


        assert.ok(result);


        assert.ok(
            Number.isFinite(
                result.realMarketValue
            )
        );


        assert.ok(
            result.realMarketValue > 0
        );


        assert.equal(
            result.marketWeight,
            0
        );


        assert.equal(
            result.bazaarWeight,
            1
        );


        assert.ok(
            Number.isFinite(
                result.signals.bazaarValue
            )
        );
    }
);


/*
 * =========================================================
 * 3. AMBAS FUENTES SIMILARES
 * =========================================================
 */

test(
    "CASO 3: ambas fuentes similares",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        realMarketValue:
                            1000
                    }),

                bazaars:
                    baseBazaars({

                        weightedMean:
                            1020,

                        weightedMedian:
                            1020,

                        dispersion:
                            0.02
                    })
            });


        assert.ok(result);


        assert.ok(
            result.realMarketValue >= 1000 &&
            result.realMarketValue <= 1020
        );


        assert.ok(
            result.confidence >= 60
        );
    }
);


/*
 * =========================================================
 * 4. MARKET FUERTE / BAZAAR DÉBIL
 * =========================================================
 */

test(
    "CASO 4: market fuerte / bazaar débil",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        confidence:
                            90,

                        sampleQuantity:
                            250,

                        sampleListingsCount:
                            20,

                        dispersion:
                            0.04
                    }),

                bazaars:
                    baseBazaars({

                        confidence:
                            35,

                        traderCount:
                            2,

                        totalQuantity:
                            40,

                        dispersion:
                            0.40,

                        largestTraderShare:
                            0.85
                    })
            });


        assert.ok(result);


        assert.ok(
            result.marketWeight >
            result.bazaarWeight
        );
    }
);


/*
 * =========================================================
 * 5. BAZAAR FUERTE / MARKET DÉBIL
 * =========================================================
 */

test(
    "CASO 5: bazaar fuerte / market débil",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        confidence:
                            30,

                        sampleQuantity:
                            4,

                        sampleListingsCount:
                            1,

                        dispersion:
                            0.55
                    }),

                bazaars:
                    baseBazaars({

                        confidence:
                            85,

                        traderCount:
                            40,

                        totalQuantity:
                            2000,

                        dispersion:
                            0.03,

                        largestTraderShare:
                            0.10
                    })
            });


        assert.ok(result);


        assert.ok(
            result.bazaarWeight >
            result.marketWeight
        );
    }
);


/*
 * =========================================================
 * 6. BAZAAR CONCENTRADO
 * =========================================================
 */

test(
    "CASO 6: bazaar extremadamente concentrado",
    () => {

        const spread =
            analyzer.analyze({

                market:
                    baseMarket(),

                bazaars:
                    baseBazaars({

                        largestTraderShare:
                            0.10
                    })
            });


        const concentrated =
            analyzer.analyze({

                market:
                    baseMarket(),

                bazaars:
                    baseBazaars({

                        largestTraderShare:
                            0.90
                    })
            });


        assert.ok(
            spread &&
            concentrated
        );


        assert.ok(
            concentrated.bazaarWeight <
            spread.bazaarWeight
        );
    }
);


/*
 * =========================================================
 * 7. ALTA DISPERSIÓN EN BAZAARS
 * =========================================================
 */

test(
    "CASO 7: alta dispersión en bazares prefiere mediana",
    () => {

        const result =
            analyzer.analyze({

                market:
                    null,

                bazaars:
                    baseBazaars({

                        weightedMean:
                            1800,

                        weightedMedian:
                            1000,

                        dispersion:
                            0.50
                    })
            });


        assert.ok(result);


        assert.equal(
            result.signals.bazaarValue,
            1000
        );
    }
);


/*
 * =========================================================
 * 8. DESACUERDO ENTRE FUENTES
 * =========================================================
 */

test(
    "CASO 8: alta diferencia entre fuentes reduce confianza",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        realMarketValue:
                            1000,

                        confidence:
                            80
                    }),

                bazaars:
                    baseBazaars({

                        weightedMean:
                            2000,

                        weightedMedian:
                            2000,

                        dispersion:
                            0.02,

                        confidence:
                            80
                    })
            });


        assert.ok(result);


        assert.equal(
            result.signals.highDisagreement,
            true
        );


        assert.ok(
            result.confidence < 70
        );
    }
);


/*
 * =========================================================
 * 9. DATOS INVÁLIDOS
 * =========================================================
 */

test(
    "CASO 9: datos inválidos",
    () => {

        const result =
            analyzer.analyze({

                market: {

                    realMarketValue:
                        NaN
                },

                bazaars: {

                    weightedMean:
                        "x",

                    weightedMedian:
                        null
                }
            });


        assert.equal(
            result,
            null
        );
    }
);


/*
 * =========================================================
 * 10. NINGUNA FUENTE
 * =========================================================
 */

test(
    "CASO 10: ninguna fuente",
    () => {

        const result =
            analyzer.analyze({

                market:
                    null,

                bazaars:
                    null
            });


        assert.equal(
            result,
            null
        );
    }
);


/*
 * =========================================================
 * 11. SEÑALES DEL RESULTADO
 * =========================================================
 */

test(
    "CASO 11: conserva las señales utilizadas",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket({

                        realMarketValue:
                            1000
                    }),

                bazaars:
                    baseBazaars({

                        weightedMean:
                            1050,

                        weightedMedian:
                            1040
                    })
            });


        assert.ok(result);


        assert.equal(
            result.signals.marketValue,
            1000
        );


        assert.ok(
            Number.isFinite(
                result.signals.bazaarValue
            )
        );
    }
);


/*
 * =========================================================
 * 12. PESOS NORMALIZADOS
 * =========================================================
 */

test(
    "CASO 12: los pesos siempre suman 1",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket(),

                bazaars:
                    baseBazaars()
            });


        assert.ok(result);


        assert.ok(
            Math.abs(
                (
                    result.marketWeight +
                    result.bazaarWeight
                ) - 1
            ) < 0.000001
        );
    }
);


/*
 * =========================================================
 * 13. REAL MARKET VALUE POSITIVO
 * =========================================================
 */

test(
    "CASO 13: realMarketValue siempre es positivo",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket(),

                bazaars:
                    baseBazaars()
            });


        assert.ok(result);


        assert.ok(
            Number.isFinite(
                result.realMarketValue
            )
        );


        assert.ok(
            result.realMarketValue > 0
        );
    }
);


/*
 * =========================================================
 * 14. CONFIANZA VÁLIDA
 * =========================================================
 */

test(
    "CASO 14: confidence está entre 0 y 100",
    () => {

        const result =
            analyzer.analyze({

                market:
                    baseMarket(),

                bazaars:
                    baseBazaars()
            });


        assert.ok(result);


        assert.ok(
            result.confidence >= 0
        );


        assert.ok(
            result.confidence <= 100
        );
    }
);
