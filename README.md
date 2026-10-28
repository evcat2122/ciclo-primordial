# Ciclo Primordial

Juego de navegador sobre la evolución: empiezas como una ameba en una caverna bajo un Árbol inmenso y evolucionas forma tras forma. Comer o ser comido.

**Jugar:** https://evcat2122.github.io/ciclo-primordial/

## Capítulo 1 (esta versión)
- Cuatro formas: ameba → gusano → pez sin mandíbula → pez con mandíbula, cada una con una ventaja y un defecto.
- Cadena alimenticia por colores: verde = presa, amarillo = igual, rojo = depredador.
- Con el ADN eliges: **evolucionar** o **multiplicarte** (huevos = vidas).
- Si mueres sin huevos vuelves a ser ameba, pero **recuerdas el camino**: re-evolucionar cuesta el 40%.
- Cuantas más presas cazas, más se agita el Árbol y sus raíces golpean.
- Final: vence al Acorazado y cruza la Grieta de luz.

## Controles
Mouse, WASD o arrastrar el dedo para moverte. Espacio o clic: habilidad. R: multiplicarte. F: árbol de la vida. P: pausa.

## Técnica
HTML + Canvas + módulos JS, sin dependencias. La simulación (`src/sim.js`) está separada del dibujo para poder correr en un anfitrión en los modos multijugador.
