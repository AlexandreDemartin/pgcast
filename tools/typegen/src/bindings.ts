// Copyright (C) 2026 Alexandre Demartin

import type * as TS from 'typescript';

/** Collect lexical names in every scope before accepting an import as the file's sole declaration. */
export function bindings(ts: typeof TS, file: TS.SourceFile, options: TS.CompilerOptions = {}, host: TS.ModuleResolutionHost = ts.sys) {
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
    const specifier = declaration.moduleSpecifier, module = specifier.text;
    const resolve = (text = module) => ts.resolveModuleName(text, file.fileName, options, host, undefined, undefined,
      ts.getModeForUsageLocation?.(file, specifier, options)).resolvedModule;
    return { node, module, resolve, typeOnly: clause.isTypeOnly || (ts.isImportSpecifier(node) && node.isTypeOnly) };
  }
  /** Return the db module supplying this value import. */
  function matches(expression: TS.Expression, name: string) {
    const member = ts.isPropertyAccessExpression(expression), local = member ? expression.expression : expression;
    if (!ts.isIdentifier(local)) return;
    const binding = imported(local.text);
    if (!binding || binding.typeOnly || !['zapatos/db', 'pgcast/db'].includes(binding.module) ||
        !binding.resolve()?.isExternalLibraryImport) return;
    const valid = member ? !expression.questionDotToken && expression.name.text === name && ts.isNamespaceImport(binding.node) :
      local.text === name && ts.isImportSpecifier(binding.node) && (binding.node.propertyName?.text ?? name) === name;
    return valid ? binding.module : undefined;
  }
  return { imported, matches };
}
