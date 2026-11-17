const {resources,tasks}=require('./resource-manifest');
const {isValidated}=require('./feature-config');

// Deliberately limited to the grammar in the current inventory: literal segments
// and named parameters. New Express wildcard/optional syntax requires review.
function compilePath(path,kind){
 if(path==='/')return /^\/$/;
 if(!/^\/(?:[a-zA-Z0-9_.-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_.-]+|:[a-zA-Z][a-zA-Z0-9_]*))*$/.test(path))throw Error('Resource path requires explicit matching review.');
 const pattern=path.split('/').map(segment=>segment.startsWith(':')?'([^/]+)':segment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');
 // Express routes: insensitive + non-strict by default. sendFile allowlist is
 // exact/case-sensitive; express.static assets are canonicalized separately.
 return new RegExp('^'+pattern+(kind==='api'?'(?:/)?':'')+'$',kind==='api'?'i':'');
}
const compiled=resources.map(resource=>({resource,pattern:compilePath(resource.path,resource.kind)}));
function pathname(target){
 if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//')||/[\x00-\x20\\#]/.test(target))return null;
 return target.split('?')[0];
}
function matchResource(path,entry){
 let candidate=path;
 if(entry.resource.path.startsWith('/assets/')){
  try{candidate=decodeURIComponent(path);}catch{return false;}
  // express.static may normalize dot segments. Reject noncanonical forms;
  // false negatives close access instead of forwarding to an unknown file.
  if(candidate.split('/').some(s=>s==='.'||s==='..')||candidate.includes('\\'))return false;
 }
 const match=entry.pattern.exec(candidate);if(!match)return false;
 try{for(const value of match.slice(1))decodeURIComponent(value);}catch{return false;}
 return true;
}
function classify(method,target){
 const path=pathname(target);
 if(!path||typeof method!=='string'||!method)return Object.freeze({status:'pending',reason:'invalid-target',resources:[]});
 const atPath=compiled.filter(entry=>matchResource(path,entry)).map(entry=>entry.resource);
 const verb=method.toUpperCase();
 const matches=atPath.filter(r=>verb==='OPTIONS'||r.method===(verb==='HEAD'?'GET':verb));
 if(!matches.length)return Object.freeze({status:'pending',reason:atPath.length?'unclassified-method':'unclassified-resource',resources:Object.freeze(atPath)});
 return Object.freeze({status:'classified',resources:Object.freeze(matches)});
}
function enabled(requirements,flags){return isValidated(flags)&&requirements.every(name=>flags[name]===true);}
function evaluate(method,target,flags){
 const classification=classify(method,target);
 const allowed=classification.status==='classified'&&isValidated(flags)&&classification.resources.every(r=>enabled(r.requires,flags));
 return Object.freeze({...classification,allowed});
}
function deny(req,res){
 res.removeHeader('Allow');res.set('Cache-Control','no-store');
 if(/^\/api(?:\/|$)/i.test(pathname(req.originalUrl||req.url)||''))return res.status(404).json({error:'Recurso não encontrado.'});
 return res.status(404).type('text/plain').send('Página não encontrada.');
}
// Intended for P02.2b BEFORE any response-producing catalog/static/auth module.
// A successful next() is only a capability check, never authentication.
function createCapabilityGuard(flags){
 if(!isValidated(flags))throw Error('Validated feature configuration required.');
 return (req,res,next)=>evaluate(req.method,req.originalUrl||req.url,flags).allowed?next():deny(req,res);
}
function assertTask(id,flags){
 const task=tasks.find(t=>t.id===id);
 if(!task||!enabled(task.requires,flags))throw Object.assign(Error('Funcionalidade indisponível.'),{code:'FEATURE_DISABLED'});
}
// Receives registrations collected by tooling; does not inspect Express internals.
// Unknown paths/methods are actionable pending items, never public alternatives.
function auditRegistrations(registrations){
 const known=new Set(resources.map(r=>r.method+' '+r.path));
 return registrations.filter(r=>!known.has(r.method+' '+r.path)).map(r=>Object.freeze({method:r.method,path:r.path,status:'pending'}));
}
module.exports={classify,evaluate,createCapabilityGuard,deny,assertTask,auditRegistrations,compilePath};
