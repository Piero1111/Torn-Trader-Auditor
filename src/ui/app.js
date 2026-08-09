import {
    injectStyles
} from "./styles.js";

const VIEWS = {

    MENU: "menu",
    SALE: "sale",
    AUDIT: "audit",
    HISTORY: "history",
    SETTINGS: "settings"

};

export class App {

    constructor(ctx, views = {}) {

        this.ctx = ctx;
        this.views = views;

        this.currentView =
            VIEWS.MENU;

        this.activeViewInstance =
            null;

        this.fab = null;
        this.panel = null;
        this.panelBody = null;

        this.searchInput = null;
        this.iconBar = null;
    }


    /*
     * =========================================================
     * MOUNT
     * =========================================================
     */

    mount() {

        injectStyles();

        this.fab =
            document.createElement("button");

        this.fab.className =
            "tw3b-fab";

        this.fab.type =
            "button";

        this.fab.innerHTML =
            "💰";

        this.fab.setAttribute(
            "aria-label",
            "Abrir TornW3B Trader"
        );

        this.fab.addEventListener(
            "click",
            () => this.toggle()
        );


        this.panel =
            document.createElement("div");

        this.panel.className =
            "tw3b-panel";


        this.panelBody =
            document.createElement("div");

        this.panelBody.className =
            "tw3b-panel-body";


        this.panel.appendChild(
            this.panelBody
        );


        document.body.appendChild(
            this.fab
        );

        document.body.appendChild(
            this.panel
        );


        this.renderMenu();

        this.refreshAlertBadge();
    }


    /*
     * =========================================================
     * PANEL
     * =========================================================
     */

    toggle() {

        if (
            this.panel.classList.contains(
                "open"
            )
        ) {

            this.close();

        } else {

            this.open();
        }
    }


    open() {

        this.panel.classList.add(
            "open"
        );

        if (this.searchInput) {

            setTimeout(
                () => {

                    this.searchInput.focus();

                },
                100
            );
        }
    }


    close() {

        this.panel.classList.remove(
            "open"
        );

        this.hideSuggestions();
    }


    /*
     * =========================================================
     * MENÚ PRINCIPAL
     * =========================================================
     */

    renderMenu() {

        this.currentView =
            VIEWS.MENU;

        this.activeViewInstance =
            null;

        this.panelBody.innerHTML =
            "";


        const toolbar =
            document.createElement("div");

        toolbar.className =
            "tw3b-toolbar";


        /*
         * BÚSQUEDA
         */

        const searchWrapper =
            document.createElement("div");

        searchWrapper.className =
            "tw3b-search-wrapper";


        this.searchInput =
            document.createElement("input");

        this.searchInput.className =
            "tw3b-search";

        this.searchInput.type =
            "text";

        this.searchInput.placeholder =
            "🔎 Buscar artículo...";

        this.searchInput.autocomplete =
            "off";


        this.searchInput.addEventListener(
            "input",
            (event) => {

                this.handleSearch(
                    event.target.value
                );
            }
        );


        searchWrapper.appendChild(
            this.searchInput
        );


        /*
         * ICONOS
         */

        this.iconBar =
            document.createElement("div");

        this.iconBar.className =
            "tw3b-icon-bar";


        this.createIconButton({

            icon: "🛡️",

            title: "Auditoría",

            view: VIEWS.AUDIT,

            badge: true

        });


        this.createIconButton({

            icon: "📜",

            title: "Historial",

            view: VIEWS.HISTORY

        });


        this.createIconButton({

            icon: "⚙️",

            title: "Configuración",

            view: VIEWS.SETTINGS

        });


        toolbar.appendChild(
            searchWrapper
        );

        toolbar.appendChild(
            this.iconBar
        );


        this.panelBody.appendChild(
            toolbar
        );


        /*
         * Al volver al menú actualizamos
         * el badge porque el DOM fue reconstruido.
         */
        this.refreshAlertBadge();
    }


    /*
     * =========================================================
     * BOTONES DE ICONOS
     * =========================================================
     */

    createIconButton({
        icon,
        title,
        view,
        badge = false
    }) {

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "tw3b-icon-button";

        button.title =
            title;

        button.setAttribute(
            "aria-label",
            title
        );


        const iconElement =
            document.createElement("span");

        iconElement.className =
            "tw3b-icon";

        iconElement.textContent =
            icon;


        button.appendChild(
            iconElement
        );


        if (badge) {

            const badgeElement =
                document.createElement("span");

            badgeElement.className =
                "tw3b-icon-badge";

            badgeElement.id =
                "tw3b-alert-count";

            badgeElement.textContent =
                "0";

            badgeElement.style.display =
                "none";


            button.appendChild(
                badgeElement
            );
        }


        button.addEventListener(
            "click",
            () => {

                this.navigate(
                    view
                );
            }
        );


        this.iconBar.appendChild(
            button
        );


        return button;
    }


    /*
     * =========================================================
     * BÚSQUEDA
     * =========================================================
     */

    handleSearch(query) {

        const searchModule =
            this.views.search;


        if (
            !searchModule ||
            typeof searchModule.onQuery !==
            "function"
        ) {

            return;
        }


        searchModule.onQuery(

            query,

            this.ctx,

            async (item) => {

                await this.selectSearchItem(
                    item
                );
            },

            this.searchInput
        );
    }


    /*
     * =========================================================
     * SELECCIÓN DE ARTÍCULO
     * =========================================================
     */

