/* ==========================================================
   CalcPro – script.js
   Plain JavaScript, no libraries, no eval().

   Sections:
   1. Grab the HTML elements we need
   2. The calculator "state" (its memory)
   3. Helper functions (math + formatting)
   4. Calculator actions (digit, decimal, operator, parentheses, ...)
   5. Showing things on the screen (render)
   6. Click + keyboard events
   7. Theme toggle (dark / light)
   8. Navigation (mobile menu, active link, buttons)
   9. Scroll reveal animation
   ========================================================== */

'use strict';


/* ----------------------------------------------------------
   1. GRAB THE HTML ELEMENTS
   ---------------------------------------------------------- */
const calcBox      = document.getElementById('calc');
const keypad       = document.getElementById('keypad');
const resultEl     = document.getElementById('result');
const expressionEl = document.getElementById('expression');


/* ----------------------------------------------------------
   2. THE CALCULATOR STATE
   One object that remembers everything the calculator needs.
   ---------------------------------------------------------- */
const MAX_DIGITS = 15;                       // longest number the user can type
const MAX_TOKENS = 60;                       // longest expression (numbers + operators + parentheses)
const MAX_DEPTH  = 15;                       // deepest nesting of parentheses

const OPERATOR_SYMBOLS = {                   // how each operator looks on screen
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷'
};

// The expression is kept as a list of "tokens", for example (2 + 3) × 4 is:
//   [ '(', 2, '+', 3, ')', '*', 4 ]
// Numbers are stored as real numbers, everything else as text.
const state = {
  tokens: [],              // the expression typed so far (finished parts only)
  current: '0',            // the number on the big display (kept as text)
  typing: false,           // true while 'current' is a number the user is typing (not in tokens yet)
  overwrite: false,        // true when the next digit must start a NEW number
  history: '',             // small text line after "=", e.g. "125 × 4 ="
  error: ''                // error message (empty = no error)
};


/* ----------------------------------------------------------
   3. HELPER FUNCTIONS
   ---------------------------------------------------------- */

// Do the math for two numbers. Returns { value } or { error }.
function calculate(a, b, operator) {
  let value;

  if (operator === '+') value = a + b;
  if (operator === '-') value = a - b;
  if (operator === '*') value = a * b;
  if (operator === '/') {
    if (b === 0) return { error: 'Cannot divide by 0' };   // division by zero
    value = a / b;
  }

  if (!Number.isFinite(value)) return { error: 'Number too large' };
  return { value: value };
}

// Calculate a whole list of tokens using the REAL math rules:
//   1) parentheses first  2) × and ÷  3) + and −
// This is a tiny "recursive descent" parser: each function below handles one level.
// Returns { value } or { error }.
function evaluateTokens(tokens) {
  let position = 0;                                         // which token we are reading

  function fail(message) { throw new Error(message); }

  function apply(a, b, operator) {                          // reuse calculate() for the math
    const result = calculate(a, b, operator);
    if (result.error) fail(result.error);
    return result.value;
  }

  // Level 1: + and −  (lowest priority)
  function readSum() {
    let value = readProduct();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      value = apply(value, readProduct(), operator);
    }
    return value;
  }

  // Level 2: × and ÷  (higher priority)
  function readProduct() {
    let value = readFactor();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      value = apply(value, readFactor(), operator);
    }
    return value;
  }

  // Level 3: a number, or something inside ( ... )  (highest priority)
  function readFactor() {
    const token = tokens[position++];
    if (typeof token === 'number') return token;
    if (token === '(') {
      const value = readSum();                              // inside the parentheses start again from level 1
      if (tokens[position++] !== ')') fail('Missing )');
      return value;
    }
    return fail('Invalid expression');
  }

  try {
    const value = readSum();
    if (position !== tokens.length) fail('Invalid expression');   // something is left over
    return { value: value };
  } catch (error) {
    return { error: error.message };
  }
}

