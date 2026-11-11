-- Atomic multi-item sale registration for SALCO+
-- Applied only when the deployment is explicitly promoted to the production database.
create or replace function public.register_sale_multi(
  p_branch_id uuid,
  p_items jsonb,
  p_sold_at timestamptz,
  p_discount numeric default 0,
  p_payment_method text default 'کارت‌خوان',
  p_down_payment numeric default 0,
  p_installments jsonb default '[]'::jsonb,
  p_seller_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_invoice_no text;
  v_customer_id uuid := null;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount numeric := coalesce(p_discount,0);
  v_down numeric := coalesce(p_down_payment,0);
  v_paid numeric := 0;
  v_payment text;
  v_qty integer;
  v_unit_price numeric;
  v_line_subtotal numeric;
  v_allocated_discount numeric;
  v_remaining_discount numeric;
  v_item_count integer := 0;
  v_locked_ids uuid[] := '{}';
begin
  if v_user_id is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
  if not private.is_branch_member(p_branch_id) then raise exception 'به این شعبه دسترسی ندارید.'; end if;
  if p_sold_at is null then raise exception 'تاریخ فروش الزامی است.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'حداقل یک کالا باید به فاکتور اضافه شود.';
  end if;
  if v_discount < 0 or v_down < 0 then raise exception 'تخفیف و پیش‌پرداخت نمی‌توانند منفی باشند.'; end if;

  v_payment := case p_payment_method
    when 'کارت‌خوان' then 'card'
    when 'نقدی' then 'cash'
    when 'کارت‌به‌کارت' then 'transfer'
    when 'اعتباری' then 'credit'
    when 'card' then 'card'
    when 'cash' then 'cash'
    when 'transfer' then 'transfer'
    when 'credit' then 'credit'
    else null end;
  if v_payment is null then raise exception 'روش پرداخت معتبر نیست.'; end if;

  -- Lock all referenced products in deterministic order to avoid overselling and reduce deadlocks.
  select array_agg(x.product_id order by x.product_id)
    into v_locked_ids
  from (
    select distinct (elem->>'product_id')::uuid as product_id
    from jsonb_array_elements(p_items) elem
  ) x;
  if coalesce(array_length(v_locked_ids,1),0) <> jsonb_array_length(p_items) then
    raise exception 'هر کالا باید فقط یک بار در فاکتور باشد؛ تعداد همان کالا را در یک ردیف جمع کنید.';
  end if;

  perform 1 from public.products p
   where p.branch_id = p_branch_id and p.id = any(v_locked_ids) and p.is_active = true
   order by p.id for update;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 then raise exception 'تعداد هر کالا باید حداقل ۱ باشد.'; end if;
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and branch_id = p_branch_id and is_active = true;
    if not found then raise exception 'یکی از کالاهای انتخاب‌شده پیدا نشد.'; end if;
    if v_product.stock_qty < v_qty then
      raise exception 'موجودی کالای % کافی نیست؛ موجودی فعلی: %', v_product.name, v_product.stock_qty;
    end if;
    v_subtotal := v_subtotal + (v_product.sale_price * v_qty);
    v_item_count := v_item_count + 1;
  end loop;

  if v_discount > v_subtotal then raise exception 'تخفیف نمی‌تواند از مبلغ کل کالاها بیشتر باشد.'; end if;
  v_total := v_subtotal - v_discount;
  if v_down > v_total then raise exception 'پیش‌پرداخت نمی‌تواند از مبلغ نهایی بیشتر باشد.'; end if;
  if v_payment <> 'credit' and v_down <> 0 then
    raise exception 'پیش‌پرداخت جداگانه فقط برای فروش اقساطی ثبت می‌شود.';
  end if;
  if v_payment = 'credit' then
    if jsonb_typeof(coalesce(p_installments,'[]'::jsonb)) <> 'array' then raise exception 'برنامه اقساط معتبر نیست.'; end if;
    if v_total - v_down > 0 and jsonb_array_length(coalesce(p_installments,'[]'::jsonb)) = 0 then
      raise exception 'برای مانده فروش اقساطی، حداقل یک قسط لازم است.';
    end if;
  elsif jsonb_array_length(coalesce(p_installments,'[]'::jsonb)) > 0 then
    raise exception 'اقساط فقط برای فروش اعتباری مجاز است.';
  end if;

  v_paid := case when v_payment = 'credit' then v_down else v_total end;
  v_invoice_no := 'SAL-' || to_char(p_sold_at,'YYYYMMDD-HH24MISS') || '-' || upper(substr(gen_random_uuid()::text,1,6));
  insert into public.sales(branch_id,invoice_no,customer_id,sold_by,seller_name,status,payment_method,subtotal,discount,total,amount_paid,notes,sold_at)
  values(p_branch_id,v_invoice_no,v_customer_id,v_user_id,nullif(trim(coalesce(p_seller_name,'')),''),'completed',v_payment,v_subtotal,v_discount,v_total,v_paid,
    case when v_payment='credit' then 'فروش اقساطی؛ پیش‌پرداخت: '||v_down::text else null end,p_sold_at)
  returning id into v_sale_id;

  v_remaining_discount := v_discount;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products
     where id=(v_item->>'product_id')::uuid and branch_id=p_branch_id and is_active=true;
    v_unit_price := v_product.sale_price;
    v_line_subtotal := v_unit_price * v_qty;
    v_allocated_discount := case
      when v_item = (select value from jsonb_array_elements(p_items) with ordinality z(value,ord) order by ord desc limit 1)
        then v_remaining_discount
      else round(v_discount * v_line_subtotal / nullif(v_subtotal,0),2)
    end;
    v_allocated_discount := least(v_allocated_discount,v_remaining_discount);
    v_remaining_discount := v_remaining_discount - v_allocated_discount;

    insert into public.sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,discount,line_total)
    values(v_sale_id,v_product.id,v_product.name,v_product.sku,v_qty,v_unit_price,v_product.purchase_price,
      v_allocated_discount,v_line_subtotal-v_allocated_discount);

    update public.products set stock_qty=stock_qty-v_qty,updated_at=now() where id=v_product.id;
    insert into public.inventory_movements(branch_id,product_id,sale_id,created_by,movement_type,quantity_delta,note)
    values(p_branch_id,v_product.id,v_sale_id,v_user_id,'sale',-v_qty,'ثبت فروش '||v_invoice_no);
  end loop;

  if v_paid > 0 then
    insert into public.cash_transactions(branch_id,sale_id,created_by,transaction_type,payment_method,amount,description,occurred_at)
    values(p_branch_id,v_sale_id,v_user_id,'receipt',v_payment,v_paid,
      case when v_payment='credit' then 'پیش‌پرداخت فروش اقساطی '||v_invoice_no else 'دریافت فروش '||v_invoice_no end,p_sold_at);
  end if;

  if v_payment='credit' then
    if coalesce(jsonb_array_length(p_installments),0) > 36 then raise exception 'تعداد اقساط نمی‌تواند بیشتر از ۳۶ باشد.'; end if;
    if coalesce(jsonb_array_length(p_installments),0) > 0 then
      insert into public.sale_installments(branch_id,sale_id,installment_no,due_date,amount,amount_paid,status)
      select p_branch_id,v_sale_id,(row->>'installment_no')::integer,(row->>'due_date')::date,
        (row->>'amount')::numeric,0,'pending'
      from jsonb_array_elements(p_installments) row
      order by (row->>'installment_no')::integer;
    end if;
  end if;

  return jsonb_build_object('sale_id',v_sale_id,'invoice_no',v_invoice_no,'subtotal',v_subtotal,'discount',v_discount,
    'total',v_total,'amount_paid',v_paid,'balance',v_total-v_paid,'items_count',v_item_count);
end;
$function$;

revoke all on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,jsonb,text) from public;
grant execute on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,jsonb,text) to authenticated;
