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
  const soldByProduct = {};
  const { data: sales, error: salesError } = await supabase.from('sales').select('id').eq('branch_id', branchId).eq('status', 'completed');
  if (salesError) throw new Error('دریافت فروش‌های تکمیل‌شده برای محاسبه موجودی: ' + salesError.message);
  const saleIds = (sales || []).map(s => s.id);
  for (let offset = 0; offset < saleIds.length; offset += 100) {
    const batch = saleIds.slice(offset, offset + 100);
    const { data: items, error: itemsError } = await supabase.from('sale_items').select('sale_id, product_id, quantity').in('sale_id', batch);
    if (itemsError) throw new Error('دریافت اقلام فروش برای موجودی: ' + itemsError.message);
    (items || []).forEach(item => { if (item.product_id) soldByProduct[item.product_id] = (soldByProduct[item.product_id] || 0) + Number(item.quantity || 0); });
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
  return { id: data.id, name: data.name, sku: data.sku, category: data.category, variant: data.variant || 'ساده', size: data.size || '-', color: data.color || '-', stock: data.stock_qty, initialStock: Number(data.initial_stock_qty ?? data.stock_qty), buy: Number(data.purchase_price), price: Number(data.sale_price), sold: 0 };
}

export async function listCustomers(branchId) {
  const { data, error } = await supabase.from('customers').select('id, full_name, phone, notes, created_at').eq('branch_id', branchId).order('created_at', { ascending: false });
  if (error) throw error;
  const ids=(data||[]).map(c=>c.id);
  let ledger=[];
  if(ids.length){const result=await supabase.from('customer_credit_ledger').select('customer_id,amount,entry_type').eq('branch_id',branchId).in('customer_id',ids);if(result.error)throw new Error('دریافت اعتبار مشتریان: '+result.error.message);ledger=result.data||[];}
  const balances={};
  ledger.forEach(x=>{balances[x.customer_id]=(balances[x.customer_id]||0)+(x.entry_type==='credit'?1:-1)*Number(x.amount||0);});
  return (data || []).map(c => ({ id: c.id, name: c.full_name, phone: c.phone || '', visits: 0, total: 0, notes: c.notes || '', creditBalance: balances[c.id]||0 }));
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
  let items = [], customers = [], exchangeRows = [];
  if (saleIds.length) {
    const result = await supabase.from('sale_items').select('id, sale_id, product_id, product_name, sku, quantity, unit_price, discount, line_total, unit_cost').in('sale_id', saleIds);
    if (result.error) throw new Error('دریافت ریز اقلام فاکتورها: ' + result.error.message);
    items = result.data || [];
    const exchanges = await supabase.from('sale_exchanges').select('original_sale_item_id, returned_quantity').in('original_sale_id', saleIds);
    if (exchanges.error) throw new Error('دریافت سوابق تعویض: ' + exchanges.error.message);
    exchangeRows = exchanges.data || [];
  }
  if (customerIds.length) {
    const result = await supabase.from('customers').select('id, full_name').in('id', customerIds);
    if (result.error) throw new Error('دریافت نام مشتریان فاکتورها: ' + result.error.message);
    customers = result.data || [];
  }
  const customerById = Object.fromEntries(customers.map(c => [c.id, c.full_name]));
  const itemsBySale = {};
  items.forEach(i => { (itemsBySale[i.sale_id] ||= []).push(i); });
  const returnedByItem = {};
  exchangeRows.forEach(x => { returnedByItem[x.original_sale_item_id] = (returnedByItem[x.original_sale_item_id] || 0) + Number(x.returned_quantity || 0); });
  return (sales || []).map(s => {
    const saleItems = itemsBySale[s.id] || [];
    return { id: s.id, invoiceNo: s.invoice_no, date: s.sold_at, customerId: s.customer_id, product: saleItems.map(i => i.product_name).join('، '), items: saleItems.map(i => ({ id: i.id, productId: i.product_id, productName: i.product_name, sku: i.sku, quantity: Number(i.quantity), unitPrice: Number(i.unit_price), discount: Number(i.discount), lineTotal: Number(i.line_total), returnedQuantity: returnedByItem[i.id] || 0, unitCost: Number(i.unit_cost) })), qty: saleItems.reduce((n, i) => n + Number(i.quantity), 0), customer: customerById[s.customer_id] || 'مشتری حضوری', total: Number(s.total), cost: saleItems.reduce((n, i) => n + Number(i.unit_cost) * Number(i.quantity), 0), discount: Number(s.discount), payment: s.payment_method };
  });
}

export async function registerSaleExchange(branchId, payload) {
  const { data, error } = await supabase.rpc('register_sale_exchange_v2', {
    p_branch_id: branchId,
    p_original_sale_id: payload.saleId,
    p_original_sale_item_id: payload.saleItemId,
    p_exchange_date: payload.exchangeDate,
    p_return_quantity: Number(payload.returnQuantity),
    p_new_product_id: payload.newProductId,
    p_new_quantity: Number(payload.newQuantity),
    p_return_condition: payload.returnCondition,
    p_settlement_method: payload.settlementMethod,
    p_notes: payload.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function listCashTransactions(branchId) {
  const { data, error } = await supabase.from('cash_transactions').select('*').eq('branch_id', branchId).eq('is_voided', false).order('occurred_at', { ascending: false });
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
export async function listProductPriceHistory(branchId, productIds) {
  if (!productIds?.length) return [];
  const { data, error } = await supabase
    .from('product_price_history')
    .select('id, product_id, old_price, new_price, changed_at, change_type')
    .eq('branch_id', branchId)
    .in('product_id', productIds)
    .order('changed_at', { ascending: false });
  if (error) throw new Error('دریافت سابقه قیمت: ' + error.message);
  return data || [];
}
