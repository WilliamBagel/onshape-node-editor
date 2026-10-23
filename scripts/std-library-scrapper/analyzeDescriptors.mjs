#!/usr/bin/env node

/**
 * Analyze the featurescript-library.json to verify if empty descriptors are functions
 * and gather statistics on data types
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, '..', '..', 'src', 'app', 'onshape', 'featurescript-library.json');

function analyzeLibrary() {
  try {
    console.log('Reading featurescript-library.json...\n');
    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

    // Statistics
    const stats = {
      byDescriptor: {},
      emptyDescriptorAnalysis: {
        total: 0,
        hasSignature: 0,
        hasFunctionSignature: 0,
        noSignature: 0,
        samples: []
      },
      descriptorTypes: new Set(),
      totalEntries: 0
    };

    // Iterate through all entries
    for (const category of data.categories) {
      for (const file of category.files) {
        for (const entry of file.entries) {
          stats.totalEntries++;
          const desc = entry.descriptor || '(empty)';

          if (!stats.byDescriptor[desc]) {
            stats.byDescriptor[desc] = 0;
          }
          stats.byDescriptor[desc]++;
          stats.descriptorTypes.add(desc);

          // Analyze empty descriptors
          if (!entry.descriptor || entry.descriptor === '') {
            stats.emptyDescriptorAnalysis.total++;
            if (entry.signature) {
              stats.emptyDescriptorAnalysis.hasSignature++;
              if (entry.signature.includes('(')) {
                stats.emptyDescriptorAnalysis.hasFunctionSignature++;
              }
            } else {
              stats.emptyDescriptorAnalysis.noSignature++;
            }

            // Collect samples
            if (stats.emptyDescriptorAnalysis.samples.length < 10) {
              stats.emptyDescriptorAnalysis.samples.push({
                name: entry.name,
                signature: entry.signature,
                returnType: entry.returnType,
                hasParameters: entry.parameters && entry.parameters.length > 0
              });
            }
          }
        }
      }
    }

    console.log('===== DESCRIPTOR ANALYSIS =====\n');
    console.log('Descriptors found in library:');
    for (const desc of Array.from(stats.descriptorTypes).sort()) {
      const count = stats.byDescriptor[desc];
      const pct = ((count / stats.totalEntries) * 100).toFixed(1);
      console.log(`  "${desc}": ${count} (${pct}%)`);
    }

    console.log('\n===== EMPTY DESCRIPTOR ANALYSIS =====\n');
    console.log(`Total entries with empty descriptor: ${stats.emptyDescriptorAnalysis.total}`);
    console.log(`  - With signature: ${stats.emptyDescriptorAnalysis.hasSignature}`);
    console.log(`  - With function signature (contains parentheses): ${stats.emptyDescriptorAnalysis.hasFunctionSignature}`);
    console.log(`  - Without signature: ${stats.emptyDescriptorAnalysis.noSignature}`);

    console.log('\nSample empty descriptor entries:');
    for (const sample of stats.emptyDescriptorAnalysis.samples) {
      console.log(`  • ${sample.name}`);
      console.log(`    Signature: ${sample.signature || '(none)'}`);
      console.log(`    Return Type: ${sample.returnType || '(none)'}`);
      console.log(`    Has Parameters: ${sample.hasParameters}`);
    }

    console.log('\n===== CONCLUSION =====');
    if (stats.emptyDescriptorAnalysis.hasFunctionSignature === stats.emptyDescriptorAnalysis.hasSignature) {
      console.log('✓ VERIFIED: All empty descriptors are functions');
      console.log(`  All ${stats.emptyDescriptorAnalysis.total} empty descriptor entries have function signatures.`);
    } else {
      console.log('✗ NOT ALL: Some empty descriptors are NOT functions');
      console.log(`  ${stats.emptyDescriptorAnalysis.noSignature} entries have no signature`);
      console.log(`  ${stats.emptyDescriptorAnalysis.hasSignature - stats.emptyDescriptorAnalysis.hasFunctionSignature} have non-function signatures`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

analyzeLibrary();
