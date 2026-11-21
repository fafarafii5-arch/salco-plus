create or replace function public.correct_sale_item_total(
  p_branch_id uuid,
  p_sale_id uuid,
  p_sale_item_id uuid,
  p_new_line_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_delta numeric;
  v_pending public.sale_installments%rowtype;
  v_pending_count integer;
  v_receipt_count integer;
  v_receipt_amount numeric;
  v_new_total numeric;
begin
  if v_user is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
  if p_new_line_total is null or p_new_line_total < 0 then raise exception 'مبلغ جدید قلم معتبر نیست.'; end if;

  select role into v_role from public.branch_memberships
  where branch_id=p_branch_id and user_id=v_user;
  if v_role is null or v_role='viewer' then raise exception 'دسترسی اصلاح فاکتور ندارید.'; end if;

  select * into v_sale from public.sales
  where id=p_sale_id and branch_id=p_branch_id and status='completed'
  for update;
  if not found then raise exception 'فاکتور پیدا نشد یا قابل اصلاح نیست.'; end if;

  select * into v_item from public.sale_items
  where id=p_sale_item_id and sale_id=p_sale_id
  for update;
  if not found then raise exception 'قلم انتخاب‌شده متعلق به این فاکتور نیست.'; end if;

  if exists(select 1 from public.sale_exchanges where original_sale_id=p_sale_id) then
    raise exception 'این فاکتور سابقه تعویض دارد؛ اصلاح مبلغ آن نیازمند بررسی جداگانه است.';
  end if;
  if exists(select 1 from public.sale_exchanges where original_sale_item_id=p_sale_item_id) then
    raise exception 'این قلم سابقه تعویض دارد و قابل اصلاح مستقیم نیست.';
  end if;
  if v_item.quantity <= 0 then raise exception 'تعداد قلم معتبر نیست.'; end if;

  v_delta := p_new_line_total - v_item.line_total;
  if v_delta = 0 then
    return jsonb_build_object('sale_id',p_sale_id,'sale_item_id',p_sale_item_id,'total',v_sale.total,'cash_adjusted',false);
  end if;

  v_new_total := v_sale.total + v_delta;
  if v_sale.payment_method='credit' then
    if v_new_total < v_sale.amount_paid then
      raise exception 'مبلغ جدید از دریافتی و پیش‌پرداخت ثبت‌شده کمتر می‌شود؛ ابتدا باید اضافه‌دریافت تعیین تکلیف شود.';
    end if;
    select count(*) into v_pending_count from public.sale_installments
    where sale_id=p_sale_id and amount > amount_paid;
    if v_new_total > v_sale.amount_paid then
      if v_pending_count=0 then raise exception 'برای مانده جدید، قسط پرداخت‌نشده‌ای وجود ندارد؛ ابتدا برنامه اقساط را اصلاح کنید.'; end if;
      select * into v_pending from public.sale_installments
      where sale_id=p_sale_id and amount > amount_paid
      order by due_date desc, installment_no desc limit 1 for update;
      if v_pending.amount + v_delta < v_pending.amount_paid then
        raise exception 'کاهش مبلغ از مانده قسط بیشتر است؛ اصلاح امن ممکن نیست.';
      end if;
      update public.sale_installments
      set amount=amount+v_delta,
          status=case when amount+v_delta=amount_paid then 'paid' when amount_paid>0 then 'partial' else 'pending' end
      where id=v_pending.id;
    elsif v_new_total=v_sale.amount_paid and v_pending_count>0 then
      raise exception 'اقساط پرداخت‌نشده باقی مانده‌اند؛ ابتدا وضعیت اقساط را تعیین تکلیف کنید.';
    end if;
  elsif v_sale.payment_method <> 'gift' then
    select count(*), coalesce(sum(amount),0) into v_receipt_count, v_receipt_amount
    from public.cash_transactions
    where sale_id=p_sale_id and branch_id=p_branch_id
      and transaction_type='receipt' and is_voided=false;
    if v_sale.amount_paid=v_sale.total then
      if v_receipt_count <> 1 or v_receipt_amount <> v_sale.amount_paid then
        raise exception 'دریافت‌های مرتبط با فاکتور یک تراکنش واحد و منطبق نیستند؛ صندوق خودکار تغییر نکرد.';
      end if;
      update public.cash_transactions
      set amount=amount+v_delta
      where sale_id=p_sale_id and branch_id=p_branch_id
        and transaction_type='receipt' and is_voided=false;
    else
      raise exception 'این فاکتور کامل تسویه نشده است؛ برای جلوگیری از مغایرت، ابتدا وضعیت تسویه را مشخص کنید.';
    end if;
  end if;

  update public.sale_items
  set line_total=p_new_line_total,
      unit_price=round((p_new_line_total+discount)/quantity,2)
  where id=p_sale_item_id;

  update public.sales
  set total=v_new_total,
      subtotal=subtotal+v_delta,
      amount_paid=case
        when payment_method='credit' then amount_paid
        when payment_method='gift' then 0
        else v_new_total
      end
  where id=p_sale_id;

  return jsonb_build_object(
    'sale_id',p_sale_id,
    'sale_item_id',p_sale_item_id,
    'old_total',v_sale.total,
    'total',v_new_total,
    'cash_adjusted',v_sale.payment_method<>'credit' and v_sale.payment_method<>'gift' and v_sale.amount_paid=v_sale.total
  );
end;
$$;

revoke all on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) from public, anon;
grant execute on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) to authenticated;
