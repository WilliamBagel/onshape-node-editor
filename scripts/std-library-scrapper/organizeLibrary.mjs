#!/usr/bin/env node

/**
 * Organize FeatureScript library data by type and location
 * 
 * Features:
 * - Accumulates data types (function, enum, predicate, etc)
 * - Finds arguments for predicates and functions
 * - Removes duplicates (keeps version with more parameters)
 * - Tracks filename and categories for sorting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library.json');
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library-organized.json');

/**
 * Extract parameter count from signature string
 */
function extractParameterCount(signature) {
  if (!signature || !signature.includes('(')) return 0;
  const matches = signature.match(/\((.*)\)/);
  if (!matches || !matches[1]) return 0;
  const params = matches[1].trim();
  if (!params) return 0;
  let count = 1;
  let depth = 0;
  for (const char of params) {
    if (char === '<' || char === '[') depth++;
    if (char === '>' || char === ']') depth--;
    if (char === ',' && depth === 0) count++;
  }
  return count;
}

function organizeLibrary() {
  try {
    console.log('Reading featurescript-library.json...');
    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

    // Collect all entries and deduplicate
    const dedup = new Map(); // key -> best entry
    const allEntries = [];
    let duplicatesFound = 0;

    for (const cat of data.categories) {
      for (const file of cat.files) {
        for (const entry of file.entries) {
          const desc = entry.descriptor || 'function';
          const paramCount = extractParameterCount(entry.signature);
          const key = `${entry.name}::${desc}`;

          const enriched = {
            name: entry.name,
            descriptor: desc,
            signature: entry.signature,
            returnType: entry.returnType,
            description: entry.description,
            parameterCount: paramCount,
            parameters: entry.parameters || [],
            location: {
              category: cat.name,
              categoryId: cat.id,
              file: file.fileName
            }
          };

          if (!dedup.has(key)) {
            dedup.set(key, enriched);
            allEntries.push(enriched);
          } else {
            const existing = dedup.get(key);
            if (paramCount > existing.parameterCount || 
                (paramCount === existing.parameterCount && 
                 entry.description && entry.description.length > (existing.description || '').length)) {
              dedup.set(key, enriched);
              duplicatesFound++;
            } else {
              duplicatesFound++;
            }
          }
        }
      }
    }

    // Build organized structure
    // Use Object.create(null) to avoid prototype chain issues with names like 'toString'
    const organized = {
      source: data.source,
      fetchedAt: data.fetchedAt,
      generatedAt: new Date().toISOString(),
      metadata: {
        totalEntries: data.metadata.totalEntries,
        deduplicatedEntries: dedup.size,
        duplicatesRemoved: duplicatesFound,
        byDescriptor: {}
      },
      entries: Array.from(dedup.values()),
      byType: Object.create(null),
      byCategory: Object.create(null),
      byName: Object.create(null)
    };

    // Organize by type
    for (const entry of organized.entries) {
      if (!entry.name) {
        console.warn('Warning: Entry without name:', JSON.stringify(entry).substring(0, 100));
        continue;
      }
      
      const type = entry.descriptor;
      if (!organized.byType[type]) {
        organized.byType[type] = [];
        organized.metadata.byDescriptor[type] = 0;
      }
      organized.byType[type].push(entry);
      organized.metadata.byDescriptor[type]++;

      // Index by name
      if (!organized.byName[entry.name]) {
        organized.byName[entry.name] = [];
      }
      organized.byName[entry.name].push(entry);

      // Index by category
      const cat = entry.location.category;
      if (!organized.byCategory[cat]) {
        organized.byCategory[cat] = [];
      }
      organized.byCategory[cat].push(entry);
    }

    // Sort everything
    organized.entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const type in organized.byType) {
      organized.byType[type].sort((a, b) => a.name.localeCompare(b.name));
    }
    for (const cat in organized.byCategory) {
      organized.byCategory[cat].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Output directory
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(organized, null, 2), 'utf-8');

    // Print summary
    console.log('\n✓ Organization complete!\n');
    console.log('Processing Summary:');
    console.log(`  Total entries (before dedup): ${data.metadata.totalEntries}`);
    console.log(`  Deduplicated entries: ${organized.metadata.deduplicatedEntries}`);
    console.log(`  Duplicates removed: ${organized.metadata.duplicatesRemoved}`);

    console.log('\nEntry types (after dedup):');
    for (const [type, count] of Object.entries(organized.metadata.byDescriptor).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / organized.metadata.deduplicatedEntries) * 100).toFixed(1);
      console.log(`  ${type.padEnd(12)}: ${count.toString().padStart(4)} (${pct}%)`);
    }

    console.log('\nTop 10 overloaded functions:');
    const overloads = Object.entries(organized.byName)
      .filter(([name, entries]) => entries.some(e => e.descriptor === 'function'))
      .map(([name, entries]) => ({
        name,
        overloads: entries.filter(e => e.descriptor === 'function').length,
        totalVariants: entries.length
      }))
      .sort((a, b) => b.overloads - a.overloads)
      .slice(0, 10);
    
    for (const item of overloads) {
      const variant = item.totalVariants > item.overloads ? ` (${item.totalVariants} total variants)` : '';
      console.log(`  ${item.name.padEnd(30)} ${item.overloads} overloads${variant}`);
    }

    console.log(`\n✓ Output saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

organizeLibrary();
