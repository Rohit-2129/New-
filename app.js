/* ════════════════════════════════════════════════════════════
   DOLCE · dark dessert ordering UI — interactions
   1) staggered snap-scroll menu w/ name+ingredient fade-in
   2) tap-to-add: plate flies (scale+rotate) into the cart icon
   3) cart with live totals, steppers and payment flow
   ════════════════════════════════════════════════════════════ */
'use strict';

const ITEMS = {
  'ice-cream': { name:'Ice Cream', price:4.90, ing:['fresh-churned cream, vanilla bean','strawberry ribbons & pistachio','served in a chilled stone bowl'] },
  pancakes:    { name:'Banana Pancakes', price:6.50, ing:['buttermilk stack, caramel banana','toasted pecans, cinnamon butter','drizzled with wildflower honey'] },
  cake:        { name:'Chocolate Cake', price:5.20, ing:['70% dark chocolate ganache','velvety sponge, a touch of espresso','crowned with a fresh raspberry'] },
  shake:       { name:'Strawberry Shake', price:4.30, ing:['sun-ripened berries, whole milk','whipped cream & vanilla soft serve','blushed pink — extra straw included'] },
  cola:        { name:'Coca-Cola', price:2.50, ing:['classic cola, served ice-cold','cracked over crystal-clear cubes','finished with a wedge of lime'] },
  cocoa:       { name:'Hot Cocoa', price:3.80, ing:['single-origin cocoa, slow-whisked','drowned in mini marshmallows','dusted with more cocoa, obviously'] },
  muffins:     { name:'Muffins', price:3.40, ing:['blueberry-studded tender crumb','golden dome, sugar-crystal crunch','baked fresh every morning'] },
  tart:        { name:'Fruit Tart', price:4.60, ing:['vanilla-bean pastry cream','glazed strawberry, kiwi & blueberry','in a buttery, flaky shell'] },
  cupcake:     { name:'Cupcake', price:3.10, ing:['blush-pink buttercream swirl','vanilla-bean sponge & sprinkles','the little black dress of cupcakes'] },
};

/* hero per view + staggered satellites (3 items per view) */
const VIEWS = [
  { hero:'ice-cream', variant:'a', sats:[ {id:'pancakes', pos:'tr', sz:118}, {id:'cake', pos:'br', sz:100} ] },
  { hero:'shake',     variant:'b', sats:[ {id:'cola',    pos:'tl', sz:112}, {id:'cocoa', pos:'bl', sz:104} ] },
  { hero:'muffins',   variant:'a', sats:[ {id:'tart',    pos:'tr', sz:114}, {id:'cupcake', pos:'br', sz:98} ] },
];

const CART_PHOTO_SIZES = [108, 94, 84, 76, 72]; // largest item near top

const $  = s => document.querySelector(s);
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const phone    = $('#phone');
const menuScroll = $('#menuScroll');
const cartList   = $('#cartList');
const cartBadge  = $('#cartBadge');
const basketBadge= $('#basketBadge');
const grandTotal = $('#grandTotal');
const cartProgress = $('#cartProgress');
const menuCartBtn  = $('#menuCartBtn');
const toastEl = $('#toast');

const state = new Map();          // id → qty
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── build the menu ─────────────────────────────────────── */
function itemEl(id, { cls = '', sz, dur, delay }) {
  const it = ITEMS[id];
  return el(`
    <button class="menu-item ${cls}" data-id="${id}" style="--sz:${sz}px;--dur:${dur}s;--delay:${delay}s" aria-label="Add ${it.name} to cart, $${it.price.toFixed(2)}">
      <span class="orb">
        <img src="assets/${id}.jpg" alt="" draggable="false">
        <span class="shelf"></span>
        <span class="plus"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
      </span>
      <span class="pill">${it.name}</span>
      ${cls.includes('hero') ? '' : `<span class="mini-price">$${it.price.toFixed(2)}</span>`}
    </button>`);
}

function buildMenu() {
  VIEWS.forEach((v, i) => {
    const view = el(`<section class="menu-view ${v.variant}"></section>`);
    view.append(itemEl(v.hero, { cls:'hero', sz:198, dur:6.5 + i * .7, delay:i * .4 }));
    v.sats.forEach((s, j) => view.append(itemEl(s.id, { cls:'sat pos-' + s.pos, sz:s.sz, dur:5 + j * 1.3, delay:.6 + j * .9 })));
    const it = ITEMS[v.hero];
    view.append(el(`
      <div class="hero-info">
        <h2>${it.name}</h2>
        <p>${it.ing.join('<br>')}</p>
        <span class="hero-price"><sup>$</sup>${it.price.toFixed(2)}</span>
        <span class="hero-hint">tap photo to add</span>
      </div>`));
    menuScroll.append(view);
  });
}

