/*
 * =============================================================
 * STYLES.JS
 * =============================================================
 *
 * Base visual compartida por toda la interfaz TornW3B.
 *
 * Responsabilidades:
 *
 * 1. Definir constantes de color, tipografía y espaciado.
 * 2. Inyectar el CSS una única vez en la página de TornPDA.
 * 3. Exponer funciones "fábrica" de DOM reutilizables:
 *
 *      - createHeader()
 *      - createRow()
 *      - createCard()
 *      - createButton()
 *      - createStatusBadge()
 *      - createSectionTitle()
 *      - createDivider()
 *      - createEmptyState()
 *
 * Ninguna vista debe escribir CSS propio suelto: todo pasa
 * por aquí para mantener consistencia entre Venta, Auditor
 * e Historial.
 *
 * Prefijo de clases: "tw3b-" (para no chocar con TornPDA).
 * =============================================================
 */


/* =============================================================
 * COLORES
 * ============================================================= */

export const COLORS = {

    background:
        "#12141a",

    surface:
        "#1c1f27",

    surfaceAlt:
        "#242833",

    border:
        "#2e323d",

    textPrimary:
        "#f5f6f8",

    textSecondary:
        "#9aa0ac",

    textMuted:
        "#6b7280",

    accent:
        "#4dabf7",

    accentStrong:
        "#1c7ed6",

    green:
        "#37b24d",

    yellow:
        "#f2c94c",

    red:
        "#e64953",

    greenBg:
        "rgba(55, 178, 77, 0.12)",

    yellowBg:
        "rgba(242, 201, 76, 0.12)",

    redBg:
        "rgba(230, 73, 83, 0.12)"
};


/* =============================================================
 * ESPACIADO
 * ============================================================= */

export const SPACING = {

    xs: "4px",

    sm: "8px",

    md: "12px",

    lg: "16px",

    xl: "24px"
};


/* =============================================================
 * RADIOS / SOMBRAS
 * ============================================================= */

export const RADIUS = {

    sm: "8px",

    md: "12px",

    lg: "16px",

    pill: "999px"
};


/* =============================================================
 * INYECCIÓN DE CSS
 * =============================================================
 *
 * Se inyecta una sola vez. Llamadas posteriores no duplican
 * el <style>.
 */

let stylesInjected =
    false;


