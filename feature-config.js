// Pure configuration: no .env, database, timers or global environment mutation.
const dependencies=Object.freeze({
 FEATURE_PUBLIC_CATALOG:[], FEATURE_CATALOG_ADMIN:['FEATURE_AUTH'], FEATURE_AUTH:[],
 FEATURE_PATIENT_ACCOUNT:['FEATURE_AUTH','FEATURE_EMAIL_VERIFICATION'],
 FEATURE_EMAIL_VERIFICATION:[],
 FEATURE_PUBLIC_PATIENT_REGISTRATION:['FEATURE_AUTH','FEATURE_PATIENT_ACCOUNT','FEATURE_EMAIL_VERIFICATION'],
 FEATURE_PROFESSIONAL_INTEREST:[], FEATURE_CLINIC_INTEREST:[],
 FEATURE_INVITATIONS:['FEATURE_AUTH'],
 FEATURE_SCHEDULING:[], FEATURE_TEAM_OPERATIONS:['FEATURE_SCHEDULING','FEATURE_AUTH'],
 FEATURE_OPERATIONAL_COMMUNICATION:['FEATURE_SCHEDULING','FEATURE_TEAM_OPERATIONS'],
 FEATURE_OPERATIONAL_REPORTS:['FEATURE_SCHEDULING','FEATURE_AUTH'],
 FEATURE_SCHEDULE_WORKER:['FEATURE_SCHEDULING','FEATURE_TEAM_OPERATIONS'],
 FEATURE_CLINICAL_RECORDS:['FEATURE_SCHEDULING','FEATURE_AUTH'],
 FEATURE_PATIENT_RECORD_LINKING:['FEATURE_CLINICAL_RECORDS','FEATURE_TEAM_OPERATIONS','FEATURE_PATIENT_ACCOUNT']
});
for(const value of Object.values(dependencies))Object.freeze(value);
const names=Object.freeze(Object.keys(dependencies));
const validated=new WeakSet();
function loadFeatures(env={}){
 const errors=[],flags={};
 for(const key of Object.keys(env))if(key.startsWith('FEATURE_')&&!names.includes(key))errors.push('FEATURE_UNKNOWN');
 for(const name of names){
  const value=env[name];
  if(value!==undefined&&value!=='true'&&value!=='false')errors.push(name);
  flags[name]=value==='true';
 }
 for(const name of names)if(flags[name])for(const required of dependencies[name])if(!flags[required])errors.push(name+' requires '+required);
 if(errors.length)throw Error('Configuração de funcionalidades inválida: '+[...new Set(errors)].join(', ')+'.');
 Object.freeze(flags);validated.add(flags);return flags;
}
function isValidated(flags){return validated.has(flags);}
module.exports={loadFeatures,names,dependencies,isValidated};
