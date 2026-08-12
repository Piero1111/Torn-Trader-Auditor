
import test from "node:test";
import assert from "node:assert/strict";

import { W3BAPI } from "../../src/api/w3b.js";
import { CONFIG } from "../../src/config.js";


/*
 * =========================================================
 * MOCK GM_xmlhttpRequest
 * =========================================================
 */

globalThis.GM_xmlhttpRequest = null;


function mockRequest(callback) {

    globalThis.GM_xmlhttpRequest = callback;
}


function resetMock() {

    globalThis.GM_xmlhttpRequest = null;
}


/*
 * =========================================================
 * HEADERS
 * =========================================================
 */

test("1. getHeaders devuelve headers vacíos sin API key", () => {

    const api =
        new W3BAPI();

    assert.deepEqual(
        api.getHeaders(),
        {}
    );
});


test("2. getHeaders agrega Authorization con API key", () => {

    const api =
        new W3BAPI("abc123");

    assert.deepEqual(
        api.getHeaders(),
        {
            Authorization:
                "Bearer abc123"
        }
    );
});


/*
 * =========================================================
 * GET PRICELIST
 * =========================================================
 */

test("3. getPricelist rechaza userId inexistente", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.getPricelist(),
        /W3B User ID es obligatorio/
    );
});


test("4. getPricelist rechaza userId vacío", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.getPricelist("   "),
        /W3B User ID es obligatorio/
    );
});


test("5. getPricelist construye correctamente la petición GET", async () => {

    const api =
        new W3BAPI("secret");

    let request;

    mockRequest(options => {

        request =
            options;

        options.onload({
            status: 200,
            responseText:
                JSON.stringify([
                    {
                        itemID: 1,
                        pricingValue: 500
                    }
                ])
        });
    });


    const result =
        await api.getPricelist("user 123");


    assert.equal(
        request.method,
        "GET"
    );

    assert.equal(
        request.url,
        `${CONFIG.W3B_API_BASE}/pricelist/user%20123`
    );

    assert.deepEqual(
        request.headers,
        {
            Authorization:
                "Bearer secret"
        }
    );

    assert.deepEqual(
        result,
        [
            {
                itemID: 1,
                pricingValue: 500
            }
        ]
    );

    resetMock();
});


test("6. getPricelist rechaza errores HTTP", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 500,
            responseText: "{}"
        });
    });


    await assert.rejects(
        api.getPricelist(123),
        /W3B API HTTP 500/
    );

    resetMock();
});


test("7. getPricelist rechaza JSON inválido", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 200,
            responseText:
                "respuesta inválida"
        });
    });


    await assert.rejects(
        api.getPricelist(123),
        /Error parseando respuesta W3B/
    );

    resetMock();
});


test("8. getPricelist rechaza formato que no sea array", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 200,
            responseText:
                JSON.stringify({
                    items: []
                })
        });
    });


    await assert.rejects(
        api.getPricelist(123),
        /Formato inesperado de pricelist W3B/
    );

    resetMock();
});


test("9. getPricelist maneja error de conexión", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onerror();
    });


    await assert.rejects(
        api.getPricelist(123),
        /No se pudo conectar con W3B API/
    );

    resetMock();
});


test("10. getPricelist maneja timeout", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.ontimeout();
    });


    await assert.rejects(
        api.getPricelist(123),
        /Timeout conectando con W3B API/
    );

    resetMock();
});


test("11. getPricelist maneja cancelación", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onabort();
    });


    await assert.rejects(
        api.getPricelist(123),
        /Solicitud a W3B API cancelada/
    );

    resetMock();
});


/*
 * =========================================================
 * UPDATE PRICELIST
 * =========================================================
 */

test("12. updatePricelist rechaza userId inválido", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.updatePricelist(null, [
            {
                itemID: 1,
                pricingType: "fixed",
                pricingValue: 500
            }
        ]),
        /W3B User ID es obligatorio/
    );
});


test("13. updatePricelist rechaza items inexistentes o vacíos", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.updatePricelist(123, []),
        /Debe proporcionarse al menos un artículo/
    );

    await assert.rejects(
        api.updatePricelist(123),
        /Debe proporcionarse al menos un artículo/
    );
});


test("14. updatePricelist valida y normaliza los artículos", async () => {

    const api =
        new W3BAPI("secret");

    let request;

    mockRequest(options => {

        request =
            options;

        options.onload({
            status: 200,
            responseText:
                JSON.stringify({
                    success: true
                })
        });
    });


    const result =
        await api.updatePricelist(
            "user 123",
            [
                {
                    itemID: "10",
                    pricingType: "fixed",
                    pricingValue: "1250.8"
                }
            ]
        );


    assert.equal(
        request.method,
        "PUT"
    );

    assert.equal(
        request.url,
        `${CONFIG.W3B_API_BASE}/pricelist/user%20123`
    );

    assert.deepEqual(
        request.headers,
        {
            "Content-Type":
                "application/json",

            "X-API-Key":
                "secret"
        }
    );


    assert.deepEqual(
        JSON.parse(request.data),
        {
            items: [
                {
                    itemID: 10,
                    pricingType: "fixed",
                    pricingValue: 1251
                }
            ]
        }
    );


    assert.deepEqual(
        result,
        {
            success: true
        }
    );

    resetMock();
});


test("15. updatePricelist rechaza itemID inválido", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 0,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /Item ID inválido/
    );
});


