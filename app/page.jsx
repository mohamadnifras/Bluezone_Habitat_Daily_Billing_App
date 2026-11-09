'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

const STORAGE_KEY = 'bluezone_habitat_bills_v1';
const DRAFT_KEY = 'bluezone_habitat_draft_v1';

const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function lessThanThousand(n) {
  n = Math.floor(n);
  if (!n) return '';
  let a = [];
  if (n >= 100) {
    a.push(units[Math.floor(n / 100)] + ' Hundred');
    n = n % 100;
  }
  if (n >= 20) {
    let s = tens[Math.floor(n / 10)];
    if (n % 10) s += ' ' + units[n % 10];
    a.push(s);
  } else if (n > 0) {
    a.push(units[n]);
  }
  return a.join(' ');
}

function numberWords(n) {
  n = Math.floor(n);
  if (!n) return 'Zero';
  if (n >= 1e12) return n.toLocaleString('en-IN');
  const parts = [];
  const scales = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
    [1, '']
  ];
  for (const [val, name] of scales) {
    let count = Math.floor(n / val);
    n %= val;
    if (count) parts.push(lessThanThousand(count) + (name ? ' ' + name : ''));
  }
  return parts.join(' ');
}

function inWords(value) {
  value = Math.max(0, Math.round(value * 100) / 100);
  let rupees = Math.floor(value);
  let paise = Math.round((value - rupees) * 100);
  return `${numberWords(rupees)} Rupees${paise ? ' and ' + numberWords(paise) + ' Paise' : ''} Only.`;
}

