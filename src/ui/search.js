
import { CONFIG } from "../config.js";
import { formatMoney } from "./styles.js";

const SUGGESTIONS_ID = "tw3b-suggestions";

let debounceHandle = null;


function getSuggestionsContainer(anchorEl) {

    let el =
        document.getElementById(
            SUGGESTIONS_ID
        );


    if (!el) {

        el =
            document.createElement("div");

        el.id =
            SUGGESTIONS_ID;

        el.className =
            "tw3b-suggestions";


        anchorEl.insertAdjacentElement(
            "afterend",
            el
        );
    }


    return el;
}


function renderSuggestions(
    container,
    items,
    onSelect
) {

    container.innerHTML = "";


    if (!items.length) {

        container.style.display =
            "none";

        return;
    }


    container.style.display =
        "block";


    for (const item of items) {

        const row =
            document.createElement("div");


        row.className =
            "tw3b-suggestion-item";


        row.innerHTML = `
            <span class="tw3b-suggestion-name">
                ${escapeHtml(item.name)}
            </span>

            <span class="tw3b-suggestion-price">
                ${formatMoney(item.buyPrice)}
            </span>
        `;


        row.addEventListener(
            "click",
            () => {

                container.style.display =
                    "none";

                onSelect(item);
            }
        );


        container.appendChild(row);
    }
}


function escapeHtml(str) {

    const div =
        document.createElement("div");


    div.textContent =
        String(str ?? "");


    return div.innerHTML;
}


export const search = {

    /*
     * =====================================================
     * BÚSQUEDA LOCAL
     * =====================================================
     *
     * La búsqueda solamente consulta la pricelist
     * cacheada.
     *
     * NO realiza requests a Torn.
     * NO realiza auditorías.
     *
     * La auditoría se ejecuta únicamente después
     * de seleccionar un artículo y a través del
     * Scheduler.
     */

    onQuery(
        query,
        ctx,
        onSelect,
        anchorEl
    ) {

        clearTimeout(
            debounceHandle
        );


        const container =
            getSuggestionsContainer(
                anchorEl
            );


        const normalizedQuery =
            String(query ?? "")
                .trim();


        /*
         * Si la búsqueda está vacía o es demasiado
         * corta, ocultamos inmediatamente.
         */

        if (
            normalizedQuery.length <
            CONFIG.SEARCH_MIN_LENGTH
        ) {

            container.innerHTML = "";

            container.style.display =
                "none";

            return;
        }


        /*
         * Las dependencias pueden todavía estar
         * inicializándose.
         */

        if (
            !ctx?.pricelist ||
            typeof ctx.pricelist.search !==
                "function"
        ) {

            container.innerHTML = `
                <div class="tw3b-card-sub">
                    Cargando pricelist...
                </div>
            `;

            container.style.display =
                "block";

            return;
        }


        /*
         * Debounce para evitar ejecutar búsquedas
         * continuamente mientras el usuario escribe.
         */

        debounceHandle =
            setTimeout(
                async () => {

                    try {

                        /*
                         * Verificamos nuevamente que
                         * la pricelist siga disponible.
                         */

                        if (
                            !ctx?.pricelist ||
                            typeof ctx.pricelist.search !==
                                "function"
                        ) {

                            container.style.display =
                                "none";

                            return;
                        }


                        const results =
                            await ctx.pricelist.search(
                                normalizedQuery
                            );


                        /*
                         * Mostrar solamente las primeras
                         * 8 coincidencias.
                         */

                        renderSuggestions(
                            container,
                            results.slice(0, 8),
                            onSelect
                        );


                    } catch (error) {

                        console.error(
                            "[TornW3B] Error buscando artículo:",
                            error
                        );


                        container.innerHTML = "";

                        container.style.display =
                            "none";
                    }

                },
                200
            );
    }
};
