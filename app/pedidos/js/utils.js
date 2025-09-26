// Utilitários gerais
export function up(str) {
  if (!str) return '';
  return str.toString().toUpperCase();
}

export function digitsOnly(str) {
  if (!str) return '';
  return str.toString().replace(/\D/g, '');
}

// Normalização de nomes (função que estava faltando)
export function normNome(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
    .trim();
}

// Capitalização de nomes
export function capitalize(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Formatação de moeda
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  
  const num = typeof value === 'string' ? parseMoney(value) : parseFloat(value);
  if (isNaN(num)) return 'R$ 0,00';
  
  return 'R$ ' + num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function parseMoney(str) {
  if (!str) return 0;
  
  const cleanStr = str.toString()
    .replace(/[^\d,-]/g, '')
    .replace(',', '.');
  
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

// Formatação de peso/quilograma
export function formatKg(value) {
  if (value === null || value === undefined || value === '') return '0,000';
  
  const num = typeof value === 'string' ? parseKg(value) : parseFloat(value);
  if (isNaN(num)) return '0,000';
  
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

export function parseKg(str) {
  if (!str) return 0;
  
  const cleanStr = str.toString()
    .replace(/[^\d,-]/g, '')
    .replace(',', '.');
  
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
}

// Máscaras de input
export function maskMoney(input) {
  if (!input) return;
  
  let value = digitsOnly(input.value);
  if (!value) {
    input.value = '';
    return;
  }
  
  // Converte centavos para reais
  const reais = parseInt(value) / 100;
  input.value = formatMoney(reais).replace('R$ ', '');
}

export function maskKg(input) {
  if (!input) return;
  
  let value = input.value.replace(/[^\d,]/g, '');
  
  // Se tem vírgula, mantém apenas a primeira
  const parts = value.split(',');
  if (parts.length > 2) {
    value = parts[0] + ',' + parts.slice(1).join('');
  }
  
  // Limita casas decimais
  if (parts[1] && parts[1].length > 3) {
    value = parts[0] + ',' + parts[1].substring(0, 3);
  }
  
  input.value = value;
}

export function maskCNPJ(input) {
  if (!input) return;
  
  let value = digitsOnly(input.value);
  
  // Aplica máscara: 00.000.000/0000-00
  value = value.replace(/^(\d{2})(\d)/, '$1.$2');
  value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
  value = value.replace(/(\d{4})(\d)/, '$1-$2');
  
  input.value = value;
}

export function maskCEP(input) {
  if (!input) return;
  
  let value = digitsOnly(input.value);
  
  // Aplica máscara: 00000-000
  if (value.length > 5) {
    value = value.replace(/^(\d{5})(\d)/, '$1-$2');
  }
  
  input.value = value;
}

export function maskTelefone(input) {
  if (!input) return;
  
  let value = digitsOnly(input.value);
  
  // Aplica máscara: (00) 00000-0000 ou (00) 0000-0000
  if (value.length <= 10) {
    // Telefone fixo
    value = value.replace(/^(\d{2})(\d)/, '($1) $2');
    value = value.replace(/(\d{4})(\d)/, '$1-$2');
  } else {
    // Celular
    value = value.replace(/^(\d{2})(\d)/, '($1) $2');
    value = value.replace(/(\d{5})(\d)/, '$1-$2');
  }
  
  input.value = value;
}

// Validações
export function validarCNPJ(cnpj) {
  const digits = digitsOnly(cnpj);
  
  if (digits.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Validação dos dígitos verificadores
  let soma = 0;
  let peso = 2;
  
  // Primeiro dígito
  for (let i = 11; i >= 0; i--) {
    soma += parseInt(digits[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  
  const resto1 = soma % 11;
  const dv1 = resto1 < 2 ? 0 : 11 - resto1;
  
  if (parseInt(digits[12]) !== dv1) return false;
  
  // Segundo dígito
  soma = 0;
  peso = 2;
  
  for (let i = 12; i >= 0; i--) {
    soma += parseInt(digits[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  
  const resto2 = soma % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;
  
  return parseInt(digits[13]) === dv2;
}

export function validarCEP(cep) {
  const digits = digitsOnly(cep);
  return digits.length === 8;
}

export function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Utilitário para debounce
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utilitário para gerar IDs únicos
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Utilitário para copiar texto
export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback para navegadores mais antigos
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      textArea.remove();
      return Promise.resolve();
    } catch (err) {
      textArea.remove();
      return Promise.reject(err);
    }
  }
}

// Funções de busca e filtro
export function buscarTexto(texto, termo) {
  if (!texto || !termo) return false;
  
  const textoNorm = normNome(texto);
  const termoNorm = normNome(termo);
  
  return textoNorm.includes(termoNorm);
}

export function filtrarArray(array, termo, campos = []) {
  if (!termo || !Array.isArray(array)) return array;
  
  return array.filter(item => {
    if (campos.length === 0) {
      // Se não especificou campos, busca em todas as propriedades string
      return Object.values(item).some(valor => 
        typeof valor === 'string' && buscarTexto(valor, termo)
      );
    } else {
      // Busca apenas nos campos especificados
      return campos.some(campo => 
        item[campo] && buscarTexto(String(item[campo]), termo)
      );
    }
  });
}

// Utilitários de data
export function formatarData(data) {
  if (!data) return '';
  
  if (typeof data === 'string') {
    data = new Date(data);
  }
  
  if (!(data instanceof Date) || isNaN(data)) return '';
  
  return data.toLocaleDateString('pt-BR');
}

export function formatarDataHora(data) {
  if (!data) return '';
  
  if (typeof data === 'string') {
    data = new Date(data);
  }
  
  if (!(data instanceof Date) || isNaN(data)) return '';
  
  return data.toLocaleString('pt-BR');
}

// Utilitários de localStorage
export function salvarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (error) {
    console.error('Erro ao salvar no localStorage:', error);
    return false;
  }
}

export function carregarLocal(chave, padrao = null) {
  try {
    const valor = localStorage.getItem(chave);
    return valor ? JSON.parse(valor) : padrao;
  } catch (error) {
    console.error('Erro ao carregar do localStorage:', error);
    return padrao;
  }
}

export function removerLocal(chave) {
  try {
    localStorage.removeItem(chave);
    return true;
  } catch (error) {
    console.error('Erro ao remover do localStorage:', error);
    return false;
  }
}

// Utilitários de URL
export function obterParametroURL(nome) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(nome);
}

export function definirParametroURL(nome, valor) {
  const url = new URL(window.location);
  url.searchParams.set(nome, valor);
  window.history.pushState({}, '', url);
}

// Utilitários de string
export function truncarTexto(texto, limite, sufixo = '...') {
  if (!texto || texto.length <= limite) return texto;
  return texto.substring(0, limite) + sufixo;
}

export function slugify(texto) {
  return normNome(texto).replace(/\s+/g, '-');
}

console.log('Utils carregado com todas as funções');
