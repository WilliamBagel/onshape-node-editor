# FeatureScript Library Organization

This document explains the post-processing of the scraped FeatureScript library documentation.

## Files Generated

### 1. `featurescript-library.json` (Raw)
- Initial scraped documentation from Onshape
- 1400 total entries across 211 files
- Some duplicates (same name, different signatures)
- Organized by category → file → entries

### 2. `featurescript-library-organized.json` (Processed)
- **Deduplicated**: 1189 unique names (211 duplicates removed)
- Keeps entries with most parameters/information
- Multiple organization views:
  - **entries**: All deduplicated entries sorted alphabetically
  - **byType**: Organized by descriptor (type, predicate, enum, const, etc.)
  - **byCategory**: Organized by category (Modeling, Math, Utilities, etc.)
  - **byFile**: Organized by category → file
  - **searchIndex**: Quick search/lookup data

### 3. `featurescript-lookup.json` (Quick Reference)
- Compact lookup table for all 1189 unique entries
- Fields: descriptor, category, file, signature, parameter count
- Perfect for IDE autocomplete or quick searches
- ~205 KB (vs 4.7 MB for full organized)

## Data Structure

### Entry Object
```json
{
  "name": "functionName",
  "descriptor": "predicate|function|type|enum|const|unknown",
  "signature": "(context is Context, id is Id) returns boolean",
  "returnType": "boolean",
  "description": "Full documentation text...",
  "parameters": [
    {
      "name": "paramName",
      "type": "Context",
      "description": "Parameter description"
    }
  ],
  "category": "Modeling",
  "categoryId": "modeling",
  "file": "geometry",
  "parameterCount": 2,
  "signatureLength": 56
}
```

### Lookup Entry
```json
{
  "functionName": {
    "descriptor": "predicate",
    "category": "Utilities",
    "file": "containers",
    "signature": "(value)",
    "parameters": 1
  }
}
```

## Type Distribution
- **Type definitions**: 87 entries (AngleBoundSpec, etc.)
- **Predicates**: 130 entries (canBeContext, isAtVersionOrLater, etc.)
- **Unknown type**: 886 entries (mostly functions without descriptor)
- **Constants**: 122 entries (WORLD_ORIGIN, etc.)
- **Enums**: 175 entries (AccessType, ConstraintType, etc.)

## Category Organization
- **Modeling**: 262 unique entries (geometry, context, geomOperations, etc.)
- **Math**: 267 unique entries (matrix, vector, transform, etc.)
- **Utilities**: 321 unique entries (attributes, containers, debug, etc.)
- **Onshape features**: 255 unique entries (extrude, fillet, boolean, etc.)
- **Enums**: 90 unique entries (various enum types)

## Deduplication Logic

When the same function name appears in multiple places (different signatures/parameters):
1. Count parameters in each version
2. Compare signature lengths
3. Keep the version with:
   - Most parameters (primary criteria)
   - Longest signature (tiebreaker)

**Example**: If `defineFeature` appears with both `(feature is function)` and `(feature is function, defaults is map)`, the second version (more parameters) is kept.

## Usage

### Scrape and Organize
```bash
pnpm scrape:all          # Fetch and process in one command
```

### Individual Steps
```bash
pnpm scrape:docs         # Fetch from Onshape
pnpm organize:docs       # Process the results
```

### In Code
```javascript
// Full organized data with all views
const organized = require('./src/app/onshape/featurescript-library-organized.json');

// Quick lookup
const lookup = require('./src/app/onshape/featurescript-lookup.json');

// Find all predicates
const predicates = organized.byType['predicate'];

// Get all from Utilities category
const utilityFuncs = organized.byCategory['Utilities'].entries;

// Quick lookup a function
const info = lookup['extrude'];
console.log(info);
// { descriptor: '', category: 'Onshape features', file: 'extrude', ... }
```

## Search Index

The `searchIndex` array contains lightweight search data:
```json
{
  "name": "extrude",
  "type": "function",
  "category": "Onshape features",
  "file": "extrude",
  "signature": "(context is Context, id is Id, definition is map)",
  "description": "Extrudes the sketch profiles..."
}
```

Perfect for building search UIs or filtering.

## Sorting and Filtering

**Examples:**
```javascript
// Sort all functions by parameter count (descending)
const sorted = organized.entries
  .filter(e => e.descriptor === '' || e.descriptor === 'function')
  .sort((a, b) => b.parameterCount - a.parameterCount);

// Find all enums in Modeling category
const modelingEnums = organized.byCategory['Modeling'].entries
  .filter(e => e.descriptor === 'enum');

// Get functions with 3+ parameters
const complexFuncs = organized.entries
  .filter(e => e.parameterCount >= 3);
```

## Metadata

Each generated file includes metadata:
```json
{
  "fetchedAt": "2026-03-18T17:04:19.481Z",
  "processingDate": "2026-03-18T17:05:30.123Z",
  "metadata": {
    "totalUniqueNames": 1189,
    "totalProcessedEntries": 1400,
    "categories": 5,
    "files": 211,
    "types": 5
  }
}
```

## Performance Notes

- **organized.json**: 4.7 MB full data (use for web/app distribution)
- **lookup.json**: 205 KB lightweight lookup (use for IDE/tools)
- Search index: ~500 KB (good balance for searching)

Choose based on your needs:
- IDE features → use **lookup.json**
- Web UI with full details → use **organized.json**
- Search/filter → use **searchIndex**
