/*
 * =============================================================
 * SALEVIEW.JS
 * =============================================================
 *
 * Venta — la pantalla más pequeña de todo el sistema.
 *
 * ┌──────────────────────────────┐
 * │ ←  Reproductor de CD         │
 * ├──────────────────────────────┤
 * │ Compra       $349 (80%)      │
 * │ Venta        $495 (90%)  📋  │
 * └──────────────────────────────┘
 *
 * Objetivo:
 *
 *   buscar → seleccionar → copiar → salir
 *
 * Responsabilidad única: PINTAR el resultado.
 *
 * Esta vista NO:
 *
 *   - ejecuta auditorías
 *   - calcula Market Value
 *   - calcula márgenes
 *   - aprende porcentajes
 *   - consulta APIs
 *
 * La auditoría (`audit`) debe llegar YA resuelta desde
 * app.js (que a su vez la obtiene de Scheduler.getOrAudit()).
 *
 * =============================================================
 * REGLA DE NEGOCIO: PRECIO DE VENTA
 * =============================================================
 *
 * El margen de venta es la mitad del margen de compra:
 *
 *     sellRatio = (1 + buyRatio) / 2
 *     sellPrice = itemValue × sellRatio
 *
 * Ejemplo:
 *
 *     Item Value = 1000
 *     Buy Ratio  = 0.80  →  Sell Ratio = 0.90  →  Sell Price = 900
 *
 * Esta fórmula vive oficialmente en:
 *
 *     RatioLearner.calculateSellRatio()
 *     RatioLearner.calculateRecommendedSellPrice()
 *
 * y auditor.js la vuelca en:
 *
 *     audit.sellRatio
 *     audit.recommendedSellPrice
 *
 * El fallback local de esta vista existe SOLO por compatibilidad
 * mientras el proyecto despliega ese cambio en auditor.js, y
 * replica la MISMA fórmula — nunca inventa una distinta.
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createEmptyState,
    formatMoney,
    formatPercent
} from "./styles.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.item          - artículo de Pricelist
 * @param {Object} deps.audit         - auditoría ya resuelta
 * @param {Function} deps.onNavigate  - (screen, params?, options?) => void
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderSaleView({
    item,
    audit,
    onNavigate
}) {

    let copyTimeoutHandle =
        null;


    /* =====================================================
     * VALIDACIÓN: ARTÍCULO
     * ===================================================== */

    if (!item) {

        return renderMessage({

            title:
                "Venta",

            message:
                "No se seleccionó ningún artículo.",

            onNavigate
        });
    }


    /* =====================================================
     * VALIDACIÓN: AUDITORÍA
     * ===================================================== */

    if (!audit) {

        return renderMessage({

            title:
                item.name,

            message:
                "No se recibió información de auditoría.",

            onNavigate
        });
    }


    /* =====================================================
     * PRECIO DE COMPRA
     * =====================================================
     *
     * Usamos el precio actual de W3B. La vista no lo
     * recalcula.
     */

    const buyPrice =
        Number(
            item.buyPrice ??
            audit.w3bBuyPrice
        );


    const itemValue =
        Number(
            audit.itemValue
        );


    /* =====================================================
     * RATIO DE COMPRA (BUY RATIO)
     * =====================================================
     *
     * Preferimos el ratio ya aprendido por RatioLearner.
     * Como último fallback, lo calculamos localmente
     * respecto al Item Value (lectura pura, sin duplicar
     * lógica de aprendizaje).
     */

    let buyRatio =
        Number(
            audit.learnedRatio ??
            audit.observedRatio
        );


    if (
        !Number.isFinite(buyRatio) &&
        Number.isFinite(buyPrice) &&
        buyPrice > 0 &&
        Number.isFinite(itemValue) &&
        itemValue > 0
    ) {

        buyRatio =
            buyPrice /
            itemValue;
    }


    /* =====================================================
     * RATIO Y PRECIO DE VENTA (SELL RATIO)
     * =====================================================
     *
     * Fuente principal: audit.sellRatio / audit.recommendedSellPrice
     * (calculados en auditor.js vía RatioLearner).
     *
     * Fallback: MISMA fórmula, calculada aquí solo por
     * compatibilidad mientras se despliega el cambio.
     */

    let sellRatio =
        Number(
            audit.sellRatio
        );


    if (
        !Number.isFinite(sellRatio) &&
        Number.isFinite(buyRatio) &&
        buyRatio > 0
    ) {

        sellRatio =
            (1 + buyRatio) / 2;
    }


    let sellPrice =
        Number(
            audit.recommendedSellPrice
        );


    if (
        !Number.isFinite(sellPrice) &&
        Number.isFinite(itemValue) &&
        itemValue > 0 &&
        Number.isFinite(sellRatio) &&
        sellRatio > 0
    ) {

        sellPrice =
            itemValue *
            sellRatio;
    }


    /* =====================================================
     * HEADER (con botón atrás)
     * ===================================================== */

    const header =
        createHeader({

            title:
                item.name,

            onBack: () => {

                if (
                    typeof onNavigate ===
                    "function"
                ) {

                    /*
                     * Sale reemplaza su propia entrada en
                     * el historial: volver a Main no debe
                     * dejar Sale apilada.
                     */

                    onNavigate(
                        "main",
                        {},
                        { replace: true }
                    );
                }
            }
        });


    /* =====================================================
     * VALIDAR PRECIO DE VENTA
     * ===================================================== */

    if (
        !Number.isFinite(sellPrice) ||
        sellPrice <= 0
    ) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No se pudo determinar un precio de venta."
                    )
                ])
            ]);

        return {

            node:
                screen,

            destroy() {}
        };
    }


    /* =====================================================
     * FILA: COMPRA
     * ===================================================== */

    const buyRow =
        createSaleRow({

            label:
                "Compra",

            price:
                Number.isFinite(buyPrice)
                    ? formatMoney(buyPrice)
                    : "—",

            percent:
                Number.isFinite(buyRatio)
                    ? formatPercent(buyRatio)
                    : "—"
        });


    /* =====================================================
     * FILA: VENTA (con botón copiar)
     * ===================================================== */

    const copyButton =
        el("button", {

            text:
                "⧉",

            attrs: {
                "aria-label":
                    "Copiar precio de venta",
                title:
                    "Copiar precio de venta"
            },

            style: {
                width: "36px",
                height: "36px",
                minWidth: "36px",
                borderRadius: "50%",
                border: "1px solid #2e323d",
                background: "#242833",
                color: "#f5f6f8",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
            }
        });


    const sellRow =
        createSaleRow({

            label:
                "Venta",

            price:
                formatMoney(sellPrice),

            percent:
                Number.isFinite(sellRatio)
                    ? formatPercent(sellRatio)
                    : "—",

            trailing:
                copyButton
        });


    /* =====================================================
     * COPIAR PRECIO
     * =====================================================
     *
     * Se copia únicamente el número.
     *
     * Ejemplo: $900 → copia "900"
     */

    async function handleCopy(event) {

        event.stopPropagation();

        const price =
            String(
                Math.round(sellPrice)
            );

        const markCopied = () => {

            copyButton.textContent =
                "✓";

            if (copyTimeoutHandle) {

                clearTimeout(
                    copyTimeoutHandle
                );
            }

            copyTimeoutHandle =
                setTimeout(
                    () => {

                        if (
                            copyButton.isConnected
                        ) {

                            copyButton.textContent =
                                "⧉";
                        }
                    },
                    1200
                );
        };

        try {

            await navigator.clipboard.writeText(
                price
            );

            markCopied();

        } catch (error) {

            console.warn(
                "[SaleView] No se pudo copiar con Clipboard API:",
                error
            );

            /*
             * Fallback para entornos sin
             * navigator.clipboard (webview TornPDA).
             */

            try {

                const textarea =
                    document.createElement(
                        "textarea"
                    );

                textarea.value =
                    price;

                textarea.style.position =
                    "fixed";

                textarea.style.opacity =
                    "0";

                document.body.appendChild(
                    textarea
                );

                textarea.select();

                document.execCommand(
                    "copy"
                );

                textarea.remove();

                markCopied();

            } catch (fallbackError) {

                console.warn(
                    "[SaleView] Error en fallback de copiado:",
                    fallbackError
                );

                copyButton.textContent =
                    "×";
            }
        }
    }

    copyButton.addEventListener(
        "click",
        handleCopy
    );


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                buyRow,

                sellRow
            ])
        ]);


    return {

        node:
            screen,


        destroy() {

            if (copyTimeoutHandle) {

                clearTimeout(
                    copyTimeoutHandle
                );
            }

            copyButton.removeEventListener(
                "click",
                handleCopy
            );
        }
    };
}


