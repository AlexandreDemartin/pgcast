---
english: 6e1ed77c9a97
aside: false  # the panel takes the rail's width: code lines are long
---

<script setup>
import Playground from '../.vitepress/theme/Playground.vue';
</script>

# Playground

Modifiez une requête sur le schéma de la doc et voyez, pendant la saisie, le SQL qu’écrit pgcast et le type que TypeScript donne à son résultat ; appuyez sur Exécuter pour voir ce que Postgres répond. Le playground part de la première requête du tutoriel ; rien de ce que vous écrivez ne quitte votre navigateur.
{.lede}

<Playground>
<CastPanel example="first-query">

<<< ../examples/first-query.ts{ts twoslash}

</CastPanel>
</Playground>

## Ce qui tourne ici {#what-runs-here}

- **Les types** : TypeScript 5.9.3, le compilateur de cette doc, dans Monaco, l’éditeur de VS Code. Survolez un nom pour voir son type ; une erreur est soulignée pendant la saisie.
- **Le SQL** : le runtime de pgcast lui-même, dans un worker de cette page, avec un pool qui enregistre chaque requête qu’on lui donne. Chaque requête apparaît avec ses valeurs. Pendant la saisie, une requête ne reçoit aucune ligne : le code qui a besoin d’une ligne s’arrête donc après sa requête, avec l’erreur obtenue.
- **Postgres, sur Exécuter** : [PGlite](https://pglite.dev), Postgres 18 compilé en WebAssembly, dans ce worker : environ 5 Mo à télécharger, à votre première exécution seulement. Chaque requête montre ensuite les lignes qu’elle renvoie (les 50 premières), ou son erreur avec son SQLSTATE. Chaque exécution part du schéma de la doc tel qu’il est livré, et s’arrête au bout de 10 secondes.
- **Une seule connexion** : PGlite n’en a qu’une, donc le pool la prête à une transaction à la fois, comme un `pg.Pool` avec `max: 1`. Il accepte `query(text, values)`, `connect()` et `end()`, qui ne fait rien. Ses lignes sont analysées comme `pg` les analyse, sauf un `interval` ou un `circle`, qui restent du texte, et ses valeurs sont envoyées comme `pg` les envoie.
- **Préparées, toujours** : chaque requête est envoyée avec ses valeurs, comme `pg` envoie une requête qui en a. Un texte de plusieurs instructions, `` db.sql`SELECT 1; SELECT 2` ``, est donc rejeté ici avec 42601, là où `pg` l’envoie comme une requête simple.
- **Partager** : copie un lien vers cette page qui contient le code, compressé dans sa partie `#code/…`, que les navigateurs n’envoient pas au serveur : rien n’est stocké nulle part. Qui l’ouvre voit le code et son type, et rien ne s’exécute avant qu’il appuie sur Exécuter ou modifie le code. Un lien contient 100 Ko de code au plus ; un lien abîmé ouvre la première requête du tutoriel. Sur un téléphone, le code du lien s’affiche en lecture seule.
- **Le clavier** : dans l’éditeur, Ctrl+Entrée (⌘+Entrée sur un Mac) exécute le code, et Tab indente. Pour en sortir avec Tab, appuyez d’abord sur Ctrl+M (Ctrl+Maj+M sur un Mac) ; appuyez de nouveau pour indenter avec Tab.

## Le schéma {#the-schema}

Les tables que vous interrogez, tirées de [`schema.sql`](https://github.com/AlexandreDemartin/pgcast/blob/master/website/schema.sql), en lecture seule ici. Leurs types, `zapatos/schema`, sont ceux que pgcast en génère pour chaque page de cette doc.

<<< ../schema.sql
