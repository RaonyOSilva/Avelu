const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
module.exports = function cityFilter(query) {
  const city = query.cidade ?? '';
  const state = query.uf ?? '';
  if (typeof city !== 'string' || typeof state !== 'string' || city.length > 100 ||
      (Boolean(city.trim()) !== Boolean(state.trim())) || (state.trim() && !states.has(state.trim().toUpperCase()))) return null;
  return { city: city.trim(), state: state.trim().toUpperCase() };
};
