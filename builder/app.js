/**
 * Damer Khata - Core Application Logic
 * Single file JS module
 */

(function () {
  'use strict';

  // --- 1. BENGALI DIGITS & NUMBER FORMATTING ---
  const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const EN_TO_BN = { '0':'০', '1':'১', '2':'২', '3':'৩', '4':'৪', '5':'৫', '6':'৬', '7':'৭', '8':'৮', '9':'৯' };
  const BN_TO_EN = { '০':'0', '১':'1', '২':'2', '৩':'3', '৪':'4', '৫':'5', '৬':'6', '৭':'7', '৮':'8', '৯':'9' };

  function toBn(num, withCommas = true) {
    if (num === null || num === undefined || isNaN(num)) return '০';
    let s = Math.round(num).toString();
    if (withCommas) {
      // Indian / Bangladeshi comma format (e.g. 12,34,567)
      let isNeg = s.startsWith('-');
      if (isNeg) s = s.slice(1);
      let last3 = s.slice(-3);
      let other = s.slice(0, -3);
      if (other !== '') {
        last3 = ',' + last3;
        other = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      }
      s = (isNeg ? '-' : '') + other + last3;
    }
    return s.replace(/\d/g, d => EN_TO_BN[d] || d);
  }

  function parseBn(val) {
    if (!val && val !== 0) return 0;
    let s = val.toString().trim();
    // Convert Bengali numerals to English
    s = s.replace(/[০-৯]/g, d => BN_TO_EN[d] || d);
    // Remove currency symbol, comma, spaces
    s = s.replace(/[৳,\s]/g, '');
    let n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function formatMoney(num) {
    return '৳' + toBn(Math.round(num));
  }

  function formatBnDate(ts) {
    if (!ts) return '';
    let d = new Date(ts);
    const months = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
    let day = toBn(d.getDate(), false);
    let month = months[d.getMonth()];
    let hour = d.getHours();
    let min = d.getMinutes();
    let period = 'সকাল';
    if (hour >= 12 && hour < 15) period = 'দুপুর';
    else if (hour >= 15 && hour < 18) period = 'বিকাল';
    else if (hour >= 18 && hour < 20) period = 'সন্ধ্যা';
    else if (hour >= 20 || hour < 6) period = 'রাত';
    let hour12 = hour % 12 || 12;
    let minStr = (min < 10 ? '০' : '') + toBn(min, false);
    return `${day} ${month}, ${period} ${toBn(hour12, false)}:${minStr}`;
  }

  // --- 2. DATA STATE & STORE ---
  const STORAGE_KEY = 'damer_khata_master_data';
  const CURRENT_APP_VERSION = '1.0.0';

  let state = {
    version: 1,
    storeCode: '',
    items: [],
    sales: [],
    trips: [],
    customers: [],
    loans: [],
    expenses: [],
    services: [],
    suppliers: [],
    shopList: [],
    cashLogs: {},
    tomb: {},
    prefs: {
      viewMode: 'list',
      pinEnabled: false,
      pinHash: '',
      bioEnabled: false,
      lastBackupTime: 0,
      lastSyncTime: 0,
      storeCode: '',
      scriptUrl: '',
      lastCat: 'all',
      serviceRates: {}
    }
  };

  // Session & Security state
  let sessionUnlocked = false;
  let unlockExpiry = 0;
  let pinBuffer = '';
  let pendingAuthCallback = null;
  let activeBatchId = null;
  let pendingPhotoSlot = null;
  let undoTimeout = null;
  let syncDebounceTimer = null;

  function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  }

  function loadState() {
    let raw = null;
    try {
      if (window.Android && window.Android.load) {
        raw = window.Android.load();
      } else {
        raw = localStorage.getItem(STORAGE_KEY);
      }
      if (raw && raw.trim() !== '') {
        let parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.items = parsed.items || [];
          state.sales = parsed.sales || [];
          state.trips = parsed.trips || [];
          state.customers = parsed.customers || [];
          state.loans = parsed.loans || [];
          state.expenses = parsed.expenses || [];
          state.services = parsed.services || [];
          state.suppliers = parsed.suppliers || [];
          state.shopList = parsed.shopList || [];
          state.cashLogs = parsed.cashLogs || {};
          state.tomb = parsed.tomb || {};
          state.prefs = Object.assign(state.prefs, parsed.prefs || {});
          state.storeCode = state.prefs.storeCode || parsed.storeCode || '';
        }
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    // Ensure 8-digit store code exists
    if (!state.storeCode) {
      state.storeCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      state.prefs.storeCode = state.storeCode;
    }
  }

  function saveState(skipSync = false) {
    let json = JSON.stringify(state);
    try {
      if (window.Android && window.Android.save) {
        window.Android.save(json);
      } else {
        localStorage.setItem(STORAGE_KEY, json);
      }
    } catch (e) {
      console.error('Failed to save state:', e);
    }

    if (!skipSync && state.prefs.scriptUrl) {
      triggerDebouncedSync();
    }
  }

  // --- 3. TOAST & NOTIFICATIONS ---
  function showToast(msg, undoCallback = null, duration = 4000) {
    const box = document.getElementById('toast-box');
    if (!box) return;

    if (undoTimeout) {
      clearTimeout(undoTimeout);
      undoTimeout = null;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    const span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);

    if (undoCallback) {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'ফেরত';
      undoBtn.onclick = function (e) {
        e.stopPropagation();
        toast.remove();
        undoCallback();
      };
      toast.appendChild(undoBtn);
      duration = 6000; // 6 seconds for sales undo as requested
    }

    box.innerHTML = '';
    box.appendChild(toast);

    undoTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- 4. DOUBLE TAP CONFIRMATION HELPER ---
  function setDoubleTapConfirm(btn, confirmText, onConfirmed) {
    let timeout = null;
    let normalText = btn.textContent;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('confirming')) {
        clearTimeout(timeout);
        btn.classList.remove('confirming');
        btn.textContent = normalText;
        onConfirmed();
      } else {
        btn.classList.add('confirming');
        btn.textContent = confirmText;
        timeout = setTimeout(() => {
          btn.classList.remove('confirming');
          btn.textContent = normalText;
        }, 3000);
      }
    };
  }

  // --- 5. PIN & BIOMETRIC AUTH ---
  function isUnlocked() {
    if (!state.prefs.pinEnabled) return true;
    return sessionUnlocked && Date.now() < unlockExpiry;
  }

  function requireAuth(onSuccess) {
    if (isUnlocked()) {
      sessionUnlocked = true;
      unlockExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      updateLockIcon();
      onSuccess();
      return;
    }

    pendingAuthCallback = onSuccess;
    pinBuffer = '';
    updatePinDots();
    openSheet('overlay-pin');

    // Trigger biometric automatically if enabled and available
    if (state.prefs.bioEnabled && window.Android && window.Android.canBio && window.Android.canBio()) {
      setTimeout(() => {
        try { window.Android.bio(); } catch (e) {}
      }, 300);
    }
  }

  function lockApp() {
    sessionUnlocked = false;
    unlockExpiry = 0;
    updateLockIcon();
    closeAllSheets();
    switchTab('home');
    showToast('🔒 অ্যাপ লক করা হয়েছে');
  }

  function updateLockIcon() {
    const btn = document.getElementById('top-lock-btn');
    if (!btn) return;
    if (!state.prefs.pinEnabled) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'flex';
    btn.textContent = isUnlocked() ? '🔓' : '🔒';
    btn.title = isUnlocked() ? 'তালা লাগান (আনলক আছে)' : 'তালা বন্ধ';
  }

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pindot-${i}`);
      if (dot) {
        dot.className = i < pinBuffer.length ? 'pin-dot filled' : 'pin-dot';
      }
    }
  }

  async function checkEnteredPin() {
    if (pinBuffer.length !== 4) return;
    let hash = await sha256(pinBuffer);
    if (hash === state.prefs.pinHash) {
      sessionUnlocked = true;
      unlockExpiry = Date.now() + 10 * 60 * 1000;
      updateLockIcon();
      closeSheet('overlay-pin');
      showToast('✓ PIN সঠিক হয়েছে');
      if (pendingAuthCallback) {
        let cb = pendingAuthCallback;
        pendingAuthCallback = null;
        cb();
      }
    } else {
      showToast('❌ ভুল PIN! আবার চেষ্টা করুন।');
      pinBuffer = '';
      updatePinDots();
    }
  }

  async function sha256(message) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback simple hash for older environments
      let hash = 0;
      for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) - hash) + message.charCodeAt(i);
        hash |= 0;
      }
      return 'hash_' + hash;
    }
  }

  // --- 6. COST & OVERHEAD CALCULATIONS ---
  function computeBatchOverhead(batch) {
    if (!batch) return 0;
    let fare = batch.fare || 0;
    let otherSum = (batch.otherCosts || []).reduce((acc, c) => acc + (c.amount || 0), 0);
    return fare + otherSum;
  }

  function computeItemCostAndStock(item) {
    let completedSales = state.sales.filter(s => s.itemId === item.id && s.status === 'completed');
    let soldQty = completedSales.reduce((acc, s) => acc + (s.qty || 0), 0);
    let availableStock = Math.max(0, (item.qty || 0) - soldQty);

    let batchOverheadShare = 0;
    let batchName = '';
    if (item.batchId) {
      let batch = state.trips.find(t => t.id === item.batchId && !state.tomb[t.id]);
      if (batch) {
        batchName = batch.market;
        let batchItems = state.items.filter(it => it.batchId === item.batchId && !state.tomb[it.id]);
        let totalBatchGoodsCost = batchItems.reduce((acc, it) => acc + (it.totalCost || 0), 0);
        let totalOverhead = computeBatchOverhead(batch);
        if (totalBatchGoodsCost > 0) {
          batchOverheadShare = (item.totalCost / totalBatchGoodsCost) * totalOverhead;
        } else if (batchItems.length > 0) {
          batchOverheadShare = totalOverhead / batchItems.length;
        }
      }
    }

    let itemCustomFare = item.customFare || item.fare || 0;
    let itemCustomOther = item.customOtherCost || (item.otherCosts || []).reduce((acc, c) => acc + (c.amount || 0), 0);
    let grandTotalCost = (item.totalCost || 0) + batchOverheadShare + itemCustomFare + itemCustomOther;
    let unitCost = item.qty > 0 ? (grandTotalCost / item.qty) : 0;
    let unitProfit = (item.sellPrice || 0) - unitCost;

    return {
      availableStock,
      soldQty,
      batchOverheadShare,
      batchName,
      grandTotalCost,
      unitCost,
      unitProfit
    };
  }

  function suggest30PercentPrice(unitCost) {
    let p = unitCost * 1.30;
    return Math.max(5, Math.round(p / 5) * 5);
  }

  // --- 7. HOME SCREEN RENDERING (DAM DEKHUN) ---
  let activeCategoryFilter = 'all';
  let currentSearchQuery = '';

  function renderHomeItems() {
    const listContainer = document.getElementById('items-list-container');
    const gridContainer = document.getElementById('items-grid-container');
    const countDisplay = document.getElementById('items-count-display');
    const emptyState = document.getElementById('home-empty-state');
    const todaySalesBadge = document.getElementById('top-sales-badge');

    // Update today sales count
    let today = new Date().toDateString();
    let todaySales = state.sales.filter(s => s.status === 'completed' && new Date(s.time).toDateString() === today);
    let todaySalesCount = todaySales.reduce((acc, s) => acc + (s.qty || 0), 0);
    if (todaySalesBadge) {
      todaySalesBadge.textContent = `আজ বিক্রি: ${toBn(todaySalesCount)}টা`;
    }

    let activeItems = state.items.filter(it => !state.tomb[it.id]);

    // Filter by category
    if (activeCategoryFilter === 'low') {
      activeItems = activeItems.filter(it => {
        let calc = computeItemCostAndStock(it);
        return calc.availableStock <= 2;
      });
    } else if (activeCategoryFilter !== 'all') {
      activeItems = activeItems.filter(it => it.cat === activeCategoryFilter);
    }

    // Filter by search query
    if (currentSearchQuery.trim() !== '') {
      let q = currentSearchQuery.trim().toLowerCase();
      activeItems = activeItems.filter(it => {
        let nameMatch = (it.name || '').toLowerCase().includes(q);
        let catMatch = (it.cat || '').toLowerCase().includes(q);
        let srcMatch = (it.source || '').toLowerCase().includes(q);
        return nameMatch || catMatch || srcMatch;
      });
    }

    if (countDisplay) {
      countDisplay.textContent = `মোট ${toBn(activeItems.length)}টি জিনিস`;
    }

    if (activeItems.length === 0) {
      if (listContainer) listContainer.innerHTML = '';
      if (gridContainer) gridContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const isGrid = state.prefs.viewMode === 'grid';
    if (listContainer) listContainer.style.display = isGrid ? 'none' : 'flex';
    if (gridContainer) gridContainer.style.display = isGrid ? 'grid' : 'none';

    // Render List View
    if (!isGrid && listContainer) {
      listContainer.innerHTML = '';
      activeItems.forEach(item => {
        let calc = computeItemCostAndStock(item);
        const card = document.createElement('div');
        card.className = 'item-card-list';

        // Thumb
        let thumbHtml = '';
        if (item.photo) {
          thumbHtml = `<div class="thumb-box"><img src="${item.photo}" class="thumb-img" alt="${item.name}"></div>`;
        } else {
          let initial = (item.name || 'ম').charAt(0);
          thumbHtml = `<div class="thumb-box">${initial}</div>`;
        }

        // Stock Badge
        let stockClass = 'ok';
        let stockText = `আছে ${toBn(calc.availableStock)}টা`;
        if (calc.availableStock === 0) {
          stockClass = 'out';
          stockText = 'শেষ';
        } else if (calc.availableStock <= 2) {
          stockClass = 'low';
          stockText = `আছে ${toBn(calc.availableStock)}টা (কম)`;
        }

        // Variants summary
        let variantsHtml = '';
        if (item.variants && item.variants.length > 0) {
          let varDetails = item.variants.map(v => {
            let vSales = state.sales.filter(s => s.itemId === item.id && s.variant === v.name && s.status === 'completed');
            let vSold = vSales.reduce((acc, s) => acc + s.qty, 0);
            let vAvail = Math.max(0, (v.qty || 0) - vSold);
            return `${v.name}: ${toBn(vAvail)}`;
          }).join(' | ');
          variantsHtml = `<div class="variants-summary">${varDetails}</div>`;
        }

        card.innerHTML = `
          ${thumbHtml}
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-meta">
              <span class="item-cat-badge">${item.cat || 'অন্যান্য'}</span>
              <span class="stock-badge ${stockClass}">${stockText}</span>
            </div>
            ${variantsHtml}
          </div>
          <div class="item-actions">
            <div class="item-price">${formatMoney(item.sellPrice || 0)}</div>
            <button class="sell-btn" data-id="${item.id}" ${calc.availableStock === 0 ? 'disabled' : ''}>বিক্রি</button>
          </div>
        `;

        // Card click opens edit sheet (PIN protected)
        card.onclick = function (e) {
          if (e.target.classList.contains('sell-btn')) return;
          requireAuth(() => openEditItemSheet(item.id));
        };

        // Sell button click
        const sellBtn = card.querySelector('.sell-btn');
        if (sellBtn) {
          sellBtn.onclick = function (e) {
            e.stopPropagation();
            openSaleSheet(item.id);
          };
        }

        listContainer.appendChild(card);
      });
    }

    // Render Grid View
    if (isGrid && gridContainer) {
      gridContainer.innerHTML = '';
      activeItems.forEach(item => {
        let calc = computeItemCostAndStock(item);
        const card = document.createElement('div');
        card.className = 'item-card-grid';

        let thumbHtml = '';
        if (item.photo) {
          thumbHtml = `<div class="grid-thumb-box"><img src="${item.photo}" class="grid-thumb-img" alt="${item.name}">`;
        } else {
          let initial = (item.name || 'ম').charAt(0);
          thumbHtml = `<div class="grid-thumb-box">${initial}`;
        }

        let stockClass = 'ok';
        let stockText = `আছে ${toBn(calc.availableStock)}টা`;
        if (calc.availableStock === 0) {
          stockClass = 'out';
          stockText = 'শেষ';
        } else if (calc.availableStock <= 2) {
          stockClass = 'low';
          stockText = `আছে ${toBn(calc.availableStock)}টা`;
        }
        thumbHtml += `<span class="grid-stock-overlay stock-badge ${stockClass}">${stockText}</span></div>`;

        card.innerHTML = `
          ${thumbHtml}
          <div class="grid-info">
            <div class="grid-name">${item.name}</div>
            <div class="grid-footer">
              <div class="grid-price">${formatMoney(item.sellPrice || 0)}</div>
              <button class="sell-btn" data-id="${item.id}" ${calc.availableStock === 0 ? 'disabled' : ''}>বিক্রি</button>
            </div>
          </div>
        `;

        card.onclick = function (e) {
          if (e.target.classList.contains('sell-btn')) return;
          requireAuth(() => openEditItemSheet(item.id));
        };

        const sellBtn = card.querySelector('.sell-btn');
        if (sellBtn) {
          sellBtn.onclick = function (e) {
            e.stopPropagation();
            openSaleSheet(item.id);
          };
        }

        gridContainer.appendChild(card);
      });
    }
  }

  // --- 8. SALE CONFIRMATION SHEET ---
  let activeSaleItem = null;
  let activeSaleVariant = null;
  let activeSaleQty = 1;
  let activeSaleMaxQty = 1;

  function openSaleSheet(itemId) {
    let item = state.items.find(it => it.id === itemId && !state.tomb[it.id]);
    if (!item) return;

    let calc = computeItemCostAndStock(item);
    if (calc.availableStock <= 0) {
      showToast('⚠️ এই মালটি স্টকে শেষ হয়ে গেছে!');
      return;
    }

    activeSaleItem = item;
    activeSaleQty = 1;

    document.getElementById('sale-item-name').textContent = item.name;
    document.getElementById('sale-item-stock-text').textContent = `দোকানে আছে: ${toBn(calc.availableStock)}টা`;

    const thumbEl = document.getElementById('sale-thumb');
    if (item.photo) {
      thumbEl.innerHTML = `<img src="${item.photo}" class="thumb-img" alt="${item.name}">`;
    } else {
      thumbEl.textContent = (item.name || 'ম').charAt(0);
    }

    // Variants handling
    const variantContainer = document.getElementById('sale-variant-container');
    const variantChips = document.getElementById('sale-variant-chips');
    variantChips.innerHTML = '';

    if (item.variants && item.variants.length > 0) {
      variantContainer.style.display = 'block';
      let availableVariants = [];

      item.variants.forEach(v => {
        let vSales = state.sales.filter(s => s.itemId === item.id && s.variant === v.name && s.status === 'completed');
        let vSold = vSales.reduce((acc, s) => acc + s.qty, 0);
        let vAvail = Math.max(0, (v.qty || 0) - vSold);

        let chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = `${v.name} (${toBn(vAvail)})`;

        if (vAvail <= 0) {
          chip.style.opacity = '0.4';
          chip.style.pointerEvents = 'none';
        } else {
          availableVariants.push({ variant: v, avail: vAvail, chip });
          chip.onclick = function () {
            variantChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeSaleVariant = v.name;
            activeSaleMaxQty = vAvail;
            if (activeSaleQty > activeSaleMaxQty) activeSaleQty = activeSaleMaxQty;
            updateSaleQtyDisplay();
          };
        }
        variantChips.appendChild(chip);
      });

      // Auto-select if only 1 variant has stock
      if (availableVariants.length > 0) {
        availableVariants[0].chip.classList.add('active');
        activeSaleVariant = availableVariants[0].variant.name;
        activeSaleMaxQty = availableVariants[0].avail;
      } else {
        activeSaleVariant = null;
        activeSaleMaxQty = 0;
      }
    } else {
      variantContainer.style.display = 'none';
      activeSaleVariant = null;
      activeSaleMaxQty = calc.availableStock;
    }

    // Set default price
    const priceInput = document.getElementById('sale-price-input');
    priceInput.value = toBn(item.sellPrice || 0, false);

    updateSaleQtyDisplay();
    updateSaleCalculation();

    // Default to Cash
    document.getElementById('sale-pay-cash-btn').classList.add('active');
    document.getElementById('sale-pay-due-btn').classList.remove('active');
    document.getElementById('sale-customer-section').style.display = 'none';

    // Populate customer dropdown
    populateCustomerDropdown();

    openSheet('overlay-sale');
  }

  function updateSaleQtyDisplay() {
    const qtyInput = document.getElementById('sale-qty-input');
    qtyInput.value = toBn(activeSaleQty, false);
  }

  function updateSaleCalculation() {
    if (!activeSaleItem) return;
    let unitSellPrice = parseBn(document.getElementById('sale-price-input').value);
    let total = activeSaleQty * unitSellPrice;
    document.getElementById('sale-total-display').textContent = formatMoney(total);

    const warnEl = document.getElementById('sale-price-warning');
    let calc = computeItemCostAndStock(activeSaleItem);
    let defaultPrice = activeSaleItem.sellPrice || 0;

    if (unitSellPrice < calc.unitCost) {
      warnEl.innerHTML = `<span style="color:var(--danger);">⚠️ এই দামে লোকসান হবে! (প্রতি পিস খরচ ${formatMoney(calc.unitCost)})</span>`;
    } else if (unitSellPrice < defaultPrice) {
      let diff = defaultPrice - unitSellPrice;
      warnEl.innerHTML = `<span style="color:var(--warning);">৳${toBn(diff)} কম রাখা হচ্ছে</span>`;
    } else {
      warnEl.innerHTML = '';
    }
  }

  function populateCustomerDropdown() {
    const select = document.getElementById('sale-customer-select');
    select.innerHTML = '<option value="">কাস্টমার বাছুন...</option>';
    let sortedCusts = [...state.customers].filter(c => !state.tomb[c.id]).sort((a, b) => (b.due || 0) - (a.due || 0));
    sortedCusts.forEach(c => {
      let opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (আগের বাকি: ${formatMoney(c.due || 0)})`;
      select.appendChild(opt);
    });
  }

  function confirmSale() {
    if (!activeSaleItem) return;

    if (activeSaleQty <= 0) {
      showToast('⚠️ সংখ্যা কমপক্ষে ১ হতে হবে');
      return;
    }

    if (activeSaleQty > activeSaleMaxQty) {
      showToast(`⚠️ দোকানে মাত্র ${toBn(activeSaleMaxQty)}টা আছে!`);
      return;
    }

    let unitSellPrice = parseBn(document.getElementById('sale-price-input').value);
    let total = activeSaleQty * unitSellPrice;
    let calc = computeItemCostAndStock(activeSaleItem);
    let unitCostAtSale = calc.unitCost;
    let profit = total - (activeSaleQty * unitCostAtSale);

    let isDue = document.getElementById('sale-pay-due-btn').classList.contains('active');
    let customerId = null;

    if (isDue) {
      let custSelect = document.getElementById('sale-customer-select');
      let newName = document.getElementById('sale-new-cust-name').value.trim();
      let newPhone = document.getElementById('sale-new-cust-phone').value.trim();

      if (newName) {
        // Create new customer
        customerId = generateId('cust');
        state.customers.push({
          id: customerId,
          u: Date.now(),
          name: newName,
          phone: newPhone,
          due: total,
          txs: [{
            id: generateId('tx'),
            time: Date.now(),
            type: 'due',
            amount: total,
            note: `${activeSaleItem.name} বিক্রি (বাকিতে)`
          }]
        });
      } else if (custSelect.value) {
        customerId = custSelect.value;
        let cust = state.customers.find(c => c.id === customerId);
        if (cust) {
          cust.u = Date.now();
          cust.due = (cust.due || 0) + total;
          if (!cust.txs) cust.txs = [];
          cust.txs.push({
            id: generateId('tx'),
            time: Date.now(),
            type: 'due',
            amount: total,
            note: `${activeSaleItem.name} বিক্রি (বাকিতে)`
          });
        }
      } else {
        showToast('⚠️ বাকিতে বিক্রির জন্য কাস্টমার বেছে নিন বা নতুন কাস্টমারের নাম লিখুন!');
        return;
      }
    }

    const saleRecord = {
      id: generateId('sale'),
      u: Date.now(),
      time: Date.now(),
      itemId: activeSaleItem.id,
      itemName: activeSaleItem.name,
      variant: activeSaleVariant,
      qty: activeSaleQty,
      unitPrice: unitSellPrice,
      unitCost: unitCostAtSale,
      totalPrice: total,
      profit: profit,
      isDue: isDue,
      customerId: customerId,
      status: 'completed'
    };

    state.sales.push(saleRecord);
    saveState();
    closeSheet('overlay-sale');
    renderHomeItems();

    // 6-second undo toast
    let itemTitle = activeSaleItem.name;
    let saleMsg = `${itemTitle}: ${toBn(activeSaleQty)}টা বিক্রি, ৳${toBn(total)}`;
    showToast(saleMsg, function () {
      undoSale(saleRecord.id);
    }, 6000);
  }

  function undoSale(saleId) {
    let sale = state.sales.find(s => s.id === saleId);
    if (!sale || sale.status === 'returned') return;

    sale.status = 'returned';
    sale.u = Date.now();

    // Reverse customer due if credit sale
    if (sale.isDue && sale.customerId) {
      let cust = state.customers.find(c => c.id === sale.customerId);
      if (cust) {
        cust.u = Date.now();
        cust.due = Math.max(0, (cust.due || 0) - sale.totalPrice);
        if (!cust.txs) cust.txs = [];
        cust.txs.push({
          id: generateId('tx'),
          time: Date.now(),
          type: 'payment',
          amount: sale.totalPrice,
          note: `বিক্রি ফেরত সমন্বয় (${sale.itemName})`
        });
      }
    }

    saveState();
    renderHomeItems();
    renderStatsScreen();
    showToast(`✓ ${sale.itemName}-এর বিক্রি ফেরত নেওয়া হয়েছে ও স্টক ঠিক করা হয়েছে।`);
  }

  // --- 9. ADD STOCK: MODE A (BATCH PURCHASE) ---
  let batchItemsTemp = [];

  function initBatchMode() {
    let activeBatch = state.trips.find(t => t.status === 'open' && !state.tomb[t.id]);
    if (!activeBatch) {
      activeBatch = {
        id: generateId('batch'),
        u: Date.now(),
        time: Date.now(),
        market: 'চকবাজার',
        fare: 0,
        otherCosts: [],
        itemIds: [],
        status: 'open'
      };
      state.trips.push(activeBatch);
      saveState();
    }
    activeBatchId = activeBatch.id;

    // Set UI
    const marketSelect = document.getElementById('batch-market-select');
    marketSelect.value = activeBatch.market || 'চকবাজার';
    document.getElementById('batch-fare-input').value = toBn(activeBatch.fare || 0, false);

    renderBatchCostsList();
    renderBatchItemsList();
  }

  function renderBatchCostsList() {
    const list = document.getElementById('batch-costs-list');
    list.innerHTML = '';
    let batch = state.trips.find(t => t.id === activeBatchId);
    if (!batch) return;

    (batch.otherCosts || []).forEach((c, idx) => {
      let row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';

      row.innerHTML = `
        <select class="form-select batch-cost-name" style="flex:1.2; height:44px; font-size:16px;">
          <option value="লেবার" ${c.name === 'লেবার' ? 'selected' : ''}>লেবার</option>
          <option value="নৌকা ঘাট" ${c.name === 'নৌকা ঘাট' ? 'selected' : ''}>নৌকা ঘাট (যেমন ৭০ টাকা)</option>
          <option value="কুরিয়ার" ${c.name === 'কুরিয়ার' ? 'selected' : ''}>কুরিয়ার</option>
          <option value="মার্কেট চার্জ" ${c.name === 'মার্কেট চার্জ' ? 'selected' : ''}>মার্কেট চার্জ</option>
          <option value="টোল" ${c.name === 'টোল' ? 'selected' : ''}>টোল</option>
          <option value="রিকশা/ভ্যান" ${c.name === 'রিকশা/ভ্যান' ? 'selected' : ''}>রিকশা/ভ্যান</option>
          <option value="খাওয়া-দাওয়া" ${c.name === 'খাওয়া-দাওয়া' ? 'selected' : ''}>খাওয়া-দাওয়া</option>
          <option value="অন্য খরচ" ${c.name === 'অন্য খরচ' ? 'selected' : ''}>অন্য খরচ</option>
        </select>
        <input type="text" inputmode="numeric" class="form-input batch-cost-amount" value="${toBn(c.amount || 0, false)}" style="flex:0.8; height:44px; font-size:16px;" placeholder="টাকা">
        <button type="button" class="sheet-close-btn batch-cost-del" style="width:36px; height:36px; flex-shrink:0;">✕</button>
      `;

      row.querySelector('.batch-cost-name').onchange = function (e) {
        c.name = e.target.value;
        saveState();
        recalculateBatchOverheads();
      };
      row.querySelector('.batch-cost-amount').oninput = function (e) {
        c.amount = parseBn(e.target.value);
        saveState();
        recalculateBatchOverheads();
      };
      row.querySelector('.batch-cost-del').onclick = function () {
        batch.otherCosts.splice(idx, 1);
        saveState();
        renderBatchCostsList();
        recalculateBatchOverheads();
      };

      list.appendChild(row);
    });

    let totalOverhead = computeBatchOverhead(batch);
    document.getElementById('batch-overhead-summary').textContent = `ব্যাচের মোট খরচ: ৳${toBn(totalOverhead)}`;
  }

  function recalculateBatchOverheads() {
    let batch = state.trips.find(t => t.id === activeBatchId);
    if (!batch) return;

    let totalOverhead = computeBatchOverhead(batch);
    document.getElementById('batch-overhead-summary').textContent = `ব্যাচের মোট খরচ: ৳${toBn(totalOverhead)}`;

    let batchItems = state.items.filter(it => it.batchId === activeBatchId && !state.tomb[it.id]);
    let totalGoodsCost = batchItems.reduce((acc, it) => acc + (it.totalCost || 0), 0);

    batchItems.forEach(item => {
      let share = 0;
      if (totalGoodsCost > 0) {
        share = (item.totalCost / totalGoodsCost) * totalOverhead;
      } else if (batchItems.length > 0) {
        share = totalOverhead / batchItems.length;
      }
      item.batchShare = share;

      // Update 30% suggested price if auto and no sales
      let completedSales = state.sales.filter(s => s.itemId === item.id && s.status === 'completed');
      if (item.isAuto30 && completedSales.length === 0) {
        let calc = computeItemCostAndStock(item);
        item.sellPrice = suggest30PercentPrice(calc.unitCost);
      }
      item.u = Date.now();
    });

    saveState();
    renderBatchItemsList();
  }

  function renderBatchItemsList() {
    const container = document.getElementById('batch-items-container');
    const grandTotalBar = document.getElementById('batch-grand-total-bar');
    let batch = state.trips.find(t => t.id === activeBatchId);
    if (!batch) return;

    let batchItems = state.items.filter(it => it.batchId === activeBatchId && !state.tomb[it.id]);

    if (batchItems.length === 0) {
      container.innerHTML = '<div style="color:var(--text-light); text-align:center; padding:16px;">এখনো কোনো মাল যোগ করা হয়নি।</div>';
      let totalOverhead = computeBatchOverhead(batch);
      grandTotalBar.textContent = `মাল ৳০ + খরচ ৳${toBn(totalOverhead)} = মোট ৳${toBn(totalOverhead)}`;
      return;
    }

    container.innerHTML = '';
    let totalGoods = 0;

    batchItems.forEach(item => {
      let calc = computeItemCostAndStock(item);
      totalGoods += (item.totalCost || 0);

      let row = document.createElement('div');
      row.className = 'batch-item-card';

      let thumbHtml = '';
      if (item.photo) {
        thumbHtml = `<img src="${item.photo}" style="width:48px; height:48px; border-radius:6px; object-fit:cover; margin-right:8px;">`;
      } else {
        thumbHtml = `<div style="width:48px; height:48px; border-radius:6px; background:#E5E7EB; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--primary); margin-right:8px;">${(item.name || 'ম').charAt(0)}</div>`;
      }

      let profitHtml = '';
      if (calc.unitProfit < 0) {
        profitHtml = `<span style="color:var(--danger); font-weight:bold;">লোকসান!</span>`;
      } else {
        profitHtml = `<span style="color:var(--primary); font-size:14px;">লাভ: ৳${toBn(calc.unitProfit)}</span>`;
      }

      row.innerHTML = `
        <div style="display:flex; align-items:center; flex:1; min-width:0;">
          ${thumbHtml}
          <div style="min-width:0;">
            <div style="font-weight:700; font-size:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
            <div style="font-size:14px; color:var(--text-muted);">${item.cat} · ${toBn(item.qty)}টা · মাল ৳${toBn(item.totalCost)} + খরচ ৳${toBn(calc.batchOverheadShare)}</div>
          </div>
        </div>
        <div style="text-align:right; margin-left:8px;">
          <div style="font-size:13px; color:var(--text-light);">খরচ: ৳${toBn(calc.unitCost)}/পিস</div>
          <div style="font-size:22px; font-weight:800; color:var(--primary);">${formatMoney(item.sellPrice || 0)}</div>
          <div>${profitHtml}</div>
        </div>
      `;

      row.onclick = function () {
        requireAuth(() => openEditItemSheet(item.id));
      };

      container.appendChild(row);
    });

    let totalOverhead = computeBatchOverhead(batch);
    let grandTotal = totalGoods + totalOverhead;
    grandTotalBar.textContent = `মাল ৳${toBn(totalGoods)} + খরচ ৳${toBn(totalOverhead)} = মোট ৳${toBn(grandTotal)}`;

    renderPastBatches();
  }

  function renderPastBatches() {
    const list = document.getElementById('past-batches-container');
    if (!list) return;

    let pastBatches = state.trips.filter(t => t.id !== activeBatchId && !state.tomb[t.id]);
    if (pastBatches.length === 0) {
      list.innerHTML = '<div style="color:var(--text-light); font-size:15px;">আগের কোনো ব্যাচ নেই।</div>';
      return;
    }

    list.innerHTML = '';
    pastBatches.forEach(b => {
      let bItems = state.items.filter(it => it.batchId === b.id && !state.tomb[it.id]);
      let totalGoods = bItems.reduce((acc, it) => acc + (it.totalCost || 0), 0);
      let totalCost = totalGoods + computeBatchOverhead(b);

      let card = document.createElement('div');
      card.style.cssText = 'background:#F9FAFB; border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;';
      card.innerHTML = `
        <div>
          <div style="font-weight:700; font-size:16px;">${b.market} - ${formatBnDate(b.time)}</div>
          <div style="font-size:14px; color:var(--text-muted);">${toBn(bItems.length)}টি মাল · মোট খরচ ৳${toBn(totalCost)}</div>
        </div>
        <button class="btn-secondary" style="height:36px; padding:4px 12px; font-size:15px; width:auto;">খুলুন</button>
      `;

      card.querySelector('button').onclick = function () {
        activeBatchId = b.id;
        document.getElementById('batch-market-select').value = b.market || 'চকবাজার';
        document.getElementById('batch-fare-input').value = toBn(b.fare || 0, false);
        renderBatchCostsList();
        renderBatchItemsList();
        showToast(`ব্যাচ খোলা হয়েছে: ${b.market}`);
      };

      list.appendChild(card);
    });
  }

  // --- 10. ADD STOCK: MODE B (BULK TEXT ENTRY) ---
  function parseBulkLines(text) {
    const lines = text.split('\n');
    const results = [];
    lines.forEach((line, idx) => {
      let trimmed = line.trim();
      if (!trimmed) return;
      // Format: name qty cost sell_price (supports Bengali or English numbers)
      // Extract numbers from the line
      // E.g. "লুঙ্গি চেক ১২ ১২০০ ১৪০" or "প্লাস্টিক জগ ১২টা ৮৪০ টাকা ৯০"
      let tokens = trimmed.split(/\s+/);
      let numbers = [];
      let nameParts = [];

      tokens.forEach(tok => {
        let clean = tok.replace(/[^\d০-৯.]/g, '');
        if (clean.length > 0 && !isNaN(parseBn(clean))) {
          numbers.push(parseBn(clean));
        } else {
          nameParts.push(tok);
        }
      });

      let name = nameParts.join(' ').trim();
      let qty = numbers[0] || 0;
      let cost = numbers[1] || 0;
      let sell = numbers[2] || 0;

      let valid = name.length > 0 && qty > 0 && cost > 0;
      results.push({ lineNum: idx + 1, raw: trimmed, name, qty, cost, sell, valid });
    });
    return results;
  }

  // --- 11. EDIT ITEM SHEET (JINISH BODLAN - PIN PROTECTED) ---
  function openEditItemSheet(itemId) {
    let item = state.items.find(it => it.id === itemId && !state.tomb[it.id]);
    if (!item) return;

    let calc = computeItemCostAndStock(item);
    const body = document.getElementById('edit-item-body');

    body.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:14px;">
        <div id="edit-thumb-box" class="thumb-box" style="width:72px; height:72px; cursor:pointer;">
          ${item.photo ? `<img src="${item.photo}" class="thumb-img">` : (item.name || 'ম').charAt(0)}
        </div>
        <div style="flex:1;">
          <button type="button" id="edit-photo-btn" class="btn-secondary" style="height:40px; font-size:15px;">📷 ছবি বদলান</button>
          ${item.photo ? `<button type="button" id="edit-photo-del" style="background:none; border:none; color:var(--danger); font-size:14px; margin-top:4px; cursor:pointer;">ছবি মুছুন</button>` : ''}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">জিনিসের নাম</label>
        <input type="text" id="edit-item-name" class="form-input" value="${item.name || ''}">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group">
          <label class="form-label">ধরন</label>
          <select id="edit-item-cat" class="form-select">
            <option value="কাপড়" ${item.cat === 'কাপড়' ? 'selected' : ''}>কাপড়</option>
            <option value="প্লাস্টিক" ${item.cat === 'প্লাস্টিক' ? 'selected' : ''}>প্লাস্টিক</option>
            <option value="খেলনা" ${item.cat === 'খেলনা' ? 'selected' : ''}>খেলনা</option>
            <option value="মেয়েদের জিনিস" ${item.cat === 'মেয়েদের জিনিস' ? 'selected' : ''}>মেয়েদের জিনিস</option>
            <option value="মুদি" ${item.cat === 'মুদি' ? 'selected' : ''}>মুদি</option>
            <option value="অন্যান্য" ${item.cat === 'অন্যান্য' ? 'selected' : ''}>অন্যান্য</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">কোথা থেকে কেনা?</label>
          <input type="text" id="edit-item-source" class="form-input" value="${item.source || ''}">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group">
          <label class="form-label">মোট কিনেছেন</label>
          <input type="text" inputmode="numeric" id="edit-item-qty" class="form-input" value="${toBn(item.qty || 0, false)}">
        </div>
        <div class="form-group">
          <label class="form-label">বিক্রি হয়েছে</label>
          <input type="text" class="form-input" value="${toBn(calc.soldQty)}টা" disabled style="background:#E5E7EB;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div class="form-group">
          <label class="form-label">মোট কেনা দাম (৳)</label>
          <input type="text" inputmode="numeric" id="edit-item-cost" class="form-input" value="${toBn(item.totalCost || 0, false)}">
        </div>
        <div class="form-group">
          <label class="form-label">বিক্রির দাম (৳)</label>
          <input type="text" inputmode="numeric" id="edit-item-sell" class="form-input" value="${toBn(item.sellPrice || 0, false)}">
        </div>
      </div>

      <!-- Batch Info & Item Specific Extra Cost -->
      <div style="background:#F3F4F6; padding:12px; border-radius:10px; margin-bottom:14px; font-size:15px;">
        ${item.batchId ? `<div>ব্যাচ: <strong>${calc.batchName || 'চলতি ব্যাচ'}</strong> (ব্যাচের ভাগের খরচ: <strong>৳${toBn(calc.batchOverheadShare)}</strong>)</div>` : ''}
        <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div>
            <label class="form-label" style="font-size:14px;">আলাদা ভাড়া (৳)</label>
            <input type="text" inputmode="numeric" id="edit-item-custom-fare" class="form-input" style="height:40px; font-size:16px;" value="${toBn(item.customFare || 0, false)}">
          </div>
          <div>
            <label class="form-label" style="font-size:14px;">আলাদা অন্য খরচ (৳)</label>
            <input type="text" inputmode="numeric" id="edit-item-custom-other" class="form-input" style="height:40px; font-size:16px;" value="${toBn(item.customOtherCost || 0, false)}">
          </div>
        </div>
        <div style="margin-top:6px; color:var(--text-light); font-size:14px;">প্রতি পিস মোট খরচ: <strong>৳${toBn(calc.unitCost)}</strong>, প্রতি পিস লাভ: <strong>৳${toBn(calc.unitProfit)}</strong></div>
      </div>

      <!-- Restock Section: নতুন মাল এসেছে? -->
      <div style="border:1.5px dashed var(--primary); padding:12px; border-radius:10px; margin-bottom:14px; background:var(--primary-light);">
        <h5 style="font-size:17px; font-weight:700; color:var(--primary); margin-bottom:8px;">➕ নতুন মাল এসেছে?</h5>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          <div>
            <label class="form-label" style="font-size:14px;">আরও কয়টা?</label>
            <input type="text" inputmode="numeric" id="restock-qty" class="form-input" style="height:40px; font-size:16px;" placeholder="০">
          </div>
          <div>
            <label class="form-label" style="font-size:14px;">ওগুলোর দাম</label>
            <input type="text" inputmode="numeric" id="restock-cost" class="form-input" style="height:40px; font-size:16px;" placeholder="০">
          </div>
          <div>
            <label class="form-label" style="font-size:14px;">ভাড়া</label>
            <input type="text" inputmode="numeric" id="restock-fare" class="form-input" style="height:40px; font-size:16px;" placeholder="০">
          </div>
        </div>
      </div>

      <!-- Variants Manager -->
      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label class="form-label" style="margin:0;">সাইজ ও রঙের স্টক</label>
          <button type="button" id="edit-add-variant-btn" style="background:none; border:none; color:var(--primary); font-weight:bold; cursor:pointer;">+ সাইজ/রং যোগ</button>
        </div>
        <div id="edit-variants-list" style="display:flex; flex-direction:column; gap:6px;"></div>
      </div>

      <div style="display:flex; gap:10px; margin-top:20px;">
        <button type="button" id="edit-save-btn" class="btn-primary" style="flex:2;">পরিবর্তন সেভ করুন</button>
        <button type="button" id="edit-del-btn" class="btn-danger" style="flex:1;">মুছুন</button>
      </div>
    `;

    // Render variants in edit sheet
    let variantsCopy = JSON.parse(JSON.stringify(item.variants || []));
    function renderEditVariants() {
      const vList = document.getElementById('edit-variants-list');
      vList.innerHTML = '';
      if (variantsCopy.length === 0) {
        vList.innerHTML = '<span style="font-size:14px; color:var(--text-light);">আলাদা সাইজ বা রং নেই।</span>';
        return;
      }

      variantsCopy.forEach((v, vIdx) => {
        let vSales = state.sales.filter(s => s.itemId === item.id && s.variant === v.name && s.status === 'completed');
        let hasSales = vSales.length > 0;

        let row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';

        row.innerHTML = `
          <input type="text" class="form-input v-name" value="${v.name || ''}" style="flex:1.2; height:40px; font-size:16px;" placeholder="সাইজ/রং" ${hasSales ? 'disabled' : ''}>
          <input type="text" inputmode="numeric" class="form-input v-qty" value="${toBn(v.qty || 0, false)}" style="flex:0.8; height:40px; font-size:16px;" placeholder="সংখ্যা">
          ${hasSales ? `<span title="বিক্রি আছে, মোছা যাবে না" style="color:var(--text-light); font-size:14px;">🔒</span>` : `<button type="button" class="sheet-close-btn v-del" style="width:34px; height:34px; flex-shrink:0;">✕</button>`}
        `;

        row.querySelector('.v-name').oninput = function (e) {
          v.name = e.target.value.trim();
        };
        row.querySelector('.v-qty').oninput = function (e) {
          v.qty = parseBn(e.target.value);
        };
        if (!hasSales) {
          row.querySelector('.v-del').onclick = function () {
            variantsCopy.splice(vIdx, 1);
            renderEditVariants();
          };
        }

        vList.appendChild(row);
      });
    }
    renderEditVariants();

    document.getElementById('edit-add-variant-btn').onclick = function () {
      variantsCopy.push({ id: generateId('var'), name: '', qty: 0 });
      renderEditVariants();
    };

    // Photo handlers
    const photoBtn = document.getElementById('edit-photo-btn');
    if (photoBtn) {
      photoBtn.onclick = function () {
        pendingPhotoSlot = 'edit';
        choosePhoto();
      };
    }
    const photoDel = document.getElementById('edit-photo-del');
    if (photoDel) {
      photoDel.onclick = function () {
        item.photo = '';
        saveState();
        openEditItemSheet(item.id);
      };
    }

    // Save changes
    document.getElementById('edit-save-btn').onclick = function () {
      item.name = document.getElementById('edit-item-name').value.trim() || item.name;
      item.cat = document.getElementById('edit-item-cat').value;
      item.source = document.getElementById('edit-item-source').value.trim();
      let baseQty = parseBn(document.getElementById('edit-item-qty').value);
      let baseCost = parseBn(document.getElementById('edit-item-cost').value);
      item.sellPrice = parseBn(document.getElementById('edit-item-sell').value);
      item.customFare = parseBn(document.getElementById('edit-item-custom-fare').value);
      item.customOtherCost = parseBn(document.getElementById('edit-item-custom-other').value);

      // Handle restock
      let addQty = parseBn(document.getElementById('restock-qty').value);
      let addCost = parseBn(document.getElementById('restock-cost').value);
      let addFare = parseBn(document.getElementById('restock-fare').value);
      if (addQty > 0) {
        baseQty += addQty;
        baseCost += addCost;
        item.customFare = (item.customFare || 0) + addFare;
        showToast(`✓ আরও ${toBn(addQty)}টি মাল যোগ করা হয়েছে!`);
      }

      item.qty = baseQty;
      item.totalCost = baseCost;

      // Sync variants
      if (variantsCopy.length > 0) {
        item.variants = variantsCopy.filter(v => v.name.trim() !== '');
        let varSum = item.variants.reduce((acc, v) => acc + (v.qty || 0), 0);
        if (varSum > 0) {
          item.qty = varSum;
        }
      } else {
        item.variants = [];
      }

      item.u = Date.now();
      saveState();
      closeSheet('overlay-edit-item');
      renderHomeItems();
      renderStatsScreen();
      showToast('✓ তথ্য সফলভাবে আপডেট হয়েছে');
    };

    // Delete item with double-tap
    setDoubleTapConfirm(document.getElementById('edit-del-btn'), 'নিশ্চিত মুছবেন?', function () {
      state.tomb[item.id] = Date.now();
      saveState();
      closeSheet('overlay-edit-item');
      renderHomeItems();
      renderStatsScreen();
      showToast(`✓ "${item.name}" মুছে ফেলা হয়েছে`, function () {
        delete state.tomb[item.id];
        saveState();
        renderHomeItems();
      });
    });

    openSheet('overlay-edit-item');
  }

  // --- 12. ACCOUNTS & ANALYTICS (HISAB SCREEN - PIN PROTECTED) ---
  function renderStatsScreen() {
    // 7-day backup reminder
    const backupBanner = document.getElementById('backup-warning-banner');
    let lastBackup = state.prefs.lastBackupTime || 0;
    let daysSinceBackup = (Date.now() - lastBackup) / (1000 * 60 * 60 * 24);
    if (!state.prefs.scriptUrl && daysSinceBackup > 7) {
      backupBanner.style.display = 'flex';
    } else {
      backupBanner.style.display = 'none';
    }

    let activeItems = state.items.filter(it => !state.tomb[it.id]);

    // 1. আজ বিক্রি
    let today = new Date().toDateString();
    let todaySales = state.sales.filter(s => s.status === 'completed' && new Date(s.time).toDateString() === today);
    let todaySalesMoney = todaySales.reduce((acc, s) => acc + (s.totalPrice || 0), 0);
    let todaySalesQty = todaySales.reduce((acc, s) => acc + (s.qty || 0), 0);
    let todaySalesProfit = todaySales.reduce((acc, s) => acc + (s.profit || 0), 0);

    document.getElementById('kpi-today-sales').textContent = formatMoney(todaySalesMoney);
    document.getElementById('kpi-today-details').textContent = `${toBn(todaySalesQty)}টা মাল, লাভ ${formatMoney(todaySalesProfit)}`;

    // 2. আসল লাভ (মালের লাভ + কমিশন − দোকান খরচ)
    let totalGoodsProfit = state.sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + (s.profit || 0), 0);
    let totalCommission = state.services.filter(s => !state.tomb[s.id]).reduce((acc, s) => acc + (s.commission || 0), 0);
    let totalShopExpenses = state.expenses.filter(e => !state.tomb[e.id]).reduce((acc, e) => acc + (e.amount || 0), 0);
    let realNetProfit = totalGoodsProfit + totalCommission - totalShopExpenses;
    document.getElementById('kpi-net-profit').textContent = formatMoney(realNetProfit);

    // 3. মাল কিনতে মোট খরচ (ভাড়া ও অন্যান্য খরচসহ)
    let totalPurchaseCost = activeItems.reduce((acc, it) => {
      let calc = computeItemCostAndStock(it);
      return acc + calc.grandTotalCost;
    }, 0);
    document.getElementById('kpi-total-purchase').textContent = formatMoney(totalPurchaseCost);

    // 4. দোকানে মাল আছে (কয়টা, কেনা দামে কত, বেচলে কত)
    let totalStockQty = 0;
    let totalStockCost = 0;
    let totalStockSell = 0;
    activeItems.forEach(it => {
      let calc = computeItemCostAndStock(it);
      totalStockQty += calc.availableStock;
      totalStockCost += (calc.availableStock * calc.unitCost);
      totalStockSell += (calc.availableStock * (it.sellPrice || 0));
    });
    document.getElementById('kpi-stock-count').textContent = `${toBn(totalStockQty)}টা`;
    document.getElementById('kpi-stock-value').textContent = `কেনা: ${formatMoney(totalStockCost)}, বেচলে: ${formatMoney(totalStockSell)}`;

    // 5. বাকি পাওনা
    let activeCustomers = state.customers.filter(c => !state.tomb[c.id]);
    let totalDue = activeCustomers.reduce((acc, c) => acc + Math.max(0, c.due || 0), 0);
    let dueCount = activeCustomers.filter(c => (c.due || 0) > 0).length;
    document.getElementById('kpi-total-due').textContent = formatMoney(totalDue);
    document.getElementById('kpi-due-count').textContent = `${toBn(dueCount)} জনের কাছে`;

    // 6. ধার শোধ বাকি
    let activeLoans = state.loans.filter(l => !state.tomb[l.id]);
    let totalRemainingLoan = activeLoans.reduce((acc, l) => acc + Math.max(0, (l.amount || 0) - (l.repaid || 0)), 0);
    document.getElementById('kpi-total-loan').textContent = formatMoney(totalRemainingLoan);

    // Render Charts
    render14DaysChart();
    renderCategoryChart();
    renderExpenseChart();

    // Dead Stock
    renderDeadStock();

    // Winter Stock
    checkWinterStockAlert();

    // Recent 30 Sales
    renderRecentSales();

    // Reorder low stock and top sellers
    renderLowStockAndTopSellers();
  }

  // Chart 1: Last 14 Days Sales & Profit (SVG)
  function render14DaysChart() {
    const container = document.getElementById('chart-14-days-container');
    const totalEl = document.getElementById('chart-14-days-total');
    let days = [];
    let today = new Date();

    for (let i = 13; i >= 0; i--) {
      let d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    let maxVal = 1000;
    let total14Sales = 0;
    let total14Profit = 0;

    let dayData = days.map(d => {
      let dStr = d.toDateString();
      let dSales = state.sales.filter(s => s.status === 'completed' && new Date(s.time).toDateString() === dStr);
      let salesSum = dSales.reduce((acc, s) => acc + (s.totalPrice || 0), 0);
      let profitSum = dSales.reduce((acc, s) => acc + (s.profit || 0), 0);
      total14Sales += salesSum;
      total14Profit += profitSum;
      if (salesSum > maxVal) maxVal = salesSum;
      if (profitSum > maxVal) maxVal = profitSum;
      return {
        date: d,
        isToday: dStr === today.toDateString(),
        sales: salesSum,
        profit: profitSum
      };
    });

    totalEl.textContent = `১৪ দিনের মোট: বিক্রি ৳${toBn(total14Sales)}, লাভ ৳${toBn(total14Profit)}`;

    // Draw SVG
    let svgWidth = 600;
    let svgHeight = 220;
    let chartH = 160;
    let barWidth = 14;
    let groupWidth = svgWidth / 14;

    let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg">`;
    // Grid lines
    for (let g = 0; g <= 4; g++) {
      let y = chartH - (g * (chartH / 4)) + 15;
      svg += `<line x1="0" y1="${y}" x2="${svgWidth}" y2="${y}" stroke="#E5E7EB" stroke-dasharray="3,3"/>`;
    }

    dayData.forEach((d, idx) => {
      let x = idx * groupWidth + (groupWidth / 2);
      let sH = (d.sales / maxVal) * chartH;
      let pH = (d.profit / maxVal) * chartH;
      let sY = chartH - sH + 15;
      let pY = chartH - pH + 15;

      let salesColor = d.isToday ? '#10B981' : '#1F7A52';
      let profitColor = d.isToday ? '#059669' : '#165B3D';

      svg += `
        <!-- Sales bar -->
        <rect x="${x - barWidth - 1}" y="${sY}" width="${barWidth}" height="${sH}" rx="4" fill="${salesColor}"/>
        <!-- Profit bar -->
        <rect x="${x + 1}" y="${pY}" width="${barWidth}" height="${pH}" rx="4" fill="${profitColor}"/>
        <!-- Date label -->
        <text x="${x}" y="${svgHeight - 15}" font-size="12" fill="${d.isToday ? '#1F7A52' : '#6B7280'}" font-weight="${d.isToday ? 'bold' : 'normal'}" text-anchor="middle">
          ${d.isToday ? 'আজ' : toBn(d.date.getDate(), false)}
        </text>
      `;
    });

    svg += `</svg>`;
    container.innerHTML = svg;
  }

  // Chart 2: Category Breakdown (Horizontal Bars)
  function renderCategoryChart() {
    const container = document.getElementById('chart-category-container');
    let catTotals = {};

    state.sales.filter(s => s.status === 'completed').forEach(s => {
      let item = state.items.find(it => it.id === s.itemId);
      let cat = item ? (item.cat || 'অন্যান্য') : 'অন্যান্য';
      if (!catTotals[cat]) catTotals[cat] = { sales: 0, qty: 0 };
      catTotals[cat].sales += (s.totalPrice || 0);
      catTotals[cat].qty += (s.qty || 0);
    });

    let catEntries = Object.entries(catTotals).sort((a, b) => b[1].sales - a[1].sales);
    if (catEntries.length === 0) {
      container.innerHTML = '<div style="color:var(--text-light); font-size:15px; padding:8px 0;">কোনো বিক্রি এখনো নেই।</div>';
      return;
    }

    let maxCatSales = catEntries[0][1].sales || 1;
    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';

    catEntries.forEach(([cat, data]) => {
      let pct = Math.round((data.sales / maxCatSales) * 100);
      html += `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:600; margin-bottom:3px;">
            <span>${cat} (${toBn(data.qty)}টা)</span>
            <span style="color:var(--primary);">${formatMoney(data.sales)}</span>
          </div>
          <div style="background:#E5E7EB; border-radius:6px; height:12px; overflow:hidden;">
            <div style="background:var(--primary); height:100%; width:${pct}%; border-radius:6px;"></div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // Chart 3: Expense Breakdown
  function renderExpenseChart() {
    const container = document.getElementById('chart-expenses-container');
    let expensesByType = {
      'মাল কেনা': 0,
      'গাড়ি ভাড়া': 0,
      'লেবার': 0,
      'নৌকা ঘাট': 0,
      'কুরিয়ার': 0,
      'দোকানের খরচ': 0
    };

    // Goods purchase
    state.items.filter(it => !state.tomb[it.id]).forEach(it => {
      expensesByType['মাল কেনা'] += (it.totalCost || 0);
      expensesByType['গাড়ি ভাড়া'] += (it.customFare || it.fare || 0);
      expensesByType['দোকানের খরচ'] += (it.customOtherCost || 0);
    });

    // Trips overheads
    state.trips.filter(t => !state.tomb[t.id]).forEach(t => {
      expensesByType['গাড়ি ভাড়া'] += (t.fare || 0);
      (t.otherCosts || []).forEach(oc => {
        let name = oc.name || 'অন্য খরচ';
        if (name === 'লেবার') expensesByType['লেবার'] += (oc.amount || 0);
        else if (name === 'নৌকা ঘাট') expensesByType['নৌকা ঘাট'] += (oc.amount || 0);
        else if (name === 'কুরিয়ার') expensesByType['কুরিয়ার'] += (oc.amount || 0);
        else expensesByType['দোকানের খরচ'] += (oc.amount || 0);
      });
    });

    // Shop non-inventory expenses
    state.expenses.filter(e => !state.tomb[e.id]).forEach(e => {
      expensesByType['দোকানের খরচ'] += (e.amount || 0);
    });

    let entries = Object.entries(expensesByType).filter(([_, amt]) => amt > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      container.innerHTML = '<div style="color:var(--text-light); font-size:15px; padding:8px 0;">কোনো খরচের হিসাব নেই।</div>';
      return;
    }

    let maxExp = entries[0][1] || 1;
    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';

    entries.forEach(([type, amt]) => {
      let pct = Math.round((amt / maxExp) * 100);
      html += `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:600; margin-bottom:3px;">
            <span>${type}</span>
            <span style="color:var(--danger);">${formatMoney(amt)}</span>
          </div>
          <div style="background:#E5E7EB; border-radius:6px; height:12px; overflow:hidden;">
            <div style="background:#EF4444; height:100%; width:${pct}%; border-radius:6px;"></div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // Dead Stock Alert
  function renderDeadStock() {
    const card = document.getElementById('dead-stock-card');
    const list = document.getElementById('dead-stock-list');
    let thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let deadItems = [];

    state.items.filter(it => !state.tomb[it.id]).forEach(it => {
      let calc = computeItemCostAndStock(it);
      if (calc.availableStock <= 0) return;

      // Check last sale time
      let itemSales = state.sales.filter(s => s.itemId === it.id && s.status === 'completed');
      let lastSaleTime = itemSales.length > 0 ? Math.max(...itemSales.map(s => s.time)) : (it.createdAt || it.u);

      if (lastSaleTime < thirtyDaysAgo) {
        let idleDays = Math.floor((Date.now() - lastSaleTime) / (24 * 60 * 60 * 1000));
        let tiedMoney = calc.availableStock * calc.unitCost;
        deadItems.push({ item: it, idleDays, tiedMoney, calc });
      }
    });

    if (deadItems.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    deadItems.forEach(d => {
      let row = document.createElement('div');
      row.style.cssText = 'background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:6px;';
      row.innerHTML = `
        <div style="font-weight:700; font-size:16px;">${d.item.name} (${toBn(d.calc.availableStock)}টা আছে)</div>
        <div style="font-size:14px; color:var(--text-muted);">${toBn(d.idleDays)} দিন ধরে কোনো বিক্রি নেই · আটকে আছে ${formatMoney(d.tiedMoney)}</div>
        <div style="font-size:14px; color:var(--accent); font-weight:bold; margin-top:3px;">পরামর্শ: ১০-২০% ছাড় দিয়ে টাকা উদ্ধার করুন।</div>
      `;
      list.appendChild(row);
    });
  }

  // Winter Stock Alert (Active Dec 20 to Feb 10)
  function checkWinterStockAlert() {
    const card = document.getElementById('winter-stock-card');
    const msg = document.getElementById('winter-stock-msg');
    const list = document.getElementById('winter-stock-list');

    let now = new Date();
    let month = now.getMonth(); // 0 = Jan, 1 = Feb, 11 = Dec
    let date = now.getDate();
    let isWinterSeason = (month === 11 && date >= 20) || (month === 0) || (month === 1 && date <= 10);

    if (!isWinterSeason) {
      card.style.display = 'none';
      return;
    }

    const winterKeywords = ['শীত', 'সোয়েটার', 'জ্যাকেট', 'কম্বল', 'মাফলার', 'টুপি', 'চাদর', 'হুডি', 'মোজা', 'শাল', 'ইনার'];
    let winterItems = [];
    let totalWinterTied = 0;

    state.items.filter(it => !state.tomb[it.id]).forEach(it => {
      let calc = computeItemCostAndStock(it);
      if (calc.availableStock <= 0) return;

      let nameLower = (it.name || '').toLowerCase();
      let isWinter = winterKeywords.some(kw => nameLower.includes(kw));

      if (isWinter) {
        let tied = calc.availableStock * calc.unitCost;
        totalWinterTied += tied;
        winterItems.push({ item: it, avail: calc.availableStock, tied });
      }
    });

    if (winterItems.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    msg.textContent = `শীতের মরসুম শেষ হতে চলেছে! দোকানে এখনো ${toBn(winterItems.length)} রকম শীতের মাল রয়েছে (আটকে আছে ${formatMoney(totalWinterTied)})। দ্রুত বিক্রি করুন বা পাইকারকে ফেরত দিন।`;
    list.innerHTML = '';

    winterItems.forEach(w => {
      let row = document.createElement('div');
      row.style.cssText = 'font-size:15px; margin-bottom:4px;';
      row.innerHTML = `• <strong>${w.item.name}</strong>: ${toBn(w.avail)}টা আছে (${formatMoney(w.tied)})`;
      list.appendChild(row);
    });
  }

  // Recent 30 Sales with Double-tap Return
  function renderRecentSales() {
    const list = document.getElementById('recent-sales-list');
    let completed = state.sales.filter(s => s.status === 'completed').sort((a, b) => b.time - a.time).slice(0, 30);

    if (completed.length === 0) {
      list.innerHTML = '<div style="color:var(--text-light); font-size:15px;">এখনো কোনো বিক্রি নেই।</div>';
      return;
    }

    list.innerHTML = '';
    completed.forEach(s => {
      let row = document.createElement('div');
      row.style.cssText = 'background:#F9FAFB; border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;';

      let varText = s.variant ? ` (${s.variant})` : '';
      let dueText = s.isDue ? ` <span style="color:var(--accent); font-weight:bold;">[বাকি]</span>` : '';

      row.innerHTML = `
        <div>
          <div style="font-weight:700; font-size:16px;">${s.itemName}${varText} · ${toBn(s.qty)}টা ${dueText}</div>
          <div style="font-size:13px; color:var(--text-muted);">${formatBnDate(s.time)} · লাভ ${formatMoney(s.profit || 0)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:18px; font-weight:800; color:var(--primary);">${formatMoney(s.totalPrice || 0)}</div>
          <button class="btn-danger sale-return-btn" style="height:34px; padding:2px 10px; font-size:14px; width:auto;">ফেরত</button>
        </div>
      `;

      let retBtn = row.querySelector('.sale-return-btn');
      setDoubleTapConfirm(retBtn, 'ফেরত?', function () {
        undoSale(s.id);
      });

      list.appendChild(row);
    });
  }

  // Low Stock & Top Sellers
  function renderLowStockAndTopSellers() {
    const lowList = document.getElementById('low-stock-list');
    const topList = document.getElementById('top-sellers-list');

    let lowItems = [];
    state.items.filter(it => !state.tomb[it.id]).forEach(it => {
      let calc = computeItemCostAndStock(it);
      if (calc.availableStock <= 2) {
        lowItems.push({ item: it, avail: calc.availableStock });
      }
    });

    if (lowItems.length === 0) {
      lowList.innerHTML = '<div style="color:var(--primary); font-size:15px;">সব মালের পর্যাপ্ত স্টক আছে! ✓</div>';
    } else {
      lowList.innerHTML = '';
      lowItems.forEach(l => {
        let div = document.createElement('div');
        div.style.cssText = 'font-size:16px; margin-bottom:4px;';
        div.innerHTML = `• <strong>${l.item.name}</strong>: মাত্র <span style="color:var(--warning); font-weight:bold;">${toBn(l.avail)}টা</span> আছে (${l.item.source || 'বাজার'})`;
        lowList.appendChild(div);
      });
    }

    // Top Sellers
    let salesByItem = {};
    state.sales.filter(s => s.status === 'completed').forEach(s => {
      salesByItem[s.itemId] = (salesByItem[s.itemId] || 0) + s.qty;
    });

    let topEntries = Object.entries(salesByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topEntries.length === 0) {
      topList.innerHTML = '<div style="color:var(--text-light); font-size:15px;">এখনো কোনো বিক্রি নেই।</div>';
    } else {
      topList.innerHTML = '';
      topEntries.forEach(([itId, qty], idx) => {
        let it = state.items.find(x => x.id === itId);
        let name = it ? it.name : 'অজানা মাল';
        let div = document.createElement('div');
        div.style.cssText = 'font-size:16px; margin-bottom:4px;';
        div.innerHTML = `${toBn(idx + 1)}. <strong>${name}</strong>: মোট ${toBn(qty)}টা বিক্রি হয়েছে`;
        topList.appendChild(div);
      });
    }
  }

  // --- 13. MORE SCREEN TILES & POPUPS (PIN PROTECTED) ---
  function openMoreTile(tileId) {
    requireAuth(() => {
      const titleEl = document.getElementById('more-detail-title');
      const bodyEl = document.getElementById('more-detail-body');

      switch (tileId) {
        case 'due':
          titleEl.textContent = '📒 বাকির খাতা';
          renderDueLedger(bodyEl);
          break;
        case 'cash':
          titleEl.textContent = '💰 দোকানের খরচ ও ক্যাশ';
          renderShopCash(bodyEl);
          break;
        case 'loans':
          titleEl.textContent = '🤝 ধারের হিসাব';
          renderLoans(bodyEl);
          break;
        case 'shopping':
          titleEl.textContent = '🛒 কেনার তালিকা';
          renderShoppingList(bodyEl);
          break;
        case 'services':
          titleEl.textContent = '📱 রিচার্জ · বিকাশ · বিল';
          renderServices(bodyEl);
          break;
        case 'suppliers':
          titleEl.textContent = '👥 পাইকারের তালিকা';
          renderSuppliers(bodyEl);
          break;
        case 'monthly':
          titleEl.textContent = '📈 মাসিক রিপোর্ট';
          renderMonthlyReport(bodyEl);
          break;
        case 'settings':
          titleEl.textContent = '⚙️ Backup · PIN · Update';
          renderSettings(bodyEl);
          break;
      }

      openSheet('overlay-more-detail');
    });
  }

  // 1. Due Ledger
  function renderDueLedger(container) {
    let sortedCusts = [...state.customers].filter(c => !state.tomb[c.id]).sort((a, b) => (b.due || 0) - (a.due || 0));
    let totalDue = sortedCusts.reduce((acc, c) => acc + Math.max(0, c.due || 0), 0);

    container.innerHTML = `
      <div style="background:var(--accent-light); padding:12px 16px; border-radius:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:18px; font-weight:700; color:#9A3412;">মোট পাওনা:</span>
        <span style="font-size:26px; font-weight:800; color:#9A3412;">${formatMoney(totalDue)}</span>
      </div>

      <div style="margin-bottom:14px;">
        <button type="button" id="add-cust-btn" class="btn-secondary">+ নতুন কাস্টমার যোগ করুন</button>
        <div id="add-cust-form" style="display:none; background:#F9FAFB; border:1px solid var(--border); padding:12px; border-radius:10px; margin-top:8px;">
          <div class="form-group">
            <label class="form-label">কাস্টমারের নাম *</label>
            <input type="text" id="new-cust-name" class="form-input" placeholder="যেমন: রহিম চাচা">
          </div>
          <div class="form-group">
            <label class="form-label">মোবাইল নম্বর</label>
            <input type="text" inputmode="tel" id="new-cust-phone" class="form-input" placeholder="017xxxxxxxx">
          </div>
          <button type="button" id="save-new-cust-btn" class="btn-primary" style="height:44px;">সেভ করুন</button>
        </div>
      </div>

      <div id="cust-list-box" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    document.getElementById('add-cust-btn').onclick = function () {
      let f = document.getElementById('add-cust-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('save-new-cust-btn').onclick = function () {
      let name = document.getElementById('new-cust-name').value.trim();
      let phone = document.getElementById('new-cust-phone').value.trim();
      if (!name) {
        showToast('⚠️ কাস্টমারের নাম দিন');
        return;
      }
      state.customers.push({
        id: generateId('cust'),
        u: Date.now(),
        name,
        phone,
        due: 0,
        txs: []
      });
      saveState();
      renderDueLedger(container);
      showToast('✓ কাস্টমার যোগ করা হয়েছে');
    };

    const listBox = document.getElementById('cust-list-box');
    if (sortedCusts.length === 0) {
      listBox.innerHTML = '<div style="color:var(--text-light); text-align:center; padding:16px;">কোনো কাস্টমার নেই।</div>';
      return;
    }

    sortedCusts.forEach(c => {
      let row = document.createElement('div');
      row.style.cssText = 'background:#FFFFFF; border:1px solid var(--border); border-radius:10px; padding:12px; box-shadow:var(--shadow);';
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:18px; font-weight:700;">${c.name}</div>
            <div style="font-size:14px; color:var(--text-muted);">${c.phone || 'ফোন নেই'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px; font-weight:800; color:${c.due > 0 ? 'var(--accent)' : 'var(--primary)'};">${formatMoney(c.due || 0)}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-secondary cust-detail-btn" style="height:36px; font-size:14px; flex:1;">লেনদেন হিসাব</button>
          ${c.due > 0 && c.phone ? `<button class="btn-primary cust-wa-btn" style="height:36px; font-size:14px; flex:1; background-color:#25D366;">WhatsApp তাগাদা</button>` : ''}
        </div>
      `;

      row.querySelector('.cust-detail-btn').onclick = function () {
        openCustomerDetails(c.id);
      };

      let waBtn = row.querySelector('.cust-wa-btn');
      if (waBtn) {
        waBtn.onclick = function () {
          let msg = `আসসালামু আলাইকুম ${c.name} ভাই/চাচা, দামের খাতা থেকে জানাচ্ছি যে আপনার কাছে ৳${toBn(c.due)} বাকি রয়েছে। সুবিধাজনক সময়ে পরিশোধ করলে উপকৃত হব। ধন্যবাদ।`;
          let cleanPhone = (c.phone || '').replace(/[^\d]/g, '');
          if (cleanPhone.startsWith('0')) cleanPhone = '88' + cleanPhone;
          let url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
          // Copy to clipboard
          navigator.clipboard.writeText(msg).catch(() => {});
          window.open(url, '_blank');
          showToast('✓ মেসেজ কপি হয়েছে এবং WhatsApp খোলা হচ্ছে');
        };
      }

      listBox.appendChild(row);
    });
  }

  function openCustomerDetails(custId) {
    let cust = state.customers.find(c => c.id === custId);
    if (!cust) return;

    const bodyEl = document.getElementById('more-detail-body');
    const titleEl = document.getElementById('more-detail-title');
    titleEl.textContent = `কাস্টমার: ${cust.name}`;

    bodyEl.innerHTML = `
      <div style="background:var(--accent-light); padding:12px; border-radius:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:17px; font-weight:700; color:#9A3412;">বর্তমান বাকি:</span>
        <span style="font-size:24px; font-weight:800; color:#9A3412;">${formatMoney(cust.due || 0)}</span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
        <button type="button" id="cust-pay-btn" class="btn-primary" style="height:44px; font-size:16px;">💵 টাকা পেলাম</button>
        <button type="button" id="cust-due-btn" class="btn-secondary" style="height:44px; font-size:16px;">📒 বাকি দিলাম</button>
      </div>

      <div id="cust-tx-form" style="display:none; background:#F9FAFB; padding:12px; border-radius:10px; border:1px solid var(--border); margin-bottom:14px;">
        <h5 id="cust-tx-form-title" style="font-size:16px; font-weight:bold; margin-bottom:8px;"></h5>
        <div class="form-group">
          <label class="form-label">টাকার পরিমাণ (৳)</label>
          <input type="text" inputmode="numeric" id="cust-tx-amount" class="form-input" placeholder="যেমন: ৫০০">
        </div>
        <div class="form-group">
          <label class="form-label">নোট (ঐচ্ছিক)</label>
          <input type="text" id="cust-tx-note" class="form-input" placeholder="যেমন: আংশিক পরিশোধ">
        </div>
        <button type="button" id="cust-tx-submit" class="btn-primary" style="height:42px;">নিশ্চিত করুন</button>
      </div>

      <h5 style="font-size:17px; font-weight:700; margin-bottom:8px;">লেনদেনের ইতিহাস</h5>
      <div id="cust-history-box" style="display:flex; flex-direction:column; gap:6px;"></div>

      <div style="margin-top:20px;">
        <button type="button" id="cust-del-btn" class="btn-danger" style="height:40px; font-size:15px;">কাস্টমার মুছুন</button>
      </div>
    `;

    let activeType = 'payment';
    const formBox = document.getElementById('cust-tx-form');
    const formTitle = document.getElementById('cust-tx-form-title');

    document.getElementById('cust-pay-btn').onclick = function () {
      activeType = 'payment';
      formTitle.textContent = 'টাকা গ্রহণের বিবরণ';
      formBox.style.display = 'block';
    };

    document.getElementById('cust-due-btn').onclick = function () {
      activeType = 'due';
      formTitle.textContent = 'নতুন বাকি দেওয়ার বিবরণ';
      formBox.style.display = 'block';
    };

    document.getElementById('cust-tx-submit').onclick = function () {
      let amt = parseBn(document.getElementById('cust-tx-amount').value);
      let note = document.getElementById('cust-tx-note').value.trim();
      if (amt <= 0) {
        showToast('⚠️ সঠিক টাকা লিখুন');
        return;
      }

      if (activeType === 'payment') {
        cust.due = Math.max(0, (cust.due || 0) - amt);
      } else {
        cust.due = (cust.due || 0) + amt;
      }

      if (!cust.txs) cust.txs = [];
      cust.txs.push({
        id: generateId('tx'),
        time: Date.now(),
        type: activeType,
        amount: amt,
        note: note || (activeType === 'payment' ? 'টাকা আদায়' : 'বাকি যোগ')
      });
      cust.u = Date.now();

      saveState();
      showToast('✓ লেনদেন রেকর্ড করা হয়েছে');
      openCustomerDetails(cust.id);
    };

    // Render history
    const histBox = document.getElementById('cust-history-box');
    let txs = (cust.txs || []).slice().reverse();
    if (txs.length === 0) {
      histBox.innerHTML = '<div style="color:var(--text-light); font-size:14px;">কোনো লেনদেন রেকর্ড নেই।</div>';
    } else {
      txs.forEach(t => {
        let isPay = t.type === 'payment';
        let div = document.createElement('div');
        div.style.cssText = `background:#FFFFFF; border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid ${isPay ? 'var(--primary)' : 'var(--accent)'};`;
        div.innerHTML = `
          <div>
            <div style="font-weight:700; font-size:15px;">${isPay ? '💵 টাকা পাওয়া গেছে' : '📒 বাকি দেওয়া হয়েছে'}</div>
            <div style="font-size:13px; color:var(--text-muted);">${formatBnDate(t.time)} ${t.note ? '· ' + t.note : ''}</div>
          </div>
          <div style="font-size:18px; font-weight:800; color:${isPay ? 'var(--primary)' : 'var(--accent)'};">
            ${isPay ? '-' : '+'}${formatMoney(t.amount)}
          </div>
        `;
        histBox.appendChild(div);
      });
    }

    // Delete customer guard: cannot delete if due > 0
    const delBtn = document.getElementById('cust-del-btn');
    if ((cust.due || 0) > 0) {
      delBtn.disabled = true;
      delBtn.title = 'বাকি থাকলে কাস্টমার মোছা যাবে না';
      delBtn.style.opacity = '0.5';
    } else {
      setDoubleTapConfirm(delBtn, 'নিশ্চিত মুছবেন?', function () {
        state.tomb[cust.id] = Date.now();
        saveState();
        renderDueLedger(bodyEl);
        showToast('✓ কাস্টমার মুছে ফেলা হয়েছে');
      });
    }
  }

  // 2. Shop Expenses & Cash Reconciliation
  function renderShopCash(container) {
    let todayStr = new Date().toISOString().split('T')[0];
    let cashLog = state.cashLogs[todayStr] || { opening: 0, actual: 0, notes: '' };

    // Today cash sales
    let today = new Date().toDateString();
    let todayCashSales = state.sales.filter(s => s.status === 'completed' && !s.isDue && new Date(s.time).toDateString() === today).reduce((acc, s) => acc + (s.totalPrice || 0), 0);

    // Today due collections
    let todayDueReceived = 0;
    state.customers.filter(c => !state.tomb[c.id]).forEach(c => {
      (c.txs || []).forEach(t => {
        if (t.type === 'payment' && new Date(t.time).toDateString() === today) {
          todayDueReceived += (t.amount || 0);
        }
      });
    });

    // Today digital services net cash effect (Recharge = -Cash given, Bkash In = +Cash, Bkash Out = -Cash)
    let todayServiceCashEffect = 0;
    state.services.filter(s => !state.tomb[s.id] && new Date(s.time).toDateString() === today).forEach(s => {
      if (s.type === 'বিকাশ ক্যাশ ইন' || s.type === 'বিদ্যুৎ বিল জমা') {
        todayServiceCashEffect += (s.amount || 0);
      } else if (s.type === 'বিকাশ ক্যাশ আউট' || s.type === 'মোবাইল রিচার্জ') {
        todayServiceCashEffect -= (s.amount || 0);
      }
    });

    // Today shop expenses
    let todayExpenses = state.expenses.filter(e => !state.tomb[e.id] && new Date(e.time).toDateString() === today).reduce((acc, e) => acc + (e.amount || 0), 0);

    // Today loan repayments
    let todayLoanRepayments = 0;
    state.loans.filter(l => !state.tomb[l.id]).forEach(l => {
      (l.repayments || []).forEach(r => {
        if (new Date(r.time).toDateString() === today) {
          todayLoanRepayments += (r.amount || 0);
        }
      });
    });

    let expectedCash = (cashLog.opening || 0) + todayCashSales + todayDueReceived + todayServiceCashEffect - todayExpenses - todayLoanRepayments;

    container.innerHTML = `
      <!-- Daily Cash Drawer Box -->
      <div class="card" style="margin-bottom:14px; background:#F0FDF4; border:1px solid #BBF7D0;">
        <h4 style="font-size:18px; font-weight:700; color:var(--primary); margin-bottom:8px;">💵 আজকের ক্যাশ মেলানো</h4>
        
        <div style="font-size:15px; display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between;">
            <span>সকালের ক্যাশ:</span>
            <input type="text" inputmode="numeric" id="cash-opening-input" style="width:100px; height:32px; text-align:right; font-weight:bold;" class="form-input" value="${toBn(cashLog.opening || 0, false)}">
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>+ নগদ বিক্রি:</span>
            <strong>${formatMoney(todayCashSales)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>+ বাকি আদায়:</span>
            <strong>${formatMoney(todayDueReceived)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>± রিচার্জ/বিকাশ প্রভাব:</span>
            <strong>${todayServiceCashEffect >= 0 ? '+' : ''}${formatMoney(todayServiceCashEffect)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>− দোকানের খরচ:</span>
            <strong>-${formatMoney(todayExpenses)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>− ধার শোধ:</span>
            <strong>-${formatMoney(todayLoanRepayments)}</strong>
          </div>
          <div style="border-top:1px dashed #BBF7D0; padding-top:6px; display:flex; justify-content:space-between; font-size:17px; font-weight:800; color:var(--primary);">
            <span>ক্যাশে থাকার কথা:</span>
            <span id="cash-expected-val">${formatMoney(expectedCash)}</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label" style="font-size:15px;">গুনে কত পেলেন? (টাকা)</label>
          <input type="text" inputmode="numeric" id="cash-actual-input" class="form-input" style="font-size:22px; font-weight:bold;" value="${cashLog.actual ? toBn(cashLog.actual, false) : ''}" placeholder="যেমন: ৫২০০">
        </div>

        <div id="cash-match-status" style="font-size:17px; font-weight:bold; margin-top:4px;"></div>
      </div>

      <!-- Add Shop Expense -->
      <div class="card" style="margin-bottom:14px;">
        <h4 style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:10px;">+ দোকানের খরচ যোগ করুন</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <select id="expense-type-select" class="form-select">
            <option value="বিদ্যুৎ বিল">বিদ্যুৎ বিল</option>
            <option value="চা-নাস্তা">চা-নাস্তা</option>
            <option value="দোকান ভাড়া">দোকান ভাড়া</option>
            <option value="মেরামত">মেরামত</option>
            <option value="পরিবহন">পরিবহন</option>
            <option value="মোবাইল/নেট">মোবাইল/নেট</option>
            <option value="অন্য খরচ">অন্য খরচ</option>
          </select>
          <input type="text" inputmode="numeric" id="expense-amount-input" class="form-input" placeholder="টাকা">
        </div>
        <input type="text" id="expense-note-input" class="form-input" placeholder="নোট (ঐচ্ছিক)" style="margin-bottom:8px;">
        <button type="button" id="expense-save-btn" class="btn-primary" style="height:42px;">খরচ যোগ করুন</button>
      </div>

      <!-- Monthly Expenses List -->
      <h4 style="font-size:18px; font-weight:700; margin-bottom:8px;">এই মাসের খরচের তালিকা</h4>
      <div id="expenses-list-box" style="display:flex; flex-direction:column; gap:6px;"></div>
    `;

    function updateCashDiff() {
      let openVal = parseBn(document.getElementById('cash-opening-input').value);
      let actVal = parseBn(document.getElementById('cash-actual-input').value);
      let exp = openVal + todayCashSales + todayDueReceived + todayServiceCashEffect - todayExpenses - todayLoanRepayments;
      document.getElementById('cash-expected-val').textContent = formatMoney(exp);

      const statusEl = document.getElementById('cash-match-status');
      if (actVal > 0) {
        let diff = actVal - exp;
        if (diff === 0) {
          statusEl.innerHTML = '<span style="color:var(--primary);">✓ ক্যাশ মিলে গেছে!</span>';
        } else if (diff > 0) {
          statusEl.innerHTML = `<span style="color:var(--primary);">৳${toBn(diff)} বেশি আছে</span>`;
        } else {
          statusEl.innerHTML = `<span style="color:var(--danger);">⚠️ ৳${toBn(Math.abs(diff))} কম আছে! (ঘাটতি)</span>`;
        }
      } else {
        statusEl.innerHTML = '';
      }

      state.cashLogs[todayStr] = { opening: openVal, actual: actVal };
      saveState();
    }

    document.getElementById('cash-opening-input').oninput = updateCashDiff;
    document.getElementById('cash-actual-input').oninput = updateCashDiff;
    updateCashDiff();

    document.getElementById('expense-save-btn').onclick = function () {
      let type = document.getElementById('expense-type-select').value;
      let amt = parseBn(document.getElementById('expense-amount-input').value);
      let note = document.getElementById('expense-note-input').value.trim();
      if (amt <= 0) {
        showToast('⚠️ খরচের টাকা লিখুন');
        return;
      }
      state.expenses.push({
        id: generateId('exp'),
        u: Date.now(),
        time: Date.now(),
        type,
        amount: amt,
        note
      });
      saveState();
      showToast('✓ খরচ যোগ হয়েছে');
      renderShopCash(container);
    };

    // Render monthly expenses
    const expBox = document.getElementById('expenses-list-box');
    let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let monthlyExps = state.expenses.filter(e => !state.tomb[e.id] && e.time >= monthStart).sort((a, b) => b.time - a.time);

    if (monthlyExps.length === 0) {
      expBox.innerHTML = '<div style="color:var(--text-light); font-size:14px;">এই মাসে কোনো খরচ নেই।</div>';
    } else {
      monthlyExps.forEach(e => {
        let row = document.createElement('div');
        row.style.cssText = 'background:#FFFFFF; border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;';
        row.innerHTML = `
          <div>
            <div style="font-weight:700; font-size:15px;">${e.type}</div>
            <div style="font-size:13px; color:var(--text-muted);">${formatBnDate(e.time)} ${e.note ? '· ' + e.note : ''}</div>
          </div>
          <div style="font-size:18px; font-weight:800; color:var(--danger);">${formatMoney(e.amount)}</div>
        `;
        expBox.appendChild(row);
      });
    }
  }

  // 3. Debts / Loans Tracker
  function renderLoans(container) {
    let activeLoans = state.loans.filter(l => !state.tomb[l.id]);
    let totalLoan = activeLoans.reduce((acc, l) => acc + (l.amount || 0), 0);
    let totalRepaid = activeLoans.reduce((acc, l) => acc + (l.repaid || 0), 0);
    let remaining = totalLoan - totalRepaid;

    // Monthly profit advisor
    let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let mSalesProfit = state.sales.filter(s => s.status === 'completed' && s.time >= monthStart).reduce((acc, s) => acc + (s.profit || 0), 0);
    let mComm = state.services.filter(s => !state.tomb[s.id] && s.time >= monthStart).reduce((acc, s) => acc + (s.commission || 0), 0);
    let mExp = state.expenses.filter(e => !state.tomb[e.id] && e.time >= monthStart).reduce((acc, e) => acc + (e.amount || 0), 0);
    let monthRealProfit = mSalesProfit + mComm - mExp;

    container.innerHTML = `
      <div style="background:var(--danger-light); padding:12px; border-radius:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:17px; font-weight:700; color:var(--danger);">বাকি ধার:</span>
        <span style="font-size:26px; font-weight:800; color:var(--danger);">${formatMoney(remaining)}</span>
      </div>

      <!-- Advisor Box -->
      <div class="alert-box alert-info" style="font-size:15px; margin-bottom:14px;">
        💡 এই মাসে আপনার আসল লাভ হয়েছে <strong>${formatMoney(monthRealProfit)}</strong>।<br>
        দোকানের মাল চালু রাখতে এর ৫০-৬০% (প্রায় <strong>${formatMoney(Math.max(0, monthRealProfit * 0.5))}</strong>) ধারের কিস্তিতে দেওয়া নিরাপদ।
      </div>

      <!-- Add Loan Button -->
      <div style="margin-bottom:14px;">
        <button type="button" id="add-loan-btn" class="btn-secondary">+ নতুন ধারের হিসাব যোগ করুন</button>
        <div id="add-loan-form" style="display:none; background:#F9FAFB; border:1px solid var(--border); padding:12px; border-radius:10px; margin-top:8px;">
          <div class="form-group">
            <label class="form-label">কার কাছ থেকে নিয়েছেন? *</label>
            <input type="text" id="loan-lender" class="form-input" placeholder="যেমন: রহিম চাচা">
          </div>
          <div class="form-group">
            <label class="form-label">ধারের মোট টাকা (৳) *</label>
            <input type="text" inputmode="numeric" id="loan-amount" class="form-input" placeholder="যেমন: ২০০০০">
          </div>
          <button type="button" id="save-loan-btn" class="btn-primary" style="height:44px;">সেভ করুন</button>
        </div>
      </div>

      <div id="loans-list-box" style="display:flex; flex-direction:column; gap:10px;"></div>
    `;

    document.getElementById('add-loan-btn').onclick = function () {
      let f = document.getElementById('add-loan-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('save-loan-btn').onclick = function () {
      let lender = document.getElementById('loan-lender').value.trim();
      let amt = parseBn(document.getElementById('loan-amount').value);
      if (!lender || amt <= 0) {
        showToast('⚠️ সঠিক তথ্য দিন');
        return;
      }
      state.loans.push({
        id: generateId('loan'),
        u: Date.now(),
        lender,
        amount: amt,
        repaid: 0,
        repayments: []
      });
      saveState();
      renderLoans(container);
      showToast('✓ ধারের হিসাব যোগ হয়েছে');
    };

    const list = document.getElementById('loans-list-box');
    if (activeLoans.length === 0) {
      list.innerHTML = '<div style="color:var(--text-light); text-align:center; padding:16px;">কোনো ধারের হিসাব নেই।</div>';
      return;
    }

    activeLoans.forEach(l => {
      let lRem = (l.amount || 0) - (l.repaid || 0);
      let pct = Math.min(100, Math.round(((l.repaid || 0) / (l.amount || 1)) * 100));

      let card = document.createElement('div');
      card.style.cssText = 'background:#FFFFFF; border:1px solid var(--border); border-radius:10px; padding:12px; box-shadow:var(--shadow);';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-weight:700; font-size:18px;">${l.lender}</div>
          <div style="font-weight:800; font-size:20px; color:var(--danger);">${formatMoney(lRem)} বাকি</div>
        </div>
        <div style="font-size:14px; color:var(--text-muted); margin-bottom:6px;">মোট ধার ${formatMoney(l.amount)} · শোধ হয়েছে ${formatMoney(l.repaid || 0)} (${toBn(pct)}%)</div>
        <div style="background:#E5E7EB; border-radius:6px; height:8px; overflow:hidden; margin-bottom:10px;">
          <div style="background:var(--primary); height:100%; width:${pct}%;"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" inputmode="numeric" class="form-input repay-amount" style="height:36px; font-size:15px; flex:1;" placeholder="শোধের টাকা">
          <button type="button" class="btn-primary repay-submit-btn" style="height:36px; font-size:15px; flex:1;">শোধ করলাম</button>
        </div>
      `;

      card.querySelector('.repay-submit-btn').onclick = function () {
        let rAmt = parseBn(card.querySelector('.repay-amount').value);
        if (rAmt <= 0) {
          showToast('⚠️ শোধের টাকা লিখুন');
          return;
        }
        l.repaid = (l.repaid || 0) + rAmt;
        if (!l.repayments) l.repayments = [];
        l.repayments.push({
          id: generateId('rep'),
          time: Date.now(),
          amount: rAmt,
          note: 'কিস্তি পরিশোধ'
        });
        l.u = Date.now();
        saveState();
        showToast('✓ কিস্তি শোধ রেকর্ড করা হয়েছে');
        renderLoans(container);
      };

      list.appendChild(card);
    });
  }

  // 4. Shopping Reorder List
  function renderShoppingList(container) {
    let activeItems = state.items.filter(it => !state.tomb[it.id]);

    // Group items needing reorder by market
    let marketGroups = {};
    activeItems.forEach(it => {
      let calc = computeItemCostAndStock(it);
      if (calc.availableStock <= 2) {
        let m = it.source || 'অন্য বাজার';
        if (!marketGroups[m]) marketGroups[m] = [];
        marketGroups[m].push({ item: it, avail: calc.availableStock, calc });
      }
    });

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4 style="font-size:18px; font-weight:700;">বাজারে কেনার তালিকা</h4>
        <button type="button" id="shop-wa-btn" class="btn-primary" style="height:36px; font-size:14px; width:auto; background-color:#25D366;">WhatsApp এ পাঠান</button>
      </div>

      <!-- Add custom item to list -->
      <div style="background:#F9FAFB; padding:10px; border-radius:10px; border:1px solid var(--border); margin-bottom:14px;">
        <div style="display:flex; gap:8px;">
          <input type="text" id="shop-custom-name" class="form-input" style="flex:1.5; height:38px; font-size:15px;" placeholder="মালের নাম">
          <input type="text" inputmode="numeric" id="shop-custom-qty" class="form-input" style="flex:0.8; height:38px; font-size:15px;" placeholder="কয়টা">
          <button type="button" id="shop-custom-add" class="btn-secondary" style="height:38px; font-size:15px; width:auto;">+ যোগ</button>
        </div>
      </div>

      <div id="shopping-groups-container"></div>
    `;

    const groupsBox = document.getElementById('shopping-groups-container');
    let mKeys = Object.keys(marketGroups);

    if (mKeys.length === 0 && (!state.shopList || state.shopList.length === 0)) {
      groupsBox.innerHTML = '<div style="color:var(--text-light); text-align:center; padding:16px;">কেনার মতো কোনো জরুরি মাল নেই।</div>';
    } else {
      mKeys.forEach(m => {
        let groupDiv = document.createElement('div');
        groupDiv.className = 'card';
        groupDiv.style.marginBottom = '10px';
        groupDiv.innerHTML = `<h5 style="font-size:17px; font-weight:700; color:var(--primary); margin-bottom:8px;">📍 ${m}</h5>`;

        marketGroups[m].forEach(g => {
          let row = document.createElement('div');
          row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);';
          row.innerHTML = `
            <div>
              <div style="font-weight:700; font-size:16px;">${g.item.name}</div>
              <div style="font-size:13px; color:var(--text-muted);">আছে: ${toBn(g.avail)}টা · শেষ কেনা: ৳${toBn(g.calc.unitCost)}/পিস</div>
            </div>
            <input type="checkbox" style="width:22px; height:22px; cursor:pointer;">
          `;
          groupDiv.appendChild(row);
        });

        groupsBox.appendChild(groupDiv);
      });
    }

    // WhatsApp share
    document.getElementById('shop-wa-btn').onclick = function () {
      let lines = ['🛒 দামের খাতা - কেনার তালিকা:'];
      mKeys.forEach(m => {
        lines.push(`\n📍 ${m}:`);
        marketGroups[m].forEach(g => {
          lines.push(`- ${g.item.name} (দোকানে আছে ${toBn(g.avail)}টা, শেষ দর ৳${toBn(g.calc.unitCost)})`);
        });
      });
      let text = lines.join('\n');
      navigator.clipboard.writeText(text).catch(() => {});
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      showToast('✓ তালিকা কপি হয়েছে এবং WhatsApp খোলা হচ্ছে');
    };

    document.getElementById('shop-custom-add').onclick = function () {
      let name = document.getElementById('shop-custom-name').value.trim();
      let qty = parseBn(document.getElementById('shop-custom-qty').value);
      if (!name) return;
      if (!state.shopList) state.shopList = [];
      state.shopList.push({ id: generateId('sl'), name, qty, market: 'স্থানীয় বাজার', done: false });
      saveState();
      renderShoppingList(container);
    };
  }

  // 5. Digital Services (Recharge, Bkash, etc.)
  function renderServices(container) {
    let today = new Date().toDateString();
    let todayComms = state.services.filter(s => !state.tomb[s.id] && new Date(s.time).toDateString() === today).reduce((acc, s) => acc + (s.commission || 0), 0);

    let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let monthlyComms = state.services.filter(s => !state.tomb[s.id] && s.time >= monthStart).reduce((acc, s) => acc + (s.commission || 0), 0);

    container.innerHTML = `
      <div style="background:var(--primary-light); padding:12px; border-radius:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:15px; color:var(--primary); font-weight:600;">আজকের কমিশন:</div>
          <div style="font-size:24px; font-weight:800; color:var(--primary);">${formatMoney(todayComms)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px; color:var(--primary); font-weight:600;">এই মাসের কমিশন:</div>
          <div style="font-size:24px; font-weight:800; color:var(--primary);">${formatMoney(monthlyComms)}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h4 style="font-size:18px; font-weight:700; margin-bottom:10px;">+ সেবা যোগ করুন</h4>
        <div class="form-group">
          <label class="form-label">সেবার ধরন</label>
          <select id="service-type-select" class="form-select">
            <option value="মোবাইল রিচার্জ">মোবাইল রিচার্জ</option>
            <option value="বিকাশ ক্যাশ আউট">বিকাশ ক্যাশ আউট</option>
            <option value="বিকাশ ক্যাশ ইন">বিকাশ ক্যাশ ইন</option>
            <option value="নগদ / রকেট">নগদ / রকেট</option>
            <option value="বিদ্যুৎ বিল জমা">বিদ্যুৎ বিল জমা</option>
            <option value="অন্য সেবা">অন্যান্য সেবা</option>
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="form-group">
            <label class="form-label">টাকার পরিমাণ</label>
            <input type="text" inputmode="numeric" id="service-amount-input" class="form-input" placeholder="যেমন: ১০০০">
          </div>
          <div class="form-group">
            <label class="form-label">আমার কমিশন (৳)</label>
            <input type="text" inputmode="numeric" id="service-comm-input" class="form-input" placeholder="যেমন: ১৫">
          </div>
        </div>
        <button type="button" id="service-save-btn" class="btn-primary" style="height:44px;">কমিশন যোগ করুন</button>
      </div>

      <h5 style="font-size:17px; font-weight:700; margin-bottom:8px;">সাম্প্রতিক সেবাসমূহ</h5>
      <div id="services-list-box" style="display:flex; flex-direction:column; gap:6px;"></div>
    `;

    // Auto-calculate remembered commission rate
    const typeSelect = document.getElementById('service-type-select');
    const amtInput = document.getElementById('service-amount-input');
    const commInput = document.getElementById('service-comm-input');

    amtInput.oninput = function () {
      let st = typeSelect.value;
      let amt = parseBn(amtInput.value);
      let rate = state.prefs.serviceRates[st];
      if (rate && amt > 0) {
        let c = Math.round((amt * rate) / 100);
        commInput.value = toBn(c, false);
      }
    };

    document.getElementById('service-save-btn').onclick = function () {
      let st = typeSelect.value;
      let amt = parseBn(amtInput.value);
      let comm = parseBn(commInput.value);
      if (amt <= 0 || comm < 0) {
        showToast('⚠️ সঠিক তথ্য লিখুন');
        return;
      }

      // Remember rate
      let rate = (comm / amt) * 100;
      state.prefs.serviceRates[st] = rate;

      state.services.push({
        id: generateId('srv'),
        u: Date.now(),
        time: Date.now(),
        type: st,
        amount: amt,
        commission: comm,
        rate: rate
      });
      saveState();
      showToast(`✓ ${formatMoney(comm)} কমিশন লাভে যোগ হয়েছে`);
      renderServices(container);
    };

    const sList = document.getElementById('services-list-box');
    let recent = state.services.filter(s => !state.tomb[s.id]).slice().reverse().slice(0, 15);
    if (recent.length === 0) {
      sList.innerHTML = '<div style="color:var(--text-light); font-size:14px;">কোনো সেবা রেকর্ড নেই।</div>';
    } else {
      recent.forEach(s => {
        let row = document.createElement('div');
        row.style.cssText = 'background:#FFFFFF; border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;';
        row.innerHTML = `
          <div>
            <div style="font-weight:700; font-size:15px;">${s.type} · ${formatMoney(s.amount)}</div>
            <div style="font-size:13px; color:var(--text-muted);">${formatBnDate(s.time)}</div>
          </div>
          <div style="font-size:18px; font-weight:800; color:var(--primary);">+${formatMoney(s.commission)}</div>
        `;
        sList.appendChild(row);
      });
    }
  }

  // 6. Wholesalers Directory
  function renderSuppliers(container) {
    let suppliers = state.suppliers.filter(s => !state.tomb[s.id]);

    container.innerHTML = `
      <div style="margin-bottom:14px;">
        <button type="button" id="add-sup-btn" class="btn-secondary">+ নতুন পাইকার যোগ করুন</button>
        <div id="add-sup-form" style="display:none; background:#F9FAFB; border:1px solid var(--border); padding:12px; border-radius:10px; margin-top:8px;">
          <div class="form-group">
            <label class="form-label">পাইকারের নাম/দোকান *</label>
            <input type="text" id="sup-name" class="form-input" placeholder="যেমন: মদিনা ক্লথ স্টোর">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div class="form-group">
              <label class="form-label">মোবাইল নম্বর *</label>
              <input type="text" inputmode="tel" id="sup-phone" class="form-input" placeholder="018xxxxxxxx">
            </div>
            <div class="form-group">
              <label class="form-label">বাজার</label>
              <input type="text" id="sup-market" class="form-input" placeholder="যেমন: বাবুরহাট">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">কী মাল ভালো দেয় / দাম কেমন?</label>
            <input type="text" id="sup-notes" class="form-input" placeholder="যেমন: লুঙ্গি ভালো দেয়">
          </div>
          <button type="button" id="save-sup-btn" class="btn-primary" style="height:44px;">সেভ করুন</button>
        </div>
      </div>

      <div id="sup-list-box" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    document.getElementById('add-sup-btn').onclick = function () {
      let f = document.getElementById('add-sup-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('save-sup-btn').onclick = function () {
      let name = document.getElementById('sup-name').value.trim();
      let phone = document.getElementById('sup-phone').value.trim();
      let market = document.getElementById('sup-market').value.trim();
      let notes = document.getElementById('sup-notes').value.trim();
      if (!name || !phone) {
        showToast('⚠️ নাম ও ফোন নম্বর দিন');
        return;
      }
      state.suppliers.push({
        id: generateId('sup'),
        u: Date.now(),
        name,
        phone,
        market,
        notes
      });
      saveState();
      renderSuppliers(container);
      showToast('✓ পাইকার যোগ হয়েছে');
    };

    const sBox = document.getElementById('sup-list-box');
    if (suppliers.length === 0) {
      sBox.innerHTML = '<div style="color:var(--text-light); text-align:center; padding:16px;">কোনো পাইকারের তথ্য নেই।</div>';
      return;
    }

    suppliers.forEach(s => {
      let card = document.createElement('div');
      card.style.cssText = 'background:#FFFFFF; border:1px solid var(--border); border-radius:10px; padding:12px; box-shadow:var(--shadow);';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; font-size:18px;">${s.name}</div>
            <div style="font-size:14px; color:var(--text-muted);">${s.market ? '📍 ' + s.market : ''} · ${s.phone}</div>
            ${s.notes ? `<div style="font-size:14px; color:var(--text); margin-top:4px;">"${s.notes}"</div>` : ''}
          </div>
          <div>
            <a href="tel:${s.phone}" class="btn-primary" style="height:38px; width:38px; border-radius:50%; text-decoration:none; display:flex; align-items:center; justify-content:center; font-size:18px;">📞</a>
          </div>
        </div>
      `;
      sBox.appendChild(card);
    });
  }

  // 7. Monthly Performance Report
  function renderMonthlyReport(container) {
    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    let now = new Date();
    let monthOptions = [];

    for (let i = 0; i < 6; i++) {
      let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthOptions.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${months[d.getMonth()]} ${toBn(d.getFullYear(), false)}`
      });
    }

    container.innerHTML = `
      <div class="form-group" style="margin-bottom:14px;">
        <label class="form-label">মাস বেছে নিন</label>
        <select id="report-month-select" class="form-select">
          ${monthOptions.map((m, idx) => `<option value="${idx}">${m.label}</option>`).join('')}
        </select>
      </div>

      <div id="monthly-report-content" class="card"></div>

      <button type="button" id="monthly-wa-btn" class="btn-primary" style="background-color:#25D366; margin-top:14px;">WhatsApp এ রিপোর্ট পাঠান</button>
    `;

    function updateReportView(mIdx) {
      let target = monthOptions[mIdx];
      let start = new Date(target.year, target.month, 1).getTime();
      let end = new Date(target.year, target.month + 1, 1).getTime();

      let mSales = state.sales.filter(s => s.status === 'completed' && s.time >= start && s.time < end);
      let totalSalesRev = mSales.reduce((acc, s) => acc + (s.totalPrice || 0), 0);
      let totalGoodsProfit = mSales.reduce((acc, s) => acc + (s.profit || 0), 0);
      let totalQtySold = mSales.reduce((acc, s) => acc + (s.qty || 0), 0);

      let mComm = state.services.filter(s => !state.tomb[s.id] && s.time >= start && s.time < end).reduce((acc, s) => acc + (s.commission || 0), 0);
      let mExp = state.expenses.filter(e => !state.tomb[e.id] && e.time >= start && e.time < end).reduce((acc, e) => acc + (e.amount || 0), 0);
      let realNetProfit = totalGoodsProfit + mComm - mExp;

      // New Goods Purchased in this month
      let mPurchased = state.items.filter(it => !state.tomb[it.id] && (it.createdAt || it.u) >= start && (it.createdAt || it.u) < end).reduce((acc, it) => acc + (it.totalCost || 0), 0);

      // Due given and collected in this month
      let mDueGiven = mSales.filter(s => s.isDue).reduce((acc, s) => acc + (s.totalPrice || 0), 0);
      let mDueCollected = 0;
      state.customers.filter(c => !state.tomb[c.id]).forEach(c => {
        (c.txs || []).forEach(t => {
          if (t.type === 'payment' && t.time >= start && t.time < end) {
            mDueCollected += (t.amount || 0);
          }
        });
      });

      // Top 5 items
      let salesCount = {};
      mSales.forEach(s => { salesCount[s.itemName] = (salesCount[s.itemName] || 0) + s.qty; });
      let top5 = Object.entries(salesCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const content = document.getElementById('monthly-report-content');
      content.innerHTML = `
        <h4 style="font-size:19px; font-weight:800; color:var(--primary); margin-bottom:12px; text-align:center;">📊 ${target.label}-এর রিপোর্ট</h4>

        <div style="display:flex; flex-direction:column; gap:8px; font-size:16px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>মোট বিক্রি:</span> <strong>${formatMoney(totalSalesRev)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>মাল বিক্রির লাভ:</span> <strong>${formatMoney(totalGoodsProfit)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>ডিজিটাল সেবা কমিশন:</span> <strong>${formatMoney(mComm)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>দোকানের খরচ:</span> <strong style="color:var(--danger);">-${formatMoney(mExp)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; background:var(--primary-light); padding:8px 10px; border-radius:8px; font-size:18px; font-weight:800; color:var(--primary);">
            <span>আসল লাভ:</span> <span>${formatMoney(realNetProfit)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px; margin-top:6px;">
            <span>নতুন মাল কেনা:</span> <strong>${formatMoney(mPurchased)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>বাকি দেওয়া:</span> <strong>${formatMoney(mDueGiven)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>বাকি আদায়:</span> <strong>${formatMoney(mDueCollected)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:4px;">
            <span>মোট পিস বিক্রি:</span> <strong>${toBn(totalQtySold)}টি</strong>
          </div>
        </div>

        <div style="margin-top:14px;">
          <h5 style="font-weight:700; margin-bottom:6px;">সেরা ৫টি বিক্রিত মাল:</h5>
          ${top5.map(([name, qty], idx) => `<div style="font-size:15px;">${toBn(idx + 1)}. ${name} (${toBn(qty)}টা)</div>`).join('') || '<div style="font-size:14px; color:var(--text-light);">বিক্রি নেই</div>'}
        </div>
      `;

      document.getElementById('monthly-wa-btn').onclick = function () {
        let text = `📊 দামের খাতা - ${target.label}-এর রিপোর্ট:\n` +
          `• মোট বিক্রি: ৳${toBn(totalSalesRev)}\n` +
          `• মাল বিক্রির লাভ: ৳${toBn(totalGoodsProfit)}\n` +
          `• কমিশন: ৳${toBn(mComm)}\n` +
          `• দোকান খরচ: ৳${toBn(mExp)}\n` +
          `• আসল লাভ: ৳${toBn(realNetProfit)}\n` +
          `• নতুন মাল কেনা: ৳${toBn(mPurchased)}\n` +
          `• বাকি আদায়: ৳${toBn(mDueCollected)}\n` +
          `• মোট বিক্রি: ${toBn(totalQtySold)} পিস\n` +
          `ধন্যবাদ।`;
        navigator.clipboard.writeText(text).catch(() => {});
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        showToast('✓ রিপোর্ট কপি হয়েছে এবং WhatsApp খোলা হচ্ছে');
      };
    }

    const select = document.getElementById('report-month-select');
    select.onchange = function () { updateReportView(parseInt(select.value)); };
    updateReportView(0);
  }

  // 8. Settings: Backup, PIN, Update, Drive Sync
  function renderSettings(container) {
    let lastBackupText = state.prefs.lastBackupTime ? formatBnDate(state.prefs.lastBackupTime) : 'কখনো নেওয়া হয়নি';
    let lastSyncText = state.prefs.lastSyncTime ? formatBnDate(state.prefs.lastSyncTime) : 'কখনো হয়নি';

    container.innerHTML = `
      <!-- 1. Phone Backup & Restore -->
      <div class="card" style="margin-bottom:14px;">
        <h4 style="font-size:18px; font-weight:700; margin-bottom:10px;">💾 Backup ও Restore</h4>
        <div style="font-size:14px; color:var(--text-muted); margin-bottom:10px;">শেষ Backup: ${lastBackupText}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button type="button" id="btn-do-backup" class="btn-primary" style="height:44px; font-size:15px;">ফোনে Backup নিন</button>
          <button type="button" id="btn-do-restore" class="btn-secondary" style="height:44px; font-size:15px;">Backup থেকে আনুন</button>
        </div>
      </div>

      <!-- 2. PIN & Fingerprint Security -->
      <div class="card" style="margin-bottom:14px;">
        <h4 style="font-size:18px; font-weight:700; margin-bottom:10px;">🔒 PIN ও আঙুলের ছাপ</h4>
        <div class="form-group" style="display:flex; justify-content:space-between; align-items:center;">
          <label class="form-label" style="margin:0;">৪ সংখ্যার PIN চালু করুন</label>
          <input type="checkbox" id="toggle-pin-enabled" style="width:24px; height:24px;" ${state.prefs.pinEnabled ? 'checked' : ''}>
        </div>

        <div id="pin-change-box" style="${state.prefs.pinEnabled ? '' : 'display:none;'} margin-top:10px; border-top:1px solid var(--border); padding-top:10px;">
          <div class="form-group">
            <label class="form-label" style="font-size:15px;">নতুন PIN দিন (৪ সংখ্যা)</label>
            <input type="password" inputmode="numeric" maxlength="4" id="setting-new-pin" class="form-input" placeholder="৪ সংখ্যা">
          </div>
          <button type="button" id="btn-save-new-pin" class="btn-secondary" style="height:40px; font-size:15px;">PIN পরিবর্তন করুন</button>
          
          <div class="form-group" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <label class="form-label" style="font-size:15px; margin:0;">আঙুলের ছাপ (Biometric) চালু</label>
            <input type="checkbox" id="toggle-bio-enabled" style="width:22px; height:22px;" ${state.prefs.bioEnabled ? 'checked' : ''}>
          </div>
        </div>
      </div>

      <!-- 3. Google Drive Sync (Two Phones) -->
      <div class="card" style="margin-bottom:14px;">
        <h4 style="font-size:18px; font-weight:700; color:var(--primary); margin-bottom:8px;">☁️ Google Drive ২-ফোন সিঙ্ক</h4>
        <p style="font-size:14px; color:var(--text-light); margin-bottom:10px;">Google Apps Script Web App লিংক দিয়ে দুই ফোন একসাথে চালান।</p>
        
        <div class="form-group">
          <label class="form-label" style="font-size:15px;">দোকানের ৮ সংখ্যার কোড</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="setting-store-code" class="form-input" style="font-weight:bold; font-size:20px; text-align:center; flex:1;" value="${state.storeCode}">
            <button type="button" id="btn-copy-code" class="btn-secondary" style="width:auto; padding:0 14px; font-size:14px;">Copy</button>
          </div>
          <span style="font-size:13px; color:var(--text-muted);">দ্বিতীয় ফোনেও ঠিক এই কোডটি লিখবেন।</span>
        </div>

        <div class="form-group">
          <label class="form-label" style="font-size:15px;">Apps Script Web App লিংক</label>
          <input type="url" id="setting-script-url" class="form-input" placeholder="https://script.google.com/macros/s/.../exec" value="${state.prefs.scriptUrl || ''}">
        </div>

        <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">শেষ মিলানোর সময়: ${lastSyncText}</div>

        <div style="display:flex; gap:10px;">
          <button type="button" id="btn-sync-now" class="btn-primary" style="height:44px; font-size:15px; flex:1;">এখনই মিলিয়ে নিন</button>
          <button type="button" id="btn-sync-stop" class="btn-danger" style="height:44px; font-size:15px; flex:1;">Sync বন্ধ করুন</button>
        </div>
      </div>

      <!-- 4. Version & Updates -->
      <div class="card">
        <h4 style="font-size:18px; font-weight:700; margin-bottom:6px;">📲 App Version ও আপডেট</h4>
        <div style="font-size:15px; color:var(--text-muted); margin-bottom:10px;">চলতি version: <strong>v${CURRENT_APP_VERSION}</strong></div>
        <button type="button" id="btn-check-update" class="btn-secondary" style="height:44px; font-size:15px;">নতুন version আছে কিনা দেখুন</button>
      </div>
    `;

    // 1. Backup button
    document.getElementById('btn-do-backup').onclick = function () {
      triggerBackup();
    };

    // Restore button
    document.getElementById('btn-do-restore').onclick = function () {
      triggerRestore();
    };

    // 2. PIN Toggle & Save
    const pinToggle = document.getElementById('toggle-pin-enabled');
    const pinBox = document.getElementById('pin-change-box');
    pinToggle.onchange = function () {
      if (pinToggle.checked) {
        let p = prompt('৪ সংখ্যার নতুন PIN দিন:');
        if (p && p.length === 4) {
          sha256(p).then(h => {
            state.prefs.pinEnabled = true;
            state.prefs.pinHash = h;
            sessionUnlocked = true;
            unlockExpiry = Date.now() + 10 * 60 * 1000;
            saveState();
            updateLockIcon();
            showToast('✓ PIN চালু হয়েছে');
            renderSettings(container);
          });
        } else {
          pinToggle.checked = false;
          showToast('⚠️ ৪ সংখ্যার PIN হতে হবে');
        }
      } else {
        state.prefs.pinEnabled = false;
        state.prefs.pinHash = '';
        saveState();
        updateLockIcon();
        showToast('✓ PIN নিষ্ক্রিয় করা হয়েছে');
        renderSettings(container);
      }
    };

    document.getElementById('btn-save-new-pin').onclick = function () {
      let p = document.getElementById('setting-new-pin').value.trim();
      if (p.length === 4) {
        sha256(p).then(h => {
          state.prefs.pinHash = h;
          saveState();
          showToast('✓ PIN পরিবর্তিত হয়েছে');
        });
      } else {
        showToast('⚠️ ৪ সংখ্যার PIN লিখুন');
      }
    };

    const bioToggle = document.getElementById('toggle-bio-enabled');
    if (bioToggle) {
      bioToggle.onchange = function () {
        state.prefs.bioEnabled = bioToggle.checked;
        saveState();
        showToast(bioToggle.checked ? '✓ আঙুলের ছাপ চালু হয়েছে' : 'আঙুলের ছাপ বন্ধ করা হয়েছে');
      };
    }

    // 3. Drive Sync
    document.getElementById('btn-copy-code').onclick = function () {
      navigator.clipboard.writeText(state.storeCode).catch(() => {});
      showToast('✓ দোকানের কোড কপি করা হয়েছে');
    };

    document.getElementById('btn-sync-now').onclick = function () {
      let url = document.getElementById('setting-script-url').value.trim();
      let code = document.getElementById('setting-store-code').value.trim();
      state.prefs.scriptUrl = url;
      state.storeCode = code;
      state.prefs.storeCode = code;
      saveState(true);
      if (!url) {
        showToast('⚠️ Apps Script URL দিন');
        return;
      }
      performDriveSync(true);
    };

    document.getElementById('btn-sync-stop').onclick = function () {
      state.prefs.scriptUrl = '';
      saveState(true);
      showToast('✓ Sync বন্ধ করা হয়েছে');
      renderSettings(container);
    };

    // 4. Update check
    document.getElementById('btn-check-update').onclick = function () {
      if (window.Android && window.Android.checkUpdate) {
        window.Android.checkUpdate();
      } else {
        showToast(`আপনার app টি সর্বাধুনিক version (v${CURRENT_APP_VERSION}) এ রয়েছে।`);
      }
    };
  }

  // --- 14. TWO-PHONE DELTA SYNC ENGINE (GOOGLE APPS SCRIPT) ---
  async function performDriveSync(isManual = false) {
    if (!state.prefs.scriptUrl || !state.storeCode) return;

    if (isManual) showToast('☁️ সিঙ্ক করা হচ্ছে...');

    try {
      let since = state.prefs.lastSyncTime || 0;

      // Extract records modified since last sync
      let payload = {
        action: 'sync',
        code: state.storeCode,
        since: since,
        changes: {
          items: state.items.filter(it => (it.u || 0) > since),
          sales: state.sales.filter(s => (s.u || 0) > since),
          trips: state.trips.filter(t => (t.u || 0) > since),
          customers: state.customers.filter(c => (c.u || 0) > since),
          loans: state.loans.filter(l => (l.u || 0) > since),
          expenses: state.expenses.filter(e => (e.u || 0) > since),
          services: state.services.filter(s => (s.u || 0) > since),
          suppliers: state.suppliers.filter(s => (s.u || 0) > since),
          shopList: state.shopList.filter(s => (s.u || 0) > since),
          tomb: state.tomb
        }
      };

      const res = await fetch(state.prefs.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.status === 'error') {
        showToast(`❌ Sync ব্যর্থ: ${data.message || 'কোড ভুল'}`);
        return;
      }

      if (data.status === 'ok') {
        mergeServerDelta(data.delta);
        state.prefs.lastSyncTime = data.serverTime || Date.now();
        saveState(true);
        renderHomeItems();
        if (isManual) showToast('✓ সিঙ্ক সম্পন্ন হয়েছে!');
      }
    } catch (e) {
      console.error('Sync failed:', e);
      if (isManual) showToast('❌ সিঙ্ক করতে পারেনি। ইন্টারনেট চেক করুন।');
    }
  }

  function mergeServerDelta(delta) {
    if (!delta) return;

    // Merge tombstones
    if (delta.tomb) {
      for (let k in delta.tomb) {
        state.tomb[k] = Math.max(state.tomb[k] || 0, delta.tomb[k]);
      }
    }

    // Merge sales (append-only list merge by unique id)
    if (delta.sales) {
      delta.sales.forEach(ss => {
        let existing = state.sales.find(s => s.id === ss.id);
        if (!existing) {
          state.sales.push(ss);
        } else if ((ss.u || 0) > (existing.u || 0)) {
          Object.assign(existing, ss);
        }
      });
    }

    // Merge items (last write wins by timestamp u)
    if (delta.items) {
      delta.items.forEach(si => {
        if (state.tomb[si.id] && state.tomb[si.id] >= (si.u || 0)) return;
        let existing = state.items.find(it => it.id === si.id);
        if (!existing) {
          state.items.push(si);
        } else if ((si.u || 0) > (existing.u || 0)) {
          Object.assign(existing, si);
        }
      });
    }

    // Merge trips (batches)
    if (delta.trips) {
      delta.trips.forEach(st => {
        if (state.tomb[st.id] && state.tomb[st.id] >= (st.u || 0)) return;
        let existing = state.trips.find(t => t.id === st.id);
        if (!existing) {
          state.trips.push(st);
        } else if ((st.u || 0) > (existing.u || 0)) {
          Object.assign(existing, st);
        }
      });
    }

    // Merge customers
    if (delta.customers) {
      delta.customers.forEach(sc => {
        if (state.tomb[sc.id] && state.tomb[sc.id] >= (sc.u || 0)) return;
        let existing = state.customers.find(c => c.id === sc.id);
        if (!existing) {
          state.customers.push(sc);
        } else if ((sc.u || 0) > (existing.u || 0)) {
          // Merge txs lists
          let mergedTxs = [...(existing.txs || [])];
          (sc.txs || []).forEach(tx => {
            if (!mergedTxs.some(t => t.id === tx.id)) mergedTxs.push(tx);
          });
          Object.assign(existing, sc);
          existing.txs = mergedTxs;
        }
      });
    }

    // Merge loans
    if (delta.loans) {
      delta.loans.forEach(sl => {
        if (state.tomb[sl.id] && state.tomb[sl.id] >= (sl.u || 0)) return;
        let existing = state.loans.find(l => l.id === sl.id);
        if (!existing) {
          state.loans.push(sl);
        } else if ((sl.u || 0) > (existing.u || 0)) {
          let mergedRep = [...(existing.repayments || [])];
          (sl.repayments || []).forEach(r => {
            if (!mergedRep.some(x => x.id === r.id)) mergedRep.push(r);
          });
          Object.assign(existing, sl);
          existing.repayments = mergedRep;
        }
      });
    }

    // Merge expenses
    if (delta.expenses) {
      delta.expenses.forEach(se => {
        if (state.tomb[se.id] && state.tomb[se.id] >= (se.u || 0)) return;
        let existing = state.expenses.find(e => e.id === se.id);
        if (!existing) state.expenses.push(se);
        else if ((se.u || 0) > (existing.u || 0)) Object.assign(existing, se);
      });
    }

    // Merge services
    if (delta.services) {
      delta.services.forEach(ss => {
        if (state.tomb[ss.id] && state.tomb[ss.id] >= (ss.u || 0)) return;
        let existing = state.services.find(s => s.id === ss.id);
        if (!existing) state.services.push(ss);
        else if ((ss.u || 0) > (existing.u || 0)) Object.assign(existing, ss);
      });
    }

    // Merge suppliers
    if (delta.suppliers) {
      delta.suppliers.forEach(ss => {
        if (state.tomb[ss.id] && state.tomb[ss.id] >= (ss.u || 0)) return;
        let existing = state.suppliers.find(s => s.id === ss.id);
        if (!existing) state.suppliers.push(ss);
        else if ((ss.u || 0) > (existing.u || 0)) Object.assign(existing, ss);
      });
    }
  }

  function triggerDebouncedSync() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      performDriveSync(false);
    }, 20000); // 20s debounce
  }

  // --- 15. BACKUP & RESTORE BRIDGE ---
  function triggerBackup() {
    let now = new Date();
    let y = now.getFullYear();
    let m = String(now.getMonth() + 1).padStart(2, '0');
    let d = String(now.getDate()).padStart(2, '0');
    let filename = `dokan-backup-${y}-${m}-${d}.json`;
    let json = JSON.stringify(state, null, 2);

    state.prefs.lastBackupTime = Date.now();
    saveState(true);

    if (window.Android && window.Android.backup) {
      window.Android.backup(filename, json);
    } else {
      // Browser download fallback
      let blob = new Blob([json], { type: 'application/json' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ ব্যাকআপ ফাইল ডাউনলোড হয়েছে');
    }
  }

  function triggerRestore() {
    if (window.Android && window.Android.pickBackup) {
      window.Android.pickBackup();
    } else {
      // Browser file input fallback
      const fin = document.getElementById('browser-backup-input');
      fin.onchange = function (e) {
        let file = e.target.files[0];
        if (!file) return;
        let reader = new FileReader();
        reader.onload = function (ev) {
          window.onBackup(ev.target.result);
        };
        reader.readAsText(file);
      };
      fin.click();
    }
  }

  // Native callback: onBackup
  window.onBackup = function (jsonStr) {
    try {
      let data = JSON.parse(jsonStr);
      let itemCount = (data.items || []).length;
      let ok = confirm(`Backup-এ ${toBn(itemCount)}টি জিনিস আছে। এখনকার হিসাব মুছে বসাবেন?`);
      if (ok) {
        state = Object.assign(state, data);
        state.prefs.pinEnabled = false; // Reset PIN on restore as specified
        state.prefs.pinHash = '';
        saveState(true);
        renderHomeItems();
        renderStatsScreen();
        showToast('✓ Backup সফলভাবে ফিরিয়ে আনা হয়েছে (PIN রিসেট হয়েছে)');
      }
    } catch (e) {
      showToast('❌ Backup ফাইল পড়া যায়নি!');
    }
  };

  window.onBackupSaved = function (path) {
    showToast(`✓ Backup ফাইল সেভ হয়েছে: ${path}`);
  };

  // --- 16. PHOTO PICKER & EXIF RESIZING ---
  function choosePhoto() {
    if (window.Android && window.Android.pickPhoto) {
      window.Android.pickPhoto(pendingPhotoSlot || 'single');
    } else {
      // Browser fallback
      const fin = document.getElementById('browser-file-input');
      fin.onchange = function (e) {
        let file = e.target.files[0];
        if (!file) return;
        let reader = new FileReader();
        reader.onload = function (ev) {
          // Compress to 360px JPEG
          let img = new Image();
          img.onload = function () {
            let canvas = document.createElement('canvas');
            let maxDim = 360;
            let w = img.width;
            let h = img.height;
            if (w > h && w > maxDim) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else if (h > maxDim) {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
            canvas.width = w;
            canvas.height = h;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            let dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            window.onPhoto(pendingPhotoSlot || 'single', dataUrl);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
      fin.click();
    }
  }

  // Native callback: onPhoto
  window.onPhoto = function (slot, dataUrl) {
    if (slot === 'batch') {
      const prev = document.getElementById('batch-item-photo-preview');
      prev.innerHTML = `<img src="${dataUrl}" class="thumb-img">`;
      document.getElementById('batch-item-photo-clear').style.display = 'inline-block';
      prev.dataset.photo = dataUrl;
    } else if (slot === 'single') {
      const prev = document.getElementById('single-photo-preview');
      prev.innerHTML = `<img src="${dataUrl}" class="thumb-img">`;
      document.getElementById('single-photo-clear').style.display = 'inline-block';
      prev.dataset.photo = dataUrl;
    } else if (slot === 'edit') {
      const prev = document.getElementById('edit-thumb-box');
      prev.innerHTML = `<img src="${dataUrl}" class="thumb-img">`;
      let it = state.items.find(x => x.id === prev.dataset.itemId);
      if (it) {
        it.photo = dataUrl;
        saveState();
      }
    }
  };

  // --- 17. APP UPDATES & WATCHDOG ---
  window.onUpdateReady = function () {
    const box = document.getElementById('toast-box');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.backgroundColor = '#1F7A52';
    toast.innerHTML = `
      <span>app-এর নতুন version এসেছে!</span>
      <button class="toast-undo-btn" style="background:#FFFFFF; color:#1F7A52;">এখনই চালু করুন</button>
    `;
    toast.querySelector('button').onclick = function () {
      if (window.Android && window.Android.reload) {
        window.Android.reload();
      } else {
        location.reload();
      }
    };
    box.appendChild(toast);
  };

  window.onUpdateCheck = function (hasUpdate, ver) {
    if (hasUpdate) {
      window.onUpdateReady();
    } else {
      showToast(`আপনার app টি সর্বাধুনিক version (v${ver || CURRENT_APP_VERSION}) এ রয়েছে।`);
    }
  };

  window.onBio = function (success) {
    if (success) {
      sessionUnlocked = true;
      unlockExpiry = Date.now() + 10 * 60 * 1000;
      updateLockIcon();
      closeSheet('overlay-pin');
      showToast('✓ আঙুলের ছাপ সঠিক হয়েছে');
      if (pendingAuthCallback) {
        let cb = pendingAuthCallback;
        pendingAuthCallback = null;
        cb();
      }
    } else {
      showToast('❌ আঙুলের ছাপ মেলেনি! PIN দিন।');
    }
  };

  // Lifecycle resume from background
  window.onAppResume = function (elapsedSeconds) {
    if (elapsedSeconds > 60 && state.prefs.pinEnabled) {
      sessionUnlocked = false;
      updateLockIcon();
      closeAllSheets();
      switchTab('home');
    }
    // Perform sync check on resume
    if (state.prefs.scriptUrl) {
      performDriveSync(false);
    }
  };

  // Hardware Back button handling
  window.onBackPressed = function () {
    // 1. Close open modal/sheet if any
    const activeOverlay = document.querySelector('.modal-overlay.active');
    if (activeOverlay) {
      activeOverlay.classList.remove('active');
      return true; // handled
    }
    // 2. Go to home screen if not on home
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id !== 'screen-home') {
      switchTab('home');
      return true; // handled
    }
    return false; // let Android handle exit
  };

  // --- 18. SHEET & TAB ROUTING ---
  function openSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function closeSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  function closeAllSheets() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
  }

  function switchTab(tabId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    const targetScreen = document.getElementById(`screen-${tabId}`);
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);

    if (targetScreen) targetScreen.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if (tabId === 'home') {
      renderHomeItems();
    } else if (tabId === 'add') {
      initBatchMode();
    } else if (tabId === 'stats') {
      renderStatsScreen();
    }
  }

  // --- 19. EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    // Bottom tabs click
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.onclick = function () {
        let tab = btn.dataset.tab;
        if (tab === 'stats' || tab === 'more') {
          requireAuth(() => switchTab(tab));
        } else {
          switchTab(tab);
        }
      };
    });

    // Top lock button
    const lockBtn = document.getElementById('top-lock-btn');
    if (lockBtn) {
      lockBtn.onclick = function () {
        lockApp();
      };
    }

    // Search bar
    const searchBox = document.getElementById('search-box');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchBox) {
      searchBox.oninput = function () {
        currentSearchQuery = searchBox.value;
        searchClear.style.display = currentSearchQuery ? 'flex' : 'none';
        renderHomeItems();
      };
    }
    if (searchClear) {
      searchClear.onclick = function () {
        searchBox.value = '';
        currentSearchQuery = '';
        searchClear.style.display = 'none';
        renderHomeItems();
      };
    }

    // Category chips
    document.getElementById('category-chips').querySelectorAll('.chip').forEach(chip => {
      chip.onclick = function () {
        document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategoryFilter = chip.dataset.cat;
        renderHomeItems();
      };
    });

    // View toggle
    document.getElementById('view-list-btn').onclick = function () {
      document.getElementById('view-list-btn').classList.add('active');
      document.getElementById('view-grid-btn').classList.remove('active');
      state.prefs.viewMode = 'list';
      saveState(true);
      renderHomeItems();
    };
    document.getElementById('view-grid-btn').onclick = function () {
      document.getElementById('view-grid-btn').classList.add('active');
      document.getElementById('view-list-btn').classList.remove('active');
      state.prefs.viewMode = 'grid';
      saveState(true);
      renderHomeItems();
    };

    // Subtabs in Add Stock
    document.getElementById('subtab-batch-btn').onclick = function () {
      setActiveSubtab('batch');
    };
    document.getElementById('subtab-bulk-btn').onclick = function () {
      setActiveSubtab('bulk');
    };
    document.getElementById('subtab-single-btn').onclick = function () {
      setActiveSubtab('single');
    };

    function setActiveSubtab(mode) {
      document.getElementById('subtab-batch-btn').classList.toggle('active', mode === 'batch');
      document.getElementById('subtab-bulk-btn').classList.toggle('active', mode === 'bulk');
      document.getElementById('subtab-single-btn').classList.toggle('active', mode === 'single');

      document.getElementById('subscreen-batch').style.display = mode === 'batch' ? 'block' : 'none';
      document.getElementById('subscreen-bulk').style.display = mode === 'bulk' ? 'block' : 'none';
      document.getElementById('subscreen-single').style.display = mode === 'single' ? 'block' : 'none';

      if (mode === 'batch') initBatchMode();
    }

    // Batch Market select custom toggle
    const batchMarketSelect = document.getElementById('batch-market-select');
    const batchCustomMarket = document.getElementById('batch-custom-market');
    batchMarketSelect.onchange = function () {
      if (batchMarketSelect.value === '__other__') {
        batchCustomMarket.style.display = 'block';
      } else {
        batchCustomMarket.style.display = 'none';
        let b = state.trips.find(t => t.id === activeBatchId);
        if (b) {
          b.market = batchMarketSelect.value;
          saveState();
        }
      }
    };
    batchCustomMarket.oninput = function () {
      let b = state.trips.find(t => t.id === activeBatchId);
      if (b) {
        b.market = batchCustomMarket.value.trim();
        saveState();
      }
    };

    // Batch Fare
    document.getElementById('batch-fare-input').oninput = function (e) {
      let b = state.trips.find(t => t.id === activeBatchId);
      if (b) {
        b.fare = parseBn(e.target.value);
        saveState();
        recalculateBatchOverheads();
      }
    };

    // Add cost row to batch
    document.getElementById('batch-add-cost-btn').onclick = function () {
      let b = state.trips.find(t => t.id === activeBatchId);
      if (b) {
        if (!b.otherCosts) b.otherCosts = [];
        b.otherCosts.push({ id: generateId('cost'), name: 'লেবার', amount: 0 });
        saveState();
        renderBatchCostsList();
      }
    };

    // Batch item photo
    document.getElementById('batch-item-photo-btn').onclick = function () {
      pendingPhotoSlot = 'batch';
      choosePhoto();
    };
    document.getElementById('batch-item-photo-clear').onclick = function () {
      const prev = document.getElementById('batch-item-photo-preview');
      prev.innerHTML = '📷';
      prev.dataset.photo = '';
      document.getElementById('batch-item-photo-clear').style.display = 'none';
    };

    // Batch item variants toggle
    document.getElementById('batch-toggle-variants-btn').onclick = function () {
      const box = document.getElementById('batch-variants-box');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };

    let batchVariantsTemp = [];
    function renderBatchVariants() {
      const list = document.getElementById('batch-variants-list');
      list.innerHTML = '';
      batchVariantsTemp.forEach((v, idx) => {
        let row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.innerHTML = `
          <input type="text" class="form-input" placeholder="সাইজ/রং (যেমন: L বা লাল)" value="${v.name || ''}" style="flex:1.2; height:38px; font-size:15px;">
          <input type="text" inputmode="numeric" class="form-input" placeholder="কয়টা" value="${toBn(v.qty || 0, false)}" style="flex:0.8; height:38px; font-size:15px;">
          <button type="button" class="sheet-close-btn" style="width:34px; height:34px; flex-shrink:0;">✕</button>
        `;
        row.querySelectorAll('input')[0].oninput = function (e) { v.name = e.target.value.trim(); };
        row.querySelectorAll('input')[1].oninput = function (e) { v.qty = parseBn(e.target.value); };
        row.querySelector('button').onclick = function () {
          batchVariantsTemp.splice(idx, 1);
          renderBatchVariants();
        };
        list.appendChild(row);
      });
    }

    document.getElementById('batch-add-variant-row-btn').onclick = function () {
      batchVariantsTemp.push({ id: generateId('var'), name: '', qty: 0 });
      renderBatchVariants();
    };

    // Add item to batch button
    document.getElementById('batch-save-item-btn').onclick = function () {
      let name = document.getElementById('batch-item-name').value.trim();
      let cat = document.getElementById('batch-item-cat').value;
      let qty = parseBn(document.getElementById('batch-item-qty').value);
      let cost = parseBn(document.getElementById('batch-item-cost').value);
      let sellInput = document.getElementById('batch-item-sell').value.trim();

      if (!name) { showToast('⚠️ মালের নাম দিন'); return; }
      if (qty <= 0) { showToast('⚠️ মালের সংখ্যা কমপক্ষে ১ হতে হবে'); return; }
      if (cost <= 0) { showToast('⚠️ মোট কেনা দাম দিন'); return; }

      let photo = document.getElementById('batch-item-photo-preview').dataset.photo || '';
      let isAuto30 = false;
      let sellPrice = parseBn(sellInput);

      if (!sellInput || sellPrice <= 0) {
        // Auto 30% profit rounded to 5 Tk
        let batch = state.trips.find(t => t.id === activeBatchId);
        let batchOverhead = computeBatchOverhead(batch);
        let approxUnitCost = (cost + (batchOverhead / 5)) / qty;
        sellPrice = suggest30PercentPrice(approxUnitCost);
        isAuto30 = true;
      }

      // Sync variants
      let variants = [];
      if (batchVariantsTemp.length > 0) {
        variants = batchVariantsTemp.filter(v => v.name.trim() !== '');
        let vSum = variants.reduce((acc, v) => acc + (v.qty || 0), 0);
        if (vSum > 0) qty = vSum;
      }

      let newItem = {
        id: generateId('item'),
        u: Date.now(),
        name,
        cat,
        source: document.getElementById('batch-market-select').value,
        photo,
        qty,
        totalCost: cost,
        fare: 0,
        otherCosts: [],
        batchId: activeBatchId,
        batchShare: 0,
        customFare: 0,
        customOtherCost: 0,
        sellPrice,
        isAuto30,
        variants,
        soldBase: 0,
        createdAt: Date.now()
      };

      state.items.push(newItem);
      saveState();

      // Clear input fields for next item
      document.getElementById('batch-item-name').value = '';
      document.getElementById('batch-item-qty').value = '';
      document.getElementById('batch-item-cost').value = '';
      document.getElementById('batch-item-sell').value = '';
      document.getElementById('batch-item-photo-preview').innerHTML = '📷';
      document.getElementById('batch-item-photo-preview').dataset.photo = '';
      document.getElementById('batch-item-photo-clear').style.display = 'none';
      batchVariantsTemp = [];
      renderBatchVariants();
      document.getElementById('batch-variants-box').style.display = 'none';

      recalculateBatchOverheads();
      showToast(`✓ "${name}" ব্যাচে যোগ হয়েছে`);
    };

    // Finish Batch
    document.getElementById('batch-finish-btn').onclick = function () {
      let b = state.trips.find(t => t.id === activeBatchId);
      if (b) {
        b.status = 'closed';
        b.u = Date.now();
        saveState();
        showToast('✓ ব্যাচ সমাপ্ত হয়েছে!');
        switchTab('home');
      }
    };

    // Bulk text preview on typing
    const bulkInput = document.getElementById('bulk-text-input');
    const bulkPreviewBox = document.getElementById('bulk-preview-box');
    const bulkPreviewList = document.getElementById('bulk-preview-list');

    bulkInput.oninput = function () {
      let parsed = parseBulkLines(bulkInput.value);
      if (parsed.length === 0) {
        bulkPreviewBox.style.display = 'none';
        return;
      }
      bulkPreviewBox.style.display = 'block';
      bulkPreviewList.innerHTML = '';
      parsed.forEach(p => {
        let div = document.createElement('div');
        div.style.cssText = `font-size:14px; padding:4px 8px; border-radius:6px; background:${p.valid ? '#ECFDF5' : '#FEF2F2'}; color:${p.valid ? '#065F46' : '#991B1B'}; border:1px solid ${p.valid ? '#A7F3D0' : '#FECACA'};`;
        if (p.valid) {
          let sPrice = p.sell > 0 ? formatMoney(p.sell) : '৩০% স্বয়ংক্রিয়';
          div.textContent = `✓ ${p.name}: ${toBn(p.qty)}টা, কেনা ${formatMoney(p.cost)}, বিক্রি ${sPrice}`;
        } else {
          div.textContent = `✕ লাইন ${toBn(p.lineNum)}: "${p.raw}" - ফরম্যাট ভুল`;
        }
        bulkPreviewList.appendChild(div);
      });
    };

    document.getElementById('bulk-save-btn').onclick = function () {
      let parsed = parseBulkLines(bulkInput.value);
      let validOnes = parsed.filter(p => p.valid);
      if (validOnes.length === 0) {
        showToast('⚠️ কোনো সঠিক লাইন পাওয়া যায়নি!');
        return;
      }

      let mkt = document.getElementById('bulk-market').value;
      let cat = document.getElementById('bulk-cat').value;
      let fare = parseBn(document.getElementById('bulk-fare').value);
      let other = parseBn(document.getElementById('bulk-other').value);

      // Create new batch for this bulk entry
      let newBatch = {
        id: generateId('batch'),
        u: Date.now(),
        time: Date.now(),
        market: mkt,
        fare: fare,
        otherCosts: other > 0 ? [{ id: generateId('oc'), name: 'অন্য খরচ', amount: other }] : [],
        itemIds: [],
        status: 'closed'
      };
      state.trips.push(newBatch);

      let totalGoods = validOnes.reduce((acc, p) => acc + p.cost, 0);
      let totalOverhead = fare + other;

      validOnes.forEach(p => {
        let share = totalGoods > 0 ? (p.cost / totalGoods) * totalOverhead : (totalOverhead / validOnes.length);
        let unitCost = (p.cost + share) / p.qty;
        let isAuto30 = !p.sell || p.sell <= 0;
        let sellPrice = isAuto30 ? suggest30PercentPrice(unitCost) : p.sell;

        let newItem = {
          id: generateId('item'),
          u: Date.now(),
          name: p.name,
          cat: cat,
          source: mkt,
          photo: '',
          qty: p.qty,
          totalCost: p.cost,
          fare: 0,
          otherCosts: [],
          batchId: newBatch.id,
          batchShare: share,
          customFare: 0,
          customOtherCost: 0,
          sellPrice: sellPrice,
          isAuto30: isAuto30,
          variants: [],
          soldBase: 0,
          createdAt: Date.now()
        };
        state.items.push(newItem);
        newBatch.itemIds.push(newItem.id);
      });

      saveState();
      bulkInput.value = '';
      bulkPreviewBox.style.display = 'none';
      showToast(`✓ ${toBn(validOnes.length)}টি জিনিস সফলভাবে সেভ হয়েছে!`);
      switchTab('home');
    };

    // Mode C: Single item live calculations
    function updateSingleItemCalc() {
      let qty = parseBn(document.getElementById('single-qty').value);
      let cost = parseBn(document.getElementById('single-cost').value);
      let fare = parseBn(document.getElementById('single-fare').value);
      let other = parseBn(document.getElementById('single-other').value);
      let sell = parseBn(document.getElementById('single-sell').value);

      let grandCost = cost + fare + other;
      let unitCost = qty > 0 ? (grandCost / qty) : 0;
      let unitProfit = sell - unitCost;
      let totalProfit = qty * unitProfit;
      let auto30 = suggest30PercentPrice(unitCost);

      document.getElementById('single-calc-unit-cost').textContent = formatMoney(unitCost);
      document.getElementById('single-calc-profit').textContent = formatMoney(unitProfit);
      document.getElementById('single-calc-total-profit').textContent = formatMoney(totalProfit);

      const autoLink = document.getElementById('single-auto-30-link');
      autoLink.textContent = `৩০% লাভে দাম ${formatMoney(auto30)} — এটা বসান`;
      autoLink.onclick = function (e) {
        e.preventDefault();
        document.getElementById('single-sell').value = toBn(auto30, false);
        updateSingleItemCalc();
      };
    }

    ['single-qty', 'single-cost', 'single-fare', 'single-other', 'single-sell'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = updateSingleItemCalc;
    });

    // Single item photo
    document.getElementById('single-photo-btn').onclick = function () {
      pendingPhotoSlot = 'single';
      choosePhoto();
    };
    document.getElementById('single-photo-clear').onclick = function () {
      const prev = document.getElementById('single-photo-preview');
      prev.innerHTML = '📷';
      prev.dataset.photo = '';
      document.getElementById('single-photo-clear').style.display = 'none';
    };

    function saveSingleItem(stayOnAdd = false) {
      let name = document.getElementById('single-name').value.trim();
      let cat = document.getElementById('single-cat').value;
      let src = document.getElementById('single-source').value.trim();
      let qty = parseBn(document.getElementById('single-qty').value);
      let cost = parseBn(document.getElementById('single-cost').value);
      let fare = parseBn(document.getElementById('single-fare').value);
      let other = parseBn(document.getElementById('single-other').value);
      let sell = parseBn(document.getElementById('single-sell').value);

      if (!name) { showToast('⚠️ মালের নাম দিন'); return; }
      if (qty <= 0) { showToast('⚠️ সংখ্যা কমপক্ষে ১ হতে হবে'); return; }
      if (cost <= 0) { showToast('⚠️ কেনা দাম দিন'); return; }

      let photo = document.getElementById('single-photo-preview').dataset.photo || '';
      let newItem = {
        id: generateId('item'),
        u: Date.now(),
        name,
        cat,
        source: src || 'স্থানীয় বাজার',
        photo,
        qty,
        totalCost: cost,
        fare,
        otherCosts: other > 0 ? [{ id: generateId('oc'), name: 'অন্য খরচ', amount: other }] : [],
        batchId: null,
        batchShare: 0,
        customFare: 0,
        customOtherCost: 0,
        sellPrice: sell,
        isAuto30: false,
        variants: [],
        soldBase: 0,
        createdAt: Date.now()
      };

      state.items.push(newItem);
      saveState();

      showToast(`✓ "${name}" সেভ হয়েছে`);

      if (stayOnAdd) {
        document.getElementById('single-name').value = '';
        document.getElementById('single-qty').value = '';
        document.getElementById('single-cost').value = '';
        document.getElementById('single-fare').value = '০';
        document.getElementById('single-other').value = '০';
        document.getElementById('single-sell').value = '';
        document.getElementById('single-photo-preview').innerHTML = '📷';
        document.getElementById('single-photo-preview').dataset.photo = '';
        document.getElementById('single-photo-clear').style.display = 'none';
        updateSingleItemCalc();
      } else {
        switchTab('home');
      }
    }

    document.getElementById('single-save-another-btn').onclick = function () { saveSingleItem(true); };
    document.getElementById('single-save-finish-btn').onclick = function () { saveSingleItem(false); };

    // Sale Sheet Stepper & Price
    document.getElementById('sale-qty-minus').onclick = function () {
      if (activeSaleQty > 1) {
        activeSaleQty--;
        updateSaleQtyDisplay();
        updateSaleCalculation();
      }
    };
    document.getElementById('sale-qty-plus').onclick = function () {
      if (activeSaleQty < activeSaleMaxQty) {
        activeSaleQty++;
        updateSaleQtyDisplay();
        updateSaleCalculation();
      } else {
        showToast(`দোকানে মাত্র ${toBn(activeSaleMaxQty)}টা আছে`);
      }
    };
    document.getElementById('sale-qty-input').oninput = function (e) {
      let val = parseBn(e.target.value);
      if (val > activeSaleMaxQty) val = activeSaleMaxQty;
      activeSaleQty = Math.max(1, val);
      updateSaleCalculation();
    };
    document.getElementById('sale-price-input').oninput = function () {
      updateSaleCalculation();
    };

    // Sale Payment Mode Toggle
    document.getElementById('sale-pay-cash-btn').onclick = function () {
      document.getElementById('sale-pay-cash-btn').classList.add('active');
      document.getElementById('sale-pay-due-btn').classList.remove('active');
      document.getElementById('sale-customer-section').style.display = 'none';
    };
    document.getElementById('sale-pay-due-btn').onclick = function () {
      document.getElementById('sale-pay-due-btn').classList.add('active');
      document.getElementById('sale-pay-cash-btn').classList.remove('active');
      document.getElementById('sale-customer-section').style.display = 'block';
    };

    document.getElementById('sale-add-customer-btn').onclick = function () {
      const box = document.getElementById('sale-new-customer-box');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('sale-confirm-btn').onclick = function () {
      confirmSale();
    };

    // Close buttons for sheets
    document.getElementById('sale-close-btn').onclick = function () { closeSheet('overlay-sale'); };
    document.getElementById('edit-close-btn').onclick = function () { closeSheet('overlay-edit-item'); };
    document.getElementById('more-detail-close-btn').onclick = function () { closeSheet('overlay-more-detail'); };
    document.getElementById('pin-close-btn').onclick = function () { closeSheet('overlay-pin'); };
    document.getElementById('recovery-close-btn').onclick = function () { closeSheet('overlay-recovery'); };

    // PIN Keypad Buttons
    document.querySelectorAll('.keypad-btn[data-key]').forEach(btn => {
      btn.onclick = function () {
        if (pinBuffer.length < 4) {
          pinBuffer += btn.dataset.key;
          updatePinDots();
          if (pinBuffer.length === 4) {
            setTimeout(checkEnteredPin, 100);
          }
        }
      };
    });

    document.getElementById('pin-back-btn').onclick = function () {
      if (pinBuffer.length > 0) {
        pinBuffer = pinBuffer.slice(0, -1);
        updatePinDots();
      }
    };

    document.getElementById('pin-bio-btn').onclick = function () {
      if (window.Android && window.Android.bio) {
        window.Android.bio();
      } else {
        showToast('আঙুলের ছাপ শুধু ফোনে কাজ করে');
      }
    };

    // Forgot PIN recovery
    document.getElementById('pin-forgot-btn').onclick = function () {
      closeSheet('overlay-pin');
      openSheet('overlay-recovery');
    };

    document.getElementById('recovery-submit-btn').onclick = function () {
      let entered = parseBn(document.getElementById('recovery-cost-input').value);
      if (entered <= 0) {
        showToast('⚠️ কেনা দাম লিখুন');
        return;
      }
      let match = state.items.some(it => !state.tomb[it.id] && (it.totalCost === entered || Math.abs(it.totalCost - entered) < 1));
      if (match) {
        state.prefs.pinEnabled = false;
        state.prefs.pinHash = '';
        saveState();
        updateLockIcon();
        closeSheet('overlay-recovery');
        showToast('✓ দাম মিলে গেছে! আপনার PIN রিসেট করা হয়েছে।');
      } else {
        showToast('❌ এই কেনা দামের কোনো মাল পাওয়া যায়নি!');
      }
    };

    // More tiles clicks
    const tiles = ['due', 'cash', 'loans', 'shopping', 'services', 'suppliers', 'monthly', 'settings'];
    tiles.forEach(t => {
      const el = document.getElementById(`tile-${t}`);
      if (el) {
        el.onclick = function () {
          openMoreTile(t);
        };
      }
    });

    document.getElementById('more-lock-now-btn').onclick = function () {
      lockApp();
    };
  }

  // --- 20. INITIALIZATION ---
  window.addEventListener('DOMContentLoaded', function () {
    loadState();
    setupEventListeners();
    updateLockIcon();
    renderHomeItems();

    // Signal ready to Android native watchdog
    if (window.Android && window.Android.ready) {
      try { window.Android.ready(); } catch (e) {}
    }

    // Auto-check drive sync on start if configured
    if (state.prefs.scriptUrl) {
      setTimeout(() => performDriveSync(false), 1500);
    }
  });

})();
