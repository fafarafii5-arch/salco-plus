import { supabase } from './supabase';

const BRANCH_CODE = 'KHO-PLUS';

export async function getCurrentBranch() {
  if (!supabase) throw new Error('تنظیمات Supabase کامل نیست.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('ابتدا وارد حساب کاربری شوید.');
  const { data, error } = await supabase
    .from('branch_memberships')
    .select('branch_id, role, branches!inner(id, code, name, city)')
    .eq('user_id', user.id)
    .eq('branches.code', BRANCH_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('حساب شما به شعبه SALCO Plus دسترسی ندارد.');
  return { id: data.branch_id, role: data.role, ...data.branches, userId: user.id };
}

export async function listProducts(branchId) {
  const { data, error } = await supabase.from('products').select('*').eq('branch_id', branchId).eq('is_active', true).order('created_at', { ascending: false });
  if (error) throw new Error('دریافت موجودی کالاها: ' + error.message);
  const ids = (data || []).map(p => p.id);
  const soldByProduct = {};
  if (ids.length) {
    const { data: items, error: itemsError } = await supabase.from('sale_items').select('sale_id, product_id, quantity').in('product_id', ids);
    if (itemsError) throw new Error('دریافت اقلام فروش برای موجودی: ' + itemsError.message);
    const saleIds = [...new Set((items || []).map(i => i.sale_id).filter(Boolean))];
    let completedSales = new Set();
    if (saleIds.length) {
      const { data: completed, error: salesError } = await supabase.from('sales').select('id').in('id', saleIds).eq('branch_id', branchId).eq('status', 'completed');
      if (salesError) throw new Error('تطبیق فروش‌های ثبت‌شده با موجودی: ' + salesError.message);
      completedSales = new Set((completed || []).map(s => s.id));
    }
    (items || []).forEach(item => { if(completedSales.has(item.sale_id)) soldByProduct[item.product_id] = (soldByProduct[item.product_id] || 0) + Number(item.quantity || 0); });
  }
  return (data || []).map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category || 'متفرقه', variant: p.variant || 'ساده', size: p.size || '-', color: p.color || '-', stock: p.stock_qty, initialStock: Number(p.initial_stock_qty ?? p.stock_qty), buy: Number(p.purchase_price), price: Number(p.sale_price), sold: soldByProduct[p.id] || 0 }));
}

export async function createProduct(branchId, product) {
  const { data, error } = await supabase.from('products').insert({
    branch_id: branchId, name: product.name, sku: product.sku, category: product.category, variant: product.variant || 'ساده',
    size: product.size, color: product.color, stock_qty: Number(product.stock), initial_stock_qty: Number(product.stock),
    purchase_price: Number(product.buy), sale_price: Number(product.price), min_stock_qty: 3,
  }).select('*').single();
  if (error) throw error;
  return { id: data.id, name: data.name, sku: data.sku, category: data.category, size: data.size, color: data.color, stock: data.stock_qty, initialStock: Number(data.initial_stock_qty ?? data.stock_qty), buy: Number(data.purchase_price), price: Number(data.sale_price), sold: 0 };
}

export async function listCustomers(branchId) {
  const { data, error } = await supabase.from('customers').select('id, full_name, phone, notes, created_at').eq('branch_id', branchId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({ id: c.id, name: c.full_name, phone: c.phone || '', visits: 0, total: 0, notes: c.notes || '' }));
}

export async function createCustomer(branchId, customer) {
  const { data, error } = await supabase.from('customers').insert({ branch_id: branchId, full_name: customer.name, phone: customer.phone || null, notes: customer.notes || null }).select('*').single();
  if (error) throw error;
  return { id: data.id, name: data.full_name, phone: data.phone || '', visits: 0, total: 0, notes: data.notes || '' };
}

export async function listSales(branchId) {
  const { data: sales, error } = await supabase.from('sales').select('id, invoice_no, customer_id, discount, total, payment_method, sold_at').eq('branch_id', branchId).eq('status', 'completed').order('sold_at', { ascending: false });
  if (error) throw new Error('دریافت فاکتورهای فروش: ' + error.message);
  const saleIds = (sales || []).map(s => s.id);
  const customerIds = [...new Set((sales || []).map(s => s.customer_id).filter(Boolean))];
  let items = [], customers = [];
  if (saleIds.length) {
    const result = await supabase.from('sale_items').select('sale_id, product_id, product_name, quantity, unit_cost').in('sale_id', saleIds);
    if (result.error) throw new Error('دریافت ریز اقلام فاکتورها: ' + result.error.message);
    items = result.data || [];
  }
  if (customerIds.length) {
    const result = await supabase.from('customers').select('id, full_name').in('id', customerIds);
    if (result.error) throw new Error('دریافت نام مشتریان فاکتورها: ' + result.error.message);
    customers = result.data || [];
  }
  const customerById = Object.fromEntries(customers.map(c => [c.id, c.full_name]));
  const itemsBySale = {};
  items.forEach(i => { (itemsBySale[i.sale_id] ||= []).push(i); });
  return (sales || []).map(s => {
    const saleItems = itemsBySale[s.id] || [];
    return { id: s.id, invoiceNo: s.invoice_no, date: s.sold_at, product: saleItems.map(i => i.product_name).join('، '), items: saleItems.map(i => ({ productId: i.product_id, productName: i.product_name, quantity: Number(i.quantity), unitCost: Number(i.unit_cost) })), qty: saleItems.reduce((n, i) => n + Number(i.quantity), 0), customer: customerById[s.customer_id] || 'مشتری حضوری', total: Number(s.total), cost: saleItems.reduce((n, i) => n + Number(i.unit_cost) * Number(i.quantity), 0), discount: Number(s.discount), payment: s.payment_method };
  });
}

export async function listCashTransactions(branchId) {
  const { data, error } = await supabase.from('cash_transactions').select('*').eq('branch_id', branchId).order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({ id: c.id, date: c.occurred_at, type: c.transaction_type === 'expense' ? 'پرداخت' : 'دریافت', title: c.description || '', amount: Number(c.amount), payment: c.payment_method }));
}

export async function createCashTransaction(branchId, userId, item) {
  const { data, error } = await supabase.from('cash_transactions').insert({
    branch_id: branchId, created_by: userId, transaction_type: item.type === 'پرداخت' ? 'expense' : 'receipt',
    payment_method: 'other', amount: Number(item.amount), description: item.title,
  }).select('*').single();
  if (error) throw error;
  return { id: data.id, date: data.occurred_at, type: data.transaction_type === 'expense' ? 'پرداخت' : 'دریافت', title: data.description || '', amount: Number(data.amount) };
}


export async function updateProductPrices(productId, prices) {
  // Purchase price is intentionally not exposed or modified by the app UI.
  const { data, error } = await supabase.from('products').update({
    sale_price: Number(prices.price),
  }).eq('id', productId).select('*').single();
  if (error) throw error;
  return { price: Number(data.sale_price) };
}


// Soft-delete a product so existing sales/history remain intact.
export async function deactivateProduct(productId) {
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', productId);
  if (error) throw error;
  return true;
}
