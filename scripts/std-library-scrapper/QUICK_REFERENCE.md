# Quick Reference: FeatureScript Library Data

## Files at a Glance

| File | Size | Use Case | Lookup Time |
|------|------|----------|-------------|
| **lookup.json** | 205 KB | ⭐ IDE autocomplete, fast searches | <1ms |
| **organized.json** | 4,774 KB | Full details, node editor setup | ~10ms |
| **library.json** | 1,064 KB | Raw scraped (with duplicates) | N/A |

## Deduplication Stats

```
1,400 entries → 1,189 unique names
    ↓
211 duplicates removed (15%)
```

**Keep the entry with:**
1. Most parameters (primary)
2. Longest signature (tiebreaker)

## Type Distribution

```
unknown (886)  ████████████████████ 74.5%  ← Mostly functions
enum    (175)  ████ 14.7%
predicate(130) ███ 10.9%
const   (122)  ③ 10.3%
type     (87)  ② 7.3%
```

## Category Breakdown

```
Utilities (321)      █████████████████████ 27.0%
Math (267)           ██████████████████ 22.5%
Modeling (262)       █████████████████ 22.0%
Features (255)       █████████████████ 21.4%
Enums (90)           ██ 7.6%
```

## Quick Access

### JavaScript
```javascript
// Fast lookup
const lookup = require('./featurescript-lookup.json');
const info = lookup['extrude'];

// Full details
const organized = require('./featurescript-library-organized.json');
const entries = organized.entries;
const byType = organized.byType;
const byCategory = organized.byCategory;
```

### Common Queries

**Get all functions with parameters:**
```javascript
organized.entries.filter(e => e.parameterCount > 0)
```

**Get all predicates:**
```javascript
organized.byType.predicate
```

**Get all from category:**
```javascript
organized.byCategory['Modeling'].entries
```

**Search by name:**
```javascript
organized.entries.find(e => e.name === 'extrude')
```

**Get all enums:**
```javascript
organized.byType.enum
```

**List all from file:**
```javascript
organized.entries.filter(e => e.file === 'containers')
```

## Entry Structure

```json
{
  "name": "functionName",
  "descriptor": "function|predicate|enum|type|const",
  "signature": "(context is Context) returns boolean",
  "returnType": "boolean",
  "parameters": [
    {"name": "context", "type": "Context", "description": "..."}
  ],
  "description": "Full documentation...",
  "category": "Modeling",
  "file": "geometry",
  "parameterCount": 1
}
```

## Commands

```bash
# One-command scrape and organize
pnpm scrape:all

# Individual steps
pnpm scrape:docs          # Fetch from Onshape
pnpm organize:docs        # Deduplicate and organize

# Show examples
node scripts/exampleUsage.mjs

# Display summary
node scripts/showSummary.mjs
```

## Top 5 Most Complex Entries

```
1. opFaceBlend      (40 params)  Modeling/geomOperations
2. UIHint           (37 params)  enums/uihint
3. ConstraintType   (34 params)  enums/constrainttype
4. extrude          (33 params)  Onshape features/extrude
5. Icon             (31 params)  enums/icon
```

## Performance Tips

✅ **Do:**
- Use `lookup.json` for interactive features
- Cache `organized.json` on first load
- Use `parameterCount` to filter complex functions
- Deduplicate with "most parameters" strategy

❌ **Don't:**
- Parse JSON repeatedly
- Iterate through all 4MB organized file for simple lookups
- Keep separate lookup tables
- Re-fetch from Onshape frequently

## Integration Paths

### For IDE/Autocomplete
```
featurescript-lookup.json → Filter by name → Return matches
```

### For Node Editor
```
organized.entries → Create nodes → Map parameters to sockets
```

### For Web UI
```
lookup.json (initial) → Cache organized.json → Full view on demand
```

## Metadata Dates

- **Fetched**: 2026-03-18T17:04:19.481Z (from Onshape)
- **Processed**: 2026-03-18T17:05:30.123Z (organized)

## File Locations

```
src/app/onshape/
  ├── featurescript-library-organized.json
  ├── featurescript-lookup.json
  ├── featurescript-library.json
  └── featurescript-library-test.json

scripts/
  ├── organizeLibrary.mjs
  ├── exampleUsage.mjs
  ├── showSummary.mjs
  ├── ORGANIZER_README.md
  └── SCRAPER_README.md
```

## Key Takeaways

1. **1,189 unique FeatureScript functions/types/enums**
2. **211 duplicates intelligently removed**
3. **Multiple views for different use cases**
4. **Compact lookup for speed (205 KB)**
5. **Full organized data for details (4,774 KB)**
6. **Ready for node editor integration**

---

📖 For detailed info: `LIBRARY_ORGANIZATION_SUMMARY.md`
