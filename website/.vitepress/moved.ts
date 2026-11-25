// Copyright (C) 2026 Alexandre Demartin
// Moved anchors (README.md § Conventions, Links): a page split in two keeps its readers' bookmarks and the search
// engines' links. A static host never sees a URL's hash, so the browser follows this table: `movedAnchors`, run before the
// first paint and on each hash change (config.ts), and `checkLinks` (anchors.ts) checks each line in each language.
import { langs, prefixOf } from './words.ts';

/** Each anchor that left its page: `old page#id` → `new page#id`, English paths; a French page reads it under `/fr/`. */
export const moved: Record<string, string> = {
  // #969: the option's sections, once 8.0 builds every shortcut's JSON with json
  '/select#shortcutsUseJson': '/select#json-functions',
  '/insert#shortcutsUseJson': '/insert#json-functions',
  // #904: select.md, then aggregates.md
  '/select#count': '/aggregates#count',
  '/select#sum': '/aggregates#sum',
  '/select#avg': '/aggregates#avg',
  '/select#min': '/aggregates#min',
  '/select#max': '/aggregates#max',
  '/select#typed-by-column': '/aggregates#typed-by-column',
  '/select#NumericAggregateSignatures': '/aggregates#NumericAggregateSignatures',
  '/select#NullableNumericAggregateSignatures': '/aggregates#NullableNumericAggregateSignatures',
  '/select#ColumnAggregateSignatures': '/aggregates#ColumnAggregateSignatures',
  '/select#ColumnAggregateFragment': '/aggregates#ColumnAggregateFragment',
  // #904: runtime-config.md, then value-types.md, and its canary generated-files.md
  '/runtime-config#value-types': '/value-types',
  '/runtime-config#DomainInContext': '/value-types#DomainInContext',
  '/runtime-config#PostgresInterval': '/value-types#PostgresInterval',
  '/runtime-config#json': '/value-types#json',
  '/runtime-config#JSONValue': '/value-types#JSONValue',
  '/runtime-config#JSONObject': '/value-types#JSONObject',
  '/runtime-config#JSONArray': '/value-types#JSONArray',
  '/runtime-config#large-numbers': '/value-types#large-numbers',
  '/runtime-config#Int8String': '/value-types#Int8String',
  '/runtime-config#NumericString': '/value-types#NumericString',
  '/runtime-config#enableCustomJSONParsingForLargeNumbers': '/value-types#enableCustomJSONParsingForLargeNumbers',
  '/runtime-config#ranges': '/value-types#ranges',
  '/runtime-config#RangeString': '/value-types#RangeString',
  '/runtime-config#NumberRangeString': '/value-types#NumberRangeString',
  '/runtime-config#DateRangeString': '/value-types#DateRangeString',
  '/runtime-config#bytes': '/value-types#bytes',
  '/runtime-config#ByteArrayString': '/value-types#ByteArrayString',
  '/runtime-config#toBuffer': '/value-types#toBuffer',
  '/runtime-config#dates-and-times': '/value-types#dates-and-times',
  '/runtime-config#DateString': '/value-types#DateString',
  '/runtime-config#TimeString': '/value-types#TimeString',
  '/runtime-config#TzSuffix': '/value-types#TzSuffix',
  '/runtime-config#TimeTzString': '/value-types#TimeTzString',
  '/runtime-config#TimestampString': '/value-types#TimestampString',
  '/runtime-config#TimestampTzString': '/value-types#TimestampTzString',
  '/runtime-config#toDate': '/value-types#toDate',
  '/runtime-config#toString': '/value-types#toString',
  '/runtime-config#strict': '/value-types#strict',
  '/runtime-config#SchemaVersionCanary': '/generated-files#SchemaVersionCanary',
  // #904: generator.md, then generated-files.md
  '/generator#the-files-it-writes': '/generated-files#the-files-it-writes',
  '/generator#the-old-layout-warning': '/generated-files#the-old-layout-warning',
  '/generator#several-databases': '/generated-files#several-databases',
  '/generator#both-in-one-compilation': '/generated-files#both-in-one-compilation',
  '/generator#types-across-projects': '/generated-files#types-across-projects',
  '/generator#in-the-editor': '/generated-files#in-the-editor',
  '/generator#several-databases-out-of-scope': '/generated-files#several-databases-out-of-scope',
};

/**
 * The script that follows `moved`, in each page's `<head>`: on a moved anchor, `location.replace()` to its new page, the
 * query kept, before the first paint, and again on each hash change, a hash typed in the address bar included. A link of
 * the site never needs it: the link check fails on an anchor its page lacks.
 */
export const movedAnchors = `try {
  (function () {
    var moved = ${JSON.stringify(moved)}, prefixes = ${JSON.stringify(langs.map(prefixOf).filter(Boolean))};
    function follow() {
      try {
        var path = location.pathname.replace(/\\.html$/, ''), prefix = prefixes.filter(function (p) {
          return path.indexOf(p + '/') === 0;
        })[0] || '', to = moved[path.slice(prefix.length) + decodeURIComponent(location.hash)];
        if (to) location.replace(prefix + to.replace(/#|$/, function (hash) { return location.search + hash; }));
      } catch {}
    }
    follow();
    addEventListener('hashchange', follow);
  })();
} catch {}`;
