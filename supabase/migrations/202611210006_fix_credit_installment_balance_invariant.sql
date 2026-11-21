create or replace function private.assert_sale_accounting_integrity(p_sale_id uuid)
returns void language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare v_sale public.sales%rowtype; v_cash numeric; v_installment_outstanding numeric; v_bad_installments integer;
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
  select coalesce(sum(amount-amount_paid),0),count(*) filter(where amount_paid<>(select coalesce(sum(ip.amount),0)
   from public.installment_payments ip where ip.installment_id=si.id and ip.sale_id=p_sale_id))
  into v_installment_outstanding,v_bad_installments
  from public.sale_installments si where si.sale_id=p_sale_id and si.branch_id=v_sale.branch_id;
  if abs(v_installment_outstanding-(v_sale.total-v_sale.amount_paid))>0.01 then
   raise exception 'مغایرت اقساط فاکتور %: مانده اقساط با مانده فاکتور برابر نیست. عملیات لغو شد.',v_sale.invoice_no;
  end if;
  if v_bad_installments>0 then
   raise exception 'مغایرت پرداخت اقساط فاکتور %: دریافتی اقساط با سوابق پرداخت برابر نیست. عملیات لغو شد.';
  end if;
 end if;
end;
$$;