    async selectSearchItem(item) {

        if (!item) {
            return;
        }


        this.hideSuggestions();


        if (!this.ctx.scheduler) {

            console.warn(
                "[TornW3B] Scheduler todavía no está disponible."
            );

            return;
        }


        this.showLoading(
            item.name
        );


        try {

            console.log(
                `[TornW3B] Auditoría prioritaria: ${item.name}`
            );


            /*
             * El Scheduler es el único responsable
             * de decidir si utiliza cache o realiza
             * una nueva auditoría.
             */
            const result =
                await this.ctx.scheduler
                    .getOrAudit(item);


            if (!result) {

                this.showError(
                    item.name,
                    "Este artículo no puede ser auditado por Torn."
                );

                return;
            }


            /*
             * La auditoría ya fue obtenida.
             *
             * Se pasa directamente a SaleView
             * para evitar una segunda llamada
             * a Scheduler.getOrAudit().
             */
            await this.navigate(
                VIEWS.SALE,
                {
                    item,
                    audit: result
                }
            );


        } catch (error) {

            console.error(
                `[TornW3B] Error procesando ${item.name}:`,
                error
            );


            this.showError(
                item.name,
                error?.message ||
                "No se pudo auditar el artículo."
            );
        }
    }


    /*
     * =========================================================
     * LOADING
     * =========================================================
     */

    showLoading(itemName) {

        this.panelBody.innerHTML = `
            <div class="tw3b-loading">

                <div class="tw3b-card-title">
                    ${escapeHtml(itemName)}
                </div>

                <div class="tw3b-skeleton"></div>

                <div class="tw3b-loading-text">
                    🔄 Analizando mercado...
                </div>

            </div>
        `;
    }


    /*
     * =========================================================
     * ERROR
     * =========================================================
     */

    showError(
        itemName,
        message
    ) {

        this.panelBody.innerHTML = `

            <div class="tw3b-error-view">

                <div class="tw3b-card-title">
                    ${escapeHtml(itemName)}
                </div>

                <div class="tw3b-error">
                    ${escapeHtml(message)}
                </div>

                <button
                    type="button"
                    class="tw3b-button"
                    data-action="back-menu"
                >
                    ← Volver
                </button>

            </div>

        `;


        const back =
            this.panelBody.querySelector(
                '[data-action="back-menu"]'
            );


        if (back) {

            back.addEventListener(
                "click",
                () => this.renderMenu()
            );
        }
    }


    /*
     * =========================================================
     * NAVEGACIÓN
     * =========================================================
     */

    async navigate(
        viewName,
        params = {}
    ) {

        if (
            this.activeViewInstance &&
            typeof this.activeViewInstance.destroy ===
            "function"
        ) {

            this.activeViewInstance.destroy();
        }


        this.activeViewInstance =
            null;


        this.currentView =
            viewName;


        this.hideSuggestions();


        this.panelBody.innerHTML =
            "";


        if (
            viewName ===
            VIEWS.MENU
        ) {

            this.renderMenu();

            return;
        }


        const view =
            this.views[viewName];


        if (
            !view ||
            typeof view.render !==
            "function"
        ) {

            this.showError(
                "TornW3B",
                `Vista "${viewName}" no disponible.`
            );

            return;
        }


        /*
         * Botón volver.
         */

        const back =
            document.createElement("button");

        back.type =
            "button";

        back.className =
            "tw3b-back";

        back.innerHTML =
            "←";

        back.title =
            "Volver";

        back.setAttribute(
            "aria-label",
            "Volver"
        );


        back.addEventListener(
            "click",
            () => {

                this.navigate(
                    VIEWS.MENU
                );
            }
        );


        this.panelBody.appendChild(
            back
        );


        /*
         * Contenedor de la vista.
         */

        const container =
            document.createElement("div");

        container.className =
            "tw3b-view-container";


        this.panelBody.appendChild(
            container
        );


        /*
         * Renderizar vista.
         */

        this.activeViewInstance =
            await view.render(

                container,

                this.ctx,

                (
                    nextView,
                    nextParams
                ) => {

                    this.navigate(
                        nextView,
                        nextParams
                    );
                },

                params

            ) || null;
    }


    /*
     * =========================================================
     * SUGERENCIAS
     * =========================================================
     */

    hideSuggestions() {

        const suggestions =
            document.getElementById(
                "tw3b-suggestions"
            );


        if (suggestions) {

            suggestions.style.display =
                "none";
        }
    }


    /*
     * =========================================================
     * BADGE DE AUDITORÍA
     * =========================================================
     */

    async refreshAlertBadge() {

        if (!this.ctx.storage) {
            return;
        }


        try {

            const audits =
                await this.ctx.storage
                    .getAllAudits();


            const alertCount =
                Object.values(audits)
                    .filter(
                        audit =>
                            audit &&
                            (
                                audit.status ===
                                "RED" ||
                                audit.status ===
                                "YELLOW"
                            )
                    )
                    .length;


            const badge =
                this.panelBody.querySelector(
                    "#tw3b-alert-count"
                );


            if (badge) {

                badge.textContent =
                    String(alertCount);

                badge.style.display =
                    alertCount > 0
                        ? "flex"
                        : "none";
            }


            if (this.fab) {

                this.fab.classList.toggle(
                    "has-alerts",
                    alertCount > 0
                );
            }


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo actualizar badge:",
                error
            );
        }
    }
}


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


export {
    VIEWS
};