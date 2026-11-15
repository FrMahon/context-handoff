# context-handoff

Plugin de Claude Code que avisa **solo** cuando la conversación llega a ~150k tokens de contexto y deja todo listo para hacer `/clear` sin perder el hilo: estado guardado en memoria, rama y cambios anotados, y un prompt para pegar en la sesión nueva.

*English: a Claude Code plugin that, when your conversation reaches ~150k tokens of context, makes Claude save state to memory, note the git branch and give you a ready-to-paste prompt to resume after `/clear`. Automatic, once per stretch.*

## Cómo funciona

1. Un hook `UserPromptSubmit` (Node, sin dependencias) lee en cada mensaje el uso de tokens del último mensaje del asistente en el transcript.
2. Al pasar el umbral inyecta una instrucción para que Claude use la skill `context-handoff`. Una sola vez por tramo, con un recordatorio a umbral + 50k.
3. La skill: dice si conviene limpiar ya o terminar antes lo que está en curso, actualiza la memoria del proyecto, registra rama y `git status`, y entrega el prompt de reanudación.

Si el contexto baja mucho (por ejemplo tras `/clear`), el aviso se rearma.

## Instalación

Requiere Node >= 18.

```
/plugin marketplace add <ruta-local-o-usuario/repo>
/plugin install context-handoff@context-handoff
```

También podés invocar la skill a mano: `/context-handoff`.

## Configuración

| Variable | Default | Qué hace |
|---|---|---|
| `CONTEXT_HANDOFF_THRESHOLD` | `150000` | Tokens de contexto a partir de los cuales avisa. |

## Privacidad

El hook solo lee el conteo de tokens del transcript local. No envía nada a ningún lado.

## Costo en tokens

Por debajo del umbral el hook corre en tu máquina y no suma ningún token al contexto. Lo único fijo es la descripción de la skill (unas decenas de tokens, estimación). Al dispararse, una vez por tramo: el mensaje del hook, el cuerpo de la skill y unas 3 llamadas a herramientas (git y memoria), cada una releyendo el contexto desde caché. A cambio, un `/clear` abarata todos los mensajes siguientes y evita un auto-compact. Son estimaciones, no mediciones.

## Barra de estado (opcional)

El plugin no instala ninguna barra de estado. Si usás una propia con `statusLine`, podés colorear el contexto con el mismo umbral leyendo `CONTEXT_HANDOFF_THRESHOLD`.

## Limitaciones

- El aviso es una instrucción inyectada (`additionalContext`), no una orden: Claude casi siempre la sigue, pero no es garantía absoluta.
- No ejecuta `/clear` ni compacta por su cuenta; eso lo hacés vos.
- Si el formato del transcript cambia en una versión futura, el hook falla en silencio (no rompe la sesión) y simplemente no avisa.

## Probado con

Sesión real de Claude Code (2026-11-14, plugin cargado con `--plugin-dir`, `CONTEXT_HANDOFF_THRESHOLD=100`): el primer turno no avisa (todavía no hay uso de tokens), el segundo recibe la instrucción de `CONTEXT HANDOFF` y el tercero no la repite. Observación: si el usuario pide explícitamente otra cosa, Claude puede priorizarla sobre el aviso (ver Limitaciones).

También con el plugin ya instalado y el umbral por defecto (150000): con un contexto real de más de 150k tokens, el segundo turno recibió el aviso, recomendó limpiar, guardó el estado y entregó el prompt de reanudación; el tercero no lo repitió. La secuencia de dos pasos (aviso a 150k y recordatorio a 200k) está cubierta solo por tests unitarios.

## Desarrollo

```
npm test
```

## Licencia

MIT
