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

        const itemId =
            Number(item.itemId);

        /*
         * Primero obtenemos la información
         * de Torn.
         *
         * TornAPI ya serializa las requests.
         */
        const itemResponse =
            await this.tornAPI.getItem(
                itemId
            );

        const itemData =
            this.extractItem(
                itemResponse
            );

        /*
         * Solo solicitamos market si el
         * Item Value es válido.
         *
         * Esto evita desperdiciar una request
         * cuando el artículo no puede auditarse.
         */
        const marketResponse =
            await this.tornAPI.getItemMarket(
                itemId
            );

        const itemValue =
            itemData.itemValue;


        /*
         * observedRatio NO utiliza el mercado.
         */
        const observedRatio =
            this.ratioLearner.calculateObservedRatio(
                item.buyPrice,
                itemValue
            );


        const previousAudit =
            await this.storage.getAudit(
                itemId
            );


        const learnedRatio =
            this.ratioLearner.update(
                previousAudit?.learnedRatio,
                observedRatio
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
                `No hay suficientes datos de mercado para ${item.name}`
            );
        }


        const correctBuyPrice =
            marketAnalysis.realMarketValue *
            learnedRatio;


        const differencePercent =
            correctBuyPrice > 0
                ? Math.abs(
                    item.buyPrice -
                    correctBuyPrice
                ) / correctBuyPrice
                : null;


        const status =
            this.calculateStatus(
                differencePercent
            );


        const result = {

            itemId,

            itemName:
                item.name,

            itemValue,

            w3bBuyPrice:
                item.buyPrice,

            observedRatio,

            learnedRatio,

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

            correctBuyPrice,

            differencePercent,

            confidence:
                marketAnalysis.confidence,

            status,

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

            timestamp:
                Date.now()
        };


        await this.storage.saveAudit(
            result
        );


        return result;
    }


    calculateStatus(difference) {

        if (!Number.isFinite(difference)) {
            return "RED";
        }

        if (
            difference <= 0.03
        ) {

            return "GREEN";
        }


        if (
            difference <= 0.10
        ) {

            return "YELLOW";
        }


        return "RED";
    }


    extractItem(response) {

        const item =
            response?.items?.[0];


        if (!item) {

            throw new Error(
                "Torn API no devolvió información del artículo"
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
                `Item Value inválido para ${item.name}`
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