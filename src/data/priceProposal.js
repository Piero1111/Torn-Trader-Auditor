export class PriceProposal {

    /*
     * =========================================================
     * CONFIGURACIÓN
     * =========================================================
     */

    constructor({
        differenceThreshold = 0.10,
        minimumConfidence = 70
    } = {}) {

        this.differenceThreshold =
            differenceThreshold;

        this.minimumConfidence =
            minimumConfidence;
    }


    /*
     * =========================================================
     * GENERAR PROPUESTA
     * =========================================================
     */

    generate({
        itemId,
        itemName,
        internalMarketValue,
        realMarketValue,
        learnedRatio,
        confidence,
        currentBuyPrice
    }) {

        /*
         * =====================================================
         * VALIDACIÓN DEL ARTÍCULO
         * =====================================================
         */

        const id =
            Number(itemId);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        /*
         * =====================================================
         * VALIDACIÓN DEL PRECIO INTERNO
         * =====================================================
         */

        const internalValue =
            Number(
                internalMarketValue
            );


        if (
            !Number.isFinite(internalValue) ||
            internalValue <= 0
        ) {

            throw new Error(
                `Precio interno inválido para ${itemName}.`
            );
        }


        /*
         * =====================================================
         * VALIDACIÓN DEL REAL MARKET VALUE
         * =====================================================
         */

        const observedValue =
            Number(
                realMarketValue
            );


        if (
            !Number.isFinite(observedValue) ||
            observedValue <= 0
        ) {

            throw new Error(
                `Real Market Value inválido para ${itemName}.`
            );
        }


        /*
         * =====================================================
         * VALIDACIÓN DEL LEARNED RATIO
         * =====================================================
         */

        const ratio =
            Number(
                learnedRatio
            );


        if (
            !Number.isFinite(ratio) ||
            ratio <= 0
        ) {

            throw new Error(
                `Learned Ratio inválido para ${itemName}.`
            );
        }


        /*
         * =====================================================
         * CONFIANZA
         * =====================================================
         */

        const currentConfidence =
            Number(
                confidence
            );


        const validConfidence =
            Number.isFinite(
                currentConfidence
            )
                ? currentConfidence
                : 0;


        /*
         * =====================================================
         * PRECIO RECOMENDADO
         * =====================================================
         */

        const recommendedBuyPrice =
            Math.round(
                observedValue *
                ratio
            );


        /*
         * =====================================================
         * PRECIO DE REFERENCIA PARA LA DECISIÓN
         * =====================================================
         *
         * BUGFIX (Bug #1 — botón "Aplicar cambio" ausente):
         *
         * Antes la diferencia se calculaba SIEMPRE contra
         * `internalMarketValue` (el valor interno aprendido).
         *
         * Problema: en la primera auditoría de cualquier
         * artículo, InternalPriceList.initialize() fija
         * internalMarketValue = realMarketValue de ESA MISMA
         * auditoría (ver auditor.js). Eso hacía que la
         * diferencia diera 0% por construcción, sin importar
         * lo mal que estuviera el precio publicado en W3B —
         * el botón nunca podía aparecer en el primer chequeo
         * de un artículo, aunque el status fuera 🔴 con una
         * diferencia enorme (ej: +82.6%).
         *
         * La pregunta que realmente le importa al usuario es:
         * "¿el precio que TENGO PUESTO en W3B está mal
         * respecto a lo que recomiendo ahora?". Por eso ahora
         * comparamos recommendedBuyPrice contra el precio
         * actualmente publicado (currentBuyPrice).
         *
         * Si por algún motivo no llega currentBuyPrice (uso
         * legado / tests), caemos de vuelta al comportamiento
         * anterior (internalValue) para no romper nada.
         */

        const price =
            Number(currentBuyPrice);

        const referencePrice =
            Number.isFinite(price) &&
            price > 0
                ? price
                : internalValue;


        /*
         * =====================================================
         * DIFERENCIA
         * =====================================================
         */

        const difference =
            recommendedBuyPrice -
            referencePrice;

        const differencePercent =
            difference /
            referencePrice;


        /*
         * =====================================================
         * DETERMINAR ACTUALIZACIÓN
         * =====================================================
         */

       const significantDifference =
            Math.abs(
                differencePercent
            ) >
            this.differenceThreshold;


        /*
         * BUGFIX: la confianza YA NO condiciona si el botón
         * "Aplicar cambio" aparece. Ahora es solo un dato
         * informativo (se sigue devolviendo en `confidence`)
         * que el trader evalúa por su cuenta antes de decidir
         * si aplica el cambio — el sistema ya no lo bloquea
         * automáticamente por baja confianza.
         */

        const updateAvailable =
            significantDifference;

        /*
         * =====================================================
         * RESULTADO
         * =====================================================
         */

        return {

            itemId:
                id,

            itemName,

            currentInternalPrice:
                Math.round(
                    internalValue
                ),

            observedMarketValue:
                Math.round(
                    observedValue
                ),

            difference:
                Math.round(
                    difference
                ),

            differencePercent,

            recommendedBuyPrice,

            confidence:
                validConfidence,

            updateAvailable,

            status:
                updateAvailable
                    ? "UPDATE_AVAILABLE"
                    : "NO_UPDATE"
        };
    }
}