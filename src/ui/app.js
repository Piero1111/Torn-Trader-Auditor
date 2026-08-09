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

    /*
     * ctx contiene todas las dependencias ya
     * inicializadas por main.js:
     * { storage, pricelist, scheduler, history, auditor }
     *
     * views es un registro opcional para inyectar
     * los módulos de vista reales cuando existan
     * (saleView, auditView, historyView, settingsView).
     * Cada view debe exponer:
     *   render(container, ctx, navigate) → void | Promise<void>
     *   destroy?() → void   (opcional, limpieza de listeners/timers)
     */
    constructor(ctx, views = {}) {
        this.ctx = ctx;
        this.views = views;

        this.currentView = VIEWS.MENU;
        this.activeViewInstance = null;

        this.root = null;
        this.panel = null;
        this.panelBody = null;
        this.fab = null;
    }


    mount() {

        injectStyles();

        this.fab = document.createElement("button");
        this.fab.className = "tw3b-fab";
        this.fab.textContent = "💰";
        this.fab.addEventListener("click", () => this.toggle());

        this.panel = document.createElement("div");
        this.panel.className = "tw3b-panel";

        const header = document.createElement("div");
        header.className = "tw3b-panel-header";
        header.innerHTML = `<span>TornW3B Trader</span>`;

        const closeBtn = document.createElement("span");
        closeBtn.textContent = "✕";
        closeBtn.style.cursor = "pointer";
        closeBtn.addEventListener("click", () => this.close());
        header.appendChild(closeBtn);

        this.panelBody = document.createElement("div");
        this.panelBody.className = "tw3b-panel-body";

        this.panel.appendChild(header);
        this.panel.appendChild(this.panelBody);

        document.body.appendChild(this.fab);
        document.body.appendChild(this.panel);

        this.navigate(VIEWS.MENU);
        this.refreshAlertBadge();
    }


    toggle() {

        if (this.panel.classList.contains("open")) {
            this.close();
        } else {
            this.open();
        }
    }


    open() {
        this.panel.classList.add("open");
    }


    close() {
        this.panel.classList.remove("open");
    }


    /*
     * Navega a una vista. Si la vista actual
     * tiene destroy(), se llama antes de salir
     * (para limpiar listeners, intervalos, etc).
     */
    async navigate(viewName, params = {}) {

        if (
            this.activeViewInstance &&
            typeof this.activeViewInstance.destroy === "function"
        ) {
            this.activeViewInstance.destroy();
        }

        this.currentView = viewName;
        this.panelBody.innerHTML = "";

        if (viewName === VIEWS.MENU) {
            this.renderMenu();
            return;
        }

        const view = this.views[viewName];

        if (!view || typeof view.render !== "function") {

            this.panelBody.innerHTML = `
                <div class="tw3b-error">
                    Vista "${viewName}" no disponible todavía.
                </div>
                <span class="tw3b-back" data-action="back">← Volver</span>
            `;

            this.bindBack();
            return;
        }

        const back = document.createElement("span");
        back.className = "tw3b-back";
        back.textContent = "← Volver";
        back.addEventListener(
            "click",
            () => this.navigate(VIEWS.MENU)
        );

        this.panelBody.appendChild(back);

        const container = document.createElement("div");
        this.panelBody.appendChild(container);

        this.activeViewInstance =
            await view.render(
                container,
                this.ctx,
                (nextView, nextParams) =>
                    this.navigate(nextView, nextParams),
            params
            ) || null;
    }


    bindBack() {

        const back =
            this.panelBody.querySelector('[data-action="back"]');

        if (back) {
            back.addEventListener(
                "click",
                () => this.navigate(VIEWS.MENU)
            );
        }
    }


    renderMenu() {

    const searchInput =
        document.createElement("input");

    searchInput.className =
        "tw3b-search";

    searchInput.type =
        "text";

    searchInput.placeholder =
        "🔎 Buscar artículo...";


    searchInput.addEventListener(
        "input",
        (e) => {

            const query =
                e.target.value;


            if (
                this.views.search &&
                this.views.search.onQuery
            ) {

                this.views.search.onQuery(
                    query,
                    this.ctx,

                    (item) => {

                        this.navigate(
                            VIEWS.SALE,
                            { item }
                        );
                    },

                    /*
                     * IMPORTANTE:
                     * ahora sí pasamos el input
                     * como anchorEl.
                     */
                    searchInput
                );
            }
        }
    );


    this.panelBody.appendChild(
        searchInput
    );


    const items = [
        {
            label: "Venta",
            view: VIEWS.SALE
        },
        {
            label: "Auditoría",
            view: VIEWS.AUDIT,
            badge: true
        },
        {
            label: "Historial",
            view: VIEWS.HISTORY
        },
        {
            label: "Configuración",
            view: VIEWS.SETTINGS
        }
    ];


    for (const item of items) {

        const el =
            document.createElement("div");

        el.className =
            "tw3b-menu-item";


        const label =
            document.createElement("span");

        label.textContent =
            item.label;

        el.appendChild(label);


        if (item.badge) {

            const badge =
                document.createElement("span");

            badge.className =
                "tw3b-badge tw3b-badge-red";

            badge.id =
                "tw3b-alert-count";

            badge.textContent =
                "0";

            badge.style.display =
                "none";

            el.appendChild(badge);
        }


        el.addEventListener(
            "click",
            () => this.navigate(item.view)
        );


        this.panelBody.appendChild(el);
    }
}


    /*
     * Cuenta items YELLOW/RED (sección 22) y
     * actualiza tanto el badge del menú como
     * el punto rojo sobre el FAB.
     *
     * Debe llamarse después de cada ciclo de
     * auditoría (via onAuditComplete del scheduler
     * en main.js), no solo al montar.
     */
    async refreshAlertBadge() {

        const audits =
            await this.ctx.storage.getAllAudits();

        const alertCount = Object.values(audits)
            .filter(a => a.status === "RED" || a.status === "YELLOW")
            .length;

        const badge =
            this.panelBody.querySelector("#tw3b-alert-count");

        if (badge) {
            badge.textContent = String(alertCount);
            badge.style.display = alertCount > 0 ? "inline-block" : "none";
        }

        this.fab.classList.toggle("has-alerts", alertCount > 0);
    }
}


export { VIEWS };