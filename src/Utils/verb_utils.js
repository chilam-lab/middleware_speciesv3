var verb_utils = {}
const initOptions = {
    error(error, e) {
        if (e.cn) {
            console.log('CN:', e.cn);
            console.log('EVENT:', error.message || error);
        }
    }
};
var debug = require('debug')('verbs:verb_utils')
var moment = require('moment')
var config = require('../../config')
var crossfilter = require('crossfilter')
var d3 = require('d3')

// var pgp = require('pg-promise')(initOptions)
// verb_utils.pool = pgp(config.db);


verb_utils.getParam = function (req, name, defaultValue) {
  var body = req.body || {}
  var query = req.query || {}

  if (body[name] != null) return body[name]
  if (query[name] != null) return query[name]

  return defaultValue
}


verb_utils.makeid = function (length) {
    
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    
    return result;

}


// Epsilon robusto: residual estandarizado (Pearson) con suavizado y compresión opcional
//   a = nij, b = ni - nij, c = nj - nij, d = n - ni - c
// Opciones:
//   k:     suavizado Haldane (default 0.5)
//   pMin:  piso para pi (evita varianza ~0). Default dinámico: min(0.01, 0.5/√N_)
//   mode:  'tanh' para comprimir suave, 'cap' para recortar duro, undefined = sin compresión
//   alpha: escala de compresión tanh (default 3)  →  y = alpha * tanh(x/alpha)
//   capAbs: valor absoluto máximo si mode='cap' (ej. 6)
//
// Uso típico (sin compresión):
//   const eps = verb_utils.getEpsilon(nj, nij, ni, n);
//
// Con compresión tanh:
//   const eps = verb_utils.getEpsilon(nj, nij, ni, n, { mode: 'tanh', alpha: 3 });
//
// Con recorte duro:
//   const eps = verb_utils.getEpsilon(nj, nij, ni, n, { mode: 'cap', capAbs: 6 });

verb_utils.getEpsilon = function(nj, nij, ni, n, opts) {
  // Validaciones básicas
  if (!Number.isFinite(n)  || n  <= 0) return 0;
  if (!Number.isFinite(ni) || !Number.isFinite(nj) || !Number.isFinite(nij)) return 0;
  if (ni < 0 || nj < 0 || nij < 0) return 0;
  if (ni > n || nj > n || nij > ni || nij > nj) return 0;

  // Tabla 2x2
  const a = nij;
  const b = ni - nij;
  const c = nj - nij;
  const d = n - ni - c;
  if (b < 0 || c < 0 || d < 0) return 0;

  // Suavizado Haldane–Anscombe
  const k = (opts && Number.isFinite(opts.k)) ? opts.k : 0.5;
  const a_ = a + k, b_ = b + k, c_ = c + k, d_ = d + k;

  // Totales suavizados
  const N_  = a_ + b_ + c_ + d_;        // n + 4k
  const n1_ = a_ + b_;                  // total fila target=1
  const m1_ = a_ + c_;                  // total columna covar=1 (≈ nj + 2k)

  // Probabilidad base del target (independencia) con piso para evitar varianza ~0
  let pi = n1_ / N_;

  // pMin dinámico: protege cuando ni≈0 o ni≈n (pi≈0 o 1)
  const pMinDefault = Math.min(0.01, 0.5 / Math.max(1, Math.sqrt(N_)));
  const pMin = (opts && Number.isFinite(opts.pMin)) ? opts.pMin : pMinDefault;
  pi = Math.min(1 - pMin, Math.max(pMin, pi));

  // Esperado y desviación estándar bajo independencia
  const expected = m1_ * pi;
  const var_ = m1_ * pi * (1 - pi);
  const sd = Math.sqrt(Math.max(var_, 1e-12)); // piso numérico

  // Residual estandarizado (puede ser ±)
  let epsilon = (a_ - expected) / sd;

  // ----- Compresión opcional -----
  if (opts && opts.mode === 'tanh') {
    const alpha = (Number.isFinite(opts.alpha) ? opts.alpha : 3); // escala de saturación
    epsilon = alpha * Math.tanh(epsilon / alpha);
  } else if (opts && opts.mode === 'cap') {
    const capAbs = (Number.isFinite(opts.capAbs) ? Math.abs(opts.capAbs) : 6);
    if (epsilon >  capAbs) epsilon =  capAbs;
    if (epsilon < -capAbs) epsilon = -capAbs;
  }

  return epsilon;
};


