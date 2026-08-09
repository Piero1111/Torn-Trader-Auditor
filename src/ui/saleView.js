import {
    formatMoney,
    formatPercent
} from "./styles.js";


export const saleView = {

    async render(
        container,
        ctx,
        navigate,
        params = {}
    ) {

        const item =
            params.item;

        /*
         * La auditoría ya fue obtenida por App
         * mediante Scheduler.getOrAudit().
         */
        const audit =
            params.audit;


        if (!item) {

            container.innerHTML = `
                <div class="tw3b-error">
                    Buscá un artículo desde el menú principal primero.
                </div>
            `;

            return null;
        }


        if (!audit) {

            container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml(item.name)}
                </div>

                <div class="tw3b-error">
                    No se recibió información de auditoría.
                </div>
            `;

            return null;
        }


        /*
         * Verificación de seguridad.
         */

        if (
            !Number.isFinite(
                Number(audit.itemValue)
            ) ||
            Number(audit.itemValue) <= 0
        ) {

            container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml(item.name)}
                </div>

                <div class="tw3b-error">
                    Torn no devolvió un Item Value válido para este artículo.
                </div>
            `;

            return null;
        }


        const itemValue =
            Number(audit.itemValue);


        /*
         * =====================================================
         * W3B %
         * =====================================================
         *
         * Buy Price / Item Value
         *
         * Ejemplo:
         *
         * Buy Price = 25.554
         * Item Value = 26.075
         *
         * W3B % ≈ 98%
         */

        const w3bPercent =
            Number(item.buyPrice) /
            itemValue;


        /*
         * Descuento respecto al Item Value.
         */

        const discountPercent =
            1 - w3bPercent;


        /*
         * =====================================================
         * SELL %
         * =====================================================
         *
         * Se divide el DESCUENTO entre 2.
         *
         * Ejemplo:
         *
         * W3B = 98%
         * descuento = 2%
         *
         * 2% / 2 = 1%
         *
         * Sell % = 99%
         */

        const sellDiscount =
            discountPercent / 2;


        const sellPercent =
            1 - sellDiscount;


        /*
         * Precio de venta.
         */

        const sellPrice =
            itemValue *
            sellPercent;


        /*
         * =====================================================
         * RENDER
         * =====================================================
         */

        container.innerHTML = `

            <div class="tw3b-card-title">
                ${escapeHtml(item.name)}
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    W3B Buy Price
                </span>

                <span>
                    ${formatMoney(item.buyPrice)}
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Item Value
                </span>

                <span>
                    ${formatMoney(itemValue)}
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    W3B %
                </span>

                <span>
                    ${formatPercent(w3bPercent)}
                    (${formatPercent(-discountPercent)})
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell %
                </span>

                <span>
                    ${formatPercent(sellPercent)}
                    (${formatPercent(-sellDiscount)})
                </span>
            </div>


            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell Price
                </span>

                <span>
                    ${formatMoney(sellPrice)}
                </span>
            </div>


            <button
                class="tw3b-button"
                id="tw3b-copy-sell"
                style="margin-top: 10px;"
            >
                Copiar precio de venta
            </button>
        `;


        /*
         * =====================================================
         * COPIAR PRECIO
         * =====================================================
         */

        const copyBtn =
            container.querySelector(
                "#tw3b-copy-sell"
            );


        if (copyBtn) {

            copyBtn.addEventListener(
                "click",
                async () => {

                    try {

                        await navigator.clipboard.writeText(
                            String(
                                Math.round(
                                    sellPrice
                                )
                            )
                        );


                        copyBtn.textContent =
                            "Copiado ✓";


                    } catch {

                        copyBtn.textContent =
                            "Error al copiar";
                    }


                    setTimeout(
                        () => {

                            copyBtn.textContent =
                                "Copiar precio de venta";

                        },
                        1500
                    );
                }
            );
        }


        return null;
    }
};


/*
 * =========================================================
 * UTILIDAD
 * =========================================================
 */

function escapeHtml(str) {

    const div =
        document.createElement("div");

    div.textContent =
        String(str ?? "");

    return div.innerHTML;
}