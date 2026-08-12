# CHANGELOG.md

# TornW3B Price Auditor

## [Unreleased]

### Nueva arquitectura de análisis de mercado

Se actualiza el sistema de auditoría para utilizar la información del **Item Market de Torn** y los **Bazares/Marketplace de TornW3B** como fuentes de información para determinar el valor real de mercado.

El objetivo es que el auditor no dependa únicamente del primer precio disponible, sino que analice la distribución de unidades y vendedores antes de calcular el valor de mercado.

---

# 1. Flujo general actualizado

El flujo de auditoría será:


Artículo
   │
   ▼
Auditor
   │
   ├── TornAPI
   │      └── Item Value
   │
   └── W3BAPI
          └── Marketplace
                 │
                 ▼
              Listings
                 │
                 ▼
          MarketAnalyzer
                 │
                 ├── Unidades totales
                 │
                 ├── 10% de unidades
                 │
                 ├── Listings necesarios
                 │
                 ├── 10% de vendedores
                 │
                 └── Muestra final
                         │
                         ▼
                  Cálculos estadísticos
                         │
                         ▼
                  Real Market Value


---

# 2. W3BAPI — Marketplace

## Estado

* [x] `getMarketplace(itemId)` implementado.
* [x] Endpoint `/marketplace/{itemId}` integrado.
* [x] Obtención de `marketplace.listings`.
* [x] Obtención de información general del Marketplace.

El método:

const marketplace =
    await w3bAPI.getMarketplace(itemId);


será la fuente de los listings de bazares.

### Responsabilidad

`W3BAPI` solamente obtiene los datos.

No debe:

* Calcular muestras.
* Calcular medias.
* Determinar el precio real.
* Determinar el precio de compra.
* Modificar ratios.

---

# 3. Datos de los listings

Cada listing podrá contener información como:


{
    player_name,
    quantity,
    price,
    content_updated,
    last_checked
}


El `MarketAnalyzer` deberá trabajar con:


player
price
quantity


como información mínima.

Los demás campos podrán utilizarse posteriormente para mejorar la confianza del análisis.

---

# 4. Auditor

`Auditor` ahora recibe `w3bAPI`:


constructor({
    tornAPI,
    w3bAPI,
    marketAnalyzer,
    ratioLearner,
    storage
})


Y obtiene el Marketplace mediante:


const marketplace =
    await this.w3bAPI.getMarketplace(itemId);


Los listings se entregan al analizador:


const listings =
    marketplace?.listings || [];

const marketAnalysis =
    this.marketAnalyzer.analyze(
        listings
    );


---

# 5. Item Value

El `Item Value` continúa obteniéndose desde `TornAPI`:


const itemResponse =
    await this.tornAPI.getItem(itemId);


Actualmente se utiliza:


item.value.market_price


como referencia para el sistema de ratio.

Este comportamiento se mantiene temporalmente.

---

# 6. Nuevo algoritmo de muestreo

Esta es la modificación principal de esta versión.

La muestra **NO** se obtiene directamente tomando el 10% de todos los vendedores.

El algoritmo tendrá dos etapas.

---

## Etapa 1 — Determinar el 10% de las unidades

Primero se obtiene la cantidad total de unidades disponibles:


totalQuantity


Después:


targetQuantity =
    totalQuantity × 10%


Ejemplo:


Mercado:
1,000 unidades

10%:
100 unidades


El objetivo inicial será analizar las primeras **100 unidades** del mercado.

---

# 7. Orden de los listings

Los listings deberán ordenarse por precio ascendente:


listings.sort(
    (a, b) => a.price - b.price
);


Esto permite recorrer el mercado desde el precio más bajo.

Ejemplo:

#   Precio    Cantidad
1   $436      1
2   $795      1
3   $800      34
4   $820      20
5   $850      15
6   $900      29
7   $950      50


---

# 8. Encontrar el límite del 10% de unidades

Se recorren los listings acumulando cantidades:


Listing 1
1 unidad
Acumulado = 1

