# tracker — плагин трекера задач для агентов

Подключает агента разработчика к трекеру задач команды (модуль «Джира» контент-завода): агент сам заводит задачу перед
работой, ведёт план и журнал, задаёт вопросы людям, передаёт и закрывает задачи, читает базу знаний проекта перед
работой и пополняет её (`kb_search`, `kb_get`, `kb_write` — в базу эпика, `kb_propose` — в базу проекта через одобрение
руководителя).

## Claude Code

```
/plugin marketplace add devmachine-ai/agent-plugins
/plugin install tracker@devmachine
/tracker-setup
```

Нужен Node.js 18+ (для `dm-tracker`). Сервер по умолчанию — `https://office.devmachine.ai`; свой сервер — переменная
`DM_TRACKER_URL` (адрес MCP) и `dm-tracker login --server …`.

Что внутри: MCP `tracker` (токен подставляет `dm-tracker headers`), хуки `SessionStart` / `PostToolUse` / `Stop`,
навыки `tracker-*`, команды `/tracker-setup`, `/task`, `/handoff`.

## Codex, Cursor, DevMachine

```
node bin/dm-tracker.mjs login
node bin/dm-tracker.mjs install --client codex   # или cursor, devmachine (старое имя koder тоже работает)
```

Навыки встают в `~/.agents/skills/`, команда печатает настройку MCP и блок для `AGENTS.md`. Хуков у этих клиентов нет —
брошенные задачи сервер возвращает в очередь сам.

Исходник плагина — `apps/content-factory/plugins/` в монорепо; публичное зеркало обновляет
`apps/content-factory/scripts/publish-agent-plugins.sh` — сам, задачей CI `cf-plugins-mirror` после слияния в main.

## Импорт задач из GitLab

Руководитель проекта (вход `dm-tracker login` с профилем `planner` — он есть по умолчанию) переносит задачи GitLab в трекер одной командой со своей машины (токен GitLab остаётся у него:
`GITLAB_TOKEN` со scope `read_api` или вход `glab auth login`):

```
node bin/dm-tracker.mjs import gitlab --project DM --repo https://gitlab.example.com/group/app --milestones --dry-run
node bin/dm-tracker.mjs import gitlab --project DM --repo https://gitlab.example.com/group/app --milestones
```

Проект из многих репозиториев одной группы GitLab руководитель привязывает тоже одной командой: каждый репозиторий
группы (с подгруппами, без архивных) добавляется в проект, трекер выпускает секрет вебхука, команда создаёт вебхук в
GitLab (Push, Merge request, Pipeline). Нужен токен GitLab со scope `api` и права Maintainer (`GITLAB_TOKEN` или вход
`glab auth login` — и токен в связке ключей macOS, его спросят у самого glab); секрет не печатается,
повторный запуск пропускает подключённые, `--rotate` перевыпускает:

```
node bin/dm-tracker.mjs repos connect --project FAR --group https://gitlab.example.com/faraday --dry-run
node bin/dm-tracker.mjs repos connect --project FAR --group https://gitlab.example.com/faraday
```

`--dry-run` показывает, что перенесётся, и ничего не отправляет. По умолчанию — открытые задачи, `--state all` — и
закрытые (они попадут в «Готово»). `--milestones` делает из вех эпики (эпик с тем же названием используется). Повторный
запуск не создаёт копий — уже перенесённые пропускаются; изменения в GitLab после переноса не подтягиваются.

