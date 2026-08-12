
import test from "node:test";
import assert from "node:assert/strict";

import { TornAPI } from "../../src/api/torn.js";
import { CONFIG } from "../../src/config.js";


/*
 * =========================================================
 * MOCK GM_xmlhttpRequest
 * =========================================================
 */

function mockGMXmlhttpRequest(handler) {

    global.GM_xmlhttpRequest = handler;
}


/*
 * =========================================================
 * FACTORY
 * =========================================================
 */

function createTornAPI() {

    const api =
        new TornAPI("TEST_API_KEY");

    /*
     * Los tests no necesitan esperar realmente
     * un segundo entre solicitudes.
     */
    api.minRequestInterval = 0;

    return api;
}


/*
 * =========================================================
 *
 * 1. CONSTRUCTOR
 *
 * =========================================================
 */

test(
    "1. inicializa correctamente TornAPI",
    () => {

        const api =
            createTornAPI();


        assert.equal(
            api.apiKey,
            "TEST_API_KEY"
        );


        assert.equal(
            api.maxRetries,
            4
        );


        assert.equal(
            api.minRequestInterval,
            0
        );


        assert.equal(
            api.lastRequestTime,
            0
        );


        assert.ok(
            api.requestQueue instanceof Promise
        );
    }
);


/*
 * =========================================================
 *
 * 2. SLEEP
 *
 * =========================================================
 */

test(
    "2. sleep espera aproximadamente el tiempo indicado",
    async () => {

        const api =
            createTornAPI();


        const start =
            Date.now();


        await api.sleep(10);


        const elapsed =
            Date.now() - start;


        assert.ok(
            elapsed >= 8
        );
    }
);


/*
 * =========================================================
 *
 * 3. COLA GLOBAL
 *
 * =========================================================
 */

test(
    "3. enqueueRequest ejecuta las solicitudes en orden",
    async () => {

        const api =
            createTornAPI();


        const executionOrder = [];


        const first =
            api.enqueueRequest(
                async () => {

                    executionOrder.push(
                        "first"
                    );

                    await api.sleep(10);

                    executionOrder.push(
                        "first-end"
                    );

                    return 1;
                }
            );


        const second =
            api.enqueueRequest(
                async () => {

                    executionOrder.push(
                        "second"
                    );

                    return 2;
                }
            );


        assert.equal(
            await first,
            1
        );


        assert.equal(
            await second,
            2
        );


        assert.deepEqual(
            executionOrder,
            [
                "first",
                "first-end",
                "second"
            ]
        );
    }
);


/*
 * =========================================================
 *
 * 4. LA COLA CONTINÚA DESPUÉS DE UN ERROR
 *
 * =========================================================
 */

test(
    "4. enqueueRequest mantiene la cola después de un error",
    async () => {

        const api =
            createTornAPI();


        const first =
            api.enqueueRequest(
                async () => {

                    throw new Error(
                        "First failure"
                    );
                }
            );


        const second =
            api.enqueueRequest(
                async () => {

                    return "success";
                }
            );


        await assert.rejects(
            first,
            /First failure/
        );


        assert.equal(
            await second,
            "success"
        );
    }
);


/*
 * =========================================================
 *
 * 5. PERFORM REQUEST - URL
 *
 * =========================================================
 */

test(
    "5. performRequest construye correctamente la URL",
    async () => {

        const api =
            createTornAPI();


        let capturedRequest;


        mockGMXmlhttpRequest(
            options => {

                capturedRequest =
                    options;


                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({
                            success: true
                        })
                });
            }
        );


        await api.performRequest(
            "/torn/123/items"
        );


        assert.equal(
            capturedRequest.method,
            "GET"
        );


        assert.equal(
            capturedRequest.url,
            `${CONFIG.TORN_API_BASE}/torn/123/items?key=TEST_API_KEY`
        );


        assert.equal(
            capturedRequest.timeout,
            30000
        );
    }
);


/*
 * =========================================================
 *
 * 6. PERFORM REQUEST - JSON VÁLIDO
 *
 * =========================================================
 */

