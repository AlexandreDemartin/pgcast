// Copyright (C) 2026 Alexandre Demartin

import type * as TS from 'typescript';

/** Collect lexical names in every scope before accepting an import as the file's sole declaration. */
export function bindings(ts: typeof TS, file: TS.SourceFile) {
  const names = new Map<string, TS.Node | null>();
  function visit(node: TS.Node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) ||
        ts.isDeclarationStatement(node) || ts.isClassExpression(node) || ts.isFunctionExpression(node) ||
        ts.isTypeParameterDeclaration(node) || ts.isImportClause(node) || ts.isImportSpecifier(node) ||
        ts.isNamespaceImport(node) || ts.isEnumMember(node)) {
      // A quoted enum member also introduces an unqualified name in the enum's initialisers.
      let name: TS.Node | undefined = node.name;
      if (name && ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) name = name.expression;
      if (name && (ts.isIdentifier(name) || (ts.isEnumMember(node) && ts.isStringLiteralLike(name)))) {
        names.set(name.text, names.has(name.text) ? null : node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);

  function imported(local: string) {
    const node = names.get(local);
    if (!node || !(ts.isNamespaceImport(node) || ts.isImportSpecifier(node))) return;
    const clause = ts.isNamespaceImport(node) ? node.parent : node.parent.parent, declaration = clause.parent;
    if (!ts.isImportDeclaration(declaration) || declaration.parent !== file || !ts.isStringLiteral(declaration.moduleSpecifier)) return;
    return { node, module: declaration.moduleSpecifier.text, typeOnly: clause.isTypeOnly || (ts.isImportSpecifier(node) && node.isTypeOnly) };
  }
  function matches(expression: TS.Expression, name: string) {
    const member = ts.isPropertyAccessExpression(expression), local = member ? expression.expression : expression;
    if (!ts.isIdentifier(local)) return false;
    const binding = imported(local.text);
    if (!binding || binding.typeOnly || !['zapatos/db', 'pgcast/db'].includes(binding.module)) return false;
    if (member) return !expression.questionDotToken && expression.name.text === name && ts.isNamespaceImport(binding.node);
    return local.text === name && ts.isImportSpecifier(binding.node) && (binding.node.propertyName?.text ?? name) === name;
  }
  return { imported, matches };
}