// score con posibilidad de valores negativos usando log-ratio.
// modos:
//  - mode: 'ratio'   -> tu fórmula original (>0)
//  - mode: 'log'     -> ln(ratio) (negativo/positivo, 0 = independencia)  ✅ recomendado
//  - mode: 'bounded' -> tanh( 0.5 * ln(ratio) ) en [-1, 1] (simétrico y acotado)
//
// params:
//  - alpha: suavizado (default 0.5)
//
// Ejemplos de uso:
//  verb_utils.getScore(nj, nij, ni, n)                          // ratio (como antes)
//  verb_utils.getScore(nj, nij, ni, n, { mode:'log' })           // NEGATIVOS posibles
//  verb_utils.getScore(nj, nij, ni, n, { mode:'bounded' })       // en [-1,1]

// verb_utils.getScore = function (nj, nij, ni, n) {
//   // return verb_utils.getScoreRR(nj, nij, ni, n, { k: 0.5, gamma: 0.5 });
//   return verb_utils.getScoreBase(nj, nij, ni, n, { mode: "log" });
// };


verb_utils.getScore = function(nj, nij, ni, n, opts) {
  const alpha = (opts && Number.isFinite(opts.alpha)) ? opts.alpha : 0.5;
  const mode  = (opts && typeof opts.mode === 'string') ? opts.mode : 'ratio';

  // Validaciones básicas de conteos
  if (!Number.isFinite(n)  || n  <= 0) return 0;
  if (!Number.isFinite(ni) || !Number.isFinite(nj) || !Number.isFinite(nij)) return 0;
  if (ni < 0 || nj < 0 || nij < 0) return 0;
  if (ni > n || nj > n || nij > ni || nij > nj) return 0;

  // Tu estimador suavizado (mismo α) para P(I=1|C=1) y P(I=1|C=0)
  const p1 = (nij + alpha/2) / (ni + alpha);
  const p0 = ((nj - nij) + alpha/2) / ((n - ni) + alpha);

  // Razón (siempre positiva)
  const ratio = p1 / p0;

  if (mode === 'ratio') {
    return ratio; // como tu función original (siempre > 0)
  }

  // Log-ratio: negativo si p1 < p0, positivo si p1 > p0, 0 si p1 ~ p0
  const logRatio = Math.log(ratio);

  if (mode === 'log') {
    return logRatio;
  }

  if (mode === 'bounded') {
    // Mapea simétricamente a [-1,1]
    // tanh(0.5*logRatio) = (ratio - 1) / (ratio + 1)
    return Math.tanh(0.5 * logRatio);
  }

  // fallback
  return ratio;
};


// verb_utils.getEpsilon = function(nj, nij, ni, n) {
//   const unoSobreN = 1 / n;

//   // Numerador
//   const parte1 = (nij + unoSobreN / 2) / (nj + unoSobreN);
//   const parte2 = (ni + unoSobreN) / (n + 2 * unoSobreN);
//   const numerador = nj * (parte1 - parte2);

//   // Denominador
//   const pi = (ni + unoSobreN) / (n + 2 * unoSobreN);
//   const denominador = Math.sqrt(nj * pi * (1 - pi));

//   // Epsilon
//   const epsilon = numerador / denominador;

//   return epsilon;
// }


// ============================
// Opción A: RR^gamma (DEFAULT)
// ============================
// - Basada en riesgo relativo suavizado (Haldane k=0.5).
// - Comprime extremos elevando a gamma (0<gamma<=1). Ej: gamma=0.5 (raíz).
// - Siempre positivo. Puedes añadir un "cap" (techo) si quieres.
//
// Uso: const s = verb_utils.getScoreRR(nj, nij, ni, n, { k:0.5, gamma:0.5, cap:50 });