test(
    "6. performRequest devuelve correctamente un JSON válido",
    async () => {

        const api =
            createTornAPI();


        mockGMXmlhttpRequest(
            options => {

                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({

                            items: [

                                {
                                    id: 123,
                                    name: "Test Item"
                                }

                            ]

                        })
                });
            }
        );


        const result =
            await api.performRequest(
                "/torn/123/items"
            );


        assert.deepEqual(
            result,
            {

                items: [

                    {
                        id: 123,
                        name: "Test Item"
                    }

                ]

            }
        );
    }
);


/*
 * =========================================================
 *
 * 7. JSON INVÁLIDO
 *
 * =========================================================
 */

test(
    "7. performRequest rechaza una respuesta JSON inválida",
    async () => {

        const api =
            createTornAPI();


        mockGMXmlhttpRequest(
            options => {

                options.onload({

                    status: 200,

                    responseText:
                        "esto no es json"

                });
            }
        );


        await assert.rejects(

            () =>
                api.performRequest(
                    "/torn/123/items"
                ),

            /Respuesta inválida de Torn API/
        );
    }
);


/*
 * =========================================================
 *
 * 8. RATE LIMIT
 *
 * =========================================================
 */

test(
    "8. performRequest detecta Too many requests",
    async () => {

        const api =
            createTornAPI();


        mockGMXmlhttpRequest(
            options => {

                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({

                            error: {

                                error:
                                    "Too many requests"

                            }

                        })

                });
            }
        );


        await assert.rejects(

            () =>
                api.performRequest(
                    "/market/123/itemmarket"
                ),

            error => {

                assert.equal(
                    error.message,
                    "Too many requests"
                );


                assert.equal(
                    error.code,
                    "RATE_LIMIT"
                );


                return true;
            }
        );
    }
);


/*
 * =========================================================
 *
 * 9. INVALID ID
 *
 * =========================================================
 */

test(
    "9. performRequest detecta Incorrect ID",
    async () => {

        const api =
            createTornAPI();


        mockGMXmlhttpRequest(
            options => {

                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({

                            error: {

                                error:
                                    "Incorrect ID"

                            }

                        })

                });
            }
        );


        await assert.rejects(

            () =>
                api.performRequest(
                    "/torn/999999/items"
                ),

            error => {

                assert.equal(
                    error.message,
                    "Incorrect ID"
                );


                assert.equal(
                    error.code,
                    "INVALID_ID"
                );


                return true;
            }
        );
    }
);


/*
 * =========================================================
 *
 * 10. HTTP ERROR
 *
 * =========================================================
 */

test(
    "10. performRequest rechaza errores HTTP",
    async () => {

        const api =
            createTornAPI();


        mockGMXmlhttpRequest(
            options => {

                options.onload({

                    status: 500,

                    responseText:
                        JSON.stringify({

                            message:
                                "Server error"

                        })

                });
            }
        );


        await assert.rejects(

            () =>
                api.performRequest(
                    "/market/timestamp"
                ),

            /Torn API HTTP 500/
        );
    }
);


/*
 * =========================================================
 *
 * 11. ENDPOINTS
 *
 * =========================================================
 */

test(
    "11. getItem, getItemMarket y getTimestamp utilizan los endpoints correctos",
    async () => {

        const api =
            createTornAPI();


        const paths = [];


        api.request =
            async path => {

                paths.push(path);

                return {
                    success: true
                };
            };


        await api.getItem(123);

        await api.getItemMarket(456);

        await api.getTimestamp();


        assert.deepEqual(
            paths,
            [
                "/torn/123/items",
                "/market/456/itemmarket",
                "/market/timestamp"
            ]
        );
    }
);


/*
 * =========================================================
 *
 * 12. RATE LIMIT + RETRIES
 *
 * =========================================================
 */

test(
    "12. request reintenta cuando recibe RATE_LIMIT",
    async () => {

        const api =
            createTornAPI();


        api.sleep =
            async () => {};


        let attempts =
            0;


        api.performRequest =
            async () => {

                attempts++;


                if (
                    attempts < 3
                ) {

                    const error =
                        new Error(
                            "Too many requests"
                        );


                    error.code =
                        "RATE_LIMIT";


                    throw error;
                }


                return {

                    success: true

                };
            };


        const result =
            await api.request(
                "/market/timestamp"
            );


        assert.deepEqual(
            result,
            {

                success: true

            }
        );


        assert.equal(
            attempts,
            3
        );
    }
);
