# Suivi des étapes

Le plan vit dans les issues GitHub : un Epic par chapitre, une sous-issue par étape, fermée par sa PR (skill `run-step`). Epics : [#18](https://github.com/AlexandreDemartin/pgcast/issues/18) correctifs, [#19](https://github.com/AlexandreDemartin/pgcast/issues/19) schéma et conditions, [#20](https://github.com/AlexandreDemartin/pgcast/issues/20) runtime, [#21](https://github.com/AlexandreDemartin/pgcast/issues/21) inférence du SQL brut. Ce fichier ne garde que l'historique d'avant.

## 0. Fork

- 0.1 `chore/fork-setup` — renommage, outillage, CI, notes 001 et 002 : PR #1
- 0.2 `chore/agent-workflow` — méthode de travail des agents : PR #2

## 1. Caractérisation

- 1.1 `test/harness` — base de test, fixture, CI Postgres : PR #3
- 1.2 `test/codegen-snapshots` — sortie du codegen figée : PR #4
- 1.3 `test/compiled-sql` — SQL de chaque shortcut et condition : PR #5
- 1.4 `test/types` — types publics sur un schéma réel : PR #7
- 1.5 `test/injection` — entrées hostiles : PR #8
- 1.6 `test/bench-types` — coût de compilation : PR #10
- 1.7 `docs/characterization-report` — rapport des bugs et surprises : PR #11

## 2. Correctifs

- 2.1 Check lock, truncate and isolation level keywords at run time (R5) : PR #14
- 2.2 Accept only a function name as the aggregate of select() (R6) : PR #17
