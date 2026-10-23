#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const original = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library.json'), 'utf-8'));
const organized = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library-organized.json'), 'utf-8'));

// Create map of original entries
const origMap = new Map();
for (const cat of original.categories) {
  for (const file of cat.files) {
    for (const entry of file.entries) {
      const key = entry.name + '::' + (entry.descriptor || 'function');
      if (!origMap.has(key)) {
        origMap.set(key, []);
      }
      origMap.get(key).push(entry);
    }
  }
}

// Find entries that had duplicates
console.log('=== Deduplication Examples ===\n');
let shown = 0;
for (const [key, origEntries] of origMap.entries()) {
  if (origEntries.length > 1 && shown < 10) {
    const [name, desc] = key.split('::');
    const dedupEntry = organized.entries.find(e => e.name === name && e.descriptor === desc);
    
    console.log(`${name} (${desc})`);
    console.log('  Original variants: ', origEntries.length);
    origEntries.forEach((e, i) => {
      const sig = e.signature || 'no signature';
      const paramMatch = sig.match(/\((.*?)\)/);
      const params = paramMatch ? paramMatch[1].split(',').length : 0;
      console.log(`    [${i+1}] params: ${params} | ${sig.substring(0, 50)}...`);
    });
    
    if (dedupEntry) {
      console.log(`  Kept version: params=${dedupEntry.parameterCount} | ${dedupEntry.signature.substring(0, 50)}...`);
    }
    console.log('');
    shown++;
  }
}

console.log('Summary:');
const multiVariants = [...origMap.entries()].filter(([k,v]) => v.length > 1).length;
console.log(`  Entries with multiple variants: ${multiVariants}`);
console.log(`  Total deduplicated entries: ${organized.metadata.deduplicatedEntries}`);
console.log(`  Unique function names: ${Object.keys(organized.byName).length}`);
