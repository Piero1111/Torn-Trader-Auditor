
import test from "node:test";
import assert from "node:assert/strict";

import { RatioLearner } from "../../src/auditor/ratioLearner.js";
import { CONFIG } from "../../src/config.js";


function createLearner() {

    return new RatioLearner();
}


/*
 * =========================================================
 *
 * 1. OBSERVED RATIO
 *
 * =========================================================
 */

test(
    "1. calcula correctamente el observedRatio",
    () => {

        const learner =
            createLearner();


        const result =
            learner.calculateObservedRatio(
                98,
                100
            );


        assert.equal(
            result,
            0.98
        );
    }
);


/*
 * =========================================================
 *
 * 2. OBSERVED RATIO CON PRECIOS DISTINTOS
 *
 * =========================================================
 */

test(
    "2. calcula correctamente ratios diferentes",
    () => {

        const learner =
            createLearner();


        const result =
            learner.calculateObservedRatio(
                800,
                1000
            );


        assert.equal(
            result,
            0.8
        );
    }
);


/*
 * =========================================================
 *
 * 3. OBSERVED RATIO INVÁLIDO
 *
 * =========================================================
 */

test(
    "3. devuelve null cuando buyPrice es inválido",
    () => {

        const learner =
            createLearner();


        assert.equal(
            learner.calculateObservedRatio(
                0,
                1000
            ),
            null
        );


        assert.equal(
            learner.calculateObservedRatio(
                -100,
                1000
            ),
            null
        );


        assert.equal(
            learner.calculateObservedRatio(
                NaN,
                1000
            ),
            null
        );
    }
);


/*
 * =========================================================
 *
 * 4. ITEM VALUE INVÁLIDO
 *
 * =========================================================
 */

test(
    "4. devuelve null cuando itemValue es inválido",
    () => {

        const learner =
            createLearner();


        assert.equal(
            learner.calculateObservedRatio(
                100,
                0
            ),
            null
        );


        assert.equal(
            learner.calculateObservedRatio(
                100,
                -100
            ),
            null
        );


        assert.equal(
            learner.calculateObservedRatio(
                100,
                NaN
            ),
            null
        );
    }
);


/*
 * =========================================================
 *
 * 5. PRIMERA OBSERVACIÓN
 *
 * =========================================================
 */

test(
    "5. la primera observación se convierte directamente en learnedRatio",
    () => {

        const learner =
            createLearner();


        const result =
            learner.update(
                null,
                0.8
            );


        assert.equal(
            result,
            0.8
        );
    }
);


/*
 * =========================================================
 *
 * 6. PRIMERA OBSERVACIÓN SIN RATIO ANTERIOR
 *
 * =========================================================
 */

test(
    "6. utiliza observedRatio cuando previousRatio no existe",
    () => {

        const learner =
            createLearner();


        const result =
            learner.update(
                undefined,
                0.75
            );


        assert.equal(
            result,
            0.75
        );
    }
);


/*
 * =========================================================
 *
 * 7. EWMA
 *
 * =========================================================
 */

test(
    "7. actualiza el ratio utilizando EWMA",
    () => {

        const learner =
            createLearner();


        const previous =
            0.80;


        const observed =
            0.90;


        const alpha =
            Number(CONFIG.EWMA_ALPHA);


        const safeAlpha =
            Number.isFinite(alpha)
                ? Math.min(
                    1,
                    Math.max(
                        0,
                        alpha
                    )
                )
                : 0.2;


        const expected =
            safeAlpha * observed
            +
            (1 - safeAlpha) * previous;


        const result =
            learner.update(
                previous,
                observed
            );


        assert.equal(
            result,
            expected
        );
    }
);


/*
 * =========================================================
 *
 * 8. OBSERVACIÓN INVÁLIDA CONSERVA EL APRENDIZAJE
 *
 * =========================================================
 */

test(
    "8. conserva el ratio anterior cuando la observación es inválida",
    () => {

        const learner =
            createLearner();


        const result =
            learner.update(
                0.8,
                null
            );


        assert.equal(
            result,
            0.8
        );
    }
);


/*
 * =========================================================
 *
 * 9. AMBOS RATIOS INVÁLIDOS
 *
 * =========================================================
 */

test(
    "9. devuelve null cuando no existe ningún ratio válido",
    () => {

        const learner =
            createLearner();


        const result =
            learner.update(
                null,
                null
            );


        assert.equal(
            result,
            null
        );
    }
);


/*
 * =========================================================
 *
 * 10. RATIO ANTERIOR INVÁLIDO
 *
 * =========================================================
 */

test(
    "10. utiliza la observación cuando el ratio anterior es inválido",
    () => {

        const learner =
            createLearner();


        const result =
            learner.update(
                0,
                0.85
            );


        assert.equal(
            result,
            0.85
        );
    }
);


/*
 * =========================================================
 *
 * 11. CALCULAR PRECIO CORRECTO
 *
 * =========================================================
 */

test(
    "11. calcula correctamente el precio de compra",
    () => {

        const learner =
            createLearner();


        const result =
            learner.calculateCorrectBuyPrice(
                1000,
                0.8
            );


        assert.equal(
            result,
            800
        );
    }
);


/*
 * =========================================================
 *
 * 12. PRECIO CORRECTO CON DECIMALES
 *
 * =========================================================
 */

test(
    "12. calculateCorrectBuyPrice conserva los decimales",
    () => {

        const learner =
            createLearner();


        const result =
            learner.calculateCorrectBuyPrice(
                1000,
                0.975
            );


        assert.equal(
            result,
            975
        );
    }
);


/*
 * =========================================================
 *
 * 13. PRECIO INVÁLIDO
 *
 * =========================================================
 */

test(
    "13. devuelve null cuando itemValue es inválido",
    () => {

        const learner =
            createLearner();


        assert.equal(
            learner.calculateCorrectBuyPrice(
                0,
                0.8
            ),
            null
        );


        assert.equal(
            learner.calculateCorrectBuyPrice(
                -100,
                0.8
            ),
            null
        );
    }
);


/*
 * =========================================================
 *
 * 14. RATIO INVÁLIDO
 *
 * =========================================================
 */

test(
    "14. devuelve null cuando learnedRatio es inválido",
    () => {

        const learner =
            createLearner();


        assert.equal(
            learner.calculateCorrectBuyPrice(
                1000,
                0
            ),
            null
        );


        assert.equal(
            learner.calculateCorrectBuyPrice(
                1000,
                -0.8
            ),
            null
        );


        assert.equal(
            learner.calculateCorrectBuyPrice(
                1000,
                NaN
            ),
            null
        );
    }
);


/*
 * =========================================================
 *
 * 15. FLUJO COMPLETO DE APRENDIZAJE
 *
 * =========================================================
 */

test(
    "15. calcula ratio observado, aprende y obtiene precio correcto",
    () => {

        const learner =
            createLearner();


        const observedRatio =
            learner.calculateObservedRatio(
                800,
                1000
            );


        assert.equal(
            observedRatio,
            0.8
        );


        const learnedRatio =
            learner.update(
                null,
                observedRatio
            );


        assert.equal(
            learnedRatio,
            0.8
        );


        const correctBuyPrice =
            learner.calculateCorrectBuyPrice(
                1000,
                learnedRatio
            );


        assert.equal(
            correctBuyPrice,
            800
        );
    }
);