/* focus detection → name/ingredient fade-in */
function observeViews() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.target.classList.toggle('focused', e.isIntersecting));
  }, { root: menuScroll, threshold: .6 });
  menuScroll.querySelectorAll('.menu-view').forEach(v => io.observe(v));
}

/* scroll progress bar + first-swipe hint */
function trackScroll() {
  const fill = $('#menuProgress'), hint = $('#scrollHint');
  let ticking = false;
  menuScroll.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const max = menuScroll.scrollHeight - menuScroll.clientHeight;
      fill.style.width = (max > 0 ? (menuScroll.scrollTop / max) * 100 : 0) + '%';
      if (menuScroll.scrollTop > 14) hint.classList.add('hide');
      ticking = false;
    });
  }, { passive: true });
  menuScroll.addEventListener('scroll', () => hint.classList.add('hide'), { once: true, passive: true });
}

/* ── cart state ─────────────────────────────────────────── */
const count  = () => [...state.values()].reduce((a, b) => a + b, 0);
const total  = () => [...state].reduce((a, [id, q]) => a + ITEMS[id].price * q, 0);
const money  = n => n.toFixed(2);

function repop(node, text) {                       // re-trigger pop animation
  node.textContent = text;
  node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop');
}

function updateTotals(popIt = false) {
  const n = count(), t = total();
  cartBadge.hidden = n === 0; basketBadge.hidden = n === 0;
  if (popIt) { repop(cartBadge, n); repop(basketBadge, n); } else { cartBadge.textContent = n; basketBadge.textContent = n; }
  if (popIt) repop(grandTotal, money(t)); else grandTotal.textContent = money(t);
  cartProgress.style.width = Math.max(2, Math.min(100, (t / 60) * 100)) + '%';
}