export function injectStyles() {

    if (stylesInjected) {
        return;
    }

    stylesInjected =
        true;

    const style =
        document.createElement("style");

    style.id =
        "tw3b-styles";

    style.textContent = `

        .tw3b-root {
            font-family: -apple-system, BlinkMacSystemFont,
                "Segoe UI", Roboto, sans-serif;
            color: ${COLORS.textPrimary};
            box-sizing: border-box;
        }

        .tw3b-root * {
            box-sizing: border-box;
        }

        /* -----------------------------------------------------
         * PANTALLA
         * ----------------------------------------------------- */

        .tw3b-screen {
            display: flex;
            flex-direction: column;
            width: 100%;
            min-height: 0;
            background: ${COLORS.background};
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        /* -----------------------------------------------------
         * HEADER
         * ----------------------------------------------------- */

        .tw3b-header {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.md} ${SPACING.lg};
            background: ${COLORS.surface};
            border-bottom: 1px solid ${COLORS.border};
            position: sticky;
            top: 0;
            z-index: 5;
        }

        .tw3b-header-back {
            background: none;
            border: none;
            color: ${COLORS.accent};
            font-size: 18px;
            padding: 4px 6px;
            cursor: pointer;
            line-height: 1;
        }

        .tw3b-header-title {
            font-size: 16px;
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* -----------------------------------------------------
         * CONTENIDO
         * ----------------------------------------------------- */

        .tw3b-content {
            padding: ${SPACING.lg};
            display: flex;
            flex-direction: column;
            gap: ${SPACING.sm};
        }

        /* -----------------------------------------------------
         * FILAS (label / valor)
         * ----------------------------------------------------- */

        .tw3b-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: ${SPACING.sm};
            padding: 6px 0;
        }

        .tw3b-row-label {
            font-size: 13px;
            color: ${COLORS.textSecondary};
        }

        .tw3b-row-value {
            font-size: 15px;
            font-weight: 600;
            text-align: right;
        }

        .tw3b-row-value.tw3b-emph {
            font-size: 20px;
        }

        /* -----------------------------------------------------
         * DIVIDER
         * ----------------------------------------------------- */

        .tw3b-divider {
            height: 1px;
            background: ${COLORS.border};
            margin: ${SPACING.sm} 0;
            border: none;
        }

        /* -----------------------------------------------------
         * SECTION TITLE
         * ----------------------------------------------------- */

        .tw3b-section-title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.04em;
            color: ${COLORS.textMuted};
            text-transform: uppercase;
            margin: ${SPACING.sm} 0 2px 0;
        }

        /* -----------------------------------------------------
         * TARJETAS DE NAVEGACIÓN (MERCADO / COMPETENCIA / ...)
         * ----------------------------------------------------- */

        .tw3b-card {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.md};
            padding: ${SPACING.md} ${SPACING.lg};
            cursor: pointer;
            transition: background 0.15s ease;
        }

        .tw3b-card:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-card-icon {
            font-size: 18px;
        }

        .tw3b-card-label {
            flex: 1;
            font-size: 14px;
            font-weight: 600;
        }

        .tw3b-card-value {
            font-size: 13px;
            color: ${COLORS.textSecondary};
        }

        .tw3b-card-chevron {
            color: ${COLORS.textMuted};
            font-size: 14px;
        }

        /* -----------------------------------------------------
         * LISTA (auditor / historial / búsqueda)
         * ----------------------------------------------------- */

        .tw3b-list-item {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.md} 0;
            border-bottom: 1px solid ${COLORS.border};
            cursor: pointer;
        }

        .tw3b-list-item:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-list-item-name {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tw3b-list-item-chevron {
            color: ${COLORS.textMuted};
        }

        /* -----------------------------------------------------
         * BOTONES
         * ----------------------------------------------------- */

        .tw3b-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 12px ${SPACING.lg};
            border-radius: ${RADIUS.md};
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.02em;
            border: none;
            cursor: pointer;
            text-transform: uppercase;
        }

        .tw3b-btn-primary {
            background: ${COLORS.accent};
            color: #0a1620;
        }

        .tw3b-btn-primary:active {
            background: ${COLORS.accentStrong};
        }

        .tw3b-btn-secondary {
            background: ${COLORS.surface};
            color: ${COLORS.textPrimary};
            border: 1px solid ${COLORS.border};
        }

        .tw3b-btn-secondary:active {
            background: ${COLORS.surfaceAlt};
        }

        .tw3b-btn:disabled {
            opacity: 0.5;
            cursor: default;
        }

        /* -----------------------------------------------------
         * BADGES DE ESTADO
         * ----------------------------------------------------- */

        .tw3b-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px ${SPACING.md};
            border-radius: ${RADIUS.pill};
            font-size: 13px;
            font-weight: 700;
            width: fit-content;
        }

        .tw3b-badge-green {
            background: ${COLORS.greenBg};
            color: ${COLORS.green};
        }

        .tw3b-badge-yellow {
            background: ${COLORS.yellowBg};
            color: ${COLORS.yellow};
        }

        .tw3b-badge-red {
            background: ${COLORS.redBg};
            color: ${COLORS.red};
        }

        /* -----------------------------------------------------
         * BÚSQUEDA
         * ----------------------------------------------------- */

        .tw3b-search-wrap {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.pill};
            padding: 10px ${SPACING.lg};
        }

        .tw3b-search-input {
            flex: 1;
            background: none;
            border: none;
            outline: none;
            color: ${COLORS.textPrimary};
            font-size: 14px;
        }

        .tw3b-search-input::placeholder {
            color: ${COLORS.textMuted};
        }

        /* -----------------------------------------------------
         * ESTADO VACÍO
         * ----------------------------------------------------- */

        .tw3b-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: ${SPACING.sm};
            padding: ${SPACING.xl};
            color: ${COLORS.textMuted};
            font-size: 13px;
            text-align: center;
        }
        /* -----------------------------------------------------
         * QUICKBAR (menú principal flotante, sigue al FAB)
         * ----------------------------------------------------- */

        .tw3b-quickbar {
            position: fixed;
            z-index: 999998;
        }

        .tw3b-quickbar-bar {
            display: flex;
            align-items: center;
            gap: ${SPACING.sm};
            width: 100%;
            padding: 8px ${SPACING.md};
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.pill};
            box-shadow: 0 4px 16px rgba(0,0,0,0.45);
        }

        .tw3b-quickbar-dropdown {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            right: 0;
            max-height: 260px;
            overflow-y: auto;
            background: ${COLORS.surface};
            border: 1px solid ${COLORS.border};
            border-radius: ${RADIUS.md};
            box-shadow: 0 4px 16px rgba(0,0,0,0.45);
            padding: 4px 12px;
        }

        /* -----------------------------------------------------
         * FAB
         * ----------------------------------------------------- */

        .tw3b-fab {
            position: fixed;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${COLORS.accentStrong};
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            z-index: 999999;
            cursor: pointer;
            user-select: none;
            touch-action: none;
        }

        .tw3b-overlay {
            position: fixed;
            inset: 0;
            z-index: 999998;
            background: rgba(0, 0, 0, 0.35);
        }

        .tw3b-panel {
            position: fixed;
            width: 100%;
            max-width: 440px;
            max-height: 80vh;
            background: ${COLORS.background};
            border-radius: ${RADIUS.lg};
            box-shadow: 0 8px 28px rgba(0,0,0,0.5);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* -----------------------------------------------------
         * TABLA DE DISTRIBUCIÓN
         * ----------------------------------------------------- */

        .tw3b-dist-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            padding: 4px 0;
            color: ${COLORS.textSecondary};
        }

        .tw3b-dist-row.tw3b-dist-included {
            color: ${COLORS.textPrimary};
            font-weight: 600;
        }
    `;

    document.head.appendChild(
        style
    );
}


