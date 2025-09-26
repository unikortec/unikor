// Utilitários gerais
export function up(str) {
  if (!str) return '';
  return str.toString().toUpperCase();
}

export function digitsOnly(str) {
  if (!str) return '';
  return str.toString().replace(/\D/g, '');
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

console.log('Utils carregado com todas as funções');
