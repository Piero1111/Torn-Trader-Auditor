import { formatMoney, formatPercent } from "./styles.js";

export const saleView = {

    async render(container, ctx, navigate, params = {}) {

        const item = params.item;

        if (!item) {
            container.innerHTML = `
                <div class="tw3b-error">
                    Buscá un artículo desde el menú principal primero.
                </div>
            `;
            return null;
        }

        container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;

        /*
         * W3B % requiere Item Value de Torn.
         * Este valor se obtiene de una auditoría previa.
         */
        const audit =
            await ctx.storage.getAudit(item.itemId);

        if (!audit) {
            container.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml(item.name)}
                </div>

                <div class="tw3b-error">
                    Este artículo todavía no fue auditado — no se puede
                    calcular el % W3B sin el Item Value de Torn.
                </div>
            `;

            return null;
        }

        /*
         * ============================================================
         * W3B %
         * ============================================================
         *
         * Ejemplo:
         *
         * W3B Buy Price = 25,554
         * Item Value    = 26,075
         *
         * W3B % = 25,554 / 26,075
         *       ≈ 0.98
         *       = 98%
         */
        const w3bPercent =
            item.buyPrice / audit.itemValue;

        /*
         * ============================================================
         * DESCUENTO W3B
         * ============================================================
         *
         * NO debemos dividir w3bPercent entre 2.
         *
         * Si W3B paga 98%:
         *
         * 100% - 98% = 2% de descuento
         */
        const w3bDiscount =
            1 - w3bPercent;

        /*
         * ============================================================
         * SELL %
         * ============================================================
         *
         * Queremos recuperar solamente la mitad del descuento.
         *
         * W3B descuento = 2%
         * Mitad          = 1%
         *
         * Sell % = 100% - 1%
         *        = 99%
         */
        const sellDiscount =
            w3bDiscount / 2;

        const sellPercent =
            1 - sellDiscount;

        /*
         * Precio de venta basado en el Item Value de Torn.
         */
        const sellPrice =
            audit.itemValue * sellPercent;

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
                    W3B %
                </span>
                <span>
                    ${formatPercent(w3bPercent)}
                    (-${formatPercent(w3bDiscount)})
                </span>
            </div>

            <div class="tw3b-row">
                <span class="tw3b-row-label">
                    Sell %
                </span>
                <span>
                    ${formatPercent(sellPercent)}
                    (-${formatPercent(sellDiscount)})
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

        const copyBtn =
            container.querySelector("#tw3b-copy-sell");

        copyBtn.addEventListener("click", async () => {

            try {

                await navigator.clipboard.writeText(
                    String(Math.round(sellPrice))
                );

                copyBtn.textContent = "Copiado ✓";

            } catch {

                copyBtn.textContent = "Error al copiar";
            }

            setTimeout(() => {
                copyBtn.textContent =
                    "Copiar precio de venta";
            }, 1500);
        });

        return null;
    }
};


function escapeHtml(str) {

    const div =
        document.createElement("div");

    div.textContent = str;

    return div.innerHTML;
}