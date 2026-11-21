create or replace function public.correct_sale_invoice_total(
  p_branch_id uuid,
  p_sale_id uuid,
  p_new_total numeric
) returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_delta numeric;
  v_receipt_sum numeric;
  v_receipt_count integer;
  v_remaining numeric;
  v_row record;
begin
  if v_user is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
  if p_new_total is null or p_new_total<0 then raise exception 'مبلغ نهایی فاکتور معتبر نیست.'; end if;
  select role into v_role from public.branch_memberships where branch_id=p_branch_id and user_id=v_user;
  if v_role is null or v_role='viewer' then raise exception 'دسترسی اصلاح فاکتور ندارید.'; end if;
  select * into v_sale from public.sales where id=p_sale_id and branch_id=p_branch_id and status='completed' for update;
  if not found then raise exception 'فاکتور پیدا نشد یا قابل اصلاح نیست.'; end if;
  if exists(select 1 from public.sale_exchanges where original_sale_id=p_sale_id) then
    raise exception 'این فاکتور سابقه تعویض دارد؛ اصلاح مستقیم مجاز نیست.';
  end if;
  if v_sale.payment_method='gift' and p_new_total<>0 then raise exception 'مبلغ فاکتور هدیه باید صفر باشد.'; end if;
  v_delta:=p_new_total-v_sale.total;
  if v_delta=0 then return jsonb_build_object('sale_id',p_sale_id,'total',v_sale.total,'amount_paid',v_sale.amount_paid,'cash_delta',0); end if;
  if v_sale.payment_method<>'gift' then
    select count(*),coalesce(sum(amount),0) into v_receipt_count,v_receipt_sum
    from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id
      and transaction_type='receipt' and is_voided=false;
    if v_receipt_sum<>v_sale.amount_paid then raise exception 'جمع دریافت‌های صندوق با مبلغ دریافتی فاکتور برابر نیست؛ ابتدا مغایرت را بررسی کنید.'; end if;
    if v_sale.amount_paid+v_delta<0 then raise exception 'کاهش مبلغ از کل دریافتی بیشتر است.'; end if;
    if v_delta>0 and v_receipt_count=0 then raise exception 'برای افزایش مبلغ دریافتی، ابتدا روش و تراکنش دریافت را مشخص کنید.'; end if;
    v_remaining:=v_delta;
    if v_delta>0 then
      select id,amount into v_row from public.cash_transactions
      where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false
      order by occurred_at desc,created_at desc limit 1 for update;
      update public.cash_transactions set amount=amount+v_delta where id=v_row.id;
    else
      for v_row in select id,amount from public.cash_transactions
        where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false
        order by occurred_at desc,created_at desc for update
      loop
        exit when v_remaining=0;
        if v_row.amount>=abs(v_remaining) then
          update public.cash_transactions set amount=amount+v_remaining where id=v_row.id;
          v_remaining:=0;
        else
          update public.cash_transactions set amount=0 where id=v_row.id;
          v_remaining:=v_remaining+v_row.amount;
        end if;
      end loop;
      if v_remaining<>0 then raise exception 'توزیع کاهش مبلغ بین دریافت‌های صندوق ناموفق بود.'; end if;
    end if;
  elsif v_sale.amount_paid<>0 then raise exception 'فاکتور هدیه نباید دریافتی داشته باشد.';
  end if;
  update public.sales set total=p_new_total,
    amount_paid=case when payment_method='gift' then 0 else amount_paid+v_delta end
  where id=p_sale_id;
  return jsonb_build_object('sale_id',p_sale_id,'old_total',v_sale.total,'total',p_new_total,
    'old_amount_paid',v_sale.amount_paid,
    'amount_paid',case when v_sale.payment_method='gift' then 0 else v_sale.amount_paid+v_delta end,
    'cash_delta',case when v_sale.payment_method='gift' then 0 else v_delta end);
end;
$$;
revoke all on function public.correct_sale_invoice_total(uuid,uuid,numeric) from public,anon;
grant execute on function public.correct_sale_invoice_total(uuid,uuid,numeric) to authenticated;
