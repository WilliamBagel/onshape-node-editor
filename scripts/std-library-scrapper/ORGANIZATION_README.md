# FeatureScript Library Organization & Deduplication

This document describes the `organizeLibrary.mjs` script and its output.

## Purpose

The organization script processes the raw scraped FeatureScript library and:
1. **Deduplicates entries** - Merges multiple versions of the same function, keeping the version with more parameters
2. **Accumulates data types** - Organizes entries by type (function, enum, predicate, const, type)
3. **Tracks locations** - Records which category and file each entry came from
4. **Creates indexes** - Builds searchable indexes by type, category, and name for efficient lookup

## Input / Output

**Input:** `src/app/onshape/featurescript-library.json` (1400 raw entries from scraper)

**Output:** `src/app/onshape/featurescript-library-organized.json` (1189 deduplicated entries)

## Running the Script

```bash
# Run the organization script
node scripts/organizeLibrary.mjs

# Or via npm script
npm run organize-library  # (if you add this to package.json)
```

## Output Structure

### Top-level fields:
```javascript
{
  "source": "https://cad.onshape.com/FsDoc/library.html",
  "fetchedAt": "2024-03-18T17:30:00.000Z",
  "generatedAt": "2024-03-18T17:34:13.047Z",
  
  "metadata": {
    "totalEntries": 1400,           // Original entry count
    "deduplicatedEntries": 1189,    // Unique entries after dedup
    "duplicatesRemoved": 211,       // Number of duplicate variants removed
    "byDescriptor": {               // Count for each type
      "function": 693,
      "enum": 175,
      "const": 122,
      "predicate": 112,
      "type": 87
    }
  },
  
  "entries": [ ... ],       // All 1189 deduplicated entries
  "byType": { ... },        // Index: entries grouped by type (function, enum, etc)
  "byCategory": { ... },    // Index: entries grouped by category
  "byName": { ... }         // Index: entries grouped by name
}
```

### Entry Structure:
```javascript
{
  "name": "abs",
  "descriptor": "function",
  "signature": "(value is number) => number",
  "returnType": "number",
  "description": "Returns the absolute value of a number",
  "parameterCount": 1,           // Auto-extracted from signature
  "parameters": [ ... ],         // Array of {name, type, description}
  "location": {
    "category": "Math",          // Category name
    "categoryId": "math",        // Category ID
    "file": "math.fs"            // Source file name
  }
}
```

## Deduplication Logic

When the same function appears multiple times in the library:

1. **Group by name + descriptor** - e.g., `"abs::function"` is the unique key
2. **Keep the version with most parameters** - e.g., if `abs(x)` and `abs(x, precision)` both exist, keep the latter
3. **Tiebreaker** - If parameter counts are equal, keep the version with better description (longer text)

### Examples:

| Function | Variants Found | Kept Version | Reason |
|----------|---|---|---|
| `setVariable` | 2 (3 params, 4 params) | 4 params | More parameters |
| `qCreatedBy` | 4 (2, 1, 1, 2 params) | 2 params | First version with most params |
| `qHasAttribute` | 2 (1 param, 2 params) | 2 params | More parameters |

Result: **119 entries had multiple variants**, now consolidated into **1189 unique entries**

## Using the Indexes

### By Type
```javascript
const allFunctions = organized.byType.function;     // 693 functions
const allEnums = organized.byType.enum;             // 175 enums
const allPredicates = organized.byType.predicate;   // 112 predicates
```

### By Category
```javascript
const mathFunctions = organized.byCategory.Math;
const queryFunctions = organized.byCategory.Query;
```

### By Name
```javascript
const absEntries = organized.byName.abs;  // All variants of "abs" (usually 1 after dedup)
const setVarEntries = organized.byName.setVariable;
```

## Sorting & Filtering

All indexes are pre-sorted alphabetically by name. Additional sorting options:

```javascript
// Sort by parameter count
const byParamCount = organized.entries.sort((a, b) => b.parameterCount - a.parameterCount);

// Filter by descriptor type
const onlyFunctions = organized.entries.filter(e => e.descriptor === 'function');

// Sort by category then name
const byCategory = Object.entries(organized.byCategory)
  .map(([cat, entries]) => ({ category: cat, entries }))
  .sort((a, b) => a.category.localeCompare(b.category));
```

## Statistics

### Current Data (from verification run):
- **Total original entries:** 1400
- **Deduplicated entries:** 1189 (85% unique)
- **Duplicates removed:** 211 (15% were variants)
- **Overloaded functions:** 119 functions had 2-4 variants each
- **Distribution:**
  - Functions: 693 (58.3%)
  - Enums: 175 (14.7%)
  - Constants: 122 (10.3%)
  - Predicates: 112 (9.4%)
  - Types: 87 (7.3%)

## Notes

- **What is "toString"?** The organizer uses `Object.create(null)` for indexes to avoid prototype chain conflicts (browsers have built-in `toString` method). This is why the script doesn't error when encountering a function named `toString`.

- **Parameter counting:** The script uses regex to count parameters in function signatures, handling nested brackets properly: `<Type<Inner>>` counts as 1 type parameter.

- **Location tracking:** Each entry remembers which file and category it came from, enabling downstream sorting, filtering, and categorized browsing.

- **File size:** The organized output is ~1.7 MB (similar to input), but with 15% fewer entries due to deduplication and consolidated duplicates.

## Next Steps

This organized library can be used for:
- Building IDE autocomplete/intellisense
- Creating searchable documentation UI
- Generating language bindings
- Type checking/validation
- API documentation generation
