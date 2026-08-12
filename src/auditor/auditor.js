export class Auditor {

    constructor({
        tornAPI,
        w3bAPI,
        marketAnalyzer,
        bazaarAnalyzer,
        marketValueAnalyzer,
        ratioLearner,
        storage,
        priceProposal,
        internalPriceList,
        w3bUserId
    }) {

        this.tornAPI =
            tornAPI;

        this.w3bAPI =
            w3bAPI;

        this.marketAnalyzer =
            marketAnalyzer;

        this.bazaarAnalyzer =
            bazaarAnalyzer;

        this.marketValueAnalyzer =
            marketValueAnalyzer;

        this.ratioLearner =
            ratioLearner;

        this.storage =
            storage;

        this.priceProposal =
            priceProposal;

        this.internalPriceList =
            internalPriceList;

        this.w3bUserId =
            w3bUserId;
    }


    /*
     * =========================================================
     * AUDIT
     * =========================================================
     */

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
         */

        const observedRatio =
            this.ratioLearner.calculateObservedRatio(
                buyPrice,
                itemValue
            );


        if (
            !Number.isFinite(observedRatio)
        ) {

            throw new Error(
                `No se pudo calcular el porcentaje W3B para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * HISTORIAL ANTERIOR
         * =====================================================
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


        if (
            !Number.isFinite(learnedRatio)
        ) {

            throw new Error(
                `No se pudo determinar el porcentaje aprendido para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * TORN ITEM MARKET
         * =====================================================
         */

        if (
            !this.tornAPI ||
            typeof this.tornAPI.getItemMarket !==
            "function"
        ) {

            throw new Error(
                "Torn Item Market API no está disponible."
            );
        }


        const marketResponse =
            await this.tornAPI.getItemMarket(
                itemId
            );


        const marketListings =
            marketResponse?.itemmarket?.listings ||
            [];


        if (
            !Array.isArray(marketListings) ||
            marketListings.length === 0
        ) {

            throw new Error(
                `No hay vendedores disponibles en el Item Market de Torn para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * ANALIZAR ITEM MARKET
         * =====================================================
         */

        const normalizedMarketListings =
            marketListings.map(
                listing => ({

                    ...listing,

                    quantity:
                        Number(
                            listing?.quantity ??
                            listing?.amount
                        ),

                    price:
                        Number(
                            listing?.price
                        )
                })
            );


        const marketAnalysis =
            this.marketAnalyzer?.analyze(
                normalizedMarketListings
            ) ?? null;


        if (!marketAnalysis) {

            throw new Error(
                `No hay suficientes datos de mercado para ${item.name}.`
            );
        }


        /*
         * =====================================================
         * W3B MARKETPLACE
         * =====================================================
         */

        if (
            !this.w3bAPI ||
            typeof this.w3bAPI.getMarketplace !==
            "function"
        ) {

            throw new Error(
                "W3B Marketplace API no está disponible."
            );
        }


        const marketplace =
            await this.w3bAPI.getMarketplace(
                itemId
            );


        /*
         * =====================================================
         * LISTINGS DE BAZARES
         * =====================================================
         */

        const bazaarListings =
            marketplace?.listings ||
            [];


        let bazaarAnalysis =
            null;


        let marketValueAnalysis =
            null;


        if (
            Array.isArray(bazaarListings) &&
            bazaarListings.length > 0 &&
            this.bazaarAnalyzer &&
            typeof this.bazaarAnalyzer.analyze ===
            "function"
        ) {

            try {

                bazaarAnalysis =
                    this.bazaarAnalyzer.analyze(
                        bazaarListings
                    );

            } catch (error) {

                console.warn(
                    `[Auditor] Error analizando bazares para ${item.name}:`,
                    error
                );
            }
        }


        /*
         * =====================================================
         * MARKET VALUE ANALYZER
         * =====================================================
         */

        if (
            this.marketValueAnalyzer &&
            typeof this.marketValueAnalyzer.analyze ===
            "function"
        ) {

            try {

                marketValueAnalysis =
                    this.marketValueAnalyzer.analyze({

                        market:
                            marketAnalysis,

                        bazaars:
                            bazaarAnalysis
                    });

            } catch (error) {

                console.warn(
                    `[Auditor] Error combinando señales de mercado para ${item.name}:`,
                    error
                );
            }
        }


        /*
         * =====================================================
         * VALIDAR MARKET VALUE REAL
         * =====================================================
         */

        if (
            !marketValueAnalysis ||
            !Number.isFinite(
                Number(
                    marketValueAnalysis.realMarketValue
                )
            ) ||
            Number(
                marketValueAnalysis.realMarketValue
            ) <= 0
        ) {

            throw new Error(
                `No se pudo determinar el Market Value real para ${item.name}.`
            );
        }


        /*
 * =====================================================
 * PRECIO INTERNO DE REFERENCIA
 * =====================================================
 *
 * Es el valor contra el que comparamos el Market Value
 * recién calculado. Si el artículo nunca tuvo un
 * registro interno, se crea aquí (primera observación).
 *
 * IMPORTANTE: audit() NUNCA llama a
 * internalPriceList.update() — eso es responsabilidad
 * exclusiva de PriceUpdateService.accept(), disparado
 * manualmente desde auditProductView.js.
 */

let internalPrice =
    null;

if (this.internalPriceList) {

    internalPrice =
        await this.internalPriceList.get(
            itemId
        );

    if (!internalPrice) {

        internalPrice =
            await this.internalPriceList.initialize({

                itemId,

                itemName:
                    item.name,

                realMarketValue:
                    marketValueAnalysis.realMarketValue,

                learnedRatio,

                confidence:
                    marketValueAnalysis.confidence,

                w3bBuyPrice:
                    buyPrice
            });
    }
}


        /*
         * =====================================================
         * PRICE PROPOSAL
         * =====================================================
         *
         * BUGFIX: se pasa `currentBuyPrice` (el precio que HOY
         * está publicado en W3B) para que PriceProposal decida
         * si hace falta actualizar comparando lo publicado
         * contra lo recomendado — y no contra el valor interno
         * recién inicializado (que en la primera auditoría de
         * un artículo siempre coincide con realMarketValue,
         * dando 0% de diferencia aunque el precio esté muy
         * desviado). Ver priceProposal.js para el detalle.
         */

        let priceProposalResult =
            null;


        if (
            this.priceProposal &&
            typeof this.priceProposal.generate ===
            "function" &&
            internalPrice
        ) {

            priceProposalResult =
                this.priceProposal.generate({

                    itemId,

                    itemName:
                        item.name,

                    internalMarketValue:
                        internalPrice.internalMarketValue,

                    realMarketValue:
                        marketValueAnalysis.realMarketValue,

                    learnedRatio,

                    confidence:
                        marketValueAnalysis.confidence,

                    currentBuyPrice:
                        buyPrice
                });
        }


        /*
         * =====================================================
         * PRECIO RECOMENDADO (SOLO INFORMATIVO)
         * =====================================================
         *
         * auditor.js YA NO aplica cambios automáticamente.
         *
         * La propuesta (priceProposalResult) queda calculada y
         * disponible en el resultado para que la interfaz decida.
         *
         * Aplicar realmente el cambio (InternalPriceList + W3B)
         * es responsabilidad de:
         *
         *     PriceUpdateService.accept(priceProposal)
         *     Pricelist.updatePrice(userId, itemId, recommendedBuyPrice)
         *
         * disparadas manualmente desde auditProductView.js
         * mediante el botón "APLICAR CAMBIO".
         */

        const priceUpdate =
            null;


        /*
         * =====================================================
         * PRECIO CORRECTO DE COMPRA
         * =====================================================
         */

        const correctBuyPrice =
            Math.round(
                Number(
                    marketValueAnalysis.realMarketValue
                ) *
                learnedRatio
            );


        if (
            !Number.isFinite(correctBuyPrice) ||
            correctBuyPrice <= 0
        ) {

            throw new Error(
                `No se pudo calcular el precio correcto de compra para ${item.name}.`
            );
        }
        /*
         * =====================================================
         * PRECIO DE VENTA RECOMENDADO
         * =====================================================
         *
         * El margen de venta es la mitad del margen de compra
         * (learnedRatio), aplicado sobre el Item Value de Torn.
         */

        const sellRatio =
            this.ratioLearner.calculateSellRatio(
                learnedRatio
            );


        const recommendedSellPrice =
            this.ratioLearner.calculateRecommendedSellPrice(
                itemValue,
                learnedRatio
            );
        /*
         * =====================================================
         * PRECIO DE VENTA — REFERENCIAL DEL AUDITOR
         * =====================================================
         *
         * IMPORTANTE: este valor es DISTINTO a recommendedSellPrice
         * de arriba, y cada uno alimenta una pantalla distinta:
         *
         *   - recommendedSellPrice (arriba): sobre el Item Value
         *     de Torn. Lo usa la funcionalidad VENTA (saleView.js)
         *     para una venta rápida de referencia.
         *
         *   - auditRecommendedSellPrice (aquí): sobre el MISMO
         *     realMarketValue que generó `correctBuyPrice`. Lo
         *     debe mostrar el AUDITOR (auditProductView.js) junto
         *     a "Compra recomendada", para que ambos números sean
         *     coherentes entre sí (comprar y vender anclados al
         *     mismo valor de mercado del día). Usar itemValue ahí
         *     producía recomendaciones absurdas cuando itemValue
         *     y realMarketValue están muy alejados entre sí.
         */

        const auditRecommendedSellPrice =
            this.ratioLearner.calculateRecommendedSellPrice(
                marketValueAnalysis.realMarketValue,
                learnedRatio
            );


        /*
         * =====================================================
         * DIFERENCIA
         * =====================================================
         */

        const differencePercent =
            correctBuyPrice > 0
                ? Math.abs(
                    buyPrice -
                    correctBuyPrice
                ) /
                correctBuyPrice
                : null;


        /*
         * =====================================================
         * STATUS
         * =====================================================
         */

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

            w3bBuyPrice:
                buyPrice,

            observedRatio,

            learnedRatio,


            /*
             * =================================================
             * MARKET
             * =================================================
             */

            market: {

                totalQuantity:
                    marketAnalysis.totalQuantity,

                listingsCount:
                    marketAnalysis.listingsCount,

                targetQuantity:
                    marketAnalysis.targetQuantity,

                requiredListings:
                    marketAnalysis.requiredListings,

                sampleSize:
                    marketAnalysis.sampleSize,

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

                confidence:
                    marketAnalysis.confidence,
                     /*
                 * =============================================
                 * VENDEDORES DE LA MUESTRA
                 * =============================================
                 *
                 * Necesario para distributionView.js: permite
                 * mostrar qué vendedores concretos formaron
                 * parte del cálculo estadístico (incluidos)
                 * frente al resto del mercado (excluidos).
                 */

                sampleListings:
                    marketAnalysis.sampleListings
            
            },
           

            /*
             * =================================================
             * BAZAARS
             * =================================================
             */

            bazaars:
                bazaarAnalysis
                    ? {

                        totalQuantity:
                            bazaarAnalysis.totalQuantity,

                        listingsCount:
                            bazaarAnalysis.listingsCount,

                        traderCount:
                            bazaarAnalysis.traderCount,

                        minPrice:
                            bazaarAnalysis.minPrice,

                        maxPrice:
                            bazaarAnalysis.maxPrice,

                        weightedMean:
                            bazaarAnalysis.weightedMean,

                        weightedMedian:
                            bazaarAnalysis.weightedMedian,

                        dispersion:
                            bazaarAnalysis.dispersion,

                        priceDistribution:
                            bazaarAnalysis.priceDistribution,

                        largestTraderQuantity:
                            bazaarAnalysis.largestTraderQuantity,

                        largestTraderShare:
                            bazaarAnalysis.largestTraderShare,
                            /*
                         * Ranking completo, usado por
                         * competitionView.js.
                         */
                        topTraders: bazaarAnalysis.topTraders,

                        confidence:
                            bazaarAnalysis.confidence
                    }

                    : null,


            /*
             * =================================================
             * MARKET VALUE
             * =================================================
             */

            marketValueAnalysis,


            /*
             * =================================================
             * PRICE PROPOSAL
             * =================================================
             */

            priceProposal:
                priceProposalResult,


            /*
             * =================================================
             * PRICE UPDATE
             * =================================================
             */

            priceUpdate,


            /*
             * =================================================
             * MARKETPLACE
             * =================================================
             */

            totalMarketQuantity:
                marketAnalysis.totalQuantity,

            listingsCount:
                marketAnalysis.listingsCount,

            targetQuantity:
                marketAnalysis.targetQuantity,

            accumulatedQuantity:
                marketAnalysis.accumulatedQuantity,

            sampleListingsCount:
                marketAnalysis.sampleListingsCount,

            sellerSampleSize:
                marketAnalysis.sellerSampleSize,

            sampleQuantity:
                marketAnalysis.sampleQuantity,


            /*
             * =================================================
             * ESTADÍSTICAS
             * =================================================
             */

            weightedMean:
                marketAnalysis.weightedMean,

            weightedMedian:
                marketAnalysis.weightedMedian,

            dispersion:
                marketAnalysis.dispersion,

            /*
             * BUGFIX (Bug #2):
             *
             * Antes: marketAnalysis.realMarketValue (solo Item
             * Market de Torn, SIN bazares).
             *
             * correctBuyPrice / recommendedSellPrice / la
             * propuesta de precio SIEMPRE usaron
             * marketValueAnalysis.realMarketValue (combinado
             * Item Market + Bazaars). Mostrar aquí el valor
             * "solo mercado" hacía que "Mercado real" en
             * auditProductView.js NO coincidiera con el valor
             * que realmente generó "Compra recomendada",
             * produciendo cifras que parecían absurdas
             * (ej: Mercado real $103 pero Compra recomendada
             * $384, calculada en realidad sobre ~$591).
             *
             * Ahora usamos la MISMA fuente que el resto del
             * sistema: el valor combinado y ponderado por
             * confianza de MarketValueAnalyzer.
             */
            realMarketValue:
                marketValueAnalysis.realMarketValue,


            /*
             * =================================================
             * PRECIO CORRECTO
             * =================================================
             */

            correctBuyPrice,
               /*
             * =================================================
             * PRECIO DE VENTA
             * =================================================
             */

            sellRatio,

            recommendedSellPrice,
            auditRecommendedSellPrice,


            /*
             * =================================================
             * DIFERENCIA
             * =================================================
             */

            differencePercent,


            /*
             * =================================================
             * CONFIANZA
             * =================================================
             *
             * BUGFIX (Bug #2): igual que con realMarketValue,
             * se usaba marketAnalysis.confidence (solo Item
             * Market). Ahora se usa marketValueAnalysis.confidence,
             * que es la confianza REAL que determina si
             * priceProposal habilita el botón "Aplicar cambio".
             * Mostrar la confianza "equivocada" ocultaba por
             * qué el botón no aparecía.
             */

            confidence:
                marketValueAnalysis.confidence,


            /*
             * =================================================
             * STATUS
             * =================================================
             */

            status,


            /*
             * =================================================
             * INFORMACIÓN MARKETPLACE
             * =================================================
             */

            marketplaceItemName:
                marketplace?.item_name ??
                null,

            marketplacePrice:
                Number.isFinite(
                    Number(
                        marketplace?.market_price
                    )
                )
                    ? Number(
                        marketplace.market_price
                    )
                    : null,

            bazaarAverage:
                Number.isFinite(
                    Number(
                        marketplace?.bazaar_average
                    )
                )
                    ? Number(
                        marketplace.bazaar_average
                    )
                    : null,

            marketplaceGeneratedAt:
                marketplace?.generated_at ??
                null,


            /*
             * =================================================
             * TIMESTAMP
             * =================================================
             */

            timestamp:
                Date.now()
        };


        /*
         * =====================================================
         * GUARDAR AUDITORÍA
         * =====================================================
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

        if (
            !Number.isFinite(difference)
        ) {

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