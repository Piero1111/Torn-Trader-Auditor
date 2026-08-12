
import test from "node:test";
import assert from "node:assert/strict";

import { W3BAPI } from "../../src/api/w3b.js";


test(
    "W3BAPI construye correctamente el PUT de actualización de Pricelist",
    async () => {

        /*
         * =====================================================
         * CONFIGURACIÓN
         * =====================================================
         */

        const originalGM =
            globalThis.GM_xmlhttpRequest;


        let request = null;


        /*
         * =====================================================
         * MOCK HTTP
         * =====================================================
         */

        globalThis.GM_xmlhttpRequest =
            options => {

                request =
                    options;


                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({

                            success: true

                        })
                });
            };


        try {

            /*
             * =================================================
             * API
             * =================================================
             */

            const api =
                new W3BAPI(
                    "TEST_API_KEY"
                );


            /*
             * =================================================
             * EJECUTAR
             * =================================================
             */

            const response =
                await api.updatePricelist(

                    123456,

                    [

                        {

                            itemID: 1,

                            pricingType:
                                "fixed",

                            pricingValue:
                                560
                        }

                    ]
                );


            /*
             * =================================================
             * 1. RESPUESTA
             * =================================================
             */

            assert.deepEqual(

                response,

                {
                    success: true
                }
            );


            /*
             * =================================================
             * 2. SE REALIZÓ UNA PETICIÓN
             * =================================================
             */

            assert.ok(
                request
            );


            /*
             * =================================================
             * 3. MÉTODO
             * =================================================
             */

            assert.equal(

                request.method,

                "PUT"
            );


            /*
             * =================================================
             * 4. URL
             * =================================================
             */

            assert.equal(

                request.url,

                "https://weav3r.dev/api/pricelist/123456"
            );


            /*
             * =================================================
             * 5. CONTENT TYPE
             * =================================================
             */

            assert.equal(

                request.headers[
                    "Content-Type"
                ],

                "application/json"
            );


            /*
             * =================================================
             * 6. API KEY
             * =================================================
             */

            assert.equal(

                request.headers[
                    "X-API-Key"
                ],

                "TEST_API_KEY"
            );


            /*
             * =================================================
             * 7. BODY
             * =================================================
             */

            assert.ok(
                request.data
            );


            const body =
                JSON.parse(
                    request.data
                );


            /*
             * =================================================
             * 8. ESTRUCTURA
             * =================================================
             */

            assert.deepEqual(

                body,

                {

                    items: [

                        {

                            itemID:
                                1,

                            pricingType:
                                "fixed",

                            pricingValue:
                                560
                        }

                    ]
                }
            );


            /*
             * =================================================
             * 9. NO SE ENVÍAN CAMPOS BULK
             * =================================================
             */

            const item =
                body.items[0];


            assert.equal(
                "bulkType" in item,
                false
            );


            assert.equal(
                "bulkValue" in item,
                false
            );


            assert.equal(
                "bulkQuantity" in item,
                false
            );


            /*
             * =================================================
             * 10. PRECIO ENTERO
             * =================================================
             */

            assert.equal(

                Number.isInteger(
                    item.pricingValue
                ),

                true
            );


            /*
             * =================================================
             * 11. TIPO FIXED
             * =================================================
             */

            assert.equal(

                item.pricingType,

                "fixed"
            );
        }

        finally {

            /*
             * Restaurar GM_xmlhttpRequest
             * aunque el test falle.
             */

            globalThis.GM_xmlhttpRequest =
                originalGM;
        }
    }
);