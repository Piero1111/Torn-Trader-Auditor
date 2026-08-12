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

        /*
        * Observación inválida.
        *
        * Conservamos el aprendizaje anterior únicamente
        * si el ratio anterior también es válido.
        */

        if (
            !Number.isFinite(observed) ||
            observed <= 0
        ) {

            return (
                Number.isFinite(previous) &&
                previous > 0
            )
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
    /*
     * =========================================================
     * SELL RATIO
     * =========================================================
     *
     * El margen de venta es la mitad del margen de compra.
     *
     * Ejemplo:
     *
     * Buy Ratio  = 0.80  (comprando 20% por debajo del Item Value)
     * Sell Ratio = 0.90  (vendiendo 10% por debajo del Item Value)
     *
     *     sellRatio = (1 + buyRatio) / 2
     */

    calculateSellRatio(buyRatio) {

        const ratio =
            Number(buyRatio);


        if (
            !Number.isFinite(ratio) ||
            ratio <= 0
        ) {

            return null;
        }


        return (1 + ratio) / 2;
    }


    /*
     * =========================================================
     * RECOMMENDED SELL PRICE
     * =========================================================
     *
     * Convierte el Sell Ratio nuevamente en un precio
     * de venta, sobre el Item Value de Torn.
     *
     * Ejemplo:
     *
     * Item Value = 1000
     * Buy Ratio  = 0.80
     *
     * Sell Ratio = 0.90
     * Sell Price = 900
     */

    calculateRecommendedSellPrice(
        itemValue,
        buyRatio
    ) {

        const value =
            Number(itemValue);

        const sellRatio =
            this.calculateSellRatio(
                buyRatio
            );


        if (
            !Number.isFinite(value) ||
            value <= 0 ||
            !Number.isFinite(sellRatio)
        ) {

            return null;
        }


        return value * sellRatio;
    }
}