// Turn a number into clean text.
// toPrecision(12) fixes JavaScript's tiny errors (0.1 + 0.2 = 0.30000000000000004).
function numberToText(number) {
  let rounded = parseFloat(number.toPrecision(12));
  if (Object.is(rounded, -0)) rounded = 0;                  // never show "-0"

  const size = Math.abs(rounded);
  if (size !== 0 && (size >= 1e15 || size < 1e-9)) {        // huge / tiny numbers
    return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return String(rounded);
}

// Add commas to big numbers: "1234567.5" -> "1,234,567.5"
function formatForDisplay(text) {
  if (!/^-?\d+(\.\d*)?$/.test(text)) return text;           // leave "1e+21" alone
  const parts = text.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Count how many digits are in the current number (to respect MAX_DIGITS).
function countDigits(text) {
  return text.replace(/[^0-9]/g, '').length;
}


/* ----------------------------------------------------------
   4. CALCULATOR ACTIONS
   ---------------------------------------------------------- */

// Small helpers to look at the expression.
function lastToken()      { return state.tokens[state.tokens.length - 1]; }
function isOperator(t)    { return t === '+' || t === '-' || t === '*' || t === '/'; }
function isNumberToken(t) { return typeof t === 'number'; }

// How many "(" are still waiting for their ")".
function openParens() {
  let open = 0;
  state.tokens.forEach(function (token) {
    if (token === '(') open++;
    if (token === ')') open--;
  });
  return open;
}

// Go back to the starting state (used by AC).
function resetAll() {
  state.tokens = [];
  state.current = '0';
  state.typing = false;
  state.overwrite = false;
  state.history = '';
  state.error = '';
}

// Show an error and forget the unfinished calculation.
function showError(message, historyText) {
  resetAll();
  state.error = message;
  state.history = historyText || '';
}

// Move the number being typed into the expression (tokens).
// Returns false if the "number" is not valid (for example only a "-").
function commitNumber() {
  if (!state.typing) return true;
  const number = parseFloat(state.current);
  if (Number.isNaN(number)) return false;
  state.tokens.push(number);
  state.typing = false;
  state.overwrite = false;
  return true;
}

// A brand-new number is about to start.
function startNewNumber() {
  if (state.tokens.length === 0) state.history = '';        // a new calculation after "="
  if (lastToken() === ')') state.tokens.push('*');          // (2+3)4 means (2+3) × 4
  state.overwrite = false;
}

// A number key (0–9) was pressed.
function inputDigit(digit) {
  if (state.error) resetAll();                              // start fresh after an error

  // Still typing the same number: add the digit at the end.
  if (state.typing && !state.overwrite) {
    if (countDigits(state.current) >= MAX_DIGITS) return;   // too long, ignore
    if (state.current === '0')       state.current = digit;
    else if (state.current === '-0') state.current = '-' + digit;
    else                             state.current += digit;
    return;
  }

  // Otherwise a new number starts.
  if (state.tokens.length >= MAX_TOKENS) return;
  startNewNumber();
  state.current = digit;
  state.typing = true;
}

// The "." key was pressed.
function inputDecimal() {
  if (state.error) resetAll();

  if (state.typing && !state.overwrite) {
    if (state.current.includes('.')) return;                // only one dot allowed
    state.current += (state.current === '-' ? '0.' : '.');  // "-" then "." becomes "-0."
    return;
  }

  if (state.tokens.length >= MAX_TOKENS) return;
  startNewNumber();
  state.current = '0.';                                     // ".5" becomes "0.5"
  state.typing = true;
}

// An operator key (+ − × ÷) was pressed.
function inputOperator(operator) {
  if (state.error) return;
  if (state.tokens.length >= MAX_TOKENS) return;

  if (state.typing) {
    if (!commitNumber()) return;                            // a lone "-" can't be followed by an operator
  } else if (state.tokens.length === 0) {
    state.tokens.push(parseFloat(state.current));           // continue from the last result (or 0)
    state.history = '';
  } else {
    const last = lastToken();

    // Pressed two operators in a row (e.g. "5 + ×")? Just replace the operator.
    if (isOperator(last)) {
      state.tokens[state.tokens.length - 1] = operator;
      return;
    }
    // Right after "(" only a minus makes sense (a negative number, like "(-5 + 2)").
    if (last === '(') {
      if (operator === '-') {
        state.current = '-';
        state.typing = true;
        state.overwrite = false;
      }
      return;
    }
  }

  state.tokens.push(operator);
}

// The "(" key was pressed.
function inputParenOpen() {
  if (state.error) resetAll();
  if (state.tokens.length >= MAX_TOKENS - 1 || openParens() >= MAX_DEPTH) return;

  if (state.typing) {
    if (!commitNumber()) return;
    state.tokens.push('*');                                 // 2( means 2 × (
  } else {
    if (state.tokens.length === 0) state.history = '';      // a new calculation after "="
    if (lastToken() === ')') state.tokens.push('*');        // )( means ) × (
  }

  state.tokens.push('(');
  state.current = '0';
  state.overwrite = false;
}

// The ")" key was pressed.
function inputParenClose() {
  if (state.error) return;
  if (openParens() <= 0) return;                            // there is no "(" to close

  if (state.typing) {
    if (!commitNumber()) return;
  } else {
    const last = lastToken();
    if (last === undefined || isOperator(last) || last === '(') return;   // "()" and "(5+)" are invalid
  }

  state.tokens.push(')');

  // Show the value of the group we just closed on the big display.
  let depth = 0;
  let start = 0;
  for (let i = state.tokens.length - 1; i >= 0; i--) {
    if (state.tokens[i] === ')') depth++;
    if (state.tokens[i] === '(') {
      depth--;
      if (depth === 0) { start = i; break; }
    }
  }
  const group = evaluateTokens(state.tokens.slice(start));
  if (group.value !== undefined) state.current = numberToText(group.value);
}

// The "=" key was pressed.
function inputEquals() {
  if (state.error) return;
  if (state.tokens.length === 0) return;                    // nothing to calculate yet

  if (state.typing) {
    if (!commitNumber()) return;
  } else {
    const last = lastToken();
    if (isOperator(last) || last === '(') return;           // unfinished, like "5 +"
  }

  while (openParens() > 0) state.tokens.push(')');          // close any "(" the user forgot

  const historyText = buildExpressionText() + ' =';
  const result = evaluateTokens(state.tokens);

  if (result.error) {
    showError(result.error, historyText);
    return;
  }

  state.tokens = [];
  state.typing = false;
  state.overwrite = true;                                   // next digit starts a new number
  state.current = numberToText(result.value);
  state.history = historyText;
}

// The part of the expression that comes BEFORE the last "+" or "−" (used by %).
// Inside parentheses we only look back to the nearest unclosed "(".
function tokensBeforeLastOperator() {
  const tokens = state.tokens.slice(0, -1);
  let depth = 0;
  let start = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === ')') depth++;
    if (tokens[i] === '(') {
      if (depth === 0) { start = i + 1; break; }
      depth--;
    }
  }
  return tokens.slice(start);
}

