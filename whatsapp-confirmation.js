function confirmation(slot){
 if(slot.agendamento_status!=='confirmado')return null;
 let phone=String(slot.telefone||'').replace(/\D/g,'');
 if(phone.length===10||phone.length===11)phone='55'+phone;
 if(!/^55[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(phone))return {error:'Telefone ausente ou inválido. Confira o cadastro do paciente.'};
 if(!slot.paciente||!slot.profissional||!slot.local_endereco)return {error:'Confira o nome do paciente, profissional e endereço antes de enviar.'};
 const date=new Date(slot.inicio_em);if(!Number.isFinite(+date))return {error:'Data do atendimento inválida.'};
 const day=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
 const hour=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(date);
 const message=`Olá ${slot.paciente}! Informamos que seu atendimento para o dia ${day}, no horário ${hour}, com o profissional ${slot.profissional}, no endereço ${slot.local_endereco}, foi confirmado. Aguardamos você, e em caso de dúvidas, cancelamento ou necessidade de remarcação, gentileza nos informar antes da data prevista.`;
 return {url:'https://wa.me/'+phone+'?text='+encodeURIComponent(message)};
}
module.exports={confirmation};
