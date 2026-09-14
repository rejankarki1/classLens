// Offline checks using the repository's existing TypeScript compiler and Node runtime.
// No secrets, cloud requests, or external test dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const options = {
  strict: true, noEmit: true, skipLibCheck: true, types: [],
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
};
const program = ts.createProgram([path.join(__dirname, 'handler.ts')], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  process.exit(1);
}
require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(code, filename);
};
const {createHandler}=require('./handler.ts');
const {parseQuizResult}=require('../../../src/lib/quiz.ts');
const quiz={title:'Test quiz',questions:Array.from({length:5},(_,i)=>({question:'Question '+i,options:['A','B','C','D'],correctAnswer:'A',explanation:'From the lecture.'}))};
const id='test-lecture';const mid='e5a09744-2ed8-4f81-a297-05b4cc6f7fa4';
const config={supabaseUrl:'https://example.invalid',publishableKey:'test-key',geminiKey:'secret-test'};
const lecture={id,title:'BST',summary:'Three deletion cases',key_concepts:['BST'],important_points:['Leaf','One child','Two children'],assignments:[],exam_mentions:[]};
const photo={id:mid,storage_path:`materials/${mid}/photo.png`};
function json(value){return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})}
function request(body={lectureId:id},key='test-key',method='POST'){
 return new Request('https://example.invalid',{method,headers:{apikey:key,'content-type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
(async()=>{
 const cases=[
  ['success',{},200,4],['text only',{materials:[]},200,3],
  ['access',{key:'bad'},401,0],['method',{method:'GET'},405,0],['preflight',{method:'OPTIONS'},204,0],
  ['missing config',{config:{geminiKey:''}},503,0],['bad JSON',{body:'{'},400,0],
  ['empty ID',{body:{lectureId:' '}},400,0],
  ['large body',{body:' '.repeat(16385)},413,0],['missing lecture',{lectures:[]},404,1],
  ['database error',{dbError:true},502,1],['too many photos',{materials:[photo,photo,photo,photo]},413,2],
  ['storage error',{storageError:true},502,3],['image too large',{large:true},413,3],
  ['invalid path',{materials:[{...photo,storage_path:'elsewhere.png'}]},422,2],
  ['quota',{status:429},429,4],['provider error',{status:500},502,4],
  ['invalid quiz',{answer:{}},502,4],['insufficient context',{answer:{error:'INSUFFICIENT_CONTEXT'}},422,4],['blocked',{finish:'SAFETY'},502,4],
  ['truncated',{finish:'MAX_TOKENS'},502,4],
 ];
 for(const [name,o,status,count] of cases){
  let calls=0;const fetcher=async(url,init)=>{
   calls++;
   if(url.includes('/lectures?')){assert.equal(new URL(url).searchParams.get('id'),'eq.test-lecture');return o.dbError?new Response('',{status:500}):json(o.lectures??[lecture]);}
   if(url.includes('/materials?')){assert.equal(new URL(url).searchParams.get('lecture_id'),'eq.test-lecture');return json(o.materials??[photo]);}
   if(url.includes('/storage/'))return o.storageError?new Response('',{status:403}):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png',...(o.large?{'content-length':'10485761'}:{})}});
   assert.equal(init.headers['x-goog-api-key'],'secret-test');const body=JSON.parse(init.body);
   assert.match(body.systemInstruction.parts[0].text,/ONLY the supplied/);assert.match(body.systemInstruction.parts[0].text,/five distinct/);
   assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).lecture,lecture);
   assert.equal(body.contents[0].parts.length,(o.materials??[photo]).length+1);
   if((o.materials??[photo]).length)assert.deepEqual(body.contents[0].parts[1],{inlineData:{mimeType:'image/png',data:'AQID'}});
   return o.status?new Response('sensitive',{status:o.status}):json({candidates:[{finishReason:o.finish??'STOP',content:{parts:[{text:JSON.stringify(o.answer??quiz)}]}}]});
  };
  const r=await createHandler({...config,...o.config},fetcher)(request(o.body,o.key,o.method));assert.equal(r.status,status,name);assert.equal(calls,count,name);
  const text=await r.text();assert.ok(!text.includes('sensitive')&&!text.includes('secret-test'));
  if(status===200)assert.deepEqual(parseQuizResult(JSON.parse(text)),quiz);
 }
 const originalTimer=global.setTimeout;global.setTimeout=fn=>originalTimer(fn,1);
 try{const r=await createHandler(config,(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout')))))(request());assert.equal(r.status,504);}finally{global.setTimeout=originalTimer;}
 const vm=require('node:vm');const exports={};let mode='supabase',result={data:quiz,error:null},calls=0;
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/services/ai.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Error,Response,require:name=>{
  if(name==='@/lib/quiz')return require('../../../src/lib/quiz.ts');
  if(name==='@/lib/askLecture')return require('../../../src/lib/askLecture.ts');
  if(name==='@/lib/lectureAnalysis')return {};
  if(name==='@/lib/dataMode')return {getDataMode:()=>mode};
  if(name==='@/lib/supabase')return {supabase:{functions:{invoke:async(name,{body})=>{calls++;assert.equal(name,'generate-quiz');assert.equal(body.lectureId,id);return result;}}}};
  throw Error(name);
 }});
 assert.deepEqual(await exports.generateQuiz(id),quiz);
 result={data:null,error:{context:json({error:{message:'Quota reached.'}})}};await assert.rejects(exports.generateQuiz(id),/Quota/);
 result={data:{answer:4},error:null};await assert.rejects(exports.generateQuiz(id),/Quiz text/);
 mode='mock';await assert.rejects(exports.generateQuiz(id),/supabase/);await assert.rejects(exports.generateQuiz(' '),/required/);assert.equal(calls,3);
 for(const mutate of [
    q=>q.questions.pop(), q=>q.questions[0].options.pop(), q=>q.questions[0].options[1]='A',
    q=>q.questions[0].correctAnswer='absent', q=>q.questions[0].explanation='',
    q=>q.questions[1].question=q.questions[0].question, q=>q.title='',
    q=>q.questions[0].options[0]=3,
  ]){const invalid=structuredClone(quiz);mutate(invalid);assert.throws(()=>parseQuizResult(invalid));}
  const padded=structuredClone(quiz);padded.questions[0].options[0]=' A ';padded.questions[0].correctAnswer=' A ';
  assert.equal(parseQuizResult(padded).questions[0].correctAnswer,'A');
  console.log(`PASS: handler typecheck, ${cases.length} quiz scenarios, timeout and service validation. Original photo bytes and lecture fields included; no network.`);
})().catch(error=>{console.error(error);process.exitCode=1});
