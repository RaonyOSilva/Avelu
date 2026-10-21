function homologationConfig(env,stage){
 const flag=(name,fallback)=>{if(env[name]===undefined||env[name]==='')return fallback;if(!['true','false'].includes(env[name]))throw Error('Configuração inválida: '+name);return env[name]==='true';};
 const homologation=flag('HOMOLOGATION_MODE',false);
 const staging=['staging','homologacao'].includes(stage);
 if(homologation&&!['staging','homologacao','test'].includes(stage))throw Error('HOMOLOGATION_MODE permitido somente em staging ou test.');
 if(staging&&!homologation)throw Error('Staging exige HOMOLOGATION_MODE=true.');
 const inviteOnly=flag('INVITE_ONLY',homologation);
 if(stage==='production'&&(inviteOnly||env.HOMOLOGATION_PROFESSIONAL_IDS||env.HOMOLOGATION_PLACE_IDS))throw Error('Configurações de convites de homologação não são permitidas em produção nesta fase.');
 if(homologation&&!inviteOnly)throw Error('Homologação exige INVITE_ONLY=true.');
 const ttl=Number(env.INVITE_TTL_HOURS||48);
 if(!Number.isInteger(ttl)||ttl<1||ttl>168)throw Error('INVITE_TTL_HOURS deve estar entre 1 e 168.');
 const ids=name=>{if(!env[name])return [];const list=env[name].split(',').map(s=>s.trim());if(list.length>100||list.some(s=>! /^[1-9]\d{0,14}$/.test(s)))throw Error('Lista inválida: '+name);return [...new Set(list)];};
 return {homologation,inviteOnly,ttl,professionals:ids('HOMOLOGATION_PROFESSIONAL_IDS'),places:ids('HOMOLOGATION_PLACE_IDS')};
}
module.exports={homologationConfig};