Listing 2
1 unidad
Acumulado = 2

Listing 3
34 unidades
Acumulado = 36

Listing 4
20 unidades
Acumulado = 56

Listing 5
15 unidades
Acumulado = 71

Listing 6
29 unidades
Acumulado = 100


Cuando el acumulado alcanza o supera el objetivo:


targetQuantity


se detiene el recorrido.

---

# 9. Cantidad de vendedores necesarios

El algoritmo registra cuántos listings fueron necesarios para alcanzar el 10% de las unidades.

En el ejemplo:


6 listings


Por lo tanto:


requiredListings = 6


Este número será utilizado para la segunda etapa.

---

# 10. Etapa 2 — Muestra de vendedores

Ahora se calcula el 10% de los vendedores/listings necesarios:


requiredListings × 10%


Ejemplo:


6 × 10%
= 0.6


Pero el sistema tiene un mínimo de:


5 vendedores


Por lo tanto:


MAX(
    CEIL(requiredListings × 10%),
    5
)


Resultado:


5 vendedores


---

# 11. Regla definitiva de tamaño de muestra

La regla será:


const sampleSize =
    Math.min(
        sortedListings.length,
        Math.max(
            Math.ceil(
                requiredListings * 0.10
            ),
            5
        )
    );


Es decir:


Muestra =
MAX(
    10% de vendedores necesarios,
    5
)

limitada por la cantidad real de listings disponibles.

---

# 12. Ejemplos

## Caso A — Pocos vendedores


Unidades totales: 1,000
Objetivo: 100 unidades

Listings necesarios:
6

10%:
0.6

Mínimo:
5

Muestra final:
5 listings


---

## Caso B — Muchos vendedores


Unidades totales: 10,000
Objetivo: 1,000 unidades

Listings necesarios:
80

10%:
8

Mínimo:
5

Muestra final:
8 listings


---

## Caso C — 30 vendedores


Listings necesarios:
30

10%:
3

Mínimo:
5

Muestra final:
5 listings


---

## Caso D — 100 vendedores


Listings necesarios:
100

10%:
10

Mínimo:
5

Muestra final:
10 listings


---

# 13. Muestra definitiva

Una vez calculado `sampleSize`, se seleccionan los primeros listings del conjunto ordenado:


const sample =
    sortedListings.slice(
        0,
        sampleSize
    );


Esta será la **única muestra utilizada por el algoritmo estadístico**.

---

# 14. Importante: qué NO significa el 10%

El sistema NO hará:


10% de todas las unidades
+
10% de todos los vendedores


Tampoco hará:


10% de los listings totales


La secuencia correcta es:


TODAS LAS UNIDADES
       ↓
     10%
       ↓
determinar cuántos listings
necesitamos para cubrir ese 10%
       ↓
10% de esos listings
       ↓
mínimo 5
       ↓
MUESTRA FINAL


---

# 15. Cálculos estadísticos

Una vez obtenida la muestra final, `MarketAnalyzer` podrá calcular:

* Media ponderada.
* Mediana.
* Dispersión.
* Precio mínimo.
* Precio máximo.
* Distribución de precios.
* `realMarketValue`.
* Confianza.

Todos estos cálculos deberán utilizar la **muestra final**, no todo el mercado.

---

# 16. Cantidad y precio

La cantidad de unidades se utilizará para determinar:

qué parte del mercado estudiar


Mientras que los listings seleccionados se utilizarán para determinar:


qué vendedores representan la muestra


Esto permite separar:

Profundidad del mercado

de:


Muestra estadística


---

# 17. Ejemplo completo

Supongamos:


Mercado total:
15,458 unidades


Entonces:


15,458 × 10%
= 1,545.8


El objetivo será aproximadamente:


1,546 unidades


Se recorren los listings ordenados por precio:


Listing 1
Listing 2
Listing 3
...
Listing N


hasta acumular:


≥ 1,546 unidades


Supongamos que esto ocurre en:


120 listings


Entonces:


120 × 10%
= 12


