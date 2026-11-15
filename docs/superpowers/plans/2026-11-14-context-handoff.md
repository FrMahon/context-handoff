# context-handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin de Claude Code que, al cruzar ~150k tokens de contexto, hace que Claude haga el traspaso (memoria + rama + prompt de reanudación) de forma automática.

**Architecture:** Un hook `UserPromptSubmit` en Node lee el uso de tokens del último mensaje del asistente en el transcript y, al pasar el umbral, inyecta `additionalContext` una sola vez por tramo (marcador por sesión en el directorio temporal). Una skill `context-handoff` contiene los pasos del traspaso.

**Tech Stack:** Node >= 18, sin dependencias; tests con `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-14-context-handoff-design.md`

## Global Constraints

- Sin dependencias externas (ni en `package.json`).
- Umbral por defecto 150000, configurable con `CONTEXT_HANDOFF_THRESHOLD`; segundo aviso (recordatorio) en umbral + 50000.
- Contexto = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` del último mensaje del asistente con `usage`.
- El hook sale siempre con código 0 y en silencio ante cualquier error.
- Salida del hook: `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}`.
- Licencia MIT. **Sin Co-Authored-By ni menciones a Claude** en commits, README ni archivos. Repo local; **no hacer push** sin autorización del usuario.
- Identidad git del repo: copiar `user.name`/`user.email` de `../tokenwise` (`git -C ../tokenwise config user.email`).

## Review Focus

- Transcript con mensajes de subagentes (`isSidechain: true`): no deben contar como contexto principal.
- Último mensaje del asistente con `usage` en cero o ausente (mensaje sintético): se salta al anterior.
- `CONTEXT_HANDOFF_THRESHOLD` inválido (`"abc"`, `"-5"`, `"0"`): usa el default.
- stdin vacío, JSON roto, `session_id` ausente, `transcript_path` inexistente: silencio.
- Transcript grande (decenas de MB): solo se lee el final del archivo.

---

### Task 1: Núcleo del hook (lectura de tokens y decisión)

**Files:**
- Create: `package.json` (`"type":"commonjs"`, `"scripts":{"test":"node --test tests/"}`, sin deps)
- Create: `hooks/check-context.js`
- Test: `tests/check-context.test.js`, fixtures generados en el propio test con `fs.mkdtempSync`

**Interfaces:**
- Produces:
  - `getContextTokens(transcriptPath: string): number | null` — suma los tres campos del último `type:"assistant"` con `usage` no nulo y sin `isSidechain`; lee solo los últimos 256 KB; `null` si no hay dato o hay error.
  - `getThreshold(env: object): number` — entero > 0 desde `CONTEXT_HANDOFF_THRESHOLD`, si no 150000.
  - `decide({tokens, threshold, stage}): {stage: 0|1|2, message: string|null}` — `stage` es el nivel ya avisado (0 nada, 1 aviso, 2 recordatorio). Devuelve el nuevo nivel y mensaje solo si sube de nivel. Si `tokens < threshold * 0.5` devuelve `stage: 0` y `message: null` (rearme).
  - `run(input: object, env: object, tmpDir: string): object | null` — orquesta lectura del marcador `<tmpDir>/context-handoff-<session_id>` (contiene el número de stage), llama a `decide`, actualiza el marcador y devuelve el objeto de salida del hook o `null`.

- [ ] **Step 1: Write failing tests** en `tests/check-context.test.js` para `getContextTokens`: `sums three usage fields of last assistant message` (10+20+30 → 60), `skips sidechain messages`, `skips assistant message with all-zero usage and uses previous`, `returns null for missing file`, `returns null for empty file`, `reads only the tail of a large file` (archivo de 5 MB de relleno + línea final válida → devuelve el valor de esa línea).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (`getContextTokens is not a function`).
- [ ] **Step 3: Implement `getContextTokens`** — leer cola con `fs.openSync/readSync`, descartar la primera línea parcial, parsear líneas de atrás hacia adelante ignorando las que no sean JSON.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Write failing tests** para `getThreshold` (`"abc"`, `"-5"`, `"0"`, `undefined` → 150000; `"1000"` → 1000) y `decide` (`below threshold → stage 0, null`; `crossing threshold → stage 1 with message`; `already stage 1 and tokens still above → null`; `tokens >= threshold+50000 and stage 1 → stage 2 with reminder message`; `tokens < threshold*0.5 and stage 2 → stage 0, null`).
- [ ] **Step 6: Run** — Expected: FAIL. **Implement `getThreshold` y `decide`.** Mensaje de stage 1 (en inglés, imperativo): invocar la skill `context-handoff` ahora, avisar al usuario en su idioma que el contexto está alto y si conviene limpiar ya o terminar antes lo en curso. Stage 2: recordatorio breve de lo mismo si el traspaso no se hizo. **Run** — Expected: PASS.
- [ ] **Step 7: Write failing tests** para `run` (usando carpeta temporal): `first call over threshold returns output and writes marker`, `second call returns null`, `missing session_id returns null`, `broken transcript returns null`, `two session_ids keep independent markers`, `context drop below half threshold removes marker so next crossing warns again`.
- [ ] **Step 8: Implement `run`; Run tests** — Expected: PASS.
- [ ] **Step 9: Commit** — `git init` primero (copiar identidad de `../tokenwise`), luego `git add -A && git commit -m "feat: núcleo del hook de contexto"` (sin atribución).

### Task 2: Entrada del hook y manifiestos del plugin

**Files:**
- Modify: `hooks/check-context.js` (agregar `main()` ejecutado solo con `require.main === module`)
- Create: `hooks/hooks.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Test: `tests/main.test.js`

