/*
 * =============================================================
 * LEARNINGVIEW.JS
 * =============================================================
 *
 * Aprendizaje — evolución del precio interno aprendido frente
 * a su valor original, y su relación con W3B.
 *
 * ┌──────────────────────────────┐
 * │ 📚 REFERENCIA INTERNA        │
 * │ Valor inicial       $1,000   │
 * │ Valor aprendido       $700   │
 * │ Margen compra          20%   │
 * │ Margen venta           10%   │
 * │ Compra inicial         $800  │
 * │ Compra actual          $560  │
 * │ Venta actual           $630  │
 * ├──────────────────────────────┤
 * │ W3B original           $800  │
 * │ W3B actual              $560 │
 * └──────────────────────────────┘
 *
 * Responsabilidad única: PINTAR el registro de InternalPriceList
 * (+ audit.w3bBuyPrice para el precio vivo actual).
 *
 * Esta vista NO recalcula el aprendizaje. El único cálculo que
 * hace localmente es el Margen de venta / Venta actual, usando
 * la MISMA fórmula que ya vive oficialmente en:
 *
 *     RatioLearner.calculateSellRatio()
 *
 * porque sellRatio es un valor puramente derivado de
 * learnedRatio y no se persiste por separado en
 * InternalPriceList (no hace falta: es una función pura).
 *
 * Requiere que auditor.js / internalPriceList.js persistan:
 *
 *     initialInternalMarketValue
 *     initialRecommendedBuyPrice
 *     initialW3bBuyPrice
 *
 * (ver cambios aplicados en internalPriceList.js / auditor.js).
 *
 * Si el artículo nunca alcanzó una actualización significativa
 * de precio, InternalPriceList jamás creó su registro: en ese
 * caso se muestra un estado vacío explicativo.
 * =============================================================
 */

import {
    createScreen,
    createContent,
    createHeader,
    createSectionTitle,
    createDivider,
    createRow,
    createEmptyState,
    formatMoney,
    formatPercent
} from "./styles.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.audit          - auditoría ya resuelta
 * @param {Object} deps.internalPrice  - registro de InternalPriceList
 *                                       (puede ser null)
 * @param {Function} deps.onBack
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderLearningView({
    audit,
    internalPrice,
    onBack
}) {

    const header =
        createHeader({

            title:
                "Aprendizaje",

            onBack
        });


    /* =====================================================
     * VALIDACIÓN
     * ===================================================== */

    if (!internalPrice) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "Este artículo todavía no generó una " +
                        "actualización de precio interno. " +
                        "El aprendizaje aparece aquí una vez " +
                        "que ocurre la primera actualización."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    /* =====================================================
     * VALOR INTERNO
     * ===================================================== */

    const initialValue =
        Number(
            internalPrice.initialInternalMarketValue
        );

    const learnedValue =
        Number(
            internalPrice.internalMarketValue
        );

    const buyRatio =
        Number(
            internalPrice.learnedRatio
        );


    /*
     * Sell ratio: derivado, misma fórmula que
     * RatioLearner.calculateSellRatio().
     */

    const sellRatio =
        Number.isFinite(buyRatio) &&
        buyRatio > 0
            ? (1 + buyRatio) / 2
            : null;


    const buyMargin =
        Number.isFinite(buyRatio)
            ? 1 - buyRatio
            : null;

    const sellMargin =
        Number.isFinite(sellRatio)
            ? 1 - sellRatio
            : null;


    const initialBuyPrice =
        Number(
            internalPrice.initialRecommendedBuyPrice
        );

    const currentBuyPrice =
        Number(
            internalPrice.recommendedBuyPrice
        );

    const currentSellPrice =
        Number.isFinite(learnedValue) &&
        Number.isFinite(sellRatio)
            ? Math.round(
                learnedValue *
                sellRatio
            )
            : null;


    const internalSection = [

        createSectionTitle(
            "📚 Referencia interna"
        ),

        createRow({

            label:
                "Valor inicial",

            value:
                Number.isFinite(initialValue)
                    ? formatMoney(initialValue)
                    : "—"
        }),

        createRow({

            label:
                "Valor aprendido",

            value:
                Number.isFinite(learnedValue)
                    ? formatMoney(learnedValue)
                    : "—",

            emphasis:
                true
        }),

        createRow({

            label:
                "Margen compra",

            value:
                buyMargin !== null
                    ? formatPercent(buyMargin)
                    : "—"
        }),

        createRow({

            label:
                "Margen venta",

            value:
                sellMargin !== null
                    ? formatPercent(sellMargin)
                    : "—"
        }),

        createRow({

            label:
                "Compra inicial",

            value:
                Number.isFinite(initialBuyPrice)
                    ? formatMoney(initialBuyPrice)
                    : "—"
        }),

        createRow({

            label:
                "Compra actual",

            value:
                Number.isFinite(currentBuyPrice)
                    ? formatMoney(currentBuyPrice)
                    : "—"
        }),

        createRow({

            label:
                "Venta actual",

            value:
                currentSellPrice !== null
                    ? formatMoney(currentSellPrice)
                    : "—"
        })
    ];


    /* =====================================================
     * W3B
     * ===================================================== */

    const initialW3bPrice =
        Number(
            internalPrice.initialW3bBuyPrice
        );

    const currentW3bPrice =
        Number(
            audit?.w3bBuyPrice
        );


    const w3bSection = [

        createRow({

            label:
                "W3B original",

            value:
                Number.isFinite(initialW3bPrice)
                    ? formatMoney(initialW3bPrice)
                    : "—"
        }),

        createRow({

            label:
                "W3B actual",

            value:
                Number.isFinite(currentW3bPrice)
                    ? formatMoney(currentW3bPrice)
                    : "—"
        })
    ];


    /* =====================================================
     * NOTA EXPLICATIVA
     * ===================================================== */

    const caption =
        createEmptyState(
            "El valor interno se aprende mediante auditorías."
        );


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...internalSection,

                createDivider(),

                ...w3bSection,

                caption
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}