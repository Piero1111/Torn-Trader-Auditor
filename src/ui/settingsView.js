/*
 * =============================================================
 * SETTINGSVIEW.JS
 * =============================================================
 *
 * Configuración — credenciales y sincronización inicial.
 *
 * ┌──────────────────────────────┐
 * │ 🔑 CREDENCIALES              │
 * │ Torn API Key   [ ••••••••• ] │
 * │ W3B User ID    [ 123456    ] │
 * │ W3B API Key    [ ••••••••• ] │
 * │ [ GUARDAR Y SINCRONIZAR ]    │
 * │ Estado: 🟢 Conectado         │
 * ├──────────────────────────────┤
 * │ 🗑 MANTENIMIENTO             │
 * │ [ BORRAR TODOS LOS DATOS ]   │
 * └──────────────────────────────┘
 *
 * Responsabilidades:
 *
 *   1. Cargar credenciales guardadas (Storage.getConfig()).
 *   2. Al guardar:
 *        a. Persistir en Storage (Storage.saveConfig()).
 *        b. Aplicar las nuevas keys a las instancias YA
 *           creadas de TornAPI / W3BAPI (mutación directa de
 *           `apiKey`, sin reinstanciar — Auditor/Scheduler ya
 *           tienen referencias a estos objetos).
 *        c. Sincronizar la Pricelist (Pricelist.sync()) como
 *           prueba de conexión real.
 *   3. Mostrar el estado resultante (🟢 Conectado / 🔴 Error).
 *   4. Permitir un reset total (Storage.resetAll()) para purgar
 *      datos corruptos por versiones anteriores con bugs, con
 *      doble confirmación y recarga de página al finalizar.
 *
 * Esta vista NO valida el formato de las keys (eso ya lo
 * hacen TornAPI/W3BAPI al fallar la petición real).
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createSectionTitle,
    createButton
} from "./styles.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.storage    - instancia de Storage
 * @param {Object} deps.tornAPI    - instancia de TornAPI
 * @param {Object} deps.w3bAPI     - instancia de W3BAPI
 * @param {Object} deps.pricelist  - instancia de Pricelist
 * @param {Object} [deps.scheduler] - instancia de Scheduler (para detener el ciclo pasivo antes del reset)
 * @param {Function} deps.onBack
 * @param {Function} [deps.onCredentialsSaved] - () => void
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export async function renderSettingsView({
    storage,
    tornAPI,
    w3bAPI,
    pricelist,
    scheduler,
    onBack,
    onCredentialsSaved
}) {

    const header =
        createHeader({

            title:
                "Configuración",

            onBack
        });


    /* =====================================================
     * CARGAR CONFIGURACIÓN ACTUAL
     * ===================================================== */

    let currentConfig =
        {

            tornApiKey: null,
            w3bApiKey: null,
            w3bUserId: null,
            settings: {}
        };

    try {

        currentConfig =
            await storage.getConfig();

    } catch (error) {

        console.error(
            "[SettingsView] Error cargando configuración:",
            error
        );
    }


    /* =====================================================
     * CAMPOS
     * ===================================================== */

    const tornApiKeyInput =
        createFieldInput({

            type:
                "password",

            value:
                currentConfig?.tornApiKey ||
                "",

            placeholder:
                "Torn API Key"
        });

    const w3bUserIdInput =
        createFieldInput({

            type:
                "text",

            value:
                currentConfig?.w3bUserId ||
                "",

            placeholder:
                "123456"
        });

    const w3bApiKeyInput =
        createFieldInput({

            type:
                "password",

            value:
                currentConfig?.w3bApiKey ||
                "",

            placeholder:
                "W3B API Key"
        });


    const credentialsSection = [

        createSectionTitle(
            "🔑 Credenciales"
        ),

        createFieldGroup({

            label:
                "Torn API Key",

            input:
                tornApiKeyInput
        }),

        createFieldGroup({

            label:
                "W3B User ID",

            input:
                w3bUserIdInput
        }),

        createFieldGroup({

            label:
                "W3B API Key",

            input:
                w3bApiKeyInput
        })
    ];


    /* =====================================================
     * ESTADO
     * ===================================================== */

    const statusLine =
        el("div", {

            style: {
                fontSize: "13px",
                color: "#9aa0ac",
                textAlign: "center",
                marginTop: "8px"
            },

            text:
                describeInitialStatus(
                    currentConfig
                )
        });


    /* =====================================================
     * BOTÓN GUARDAR Y SINCRONIZAR
     * ===================================================== */

    const saveButton =
        createButton({

            label:
                "Guardar y sincronizar",

            variant:
                "primary",

            onClick:
                handleSave
        });


    async function handleSave() {

        saveButton.disabled =
            true;

        saveButton.textContent =
            "Sincronizando...";

        statusLine.style.color =
            "#9aa0ac";

        statusLine.textContent =
            "Conectando...";


        const tornApiKey =
            tornApiKeyInput.value.trim();

        const w3bUserId =
            w3bUserIdInput.value.trim();

        const w3bApiKey =
            w3bApiKeyInput.value.trim();


        try {

            /* =============================================
             * VALIDACIÓN MÍNIMA
             * ============================================= */

            if (!tornApiKey) {

                throw new Error(
                    "La Torn API Key es obligatoria."
                );
            }

            if (!w3bUserId) {

                throw new Error(
                    "El W3B User ID es obligatorio."
                );
            }


            /* =============================================
             * 1. PERSISTIR
             * ============================================= */

            const savedConfig =
                await storage.saveConfig({

                    tornApiKey,

                    w3bUserId,

                    w3bApiKey:
                        w3bApiKey || null
                });


            /* =============================================
             * 2. APLICAR A INSTANCIAS YA CREADAS
             * ============================================= */

            if (tornAPI) {

                tornAPI.apiKey =
                    tornApiKey;
            }

            if (w3bAPI) {

                w3bAPI.apiKey =
                    w3bApiKey || null;
            }


            /* =============================================
             * 3. SINCRONIZAR PRICELIST (PRUEBA DE CONEXIÓN)
             * ============================================= */

            if (
                !pricelist ||
                typeof pricelist.sync !==
                "function"
            ) {

                throw new Error(
                    "Pricelist no está disponible."
                );
            }


            const result =
                await pricelist.sync(
                    w3bUserId
                );


            const itemCount =
                Array.isArray(result?.items)
                    ? result.items.length
                    : 0;


            /* =============================================
             * ÉXITO
             * ============================================= */

            statusLine.style.color =
                "#37b24d";

            statusLine.textContent =
                `🟢 Conectado — ${itemCount} artículos sincronizados`;


            saveButton.textContent =
                "✓ Guardado";


            if (
                typeof onCredentialsSaved ===
                "function"
            ) {

                onCredentialsSaved();
            }


        } catch (error) {

            console.error(
                "[SettingsView] Error guardando configuración:",
                error
            );

            statusLine.style.color =
                "#e64953";

            statusLine.textContent =
                `🔴 ${
                    error?.message ||
                    "No se pudo conectar."
                }`;

            saveButton.textContent =
                "Guardar y sincronizar";

        } finally {

            saveButton.disabled =
                false;

            setTimeout(
                () => {

                    if (
                        saveButton.isConnected &&
                        saveButton.textContent === "✓ Guardado"
                    ) {

                        saveButton.textContent =
                            "Guardar y sincronizar";
                    }
                },
                2000
            );
        }
    }


    /* =====================================================
     * MANTENIMIENTO — BORRAR TODOS LOS DATOS
     * =====================================================
     *
     * Purga completa de Storage (credenciales, pricelist,
     * auditorías, historial, precios internos aprendidos) +
     * la lista de artículos inválidos del Scheduler.
     *
     * Doble confirmación porque es destructivo e irreversible.
     * Tras borrar, recargamos la página: es la forma más
     * segura de garantizar que TODO el estado en memoria
     * (Scheduler.lastAuditByItem, invalidItems, passiveCycle,
     * History.lastDayByItem, etc.) se reconstruya desde cero
     * en vez de quedar desincronizado del storage ya vacío.
     */

    const resetStatusLine =
        el("div", {

            style: {
                fontSize: "12px",
                color: "#9aa0ac",
                textAlign: "center",
                marginTop: "8px",
                minHeight: "16px"
            },

            text:
                ""
        });


    const resetButton =
        createButton({

            label:
                "Borrar todos los datos",

            variant:
                "secondary",

            onClick:
                handleResetAll
        });


    async function handleResetAll() {

        const firstConfirm =
            window.confirm(
                "¿Seguro que quieres borrar TODOS los datos de TornW3B?\n\n" +
                "Esto incluye credenciales, pricelist, auditorías, " +
                "historial y precios internos aprendidos.\n\n" +
                "Úsalo si sospechas que auditorías de una versión " +
                "anterior con errores están afectando los resultados " +
                "actuales."
            );

        if (!firstConfirm) {
            return;
        }

        const secondConfirm =
            window.confirm(
                "Esta acción NO se puede deshacer. " +
                "Tendrás que volver a configurar tus API Keys. " +
                "¿Continuar?"
            );

        if (!secondConfirm) {
            return;
        }


        resetButton.disabled =
            true;

        resetButton.textContent =
            "Borrando...";

        resetStatusLine.style.color =
            "#9aa0ac";

        resetStatusLine.textContent =
            "Borrando datos...";


        try {

            /*
             * Detenemos el ciclo pasivo antes de borrar para
             * que no siga escribiendo en Storage a mitad de
             * la limpieza.
             */

            if (
                scheduler &&
                typeof scheduler.stop === "function"
            ) {

                scheduler.stop();
            }


            if (
                !storage ||
                typeof storage.resetAll !== "function"
            ) {

                throw new Error(
                    "Storage.resetAll no está disponible."
                );
            }


            await storage.resetAll();


            resetStatusLine.style.color =
                "#37b24d";

            resetStatusLine.textContent =
                "🟢 Datos borrados. Recargando...";


            /*
             * Recarga completa: la forma más segura de
             * garantizar que todo el estado en memoria de
             * la app (Scheduler, History, etc.) se reconstruya
             * desde un Storage limpio.
             */

            setTimeout(
                () => {

                    window.location.reload();
                },
                800
            );


        } catch (error) {

            console.error(
                "[SettingsView] Error borrando datos:",
                error
            );

            resetButton.disabled =
                false;

            resetButton.textContent =
                "Borrar todos los datos";

            resetStatusLine.style.color =
                "#e64953";

            resetStatusLine.textContent =
                `🔴 ${
                    error?.message ||
                    "No se pudieron borrar los datos."
                }`;
        }
    }


    const maintenanceSection = [

        createSectionTitle(
            "🗑 Mantenimiento"
        ),

        resetButton,

        resetStatusLine
    ];


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...credentialsSection,

                saveButton,

                statusLine,

                ...maintenanceSection
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}


