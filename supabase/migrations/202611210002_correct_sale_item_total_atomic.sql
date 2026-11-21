create or replace function public.correct_sale_item_total(
  p_branch_id uuid,p_sale_id uuid,p_sale_item_id uuid,p_new_line_total numeric
)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid(); v_role text;
  v_sale public.sales%rowtype; v_item public.sale_items%rowtype;
  v_new_total numeric; v_delta numeric; v_receipt_sum numeric;
  v_receipt_count integer; v_remaining numeric; v_row record;
  v_cash_adjusted boolean:=false;
begin
  if v_user is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
  if p_new_line_total is null or p_new_line_total<0 then raise exception 'مبلغ جدید قلم معتبر نیست.'; end if;
  select role into v_role from public.branch_memberships where branch_id=p_branch_id and user_id=v_user;
  if v_role is null or v_role='viewer' then raise exception 'دسترسی اصلاح فاکتور ندارید.'; end if;
  select * into v_sale from public.sales where id=p_sale_id and branch_id=p_branch_id and status='completed' for update;
  if not found then raise exception 'فاکتور پیدا نشد یا قابل اصلاح نیست.'; end if;
  select * into v_item from public.sale_items where id=p_sale_item_id and sale_id=p_sale_id for update;
  if not found then raise exception 'قلم انتخاب‌شده متعلق به این فاکتور نیست.'; end if;
  if exists(select 1 from public.sale_exchanges where original_sale_id=p_sale_id)
     or exists(select 1 from public.sale_exchanges where original_sale_item_id=p_sale_item_id) then
    raise exception 'این فاکتور یا قلم سابقه تعویض دارد؛ اصلاح مستقیم مجاز نیست.';
  end if;
  if v_item.quantity<=0 then raise exception 'تعداد قلم معتبر نیست.'; end if;

  -- The cash and invoice adjustment must equal the selected item's exact price change.
  v_delta:=p_new_line_total-v_item.line_total;
  v_new_total:=v_sale.total+v_delta;
  if v_delta=0 and p_new_line_total=v_item.line_total then
    return jsonb_build_object('sale_id',p_sale_id,'total',v_sale.total,'amount_paid',v_sale.amount_paid,'cash_adjusted',false);
  end if;

  if v_sale.payment_method<>'gift' then
    select count(*),coalesce(sum(amount),0) into v_receipt_count,v_receipt_sum
    from public.cash_transactions
    where sale_id=p_sale_id and branch_id=p_branch_id
      and transaction_type='receipt' and is_voided=false;
    if v_delta<>0 then
      if v_receipt_count=0 or v_receipt_sum<>v_sale.amount_paid then
        raise exception 'تراکنش‌های دریافت این فاکتور با مبلغ دریافتی ثبت‌شده منطبق نیستند؛ صندوق تغییر نکرد.';
      end if;
      if v_sale.amount_paid+v_delta<0 then
        raise exception 'کاهش مبلغ از کل دریافتی بیشتر است؛ اصلاح امن ممکن نیست.';
      end if;
      v_remaining:=v_delta;
      if v_delta>0 then
        select id,amount into v_row from public.cash_transactions
        where sale_id=p_sale_id and branch_id=p_branch_id
          and transaction_type='receipt' and is_voided=false
        order by occurred_at desc,created_at desc limit 1 for update;
        update public.cash_transactions set amount=amount+v_delta where id=v_row.id;
      else
        for v_row in
          select id,amount from public.cash_transactions
          where sale_id=p_sale_id and branch_id=p_branch_id
            and transaction_type='receipt' and is_voided=false
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
      v_cash_adjusted:=true;
    end if;
  elsif v_sale.amount_paid<>0 then
    raise exception 'فاکتور هدیه نباید دریافتی داشته باشد؛ ابتدا مغایرت آن را بررسی کنید.';
  end if;

  update public.sale_items set line_total=p_new_line_total,
    unit_price=round((p_new_line_total+discount)/quantity,2)
  where id=p_sale_item_id;
  update public.sales set total=v_new_total,subtotal=subtotal+v_delta,
    amount_paid=case when payment_method='gift' then 0 else amount_paid+v_delta end
  where id=p_sale_id;

  return jsonb_build_object('sale_id',p_sale_id,'sale_item_id',p_sale_item_id,
    'old_total',v_sale.total,'total',v_new_total,
    'old_amount_paid',v_sale.amount_paid,
    'amount_paid',case when v_sale.payment_method='gift' then 0 else v_sale.amount_paid+v_delta end,
    'cash_adjusted',v_cash_adjusted,'cash_delta',case when v_sale.payment_method='gift' then 0 else v_delta end);
end;
$$;
revoke all on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) to authenticated;
