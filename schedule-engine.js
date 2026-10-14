
const {createHash}=require('node:crypto');
const fail=message=>Object.assign(new Error(message),{status:400});
const validId=v=>/^[1-9]\d{0,14}$/.test(String(v));
const dayMs=86400000;
const today=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
function date(s){if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s))throw fail('Data inválida.');const d=new Date(s+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw fail('Data inválida.');return d;}
function add(s,n){return new Date(+date(s)+n*dayMs).toISOString().slice(0,10);}
function time(s){if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw fail('Horário inválido.');return Number(s.slice(0,2))*60+Number(s.slice(3));}
function hhmm(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function normalize(b){
 if(!b||!validId(b.profissional_id)||!validId(b.local_id))throw fail('Selecione profissional e local.');
 date(b.inicio);date(b.fim);
 if(b.fim<b.inicio||date(b.fim)-date(b.inicio)>365*dayMs)throw fail('Escolha um período de até 366 dias.');
 if(!Array.isArray(b.dias)||!b.dias.length||b.dias.length>7||b.dias.some(n=>!Number.isInteger(n)||n<0||n>6))throw fail('Escolha os dias da semana.');
 if(!Array.isArray(b.turnos)||!b.turnos.length||b.turnos.length>4)throw fail('Informe de um a quatro turnos.');
 const duration=Number(b.duracao);if(!Number.isInteger(duration)||duration<5||duration>240)throw fail('Use consultas de 5 a 240 minutos.');
 const shifts=b.turnos.map(t=>({inicio:t.inicio,fim:t.fim})).sort((a,b)=>time(a.inicio)-time(b.inicio));
 let count=0,minutes=0;
 shifts.forEach((s,i)=>{const size=time(s.fim)-time(s.inicio);if(size<duration||(i&&time(s.inicio)<time(shifts[i-1].fim)))throw fail('Os turnos devem comportar uma consulta e não podem se sobrepor.');count+=Math.floor(size/duration);minutes+=size;});
 if(count>96||minutes>720)throw fail('Use até 12 horas e 96 consultas por dia.');
 const price=b.valor===''||b.valor==null?null:Number(b.valor);if(price!==null&&(!Number.isFinite(price)||price<0||price>999999.99))throw fail('Valor inválido.');
 if(!['integral','movel'].includes(b.modo)||!Number.isInteger(b.janela)||b.janela<1||b.janela>180)throw fail('Escolha modo e janela de 1 a 180 dias.');
 if(b.calendario_revisado!==true)throw fail('Revise o calendário do local antes de publicar.');
 if(!Array.isArray(b.feriados)||b.feriados.length>400||!Array.isArray(b.excecoes)||b.excecoes.length>100)throw fail('Calendário ou exceções inválidos.');
 const holidays=b.feriados.map(h=>{date(h.data);if(typeof h.nome!=='string'||!h.nome.trim()||h.nome.length>120||!['nacional','estadual','municipal','facultativo','religioso'].includes(h.tipo)||typeof h.excluir!=='boolean')throw fail('Confira as datas do calendário.');return{data:h.data,nome:h.nome.trim(),tipo:h.tipo,excluir:h.excluir};}).sort((a,b)=>a.data.localeCompare(b.data)||a.nome.localeCompare(b.nome));
 const exceptions=b.excecoes.map(e=>{date(e.inicio);date(e.fim);if(e.fim<e.inicio||typeof e.motivo!=='string'||e.motivo.length>120)throw fail('Confira as férias ou recessos.');return{inicio:e.inicio,fim:e.fim,motivo:e.motivo.trim()||'Exceção'};});
 return{profissional_id:String(b.profissional_id),local_id:String(b.local_id),inicio:b.inicio,fim:b.fim,dias:[...new Set(b.dias)].sort(),turnos:shifts,duracao:duration,valor:price,modo:b.modo,janela:b.janela,calendario_revisado:true,feriados:holidays,excecoes:exceptions};
}
function candidates(config,now=new Date()){
 const end=config.modo==='movel'?[config.fim,add(today(now),config.janela-1)].sort()[0]:config.fim;
 const slots=[],days=[];let deferred=0;
 for(let d=config.inicio;d<=config.fim;d=add(d,1)){
 if(!config.dias.includes(date(d).getUTCDay()))continue;
 const reason=config.excecoes.find(e=>d>=e.inicio&&d<=e.fim)?.motivo||config.feriados.find(h=>h.data===d&&h.excluir)?.nome;
 if(reason){days.push({data:d,motivo:reason,criar:0,conflitos:0,passados:0});continue;}
 const row={data:d,motivo:d>end?'Fora da janela atual':'',criar:0,conflitos:0,passados:0};
 for(const shift of config.turnos)for(let m=time(shift.inicio);m+config.duracao<=time(shift.fim);m+=config.duracao){
 const start=d+' '+hhmm(m)+':00',finish=d+' '+hhmm(m+config.duracao)+':00';
 if(new Date(start.replace(' ','T')+'-03:00')<=now){row.passados++;continue;}
 if(d>end){deferred++;continue;}
 slots.push({inicio:start,fim:finish,data:d});row.criar++;
 }
 days.push(row);
 }
 if(slots.length>20000)throw fail('O período gera mais de 20 mil horários. Reduza o período ou aumente a duração.');
 return{slots,days,deferred,end};
}
function evaluate(config,existing,now=new Date()){
 const result=candidates(config,now),byDay=new Map(result.days.map(d=>[d.data,d]));
 const sorted=[...existing].sort((a,b)=>a.inicio.localeCompare(b.inicio));let cursor=0;const available=[],conflicts=[];
 for(const slot of result.slots){
 while(cursor<sorted.length&&sorted[cursor].fim<=slot.inicio)cursor++;
 let overlap;
 for(let i=cursor;i<sorted.length&&sorted[i].inicio<slot.fim;i++)if(sorted[i].fim>slot.inicio){overlap=sorted[i];break;}
 if(overlap){byDay.get(slot.data).criar--;byDay.get(slot.data).conflitos++;conflicts.push({inicio:slot.inicio,fim:slot.fim,local:overlap.local||'Outro local',status:overlap.status});}
 else available.push(slot);
 }
 return{available,days:result.days,conflicts,deferred:result.deferred,end:result.end,created:available.length,expired:result.days.reduce((n,d)=>n+d.passados,0),excluded:result.days.filter(d=>d.motivo&&d.motivo!=='Fora da janela atual').length};
}
function fingerprint(config,result,location){return createHash('sha256').update(JSON.stringify({config,available:result.available,conflicts:result.conflicts,location})).digest('hex');}
module.exports={normalize,candidates,evaluate,fingerprint,date,add,today,validId};
