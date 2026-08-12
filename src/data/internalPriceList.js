export class InternalPriceList {

    constructor(storage) {

        this.storage =
            storage;
    }


    /*
     * =========================================================
     * OBTENER PRECIO INTERNO
     * =========================================================
     */

    async get(itemId) {

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


        return await this.storage.getInternalPrice(
            id
        );
    }


    /*
     * =========================================================
     * GUARDAR / ACTUALIZAR PRECIO INTERNO
     * =========================================================
     */

    async save(priceData) {

        if (!priceData) {

            throw new Error(
                "No se recibió información de precio interno."
            );
        }


        const itemId =
            Number(
                priceData.itemId
            );


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        const internalPrice = {

            ...priceData,

            itemId,

            updatedAt:
                Date.now()
        };


        await this.storage.saveInternalPrice(
            internalPrice
        );


        return internalPrice;
    }


    /*
     * =========================================================
     * CREAR PRECIO INICIAL
     * =========================================================
     */

    async initialize({
        itemId,
        itemName,
        realMarketValue,
        learnedRatio,
        confidence,
        w3bBuyPrice
    }) {

        const existing =
            await this.get(
                itemId
            );


        if (existing) {

            return existing;
        }


        const marketValue =
            Number(
                realMarketValue
            );


        const ratio =
            Number(
                learnedRatio
            );


        if (
            !Number.isFinite(marketValue) ||
            marketValue <= 0
        ) {

            throw new Error(
                `Real Market Value inválido para ${itemName}.`
            );
        }


        if (
            !Number.isFinite(ratio) ||
            ratio <= 0
        ) {

            throw new Error(
                `Learned Ratio inválido para ${itemName}.`
            );
        }


        const recommendedBuyPrice =
            Math.round(
                marketValue *
                ratio
            );
            /*
         * =================================================
         * VALORES ORIGINALES
         * =================================================
         *
         * Se fijan UNA SOLA VEZ, en la primera observación.
         *
         * update() nunca los sobrescribe (los propaga vía
         * spread de `previous`), así que sirven como
         * referencia histórica permanente para
         * learningView.js.
         */

        const initialW3bPrice =
            Number(
                w3bBuyPrice
            );



        return await this.save({

            itemId,

            itemName,

            internalMarketValue:
                Math.round(
                    marketValue
                ),

            recommendedBuyPrice,

            learnedRatio:
                ratio,

            confidence:
                Number.isFinite(
                    Number(confidence)
                )
                    ? Number(confidence)
                    : 0,

            observations:
                1,
                /*
             * =============================================
             * REFERENCIA ORIGINAL (inmutable)
             * =============================================
             */

            initialInternalMarketValue:
                Math.round(
                    marketValue
                ),

            initialRecommendedBuyPrice:
                recommendedBuyPrice,

            initialW3bBuyPrice:
                Number.isFinite(initialW3bPrice) &&
                initialW3bPrice > 0
                    ? Math.round(initialW3bPrice)
                    : null
        
        });
        
    }


    /*
     * =========================================================
     * ACTUALIZAR CON UNA NUEVA OBSERVACIÓN
     * =========================================================
     */

    async update({
        itemId,
        itemName,
        realMarketValue,
        learnedRatio,
        confidence,
        w3bBuyPrice
    }) {

        const previous =
            await this.get(
                itemId
            );


        /*
         * Si todavía no existe,
         * se crea el primer registro.
         */

        if (!previous) {

            return await this.initialize({

                itemId,

                itemName,

                realMarketValue,

                learnedRatio,

                confidence,
                w3bBDuyPrice
            });
        }


        const observations =
            Number(
                previous.observations
            ) || 0;


        const previousValue =
            Number(
                previous.internalMarketValue
            );


        const newValue =
            Number(
                realMarketValue
            );


        if (
            !Number.isFinite(previousValue) ||
            previousValue <= 0
        ) {

            throw new Error(
                `Precio interno anterior inválido para ${itemName}.`
            );
        }


        if (
            !Number.isFinite(newValue) ||
            newValue <= 0
        ) {

            throw new Error(
                `Real Market Value inválido para ${itemName}.`
            );
        }


        /*
         * =====================================================
         * PROMEDIO INCREMENTAL
         * =====================================================
         */

        const newObservationCount =
            observations + 1;


        const updatedMarketValue =
            Math.round(
                (
                    previousValue *
                    observations +
                    newValue
                ) /
                newObservationCount
            );


        /*
         * =====================================================
         * RATIO
         * =====================================================
         */

        const previousRatio =
            Number(
                previous.learnedRatio
            );


        const updatedRatio =
            Number.isFinite(
                Number(learnedRatio)
            ) &&
            Number(learnedRatio) > 0
                ? Number(learnedRatio)
                : previousRatio;


        if (
            !Number.isFinite(updatedRatio) ||
            updatedRatio <= 0
        ) {

            throw new Error(
                `Learned Ratio inválido para ${itemName}.`
            );
        }


        /*
         * =====================================================
         * PRECIO RECOMENDADO
         * =====================================================
         */

        const recommendedBuyPrice =
            Math.round(
                updatedMarketValue *
                updatedRatio
            );


        /*
         * =====================================================
         * CONFIANZA
         * =====================================================
         */

        const previousConfidence =
            Number(
                previous.confidence
            );


        const updatedConfidence =
            Number.isFinite(
                Number(confidence)
            )
                ? Number(confidence)
                : (
                    Number.isFinite(
                        previousConfidence
                    )
                        ? previousConfidence
                        : 0
                );


        /*
         * =====================================================
         * GUARDAR
         * =====================================================
         */

        return await this.save({

            ...previous,

            itemId,

            itemName:
                itemName ??
                previous.itemName,

            internalMarketValue:
                updatedMarketValue,

            recommendedBuyPrice,

            learnedRatio:
                updatedRatio,

            confidence:
                updatedConfidence,

            observations:
                newObservationCount
        });
    }
}