/* ── toast ──────────────────────────────────────────────── */
let toastTimer;
function toast(html) {
  toastEl.innerHTML = html;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

/* ── SCREEN 2 · fly-to-cart (scale + rotate + translate) ── */
function flyToCart(img, id) {
  const src = img.getBoundingClientRect();
  const dst = menuCartBtn.getBoundingClientRect();
  const from = { x: src.left + src.width / 2,  y: src.top + src.height / 2 };
  const to   = { x: dst.left + dst.width / 2,  y: dst.top + dst.height / 2 };
  const dx = to.x - from.x, dy = to.y - from.y;
  const done = () => {
    updateTotals(true); renderCart();
    menuCartBtn.animate([{ transform:'scale(1)' }, { transform:'scale(1.28)' }, { transform:'scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    toast(`<b>${ITEMS[id].name}</b> added · total <b>$${money(total())}</b>`);
  };
  if (reduceMotion || !img.animate) { done(); return; }
  const ghost = document.createElement('img');
  ghost.src = img.src; ghost.className = 'fly'; ghost.alt = '';
  ghost.style.cssText += `left:${src.left}px;top:${src.top}px;width:${src.width}px;height:${src.height}px`;
  document.body.append(ghost);
  img.animate([{ transform:'scale(1)' }, { transform:'scale(.86)' }, { transform:'scale(1)' }], { duration: 450, easing: 'ease-out' });
  const anim = ghost.animate([
    { transform:'translate(0,0) scale(1) rotate(0deg)',      opacity:1,   offset:0 },
    { transform:`translate(${dx * .3}px,${dy * .18}px) scale(.68) rotate(150deg)`, opacity:1, offset:.42 },
    { transform:`translate(${dx}px,${dy}px) scale(.13) rotate(335deg)`, opacity:.4, offset:1 },
  ], { duration: 620, easing: 'cubic-bezier(.55,.06,.68,.19)' });
  const finish = () => { ghost.remove(); done(); };
  anim.onfinish = finish; anim.oncancel = finish;
  setTimeout(() => { if (ghost.isConnected) finish(); }, 900);   // safety net
}

function addItem(id, img) {
  state.set(id, (state.get(id) || 0) + 1);
  updateTotals();
  flyToCart(img, id);
}

/* ── SCREEN 3 · cart rendering ──────────────────────────── */
function cartRows() {
  return [...state.entries()]
    .map(([id, q]) => ({ id, q, line: ITEMS[id].price * q }))
    .sort((a, b) => b.line - a.line);                      // biggest first
}

function renderCart() {
  const rows = cartRows();
  if (!rows.length) {
    cartList.innerHTML = `
      <div class="empty">
        <span class="ring">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5h17l-1.6 9.2a2.2 2.2 0 0 1-2.2 1.8H7.3a2.2 2.2 0 0 1-2.2-1.8L3.5 8.5z"/><path d="M8 8.5L12 3l4 5.5"/><path d="M9.7 12.5v3.6M14.3 12.5v3.6"/></svg>
        </span>
        <p>Your cart is feeling light.<br>Tap a treat on the menu and watch it <b>fly right in</b>.</p>
      </div>`;
    return;
  }
  cartList.innerHTML = '';
  rows.forEach((r, i) => {
    const it = ITEMS[r.id];
    const sz = CART_PHOTO_SIZES[Math.min(i, CART_PHOTO_SIZES.length - 1)];
    const row = el(`
      <div class="cart-row" data-id="${r.id}" style="--sz:${sz}px">
        <span class="orb">
          <img src="assets/${r.id}.jpg" alt="${it.name}" draggable="false">
          <span class="shelf"></span>
        </span>
        <div class="meta">
          <div class="name">${it.name}</div>
          <div class="unit">$${money(it.price)} each</div>
        </div>
        <div class="right">
          <div class="stepper">
            <button class="step" data-act="dec" aria-label="One less ${it.name}">−</button>
            <span class="qty">${r.q}</span>
            <button class="step" data-act="inc" aria-label="One more ${it.name}">+</button>
          </div>
          <span class="line">$${money(r.line)}</span>
        </div>
      </div>`);
    row.style.animationDelay = Math.min(i * 60, 240) + 'ms';
    cartList.append(row);
  });
}

cartList.addEventListener('click', e => {
  const btn = e.target.closest('.step'); if (!btn) return;
  const row = btn.closest('.cart-row'); const id = row.dataset.id;
  const q = (state.get(id) || 0) + (btn.dataset.act === 'inc' ? 1 : -1);
  if (q <= 0) {
    state.delete(id);
    const collapse = row.animate?.([
      { opacity:1, transform:'none', height:row.offsetHeight + 'px' },
      { opacity:0, transform:'translateX(26px) scale(.9)', height:'0px', marginTop:'0', marginBottom:'0' },
    ], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (collapse) { collapse.onfinish = () => { renderCart(); updateTotals(); }; }
    else { renderCart(); updateTotals(); }
  } else {
    state.set(id, q);
    row.querySelector('.qty').textContent = q;
    row.querySelector('.line').textContent = '$' + money(ITEMS[id].price * q);
    repop(row.querySelector('.line'), '$' + money(ITEMS[id].price * q));
  }
  updateTotals();
});

/* ── menu taps → fly ────────────────────────────────────── */
menuScroll.addEventListener('click', e => {
  const item = e.target.closest('.menu-item'); if (!item) return;
  addItem(item.dataset.id, item.querySelector('img'));
});

/* ── navigation ─────────────────────────────────────────── */
const openCart  = () => { phone.classList.add('show-cart'); cartList.scrollTop = 0; };
const closeCart = () => phone.classList.remove('show-cart');
$('#cartBack').addEventListener('click', closeCart);
menuCartBtn.addEventListener('click', openCart);
$('#menuBack').addEventListener('click', () => toast('You’re at the <b>main menu</b> — swipe to explore'));
addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

/* basket button */
$('#basketBtn').addEventListener('click', () => {
  const n = count();
  toast(n ? `<b>${n}</b> ${n === 1 ? 'item' : 'items'} in your basket` : 'Basket is empty — add something sweet');
});

/* ── payment flow ───────────────────────────────────────── */
const payBtn = $('#payBtn');
const PAY_DEFAULT = `<span class="pay-label">Make Payment</span><span class="chev" aria-hidden="true">»</span>`;
payBtn.innerHTML = PAY_DEFAULT;

payBtn.addEventListener('click', () => {
  if (payBtn.classList.contains('busy')) return;
  if (!count()) { toast('Add something sweet first 🍰'); return; }
  payBtn.classList.add('busy');
  payBtn.innerHTML = `<span class="pay-label">Processing</span><span class="chev" aria-hidden="true">»</span>`;
  cartProgress.style.width = '100%';
  setTimeout(() => {
    payBtn.classList.remove('busy'); payBtn.classList.add('done');
    payBtn.innerHTML = `<span class="pay-label">Order Placed</span><svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>`;
    toast(`Payment of <b>$${money(total())}</b> confirmed — enjoy! 🍨`);
    setTimeout(() => {
      state.clear(); renderCart(); updateTotals();
      cartProgress.style.width = '2%';
      setTimeout(() => { payBtn.classList.remove('done'); payBtn.innerHTML = PAY_DEFAULT; }, 500);
    }, 1500);
  }, 1100);
});

/* ── boot ───────────────────────────────────────────────── */
buildMenu();
observeViews();
trackScroll();
renderCart();
updateTotals();
