
export class Auditor {

    constructor({
        tornAPI,
        marketAnalyzer,
        ratioLearner,
        storage
    }) {

        this.tornAPI = tornAPI;
        this.marketAnalyzer = marketAnalyzer;
        this.ratioLearner = ratioLearner;
        this.storage = storage;
    }


    async audit(item) {

        /*
         * =====================================================
         * VALIDACIÓN DEL ARTÍCULO
         * =====================================================
         */

        if (!item) {
            throw new Error(
                "No se recibió un artículo para auditar."
            );
        }


        const itemId =
            Number(item.itemId);


        const buyPrice =
            Number(item.buyPrice);


        if (
            !Number.isInteger(itemId) ||
            itemId <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        if (
            !Number.isFinite(buyPrice) ||
            buyPrice <= 0
        ) {

            throw new Error(
                `Precio de compra W3B inválido para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * ITEM VALUE
         * =====================================================
         */

        const itemResponse =
            await this.tornAPI.getItem(
                itemId
            );


        const itemData =
            this.extractItem(
                itemResponse
            );


        const itemValue =
            itemData.itemValue;


        /*
         * =====================================================
         * OBSERVED RATIO
         * =====================================================
         *
         * Porcentaje efectivo de compra de W3B:
         *
         *      W3B Buy Price
         * ----------------------
         *       Torn Item Value
         *
         * Ejemplo:
         *
         * Buy Price  = 25,554
         * Item Value = 26,075
         *
         * Ratio ≈ 0.9800
         *
         * Es decir, W3B está comprando aproximadamente
         * al 98% del Item Value.
         */

        const observedRatio =
            this.ratioLearner.calculateObservedRatio(
                buyPrice,
                itemValue
            );


        if (!Number.isFinite(observedRatio)) {

            throw new Error(
                `No se pudo calcular el porcentaje W3B para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * HISTORIAL ANTERIOR
         * =====================================================
         *
         * La auditoría anterior contiene el porcentaje
         * aprendido previamente para este artículo.
         *
         * Si nunca fue auditado:
         *
         *     learnedRatio = observedRatio
         *
         * Si ya fue auditado:
         *
         *     learnedRatio = EWMA(
         *         anterior,
         *         observación actual
         *     )
         */

        const previousAudit =
            await this.storage.getAudit(
                itemId
            );


        const learnedRatio =
            this.ratioLearner.update(
                previousAudit?.learnedRatio,
                observedRatio
            );


        if (!Number.isFinite(learnedRatio)) {

            throw new Error(
                `No se pudo determinar el porcentaje aprendido para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * MARKET
         * =====================================================
         *
         * Solo consultamos el mercado después de comprobar
         * que Item Value y el porcentaje W3B son válidos.
         */

        const marketResponse =
            await this.tornAPI.getItemMarket(
                itemId
            );


        const listings =
            marketResponse?.itemmarket?.listings ||
            [];


        const marketAnalysis =
            this.marketAnalyzer.analyze(
                listings
            );


        if (!marketAnalysis) {

            throw new Error(
                `No hay suficientes datos de mercado para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * PRECIO CORRECTO DE COMPRA
         * =====================================================
         *
         * El precio recomendado NO utiliza directamente
         * el porcentaje observado actual.
         *
         * Utiliza el porcentaje aprendido:
         *
         * Real Market Value × Learned Ratio
         *
         * Esto permite que TornW3B construya progresivamente
         * su propia referencia para cada artículo.
         */

        const correctBuyPrice =
            marketAnalysis.realMarketValue *
            learnedRatio;


        /*
         * =====================================================
         * DIFERENCIA
         * =====================================================
         *
         * Mide qué tan alejado está el precio actual de W3B
         * respecto al precio que TornW3B considera correcto.
         */

        const differencePercent =
            correctBuyPrice > 0
                ? Math.abs(
                    buyPrice -
                    correctBuyPrice
                ) / correctBuyPrice
                : null;


        const status =
            this.calculateStatus(
                differencePercent
            );


        /*
         * =====================================================
         * RESULTADO
         * =====================================================
         */

        const result = {

            itemId,

            itemName:
                item.name,

            itemValue,

            /*
             * Precio actual que ofrece W3B.
             */

            w3bBuyPrice:
                buyPrice,

            /*
             * Observación actual.
             */

            observedRatio,

            /*
             * Referencia aprendida por TornW3B.
             */

            learnedRatio,

            /*
             * Datos del mercado.
             */

            totalMarketQuantity:
                marketAnalysis.totalQuantity,

            sampleQuantity:
                marketAnalysis.sampleQuantity,

            weightedMean:
                marketAnalysis.weightedMean,

            weightedMedian:
                marketAnalysis.weightedMedian,

            dispersion:
                marketAnalysis.dispersion,

            realMarketValue:
                marketAnalysis.realMarketValue,

            /*
             * Precio que TornW3B recomienda pagar.
             */

            correctBuyPrice,

            /*
             * Diferencia entre W3B y nuestra referencia.
             */

            differencePercent,

            confidence:
                marketAnalysis.confidence,

            status,

            /*
             * Información de cache de Torn.
             */

            marketCacheTimestamp:
                marketResponse
                    ?.itemmarket
                    ?.cache_timestamp
                    ?? null,

            marketCacheDelay:
                marketResponse
                    ?.itemmarket
                    ?.cache_delay
                    ?? null,

            /*
             * Momento de esta auditoría.
             */

            timestamp:
                Date.now()
        };


        /*
         * =====================================================
         * GUARDAR AUDITORÍA
         * =====================================================
         *
         * Importante:
         *
         * Aquí queda persistido learnedRatio.
         *
         * La próxima auditoría podrá utilizarlo como
         * previousAudit.learnedRatio.
         */

        await this.storage.saveAudit(
            result
        );


        return result;
    }


    /*
     * =========================================================
     * STATUS
     * =========================================================
     */

    calculateStatus(difference) {

        if (!Number.isFinite(difference)) {
            return "RED";
        }


        /*
         * Diferencia <= 3%
         *
         * El precio de W3B está muy cerca
         * del precio recomendado.
         */

        if (
            difference <= 0.03
        ) {

            return "GREEN";
        }


        /*
         * Diferencia entre 3% y 10%.
         */

        if (
            difference <= 0.10
        ) {

            return "YELLOW";
        }


        /*
         * Diferencia superior al 10%.
         */

        return "RED";
    }


    /*
     * =========================================================
     * EXTRAER ITEM VALUE
     * =========================================================
     */

    extractItem(response) {

        const item =
            response?.items?.[0];


        if (!item) {

            throw new Error(
                "Torn API no devolvió información del artículo."
            );
        }


        const itemValue =
            Number(
                item.value?.market_price
            );


        if (
            !Number.isFinite(itemValue) ||
            itemValue <= 0
        ) {

            throw new Error(
                `Item Value inválido para ${item.name}.`
            );
        }


        return {

            id:
                Number(item.id),

            name:
                item.name,

            itemValue
        };
    }
}