test("16. updatePricelist rechaza pricingType inválido", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "percentage",
                    pricingValue: 500
                }
            ]
        ),
        /Pricing type inválido/
    );
});


test("17. updatePricelist rechaza precio inválido", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 0
                }
            ]
        ),
        /Precio inválido/
    );
});


test("18. updatePricelist maneja errores HTTP, JSON, conexión, timeout y abort", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 500,
            responseText: "{}"
        });
    });

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /W3B Pricelist API HTTP 500/
    );


    mockRequest(options => {

        options.onload({
            status: 200,
            responseText:
                "{invalid json"
        });
    });

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /Error parseando respuesta Pricelist W3B/
    );


    mockRequest(options => {

        options.onerror();
    });

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /No se pudo conectar con W3B Pricelist API/
    );


    mockRequest(options => {

        options.ontimeout();
    });

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /Timeout conectando con W3B Pricelist API/
    );


    mockRequest(options => {

        options.onabort();
    });

    await assert.rejects(
        api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        ),
        /Solicitud de actualización de Pricelist W3B cancelada/
    );


    resetMock();
});


/*
 * =========================================================
 * UPDATE PRICELIST - RESPUESTA VACÍA
 * =========================================================
 */

test("19. updatePricelist devuelve null cuando W3B no devuelve contenido", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 204,
            responseText: ""
        });
    });


    const result =
        await api.updatePricelist(
            123,
            [
                {
                    itemID: 1,
                    pricingType: "fixed",
                    pricingValue: 500
                }
            ]
        );


    assert.equal(
        result,
        null
    );

    resetMock();
});


/*
 * =========================================================
 * GET MARKETPLACE
 * =========================================================
 */

test("20. getMarketplace rechaza itemId inválido", async () => {

    const api =
        new W3BAPI();

    await assert.rejects(
        api.getMarketplace(),
        /Item ID es obligatorio/
    );

    await assert.rejects(
        api.getMarketplace("   "),
        /Item ID es obligatorio/
    );
});


test("21. getMarketplace construye correctamente la petición y normaliza listings", async () => {

    const api =
        new W3BAPI("secret");

    let request;

    mockRequest(options => {

        request =
            options;

        options.onload({
            status: 200,

            responseText:
                JSON.stringify({

                    item_id:
                        "10",

                    market_price:
                        "5000",

                    bazaar_average:
                        "4800",

                    generated_at:
                        "123456",

                    listings: [

                        {
                            item_id:
                                "10",

                            player_id:
                                "999",

                            quantity:
                                "5",

                            price:
                                "4500",

                            content_updated:
                                "100",

                            last_checked:
                                "200"
                        },

                        {
                            item_id:
                                "10",

                            player_id:
                                "888",

                            quantity:
                                "0",

                            price:
                                "4000"
                        },

                        {
                            item_id:
                                "10",

                            player_id:
                                "777",

                            quantity:
                                "3",

                            price:
                                "invalid"
                        }
                    ]
                })
        });
    });


    const result =
        await api.getMarketplace("10");


    assert.equal(
        request.method,
        "GET"
    );

    assert.equal(
        request.url,
        `${CONFIG.W3B_API_BASE}/marketplace/10`
    );

    assert.deepEqual(
        request.headers,
        {
            Authorization:
                "Bearer secret"
        }
    );


    assert.equal(
        result.item_id,
        10
    );

    assert.equal(
        result.market_price,
        5000
    );

    assert.equal(
        result.bazaar_average,
        4800
    );

    assert.equal(
        result.generated_at,
        123456
    );


    assert.equal(
        result.listings.length,
        1
    );


    assert.deepEqual(
        result.listings[0],
        {
            item_id: 10,
            player_id: 999,
            quantity: 5,
            price: 4500,
            content_updated: 100,
            last_checked: 200
        }
    );

    resetMock();
});


test("22. getMarketplace rechaza formato sin listings", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 200,

            responseText:
                JSON.stringify({
                    item_id: 1
                })
        });
    });


    await assert.rejects(
        api.getMarketplace(1),
        /Formato inesperado de Marketplace W3B/
    );

    resetMock();
});


test("23. getMarketplace rechaza JSON inválido", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 200,

            responseText:
                "invalid"
        });
    });


    await assert.rejects(
        api.getMarketplace(1),
        /Error parseando respuesta Marketplace W3B/
    );

    resetMock();
});


test("24. getMarketplace rechaza errores HTTP", async () => {

    const api =
        new W3BAPI();

    mockRequest(options => {

        options.onload({
            status: 404,
            responseText:
                "{}"
        });
    });


    await assert.rejects(
        api.getMarketplace(1),
        /W3B Marketplace API HTTP 404/
    );

    resetMock();
});


test("25. getMarketplace maneja errores de conexión, timeout y abort", async () => {

    const api =
        new W3BAPI();


    mockRequest(options => {

        options.onerror();
    });

    await assert.rejects(
        api.getMarketplace(1),
        /No se pudo conectar con W3B Marketplace API/
    );


    mockRequest(options => {

        options.ontimeout();
    });

    await assert.rejects(
        api.getMarketplace(1),
        /Timeout conectando con W3B Marketplace API/
    );


    mockRequest(options => {

        options.onabort();
    });

    await assert.rejects(
        api.getMarketplace(1),
        /Solicitud a W3B Marketplace API cancelada/
    );


    resetMock();
});
