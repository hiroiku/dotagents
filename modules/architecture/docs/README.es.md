# architecture

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | Español | [Français](README.fr.md)

Un módulo que fija la dirección de las dependencias, el lugar de cada archivo, cómo se nombran las cosas y por dónde viaja el fallo, en una forma que una máquina puede comprobar. Las reglas mismas están en [skills/design/SKILL.md](../skills/design/SKILL.md).

## ¿Cómo confiar en lo que no se puede leer?

El volumen de cambios que produce una IA ha superado lo que una persona puede leer. La revisión se encoge de cada línea a una muestra, y a menudo a comprobar que sigue funcionando. Es decir: se deja de confirmar **CÓMO se escribió y se pasa a confiar en QUÉ hace**.

Que esa confianza esté justificada no lo decide la paciencia de quien lee, sino si **el CÓMO está sujeto por un mecanismo**. Sea lo que sea que se esconda en la parte que nadie leyó: si la forma lo vuelve imposible de escribir, no está ahí.

Aquí hay una tensión. El límite de las convenciones estrictas era, hasta ahora, cuánto puede retener una persona. No cabía escribir más de lo memorizable, el cumplimiento solo podía confirmarse con la vista y, por eso, cuantas más reglas había, menos se sostenían. El rigor es el ideal que sale caro: ese era el cambio de la era humana.

Con una IA escribiendo, ese cambio se mueve. El esfuerzo de teclear código repetitivo casi desaparece. Lo caro para una IA es **adivinar dónde va cada cosa**, y una estructura que exige adivinar eleva directamente la probabilidad de que algo acabe en el sitio equivocado. El rigor se abarató; la ambigüedad se encareció. La relación se invirtió.

Pero atar demasiado mata el juicio del modelo. Por eso estas reglas atan solo la **estructura**, nunca el **juicio**. Las capas quedan fijadas en seis; los `<kind>` dentro de ellas, no. Las fronteras están decididas; qué se resuelve dentro, y cómo, queda en manos de quien escribe.

## No «darse cuenta», sino «no poder escribirlo»

La mayoría de las reglas se han desplazado del espacio donde la revisión tiene que **darse cuenta** al espacio donde, de entrada, **no se pueden escribir**.

| Lo que se protege                          | Qué lo protege                                            |
| ------------------------------------------ | --------------------------------------------------------- |
| Una dependencia que cruza capas            | la configuración de compilación (una capa invisible no resuelve tipos) |
| Vocabulario técnico llegando al interior   | que no haya paquete externo que importar                   |
| Un adaptador sin puerto correspondiente    | la regla de nombres de archivo                             |
| Un registro que falta en la composición    | los tipos                                                  |
| Un fallo tragado en silencio               | el tipo de retorno `Result`                                |
| Una dependencia que rodea el grafo         | no entregar el contenedor                                  |

No es un diseño cuyas infracciones se encuentran en la revisión, sino uno que **falla en el momento de escribirlo**. Cuando ya nadie lo lee todo, esa diferencia es la cantidad de tranquilidad disponible.

Que cada cosa tenga un único lugar y que el nombre diga su papel sirve al mismo fin: es legibilidad para las personas y, a la vez, bajo coste de búsqueda para una IA.

## Qué se toma prestado y qué no

| Regla                                                                | Origen                       |
| -------------------------------------------------------------------- | ---------------------------- |
| Las dependencias apuntan siempre hacia dentro                        | Clean Architecture           |
| Los adaptadores se dividen en driving y driven                       | Puertos y adaptadores        |
| El eje `<bounded_context>`; dentro, solo el lenguaje del negocio     | DDD                          |
| Una única raíz de composición                                        | composition root de la DI    |
| El fallo se devuelve como valor; `throw` queda para los bugs         | manejo funcional de errores  |
| Configuración de compilación por capa que convierte la infracción en error | propio de este módulo   |
| Los tests como espejo de las capas, con la misma regla sobre el espejo | propio de este módulo       |

**Esto no es una implementación de Clean Architecture.** Lo único tomado como invariante es la regla de dependencia; el diagrama no se copia. En particular, no se usan los puertos de salida: un presenter que implementa un puerto de la aplicación.

**Tampoco es una implementación de DDD.** Se toman prestadas dos cosas, bounded context y ubiquitous language; los agregados y el resto del diseño estratégico no vienen incluidos.

**Aquí las capas son interior y exterior, no arriba y abajo.** A diferencia del estilo clásico por capas, que fluye de arriba abajo, las dependencias apuntan siempre hacia dentro y el exterior es desconocido para el interior.

## Donde la decisión pudo haber sido otra

Los puntos de las reglas que admitían otra respuesta, y por qué se tomó esta.

**`app-kernel` no es un núcleo compartido.** El shared kernel de DDD es dominio que dos contextos acuerdan sostener en común; esto no es eso. Aquí vive la maquinaria sobre la que corre la arquitectura misma — `Result`, el tipo base de error — y nada que exista por lo que este producto hace. Ser la única hoja que todos pueden importar lo convierte en el sitio más barato para dejar cualquier cosa compartida: es la capa donde primero se acumulan los conceptos propios del producto, y por eso la única que hay que definir por lo que excluye. El interior del negocio es `domain`. `app-kernel` está debajo de todo el diagrama.

**`interface` no ve `domain`.** Cuando un controlador toca una entidad, la forma del dominio se filtra en la forma del cableado: refactorizar el dominio empieza a romper el contrato con el exterior, y vuelve justo aquello que la CA quería evitar. El precio es que un caso de uso lleve sus propios tipos de entrada y salida y que el presenter escriba la conversión; pero esa conversión es precisamente la traducción de la frontera.

**`frameworks` no ve `application`.** Con dos entradas, el trabajo transversal colocado en el controlador —autenticación, validación, traducción de errores— **se salta en silencio** por el otro camino. Nada falla; simplemente pasa. Es la forma más peligrosa de romperse, así que la entrada es una sola.

**Sin puertos de salida.** En la forma clásica, donde el caso de uso mueve al presenter, el retorno es `void`, así que **el compilador calla si quien llama ignora el resultado**. Devolviendo `Result`, nada compila hasta que se tratan el éxito y el fallo. Ganó la fuerza de los tipos.

**`ports/` conserva su nivel extra.** Si los puertos se ponen a la misma altura que cualquier otro tipo, la declaración de *lo que hace falta desde fuera* deja de distinguirse, por el nombre, de la lógica propia. Un nivel de asimetría es el precio de mantener visible esa distinción.

**El adaptador antepone el nombre de su puerto.** `google-drive-storage.integration.ts` frente a `storage.integration.ts`. Qué puerto satisface una implementación se lee en el nombre, y un huérfano sin puerto correspondiente se detecta de forma mecánica.

**El contenedor no cruza fronteras.** Si el interior puede recibir un resolver, alcanza cualquier cosa sin importarla. **El grafo de imports deja de decir la verdad sobre las dependencias**, y tanto la configuración de compilación como el linter quedan inermes. Las dependencias llegan como argumentos.

**La composición vive en cada nivel, con una sola raíz.** Tener el cableado junto al código hace que añadir un caso de uso toque un archivo de al lado. La composición de una capa solo ve su capa, así que no rompe su regla. Únicamente la raíz cruza capas, y ahí termina la excepción.

## Para qué sirve y para qué no

Sirve para una base de código longeva, con varios servicios externos y muy trabajada por IA. Para algo desechable, o pequeño y con una única dependencia externa, no compensa lo que cuesta.
