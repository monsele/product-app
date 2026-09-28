@echo off
set "TOGETHER_API_KEY= "
pnpm --filter @avlp/renderer dev > .runtime-logs\st107-renderer.log 2>&1
