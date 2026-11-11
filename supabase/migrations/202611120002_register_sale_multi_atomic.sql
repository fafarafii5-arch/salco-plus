create or replace function public.register_sale_multi(
  p_branch_id uuid,
  p_items jsonb,
  p_sold_at timestamptz,
  p_discount numeric default 0,
  p_payment_method text default 'card',
  p_down_payment numeric default 0,
  p_down_payment_method text default 'card',
  p_installments jsonb default '[]'::jsonb,
  p_seller_name text default null,
  p_customer_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice_no text;
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_payment text;
  v_down_method text;
  v_item record;
  v_product public.products%rowtype;
  v_qty integer;
  v_gross numeric;
  v_line_discount numeric;
  v_allocated numeric := 0;
  v_count integer;
  v_installment_total numeric := 0;
begin
  if v_user_id is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
  if not private.is_branch_member(p_branch_id) then raise exception 'به این شعبه دسترسی ندارید.'; end if;
  if p_sold_at is null then raise exception 'تاریخ فروش الزامی است.'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'ساختار اقلام فاکتور معتبر نیست.'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'حداقل یک کالا به فاکتور اضافه کنید.'; end if;
  if jsonb_typeof(coalesce(p_installments,'[]'::jsonb)) is distinct from 'array' then raise exception 'ساختار اقساط معتبر نیست.'; end if;
  if coalesce(p_discount,0) < 0 or coalesce(p_down_payment,0) < 0 then raise exception 'مبلغ تخفیف و پیش‌پرداخت نمی‌تواند منفی باشد.'; end if;

  v_payment := case p_payment_method
    when 'کارت‌خوان' then 'card' when 'card' then 'card'
    when 'نقدی' then 'cash' when 'cash' then 'cash'
    when 'کارت‌به‌کارت' then 'transfer' when 'transfer' then 'transfer'
    when 'اعتباری' then 'credit' when 'credit' then 'credit'
    when 'هدیه' then 'gift' when 'gift' then 'gift'
    else null end;
  if v_payment is null then raise exception 'روش پرداخت معتبر نیست.'; end if;
  v_down_method := case p_down_payment_method
    when 'کارت‌خوان' then 'card' when 'card' then 'card'
    when 'نقدی' then 'cash' when 'cash' then 'cash'
    when 'کارت‌به‌کارت' then 'transfer' when 'transfer' then 'transfer'
    else null end;
  if v_payment='credit' and v_down_method is null then raise exception 'روش دریافت پیش‌پرداخت معتبر نیست.'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as e(value)
    group by value->>'product_id' having count(*) > 1
  ) then raise exception 'هر کالا باید فقط یک ردیف در سبد داشته باشد.'; end if;

  -- Lock products in a stable order to prevent concurrent overselling/deadlocks.
  for v_item in
    select distinct (value->>'product_id')::uuid as product_id
    from jsonb_array_elements(p_items) as e(value)
    order by 1
  loop
    perform 1 from public.products p
    where p.id=v_item.product_id and p.branch_id=p_branch_id and p.is_active=true
    for update;
    if not found then raise exception 'یکی از کالاهای انتخاب‌شده پیدا نشد یا غیرفعال است.'; end if;
  end loop;

  select count(*) into v_count from jsonb_array_elements(p_items);
  for v_item in
    select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    v_qty := (v_item.value->>'quantity')::integer;
    if v_qty is null or v_qty < 1 then raise exception 'تعداد هر کالا باید حداقل ۱ باشد.'; end if;
    select * into v_product from public.products
    where id=(v_item.value->>'product_id')::uuid and branch_id=p_branch_id and is_active=true;
    if v_product.stock_qty < v_qty then
      raise exception 'موجودی کالای % کافی نیست؛ موجودی فعلی: %',v_product.name,v_product.stock_qty;
    end if;
    v_subtotal := v_subtotal + v_product.sale_price * v_qty;
  end loop;

  if v_payment='gift' then
    if coalesce(p_discount,0)<>0 or coalesce(p_down_payment,0)<>0 or jsonb_array_length(coalesce(p_installments,'[]'::jsonb))>0 then
      raise exception 'فاکتور هدیه نباید تخفیف، پیش‌پرداخت یا قسط داشته باشد.';
    end if;
    v_total := 0; v_paid := 0;
  else
    if coalesce(p_discount,0)>v_subtotal then raise exception 'تخفیف از جمع کالاها بیشتر است.'; end if;
    v_total := v_subtotal-coalesce(p_discount,0);
    if v_payment='credit' then
      if coalesce(p_down_payment,0)>v_total then raise exception 'پیش‌پرداخت از مبلغ نهایی بیشتر است.'; end if;
      v_paid := coalesce(p_down_payment,0);
      v_balance := v_total-v_paid;
      if v_balance>0 and jsonb_array_length(coalesce(p_installments,'[]'::jsonb))=0 then
        raise exception 'برای مانده فاکتور، برنامه اقساط ثبت نشده است.';
      end if;
      select coalesce(sum((value->>'amount')::numeric),0) into v_installment_total
      from jsonb_array_elements(coalesce(p_installments,'[]'::jsonb)) as e(value);
      if abs(v_installment_total-v_balance)>0.01 then raise exception 'جمع اقساط با مانده فاکتور برابر نیست.'; end if;
    else
      if coalesce(p_down_payment,0)<>0 or jsonb_array_length(coalesce(p_installments,'[]'::jsonb))>0 then
        raise exception 'پیش‌پرداخت و اقساط فقط برای فروش اعتباری مجاز است.';
      end if;
      v_paid := v_total;
    end if;
  end if;

  v_invoice_no := 'SAL-'||to_char(p_sold_at,'YYYYMMDD-HH24MISS')||'-'||upper(substr(gen_random_uuid()::text,1,6));
  insert into public.sales(branch_id,invoice_no,customer_id,sold_by,status,payment_method,subtotal,discount,total,amount_paid,notes,sold_at,seller_name)
  values(p_branch_id,v_invoice_no,null,v_user_id,'completed',v_payment,
    case when v_payment='gift' then 0 else v_subtotal end,
    case when v_payment='gift' then 0 else coalesce(p_discount,0) end,
    v_total,v_paid,
    case when nullif(trim(coalesce(p_customer_phone,'')),'') is not null then 'شماره تماس پیگیری: '||trim(p_customer_phone) else null end,
    p_sold_at,nullif(trim(coalesce(p_seller_name,'')),''))
  returning id into v_sale_id;

  v_allocated := 0;
  for v_item in
    select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    v_qty := (v_item.value->>'quantity')::integer;
    select * into v_product from public.products
    where id=(v_item.value->>'product_id')::uuid and branch_id=p_branch_id and is_active=true;
    v_gross := case when v_payment='gift' then 0 else v_product.sale_price*v_qty end;
    if v_payment='gift' then
      v_line_discount := 0;
    elsif v_item.ordinality=v_count then
      v_line_discount := coalesce(p_discount,0)-v_allocated;
    else
      v_line_discount := case when v_subtotal=0 then 0 else round(coalesce(p_discount,0)*v_gross/v_subtotal,2) end;
      v_allocated := v_allocated+v_line_discount;
    end if;

    insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,discount,line_total)
    values(v_sale_id,v_product.id,v_product.name,v_product.sku,v_qty,
      v_product.sale_price,
      v_product.purchase_price,v_line_discount,v_gross-v_line_discount);

    update public.products set stock_qty=stock_qty-v_qty,updated_at=now() where id=v_product.id;
    insert into public.inventory_movements(branch_id,product_id,sale_id,created_by,movement_type,quantity_delta,note)
    values(p_branch_id,v_product.id,v_sale_id,v_user_id,'sale',-v_qty,
      case when v_payment='gift' then 'تحویل هدیه '||v_qty||' عدد؛ '||v_invoice_no else 'ثبت فروش '||v_invoice_no end);
  end loop;

  if v_paid>0 then
    insert into public.cash_transactions(branch_id,sale_id,created_by,transaction_type,payment_method,amount,description,occurred_at)
    values(p_branch_id,v_sale_id,v_user_id,'receipt',
      case when v_payment='credit' then v_down_method else v_payment end,
      v_paid,
      case when v_payment='credit' then 'پیش‌پرداخت فروش اقساطی '||v_invoice_no else 'دریافت فروش '||v_invoice_no end,
      p_sold_at);
  end if;

  if v_payment='credit' and jsonb_array_length(coalesce(p_installments,'[]'::jsonb))>0 then
    for v_item in select value from jsonb_array_elements(p_installments)
    loop
      if nullif(v_item.value->>'due_date','') is null or coalesce((v_item.value->>'amount')::numeric,0)<=0 then
        raise exception 'تاریخ یا مبلغ یکی از اقساط معتبر نیست.';
      end if;
      insert into public.sale_installments(branch_id,sale_id,installment_no,due_date,amount,amount_paid,status)
      values(p_branch_id,v_sale_id,(v_item.value->>'installment_no')::integer,
        (v_item.value->>'due_date')::date,(v_item.value->>'amount')::numeric,0,'pending');
    end loop;
  end if;

  return jsonb_build_object('sale_id',v_sale_id,'invoice_no',v_invoice_no,'subtotal',case when v_payment='gift' then 0 else v_subtotal end,
    'discount',case when v_payment='gift' then 0 else coalesce(p_discount,0) end,
    'total',v_total,'amount_paid',v_paid,'balance',v_total-v_paid,'items_count',v_count);
end;
$$;

revoke all on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,text,jsonb,text,text) from public;
grant execute on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,text,jsonb,text,text) to authenticated;
