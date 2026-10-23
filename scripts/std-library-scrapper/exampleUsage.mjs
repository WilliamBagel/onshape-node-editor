#!/usr/bin/env node

/**
 * Example: Using the organized FeatureScript library data
 * Shows various ways to query and use the deduplicated library
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const organized = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library-organized.json'), 'utf-8')
);

const lookup = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-lookup.json'), 'utf-8')
);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  FeatureScript Library Usage Examples                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Example 1: Quick lookup
console.log('1️⃣  QUICK LOOKUP (for autocomplete/search)');
console.log('   ─────────────────────────────────────────────\n');
const func = 'extrude';
const info = lookup[func];
console.log(`   Looking up: "${func}"`);
console.log(`   Descriptor: ${info.descriptor}`);
console.log(`   Category: ${info.category}`);
console.log(`   File: ${info.file}`);
console.log(`   Parameters: ${info.parameters}`);
console.log(`   Signature: ${info.signature}\n`);

// Example 2: Find all predicates
console.log('2️⃣  FIND ALL PREDICATES');
console.log('   ─────────────────────────────────────────────\n');
const predicates = organized.byType.predicate.slice(0, 5);
console.log(`   Total predicates: ${organized.byType.predicate.length}`);
console.log(`   First 5 examples:`);
predicates.forEach(p => {
  console.log(`     • ${p.name}${p.parameters ? ` (${p.parameters.length} params)` : ''}`);
});
console.log();

// Example 3: Find all enums in a category
console.log('3️⃣  ALL ENUMS IN ONSHAPE FEATURES');
console.log('   ─────────────────────────────────────────────\n');
const enums = organized.byCategory['Onshape features'].entries
  .filter(e => e.descriptor === 'enum')
  .slice(0, 5);
console.log(`   Total enums in category: ${organized.byCategory['Onshape features'].entries.filter(e => e.descriptor === 'enum').length}`);
console.log(`   First 5 examples:`);
enums.forEach(e => {
  console.log(`     • ${e.name} (${e.parameters ? e.parameters.length + ' values' : '0 values'})`);
});
console.log();

// Example 4: Find complex functions (many parameters)
console.log('4️⃣  COMPLEX FUNCTIONS (3+ parameters)');
console.log('   ─────────────────────────────────────────────\n');
const complex = organized.entries
  .filter(e => e.parameterCount >= 5)
  .sort((a, b) => b.parameterCount - a.parameterCount)
  .slice(0, 5);
console.log(`   Total functions with 5+ params: ${organized.entries.filter(e => e.parameterCount >= 5).length}`);
console.log(`   Top 5 by parameter count:`);
complex.forEach((e, i) => {
  console.log(`     ${i + 1}. ${e.name.padEnd(25)} ${e.parameterCount} params  (${e.category})`);
});
console.log();

// Example 5: Find all functions in a specific file
console.log('5️⃣  ALL UTILITIES FROM containers.fs');
console.log('   ─────────────────────────────────────────────\n');
const containerFuncs = organized.entries
  .filter(e => e.file === 'containers')
  .slice(0, 8);
console.log(`   Total entries in containers: ${organized.entries.filter(e => e.file === 'containers').length}`);
console.log(`   First 8 examples:`);
containerFuncs.forEach(e => {
  console.log(`     • ${e.name.padEnd(30)} ${(e.descriptor || 'function').padEnd(10)} ${e.parameterCount} params`);
});
console.log();

// Example 6: Build autocomplete suggestions
console.log('6️⃣  AUTOCOMPLETE SUGGESTIONS');
console.log('   ─────────────────────────────────────────────\n');
const query = 'array';
const suggestions = organized.entries
  .filter(e => e.name.toLowerCase().includes(query))
  .slice(0, 5);
console.log(`   Query: "${query}"`);
console.log(`   Found: ${suggestions.length} matches`);
suggestions.forEach(s => {
  const desc = s.description ? s.description.substring(0, 50) + '...' : 'No description';
  console.log(`     • ${s.name.padEnd(20)} ${s.category.padEnd(15)} ${desc}`);
});
console.log();

// Example 7: Get all types from a category
console.log('7️⃣  ALL TYPES FROM MATH CATEGORY');
console.log('   ─────────────────────────────────────────────\n');
const types = organized.byCategory['Math'].entries
  .filter(e => e.descriptor === 'type')
  .slice(0, 5);
console.log(`   Total types in Math: ${organized.byCategory['Math'].entries.filter(e => e.descriptor === 'type').length}`);
console.log(`   First 5 examples:`);
types.forEach(t => {
  console.log(`     • ${t.name}`);
  if (t.description) {
    console.log(`       "${t.description.substring(0, 60)}..."`);
  }
});
console.log();

// Example 8: Create a node-editor ready structure
console.log('8️⃣  NODE EDITOR STRUCTURE (sample)');
console.log('   ─────────────────────────────────────────────\n');
const nodeEntry = organized.entries.find(e => e.name === 'extrude');
if (nodeEntry) {
  console.log(`   Node Name: ${nodeEntry.name}`);
  console.log(`   Category: ${nodeEntry.category}`);
  console.log(`   Type: ${nodeEntry.descriptor || 'function'}`);
  console.log(`   Description: ${nodeEntry.description?.substring(0, 70)}...`);
  console.log(`   Input Sockets: ${nodeEntry.parameterCount}`);
  if (nodeEntry.returnType) {
    console.log(`   Output: ${nodeEntry.returnType}`);
  }
  console.log(`   Parameters:`);
  (nodeEntry.parameters || []).forEach((p, i) => {
    if (i < 3) {  // Show first 3
      console.log(`     • ${p.name} (${p.type})`);
    }
  });
  if (nodeEntry.parameters?.length > 3) {
    console.log(`     ... and ${nodeEntry.parameters.length - 3} more`);
  }
}
console.log();

// Example 9: Statistics
console.log('9️⃣  LIBRARY STATISTICS');
console.log('   ─────────────────────────────────────────────\n');
const stats = {
  total: organized.entries.length,
  withParams: organized.entries.filter(e => e.parameterCount > 0).length,
  withDescription: organized.entries.filter(e => e.description && e.description.length > 0).length,
  byType: organized.typeStats,
  byCategory: {}
};
for (const [cat, data] of Object.entries(organized.byCategory)) {
  stats.byCategory[cat] = data.entries.length;
}
console.log(`   Total unique entries: ${stats.total}`);
console.log(`   Entries with parameters: ${stats.withParams}`);
console.log(`   Entries with description: ${stats.withDescription}`);
console.log(`   Types:`);
for (const [type, count] of Object.entries(stats.byType)) {
  const pct = ((count / stats.total) * 100).toFixed(1);
  console.log(`     • ${type.padEnd(10)}: ${count.toString().padStart(4)} (${pct}%)`);
}
console.log();

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Use these patterns to integrate with your node editor         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
