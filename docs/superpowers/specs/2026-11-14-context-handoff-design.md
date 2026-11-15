# context-handoff: diseño

## Intención
Plugin de Claude Code, instalable por cualquiera, que avisa **solo** cuando la conversación llega a ~150k tokens de contexto y deja todo listo para hacer `/clear` sin perder el hilo: estado guardado en memoria, rama/cambios anotados y un prompt para pegar en la sesión nueva.
Por qué: hoy es una regla de CLAUDE.md que depende de que Claude la recuerde. Debe ser constante y automático.

## Objetivos
- Disparo automático al cruzar el umbral (default 150k, configurable), una sola vez por tramo de sesión.
- Traspaso completo: memoria actualizada (sin duplicar), rama + estado git, pendientes, prompt de reanudación.
- Instalable con `/plugin marketplace add` + `/plugin install`. Windows, Mac y Linux.
- Mensajes en el idioma del usuario.

## No objetivos / anti-objetivos
- No ejecuta `/clear` ni compacta por su cuenta (Claude no puede).
- No corta una tarea a mitad: el aviso dice si conviene terminar antes.
- No lee ni envía contenido de la conversación a ningún lado; el hook solo lee el número de tokens.
- No es un medidor ni un statusline.

## Restricciones
- Node sin dependencias externas (formato de los plugins existentes).
- Sin atribución a Claude en commits ni archivos del repo (preferencia del usuario).
- Local hasta que el usuario autorice subir; repo público MIT al estilo tokenwise (src, tests, README, LICENSE).

## Enfoques considerados
- **A. Hook Node + skill (elegido).** Estándar de los plugins instalados; multiplataforma.
- B. Hook Python: no hay garantía de Python en el PATH.
- C. Solo statusline: muestra el número pero no dispara nada.

## Diseño
Estructura:
```
context-handoff/
  .claude-plugin/plugin.json, marketplace.json
  hooks/hooks.json            # UserPromptSubmit -> node hooks/check-context.js
  hooks/check-context.js
  skills/context-handoff/SKILL.md
  tests/check-context.test.js
  README.md, LICENSE (MIT)
```
Hook (`check-context.js`), en cada mensaje del usuario:
1. Lee el JSON de stdin: `transcript_path`, `session_id`.
2. Recorre el transcript (.jsonl) y toma el `usage` del último mensaje del asistente. Contexto = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (verificado en un transcript real).
3. Si contexto >= umbral y no existe el marcador de esa sesión: lo crea (en el directorio temporal, por `session_id`) y devuelve `hookSpecificOutput.additionalContext` pidiendo usar la skill `context-handoff`.
4. Si no, no emite nada (costo cero).
5. Si el marcador existe pero el contexto cayó muy por debajo del umbral (hubo `/clear` o compactación), lo borra para poder avisar de nuevo. Recordatorio único cerca de 200k.
6. Cualquier error (transcript ilegible, formato distinto): sale en silencio con código 0; nunca rompe la sesión.

Umbral: variable de entorno `CONTEXT_HANDOFF_THRESHOLD` (default 150000).

Skill (`SKILL.md`): pasos fijos: (1) decidir si limpiar ahora o terminar antes, (2) guardar/actualizar en la memoria del proyecto estado, decisiones y pendientes, (3) anotar rama y `git status`, (4) entregar un prompt listo para pegar: qué se hacía, estado, qué falta, qué archivos leer primero. También invocable a mano.

## Tests
Unitarios del hook con transcripts de ejemplo: bajo el umbral, sobre el umbral, segundo mensaje (no repite), caída de contexto (rearma), transcript roto (silencio).

## Riesgos
- El formato del transcript puede cambiar entre versiones: por eso el silencio ante errores y el test con fixture.
- `additionalContext` es una sugerencia: Claude podría no seguirla siempre; la redacción debe ser imperativa y corta.

## Queda a criterio del constructor
Redacción exacta de los mensajes, nombre del marcador, detalles del README.
