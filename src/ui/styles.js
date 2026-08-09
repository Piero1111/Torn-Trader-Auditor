
export const STYLE_ID = "tornw3b-styles";

export function injectStyles() {

    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        STYLE_ID;


    style.textContent = `

        :root {
            --tw3b-bg: #14161c;
            --tw3b-surface: #1c1f28;
            --tw3b-surface-hover: #242832;
            --tw3b-border: #2c3140;
            --tw3b-text: #e6e8ec;
            --tw3b-text-muted: #8a8f9c;

            --tw3b-green: #2fbf71;
            --tw3b-green-bg: rgba(47, 191, 113, 0.12);

            --tw3b-yellow: #e0b23e;
            --tw3b-yellow-bg: rgba(224, 178, 62, 0.12);

            --tw3b-red: #e0473e;
            --tw3b-red-bg: rgba(224, 71, 62, 0.12);

            --tw3b-accent: #4f8cff;

            --tw3b-radius: 10px;
            --tw3b-radius-sm: 6px;

            --tw3b-shadow:
                0 8px 24px rgba(0, 0, 0, 0.35);
        }


        /* =====================================================
         * FAB
         * ===================================================== */

        .tw3b-fab {

            position: fixed;

            /*
             * La posición real será establecida
             * por App mediante left/top.
             *
             * Estas variables solamente sirven
             * como posición inicial.
             */
            left: auto;
            top: auto;

            right: 20px;
            bottom: 20px;

            width: 52px;
            height: 52px;

            border-radius: 50%;

            background:
                var(--tw3b-accent);

            color: #fff;

            display: flex;
            align-items: center;
            justify-content: center;

            font-size: 22px;

            border: none;

            cursor: grab;

            box-shadow:
                var(--tw3b-shadow);

            z-index: 99998;
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;

            transition:
                transform 0.15s ease,
                box-shadow 0.15s ease;
        }


        .tw3b-fab:active {
            cursor: grabbing;
        }


        .tw3b-fab:hover {
            transform: scale(1.06);
        }


        /*
         * Cuando App está moviendo el botón,
         * evitamos animaciones que puedan
         * interferir con el movimiento.
         */
        .tw3b-fab.tw3b-dragging {
            cursor: grabbing;
            transition: none;
            transform: none;
        }


        .tw3b-fab.has-alerts::after {

            content: "";

            position: absolute;

            top: 4px;
            right: 4px;

            width: 10px;
            height: 10px;

            border-radius: 50%;

            background:
                var(--tw3b-red);

            border:
                2px solid var(--tw3b-bg);
        }


        /* =====================================================
         * PANEL
         * ===================================================== */

        .tw3b-panel {

            position: fixed;

            /*
             * App establece left/top dinámicamente
             * para que el panel permanezca junto
             * al botón flotante.
             */
            left: auto;
            top: auto;

            width: 340px;

            max-height: 70vh;

            background:
                var(--tw3b-surface);

            border:
                1px solid var(--tw3b-border);

            border-radius:
                var(--tw3b-radius);

            box-shadow:
                var(--tw3b-shadow);

            color:
                var(--tw3b-text);

            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Roboto,
                sans-serif;

            font-size:
                13px;

            display:
                flex;

            flex-direction:
                column;

            overflow:
                hidden;

            z-index:
                99999;

            opacity:
                0;

            transform:
                translateY(8px);

            transition:
                opacity 0.15s ease,
                transform 0.15s ease;

            pointer-events:
                none;
        }


        .tw3b-panel.open {

            opacity:
                1;

            transform:
                translateY(0);

            pointer-events:
                auto;
        }


        /*
         * Evita que el panel se salga de la
         * pantalla cuando el FAB está cerca
         * de un borde.
         */
        .tw3b-panel.tw3b-panel-left {
            transform-origin: right center;
        }


        .tw3b-panel.tw3b-panel-right {
            transform-origin: left center;
        }


        .tw3b-panel.tw3b-panel-top {
            transform-origin: center bottom;
        }


        .tw3b-panel.tw3b-panel-bottom {
            transform-origin: center top;
        }


        /* =====================================================
         * HEADER
         * ===================================================== */

        .tw3b-panel-header {

            padding:
                14px 16px;

            border-bottom:
                1px solid var(--tw3b-border);

            font-weight:
                600;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;
        }


        /* =====================================================
         * BODY
         * ===================================================== */

        .tw3b-panel-body {

            overflow-y:
                auto;

            overflow-x:
                hidden;

            padding:
                12px;

            flex:
                1;
        }


        /* =====================================================
         * SEARCH
         * ===================================================== */

        .tw3b-search {

            width:
                100%;

            box-sizing:
                border-box;

            background:
                var(--tw3b-bg);

            border:
                1px solid var(--tw3b-border);

            border-radius:
                var(--tw3b-radius-sm);

            color:
                var(--tw3b-text);

            padding:
                8px 10px;

            font-size:
                13px;

            margin-bottom:
                10px;
        }


        .tw3b-search:focus {

            outline:
                none;

            border-color:
                var(--tw3b-accent);
        }


        /* =====================================================
         * SEARCH SUGGESTIONS
         * ===================================================== */

        .tw3b-search-wrapper {

            position:
                relative;

            width:
                100%;
        }


        .tw3b-suggestions {

            position:
                absolute;

            top:
                calc(100% - 10px);

            left:
                0;

            width:
                100%;

            max-height:
                200px;

            overflow-y:
                auto;

            background:
                var(--tw3b-surface);

            border:
                1px solid var(--tw3b-border);

            border-radius:
                var(--tw3b-radius-sm);

            z-index:
                100000;
        }


        .tw3b-suggestion-item {

            display:
                flex;

            justify-content:
                space-between;

            align-items:
                center;

            gap:
                10px;

            padding:
                8px 10px;

            cursor:
                pointer;

            font-size:
                12px;
        }


        .tw3b-suggestion-item:hover {

            background:
                var(--tw3b-surface-hover);
        }


        .tw3b-suggestion-name {

            overflow:
                hidden;

            text-overflow:
                ellipsis;

            white-space:
                nowrap;
        }


        .tw3b-suggestion-price {

            flex-shrink:
                0;

            color:
                var(--tw3b-text-muted);
        }


        /* =====================================================
         * ICON BAR
         * ===================================================== */

        .tw3b-toolbar {

            display:
                flex;

            flex-direction:
                column;

            gap:
                8px;
        }


        .tw3b-icon-bar {

            display:
                flex;

            align-items:
                center;

            justify-content:
                center;

            gap:
                8px;
        }


        .tw3b-icon-button {

            position:
                relative;

            width:
                40px;

            height:
                36px;

            border:
                1px solid var(--tw3b-border);

            border-radius:
                var(--tw3b-radius-sm);

            background:
                var(--tw3b-bg);

            color:
                var(--tw3b-text);

            cursor:
                pointer;

            display:
                flex;

            align-items:
                center;

            justify-content:
                center;
        }


        .tw3b-icon-button:hover {

            background:
                var(--tw3b-surface-hover);

            border-color:
                var(--tw3b-accent);
        }


        .tw3b-icon {

            font-size:
                17px;
        }


        .tw3b-icon-badge {

            position:
                absolute;

            top:
                -5px;

            right:
                -5px;

            min-width:
                16px;

            height:
                16px;

            padding:
                0 4px;

            box-sizing:
                border-box;

            border-radius:
                999px;

            background:
                var(--tw3b-red);

            color:
                #fff;

            font-size:
                9px;

            font-weight:
                700;

            display:
                flex;

            align-items:
                center;

            justify-content:
                center;

            border:
                2px solid var(--tw3b-surface);
        }


        /* =====================================================
         * MENU
         * ===================================================== */

        .tw3b-menu-item {

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            padding:
                10px 12px;

            border-radius:
                var(--tw3b-radius-sm);

            cursor:
                pointer;

            margin-bottom:
                6px;

            background:
                var(--tw3b-bg);

            border:
                1px solid transparent;

            transition:
                background 0.12s ease,
                border-color 0.12s ease;
        }


        .tw3b-menu-item:hover {

            background:
                var(--tw3b-surface-hover);

            border-color:
                var(--tw3b-border);
        }


        /* =====================================================
         * BADGES
         * ===================================================== */

        .tw3b-badge {

            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            font-size:
                11px;

            font-weight:
                700;

            padding:
                2px 7px;

            border-radius:
                999px;

            white-space:
                nowrap;
        }


        .tw3b-badge-red {

            background:
                var(--tw3b-red-bg);

            color:
                var(--tw3b-red);
        }


        .tw3b-badge-yellow {

            background:
                var(--tw3b-yellow-bg);

            color:
                var(--tw3b-yellow);
        }


        .tw3b-badge-green {

            background:
                var(--tw3b-green-bg);

            color:
                var(--tw3b-green);
        }


        /* =====================================================
         * CARDS
         * ===================================================== */

        .tw3b-card {

            background:
                var(--tw3b-bg);

            border:
                1px solid var(--tw3b-border);

            border-radius:
                var(--tw3b-radius-sm);

            padding:
                10px 12px;

            margin-bottom:
                8px;

            cursor:
                pointer;

            transition:
                border-color 0.12s ease,
                background 0.12s ease;
        }


        .tw3b-card:hover {

            border-color:
                var(--tw3b-accent);

            background:
                var(--tw3b-surface-hover);
        }


        .tw3b-card-title {

            font-weight:
                600;

            margin-bottom:
                4px;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                8px;
        }


        .tw3b-card-sub {

            color:
                var(--tw3b-text-muted);

            font-size:
                12px;
        }


        /* =====================================================
         * ROWS
         * ===================================================== */

        .tw3b-row {

            display:
                flex;

            justify-content:
                space-between;

            align-items:
                center;

            gap:
                10px;

            padding:
                6px 0;

            border-bottom:
                1px solid var(--tw3b-border);

            font-size:
                12px;
        }


        .tw3b-row:last-child {

            border-bottom:
                none;
        }


        .tw3b-row-label {

            color:
                var(--tw3b-text-muted);
        }


        /* =====================================================
         * BUTTONS
         * ===================================================== */

        .tw3b-button {

            background:
                var(--tw3b-accent);

            color:
                #fff;

            border:
                none;

            border-radius:
                var(--tw3b-radius-sm);

            padding:
                8px 12px;

            font-size:
                13px;

            cursor:
                pointer;

            width:
                100%;

            transition:
                opacity 0.12s ease;
        }


        .tw3b-button:hover {

            opacity:
                0.9;
        }


        .tw3b-button-secondary {

            background:
                transparent;

            color:
                var(--tw3b-text-muted);

            border:
                1px solid var(--tw3b-border);
        }


        /* =====================================================
         * ERROR
         * ===================================================== */

        .tw3b-error {

            background:
                var(--tw3b-red-bg);

            color:
                var(--tw3b-red);

            padding:
                8px 10px;

            border-radius:
                var(--tw3b-radius-sm);

            font-size:
                12px;

            margin-bottom:
                8px;
        }


        /* =====================================================
         * LOADING
         * ===================================================== */

        .tw3b-skeleton {

            background:
                linear-gradient(
                    90deg,
                    var(--tw3b-bg) 25%,
                    var(--tw3b-surface-hover) 37%,
                    var(--tw3b-bg) 63%
                );

            background-size:
                400% 100%;

            animation:
                tw3b-shimmer 1.4s ease infinite;

            border-radius:
                var(--tw3b-radius-sm);

            height:
                14px;

            margin-bottom:
                6px;
        }


        @keyframes tw3b-shimmer {

            0% {
                background-position:
                    100% 50%;
            }

            100% {
                background-position:
                    0 50%;
            }
        }


        /* =====================================================
         * BACK
         * ===================================================== */

        .tw3b-back {

            color:
                var(--tw3b-accent);

            background:
                transparent;

            border:
                none;

            cursor:
                pointer;

            font-size:
                12px;

            margin-bottom:
                10px;

            display:
                inline-block;

            padding:
                2px 0;
        }


        .tw3b-back:hover {

            text-decoration:
                underline;
        }


        /* =====================================================
         * VIEW
         * ===================================================== */

        .tw3b-view-container {

            width:
                100%;
        }


        /* =====================================================
         * RESPONSIVE
         * ===================================================== */

        @media (max-width: 480px) {

            .tw3b-panel {

                width:
                    min(340px, calc(100vw - 20px));

                max-height:
                    75vh;
            }
        }

    `;


    document.head.appendChild(
        style
    );
}


export function statusBadgeClass(status) {

    switch (status) {

        case "RED":
            return "tw3b-badge tw3b-badge-red";

        case "YELLOW":
            return "tw3b-badge tw3b-badge-yellow";

        case "GREEN":
            return "tw3b-badge tw3b-badge-green";

        default:
            return "tw3b-badge";
    }
}


export function formatMoney(value) {

    if (
        !Number.isFinite(value)
    ) {
        return "-";
    }

    return "$" +
        Math.round(value)
            .toLocaleString("en-US");
}


export function formatPercent(value) {

    if (
        !Number.isFinite(value)
    ) {
        return "-";
    }

    return (
        value * 100
    ).toFixed(1) + "%";
}