verb_utils.getScoreRR = function (nj, nij, ni, n, opts) {
  // Validaciones básicas
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(ni) || !Number.isFinite(nj) || !Number.isFinite(nij)) return 0;
  if (ni < 0 || nj < 0 || nij < 0) return 0;
  if (ni > n || nj > n || nij > ni || nij > nj) return 0;

  // Tabla 2x2
  const a = nij;
  const b = ni - nij;
  const c = nj - nij;
  const d = n - ni - c; // = n - ni - (nj - nij)
  if (b < 0 || c < 0 || d < 0) return 0;

  // Suavizado Haldane–Anscombe
  const k = (opts && Number.isFinite(opts.k)) ? opts.k : 0.5;
  const a_ = a + k, b_ = b + k, c_ = c + k, d_ = d + k;

  // Prob(covar=1 | target=1) vs Prob(covar=1 | target=0)
  const p1 = a_ / (a_ + b_);
  const p0 = c_ / (c_ + d_);

  // Riesgo relativo
  let RR = p1 / p0;

  // Compresión con exponente gamma (0<gamma<=1). Recomendado: 0.5
  const gamma = (opts && Number.isFinite(opts.gamma)) ? opts.gamma : 0.5;
  let score = Math.pow(RR, gamma);

  // Cap (opcional)
  if (opts && Number.isFinite(opts.cap)) {
    score = Math.min(score, opts.cap);
  }

  // Asegurar no-negativo
  if (!(score > 0)) return 0;
  return score;
};


// =============================================
// Opción B: softplus(logOR) - ln(2) (Siempre +)
// =============================================
// - Basada en log-odds ratio con suavizado Haldane (k=0.5).
// - Se mapea con softplus para mantenerlo positivo y evitar explosiones.
// - Crece de forma suave (≈ lineal para valores grandes).
//
// Uso: const s = verb_utils.getScoreSoftplus(nj, nij, ni, n, { k:0.5 });

verb_utils.getScoreSoftplus = function (nj, nij, ni, n, opts) {
  // Validaciones básicas
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(ni) || !Number.isFinite(nj) || !Number.isFinite(nij)) return 0;
  if (ni < 0 || nj < 0 || nij < 0) return 0;
  if (ni > n || nj > n || nij > ni || nij > nj) return 0;

  // Tabla 2x2
  const a = nij;
  const b = ni - nij;
  const c = nj - nij;
  const d = n - ni - c;
  if (b < 0 || c < 0 || d < 0) return 0;

  // Suavizado Haldane–Anscombe
  const k = (opts && Number.isFinite(opts.k)) ? opts.k : 0.5;
  const a_ = a + k, b_ = b + k, c_ = c + k, d_ = d + k;

  // log-odds ratio
  const logOR = Math.log((a_ * d_) / (b_ * c_));

  // softplus(x) = ln(1 + e^x). Restamos ln(2) para que ≈0 cuando logOR≈0
  // Nota: Math.log1p y Math.expm1 están en la mayoría de entornos modernos.
  const softplus = Math.log1p(Math.exp(logOR));
  let score = softplus - Math.LN2;

  // Cap (opcional)
  if (opts && Number.isFinite(opts.cap)) {
    score = Math.min(score, opts.cap);
  }

  return (score > 0) ? score : 0;
};


// verb_utils.getScore = function (nj, nij, ni, n) {
//   const unoSobreN = 1 / n;

//   const numerador = (nij + unoSobreN / 2) / (ni + unoSobreN);
//   const denominador = ((nj - nij) + unoSobreN / 2) / ((n - ni) + unoSobreN);

//   const score = numerador / denominador;

//   return score;
// }


verb_utils.compare = function(a,b) {
  if (a.key < b.key)
    return -1;
  if (a.key > b.key)
    return 1;
  return 0;
}


module.exports = verb_utils