// The "%" key was pressed.
// Rule (same as most phone calculators):
//   • 200 + 10 %  ->  10% OF 200  = 20   (for + and −)
//   • 200 × 10 %  ->  10 / 100    = 0.1  (for × and ÷)
//   • 50 %        ->  50 / 100    = 0.5  (no operator)
function inputPercent() {
  if (state.error) return;
  if (!state.typing && state.tokens.length > 0) return;     // needs a number first
  const number = parseFloat(state.current);
  if (Number.isNaN(number)) return;                         // only a "-" so far

  let value = number / 100;
  const last = lastToken();

  if (state.typing && (last === '+' || last === '-')) {
    const base = evaluateTokens(tokensBeforeLastOperator());
    if (base.value !== undefined) value = base.value * number / 100;
  }

  state.current = numberToText(value);
  state.typing = true;
  state.overwrite = true;                                   // typing a digit now starts a new number
}

// The "DEL" key: remove the last character (or the last operator / parenthesis).
function inputDelete() {
  if (state.error) { resetAll(); return; }

  // A number is being typed: remove its last digit.
  if (state.typing) {
    if (state.overwrite) return;                            // a % result can't be shortened
    state.current = state.current.slice(0, -1);
    if (state.current === '') {
      state.typing = false;
      state.current = '0';
    }
    return;
  }

  if (state.tokens.length === 0) return;                    // nothing to delete (e.g. after "=")

  state.tokens.pop();                                       // remove the last operator or parenthesis
  if (isNumberToken(lastToken())) {
    // A number is now at the end: go back to editing it (so "5 +" + DEL gives "5" again).
    state.current = numberToText(state.tokens.pop());
    state.typing = true;
  } else {
    state.current = '0';
  }
}

