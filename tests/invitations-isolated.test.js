const {test}=require('node:test'),assert=require('node:assert/strict');
const {homologationConfig}=require('../homologation-config');
const {mailSender}=require('../invitation-service');
const {decorate,catalogMiddleware,warning}=require('../homologation');
test('homologation is explicit, production refuses it and local defaults preserve registration',()=>{
 assert.equal(homologationConfig({},'development').inviteOnly,false);
 assert.throws(()=>homologationConfig({HOMOLOGATION_MODE:'true'},'production'));
 assert.throws(()=>homologationConfig({},'staging'));
 assert.throws(()=>homologationConfig({HOMOLOGATION_MODE:'true',INVITE_ONLY:'false'},'staging'));
 assert.equal(homologationConfig({HOMOLOGATION_MODE:'true'},'test').inviteOnly,true);
 assert.throws(()=>homologationConfig({INVITE_TTL_HOURS:'999'},'test'));
 assert.throws(()=>homologationConfig({HOMOLOGATION_PLACE_IDS:'1,abc'},'test'));
});
test('banner uses required warning and noindex metadata',()=>{
 const html=decorate('<html><head></head><body><main>Teste</main></body></html>');
 assert.ok(html.includes(warning));assert.ok(html.includes('noindex,nofollow,noarchive'));assert.ok(html.includes('<main>Teste</main>'));
});
test('email goes only to invited email; token stays in fragment and no HTTP URL',async()=>{
 let sent;const token='a'.repeat(64);
 await mailSender({RESEND_API_KEY:'fake',MAIL_FROM:'noreply@example.invalid',APP_ORIGIN:'https://example.invalid'},async(url,options)=>{sent={url,body:JSON.parse(options.body)};return {ok:true};})('invited@example.invalid',token);
 assert.deepEqual(sent.body.to,['invited@example.invalid']);assert.ok(sent.body.text.includes('#convite='+token));assert.equal(sent.url,'https://api.resend.com/emails');
 await assert.rejects(()=>mailSender({})('invited@example.invalid',token));
});
test('public catalog hides unlisted records and removes personal/contact/free-text fields',()=>{
 let output;const res={statusCode:200,json:data=>{output=data;}};
 catalogMiddleware({homologation:true,professionals:['1'],places:[]})({path:'/API/%70rofessionals',query:{}},res,()=>res.json([{id:1,name:'Private name',specialty:'Private text',telefone:'private',evolucao:'private'},{id:2,name:'unlisted'}]));
 assert.equal(output.length,1);assert.equal(output[0].name,'Profissional fictício 1');assert.ok(!JSON.stringify(output).includes('private'));assert.ok(!JSON.stringify(output).includes('Private'));
});
test('public profile denies unlisted IDs before querying',()=>{
 let status;const res={status:code=>{status=code;return res;},json:()=>{}};
 catalogMiddleware({homologation:true,professionals:[],places:[]})({path:'/api/profiles/profissional/99',query:{}},res,()=>assert.fail('Should not query'));
 assert.equal(status,404);
});

test('related profiles and availability remain limited to reviewed fictional IDs',()=>{
 let output;const access={homologation:true,professionals:['1'],places:['2']};
 const res={statusCode:200,json:data=>{output=data;}};
 catalogMiddleware(access)({path:'/api/profiles/local/2',query:{}},res,()=>res.json({id:2,atendimentos:[{id:3,nome:'Cardiologia',private:'secret',areas:[]}],relacionados:[{id:1},{id:9}]}));
 assert.equal(output.relacionados.length,1);assert.equal(output.relacionados[0].id,1);
 assert.equal(output.atendimentos[0].nome,'Cardiologia');assert.ok(!JSON.stringify(output).includes('secret'));
 const slotsRes={statusCode:200,json:data=>{output=data;}};
 catalogMiddleware(access)({path:'/api/professionals/1/availability',query:{}},slotsRes,()=>slotsRes.json({professional:{id:1},slots:[{id:5,local_id:2,patient:'secret'},{id:6,local_id:9}]}));
 assert.equal(output.slots.length,1);assert.equal(output.slots[0].id,5);assert.ok(!JSON.stringify(output).includes('secret'));
});
