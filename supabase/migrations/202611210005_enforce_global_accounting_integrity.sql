-- Central, deferred accounting invariants for every write path.
create or replace function private.assert_sale_accounting_integrity(p_sale_id uuid)
returns void language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare v_sale public.sales%rowtype; v_cash numeric; v_installment_total numeric; v_bad_installments integer;
begin
 if p_sale_id is null then return; end if;
 select * into v_sale from public.sales where id=p_sale_id;
 if not found or v_sale.status<>'completed' then return; end if;
 select coalesce(sum(amount),0) into v_cash from public.cash_transactions
 where sale_id=p_sale_id and branch_id=v_sale.branch_id and transaction_type='receipt' and is_voided=false;
 if v_cash<>v_sale.amount_paid then
  raise exception 'مغایرت حسابداری فاکتور %: جمع دریافت‌های صندوق (%) با مبلغ دریافتی فاکتور (%) برابر نیست. عملیات لغو شد.',v_sale.invoice_no,v_cash,v_sale.amount_paid;
 end if;
 if v_sale.payment_method='gift' and (v_sale.amount_paid<>0 or v_cash<>0) then
  raise exception 'فاکتور هدیه نباید دریافتی یا تراکنش وصولی داشته باشد.';
 end if;
 if v_sale.payment_method='credit' then
  select coalesce(sum(amount),0),count(*) filter(where amount_paid<>(select coalesce(sum(ip.amount),0)
   from public.installment_payments ip where ip.installment_id=si.id and ip.sale_id=p_sale_id))
  into v_installment_total,v_bad_installments
  from public.sale_installments si where si.sale_id=p_sale_id and si.branch_id=v_sale.branch_id;
  if abs(v_installment_total-(v_sale.total-v_sale.amount_paid))>0.01 then
   raise exception 'مغایرت اقساط فاکتور %: جمع اقساط با مانده فاکتور برابر نیست. عملیات لغو شد.',v_sale.invoice_no;
  end if;
  if v_bad_installments>0 then
   raise exception 'مغایرت پرداخت اقساط فاکتور %: دریافتی اقساط با سوابق پرداخت برابر نیست. عملیات لغو شد.',v_sale.invoice_no;
  end if;
 end if;
end;
$$;
create or replace function private.check_sales_accounting_deferred()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin if tg_op='DELETE' then perform private.assert_sale_accounting_integrity(old.id); else perform private.assert_sale_accounting_integrity(new.id); end if; return null; end; $$;
create or replace function private.check_cash_accounting_deferred()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin if tg_op<>'INSERT' then perform private.assert_sale_accounting_integrity(old.sale_id); end if; if tg_op<>'DELETE' then perform private.assert_sale_accounting_integrity(new.sale_id); end if; return null; end; $$;
create or replace function private.check_installment_accounting_deferred()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin if tg_op<>'INSERT' then perform private.assert_sale_accounting_integrity(old.sale_id); end if; if tg_op<>'DELETE' then perform private.assert_sale_accounting_integrity(new.sale_id); end if; return null; end; $$;
create or replace function private.check_installment_payment_accounting_deferred()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin if tg_op<>'INSERT' then perform private.assert_sale_accounting_integrity(old.sale_id); end if; if tg_op<>'DELETE' then perform private.assert_sale_accounting_integrity(new.sale_id); end if; return null; end; $$;
drop trigger if exists salco_sales_accounting_integrity on public.sales;
create constraint trigger salco_sales_accounting_integrity after insert or update or delete on public.sales deferrable initially deferred for each row execute function private.check_sales_accounting_deferred();
drop trigger if exists salco_cash_accounting_integrity on public.cash_transactions;
create constraint trigger salco_cash_accounting_integrity after insert or update or delete on public.cash_transactions deferrable initially deferred for each row execute function private.check_cash_accounting_deferred();
drop trigger if exists salco_installments_accounting_integrity on public.sale_installments;
create constraint trigger salco_installments_accounting_integrity after insert or update or delete on public.sale_installments deferrable initially deferred for each row execute function private.check_installment_accounting_deferred();
drop trigger if exists salco_installment_payments_accounting_integrity on public.installment_payments;
create constraint trigger salco_installment_payments_accounting_integrity after insert or update or delete on public.installment_payments deferrable initially deferred for each row execute function private.check_installment_payment_accounting_deferred();
revoke all on function public.correct_sale_total(uuid,uuid,numeric) from public,anon,authenticated;