**Interfaces:**
- Consumes: `run(input, env, tmpDir)` de la Task 1.
- Produces: ejecutable `node hooks/check-context.js` que lee JSON de stdin e imprime el objeto de `run` (o nada), siempre con exit 0.

- [ ] **Step 1: Write failing tests** `main.test.js` con `child_process.spawnSync`: `stdin vacío → exit 0 y stdout vacío`, `JSON roto → exit 0 y stdout vacío`, `transcript sobre umbral (CONTEXT_HANDOFF_THRESHOLD=100) → stdout es JSON con hookSpecificOutput.hookEventName == "UserPromptSubmit"`.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement `main()`** (try/catch global, exit 0). **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Crear manifiestos.** `hooks.json`: evento `UserPromptSubmit`, comando `node "${CLAUDE_PLUGIN_ROOT}/hooks/check-context.js"`, `timeout` 5. `plugin.json`: name `context-handoff`, version `0.1.0`, license MIT, description, author genérico. `marketplace.json`: un plugin con `source: "./"`. Validar con `claude plugin validate .` si el comando existe; si no, `node -e "JSON.parse(...)"` de cada archivo.
- [ ] **Step 6: Commit** — `feat: entrada del hook y manifiestos`.

### Task 3: Skill context-handoff

**Files:**
- Create: `skills/context-handoff/SKILL.md`

**Interfaces:**
- Consumes: el mensaje de stage 1/2 de la Task 1 menciona la skill por su nombre exacto `context-handoff`.

- [ ] **Step 1: Escribir `SKILL.md`** con frontmatter (`name: context-handoff`, `description` que mencione contexto alto/`/clear`/traspaso, para disparo manual y por hook) y pasos numerados, en el idioma del usuario: (1) decidir y decir si limpiar ahora o terminar antes (no cortar a mitad de cambio sin commitear o prueba); (2) guardar en la memoria del proyecto —actualizando un archivo existente de estado en vez de duplicar— estado, decisiones y pendientes; (3) registrar rama y `git status`/último commit si hay repo; (4) entregar un único bloque de código con el prompt de reanudación: qué se hacía, rama/estado, qué falta, qué archivos leer primero. Una sola vez por tramo; sin tocar código del usuario.
- [ ] **Step 2: Verificar** que el nombre del frontmatter coincide con el de la carpeta y con el mencionado en `check-context.js` (`grep -rn "context-handoff" hooks skills`).
- [ ] **Step 3: Commit** — `feat: skill context-handoff`.

### Task 4: README, licencia y prueba de instalación real

**Files:**
- Create: `README.md`, `LICENSE` (MIT), `.gitignore` (`node_modules/`)

- [ ] **Step 1: README** en español e inglés breve: qué hace, instalación (`/plugin marketplace add <ruta o repo>` + `/plugin install context-handoff@context-handoff`), configuración del umbral, privacidad (solo lee el conteo de tokens), limitación (`additionalContext` es una instrucción, no una orden; no ejecuta `/clear`). Sin menciones a Claude como autor.
- [ ] **Step 2: LICENSE MIT** con año 2026 y titular tomado de `../tokenwise/LICENSE`.
- [ ] **Step 3: Prueba real** — instalar localmente con `/plugin marketplace add <ruta-local-del-repo>`, abrir sesión nueva con `CONTEXT_HANDOFF_THRESHOLD=20000` y confirmar que el aviso aparece una sola vez. Registrar el resultado en el README (sección "Probado con").
- [ ] **Step 4: Run** `npm test` — Expected: todo PASS. **Commit** — `docs: README, licencia y prueba de instalación`. **No push.**
