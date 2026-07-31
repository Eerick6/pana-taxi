export interface EcuadorianBank {
  name: string;
  color: string;
  abbr: string;
  logoUrl: string;
}

export const ECUADORIAN_BANKS: EcuadorianBank[] = [
  { name: 'Banco Pichincha',           color: '#E30613', abbr: 'BP',  logoUrl: 'https://www.google.com/s2/favicons?domain=pichincha.com&sz=128' },
  { name: 'Banco del Pacífico',         color: '#00467F', abbr: 'PAC', logoUrl: 'https://www.google.com/s2/favicons?domain=bancopacifico.com&sz=128' },
  { name: 'Produbanco',                color: '#00A3E0', abbr: 'PRO', logoUrl: 'https://www.google.com/s2/favicons?domain=produbanco.com.ec&sz=128' },
  { name: 'Banco Guayaquil',           color: '#007B40', abbr: 'BG',  logoUrl: 'https://www.google.com/s2/favicons?domain=bancoguayaquil.com&sz=128' },
  { name: 'Banco Internacional',       color: '#E8000D', abbr: 'BI',  logoUrl: 'https://www.google.com/s2/favicons?domain=bancointernacional.com.ec&sz=128' },
  { name: 'Banco Bolivariano',         color: '#003087', abbr: 'BOL', logoUrl: 'https://www.google.com/s2/favicons?domain=bolivariano.com&sz=128' },
  { name: 'Banco de Loja',             color: '#C8A900', abbr: 'BL',  logoUrl: 'https://www.google.com/s2/favicons?domain=bancodeloja.fin.ec&sz=128' },
  { name: 'Banco de Machala',          color: '#1A6B3C', abbr: 'BM',  logoUrl: 'https://www.google.com/s2/favicons?domain=bancomachala.com&sz=128' },
  { name: 'BanEcuador',                color: '#006633', abbr: 'BAN', logoUrl: 'https://www.google.com/s2/favicons?domain=banecuador.fin.ec&sz=128' },
  { name: 'Mutualista Pichincha',      color: '#8B0000', abbr: 'MP',  logoUrl: 'https://www.google.com/s2/favicons?domain=mutualistapichincha.com&sz=128' },
  { name: 'Cooperativa JEP',           color: '#1B3D7B', abbr: 'JEP', logoUrl: 'https://www.google.com/s2/favicons?domain=coopjep.fin.ec&sz=128' },
  { name: 'Cooperativa Jardín Azuayo', color: '#006D77', abbr: 'JA',  logoUrl: 'https://www.google.com/s2/favicons?domain=jardinazuayo.fin.ec&sz=128' },
  { name: 'Diners Club',               color: '#004A9A', abbr: 'DC',  logoUrl: 'https://www.google.com/s2/favicons?domain=dinersclub.com.ec&sz=128' },
  { name: 'Banco del Austro',          color: '#7B1FA2', abbr: 'AUS', logoUrl: 'https://www.google.com/s2/favicons?domain=bancodelaustro.com&sz=128' },
  { name: 'Otro',                      color: '#6B7280', abbr: '...',  logoUrl: '' },
];

export function getBankInfo(bankName: string): EcuadorianBank {
  return (
    ECUADORIAN_BANKS.find((b) => b.name === bankName) ?? {
      name: bankName,
      color: '#6B7280',
      abbr: bankName.slice(0, 3).toUpperCase(),
      logoUrl: '',
    }
  );
}