-- Invoice total edits preserve the recorded down payment for credit sales and adjust the unpaid schedule.
create or replace function public.correct_sale_invoice_total(p_branch_id uuid,p_sale_id uuid,p_new_total numeric)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_role text; v_sale public.sales%rowtype; v_delta numeric; v_cash numeric; v_receipt_count integer; v_remaining numeric; v_row record; v_pending_count integer;
begin
 if v_user is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
 if p_new_total is null or p_new_total<0 then raise exception 'مبلغ نهایی فاکتور معتبر نیست.'; end if;
 select role into v_role from public.branch_memberships where branch_id=p_branch_id and user_id=v_user;
 if v_role is null or v_role='viewer' then raise exception 'دسترسی اصلاح فاکتور ندارید.'; end if;
 select * into v_sale from public.sales where id=p_sale_id and branch_id=p_branch_id and status='completed' for update;
 if not found then raise exception 'فاکتور پیدا نشد یا قابل اصلاح نیست.'; end if;
 if exists(select 1 from public.sale_exchanges where original_sale_id=p_sale_id) then raise exception 'این فاکتور سابقه تعویض دارد؛ اصلاح مستقیم مجاز نیست.'; end if;
 if v_sale.payment_method='gift' and p_new_total<>0 then raise exception 'مبلغ فاکتور هدیه باید صفر باشد.'; end if;
 v_delta:=p_new_total-v_sale.total;
 if v_delta=0 then return jsonb_build_object('sale_id',p_sale_id,'total',v_sale.total,'amount_paid',v_sale.amount_paid,'cash_delta',0); end if;
 if v_sale.payment_method='credit' then
  select count(*) into v_pending_count from public.sale_installments where sale_id=p_sale_id and amount>amount_paid;
  if v_delta>0 then
   if v_pending_count=0 then raise exception 'برای افزایش مانده فروش اقساطی، ابتدا برنامه قسط جدید ثبت کنید.'; end if;
   select id into v_row from public.sale_installments where sale_id=p_sale_id and amount>amount_paid order by due_date desc,installment_no desc limit 1 for update;
   update public.sale_installments set amount=amount+v_delta where id=v_row.id;
  elsif v_delta<0 then
   v_remaining:=abs(v_delta);
   for v_row in select id,amount,amount_paid from public.sale_installments where sale_id=p_sale_id and amount>amount_paid order by due_date desc,installment_no desc for update loop
    exit when v_remaining=0;
    if v_row.amount-v_row.amount_paid>v_remaining then update public.sale_installments set amount=amount-v_remaining where id=v_row.id; v_remaining:=0;
    else v_remaining:=v_remaining-(v_row.amount-v_row.amount_paid); update public.sale_installments set amount=amount_paid,status=case when amount_paid>0 then 'paid' else 'pending' end where id=v_row.id; end if;
   end loop;
   if v_remaining>0 then raise exception 'کاهش مبلغ از مانده اقساط بیشتر است؛ برنامه اقساط باید بررسی شود.'; end if;
  end if;
 elsif v_sale.payment_method<>'gift' then
  select count(*),coalesce(sum(amount),0) into v_receipt_count,v_cash from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false;
  if v_cash<>v_sale.amount_paid then raise exception 'جمع دریافت‌های صندوق با مبلغ دریافتی فاکتور برابر نیست؛ اصلاح متوقف شد.'; end if;
  if v_sale.amount_paid+v_delta<0 then raise exception 'کاهش مبلغ از کل دریافتی بیشتر است.'; end if;
  if v_delta>0 and v_receipt_count=0 then raise exception 'تراکنش دریافت برای این فاکتور پیدا نشد؛ روش دریافت را مشخص کنید.'; end if;
  if v_delta>0 then
   select id into v_row from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false order by occurred_at desc,created_at desc limit 1 for update;
   update public.cash_transactions set amount=amount+v_delta where id=v_row.id;
  elsif v_delta<0 then
   v_remaining:=abs(v_delta);
   for v_row in select id,amount from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false order by occurred_at desc,created_at desc for update loop
    exit when v_remaining=0;
    if v_row.amount>v_remaining then update public.cash_transactions set amount=amount-v_remaining where id=v_row.id; v_remaining:=0;
    else v_remaining:=v_remaining-v_row.amount; update public.cash_transactions set is_voided=true where id=v_row.id; end if;
   end loop;
   if v_remaining>0 then raise exception 'کاهش مبلغ بین دریافت‌های صندوق کامل نشد.'; end if;
  end if;
 elsif v_sale.amount_paid<>0 then raise exception 'فاکتور هدیه نباید دریافتی داشته باشد.';
 end if;
 update public.sales set total=p_new_total,amount_paid=case when payment_method in ('credit','gift') then amount_paid else amount_paid+v_delta end where id=p_sale_id;
 return jsonb_build_object('sale_id',p_sale_id,'old_total',v_sale.total,'total',p_new_total,'old_amount_paid',v_sale.amount_paid,'amount_paid',case when v_sale.payment_method in ('credit','gift') then v_sale.amount_paid else v_sale.amount_paid+v_delta end,'cash_delta',case when v_sale.payment_method in ('credit','gift') then 0 else v_delta end);