/* =============================================================
 * ESTADO INICIAL (antes de tocar el botón)
 * ============================================================= */

function describeInitialStatus(config) {

    const hasTornKey =
        Boolean(
            config?.tornApiKey
        );

    const hasUserId =
        Boolean(
            config?.w3bUserId
        );

    if (
        hasTornKey &&
        hasUserId
    ) {

        return "Credenciales guardadas. Toca el botón para re-sincronizar.";
    }

    return "Aún no se configuraron credenciales.";
}


/* =============================================================
 * CAMPO DE FORMULARIO
 * ============================================================= */

function createFieldInput({
    type,
    value,
    placeholder
}) {

    return el("input", {

        style: {
            width: "100%",
            background: "#1c1f27",
            border: "1px solid #2e323d",
            borderRadius: "8px",
            padding: "10px 12px",
            color: "#f5f6f8",
            fontSize: "14px",
            outline: "none"
        },

        attrs: {

            type,

            value:
                value || "",

            placeholder,

            autocomplete:
                "off",

            autocapitalize:
                "off",

            spellcheck:
                "false"
        }
    });
}


function createFieldGroup({
    label,
    input
}) {

    return el("div", {

        style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            marginBottom: "10px"
        }

    }, [

        el("label", {

            style: {
                fontSize: "12px",
                color: "#9aa0ac"
            },

            text:
                label
        }),

        input
    ]);
}