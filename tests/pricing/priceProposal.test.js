import test from "node:test";
import assert from "node:assert/strict";

import { PriceProposal } from "../../src/data/priceProposal.js";

function createProposal(overrides = {}) {

return new PriceProposal({

    differenceThreshold:
        overrides.differenceThreshold ??
        0.10,

    minimumConfidence:
        overrides.minimumConfidence ??
        70
});


}

/*

* =========================================================
* 1. PROPUESTA VÁLIDA
* =========================================================
  */

test(
"1. genera propuesta cuando existe una diferencia significativa",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 700,

            learnedRatio: 0.8,

            confidence: 85
        });


    assert.equal(
        result.itemId,
        1
    );

    assert.equal(
        result.currentInternalPrice,
        1000
    );

    assert.equal(
        result.observedMarketValue,
        700
    );

    assert.equal(
        result.difference,
        -300
    );

    assert.equal(
        result.recommendedBuyPrice,
        560
    );

    assert.equal(
        result.confidence,
        85
    );

    assert.equal(
        result.updateAvailable,
        true
    );

    assert.equal(
        result.status,
        "UPDATE_AVAILABLE"
    );
}

);

/*

* =========================================================
* 2. DIFERENCIA
* =========================================================
  */

test(
"2. calcula differencePercent correctamente",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 800,

            learnedRatio: 0.8,

            confidence: 90
        });


    assert.equal(
        result.differencePercent,
        -0.2
    );
}


);

/*

* =========================================================
* 3. DIFERENCIA PEQUEÑA
* =========================================================
  */

test(
"3. no genera propuesta cuando la diferencia no supera el 10%",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 950,

            learnedRatio: 0.8,

            confidence: 90
        });


    assert.equal(
        result.updateAvailable,
        false
    );

    assert.equal(
        result.status,
        "NO_UPDATE"
    );
}


);

/*

* =========================================================
* 4. CONFIANZA BAJA
* =========================================================
  */

test(
"4. no genera propuesta cuando la confianza es insuficiente",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 700,

            learnedRatio: 0.8,

            confidence: 60
        });


    assert.equal(
        result.updateAvailable,
        false
    );

    assert.equal(
        result.status,
        "NO_UPDATE"
    );
}


);

/*

* =========================================================
* 5. CONFIANZA EXACTAMENTE EN EL MÍNIMO
* =========================================================
  */

test(
"5. genera propuesta cuando la confianza alcanza el mínimo",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 700,

            learnedRatio: 0.8,

            confidence: 70
        });


    assert.equal(
        result.updateAvailable,
        true
    );
}


);

/*

* =========================================================
* 6. DIFERENCIA POSITIVA
* =========================================================
  */

test(
"6. detecta también cuando el mercado está por encima del precio interno",
() => {

    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 1200,

            learnedRatio: 0.8,

            confidence: 85
        });


    assert.equal(
        result.difference,
        200
    );

    assert.equal(
        result.differencePercent,
        0.2
    );

    assert.equal(
        result.recommendedBuyPrice,
        960
    );

    assert.equal(
        result.updateAvailable,
        true
    );
}


);

/*

* =========================================================
* 7. PRECIO ENTERO
* =========================================================
  */

test(
"7. recommendedBuyPrice siempre es entero",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 1067,

            learnedRatio: 0.8,

            confidence: 90
        });


    assert.equal(
        Number.isInteger(
            result.recommendedBuyPrice
        ),
        true
    );

    assert.equal(
        result.recommendedBuyPrice,
        854
    );
}


);

/*

* =========================================================
* 8. ID INVÁLIDO
* =========================================================
  */

test(
"8. rechaza itemId inválido",
() => {


    const proposal =
        createProposal();

    assert.throws(
        () => {

            proposal.generate({

                itemId: 0,

                itemName: "Xanax",

                internalMarketValue: 1000,

                realMarketValue: 700,

                learnedRatio: 0.8,

                confidence: 85
            });
        },

        /ID de artículo inválido/
    );
}


);

/*

* =========================================================
* 9. PRECIO INTERNO INVÁLIDO
* =========================================================
  */

test(
"9. rechaza precio interno inválido",
() => {


    const proposal =
        createProposal();

    assert.throws(
        () => {

            proposal.generate({

                itemId: 1,

                itemName: "Xanax",

                internalMarketValue: 0,

                realMarketValue: 700,

                learnedRatio: 0.8,

                confidence: 85
            });
        },

        /Precio interno inválido/
    );
}


);

/*

* =========================================================
* 10. REAL MARKET VALUE INVÁLIDO
* =========================================================
  */

test(
"10. rechaza Real Market Value inválido",
() => {

    const proposal =
        createProposal();

    assert.throws(
        () => {

            proposal.generate({

                itemId: 1,

                itemName: "Xanax",

                internalMarketValue: 1000,

                realMarketValue: 0,

                learnedRatio: 0.8,

                confidence: 85
            });
        },

        /Real Market Value inválido/
    );
}


);

/*

* =========================================================
* 11. LEARNED RATIO INVÁLIDO
* =========================================================
  */

test(
"11. rechaza learnedRatio inválido",
() => {


    const proposal =
        createProposal();

    assert.throws(
        () => {

            proposal.generate({

                itemId: 1,

                itemName: "Xanax",

                internalMarketValue: 1000,

                realMarketValue: 700,

                learnedRatio: NaN,

                confidence: 85
            });
        },

        /Learned Ratio inválido/
    );
}


);

/*

* =========================================================
* 12. CONFIDENCE INVÁLIDA
* =========================================================
  */

test(
"12. confidence inválida se considera 0",
() => {


    const proposal =
        createProposal();

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue: 1000,

            realMarketValue: 700,

            learnedRatio: 0.8,

            confidence: NaN
        });


    assert.equal(
        result.confidence,
        0
    );

    assert.equal(
        result.updateAvailable,
        false
    );
}


);

/*

* =========================================================
* 13. NO MODIFICA EL PRECIO INTERNO
* =========================================================
  */

test(
"13. PriceProposal solamente genera una propuesta",
() => {


    const proposal =
        createProposal();

    const internalPrice =
        1000;

    const result =
        proposal.generate({

            itemId: 1,

            itemName: "Xanax",

            internalMarketValue:
                internalPrice,

            realMarketValue: 700,

            learnedRatio: 0.8,

            confidence: 85
        });


    assert.equal(
        internalPrice,
        1000
    );

    assert.equal(
        result.currentInternalPrice,
        1000
    );

    assert.equal(
        result.observedMarketValue,
        700
    );
}


);
