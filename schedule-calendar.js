
const {date,add}=require('./schedule-engine');
const nationalSource='https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm';
const localSource='https://invista.valadares.mg.gov.br/abrir_arquivo.aspx?arquivo=%7B8DADEA0A-7DAE-CECE-EBAA-DEEC40A62ECE%7D.pdf&cdLocal=12';
function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
function calendar(place,start,end){
 date(start);date(end);if(end<start||Number(end.slice(0,4))-Number(start.slice(0,4))>1)throw Object.assign(Error('Período de calendário inválido.'),{status:400});
 const entries=[],warnings=[];
 const gv=place.estado==='MG'&&place.cidade.trim().toLocaleLowerCase('pt-BR')==='governador valadares';
 const fixed=[['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']];
 for(let year=Number(start.slice(0,4));year<=Number(end.slice(0,4));year++){
 const push=(data,nome,tipo,excluir=true,source=nationalSource)=>entries.push({data,nome,tipo,excluir,fonte:source});
 for(const [day,name]of fixed)push(year+'-'+day,name,'nacional',true,day==='11-20'?'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm':day==='10-12'?'https://www.planalto.gov.br/ccivil_03/leis/l6802.htm':nationalSource);
 const sunday=easter(year);push(add(sunday,-2),'Sexta-feira da Paixão — revisar calendário local','religioso',true,'https://www.planalto.gov.br/ccivil_03/leis/l9093.htm');
 push(add(sunday,-48),'Carnaval — segunda-feira','facultativo',false,'');push(add(sunday,-47),'Carnaval — terça-feira','facultativo',false,'');push(add(sunday,60),'Corpus Christi — revisar calendário local',gv&&year===2026?'municipal':'facultativo',gv&&year===2026,gv&&year===2026?localSource:'');
 if(gv&&year===2026){push('2026-01-30','Aniversário de Governador Valadares','municipal',true,localSource);push('2026-06-13','Padroeiro da cidade','municipal',true,localSource);}
 else warnings.push('Confira e acrescente os feriados estaduais e municipais de '+place.cidade+'/'+place.estado+' para '+year+'. Não há calendário regional validado automaticamente para este local/ano.');
 }
 warnings.push('Pontos facultativos são opcionais. Confira regras locais e ajustes de expediente antes de confirmar. As escolhas ficam salvas nesta programação.');
 return{cidade:place.cidade,estado:place.estado,entries:entries.filter(e=>e.data>=start&&e.data<=end).sort((a,b)=>a.data.localeCompare(b.data)),warnings};
}
module.exports={calendar,easter};
