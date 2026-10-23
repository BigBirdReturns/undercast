#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const python=process.env.PHOTO_PYTHON||(process.platform==='win32'?'python':'python3');
const result=spawnSync(python,[fileURLToPath(new URL('./photo-maintenance.py',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,PHOTO_PYTHON:python}});
if(result.error)console.error(`Photo worker unavailable: ${result.error.message}. Set PHOTO_PYTHON to the photo virtual environment.`);
process.exitCode=result.status??1;
