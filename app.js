const menuButton=document.querySelector('.menu');
const mobileNav=document.querySelector('#mobile-nav');
menuButton?.addEventListener('click',()=>{const open=mobileNav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');});
mobileNav?.addEventListener('click',event=>{if(event.target.closest('a')){mobileNav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');}});
const searchForm=document.querySelector('.search');
const professionalsList=document.querySelector('#professionals-list');

function formatNextDate(value){
  if(!value)return 'Consulte os horários';
  return new Intl.DateTimeFormat('pt-BR',{weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}

function professionalCard(professional){
  const article=document.createElement('article');
  article.className='doc';
  const image=document.createElement('img');
  image.src=professional.avatar_url||'assets/icon.svg';
  image.alt=professional.name;
  image.loading='lazy';
  const title=document.createElement('h4');
  title.textContent=professional.name;
  const specialty=document.createElement('small');
  specialty.textContent=professional.specialty;
  const rating=document.createElement('div');
  rating.className='r';
  rating.textContent=`★ ${professional.rating} (${professional.review_count} avaliações)`;
  const distance=document.createElement('div');
  distance.className='d';
  distance.textContent=professional.distance_km===null?'Localização não informada':`⌖ ${Number(professional.distance_km).toLocaleString('pt-BR')} km de você`;
  const schedule=document.createElement('div');
  schedule.className='s';
  schedule.textContent=formatNextDate(professional.next_available_at);
  article.append(image,title,specialty,rating,distance,schedule);
  return article;
}

async function loadProfessionals(term=''){
  try{
    const response=await fetch(`/api/professionals?q=${encodeURIComponent(term)}`);
    if(!response.ok)throw new Error('API indisponível');
    const professionals=await response.json();
    professionalsList.replaceChildren(...professionals.map(professionalCard));
    if(!professionals.length)professionalsList.textContent='Nenhum profissional encontrado.';
  }catch(error){
    console.info('Exibindo profissionais estáticos:',error.message);
  }
}

searchForm?.addEventListener('submit',event=>{
  event.preventDefault();
  loadProfessionals(new FormData(searchForm).get('q')?.trim()||'');
});

if(professionalsList)loadProfessionals();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));}
