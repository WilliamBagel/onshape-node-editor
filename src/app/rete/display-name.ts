/**
 * Display-name formatting for catalog-derived names.
 *
 * Standard Library feature identifiers are lowercase camelCase
 * (`chamfer`, `opChamfer`) because they are FeatureScript identifiers,
 * but palette entries and node-card titles should read as proper names.
 * Capitalize only the first letter and preserve the rest verbatim
 * (`opChamfer` -> `OpChamfer`) so the identifier, catalog key, search
 * indexing and codegen are never rewritten.
 */
export function formatDisplayName(name: string): string {
  if (name === "") return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}
