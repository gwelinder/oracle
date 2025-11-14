#!/usr/bin/env bun
import process from 'node:process';

const result = await Bun.build({
  entrypoints: ['./bin/oracle.js'],
  outdir: './.bun-check',
  target: 'bun',
  minify: false,
  write: false,
});

if (!result.success) {
  console.error('Build failed while checking syntax:');
  for (const log of result.logs) {
    console.error(log.message);
    if (log.position) {
      console.error(`\tat ${log.position.file}:${log.position.line}:${log.position.column}`);
    }
  }
  process.exit(1);
}

console.log('Syntax OK');