Como:


12 > 5


la muestra final será:


12 listings


El algoritmo realizará todos los cálculos sobre esos 12 listings.

---

# 18. Por qué se utiliza un mínimo de 5

El mínimo de 5 evita que el algoritmo termine trabajando con muestras demasiado pequeñas.

Por ejemplo:


requiredListings = 3


El 10% sería:


0.3


Sin mínimo, el resultado sería una muestra de 1 listing.

Eso sería demasiado poco representativo.

Por lo tanto:


mínimo = 5


Siempre que existan al menos 5 listings disponibles.

---

# 19. Si existen menos de 5 listings

No se deben inventar vendedores.

Si existen solamente:


3 listings

entonces:


sampleSize = 3


La cantidad real de listings limita el tamaño máximo de la muestra.

---

# 20. MarketAnalyzer

El nuevo `MarketAnalyzer` deberá producir información equivalente a:


{
    totalQuantity,

    targetQuantity,

    requiredListings,

    sampleSize,

    sampleQuantity,

    weightedMean,

    weightedMedian,

    dispersion,

    realMarketValue,

    confidence
}


Los nombres podrán ajustarse a la implementación actual.

---

# 21. Compatibilidad con el algoritmo anterior

Durante la implementación se conservará temporalmente el algoritmo anterior.

El objetivo es poder comparar:


Old Real Market Value


contra:


New Real Market Value


Esto permitirá comprobar si el nuevo sistema produce resultados más coherentes.

Una vez validado:


Old algorithm


podrá eliminarse.

---

# 22. BazaarAnalyzer

Después de terminar `MarketAnalyzer`, se creará:


BazaarAnalyzer.js


Su responsabilidad será analizar específicamente los datos de bazares.

Deberá calcular:

* Precio mínimo.
* Precio máximo.
* Media.
* Mediana.
* Media ponderada.
* Cantidad total.
* Cantidad de traders.
* Concentración de oferta.
* Distribución de precios.

---

# 23. Separación de fuentes

No se mezclarán inmediatamente los datos.

El sistema deberá mantener:


{
    itemMarket: {
        ...
    },

    bazaars: {
        ...
    }
}


Esto permitirá estudiar independientemente ambas fuentes.

---

# 24. Item Market vs Bazares

## Item Market

Representa:

> El precio al que actualmente están disponibles los artículos en el mercado inmediato.

## Bazares

Representan:

> Los precios y cantidades a los que otros traders están intentando vender.

Ambas señales podrán diferir considerablemente.

---

# 25. Real Market Value

El `realMarketValue` deberá evolucionar para considerar:


Item Market
+
Bazares
+
Distribución
+
Profundidad
+
Muestra
+
Historial


La fórmula definitiva todavía no se fija en esta versión.

Primero se debe validar la calidad de la muestra.

---

# 26. RatioLearner

No se modifica todavía.

Se mantiene temporalmente:


Observed Ratio
       ↓
RatioLearner
       ↓
Learned Ratio


La arquitectura futura separará:


Ratio aprendido


de:


Precio actual de TornW3B


para evitar contaminar el aprendizaje al modificar precios externos.

---

# 27. Lista interna de precios

Posteriormente se creará una lista interna:


Internal Price List


Esta lista será la referencia propia del sistema.

La lista externa de TornW3B se utilizará inicialmente para establecer los valores iniciales.

Después:


TornW3B Pricelist
        ↓
 Inicialización
        ↓
Internal Price List
        ↓
Aprendizaje
        ↓
Actualizaciones


---

# 28. Propuestas de actualización

Una auditoría futura podrá producir:


Valor interno:
$1,000

Valor estimado:
$700

Cambio propuesto:
-$300


Además:


Compra recomendada:
$560

Venta recomendada:
$630


Pero la modificación de la lista interna no será automática.

---

# 29. Actualización manual

El sistema deberá generar:


UPDATE_AVAILABLE


cuando exista suficiente diferencia y confianza.

El usuario podrá aceptar:


[Actualizar precios]


y solamente entonces se modificará la lista interna.

---

# 30. Storage

`Storage` deberá separar:

## Historial

Audit History


Contendrá las observaciones realizadas.

## Estado actual


Internal Price List


Contendrá el conocimiento actual del sistema.

No deben mezclarse ambas responsabilidades.

---

# 31. Estados

Se mantienen:


GREEN
YELLOW
RED


Reglas actuales:


≤ 3%  → GREEN
≤ 10% → YELLOW
> 10% → RED


Posteriormente podrá añadirse:


UPDATE_AVAILABLE


como estado independiente para indicar que existe una propuesta de actualización.

---

# 32. Confianza

La confianza inicial dependerá del análisis de mercado.

Posteriormente podrá incorporar:

* Cantidad de listings.
* Tamaño de muestra.
* Dispersión.
* Profundidad.
* Diferencia entre mercados.
* Antigüedad de listings.
* Historial de observaciones.
* Consistencia de resultados.

---

# 33. Estado de implementación actual

La arquitectura de análisis de mercado definida anteriormente ya fue implementada y validada mediante pruebas automatizadas.

El flujo actual es:

TornAPI
↓
Item Value

TornAPI
↓
Item Market
↓
MarketAnalyzer
↓
Market Analysis

W3BAPI
↓
Marketplace
↓
BazaarAnalyzer
↓
Bazaar Analysis

Market Analysis
+
Bazaar Analysis
↓
MarketValueAnalyzer
↓
Real Market Value

Real Market Value
×
Learned Ratio
↓
Correct Buy Price

---

# 34. MarketAnalyzer — Estado actual

`MarketAnalyzer` implementa y calcula la información necesaria para determinar el valor del Item Market.

Actualmente proporciona:

* `totalQuantity`
* `listingsCount`
* `targetQuantity`
* `requiredListings`
* `sampleSize`
* `sampleQuantity`
* `accumulatedQuantity`
* `sampleListingsCount`
* `sellerSampleSize`
* `weightedMean`
* `weightedMedian`
* `dispersion`
* `realMarketValue`
* `confidence`

El algoritmo de muestreo definido anteriormente ya forma parte de la arquitectura validada.

## Estado

* [x] Ordenamiento de listings.
* [x] Cálculo de unidades totales.
* [x] Cálculo del objetivo del 10%.
* [x] Determinación de listings necesarios.
* [x] Cálculo del tamaño de muestra.
* [x] Mínimo de 5 listings cuando existen suficientes datos.
* [x] Limitación por cantidad real de listings.
* [x] Cálculo de estadísticas.
* [x] Cálculo de `realMarketValue`.
* [x] Cálculo de confianza.
* [x] Pruebas del flujo de análisis.

---

# 35. BazaarAnalyzer — Estado actual

`BazaarAnalyzer` ya forma parte del flujo del auditor.

Su responsabilidad es analizar exclusivamente los listings provenientes de los bazares/Marketplace de TornW3B.

Actualmente proporciona información como:

* `totalQuantity`
* `listingsCount`
* `traderCount`
* `minPrice`
* `maxPrice`
* `weightedMean`
* `weightedMedian`
* `dispersion`
* `priceDistribution`
* `largestTraderQuantity`
* `largestTraderShare`
* `confidence`

También permite detectar concentración de la oferta.

Una concentración elevada de la oferta en un único trader reduce la fuerza de la señal de bazares.

## Estado

* [x] Obtención de listings desde W3B.
* [x] Análisis independiente de bazares.
* [x] Cálculo de estadísticas.
* [x] Análisis de concentración.
* [x] Cálculo de confianza.
* [x] Integración con `Auditor`.
* [x] Manejo de errores sin destruir la auditoría.

---

# 36. MarketValueAnalyzer — Nueva etapa completada

Se implementó `MarketValueAnalyzer` como capa encargada de combinar las señales independientes del Item Market y los Bazares.

Recibe:

{
market,
bazaars
}

y produce una estimación de:

