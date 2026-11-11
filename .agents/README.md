# Outillage IA

Chaque élément existe une seule fois, à l'emplacement que les outils lisent nativement. Méthode reprise de Project B, réduite à ce qu'une librairie demande.

| Élément | Emplacement | Lu par |
|---|---|---|
| Instructions du projet | `AGENTS.md` | Cursor, Codex, Copilot ; Claude Code via `CLAUDE.md` (lien) |
| Skills | `.agents/skills/` | Cursor, Codex, Copilot ; Claude Code via `.claude/skills` (lien) |
| Agents (sous-agents) | `.claude/agents/*.md` | Claude Code, Cursor, Copilot |
| Garde-fou | `.claude/hooks/guard.mjs` | Claude Code (`.claude/settings.json`) |

## Carte des skills

### Méthode

| Skill | Sujet |
|---|---|
| `run-step` | Orchestrer une étape de `docs/SUIVI.md` : builder, relecture selon **Relecture**, tri, `verify`, fusion, fin de chapitre |
| `ci-gate` | PR draft pendant l'itération, `gh pr ready`, checks obligatoires de `master`, fusion |
| `decision-philosophy` | Trancher seul ce que rien n'écrit, ou attendre l'utilisateur |
| `simple-big-wins` | Gain mesuré rapporté à la complexité ajoutée ; rien de bancal |
| `concise-docs` | Doc complète mais concise, une information à un endroit |

### Librairie

| Skill | Sujet |
|---|---|
| `zero-abstraction` | Concevoir un helper ou une option : SQL visible et unique, déduit de Postgres, surface minimale |
| `backward-compat` | Rétrocompatibilité avec Zapatos 6.6.1 : API publique, `zapatos/*`, ce qui est cassant |
| `sql-safety` | Zone sensible `core.ts` : échappement, paramètres, identifiants, tests d'injection |
| `type-tests` | Tests de types positifs et négatifs, coût de compilation (`bench:types`) |
| `codegen-output` | Sortie du codegen : snapshots, opt-in, canary, diff justifié |
| `consumer-usage` | Valider un besoin et une API contre Project A et Project B, sans rien en sortir |
| `zapatos-spirit` | L'esprit de George MacKerron : découper, nommer, coder et documenter comme lui, en mieux |

## Écrire un skill

```text
.agents/skills/<nom-en-kebab-case>/SKILL.md
```

```markdown
---
name: nom-en-kebab-case
description: 'Ce que fait le skill. USE FOR: … DO NOT USE FOR: …'
---
```

- **Un sujet par skill**, lu en entier quand il se déclenche ; ≤ 150 lignes.
- **Seulement ce que l'agent ne sait pas** : les choix propres à pgcast, jamais un cours sur Postgres ou TypeScript.
- **Une règle, un skill** : ailleurs, on renvoie en le nommant (« skill `sql-safety` »).
- **Une voie par défaut**, l'exception nommée ; le pourquoi en une ligne.
- **Exemples réels** du dépôt, fichier nommé en commentaire.
- `description` ≤ 350 caractères (`npm run check:agents`) : c'est elle seule qui déclenche le skill.

## Agents

| Agent | Mission |
|---|---|
| `builder` | Construit une étape de `docs/SUIVI.md` jusqu'à la PR prête, ou corrige une liste de défauts, lancé à neuf |
| `branch-reviewer` | Relecture senior en lecture seule (skill utilisateur `branch-review` + lentilles pgcast) ; mode `verify` |
| `chores` | Mécanique sur sonnet : merge du dessous, relance CI, régénération ; s'arrête au premier choix |

Rituel d'une étape : skill `run-step`.

## Contrôles de la méthode

- `guard.mjs` refuse avant exécution ce qui n'a aucune exception : `push --force`, `rebase`, `--amend`, publication npm ou release, écriture dans les fichiers générés (`db.mjs`, `generate.mjs`, `dist/`) ou dans un `.env`.
- `npm run check:agents` (`scripts/check-agents.mjs`, en CI) : frontmatter des skills et agents, longueur des descriptions, skills cités qui existent, tests du hook.

## Auto-amélioration

- **Invariants**, jamais remis en cause seul : les 5 principes de `AGENTS.md` § Philosophie, la rétrocompatibilité 6.6.1, les décisions acceptées de `docs/decisions/`.
- **Critère** : une remarque de relecture entre dans un skill si elle évite un vrai bug qui revient ou a coûté cher, générale et vérifiable. Une préférence de forme n'y entre pas.
- **Préférence** : un contrôle automatique (ESLint, test, `check:agents`) ; sinon une règle existante modifiée ; en dernier une ligne de skill.
- **Groupée** : la méthode est gelée pendant un chapitre ; les agents rendent leurs « apprentissages » à part, l'orchestrateur les écrit dans [docs/APPRENTISSAGES.md](../docs/APPRENTISSAGES.md), jugés à la PR de méthode de fin de chapitre (skill `run-step`).
