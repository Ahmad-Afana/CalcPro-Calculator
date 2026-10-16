/* ==========================================================
   CalcPro – script.js
   Plain JavaScript, no libraries, no eval().

   Sections:
   1. Grab the HTML elements we need
   2. The calculator "state" (its memory)
   3. Helper functions (math + formatting)
   4. Calculator actions (digit, decimal, operator, ...)
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

const OPERATOR_SYMBOLS = {                   // how each operator looks on screen
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷'
};

const state = {
  current: '0',            // the number on the big display (kept as text)
  previous: null,          // the first number, saved when an operator is pressed
  operator: null,          // '+', '-', '*', '/' or null
  waitingForSecond: false, // true right after pressing an operator
  overwrite: false,        // true when the next digit must start a NEW number
  history: '',             // small text line, e.g. "125 × 4 ="
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

// Go back to the starting state (used by AC).
function resetAll() {
  state.current = '0';
  state.previous = null;
  state.operator = null;
  state.waitingForSecond = false;
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

// A number key (0–9) was pressed.
function inputDigit(digit) {
  if (state.error) resetAll();                              // start fresh after an error

  if (state.waitingForSecond || state.overwrite) {
    if (!state.operator) state.history = '';                // new number after "="
    state.current = digit;                                  // begin a new number
    state.waitingForSecond = false;
    state.overwrite = false;
    return;
  }

  if (countDigits(state.current) >= MAX_DIGITS) return;     // too long, ignore
  state.current = state.current === '0' ? digit : state.current + digit;
}

// The "." key was pressed.
function inputDecimal() {
  if (state.error) resetAll();

  if (state.waitingForSecond || state.overwrite) {
    if (!state.operator) state.history = '';
    state.current = '0.';                                   // ".5" becomes "0.5"
    state.waitingForSecond = false;
    state.overwrite = false;
    return;
  }

  if (state.current.includes('.')) return;                  // only one dot allowed
  state.current += '.';
}

// An operator key (+ − × ÷) was pressed.
function inputOperator(operator) {
  if (state.error) return;

  // Pressed two operators in a row (e.g. "5 + ×")? Just replace the operator.
  if (state.operator && state.waitingForSecond) {
    state.operator = operator;
    return;
  }

  // Already have "a + b" and user pressed another operator? Finish that first.
  if (state.operator) {
    const result = calculate(state.previous, parseFloat(state.current), state.operator);
    if (result.error) {
      showError(result.error, numberToText(state.previous) + ' ' + OPERATOR_SYMBOLS[state.operator] + ' ' + state.current + ' =');
      return;
    }
    state.previous = result.value;
    state.current = numberToText(result.value);
  } else {
    state.previous = parseFloat(state.current);
  }

  state.operator = operator;
  state.waitingForSecond = true;
  state.overwrite = false;
  state.history = '';
}

// The "=" key was pressed.
function inputEquals() {
  if (state.error) return;
  if (!state.operator || state.waitingForSecond) return;    // nothing to calculate yet

  const a = state.previous;
  const b = parseFloat(state.current);
  const symbol = OPERATOR_SYMBOLS[state.operator];
  const result = calculate(a, b, state.operator);
  const historyText = formatForDisplay(numberToText(a)) + ' ' + symbol + ' ' + formatForDisplay(state.current) + ' =';

  if (result.error) {
    showError(result.error, historyText);
    return;
  }

  state.history = historyText;
  state.current = numberToText(result.value);
  state.previous = null;
  state.operator = null;
  state.overwrite = true;                                   // next digit starts a new number
}

// The "%" key was pressed.
// Rule (same as most phone calculators):
//   • 200 + 10 %  ->  10% OF 200  = 20   (for + and −)
//   • 200 × 10 %  ->  10 / 100    = 0.1  (for × and ÷)
//   • 50 %        ->  50 / 100    = 0.5  (no operator)
function inputPercent() {
  if (state.error) return;
  if (state.waitingForSecond) return;                       // needs a number first

  const number = parseFloat(state.current);
  let value;

  if (state.operator === '+' || state.operator === '-') {
    value = state.previous * number / 100;
  } else {
    value = number / 100;
  }

  state.current = numberToText(value);
  state.overwrite = true;                                   // typing a digit now starts a new number
}

// The "DEL" key: remove the last character.
function inputDelete() {
  if (state.error) { resetAll(); return; }
  if (state.waitingForSecond || state.overwrite) return;    // nothing typed to delete

  state.current = state.current.slice(0, -1);
  if (state.current === '' || state.current === '-') state.current = '0';
}

// Decide which function to run for a button / key.
function runAction(action, value) {
  if (action === 'digit')    inputDigit(value);
  if (action === 'decimal')  inputDecimal();
  if (action === 'operator') inputOperator(value);
  if (action === 'equals')   inputEquals();
  if (action === 'percent')  inputPercent();
  if (action === 'delete')   inputDelete();
  if (action === 'clear')    resetAll();
  render();
}


/* ----------------------------------------------------------
   5. SHOW THINGS ON THE SCREEN
   ---------------------------------------------------------- */
function render() {
  // Small line on top
  if (state.operator) {
    expressionEl.textContent = formatForDisplay(numberToText(state.previous)) + ' ' + OPERATOR_SYMBOLS[state.operator];
  } else {
    expressionEl.textContent = state.history;
  }

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