`realMarketValue`

además de:

* `marketWeight`
* `bazaarWeight`
* `confidence`
* `signals`

---

## 36.1. Señales independientes

El analizador mantiene separadas las dos fuentes:

Market:

`marketValue`

Bazares:

`bazaarValue`

Esto evita tratar ambas fuentes como si fueran exactamente equivalentes.

---

## 36.2. Pesos dinámicos

Los pesos dependen de la calidad de cada fuente.

Se consideran factores como:

* Confianza.
* Tamaño de muestra.
* Dispersión.
* Cantidad de traders.
* Cantidad disponible.
* Concentración de la oferta.

Una fuente con mejor calidad obtiene mayor peso.

---

## 36.3. Alta dispersión en bazares

Cuando la dispersión de los bazares es elevada, el sistema puede utilizar la mediana ponderada como señal principal en lugar de depender exclusivamente de la media.

Esto reduce la influencia de precios extremos.

---

## 36.4. Concentración de traders

Una oferta excesivamente concentrada reduce el peso de la señal de bazares.

Por ejemplo:

Un solo trader controla el 90% de las unidades.

En este caso:

`bazaarWeight`

debe reducirse respecto a un mercado donde la oferta esté distribuida entre muchos traders.

---

## 36.5. Diferencia entre fuentes

Cuando el Item Market y los Bazares presentan valores muy diferentes, el sistema detecta:

`highDisagreement`

y reduce la confianza final.

Esto permite distinguir:

Fuentes consistentes

de:

Fuentes que están mostrando señales contradictorias.

---

## 36.6. Casos sin información

El analizador contempla:

### Solo Market

Utiliza exclusivamente el Item Market.

### Solo Bazares

Utiliza exclusivamente los Bazares.

### Ambas fuentes

Combina ambas señales según sus pesos.

### Ninguna fuente válida

Devuelve:

`null`

---

# 37. Integración con Auditor

`Auditor` ahora ejecuta el flujo completo:

1. Obtiene el Item Value desde Torn.
2. Calcula el `observedRatio`.
3. Obtiene el historial anterior.
4. Actualiza el `learnedRatio`.
5. Obtiene el Item Market de Torn.
6. Ejecuta `MarketAnalyzer`.
7. Obtiene el Marketplace de W3B.
8. Ejecuta `BazaarAnalyzer`.
9. Ejecuta `MarketValueAnalyzer`.
10. Obtiene el `realMarketValue` combinado.
11. Calcula el precio correcto de compra.
12. Calcula la diferencia.
13. Determina el estado.
14. Guarda la auditoría.

---

# 38. Precio correcto de compra

El cálculo actual queda definido como:

`MarketValueAnalyzer.realMarketValue × learnedRatio`

Es decir:

Real Market Value
↓
× Learned Ratio
↓
Correct Buy Price

Importante:

El `realMarketValue` utilizado por `Auditor` ya no depende exclusivamente de:

`marketAnalysis.realMarketValue`

Ahora utiliza:

`marketValueAnalysis.realMarketValue`

Esto fue validado mediante pruebas de integración.

---

# 39. RatioLearner — Estado actual

`RatioLearner` todavía utiliza temporalmente:

Observed Ratio
↓
RatioLearner
↓
Learned Ratio

El `observedRatio` inicial continúa calculándose comparando:

`W3B Buy Price`

contra:

`Torn Item Value`

Esta parte todavía será reemplazada progresivamente por el sistema de referencia interno de precios.

---

# 40. Pruebas automatizadas

Se creó una batería de pruebas para validar la nueva arquitectura.

## MarketValueAnalyzer

10 casos:

* [x] Solo Market.
* [x] Solo Bazares.
* [x] Ambas fuentes similares.
* [x] Market fuerte / Bazaar débil.
* [x] Bazaar fuerte / Market débil.
* [x] Concentración extrema.
* [x] Alta dispersión.
* [x] Diferencia elevada entre fuentes.
* [x] Datos inválidos.
* [x] Ninguna fuente.

