// Read account analytics using the current Wrangler login; never persist credentials.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const argumentsMap = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, args) => value.startsWith('--') ? [...pairs, [value.slice(2), args[index + 1]]] : pairs, []));
const start = new Date(argumentsMap.after ?? '2026-10-06T21:39:07.558Z');
if (!Number.isFinite(start.getTime())) throw new Error('Invalid --after timestamp.');
// Allow ten minutes for reporting delay; never label a partial window as a full day.
const end = new Date(Math.min(start.getTime() + 86400000, Date.now() - 600000));
if (end <= start) throw new Error('Analytics window is not yet available.');
const account = 'eddf7805053d5e32afd090c3ec22126c';
const database = 'd84b7ddc-76d7-4d64-92bb-c3e7fc7d4dec';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const { token } = JSON.parse(execFileSync(process.execPath, [wrangler, 'auth', 'token', '--json'], { encoding: 'utf8' }));
async function graphql(query) {
 const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});
 const body=await response.json();if(!response.ok || body.errors?.length) throw new Error(JSON.stringify(body.errors ?? {status:response.status}));return body.data.viewer.accounts[0];
}
const range = `datetime_geq:${JSON.stringify(start.toISOString())},datetime_lt:${JSON.stringify(end.toISOString())}`;
const beforeStart = new Date(start.getTime()-86400000), beforeEnd=start;
const fields='sum { rowsRead rowsWritten readQueries writeQueries }';
const data=await graphql(`{viewer{accounts(filter:{accountTag:"${account}"}){
 after:d1AnalyticsAdaptiveGroups(limit:10000,filter:{${range},databaseId:"${database}"}){${fields}}
 before:d1AnalyticsAdaptiveGroups(limit:10000,filter:{datetime_geq:"${beforeStart.toISOString()}",datetime_lt:"${beforeEnd.toISOString()}",databaseId:"${database}"}){${fields}}
 worker:workersInvocationsAdaptive(limit:10000,filter:{${range},scriptName:"practical-travel-gear"}){sum{requests errors subrequests}}
 limiterSql:durableObjectsPeriodicGroups(limit:10000,filter:{${range},namespaceId:"1127903abc16460eacf0ee50c9f1f998"}){sum{rowsRead rowsWritten duration exceededCpuErrors exceededMemoryErrors fatalInternalErrors}}
 limiter:durableObjectsInvocationsAdaptiveGroups(limit:10000,filter:{${range},scriptName:"practical-travel-gear"}){sum{requests errors wallTime}}
}}}`);
const totals=groups=>groups.reduce((sum,group)=>{for(const [key,value] of Object.entries(group.sum ?? {}))sum[key]=(sum[key]??0)+value;return sum;},{});
const after=totals(data.after),before=totals(data.before),worker=totals(data.worker),limiter=totals(data.limiter),limiterSql=totals(data.limiterSql);
const hours=(end-start)/3600000;
const report={generatedAt:new Date().toISOString(),start:start.toISOString(),end:end.toISOString(),hours,fullDayAvailable:hours>=24,before24Hours:before,after,worker,limiter,limiterSql,
 readsPerWorkerRequest:worker.requests?after.rowsRead/worker.requests:null,
 estimatedDailyReads:after.rowsRead*24/hours,
 estimatedReductionPercent:before.rowsRead?100*(1-(after.rowsRead*24/hours)/before.rowsRead):null,
 limitations:['Partial-day daily estimates are extrapolations.','D1 reads include cron, editors and audit queries; Workers requests include bots and cache hits.','Analytics can be delayed or sampled. Duration is reported in Cloudflare metric units; it is not an invoice amount.']};
const output=argumentsMap.output??'.wrangler/usage-audit.json';await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