function today() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function fmtDate(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '—';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

function amount(n) {
  return Math.max(0, Number(n) || 0);
}

function money(n) {
  return '₹' + amount(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function commas(n) {
  return amount(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getInitialDefaults(bills = []) {
  const nums = bills
    .map(b => parseInt(b.form?.requestNumber, 10))
    .filter(x => Number.isFinite(x) && x >= 0 && x <= 9999999);
  const nextNum = String(Math.max(0, ...nums) + 1);

  return {
    requestNumber: nextNum,
    requestDate: today(),
    paymentDate: today(),
    requestedBy: 'AMAL',
    workArea: '',
    urgency: 'Normal',
    taxAmount: '0',
    otherCharges: '0',
    advanceAmount: '0',
    budgetStatus: '',
    remarks: '',
    accountsName: '',
    accountsDate: '',
    projectHeadName: '',
    projectStatus: '',
    chairmanName: '',
    chairmanStatus: '',
    projectDate: '',
    chairmanDate: ''
  };
}

function sanitizeForm(raw = {}) {
  return {
    requestNumber: String(raw.requestNumber ?? ''),
    requestDate: String(raw.requestDate ?? today()),
    paymentDate: String(raw.paymentDate ?? today()),
    requestedBy: String(raw.requestedBy ?? 'AMAL'),
    workArea: String(raw.workArea ?? ''),
    urgency: String(raw.urgency ?? 'Normal'),
    taxAmount: String(raw.taxAmount ?? '0'),
    otherCharges: String(raw.otherCharges ?? '0'),
    advanceAmount: String(raw.advanceAmount ?? '0'),
    budgetStatus: String(raw.budgetStatus ?? ''),
    remarks: String(raw.remarks ?? ''),
    accountsName: String(raw.accountsName ?? ''),
    accountsDate: String(raw.accountsDate ?? ''),
    projectHeadName: String(raw.projectHeadName ?? ''),
    projectStatus: String(raw.projectStatus ?? ''),
    chairmanName: String(raw.chairmanName ?? ''),
    chairmanStatus: String(raw.chairmanStatus ?? ''),
    projectDate: String(raw.projectDate ?? ''),
    chairmanDate: String(raw.chairmanDate ?? '')
  };
}

export default function DailyBillingApp() {
  const [view, setView] = useState('create'); // 'create' | 'history'
  const [bills, setBills] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm] = useState(() => sanitizeForm(getInitialDefaults()));
  const [items, setItems] = useState([]);

  // Composer item form state
  const [composerDesc, setComposerDesc] = useState('');
  const [composerDate, setComposerDate] = useState(today());
  const [composerAmount, setComposerAmount] = useState('');
  const [composerQty, setComposerQty] = useState('');
  const [composerUnit, setComposerUnit] = useState('');
  const [composerRate, setComposerRate] = useState('');
  const [showExtraFields, setShowExtraFields] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(-1);

  // Search filter for history
  const [searchHistory, setSearchHistory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Toast state
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimerRef = useRef(null);

  // File input ref for backup import
  const fileInputRef = useRef(null);
  const descInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastShow(false);
    }, 3600);
  };

  // Next Request Number generator based on loaded bills
  const getNextNumber = (billList = bills) => {
    const nums = billList
      .map(b => parseInt(b.form?.requestNumber, 10))
      .filter(x => Number.isFinite(x) && x >= 0 && x <= 9999999);
    return String(Math.max(0, ...nums) + 1);
  };

  // Draft loaded flag to prevent premature overwrite on initial mount
  const isDraftReadyRef = useRef(false);

  // Load draft and fetch bills from Database API on mount
  useEffect(() => {
    let hasDraft = false;

    // 1. Restore active draft synchronously on mount FIRST
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft && typeof draft === 'object' && draft.form && Array.isArray(draft.items)) {
        if (draft.items.length > 0 || draft.currentId || (draft.form.requestNumber && draft.form.requestNumber !== '1')) {
          setCurrentId(draft.currentId || null);
          setForm(sanitizeForm(draft.form));
          setItems(draft.items);
          if (draft.form.requestDate) {
            setComposerDate(draft.form.requestDate);
          }
          hasDraft = true;
        }
      }
    } catch {
      // ignore
    }

    // 2. Fetch bills from Database API (Google Sheets / local Excel)
    const fetchBills = async () => {
      try {
        const res = await fetch('/api/bills');
        const data = await res.json();
        if (data.success && Array.isArray(data.bills)) {
          setBills(data.bills);
          // If no active draft was restored, load the latest bill from Google Sheets so screen is never blank!
          if (!hasDraft && data.bills.length > 0) {
            const latest = data.bills[0];
            setCurrentId(latest.id);
            setForm(sanitizeForm(latest.form));
            setItems(latest.items || []);
            hasDraft = true;
          } else if (!hasDraft) {
            setForm(prev => sanitizeForm({
              ...prev,
              requestNumber: getNextNumber(data.bills)
            }));
          }
        }
      } catch (err) {
        console.warn('Database fetch fallback to localStorage:', err);
        try {
          const local = localStorage.getItem(STORAGE_KEY);
          if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) {
              setBills(parsed);
              if (!hasDraft && parsed.length > 0) {
                const latest = parsed[0];
                setCurrentId(latest.id);
                setForm(sanitizeForm(latest.form));
                setItems(latest.items || []);
              }
            }
          }
        } catch {
          // ignore
        }
      } finally {
        // Mark draft as ready so subsequent changes will safely persist
        isDraftReadyRef.current = true;
      }
    };

    fetchBills();
  }, []);

  // Sync draft to local storage on user changes (only after initial load is ready)
  useEffect(() => {
    if (!isDraftReadyRef.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId, form, items }));
    } catch {
      // ignore
    }
  }, [currentId, form, items]);

  // Totals calculations
  const itemsSubtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + amount(it.amount), 0);
  }, [items]);

  const currentNetPayable = useMemo(() => {
    const sub = itemsSubtotal;
    const tax = amount(form.taxAmount);
    const other = amount(form.otherCharges);
    const adv = amount(form.advanceAmount);
    return Math.max(0, Math.round((sub + tax + other - adv) * 100) / 100);
  }, [itemsSubtotal, form.taxAmount, form.otherCharges, form.advanceAmount]);

  const totalSavedBillsAmount = useMemo(() => {
    return bills.reduce((sum, b) => {
      const f = b.form || {};
      const itms = Array.isArray(b.items) ? b.items : [];
      const sub = itms.reduce((a, x) => a + amount(x.amount), 0);
      const tax = amount(f.taxAmount);
      const other = amount(f.otherCharges);
      const adv = amount(f.advanceAmount);
      return sum + Math.max(0, Math.round((sub + tax + other - adv) * 100) / 100);
    }, 0);
  }, [bills]);

  // Paginate items for print / PDF output into discrete A4 pages matching official Bluezone layout
  const printPages = useMemo(() => {
    if (!items || items.length === 0) {
      return [{ items: [], isLastPage: true, startIndex: 0 }];
    }
    if (items.length <= 12) {
      return [{ items, isLastPage: true, startIndex: 0 }];
    }
    const INTERMEDIATE_CAPACITY = 13;
    const LAST_PAGE_CAPACITY = 12;

    const pages = [];
    let remaining = [...items];
    let currentStart = 0;

    while (remaining.length > 0) {
      if (remaining.length <= LAST_PAGE_CAPACITY) {
        pages.push({
          items: remaining,
          isLastPage: true,
          startIndex: currentStart
        });
        break;
      }
      let take = INTERMEDIATE_CAPACITY;
      const leftover = remaining.length - take;
      if (leftover > 0 && leftover < 3) {
        take = remaining.length - 4;
      }
      const chunk = remaining.slice(0, take);
      pages.push({
        items: chunk,
        isLastPage: false,
        startIndex: currentStart
      });
      currentStart += take;
      remaining = remaining.slice(take);
    }
    return pages;
  }, [items]);

  // Handlers for form inputs
  const handleFormChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => {
      const updated = { ...prev, [id]: value };
      if (id === 'requestNumber') {
        // If request number is changed from the currently saved bill's number, disconnect currentId so it doesn't overwrite!
        const existing = bills.find(b => b.id === currentId);
        if (existing && existing.form?.requestNumber?.trim() !== value?.trim()) {
          setCurrentId(null);
        }
      }
      if (id === 'requestDate' && items.length === 0 && !composerDate) {
        setComposerDate(value);
      }
      return updated;
    });
  };

  // Composer auto-calculation: Amount = Qty * Rate
  const handleQtyChange = (e) => {
    const q = e.target.value;
    setComposerQty(q);
    if (q !== '' && composerRate !== '') {
      setComposerAmount(String(Math.round(Number(q) * Number(composerRate) * 100) / 100));
    }
  };

  const handleRateChange = (e) => {
    const r = e.target.value;
    setComposerRate(r);
    if (composerQty !== '' && r !== '') {
      setComposerAmount(String(Math.round(Number(composerQty) * Number(r) * 100) / 100));
    }
  };

  const resetComposer = () => {
    setComposerDesc('');
    setComposerDate(form.requestDate || today());
    setComposerAmount('');
    setComposerQty('');
    setComposerUnit('');
    setComposerRate('');
    setEditingItemIndex(-1);
  };

  const handleItemSubmit = (e) => {
    e.preventDefault();
    const desc = composerDesc.trim();
    const date = composerDate;
    const price = Number(composerAmount);

    if (!desc || !date || !Number.isFinite(price) || price < 0) {
      showToast('Enter a description, bill date and valid amount.');
      return;
    }

    const newItem = {
      desc,
      date,
      amount: Math.round(price * 100) / 100,
      qty: composerQty,
      unit: composerUnit.trim(),
      rate: composerRate
    };

    if (editingItemIndex >= 0) {
      setItems(prev => {
        const copy = [...prev];
        copy[editingItemIndex] = newItem;
        return copy;
      });
      showToast('Expense updated.');
    } else {
      setItems(prev => [...prev, newItem]);
    }

    resetComposer();
    if (descInputRef.current) descInputRef.current.focus();
  };

  const handleEditItem = (index) => {
    const it = items[index];
    if (!it) return;
    setEditingItemIndex(index);
    setComposerDesc(it.desc || '');
    setComposerDate(it.date || today());
    setComposerAmount(String(it.amount || ''));
    setComposerQty(it.qty || '');
    setComposerUnit(it.unit || '');
    setComposerRate(it.rate || '');
    if (it.qty || it.rate || it.unit) {
      setShowExtraFields(true);
    }
    const formElem = document.getElementById('itemForm');
    if (formElem) formElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (descInputRef.current) descInputRef.current.focus();
  };

  const handleDeleteItem = (index) => {
    if (window.confirm('Remove this expense from the bill?')) {
      setItems(prev => prev.filter((_, i) => i !== index));
      if (editingItemIndex === index) {
        resetComposer();
      }
    }
  };

  // Start a new bill
  const handleNewBill = () => {
    if (items.length && !window.confirm('Start a new bill? Your current unsaved changes will be replaced. You can save this bill first.')) {
      return;
    }
    const newDefaults = getInitialDefaults(bills);
    setCurrentId(null);
    setItems([]);
    setForm(newDefaults);
    resetComposer();
    setView('create');
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: null, form: newDefaults, items: [] }));
    } catch {
      // ignore
    }
    showToast('New blank approval sheet ready.');
  };

  // Save bill to Database API & LocalStorage
  const handleSaveBill = async () => {
    if (isSaving) return;

    // 1. Auto-include pending composer item if user entered details but didn't click "Add expense"
    let currentItems = [...items];
    if (composerDesc.trim() && Number(composerAmount) > 0) {
      const pendingItem = {
        desc: composerDesc.trim(),
        date: composerDate || today(),
        amount: Math.round(Number(composerAmount) * 100) / 100,
        qty: composerQty,
        unit: composerUnit.trim(),
        rate: composerRate
      };
      if (editingItemIndex >= 0) {
        currentItems[editingItemIndex] = pendingItem;
      } else {
        currentItems.push(pendingItem);
      }
      setItems(currentItems);
      resetComposer();
    }

    if (!currentItems.length) {
      showToast('Add at least one expense before saving.');
      if (descInputRef.current) descInputRef.current.focus();
      return;
    }

    let reqNum = form.requestNumber?.trim() || '';
    if (!reqNum) {
      reqNum = getNextNumber();
    }

    // Check uniqueness of requestNumber
    const matching = bills.find(b => b.form?.requestNumber?.trim() === reqNum && b.id !== currentId);
    if (matching && !currentId) {
      // Auto-assign next free request number to avoid duplicate error
      reqNum = getNextNumber();
    }

    // If user changed request number on an existing bill, treat as new bill!
    let billId = currentId;
    const existing = bills.find(b => b.id === currentId);
    if (existing && existing.form?.requestNumber?.trim() !== reqNum) {
      billId = null;
    }
    if (!billId) {
      billId = `bzh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    const billPayload = {
      id: billId,
      form: { ...form, requestNumber: reqNum },
      items: JSON.parse(JSON.stringify(currentItems)),
      updatedAt: new Date().toISOString()
    };

    // Optimistically update local state immediately so UI updates with ZERO delay!
    setCurrentId(billId);
    setBills(prev => {
      const idx = prev.findIndex(b => b.id === billId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = billPayload;
        return copy;
      }
      return [billPayload, ...prev];
    });

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: billId, form: { ...form, requestNumber: reqNum }, items: currentItems }));
    } catch {
      // ignore
    }

    setIsSaving(true);
    showToast('Saving bill to Google Sheets...');

    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billPayload)
      });
      const data = await res.json();
      if (data.success && data.bill) {
        setCurrentId(data.bill.id);
        setForm(prev => ({ ...prev, requestNumber: reqNum }));
        if (Array.isArray(data.bills)) {
          setBills(data.bills);
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: data.bill.id, form: { ...form, requestNumber: reqNum }, items: currentItems }));
          } catch {
            // ignore
          }
        }
        showToast('✓ Saved directly to Google Sheet!');
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (err) {
      console.warn('Google Sheets save error:', err);
      showToast('❌ Save error: ' + (err.message || 'Please check connection'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenBill = (id) => {
    const b = bills.find(x => x.id === id);
    if (!b) return;
    setCurrentId(b.id);
    const clonedItems = JSON.parse(JSON.stringify(b.items || []));
    const cleanForm = sanitizeForm(b.form);
    setItems(clonedItems);
    setForm(cleanForm);
    resetComposer();
    setView('create');
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: b.id, form: cleanForm, items: clonedItems }));
    } catch {
      // ignore
    }
    showToast('Saved bill opened for editing.');
  };

  const handleDuplicateBill = (id) => {
    const b = bills.find(x => x.id === id);
    if (!b) return;
    setCurrentId(null);
    const clonedItems = JSON.parse(JSON.stringify(b.items || []));
    setItems(clonedItems);
    const duplicatedForm = sanitizeForm({
      ...b.form,
      requestNumber: getNextNumber(),
      requestDate: today(),
      paymentDate: today()
    });
    setForm(duplicatedForm);
    resetComposer();
    setView('create');
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: null, form: duplicatedForm, items: clonedItems }));
    } catch {
      // ignore
    }
    showToast('Copy created. Review details before saving.');
  };

  const handleDeleteBill = async (id) => {
    const b = bills.find(x => x.id === id);
    if (!b) return;
    if (!window.confirm(`Delete request #${b.form?.requestNumber} from Google Sheet? This cannot be undone.`)) {
      return;
    }

    try {
      showToast('Deleting bill from Google Sheet...');
      const res = await fetch(`/api/bills?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success && Array.isArray(data.bills)) {
        setBills(data.bills);
      } else {
        setBills(prev => prev.filter(x => x.id !== id));
      }
      showToast('✓ Bill deleted from Google Sheet.');
    } catch (err) {
      console.error('Delete API error:', err);
      showToast('❌ Delete failed: ' + (err.message || 'Error'));
    }

    if (currentId === id) {
      setCurrentId(null);
      setItems([]);
      const def = getInitialDefaults(bills.filter(x => x.id !== id));
      setForm(def);
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentId: null, form: def, items: [] }));
      } catch {
        // ignore
      }
    }
  };

  const handleExportBackup = () => {
    const pack = {
      application: 'Bluezone Habitat Daily Accounts',
      version: 1,
      exportedAt: new Date().toISOString(),
      bills,
      activeDraft: { currentId, form, items }
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bluezone-Habitat-Backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup downloaded. Store it somewhere safe.');
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup file is too large.');
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || data.application !== 'Bluezone Habitat Daily Accounts' || !Array.isArray(data.bills)) {
        throw new Error('Not a valid Bluezone billing backup.');
      }

      if (!window.confirm(`Import ${data.bills.length} saved bills? Bills with matching IDs will be replaced. Other saved bills will be kept.`)) {
        return;
      }

      // Sync with server API
      try {
        await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bills: data.bills })
        });
      } catch (err) {
        console.error('Server backup import error:', err);
      }

      const map = new Map(bills.map(b => [b.id, b]));
      data.bills.forEach(b => {
        if (b && b.id && b.form && Array.isArray(b.items)) {
          map.set(b.id, b);
        }
      });
      const merged = Array.from(map.values());
      setBills(merged);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
      showToast(`${data.bills.length} bills imported and synchronized with Excel database.`);
    } catch (err) {
      showToast('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Filtered bills for History view
  const filteredBills = useMemo(() => {
    const term = searchHistory.trim().toLowerCase();
    return [...bills]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .filter(b => {
        const formStr = [
          b.form?.requestNumber,
          b.form?.requestDate,
          b.form?.requestedBy,
          b.form?.workArea,
          ...(Array.isArray(b.items) ? b.items.map(i => i.desc) : [])
        ].join(' ').toLowerCase();
        return formStr.includes(term);
      });
  }, [bills, searchHistory]);

  const memoText = useMemo(() => {
    return [form.budgetStatus ? ('Budget: ' + form.budgetStatus) : '', form.remarks].filter(Boolean).join(' | ') || '—';
  }, [form.budgetStatus, form.remarks]);

  return (
    <div className="app" suppressHydrationWarning>
      <aside suppressHydrationWarning>
        <div className="brand">
          <div className="brand-icon">B</div>
          <div>
            <div className="brand-title">BLUEZONE<br />HABITAT</div>
            <div className="brand-sub">Accounts Studio</div>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="nav-label">Workspace</div>
          <button
            className={`nav-btn ${view === 'create' ? 'active' : ''}`}
            type="button"
            id="navCreate"
            onClick={() => setView('create')}
          >
            <span className="nav-ico">▤</span> New &amp; edit bill
          </button>
          <button
            className={`nav-btn ${view === 'history' ? 'active' : ''}`}
            type="button"
            id="navHistory"
            onClick={() => {
              setView('history');
              fetch('/api/bills')
                .then(r => r.json())
                .then(d => {
                  if (d.success && Array.isArray(d.bills)) {
                    setBills(d.bills);
                  }
                })
                .catch(() => {});
            }}
          >
            <span className="nav-ico">▣</span> Saved bills
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="secure">● Google Sheet Connected</span>
          <p>Bills are securely saved directly to your Google Sheet in real-time. Export backups regularly.</p>
          <div className="sidebar-backup-col">
            <a
              href="/api/export-excel"
              className="btn small btn-excel"
              title="Download Microsoft Excel Workbook (.xlsx)"
            >
              ⇩ Download Excel (.xlsx)
            </a>
            <button id="exportBackup" className="btn small" type="button" onClick={handleExportBackup}>
              ⇩ Export JSON backup
            </button>
          </div>
          <div className="sidebar-import-wrap">
            <button
              className="link-btn link-import"
              id="importBackupBtn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Import backup
            </button>
          </div>
          <input
            id="importBackupInput"
            type="file"
            accept=".json,application/json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportBackup}
          />
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <div className="eyebrow">Project finance workspace</div>
            <h1 id="pageTitle">{view === 'history' ? 'Saved approval sheets' : 'Daily accounts approval'}</h1>
            <p className="subheading" id="pageSub">
              {view === 'history'
                ? 'All your Google Sheet synchronized Bluezone Habitat payment requests.'
                : 'Enter expenses one by one, generate a clean A4 approval sheet.'}
            </p>
          </div>
          <div className={`actions ${view === 'history' ? 'hidden' : ''}`} id="topActions">
            <button className="btn" type="button" id="newBillBtn" onClick={handleNewBill}>
              ＋ New bill
            </button>
            <button className="btn navy" type="button" id="saveBillBtn" onClick={handleSaveBill} disabled={isSaving}>
              {isSaving ? '⏳ Saving...' : '✓ Save bill'}
            </button>
            <button className="btn primary" type="button" id="printBillBtn" onClick={() => window.print()}>
              ⇩ Print / PDF
            </button>
          </div>
        </header>

        <div className="content">
          <div className="metrics">
            <div className="metric">
              <div>
                <div className="cap">Saved bills</div>
                <strong id="metricBills">{bills.length}</strong>
              </div>
              <div className="metric-icon">▤</div>
            </div>
            <div className="metric">
              <div>
                <div className="cap">Saved amount</div>
                <strong id="metricTotal">{money(totalSavedBillsAmount)}</strong>
              </div>
              <div className="metric-icon">₹</div>
            </div>
            <div className="metric">
              <div>
                <div className="cap">Current bill</div>
                <strong id="metricCurrent">{money(currentNetPayable)}</strong>
              </div>
              <div className="metric-icon">↗</div>
            </div>
          </div>

          {/* CREATE / EDIT BILL VIEW */}
          <section id="createView" className={view === 'history' ? 'hidden' : ''}>
            <div className="workarea">
              <div className="editor">
                {/* 01 Request Information */}
                <section className="panel">
                  <div className="panel-h">
                    <div className="panel-title">
                      <span className="step">01</span> Request information
                    </div>
                    <span className="muted" id="currentBadge">
                      {currentId ? 'Editing saved bill' : 'New draft'}
                    </span>
                  </div>
                  <div className="panel-body">
                    <div className="fields">
                      <div>
                        <label htmlFor="requestNumber">Approval request no.</label>
                        <input
                          id="requestNumber"
                          type="text"
                          maxLength={40}
                          placeholder="e.g. 25"
                          value={form.requestNumber || ''}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="requestDate">Request date</label>
                        <input
                          id="requestDate"
                          type="date"
                          value={form.requestDate || ''}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="paymentDate">Required payment date</label>
                        <input
                          id="paymentDate"
                          type="date"
                          value={form.paymentDate || ''}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="requestedBy">Requested by</label>
                        <input
                          id="requestedBy"
                          type="text"
                          maxLength={80}
                          placeholder="e.g. Amal"
                          value={form.requestedBy || ''}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="workArea">Department / work area</label>
                        <input
                          id="workArea"
                          type="text"
                          maxLength={100}
                          placeholder="e.g. Site work"
                          value={form.workArea || ''}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <label htmlFor="urgency">Urgency</label>
                        <select
                          id="urgency"
                          value={form.urgency || 'Normal'}
                          onChange={handleFormChange}
                        >
                          <option value="Normal">Normal</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 02 Add Expenses */}
                <section className="panel" id="itemsPanel">
                  <div className="panel-h">
                    <div className="panel-title">
                      <span className="step">02</span> Add expenses, one by one
                    </div>
                    <span className="muted" id="itemCount">
                      {items.length} item{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="panel-body">
                    <form className="composer" id="itemForm" onSubmit={handleItemSubmit}>
                      <div className="composer-grid">
                        <div>
                          <label htmlFor="itemDesc">Item / service description *</label>
                          <input
                            id="itemDesc"
                            ref={descInputRef}
                            maxLength={250}
                            placeholder="e.g. Workers wages"
                            required
                            autoComplete="off"
                            value={composerDesc || ''}
                            onChange={(e) => setComposerDesc(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="itemDate">Bill date *</label>
                          <input
                            id="itemDate"
                            type="date"
                            required
                            value={composerDate || ''}
                            onChange={(e) => setComposerDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="itemAmount">Amount (₹) *</label>
                          <input
                            id="itemAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            required
                            value={composerAmount || ''}
                            onChange={(e) => setComposerAmount(e.target.value)}
                          />
                        </div>
                      </div>

                      <div id="itemExtraFields" className={`extra ${showExtraFields ? '' : 'hidden'}`}>
                        <div>
                          <label htmlFor="itemQty">Quantity</label>
                          <input
                            type="number"
                            id="itemQty"
                            step="0.01"
                            min="0"
                            placeholder="1"
                            value={composerQty || ''}
                            onChange={handleQtyChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="itemUnit">Unit</label>
                          <input
                            id="itemUnit"
                            maxLength={30}
                            placeholder="Nos / Sq.ft"
                            value={composerUnit || ''}
                            onChange={(e) => setComposerUnit(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="itemRate">Rate (₹)</label>
                          <input
                            id="itemRate"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={composerRate || ''}
                            onChange={handleRateChange}
                          />
                        </div>
                      </div>

                      <div className="composer-foot">
                        <button
                          className="link-btn"
                          type="button"
                          id="toggleDetails"
                          onClick={() => setShowExtraFields(prev => !prev)}
                        >
                          {showExtraFields ? '− Hide quantity & rate' : '＋ Optional quantity & rate'}
                        </button>
                        <div>
                          <button
                            className={`btn small ${editingItemIndex >= 0 ? '' : 'hidden'}`}
                            type="button"
                            id="cancelEdit"
                            onClick={resetComposer}
                          >
                            Cancel
                          </button>
                          <button className="btn primary" type="submit" id="addItemBtn">
                            {editingItemIndex >= 0 ? '✓ Update expense' : '＋ Add expense'}
                          </button>
                        </div>
                      </div>
                    </form>

                    <div className="item-grid-head">
                      <span>Description</span>
                      <span>Bill date</span>
                      <span>Amount</span>
                      <span style={{ textAlign: 'right' }}>Actions</span>
                    </div>

                    <div id="itemsList">
                      {items.length === 0 ? (
                        <div className="empty-state">
                          <span className="empty-symbol">▤</span>
                          No expenses added yet.<br />
                          Use the form above to add your first item.
                        </div>
                      ) : (
                        items.map((it, i) => (
                          <div className="item-row" key={i}>
                            <div className="item-main">
                              <strong>{it.desc}</strong>
                              <span>
                                {it.qty ? `${it.qty} ${it.unit || 'units'}` : 'Expense item'}
                                {it.rate ? ` · Rate ${money(it.rate)}` : ''}
                              </span>
                            </div>
                            <div className="item-date">{fmtDate(it.date)}</div>
                            <div className="item-amount">{money(it.amount)}</div>
                            <div className="row-buttons">
                              <button
                                type="button"
                                className="icon-btn"
                                title="Edit expense"
                                aria-label={`Edit expense ${i + 1}`}
                                onClick={() => handleEditItem(i)}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="icon-btn delete"
                                title="Delete expense"
                                aria-label={`Delete expense ${i + 1}`}
                                onClick={() => handleDeleteItem(i)}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="running-total">
                      <span>Current subtotal</span>
                      <strong id="editorSubtotal">{money(itemsSubtotal)}</strong>
                    </div>
                  </div>
                </section>

                {/* 03 Adjustments & remarks */}
                <section className="panel">
                  <details id="adjustmentsDetails">
                    <summary>
                      <span className="step">03</span> Adjustments &amp; remarks (optional)
                    </summary>
                    <div className="panel-body">
                      <div className="fields">
                        <div>
                          <label htmlFor="taxAmount">GST / tax (₹)</label>
                          <input
                            id="taxAmount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.taxAmount || '0'}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="otherCharges">Other charges (₹)</label>
                          <input
                            id="otherCharges"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.otherCharges || '0'}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="advanceAmount">Less advance / TDS (₹)</label>
                          <input
                            id="advanceAmount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.advanceAmount || '0'}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="budgetStatus">Budget status</label>
                          <select
                            id="budgetStatus"
                            value={form.budgetStatus || ''}
                            onChange={handleFormChange}
                          >
                            <option value="">Not specified</option>
                            <option value="Within budget">Within budget</option>
                            <option value="Unbudgeted">Unbudgeted</option>
                            <option value="Variation">Variation</option>
                          </select>
                        </div>
                        <div className="field-full">
                          <label htmlFor="remarks">Remarks / justification</label>
                          <textarea
                            id="remarks"
                            placeholder="Optional note for the approvers"
                            value={form.remarks || ''}
                            onChange={handleFormChange}
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  </details>
                </section>

                {/* 04 Approval names & status */}
                <section className="panel">
                  <details id="approvalsDetails">
                    <summary>
                      <span className="step">04</span> Approval names &amp; status (optional)
                    </summary>
                    <div className="panel-body">
                      <p className="helper-note" style={{ marginTop: 0 }}>
                        Signature spaces always appear on the PDF. Fill these only when needed.
                      </p>
                      <div className="fields">
                        <div>
                          <label htmlFor="accountsName">Accounts verified by</label>
                          <input
                            id="accountsName"
                            placeholder="Name"
                            value={form.accountsName || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="accountsDate">Accounts verification date</label>
                          <input
                            type="date"
                            id="accountsDate"
                            value={form.accountsDate || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="projectHeadName">Project head</label>
                          <input
                            id="projectHeadName"
                            placeholder="Name"
                            value={form.projectHeadName || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="projectStatus">Project head status</label>
                          <select
                            id="projectStatus"
                            value={form.projectStatus || ''}
                            onChange={handleFormChange}
                          >
                            <option value="">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Hold">Hold</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="chairmanName">Chairman</label>
                          <input
                            id="chairmanName"
                            placeholder="Name"
                            value={form.chairmanName || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="chairmanStatus">Chairman status</label>
                          <select
                            id="chairmanStatus"
                            value={form.chairmanStatus || ''}
                            onChange={handleFormChange}
                          >
                            <option value="">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Requested changes">Requested changes</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="projectDate">Project head date</label>
                          <input
                            type="date"
                            id="projectDate"
                            value={form.projectDate || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                        <div>
                          <label htmlFor="chairmanDate">Chairman date</label>
                          <input
                            type="date"
                            id="chairmanDate"
                            value={form.chairmanDate || ''}
                            onChange={handleFormChange}
                          />
                        </div>
                      </div>
                    </div>
                  </details>
                </section>

                <div className="backup-actions">
                  <button type="button" className="btn navy" id="saveBottom" onClick={handleSaveBill} disabled={isSaving}>
                    {isSaving ? '⏳ Saving...' : '✓ Save current bill'}
                  </button>
                  <button type="button" className="btn" id="printBottom" onClick={() => window.print()}>
                    ⇩ Print / save PDF
                  </button>
                </div>
                <p className="helper-note">
                  Works with real-time Excel &amp; database synchronization. Records are securely stored on the server and cached in this browser. Use <b>Export backup</b> or <b>Download Excel</b> anytime.
                </p>
              </div>

              {/* LIVE DOCUMENT PREVIEW */}
              <div className="preview-wrap">
                <div className="preview-heading">
                  <span>LIVE DOCUMENT PREVIEW</span>
                  <span>
                    <span className="live-dot"></span> Updates instantly
                  </span>
                </div>
                <article
                  id="printView"
                  className="doc"
                  aria-label="Printable Bluezone Habitat accounts approval sheet"
                >
                  <div className="doc-content">
                    <div className="doc-header">
                      <div className="doc-brand">BLUEZONE HABITAT</div>
                      <small>
                        Document No.: BZH/ACC/PA/01<br />
                        Revision: 01 | Page 1
                      </small>
                    </div>

                    <div className="doc-sec-title">1. REQUEST CONTROL</div>
                    <div className="doc-info-grid">
                      <div className="doc-info-cell">
                        <div className="d-label">Approval request no.</div>
                        <div className="d-value" id="pNumber">{form.requestNumber || '—'}</div>
                      </div>
                      <div className="doc-info-cell">
                        <div className="d-label">Request date</div>
                        <div className="d-value" id="pReqDate">{fmtDate(form.requestDate)}</div>
                      </div>
                      <div className="doc-info-cell">
                        <div className="d-label">Required payment date</div>
                        <div className="d-value" id="pPaymentDate">{fmtDate(form.paymentDate)}</div>
                      </div>
                      <div className="doc-info-cell">
                        <div className="d-label">Cost centre / project</div>
                        <div className="d-value">BLUEZONE HABITAT</div>
                      </div>
                      <div className="doc-info-cell">
                        <div className="d-label">Requested by</div>
                        <div className="d-value" id="pRequestedBy">{form.requestedBy || '—'}</div>
                      </div>
                      <div className="doc-info-cell">
                        <div className="d-label">Department / work area · Urgency</div>
                        <div className="d-value" id="pArea">
                          {`${form.workArea || '—'} · ${form.urgency || 'Normal'}`}
                        </div>
                      </div>
                    </div>

                    <div className="doc-sec-title">2. PURCHASE / BILL DETAILS</div>
                    <table className="bill-table">
                      <thead>
                        <tr>
                          <th style={{ width: '8%' }}>Sl.</th>
                          <th style={{ width: '35%' }}>Item / service description</th>
                          <th style={{ width: '16%' }}>Qty / unit</th>
                          <th style={{ width: '18%' }}>Bill date</th>
                          <th style={{ width: '23%' }}>Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody id="previewItems">
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="empty-line">
                              Expenses will appear here as you add them.
                            </td>
                          </tr>
                        ) : (
                          items.map((it, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{it.desc}</td>
                              <td>
                                {it.qty ? `${it.qty} ${it.unit || ''}` : '—'}
                                {it.rate ? <div className="minor">Rate: {money(it.rate)}</div> : null}
                              </td>
                              <td>{fmtDate(it.date)}</td>
                              <td className="amount">{commas(it.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    <div className="doc-totals">
                      <div className="doc-words">
                        <b>Amount in words</b>
                        <span id="pWords">{inWords(currentNetPayable)}</span>
                      </div>
                      <div id="previewTotals">
                        <div className="total-line">
                          <span>Subtotal</span>
                          <b>{commas(itemsSubtotal)}</b>
                        </div>
                        {amount(form.taxAmount) > 0 && (
                          <div className="total-line">
                            <span>GST / Tax</span>
                            <b>{commas(form.taxAmount)}</b>
                          </div>
                        )}
                        {amount(form.otherCharges) > 0 && (
                          <div className="total-line">
                            <span>Other charges</span>
                            <b>{commas(form.otherCharges)}</b>
                          </div>
                        )}
                        {amount(form.advanceAmount) > 0 && (
                          <div className="total-line">
                            <span>Less: Advance / TDS</span>
                            <b>−{commas(form.advanceAmount)}</b>
                          </div>
                        )}
                        <div className="total-line">
                          <span>NET PAYABLE</span>
                          <b>{commas(currentNetPayable)}</b>
                        </div>
                      </div>
                    </div>

                    <div className="doc-remarks">
                      <strong>Budget status / remarks</strong>
                      <span id="pRemarks">{memoText}</span>
                    </div>

                    <div className="doc-sec-title">3. APPROVAL WORKFLOW</div>
                    <div className="doc-declare">
                      Declaration: The purchase or service has been received or verified and the amount stated is correct and eligible for payment.
                    </div>

                    <div className="signature-grid">
                      <div className="sig">
                        <div className="sig-head">Requested by</div>
                        <div className="sig-body">
                          <div className="sig-line">Name: <b id="pSigRequested">{form.requestedBy || '—'}</b></div>
                          <div className="sig-line">Signature: __________</div>
                          <div className="sig-line">Date: <b id="pSigReqDate">{fmtDate(form.requestDate)}</b></div>
                        </div>
                      </div>
                      <div className="sig">
                        <div className="sig-head">Accounts verified by</div>
                        <div className="sig-body">
                          <div className="sig-line">Name: <b id="pAccountsName">{form.accountsName || '—'}</b></div>
                          <div className="sig-line">Signature: __________</div>
                          <div className="sig-line">Date: <b id="pAccountsDate">{fmtDate(form.accountsDate)}</b></div>
                        </div>
                      </div>
                      <div className="sig">
                        <div className="sig-head">Project head approval</div>
                        <div className="sig-body">
                          <div className="sig-line">Name: <b id="pProjectName">{form.projectHeadName || '—'}</b></div>
                          <div className="sig-line">Status: <b id="pProjectStatus">{form.projectStatus || 'Pending'}</b></div>
                          <div className="sig-line">Signature: __________</div>
                          <div className="sig-line">Date: <b id="pProjectDate">{fmtDate(form.projectDate)}</b></div>
                        </div>
                      </div>
                      <div className="sig">
                        <div className="sig-head">Chairman approval</div>
                        <div className="sig-body">
                          <div className="sig-line">Name: <b id="pChairName">{form.chairmanName || '—'}</b></div>
                          <div className="sig-line">Status: <b id="pChairStatus">{form.chairmanStatus || 'Pending'}</b></div>
                          <div className="sig-line">Signature: __________</div>
                          <div className="sig-line">Date: <b id="pChairDate">{fmtDate(form.chairmanDate)}</b></div>
                        </div>
                      </div>
                    </div>

                    <div className="doc-footer">
                      <span>Bluezone Habitat | Internal accounts control document</span>
                      <span id="pFooterRef">
                        {form.requestNumber ? `Approval request #${form.requestNumber}` : 'Daily approval'}
                      </span>
                    </div>
                  </div>
                </article>
              </div>

              {/* DEDICATED PRINT-ONLY PAGINATED A4 CONTAINER (Matches Bluezone Official A4 PDF) */}
              <div className="print-pages-container" aria-hidden="true">
                {printPages.map((page, pIdx) => (
                  <article key={pIdx} className="print-page doc">
                    <div className="doc-content">
                      <div className="print-page-header">
                        <div className="doc-header">
                          <div className="doc-brand">BLUEZONE HABITAT</div>
                          <small>
                            Document No.: BZH/ACC/PA/01<br />
                            Revision: 01 | Page {pIdx + 1}
                          </small>
                        </div>

                        <div className="doc-sec-title">1. REQUEST CONTROL</div>
                        <div className="doc-info-grid">
                          <div className="doc-info-cell">
                            <div className="d-label">Approval request no.</div>
                            <div className="d-value">{form.requestNumber || '—'}</div>
                          </div>
                          <div className="doc-info-cell">
                            <div className="d-label">Request date</div>
                            <div className="d-value">{fmtDate(form.requestDate)}</div>
                          </div>
                          <div className="doc-info-cell">
                            <div className="d-label">Required payment date</div>
                            <div className="d-value">{fmtDate(form.paymentDate)}</div>
                          </div>
                          <div className="doc-info-cell">
                            <div className="d-label">Cost centre / project</div>
                            <div className="d-value">BLUEZONE HABITAT</div>
                          </div>
                          <div className="doc-info-cell">
                            <div className="d-label">Requested by</div>
                            <div className="d-value">{form.requestedBy || '—'}</div>
                          </div>
                          <div className="doc-info-cell">
                            <div className="d-label">Department / work area · Urgency</div>
                            <div className="d-value">
                              {`${form.workArea || '—'} · ${form.urgency || 'Normal'}`}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="print-page-body">
                        <div className="doc-sec-title">2. PURCHASE / BILL DETAILS</div>
                        <div className="print-table-wrap">
                          <table className="bill-table">
                            <thead>
                              <tr>
                                <th style={{ width: '6%' }}>Sl.</th>
                                <th style={{ width: '42%' }}>Item / service description</th>
                                <th style={{ width: '16%' }}>Qty / unit</th>
                                <th style={{ width: '16%' }}>Bill date</th>
                                <th style={{ width: '20%' }}>Amount (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {page.items.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="empty-line">
                                    Expenses will appear here as you add them.
                                  </td>
                                </tr>
                              ) : (
                                page.items.map((it, idx) => (
                                  <tr key={idx}>
                                    <td>{page.startIndex + idx + 1}</td>
                                    <td>{it.desc}</td>
                                    <td>
                                      {it.qty ? `${it.qty} ${it.unit || ''}` : '—'}
                                      {it.rate ? <div className="minor">Rate: ₹{commas(it.rate)}</div> : null}
                                    </td>
                                    <td>{fmtDate(it.date)}</td>
                                    <td className="amount">{commas(it.amount)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        {page.isLastPage && (
                          <div className="print-totals-wrap">
                            <div className="doc-totals">
                              <div className="doc-words">
                                <b>Amount in words</b>
                                <span>{inWords(currentNetPayable)}</span>
                              </div>
                              <div>
                                <div className="total-line">
                                  <span>Subtotal</span>
                                  <b>{commas(itemsSubtotal)}</b>
                                </div>
                                {amount(form.taxAmount) > 0 && (
                                  <div className="total-line">
                                    <span>GST / Tax</span>
                                    <b>{commas(form.taxAmount)}</b>
                                  </div>
                                )}
                                {amount(form.otherCharges) > 0 && (
                                  <div className="total-line">
                                    <span>Other charges</span>
                                    <b>{commas(form.otherCharges)}</b>
                                  </div>
                                )}
                                {amount(form.advanceAmount) > 0 && (
                                  <div className="total-line">
                                    <span>Less: Advance / TDS</span>
                                    <b>−{commas(form.advanceAmount)}</b>
                                  </div>
                                )}
                                <div className="total-line">
                                  <span>NET PAYABLE</span>
                                  <b>{commas(currentNetPayable)}</b>
                                </div>
                              </div>
                            </div>

                            <div className="doc-remarks">
                              <strong>Budget status / remarks</strong>
                              <span>{memoText}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="print-page-bottom">
                        <div className="doc-sec-title">3. APPROVAL WORKFLOW</div>
                        <div className="doc-declare">
                          Declaration: The purchase or service has been received or verified and the amount stated is correct and eligible for payment.
                        </div>

                        <div className="signature-grid">
                          <div className="sig">
                            <div className="sig-head">Requested by</div>
                            <div className="sig-body">
                              <div className="sig-line">Name: <b>{form.requestedBy || '—'}</b></div>
                              <div className="sig-line">Signature: __________</div>
                              <div className="sig-line">Date: <b>{fmtDate(form.requestDate)}</b></div>
                            </div>
                          </div>
                          <div className="sig">
                            <div className="sig-head">Accounts verified by</div>
                            <div className="sig-body">
                              <div className="sig-line">Name: <b>{form.accountsName || '—'}</b></div>
                              <div className="sig-line">Signature: __________</div>
                              <div className="sig-line">Date: <b>{fmtDate(form.accountsDate)}</b></div>
                            </div>
                          </div>
                          <div className="sig">
                            <div className="sig-head">Project head approval</div>
                            <div className="sig-body">
                              <div className="sig-line">Name: <b>{form.projectHeadName || '—'}</b></div>
                              <div className="sig-line">Status: <b>{form.projectStatus || 'Pending'}</b></div>
                              <div className="sig-line">Signature: __________</div>
                              <div className="sig-line">Date: <b>{fmtDate(form.projectDate)}</b></div>
                            </div>
                          </div>
                          <div className="sig">
                            <div className="sig-head">Chairman approval</div>
                            <div className="sig-body">
                              <div className="sig-line">Name: <b>{form.chairmanName || '—'}</b></div>
                              <div className="sig-line">Status: <b>{form.chairmanStatus || 'Pending'}</b></div>
                              <div className="sig-line">Signature: __________</div>
                              <div className="sig-line">Date: <b>{fmtDate(form.chairmanDate)}</b></div>
                            </div>
                          </div>
                        </div>

                        <div className="doc-footer">
                          <span>Bluezone Habitat | Internal accounts control document</span>
                          <span>
                            {form.requestNumber ? `Approval request #${form.requestNumber}` : 'Daily approval'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* HISTORY VIEW */}
          <section id="historyView" className={view === 'history' ? '' : 'hidden'}>
            <div className="history">
              <div className="history-head">
                <div>
                  <h2>Saved approval sheets</h2>
                  <p className="subheading">Reopen, duplicate, download or print any bill saved in Google Sheets.</p>
                </div>
                <input
                  className="history-header-search"
                  type="search"
                  id="searchHistory"
                  placeholder="Search request, person, date..."
                  value={searchHistory || ''}
                  onChange={(e) => setSearchHistory(e.target.value)}
                />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Request no.</th>
                      <th>Request date</th>
                      <th>Requested by</th>
                      <th>Items</th>
                      <th>Net payable</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="historyRows">
                    {filteredBills.map((b) => {
                      const f = b.form || {};
                      const itms = Array.isArray(b.items) ? b.items : [];
                      const sub = itms.reduce((a, x) => a + amount(x.amount), 0);
                      const tax = amount(f.taxAmount);
                      const other = amount(f.otherCharges);
                      const adv = amount(f.advanceAmount);
                      const net = Math.max(0, Math.round((sub + tax + other - adv) * 100) / 100);

                      return (
                        <tr key={b.id}>
                          <td><strong>#{f.requestNumber || '—'}</strong></td>
                          <td>{fmtDate(f.requestDate)}</td>
                          <td>{f.requestedBy || '—'}</td>
                          <td><span className="pill">{itms.length} items</span></td>
                          <td><strong>{money(net)}</strong></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn small"
                              type="button"
                              onClick={() => handleOpenBill(b.id)}
                            >
                              Open
                            </button>{' '}
                            <button
                              className="btn small"
                              type="button"
                              onClick={() => handleDuplicateBill(b.id)}
                            >
                              Copy
                            </button>{' '}
                            <button
                              className="btn small danger"
                              type="button"
                              onClick={() => handleDeleteBill(b.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredBills.length === 0 && (
                  <div id="historyEmpty" className="nohistory">
                    No bills found. Create and save your first Bluezone approval sheet.
                  </div>
                )}
              </div>
            </div>

            <div className="backup-actions" style={{ marginTop: '20px' }}>
              <button className="btn" id="exportHistory" type="button" onClick={handleExportBackup}>
                ⇩ Export JSON backup
              </button>
              <button
                className="btn"
                id="importHistory"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                ⇧ Import JSON backup
              </button>
              <a
                href="/api/export-excel"
                className="btn primary"
              >
                ⇩ Export Excel (.xlsx)
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* Toast notification */}
      <div id="toast" className={`toast ${toastShow ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </div>
  );
}

