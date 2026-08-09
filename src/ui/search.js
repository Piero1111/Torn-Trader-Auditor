import { CONFIG } from "../config.js";
import { formatMoney } from "./styles.js";

const SUGGESTIONS_ID = "tw3b-suggestions";
let debounceHandle = null;

function getSuggestionsContainer(anchorEl) {

    let el = document.getElementById(SUGGESTIONS_ID);

    if (!el) {
        el = document.createElement("div");
        el.id = SUGGESTIONS_ID;
        el.className = "tw3b-suggestions";
        anchorEl.insertAdjacentElement("afterend", el);
    }

    return el;
}


function renderSuggestions(container, items, onSelect) {

    container.innerHTML = "";

    if (items.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "block";

    for (const item of items) {

        const row = document.createElement("div");
        row.className = "tw3b-suggestion-item";
        row.innerHTML = `
            <span class="tw3b-suggestion-name">${escapeHtml(item.name)}</span>
            <span class="tw3b-suggestion-price">${formatMoney(item.buyPrice)}</span>
        `;

        row.addEventListener("click", () => {
            container.style.display = "none";
            onSelect(item);
        });

        container.appendChild(row);
    }
}


function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}


export const search = {

    /*
     * anchorEl es el <input> de búsqueda:
     * se usa para posicionar el dropdown
     * de sugerencias justo debajo.
     */
    onQuery(query, ctx, onSelect, anchorEl) {

        clearTimeout(debounceHandle);

        const container = getSuggestionsContainer(anchorEl);

        if (!query || query.length < CONFIG.SEARCH_MIN_LENGTH) {
            container.style.display = "none";
            return;
        }

        /*
         * Debounce: no consultamos la pricelist
         * local en cada tecla, esperamos una pausa
         * breve (sección 28/41).
         */
        debounceHandle = setTimeout(async () => {

            const results = await ctx.pricelist.search(query);

            renderSuggestions(
                container,
                results.slice(0, 8),
                onSelect
            );

        }, 200);
    }
};