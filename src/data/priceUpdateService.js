
export class PriceUpdateService {

    constructor({
        internalPriceList
    }) {

        this.internalPriceList =
            internalPriceList;
    }


    /*
     * =========================================================
     * ACEPTAR PROPUESTA
     * =========================================================
     *
     * Solamente una propuesta con:
     *
     *     updateAvailable === true
     *
     * puede actualizar la lista interna.
     */

    async accept(proposal) {

        /*
         * =====================================================
         * VALIDACIÓN
         * =====================================================
         */

        if (!proposal) {

            throw new Error(
                "No se recibió una propuesta de precio."
            );
        }


        /*
         * =====================================================
         * VERIFICAR PROPUESTA
         * =====================================================
         */

        if (
            proposal.updateAvailable !== true
        ) {

            throw new Error(
                "La propuesta no está disponible para actualización."
            );
        }


        /*
         * =====================================================
         * VALIDAR SERVICIO
         * =====================================================
         */

        if (
            !this.internalPriceList ||
            typeof this.internalPriceList.update !==
            "function"
        ) {

            throw new Error(
                "InternalPriceList no está disponible."
            );
        }


        /*
         * =====================================================
         * VALIDAR ITEM
         * =====================================================
         */

        const itemId =
            Number(proposal.itemId);


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        /*
         * =====================================================
         * ACTUALIZAR PRECIO INTERNO
         * =====================================================
         *
         * La nueva observación es el
         * observedMarketValue.
         *
         * El ratio utilizado sigue siendo el
         * learnedRatio de la propuesta.
         */

        const updated =
            await this.internalPriceList.update({

                itemId,

                itemName:
                    proposal.itemName,

                realMarketValue:
                    Number(
                        proposal.observedMarketValue
                    ),

                learnedRatio:
                    Number(
                        proposal.learnedRatio
                    ),

                confidence:
                    Number(
                        proposal.confidence
                    )
            });


        /*
         * =====================================================
         * RESULTADO
         * =====================================================
         */

        return {

            updated: true,

            itemId,

            itemName:
                proposal.itemName,

            previousInternalMarketValue:
                Number(
                    proposal.currentInternalPrice
                ),

            observedMarketValue:
                Number(
                    proposal.observedMarketValue
                ),

            newInternalMarketValue:
                updated.internalMarketValue,

            recommendedBuyPrice:
                updated.recommendedBuyPrice,

            learnedRatio:
                updated.learnedRatio,

            confidence:
                updated.confidence,

            observations:
                updated.observations,

            updatedAt:
                updated.updatedAt
        };
    }
}
