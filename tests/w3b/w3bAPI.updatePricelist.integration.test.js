
import test from "node:test";
import assert from "node:assert/strict";

import { W3BAPI } from "../../src/api/w3b.js";


/*
 * =========================================================
 * TEST
 * =========================================================
 *
 * Verifica que W3BAPI.updatePricelist()
 * construya correctamente:
 *
 * PUT /pricelist/{userID}
 *
 * Headers:
 * X-API-Key
 * Content-Type
 *
 * Body:
 *
 * {
 *     items: [
 *         {
 *             itemID: 1,
 *             pricingType: "fixed",
 *             pricingValue: 560
 *         }
 *     ]
 * }
 *
 * No deben enviarse campos bulk*.
 */


/*
 * =========================================================
 * MOCK GM_xmlhttpRequest
 * =========================================================
 */

test(
    "W3BAPI.updatePricelist construye correctamente la petición PUT",
    async () => {

        let request = null;


        /*
         * Mock global de GM_xmlhttpRequest.
         */

        globalThis.GM_xmlhttpRequest =
            options => {

                request =
                    options;


                /*
                 * Simulamos una respuesta
                 * exitosa de W3B.
                 */

                options.onload({

                    status: 200,

                    responseText:
                        JSON.stringify({

                            success: true
                        })
                });
            };


        /*
         * =================================================
         * API
         * =================================================
         */

        const apiKey =
            "TEST_TORN_API_KEY";


        const userId =
            123456;


        const items = [

            {

                itemID:
                    1,

                pricingType:
                    "fixed",

                pricingValue:
                    560
            }
        ];


        const w3bAPI =
            new W3BAPI(
                apiKey
            );


        /*
         * =================================================
         * EJECUTAR
         * =================================================
         */

        const response =
            await w3bAPI.updatePricelist(

                userId,

                items
            );


        /*
         * =================================================
         * RESPUESTA
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
         * REQUEST
         * =================================================
         */

        assert.ok(
            request
        );


        /*
         * =================================================
         * MÉTODO
         * =================================================
         */

        assert.equal(

            request.method,

            "PUT"
        );


        /*
         * =================================================
         * URL
         * =================================================
         */

        assert.equal(

            request.url,

            "https://weav3r.dev/api/pricelist/123456"
        );


        /*
         * =================================================
         * HEADERS
         * =================================================
         */

        assert.equal(

            request.headers[
                "Content-Type"
            ],

            "application/json"
        );


        assert.equal(

            request.headers[
                "X-API-Key"
            ],

            apiKey
        );


        /*
         * =================================================
         * BODY
         * =================================================
         */

        assert.equal(

            typeof request.data,

            "string"
        );


        const body =
            JSON.parse(
                request.data
            );


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
         * VALIDAR ITEMS
         * =================================================
         */

        assert.ok(
            Array.isArray(
                body.items
            )
        );


        assert.equal(

            body.items.length,

            1
        );


        const item =
            body.items[0];


        assert.equal(

            item.itemID,

            1
        );


        assert.equal(

            item.pricingType,

            "fixed"
        );


        assert.equal(

            item.pricingValue,

            560
        );


        /*
         * =================================================
         * BULK NO UTILIZADO
         * =================================================
         */

        assert.equal(

            Object.prototype.hasOwnProperty.call(
                item,
                "bulkType"
            ),

            false
        );


        assert.equal(

            Object.prototype.hasOwnProperty.call(
                item,
                "bulkValue"
            ),

            false
        );


        assert.equal(

            Object.prototype.hasOwnProperty.call(
                item,
                "bulkQuantity"
            ),

            false
        );
    }
);