Resultado:

**10/10 pruebas exitosas.**

---

## Auditor — Integration Flow

Se validaron:

* [x] Validación del artículo.
* [x] Obtención de Item Value.
* [x] Ratio observado.
* [x] Ratio aprendido.
* [x] Obtención de Item Market.
* [x] Normalización de cantidades.
* [x] Manejo de mercado vacío.
* [x] MarketAnalyzer.
* [x] W3B Marketplace.
* [x] BazaarAnalyzer.
* [x] Manejo de errores del BazaarAnalyzer.
* [x] MarketValueAnalyzer.
* [x] Cálculo del precio correcto.
* [x] Diferencia.
* [x] Estado.
* [x] Confianza.
* [x] Timestamp.
* [x] Persistencia.

---

## Resultado actual

**25/25 pruebas exitosas.**

El mensaje:

`Error analizando bazares ... bazaar exploded`

aparece intencionalmente durante una prueba que fuerza un error del `BazaarAnalyzer` para comprobar que el `Auditor` pueda continuar.

No representa un fallo de la suite.

---

# 41. Estado de la arquitectura

La arquitectura actual queda:


                    ┌──────────────┐
                    │   TornAPI    │
                    └──────┬───────┘
                           │
                     Item Value
                           │
                           ▼
                    ┌──────────────┐
                    │    Auditor   │
                    └──────┬───────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
      ┌──────────────┐           ┌──────────────┐
      │ Item Market  │           │ W3B Marketplace│
      └──────┬───────┘           └──────┬────────┘
             │                          │
             ▼                          ▼
      ┌──────────────┐           ┌──────────────┐
      │MarketAnalyzer│           │BazaarAnalyzer│
      └──────┬───────┘           └──────┬───────┘
             │                          │
             └────────────┬─────────────┘
                          ▼
                 ┌───────────────────┐
                 │MarketValueAnalyzer│
                 └─────────┬─────────┘
                           │
                    Real Market Value
                           │
                           ▼
                    × Learned Ratio
                           │
                           ▼
                   Correct Buy Price
                           │
                           ▼
                       Auditor


---

# 42. Nueva prioridad: Internal Price List

La siguiente etapa importante ya no es mejorar la obtención básica del valor de mercado.

La siguiente etapa será crear la:

**Internal Price List**

Esta lista representará el conocimiento propio de TornW3B Price Auditor.

Debe diferenciarse de:

* Torn Item Value.
* Torn Item Market.
* W3B Marketplace.
* W3B Bazaar Average.

La lista interna será persistente y evolucionará mediante observaciones.

---

# 43. Internal Price List — Objetivo

Para cada artículo se deberá poder almacenar algo similar a:


itemId
itemName
internalPrice
confidence
observations
lastUpdated


Posteriormente podrán añadirse:


previousPrice
priceTrend
minimumConfidence
recommendedBuyPrice
recommendedSellPrice


La lista no debe depender exclusivamente del valor actual proporcionado por Torn.

---

# 44. Inicialización de la lista interna

La primera observación podrá utilizar las señales disponibles actualmente:

Torn Item Value
+
Item Market
+
Bazaar Analysis
+
MarketValueAnalyzer

para crear un valor inicial.

Posteriormente las observaciones sucesivas permitirán actualizar el valor interno.

---

# 45. Aprendizaje del precio interno

El objetivo futuro será:

Observación 1
↓
Precio interno inicial

Observación 2
↓
Actualizar conocimiento

Observación 3
↓
Actualizar conocimiento

Observación N
↓
Precio interno consolidado

El sistema deberá evitar que una única observación extrema modifique excesivamente el precio.

---

# 46. Separación entre observación y conocimiento

La arquitectura deberá distinguir claramente:

## Observación

Lo que el mercado está mostrando actualmente.

## Conocimiento interno

Lo que el sistema considera que vale el artículo después de analizar múltiples observaciones.

Por lo tanto:

`MarketValue`

no debe ser automáticamente igual a:

