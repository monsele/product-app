@echo off
rem ST-106 live run: API in the pilot cohort with mock providers. TOGETHER_API_KEY is a
rem single space: node --env-file keeps an existing variable, and config treats blank as unset.
set ONE_SHOT_PILOT_ENABLED=true
set ONE_SHOT_PILOT_USER_IDS=01a0e363-b9ae-759d-80da-cf151b33b935
set MAX_ONE_SHOT_RUNS_PER_HOUR=20
set "TOGETHER_API_KEY= "
pnpm --filter @avlp/api dev > .runtime-logs\st106-api.log 2>&1
