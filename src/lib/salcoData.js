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
  if (error) throw error;
  return (data || []).map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category || 'متفرقه', variant: p.variant || 'ساده', size: p.size || '-', color: p.color || '-', stock: p.stock_qty, buy: Number(p.purchase_price), price: Number(p.sale_price), sold: 0 }));
}

export async function createProduct(branchId, product) {
  const { data, error } = await supabase.from('products').insert({
    branch_id: branchId, name: product.name, sku: product.sku, category: product.category, variant: product.variant || 'ساده',
    size: product.size, color: product.color, stock_qty: Number(product.stock),
    purchase_price: Number(product.buy), sale_price: Number(product.price), min_stock_qty: 3,
  }).select('*').single();
  if (error) throw error;
  return { id: data.id, name: data.name, sku: data.sku, category: data.category, size: data.size, color: data.color, stock: data.stock_qty, buy: Number(data.purchase_price), price: Number(data.sale_price), sold: 0 };
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
  const { data, error } = await supabase.from('sales').select('id, invoice_no, discount, total, payment_method, sold_at, sale_items(product_name, quantity, unit_cost), customers(full_name)').eq('branch_id', branchId).eq('status', 'completed').order('sold_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(s => ({ id: s.id, date: s.sold_at, product: (s.sale_items || []).map(i => i.product_name).join('، '), qty: (s.sale_items || []).reduce((n, i) => n + Number(i.quantity), 0), customer: s.customers?.full_name || 'مشتری حضوری', total: Number(s.total), cost: (s.sale_items || []).reduce((n, i) => n + Number(i.unit_cost) * Number(i.quantity), 0), discount: Number(s.discount), payment: s.payment_method }));
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
  const { data, error } = await supabase.from('products').update({
    purchase_price: Number(prices.buy),
    sale_price: Number(prices.price),
  }).eq('id', productId).select('*').single();
  if (error) throw error;
  return { buy: Number(data.purchase_price), price: Number(data.sale_price) };
}