`InternalPrice`

---

# 47. Price Proposal

Una vez creada la lista interna, el auditor podrá comparar:

Internal Price
vs.
W3B Buy Price

y generar:

`Price Proposal`

Ejemplo:


Internal Price:      $1,000
W3B Buy Price:        $700

Recommended Buy:      $800
Potential Difference:   30%
Confidence:             87%


La propuesta no modificará automáticamente el precio interno.

---

# 48. Actualización manual

Cuando exista suficiente evidencia, el sistema podrá generar:

`UPDATE_AVAILABLE`

El usuario podrá decidir:

```text
[ Accept Update ]
[ Reject Update ]
```

Solo después de aceptar se actualizará la lista interna.

---

# 49. Storage

El almacenamiento deberá evolucionar para separar:

## Audit History

Historial de observaciones.

## Internal Price List

Estado actual del conocimiento.

## Price Proposals

Propuestas pendientes o históricas.

La información no debe mezclarse en un único objeto de auditoría.

---

# 50. Estados futuros

Actualmente:

`GREEN`

`YELLOW`

`RED`

Posteriormente podrán existir señales independientes como:

`UPDATE_AVAILABLE`

`INSUFFICIENT_DATA`

`HIGH_DISAGREEMENT`

`LOW_CONFIDENCE`

Estas señales no necesariamente deben reemplazar los estados actuales.

---

# 51. Confidence futura

La confianza deberá evolucionar para considerar además del análisis actual:

* Número de observaciones históricas.
* Estabilidad del precio interno.
* Variación entre auditorías.
* Antigüedad de los datos.
* Consistencia entre Item Market y Bazares.
* Calidad de la muestra.
* Dispersión.
* Concentración.
* Profundidad del mercado.

---

# 52. Próximas etapas

La implementación continuará en este orden:

1. **Internal Price List**
   ↓
2. Modelo de almacenamiento del precio interno
   ↓
3. Inicialización mediante primera observación
   ↓
4. Actualización/aprendizaje del precio interno
   ↓
5. Separación entre precio externo y precio interno
   ↓
6. Price Proposal
   ↓
7. Actualización manual
   ↓
8. Evolución de RatioLearner
   ↓
9. Historial y aprendizaje avanzado
   ↓
10. Interfaz
    ↓
11. Pruebas con artículos reales

---

# 53. Estado del proyecto

## Completado

* [x] TornAPI.
* [x] Obtención de Item Value.
* [x] W3BAPI.
* [x] `getMarketplace(itemId)`.
* [x] Obtención de Marketplace.
* [x] Obtención de listings.
* [x] Integración de W3BAPI en Auditor.
* [x] MarketAnalyzer.
* [x] Algoritmo de muestreo.
* [x] Estadísticas del Item Market.
* [x] BazaarAnalyzer.
* [x] Estadísticas de bazares.
* [x] Análisis de concentración.
* [x] MarketValueAnalyzer.
* [x] Combinación ponderada de fuentes.
* [x] Detección de desacuerdo entre fuentes.
* [x] Cálculo de confianza.
* [x] Integración completa en Auditor.
* [x] `correctBuyPrice` basado en `marketValueAnalysis.realMarketValue`.
* [x] Manejo de errores.
* [x] Pruebas unitarias.
* [x] Pruebas de integración.
* [x] **25/25 pruebas exitosas.**

## Siguiente etapa

* [ ] Diseñar Internal Price List.
* [ ] Crear modelo de precio interno.
* [ ] Implementar persistencia.
* [ ] Inicializar precio interno.
* [ ] Aprender de observaciones posteriores.
* [ ] Separar precio interno de valores externos.
* [ ] Crear Price Proposal.

## Posterior

* [ ] Actualizar RatioLearner.
* [ ] Mejorar sistema de confianza histórica.
* [ ] Actualizar manualmente la lista interna.
* [ ] Historial de propuestas.
* [ ] Interfaz.
* [ ] Pruebas con artículos reales.
* [ ] Optimización y producción.


