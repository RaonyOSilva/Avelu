// Explicit inventory, not a router. No application modules are imported here.
const resources=[];
function add(kind,group,requires,source,entries,extra={}){
 for(const entry of entries){const [method,path]=entry.split(' ');resources.push(Object.freeze({id:kind+':'+method+':'+path,kind,method,path,group,requires:Object.freeze([...requires]),source,...extra}));}
}
const F=name=>'FEATURE_'+name;
add('api','A',[], 'server.js / operational-health.js',[
 'GET /robots.txt','GET /api/environment','GET /health/live','GET /health/startup','GET /api/health','GET /health/ready','POST /api/auth/logout'
]);
add('api','A',[F('AUTH')],'auth.js / account.js',[
 'POST /api/auth/login','GET /api/auth/me','POST /api/auth/forgot','POST /api/auth/reset','POST /api/account/password'
]);
add('api','A',[F('PUBLIC_PATIENT_REGISTRATION')],'auth.js',['POST /api/auth/register'],{review:'Registration/invitation branches must be separated in P02.2b; no invitation bypass.'});
add('api','A',[F('PATIENT_ACCOUNT')],'account.js',['GET /api/account','POST /api/account']);
add('api','A',[F('PUBLIC_CATALOG')],'server.js / admin.js / profiles.js / discovery.js',[
 'GET /api/specialties','GET /api/cities','GET /api/places','GET /api/places/:id','GET /api/professionals','GET /api/discovery','GET /api/profiles/:type/:id'
],{review:'Public DTO, approval and removal of scheduling queries are pending; classification alone does not sanitize data.'});
add('api','A',[F('CATALOG_ADMIN')],'admin.js / operations.js',[
 'GET /api/admin/places','POST /api/admin/places','PUT /api/admin/places/:id',
 'GET /api/admin/professionals','POST /api/admin/professionals','PUT /api/admin/professionals/:id','POST /api/admin/specialties',
 'GET /api/admin/users','POST /api/admin/users/:id/state'
]);
add('api','A',[F('INVITATIONS')],'invitation-routes.js',[
 'GET /api/admin/invitations','POST /api/admin/invitations','POST /api/admin/invitations/:id/revoke'
]);
add('api','B',[F('SCHEDULING')],'appointments.js / operations.js',[
 'GET /api/professionals/:id/availability','GET /api/appointments','POST /api/appointments','POST /api/appointments/:id/cancel',
 'GET /api/appointments/:id/history','GET /api/admin/availability','POST /api/admin/availability','POST /api/admin/availability/:id/block'
]);
add('api','B',[F('SCHEDULING'),F('AUTH')],'team.js',[
 'GET /api/professional/account','POST /api/professional/password','GET /api/professional/context','GET /api/professional/scheduled',
 'GET /api/professional/agenda','POST /api/professional/availability','POST /api/professional/availability/:id/state','POST /api/professional/appointments','POST /api/professional/appointments/:id/state'
]);
add('api','B',[F('TEAM_OPERATIONS')],'team.js / team-experience.js / team-scheduling.js / operations.js / team-access.js',[
 'POST /api/team/password','GET /api/team/context','GET /api/team/agenda','POST /api/team/availability',
 'POST /api/team/availability/:id/state','POST /api/team/appointments','POST /api/team/appointments/:id/state',
 'POST /api/team/appointments/:id/reschedule','GET /api/team/waitlist','POST /api/team/waitlist','POST /api/team/waitlist/:id/state',
 'GET /api/team/schedules/calendar','GET /api/team/schedules','POST /api/team/schedules/preview','POST /api/team/schedules',
 'POST /api/team/schedules/:id/state','POST /api/team/schedules/:id/withdraw','POST /api/team/queue/:id',
 'GET /api/team/patients','POST /api/team/patients','POST /api/team/patients/:id/contact','GET /api/team/patients/:id',
 'POST /api/admin/users/:id/role','GET /api/admin/team-access','POST /api/admin/team-access','DELETE /api/admin/team-access/:id',
 'GET /api/admin/place-settings','POST /api/admin/place-settings/:id'
]);
add('api','B',[F('OPERATIONAL_COMMUNICATION')],'operations.js',['GET /api/team/communications','POST /api/team/communications/:id']);
add('api','B',[F('OPERATIONAL_REPORTS')],'operations.js / team.js',[
 'GET /api/admin/operations','GET /api/admin/audit','GET /api/professional/report'
],{review:'Mixed operational/clinical audit and report projections must be separated before future activation.'});
add('api','C',[F('CLINICAL_RECORDS')],'appointments.js / consultations.js / clinical-templates.js',[
 'GET /api/appointments/:id/record','GET /api/consultations/:id','POST /api/consultations/:id',
 'GET /api/templates','POST /api/templates','DELETE /api/templates/:id','POST /api/professional/queue/:id/start'
]);
add('api','C',[F('PATIENT_RECORD_LINKING')],'operations.js',['POST /api/account/link-code','POST /api/team/patients/:id/link']);

