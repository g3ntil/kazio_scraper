import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { localAdminBoundary, localDatabaseGateway } from '../local-admin.js';
import { isAdminResource } from '../../src/lib/admin-resources.js';
import { createDashboardFetch } from '../../src/lib/admin-fetch.js';

test('gateway permits only the existing admin resource allowlist', () => {
  for (const table of ['jobs','raw_brightermonday_jobs','raw_ndangira_jobs','raw_jobinrwanda_jobs','jobs_greatrwandajobs','jobs_jobwebrwanda']) {
    assert.equal(isAdminResource(`/rest/v1/${table}?id=eq.fixture`, 'PATCH'),true);
    assert.equal(isAdminResource(`/rest/v1/${table}`, 'GET'),false);
  }
  for (const path of ['https://attacker.invalid/rest/v1/jobs','//attacker.invalid/rest/v1/jobs','/rest/v1/users','/rest/v1/gemini_keys','/rest/v1/jobs/../users','/rest/v1/jobs%2f..%2fusers','/rest/v1/rpc/deduct_user_credits','/rest/v1/rpc/arbitrary_function']) {
    assert.equal(isAdminResource(path,'POST'),false,path);
  }
  assert.equal(isAdminResource('/rest/v1/rpc/admin_set_cron_active','POST'),true);
});

test('real local HTTP boundary rejects cross-site and rebinding calls; gateway keeps secrets server-side', async () => {
  const calls: Array<{url:string;init:RequestInit}> = [];
  const upstream: typeof fetch = async (input,init) => {
    calls.push({url:String(input),init:init!});
    return new Response('[{"id":"fixture"}]',{status:201,headers:{'content-type':'application/json','content-range':'0-0/1'}});
  };
  const app=express();let port=0;
  app.use('/api',(req,res,next)=>localAdminBoundary(port)(req,res,next));
  app.use(express.json());
  app.post('/api/admin/database',localDatabaseGateway('https://database.invalid','test-service-secret',upstream));
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  port=(server.address() as {port:number}).port;
  const origin=`http://127.0.0.1:${port}`;
  const body=JSON.stringify({resource:'/rest/v1/jobs?select=id',method:'POST',body:'{"title":"fixture"}',headers:{prefer:'return=representation',authorization:'attacker-value'}});
  const headers={'Content-Type':'application/json','X-Kazio-Local-Admin':'1',Origin:origin};
  try {
    assert.equal((await fetch(origin+'/api/health')).status,200);
    const good=await fetch(origin+'/api/admin/database',{method:'POST',headers,body});
    assert.equal(good.status,201);assert.equal(good.headers.get('content-range'),'0-0/1');
    assert.equal((await good.text()).includes('test-service-secret'),false);
    assert.equal(calls.length,1);
    const sent=new Headers(calls[0].init.headers);
    assert.equal(sent.get('authorization'),'Bearer test-service-secret');
    assert.equal(sent.get('prefer'),'return=representation');
    assert.equal((await fetch(origin+'/api/admin/database',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body})).status,403);
    const rebound = await new Promise<number>((resolve,reject)=>{
      const request=http.request(origin+'/api/admin/database',{method:'POST',headers:{...headers,Host:`attacker.invalid:${port}`}},response=>{response.resume();resolve(response.statusCode!)});
      request.on('error',reject);request.end(body);
    });
    assert.equal(rebound,403);
    assert.equal((await fetch(origin+'/api/admin/database',{method:'POST',headers:{...headers,Origin:'null'},body})).status,403);
    assert.equal((await fetch(origin+'/api/admin/database',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body})).status,403);
    assert.equal((await fetch(origin+'/api/admin/database',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body})).status,403);
    assert.equal(calls.length,1,'rejected requests must never reach service-role fetch');
  } finally { await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
});

test('browser adapter proxies writes/RPCs but keeps ordinary reads unchanged',async()=>{
  const calls: Array<{input:unknown;init?:RequestInit}>=[];
  const native:typeof fetch=async(input,init)=>{calls.push({input,init});return new Response('[]')};
  const previous=(globalThis as any).window;
  (globalThis as any).window={location:{origin:'http://localhost:3000'}};
  try{
    const wrapped=createDashboardFetch('https://database.invalid',native);
    await wrapped('https://database.invalid/rest/v1/jobs?select=id',{method:'PATCH',headers:{apikey:'public-key',Authorization:'Bearer public-key',Prefer:'return=representation'},body:'{"is_active":false}'});
    assert.equal(String(calls[0].input),'http://localhost:3000/api/admin/database');
    const envelope=JSON.parse(String(calls[0].init!.body));
    assert.equal(envelope.method,'PATCH');assert.equal(envelope.headers.prefer,'return=representation');
    assert.equal(JSON.stringify(envelope).includes('public-key'),false);
    await wrapped('https://database.invalid/rest/v1/jobs?select=id');
    assert.equal(String(calls[1].input),'https://database.invalid/rest/v1/jobs?select=id');
  } finally {(globalThis as any).window=previous}
});
