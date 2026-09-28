@echo off
rem ST-107 live run: worker on mock providers (blank key, see st107-start-api.cmd).
set "TOGETHER_API_KEY= "
pnpm --filter @avlp/pipeline-worker dev > .runtime-logs\st107-worker.log 2>&1
