/*
 * =============================================================
 * AUDITPRODUCTVIEW.JS
 * =============================================================
 *
 * Pantalla central del Auditor — Resultado de un artículo.
 *
 * ┌──────────────────────────────┐
 * │ Valor Torn          $436     │
 * │ Precio actual W3B    $349    │
 * ├──────────────────────────────┤
 * │ 📊 RESULTADO                 │
 * │ Mercado real        $550     │
 * │ Compra recomendada  $440     │
 * │ Precio de venta     $495     │
 * │ Diferencia          +26.1%   │
 * │ Confianza             92%    │
 * │ 🟢 COMPRA RECOMENDADA        │
 * │ [ APLICAR CAMBIO ]           │
 * ├──────────────────────────────┤
 * │ [ 📊 MERCADO      ]          │
 * │ [ 🏪 COMPETENCIA  ]          │
 * │ [ 📚 APRENDIZAJE  ]          │
 * │ [ 🕘 HISTORIAL    ]          │
 * └──────────────────────────────┘
 *
 * IMPORTANTE — flujo de "APLICAR CAMBIO":
 *
 * auditor.js YA NO aplica cambios automáticamente (ver nota
 * en auditor.js). Esta vista es la ÚNICA responsable de
 * disparar la actualización real, en dos pasos:
 *
 *     1. PriceUpdateService.accept(audit.priceProposal)
 *        → actualiza InternalPriceList (aprendizaje)
 *
 *     2. Pricelist.updatePrice(w3bUserId, itemId, recommendedBuyPrice)
 *        → actualiza W3B (PUT) + cache local de Pricelist
 *
 * El botón solo aparece si audit.priceProposal.updateAvailable
 * es true. Si no hay propuesta disponible, no se muestra.
 *
 * Tras aplicar con éxito, se notifica a app.js vía
 * onAuditUpdated(itemId) para que pueda invalidar/refrescar
 * la auditoría cacheada de este artículo (la próxima auditoría
 * comparará contra el nuevo valor aprendido).
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createRow,
    createDivider,
    createSectionTitle,
    createCard,
    createButton,
    createStatusBadge,
    createEmptyState,
    formatMoney,
    formatPercent
} from "./styles.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.item                  - artículo de Pricelist
 * @param {Object} deps.audit                 - auditoría ya resuelta
 * @param {string|number} deps.w3bUserId      - W3B User ID configurado
 * @param {Object} deps.priceUpdateService    - instancia de PriceUpdateService
 * @param {Object} deps.pricelist             - instancia de Pricelist
 * @param {Function} deps.onNavigate          - (screen, params?, options?) => void
 * @param {Function} deps.onBack
 * @param {Function} [deps.onAuditUpdated]    - (itemId) => void
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderAuditProductView({
    item,
    audit,
    w3bUserId,
    priceUpdateService,
    pricelist,
    onNavigate,
    onBack,
    onAuditUpdated
}) {

    const header =
        createHeader({

            title:
                item?.name ||
                "Producto",

            onBack
        });


    /* =====================================================
     * VALIDACIÓN
     * ===================================================== */

    if (
        !item ||
        !audit
    ) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No hay información de auditoría disponible."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    /* =====================================================
     * DATOS BASE
     * ===================================================== */

    const itemValue =
        Number(
            audit.itemValue
        );

    const w3bBuyPrice =
        Number(
            audit.w3bBuyPrice
        );

    const realMarketValue =
        Number(
            audit.realMarketValue
        );

    const correctBuyPrice =
        Number(
            audit.correctBuyPrice
        );

    /*
     * BUGFIX: el Auditor usa un precio de venta DISTINTO al de
     * la funcionalidad Venta (saleView.js) — anclado al mismo
     * realMarketValue que "Compra recomendada" (ver nota en
     * auditor.js → auditRecommendedSellPrice). Fallback local
     * con la MISMA fórmula si por algo no llegó precalculado.
     */

    let recommendedSellPrice =
        Number(
            audit.auditRecommendedSellPrice
        );

    if (
        !Number.isFinite(recommendedSellPrice) &&
        Number.isFinite(realMarketValue) &&
        realMarketValue > 0 &&
        Number.isFinite(audit.learnedRatio) &&
        audit.learnedRatio > 0
    ) {

        const fallbackSellRatio =
            (1 + Number(audit.learnedRatio)) / 2;

        recommendedSellPrice =
            Math.round(
                realMarketValue *
                fallbackSellRatio
            );
    }

    const differencePercent =
        Number(
            audit.differencePercent
        );

    const confidence =
        Number(
            audit.confidence
        );

    const status =
        audit.status ||
        null;


    const baseSection = [

        createRow({

            label:
                "Valor Torn",

            value:
                Number.isFinite(itemValue)
                    ? formatMoney(itemValue)
                    : "—"
        }),

        createRow({

            label:
                "Precio actual W3B",

            value:
                Number.isFinite(w3bBuyPrice)
                    ? formatMoney(w3bBuyPrice)
                    : "—"
        })
    ];


    /* =====================================================
     * RESULTADO
     * ===================================================== */

    const resultSection = [

        createSectionTitle(
            "📊 Resultado"
        ),

        createRow({

            label:
                "Mercado real",

            value:
                Number.isFinite(realMarketValue)
                    ? formatMoney(realMarketValue)
                    : "—"
        }),

        createRow({

            label:
                "Compra recomendada",

            value:
                Number.isFinite(correctBuyPrice)
                    ? formatMoney(correctBuyPrice)
                    : "—",

            emphasis:
                true
        }),

        createRow({

            label:
                "Precio de venta",

            value:
                Number.isFinite(recommendedSellPrice)
                    ? formatMoney(recommendedSellPrice)
                    : "—"
        }),

        createRow({

            label:
                "Diferencia",

            value:
                Number.isFinite(differencePercent)
                    ? formatPercent(
                        differencePercent,
                        { signed: true }
                    )
                    : "—"
        }),

        createRow({

            label:
                "Confianza",

            value:
                Number.isFinite(confidence)
                    ? `${Math.round(confidence)}%`
                    : "—"
        })
    ];


    const statusBadge =
        status
            ? createStatusBadge(status)
            : null;


    /* =====================================================
     * BOTÓN APLICAR CAMBIO
     * =====================================================
     *
     * Solo se muestra si hay una propuesta disponible.
     */

    const proposal =
        audit.priceProposal ||
        null;

    const canApply =
        proposal?.updateAvailable === true;


    let applyButton =
        null;

    let applyStatusText =
        null;


    if (canApply) {

        applyStatusText =
            el("div", {

                style: {
                    fontSize: "12px",
                    color: "#9aa0ac",
                    textAlign: "center",
                    minHeight: "16px"
                },

                text:
                    ""
            });


        applyButton =
            createButton({

                label:
                    "Aplicar cambio",

                variant:
                    "primary",

                onClick:
                    handleApplyClick
            });
    }


    async function handleApplyClick() {

        if (!applyButton) {
            return;
        }

        applyButton.disabled =
            true;

        applyButton.textContent =
            "Aplicando...";

        applyStatusText.textContent =
            "";
        applyStatusText.style.color =
            "#9aa0ac";


        try {

            /*
             * =============================================
             * VALIDAR W3B USER ID
             * =============================================
             */

            const validUserId =
                w3bUserId !== null &&
                w3bUserId !== undefined &&
                String(w3bUserId).trim() !== "";

            if (!validUserId) {

                throw new Error(
                    "No se configuró un W3B User ID. " +
                    "Revisa Configuración."
                );
            }


            if (
                !priceUpdateService ||
                typeof priceUpdateService.accept !==
                "function"
            ) {

                throw new Error(
                    "PriceUpdateService no está disponible."
                );
            }


            if (
                !pricelist ||
                typeof pricelist.updatePrice !==
                "function"
            ) {

                throw new Error(
                    "Pricelist no está disponible."
                );
            }


            /*
             * =============================================
             * 1. ACTUALIZAR LISTA INTERNA (aprendizaje)
             * =============================================
             */

            const updateResult =
                await priceUpdateService.accept(
                    proposal
                );


            /*
             * =============================================
             * 2. ACTUALIZAR PRICELIST W3B
             * =============================================
             */

            await pricelist.updatePrice(

                w3bUserId,

                item.itemId,

                updateResult.recommendedBuyPrice
            );


            /*
             * =============================================
             * ÉXITO
             * =============================================
             */

            applyButton.textContent =
                "✓ Aplicado";

            applyStatusText.style.color =
                "#37b24d";

            applyStatusText.textContent =
                `Nuevo precio: ${formatMoney(
                    updateResult.recommendedBuyPrice
                )}`;


            if (
                typeof onAuditUpdated ===
                "function"
            ) {

                onAuditUpdated(
                    item.itemId
                );
            }


        } catch (error) {

            console.error(
                "[AuditProductView] Error aplicando cambio:",
                error
            );

            applyButton.disabled =
                false;

            applyButton.textContent =
                "Aplicar cambio";

            applyStatusText.style.color =
                "#e64953";

            applyStatusText.textContent =
                error?.message ||
                "Ocurrió un error al aplicar el cambio.";
        }
    }


    /* =====================================================
     * TARJETAS DE NAVEGACIÓN
     * ===================================================== */

    const navCards = [

        createCard({

            icon:
                "📊",

            label:
                "Mercado",

            onClick: () => {

                onNavigate(
                    "market",
                    { item, audit }
                );
            }
        }),

        createCard({

            icon:
                "🏪",

            label:
                "Competencia",

            onClick: () => {

                onNavigate(
                    "competition",
                    { item, audit }
                );
            }
        }),

        createCard({

            icon:
                "📚",

            label:
                "Aprendizaje",

            onClick: () => {

                onNavigate(
                    "learning",
                    { item, audit }
                );
            }
        }),

        createCard({

            icon:
                "🕘",

            label:
                "Historial",

            onClick: () => {

                onNavigate(
                    "historyProduct",
                    { item }
                );
            }
        })
    ];


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...baseSection,

                createDivider(),

                ...resultSection,

                statusBadge,

                applyButton,

                applyStatusText,

                createDivider(),

                ...navCards
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}