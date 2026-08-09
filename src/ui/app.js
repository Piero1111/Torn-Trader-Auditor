
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


        /*
         * =====================================================
         * FAB
         * =====================================================
         */

        this.fabPositionKey =
            "tornw3b-fab-position";

        this.isDraggingFab =
            false;

        this.fabDragOffsetX =
            0;

        this.fabDragOffsetY =
            0;

        this.fabWasDragged =
            false;

        this.fabPointerMoved =
            false;

    }


    /*
     * =========================================================
     * MOUNT
     * =========================================================
     */

    mount() {

        injectStyles();


        /*
         * =====================================================
         * FAB
         * =====================================================
         */

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


        /*
         * =====================================================
         * PANEL
         * =====================================================
         */

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


        /*
         * IMPORTANTE:
         *
         * Primero insertamos los elementos
         * en el DOM y después recuperamos
         * la posición guardada.
         */

        document.body.appendChild(
            this.fab
        );

        document.body.appendChild(
            this.panel
        );


        /*
         * Ahora sí podemos recuperar
         * correctamente la posición.
         */

        this.loadFabPosition();


        /*
         * Activar arrastre.
         */

        this.enableFabDragging();


        /*
         * =====================================================
         * RESIZE
         * =====================================================
         */

        window.addEventListener(
            "resize",
            () => {

                this.keepFabInsideViewport();

                if (
                    this.panel.classList.contains(
                        "open"
                    )
                ) {

                    this.updatePanelPosition();

                }

            }
        );


        /*
         * =====================================================
         * MENÚ INICIAL
         * =====================================================
         */

        this.renderMenu();

        this.refreshAlertBadge();

    }


    /*
     * =========================================================
     * POSICIÓN DEL FAB
     * =========================================================
     */

    loadFabPosition() {

        if (!this.fab) {
            return;
        }


        try {

            const raw =
                localStorage.getItem(
                    this.fabPositionKey
                );


            /*
             * Si no existe una posición guardada,
             * dejamos que CSS utilice su posición
             * inicial.
             */

            if (!raw) {
                return;
            }


            const position =
                JSON.parse(raw);


            const left =
                Number(position?.left);

            const top =
                Number(position?.top);


            if (
                !Number.isFinite(left) ||
                !Number.isFinite(top)
            ) {

                return;

            }


            /*
             * Aplicar posición absoluta
             * respecto al viewport.
             */

            this.fab.style.left =
                `${left}px`;

            this.fab.style.top =
                `${top}px`;

            this.fab.style.right =
                "auto";

            this.fab.style.bottom =
                "auto";


            /*
             * Comprobar que siga dentro
             * de la pantalla.
             */

            this.keepFabInsideViewport();


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo recuperar la posición del botón:",
                error
            );

        }

    }


    saveFabPosition() {

        if (!this.fab) {
            return;
        }


        const rect =
            this.fab.getBoundingClientRect();


        try {

            localStorage.setItem(
                this.fabPositionKey,
                JSON.stringify({

                    left:
                        Math.round(
                            rect.left
                        ),

                    top:
                        Math.round(
                            rect.top
                        )

                })
            );


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo guardar la posición del botón:",
                error
            );

        }

    }


    keepFabInsideViewport() {

        if (!this.fab) {
            return;
        }


        const rect =
            this.fab.getBoundingClientRect();


        const width =
            this.fab.offsetWidth;

        const height =
            this.fab.offsetHeight;


        /*
         * Solo hacemos esto si el FAB
         * tiene una posición manual.
         */

        const hasManualPosition =
            this.fab.style.left !== "" &&
            this.fab.style.top !== "";


        if (!hasManualPosition) {
            return;
        }


        let left =
            rect.left;

        let top =
            rect.top;


        const maxLeft =
            Math.max(
                0,
                window.innerWidth -
                width
            );


        const maxTop =
            Math.max(
                0,
                window.innerHeight -
                height
            );


        left =
            Math.max(
                0,
                Math.min(
                    left,
                    maxLeft
                )
            );


        top =
            Math.max(
                0,
                Math.min(
                    top,
                    maxTop
                )
            );


        this.fab.style.left =
            `${Math.round(left)}px`;

        this.fab.style.top =
            `${Math.round(top)}px`;

        this.fab.style.right =
            "auto";

        this.fab.style.bottom =
            "auto";


        this.saveFabPosition();

    }


    /*
     * =========================================================
     * ARRASTRE DEL FAB
     * =========================================================
     */

    enableFabDragging() {

    let pointerMoved = false;

    let startX = 0;
    let startY = 0;

    const DRAG_THRESHOLD = 6;


    this.fab.addEventListener(
        "pointerdown",
        event => {

            /*
             * Mouse:
             * solamente botón izquierdo.
             */

            if (
                event.pointerType === "mouse" &&
                event.button !== 0
            ) {

                return;
            }


            /*
             * Evitar que el navegador
             * convierta el gesto táctil
             * en scroll.
             */

            event.preventDefault();


            this.isDraggingFab =
                true;

            pointerMoved =
                false;

            this.fabWasDragged =
                false;


            startX =
                event.clientX;

            startY =
                event.clientY;


            const rect =
                this.fab.getBoundingClientRect();


            this.fabDragOffsetX =
                event.clientX -
                rect.left;


            this.fabDragOffsetY =
                event.clientY -
                rect.top;


            /*
             * Convertir la posición actual
             * a left/top.
             */

            this.fab.style.left =
                `${rect.left}px`;

            this.fab.style.top =
                `${rect.top}px`;

            this.fab.style.right =
                "auto";

            this.fab.style.bottom =
                "auto";


            /*
             * Capturar el pointer.
             */

            try {

                this.fab.setPointerCapture(
                    event.pointerId
                );

            } catch {
                // Algunos navegadores móviles
                // pueden no soportarlo.
            }
        },
        {
            passive: false
        }
    );


    this.fab.addEventListener(
        "pointermove",
        event => {

            if (
                !this.isDraggingFab
            ) {

                return;
            }


            event.preventDefault();


            /*
             * Determinar si realmente
             * comenzó un arrastre.
             */

            const deltaX =
                event.clientX -
                startX;

            const deltaY =
                event.clientY -
                startY;


            const distance =
                Math.sqrt(
                    deltaX * deltaX +
                    deltaY * deltaY
                );


            if (
                distance >=
                DRAG_THRESHOLD
            ) {

                pointerMoved =
                    true;

                this.fabWasDragged =
                    true;
            }


            /*
             * Si todavía no superó el
             * umbral, no mover nada.
             */

            if (
                !pointerMoved
            ) {

                return;
            }


            const width =
                this.fab.offsetWidth;

            const height =
                this.fab.offsetHeight;


            let left =
                event.clientX -
                this.fabDragOffsetX;


            let top =
                event.clientY -
                this.fabDragOffsetY;


            /*
             * Mantener el botón dentro
             * del viewport.
             */

            left =
                Math.max(
                    0,
                    Math.min(
                        left,
                        window.innerWidth -
                        width
                    )
                );


            top =
                Math.max(
                    0,
                    Math.min(
                        top,
                        window.innerHeight -
                        height
                    )
                );


            this.fab.style.left =
                `${left}px`;

            this.fab.style.top =
                `${top}px`;

            this.fab.style.right =
                "auto";

            this.fab.style.bottom =
                "auto";


            /*
             * El panel acompaña al FAB.
             */

            if (
                this.panel &&
                this.panel.classList.contains(
                    "open"
                )
            ) {

                this.updatePanelPosition();
            }
        },
        {
            passive: false
        }
    );


    this.fab.addEventListener(
        "pointerup",
        event => {

            if (
                !this.isDraggingFab
            ) {

                return;
            }


            event.preventDefault();


            this.isDraggingFab =
                false;


            try {

                this.fab.releasePointerCapture(
                    event.pointerId
                );

            } catch {
                // Ignorar.
            }


            /*
             * Solo guardar si realmente
             * hubo movimiento.
             */

            if (
                pointerMoved
            ) {

                this.saveFabPosition();


                if (
                    this.panel &&
                    this.panel.classList.contains(
                        "open"
                    )
                ) {

                    this.updatePanelPosition();
                }


                /*
                 * Evitar que el click generado
                 * después del pointerup abra
                 * accidentalmente el panel.
                 */

                setTimeout(
                    () => {

                        this.fabWasDragged =
                            false;

                    },
                    150
                );
            }
        },
        {
            passive: false
        }
    );


    this.fab.addEventListener(
        "pointercancel",
        event => {

            if (
                !this.isDraggingFab
            ) {

                return;
            }


            event.preventDefault();


            this.isDraggingFab =
                false;


            if (
                pointerMoved
            ) {

                this.saveFabPosition();
            }


            pointerMoved =
                false;

            this.fabWasDragged =
                false;
        },
        {
            passive: false
        }
    );


    /*
     * Click separado del arrastre.
     */

    this.fab.addEventListener(
        "click",
        event => {

            if (
                this.fabWasDragged
            ) {

                event.preventDefault();
                event.stopPropagation();

                return;
            }


            this.toggle();
        }
    );
}


    /*
     * =========================================================
     * POSICIÓN DEL PANEL
     * =========================================================
     */

    updatePanelPosition() {

        if (
            !this.fab ||
            !this.panel
        ) {

            return;

        }


        const fabRect =
            this.fab.getBoundingClientRect();


        /*
         * El panel debe estar abierto para
         * obtener sus dimensiones reales.
         */

        const panelWidth =
            this.panel.offsetWidth ||
            340;

        const panelHeight =
            this.panel.offsetHeight ||
            400;


        const gap =
            10;

        const margin =
            8;


        /*
         * =====================================================
         * HORIZONTAL
         * =====================================================
         */

        let left =
            fabRect.left;


        /*
         * Si el panel se sale por la derecha,
         * desplazamos su posición hacia la izquierda.
         */

        left =
            Math.min(
                left,
                window.innerWidth -
                panelWidth -
                margin
            );


        left =
            Math.max(
                margin,
                left
            );


        /*
         * =====================================================
         * VERTICAL
         * =====================================================
         *
         * Intentamos primero colocarlo debajo.
         * Si no entra, lo colocamos arriba.
         */

        let top;


        const spaceBelow =
            window.innerHeight -
            fabRect.bottom -
            gap -
            margin;


        const spaceAbove =
            fabRect.top -
            gap -
            margin;


        if (
            spaceBelow >= panelHeight
        ) {

            top =
                fabRect.bottom +
                gap;

        } else if (
            spaceAbove >= panelHeight
        ) {

            top =
                fabRect.top -
                panelHeight -
                gap;

        } else {

            /*
             * Si no entra ni arriba ni abajo,
             * lo mantenemos dentro del viewport.
             */

            top =
                Math.max(
                    margin,
                    Math.min(
                        fabRect.bottom +
                        gap,
                        window.innerHeight -
                        panelHeight -
                        margin
                    )
                );

        }


        this.panel.style.left =
            `${Math.round(left)}px`;

        this.panel.style.top =
            `${Math.round(top)}px`;

        this.panel.style.right =
            "auto";

        this.panel.style.bottom =
            "auto";

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


        requestAnimationFrame(
            () => {

                this.updatePanelPosition();

            }
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
            event => {

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

            async item => {

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
         * =====================================================
         * BOTÓN VOLVER
         * =====================================================
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
         * =====================================================
         * CONTENEDOR DE VISTA
         * =====================================================
         */

        const container =
            document.createElement("div");

        container.className =
            "tw3b-view-container";


        this.panelBody.appendChild(
            container
        );


        /*
         * =====================================================
         * RENDERIZAR VISTA
         * =====================================================
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


        /*
         * Recalcular posición porque
         * la altura del panel puede haber cambiado.
         */

        if (
            this.panel.classList.contains(
                "open"
            )
        ) {

            requestAnimationFrame(
                () => {

                    this.updatePanelPosition();

                }
            );

        }

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
                Object.values(
                    audits || {}
                )
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
        document.createElement(
            "div"
        );


    div.textContent =
        String(str ?? "");


    return div.innerHTML;

}


export {
    VIEWS
};
