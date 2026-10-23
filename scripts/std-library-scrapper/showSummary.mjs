#!/usr/bin/env node

/**
 * Display a comprehensive summary of the FeatureScript library organization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const org = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library-organized.json'), 'utf-8')
);

console.log('═'.repeat(90));
console.log('           FeatureScript Library Organization - Complete Summary');
console.log('═'.repeat(90));

console.log('\n📥 DATA FLOW\n' + '─'.repeat(90));
console.log('Onshape Server → scrape → featurescript-library.json (1,400 entries)');
console.log('                           ↓');
console.log('                      organizeLibrary.mjs');
console.log('                           ↓');
console.log('         featurescript-library-organized.json (1,189 unique)');
console.log('         + featurescript-lookup.json (205 KB)\n');

console.log('📊 DEDUPLICATION RESULTS\n' + '─'.repeat(90));
console.log(`Raw entries:              1,400`);
console.log(`Unique names:             ${org.entries.length}`);
console.log(`Duplicates removed:       ${1400 - org.entries.length} (${((1400 - org.entries.length) / 1400 * 100).toFixed(1)}%)`);
console.log(`Dedup strategy:           Keep entry with most parameters\n`);

console.log('📈 TYPE DISTRIBUTION\n' + '─'.repeat(90));
for (const [type, count] of Object.entries(org.typeStats)) {
  const pct = ((count / org.entries.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / 50));
  console.log(`${type.padEnd(15)}: ${count.toString().padStart(3)} (${pct.padStart(5)}%)  ${bar}`);
}

console.log('\n📍 CATEGORY BREAKDOWN\n' + '─'.repeat(90));
for (const [cat, data] of Object.entries(org.byCategory)) {
  const count = data.entries.length;
  const pct = ((count / org.entries.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / 15));
  console.log(`${cat.padEnd(20)}: ${count.toString().padStart(3)} (${pct.padStart(5)}%)  ${bar}`);
}

console.log('\n⚙️  FILES GENERATED\n' + '─'.repeat(90));
const files = [
  { name: 'featurescript-library-organized.json', size: '4,774 KB', desc: 'Full organized data' },
  { name: 'featurescript-lookup.json', size: '205 KB', desc: 'Quick lookup (20x smaller)' },
  { name: 'featurescript-library.json', size: '1,064 KB', desc: 'Raw scraped data' },
  { name: 'organizeLibrary.mjs', size: '7 KB', desc: 'Processing script' },
  { name: 'exampleUsage.mjs', size: '8 KB', desc: 'Usage examples' },
];

files.forEach(f => {
  console.log(`${f.name.padEnd(40)} ${f.size.padStart(10)}  ${f.desc}`);
});

console.log('\n🎯 USE CASE RECOMMENDATIONS\n' + '─'.repeat(90));
console.log('For IDE Autocomplete:     Use featurescript-lookup.json (fast, compact)');
console.log('For Node Editor:          Use featurescript-library-organized.json');
console.log('For Web Distribution:     Serve lookup.json + cache organized.json');
console.log('For Search/Filtering:     Use searchIndex array + lookup.json');

console.log('\n📊 ENTRY STATISTICS\n' + '─'.repeat(90));
const withParams = org.entries.filter(e => e.parameterCount > 0);
const withDesc = org.entries.filter(e => e.description && e.description.length > 0);
const maxParamEntry = org.entries.reduce((max, e) => e.parameterCount > max.parameterCount ? e : max);

console.log(`Total unique entries:        ${org.entries.length}`);
console.log(`Entries with parameters:     ${withParams.length} (${((withParams.length / org.entries.length) * 100).toFixed(1)}%)`);
console.log(`Entries with description:    ${withDesc.length} (${((withDesc.length / org.entries.length) * 100).toFixed(1)}%)`);
console.log(`Most complex function:       ${maxParamEntry.name} (${maxParamEntry.parameterCount} parameters)`);

console.log('\n🚀 QUICK START\n' + '─'.repeat(90));
console.log('npm run scrape:all             # Fetch and organize in one command');
console.log('node scripts/exampleUsage.mjs  # See 9 usage examples');
console.log('npm run organize:docs          # Re-organize existing data\n');

console.log('📚 DOCUMENTATION\n' + '─'.repeat(90));
console.log('LIBRARY_ORGANIZATION_SUMMARY.md    Complete reference guide');
console.log('scripts/ORGANIZER_README.md         Organization details');
console.log('scripts/SCRAPER_README.md           Scraping documentation\n');

console.log('═'.repeat(90) + '\n');
