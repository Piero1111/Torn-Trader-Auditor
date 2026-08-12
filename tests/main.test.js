import {
    test,
    mock
} from "node:test";

import assert from "node:assert/strict";


/*
 * =========================================================
 * ENTORNO GLOBAL
 * =========================================================
 */

global.window = {};

global.document = {

    querySelectorAll() {
        return [];
    }
};


/*
 * =========================================================
 * IMPORTAR MAIN
 * =========================================================
 *
 * Importamos después de preparar window/document.
 */

const {
    start,
    cleanupPreviousApp
} = await import(
    "../src/main.js"
);


/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function createStorage(
    config = {}
) {

    return {

        async getConfig() {

            return {

                tornApiKey:
                    null,

                w3bApiKey:
                    null,

                w3bUserId:
                    null,

                ...config
            };
        }
    };
}


/*
 * =========================================================
 * TESTS
 * =========================================================
 */


/*
 * 1
 * cleanupPreviousApp no falla cuando no existe
 * una instancia anterior.
 */

test(
    "1. cleanupPreviousApp funciona sin instancia previa",
    () => {

        window.TornW3B =
            undefined;

        assert.doesNotThrow(
            () => cleanupPreviousApp()
        );

        assert.equal(
            window.TornW3B,
            undefined
        );
    }
);


/*
 * 2
 * cleanupPreviousApp detiene el Scheduler
 * anterior.
 */

test(
    "2. cleanupPreviousApp detiene el Scheduler anterior",
    () => {

        let stopped =
            false;


        window.TornW3B = {

            scheduler: {

                stop() {

                    stopped =
                        true;
                }
            }
        };


        cleanupPreviousApp();


        assert.equal(
            stopped,
            true
        );


        assert.equal(
            window.TornW3B,
            undefined
        );
    }
);


/*
 * 3
 * cleanupPreviousApp destruye la App anterior.
 */

test(
    "3. cleanupPreviousApp destruye la App anterior",
    () => {

        let destroyed =
            false;


        window.TornW3B = {

            app: {

                destroy() {

                    destroyed =
                        true;
                }
            }
        };


        cleanupPreviousApp();


        assert.equal(
            destroyed,
            true
        );
    }
);


/*
 * 4
 * cleanupPreviousApp continúa aunque
 * Scheduler.stop() falle.
 */

test(
    "4. cleanupPreviousApp tolera error al detener Scheduler",
    () => {

        window.TornW3B = {

            scheduler: {

                stop() {

                    throw new Error(
                        "Scheduler failure"
                    );
                }
            }
        };


        assert.doesNotThrow(
            () => cleanupPreviousApp()
        );


        assert.equal(
            window.TornW3B,
            undefined
        );
    }
);


/*
 * 5
 * cleanupPreviousApp continúa aunque
 * App.destroy() falle.
 */

test(
    "5. cleanupPreviousApp tolera error al destruir App",
    () => {

        window.TornW3B = {

            app: {

                destroy() {

                    throw new Error(
                        "App failure"
                    );
                }
            }
        };


        assert.doesNotThrow(
            () => cleanupPreviousApp()
        );


        assert.equal(
            window.TornW3B,
            undefined
        );
    }
);


/*
 * 6
 * start devuelve inmediatamente la instancia
 * si ya está inicializada.
 */

test(
    "6. start reutiliza instancia ya inicializada",
    async () => {

        const existing = {

            __initialized:
                true
        };


        window.TornW3B =
            existing;


        const result =
            await start();


        assert.equal(
            result,
            existing
        );
    }
);


/*
 * 7
 * start no crea una segunda instancia
 * cuando ya existe una aplicación inicializada.
 */

test(
    "7. start no reinicializa una instancia activa",
    async () => {

        const existing = {

            __initialized:
                true,

            marker:
                "existing"
        };


        window.TornW3B =
            existing;


        const result =
            await start();


        assert.equal(
            result.marker,
            "existing"
        );

        assert.equal(
            window.TornW3B,
            existing
        );
    }
);


/*
 * 8
 * cleanup elimina elementos visuales residuales
 * de TornW3B.
 */

test(
    "8. cleanupPreviousApp elimina elementos TW3B residuales",
    () => {

        const removed = [];


        global.document = {

            querySelectorAll(selector) {

                return [

                    {

                        remove() {

                            removed.push(
                                selector
                            );
                        }
                    },

                    {

                        remove() {

                            removed.push(
                                selector
                            );
                        }
                    }
                ];
            }
        };


        window.TornW3B =
            undefined;


        cleanupPreviousApp();


        assert.deepEqual(
            removed,
            [
                ".tw3b-fab",
                ".tw3b-fab",
                ".tw3b-panel",
                ".tw3b-panel"
            ]
        );
    }
);