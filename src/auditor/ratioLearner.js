import { CONFIG } from "../config.js";

export class RatioLearner {

    /*
     * =========================================================
     * OBSERVED RATIO
     * =========================================================
     *
     * Calcula cuánto representa realmente el precio W3B
     * respecto al Item Value de Torn.
     *
     * Ejemplo:
     *
     * W3B Buy = 98
     * Item Value = 100
     *
     * observedRatio = 0.98
     */

    calculateObservedRatio(
        buyPrice,
        itemValue
    ) {

        const buy =
            Number(buyPrice);

        const value =
            Number(itemValue);


        if (
            !Number.isFinite(buy) ||
            !Number.isFinite(value) ||
            buy <= 0 ||
            value <= 0
        ) {

            return null;
        }


        return buy / value;
    }


    /*
     * =========================================================
     * LEARN
     * =========================================================
     *
     * Actualiza el porcentaje aprendido utilizando EWMA.
     *
     * Primera observación:
     *
     *     learned = observed
     *
     * Observaciones posteriores:
     *
     *     learned =
     *         α × observed
     *         +
     *         (1 - α) × previous
     */

    update(
        previousRatio,
        observedRatio
    ) {

        const observed =
            Number(observedRatio);

        const previous =
            Number(previousRatio);


        /*
         * Observación inválida.
         *
         * Conservamos el aprendizaje anterior.
         */

        if (
            !Number.isFinite(observed) ||
            observed <= 0
        ) {

            return Number.isFinite(previous)
                ? previous
                : null;
        }


        /*
         * Primera observación.
         */

        if (
            !Number.isFinite(previous) ||
            previous <= 0
        ) {

            return observed;
        }


        /*
         * Alpha seguro.
         */

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


        /*
         * EWMA.
         */

        return (
            safeAlpha * observed
            +
            (1 - safeAlpha) * previous
        );
    }


    /*
     * =========================================================
     * CORRECT BUY PRICE
     * =========================================================
     *
     * Convierte el ratio aprendido nuevamente en
     * un precio recomendado de compra.
     *
     * Ejemplo:
     *
     * Item Value = 100
     * Learned Ratio = 0.975
     *
     * Correct Buy = 97.5
     */

    calculateCorrectBuyPrice(
        itemValue,
        learnedRatio
    ) {

        const value =
            Number(itemValue);

        const ratio =
            Number(learnedRatio);


        if (
            !Number.isFinite(value) ||
            value <= 0 ||
            !Number.isFinite(ratio) ||
            ratio <= 0
        ) {

            return null;
        }


        return value * ratio;
    }
}