end; $$;

-- Item edits follow the same settlement rules as invoice edits.
create or replace function public.correct_sale_item_total(p_branch_id uuid,p_sale_id uuid,p_sale_item_id uuid,p_new_line_total numeric)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_role text; v_sale public.sales%rowtype; v_item public.sale_items%rowtype; v_new_total numeric; v_delta numeric; v_cash numeric; v_receipt_count integer; v_remaining numeric; v_row record; v_pending_count integer; v_cash_adjusted boolean:=false;
begin
 if v_user is null then raise exception 'ابتدا وارد حساب کاربری شوید.'; end if;
 if p_new_line_total is null or p_new_line_total<0 then raise exception 'مبلغ جدید قلم معتبر نیست.'; end if;
 select role into v_role from public.branch_memberships where branch_id=p_branch_id and user_id=v_user;
 if v_role is null or v_role='viewer' then raise exception 'دسترسی اصلاح فاکتور ندارید.'; end if;
 select * into v_sale from public.sales where id=p_sale_id and branch_id=p_branch_id and status='completed' for update;
 if not found then raise exception 'فاکتور پیدا نشد یا قابل اصلاح نیست.'; end if;
 select * into v_item from public.sale_items where id=p_sale_item_id and sale_id=p_sale_id for update;
 if not found then raise exception 'قلم انتخاب‌شده متعلق به این فاکتور نیست.'; end if;
 if exists(select 1 from public.sale_exchanges where original_sale_id=p_sale_id) or exists(select 1 from public.sale_exchanges where original_sale_item_id=p_sale_item_id) then raise exception 'این فاکتور یا قلم سابقه تعویض دارد؛ اصلاح مستقیم مجاز نیست.'; end if;
 v_delta:=p_new_line_total-v_item.line_total; v_new_total:=v_sale.total+v_delta;
 if v_delta=0 then return jsonb_build_object('sale_id',p_sale_id,'total',v_sale.total,'amount_paid',v_sale.amount_paid,'cash_adjusted',false); end if;
 if v_sale.payment_method='credit' then
  select count(*) into v_pending_count from public.sale_installments where sale_id=p_sale_id and amount>amount_paid;
  if v_delta>0 then
   if v_pending_count=0 then raise exception 'برای افزایش مانده فروش اقساطی، ابتدا برنامه قسط جدید ثبت کنید.'; end if;
   select id into v_row from public.sale_installments where sale_id=p_sale_id and amount>amount_paid order by due_date desc,installment_no desc limit 1 for update;
   update public.sale_installments set amount=amount+v_delta where id=v_row.id;
  else
   v_remaining:=abs(v_delta);
   for v_row in select id,amount,amount_paid from public.sale_installments where sale_id=p_sale_id and amount>amount_paid order by due_date desc,installment_no desc for update loop
    exit when v_remaining=0;
    if v_row.amount-v_row.amount_paid>v_remaining then update public.sale_installments set amount=amount-v_remaining where id=v_row.id; v_remaining:=0;
    else v_remaining:=v_remaining-(v_row.amount-v_row.amount_paid); update public.sale_installments set amount=amount_paid,status=case when amount_paid>0 then 'paid' else 'pending' end where id=v_row.id; end if;
   end loop;
   if v_remaining>0 then raise exception 'کاهش مبلغ از مانده اقساط بیشتر است؛ برنامه اقساط باید بررسی شود.'; end if;
  end if;
 elsif v_sale.payment_method<>'gift' then
  select count(*),coalesce(sum(amount),0) into v_receipt_count,v_cash from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false;
  if v_cash<>v_sale.amount_paid then raise exception 'جمع دریافت‌های صندوق با مبلغ دریافتی فاکتور برابر نیست؛ صندوق تغییر نکرد.'; end if;
  if v_sale.amount_paid+v_delta<0 then raise exception 'کاهش مبلغ از کل دریافتی بیشتر است.'; end if;
  if v_delta>0 and v_receipt_count=0 then raise exception 'تراکنش دریافت برای این فاکتور پیدا نشد؛ روش دریافت را مشخص کنید.'; end if;
  if v_delta>0 then
   select id into v_row from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false order by occurred_at desc,created_at desc limit 1 for update;
   update public.cash_transactions set amount=amount+v_delta where id=v_row.id;
  elsif v_delta<0 then
   v_remaining:=abs(v_delta);
   for v_row in select id,amount from public.cash_transactions where sale_id=p_sale_id and branch_id=p_branch_id and transaction_type='receipt' and is_voided=false order by occurred_at desc,created_at desc for update loop
    exit when v_remaining=0;
    if v_row.amount>v_remaining then update public.cash_transactions set amount=amount-v_remaining where id=v_row.id; v_remaining:=0;
    else v_remaining:=v_remaining-v_row.amount; update public.cash_transactions set is_voided=true where id=v_row.id; end if;
   end loop;
   if v_remaining>0 then raise exception 'کاهش مبلغ بین دریافت‌های صندوق کامل نشد.'; end if;
  end if;
  v_cash_adjusted:=true;
 elsif v_sale.amount_paid<>0 then raise exception 'فاکتور هدیه نباید دریافتی داشته باشد؛ ابتدا مغایرت آن را بررسی کنید.';
 end if;
 update public.sale_items set line_total=p_new_line_total,unit_price=round((p_new_line_total+discount)/quantity,2) where id=p_sale_item_id;
 update public.sales set total=v_new_total,subtotal=subtotal+v_delta,amount_paid=case when payment_method in ('credit','gift') then amount_paid else amount_paid+v_delta end where id=p_sale_id;
 return jsonb_build_object('sale_id',p_sale_id,'sale_item_id',p_sale_item_id,'old_total',v_sale.total,'total',v_new_total,'old_amount_paid',v_sale.amount_paid,'amount_paid',case when v_sale.payment_method in ('credit','gift') then v_sale.amount_paid else v_sale.amount_paid+v_delta end,'cash_adjusted',v_cash_adjusted,'cash_delta',case when v_sale.payment_method in ('credit','gift') then 0 else v_delta end);
end; $$;
revoke all on function public.correct_sale_invoice_total(uuid,uuid,numeric) from public,anon;
grant execute on function public.correct_sale_invoice_total(uuid,uuid,numeric) to authenticated;
revoke all on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.correct_sale_item_total(uuid,uuid,uuid,numeric) to authenticated;
