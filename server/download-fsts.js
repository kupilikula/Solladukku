#!/usr/bin/env node
/**
 * Download all ThamizhiMorph FST models for server-side word validation.
 *
 * Downloads .fst files to server/fst-models/ for use by flookup at runtime.
 * Run: node download-fsts.js  (or: npm run setup)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FST_DIR = path.join(__dirname, 'fst-models');
const GITHUB_BASE = 'https://raw.githubusercontent.com/sarves/thamizhi-morph/master/FST-Models/';

const FST_FILES = [
    'noun.fst',
    'noun-guess.fst',
    'adj.fst',
    'adj-guess.fst',
    'adv.fst',
    'adv-guess.fst',
    'adverb-guesser.fst',
    'part.fst',
    'pronoun.fst',
    'verb-c3.fst',
    'verb-c4.fst',
    'verb-c11.fst',
    'verb-c12.fst',
    'verb-c62.fst',
    'verb-c-rest.fst',
    'verb-guess.fst',
];

function download(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Follow redirect
                file.close();
                fs.unlinkSync(destPath);
                download(res.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

async function main() {
    console.log('Downloading ThamizhiMorph FST models...\n');

    if (!fs.existsSync(FST_DIR)) {
        fs.mkdirSync(FST_DIR, { recursive: true });
    }

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const fname of FST_FILES) {
        const destPath = path.join(FST_DIR, fname);

        if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath);
            if (stats.size > 0) {
                console.log(`  Cached: ${fname} (${(stats.size / 1024).toFixed(0)} KB)`);
                skipped++;
                continue;
            }
        }

        const url = GITHUB_BASE + fname;
        try {
            process.stdout.write(`  Downloading ${fname}...`);
            await download(url, destPath);
            const stats = fs.statSync(destPath);
            console.log(` ${(stats.size / 1024).toFixed(0)} KB`);
            downloaded++;
        } catch (err) {
            console.log(` FAILED: ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${downloaded} downloaded, ${skipped} cached, ${failed} failed`);
    console.log(`FST models stored in: ${FST_DIR}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