/* =============================================================
 * FORMATEO
 * ============================================================= */

export function formatMoney(value) {

    const numeric =
        Number(value);

    if (!Number.isFinite(numeric)) {
        return "—";
    }

    return "$" + Math.round(numeric)
        .toLocaleString("en-US");
}


export function formatPercent(value, { signed = false } = {}) {

    const numeric =
        Number(value);

    if (!Number.isFinite(numeric)) {
        return "—";
    }

    const percent =
        numeric * 100;

    const sign =
        signed && percent > 0
            ? "+"
            : "";

    return `${sign}${percent.toFixed(1)}%`;
}


export function formatCompactNumber(value) {

    const numeric =
        Number(value);

    if (!Number.isFinite(numeric)) {
        return "—";
    }

    return Math.round(numeric)
        .toLocaleString("en-US");
}


/* =============================================================
 * ESTADO (GREEN / YELLOW / RED)
 * ============================================================= */

export function statusEmoji(status) {

    switch (status) {

        case "GREEN":
            return "🟢";

        case "YELLOW":
            return "🟡";

        case "RED":
            return "🔴";

        default:
            return "⚪";
    }
}


export function statusBadgeClass(status) {

    switch (status) {

        case "GREEN":
            return "tw3b-badge-green";

        case "YELLOW":
            return "tw3b-badge-yellow";

        case "RED":
            return "tw3b-badge-red";

        default:
            return "tw3b-badge-yellow";
    }
}


export function statusLabel(status) {

    switch (status) {

        case "GREEN":
            return "PRECIO CORRECTO";

        case "YELLOW":
            return "REVISAR PRECIO";

        case "RED":
            return "COMPRA RECOMENDADA";

        default:
            return "SIN DATOS";
    }
}


/* =============================================================
 * HELPERS DE CREACIÓN DE DOM
 * =============================================================
 *
 * `el(tag, props, children)` es el builder genérico del que
 * dependen el resto de fábricas.
 *
 * props acepta: className, text, html, style (objeto),
 * attrs (objeto), on (objeto de eventos), etc.
 */