// Decide which function to run for a button / key.
function runAction(action, value) {
  if (action === 'digit')       inputDigit(value);
  if (action === 'decimal')     inputDecimal();
  if (action === 'operator')    inputOperator(value);
  if (action === 'paren-open')  inputParenOpen();
  if (action === 'paren-close') inputParenClose();
  if (action === 'equals')      inputEquals();
  if (action === 'percent')     inputPercent();
  if (action === 'delete')      inputDelete();
  if (action === 'clear')       resetAll();
  render();
}


/* ----------------------------------------------------------
   5. SHOW THINGS ON THE SCREEN
   ---------------------------------------------------------- */
// Build the small line of text, e.g. "(2 + 3) × 4".
function buildExpressionText() {
  const parts = state.tokens.map(function (token) {
    if (isNumberToken(token)) return formatForDisplay(numberToText(token));
    return OPERATOR_SYMBOLS[token] || token;                // "(" and ")" stay as they are
  });
  if (state.typing) parts.push(formatForDisplay(state.current));

  let text = '';
  parts.forEach(function (part, index) {
    const needsSpace = index > 0 && part !== ')' && parts[index - 1] !== '(';
    text += (needsSpace ? ' ' : '') + part;
  });
  return text;
}

function render() {
  // Small line on top (a very long expression shows only its end)
  let expression = state.tokens.length > 0 ? buildExpressionText() : state.history;
  if (expression.length > 26) expression = '…' + expression.slice(-25);
  expressionEl.textContent = expression;

  // Big number (or error message)
  const text = state.error ? state.error : formatForDisplay(state.current);
  resultEl.textContent = text;

  // Make long numbers smaller so they always fit
  resultEl.classList.toggle('is-error', Boolean(state.error));
  resultEl.classList.toggle('is-medium', !state.error && text.length > 9 && text.length <= 12);
  resultEl.classList.toggle('is-small', !state.error && text.length > 12);
}


/* ----------------------------------------------------------
   6. EVENTS: MOUSE / TOUCH + KEYBOARD
   ---------------------------------------------------------- */

// One listener for the whole keypad (event delegation).
keypad.addEventListener('click', function (event) {
  const button = event.target.closest('button');
  if (!button) return;
  runAction(button.dataset.action, button.dataset.value);
});

// Which computer key does which calculator action?
const KEY_MAP = {
  '+': { action: 'operator', value: '+' },
  '-': { action: 'operator', value: '-' },
  '*': { action: 'operator', value: '*' },
  'x': { action: 'operator', value: '*' },
  'X': { action: 'operator', value: '*' },
  '/': { action: 'operator', value: '/' },
  '.': { action: 'decimal' },
  ',': { action: 'decimal' },
  '(': { action: 'paren-open' },
  ')': { action: 'paren-close' },
  '%': { action: 'percent' },
  '=': { action: 'equals' },
  'Enter': { action: 'equals' },
  'Backspace': { action: 'delete' },
  'Escape': { action: 'clear' },
  'Delete': { action: 'clear' }
};

