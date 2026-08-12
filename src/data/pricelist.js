import { CONFIG } from "../config.js";

export class Pricelist {

    constructor({ w3bAPI, storage }) {
        this.w3bAPI = w3bAPI;
        this.storage = storage;
    }


    /*
     * Descarga la pricelist desde W3B,
     * la normaliza y la persiste.
     *
     * No debe ser llamada en cada búsqueda:
     * es responsabilidad del caller (main.js /
     * scheduler) decidir cuándo resincronizar.
     */
    async sync(userId) {

    const raw =
        await this.w3bAPI.getPricelist(userId);

    console.log(
        "[TornW3B] W3B raw:",
        raw
    );

    console.log(
        `[TornW3B] W3B devolvió ${
            Array.isArray(raw)
                ? raw.length
                : 0
        } items`
    );

    const items =
        this.normalize(raw);

    console.log(
        `[TornW3B] Después de normalizar: ${items.length} items`
    );

    const discarded =
        (Array.isArray(raw)
            ? raw.length
            : 0) -
        items.length;

    console.log(
        `[TornW3B] Descartados: ${discarded}`
    );

    return this.storage.savePricelist(
        items
    );
}


    normalize(rawItems) {

    if (!Array.isArray(rawItems)) {
        return [];
    }


    return rawItems

        .filter(item => {

            if (!item) {
                return false;
            }


            const itemId =
                Number(item.itemId);


            if (
                !Number.isInteger(itemId) ||
                itemId <= 0
            ) {
                return false;
            }


            if (
                typeof item.name !== "string" ||
                !item.name.trim()
            ) {
                return false;
            }


            const buyPrice =
                Number(item.buyPrice);


            if (
                !Number.isFinite(buyPrice) ||
                buyPrice <= 0
            ) {
                return false;
            }


            return true;
        })


        .map(item => ({

            itemId:
                Number(item.itemId),

            name:
                item.name.trim(),

            buyPrice:
                Number(item.buyPrice),

            bulkThreshold:
                Number(item.bulkThreshold) || 0,

            bulkBuyPrice:
                Number(item.bulkBuyPrice) || 0

        }));
}


    /*
     * Devuelve la pricelist cacheada sin
     * disparar ninguna solicitud HTTP.
     */
    async getAll() {

        const cache =
            await this.storage.getPricelist();

        return cache.items || [];
    }


    async getLastSync() {

        const cache =
            await this.storage.getPricelist();

        return cache.lastSync || null;
    }


    async getById(itemId) {

        const items =
            await this.getAll();

        return items.find(
            item => item.itemId === Number(itemId)
        ) || null;
    }


    /*
     * Búsqueda local (sección 28).
     * No hace fetch: opera sobre la cache
     * ya sincronizada.
     */
    async search(query) {

        if (
            !query ||
            query.length < CONFIG.SEARCH_MIN_LENGTH
        ) {
            return [];
        }

        const items =
            await this.getAll();

        const normalizedQuery =
            query.trim().toLowerCase();

        return items.filter(item =>
            item.name
                .toLowerCase()
                .includes(normalizedQuery)
        );
    }

    
    /*
    * =========================================================
    * ACTUALIZAR PRECIO DE UN ARTÍCULO
    * =========================================================
    *
    * Actualiza el precio fijo de un artículo en W3B.
    *
    * El precio recibido representa el precio de compra
    * recomendado por nuestro sistema.
    */

    async updatePrice(
        userId,
        itemId,
        buyPrice
    ) {

        const id =
            Number(itemId);


        /*
        * =====================================================
        * VALIDAR ITEM ID
        * =====================================================
        */

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            throw new Error(
                "ID de artículo inválido."
            );
        }


        /*
        * =====================================================
        * VALIDAR PRECIO
        * =====================================================
        */

        const price =
            Number(buyPrice);


        if (
            !Number.isFinite(price) ||
            price <= 0
        ) {

            throw new Error(
                `Precio inválido para el artículo ${id}.`
            );
        }


        /*
        * =====================================================
        * PRECIO TORN
        * =====================================================
        *
        * Torn no utiliza decimales.
        */

        const fixedPrice =
            Math.round(price);


        /*
        * =====================================================
        * ACTUALIZAR W3B
        * =====================================================
        */

        const response =
            await this.w3bAPI.updatePricelist(

                userId,

                [
                    {
                        itemID:
                            id,

                        pricingValue:
                            fixedPrice
                    }
                ]
            );


        /*
        * =====================================================
        * ACTUALIZAR CACHE LOCAL
        * =====================================================
        *
        * Solamente actualizamos la cache si W3B confirmó
        * correctamente la operación.
        */

        const items =
            await this.getAll();


        const updatedItems =
            items.map(item => {

                if (
                    item.itemId !== id
                ) {

                    return item;
                }


                return {

                    ...item,

                    buyPrice:
                        fixedPrice
                };
            });


        await this.storage.savePricelist(
            updatedItems
        );


        return {

            itemId:
                id,

            buyPrice:
                fixedPrice,

            w3b:
                response
        };
    }


}