function files(group,requires,names,extra){add('file',group,requires,'server.js publicFiles',names.map(name=>'GET /'+name),extra);}
files('A',[],['','index.html','sobre.html','app.js','home-discovery.js','privacy-guard.js','session-exit.js','service-worker.js','manifest.webmanifest','paginas.css','conta.css','workspace.css','homologation.css']);
files('A',[F('PUBLIC_CATALOG')],['buscar.html','buscar.js','buscar.css','perfil.html','perfil.js','perfil.css']);
files('A',[F('PUBLIC_PATIENT_REGISTRATION')],['cadastro.html']);
files('A',[F('AUTH')],['entrar.html','recuperar.html','recuperar.js','senha.html','senha.js','conta.js','workspace.js'],{review:'Shared scripts still contain B/C branches; navigation changes are pending.'});
files('A',[F('CATALOG_ADMIN')],['admin.html','admin-ui.js','admin.css']);
files('A',[F('INVITATIONS')],['convites.html','convites.js']);
files('B',[F('SCHEDULING')],['agendar.html','agendar-local.html','agendar-local.js','agendar-local.css']);
files('C',[F('SCHEDULING'),F('CLINICAL_RECORDS')],['agendamentos.html','patient-tools.js','profissional.html','profissional.js','profissional.css'],{review:'Mixed B/C pages require both groups; separate A screens must not reuse them.'});
files('B',[F('TEAM_OPERATIONS'),F('OPERATIONAL_REPORTS'),F('PATIENT_RECORD_LINKING')],['operacao.html','operations-ui.js'],{review:'Mixed A/B/C UI remains closed until separately refactored; query tabs are not exceptions.'});
files('B',[F('TEAM_OPERATIONS')],['agenda-admin.html','agenda-admin.js','equipe.html','equipe.js','atendimento.html','atendimento.js','atendimento.css','atendimento-extras.js','reception-patients.js','programacao.html','programacao.js','programacao.css']);
files('C',[F('CLINICAL_RECORDS')],['consulta.html','consulta.js','consulta.css','consulta-modelos.js']);
files('A',[],['assets/avatar-gustavo.png','assets/avatar-mariana.png','assets/avatar-pedro.png','assets/hero-woman.png','assets/icon.svg','assets/logo.png'],{review:'Static content approval remains required; no wildcard for new assets.'});

const tasks=Object.freeze([
 Object.freeze({id:'schedule-worker',group:'B',requires:Object.freeze([F('SCHEDULE_WORKER')])}),
 Object.freeze({id:'schedule-service',group:'B',requires:Object.freeze([F('SCHEDULING')])}),
 Object.freeze({id:'patient-sync',group:'C',requires:Object.freeze([F('PATIENT_RECORD_LINKING')])}),
 Object.freeze({id:'backup',group:'technical',requires:Object.freeze([])}),
 Object.freeze({id:'health',group:'technical',requires:Object.freeze([])}),
 Object.freeze({id:'auth-limit-cleanup',group:'technical',requires:Object.freeze([])})
]);
const ids=new Set();
for(const r of resources){if(ids.has(r.id))throw Error('Duplicate resource: '+r.id);ids.add(r.id);}
module.exports={resources:Object.freeze(resources),tasks};