/* =============================================================
 * FILA DE VENTA (label + precio + % + [botón opcional])
 * ============================================================= */

function createSaleRow({
    label,
    price,
    percent,
    trailing = null
}) {

    return el("div", {

        className:
            "tw3b-row",

        style: {
            alignItems:
                "center"
        }

    }, [

        el("div", {

            className:
                "tw3b-row-label",

            text:
                label
        }),

        el("div", {

            style: {
                display: "flex",
                alignItems: "center",
                gap: "10px"
            }

        }, [

            el("div", {

                style: {
                    display: "flex",
                    alignItems: "baseline",
                    gap: "6px"
                }

            }, [

                el("span", {

                    className:
                        "tw3b-row-value tw3b-emph",

                    text:
                        price
                }),

                el("span", {

                    style: {
                        fontSize: "13px",
                        color: "#9aa0ac"
                    },

                    text:
                        `(${percent})`
                })
            ]),

            trailing
        ])
    ]);
}


/* =============================================================
 * MENSAJE DE ERROR (artículo o auditoría faltante)
 * ============================================================= */

function renderMessage({
    title,
    message,
    onNavigate
}) {

    const header =
        createHeader({

            title,

            onBack: () => {

                if (
                    typeof onNavigate ===
                    "function"
                ) {

                    onNavigate(
                        "main",
                        {},
                        { replace: true }
                    );
                }
            }
        });

    const screen =
        createScreen([

            header,

            createContent([

                createEmptyState(
                    message
                )
            ])
        ]);

    return {

        node:
            screen,

        destroy() {}
    };
}