// Briefly light up the on-screen button that matches the key pressed.
function flashButton(action, value) {
  const selector = value
    ? '[data-action="' + action + '"][data-value="' + value + '"]'
    : '[data-action="' + action + '"]';
  const button = keypad.querySelector(selector);
  if (!button) return;
  button.classList.add('is-pressed');
  setTimeout(function () { button.classList.remove('is-pressed'); }, 130);
}

document.addEventListener('keydown', function (event) {
  // Ignore shortcuts like Ctrl+C or Cmd+R
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // Let Enter work normally on links / buttons outside the calculator
  if (event.key === 'Enter' && event.target.closest('a, button') && !event.target.closest('.calculator')) return;

  let mapped = null;
  if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
    mapped = { action: 'digit', value: event.key };
  } else if (KEY_MAP[event.key]) {
    mapped = KEY_MAP[event.key];
  }
  if (!mapped) return;

  event.preventDefault();                                   // stop the browser's own action
  runAction(mapped.action, mapped.value);
  flashButton(mapped.action, mapped.value);
});


/* ----------------------------------------------------------
   7. THEME TOGGLE (DARK / LIGHT)
   ---------------------------------------------------------- */
const themeToggle = document.getElementById('themeToggle');
const THEME_KEY = 'calcpro-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#060716' : '#eceffd');
}

// Read the saved theme (localStorage can fail in private mode, so we use try/catch)
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

themeToggle.addEventListener('click', function () {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  try { localStorage.setItem(THEME_KEY, newTheme); } catch (e) { /* ignore */ }
});


/* ----------------------------------------------------------
   8. NAVIGATION
   ---------------------------------------------------------- */
const menuToggle = document.getElementById('menuToggle');
const navLinks   = document.getElementById('navLinks');
const links      = navLinks.querySelectorAll('a[data-section]');

// Open / close the mobile menu
function setMenu(open) {
  navLinks.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

menuToggle.addEventListener('click', function () {
  setMenu(!navLinks.classList.contains('is-open'));
});

// Close the menu after choosing a link, or when pressing Esc / clicking outside
navLinks.addEventListener('click', function (event) {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('click', function (event) {
  if (!event.target.closest('.navbar')) setMenu(false);
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') setMenu(false);
});

// "Get Started" / "Start Calculating": scroll happens via the #calculator link,
// then we focus the calculator and give it a glowing pulse.
document.querySelectorAll('[data-focus-calculator]').forEach(function (button) {
  button.addEventListener('click', function () {
    setTimeout(function () {
      calcBox.focus({ preventScroll: true });
      calcBox.classList.remove('is-highlighted');
      void calcBox.offsetWidth;                             // restart the animation
      calcBox.classList.add('is-highlighted');
    }, 500);
  });
});

// Highlight the nav link of the section we are looking at
const sectionIds = ['home', 'calculator', 'features', 'about'];

function updateActiveLink() {
  let activeId = 'home';
  const line = window.innerHeight * 0.4;                    // an imaginary line on screen

  if (window.scrollY > 80) {
    sectionIds.forEach(function (id) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= line) activeId = id;
    });
  }
  // At the very bottom of the page, the last section is active
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) activeId = 'about';

  links.forEach(function (link) {
    link.classList.toggle('is-active', link.dataset.section === activeId);
  });
}

window.addEventListener('scroll', updateActiveLink, { passive: true });
window.addEventListener('resize', updateActiveLink);


/* ----------------------------------------------------------
   9. SCROLL REVEAL ANIMATION
   ---------------------------------------------------------- */
const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js');             // CSS hides .reveal only when JS works

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);                   // animate only once
      }
    });
  }, { threshold: 0.15 });

  revealItems.forEach(function (item) { observer.observe(item); });
}


/* ----------------------------------------------------------
   START
   ---------------------------------------------------------- */
render();
updateActiveLink();