export function el(tag, props = {}, children = []) {

    const node =
        document.createElement(tag);

    const {
        className,
        text,
        html,
        style,
        attrs,
        on
    } = props;

    if (className) {
        node.className = className;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    if (html !== undefined) {
        node.innerHTML = html;
    }

    if (style) {

        Object.assign(
            node.style,
            style
        );
    }

    if (attrs) {

        for (
            const [key, value]
            of Object.entries(attrs)
        ) {

            node.setAttribute(
                key,
                value
            );
        }
    }

    if (on) {

        for (
            const [event, handler]
            of Object.entries(on)
        ) {

            node.addEventListener(
                event,
                handler
            );
        }
    }

    const list =
        Array.isArray(children)
            ? children
            : [children];

    for (const child of list) {

        if (!child) {
            continue;
        }

        node.appendChild(
            child
        );
    }

    return node;
}


/* =============================================================
 * HEADER CON BOTÓN "ATRÁS"
 * ============================================================= */

export function createHeader({
    title,
    onBack
}) {

    const backButton =
        onBack
            ? el("button", {

                className:
                    "tw3b-header-back",

                text:
                    "←",

                on: {
                    click: onBack
                }
            })
            : null;

    return el("div", {

        className:
            "tw3b-header"

    }, [

        backButton,

        el("div", {

            className:
                "tw3b-header-title",

            text:
                title
        })
    ]);
}


/* =============================================================
 * FILA LABEL / VALOR
 * ============================================================= */

export function createRow({
    label,
    value,
    emphasis = false,
    valueColor = null
}) {

    const valueNode =
        el("div", {

            className:
                "tw3b-row-value" +
                (emphasis ? " tw3b-emph" : ""),

            text:
                value
        });

    if (valueColor) {

        valueNode.style.color =
            valueColor;
    }

    return el("div", {

        className:
            "tw3b-row"

    }, [

        el("div", {

            className:
                "tw3b-row-label",

            text:
                label
        }),

        valueNode
    ]);
}


/* =============================================================
 * TÍTULO DE SECCIÓN
 * ============================================================= */

export function createSectionTitle(text) {

    return el("div", {

        className:
            "tw3b-section-title",

        text
    });
}


/* =============================================================
 * DIVIDER
 * ============================================================= */

export function createDivider() {

    return el("hr", {

        className:
            "tw3b-divider"
    });
}


/* =============================================================
 * TARJETA DE NAVEGACIÓN
 * =============================================================
 *
 * Usada para los botones:
 *
 *   📊 MERCADO
 *   🏪 COMPETENCIA
 *   📚 APRENDIZAJE
 *   🕘 HISTORIAL
 */

export function createCard({
    icon,
    label,
    value = null,
    onClick
}) {

    return el("div", {

        className:
            "tw3b-card",

        attrs: {
            role: "button"
        },

        on: {
            click: onClick
        }

    }, [

        el("span", {

            className:
                "tw3b-card-icon",

            text:
                icon
        }),

        el("div", {

            className:
                "tw3b-card-label",

            text:
                label
        }),

        value
            ? el("div", {

                className:
                    "tw3b-card-value",

                text:
                    value
            })
            : null,

        el("span", {

            className:
                "tw3b-card-chevron",

            text:
                "›"
        })
    ]);
}


/* =============================================================
 * ELEMENTO DE LISTA (auditor / historial / búsqueda)
 * ============================================================= */

export function createListItem({
    label,
    prefix = null,
    onClick
}) {

    return el("div", {

        className:
            "tw3b-list-item",

        attrs: {
            role: "button"
        },

        on: {
            click: onClick
        }

    }, [

        prefix
            ? el("span", {
                text: prefix
            })
            : null,

        el("div", {

            className:
                "tw3b-list-item-name",

            text:
                label
        }),

        el("span", {

            className:
                "tw3b-list-item-chevron",

            text:
                "›"
        })
    ]);
}


/* =============================================================
 * BOTÓN
 * ============================================================= */

export function createButton({
    label,
    onClick,
    variant = "primary",
    disabled = false
}) {

    return el("button", {

        className:
            "tw3b-btn " +
            (
                variant === "primary"
                    ? "tw3b-btn-primary"
                    : "tw3b-btn-secondary"
            ),

        text:
            label,

        attrs:
            disabled
                ? { disabled: "true" }
                : {},

        on: {
            click: onClick
        }
    });
}


/* =============================================================
 * BADGE DE ESTADO
 * ============================================================= */

export function createStatusBadge(status) {

    return el("div", {

        className:
            "tw3b-badge " +
            statusBadgeClass(status),

        text:
            `${statusEmoji(status)} ${statusLabel(status)}`
    });
}


/* =============================================================
 * ESTADO VACÍO
 * ============================================================= */

export function createEmptyState(message) {

    return el("div", {

        className:
            "tw3b-empty",

        text:
            message
    });
}


/* =============================================================
 * CONTENEDOR DE PANTALLA
 * =============================================================
 *
 * Toda vista debe envolver su contenido con esto para heredar
 * fondo, scroll y clase raíz "tw3b-root".
 */

export function createScreen(children = []) {

    return el("div", {

        className:
            "tw3b-root tw3b-screen"

    }, children);
}


export function createContent(children = []) {

    return el("div", {

        className:
            "tw3b-content"

    }, children);
}