---
english: 4e84f639615e
---

# Recettes

Un besoin par page, satisfait par une seule requête : son SQL, son résultat typé, et les variantes dont il a souvent besoin. Chaque recette renvoie à la [référence](/fr/reference) pour chaque option qu’elle utilise.
{.lede}

<GroupPages />

## Traités ailleurs {#answered-elsewhere}

Ces besoins ont une section sur une autre page :

- Filtrer, trier ou grouper selon une valeur d’une ligne liée : [Jointures § Filtrer, trier et grouper par un lateral](/fr/lateral#filter-sort-and-group-by-a-lateral).
- Passer par une table de jointure, ou joindre une table à elle-même : [Jointures § Passer par une table de jointure](/fr/lateral#go-through-a-join-table), [§ Joindre une table à elle-même](/fr/lateral#join-a-table-to-itself).
- Nommer la ligne d’un lateral réutilisable : [Jointures § Nommer la ligne d’un lateral réutilisable](/fr/lateral#name-the-row-of-a-reusable-lateral).
- Trier par distance : [Jointures § Trier par une valeur calculée](/fr/lateral#order-by-a-computed-value).
- Une page et son total : [Pagination § Compter le total](/fr/paginate#count-the-total).
- La page suivante à partir de la dernière ligne : [Pagination § Charger la page suivante à partir de la dernière ligne](/fr/paginate#fetch-the-next-page-from-the-last-row).
- Insérer beaucoup de lignes, et ignorer celles déjà présentes : [Batches](/fr/batches).
- Mettre des écritures en file avec un lock : [Retries § Mettre les requêtes en file avec un lock](/fr/retries#queue-the-requests-with-a-lock).
- Typer une colonne `jsonb` : [Types personnalisés § Un domaine `jsonb`](/fr/custom-types#a-jsonb-domain).
- Une CTE avant un raccourci : [SQL brut § Placer une CTE avant un raccourci](/fr/raw-sql#put-a-cte-before-a-shortcut).
- Savoir quelle contrainte a refusé une écriture : [Erreurs](/fr/handle-errors).
- Typer une requête écrite à la main : [SQL typé](/fr/typed-sql).
- Lire un grand résultat par chunks : [Curseurs](/fr/cursors).
- Exécuter pgcast sur le client d’un outil de migration : [`QueryableLike`](/fr/sql-template#QueryableLike).
