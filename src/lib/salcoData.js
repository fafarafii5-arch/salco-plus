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
  // Sales are loaded once by listSales; do not rescan the complete sales history here.
  return (data || []).map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category || 'متفرقه', variant: p.variant || 'ساده', size: p.size || '-', color: p.color || '-', stock: p.stock_qty, initialStock: Number(p.initial_stock_qty ?? p.stock_qty), buy: Number(p.purchase_price), price: Number(p.sale_price), imageUrl: p.image_url || '', sold: 0 }));
}

export async function createProduct(branchId, product) {
  const { data, error } = await supabase.from('products').insert({
    branch_id: branchId, name: product.name, sku: product.sku, category: product.category, variant: product.variant || 'ساده',
    size: product.size, color: product.color, stock_qty: Number(product.stock), initial_stock_qty: Number(product.stock),
    purchase_price: Number(product.buy), sale_price: Number(product.price), image_url: product.imageUrl || null, min_stock_qty: 3,
  }).select('*').single();
  if (error) throw error;
  return { id: data.id, name: data.name, sku: data.sku, category: data.category, variant: data.variant || 'ساده', size: data.size || '-', color: data.color || '-', stock: data.stock_qty, initialStock: Number(data.initial_stock_qty ?? data.stock_qty), buy: Number(data.purchase_price), price: Number(data.sale_price), imageUrl: data.image_url || '', sold: 0 };
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
  const { data: sales, error } = await supabase.from('sales').select('id, invoice_no, customer_id, seller_name, discount, total, payment_method, sold_at').eq('branch_id', branchId).eq('status', 'completed').order('sold_at', { ascending: false });
  if (error) throw new Error('دریافت فاکتورهای فروش: ' + error.message);
  const saleIds = (sales || []).map(s => s.id);
  const customerIds = [...new Set((sales || []).map(s => s.customer_id).filter(Boolean))];
  let items = [], customers = [], exchangeRows = [], productDetails = [];
  if (saleIds.length) {
    const [itemsResult, exchangesResult, customersResult] = await Promise.all([
      supabase.from('sale_items').select('id, sale_id, product_id, product_name, sku, quantity, unit_price, discount, line_total, unit_cost').in('sale_id', saleIds),
      supabase.from('sale_exchanges').select('id, original_sale_id, original_sale_item_id, returned_quantity, returned_total, returned_condition, new_product_id, new_quantity, new_unit_price, new_total, difference, settlement_method, notes, created_at').in('original_sale_id', saleIds),
      customerIds.length ? supabase.from('customers').select('id, full_name').in('id', customerIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsResult.error) throw new Error('دریافت ریز اقلام فاکتورها: ' + itemsResult.error.message);
    if (exchangesResult.error) throw new Error('دریافت سوابق تعویض: ' + exchangesResult.error.message);
    if (customersResult.error) throw new Error('دریافت نام مشتریان فاکتورها: ' + customersResult.error.message);
    items = itemsResult.data || [];
    exchangeRows = exchangesResult.data || [];
    customers = customersResult.data || [];
    const productIds = [...new Set([...items.map(i => i.product_id), ...exchangeRows.flatMap(x => [x.new_product_id]).filter(Boolean)].filter(Boolean))];
    if (productIds.length) {
      const productResult = await supabase.from('products').select('id, name, size, color').in('id', productIds);
      if (productResult.error) throw new Error('دریافت سایز و رنگ اقلام فروش: ' + productResult.error.message);
      productDetails = productResult.data || [];
    }
  }
  const customerById = Object.fromEntries(customers.map(c => [c.id, c.full_name]));
  const productById = Object.fromEntries(productDetails.map(p => [p.id, p]));
  const exchangesBySale = {};
  exchangeRows.forEach(x => { (exchangesBySale[x.original_sale_id] ||= []).push({ id: x.id, returnedQuantity: Number(x.returned_quantity || 0), returnedTotal: Number(x.returned_total || 0), newProductName: productById[x.new_product_id]?.name || 'کالای جایگزین', newColor: productById[x.new_product_id]?.color || '', newSize: productById[x.new_product_id]?.size || '', newQuantity: Number(x.new_quantity || 0), newUnitPrice: Number(x.new_unit_price || 0), newTotal: Number(x.new_total || 0), difference: Number(x.difference || 0), settlementMethod: x.settlement_method || '', notes: x.notes || '', createdAt: x.created_at }); });
  const itemsBySale = {};
  items.forEach(i => { (itemsBySale[i.sale_id] ||= []).push(i); });
  const returnedByItem = {};
  exchangeRows.forEach(x => { returnedByItem[x.original_sale_item_id] = (returnedByItem[x.original_sale_item_id] || 0) + Number(x.returned_quantity || 0); });
  return (sales || []).map(s => {
    const saleItems = itemsBySale[s.id] || [];
    return { id: s.id, invoiceNo: s.invoice_no, date: s.sold_at, customerId: s.customer_id, seller: s.seller_name || '', exchanges: exchangesBySale[s.id] || [], product: saleItems.map(i => i.product_name).join('، '), items: saleItems.map(i => ({ id: i.id, productId: i.product_id, productName: i.product_name, sku: i.sku, size: productById[i.product_id]?.size || '', color: productById[i.product_id]?.color || '', quantity: Number(i.quantity), unitPrice: Number(i.unit_price), discount: Number(i.discount), lineTotal: Number(i.line_total), returnedQuantity: returnedByItem[i.id] || 0, unitCost: Number(i.unit_cost) })), qty: saleItems.reduce((n, i) => n + Number(i.quantity), 0), customer: customerById[s.customer_id] || 'مشتری حضوری', total: Number(s.total), cost: saleItems.reduce((n, i) => n + Number(i.unit_cost) * Number(i.quantity), 0), discount: Number(s.discount), payment: s.payment_method };
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

export async function listExchangeInvoices(branchId) {
  const { data: exchanges, error: exchangeError } = await supabase
    .from('sale_exchanges')
    .select('id, original_sale_id, original_sale_item_id, returned_quantity, returned_total, returned_condition, new_product_id, new_quantity, new_unit_price, new_total, difference, settlement_method, notes, created_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (exchangeError) throw new Error('دریافت فاکتورهای دارای تعویض: ' + exchangeError.message);
  if (!exchanges?.length) return [];
  const saleIds = [...new Set(exchanges.map(x => x.original_sale_id).filter(Boolean))];
  const [{ data: sales, error: salesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('sales').select('id, invoice_no, customer_id, seller_name, discount, total, payment_method, sold_at, status').eq('branch_id', branchId).in('id', saleIds),
    supabase.from('sale_items').select('id, sale_id, product_id, product_name, sku, quantity, unit_price, discount, line_total, unit_cost').in('sale_id', saleIds),
  ]);
  if (salesError) throw salesError;
  if (itemsError) throw itemsError;
  const customerIds = [...new Set((sales || []).map(x => x.customer_id).filter(Boolean))];
  const productIds = [...new Set([...(items || []).map(x => x.product_id), ...exchanges.map(x => x.new_product_id)].filter(Boolean))];
  const [customersResult, productsResult] = await Promise.all([
    customerIds.length ? supabase.from('customers').select('id, full_name').in('id', customerIds) : Promise.resolve({ data: [], error: null }),
    productIds.length ? supabase.from('products').select('id, name, size, color').in('id', productIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error) throw customersResult.error;
  if (productsResult.error) throw productsResult.error;
  const customerById = Object.fromEntries((customersResult.data || []).map(x => [x.id, x.full_name]));
  const productById = Object.fromEntries((productsResult.data || []).map(x => [x.id, x]));
  const itemsBySale = {};
  (items || []).forEach(x => { (itemsBySale[x.sale_id] ||= []).push(x); });
  const exchangesBySale = {};
  exchanges.forEach(x => { (exchangesBySale[x.original_sale_id] ||= []).push({
    id: x.id, returnedQuantity: Number(x.returned_quantity || 0), returnedTotal: Number(x.returned_total || 0),
    newProductName: productById[x.new_product_id]?.name || 'کالای جایگزین', newColor: productById[x.new_product_id]?.color || '',
    newSize: productById[x.new_product_id]?.size || '', newQuantity: Number(x.new_quantity || 0),
    newUnitPrice: Number(x.new_unit_price || 0), newTotal: Number(x.new_total || 0), difference: Number(x.difference || 0),
    settlementMethod: x.settlement_method || '', notes: x.notes || '', createdAt: x.created_at,
  }); });
  return (sales || []).map(s => {
    const saleItems = itemsBySale[s.id] || [];
    return {
      id: s.id, invoiceNo: s.invoice_no, date: s.sold_at, customerId: s.customer_id, seller: s.seller_name || '',
      status: s.status, exchanges: exchangesBySale[s.id] || [], product: saleItems.map(x => x.product_name).join('، '),
      items: saleItems.map(x => ({ id: x.id, productId: x.product_id, productName: x.product_name, sku: x.sku,
        size: productById[x.product_id]?.size || '', color: productById[x.product_id]?.color || '',
        quantity: Number(x.quantity), unitPrice: Number(x.unit_price), discount: Number(x.discount),
        lineTotal: Number(x.line_total), returnedQuantity: exchanges.filter(e => e.original_sale_item_id === x.id).reduce((n,e) => n + Number(e.returned_quantity || 0), 0),
        unitCost: Number(x.unit_cost) })),
      qty: saleItems.reduce((n,x) => n + Number(x.quantity), 0), customer: customerById[s.customer_id] || 'مشتری حضوری',
      total: Number(s.total), discount: Number(s.discount), payment: s.payment_method,
    };
  });
}

export async function listCashTransactions(branchId) {
  const { data, error } = await supabase.from('cash_transactions').select('*').eq('branch_id', branchId).eq('is_voided', false).order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({ id: c.id, date: c.occurred_at, type: c.transaction_type === 'expense' ? 'پرداخت' : 'دریافت', title: c.description || '', amount: Number(c.amount), payment: c.payment_method }));
}

export async function createCashTransaction(branchId, userId, item) {
  const { data, error } = await supabase.from('cash_transactions').insert({
    branch_id: branchId, sale_id: item.saleId || null, created_by: userId, transaction_type: item.type === 'پرداخت' ? 'expense' : 'receipt',
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

export async function updateProductImage(productId, imageUrl) {
  const { data, error } = await supabase.from('products').update({ image_url: imageUrl || null }).eq('id', productId).select('id,image_url').single();
  if (error) throw error;
  return { id: data.id, imageUrl: data.image_url || '' };
}

export async function uploadProductImage(branchId, productId, file) {
  if (!branchId || !productId || !file) throw new Error('کالا یا فایل تصویر مشخص نیست.');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (!allowedTypes.includes(file.type)) throw new Error('فرمت تصویر باید JPG، PNG، WEBP یا AVIF باشد.');
  if (file.size > 8 * 1024 * 1024) throw new Error('حجم تصویر نباید بیشتر از ۸ مگابایت باشد.');
  const extension = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'})[file.type];
  const path = String(branchId) + '/' + String(productId) + '/' + Date.now() + '-' + Math.random().toString(36).slice(2,9) + '.' + extension;
  const bucket = supabase.storage.from('salco-product-images');
  const { data: uploaded, error: uploadError } = await bucket.upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data: publicData } = bucket.getPublicUrl(uploaded.path);
  try {
    return await updateProductImage(productId, publicData.publicUrl);
  } catch (error) {
    await bucket.remove([uploaded.path]).catch(() => {});
    throw error;
  }
}
