const home=user=>({paciente:'/agendamentos.html',profissional:'/profissional.html',equipe:'/atendimento.html',administrador:'/admin.html'})[user.role]||'/entrar.html';
function apiRoles(path){
 if(/^\/api\/admin(?:\/|$)/i.test(path))return ['administrador'];
 if(/^\/api\/(professional|consultations|templates)(?:\/|$)/i.test(path))return ['profissional'];
 if(/^\/api\/team(?:\/|$)/i.test(path))return ['equipe','administrador'];
 if(/^\/api\/appointments(?:\/|$)/i.test(path)||/^\/api\/account(?:\/link-code)?\/?$/i.test(path))return ['paciente'];
 return null;
}
function pageRoles(path,query){
 if(['/profissional.html','/consulta.html'].includes(path))return ['profissional'];
 if(['/atendimento.html','/programacao.html'].includes(path))return ['equipe','administrador'];
 if(['/admin.html','/agenda-admin.html','/equipe.html'].includes(path))return ['administrador'];
 if(path==='/operacao.html')return ['pacientes','comunicacao'].includes(query.aba)?['equipe','administrador']:['administrador'];
 if(path==='/agendamentos.html')return ['paciente'];
 return null;
}
function loginDestination(user,value){
 try{const url=new URL(value,'http://avelu.local');if(url.origin!=='http://avelu.local')return home(user);
 const roles=pageRoles(url.pathname,Object.fromEntries(url.searchParams));
 if(roles?.includes(user.role))return url.pathname+url.search;
 if(user.role==='paciente'&&url.pathname==='/agendar.html')return url.pathname+url.search;
 }catch{}return home(user);
}
module.exports={home,apiRoles,pageRoles,loginDestination};
